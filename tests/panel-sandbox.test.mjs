/**
 * The panel sandbox, locked.
 *
 * A panel is a folder someone else wrote, running inside Radium. Three
 * properties are the entire reason that is safe, and all three are invisible
 * — nothing breaks when one is quietly widened, which is exactly why they
 * need a test rather than a comment:
 *
 * 1. **The panel origin is opaque.** The iframe gets `allow-scripts` and
 *    nothing else. Adding `allow-same-origin` beside it would hand the panel
 *    the host's origin, and with it the app's `localStorage`, its IndexedDB
 *    and its cookies — every stored token included. The two tokens together
 *    are documented by the HTML spec as equivalent to not sandboxing at all.
 * 2. **A panel cannot reach the network.** `connect-src 'none'` in the
 *    response CSP, served on every panel file. Widening it would let a panel
 *    read host state through the bridge and then post it somewhere, which is
 *    the difference between a panel that can see data and a panel that can
 *    exfiltrate it.
 * 3. **`dispatch` is the only path to host state.** The frame speaks one
 *    command, `panels_request`; that command calls `dispatch`; `dispatch`
 *    checks the manifest's permissions before it calls the host. A second
 *    route into `AppPanelHost`, or a command the frame could call directly,
 *    would mean host state reachable without a permission check.
 *
 * Re-widening any of these should fail the build until someone deletes the
 * assertion deliberately and writes a decision record saying why — the same
 * friction `tests/no-auto-update.test.mjs` exists to create.
 *
 * See docs/decisions/2026-10-03-port-the-panel-mechanism-from-claudedesktopclient-not-its.md
 * and docs/superpowers/specs/2026-10-03-panel-contract-v1.md.
 */
import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8')

const PROTOCOL = 'src-tauri/src/core/panels/protocol.rs'
const BRIDGE = 'src-tauri/src/core/panels/bridge.rs'
const COMMANDS = 'src-tauri/src/core/panels/commands.rs'
const FRAME = 'web-app/src/panels/PanelFrame.tsx'
const PANELS_DIR = 'web-app/src/panels'

/** The `PANEL_CSP` constant, parsed into directive → value. */
function panelCsp() {
  const source = read(PROTOCOL)
  const match = source.match(/pub const PANEL_CSP: &str = "([\s\S]*?)";/)
  assert.ok(match, `${PROTOCOL} no longer declares a PANEL_CSP constant`)
  // Rust line continuations: a trailing backslash plus the next line's indent.
  const csp = match[1].replace(/\\\s*\n\s*/g, '')
  const directives = new Map()
  for (const part of csp.split(';')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const space = trimmed.indexOf(' ')
    directives.set(
      space === -1 ? trimmed : trimmed.slice(0, space),
      space === -1 ? '' : trimmed.slice(space + 1).trim()
    )
  }
  return directives
}

test('a panel cannot reach the network from its own page', () => {
  const csp = panelCsp()
  assert.equal(
    csp.get('connect-src'),
    "'none'",
    "the panel CSP no longer sets connect-src 'none'; a panel could fetch, " +
      'which turns read access to host state into exfiltration'
  )
  assert.equal(
    csp.get('default-src'),
    "'self'",
    "the panel CSP no longer defaults to 'self'"
  )
  for (const directive of ['object-src', 'base-uri', 'form-action']) {
    assert.equal(
      csp.get(directive),
      "'none'",
      `the panel CSP no longer sets ${directive} 'none'`
    )
  }
  // Scripts and styles are the panel's own, inline included — but from its
  // folder only. A remote script would be a network reach by another name.
  for (const directive of ['script-src', 'style-src']) {
    const value = csp.get(directive) ?? ''
    assert.ok(
      value.includes("'self'"),
      `the panel CSP's ${directive} no longer includes 'self'`
    )
    assert.ok(
      !/https?:|\*|data:/.test(value),
      `the panel CSP's ${directive} admits remote or data-URL code: ${value}`
    )
  }
})

test('every panel response carries that CSP', () => {
  const source = read(PROTOCOL)
  assert.ok(
    source.includes('.header("Content-Security-Policy", PANEL_CSP)'),
    `${PROTOCOL} no longer attaches PANEL_CSP to the response it builds`
  )
  // One body-bearing builder, one CSP. A second response path that forgot the
  // header would serve a panel file unprotected, so there must not be one.
  const bodyBuilders = source.match(/Response::builder\(\)/g) ?? []
  const cspHeaders = source.match(/Content-Security-Policy/g) ?? []
  assert.ok(
    cspHeaders.length >= bodyBuilders.length - 1,
    `${PROTOCOL} builds ${bodyBuilders.length} responses but sets the CSP ` +
      `${cspHeaders.length} times; a panel file may be served without it`
  )
  assert.ok(
    source.includes('"X-Content-Type-Options", "nosniff"'),
    `${PROTOCOL} no longer sends X-Content-Type-Options: nosniff`
  )
})

test('the panel iframe is sandboxed to scripts and nothing else', () => {
  const frame = read(FRAME)
  const match = frame.match(/sandbox="([^"]*)"/)
  assert.ok(match, `${FRAME} no longer sets a sandbox attribute on the iframe`)
  assert.deepEqual(
    match[1].split(/\s+/).filter(Boolean),
    ['allow-scripts'],
    `${FRAME}'s iframe sandbox is "${match[1]}"; it must be allow-scripts ` +
      'alone — allow-same-origin would give the panel the host origin, and ' +
      'allow-popups or allow-top-navigation would let it escape the tile'
  )
})

test('allow-same-origin appears nowhere in the panel layer', () => {
  // Including in a comment that a later edit could uncomment, and including
  // the Rust side, which must never serve a panel into a same-origin frame.
  const files = [
    ...readdirSync(path.join(repoRoot, PANELS_DIR))
      .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
      .map((name) => `${PANELS_DIR}/${name}`),
    ...readdirSync(path.join(repoRoot, 'src-tauri/src/core/panels'))
      .filter((name) => name.endsWith('.rs'))
      .map((name) => `src-tauri/src/core/panels/${name}`),
  ]
  for (const rel of files) {
    assert.ok(
      !read(rel).includes('allow-same-origin'),
      `${rel} mentions allow-same-origin`
    )
  }
})

test('the frame speaks exactly one command to the host', () => {
  const frame = read(FRAME)
  const invoked = new Set(
    [...frame.matchAll(/invoke(?:<[^>]*>)?\(\s*'([^']+)'/g)].map((m) => m[1])
  )
  assert.deepEqual(
    [...invoked],
    ['panels_request'],
    `${FRAME} invokes ${[...invoked].join(', ')}; the frame relays panel ` +
      'messages and must not reach any other command on a panel\'s behalf'
  )
})

test('panels_request is the only command that dispatches, and it always does', () => {
  const commands = read(COMMANDS)
  assert.ok(
    /pub async fn panels_request[\s\S]*?dispatch\(/.test(commands),
    `${COMMANDS}'s panels_request no longer calls dispatch`
  )
  // Nothing else may call the host directly: the other four commands manage
  // the panel folder, and a shortcut from one of them into AppPanelHost would
  // be host state reached without a manifest check.
  const hostCalls = commands.match(/AppPanelHost/g) ?? []
  assert.ok(
    hostCalls.length <= 2,
    `${COMMANDS} mentions AppPanelHost ${hostCalls.length} times; only ` +
      'panels_request should construct it'
  )
})

test('dispatch refuses before it acts, and the free list stays short', () => {
  const bridge = read(BRIDGE)
  assert.ok(
    bridge.includes('fn required_permission'),
    `${BRIDGE} no longer derives a required permission per method`
  )
  assert.ok(
    /pub async fn dispatch[\s\S]*?required_permission\(/.test(bridge),
    `${BRIDGE}'s dispatch no longer consults required_permission`
  )

  const manifest = read('src-tauri/src/core/panels/manifest.rs')
  const always = manifest.match(/ALWAYS_ALLOWED: \[&str; \d+\] = \[([^\]]*)\]/)
  assert.ok(always, 'manifest.rs no longer declares ALWAYS_ALLOWED')
  const free = always[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^"|"$/g, ''))
    .filter(Boolean)
  assert.deepEqual(
    free.sort(),
    ['host.info', 'panel.ready', 'panel.resize', 'panel.theme'],
    'ALWAYS_ALLOWED changed. These four methods need no permission because ' +
      'none of them reads or writes anything: they report the host version, ' +
      'the theme, and the frame\'s own lifecycle. A storage or MCP method ' +
      'added here would be reachable with no declaration in the manifest'
  )
  for (const method of free) {
    assert.ok(
      !method.startsWith('storage.') && !method.startsWith('mcp.'),
      `ALWAYS_ALLOWED grants ${method} with no permission`
    )
  }
})

test('the app admits the panel scheme as a frame and not as a fetch target', () => {
  const csp = JSON.parse(read('src-tauri/tauri.conf.json')).app.security.csp
  for (const directive of ['frame-src', 'child-src']) {
    assert.ok(
      String(csp[directive]).includes('panel:'),
      `tauri.conf.json's ${directive} no longer admits panel:; panels would ` +
        'not render at all'
    )
  }
  // The host page must not be able to fetch a panel's files itself — that
  // would read a panel's code and data outside the sandbox.
  assert.ok(
    !String(csp['connect-src']).includes('panel'),
    "tauri.conf.json's connect-src admits the panel scheme"
  )
  assert.ok(
    !String(csp['script-src']).includes('panel'),
    "tauri.conf.json's script-src admits the panel scheme; a panel's code " +
      'could then run in the host page'
  )
})

test('the panel scheme is registered once, by the panel module', () => {
  const lib = read('src-tauri/src/lib.rs')
  const registrations =
    lib.match(/register_uri_scheme_protocol\(\s*"panel"/g) ?? []
  assert.equal(
    registrations.length,
    1,
    `src-tauri/src/lib.rs registers the panel scheme ${registrations.length} times`
  )
  assert.ok(
    /register_uri_scheme_protocol\(\s*"panel",\s*core::panels::handle_panel_request\s*\)/.test(
      lib
    ),
    'the panel scheme is no longer served by core::panels::handle_panel_request'
  )
})
