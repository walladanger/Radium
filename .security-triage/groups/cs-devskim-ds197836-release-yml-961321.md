# cs-devskim-ds197836-release-yml-961321
status: OPEN
kind: code
source: code-scanning
severity: error
open_alerts: 1 of 1

## Facts (generated)
title: DoNotTakeTheHashOfLowentropyContent in .github/workflows/release.yml
tool: devskim
rule: DS197836
rule_name: DoNotTakeTheHashOfLowentropyContent
file: .github/workflows/release.yml
lines: 647
github_classification: none

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| C509 | open | error | .github/workflows/release.yml:647 | Do not take the hash of low-entropy content. | - |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
