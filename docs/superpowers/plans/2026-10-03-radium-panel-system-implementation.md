# Radium Panel System — Implementation Plan

Carries the panel mechanism from `walladanger/ClaudeDesktopClient` (CDC) into
Radium, behind a frozen contract, on a frameless shell that already exists.

Decision record:
`docs/decisions/2026-10-03-port-the-panel-mechanism-from-claudedesktopclient-not-its.md`
Shell design already approved:
`docs/superpowers/specs/2026-08-24-atomic-media-workspace-and-frameless-window-design.md`

## What is being built

A **panel** is a folder containing `panel.json` and an entry HTML file. It
renders inside a dockable board in Radium, in an iframe on its own `panel://`
origin with `sandbox="allow-scripts"`, and reaches the host only through a
message bridge that authorises every call against the permissions its manifest
declares. Panels can be installed from a folder at runtime, by the user, and
written by third parties.

Radium's own panels use the same board but render as native React — they are
trusted, in-process, and do not go through the iframe.

## Ground truth before starting

Verified in-tree on 2026-10-03 against `main` at `cadd1be4`, so no step
below needs to rediscover it.

| Thing | Where it already is |
|---|---|
| Sandboxed-iframe-over-custom-scheme precedent | `src-tauri/src/lib.rs:62`, `src-tauri/src/core/artifact.rs` (62 lines) |
| Path-safety for user folders (symlink + escape refusal) | `src-tauri/src/core/agent/skills/registry.rs` |
| YAML/JSON manifest validation discipline | `src-tauri/src/core/agent/skills/manifest.rs` |
| Frameless window | `tauri.windows.conf.json` (`decorations: false`), macOS/Linux overlay title bars with `trafficLightPosition` |
| Window min / max / close | `web-app/src/components/WindowControls.tsx` (88 lines) |
| The frameless shell itself — title strip, drag region, controls, top z-index | `web-app/src/components/WindowFrame.tsx`, gated by `hasCustomWindowChrome()` (Windows main window only), locked by `tests/window-controls.test.mjs` |
| Drag region, and the `mousedown` suppression pattern | `web-app/src/containers/HeaderPage.tsx` |
| Split-pane layout library, already a dependency | `react-resizable-panels` 3.0.5, used by `web-app/src/containers/AgentWorkspaceLayout.tsx` |
| MCP client (4 transports + OAuth) | `rmcp` 0.8.5, `src-tauri/src/core/mcp/` |
| CSP, including the existing `artifact:` entries | `src-tauri/tauri.conf.json` → `app.security.csp` |
| Active security-hardening posture to stay consistent with | `cadd1be4` (after PR #64): `connect-src` narrowed, `unsafe-eval` dropped, asset protocol scoped |

CDC sources to port from: `electron/panels.js` (198 lines, validation +
install/remove + path resolution), `electron/panel-bridge.js` (134, the
authorising choke point), `public/panel-sdk.js` (84, the panel-facing SDK),
`src/workspace/PanelFrame.jsx` (85, iframe host),
`src/workspace/Workspace.jsx` (246, the board), `examples/panels/README.md`
(the author-facing docs), `examples/panels/usage-sparkline/` (a working
example panel).

## Phase 0 — The container that holds panels

The frameless shell exists; what is missing is chrome to hold a board. This
phase ships that container with a single placeholder panel inside it, and
nothing else.

1. Add the route. `web-app/src/constants/routes.ts` gets
   `workspace: { index: '/workspace/' }`; create
   `web-app/src/routes/workspace/index.tsx`. Keep the route file thin — it
   mounts the shell and nothing more.
2. Build `web-app/src/panels/WorkspaceShell.tsx`: a top rail, then a board
   region below it (`min-h-0 flex-1 overflow-hidden`, so the board scrolls
   rather than the page). The rail carries the board's own controls — add
   panel, install, lock layout, reset layout — and the window controls.
3. Platform-correct chrome in the rail, following what `HeaderPage.tsx`
   already does: on macOS pad for the traffic lights and mark the rail
   `data-tauri-drag-region`; on Windows and Linux render `WindowControls`.
   Reuse `WindowControls.tsx` — do not write a second set of window actions.
4. **Settle the drag collision now, not later.** Verified during Phase 0:
   the current architecture already keeps the two apart. `WindowFrame` holds
   its drag strip in an absolutely-positioned sibling layer, not an ancestor
   of page content, and routes put their content *beside* `HeaderPage` rather
   than inside it — only `HeaderPage`'s own title row is a drag region, and
   only on macOS. So the board adds no drag region of its own, and a test
   asserts it never does. The `stopPropagation` guard still goes on every
   panel header: it costs nothing and it is what stops a panel drag from
   moving the whole OS window once these headers become drag handles in
   Phase 4, or if a route ever nests a board under `HeaderPage`. Tauri
   excludes `button`, `input`, `a`, `select` and `textarea` from drag regions
   automatically but not `div`, which is why `HeaderPage` suppresses the same
   event.
5. Add the workspace as a standalone row in `NavMain`, next to Media.
   The Chat / Agent / Media switch this step originally named no longer
   exists: upstream removed that pill at v2.0.35 along with the whole
   mode-switch mechanism, and Media was moved to its own sidebar row with a
   comment recording that a standalone row is what survives this merge and
   the next one. The workspace follows that precedent rather than reviving a
   mechanism upstream deleted.
6. Tests: the rail renders platform-correct chrome; window controls still
   minimize, maximize/restore and close; a `mousedown` on a panel header does
   not reach the drag region; maximize/restore leaves the board laid out
   correctly.

**Done when:** `/workspace` opens a frameless board with one placeholder tile,
the window still drags and resizes from the rail, and dragging the tile's
header does not move the window.

**Status: done (2026-10-03).** Shipped `web-app/src/panels/` with
`WorkspaceShell.tsx` (title row from `HeaderPage`, board region that scrolls
inside itself, working lock), `PanelTile.tsx` (header strip with the
`mousedown` guard), `types.ts` (the `PanelDescriptor` both panel kinds will
share), the `/workspace/` route, and the `NavMain` row. Five tests in
`web-app/src/panels/__tests__/WorkspaceShell.test.tsx` cover the board, the
lock really disabling the handle, the absence of a drag region on the board,
and the header guard swallowing `mousedown` while the tile body does not.

Two things were deliberately left out rather than stubbed: Add panel and
Install need the registry and the sandboxed host, so they arrive with
Phases 2 and 4. A rail of buttons that do nothing would be worse than a rail
without them.

## Phase 1 — Freeze the contract at v1

Before either host is written, so two dialects never exist.

7. Write `docs/superpowers/specs/2026-10-03-panel-contract-v1.md`: the
   manifest fields, the SDK surface, the message shapes in both directions,
   the error codes, and the permission names with exactly what each grants.
   Carry over CDC's error shape — a denied call names the permission the
   manifest is missing.
8. Add `panel.schema.json` beside it — a JSON Schema for `panel.json`, with a
   required `contract` field pinning the version. Both hosts validate against
   this file; neither hand-rolls a second idea of what a manifest is.
9. Rename for neutrality while the contract is still soft: `cdc-panel://` →
   `panel://`, and the SDK's host methods lose CDC-specific naming. Freeze
   `panel-sdk.js` as the single file both apps serve, byte-identical.
10. Build the conformance fixture: a panel that exercises every SDK call and
    every error path, plus a handful of deliberately invalid manifests. Both
    hosts must load the fixture and produce the same results. This is the
    artefact that keeps the two apps honest.

**Done when:** the schema, the spec, the SDK and the fixture are committed,
and CDC's existing example panel validates against the schema unchanged apart
from the renamed scheme.

**Status: done (2026-10-03),** with one correction to that done-when. CDC's
example panel does *not* validate unchanged: it declares bare `usage.read`,
and v1 reserves unprefixed names for the portable core, so host-specific
capabilities are namespaced (`cdc:usage.read`). Discovered while writing the
schema — the alternative was to admit every host's capability names into the
shared vocabulary, which would make "portable" meaningless. Renaming CDC's
manifests is Phase 7, not a change anyone owes today.

Shipped: `src-tauri/resources/panel-contract/` holding `panel.schema.json`
(the only definition of a manifest), `panel-sdk.js` (frozen, pinning
`CONTRACT = 1`) and `panel-theme.css`; the spec at
`docs/superpowers/specs/2026-10-03-panel-contract-v1.md`; the conformance
panel at `tests/fixtures/panels/conformance/` exercising every call and both
refusal paths; six deliberately broken manifests in
`tests/fixtures/panels/invalid/`; and `tests/panel-contract.test.mjs`, wired
into `make test-hardening-contracts` so the contract is enforced by
`make verify` rather than merely written down. The permission list is pinned
by assertion, so a capability cannot be added without a deliberate edit.

The test carries its own validator for the schema subset in use rather than a
schema engine: the repository's contract tests run on plain `node --test` with
no dependencies, and the only engine present (ajv 6) is a transitive eslint
dependency. The authoritative validator at runtime is the Rust host, Phase 2.

## Phase 2 — Rust host: scheme, registry, manifest

11. Create `src-tauri/src/core/panels/`: `manifest.rs` (schema validation,
    ported from CDC's `validate`), `registry.rs` (list / get / install /
    remove, reporting broken panels rather than hiding them, as CDC does),
    `resolve.rs` (request path → file on disk), `mod.rs`.
12. Path safety is not reinvented: lift the discipline from
    `skills/registry.rs` — refuse symlinks, canonicalise, and check
    containment on both the panel directory and the resolved file. Port CDC's
    explicit refusal of traversal rather than normalising it away: at a
    security boundary a logged refusal beats a silent rewrite.
13. Register the scheme in `src-tauri/src/lib.rs` next to the existing
    `artifact` registration, modelled on `core/artifact.rs`. The difference
    from artifact: bytes come from disk, and the CSP is the inverse.
14. The panel CSP is restrictive — roughly
    `default-src 'self' 'unsafe-inline' data: blob:; connect-src 'none'`.
    **Do not copy `ARTIFACT_CSP`**, which is permissive deliberately and for a
    different threat model. Stay aligned with the security hardening already
    under way on `main` (`cadd1be4`, after PR #64): `'unsafe-inline'` is
    needed for the inline scripts single-file panels rely on, but
    `unsafe-eval` — just removed from the main window's `script-src` — is not
    to be reintroduced here, and `connect-src 'none'` is deliberately
    stricter than the main window's.
15. Add `panel:` alongside `artifact:` in `tauri.conf.json` → `frame-src` and
    `child-src`. Serve the frozen `panel-sdk.js` and a `panel-theme.css` to
    every panel from the scheme handler, exactly as CDC does.
16. IPC commands: `panels_list`, `panels_install`, `panels_remove`,
    `panels_open_folder`, `panels_request`. Add a `panel-window` capability
    file only if panels ever get their own windows; the board does not need
    one.
17. Tests: valid and invalid manifests; symlinked entry refused; `..`
    refused; a panel directory outside the root refused; the served response
    carries the restrictive CSP.

**Done when:** a panel folder dropped into the panels directory is listed,
served and rendered, and every hostile path case is refused with a log line.

**Status: done (2026-10-03),** minus the IPC commands, which moved to Phase 3.
Step 16's commands are only reachable once the bridge and the install flow
exist, and `panels_request` *is* the bridge, so splitting them across two
phases would have meant wiring app state twice. The core is root-agnostic —
`PanelRegistry::load(root)` takes a path — so Phase 3 wires it to
`app_data_dir()/panels` without touching any of this.

Shipped `src-tauri/src/core/panels/`: `manifest.rs` (the runtime authority,
collecting every validation failure rather than stopping at the first so an
author sees all three mistakes at once), `registry.rs` (one folder per panel,
broken ones reported rather than hidden), `resolve.rs` (the only place a
panel's files are read, so the only place path escapes have to be right),
`protocol.rs` (the `panel://` scheme and `PANEL_CSP`), and `mod.rs` wiring it
to the app. Registered in `lib.rs` beside the `artifact` scheme, with `panel:`
and `http://panel.localhost` added to the main window's `frame-src` and
`child-src`.

Fourteen tests, weighted towards the security boundary: `..` refused outright
rather than clamped, a symlink out of the folder refused by containment, a
symlinked `panel.json` marking the panel broken instead of being followed,
unknown panels and refused paths both answering without saying which so a
probe learns nothing, and the CSP asserted to carry `connect-src 'none'` and
*not* `unsafe-eval`. The manifest cases run against the same fixtures as
`tests/panel-contract.test.mjs`, with a count assertion on the fixture
directory, so the Rust validator and the JSON schema cannot drift apart
without one of the two suites failing.

## Phase 3 — The bridge and the permission model

The decision that is expensive to reverse. Build it once, here.

18. `src-tauri/src/core/panels/bridge.rs` — one `dispatch` function, the only
    way a panel reaches anything. Unknown method: rejected, not forwarded.
    Undeclared permission: rejected, naming what the manifest needs.
19. The bespoke core stays small on purpose: `host.info`, `panel.ready`,
    `panel.resize`, `panel.theme`, `storage.get`, `storage.set`. Per-panel
    storage is namespaced by panel id, as CDC does.
20. Everything else goes through MCP: `mcp.listTools` and `mcp.callTool`,
    gated by an `mcp.call` permission that carries a per-panel allowlist of
    server ids. This is why panel authors write against a spec they already
    know, and why the method table stops growing.
21. Surface the permission list to the user wherever panels are managed,
    before install — CDC shows declared permissions in its panel manager and
    that behaviour carries over.
22. Tests: an undeclared method is denied with the right code and message; a
    declared one dispatches; an `mcp.call` to a server outside the panel's
    allowlist is denied; storage is isolated between two panel ids.

**Done when:** the conformance fixture from Phase 1 passes against the Rust
host, including every denial path.

**Status: the bridge is done (2026-10-03); the IPC commands and the real host
are the remaining piece.** `bridge.rs` holds one `dispatch`, expressed against
a `PanelHost` trait so the authorisation rules are testable without an app
handle. Nine tests drive a stub that records what the bridge actually asked
the app for, which is how a leaked denial would show up.

What the rules turned out to need, beyond the plan's sketch:

- **Order matters.** An unimplemented method answers `unknown_method` *before*
  any permission check, so a panel written against a newer contract learns the
  host is old rather than that it asked for the wrong permission.
- **An unqualified tool name resolves only inside the allowlist.** The frozen
  SDK's `callTool(name, args)` sends no server, so the bridge lists tools
  scoped to the manifest's `mcpServers` and matches within that — an
  unqualified name cannot reach a server the panel was not granted. Where two
  allowed servers offer the same name it refuses and says to pass `server`,
  rather than silently picking one. `server` stays an optional param, so the
  frozen SDK needed no change.
- **An empty allowlist grants nothing**, even holding `mcp.read` and
  `mcp.call`, and a server named outside the allowlist is denied before
  anything is listed or called.
- **Storage is namespaced by panel id**, so two panels asking for the same key
  see different values.

**Status: Phase 3 done (2026-10-03).** The real host and the IPC commands
landed with the bridge. `host.rs` adapts the bridge to the MCP client and to
per-panel JSON storage under `<data>/panel-storage/`, kept out of the panel
folders so uninstalling a panel cannot take a user's settings with it and
reinstalling one cannot inherit a stranger's state; writes go through a
temporary file and a rename so an interrupted write cannot truncate what was
there. `commands.rs` adds `panels_list`, `panels_install`, `panels_remove`,
`panels_open_folder` and `panels_request`, registered in the desktop handler
list only — the board is a desktop surface.

Decisions worth recording:

- **Both roots resolve through `get_jan_data_folder_path`**, not
  `app_data_dir()` directly, so panels follow the data folder wherever it is
  configured — including the move the product rename made, and the override
  the tests use.
- **The frontend picks the folder to install**, as `agent_import_skill`
  already does, which keeps the native dialog on the side that owns it.
- **The theme is passed in per request** rather than mirrored in the backend.
  The renderer owns it; a second copy would be one more thing to keep in step.
- **`panels_remove` re-resolves through the registry** instead of joining an
  id onto the root, so it can only ever delete something the registry already
  calls a panel directly under the panels directory.
- **Install refuses symlinks** anywhere in the source tree: a link in a
  downloaded folder would otherwise pull in anything the user can read, into a
  directory the panel is then served from.

One real bug came out of writing the tests. `install_from` removes the
destination before copying, so picking a folder that *is* the destination — an
already-installed panel, or anything beneath it — deleted the source and then
copied nothing, losing the panel. Now refused by comparing canonicalised
paths, with a test that asserts the panel survives.

## Phase 4 — Frontend host and the board

23. `web-app/src/panels/PanelFrame.tsx` — port of CDC's: iframe, `postMessage`
    in both directions, `invoke('panels_request')`, theme pushed down on
    change, a spinner until the panel reports ready with a timeout so a panel
    that never reports does not spin forever, and a broken-panel state that
    shows the manifest errors.
24. `web-app/src/panels/registry.ts` — **one** registry. Built-in panels are
    discovered with `import.meta.glob`; each is one file exporting its
    component plus a descriptor (id, name, default size). Custom panels come
    from `panels_list`. The two-registry desync that cost CDC two releases is
    not reproduced.
25. `web-app/src/panels/PanelBoard.tsx` — the board on
    `react-resizable-panels`, already a dependency, giving keyboard-resizable
    dividers for free. Free-form drag tiling is explicitly deferred; revisit
    only if split panes prove insufficient in use.
26. Persist the board — open panels, geometry, lock state — through Radium's
    existing store, not `localStorage`. Persist only after first load, so the
    empty initial state is never written over a real layout; pin both the
    open list and the geometry in the default so reset lands somewhere a
    human chose. Both are bugs CDC already found and fixed.
27. Install flow: folder picker → `panels_install` → refresh → open the new
    panel. Uninstall behind a confirmation that says the folder is deleted
    from disk.
28. Tests: the registry yields built-ins and custom panels from one source;
    adding, closing, locking and resetting behave; a broken manifest renders
    the broken state rather than throwing; layout survives a remount.

**Done when:** CDC's example panel, unmodified apart from the contract rename,
installs and runs inside Radium.

## Phase 5 — Radium's own built-in panels

Rebuilt natively on Radium's data. CDC's built-ins are not ported — its
benchmark harness, `nvidia-smi` metrics and log record shape are its own.

29. First wave, each one file plus a descriptor: hardware and resource
    telemetry (from the existing system-monitor data), MCP servers and their
    tools, model and engine status, local API server status, download queue.
30. The skills panel — list skills, enable and disable them, show which ones
    fired. This is the panel that justifies the layer, and it needs nothing
    new from the backend.
31. Tests per panel: a loading state, an empty state, and an unavailable
    state that renders as a dash rather than a zero. A null measurement must
    never read as a real one.

**Done when:** the default board is useful on a fresh install with no custom
panels present.

## Phase 6 — Guardrails and verification

32. A hardening test in the style of `tests/no-auto-update.test.mjs` locking
    the properties that matter: panels are served with the restrictive CSP;
    the iframe never gets `allow-same-origin`; `dispatch` is the only path to
    host state. Re-widening any of them should fail the build until someone
    deletes the guard deliberately and writes a record saying why.
33. Author-facing docs: port `examples/panels/README.md` into Radium's docs,
    pointing at the frozen schema, and ship the example panel in-tree.
34. Run the repository's focused frontend checks while iterating, then
    `make verify` for the final branch state.

## Phase 7 — Optional, later: bring CDC onto the frozen contract

35. Retrofit CDC's host to contract v1 — mostly the scheme rename and schema
    validation against the shared file.
36. Split CDC's 775-line `builtin.jsx` into one file per panel with a
    discovered registry, which also removes its split-view/workspace desync.
37. Then one panel folder genuinely runs in both apps, which was the point of
    freezing the contract.

## Out of scope

Mirroring the scope boundaries of the existing workspace spec:

- Panels do **not** become an `ExtensionTypeEnum` member, and the extension
  loader is not touched. Extensions are trusted services; panels are
  untrusted UI. Two systems, two trust classes.
- No change to the local OpenAI-compatible API on port 1337, to
  model-provider logic, or to the Chat / Agent state model beyond adding the
  workspace entry.
- No renaming of legacy `jan*` / `@janhq/*` identifiers.
- No refactor of unrelated frontend code. Everything new lives in
  `web-app/src/panels/` and `src-tauri/src/core/panels/`; the touchpoints in
  upstream-owned files are one route entry, one workspace-switch entry, one
  scheme registration, one CSP edit, and the IPC command registrations.
  Because Radium tracks upstream, every line outside those subtrees is a line
  re-merged forever.

## Tracked separately

Found while reviewing the two codebases, independently worth doing, not part
of this work:

- `SKILL.md` frontmatter in `src-tauri/src/core/agent/skills/manifest.rs` is
  `deny_unknown_fields`, so a key the struct does not name fails the parse
  rather than being ignored. `cadd1be4` fixed most of this by naming
  `license`, `metadata` and `compatibility` as accepted-but-unused. The
  remaining gap is `allowed-tools`: still unknown, so a skill declaring it is
  still rejected, and Radium's own fields use underscores where the official
  ones use hyphens. Add it as an accepted key — or alias it onto
  `requires_tools`, which is what it actually means — and ecosystem skills
  drop straight in.
- Radium has no MCP **server** role; CDC does, and it makes the app
  delegatable from Claude Code, Cursor and Zed. Worth considering on its own
  merits.
- CDC's chat rail has a "Skills" button that is only a label over an MCP
  plugin-tools toggle, unrelated to Agent Skills. Rename before anything is
  shared between the apps.
