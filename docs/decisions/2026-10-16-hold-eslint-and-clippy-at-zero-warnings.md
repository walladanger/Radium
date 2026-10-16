---
date: 2026-10-16
title: "Hold ESLint and clippy at zero warnings, on Windows too"
---

# 2026-10-16 — Hold ESLint and clippy at zero warnings, on Windows too

- **Context:** `web-app` lint ran with `--max-warnings 35`, a ceiling set to
  the count of the day, so 33 warnings sat in the tree and any two new ones
  passed. `make clippy-rust` already used `-D warnings`, but CI ran it only on
  Linux; four Windows-only clippy findings in `tauri-plugin-mlx` (a `child`
  binding used only inside `#[cfg(unix)]`) were never seen by any gate.
- **Decision:** Both linters are held at zero. `yarn lint` runs
  `eslint . --max-warnings 0`; clippy keeps `-D warnings` and Radium CI gains a
  `clippy-windows` job running the same `make clippy-rust`. A deliberate
  exception is written at the site with its reason: a targeted
  `eslint-disable-next-line` or `#[allow(...)]`, never a raised ceiling. Files
  that export non-components move those exports to a sibling `.ts` file so
  React Fast Refresh keeps working; built-in panel modules may export their
  `panel` descriptor (scoped `allowExportNames` in `eslint.config.js`).
- **Consequences:** A new warning fails CI instead of joining a backlog. The
  Windows job adds a second clippy build per PR (cached by `rust-cache`). Code
  shaped by `#[cfg(unix)]` must compile clean on Windows: on non-unix the MLX
  child is dropped explicitly and `kill_on_drop` ends it, as before.
- **Owner:** @walladanger
- **Links:** `web-app/package.json`, `web-app/eslint.config.js`,
  `.github/workflows/radium-ci.yml`, `Makefile` (`clippy-rust`),
  `src-tauri/plugins/tauri-plugin-mlx/src/{cleanup,commands}.rs`.
