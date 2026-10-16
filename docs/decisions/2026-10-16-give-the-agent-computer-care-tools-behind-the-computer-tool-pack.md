---
date: 2026-10-16
title: 'Give the agent computer-care tools behind the computer tool pack'
---

# 2026-10-16 — Give the agent computer-care tools behind the computer tool pack

- **Context:** After the network specialist, users want the same help with the computer itself: low disk space, what is slowing it down, slow sign-in, pending updates, recent crashes. The agent could already run shell commands, but deleting files or changing startup programs through improvised commands is easy to get wrong and hard to judge from a raw command line. The network work had already set up tool packs, blast-radius approvals and a reviewer second opinion. All three were `net`-specific.
- **Decision:**
  - **Eleven `sys.*` tools** in `src-tauri/src/core/agent/tools/sys/`, in a new `computer` **tool pack**:
    - seven diagnose tools (`PureRead`): `sys.overview`, `sys.disk_usage`, `sys.large_items`, `sys.top_processes`, `sys.startup_items`, `sys.pending_updates`, `sys.recent_errors`;
    - four fix tools (`ApprovalGated`): `sys.clean_temp`, `sys.empty_recycle_bin`, `sys.disable_startup_item`, `sys.enable_startup_item`.
  - **Fixes stay narrow.**
    - `clean_temp` deletes only files in the user's temp folder older than `olderThanDays` (default 2, 1–365). It never follows symlinks or leaves that folder, and it skips files in use.
    - `empty_recycle_bin` is **high risk** and says it is permanent. The template only uses it with the user's clear agreement.
    - Startup changes use Task Manager's mechanism on Windows: the `Explorer\StartupApproved` flag, so the program and its entry are never removed and the change is undone by flipping the flag back. Machine-wide entries go through UAC. Linux uses per-user `.desktop` overrides with `Hidden=`. macOS startup items are listed but not changed.
    - Startup names must match a live `sys.startup_items` entry exactly.
    - Nothing installs updates or deletes the large items it finds. Those are left to the OS and the user.
  - **Shared approval pieces.** `BlastRadius` moved from `tools/net` to `tools/blast.rs`. `blast::for_call` dispatches to `net` or `sys`. The reviewer moved from `tools/net/review.rs` to `tools/review.rs`, and `review_for_approval` now checks `net.*` fixes against the network system map and `sys.*` fixes against `sys.overview`. Behaviour for network fixes is unchanged.
  - **Pack gating** works exactly like `network`: the tools are disabled in the prompt, grammar, schema and dispatch unless the turn's assistant (or a specialist) has `tool_packs: ["computer"]`.
  - **Web.**
    - The assistant editor gains a "Computer care tools" switch and a one-click "Computer care" specialist template.
    - The tools get chat labels.
    - Review-before-use gains four permissions: `inspectComputer` (reads), `cleanUpFiles` (changes), `changeStartup` (changes) and `emptyRecycleBin` (risky).
  - **No new dependencies.** It uses `sysinfo`, `winreg`, `dirs` and OS built-ins, which were already in use.
- **Consequences:**
  - **Windows verified.** Every diagnose tool was run live on Windows 11 by the ignored `tools/sys/live_tests.rs`. The fix tools are covered by unit tests on temp folders and fixtures. They were not run against the real machine.
  - **macOS and Linux not verified.** Their commands are fixture-tested only.
  - **Scan budget.** `sys.large_items` stops after a time budget and says its sizes are partial rather than hang on a huge home folder.
  - **Updates.** `sys.pending_updates` on Windows uses the Windows Update COM searcher. It can take a minute, and it reports an error when the service is unavailable.
  - **Signatures.** Diagnose functions now take only what they use (nothing, or a cancellation token) instead of a whole `ToolContext`.
  - **Append-only note.** The 2026-10-10 network ADR still names `tools/net/review.rs`. That file is now `tools/review.rs`.
- **Owner:** @walladanger.
- **Links:** `tools/sys/{mod,diagnose,fix,startup,live_tests}.rs`; `tools/{blast,review}.rs`; `web-app/src/lib/assistant-templates.ts`; `web-app/src/containers/dialogs/AddEditAssistant.tsx`; ADR 2026-10-10 (network tools); ADR 2026-10-10 (specialists).
