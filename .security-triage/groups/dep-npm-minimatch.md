# dep-npm-minimatch
status: OPEN
kind: dependency
source: dependabot
severity: high
open_alerts: 17 of 17

## Facts (generated)
title: minimatch (npm)
package: minimatch
ecosystem: npm
manifests: yarn.lock, extensions/yarn.lock
scopes: development/transitive, runtime/transitive
vulnerable_ranges: < 3.1.3 ; >= 5.0.0, < 5.1.8 ; >= 9.0.0, < 9.0.7 ; >= 10.0.0, < 10.2.3 ; >= 5.0.0, < 5.1.7 ; >= 10.0.0, < 10.2.1 ; < 3.1.4 ; >= 9.0.0, < 9.0.6
patched_versions: 3.1.3, 5.1.8, 9.0.7, 10.2.3, 5.1.7, 10.2.1, 3.1.4, 9.0.6

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| D216 | open | high | yarn.lock (runtime, transitive) | GHSA-7r86-cg39-jmmj minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GL... | 5.1.8 |
| D214 | open | high | yarn.lock (runtime, transitive) | GHSA-7r86-cg39-jmmj minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GL... | 10.2.3 |
| D212 | open | high | yarn.lock (runtime, transitive) | GHSA-23c5-xmqv-rm74 minimatch ReDoS: nested *() extglobs generate catastrophically backtracking regular exp... | 5.1.8 |
| D210 | open | high | yarn.lock (runtime, transitive) | GHSA-23c5-xmqv-rm74 minimatch ReDoS: nested *() extglobs generate catastrophically backtracking regular exp... | 10.2.3 |
| D206 | open | high | yarn.lock (runtime, transitive) | GHSA-3ppc-4f35-3m26 minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern [vuln... | 5.1.7 |
| D204 | open | high | yarn.lock (runtime, transitive) | GHSA-3ppc-4f35-3m26 minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern [vuln... | 10.2.1 |
| D59 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-7r86-cg39-jmmj minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GL... | 3.1.3 |
| D58 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-7r86-cg39-jmmj minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GL... | 9.0.7 |
| D57 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-7r86-cg39-jmmj minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GL... | 10.2.3 |
| D56 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-23c5-xmqv-rm74 minimatch ReDoS: nested *() extglobs generate catastrophically backtracking regular exp... | 3.1.4 |
| D55 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-23c5-xmqv-rm74 minimatch ReDoS: nested *() extglobs generate catastrophically backtracking regular exp... | 9.0.7 |
| D54 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-23c5-xmqv-rm74 minimatch ReDoS: nested *() extglobs generate catastrophically backtracking regular exp... | 10.2.3 |
| D52 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-3ppc-4f35-3m26 minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern [vuln... | 3.1.3 |
| D51 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-3ppc-4f35-3m26 minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern [vuln... | 9.0.6 |
| D50 | open | high | extensions/yarn.lock (runtime, transitive) | GHSA-3ppc-4f35-3m26 minimatch has a ReDoS via repeated wildcards with non-matching literal in pattern [vuln... | 10.2.1 |
| D217 | open | high | yarn.lock (development, transitive) | GHSA-7r86-cg39-jmmj minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GL... | 3.1.3 |
| D215 | open | high | yarn.lock (development, transitive) | GHSA-7r86-cg39-jmmj minimatch has ReDoS: matchOne() combinatorial backtracking via multiple non-adjacent GL... | 9.0.7 |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
