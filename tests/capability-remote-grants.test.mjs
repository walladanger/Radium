/**
 * No Tauri capability grants its permissions to a remote origin.
 *
 * `remote.urls` in a capability file is not an outbound allowlist. Tauri's
 * documentation is explicit that it does the opposite of what the name
 * suggests: it extends that capability's **entire permission set** to
 * documents loaded from those origins, which by default is reachable only by
 * the app's own bundled code.
 *
 * This repository learned that the hard way. A commit titled "Harden Tauri
 * security policy" added
 *
 *     "remote": { "urls": ["https://posthog.com", "https://eu-assets.i.posthog.com"] }
 *
 * to `default.json` and `desktop.json`, describing it as restricting the
 * outbound HTTP allowlist. It restricted nothing. Both capabilities grant
 * `shell:allow-spawn` and `shell:allow-open`, so the net effect was to offer
 * process spawning to any document served from a telemetry vendor's domain if
 * one were ever loaded in the main or a thread window — while the actual
 * outbound scope (`http:default`) stayed wildcarded at `https://*:*` and
 * `http://*:*`.
 *
 * PostHog is a request *destination*, reached by the app's own frontend. It is
 * not a document origin and needs no capability. Destination limits belong in
 * the `http:default` scope.
 *
 * If a future capability genuinely needs to serve remote content, this guard
 * has to be deleted deliberately, and whoever deletes it owes a decision
 * record explaining which permissions that origin is being handed.
 */
import { strict as assert } from 'node:assert'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const capabilityDir = path.join(repoRoot, 'src-tauri/capabilities')

const capabilityFiles = readdirSync(capabilityDir).filter((name) => name.endsWith('.json'))

test('capability files exist to be checked', () => {
  assert.ok(
    capabilityFiles.length > 0,
    'no capability files found; this guard would pass vacuously'
  )
})

test('no capability extends its permissions to a remote origin', () => {
  for (const file of capabilityFiles) {
    const capability = JSON.parse(readFileSync(path.join(capabilityDir, file), 'utf8'))
    assert.equal(
      capability.remote,
      undefined,
      `${file} declares a \`remote\` block. That grants every permission it ` +
        'lists to documents from those origins — it does not restrict where ' +
        'the app may send requests. Put destination limits in the ' +
        '`http:default` scope instead.'
    )
  }
})

test('the shell permissions that made this dangerous are still present', () => {
  // The guard above matters precisely because these capabilities carry shell
  // access. If that ever stops being true the guard is still correct, but this
  // assertion is what keeps its rationale honest rather than historical.
  const everyPermission = capabilityFiles.flatMap((file) => {
    const capability = JSON.parse(readFileSync(path.join(capabilityDir, file), 'utf8'))
    return (capability.permissions ?? []).map((entry) =>
      typeof entry === 'string' ? entry : entry.identifier
    )
  })
  assert.ok(
    everyPermission.includes('shell:allow-spawn'),
    'no capability grants shell:allow-spawn any more — re-read the comment ' +
      'at the top of this file and update it to match what is now at stake'
  )
})
