# CURRENT ITERATION - fill in every section, then run `end`
iter: 0003
group: dep-npm-vitest
attempt: 1 of 4
forbidden_strategies: none
allowed_strategies: DEP-UPSTREAM, DEP-LOCK-REFRESH, DEP-BUMP-DIRECT, DEP-BUMP-PARENT, DEP-OVERRIDE, DEP-REMOVE, DEP-REPLACE, PROPOSE-DISMISS, ESCALATE

## 1. LOOK
> What the alert(s) say, which files/lines/manifests you opened, what versions are actually resolved in the lockfile.

## 2. ANALYZE
> Root cause. Is it real and reachable (runtime vs dev/test/demo/vendored)? If this is a retry: why did each previous attempt fail? Which strategy you chose and why it is DIFFERENT.

## 3. FIX
> Strategy name, exact commands run, files changed (or "none" for PROPOSE-DISMISS / ESCALATE).

## 4. VERIFY
> Commands run to prove the fix and the key lines of their output. For dependencies: the resolved version after the fix. For code: the flagged line after the fix + build/lint/test result.

## 5. NEXT TIME
> If FAILED: the most likely reason and the concrete strategy the next attempt should try. If VERIFIED_LOCAL: anything that could still make GitHub keep the alert open.
