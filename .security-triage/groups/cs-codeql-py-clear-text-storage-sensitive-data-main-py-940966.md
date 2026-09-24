# cs-codeql-py-clear-text-storage-sensitive-data-main-py-940966
status: OPEN
kind: code
source: code-scanning
severity: high
open_alerts: 1 of 1

## Facts (generated)
title: py/clear-text-storage-sensitive-data in scripts/concurrent-demo/demo/main.py
tool: CodeQL
rule: py/clear-text-storage-sensitive-data
rule_name: py/clear-text-storage-sensitive-data
file: scripts/concurrent-demo/demo/main.py
lines: 705
github_classification: none

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| C2 | open | high | scripts/concurrent-demo/demo/main.py:705 | This expression stores sensitive data (password) as clear text. | - |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
