# dep-npm-ip-address
status: OPEN
kind: dependency
source: dependabot
severity: high
open_alerts: 2 of 2

## Facts (generated)
title: ip-address (npm)
package: ip-address
ecosystem: npm
manifests: extensions/yarn.lock
scopes: runtime/transitive
vulnerable_ranges: <= 10.3.0 ; <= 10.1.0
patched_versions: 10.3.1, 10.1.1

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| D97 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-mwp4-54f8-5fhr ip-address: Address4 decodes leading-zero octets as decimal while resolvers decode them... | 10.3.1 |
| D74 | open | medium | extensions/yarn.lock (runtime, transitive) | GHSA-v2v4-37r5-5v8g ip-address has XSS in Address6 HTML-emitting methods [vulnerable <= 10.1.0] | 10.1.1 |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
