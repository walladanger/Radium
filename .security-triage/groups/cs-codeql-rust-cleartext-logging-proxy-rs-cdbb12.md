# cs-codeql-rust-cleartext-logging-proxy-rs-cdbb12
status: OPEN
kind: code
source: code-scanning
severity: high
open_alerts: 1 of 1

## Facts (generated)
title: rust/cleartext-logging in src-tauri/src/core/server/proxy.rs
tool: CodeQL
rule: rust/cleartext-logging
rule_name: rust/cleartext-logging
file: src-tauri/src/core/server/proxy.rs
lines: 1994
github_classification: none

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| C670 | open | high | src-tauri/src/core/server/proxy.rs:1994 | This operation writes config.trusted_hosts to a log file. | - |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
