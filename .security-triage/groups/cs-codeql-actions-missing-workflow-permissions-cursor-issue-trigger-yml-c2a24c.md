# cs-codeql-actions-missing-workflow-permissions-cursor-issue-trigger-yml-c2a24c
status: OPEN
kind: code
source: code-scanning
severity: medium
open_alerts: 1 of 1

## Facts (generated)
title: actions/missing-workflow-permissions in .github/workflows/cursor-issue-trigger.yml
tool: CodeQL
rule: actions/missing-workflow-permissions
rule_name: actions/missing-workflow-permissions
file: .github/workflows/cursor-issue-trigger.yml
lines: 9
github_classification: none

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| C1 | open | medium | .github/workflows/cursor-issue-trigger.yml:9 | Actions job or workflow does not limit the permissions of the GITHUB_TOKEN. Consider setting an explicit pe... | - |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
