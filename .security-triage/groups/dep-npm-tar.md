# dep-npm-tar
status: VERIFIED_LOCAL
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

### Attempt 1 | DEP-LOCK-REFRESH | VERIFIED_LOCAL | ITER 0001 | 2026-09-24T12:45:06Z
#### 1. LOOK
- 24 alerts, all `tar` (npm), transitive runtime, in `yarn.lock` (root) + `extensions/yarn.lock`.
- Both manifests are yarn 4 (berry): root `packageManager: yarn@4.5.3`, workspaces `core,web-app`; extensions `yarn@4.5.3`, workspaces `**`.
- Resolved tar versions (root yarn.lock): `^6.1.11/^6.2.1 -> 6.2.1`, `^7.4.3 -> 7.4.3`, `^7.5.22/^7.5.4 -> 7.5.22`.
- Resolved tar versions (extensions/yarn.lock): `^7.4.3 -> 7.4.3`.
- `corepack yarn why tar` (root): 7.4.3 pulled by cacache@19.0.1, node-gyp@11.4.2, pacote@22.0.0; 6.2.1 by cacache@18.0.4, node-gyp@10.3.1, pacote@18.0.6; 7.5.22 is a DIRECT dep of jan-app (root package.json).
- `corepack yarn why tar` (extensions): 7.4.3 pulled by cacache@19.0.1, node-gyp@11.0.0.
- npm latest tar = 7.5.22 (satisfies `^7.4.3`). Vulnerable range is 7.x `<= 7.5.20`; 6.2.1 is a different major (not in the 7.x advisory).

#### 2. ANALYZE
- Root cause: the lockfile resolved the transitive `tar@^7.4.3` (via cacache/node-gyp/pacote) to 7.4.3, which is inside the vulnerable 7.x range. The range `^7.4.3` already permits the patched 7.5.22; only the lockfile is stale.
- Reachability: tar is a build/install tooling dep (cacache, node-gyp, pacote) — dev/build-time, not shipped in the Radium runtime bundle. Still a real vulnerable copy in the lockfile, so it should be bumped.
- First attempt (no prior failures). Chosen strategy: DEP-LOCK-REFRESH — the allowed semver range already includes the patched version, so a lockfile refresh is the smallest correct change. This differs from DEP-OVERRIDE (which would force a version) because no manifest change is needed; the range is already wide enough.

#### 3. FIX
- Strategy: DEP-LOCK-REFRESH (range `^7.4.3` already permits patched 7.5.22; only the lockfile was stale).
- Commands:
  - `corepack prepare yarn@4.5.3 --activate` (corepack enable hit EPERM on Program Files; `corepack yarn` works).
  - `corepack yarn build:core` (prereq: extensions depend on `@janhq/core@file:../../core/package.tgz`, which must exist).
  - `corepack yarn up -R tar` (root) and `cd extensions && corepack yarn up -R tar`.
- Files changed: `yarn.lock` (tar `^7.4.3` 7.4.3 -> merged into 7.5.22; dropped now-unused `mkdirp@3.0.1`), `extensions/yarn.lock` (tar `^7.4.3` 7.4.3 -> 7.5.22; `@janhq/core` file-dep hash updated as a side effect of rebuilding core — core source unchanged).

#### 4. VERIFY
- Resolved tar after fix (root yarn.lock): `tar@^6.1.11,^6.2.1 -> 6.2.1` (6.x, outside the 7.x advisory); `tar@^7.4.3,^7.5.22,^7.5.4 -> 7.5.22` (patched, >= 7.5.21, outside `<= 7.5.20`).
- Resolved tar after fix (extensions/yarn.lock): `tar@^7.4.3 -> 7.5.22` (patched).
- `corepack yarn install --immutable` (root): exit 0, "Done with warnings" (pre-existing peer-dep warnings only).
- `corepack yarn install --immutable` (extensions): exit 0, "Done with warnings".
- `corepack yarn build:core`: succeeded (build tooling that consumes tar works).
- `cd core && corepack yarn test`: "Test Files 33 passed | 1 skipped (34); Tests 167 passed | 5 skipped (172)".
- RESULT: VERIFIED_LOCAL

#### 5. NEXT TIME
- VERIFIED_LOCAL. Things that could still keep the alert open on GitHub:
  - The fix is on the `security-triage` branch; GitHub only closes the alert once it is merged into `main` and a new scan runs.
  - The `@janhq/core` file-dep hash in `extensions/yarn.lock` changed (rebuild side effect). If a future build produces a different hash, the extensions lockfile may need re-syncing — but that does not affect the tar version.
  - tar@6.2.1 (6.x) remains in the root lockfile via cacache/node-gyp/pacote; it is outside the 7.x advisory, so it should not keep these alerts open, but watch for a separate 6.x advisory.

files_changed: extensions/yarn.lock, yarn.lock

## Refresh log
