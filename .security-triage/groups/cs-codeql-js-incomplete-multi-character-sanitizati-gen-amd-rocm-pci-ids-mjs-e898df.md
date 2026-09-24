# cs-codeql-js-incomplete-multi-character-sanitizati-gen-amd-rocm-pci-ids-mjs-e898df
status: OPEN
kind: code
source: code-scanning
severity: high
open_alerts: 1 of 1

## Facts (generated)
title: js/incomplete-multi-character-sanitization in scripts/gen-amd-rocm-pci-ids.mjs
tool: CodeQL
rule: js/incomplete-multi-character-sanitization
rule_name: js/incomplete-multi-character-sanitization
file: scripts/gen-amd-rocm-pci-ids.mjs
lines: 190
github_classification: none

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| C4 | open | high | scripts/gen-amd-rocm-pci-ids.mjs:190 | This string may still contain <script, which may cause an HTML element injection vulnerability. | - |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
