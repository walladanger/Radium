# cs-codeql-rust-cleartext-logging-tests-rs-670f68
status: OPEN
kind: code
source: code-scanning
severity: high
open_alerts: 1 of 1

## Facts (generated)
title: rust/cleartext-logging in src-tauri/plugins/tauri-plugin-hardware/src/vendor/tests.rs
tool: CodeQL
rule: rust/cleartext-logging
rule_name: rust/cleartext-logging
file: src-tauri/plugins/tauri-plugin-hardware/src/vendor/tests.rs
lines: 37
github_classification: library, test

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| C669 | open | high | src-tauri/plugins/tauri-plugin-hardware/src/vendor/tests.rs:37 | This operation writes gpu.uuid to a log file. | - |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
