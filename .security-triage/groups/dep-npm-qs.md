# dep-npm-qs
status: OPEN
kind: dependency
source: dependabot
severity: medium
open_alerts: 4 of 4

## Facts (generated)
title: qs (npm)
package: qs
ecosystem: npm
manifests: yarn.lock
scopes: runtime/transitive
vulnerable_ranges: >= 2.2.5, < 6.16.0 ; >= 6.11.1, <= 6.15.1 ; >= 6.7.0, <= 6.14.1 ; < 6.14.1
patched_versions: 6.16.0, 6.15.2, 6.14.2, 6.14.1

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| D329 | open | medium | yarn.lock (runtime, transitive) | GHSA-4mjr-xmp4-gh2g qs: Denial of Service via Attacker Controlled isBuffer [vulnerable >= 2.2.5, < 6.16.0] | 6.16.0 |
| D259 | open | medium | yarn.lock (runtime, transitive) | GHSA-q8mj-m7cp-5q26 qs has a remotely triggerable DoS: qs.stringify crashes with TypeError on null/undefine... | 6.15.2 |
| D186 | open | medium | yarn.lock (runtime, transitive) | GHSA-6rw7-vpxm-498p qs's arrayLimit bypass in its bracket notation allows DoS via memory exhaustion [vulner... | 6.14.1 |
| D198 | open | low | yarn.lock (runtime, transitive) | GHSA-w7fw-mjwx-w883 qs's arrayLimit bypass in comma parsing allows denial of service [vulnerable >= 6.7.0, ... | 6.14.2 |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
