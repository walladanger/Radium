# dep-npm-form-data
status: OPEN
kind: dependency
source: dependabot
severity: critical
open_alerts: 2 of 2

## Facts (generated)
title: form-data (npm)
package: form-data
ecosystem: npm
manifests: yarn.lock
scopes: runtime/transitive
vulnerable_ranges: < 2.5.6 ; < 2.5.4
patched_versions: 2.5.6, 2.5.4

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| D173 | open | critical | yarn.lock (runtime, transitive) | GHSA-fjxv-7rqg-78g4 form-data uses unsafe random function in form-data for choosing boundary [vulnerable < ... | 2.5.4 |
| D269 | open | high | yarn.lock (runtime, transitive) | GHSA-hmw2-7cc7-3qxx form-data: CRLF injection in form-data via unescaped multipart field names and filename... | 2.5.6 |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
