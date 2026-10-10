//! The `panel://` scheme.
//!
//! Modelled on `core::artifact`, which already serves HTML into a sandboxed
//! iframe under a per-response CSP — but with the policy inverted. Artifacts
//! are deliberately permissive because a generated page needs to do whatever
//! it was generated to do. A panel is third-party code the user installed from
//! a folder, so it gets the opposite: no network at all.
//!
//! `panel://<id>/<path>` serves a file from that panel's folder.
//! `panel://<id>/panel-sdk.js` and `/panel-theme.css` serve the frozen
//! contract files to every panel, so an author never vendors their own copy
//! and every panel on the board agrees about the host.

use super::registry::PanelRegistry;
use super::resolve::{content_type_for, resolve_panel_file, RefusedPath};
use std::borrow::Cow;
use std::path::{Path, PathBuf};
use tauri::http::{Request, Response};

/// A panel may run inline script — most single-file panels are nothing but an
/// inline module — and may use data: and blob: for images it builds itself.
/// It may not reach the network: `connect-src 'none'` is the point of the
/// whole arrangement, and `default-src 'self'` keeps script and style to the
/// panel's own origin. No `unsafe-eval`: the main window dropped it in the
/// security hardening pass and a panel has no better claim to it.
pub const PANEL_CSP: &str = "default-src 'self'; \
script-src 'self' 'unsafe-inline'; \
style-src 'self' 'unsafe-inline'; \
img-src 'self' data: blob:; \
font-src 'self' data:; \
media-src 'self' data: blob:; \
connect-src 'none'; \
object-src 'none'; \
frame-ancestors *; \
base-uri 'none'; \
form-action 'none'";

/// Files served to every panel rather than from its folder.
const SHARED_FILES: [&str; 2] = ["panel-sdk.js", "panel-theme.css"];

fn text_response(status: u16, body: &'static str) -> Response<Cow<'static, [u8]>> {
    Response::builder()
        .status(status)
        .header("Content-Type", "text/plain; charset=utf-8")
        .body(Cow::Borrowed(body.as_bytes()))
        .unwrap_or_else(|_| Response::new(Cow::Borrowed(b"" as &[u8])))
}

fn file_response(path: &Path, body: Vec<u8>) -> Response<Cow<'static, [u8]>> {
    Response::builder()
        .status(200)
        .header("Content-Type", content_type_for(path))
        .header("Content-Security-Policy", PANEL_CSP)
        // A panel's files change when the user edits them on disk, and a
        // stale cache would make that look broken.
        .header("Cache-Control", "no-store")
        // Belt and braces alongside the CSP.
        .header("X-Content-Type-Options", "nosniff")
        .body(Cow::Owned(body))
        .unwrap_or_else(|_| Response::new(Cow::Borrowed(b"" as &[u8])))
}

/// Serve one `panel://` request.
///
/// `panels_root` is where installed panels live and `contract_dir` is where the
/// frozen SDK and theme live; both are passed in so this stays testable without
/// an app handle.
pub fn serve(
    panels_root: &Path,
    contract_dir: &Path,
    panel_id: &str,
    request_path: &str,
) -> Response<Cow<'static, [u8]>> {
    let relative = request_path.trim_start_matches('/');
    if let Some(shared) = SHARED_FILES.iter().find(|name| **name == relative) {
        return match std::fs::read(contract_dir.join(shared)) {
            Ok(body) => file_response(Path::new(shared), body),
            Err(_) => text_response(404, "contract file not found"),
        };
    }

    let registry = match PanelRegistry::load(panels_root) {
        Ok(registry) => registry,
        Err(_) => return text_response(500, "panels directory unavailable"),
    };
    let Some(panel) = registry.get(panel_id) else {
        // Broken and unknown panels are indistinguishable from out here on
        // purpose; the panel manager is where the reason is shown.
        return text_response(404, "unknown panel");
    };

    match resolve_panel_file(&panel.path, request_path, &panel.manifest.entry) {
        Ok(path) => match std::fs::read(&path) {
            Ok(body) => file_response(&path, body),
            Err(_) => text_response(404, "not found"),
        },
        Err(RefusedPath::Missing) => text_response(404, "not found"),
        // Suspicious and escaping paths both answer 403 without saying which,
        // so a probe cannot map the filesystem by reading error messages.
        Err(RefusedPath::Suspicious) | Err(RefusedPath::Escapes) => text_response(403, "forbidden"),
    }
}

/// Split a `panel://<id>/<path>` request into its id and path.
///
/// On Windows the same request arrives as `http://panel.localhost/<id>/<path>`,
/// where the id is the first path segment rather than the host, so both shapes
/// are handled here instead of at the call site.
pub fn split_request(request: &Request<Vec<u8>>) -> Option<(String, String)> {
    let uri = request.uri();
    let host = uri.host().unwrap_or_default();
    let path = uri.path();

    if host.is_empty() || host == "panel.localhost" || host == "localhost" {
        let trimmed = path.trim_start_matches('/');
        let (id, rest) = match trimmed.split_once('/') {
            Some((id, rest)) => (id, rest),
            None => (trimmed, ""),
        };
        if id.is_empty() {
            return None;
        }
        return Some((id.to_string(), format!("/{rest}")));
    }
    Some((host.to_string(), path.to_string()))
}

/// Where the frozen contract files live inside the bundle, named the same way
/// `BUNDLED_AGENT_SKILLS_RESOURCE_DIR` names the bundled skills.
pub const BUNDLED_PANEL_CONTRACT_RESOURCE_DIR: &str = "resources/panel-contract";

/// Resolve the contract directory from the app's resource directory. In a dev
/// run Tauri copies `bundle.resources` into the target directory, so the same
/// join works there and in a packaged build.
pub fn contract_dir(resource_dir: &Path) -> PathBuf {
    resource_dir.join(BUNDLED_PANEL_CONTRACT_RESOURCE_DIR)
}
