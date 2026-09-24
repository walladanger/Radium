# dep-npm-brace-expansion
status: OPEN
kind: dependency
source: dependabot
severity: high
open_alerts: 12 of 12

## Facts (generated)
title: brace-expansion (npm)
package: brace-expansion
ecosystem: npm
manifests: yarn.lock, extensions/yarn.lock
scopes: development/transitive, runtime/transitive
vulnerable_ranges: >= 2.0.0, < 2.1.2 ; >= 3.0.0, < 5.0.7 ; >= 2.0.0, < 2.1.4 ; < 1.1.18 ; < 1.1.17 ; >= 2.0.0, < 2.1.3 ; < 1.1.16 ; < 1.1.13 ; >= 2.0.0, < 2.0.3 ; >= 1.0.0, <= 1.1.11 ; >= 2.0.0, <= 2.0.1
patched_versions: 2.1.2, 5.0.7, 2.1.4, 1.1.18, 1.1.17, 2.1.3, 1.1.16, 1.1.13, 2.0.3, 1.1.12, 2.0.2

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| D95 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-rgw5-rvv9-x895 brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mi... | 2.1.4 |
| D94 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-rgw5-rvv9-x895 brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mi... | 1.1.18 |
| D93 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-mh99-v99m-4gvg brace-expansion: DoS via unbounded expansion length causing an out-of-memory process cr... | 1.1.17 |
| D92 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-mh99-v99m-4gvg brace-expansion: DoS via unbounded expansion length causing an out-of-memory process cr... | 2.1.3 |
| D83 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-3jxr-9vmj-r5cp brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} gro... | 2.1.2 |
| D82 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-3jxr-9vmj-r5cp brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} gro... | 1.1.16 |
| D284 | open | high | yarn.lock (development, transitive) | GHSA-3jxr-9vmj-r5cp brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} gro... | 2.1.2 |
| D282 | open | high | yarn.lock (development, transitive) | GHSA-3jxr-9vmj-r5cp brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} gro... | 5.0.7 |
| D69 | open | medium | extensions/yarn.lock (runtime, transitive) | GHSA-f886-m6hf-6m8v brace-expansion: Zero-step sequence causes process hang and memory exhaustion [vulnerab... | 1.1.13 |
| D68 | open | medium | extensions/yarn.lock (runtime, transitive) | GHSA-f886-m6hf-6m8v brace-expansion: Zero-step sequence causes process hang and memory exhaustion [vulnerab... | 2.0.3 |
| D41 | open | low | extensions/yarn.lock (runtime, transitive) | GHSA-v6h2-p8h4-qcjw brace-expansion Regular Expression Denial of Service vulnerability [vulnerable >= 1.0.0... | 1.1.12 |
| D40 | open | low | extensions/yarn.lock (runtime, transitive) | GHSA-v6h2-p8h4-qcjw brace-expansion Regular Expression Denial of Service vulnerability [vulnerable >= 2.0.0... | 2.0.2 |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
