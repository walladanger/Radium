/**
 * Panel SDK — contract v1.
 *
 * Served to every panel at `/panel-sdk.js` on the `panel://` origin. A panel
 * runs in an iframe with `sandbox="allow-scripts"`, so it has no Node, no
 * access to the host page, and a response CSP of `connect-src 'none'`. This
 * module is the only way out, and every call is authorised in the host process
 * against the permissions the panel's manifest declares.
 *
 *   import { panel } from '/panel-sdk.js'
 *   const tools = await panel.tools()        // needs "mcp.read"
 *   panel.onTheme((t) => { document.documentElement.dataset.theme = t })
 *   panel.ready()
 *
 * Frozen: both Radium and ClaudeDesktopClient serve this file byte-for-byte,
 * so a panel written against it runs in either. Additions go through a
 * contract version bump, never a quiet edit.
 * See docs/superpowers/specs/2026-10-03-panel-contract-v1.md.
 */

const CONTRACT = 1
const CALL_TIMEOUT_MS = 30000

const pending = new Map()
const themeSubs = new Set()
let seq = 0

window.addEventListener('message', (event) => {
  const msg = event.data
  if (!msg || typeof msg !== 'object') return

  if (msg.type === 'host:init' || msg.type === 'host:theme') {
    themeSubs.forEach((fn) => fn(msg.theme))
    return
  }

  if (msg.type !== 'host:response') return

  const entry = pending.get(msg.id)
  if (!entry) return
  pending.delete(msg.id)
  if (msg.ok) {
    entry.resolve(msg.result)
    return
  }
  // `code` distinguishes the cases a panel can act on — `permission_denied`
  // means the manifest is missing something, which the author can fix;
  // `unknown_method` means the host is older than the panel expects.
  const error = new Error(msg.error)
  error.code = msg.code
  entry.reject(error)
})

/** Call a host method. Requires the matching permission in panel.json. */
const call = (method, params) => {
  const id = `r${++seq}`
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    window.parent.postMessage(
      { type: 'panel:request', contract: CONTRACT, id, method, params: params || {} },
      '*'
    )
    // A host that never answers must not leave the caller hanging forever;
    // a panel that loses one call can still render the rest of itself.
    setTimeout(() => {
      if (!pending.has(id)) return
      pending.delete(id)
      const error = new Error(`Timed out calling ${method}`)
      error.code = 'timeout'
      reject(error)
    }, CALL_TIMEOUT_MS)
  })
}

export const panel = {
  contract: CONTRACT,

  /** Escape hatch for methods without a wrapper below. */
  call,

  /** Tell the host the panel has rendered, so it can drop the spinner. */
  ready: () => window.parent.postMessage({ type: 'panel:ready', contract: CONTRACT }, '*'),

  /** Ask the host for a different size, in board grid units. */
  resize: (w, h) => window.parent.postMessage({ type: 'panel:resize', contract: CONTRACT, w, h }, '*'),

  /**
   * React to light/dark changes. The host pushes the current theme on init,
   * so a subscriber added during module evaluation does not miss the first
   * value. Returns an unsubscribe function.
   */
  onTheme: (fn) => {
    themeSubs.add(fn)
    return () => themeSubs.delete(fn)
  },

  /** Host name, version and platform. Always allowed. */
  host: () => call('host.info'),

  /** The theme the host is currently showing. Always allowed. */
  theme: () => call('panel.theme'),

  /** Per-panel key/value storage, namespaced to this panel. Needs "storage". */
  get: (key) => call('storage.get', { key }),
  set: (key, value) => call('storage.set', { key, value }),

  /** MCP tools from the servers this panel's manifest allows. Needs "mcp.read". */
  tools: () => call('mcp.listTools'),

  /** Run one MCP tool. Needs "mcp.call". */
  callTool: (name, args) => call('mcp.callTool', { name, args: args || {} })
}

export default panel
