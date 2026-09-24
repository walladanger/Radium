# dep-npm-js-yaml
status: OPEN
kind: dependency
source: dependabot
severity: high
open_alerts: 5 of 5

## Facts (generated)
title: js-yaml (npm)
package: js-yaml
ecosystem: npm
manifests: yarn.lock
scopes: runtime/transitive
vulnerable_ranges: >= 4.0.0, < 4.3.2 ; >= 4.0.0, < 4.3.1 ; >= 4.0.0, < 4.3.0 ; >= 4.0.0, <= 4.1.1 ; >= 4.0.0, < 4.1.1
patched_versions: 4.3.2, 4.3.1, 4.3.0, 4.2.0, 4.1.1

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| D338 | open | high | yarn.lock (runtime, transitive) | GHSA-2883-xcg3-v3hh js-yaml: maxTotalMergeKeys does not limit CPU use for empty merge sources [vulnerable >... | 4.3.2 |
| D313 | open | high | yarn.lock (runtime, transitive) | GHSA-5p4m-2wfm-xmqj JS-YAML: Quadratic CPU consumption in !!omap resolution (3.x and 4.x) — CVE-2026-59870 ... | 4.3.1 |
| D286 | open | high | yarn.lock (runtime, transitive) | GHSA-52cp-r559-cp3m js-yaml: YAML merge-key chains can force quadratic CPU consumption [vulnerable >= 4.0.0... | 4.3.0 |
| D279 | open | medium | yarn.lock (runtime, transitive) | GHSA-h67p-54hq-rp68 JS-YAML: Quadratic-complexity DoS in merge key handling via repeated aliases [vulnerabl... | 4.2.0 |
| D180 | open | medium | yarn.lock (runtime, transitive) | GHSA-mh29-5h37-fv8m js-yaml has prototype pollution in merge (<<) [vulnerable >= 4.0.0, < 4.1.1] | 4.1.1 |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
