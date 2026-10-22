---
date: 2026-10-18
title: "Preserve workspace pages under the annotation overlay"
---

# 2026-10-18 — Preserve workspace pages under the annotation overlay

- **Context:** Main now shows Agents and Production as scrolling full-page views. The annotation feature needs a floating glass panel with the conversation still visible underneath.
- **Decision:** Preserve the full-page layout for Agents and ordinary Production views. Only Annotating floats, expands and resizes. The routed chat remains mounted and visible beneath that overlay; opening the Production navigation entry returns to its normal page while retaining the mounted annotation draft.
- **Consequences:** Annotation and page navigation have distinct visibility rules. Existing full-page scrolling behavior stays intact, while keyboard dismissal, focus handling, clocks and generation metrics remain available for annotations and chat. Reconciliation also retains main's worker slot and skill pagination fixes and the already merged computer-care safety repair.
- **Owner:** team.
- **Links:** [Floating annotations and metrics](2026-10-16-float-annotations-and-report-live-generation-metrics.md), [PR 143](https://github.com/walladanger/Radium/pull/143), [PR 137](https://github.com/walladanger/Radium/pull/137).
