# Extend existing panels with window and canvas layouts

Date: 2026-10-16. Status: first implementation slice.

## Context

The user wants plugin GUIs to open in Radium panels, with Windows-style movement
and resizing or an optional spatial canvas with grid snapping and connections.
The existing Workspace and custom panel v1 host already implement discovery,
installation, restricted iframes and a Rust-authorized message bridge.

## Decision

Extend that host, retaining split layout for existing boards. Version the
presentation state and distinguish panel instances from definitions. Keep separate
rectangles for Windows and Canvas. Reuse the existing visual styling and frozen
panel v1 schema.

Provide a dedicated workspace HTML entry for a single named native window.
Do not load main.tsx, ExtensionProvider, DataProvider or model startup coordinators
there. One workspace presentation holds a Web Lock; a second presentation reports
that it is already open rather than editing the same localStorage document.

Use DOM panel frames on a transformed spatial surface. This first slice needs no
new runtime dependency. Grid snapping and canvas positioning are presentation
features. Connections, data execution and Cordis service adapters remain separate
milestones; this does not implement a sandbox for backend plugin code.

The Extend action creates/focuses the existing named workspace window. The sidebar
Workspace route becomes a launcher on desktop so it does not run a second board.
Browser preview may render the board directly, under the same single-owner lock.

## Consequences

No model is loaded merely by opening the workspace. Native custom panel GUIs keep
using the existing Rust commands and iframe sandbox. Panel v1 permissions and
per-definition storage remain unchanged; arbitrary GUI plugins cannot obtain a
raw Cordis context. Multiple instances of a v1 custom panel are deliberately not
offered until per-instance storage/session semantics are versioned.

Presentation state is still localStorage-backed for this slice. This is not the
final native transactional coordinator and does not support concurrent board
editing, dock/detach transfer or multiple saved workspaces. Future schema versions
must be rejected without overwriting their data. Migrations retain a backup.

A separate entry avoids duplicate startup, but live built-in status must be
forwarded as an explicit read-only snapshot; never copy prompt/reply content,
credentials, provider secrets or executable callbacks into it.

## Validation

See the execution ledger in
docs/superpowers/plans/2026-10-16-plugin-panel-workspace-progress.md for actual
commands/results and remaining packaged Windows checks.
