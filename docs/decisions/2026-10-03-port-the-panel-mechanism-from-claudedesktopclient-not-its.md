---
date: 2026-10-03
title: "Port the panel mechanism from ClaudeDesktopClient, not its built-in panels; freeze the manifest + SDK as a shared contract"
---

# 2026-10-03 — Port the panel mechanism from ClaudeDesktopClient, not its built-in panels; freeze the manifest + SDK as a shared contract

- **Context:** The goal is for Radium's chat to gain the dockable panel layout
  that `walladanger/ClaudeDesktopClient` (CDC) has: a persisted board of panels
  the user adds, drags, resizes and closes, where a panel can be written by a
  third party and installed from a folder at runtime.

  CDC turns out to contain **two** things both called "panels", and only one of
  them is modular:

  - **Custom panels are a real plugin system.** A panel is a folder holding
    `panel.json` plus its own HTML/JS. It runs in an iframe with
    `sandbox="allow-scripts"` on a dedicated `cdc-panel://` origin — no Node,
    no renderer access, and a response CSP of `connect-src 'none'`, so it
    cannot phone home. Its only route out is `postMessage` into a single
    bridge that authorises every call against the permissions declared in its
    manifest; unknown methods are rejected rather than forwarded. Roughly 500
    lines of portable logic: manifest validation and install/remove, an
    84-line SDK served to every panel, the iframe host, and the grid.
  - **Built-in panels are not modular at all.** All seven live in one
    775-line file, hold unrestricted `window.api` access across 21 methods,
    and must be registered in *two* hand-synced registries. That desync is a
    real defect with a real history: the Performance panel shipped in CDC
    1.3.6 as a split-view surface, was never added to the workspace registry,
    and could not be docked for two releases.

  Direction was settled first: bring panels to Radium, not Radium to CDC.
  Radium is Tauri plus 256 Rust files, ~937 frontend source files, nine
  workspace extensions, desktop plus iOS and Android, and it tracks upstream.
  CDC is an Electron app with 21 backend modules. Moving the larger thing to
  accommodate the smaller one would also mean abandoning the upstream
  relationship and owning the llama.cpp / MLX / Tauri surface alone.

  Three further facts about Radium shape the work:

  - A precedent for the exact hosting mechanism already exists in-tree.
    `register_uri_scheme_protocol("artifact", …)` in `src-tauri/src/lib.rs`
    plus `src-tauri/src/core/artifact.rs` already serve HTML to a sandboxed
    iframe under a per-response CSP. Panels are that pattern with the CSP
    inverted from permissive to restrictive, and with bytes coming from disk
    instead of an in-memory store.
  - Path-safety discipline for user-supplied folders also already exists, in
    `src-tauri/src/core/agent/skills/registry.rs`: symlink refusal, and
    canonical-root containment checks on both the directory and the file.
  - The frameless shell is **already built and already specified**. Windows
    runs `decorations: false` with an overlay title bar; macOS and Linux run
    overlay title bars with positioned traffic lights; and
    `web-app/src/components/WindowControls.tsx` already implements minimize,
    maximize/restore and close. The approved design is
    `docs/superpowers/specs/2026-08-24-atomic-media-workspace-and-frameless-window-design.md`.
    So "frameless" is not work to be done — what is missing is the *container*:
    chrome that holds a panel board, with exactly one window drag region.

- **Decision:** Four parts.

  1. **Port the mechanism, not the built-ins.** What crosses over is the
     architecture: manifest → declared permissions → one authorising choke
     point → sandboxed iframe on its own scheme. CDC's built-in panels do not
     cross over. Several are CDC-specific (its benchmark harness, `nvidia-smi`
     metrics, its own log record shape) and Radium already has a
     system-monitor route and its own hardware telemetry. Radium's built-ins
     get rebuilt natively on Radium's data.

  2. **Freeze the manifest and SDK as a shared contract now, at v1.** Same
     `panel.json` schema and same panel-facing SDK in both apps, with
     different host implementations underneath, so a panel a third party
     writes runs in both. A machine-readable schema plus a conformance
     fixture panel that both hosts must load is part of the deliverable. This
     is cheap decided up front and expensive to retrofit once two dialects
     exist. The scheme is renamed from CDC's `cdc-panel://` to a
     product-neutral `panel://` as part of freezing it.

  3. **One registry, built by discovery, not by hand.** Radium's built-in
     panels are collected with `import.meta.glob` so a panel is one file
     exporting a component plus a descriptor. The two-hand-synced-registries
     defect is designed out rather than inherited.

  4. **Permissions are a small bespoke core plus MCP for everything else.**
     The fixed host surface stays deliberately tiny — host info, theme,
     per-panel storage, resize. Everything a panel wants beyond that is
     brokered through Radium's existing MCP client, gated by an `mcp.call`
     permission with a per-panel server allowlist. Radium already has the MCP
     client with OAuth and four transports; this means panel authors write
     against a specification they already know, and we never maintain an
     ever-growing hand-written method table. This is the one choice in the
     work that is expensive to reverse, so it is made before the bridge is
     written, not after.

  Panels are deliberately **not** a new `ExtensionTypeEnum` member. Radium's
  extension system is headless and loads extensions in-renderer with full
  trust; panels are untrusted third-party UI. Two parallel systems with
  different trust classes is the intended shape, and the sandbox is the whole
  reason the second one can exist.

- **Consequences:** Radium gains a dockable panel board and an install-from-
  folder path for third-party panels, without widening what untrusted code can
  reach: a panel's blast radius is an opaque-origin iframe plus the permissions
  its manifest declares. Choosing the already-present `react-resizable-panels`
  (3.0.5, already used by `AgentWorkspaceLayout.tsx`) for the first board adds
  no dependency; free-form drag-and-drop tiling is explicitly deferred rather
  than pulling in a grid library on day one.

  The costs. The host layer genuinely must be rewritten, not copied: Electron's
  `protocol.handle` becomes a Tauri URI scheme handler in Rust, and
  `window.api` preload IPC becomes `invoke` commands — a few hundred lines of
  Rust that has no counterpart in CDC. Freezing a contract means future
  additions are versioned negotiations across two apps rather than a free edit.
  And because Radium tracks upstream, every line added to `web-app/src` is a
  line re-merged forever, so the work is confined to new subtrees
  (`web-app/src/panels/`, `src-tauri/src/core/panels/`) with the smallest
  possible number of touchpoints in upstream-owned files: one route entry, one
  workspace-switch entry, one scheme registration, one CSP edit.

  Watch for three things. First, the drag-region collision: a panel header
  inside a window drag region moves the OS window instead of the panel. Tauri
  excludes `button`, `input`, `a`, `select` and `textarea` automatically but
  not `div`, which is why `HeaderPage.tsx` already suppresses `mousedown`
  explicitly — panel headers need the same treatment, and this is the most
  likely bug in the whole port. Second, the CSP for panels must not be copied
  from `ARTIFACT_CSP`, which is permissive *on purpose*; panels need the
  inverse. Third, CDC has a "Skills" button in its chat rail that is only a
  label over an MCP plugin-tools toggle — unrelated to Agent Skills, and worth
  renaming before anything is shared between the two apps.

  One more thing about the setting this lands in: `main` is actively tightening
  the Tauri security policy (`cadd1be4`, following PR #64) — `connect-src`
  narrowed to the telemetry hosts, `unsafe-eval` dropped from `script-src`, the
  asset protocol scoped. The panel CSP above is consistent with that direction
  and must stay so: it needs `'unsafe-inline'` for the inline scripts most
  single-file panels rely on, but it does **not** reintroduce `unsafe-eval`,
  and `connect-src 'none'` is stricter than the main window's, not looser.

  A separate, independently valuable find during this review: Radium's
  `SKILL.md` frontmatter parser is `deny_unknown_fields`, so a stock Agent Skill
  whose frontmatter carries a key the struct does not name fails to parse
  outright rather than ignoring it. `cadd1be4` has since fixed most of this by
  naming `license`, `metadata` and `compatibility` as accepted-but-unused. What
  remains is narrower: `allowed-tools` is still not a known key, so a skill
  declaring it is still rejected, and Radium's own extension fields use
  underscores where the official ones use hyphens. Tracked in the
  implementation plan, not in this record.

- **Owner:** @walladanger
- **Links:**
  `docs/superpowers/plans/2026-10-03-radium-panel-system-implementation.md`,
  `docs/superpowers/specs/2026-08-24-atomic-media-workspace-and-frameless-window-design.md`,
  `src-tauri/src/lib.rs`, `src-tauri/src/core/artifact.rs`,
  `src-tauri/src/core/agent/skills/registry.rs`,
  `src-tauri/src/core/agent/skills/manifest.rs`,
  `web-app/src/components/WindowControls.tsx`,
  `web-app/src/containers/HeaderPage.tsx`,
  `web-app/src/containers/AgentWorkspaceLayout.tsx`,
  `src-tauri/tauri.windows.conf.json`, `src-tauri/tauri.conf.json`;
  CDC: `electron/panels.js`, `electron/panel-bridge.js`,
  `public/panel-sdk.js`, `src/workspace/PanelFrame.jsx`,
  `src/workspace/Workspace.jsx`, `examples/panels/README.md`.
