import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  fetchSnapshot, groupAlerts, readState, recordAttempt, runCLI, updateSnapshot, writeState,
} from './security-triage.mjs'

const at = '2026-10-16T16:00:00.000Z'
const dependency = (number, name = 'tar', severity = 'high') => ({
  number, state: 'open', dependency: { package: { name, ecosystem: 'npm' } },
  security_advisory: { severity },
})
const codeAlert = (number, filename = 'src/proxy.rs') => ({
  number, state: 'open', rule: { id: 'rust/cleartext-logging', security_severity_level: 'medium' },
  most_recent_instance: { location: { path: filename } },
})
const identity = { repo: 'walladanger/radium', ref: 'refs/heads/main' }
const fixture = () => ({ ...identity, dependabot: [dependency(2), dependency(1, 'tar', 'critical'), dependency(3, 'vite')],
  code_scanning: [codeAlert(1), codeAlert(2), codeAlert(3, 'src/server.rs')] })

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'radium-triage-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return directory
}

test('groups dependency alerts by ecosystem/package and code alerts by rule/path deterministically', () => {
  const snapshot = fixture()
  const groups = groupAlerts(snapshot)
  assert.equal(groups.length, 4)
  assert.deepEqual(groups.find((group) => group.name === 'tar').alerts.map((a) => a.number), [1, 2])
  assert.equal(groups.find((group) => group.name === 'tar').severity, 'critical')
  assert.equal(groups.filter((group) => group.source === 'code_scanning').length, 2)
  snapshot.dependabot.reverse()
  snapshot.code_scanning.reverse()
  assert.deepEqual(groupAlerts(snapshot), groups)
})

test('roundtrip preserves attempts, remote state and missing groups without claiming closure', (t) => {
  const directory = temporary(t)
  let state = updateSnapshot(null, fixture(), at)
  const id = state.groups.find((group) => group.name === 'tar').id
  state = recordAttempt(state, id, 'VERIFIED_LOCAL', 'Offline fixture regression passed', at)
  writeState(directory, state)
  assert.deepEqual(readState(directory), state)
  const incoming = { ...identity, dependabot: [dependency(1)], code_scanning: [] }
  const updated = updateSnapshot(readState(directory), incoming, at)
  assert.equal(updated.groups.length, 4)
  assert.equal(updated.groups.find((g) => g.id === id).status, 'VERIFIED_LOCAL')
  assert.equal(updated.groups.find((g) => g.id === id).attempts.length, 1)
  assert.deepEqual(updated.groups.find((g) => g.id === id).alerts, [
    { number: 1, state: 'open', present: true }, { number: 2, state: 'open', present: false },
  ])
  assert.equal(updated.groups.filter((g) => !g.present).length, 3)
  assert.ok(updated.groups.filter((g) => !g.present).every((g) => g.alerts[0].state === 'open'))
  assert.ok(updated.groups.filter((g) => !g.present).every((g) => g.alerts.every((a) => !a.present)))
})

test('new and reopened alerts cannot inherit a group local verification', () => {
  let state = updateSnapshot(null, fixture(), at)
  const id = state.groups.find((group) => group.name === 'tar').id
  state = recordAttempt(state, id, 'VERIFIED_LOCAL', 'Investigated the original alerts', at)
  const updated = updateSnapshot(state, {
    ...identity, dependabot: [dependency(1), dependency(2), dependency(4)], code_scanning: [],
  }, at)
  assert.equal(updated.groups.find((group) => group.id === id).status, 'OPEN')
  assert.equal(updated.groups.find((group) => group.id === id).attempts[0].status, 'VERIFIED_LOCAL')
  const fixed = updateSnapshot(null, {
    ...identity, dependabot: [{ ...dependency(1), state: 'fixed' }], code_scanning: [],
  }, at)
  const verified = recordAttempt(fixed, id, 'VERIFIED_LOCAL', 'Verified previous closure', at)
  assert.equal(updateSnapshot(verified, {
    ...identity, dependabot: [dependency(1)], code_scanning: [],
  }, at).groups[0].status, 'OPEN')
})

test('status has no filesystem or child process side effects, including missing state', (t) => {
  const directory = path.join(temporary(t), 'not-created')
  const output = []
  runCLI(['status', '--dir', directory], { execute: () => assert.fail('Unexpected subprocess'), output: (s) => output.push(s) })
  assert.equal(fs.existsSync(directory), false)
  assert.deepEqual(JSON.parse(output[0]), { version: 1, groups: [] })
})

test('offline CLI imports, records an attempt and reads status without spawning git or gh', (t) => {
  const directory = temporary(t)
  const file = path.join(directory, 'snapshot.json')
  fs.writeFileSync(file, JSON.stringify(fixture()))
  const services = { execute: () => assert.fail('Unexpected subprocess'), output: () => {} }
  const outputDir = path.join(directory, 'state')
  runCLI(['import', '--dir', outputDir, '--file', file], services)
  const id = readState(outputDir).groups[0].id
  runCLI(['attempt', '--dir', outputDir, '--id', id, '--status', 'ESCALATED', '--note', 'Needs provider fixture'], services)
  const before = fs.readFileSync(path.join(outputDir, 'radium-security-triage.json'), 'utf8')
  runCLI(['status', '--dir', outputDir], services)
  assert.equal(fs.readFileSync(path.join(outputDir, 'radium-security-triage.json'), 'utf8'), before)
  assert.equal(readState(outputDir).groups[0].attempts[0].note, 'Needs provider fixture')
  assert.deepEqual(fs.readdirSync(outputDir), ['radium-security-triage.json'])
})

test('sync uses two explicit GET requests, pagination and no mutating subprocess', () => {
  const calls = []
  const snapshot = fetchSnapshot('walladanger/Radium', 'refs/heads/main', (command, args) => {
    calls.push([command, args])
    assert.equal(command, 'gh')
    assert.deepEqual(args.slice(0, 5), ['api', '--method', 'GET', '--paginate', '--slurp'])
    assert.equal(args.length, 6)
    const endpoint = args[5].includes('/dependabot/') ? 'dependabot' : 'code-scanning'
    assert.equal(args[5], `repos/walladanger/Radium/${endpoint}/alerts?state=open&per_page=100${endpoint === 'code-scanning' ? '&ref=refs%2Fheads%2Fmain' : ''}`)
    return JSON.stringify(args[5].includes('/dependabot/') ? [[dependency(1)], [dependency(2)]] : [[codeAlert(1)]])
  })
  assert.equal(calls.length, 2)
  assert.equal(snapshot.dependabot.length, 2)
  assert.equal(snapshot.code_scanning.length, 1)
  assert.deepEqual({ repo: snapshot.repo, ref: snapshot.ref }, identity)
  assert.throws(() => fetchSnapshot('../bad/repo', undefined, () => assert.fail()), /Invalid snapshot repo/)
})

test('path confinement rejects source checkout, relative directories, links and hardlinked state', (t) => {
  const directory = temporary(t)
  const checkout = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const state = updateSnapshot(null, fixture(), at)
  // The immediate parent is outside the checkout too; status only reads it.
  assert.doesNotThrow(() => runCLI(['status', '--dir', path.dirname(checkout)], {
    execute: () => assert.fail('Unexpected subprocess'), output: () => {},
  }))
  assert.throws(() => writeState(checkout, state), /outside the source/)
  assert.throws(() => writeState('relative-state', state), /absolute path/)
  const target = path.join(directory, 'target')
  fs.mkdirSync(target)
  const link = path.join(directory, 'linked')
  fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir')
  assert.throws(() => writeState(path.join(link, 'child'), state), /contains a link/)
  const elsewhere = path.join(directory, 'elsewhere.json')
  fs.writeFileSync(elsewhere, 'untouched')
  fs.linkSync(elsewhere, path.join(target, 'radium-security-triage.json'))
  assert.throws(() => writeState(target, state), /regular unlinked/)
  assert.equal(fs.readFileSync(elsewhere, 'utf8'), 'untouched')
})

test('untrusted alert paths remain data and malformed snapshots cannot replace existing state', (t) => {
  const directory = temporary(t)
  const snapshot = { ...identity, dependabot: [], code_scanning: [codeAlert(1, '../../outside.json')] }
  writeState(directory, updateSnapshot(null, snapshot, at))
  assert.deepEqual(fs.readdirSync(directory), ['radium-security-triage.json'])
  const before = readState(directory)
  assert.throws(() => groupAlerts({ dependabot: [dependency(1), dependency(1)], code_scanning: [] }), /Duplicate/)
  assert.throws(() => recordAttempt(before, '../../outside', 'OPEN', 'bad'), /Unknown group/)
  assert.throws(() => recordAttempt(before, before.groups[0].id, 'DISMISSED', 'bad'), /Status must/)
  assert.deepEqual(readState(directory), before)
})

test('failed GitHub fetch leaves previously saved state unchanged', (t) => {
  const directory = temporary(t)
  writeState(directory, updateSnapshot(null, fixture(), at))
  const before = fs.readFileSync(path.join(directory, 'radium-security-triage.json'), 'utf8')
  assert.throws(() => runCLI(['sync', '--dir', directory, '--repo', 'walladanger/Radium'], {
    execute: () => { throw new Error('GitHub unavailable') }, output: () => {},
  }), /GitHub unavailable/)
  assert.equal(fs.readFileSync(path.join(directory, 'radium-security-triage.json'), 'utf8'), before)
})

test('same alert numbers from different repositories or refs cannot merge into existing state', (t) => {
  const directory = temporary(t)
  const state = updateSnapshot(null, fixture(), at)
  writeState(directory, state)
  assert.throws(() => updateSnapshot(state, { ...fixture(), repo: 'another/project' }, at), /Repository\/ref/)
  assert.throws(() => updateSnapshot(state, { ...fixture(), ref: 'refs/heads/feature' }, at), /Repository\/ref/)
  assert.throws(() => updateSnapshot(null, { dependabot: [], code_scanning: [] }, at), /Invalid snapshot repo/)
  assert.throws(() => runCLI(['sync', '--dir', directory, '--repo', 'another/project'], {
    execute: () => assert.fail('Provenance mismatch must reject before API request'), output: () => {},
  }), /Repository\/ref/)
  assert.deepEqual(readState(directory), state)
})

test('concurrent writer lock and optimistic revision prevent overwriting another attempt', (t) => {
  const directory = temporary(t)
  const previous = updateSnapshot(null, fixture(), at)
  writeState(directory, previous)
  const newer = recordAttempt(previous, previous.groups[0].id, 'IN_PROGRESS', 'Another writer investigated', at)
  writeState(directory, newer, previous)
  assert.throws(() => writeState(directory, previous, previous), /State changed/)
  assert.deepEqual(readState(directory), newer)
  const lock = path.join(directory, 'radium-security-triage.json.lock')
  fs.writeFileSync(lock, 'another writer')
  assert.throws(() => writeState(directory, previous, newer), /EEXIST/)
  assert.deepEqual(readState(directory), newer)
})
