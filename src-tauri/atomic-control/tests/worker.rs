//! Opt-in full real model -> extracted loop -> rootless sandbox -> trusted checks.
#![cfg(target_os = "linux")]
use atomic_control::{
    execution::{SandboxExecutor, SandboxLimits, WorktreeManager},
    worker::{LocalModelBinding, TrustedRunRequest, WorkerCoordinator},
    CommandEnvelope, Store,
};
use serde_json::json;
use std::{path::Path, sync::Arc};
use tokio_util::sync::CancellationToken;
#[tokio::test]
#[ignore = "requires private WSL model key, live local coder and pinned coding image"]
async fn live_local_agent_produces_checked_scoped_artifact() {
    let root = std::env::var("ATOMIC_SANDBOX_TEST_ROOT").expect("explicit Linux root");
    let image = std::env::var("ATOMIC_WORKER_IMAGE").expect("pinned coding image");
    let key_path = std::env::var("ATOMIC_WORKER_KEY_FILE").expect("private local key file");
    let fixture = Path::new(&root).join(format!("worker-probe-{}", std::process::id()));
    let repo = fixture.join("repository");
    let workspaces = fixture.join("workspaces");
    let data = fixture.join("data");
    for directory in [&repo, &workspaces, &data] {
        std::fs::create_dir_all(directory).unwrap();
    }
    async fn git(repo: &Path, args: &[&str]) -> String {
        let out = tokio::process::Command::new("/usr/bin/git")
            .arg("-C")
            .arg(repo)
            .args(args)
            .output()
            .await
            .unwrap();
        assert!(out.status.success(), "Git fixture operation failed");
        String::from_utf8(out.stdout).unwrap().trim().into()
    }
    git(&repo, &["init"]).await;
    std::fs::create_dir(repo.join("src")).unwrap();
    std::fs::write(repo.join("src/answer.txt"), "before\n").unwrap();
    std::fs::write(repo.join("unassigned.txt"), "protected\n").unwrap();
    git(&repo, &["add", "."]).await;
    git(
        &repo,
        &[
            "-c",
            "user.name=Fixture",
            "-c",
            "user.email=fixture@localhost",
            "commit",
            "-m",
            "fixture",
        ],
    )
    .await;
    let base = git(&repo, &["rev-parse", "HEAD"]).await;
    let store = Store::open(data.join("control.db")).unwrap();
    store.command(CommandEnvelope {command_id:"plan".into(),expected_revision:None,command:json!({"type":"create_plan","project_id":"fixture","title":"real local worker","tasks":[{"id":"edit","title":"Update scoped answer file","description":"Use os.fs.write to replace src/answer.txt with exactly sandbox agent verified followed by a newline. Do not change other files. Then reply with a short completion message.","role":"edit","dependencies":[],"write_scopes":["src/answer.txt"]},{"id":"reject","title":"Report readiness","description":"Reply with ready for verification. Do not edit files.","role":"edit","dependencies":[],"write_scopes":["src/answer.txt"]}]})}).unwrap();
    store
        .command(CommandEnvelope {
            command_id: "start".into(),
            expected_revision: Some(1),
            command: json!({"type":"start_plan","plan_id":"plan-1"}),
        })
        .unwrap();
    store.register_model_service("coder", 1).unwrap();
    store
        .register_worker(
            "local-worker",
            "wsl",
            "coder",
            "atomic-coder",
            &["edit".into()],
        )
        .unwrap();
    let coordinator = WorkerCoordinator {
        store: store.clone(),
        sandbox: Arc::new(
            SandboxExecutor::new(store.clone(), "/usr/bin/podman", &workspaces).unwrap(),
        ),
        worktrees: WorktreeManager::new(&workspaces, "/usr/bin/git").unwrap(),
        data_root: data,
        image,
        limits: SandboxLimits::default(),
    };
    let binding = LocalModelBinding {
        service_id: "coder".into(),
        model_id: "atomic-coder".into(),
        port: 17441,
        api_key: std::fs::read_to_string(key_path).unwrap().trim().into(),
        context_window: 8192,
    };
    let check=vec!["/usr/bin/python3".into(),"-c".into(),"from pathlib import Path; assert Path('/workspace/src/answer.txt').read_text() == 'sandbox agent verified\\n'; assert Path('/workspace/unassigned.txt').read_text() == 'protected\\n'".into()];
    let attempt = coordinator
        .run(TrustedRunRequest {
            task_id: "edit",
            revision: store.snapshot().unwrap().tasks[0]["revision"]
                .as_u64()
                .unwrap(),
            worker_id: "local-worker",
            repository: &repo,
            base_commit: &base,
            binding: &binding,
            checks: &[check],
            cancellation: CancellationToken::new(),
        })
        .await
        .unwrap();
    let state = store.snapshot().unwrap();
    assert_eq!(state.tasks[0]["status"], "completed");
    assert_eq!(state.attempts[0]["id"], attempt);
    assert!(state.tool_executions.len() >= 2);
    assert!(state.artifacts[0]["validated"].as_bool().unwrap());
    assert_eq!(
        std::fs::read_to_string(repo.join("src/answer.txt")).unwrap(),
        "before\n"
    );
    let events = serde_json::to_string(
        &store
            .events(0)
            .unwrap()
            .into_iter()
            .filter(|event| event["event_type"] == "agent_progress")
            .collect::<Vec<_>>(),
    )
    .unwrap();
    assert!(
        !events.contains("sandbox agent verified"),
        "operational event ledger must not capture content"
    );
    let reject_revision = store
        .snapshot()
        .unwrap()
        .tasks
        .iter()
        .find(|t| t["id"] == "reject")
        .unwrap()["revision"]
        .as_u64()
        .unwrap();
    let rejected = coordinator
        .run(TrustedRunRequest {
            task_id: "reject",
            revision: reject_revision,
            worker_id: "local-worker",
            repository: &repo,
            base_commit: &base,
            binding: &binding,
            checks: &[vec![
                "/usr/bin/python3".into(),
                "-c".into(),
                "raise SystemExit(7)".into(),
            ]],
            cancellation: CancellationToken::new(),
        })
        .await;
    assert_eq!(rejected.unwrap_err().code, "verification_failed");
    let state = store.snapshot().unwrap();
    assert_eq!(
        state.artifacts.len(),
        1,
        "failed check cannot validate an artifact"
    );
    assert_eq!(
        state.tasks.iter().find(|t| t["id"] == "reject").unwrap()["status"],
        "failed"
    );
    assert!(
        state
            .tool_executions
            .iter()
            .any(|tool| tool["exit_code"] == 7),
        "negative fixture must execute the trusted failing check"
    );
}
