//! Dynamic MCP tools for the agent loop.
//!
//! The user's connected MCP servers are snapshotted **once per turn** into an
//! [`McpCatalog`]: each remote tool gets a namespaced agent-facing name
//! (`mcp.<server-slug>.<tool>`), a one-line catalog entry in the prompt, an
//! alternation branch in the GBNF grammar / JSON schema, and a dispatch path
//! through [`McpBridge`]. Freezing the set per turn keeps every prompt within
//! the turn byte-stable (KV-cache friendly); a changed server set costs one
//! prefix re-ingest at the next turn boundary.
//!
//! Names are namespaced but never *parsed*: the catalog owns the exact
//! `agent name → (server, tool)` mapping, so dots or dashes inside server and
//! tool names cannot cause ambiguity.

use std::collections::BTreeSet;
use std::time::Duration;

use async_trait::async_trait;
use rmcp::model::CallToolResult;
use rmcp::{service::Peer, RoleClient};
use serde_json::Value;
use tokio::time::timeout;
use tokio_util::sync::CancellationToken;

use crate::core::mcp::constants::DEFAULT_MCP_TOOL_LIST_TIMEOUT_SECS;
use crate::core::state::{AppState, SharedMcpServers};

/// Reserved namespace for MCP-origin tools. No built-in tool may use it
/// (pinned by a test in `grammar.rs`).
pub use atomic_agent_core::mcp_tools::*;
const EXCLUDED_SERVERS: &[&str] = &["exa"];
fn is_read_only(tool: &rmcp::model::Tool) -> bool {
    tool.annotations
        .as_ref()
        .and_then(|annotations| annotations.read_only_hint)
        == Some(true)
}

/// Snapshot every connected server's tool list into a catalog.
///
/// Follows the ATO-271 discipline: clone `(name, Peer)` handles under the map
/// lock, release it, then list concurrently with a short per-server timeout —
/// a dead server delays only itself and is skipped. `disabled_keys` uses the
/// frontend's `server::tool` composite format (`useToolAvailable`).
pub async fn snapshot_catalog(state: &AppState, disabled_keys: &BTreeSet<String>) -> McpCatalog {
    let list_timeout = Duration::from_secs(DEFAULT_MCP_TOOL_LIST_TIMEOUT_SECS);
    let handles: Vec<(String, Peer<RoleClient>)> = {
        let servers = state.mcp_servers.lock().await;
        servers
            .iter()
            .filter(|(name, _)| !EXCLUDED_SERVERS.contains(&name.as_str()))
            .map(|(name, service)| (name.clone(), service.peer()))
            .collect()
    };

    let per_server = handles.into_iter().map(|(server, peer)| async move {
        match timeout(list_timeout, peer.list_all_tools()).await {
            Ok(Ok(tools)) => Some((server, tools)),
            Ok(Err(error)) => {
                log::warn!("Agent MCP catalog: server {server} failed to list tools: {error}");
                None
            }
            Err(_) => {
                log::warn!(
                    "Agent MCP catalog: server {server} tool listing timed out after {}s",
                    list_timeout.as_secs()
                );
                None
            }
        }
    });

    let mut descriptors = Vec::new();
    for listed in futures_util::future::join_all(per_server).await {
        let Some((server, tools)) = listed else {
            continue;
        };
        for tool in tools {
            if disabled_keys.contains(&format!("{server}::{}", tool.name)) {
                continue;
            }
            descriptors.push(McpToolDescriptor {
                agent_name: agent_tool_name(&server, &tool.name),
                server: server.clone(),
                tool: tool.name.to_string(),
                description: tool
                    .description
                    .as_ref()
                    .map(|description| description.to_string())
                    .unwrap_or_default(),
                input_schema: Value::Object((*tool.input_schema).clone()),
                read_only: is_read_only(&tool),
            });
        }
    }
    McpCatalog::from_tools(descriptors)
}

/// What the loop needs from MCP: name resolution and one call. A trait so
/// `runner_tests` can script it without any live server.
pub struct LiveMcpBridge {
    catalog: McpCatalog,
    servers: SharedMcpServers,
    call_timeout: Duration,
}

impl LiveMcpBridge {
    pub fn new(catalog: McpCatalog, servers: SharedMcpServers, call_timeout: Duration) -> Self {
        Self {
            catalog,
            servers,
            call_timeout,
        }
    }

    /// Tools dropped by the catalog cap, for the prompt's omission marker.
    pub fn omitted(&self) -> usize {
        self.catalog.omitted
    }
}

#[async_trait]
impl McpBridge for LiveMcpBridge {
    fn resolve(&self, agent_name: &str) -> Option<&McpToolDescriptor> {
        self.catalog.resolve(agent_name)
    }

    fn descriptors(&self) -> &[McpToolDescriptor] {
        self.catalog.descriptors()
    }

    async fn call(
        &self,
        descriptor: &McpToolDescriptor,
        args: &Value,
        cancellation: &CancellationToken,
    ) -> Result<CallToolResult, String> {
        // Lock only long enough to clone the peer (ATO-271): a slow call must
        // not block the app-wide server map.
        let peer = {
            let servers = self.servers.lock().await;
            servers
                .get(&descriptor.server)
                .map(crate::core::state::RunningServiceEnum::peer)
        };
        let Some(peer) = peer else {
            return Err(format!(
                "MCP server '{}' is not connected — it may have stopped; do not retry this tool",
                descriptor.server
            ));
        };
        let arguments = args.as_object().cloned();
        let call = peer.call_tool(crate::core::mcp::helpers::call_tool_params(
            descriptor.tool.clone(),
            arguments,
        ));
        tokio::select! {
            _ = cancellation.cancelled() => Err("Tool call cancelled".into()),
            result = timeout(self.call_timeout, call) => match result {
                Ok(result) => result.map_err(|error| error.to_string()),
                Err(_) => Err(format!(
                    "MCP tool '{}' timed out after {} seconds",
                    descriptor.tool,
                    self.call_timeout.as_secs()
                )),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn descriptor(server: &str, tool: &str) -> McpToolDescriptor {
        McpToolDescriptor {
            agent_name: agent_tool_name(server, tool),
            server: server.into(),
            tool: tool.into(),
            description: String::new(),
            input_schema: Value::Null,
            read_only: false,
        }
    }

    #[test]
    fn slugs_normalize_arbitrary_server_names() {
        assert_eq!(server_slug("Jan Browser MCP"), "jan-browser-mcp");
        assert_eq!(server_slug("exa"), "exa");
        assert_eq!(server_slug("  ~~~ "), "server");
        assert_eq!(server_slug("a__b--c"), "a__b-c");
    }

    #[test]
    fn agent_names_are_namespaced_and_bounded() {
        assert_eq!(
            agent_tool_name("Jan Browser MCP", "open_url"),
            "mcp.jan-browser-mcp.open_url"
        );
        let long = agent_tool_name("server", &"x".repeat(200));
        assert!(long.chars().count() <= MAX_AGENT_NAME_CHARS);
    }

    #[test]
    fn catalog_resolves_by_exact_name_and_dedupes_collisions() {
        let catalog = McpCatalog::from_tools(vec![descriptor("a.b", "c"), descriptor("a", "b.c")]);
        // Both slug to `mcp.a-b.c` / `mcp.a.b.c` style names; whatever the
        // collision outcome, resolution goes through the catalog only.
        let names = catalog.names();
        assert_eq!(names.len(), 2);
        for name in &names {
            let resolved = catalog.resolve(name).expect("resolvable");
            assert!(!agent_tool_name(&resolved.server, &resolved.tool).is_empty());
        }
        assert!(catalog.resolve("mcp.unknown.tool").is_none());
    }

    #[test]
    fn catalog_caps_size_and_counts_omissions() {
        let tools = (0..MAX_MCP_TOOLS + 5)
            .map(|index| descriptor("srv", &format!("tool{index:03}")))
            .collect();
        let catalog = McpCatalog::from_tools(tools);
        assert_eq!(catalog.descriptors().len(), MAX_MCP_TOOLS);
        assert_eq!(catalog.omitted, 5);
    }
}
