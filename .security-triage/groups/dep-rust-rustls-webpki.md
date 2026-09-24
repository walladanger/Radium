# dep-rust-rustls-webpki
status: OPEN
kind: dependency
source: dependabot
severity: high
open_alerts: 3 of 3

## Facts (generated)
title: rustls-webpki (rust)
package: rustls-webpki
ecosystem: rust
manifests: src-tauri/Cargo.lock
scopes: runtime/unknown
vulnerable_ranges: < 0.103.13 ; >= 0.101.0, < 0.103.12
patched_versions: 0.103.13, 0.103.12

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| D117 | open | high | src-tauri/Cargo.lock (runtime, unknown) | GHSA-82j2-j2ch-gfr8 rustls-webpki: Denial of service via panic on malformed CRL BIT STRING [vulnerable < 0.... | 0.103.13 |
| D109 | open | low | src-tauri/Cargo.lock (runtime, unknown) | GHSA-xgp8-3hg3-c2mh webpki: Name constraints were accepted for certificates asserting a wildcard name [vuln... | 0.103.12 |
| D108 | open | low | src-tauri/Cargo.lock (runtime, unknown) | GHSA-965h-392x-2mh5 webpki: Name constraints for URI names were incorrectly accepted [vulnerable >= 0.101.0... | 0.103.12 |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
