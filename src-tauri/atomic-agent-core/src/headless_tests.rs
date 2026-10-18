use crate::{
    llm_client::SamplingOverrides,
    model_profile::AgentModelProfile,
    path_policy::EditableRoots,
    runner::{run_turn, RunTurnInput},
    session::AgentSessionState,
    test_support::{
        RecordingApproval, RecordingFolderAccess, ScriptedCompletionServer, ScriptedResponse,
        TestWorkspace,
    },
    tools::{ToolContext, ToolExecutor},
    types::{AgentEvent, AgentReasoning, ToolCallPayload, ToolOutcome},
};
use async_trait::async_trait;
use std::{collections::BTreeSet, sync::Mutex};
use tokio_util::sync::CancellationToken;

#[derive(Default)]
struct Broker {
    calls: Mutex<Vec<String>>,
}
#[async_trait]
impl ToolExecutor for Broker {
    async fn execute(&self, call: &ToolCallPayload, _context: &ToolContext<'_>) -> ToolOutcome {
        self.calls.lock().unwrap().push(call.tool.clone());
        if call.tool == "os.fs.read" {
            ToolOutcome::ok("verified source content")
        } else if call.tool == "reply" {
            ToolOutcome::ok(call.args["text"].as_str().unwrap())
        } else {
            ToolOutcome::error("test broker forbids this capability")
        }
    }
}
async fn run(
    responses: Vec<ScriptedResponse>,
    cancellation: &CancellationToken,
    max_steps: u32,
    disabled: BTreeSet<String>,
) -> (Vec<AgentEvent>, Vec<String>, usize) {
    let workspace = TestWorkspace::new();
    let registry = workspace.skill_registry();
    let roots = EditableRoots::new(workspace.path(), &[]).await.unwrap();
    let server = ScriptedCompletionServer::start(responses).await;
    let client = server.client();
    let approval = RecordingApproval::deny();
    let folder_access = RecordingFolderAccess::deny();
    let mut session = AgentSessionState::new("headless-test");
    let sampling = SamplingOverrides::default();
    let broker = Broker::default();
    let mut events = Vec::new();
    run_turn(
        RunTurnInput {
            run_id: "run",
            session_id: "headless-test",
            user_message: "Read scoped evidence then reply",
            selected_skill: None,
            stable_prefix: "Use bounded tools and evidence",
            model_profile: AgentModelProfile::Plain,
            working_dir: workspace.path(),
            editable_roots: &roots,
            external_read_only_roots: &[],
            trusted_read_roots: &[],
            max_steps,
            reasoning: AgentReasoning::Off,
            sampling: &sampling,
            mcp: None,
            docs: None,
            documents_note: None,
            disabled_tools: &disabled,
            auto_approve_mcp: false,
            client: &client,
            approval: &approval,
            folder_access: &folder_access,
            cancellation,
            session: &mut session,
            skill_registry: &registry,
            bundled_script_runtime: None,
            executor: &broker,
            slot_id: crate::runner::AGENT_SLOT_ID,
        },
        |event| {
            events.push(event);
            Ok(())
        },
    )
    .await
    .unwrap();
    let calls = broker.calls.lock().unwrap().clone();
    (events, calls, server.requests().len())
}

#[tokio::test]
async fn actual_headless_loop_dispatches_through_host_and_finishes_from_model_reply() {
    let (events, calls, requests) = run(
        vec![
            ScriptedResponse::completion(
                r#"[{"tool":"os.fs.read","args":{"path":"src/main.rs"}}]"#,
            ),
            ScriptedResponse::completion(
                r#"[{"tool":"reply","args":{"text":"Source inspected"}}]"#,
            ),
        ],
        &CancellationToken::new(),
        3,
        BTreeSet::new(),
    )
    .await;
    assert_eq!(calls, ["os.fs.read", "reply"]);
    assert_eq!(requests, 2);
    assert!(events
        .iter()
        .any(|event| matches!(event, AgentEvent::ToolCallExecuted { .. })));
    assert!(events.iter().any(
        |event| matches!(event, AgentEvent::AssistantReply { text } if text == "Source inspected")
    ));
    assert!(events.iter().any(|event| matches!(event, AgentEvent::TurnFinished { reason, step_count: 2, .. } if reason == "reply")));
}

#[tokio::test]
async fn headless_step_limit_is_observed_and_does_not_claim_task_validation() {
    let (events, calls, _) = run(
        vec![ScriptedResponse::completion(
            r#"[{"tool":"os.fs.read","args":{"path":"src/main.rs"}}]"#,
        )],
        &CancellationToken::new(),
        1,
        BTreeSet::new(),
    )
    .await;
    assert_eq!(calls, ["os.fs.read"]);
    assert!(events.iter().any(|event| matches!(event, AgentEvent::TurnFinished { reason, step_count: 1, .. } if reason == "max_steps")));
}

#[tokio::test]
async fn cancelled_headless_turn_cannot_reach_the_execution_broker() {
    let cancellation = CancellationToken::new();
    cancellation.cancel();
    let (events, calls, requests) = run(Vec::new(), &cancellation, 3, BTreeSet::new()).await;
    assert!(calls.is_empty());
    assert_eq!(requests, 0);
    assert!(events.iter().any(
        |event| matches!(event, AgentEvent::TurnFinished { reason, .. } if reason == "cancelled")
    ));
}
