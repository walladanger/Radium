//! The real `PanelHost`: the bridge's view of this app.
//!
//! Deliberately thin. Everything interesting — which permission a method
//! needs, whether this panel holds it, which MCP servers it may reach — lives
//! in `bridge.rs` and is unit-tested there. What is left here is adapting that
//! to the MCP client and to per-panel storage on disk, so a mistake in this
//! file can lose a value or fail a call but cannot widen what a panel is
//! allowed to do.

use super::bridge::{PanelHost, PanelTool};
use async_trait::async_trait;
use serde_json::{json, Map, Value};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

pub struct AppPanelHost<R: Runtime> {
    app: AppHandle<R>,
    /// The theme the renderer is showing. Passed in per request rather than
    /// tracked here: the frontend owns the theme, and a copy in the backend
    /// would be one more thing to keep in step for no gain.
    theme: String,
    storage_root: PathBuf,
}

impl<R: Runtime> AppPanelHost<R> {
    pub fn new(app: AppHandle<R>, theme: Option<String>) -> Self {
        let storage_root = super::panel_storage_root(&app);
        Self {
            app,
            theme: theme.unwrap_or_else(|| "light".to_string()),
            storage_root,
        }
    }

    /// `<data>/panel-storage/<id>.json`. The id has already been validated
    /// against the manifest pattern (lowercase, digits, dashes), so it cannot
    /// contain a separator or `..`; the assertion here is a tripwire in case
    /// that ever stops being true.
    fn storage_file(&self, panel_id: &str) -> Result<PathBuf, String> {
        if panel_id.is_empty()
            || !panel_id
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        {
            return Err("invalid panel id".to_string());
        }
        Ok(self.storage_root.join(format!("{panel_id}.json")))
    }

    fn read_storage(&self, panel_id: &str) -> Result<Map<String, Value>, String> {
        let path = self.storage_file(panel_id)?;
        match fs::read_to_string(&path) {
            Ok(source) => match serde_json::from_str::<Value>(&source) {
                Ok(Value::Object(map)) => Ok(map),
                // A corrupt file reads as empty rather than failing every
                // call: a panel that cannot read its own settings should still
                // render, and the next write repairs it.
                _ => Ok(Map::new()),
            },
            Err(_) => Ok(Map::new()),
        }
    }

    fn write_storage(&self, panel_id: &str, map: &Map<String, Value>) -> Result<(), String> {
        let path = self.storage_file(panel_id)?;
        fs::create_dir_all(&self.storage_root)
            .map_err(|error| format!("could not create the panel storage directory: {error}"))?;
        let body = serde_json::to_string_pretty(&Value::Object(map.clone()))
            .map_err(|error| format!("could not serialise panel storage: {error}"))?;
        // Write-then-rename so an interrupted write cannot truncate what was
        // already there.
        let temporary = path.with_extension("json.tmp");
        fs::write(&temporary, body)
            .map_err(|error| format!("could not write panel storage: {error}"))?;
        fs::rename(&temporary, &path)
            .map_err(|error| format!("could not replace panel storage: {error}"))
    }
}

#[async_trait]
impl<R: Runtime> PanelHost for AppPanelHost<R> {
    fn app_version(&self) -> String {
        self.app.package_info().version.to_string()
    }

    fn platform(&self) -> String {
        std::env::consts::OS.to_string()
    }

    async fn theme(&self) -> String {
        self.theme.clone()
    }

    async fn list_tools(&self, servers: &[String]) -> Result<Vec<PanelTool>, String> {
        // An empty allowlist is a deliberate nothing, and asking MCP for
        // everything only to discard it would be both slower and riskier.
        if servers.is_empty() {
            return Ok(Vec::new());
        }
        let state = self
            .app
            .try_state::<crate::core::state::AppState>()
            .ok_or_else(|| "MCP is not available".to_string())?;
        let response = crate::core::mcp::commands::get_tools(self.app.clone(), state).await?;
        Ok(response
            .tools
            .into_iter()
            .filter(|tool| servers.contains(&tool.server))
            .map(|tool| PanelTool {
                name: tool.name,
                server: tool.server,
                description: tool.description,
            })
            .collect())
    }

    async fn call_tool(&self, server: &str, tool: &str, args: Value) -> Result<Value, String> {
        let state = self
            .app
            .try_state::<crate::core::state::AppState>()
            .ok_or_else(|| "MCP is not available".to_string())?;
        let arguments = match args {
            Value::Object(map) => Some(map),
            Value::Null => None,
            // A non-object `args` is the panel's mistake, and saying so beats
            // silently sending nothing.
            _ => return Err("`args` must be an object".to_string()),
        };
        let result = crate::core::mcp::commands::call_tool(
            self.app.clone(),
            state,
            tool.to_string(),
            Some(server.to_string()),
            arguments,
            None,
        )
        .await?;
        serde_json::to_value(result)
            .map_err(|error| format!("could not serialise the tool result: {error}"))
    }

    async fn storage_get(&self, panel_id: &str, key: Option<&str>) -> Result<Value, String> {
        let map = self.read_storage(panel_id)?;
        Ok(match key {
            Some(key) => map.get(key).cloned().unwrap_or(Value::Null),
            None => Value::Object(map),
        })
    }

    async fn storage_set(&self, panel_id: &str, key: &str, value: Value) -> Result<(), String> {
        let mut map = self.read_storage(panel_id)?;
        map.insert(key.to_string(), value);
        self.write_storage(panel_id, &map)
    }
}

/// The shape `host.info` reports when no panel is involved, used by the
/// frontend to show what a panel would be told.
pub fn host_summary<R: Runtime>(app: &AppHandle<R>) -> Value {
    json!({
        "version": app.package_info().version.to_string(),
        "platform": std::env::consts::OS,
        "contract": super::manifest::CONTRACT_VERSION,
    })
}
