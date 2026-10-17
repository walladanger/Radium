---
date: 2026-10-16
title: Keep annotation screenshots with their production log entry
---

# Keep annotation screenshots with their production log entry

- **Context:** The owner uses annotations for requested edits and quick memory
  notes. A screenshot must remain beside the note at the point it was captured,
  and the owner needs to select a log folder outside application data.
- **Decision:** Add an Annotating view to Production, reached directly through
  the workspace header's edit icon. Native folder selection persists the chosen
  folder in application data; General settings exposes the same picker. New logs
  default to `logs/Radium Production log` under the existing application data
  folder. The owner's requested destination is
  `D:/DEBUGGING LOGS/Radium Production log`, selected per installation rather
  than embedded as a default for all users.
- **Storage:** Each UUID entry directory contains `entry.json`, `Annotating.md`
  and an optional `screenshot.png`. A temporary sibling directory is renamed
  only after every entry file has been written. Interrupted pending entries are
  not listed. Changing folders leaves existing entries where they were saved;
  saves reject a stale folder preference. Native commands accept no arbitrary
  image filenames and reject linked entry directories/files.
- **Capture:** A user action opens the platform display picker where supported.
  One decoded frame is frozen and all stream tracks stop immediately. PNG paste
  and attachment remain available when the embedded browser cannot capture a
  display. Captured timestamps remain separate from save timestamps; an attached
  file does not acquire an invented original capture time. Files are bounded at
  20 MB and decoded with allocation/dimension limits. On-screen notes are plain
  text; screenshots are never sent to a model or remote service by this feature.
- **Consequences:** Notes and screenshots can be read independently of Radium.
  Failed saves preserve the draft. Latest entries load previews lazily and full
  screenshots load on request. Directory reads and image decoding run outside
  the UI thread. This is an integrated feature; a separate GitHub repository is
  deferred until there is a useful standalone product, as requested by the owner.
- **Validation:** Native persistence, selected-folder reload, stale-folder,
  interrupted-save and linked-directory tests; capture stream cleanup and UI
  save/failure regression tests.
- **Owner:** team.
