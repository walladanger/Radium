---
date: 2026-10-16
title: "Disable unsafe temp cleanup and align startup flags"
---

# 2026-10-16 — Disable unsafe temp cleanup and align startup flags

- **Context:** The computer-care cleanup tool recursively checked and deleted paths in `std::env::temp_dir()`. A directory could become a link between those operations, and Linux may use a shared `/tmp`. Approval described a user-only scope that was not enforced. GNOME startup entries also remained disabled after enabling when their GNOME flag was false.
- **Decision:** Keep `sys.clean_temp` in the existing tool API and approval flow, but return a recoverable error explaining that nothing was deleted and directing the user to operating-system Storage settings. Remove its recursive deletion implementation. Describe its unavailable state in prompts, approval previews, and the specialist template. Toggle existing `X-GNOME-Autostart-enabled` alongside `Hidden` when changing Linux startup settings.
- **Consequences:** Diagnosis, startup changes, and approved Recycle Bin operations remain available. Automatic temp cleanup is unavailable until Radium has a verified cleanup scope and race-resistant implementation. `remove_dir_all` protects against link races on supported desktop platforms, but deleting whole subtrees cannot preserve the prior per-file age promise and does not establish ownership of a shared temp directory. No dependencies are added. Regression tests check refusal without deletion, honest preview, GNOME enable/disable behavior, and the selected tool-pack switches.
- **Owner:** team.
- **Links:** [Computer-care tools](2026-10-16-give-the-agent-computer-care-tools-behind-the-computer-tool-pack.md), [Rust remove_dir_all platform safety](https://doc.rust-lang.org/std/fs/fn.remove_dir_all.html#time-of-check-to-time-of-use-toctou-race-conditions), [PR 139](https://github.com/walladanger/Radium/pull/139).

Supersedes the automatic temporary-file cleanup behavior of the computer-care tools decision; other tool behavior remains unchanged.
