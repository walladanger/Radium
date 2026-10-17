//! Execution is a host capability. The core never opens a shell or exposes host tools.
pub mod tool_view;
use crate::{
    llm_client::AgentLlmClient,
    mcp_tools::McpBridge,
    path_policy::EditableRoots,
    rag_bridge::DocsBridge,
    skills::{loaded::LoadedSkills, SkillRegistry},
    types::{ApprovalDecision, ApprovalRequest, FolderAccessRequest, ToolCallPayload, ToolOutcome},
};
use async_trait::async_trait;
use serde_json::Value;
use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
};
use tokio_util::sync::CancellationToken;

#[async_trait]
pub trait ApprovalHook: Send + Sync {
    async fn is_allowed(&self, fingerprint: &str) -> bool;
    async fn request(&self, request: ApprovalRequest) -> Result<ApprovalDecision, String>;
}
#[async_trait]
pub trait FolderAccessHook: Send + Sync {
    async fn request(&self, request: FolderAccessRequest) -> Result<bool, String>;
}
#[async_trait]
pub trait DesktopServices: Send + Sync {
    async fn write_clipboard(&self, text: String) -> Result<(), String>;
    async fn notify(&self, title: String, body: String) -> Result<(), String>;
}
/// Native hosts may provide one-level delegation. Sandboxed workers omit it.
#[async_trait]
pub trait DelegateHook: Send + Sync {
    async fn delegate(&self, specialist: &str, task: &str) -> ToolOutcome;
}
/// Implementations enforce permissions, cancellation and isolation before dispatch.
#[async_trait]
pub trait ToolExecutor: Send + Sync {
    async fn execute(&self, call: &ToolCallPayload, context: &ToolContext<'_>) -> ToolOutcome;
}
pub struct ToolContext<'a> {
    pub session_id: &'a str,
    pub working_dir: &'a Path,
    pub editable_roots: &'a EditableRoots,
    pub trusted_read_roots: &'a [PathBuf],
    pub client: Option<&'a dyn AgentLlmClient>,
    pub approval: &'a dyn ApprovalHook,
    pub folder_access: &'a dyn FolderAccessHook,
    pub cancellation: &'a CancellationToken,
    pub loaded_tools: &'a tool_view::LoadedTools,
    pub loaded_skills: &'a LoadedSkills,
    pub skill_registry: &'a SkillRegistry,
    pub bundled_script_runtime: Option<&'a Path>,
    pub mcp: Option<&'a dyn McpBridge>,
    pub docs: Option<&'a dyn DocsBridge>,
    pub disabled_tools: &'a BTreeSet<String>,
    pub auto_approve_mcp: bool,
    pub executor: &'a dyn ToolExecutor,
}
pub async fn execute(call: &ToolCallPayload, context: &ToolContext<'_>) -> ToolOutcome {
    if context.cancellation.is_cancelled() {
        return ToolOutcome {
            status: crate::types::ToolStatus::Cancelled,
            summary: "Tool call cancelled".into(),
            details: None,
        };
    }
    if context.disabled_tools.contains(&call.tool) {
        return ToolOutcome::error(format!("Tool disabled for this turn: {}", call.tool));
    }
    context.executor.execute(call, context).await
}
pub(super) fn required_string(args: &Value, key: &str) -> Result<String, String> {
    args.get(key)
        .and_then(Value::as_str)
        .map(str::to_owned)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("Missing non-empty string argument `{key}`"))
}
