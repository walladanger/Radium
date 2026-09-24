# dep-rust-rand
status: OPEN
kind: dependency
source: dependabot
severity: low
open_alerts: 2 of 2

## Facts (generated)
title: rand (rust)
package: rand
ecosystem: rust
manifests: src-tauri/Cargo.lock
scopes: runtime/unknown
vulnerable_ranges: >= 0.7.0, < 0.8.6 ; >= 0.9.0, < 0.9.3
patched_versions: 0.8.6, 0.9.3

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| D111 | open | low | src-tauri/Cargo.lock (runtime, unknown) | GHSA-cq8v-f236-94qc Rand is unsound with a custom logger using rand::rng() [vulnerable >= 0.7.0, < 0.8.6] | 0.8.6 |
| D110 | open | low | src-tauri/Cargo.lock (runtime, unknown) | GHSA-cq8v-f236-94qc Rand is unsound with a custom logger using rand::rng() [vulnerable >= 0.9.0, < 0.9.3] | 0.9.3 |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
