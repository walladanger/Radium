use async_trait::async_trait;
use rmcp::model::CallToolResult;
use serde_json::Value;
use std::collections::HashMap;
use tokio_util::sync::CancellationToken;
pub const MCP_TOOL_PREFIX: &str = "mcp.";

/// Hard cap on catalog size. Grammar alternations and the `# mcp` prompt block
/// stay bounded no matter how many servers the user connects.
pub const MAX_MCP_TOOLS: usize = 64;

/// Longest agent-facing name. Longer names are truncated before the collision
/// suffix is applied.
pub const MAX_AGENT_NAME_CHARS: usize = 96;

/// The built-in `os.web.search` / `os.web.fetch` already call the hosted Exa
/// MCP endpoint directly, so the `exa` server from the default config would
/// only duplicate them in the catalog. It stays available to the legacy chat
/// pipeline untouched.

#[derive(Debug, Clone)]
pub struct McpToolDescriptor {
    /// Namespaced name the model calls: `mcp.<server-slug>.<tool>`.
    pub agent_name: String,
    /// Connected server name, exactly as keyed in the MCP config.
    pub server: String,
    /// Original tool name on that server.
    pub tool: String,
    pub description: String,
    pub input_schema: Value,
    /// MCP `readOnlyHint` annotation. An untrusted claim by the server: shown
    /// to the model as `[read-only]`, but it never skips the approval gate.
    pub read_only: bool,
}

#[derive(Debug, Default)]
pub struct McpCatalog {
    tools: Vec<McpToolDescriptor>,
    by_name: HashMap<String, usize>,
    /// Tools dropped by [`MAX_MCP_TOOLS`]; surfaced in the prompt block.
    pub omitted: usize,
}

impl McpCatalog {
    pub fn from_tools(mut tools: Vec<McpToolDescriptor>) -> Self {
        // Deterministic order → byte-stable prompt and grammar.
        tools.sort_by(|a, b| (&a.server, &a.tool).cmp(&(&b.server, &b.tool)));
        let omitted = tools.len().saturating_sub(MAX_MCP_TOOLS);
        tools.truncate(MAX_MCP_TOOLS);
        let mut by_name = HashMap::with_capacity(tools.len());
        for (index, descriptor) in tools.iter_mut().enumerate() {
            let mut candidate = descriptor.agent_name.clone();
            let mut suffix = 2;
            while by_name.contains_key(&candidate) {
                candidate = format!("{}-{suffix}", descriptor.agent_name);
                suffix += 1;
            }
            descriptor.agent_name = candidate.clone();
            by_name.insert(candidate, index);
        }
        Self {
            tools,
            by_name,
            omitted,
        }
    }

    pub fn resolve(&self, agent_name: &str) -> Option<&McpToolDescriptor> {
        self.by_name
            .get(agent_name)
            .and_then(|index| self.tools.get(*index))
    }

    pub fn descriptors(&self) -> &[McpToolDescriptor] {
        &self.tools
    }

    pub fn names(&self) -> Vec<String> {
        self.tools
            .iter()
            .map(|descriptor| descriptor.agent_name.clone())
            .collect()
    }

    pub fn is_empty(&self) -> bool {
        self.tools.is_empty()
    }
}

/// Lowercased `[a-z0-9_-]` form of a server name for the agent-facing
/// namespace. Purely cosmetic — the reverse mapping lives in the catalog.
pub fn server_slug(name: &str) -> String {
    let mut slug = String::with_capacity(name.len());
    let mut last_dash = false;
    for ch in name.to_lowercase().chars() {
        let mapped = if ch.is_ascii_alphanumeric() || ch == '_' {
            Some(ch)
        } else {
            None
        };
        match mapped {
            Some(ch) => {
                slug.push(ch);
                last_dash = false;
            }
            None if !last_dash && !slug.is_empty() => {
                slug.push('-');
                last_dash = true;
            }
            None => {}
        }
    }
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "server".into()
    } else {
        slug
    }
}

pub fn agent_tool_name(server: &str, tool: &str) -> String {
    let name = format!("{MCP_TOOL_PREFIX}{}.{tool}", server_slug(server));
    if name.chars().count() <= MAX_AGENT_NAME_CHARS {
        return name;
    }
    name.chars().take(MAX_AGENT_NAME_CHARS).collect()
}

/// Whether the raw rmcp tool advertises `readOnlyHint: true`.
#[async_trait]
pub trait McpBridge: Send + Sync {
    fn resolve(&self, agent_name: &str) -> Option<&McpToolDescriptor>;
    fn descriptors(&self) -> &[McpToolDescriptor];
    async fn call(
        &self,
        descriptor: &McpToolDescriptor,
        args: &Value,
        cancellation: &CancellationToken,
    ) -> Result<CallToolResult, String>;
}
