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

**Status: done (2026-10-03).** `web-app/src/panels/` now holds `registry.ts`
(built-ins discovered with `import.meta.glob`, merged with what `panels_list`
reports, one source of truth), `PanelFrame.tsx` (the sandboxed iframe host),
`PanelBoard.tsx`, `useBoard.ts`, a local `Chip`, and the first discovered
built-in at `builtin/panels.tsx` — the panel manager, as a panel, which is
also where a user can read the permissions a custom panel asked for after the
fact. `WorkspaceShell` gained the Add panel, Install and Reset controls Phase 0
deliberately left out until there was something behind them.

Two corrections to this plan's own instructions:

- **Step 26 said to persist the board through the app's settings store rather
  than localStorage.** That was carried over from CDC, whose board lived in
  app settings. This repo keeps per-device UI state in zustand with `persist`
  — the resizable pane sizes beside it already go to localStorage via
  `useDefaultLayout` — so the board follows the convention already here.
- **There is no shared `Badge` component** in this repo, which the first draft
  assumed from CDC. Panels carry a small local `Chip` instead of adding one to
  the design system for three call sites.

`PanelFrame` trusts only its own frame's `contentWindow`: without that check
any other frame on the page could speak for the panel. Nothing in it decides
what a panel may do — it relays to `panels_request` and the bridge decides.

Running the whole `verify-fast` chain rather than just lint, typecheck and the
panel tests caught `web-app/src/lib/__tests__/ipc-contract.test.ts`, which
pins exactly which IPC handlers are desktop-only. The five panel commands are,
so they are now named there with the reason.

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

**Status: done (2026-10-03).** Six built-ins under `web-app/src/panels/builtin/`,
each one file plus its descriptor, discovered by the registry without being
listed anywhere: `hardware.tsx`, `mcp.tsx`, `models.tsx`, `api-server.tsx`,
`downloads.tsx` and `skills.tsx`. `DEFAULT_OPEN` now opens Hardware, Models
and Skills — the three that say something on a machine with no models pulled,
no servers configured and no custom panels installed. The panel manager moved
off the default board to the Add panel menu, because a first screen whose only
content is "no custom panels installed" is not the done-when.

Step 31's rule — *a null measurement must never read as a real one* — turned
out to be the whole design problem, so it is enforced in one place rather than
per panel. `Readout` in `web-app/src/panels/Readout.tsx` prints a dash for
`null`, `undefined` and `''`, and prints `0` for a real zero; every built-in
routes its numbers through it. The cases that would otherwise have lied:

- **CPU and memory usage.** `useHardware` persists its last enumeration, so
  the figures on screen just after launch can be from a previous run. Static
  facts (core count, VRAM) are safe to draw from that copy; live usage is not,
  and `0%` would assert an idle machine. Usage is gated on a sample having
  arrived this session, recognised by `systemUsage.total_memory` being
  non-zero, which no real machine reports.
- **MCP tool counts.** The tool snapshot belongs to the chat path
  (`useTools`), so the panel can open before it exists. "0 tools" on a
  connected server is a different claim from "we have not asked", so the count
  is a dash until any tool is known.
- **Token speed.** `undefined` until a generation measures one, and cleared
  between turns. `0 tok/s` would read as a stalled model.
- **Download speed and ETA.** Taken from the shared `formatSpeed` /
  `formatEta` helpers, which already return `null` when there is nothing
  honest to say; a paused transfer drops both rather than freezing the last
  sample.
- **The engine build.** Read off the provider's recorded `version_backend`
  rather than probed, and a dash when the provider has not recorded one.
- **Skill run counts.** A skill with no record shows no chip at all rather
  than "0 runs": the message store holds only the threads currently loaded, so
  it cannot support that claim. The count is labelled "this session" for the
  same reason.

"Which skills fired" needed nothing new, as step 30 predicted, but not from
where the plan assumed: a selected skill already rides on user-message
metadata (`agent_skill_name`) so that send, regenerate, edit and restart
replay it uniformly, which makes the message store the existing record. The
panel counts those with the same `readAgentSkillName` the chat path uses, and
adds no tracking of its own.

Two deliberate restrictions. The Local API server panel is read-only: starting
the server loads a model, picks a provider and raises its own toasts
(`useLocalApiServerControl`), which is not something a dashboard tile should do
by accident. And it reports the API key as set or not set, never printing it —
a panel is a thing people screen-share.

34 tests in `web-app/src/panels/__tests__/builtins.test.tsx`, three per panel
minimum: loading, empty, and unavailable-reads-as-a-dash, plus a populated
case for each so the dash is not simply what it always prints.

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

**Status: done (2026-10-03).**

`tests/panel-sandbox.test.mjs` holds the guard, in `test-hardening-contracts`
beside `tests/panel-contract.test.mjs`. Nine assertions over the three
properties step 32 names, and the guard was checked by *breaking* each one
rather than by reading it: adding `allow-same-origin` to the iframe, widening
`connect-src` to `https:`, and adding `storage.get` to `ALWAYS_ALLOWED` each
turn it red (four failures across the three edits), and all nine pass again
once reverted. A guard nobody has seen fail is a guard that proves nothing.

What it pins, beyond the three headline properties:

- the sandbox token list is `allow-scripts` **and nothing else** — not merely
  the absence of `allow-same-origin`, because `allow-popups` and
  `allow-top-navigation` would let a panel leave its tile;
- `allow-same-origin` appears nowhere in the panel layer at all, comments
  included, on either side of the bridge;
- `script-src` and `style-src` admit no remote or `data:` code, so "no
  network" cannot be defeated by loading a script instead of fetching;
- the frame invokes exactly one command, `panels_request` — asserted as set
  equality, so a second command added later fails rather than passing
  unnoticed;
- `ALWAYS_ALLOWED` is exactly those four lifecycle methods, with the reason
  spelled out in the failure message;
- the app CSP admits `panel:` as a frame but **not** to `connect-src` or
  `script-src`, so the host page cannot read a panel's files itself;
- the scheme is registered once, by `core::panels::handle_panel_request`.

Step 33 is `docs/panels/README.md` plus `examples/panels/mcp-tool-browser/`.
The CDC README was not portable as written: its permission table is CDC's
surface (`usage.read`, `logs.read`, `chat.send`, `plugins.*`), none of which
exists in contract v1, and shipping it would have told authors to declare
permissions Radium refuses on install. So the docs describe the contract that
is actually frozen, and the example is a new panel that exercises it —
`panel.tools()`, `panel.callTool()`, `panel.get`/`set`, `onTheme` and
`ready()`, with `permission_denied` handled as the actionable error it is.

Both are held to the schema by two new tests in `tests/panel-contract.test.mjs`:

- the example validates against the frozen schema, its `id` equals its folder
  name, and every SDK call it makes is covered by a permission it declares;
- the permission table in the docs and the core permissions in
  `panel.schema.json` must be *equal*, not merely overlapping. Documenting a
  permission the host would reject is the worse of the two failures, so the
  check runs in both directions. First written as "is each permission
  mentioned somewhere", which passed while the table was mutated — the
  tightened version fails on an added row and on a renamed one alike.

### The two CI blockers that were not this plan's

Step 34 is `make verify`, which was red on `main` before this branch started.
Four of its five causes were fixed in Phase 0. The remaining two:

**`run-lint` (JSCPD)** was this branch's: the two parallel
`tauri::generate_handler!` lists in `src-tauri/src/lib.rs` are a clone, and
adding the five panel commands to both lengthened it. The file is now excluded
in `.github/linters/.jscpd.json`, with the reasoning recorded beside the other
exclusions in the workflow: Tauri's proc macro needs each list spelled out
literally, and splicing a shared list through a `macro_rules!` wrapper would
hide the whole IPC surface from the two guards that read `lib.rs` textually
(`ipc-contract.test.ts`, which pins which handlers are desktop-only, and
`tests/capabilities.test.mjs`). Those guards are worth more than the clone
report. jscpd over this branch's 54 changed files now reports zero clones, and
the threshold stays at 0 everywhere else.

**`Repository verification`** was `main`'s, from the NVIDIA skills catalogue
imported in `d60f2408`. 91 of its 407 skills have a `description` that folds
out past the 512-character cap, so this repository's parser refuses them; two
tests in `seeding.rs` asserted the authoring limits across every bundled skill
and died on the first one. The fix separates the two things now living in
`resources/agent-skills`: a `reviewed_platform_policy()` naming the 25 skills
this repository added and reviewed one at a time, and the mirrored catalogue,
which its own README says must not be hand-edited.

The authoring limits — description length, and a body that survives
`LOADED_SKILL_BODY_MAX_CHARS` — are asserted against the reviewed set, because
they are rules for skills *we* write. Against the mirror they leave only worse
options: edit 91 vendored files that the next sync overwrites, or raise a cap
that exists to keep descriptions out of every prompt.

What the mirror breaks is pinned rather than hidden, by
`mirrored_skills_the_parser_refuses_cannot_grow`:

- no reviewed skill is ever among the refused — a hard assertion with no
  ceiling, verified by temporarily naming a refused mirrored skill as reviewed
  and watching it fire;
- the refused count cannot grow past 91. A mirror update that brings more
  broken skills fails here instead of shipping them quietly; the ceiling may
  shrink freely, and the failure message prints the full set so a diagnosis
  needs no second run.

Those skills are not silently dropped at runtime either: the registry reports
each as broken with its reason, which is why pinning the count is enough.

Two counts were wrong on the way to this and are worth recording, because both
came from measuring with the wrong tool. The refused set was first reported as
90 from a glance at a test failure, and before that as 11 from a Python regex
that only read single-line `description:` values — the catalogue writes them as
YAML folded scalars, so the regex missed every multi-line one. The number is 91,
from the parser itself.

Two `skill_run_script` process-tree tests fail in this container and are
unrelated to any of this. They were unverifiable from here, so they were
reported as unverified rather than as passing — and CI then settled it: the
same suite is green on a runner, which confirms those two failures are the
sandbox's missing process-group reaping and not a real defect.

**Confirmed on CI (2026-10-03, `15e7e910`).** `Repository verification` and
`run-lint` are both green, having been red on `main` and on this branch
respectively, and every other check passes — all thirteen super-linter
validators, clippy, CodeQL, DevSkim, the six CodeQL analyses, and the unsigned
Windows installer build. `mergeable_state: clean`.

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
