# cs-codeql-rust-disabled-certificate-check-helpers-rs-0e5e8c
status: OPEN
kind: code
source: code-scanning
severity: high
open_alerts: 1 of 1

## Facts (generated)
title: rust/disabled-certificate-check in src-tauri/src/core/downloads/helpers.rs
tool: CodeQL
rule: rust/disabled-certificate-check
rule_name: rust/disabled-certificate-check
file: src-tauri/src/core/downloads/helpers.rs
lines: 387
github_classification: none

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| C671 | open | high | src-tauri/src/core/downloads/helpers.rs:387 | Disabling TLS certificate validation can expose the application to man-in-the-middle attacks. | - |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
