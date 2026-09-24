# dep-npm-tar
status: OPEN
kind: dependency
source: dependabot
severity: critical
open_alerts: 24 of 24

## Facts (generated)
title: tar (npm)
package: tar
ecosystem: npm
manifests: yarn.lock, extensions/yarn.lock
scopes: runtime/transitive
vulnerable_ranges: <= 7.5.20 ; <= 7.5.17 ; <= 7.5.18 ; <= 7.5.16 ; <= 7.5.15 ; <= 7.5.10 ; <= 7.5.9 ; < 7.5.8 ; < 7.5.7 ; <= 7.5.3 ; <= 7.5.2
patched_versions: 7.5.21, 7.5.18, 7.5.19, 7.5.17, 7.5.16, 7.5.11, 7.5.10, 7.5.8, 7.5.7, 7.5.4, 7.5.3

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| D290 | open | critical | yarn.lock (runtime, transitive) | GHSA-23hp-3jrh-7fpw node-tar: Decompression/parse DoS via unlimited input [vulnerable <= 7.5.18] | 7.5.19 |
| D87 | open | critical | extensions/yarn.lock (runtime, transitive) | GHSA-23hp-3jrh-7fpw node-tar: Decompression/parse DoS via unlimited input [vulnerable <= 7.5.18] | 7.5.19 |
| D298 | open | high | yarn.lock (runtime, transitive) | GHSA-r292-9mhp-454m node-tar: Uncontrolled recursion in mapHas/filesFilter allows uncatchable stack-overflo... | 7.5.21 |
| D289 | open | high | yarn.lock (runtime, transitive) | GHSA-8x88-c5mf-7j5w node-tar: Negative tar entry size causes infinite loop in archive replace [vulnerable <... | 7.5.18 |
| D221 | open | high | yarn.lock (runtime, transitive) | GHSA-9ppj-qmqm-q256 node-tar Symlink Path Traversal via Drive-Relative Linkpath [vulnerable <= 7.5.10] | 7.5.11 |
| D220 | open | high | yarn.lock (runtime, transitive) | GHSA-qffp-2rhf-9h96 tar has Hardlink Path Traversal via Drive-Relative Linkpath [vulnerable <= 7.5.9] | 7.5.10 |
| D199 | open | high | yarn.lock (runtime, transitive) | GHSA-83g3-92jg-28cx Arbitrary File Read/Write via Hardlink Target Escape Through Symlink Chain in node-tar ... | 7.5.8 |
| D196 | open | high | yarn.lock (runtime, transitive) | GHSA-34x7-hfp2-rc4v node-tar Vulnerable to Arbitrary File Creation/Overwrite via Hardlink Path Traversal [v... | 7.5.7 |
| D190 | open | high | yarn.lock (runtime, transitive) | GHSA-r6q2-hw4h-h46w Race Condition in node-tar Path Reservations via Unicode Ligature Collisions on macOS A... | 7.5.4 |
| D189 | open | high | yarn.lock (runtime, transitive) | GHSA-8qq5-rm4j-mr97 node-tar is Vulnerable to Arbitrary File Overwrite and Symlink Poisoning via Insufficie... | 7.5.3 |
| D91 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-r292-9mhp-454m node-tar: Uncontrolled recursion in mapHas/filesFilter allows uncatchable stack-overflo... | 7.5.21 |
| D86 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-8x88-c5mf-7j5w node-tar: Negative tar entry size causes infinite loop in archive replace [vulnerable <... | 7.5.18 |
| D61 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-9ppj-qmqm-q256 node-tar Symlink Path Traversal via Drive-Relative Linkpath [vulnerable <= 7.5.10] | 7.5.11 |
| D60 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-qffp-2rhf-9h96 tar has Hardlink Path Traversal via Drive-Relative Linkpath [vulnerable <= 7.5.9] | 7.5.10 |
| D49 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-83g3-92jg-28cx Arbitrary File Read/Write via Hardlink Target Escape Through Symlink Chain in node-tar ... | 7.5.8 |
| D47 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-34x7-hfp2-rc4v node-tar Vulnerable to Arbitrary File Creation/Overwrite via Hardlink Path Traversal [v... | 7.5.7 |
| D46 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-r6q2-hw4h-h46w Race Condition in node-tar Path Reservations via Unicode Ligature Collisions on macOS A... | 7.5.4 |
| D45 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-8qq5-rm4j-mr97 node-tar is Vulnerable to Arbitrary File Overwrite and Symlink Poisoning via Insufficie... | 7.5.3 |
| D291 | open | medium | yarn.lock (runtime, transitive) | GHSA-w8wr-v893-vjvp node-tar: Process crash via PAX numeric path type confusion [vulnerable <= 7.5.17] | 7.5.18 |
| D288 | open | medium | yarn.lock (runtime, transitive) | GHSA-gvwx-54wh-qm9j node-tar: Uncaught Exception DoS via NUL byte in PAX path/linkpath records [vulnerable ... | 7.5.17 |
| D268 | open | medium | yarn.lock (runtime, transitive) | GHSA-vmf3-w455-68vh node-tar applies PAX size override to intermediary GNU long-name/long-link headers, cau... | 7.5.16 |
| D88 | open | medium | extensions/yarn.lock (runtime, transitive) | GHSA-w8wr-v893-vjvp node-tar: Process crash via PAX numeric path type confusion [vulnerable <= 7.5.17] | 7.5.18 |
| D85 | open | medium | extensions/yarn.lock (runtime, transitive) | GHSA-gvwx-54wh-qm9j node-tar: Uncaught Exception DoS via NUL byte in PAX path/linkpath records [vulnerable ... | 7.5.17 |
| D81 | open | medium | extensions/yarn.lock (runtime, transitive) | GHSA-vmf3-w455-68vh node-tar applies PAX size override to intermediary GNU long-name/long-link headers, cau... | 7.5.16 |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
