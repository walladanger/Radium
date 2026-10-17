---
date: 2026-10-09
title: 'Organize skills by creator and category, with nested folders'
---

# 2026-10-09 — Organize skills by creator and category, with nested folders

- **Context:** Radium ships about 400 skills (NVIDIA, Anthropic, the built-in
  Radium set) and users add their own. The skills folder was flat: only
  `agent-skills/<name>/SKILL.md` was read, so a skill kept in a sub-folder was
  silently ignored, and the Skills page was one long alphabetical list with no
  way to see who made a skill, what it is for or how big it is.
- **Decision:** Read skills from nested category folders and describe every
  skill with a creator, a category and tags.
  - _Disk layout._ Both the bundled set and the user's skills folder may nest
    `agent-skills/<category>/.../<skill>/SKILL.md` up to 3 category levels; the
    flat layout keeps working. A folder holding `SKILL.md` is a skill (its
    sub-folders are its resources and are never searched for more skills); a
    folder without one is a category folder. Names starting with `.`, plain
    files, symlinks and junctions are skipped. A skill's identity is still its `name`
    (the leaf folder); a second skill with the same name is listed as a
    duplicate error naming both paths and is never loaded. Seeding keeps each
    bundled skill at its relative path, updates a bundled skill in place where
    the user moved it, never touches a category folder that shares a bundled
    name, and never moves the user's files.
  - _Metadata._ Only keys the Agent Skills spec already allows are read:
    `metadata.creator` (else `metadata.author`, else top-level `author`/`owner`),
    `metadata.category`, and `metadata.tags` plus top-level `tags` (a list or a
    comma-separated string). These never fail a skill. Creators are normalised
    (`nvidia` → `NVIDIA`, `anthropic` → `Anthropic`, `x.ai`/`grok` → `xAI`).
  - _Fallbacks._ Creator: catalog (bundled skills only) → frontmatter →
    `Unknown` for bundled, `User` for the user's own. Category: catalog →
    `metadata.category` → the first category folder → `Other`. Categories that
    match the fixed list (or an alias such as `dev`, `ml`, `design`) are
    normalised to it; any other wording is kept as a custom category.
  - _Catalog._ The bundled set is described by
    `src-tauri/resources/agent-skills/_catalog.json` (`version`, then
    `skills.<name> = { creator, category, tags }`), copied to `.catalog.json`
    in the user's skills folder and applied only to Radium's own skill names, so
    a user skill cannot borrow a bundled label. Discovery only looks at
    folders, so the file is never mistaken for a skill. A Rust test requires every bundled skill to have an entry in a
    known category.
  - _Fixed categories:_ Code & Dev, AI & Machine Learning, Data & Science,
    Infrastructure & Hardware, Robotics & Simulation, Health & Life Sciences,
    Graphics & Design, Media, Writing & Communication, Productivity, Other.
  - _Size_ (bytes and file count of the skill folder) is computed in the
    backend while fingerprinting, along with an "added" time from the folder.
- **Consequences:** The Skills page can group by creator, category, source or
  folder and sort by name, size, creator, category or recently added, with the
  choice kept in local storage. Create and Edit write the three keys into
  `metadata` (Edit rewrites only those keys and keeps the rest of the
  frontmatter). Skills can be moved between category folders from the page; a
  move keeps the review, the on/off state and the name. New bundled skills need
  a catalog entry or the Rust test fails. Category names are data, not
  translated strings.
- **Owner:** @walladanger
- **Links:** `src-tauri/src/core/agent/skills/{discovery,organization}.rs`,
  `web-app/src/lib/skill-organization.ts`, `web-app/src/routes/skills/index.tsx`,
  https://agentskills.io/specification
