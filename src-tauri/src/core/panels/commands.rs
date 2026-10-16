//! IPC commands for the panel board.
//!
//! The frontend can list what is installed, install a folder, remove one,
//! open the panels directory, and relay a panel's request to the bridge.
//! Nothing here decides what a panel may do — `panels_request` hands straight
//! to `bridge::dispatch`, which is the single authorising choke point.

use super::bridge::{dispatch, PanelResponse};
use super::host::AppPanelHost;
use super::packages;
use super::registry::{BrokenPanel, InstalledPanel, PanelRegistry};
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Runtime};

#[derive(Debug, Serialize)]
pub struct PanelListing {
    pub installed: Vec<InstalledPanel>,
    /// Reported rather than hidden, so a panel that fails to load says why
    /// instead of silently not appearing.
    pub broken: Vec<BrokenPanel>,
}

#[tauri::command]
pub async fn panels_list<R: Runtime>(app: AppHandle<R>) -> Result<PanelListing, String> {
    let root = super::panels_root(&app);
    let cordis = super::cordis_plugins_root(&app);
    let registry =
        tokio::task::spawn_blocking(move || PanelRegistry::load_combined(&root, &cordis))
            .await
            .map_err(|error| format!("Listing panels failed: {error}"))??;
    Ok(PanelListing {
        installed: registry.installed().cloned().collect(),
        broken: registry.broken().to_vec(),
    })
}

/// Copy a validated GUI bundle into the selected plugin directory.
///
/// The frontend picks the folder — same division as `agent_import_skill`,
/// which keeps the native dialog on the side that already owns it. The
/// manifest is validated *before* anything is copied, so a bad folder cannot
/// leave a half-installed panel behind.
#[tauri::command]
pub async fn panels_install<R: Runtime>(
    app: AppHandle<R>,
    source_path: String,
    source: Option<String>,
) -> Result<super::manifest::PanelManifest, String> {
    let panels = super::panels_root(&app);
    let cordis = super::cordis_plugins_root(&app);
    tokio::task::spawn_blocking(move || {
        packages::install_package(&panels, &cordis, Path::new(&source_path), source.as_deref())
    })
    .await
    .map_err(|error| format!("Panel install failed: {error}"))?
}

#[tauri::command]
pub async fn panels_remove<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    let root = super::panels_root(&app);
    let cordis = super::cordis_plugins_root(&app);
    tokio::task::spawn_blocking(move || packages::remove_package(&root, &cordis, &id))
        .await
        .map_err(|error| format!("Panel removal failed: {error}"))?
}

#[tauri::command]
pub async fn panels_open_folder<R: Runtime>(
    app: AppHandle<R>,
    source: Option<String>,
) -> Result<PathBuf, String> {
    let root = packages::select_root(
        &super::panels_root(&app),
        &super::cordis_plugins_root(&app),
        source.as_deref(),
    )?;
    fs::create_dir_all(&root)
        .map_err(|error| format!("Could not create the panels directory: {error}"))?;
    Ok(root)
}

/// Relay one request from a panel to the bridge.
///
/// `theme` comes from the renderer because the renderer owns it; a second copy
/// in the backend would be one more thing to keep in step. Everything else is
/// the bridge's decision, including whether this panel may ask at all.
#[tauri::command]
pub async fn panels_request<R: Runtime>(
    app: AppHandle<R>,
    panel_id: String,
    method: String,
    params: Option<Value>,
    theme: Option<String>,
) -> Result<PanelResponse, String> {
    let root = super::panels_root(&app);
    let lookup_id = panel_id.clone();
    let cordis = super::cordis_plugins_root(&app);
    let registry =
        tokio::task::spawn_blocking(move || PanelRegistry::load_combined(&root, &cordis))
            .await
            .map_err(|error| format!("Reading panels failed: {error}"))??;

    let Some(panel) = registry.get(&lookup_id) else {
        // Matches the contract's `unknown_panel`, and says nothing about
        // whether the panel exists but is broken.
        return Ok(PanelResponse::Err {
            ok: false,
            error: format!("No such panel: {lookup_id}"),
            code: "unknown_panel".to_string(),
        });
    };

    let host = AppPanelHost::new(app.clone(), theme);
    let params = params.unwrap_or(Value::Null);
    Ok(dispatch(&panel.manifest, &method, &params, &host).await)
}
