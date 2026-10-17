# Cordis plugin directory and panel access

Cordis GUI bundles live in `<Radium data>/plugins/cordis/<id>/`. Ordinary custom
panels remain in `<Radium data>/panels/<id>/`. Both follow the configured Radium
data folder and are created when the panel registry is loaded. Existing panels
are not moved.

| Action | Ordinary panels | Cordis GUI bundles |
| --- | --- | --- |
| Install | Install location: Panels, then Install | Install location: Cordis plugins, then Install |
| Open GUI | Add Panel | Add Panel |
| Browse files | Panels manager: Panels folder | Panels manager: Cordis plugins folder |
| Remove | Existing manager Remove action | Same Remove action |
| Workspace | Split, Windows, Canvas | Same layouts, saved geometry and grid controls |

A GUI bundle has `panel.json` and its HTML/JS assets directly in its `<id>` folder.
The manifest uses the unchanged panel contract v1 and its ID must match the folder.
The GUI is served as `panel://<id>/` through the existing sandbox, frozen SDK,
theme and permission-checking bridge. This directory integration does not execute
Cordis backend JavaScript or load npm packages. A raw Cordis package without a
panel GUI adapter is reported as broken; runtime lifecycle integration is a later
milestone.

The shared registry resolves listing, serving, bridge calls and removal across
both roots. IDs must be unique across them, including broken packages. Install
refuses an ID present in the other directory. If files are copied manually and
IDs collide, both are disabled and reported in the manager until resolved.
Broken-package error IDs include `panels:` or `cordis:` so removal targets the
correct folder; existing board IDs remain `panel:<id>`.

Per-panel settings stay in `<Radium data>/panel-storage/` and survive uninstall,
just as for existing panels. Runtime packages do not gain extra permissions by
being placed in the Cordis directory.

The existing `panels_install` and `panels_open_folder` IPC commands accept optional
`source: "cordis"`. Omit it (or use `"panels"`) for existing behavior. Other source
values are refused. `panels_list`, `panels_request` and `panels_remove` retain the
same call shape. No new panel picker or separate workspace is required.

## Verification

Run `cargo test --manifest-path tests/panel-host/Cargo.toml` for the real filesystem,
registry and protocol regressions without compiling the full desktop runtime.
Run the web-app panel tests for Install, folder access and board error display.
Native IPC and packaged Windows acceptance are separate required release checks.

On Windows, use `cargo test --manifest-path src-tauri/Cargo.toml --features test-tauri --lib core::panels::`
for native panel tests after preparing the normal app build assets. The
`test-tauri` feature embeds the Common Controls v6 test manifest; omitting it
can prevent the test executable from starting with `0xc0000139`. A shorter
`CARGO_TARGET_DIR` inside a writable temporary folder also avoids the native
librarian path failures encountered with this deep checkout path.
