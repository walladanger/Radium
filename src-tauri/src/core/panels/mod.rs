//! Custom panels: third-party UI the user installs from a folder.
//!
//! A panel is a folder holding `panel.json` plus its own HTML and JS. It runs
//! in an iframe with `sandbox="allow-scripts"` on the `panel://` origin — an
//! opaque origin, no host IPC, no file system, and `connect-src 'none'` — and
//! reaches the host only through a bridge that authorises every call against
//! the permissions its manifest declares.
//!
//! Deliberately separate from the extension system. Extensions are trusted
//! services this app ships and loads in-process; panels are untrusted UI
//! someone else wrote. Two trust classes, two mechanisms, and the sandbox is
//! the only reason the second one can exist at all.
//!
//! Decision: docs/decisions/2026-10-03-port-the-panel-mechanism-from-claudedesktopclient-not-its.md
//! Contract: docs/superpowers/specs/2026-10-03-panel-contract-v1.md
//! Plan: docs/superpowers/plans/2026-10-03-radium-panel-system-implementation.md

pub mod bridge;
pub mod commands;
pub mod host;
pub mod manifest;
pub mod protocol;
pub mod registry;
pub mod resolve;

#[cfg(test)]
mod tests;

use std::borrow::Cow;
use tauri::http::{Request, Response};
use tauri::{Manager, Runtime, UriSchemeContext};

/// Panels live beside the other per-user state, one folder each.
///
/// Resolved through `get_jan_data_folder_path` rather than `app_data_dir()`
/// directly, so panels follow the data folder wherever it is configured —
/// including the move the product rename made, and the override the tests use.
pub fn panels_root<R: Runtime>(app: &tauri::AppHandle<R>) -> std::path::PathBuf {
    crate::core::app::commands::get_jan_data_folder_path(app.clone()).join("panels")
}

/// Per-panel key/value storage, kept out of the panel folders so uninstalling
/// a panel cannot take a user's settings with it by accident, and reinstalling
/// one does not inherit a stranger's state.
pub fn panel_storage_root<R: Runtime>(app: &tauri::AppHandle<R>) -> std::path::PathBuf {
    crate::core::app::commands::get_jan_data_folder_path(app.clone()).join("panel-storage")
}

/// Serves `panel://<id>/<path>` (and `http://panel.localhost/<id>/<path>` on
/// Windows). Registered in `lib.rs` next to the `artifact` scheme.
pub fn handle_panel_request<R: Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
) -> Response<Cow<'static, [u8]>> {
    let Some((panel_id, path)) = protocol::split_request(&request) else {
        return Response::builder()
            .status(400)
            .header("Content-Type", "text/plain; charset=utf-8")
            .body(Cow::Borrowed(b"panel id missing" as &[u8]))
            .unwrap_or_else(|_| Response::new(Cow::Borrowed(b"" as &[u8])));
    };

    let app = ctx.app_handle();
    let not_ready = |message: &'static str| {
        Response::builder()
            .status(500)
            .header("Content-Type", "text/plain; charset=utf-8")
            .body(Cow::Borrowed(message.as_bytes()))
            .unwrap_or_else(|_| Response::new(Cow::Borrowed(b"" as &[u8])))
    };

    let root = panels_root(app);
    let Ok(resource_dir) = app.path().resource_dir() else {
        return not_ready("resource directory unavailable");
    };

    protocol::serve(
        &root,
        &protocol::contract_dir(&resource_dir),
        &panel_id,
        &path,
    )
}
