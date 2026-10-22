#!/usr/bin/env node
// Selectively recovered from 17b7bcc6: grouping and local attempts only.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const stateName = 'radium-security-triage.json'
const statuses = new Set(['OPEN', 'IN_PROGRESS', 'VERIFIED_LOCAL', 'ESCALATED'])
const severities = ['critical', 'high', 'medium', 'low', 'unknown']

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function text(value, label) {
  assert(typeof value === 'string' && value.trim().length > 0 && value.length <= 4000,
    `Invalid ${label}`)
  return value.trim()
}

function provenance(value) {
  assert(typeof value.repo === 'string' && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repo), 'Invalid snapshot repo')
  assert(typeof value.ref === 'string' && value.ref.startsWith('refs/heads/')
    && value.ref.length > 11 && value.ref.length <= 1024 && !/[\s\x00-\x1f]/.test(value.ref), 'Invalid snapshot ref')
  return { repo: value.repo.toLowerCase(), ref: value.ref }
}

// Neither alert paths nor group identifiers ever become filesystem paths.
export function groupAlerts(snapshot) {
  assert(snapshot && typeof snapshot === 'object', 'Expected an alert snapshot')
  const groups = new Map()
  for (const source of ['dependabot', 'code_scanning']) {
    assert(Array.isArray(snapshot[source]), `Expected ${source} array`)
    const seen = new Set()
    for (const alert of snapshot[source]) {
      assert(Number.isSafeInteger(alert?.number) && alert.number > 0, 'Invalid alert number')
      assert(!seen.has(alert.number), 'Duplicate alert number')
      seen.add(alert.number)
      const isDependency = source === 'dependabot'
      const name = text(isDependency ? alert.dependency?.package?.name : alert.rule?.id, 'alert group')
      const location = text(isDependency ? alert.dependency?.package?.ecosystem
        : alert.most_recent_instance?.location?.path, 'alert location')
      const key = JSON.stringify([source, name, location])
      const id = crypto.createHash('sha256').update(key).digest('hex').slice(0, 20)
      const severity = (isDependency ? alert.security_advisory?.severity
        : alert.rule?.security_severity_level)?.toLowerCase()
      assert(['open', 'fixed', 'dismissed', 'auto_dismissed'].includes(alert.state), 'Invalid alert state')
      if (!groups.has(id)) groups.set(id, { id, source, name, location, severity: 'unknown', alerts: [] })
      const group = groups.get(id)
      if (severities.indexOf(severity) >= 0 && severities.indexOf(severity) < severities.indexOf(group.severity)) {
        group.severity = severity
      }
      group.alerts.push({ number: alert.number, state: alert.state })
    }
  }
  return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id)).map((group) => ({
    ...group, alerts: group.alerts.sort((a, b) => a.number - b.number),
  }))
}

function validateState(state) {
  assert(state?.version === 1 && Array.isArray(state.groups), 'Invalid triage state')
  provenance(state)
  const ids = new Set()
  for (const group of state.groups) {
    assert(/^[a-f0-9]{20}$/.test(group.id) && !ids.has(group.id), 'Invalid or duplicate group id')
    ids.add(group.id)
    assert(statuses.has(group.status) && Array.isArray(group.attempts), 'Invalid group status or attempts')
    assert(Array.isArray(group.alerts) && group.alerts.every((a) => Number.isSafeInteger(a.number)
      && a.number > 0 && ['open', 'fixed', 'dismissed', 'auto_dismissed'].includes(a.state)), 'Invalid stored alerts')
    text(group.name, 'stored group name')
    text(group.location, 'stored group location')
    assert(severities.includes(group.severity), 'Invalid stored severity')
    assert(['dependabot', 'code_scanning'].includes(group.source), 'Invalid stored source')
    for (const attempt of group.attempts) {
      assert(statuses.has(attempt.status), 'Invalid attempt status')
      text(attempt.note, 'attempt note')
      assert(typeof attempt.at === 'string' && Number.isFinite(Date.parse(attempt.at)), 'Invalid attempt date')
    }
  }
  return state
}

export function updateSnapshot(previous, snapshot, now = new Date().toISOString()) {
  if (previous) validateState(previous)
  const identity = provenance(snapshot)
  assert(!previous || (previous.repo === identity.repo && previous.ref === identity.ref),
    'Repository/ref does not match existing state; use a separate --dir')
  const old = new Map((previous?.groups ?? []).map((group) => [group.id, group]))
  const incoming = groupAlerts(snapshot)
  const seen = new Set(incoming.map((group) => group.id))
  // Missing alerts are retained as unknown, never inferred fixed from a partial snapshot.
  const groups = incoming.map((group) => {
    const previousGroup = old.get(group.id)
    const previousAlerts = new Map((previousGroup?.alerts ?? []).map((alert) => [alert.number, alert]))
    const currentNumbers = new Set(group.alerts.map((alert) => alert.number))
    const needsInvestigation = group.alerts.some((alert) => {
      const earlier = previousAlerts.get(alert.number)
      return !earlier || (earlier.state !== 'open' && alert.state === 'open')
    })
    const alerts = group.alerts.map((alert) => ({ ...alert, present: true })).concat(
      [...previousAlerts.values()].filter((alert) => !currentNumbers.has(alert.number))
        .map((alert) => ({ ...alert, present: false }))
    ).sort((a, b) => a.number - b.number)
    return {
      ...group, alerts, status: needsInvestigation ? 'OPEN' : previousGroup?.status ?? 'OPEN',
      attempts: previousGroup?.attempts ?? [], lastSeen: now, present: true,
    }
  }).concat([...old.values()].filter((group) => !seen.has(group.id)).map((group) => ({
    ...group, present: false, alerts: group.alerts.map((alert) => ({ ...alert, present: false })),
  })))
  return validateState({ version: 1, ...identity, updatedAt: now, groups })
}

export function recordAttempt(state, id, status, note, now = new Date().toISOString()) {
  validateState(state)
  assert(statuses.has(status), 'Status must be OPEN, IN_PROGRESS, VERIFIED_LOCAL or ESCALATED')
  const cleanNote = text(note, 'attempt note')
  const group = state.groups.find((item) => item.id === id)
  assert(group, 'Unknown group id')
  const next = structuredClone(state)
  const target = next.groups.find((item) => item.id === id)
  target.status = status
  target.attempts.push({ at: now, status, note: cleanNote })
  next.updatedAt = now
  return validateState(next)
}

function statePath(directory) {
  assert(typeof directory === 'string' && path.isAbsolute(directory), '--dir must be an absolute path outside the source checkout')
  const resolved = path.resolve(directory)
  const relative = path.relative(sourceRoot, resolved)
  assert(relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative), '--dir must be outside the source checkout')
  // Refuse linked ancestors as well as linked state files before reading/writing.
  let current = path.parse(resolved).root
  for (const part of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    if (fs.existsSync(current)) {
      const stat = fs.lstatSync(current)
      assert(!stat.isSymbolicLink() && stat.isDirectory(), 'Output directory contains a link or non-directory')
    } else {
      // lstat catches dangling links, for which existsSync returns false.
      try { fs.lstatSync(current); throw new Error('Output directory contains a dangling link') }
      catch (error) { if (error.code !== 'ENOENT') throw error }
    }
  }
  const filename = path.join(resolved, stateName)
  try {
    const stat = fs.lstatSync(filename)
    assert(stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1, 'State file must be a regular unlinked file')
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  return filename
}

export function readState(directory) {
  const filename = statePath(directory)
  if (!fs.existsSync(filename)) return null
  return validateState(JSON.parse(fs.readFileSync(filename, 'utf8')))
}

export function writeState(directory, state, expected) {
  validateState(state)
  const filename = statePath(directory)
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  const lock = `${filename}.lock`
  // Exclusive creation also refuses symlinked locks. A crashed writer leaves a
  // visible lock for the user to inspect rather than guessing it is safe to steal.
  const descriptor = fs.openSync(lock, 'wx', 0o600)
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`
  try {
    if (expected !== undefined) {
      assert(JSON.stringify(readState(directory)) === JSON.stringify(expected),
        'State changed during this operation; retry against the current state')
    }
    fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    statePath(directory)
    fs.renameSync(temporary, filename)
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
    fs.closeSync(descriptor)
    fs.unlinkSync(lock)
  }
}

export function fetchSnapshot(repo, ref = 'refs/heads/main', execute = execFileSync) {
  const snapshot = provenance({ repo, ref })
  for (const [source, endpoint] of [['dependabot', 'dependabot'], ['code_scanning', 'code-scanning']]) {
    const output = execute('gh', ['api', '--method', 'GET', '--paginate', '--slurp',
      `repos/${repo}/${endpoint}/alerts?state=open&per_page=100${source === 'code_scanning' ? `&ref=${encodeURIComponent(ref)}` : ''}`],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
    const pages = JSON.parse(output)
    assert(Array.isArray(pages) && pages.every(Array.isArray), 'Invalid paginated GitHub response')
    snapshot[source] = pages.flat()
  }
  return snapshot
}

export function runCLI(args, { execute = execFileSync, output = console.log } = {}) {
  const [command, ...rest] = args
  const allowed = {
    import: ['dir', 'file'], sync: ['dir', 'repo', 'ref'], status: ['dir'], attempt: ['dir', 'id', 'status', 'note'],
  }
  assert(Object.hasOwn(allowed, command), 'Usage: security-triage.mjs import|sync|status|attempt --dir ABSOLUTE_DIRECTORY [options]')
  const options = {}
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]?.slice(2)
    assert(rest[i]?.startsWith('--') && allowed[command].includes(key) && !Object.hasOwn(options, key)
      && typeof rest[i + 1] === 'string', 'Unknown, duplicate or missing option')
    options[key] = rest[i + 1]
  }
  for (const key of allowed[command].filter((key) => key !== 'ref')) assert(Object.hasOwn(options, key), `Missing --${key}`)
  const previous = readState(options.dir)
  if (command === 'status') {
    output(JSON.stringify(previous ?? { version: 1, groups: [] }, null, 2))
    return
  }
  let next
  if (command === 'attempt') {
    assert(previous, 'Import or sync alerts before recording an attempt')
    next = recordAttempt(previous, options.id, options.status, options.note)
  } else {
    if (command === 'sync' && previous) {
      const identity = provenance({ repo: options.repo, ref: options.ref ?? 'refs/heads/main' })
      assert(previous.repo === identity.repo && previous.ref === identity.ref,
        'Repository/ref does not match existing state; use a separate --dir')
    }
    const snapshot = command === 'sync' ? fetchSnapshot(options.repo, options.ref ?? 'refs/heads/main', execute)
      : JSON.parse(fs.readFileSync(options.file, 'utf8'))
    next = updateSnapshot(previous, snapshot)
  }
  writeState(options.dir, next, previous)
  output(`Saved ${next.groups.length} groups to ${path.join(options.dir, stateName)}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { runCLI(process.argv.slice(2)) }
  catch (error) { console.error(error.message); process.exitCode = 1 }
}
