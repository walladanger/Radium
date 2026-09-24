# dep-npm-postcss
status: OPEN
kind: dependency
source: dependabot
severity: high
open_alerts: 4 of 4

## Facts (generated)
title: postcss (npm)
package: postcss
ecosystem: npm
manifests: extensions/yarn.lock
scopes: runtime/transitive
vulnerable_ranges: <= 8.5.22 ; <= 8.5.17 ; <= 8.5.11 ; < 8.5.10
patched_versions: 8.5.23, 8.5.18, 8.5.12, 8.5.10

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| D90 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-r28c-9q8g-f849 PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to... | 8.5.18 |
| D89 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-6g55-p6wh-862q PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceM... | 8.5.12 |
| D96 | open | medium | extensions/yarn.lock (runtime, transitive) | GHSA-fxqj-rqcc-2cmp PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL r... | 8.5.23 |
| D73 | open | medium | extensions/yarn.lock (runtime, transitive) | GHSA-qx2v-qp2m-jg93 PostCSS has XSS via Unescaped </style> in its CSS Stringify Output [vulnerable < 8.5.10] | 8.5.10 |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
