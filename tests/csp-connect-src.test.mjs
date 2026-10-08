/**
 * Every host the renderer fetches directly is allowed by `connect-src`.
 *
 * Requests made through `@tauri-apps/plugin-http` go out via the Rust HTTP
 * client, so the webview's CSP never sees them. Requests made with the
 * platform `fetch` *are* subject to it, and when CSP blocks one the failure is
 * not loud — it surfaces as a rejected promise that the call site usually
 * treats as "the network is down".
 *
 * That is how this broke. A commit that tightened `connect-src` to the two
 * PostHog hosts removed the hosts the renderer actually calls:
 *
 *   - `raw.githubusercontent.com` is the *primary* transport for the model
 *     catalog, the recommended-model list, staff picks and the provider
 *     registry. Those modules fall back to `plugin-http`, so the app still
 *     worked — but every load first took a CSP rejection, and the fallback is
 *     documented in `model-catalog-registry.ts` as having "occasionally hung
 *     when used as the primary transport for large gzipped payloads".
 *   - `huggingface.co` is called by `fetchModelStats` in `lib/model-card.ts`
 *     with no fallback at all, inside a `try { } catch { }` that ignores the
 *     error. Blocked, it silently degrades every Hub model card to name-based
 *     guesses for parameter count and context length.
 *
 * So rather than pin a hand-written list that drifts, this derives the
 * requirement from the source: any absolute `https://` literal passed to a
 * bare `fetch(` in `web-app/src` must appear in `connect-src`.
 *
 * If this fails, you either added a new direct fetch (add its host to the CSP)
 * or you are routing through `plugin-http` (then the match below is a false
 * positive, and the call should not be using bare `fetch`).
 */
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(path.join(repoRoot, rel), 'utf8')

const connectSrc = JSON.parse(read('src-tauri/tauri.conf.json')).app.security.csp['connect-src']

/** Hosts reached by a bare `fetch('https://…')` in shipped renderer code. */
function directlyFetchedHosts() {
  // git grep keeps this to tracked files and is available wherever the repo is.
  let out = ''
  try {
    out = execFileSync(
      'git',
      ['grep', '-hoE', "fetch\\(\\s*['\"`]https://[a-zA-Z0-9.-]+", '--', 'web-app/src'],
      { cwd: repoRoot, encoding: 'utf8' }
    )
  } catch (error) {
    // git grep exits 1 when nothing matches, which is a legitimate state.
    if (error.status !== 1) throw error
  }
  const hosts = new Set()
  for (const line of out.split('\n')) {
    const match = line.match(/https:\/\/([a-zA-Z0-9.-]+)/)
    if (match) hosts.add(match[1])
  }
  // Test fixtures use example.com and friends; they never run in a webview.
  for (const placeholder of [...hosts]) {
    if (/(^|\.)example\.(com|org|net)$/.test(placeholder)) hosts.delete(placeholder)
  }
  return [...hosts].sort()
}

test('the renderer does make direct https fetches worth guarding', () => {
  assert.ok(
    directlyFetchedHosts().length > 0,
    'found no direct https fetches; this guard would pass vacuously'
  )
})

test('connect-src allows every host the renderer fetches directly', () => {
  for (const host of directlyFetchedHosts()) {
    assert.ok(
      connectSrc.includes(`https://${host}`),
      `the renderer calls https://${host} with bare fetch, but connect-src ` +
        `does not allow it, so the request is blocked in the packaged app ` +
        `(often silently). connect-src is: ${connectSrc}`
    )
  }
})

test('connect-src still admits loopback for the local model servers', () => {
  // llama.cpp, the local API server and the MLX server are all loopback; a
  // tightening that drops these takes local inference with it.
  for (const required of ['http://127.0.0.1:*', 'ws://127.0.0.1:*']) {
    assert.ok(
      connectSrc.includes(required),
      `connect-src no longer allows ${required}; local inference needs it`
    )
  }
})
