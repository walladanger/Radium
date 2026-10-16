//! `agent.delegate` end to end: a coordinating turn hands a task to a
//! specialist, the specialist runs its own nested turn against the same
//! (scripted) model, and only its answer comes back.

use std::collections::BTreeSet;
use std::sync::{Arc, Mutex};

use tokio_util::sync::CancellationToken;

use super::delegation::{
    specialist_session_id, validate_specialists, PreparedSpecialist, SpecialistDelegator,
    SpecialistModel, DELEGATE_TOOL,
};
use super::llm_client::{
    AgentClientCapabilities, AgentLlmClient, CompletionRequest, CompletionResult, LlmClientError,
    SamplingOverrides,
};
use super::model_profile::AgentModelProfile;
use super::path_policy::EditableRoots;
use super::prompt::{
    build_stable_prefix_with, CapabilitiesSummary, SpecialistSummary, StablePrefixArgs,
    ITERATION_ONE_TOOLS,
};
use super::pty::PtyRegistry;
use super::runner::{run_turn, RunTurnInput, ANY_SLOT};
use super::session::AgentSessionState;
use super::test_support::{
    collect_event, RecordingApproval, RecordingDesktop, RecordingFolderAccess,
    ScriptedCompletionServer, ScriptedResponse, TestWorkspace,
};
use super::types::{AgentEvent, AgentReasoning, AgentSpecialist, ToolStatus};

const COORDINATOR_PREFIX: &str = "COORDINATOR_STABLE_PREFIX";
const NETWORK_PREFIX: &str = "NETWORK_SPECIALIST_PREFIX";
const COORDINATOR_MESSAGE: &str = "check why my wifi is slow";

struct DelegationRun {
    result: Result<(), String>,
    events: Vec<AgentEvent>,
    /// What the delegator streamed to the UI: lane open/close and the
    /// specialists' wrapped events.
    lane_events: Vec<AgentEvent>,
    requests: Vec<serde_json::Value>,
}

/// Run one coordinator turn that may delegate to a single "Network" specialist.
async fn run_coordinator(
    workspace: &TestWorkspace,
    responses: Vec<ScriptedResponse>,
    approval: &RecordingApproval,
) -> DelegationRun {
    run_coordinator_with_models(workspace, vec![("Network", None)], responses, approval).await
}

/// Run one coordinator turn that may delegate to the named specialists, each
/// on its own model or (`None`) the coordinator's scripted one. The first gets
/// [`NETWORK_PREFIX`]; the rest get `<NAME>_SPECIALIST_PREFIX`.
async fn run_coordinator_with_models(
    workspace: &TestWorkspace,
    specialists: Vec<(&str, Option<SpecialistModel>)>,
    responses: Vec<ScriptedResponse>,
    approval: &RecordingApproval,
) -> DelegationRun {
    let server = ScriptedCompletionServer::start(responses).await;
    let client = server.client();
    let desktop = RecordingDesktop::default();
    let folder_access = RecordingFolderAccess::deny();
    let skill_registry = workspace.skill_registry();
    let editable_roots = EditableRoots::new(workspace.path(), &[]).await.unwrap();
    let cancellation = CancellationToken::new();
    let sampling = SamplingOverrides::default();
    let pty = PtyRegistry::new();
    let cache_dir = std::env::temp_dir();
    let coordinator_disabled = BTreeSet::new();
    let specialist_disabled: BTreeSet<String> = [DELEGATE_TOOL.to_owned()].into();
    let lane_events = Arc::new(Mutex::new(Vec::new()));
    let delegator = SpecialistDelegator {
        specialists: specialists
            .into_iter()
            .enumerate()
            .map(|(index, (name, own_model))| PreparedSpecialist {
                name: name.into(),
                stable_prefix: if index == 0 {
                    NETWORK_PREFIX.into()
                } else {
                    format!("{}_SPECIALIST_PREFIX", name.to_uppercase())
                },
                disabled_tools: specialist_disabled.clone(),
                own_model,
            })
            .collect(),
        run_id: "test-run",
        session_id: "test-session",
        model_profile: super::model_profile::AgentModelProfile::Plain,
        working_dir: workspace.path(),
        editable_roots: &editable_roots,
        external_read_only_roots: &[],
        trusted_read_roots: &[],
        max_steps: 6,
        reasoning: AgentReasoning::default(),
        sampling: &sampling,
        mcp: None,
        docs: None,
        documents_note: None,
        auto_approve_mcp: true,
        client: &client,
        approval,
        folder_access: &folder_access,
        desktop: &desktop,
        cancellation: &cancellation,
        skill_registry: &skill_registry,
        bundled_script_runtime: None,
        pty: &pty,
        cache_dir: &cache_dir,
        emit: Some({
            let lane_events = lane_events.clone();
            Arc::new(move |event| {
                lane_events.lock().unwrap().push(event);
                Ok(())
            })
        }),
        lanes: Default::default(),
    };
    let mut events = Vec::new();
    let mut session = AgentSessionState::new("test-session");
    let result = run_turn(
        RunTurnInput {
            run_id: "test-run",
            session_id: "test-session",
            user_message: COORDINATOR_MESSAGE,
            selected_skill: None,
            stable_prefix: COORDINATOR_PREFIX,
            model_profile: super::model_profile::AgentModelProfile::Plain,
            working_dir: workspace.path(),
            editable_roots: &editable_roots,
            external_read_only_roots: &[],
            trusted_read_roots: &[],
            max_steps: 6,
            reasoning: AgentReasoning::default(),
            sampling: &sampling,
            mcp: None,
            disabled_tools: &coordinator_disabled,
            auto_approve_mcp: true,
            delegate: Some(&delegator),
            docs: None,
            documents_note: None,
            client: &client,
            approval,
            folder_access: &folder_access,
            desktop: &desktop,
            cancellation: &cancellation,
            session: &mut session,
            skill_registry: &skill_registry,
            bundled_script_runtime: None,
            pty: &pty,
            cache_dir: &cache_dir,
            slot_id: crate::core::agent::runner::AGENT_SLOT_ID,
        },
        |event| collect_event(&mut events, event),
    )
    .await;
    drop(delegator);
    let lane_events = std::mem::take(&mut *lane_events.lock().unwrap());
    DelegationRun {
        result,
        events,
        lane_events,
        requests: server.requests(),
    }
}

fn executed(events: &[AgentEvent]) -> Vec<(String, ToolStatus)> {
    events
        .iter()
        .filter_map(|event| match event {
            AgentEvent::ToolCallExecuted { result } => {
                Some((result.call.tool.clone(), result.outcome.status))
            }
            _ => None,
        })
        .collect()
}

fn prompt_of(request: &serde_json::Value) -> &str {
    request["prompt"].as_str().unwrap_or_default()
}

fn delegate_call(specialist: &str, task: &str) -> ScriptedResponse {
    ScriptedResponse::completion(
        serde_json::json!([{
            "tool": "agent.delegate",
            "args": {"specialist": specialist, "task": task}
        }])
        .to_string(),
    )
}

fn reply(text: &str) -> ScriptedResponse {
    ScriptedResponse::completion(
        serde_json::json!([{"tool": "reply", "args": {"text": text}}]).to_string(),
    )
}

#[tokio::test]
async fn a_specialist_works_on_its_own_prompt_and_its_answer_returns_to_the_coordinator() {
    let workspace = TestWorkspace::new();
    workspace.write("dns.txt", "resolver 1.1.1.1 answers in 4 ms");
    let run = run_coordinator(
        &workspace,
        vec![
            delegate_call("Network", "Read dns.txt and say whether DNS is slow"),
            ScriptedResponse::completion(r#"[{"tool":"os.fs.read","args":{"path":"dns.txt"}}]"#),
            reply("DNS_IS_FAST_SENTINEL"),
            reply("Your DNS is fine."),
        ],
        &RecordingApproval::deny(),
    )
    .await;

    assert!(run.result.is_ok(), "{:?}", run.result);
    // The coordinator's own run shows only its own calls; the specialist's
    // `os.fs.read` and `reply` stay inside the nested turn.
    assert_eq!(
        executed(&run.events),
        [
            ("agent.delegate".to_owned(), ToolStatus::Ok),
            ("reply".to_owned(), ToolStatus::Ok),
        ]
    );
    // Request 1 is the specialist's first step: its own prefix and only the
    // task text — never the coordinator's conversation.
    let specialist_prompt = prompt_of(&run.requests[1]);
    assert!(specialist_prompt.contains(NETWORK_PREFIX));
    assert!(specialist_prompt.contains("Read dns.txt"));
    assert!(!specialist_prompt.contains(COORDINATOR_PREFIX));
    assert!(!specialist_prompt.contains(COORDINATOR_MESSAGE));
    // The specialist's tool really ran: its second step saw the file.
    assert!(prompt_of(&run.requests[2]).contains("answers in 4 ms"));
    // The coordinator's next step sees the specialist's answer.
    let coordinator_followup = prompt_of(&run.requests[3]);
    assert!(coordinator_followup.contains(COORDINATOR_PREFIX));
    assert!(coordinator_followup.contains("DNS_IS_FAST_SENTINEL"));
    let final_reply = run.events.iter().rev().find_map(|event| match event {
        AgentEvent::AssistantReply { text } => Some(text.as_str()),
        _ => None,
    });
    assert_eq!(final_reply, Some("Your DNS is fine."));
}

/// A specialist's own model for tests: every completion waits until
/// `barrier` has as many callers as specialists, then answers with `answer`.
/// Run serially, the first specialist would wait forever and hit the test's
/// 100 ms step deadline, so a passing run proves the lanes overlapped.
struct BarrierModel {
    model_id: &'static str,
    answer: &'static str,
    barrier: Arc<tokio::sync::Barrier>,
    slots_seen: Arc<Mutex<Vec<Option<i32>>>>,
}

#[async_trait::async_trait]
impl AgentLlmClient for BarrierModel {
    fn capabilities(&self) -> AgentClientCapabilities {
        AgentClientCapabilities {
            grammar: false,
            json_schema: false,
            prompt_cache_slots: false,
        }
    }

    fn model_id(&self) -> String {
        self.model_id.to_owned()
    }

    fn has_vision(&self) -> bool {
        false
    }

    async fn probe_model_profile(&self, _: &CancellationToken) -> AgentModelProfile {
        AgentModelProfile::Plain
    }

    async fn fetch_context_window(
        &self,
        _: &CancellationToken,
    ) -> Result<Option<usize>, LlmClientError> {
        Ok(None)
    }

    async fn complete(
        &self,
        request: &CompletionRequest,
        _: &CancellationToken,
    ) -> Result<CompletionResult, LlmClientError> {
        self.slots_seen.lock().unwrap().push(request.slot_id);
        self.barrier.wait().await;
        Ok(CompletionResult {
            content: serde_json::json!([{"tool": "reply", "args": {"text": self.answer}}])
                .to_string(),
            stop: true,
            ..CompletionResult::default()
        })
    }

    async fn describe_images(
        &self,
        _: &str,
        _: &[(String, String)],
        _: &CancellationToken,
    ) -> Result<String, LlmClientError> {
        Err(LlmClientError::InvalidResponse("no vision".into()))
    }
}

#[tokio::test]
async fn delegations_in_one_step_run_in_parallel_lanes_on_their_own_models() {
    let workspace = TestWorkspace::new();
    let barrier = Arc::new(tokio::sync::Barrier::new(2));
    let slots_seen = Arc::new(Mutex::new(Vec::new()));
    let own_model = |model_id, answer| SpecialistModel {
        client: Box::new(BarrierModel {
            model_id,
            answer,
            barrier: barrier.clone(),
            slots_seen: slots_seen.clone(),
        }),
        model_profile: AgentModelProfile::Plain,
    };
    let run = run_coordinator_with_models(
        &workspace,
        vec![
            ("Network", Some(own_model("local-qwen", "ROUTER_IS_FINE"))),
            ("Storage", Some(own_model("cloud-claude", "DISKS_ARE_FINE"))),
        ],
        vec![
            ScriptedResponse::completion(
                serde_json::json!([
                    {"tool": "agent.delegate", "args": {"specialist": "Network", "task": "Check the router"}},
                    {"tool": "agent.delegate", "args": {"specialist": "Storage", "task": "Check the disks"}}
                ])
                .to_string(),
            ),
            reply("Both look healthy."),
        ],
        &RecordingApproval::deny(),
    )
    .await;

    assert!(run.result.is_ok(), "{:?}", run.result);
    assert_eq!(
        executed(&run.events),
        [
            ("agent.delegate".to_owned(), ToolStatus::Ok),
            ("agent.delegate".to_owned(), ToolStatus::Ok),
            ("reply".to_owned(), ToolStatus::Ok),
        ]
    );
    // Only the coordinator used the scripted server; each specialist ran on
    // its own model, letting llama.cpp choose the slot.
    assert_eq!(run.requests.len(), 2);
    assert_eq!(run.requests[0]["id_slot"], 0);
    assert_eq!(
        *slots_seen.lock().unwrap(),
        [Some(ANY_SLOT), Some(ANY_SLOT)]
    );
    let followup = prompt_of(&run.requests[1]);
    assert!(followup.contains("ROUTER_IS_FINE"));
    assert!(followup.contains("DISKS_ARE_FINE"));

    let started: Vec<(&str, &str, &str)> = run
        .lane_events
        .iter()
        .filter_map(|event| match event {
            AgentEvent::SpecialistStarted {
                lane_id,
                specialist,
                model_id,
                ..
            } => Some((lane_id.as_str(), specialist.as_str(), model_id.as_str())),
            _ => None,
        })
        .collect();
    assert_eq!(started.len(), 2);
    assert_ne!(started[0].0, started[1].0, "lanes need distinct ids");
    let mut models: Vec<(&str, &str)> = started.iter().map(|(_, s, m)| (*s, *m)).collect();
    models.sort();
    assert_eq!(
        models,
        [("Network", "local-qwen"), ("Storage", "cloud-claude")]
    );
    assert_eq!(
        run.lane_events
            .iter()
            .filter(|event| matches!(event, AgentEvent::SpecialistFinished { ok: true, .. }))
            .count(),
        2
    );
    // Each lane streamed its own nested turn, tagged with its lane id.
    for (lane, _, _) in &started {
        assert!(run.lane_events.iter().any(|event| matches!(
            event,
            AgentEvent::SpecialistEvent { lane_id, event }
                if lane_id == lane && matches!(**event, AgentEvent::AssistantReply { .. })
        )));
    }
    // The coordinator's own stream carries no lane events.
    assert!(!run.events.iter().any(|event| matches!(
        event,
        AgentEvent::SpecialistEvent { .. } | AgentEvent::SpecialistStarted { .. }
    )));
}

#[tokio::test]
async fn more_than_four_delegations_in_one_step_are_rejected() {
    let workspace = TestWorkspace::new();
    let five: Vec<serde_json::Value> = (0..5)
        .map(|index| {
            serde_json::json!({
                "tool": "agent.delegate",
                "args": {"specialist": "Network", "task": format!("job {index}")}
            })
        })
        .collect();
    let run = run_coordinator(
        &workspace,
        vec![
            ScriptedResponse::completion(serde_json::Value::Array(five).to_string()),
            reply("ONE_JOB_DONE"),
            reply("Done."),
        ],
        &RecordingApproval::deny(),
    )
    .await;

    assert!(run.result.is_ok(), "{:?}", run.result);
    // Five is over the cap: the batch is salvaged to its first delegation.
    assert_eq!(
        executed(&run.events),
        [
            ("agent.delegate".to_owned(), ToolStatus::Ok),
            ("reply".to_owned(), ToolStatus::Ok),
        ]
    );
}

#[tokio::test]
async fn a_delegation_mixed_with_other_tools_still_runs_alone() {
    let workspace = TestWorkspace::new();
    workspace.write("notes.txt", "hello");
    let run = run_coordinator(
        &workspace,
        vec![
            ScriptedResponse::completion(
                serde_json::json!([
                    {"tool": "agent.delegate", "args": {"specialist": "Network", "task": "Check the router"}},
                    {"tool": "os.fs.read", "args": {"path": "notes.txt"}}
                ])
                .to_string(),
            ),
            reply("ROUTER_OK"),
            reply("Done."),
        ],
        &RecordingApproval::deny(),
    )
    .await;

    assert!(run.result.is_ok(), "{:?}", run.result);
    // The mixed batch is trimmed to its delegation; the read never runs.
    assert_eq!(
        executed(&run.events),
        [
            ("agent.delegate".to_owned(), ToolStatus::Ok),
            ("reply".to_owned(), ToolStatus::Ok),
        ]
    );
}

#[tokio::test]
async fn a_specialists_risky_action_goes_through_the_users_approval_gate() {
    let workspace = TestWorkspace::new();
    let approval = RecordingApproval::deny();
    let run = run_coordinator(
        &workspace,
        vec![
            delegate_call("Network", "Flush the DNS cache"),
            ScriptedResponse::completion(
                r#"[{"tool":"os.shell.run","args":{"cmd":"ipconfig","args":["/flushdns"]}}]"#,
            ),
            reply("I was not allowed to flush the cache."),
            reply("The flush was declined."),
        ],
        &approval,
    )
    .await;

    assert!(run.result.is_ok(), "{:?}", run.result);
    assert_eq!(
        approval.requests().len(),
        1,
        "the specialist's shell command must ask the user first"
    );
    assert!(prompt_of(&run.requests[3]).contains("I was not allowed to flush the cache."));
}

#[tokio::test]
async fn an_unknown_specialist_is_a_recoverable_error_naming_the_roster() {
    let workspace = TestWorkspace::new();
    let run = run_coordinator(
        &workspace,
        vec![
            delegate_call("Accountant", "Do my taxes"),
            reply("No accountant is available."),
        ],
        &RecordingApproval::deny(),
    )
    .await;

    assert!(run.result.is_ok(), "{:?}", run.result);
    assert_eq!(
        executed(&run.events),
        [
            ("agent.delegate".to_owned(), ToolStatus::Error),
            ("reply".to_owned(), ToolStatus::Ok),
        ]
    );
    let followup = prompt_of(&run.requests[1]);
    assert!(followup.contains("Unknown specialist 'Accountant'"));
    assert!(followup.contains("Network"));
}

/// Mirrors `agent_run_turn`: `agent.delegate` is in the catalog only when the
/// turn carries specialists.
fn prefix_with(specialists: &[SpecialistSummary]) -> String {
    let tools = ITERATION_ONE_TOOLS
        .iter()
        .filter(|descriptor| !specialists.is_empty() || descriptor.name != DELEGATE_TOOL)
        .cloned()
        .collect::<Vec<_>>();
    let capabilities = CapabilitiesSummary {
        platform: "test".into(),
        arch: "x86_64".into(),
        browser_channel: "none".into(),
        working_dir: "/work".into(),
        has_clipboard: false,
        has_wmctrl: false,
        has_notifications: false,
    };
    build_stable_prefix_with(&StablePrefixArgs {
        tool_descriptors: &tools,
        skill_descriptors: &[],
        capabilities: &capabilities,
        max_parallel_tool_calls: 4,
        system_persona: None,
        assistant_instructions: None,
        mcp_tools: &[],
        mcp_omitted: 0,
        profile: super::model_profile::AgentModelProfile::Plain,
        thinking: false,
        specialists,
    })
}

/// Turns without specialists never mention delegation, so their prefix — and
/// a shared llama.cpp slot's cache — is exactly what it was before delegation
/// existed.
#[test]
fn delegation_appears_only_on_turns_with_specialists() {
    let without = prefix_with(&[]);
    assert!(!without.contains("### specialists"));
    assert!(!without.contains(DELEGATE_TOOL));

    let with = prefix_with(&[SpecialistSummary {
        name: "Network".into(),
        description: "Diagnoses Wi-Fi, DNS and LAN problems".into(),
    }]);
    assert!(with.contains(DELEGATE_TOOL));
    assert!(with.contains("### specialists"));
    assert!(with.contains("- Network: Diagnoses Wi-Fi, DNS and LAN problems"));
}

fn specialist(name: &str, description: &str) -> AgentSpecialist {
    AgentSpecialist {
        name: name.into(),
        description: description.into(),
        instructions: None,
        tool_packs: Vec::new(),
        model_id: None,
        provider: None,
        capabilities: Vec::new(),
        context_window: None,
    }
}

#[test]
fn a_roster_must_be_addressable_unambiguously() {
    assert!(validate_specialists(&[
        specialist("Network", "Diagnoses the network"),
        specialist("Computer care", "Keeps the PC healthy"),
    ])
    .is_ok());
    assert!(
        validate_specialists(&[specialist("Network", "a"), specialist("network", "b"),]).is_err()
    );
    assert!(validate_specialists(&[specialist("  ", "no name")]).is_err());
    assert!(validate_specialists(&[specialist("Network", " ")]).is_err());
    let too_many = (0..13)
        .map(|index| specialist(&format!("S{index}"), "x"))
        .collect::<Vec<_>>();
    assert!(validate_specialists(&too_many).is_err());
}

#[test]
fn a_specialist_session_id_is_a_distinct_safe_path_component() {
    let id = specialist_session_id("thread-42", "Computer care / PC");
    assert_eq!(id, "thread-42--computer-care---pc");
    assert!(super::session::validate_session_id(&id).is_ok());
    assert_eq!(specialist_session_id("t", "***"), "t--specialist");
}
