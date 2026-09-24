# dep-npm-seroval
status: OPEN
kind: dependency
source: dependabot
severity: critical
open_alerts: 6 of 6

## Facts (generated)
title: seroval (npm)
package: seroval
ecosystem: npm
manifests: yarn.lock
scopes: runtime/transitive
vulnerable_ranges: <= 1.5.2 ; >= 0.2.0, <= 1.4.0 ; <= 1.4.0 ; < 1.4.1
patched_versions: 1.5.3, 1.4.1

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| D296 | open | critical | yarn.lock (runtime, transitive) | GHSA-mv8w-475r-vwqw seroval: `seroval.fromJSON()` Promise resolver type confusion invokes attacker-controll... | 1.5.3 |
| D249 | open | high | yarn.lock (runtime, transitive) | GHSA-hx9m-jf43-8ffr seroval affected by Denial of Service via RegExp serialization [vulnerable >= 0.2.0, <=... | 1.4.1 |
| D195 | open | high | yarn.lock (runtime, transitive) | GHSA-3j22-8qj3-26mx Seroval affected by Denial of Service via Deeply Nested Objects [vulnerable <= 1.4.0] | 1.4.1 |
| D193 | open | high | yarn.lock (runtime, transitive) | GHSA-66fc-rw6m-c2q6 Seroval affected by Denial of Service via Array serialization [vulnerable <= 1.4.0] | 1.4.1 |
| D192 | open | high | yarn.lock (runtime, transitive) | GHSA-3rxj-6cgf-8cfw seroval Affected by Remote Code Execution via JSON Deserialization [vulnerable < 1.4.1] | 1.4.1 |
| D191 | open | high | yarn.lock (runtime, transitive) | GHSA-hj76-42vx-jwp4 seroval Affected by Prototype Pollution via JSON Deserialization [vulnerable < 1.4.1] | 1.4.1 |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
