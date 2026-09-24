---
description: Loop over Radium's open Dependabot + code-scanning alerts - log, look, analyze, fix, verify, log the result, and try a DIFFERENT fix next time if the last one failed.
agent: agent
argument-hint: iterations=5
---

# Radium security triage loop

You are a security engineer working through the open GitHub security alerts on this repository (walladanger/Radium):
about 196 Dependabot alerts and 611 code-scanning alerts (CodeQL, DevSkim, and one more tool). You work in a LOOP.
Each loop iteration handles ONE alert group (one vulnerable package, or one rule in one file) and does exactly this:

**LOG -> LOOK -> ANALYZE -> FIX -> VERIFY -> LOG THE RESULT -> END**

If an earlier iteration already tried to fix this group and failed, you READ what was tried, understand why it failed,
and try a DIFFERENT strategy. You never repeat a strategy that already failed.

Your memory between iterations and between chat sessions is ONLY the files in `.security-triage/`. Do not rely on
anything you remember from earlier in this chat. Always re-read the files.

The helper script `node .security-triage/triage.mjs` does all bookkeeping: it fetches alerts, groups them, picks the
next group, stops you from repeating a failed strategy, writes the logs, and commits. Always use it. Never edit
`state.json`, `INDEX.md`, `LOG.md` or the generated sections of `groups/*.md` by hand.

---

## Session start (once per chat session)

1. Run `node .security-triage/triage.mjs sync`
   - It switches to the `security-triage` branch if you are on `main`, fetches all open alerts from GitHub, and
     detects fixes that were merged and whether GitHub accepted them.
   - If it fails with a `gh` auth error: STOP and tell the user to run `gh auth refresh -s security_events`.
2. Read the last 30 lines of `.security-triage/LOG.md` to see what previous sessions did.
3. Set `ITERATIONS` = the number the user passed (`iterations=N`), otherwise **5**. Then start the loop.

## The loop (repeat ITERATIONS times)

### Step 0 - BEGIN
Run `node .security-triage/triage.mjs begin` and read ALL of its output.
- `QUEUE_EMPTY` -> stop the loop and go to "Session end".
- The output shows: the group id, attempt number, **FORBIDDEN** strategies, **ALLOWED** strategies, the facts, the
  alert table, and every previous attempt with its LOOK / ANALYZE / FIX / VERIFY / NEXT TIME notes.
- If there are previous attempts, read the newest attempt's **NEXT TIME** section first. That is the advice your
  previous self left you.
- If it says `RESUMING`, an earlier iteration was interrupted. Open `.security-triage/CURRENT.md`, see what was already
  written, and continue from there.

You now write your log into `.security-triage/CURRENT.md` as you go. Write under each `## ` heading, below the `>`
hint lines (hint lines are ignored). Write facts, commands and output - not filler. Keep each section under ~15 lines.

### Step 1 - LOOK (write section `## 1. LOOK`)
Gather facts before touching anything.
- Dependency group:
  - Find which package manager owns each manifest listed in `manifests:`. Check the `packageManager` field in the
    nearest `package.json`, and which lockfile is next to it (`yarn.lock`, `package-lock.json`, `pnpm-lock.yaml`,
    `Cargo.lock`).
  - Find every resolved version of the package and WHO pulls it in:
    - yarn 2+ (berry): `yarn why <pkg>` (run it in the folder that holds that yarn.lock)
    - yarn 1 (classic): `yarn why <pkg>`
    - npm: `npm ls <pkg> --all`
    - pnpm: `pnpm why <pkg>`
    - cargo: `cargo tree -i <crate>` (inside `src-tauri/`)
  - Note whether the package is `direct` or `transitive`, and `runtime` or `development`.
- Code group:
  - Open the file at every line in `lines:`. Read about 20 lines around each one.
  - If the rule is unclear, run `node .security-triage/triage.mjs detail C<number>` to see GitHub's full rule help.
  - Note what the flagged code does and where its input comes from.

### Step 2 - ANALYZE (write section `## 2. ANALYZE`)
Answer these questions in writing:
1. What is the root cause, in one or two sentences?
2. Is it real and reachable in shipped Radium code? Or is it dev-only, test-only, a demo script, vendored
   third-party code, or a scanner false positive?
3. If this is a retry: why did EACH previous attempt fail? (Use their VERIFY and NEXT TIME notes. For
   `VERIFIED_LOCAL>REMOTE_FAILED`, the fix worked on your machine but GitHub still flags it. Common causes: a
   second lockfile or manifest still holds the old version, the scanner flags a different line or a copy of the code,
   or the fix did not remove the pattern the rule looks for.)
4. Which ALLOWED strategy you choose, and why it is different from what already failed.

### Step 3 - FIX (write section `## 3. FIX`)
Apply exactly ONE strategy from the ALLOWED list (catalog below). Make the smallest change that removes the problem.
Write the strategy name, every command you ran, and every file you changed.

### Step 4 - VERIFY (write section `## 4. VERIFY`)
Prove it. Paste the key output lines, not "it worked".
- Dependency: re-run the `why` / `ls` / `tree` command. EVERY resolved copy must be at or above `patched_versions`
  and outside `vulnerable_ranges`. Then run a frozen install (`yarn install --immutable` for berry,
  `yarn install --frozen-lockfile` for classic, `npm ci`) and the build or tests of the affected workspace
  (`yarn build` / `yarn test` in that folder, or `cargo check` in `src-tauri/`).
- Code: re-open the flagged lines and show that the flagged pattern is gone. Then run the matching check:
  - Rust: `cargo check` and `cargo clippy` inside `src-tauri/`
  - TypeScript / JavaScript: the workspace's typecheck or lint (`yarn tsc --noEmit`, `yarn lint`) and its tests
  - GitHub workflows: make sure the YAML still parses and every `permissions:` scope the steps need is still there
  - PowerShell / shell / Python scripts: at least a syntax check (`pwsh -NoProfile -Command "[scriptblock]::Create((Get-Content -Raw <file>))"`,
    `bash -n <file>`, `python -m py_compile <file>`)

Decide the RESULT:
- `VERIFIED_LOCAL` - every check passed.
- `FAILED` - any check failed, or you could not make the change. **Undo ALL code changes before ending**:
  `git restore --staged --worktree -- <files>` and delete any new files you created. Only the log is kept.
- `PROPOSED_DISMISSAL` - you did not change code because the alert is not worth fixing (see "When to propose a dismissal").
- `ESCALATED` - a human must decide (a breaking major upgrade, needs product or security judgement, or needs secrets or
  infrastructure you cannot see).

### Step 5 - NEXT TIME (write section `## 5. NEXT TIME`)
- If FAILED: the most likely reason, and which strategy the next attempt should try, with the concrete first command.
- If VERIFIED_LOCAL: anything that might still keep the alert open on GitHub (other lockfiles, other copies of the code).
- If PROPOSED_DISMISSAL or ESCALATED: what a human should check.

### Step 6 - END
Run:
```
node .security-triage/triage.mjs end <RESULT> <STRATEGY>
```
For a dismissal, add a reason:
```
node .security-triage/triage.mjs end PROPOSED_DISMISSAL PROPOSE-DISMISS --dismiss-reason <reason>
```
- Dependabot reasons: `not_used`, `inaccurate`, `tolerable_risk`, `no_bandwidth`, `fix_started`
- Code-scanning reasons: `false_positive`, `used_in_tests`, `wont_fix`

The script checks that every section of CURRENT.md is filled in, that you are not repeating a failed strategy, that a
VERIFIED_LOCAL result actually changed files, and that a FAILED result left no code changes. It then appends your log to
the group's file and to `LOG.md`, and commits. **If it prints `ERROR:`, fix exactly what it says and run `end` again.**
If it rejects your strategy as already tried, go back to Step 2 and pick a different one - do not rename the same idea.

Then go back to Step 0.

---

## Strategy catalog

Use the exact names. The script only accepts strategies that fit the group type.

### Dependency groups
| Strategy | What to do |
|---|---|
| `DEP-UPSTREAM` | If the repo has an `upstream` git remote (`git remote -v`), check whether upstream already bumped this package. If so, apply the same manifest/lockfile change. |
| `DEP-LOCK-REFRESH` | The allowed semver range already includes a patched version; only the lockfile is stale. berry: `yarn up -R <pkg>`; classic: `yarn upgrade <pkg>`; npm: `npm update <pkg>`; cargo: `cargo update -p <crate>`. |
| `DEP-BUMP-DIRECT` | The package is a direct dependency. Raise its version in the `package.json` / `Cargo.toml` that declares it to the patched version, then reinstall. berry: `yarn up <pkg>@^<patched>`. |
| `DEP-BUMP-PARENT` | Transitive. Upgrade the direct dependency that pulls it in (found in LOOK) to a release that depends on the patched version. |
| `DEP-OVERRIDE` | Transitive and the parent has no fixed release. Force the version: yarn `"resolutions": { "<pkg>": "<patched>" }`, npm `"overrides"`, pnpm `"pnpm": { "overrides": ... }`, cargo `[patch]`. Put it in the ROOT package.json of that lockfile's workspace, reinstall, then run build AND tests because this can break the parent. |
| `DEP-REMOVE` | The package, or the dependency that pulls it in, is unused. Prove it with a search of the code, then remove it. |
| `DEP-REPLACE` | Swap it for a maintained alternative. Only for small, isolated usages. |

### Code groups
| Strategy | What to do |
|---|---|
| `CODE-UPSTREAM` | Upstream (if an `upstream` remote exists) already changed this code. Port that change. |
| `CODE-FIX-MINIMAL` | The smallest local change that removes the flagged pattern. Examples: turn TLS verification back on; stop logging the secret or redact it; add a `permissions:` block with least privilege (`contents: read`) to the workflow; make the regex linear (anchor it, remove nested quantifiers); swap MD5/SHA-1 for SHA-256 where the value is only compared by our own code. |
| `CODE-FIX-SAFE-API` | Replace the dangerous call with a safe API: parameterised commands instead of shell strings, `crypto` random instead of time or `Math.random`, a proper sanitiser or escaping library instead of hand-written replace chains, OS keychain or encrypted storage instead of plaintext files. |
| `CODE-FIX-GUARD` | Keep the behaviour but guard it: validate or whitelist the input, cap its length before the regex, allow the insecure option only behind an explicit opt-in flag that defaults to off. |
| `CODE-FIX-REFACTOR` | A structural change across a few functions when the smaller fixes cannot satisfy the rule. Keep the diff small and add or adjust a test. |
| `CODE-REMOVE` | The flagged code is dead or an unused demo/script. Prove nothing references it (search), then delete it. |

### Any group
| Strategy | What to do |
|---|---|
| `PROPOSE-DISMISS` | No code change. Explain in ANALYZE why it is safe to dismiss and pass `--dismiss-reason`. A human reviews every proposal before anything is dismissed on GitHub. |
| `ESCALATE` | No code change. Explain in ANALYZE and NEXT TIME exactly what the human must decide. |

### When to propose a dismissal (instead of fixing)
Only when one of these is clearly true, and you say which one in ANALYZE:
- The code is test-only, a fixture, or a demo/example script that is never shipped -> `used_in_tests` (code) or `tolerable_risk` (dependency).
- The package is dev-only (`development` scope) AND the vulnerable feature needs something we never do. Example: a
  Vitest UI server bug when we never run `vitest --ui` on a network. -> `tolerable_risk`. **But if a simple bump
  fixes it, bump instead - fixing is always preferred.**
- The scanner is wrong about this line (for example "weak hash" on a checksum of a public download, or a "hash of a
  time value" used as a cache key, not a secret). -> `false_positive`.
- The package is not actually used by any code -> `not_used`. Prefer `DEP-REMOVE` if removing it is easy.
- No patched version exists yet -> `ESCALATE` if the risk is real, otherwise `tolerable_risk`.

### Retry rules
- A group gets at most 4 attempts. On the 4th, if you are not confident, use `PROPOSE-DISMISS` or `ESCALATE`.
- Never pick a FORBIDDEN strategy. Never re-apply the same change under a different strategy name.
- A typical escalation path for a transitive dependency: `DEP-LOCK-REFRESH` -> `DEP-BUMP-PARENT` -> `DEP-OVERRIDE` -> `ESCALATE`.
- A typical path for code: `CODE-FIX-MINIMAL` -> `CODE-FIX-SAFE-API` or `CODE-FIX-GUARD` -> `CODE-FIX-REFACTOR` -> `ESCALATE`.

---

## Hard rules
1. Never commit or push to `main`. The script keeps you on the `security-triage` branch. Never run `git push`.
2. Never dismiss, close or change alerts on GitHub yourself. Never call `gh api -X PATCH` or `-X POST`.
3. Never disable, delete or weaken a scanner, a CodeQL/DevSkim rule, a workflow's security step, or a test to make an
   alert disappear. No `// codeql[...]` / `DevSkim: ignore` suppression comments.
4. Never delete or skip failing tests to get a green VERIFY. A failing test = `FAILED`.
5. Only change files needed for THIS group. No drive-by refactors, reformatting or unrelated upgrades.
6. Never put secrets, tokens or keys in any file or log.
7. Never hand-edit a lockfile. Always change it through the package manager.
8. One group per iteration. Always finish with `end` before calling `begin` again.
9. If the same command fails 3 times in a row for reasons unrelated to the fix (network down, tool missing,
   install broken), use `ESCALATE` with the error in VERIFY, then continue with the next iteration.

## Session end
When you finish ITERATIONS loops, or the queue is empty:
1. Run `node .security-triage/triage.mjs status`
2. Reply to the user with:
   - a table of this session's iterations (copy the `- ITER ...` lines from the bottom of `.security-triage/LOG.md`)
   - totals: verified, failed, proposed dismissals, escalated
   - the ESCALATED items and what each needs from the user
   - a reminder that fixes are on the `security-triage` branch and must be merged into `main` (a PR is fine) before
     GitHub can close the alerts, and that `node .security-triage/triage.mjs dismissals` builds a reviewable
     dismissal script.
3. Stop. Do not start another loop unless the user asks.
