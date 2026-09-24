# cs-codeql-js-polynomial-redos-reasoning-ts-4cecd1
status: OPEN
kind: code
source: code-scanning
severity: high
open_alerts: 1 of 1

## Facts (generated)
title: js/polynomial-redos in core/src/browser/models/reasoning.ts
tool: CodeQL
rule: js/polynomial-redos
rule_name: js/polynomial-redos
file: core/src/browser/models/reasoning.ts
lines: 93
github_classification: none

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| C3 | open | high | core/src/browser/models/reasoning.ts:93 | This regular expression that depends on library input may run slow on strings starting with 'reasoning_effo... | - |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
