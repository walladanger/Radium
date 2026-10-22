//! Exercise real panel filesystem/protocol code without building the desktop runtime.
#![cfg(test)]
extern crate self as tauri;
// Tauri reexports these same http types; no runtime IPC is replaced by this check.
pub mod http {
    pub use http_types::*;
}
#[path = "../../../src-tauri/src/core/panels/directory_tests.rs"]
mod directory_tests;
#[path = "../../../src-tauri/src/core/panels/manifest.rs"]
mod manifest;
#[path = "../../../src-tauri/src/core/panels/packages.rs"]
mod packages;
#[path = "../../../src-tauri/src/core/panels/protocol.rs"]
mod protocol;
#[path = "../../../src-tauri/src/core/panels/registry.rs"]
mod registry;
#[path = "../../../src-tauri/src/core/panels/resolve.rs"]
mod resolve;
