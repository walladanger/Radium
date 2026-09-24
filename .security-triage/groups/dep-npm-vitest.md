# dep-npm-vitest
status: OPEN
kind: dependency
source: dependabot
severity: critical
open_alerts: 15 of 15

## Facts (generated)
title: vitest (npm)
package: vitest
ecosystem: npm
manifests: yarn.lock, web-app/package.json, extensions/yarn.lock, extensions/mlx-extension/package.json, extensions/llamacpp-upstream-extension/package.json, extensions/llamacpp-extension/package.json, extensions/download-extension/package.json, extensions/assistant-extension/package.json, core/package.json
scopes: runtime/inconclusive, development/direct
vulnerable_ranges: >= 2.1.0, < 4.1.11 ; < 3.2.6
patched_versions: 4.1.11, 3.2.6

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| D76 | open | critical | extensions/yarn.lock (runtime, inconclusive) | GHSA-5xrq-8626-4rwp When Vitest UI server is listening, arbitrary file can be read and executed [vulnerable... | 3.2.6 |
| D36 | open | critical | extensions/mlx-extension/package.json (development, direct) | GHSA-5xrq-8626-4rwp When Vitest UI server is listening, arbitrary file can be read and executed [vulnerable... | 3.2.6 |
| D34 | open | critical | extensions/llamacpp-upstream-extension/package.json (development, direct) | GHSA-5xrq-8626-4rwp When Vitest UI server is listening, arbitrary file can be read and executed [vulnerable... | 3.2.6 |
| D32 | open | critical | extensions/llamacpp-extension/package.json (development, direct) | GHSA-5xrq-8626-4rwp When Vitest UI server is listening, arbitrary file can be read and executed [vulnerable... | 3.2.6 |
| D30 | open | critical | extensions/download-extension/package.json (development, direct) | GHSA-5xrq-8626-4rwp When Vitest UI server is listening, arbitrary file can be read and executed [vulnerable... | 3.2.6 |
| D28 | open | critical | extensions/assistant-extension/package.json (development, direct) | GHSA-5xrq-8626-4rwp When Vitest UI server is listening, arbitrary file can be read and executed [vulnerable... | 3.2.6 |
| D337 | open | medium | yarn.lock (runtime, inconclusive) | GHSA-82fw-gwwq-j7x9 Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock [vulnerab... | 4.1.11 |
| D104 | open | medium | extensions/yarn.lock (runtime, inconclusive) | GHSA-82fw-gwwq-j7x9 Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock [vulnerab... | 4.1.11 |
| D162 | open | medium | web-app/package.json (development, direct) | GHSA-82fw-gwwq-j7x9 Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock [vulnerab... | 4.1.11 |
| D37 | open | medium | extensions/mlx-extension/package.json (development, direct) | GHSA-82fw-gwwq-j7x9 Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock [vulnerab... | 4.1.11 |
| D35 | open | medium | extensions/llamacpp-upstream-extension/package.json (development, direct) | GHSA-82fw-gwwq-j7x9 Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock [vulnerab... | 4.1.11 |
| D33 | open | medium | extensions/llamacpp-extension/package.json (development, direct) | GHSA-82fw-gwwq-j7x9 Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock [vulnerab... | 4.1.11 |
| D31 | open | medium | extensions/download-extension/package.json (development, direct) | GHSA-82fw-gwwq-j7x9 Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock [vulnerab... | 4.1.11 |
| D29 | open | medium | extensions/assistant-extension/package.json (development, direct) | GHSA-82fw-gwwq-j7x9 Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock [vulnerab... | 4.1.11 |
| D3 | open | medium | core/package.json (development, direct) | GHSA-82fw-gwwq-j7x9 Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock [vulnerab... | 4.1.11 |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
