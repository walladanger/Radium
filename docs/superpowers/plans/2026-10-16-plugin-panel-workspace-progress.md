# Execution ledger — Radium plugin panels and canvas

Plan: reports/Radium_Plugin_Panels_Canvas_Plan.md (session deliverable).
Base: b465d2f98e1ceb7581e8a19b7faf78ad30fbae72.
Branch: codex/plugin-panel-workspace. Full shallow clone; earlier snapshot is untouched.

User revoked previously supplied AGENTS.md instructions. This execution follows the user-approved plan and current tool constraints.

Preflight:
- Workspace instances feed both layout modes and must preserve definition identity.
- Native popout must not mount ExtensionProvider/DataProvider/StartupBackendCoordinator.
- Frozen panel v1 stays unchanged; Cordis backend integration depends on a later lifecycle adapter.
- Cross-window editing must be single-owner until a native coordinator is implemented.

Ruling: use a fresh feature checkout as the isolated workspace; no extra worktree is needed.
Ruling: begin the native entry with the existing panel contracts and layout modes; no external graph package or Cordis runtime is needed for this first vertical slice.
Ruling: preserve the split view during migration; Windows/Canvas are explicit choices rather than a forced layout change.
Ruling: use a single active workspace presentation with a Web Lock until the native coordinator exists; docking/detach and concurrent workspace editing remain later work.

Task 1: workspace model and store migration — in progress; tests written before implementation.

## Implementation and verification

Task 1: complete — versioned instances/geometry and v0 migration with original-byte backup.
Task 2: implemented — Extend action, singleton framed workspace entry, ownership lease and minimal native capability.
Task 3: implemented — Windows movement/resize/focus/minimize/maximize, Canvas pan/zoom/grid. Actual native acceptance remains unverified.
Task 4: first-slice review complete — fixes below; full workspace feature is not complete.

Validation before review: 347 web-app files passed, 4,169 tests passed,11 skipped.
Focused suite after review fixes: 83 passed.
Panel/window/capability Node contracts:18 passed.
Scoped ESLint:0 errors;7 existing builtin fast-refresh warnings.
Frontend Vite bundle: passed (both index.html and workspace.html).
Ordinary production typecheck: blocked by8 diagnostics in unchanged engine-settings-defaults.ts,
threads/$threadId.tsx and services/atomicMedia/client.ts, all related to newer standard-library APIs.
Diagnostic typecheck with --lib ES2023,DOM,DOM.Iterable: passed before review; rerun after fixes recorded below.
Root test orchestration: blocked by core config CJS/ESM under local PnP; --configLoader runner hits PnP conditions limitation.
Local PnP was necessary because workspace symlinks/junctions were denied; no lockfile or package-manager configuration was changed.
make and cargo are absent, so make verify and native compilation are unavailable.
Browser testing: CUA launcher missing Windows platform component; headless Edge also terminated before page load in sandbox.
No browser visual/native acceptance or performance claim is made.

Final: fixed standalone status defaults — safe server/download/tool metadata projections, no resume credentials.
Final: fixed status disconnect — repeat subscribe/freshness checks; unavailable builtins stop displaying stale measurements.
Final: fixed maximize after scrolling — frame anchors to visible Windows viewport; regression RED→GREEN.
Final: fixed silent custom-GUI reload at Split boundary — cancelable explicit acknowledgement; regression RED→GREEN.
Final: Ruling: regrade future-envelope migration safety as Important, and hydrate only under the lease — avoids overwriting newer saved state — cost if wrong: unavailable board until recovery.
Final: Ruling: retain Split as a compatibility renderer with explicit custom-GUI reload acknowledgement instead of redesigning split geometry now — cost: unsaved custom GUI state is lost only after acknowledgement. Windows↔Canvas keeps the same content DOM.
Final: Ruling: native/browser capability enforcement, mixed-DPI, real iframe gestures, packaged runtime duplication and measured overhead remain unverified — no release/merge claim.
Final: Ruling: Cordis lifecycle/contributions, typed connections/execution, docking/detach, thread pinning, groups and native transactional persistence remain later milestones — this branch is their UI foundation, not completed plugin execution.
Deferred minors: none; the review's migration concern was upgraded and fixed.

## Try the first slice

In a tested native build, use Extend workspace beside the chat controls or
Workspace → Open workspace in the sidebar. Add an existing/custom HTML panel.
Select Windows to move/resize/minimize/maximize it; select Canvas for world-space
placement, pan, zoom and grid snapping. A custom panel warns before switching to
or from Split because that compatibility transition reloads its GUI. Closing a
panel only closes its view. No Cordis plugin runtime is installed by this change.

Next implementation milestone: adapt one approved Cordis plugin's GUI into the
existing registry/bridge, then establish versioned ports and explicit-run graph
execution. Native acceptance is a gate before calling this UI ready to release.


## Final verification after review fixes

- Full web-app suite: 347 files passed; 4,174 tests passed, 11 skipped (144.23 seconds).
- Focused workspace suite: 83 passed.
- Panel/window/capability Node contracts rerun: 18 passed.
- Scoped ESLint rerun: 0 errors, 7 existing builtin fast-refresh warnings.
- Vite production build: passed, both HTML entry points (8.55 seconds).
- Diagnostic TypeScript check with ES2023 libraries: passed. Ordinary project typecheck remains blocked by the eight unchanged-file diagnostics described above.
- Root orchestration and native/browser acceptance remain blocked as described above. This is a local implementation checkpoint, not a release-ready build.

Continue with packaged Windows acceptance, then one real Cordis GUI contribution through the existing panel bridge. Typed connections and explicit execution follow that adapter.

## Separate Cordis directory follow-up

Requested: separate Cordis plugin directory with exactly the same panel access.
Implemented: `<data>/plugins/cordis/<id>` alongside `<data>/panels/<id>`; shared
listing, protocol/CSP/SDK, permission bridge, Add Panel and layout presentation.
The existing Install flow adds a directory selector; the manager adds a Cordis
folder button and removes bundles from their discovered root. Defaults preserve
ordinary-panel installation. Cross-root ID collisions are refused or disabled,
including broken-package identities; scoped errors still resolve to existing
board tiles. Pure filesystem helpers moved from commands into packages.rs so
these operations can be verified without starting the full desktop runtime.

GUI tests: two new controls failed before implementation; scoped error rendering
also failed before its fix. Native filesystem/registry/protocol regression suite:
10 passed using actual production modules in tests/panel-host. The native Cargo
app test build was attempted with the installed toolchain discovered under .cargo/bin;
compilation was blocked by ring/zstd-sys native build failures (zstd librarian
LNK1114/error 5). Earlier statement that Cargo was absent meant absent from PATH;
the toolchain is installed and the lightweight Rust suite now runs successfully.
No packaged/native IPC acceptance is claimed. Cordis runtime loading remains a
separate milestone; this follow-up establishes installation/discovery of its GUI
bundles via the current panel contract.

Final follow-up validation: full web-app suite 347 files passed, 4,177 tests
passed and 11 skipped (180.87 seconds). Focused panels: 86 passed. Lightweight
Rust host suite: 10 passed (subset-import dead-code warnings only). Node contracts:
18 passed. Scoped ESLint: 0 errors, 7 existing warnings. Production Vite bundle:
passed (9.65 seconds). ES2023 diagnostic typecheck: passed; standard tsc -b rerun
confirms the same eight diagnostics in unchanged files. Native app build/IPC
acceptance remains blocked/unverified as described above. Changes remain on the
local codex/plugin-panel-workspace feature branch; no merge or installation.
