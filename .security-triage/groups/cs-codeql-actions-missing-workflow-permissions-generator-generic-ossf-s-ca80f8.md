# cs-codeql-actions-missing-workflow-permissions-generator-generic-ossf-s-ca80f8
status: OPEN
kind: code
source: code-scanning
severity: medium
open_alerts: 1 of 1

## Facts (generated)
title: actions/missing-workflow-permissions in .github/workflows/generator-generic-ossf-slsa3-publish.yml
tool: CodeQL
rule: actions/missing-workflow-permissions
rule_name: actions/missing-workflow-permissions
file: .github/workflows/generator-generic-ossf-slsa3-publish.yml
lines: 21
github_classification: none

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| C675 | open | medium | .github/workflows/generator-generic-ossf-slsa3-publish.yml:21 | Actions job or workflow does not limit the permissions of the GITHUB_TOKEN. Consider setting an explicit pe... | - |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
