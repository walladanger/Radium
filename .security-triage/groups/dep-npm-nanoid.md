# dep-npm-nanoid
status: OPEN
kind: dependency
source: dependabot
severity: high
open_alerts: 5 of 5

## Facts (generated)
title: nanoid (npm)
package: nanoid
ecosystem: npm
manifests: yarn.lock, extensions/yarn.lock
scopes: runtime/transitive
vulnerable_ranges: >= 4.0.0, < 5.1.11 ; >= 4.0.0, < 5.1.16 ; < 3.3.12 ; < 3.3.18 ; < 3.3.16
patched_versions: 5.1.11, 5.1.16, 3.3.12, 3.3.18, 3.3.16

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| D327 | open | high | yarn.lock (runtime, transitive) | GHSA-xwg4-73v4-xw9w nanoid: Integer Overflow or Wraparound [vulnerable >= 4.0.0, < 5.1.11] | 5.1.11 |
| D317 | open | high | yarn.lock (runtime, transitive) | GHSA-28wg-ghj8-5hjv nanoid: non-secure generators can loop indefinitely with negative size [vulnerable >= 4... | 5.1.16 |
| D101 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-xwg4-73v4-xw9w nanoid: Integer Overflow or Wraparound [vulnerable < 3.3.12] | 3.3.12 |
| D99 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-2v37-7h3g-55p8 nanoid: custom generators can loop indefinitely when size is zero [vulnerable < 3.3.18] | 3.3.18 |
| D98 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-28wg-ghj8-5hjv nanoid: non-secure generators can loop indefinitely with negative size [vulnerable < 3.... | 3.3.16 |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
