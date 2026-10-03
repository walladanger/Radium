/**
 * Panel contract v1 is frozen: the manifest schema, the SDK and the theme are
 * served byte-for-byte by every host, so a panel folder that satisfies them
 * loads in Radium and in ClaudeDesktopClient alike. These tests pin that.
 *
 * The validator below is deliberately small and covers only the JSON Schema
 * keywords this schema actually uses, rather than pulling in a schema engine:
 * the repository's other contract tests run on plain `node --test` with no
 * dependencies, and the only schema engine present (ajv) is a transitive
 * eslint dependency that could vanish under us. The fixtures exercise the
 * validator in both directions, so a mistake in it shows up as a failing
 * expectation rather than as silent permissiveness.
 *
 * The authoritative validator at runtime is the Rust host (panel contract
 * Phase 2); this keeps the schema honest until that exists, and keeps both
 * honest afterwards.
 *
 * See docs/superpowers/specs/2026-10-03-panel-contract-v1.md and
 * docs/decisions/2026-10-03-port-the-panel-mechanism-from-claudedesktopclient-not-its.md.
 */
import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contractDir = path.join(repoRoot, 'src-tauri/resources/panel-contract')
const fixtures = path.join(repoRoot, 'tests/fixtures/panels')
const read = (p) => readFileSync(p, 'utf8')
const schema = JSON.parse(read(path.join(contractDir, 'panel.schema.json')))

/** Validate `value` against the subset of JSON Schema this contract uses. */
function validate(value, node = schema, where = '') {
  const errors = []
  const fail = (message) => errors.push(`${where || '(root)'}: ${message}`)

  if (node.const !== undefined && value !== node.const) {
    fail(`must be ${JSON.stringify(node.const)}`)
  }
  if (node.enum && !node.enum.includes(value)) fail('not one of the allowed values')

  if (node.anyOf) {
    const matched = node.anyOf.some((branch) => validate(value, branch, where).length === 0)
    if (!matched) fail('matches none of the allowed forms')
  }

  if (node.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      fail('must be an object')
      return errors
    }
    for (const key of node.required ?? []) {
      if (!(key in value)) fail(`missing required property "${key}"`)
    }
    if (node.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in (node.properties ?? {}))) fail(`unknown property "${key}"`)
      }
    }
    for (const [key, sub] of Object.entries(node.properties ?? {})) {
      if (key in value) errors.push(...validate(value[key], sub, where ? `${where}.${key}` : key))
    }
  }

  if (node.type === 'array') {
    if (!Array.isArray(value)) {
      fail('must be an array')
      return errors
    }
    if (node.maxItems !== undefined && value.length > node.maxItems) fail('too many items')
    if (node.uniqueItems) {
      const seen = new Set(value.map((entry) => JSON.stringify(entry)))
      if (seen.size !== value.length) fail('items must be unique')
    }
    value.forEach((entry, index) => {
      if (node.items) errors.push(...validate(entry, node.items, `${where}[${index}]`))
    })
  }

  if (node.type === 'string') {
    if (typeof value !== 'string') {
      fail('must be a string')
      return errors
    }
    if (node.minLength !== undefined && value.length < node.minLength) fail('too short')
    if (node.maxLength !== undefined && value.length > node.maxLength) fail('too long')
    if (node.pattern && !new RegExp(node.pattern, 'u').test(value)) fail('does not match pattern')
  }

  if (node.type === 'integer') {
    if (!Number.isInteger(value)) fail('must be an integer')
    if (node.minimum !== undefined && value < node.minimum) fail('below minimum')
    if (node.maximum !== undefined && value > node.maximum) fail('above maximum')
  }

  for (const branch of node.allOf ?? []) {
    const condition = branch.if
    if (!condition) continue
    if (validate(value, { type: 'object', ...condition }, where).length === 0) {
      errors.push(...validate(value, { type: 'object', ...branch.then }, where))
    }
  }

  // `contains` is only used inside the conditional above.
  if (node.contains && Array.isArray(value)) {
    const hit = value.some((entry) => validate(entry, node.contains, where).length === 0)
    if (!hit) fail('contains no matching item')
  }

  return errors
}

test('the frozen contract files are present and declare v1', () => {
  const sdk = read(path.join(contractDir, 'panel-sdk.js'))
  assert.match(sdk, /const CONTRACT = 1\b/, 'the SDK must pin the contract version')
  assert.match(sdk, /sandbox|allow-scripts|connect-src/, 'the SDK must document its sandbox')
  assert.ok(
    read(path.join(contractDir, 'panel-theme.css')).includes('--panel-bg'),
    'the theme must expose the palette tokens panels build on'
  )
  assert.equal(schema.properties.contract.const, 1)
  // Guards against a capability being bolted on without a version bump.
  assert.deepEqual(schema.properties.permissions.items.anyOf[0].enum, [
    'storage',
    'mcp.read',
    'mcp.call',
  ])
})

test('the conformance panel satisfies the schema', () => {
  const manifest = JSON.parse(read(path.join(fixtures, 'conformance/panel.json')))
  assert.deepEqual(validate(manifest), [])

  // The fixture earns its name by exercising every call and both refusal
  // paths; a trimmed-down copy would quietly stop testing the host.
  const page = read(path.join(fixtures, 'conformance/index.html'))
  for (const probe of [
    'panel.host()',
    'panel.theme()',
    'panel.set(',
    'panel.get(',
    'panel.tools()',
    'panel.callTool(',
    'does.not.exist',
  ]) {
    assert.ok(page.includes(probe), `the conformance panel must still exercise ${probe}`)
  }
  for (const code of ['permission_denied', 'unknown_method']) {
    assert.ok(page.includes(code), `the conformance panel must still expect ${code}`)
  }
})

test('the example panel shipped for authors satisfies the schema', () => {
  // The example is what people copy. If it drifts out of the contract, every
  // panel written from it starts broken, so it is validated like a fixture.
  const dir = path.join(repoRoot, 'examples/panels/mcp-tool-browser')
  const manifest = JSON.parse(read(path.join(dir, 'panel.json')))
  assert.deepEqual(validate(manifest), [])
  assert.equal(manifest.id, 'mcp-tool-browser', 'the id must equal the folder name')

  const page = read(path.join(dir, manifest.entry))
  // It has to actually demonstrate the SDK, not merely load it.
  for (const probe of ['/panel-sdk.js', '/panel-theme.css', 'panel.ready()', 'panel.onTheme(']) {
    assert.ok(page.includes(probe), `the example panel must still show ${probe}`)
  }
  // And everything it calls must be covered by what it declares.
  const declared = new Set(manifest.permissions)
  const needs = [
    ['panel.tools()', 'mcp.read'],
    ['panel.callTool(', 'mcp.call'],
    ['panel.get(', 'storage'],
    ['panel.set(', 'storage'],
  ]
  for (const [callSite, permission] of needs) {
    if (!page.includes(callSite)) continue
    assert.ok(
      declared.has(permission),
      `the example calls ${callSite} without declaring "${permission}"`
    )
  }
  // A panel reaching MCP must name its servers; the example is the place an
  // author first sees that.
  assert.ok(
    Array.isArray(manifest.mcpServers) && manifest.mcpServers.length > 0,
    'the example asks for MCP permissions but names no server'
  )
})

test('the author docs list exactly the core permissions the schema allows', () => {
  // A permission table that has drifted from the schema is worse than none:
  // an author follows it and their panel is refused on install. So this is an
  // equality check in both directions, not a "mentioned somewhere" check —
  // a documented permission the host would reject is the worse of the two.
  const docs = read(path.join(repoRoot, 'docs/panels/README.md'))
  const core = schema.properties.permissions.items.anyOf
    .flatMap((branch) => branch.enum ?? [])
    .sort()
  assert.ok(core.length > 0, 'the schema no longer enumerates core permissions')

  const table = docs.match(/\n\| Permission \| Grants \|\n[\s\S]*?\n\n/)
  assert.ok(table, 'docs/panels/README.md no longer has a permission table')
  const documented = [...table[0].matchAll(/^\| `([^`]+)` \|/gm)]
    .map((row) => row[1])
    .sort()
  assert.deepEqual(
    documented,
    core,
    'the permission table in docs/panels/README.md and the core permissions ' +
      'in panel.schema.json have diverged'
  )

  // The frozen always-allowed methods are documented as needing nothing, so
  // nobody declares a permission for them.
  for (const method of ['host.info', 'panel.theme', 'panel.ready', 'panel.resize']) {
    assert.ok(
      docs.includes(method),
      `docs/panels/README.md does not mention ${method}`
    )
    assert.ok(
      !documented.includes(method),
      `docs/panels/README.md lists ${method} as a permission; it needs none`
    )
  }
})

test('every invalid manifest is rejected, and for its own reason', () => {
  const expected = {
    'missing-contract.json': 'missing required property "contract"',
    'wrong-contract.json': 'must be 1',
    'bad-id.json': 'does not match pattern',
    'traversal-entry.json': 'does not match pattern',
    'unknown-key.json': 'unknown property "sneakyCapability"',
    'mcp-without-servers.json': 'missing required property "mcpServers"',
  }
  const files = readdirSync(path.join(fixtures, 'invalid')).sort()
  assert.deepEqual(files, Object.keys(expected).sort(), 'every invalid fixture needs an expectation')

  for (const file of files) {
    const manifest = JSON.parse(read(path.join(fixtures, 'invalid', file)))
    const errors = validate(manifest)
    assert.ok(errors.length > 0, `${file} must be rejected`)
    assert.ok(
      errors.some((message) => message.includes(expected[file])),
      `${file} must be rejected for "${expected[file]}", got: ${errors.join('; ')}`
    )
  }
})

test('a panel asking for MCP must name the servers it may reach', () => {
  const base = { contract: 1, id: 'mcp-panel', name: 'MCP panel', entry: 'index.html' }
  assert.ok(validate({ ...base, permissions: ['mcp.read'] }).length > 0)
  assert.deepEqual(validate({ ...base, permissions: ['mcp.read'], mcpServers: ['one'] }), [])
  // An empty allowlist is a deliberate "nothing", not an error.
  assert.deepEqual(validate({ ...base, permissions: ['mcp.call'], mcpServers: [] }), [])
  // storage alone needs no allowlist.
  assert.deepEqual(validate({ ...base, permissions: ['storage'] }), [])
})

test('host-specific permissions stay expressible, so panels remain portable', () => {
  const base = { contract: 1, id: 'vendor-panel', name: 'Vendor panel', entry: 'index.html' }
  // ClaudeDesktopClient's own capabilities, namespaced.
  assert.deepEqual(validate({ ...base, permissions: ['cdc:usage.read'] }), [])
  assert.deepEqual(validate({ ...base, permissions: ['storage', 'cdc:logs.read'] }), [])
  // An unnamespaced invention is refused: core names are the portable set.
  assert.ok(validate({ ...base, permissions: ['usage.read'] }).length > 0)
})
