# dep-npm-vite
status: OPEN
kind: dependency
source: dependabot
severity: high
open_alerts: 6 of 6

## Facts (generated)
title: vite (npm)
package: vite
ecosystem: npm
manifests: extensions/yarn.lock
scopes: runtime/transitive
vulnerable_ranges: >= 7.0.0, <= 7.3.4 ; >= 7.0.0, <= 7.3.1 ; >= 7.1.0, <= 7.3.1 ; >= 7.1.0, <= 7.1.10
patched_versions: 7.3.5, 7.3.2, 7.1.11

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| D79 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-fx2h-pf6j-xcff vite: `server.fs.deny` bypass on Windows alternate paths [vulnerable >= 7.0.0, <= 7.3.4] | 7.3.5 |
| D71 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-v2wj-q39q-566r Vite: `server.fs.deny` bypassed with queries [vulnerable >= 7.1.0, <= 7.3.1] | 7.3.2 |
| D70 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-p9ff-h696-f583 Vite Vulnerable to Arbitrary File Read via Vite Dev Server WebSocket [vulnerable >= 7.0... | 7.3.2 |
| D80 | open | medium | extensions/yarn.lock (runtime, transitive) | GHSA-v6wh-96g9-6wx3 launch-editor: NTLMv2 hash disclosure via UNC path handling on Windows [vulnerable >= 7... | 7.3.5 |
| D72 | open | medium | extensions/yarn.lock (runtime, transitive) | GHSA-4w7w-66w2-5vf9 Vite Vulnerable to Path Traversal in Optimized Deps `.map` Handling [vulnerable >= 7.0.... | 7.3.2 |
| D42 | open | medium | extensions/yarn.lock (runtime, transitive) | GHSA-93m4-6634-74q7 vite allows server.fs.deny bypass via backslash on Windows [vulnerable >= 7.1.0, <= 7.1... | 7.1.11 |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
