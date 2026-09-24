# cs-codeql-rust-cleartext-logging-review-rs-a491ca
status: OPEN
kind: code
source: code-scanning
severity: high
open_alerts: 1 of 1

## Facts (generated)
title: rust/cleartext-logging in src-tauri/src/core/mcp/review.rs
tool: CodeQL
rule: rust/cleartext-logging
rule_name: rust/cleartext-logging
file: src-tauri/src/core/mcp/review.rs
lines: 393
github_classification: none

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| C668 | open | high | src-tauri/src/core/mcp/review.rs:393 | This operation writes new_secret_name to a log file. | - |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
