---
date: 2026-10-16
title: "Float annotations and report live generation metrics"
---

# 2026-10-16 — Float annotations and report live generation metrics

- **Context:** The owner requested an expandable black glass annotation panel, an independently expandable note area, live composer clocks, historical message dates and visible generation metrics throughout streaming. Context detail should open beside the composer where space permits, without a free-space row.
- **Decision:** Float Annotating above the workspace with a translucent black background and backdrop blur. Preserve its mounted draft while closing or switching panels; support panel and note expansion, mouse/keyboard width resizing and Escape dismissal. Isolate second-resolution clocks from draft state; saved messages keep their original timestamp and show dates on earlier days. Show adjacent output speed/count while streaming, plus an observed peak. Text-derived live metrics carry an approximation mark until provider usage arrives. Never animate invented increases in speed.
- **Consequences:** Both chat and native agent requests publish numeric prompt-composition snapshots. Agent telemetry is an additive event carrying category counts and capacity, never prompt text, paths or credentials. Counts use the existing heuristic and are labelled estimates; missing memory, server-instruction, compaction-buffer and deferred-tool metrics remain explicitly unreported rather than zero. Context detail describes the last request and its completion; drafts do not silently rewrite that snapshot. The pop-up prefers the right and moves above the composer when that side lacks room. Providers with a snapshot but no context setting can show usage without an editable context slider. No runtime dependencies or new configuration are added.
- **Owner:** team.
- **Links:** [Screenshot-linked annotations](2026-10-16-keep-annotation-screenshots-with-their-production-log-entry.md), [PR 137](https://github.com/walladanger/Radium/pull/137).
