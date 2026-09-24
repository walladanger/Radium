# dep-npm-shell-quote
status: OPEN
kind: dependency
source: dependabot
severity: critical
open_alerts: 2 of 2

## Facts (generated)
title: shell-quote (npm)
package: shell-quote
ecosystem: npm
manifests: extensions/yarn.lock
scopes: runtime/transitive
vulnerable_ranges: <= 1.8.4 ; >= 1.1.0, <= 1.8.3
patched_versions: 1.9.0, 1.8.4

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| D77 | open | critical | extensions/yarn.lock (runtime, transitive) | GHSA-w7jw-789q-3m8p shell-quote quote() does not escape newlines in object .op values [vulnerable >= 1.1.0,... | 1.8.4 |
| D84 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-395f-4hp3-45gv shell-quote: Quadratic-complexity Denial of Service in `parse()` (CWE-407) [vulnerable ... | 1.9.0 |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
