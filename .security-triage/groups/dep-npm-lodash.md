# dep-npm-lodash
status: OPEN
kind: dependency
source: dependabot
severity: high
open_alerts: 3 of 3

## Facts (generated)
title: lodash (npm)
package: lodash
ecosystem: npm
manifests: yarn.lock
scopes: runtime/transitive
vulnerable_ranges: >= 4.0.0, <= 4.17.23 ; <= 4.17.23 ; >= 4.0.0, <= 4.17.22
patched_versions: 4.18.0, 4.17.23

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| D235 | open | high | yarn.lock (runtime, transitive) | GHSA-r5fr-rjxr-66jc lodash vulnerable to Code Injection via `_.template` imports key names [vulnerable >= 4... | 4.18.0 |
| D233 | open | medium | yarn.lock (runtime, transitive) | GHSA-f23m-r3pf-42rh lodash vulnerable to Prototype Pollution via array path bypass in `_.unset` and `_.omit... | 4.18.0 |
| D194 | open | medium | yarn.lock (runtime, transitive) | GHSA-xxjr-mmjv-4gpg Lodash has Prototype Pollution Vulnerability in `_.unset` and `_.omit` functions [vulne... | 4.17.23 |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
