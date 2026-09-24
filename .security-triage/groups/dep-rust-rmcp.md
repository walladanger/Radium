# dep-rust-rmcp
status: OPEN
kind: dependency
source: dependabot
severity: high
open_alerts: 8 of 8

## Facts (generated)
title: rmcp (rust)
package: rmcp
ecosystem: rust
manifests: .probe/Cargo.toml, src-tauri/Cargo.lock
scopes: runtime/unknown
vulnerable_ranges: < 2.1.0 ; < 2.0.0 ; < 1.4.0
patched_versions: 2.1.0, 2.0.0, 1.4.0

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| D343 | open | high | .probe/Cargo.toml (runtime, unknown) | GHSA-9pj6-vhgr-3mwh RMCP: Unauthenticated permanent session-table leak in rmcp Streamable HTTP server trans... | 2.0.0 |
| D342 | open | high | .probe/Cargo.toml (runtime, unknown) | GHSA-33f5-2c5q-wgwj RMCP: Missing Resource Field Validation in OAuth Protected Resource Metadata Discovery ... | 2.0.0 |
| D341 | open | high | src-tauri/Cargo.lock (runtime, unknown) | GHSA-33f5-2c5q-wgwj RMCP: Missing Resource Field Validation in OAuth Protected Resource Metadata Discovery ... | 2.0.0 |
| D340 | open | high | src-tauri/Cargo.lock (runtime, unknown) | GHSA-9pj6-vhgr-3mwh RMCP: Unauthenticated permanent session-table leak in rmcp Streamable HTTP server trans... | 2.0.0 |
| D120 | open | high | src-tauri/Cargo.lock (runtime, unknown) | GHSA-89vp-x53w-74fx rmcp Streamable HTTP server transport has a DNS rebinding vulnerability [vulnerable < 1... | 1.4.0 |
| D1 | open | high | .probe/Cargo.toml (runtime, unknown) | GHSA-89vp-x53w-74fx rmcp Streamable HTTP server transport has a DNS rebinding vulnerability [vulnerable < 1... | 1.4.0 |
| D345 | open | medium | .probe/Cargo.toml (runtime, unknown) | GHSA-9g45-5xwm-f3wc RMCP: Custom HTTP headers leak to cross-origin redirect targets [vulnerable < 2.1.0] | 2.1.0 |
| D344 | open | medium | src-tauri/Cargo.lock (runtime, unknown) | GHSA-9g45-5xwm-f3wc RMCP: Custom HTTP headers leak to cross-origin redirect targets [vulnerable < 2.1.0] | 2.1.0 |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
