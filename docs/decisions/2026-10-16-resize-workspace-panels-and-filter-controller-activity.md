---
date: 2026-10-16
title: "Resize workspace panels and filter controller activity"
---

# 2026-10-16 — Resize workspace panels and filter controller activity

- **Context:** Agents and Production had a preset width, no expand/restore control, and lost local panel state when switched or closed. The HTTP snapshot serialized private executor attempt fields and tool journals. Worker stages had grown beyond the frontend's allowlist.
- **Decision:** Keep the routed chat and both panel views mounted. Hide inactive views and stop the Agents elapsed timer while hidden. Persist only the preferred panel width in localStorage, tolerate unavailable storage, and clamp the visible width to the measured content container while reserving a chat column. Support pointer capture, keyboard arrows/Home/End, responsive stacking, and expand/restore without overwriting the preferred width.
- **Decision:** Project explicit attempt and tool display fields at the HTTP boundary. Project SSE envelopes and identity/progress payload fields instead of raw commands. Keep durable store snapshots and journals private to trusted executors. The tool inspector displays only recorded status, times, exit code and approval metadata; raw arguments, stdout/stderr, reasoning, authority tokens and execution paths are excluded. Missing output/diffs/summaries remain explicitly unavailable. Reuse one stage allowlist for Agents and AG-UI.
- **Decision:** Add a selectable SVG branch-planning view derived from canonical task prerequisites. Label branches and joins as proposals, with no chosen repository base. Selecting a branch opens its existing versioned step editor. No repository branch, commit, merge or integration authority is created by the diagram. Editable branch metadata and verified Git history still require controller support. An active or uncertain attempt disables step editing in the frontend as well as the controller.
- **Consequences:** Local drafts survive panel switching and closing within the mounted application. They are not persisted to disk and changing the selected step still replaces that editor. The native chat stays mounted throughout. Resizing adds no controller or model calls. No new runtime dependencies or top-level configuration files. Integration and live dispatch remain separate work.
- **Owner:** team.
- **Links:** [Panel architecture](2026-10-04-open-agent-and-production-panels-beside-chat.md), [workspace shell](../../web-app/src/containers/WorkspacePanel.tsx), [HTTP projection](../../src-tauri/atomic-control/src/http.rs).
