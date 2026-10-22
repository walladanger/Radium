# Panel host directory checks

Run `cargo test --manifest-path tests/panel-host/Cargo.toml` from the repository root.

This small crate compiles the actual manifest, filesystem, registry and protocol
source modules and their directory regressions. Tauri's `http` reexport is supplied
by the same HTTP crate; no filesystem/registry implementation is copied or mocked.
It verifies discovery, shared protocol/CSP, containment, installation, duplicate
identity protection, and removal across both install roots.

It does not compile the Tauri command macros or test native IPC, WebView2, window
capabilities, or the Cordis runtime. Run native app tests and packaged Windows
acceptance separately before release.
