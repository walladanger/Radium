---
date: 2026-10-16
title: "Recover security triage with explicit local state"
---

# 2026-10-16 — Recover security triage with explicit local state

- **Context:** Branch audit found a useful unmerged alert-grouping and attempt-log
  utility alongside stale reports, dependency changes and automatic Git commits.
- **Decision:** Recover grouping and local attempt histories as a dependency-free
  script under `scripts/`, requiring an explicit state directory outside the
  checkout. Network access is limited to GitHub alert GET requests. Never invoke
  Git, generate executable dismissal scripts or mutate remote alerts.
- **Consequences:** Investigations can be resumed offline without checking private
  reports into the repository. Callers manage a private state directory bound to
  a repository/ref; exclusive locks and optimistic revision checks prevent lost
  updates. Local verification status remains distinct from remote closure;
  absent alerts are retained rather than inferred resolved. Symlinked directories
  and linked state files are rejected; this is a local CLI, not a security boundary
  against another process concurrently modifying its output directory.
- **Owner:** team.
- **Links:** [Usage](../security-triage.md),
  [source](../../scripts/security-triage.mjs), original commit
  `17b7bcc642e1c33c4f946ff482f7caf48e0e43a7`.
