---
date: 2026-10-03
title: "Own coordinated tasks in a local controller"
---

# 2026-10-03 — Own coordinated tasks in a local controller

- **Context:** Conversation state cannot safely represent durable multi-worker claims, dependencies, recovery or integration acceptance. DeepSeek already has native task semantics, and Radium has desktop-specific execution services.
- **Decision:** Add an independently buildable `src-tauri/atomic-control` Rust service using Tokio, Axum, rusqlite and Serde. Coordinated clients use its versioned authenticated loopback API as the sole task authority. Native chat remains independent. Extract headless execution behind explicit capability interfaces in a later milestone; the controller scaffold does not claim that extraction is complete.
- **Consequences:** SQLite transactions must commit state and events together. Idempotency, revision checks, AND dependencies and fencing protect concurrent transitions. Interrupted side effects remain unknown until reconciled. Worker success cannot replace trusted artifact verification. Worktrees require enforced container isolation before coding execution. Cloud remains disabled until bounded grants exist. Production storage belongs on WSL Linux storage outside synced folders; this source checkout is not the production data directory.
- **Owner:** team.
- **Links:** `src-tauri/atomic-control/`; accepted shared local agent workspace plan; root workspace `PROJECT-IMPLEMENTATION.md` and `control-api-v1.md` record acceptance gates and evolving contract. Installation, migration, runtime reconciliation, UI adapters, sandbox and release evidence are pending.
