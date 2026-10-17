//! Desktop adapter for the shared Radium agent loop.
use super::{
    llm_client::{AgentLlmClient, SamplingOverrides},
    mcp_tools::McpBridge,
    model_profile::AgentModelProfile,
    path_policy::EditableRoots,
    pty::PtyRegistry,
    rag_bridge::DocsBridge,
    session::AgentSessionState,
    skills::SkillRegistry,
    tools::{ApprovalHook, DesktopServices, FolderAccessHook, DelegateHook},
    types::{AgentEvent, AgentReasoning, ToolCallPayload, ToolOutcome},
};
use async_trait::async_trait;
pub use atomic_agent_core::runner::{MAX_PARALLEL_TOOL_CALLS, MAX_STEPS, AGENT_SLOT_ID, ANY_SLOT};
use std::path::{Path, PathBuf};
use tokio_util::sync::CancellationToken;
pub struct RunTurnInput<'a> {
    pub delegate: Option<&'a dyn DelegateHook>,
    pub slot_id: i32,
    pub run_id: &'a str,
    pub session_id: &'a str,
    pub user_message: &'a str,
    pub selected_skill: Option<&'a str>,
    pub stable_prefix: &'a str,
    pub model_profile: AgentModelProfile,
    pub working_dir: &'a Path,
    pub editable_roots: &'a EditableRoots,
    pub external_read_only_roots: &'a [PathBuf],
    pub trusted_read_roots: &'a [PathBuf],
    pub max_steps: u32,
    /// Thinking intent for this turn. Drives the GBNF prelude and, on
    /// llama.cpp, the reasoning-budget sampler.
    pub reasoning: AgentReasoning,
    /// Assistant sampling overrides for this turn. `Default` keeps the agent's
    /// tuned sampler untouched.
    pub sampling: &'a SamplingOverrides,
    /// The turn's MCP catalog and dispatcher. `None` disables `mcp.*` tools.
    pub mcp: Option<&'a dyn McpBridge>,
    /// The turn's document-index dispatcher. `None` disables `docs.*` tools.
    pub docs: Option<&'a dyn DocsBridge>,
    /// Pre-rendered `### documents` note for the variable tail.
    pub documents_note: Option<&'a str>,
    /// Built-in tools switched off for this turn (e.g. `os.web.*`).
    pub disabled_tools: &'a std::collections::BTreeSet<String>,
    /// Auto-approve MCP-origin tools (migrated chat `allowAllMCPPermissions`).
    pub auto_approve_mcp: bool,
    pub client: &'a dyn AgentLlmClient,
    pub approval: &'a dyn ApprovalHook,
    pub folder_access: &'a dyn FolderAccessHook,
    pub desktop: &'a dyn DesktopServices,
    pub cancellation: &'a CancellationToken,
    pub session: &'a mut AgentSessionState,
    pub skill_registry: &'a SkillRegistry,
    pub bundled_script_runtime: Option<&'a Path>,
    /// Processes started in earlier turns of this session, plus any this turn
    /// starts. Shared app-wide and scoped by `session_id`.
    pub pty: &'a PtyRegistry,
    /// Cache directory for the code index.
    pub cache_dir: &'a Path,
}

pub async fn run_turn(
    input: RunTurnInput<'_>,
    emit: impl FnMut(AgentEvent) -> Result<(), String> + Send,
) -> Result<(), String> {
    let executor = NativeToolExecutor {
        delegate: input.delegate,
        desktop: input.desktop,
        pty: input.pty,
        cache_dir: input.cache_dir,
    };
    // Dependency crates are not compiled with cfg(test) for desktop tests.
    // Preserve the original native deadline fixture through the injected seam.
    let deadline = if cfg!(test) {
        std::time::Duration::from_millis(100)
    } else {
        atomic_agent_core::runner::DEFAULT_COMPLETION_DEADLINE
    };
    atomic_agent_core::runner::run_turn_with_deadline(
        atomic_agent_core::runner::RunTurnInput {
            slot_id: input.slot_id,
            run_id: input.run_id,
            session_id: input.session_id,
            user_message: input.user_message,
            selected_skill: input.selected_skill,
            stable_prefix: input.stable_prefix,
            model_profile: input.model_profile,
            working_dir: input.working_dir,
            editable_roots: input.editable_roots,
            external_read_only_roots: input.external_read_only_roots,
            trusted_read_roots: input.trusted_read_roots,
            max_steps: input.max_steps,
            reasoning: input.reasoning,
            sampling: input.sampling,
            mcp: input.mcp,
            docs: input.docs,
            documents_note: input.documents_note,
            disabled_tools: input.disabled_tools,
            auto_approve_mcp: input.auto_approve_mcp,
            client: input.client,
            approval: input.approval,
            folder_access: input.folder_access,
            cancellation: input.cancellation,
            session: input.session,
            skill_registry: input.skill_registry,
            bundled_script_runtime: input.bundled_script_runtime,
            executor: &executor,
        },
        deadline,
        emit,
    )
    .await
}
struct NativeToolExecutor<'a> {
    delegate: Option<&'a dyn DelegateHook>,
    desktop: &'a dyn DesktopServices,
    pty: &'a PtyRegistry,
    cache_dir: &'a Path,
}
#[async_trait]
impl atomic_agent_core::tools::ToolExecutor for NativeToolExecutor<'_> {
    async fn execute(
        &self,
        call: &ToolCallPayload,
        context: &atomic_agent_core::tools::ToolContext<'_>,
    ) -> ToolOutcome {
        super::tools::execute(
            call,
            &super::tools::ToolContext {
                delegate: self.delegate,
                session_id: context.session_id,
                working_dir: context.working_dir,
                editable_roots: context.editable_roots,
                trusted_read_roots: context.trusted_read_roots,
                client: context.client,
                approval: context.approval,
                folder_access: context.folder_access,
                cancellation: context.cancellation,
                loaded_tools: context.loaded_tools,
                loaded_skills: context.loaded_skills,
                skill_registry: context.skill_registry,
                bundled_script_runtime: context.bundled_script_runtime,
                desktop: self.desktop,
                pty: self.pty,
                cache_dir: self.cache_dir,
                mcp: context.mcp,
                docs: context.docs,
                disabled_tools: context.disabled_tools,
                auto_approve_mcp: context.auto_approve_mcp,
            },
        )
        .await
    }
}
