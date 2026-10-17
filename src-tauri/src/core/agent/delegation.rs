//! `agent.delegate`: a coordinating turn hands one task to a specialist.
//!
//! A specialist is an assistant profile the frontend sends with the turn
//! (`AgentTurnRequest::specialists`). Delegating runs a complete, nested agent
//! turn for it:
//!
//! - **Its own prompt.** The stable prefix carries the specialist's
//!   instructions under `### assistant` and no `### specialists` roster, so a
//!   specialist cannot delegate further (one level deep, no recursion).
//! - **The same powers and limits.** Same model client, workspace roots,
//!   MCP/docs bridges, approval gate and cancellation token as the
//!   coordinator. Approval requests therefore reach the user's open thread
//!   exactly as the coordinator's own would.
//! - **A fresh, in-memory session.** The specialist sees only the task text,
//!   never the coordinator's conversation, and its transcript is not saved.
//!
//! - **Its own model, optionally.** A specialist that names a model runs on its
//!   own client; one that does not shares the coordinator's. Specialist turns
//!   let llama.cpp choose any idle slot, so they never evict the coordinator's
//!   pinned KV prefix.
//!
//! Only the specialist's final answer returns to the coordinator, as the
//! `agent.delegate` observation. Its events are forwarded to the UI wrapped in
//! `SpecialistEvent` under a lane id, bracketed by `SpecialistStarted` and
//! `SpecialistFinished`, so the frontend can draw one scrolling lane per
//! specialist while keeping `TurnStarted`/`TurnFinished` tied to the
//! coordinator's run.
//!
//! A step made only of `agent.delegate` calls runs its specialists at the same
//! time, at most [`MAX_PARALLEL_DELEGATIONS`] at once. Approval and
//! folder-access prompts from parallel specialists are asked one at a time, so
//! the user never has two dialogs competing for the same slot in the UI.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::{Mutex, Semaphore};
use tokio_util::sync::CancellationToken;

use super::llm_client::{AgentLlmClient, SamplingOverrides};
use super::mcp_tools::McpBridge;
use super::model_profile::AgentModelProfile;
use super::path_policy::EditableRoots;
use super::pty::PtyRegistry;
use super::rag_bridge::DocsBridge;
use super::resource_class::MAX_PARALLEL_DELEGATIONS;
use super::runner::{run_turn, RunTurnInput, ANY_SLOT};
use super::session::AgentSessionState;
use super::skills::SkillRegistry;
use super::tools::{ApprovalHook, DelegateHook, DesktopServices, FolderAccessHook};
use super::types::{
    AgentEvent, AgentReasoning, AgentSpecialist, ApprovalDecision, ApprovalRequest,
    FolderAccessRequest, ToolOutcome, ToolStatus,
};

/// The tool name, so callers can switch it off without repeating the literal.
pub const DELEGATE_TOOL: &str = "agent.delegate";
/// At most this many specialists per turn; each costs roster prompt space.
pub const MAX_SPECIALISTS: usize = 12;
/// A specialist's turn gets at most this many steps.
pub const MAX_SPECIALIST_STEPS: u32 = 24;
const MAX_NAME_CHARS: usize = 48;
const MAX_DESCRIPTION_CHARS: usize = 1_000;

/// Reject a roster the coordinator could not address unambiguously.
pub fn validate_specialists(specialists: &[AgentSpecialist]) -> Result<(), String> {
    if specialists.len() > MAX_SPECIALISTS {
        return Err(format!(
            "At most {MAX_SPECIALISTS} specialists can join a turn"
        ));
    }
    let mut seen = BTreeSet::new();
    for specialist in specialists {
        let name = specialist.name.trim();
        if name.is_empty() || name.chars().count() > MAX_NAME_CHARS {
            return Err(format!(
                "Specialist names must be 1-{MAX_NAME_CHARS} characters: '{name}'"
            ));
        }
        if name.chars().any(char::is_control) {
            return Err(format!(
                "Specialist name contains control characters: '{name}'"
            ));
        }
        if specialist.description.trim().is_empty() {
            return Err(format!("Specialist '{name}' needs a description"));
        }
        if specialist.description.chars().count() > MAX_DESCRIPTION_CHARS {
            return Err(format!("Specialist '{name}' has an overlong description"));
        }
        if !seen.insert(name.to_lowercase()) {
            return Err(format!("Two specialists are named '{name}'"));
        }
    }
    Ok(())
}

/// One specialist ready to run: its display name and pre-built stable prefix.
pub struct PreparedSpecialist {
    pub name: String,
    pub stable_prefix: String,
    /// The shared disabled set plus `agent.delegate` and the tool packs this
    /// specialist does not have.
    pub disabled_tools: BTreeSet<String>,
    /// Its own model, when it names one. `None` shares the coordinator's
    /// client and prompt profile.
    pub own_model: Option<SpecialistModel>,
}

/// A specialist's own transport, resolved before the coordinator starts.
pub struct SpecialistModel {
    pub client: Box<dyn AgentLlmClient>,
    pub model_profile: AgentModelProfile,
}

/// Sends one event to the coordinator's UI channel.
pub type SpecialistEmitter = Arc<dyn Fn(AgentEvent) -> Result<(), String> + Send + Sync>;

/// Per-turn bookkeeping shared by every lane: the concurrency cap, lane
/// numbering, and the locks that keep user prompts one at a time.
pub struct SpecialistLanes {
    slots: Semaphore,
    next_lane: AtomicUsize,
    prompts: Mutex<()>,
}

impl Default for SpecialistLanes {
    fn default() -> Self {
        Self {
            slots: Semaphore::new(MAX_PARALLEL_DELEGATIONS),
            next_lane: AtomicUsize::new(1),
            prompts: Mutex::new(()),
        }
    }
}

/// Approval hook that holds the lanes' prompt lock while a decision is open.
struct OnePromptAtATime<'a> {
    inner: &'a dyn ApprovalHook,
    folder_access: &'a dyn FolderAccessHook,
    lock: &'a Mutex<()>,
}

#[async_trait]
impl ApprovalHook for OnePromptAtATime<'_> {
    async fn is_allowed(&self, fingerprint: &str) -> bool {
        self.inner.is_allowed(fingerprint).await
    }

    async fn request(&self, request: ApprovalRequest) -> Result<ApprovalDecision, String> {
        let _turn = self.lock.lock().await;
        self.inner.request(request).await
    }
}

#[async_trait]
impl FolderAccessHook for OnePromptAtATime<'_> {
    async fn request(&self, request: FolderAccessRequest) -> Result<bool, String> {
        let _turn = self.lock.lock().await;
        self.folder_access.request(request).await
    }
}

/// Everything a specialist's nested turn shares with the coordinator.
pub struct SpecialistDelegator<'a> {
    pub specialists: Vec<PreparedSpecialist>,
    pub run_id: &'a str,
    pub session_id: &'a str,
    pub model_profile: AgentModelProfile,
    pub working_dir: &'a Path,
    pub editable_roots: &'a EditableRoots,
    pub external_read_only_roots: &'a [PathBuf],
    pub trusted_read_roots: &'a [PathBuf],
    pub max_steps: u32,
    pub reasoning: AgentReasoning,
    pub sampling: &'a SamplingOverrides,
    pub mcp: Option<&'a dyn McpBridge>,
    pub docs: Option<&'a dyn DocsBridge>,
    pub documents_note: Option<&'a str>,
    pub auto_approve_mcp: bool,
    pub client: &'a dyn AgentLlmClient,
    pub approval: &'a dyn ApprovalHook,
    pub folder_access: &'a dyn FolderAccessHook,
    pub desktop: &'a dyn DesktopServices,
    pub cancellation: &'a CancellationToken,
    pub skill_registry: &'a SkillRegistry,
    pub bundled_script_runtime: Option<&'a Path>,
    pub pty: &'a PtyRegistry,
    pub cache_dir: &'a Path,
    /// Where lane events go. `None` runs specialists silently (tests, eval).
    pub emit: Option<SpecialistEmitter>,
    pub lanes: SpecialistLanes,
}

impl SpecialistDelegator<'_> {
    fn emit(&self, event: AgentEvent) {
        if let Some(emit) = &self.emit {
            // A closed UI channel must not fail the specialist's work: the
            // coordinator still needs the answer.
            let _ = emit(event);
        }
    }

    fn find(&self, name: &str) -> Option<&PreparedSpecialist> {
        self.specialists
            .iter()
            .find(|specialist| specialist.name.eq_ignore_ascii_case(name))
    }

    fn roster(&self) -> String {
        self.specialists
            .iter()
            .map(|specialist| specialist.name.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    }
}

/// Session id for a specialist's nested turn: distinct from the coordinator's
/// so spill files and processes never collide, and a safe path component.
pub fn specialist_session_id(session_id: &str, specialist: &str) -> String {
    let slug: String = specialist
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    let slug = slug.trim_matches('-');
    let slug = if slug.is_empty() { "specialist" } else { slug };
    let mut id = format!("{session_id}--{slug}");
    id.truncate(128);
    id
}

#[async_trait]
impl DelegateHook for SpecialistDelegator<'_> {
    async fn delegate(&self, specialist: &str, task: &str) -> ToolOutcome {
        let Some(prepared) = self.find(specialist) else {
            return ToolOutcome::error(format!(
                "Unknown specialist '{specialist}'. Available: {}",
                self.roster()
            ));
        };
        let Ok(_slot) = self.lanes.slots.acquire().await else {
            return ToolOutcome::error("Specialist lanes are closed".to_string());
        };
        if self.cancellation.is_cancelled() {
            return ToolOutcome::error(format!("{} was cancelled", prepared.name));
        }
        let lane = self.lanes.next_lane.fetch_add(1, Ordering::Relaxed);
        let lane_id = format!("{}#{lane}", self.run_id);
        let session_slug = format!("{}-{lane}", prepared.name);
        let session_id = specialist_session_id(self.session_id, &session_slug);
        let run_id = format!("{}::{}", self.run_id, session_id);
        let (client, model_profile) = match &prepared.own_model {
            Some(own) => (own.client.as_ref(), own.model_profile),
            None => (self.client, self.model_profile),
        };
        self.emit(AgentEvent::SpecialistStarted {
            lane_id: lane_id.clone(),
            specialist: prepared.name.clone(),
            model_id: client.model_id(),
            task: task.to_owned(),
        });
        let prompts = OnePromptAtATime {
            inner: self.approval,
            folder_access: self.folder_access,
            lock: &self.lanes.prompts,
        };
        let mut session = AgentSessionState::new(session_id.clone());
        let mut reply: Option<String> = None;
        let result = run_turn(
            RunTurnInput {
                run_id: &run_id,
                session_id: &session_id,
                user_message: task,
                selected_skill: None,
                stable_prefix: &prepared.stable_prefix,
                model_profile,
                working_dir: self.working_dir,
                editable_roots: self.editable_roots,
                external_read_only_roots: self.external_read_only_roots,
                trusted_read_roots: self.trusted_read_roots,
                max_steps: self.max_steps.min(MAX_SPECIALIST_STEPS),
                reasoning: self.reasoning.clone(),
                sampling: self.sampling,
                mcp: self.mcp,
                docs: self.docs,
                documents_note: self.documents_note,
                disabled_tools: &prepared.disabled_tools,
                auto_approve_mcp: self.auto_approve_mcp,
                delegate: None,
                client,
                approval: &prompts,
                folder_access: &prompts,
                desktop: self.desktop,
                cancellation: self.cancellation,
                session: &mut session,
                skill_registry: self.skill_registry,
                bundled_script_runtime: self.bundled_script_runtime,
                pty: self.pty,
                cache_dir: self.cache_dir,
                slot_id: ANY_SLOT,
            },
            |event| {
                if let AgentEvent::AssistantReply { text } = &event {
                    reply = Some(text.clone());
                }
                self.emit(AgentEvent::SpecialistEvent {
                    lane_id: lane_id.clone(),
                    event: Box::new(event),
                });
                Ok(())
            },
        )
        .await;
        let outcome = if self.cancellation.is_cancelled() {
            ToolOutcome::error(format!("{} was cancelled", prepared.name))
        } else {
            match (result, reply) {
                (Ok(()), Some(text)) => {
                    ToolOutcome::ok(format!("{} answered:\n{text}", prepared.name))
                }
                (Ok(()), None) => {
                    ToolOutcome::error(format!("{} finished without an answer", prepared.name))
                }
                (Err(error), _) => ToolOutcome::error(format!("{} failed: {error}", prepared.name)),
            }
        };
        self.emit(AgentEvent::SpecialistFinished {
            lane_id,
            ok: outcome.status == ToolStatus::Ok,
            summary: outcome.summary.clone(),
        });
        outcome
    }
}
