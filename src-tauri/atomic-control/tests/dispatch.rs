//! Scheduler contracts through the same Store and executor interface as the daemon.
use async_trait::async_trait;
use atomic_control::{
    dispatch::{self, Assignment, DispatchExecutor},
    ArtifactEvidence, CommandEnvelope, Result, Store,
};
use serde_json::json;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc,
};
use tokio::sync::{mpsc, Semaphore};
use tokio_util::sync::CancellationToken;

struct Executor {
    store: Store,
    started: mpsc::UnboundedSender<String>,
    release: Semaphore,
    sequence: AtomicU64,
    fail_reconciliation: AtomicBool,
}
fn command(
    store: &Store,
    id: String,
    revision: Option<u64>,
    command: serde_json::Value,
) -> Result<atomic_control::CommandResult> {
    store.command(CommandEnvelope {
        command_id: id,
        expected_revision: revision,
        command,
    })
}
#[async_trait]
impl DispatchExecutor for Executor {
    fn permits(&self, project: &str, _: &str, _: &[serde_json::Value]) -> bool {
        project == "trusted"
    }
    async fn execute(&self, assignment: Assignment, stop: CancellationToken) -> Result<()> {
        let n = self.sequence.fetch_add(1, Ordering::SeqCst);
        let claim = command(
            &self.store,
            format!("claim-{n}"),
            Some(assignment.revision),
            json!({"type":"claim_task", "task_id":assignment.task_id, "worker_id":assignment.worker_id}),
        )?;
        self.started.send(assignment.task_id.clone()).unwrap();
        let attempt = claim.result["attempt_id"].as_str().unwrap();
        let fence = claim.result["fencing_token"].as_u64().unwrap();
        tokio::select! {
            _ = stop.cancelled() => return Ok(()),
            permit = self.release.acquire() => { permit.unwrap().forget(); }
        }
        if assignment.task_id != "fail" {
            self.store.validate_artifact(
                attempt,
                fence,
                ArtifactEvidence {
                    id: format!("evidence-{n}"),
                    kind: "test".into(),
                    path: "test-only".into(),
                },
            )?;
        }
        command(
            &self.store,
            format!("finish-{n}"),
            None,
            json!({"type":"finish_attempt", "attempt_id":attempt,"fencing_token":fence,"outcome":if assignment.task_id == "fail" { "failed" } else { "succeeded" }}),
        )?;
        if assignment.task_id == "fail" {
            return Err(atomic_control::Error {
                code: "execution_error".into(),
                message: "fixture failure".into(),
            });
        }
        Ok(())
    }
    async fn reconcile(&self, attempt: &str) -> Result<()> {
        if self.fail_reconciliation.load(Ordering::SeqCst) {
            return Err(atomic_control::Error {
                code: "outcome_unknown".into(),
                message: "fixture stop unconfirmed".into(),
            });
        }
        self.store.reconcile_stopped(attempt)
    }
}
fn fixture(tasks: serde_json::Value) -> (Store, Arc<Executor>, mpsc::UnboundedReceiver<String>) {
    let store = Store::open(":memory:").unwrap();
    command(&store, "plan".into(), None, json!({"type":"create_plan","project_id":"trusted","title":"Background work","tasks":tasks})).unwrap();
    for i in 0..3 {
        let service = format!("gpu-{i}");
        store.register_model_service(&service, 1).unwrap();
        store
            .register_worker(
                &format!("worker-{i}"),
                "test",
                &service,
                "model",
                &["edit".into()],
            )
            .unwrap();
    }
    let (started, received) = mpsc::unbounded_channel();
    let executor = Arc::new(Executor {
        store: store.clone(),
        started,
        release: Semaphore::new(0),
        sequence: AtomicU64::new(0),
        fail_reconciliation: AtomicBool::new(false),
    });
    (store, executor, received)
}

#[tokio::test]
async fn paused_plans_and_unprovisioned_projects_do_not_execute() {
    let (store, executor, mut received) = fixture(json!([task("paused", &[])]));
    start(&store);
    command(
        &store,
        "pause".into(),
        Some(2),
        json!({"type":"pause_plan","plan_id":"plan-1"}),
    )
    .unwrap();
    command(&store, "other".into(), None, json!({"type":"create_plan","project_id":"untrusted","title":"other", "tasks":[task("other", &[])]})).unwrap();
    let other = store.snapshot().unwrap().plans[1].clone();
    command(
        &store,
        "other-start".into(),
        Some(1),
        json!({"type":"start_plan","plan_id":other["id"]}),
    )
    .unwrap();
    let stop = CancellationToken::new();
    let daemon = tokio::spawn(dispatch::run(store.clone(), executor, stop.clone()));
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(1100), received.recv())
            .await
            .is_err()
    );
    stop.cancel();
    daemon.await.unwrap().unwrap();
    assert!(store.snapshot().unwrap().attempts.is_empty());
}

#[tokio::test]
async fn startup_reconciles_unknown_attempts_and_fails_closed_when_stop_is_unconfirmed() {
    let (store, executor, mut received) = fixture(json!([task("old", &[])]));
    start(&store);
    let rev = store.snapshot().unwrap().tasks[0]["revision"].as_u64();
    command(
        &store,
        "old-claim".into(),
        rev,
        json!({"type":"claim_task","task_id":"old","worker_id":"worker-0"}),
    )
    .unwrap();
    let rev = store.snapshot().unwrap().tasks[0]["revision"].as_u64();
    command(
        &store,
        "old-cancel".into(),
        rev,
        json!({"type":"cancel_task","task_id":"old"}),
    )
    .unwrap();
    executor.fail_reconciliation.store(true, Ordering::SeqCst);
    assert!(
        dispatch::run(store.clone(), executor.clone(), CancellationToken::new())
            .await
            .is_err()
    );
    assert_eq!(
        store.snapshot().unwrap().attempts[0]["status"],
        "outcome_unknown"
    );
    assert!(received.try_recv().is_err());
    executor.fail_reconciliation.store(false, Ordering::SeqCst);
    let stop = CancellationToken::new();
    let daemon = tokio::spawn(dispatch::run(store.clone(), executor, stop.clone()));
    tokio::time::timeout(std::time::Duration::from_secs(6), async {
        loop {
            if store.snapshot().unwrap().attempts[0]["status"] == "cancelled" {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    stop.cancel();
    daemon.await.unwrap().unwrap();
}
fn task(id: &str, dependencies: &[&str]) -> serde_json::Value {
    json!({"id":id,"title":id,"description":"bounded fixture", "role":"edit","dependencies":dependencies,"write_scopes":["src"]})
}
fn start(store: &Store) {
    command(
        store,
        "start".into(),
        Some(1),
        json!({"type":"start_plan","plan_id":"plan-1"}),
    )
    .unwrap();
}
async fn next(received: &mut mpsc::UnboundedReceiver<String>) -> String {
    tokio::time::timeout(std::time::Duration::from_secs(6), received.recv())
        .await
        .unwrap()
        .unwrap()
}
async fn until(store: &Store, id: &str, status: &str) {
    tokio::time::timeout(std::time::Duration::from_secs(6), async {
        loop {
            if store
                .snapshot()
                .unwrap()
                .tasks
                .iter()
                .any(|t| t["id"] == id && t["status"] == status)
            {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
}

#[tokio::test]
async fn active_plans_dispatch_without_a_client_and_enforce_global_capacity() {
    let (store, executor, mut received) =
        fixture(json!([task("a", &[]), task("b", &[]), task("c", &[])]));
    let stop = CancellationToken::new();
    let daemon = tokio::spawn(dispatch::run(store.clone(), executor.clone(), stop.clone()));
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(100), received.recv())
            .await
            .is_err()
    );
    start(&store);
    let a = next(&mut received).await;
    let b = next(&mut received).await;
    assert_ne!(a, b);
    assert_eq!(
        store
            .snapshot()
            .unwrap()
            .attempts
            .iter()
            .filter(|a| a["status"] == "running")
            .count(),
        2
    );
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(1100), received.recv())
            .await
            .is_err()
    );
    executor.release.add_permits(2);
    assert_eq!(next(&mut received).await, "c");
    executor.release.add_permits(1);
    until(&store, "c", "completed").await;
    stop.cancel();
    daemon.await.unwrap().unwrap();
    assert_eq!(store.snapshot().unwrap().attempts.len(), 3);
}

#[tokio::test]
async fn dependencies_and_future_schedules_become_ready_without_new_commands() {
    let mut delayed = task("later", &["first"]);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    delayed["scheduled_at"] = json!(now + 2200);
    let (store, executor, mut received) = fixture(json!([task("first", &[]), delayed]));
    start(&store);
    let stop = CancellationToken::new();
    let daemon = tokio::spawn(dispatch::run(store.clone(), executor.clone(), stop.clone()));
    assert_eq!(next(&mut received).await, "first");
    executor.release.add_permits(1);
    until(&store, "first", "completed").await;
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(1100), received.recv())
            .await
            .is_err()
    );
    assert_eq!(next(&mut received).await, "later");
    executor.release.add_permits(1);
    until(&store, "later", "completed").await;
    stop.cancel();
    daemon.await.unwrap().unwrap();
}

#[tokio::test]
async fn cancellation_stops_execution_before_reconciling_capacity() {
    let (store, executor, mut received) = fixture(json!([task("cancel", &[])]));
    start(&store);
    let stop = CancellationToken::new();
    let daemon = tokio::spawn(dispatch::run(store.clone(), executor, stop.clone()));
    next(&mut received).await;
    let revision = store.snapshot().unwrap().tasks[0]["revision"]
        .as_u64()
        .unwrap();
    command(
        &store,
        "cancel".into(),
        Some(revision),
        json!({"type":"cancel_task","task_id":"cancel"}),
    )
    .unwrap();
    tokio::time::timeout(std::time::Duration::from_secs(6), async {
        loop {
            if store.snapshot().unwrap().attempts[0]["status"] == "cancelled" {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    stop.cancel();
    daemon.await.unwrap().unwrap();
    assert!(store.snapshot().unwrap().artifacts.is_empty());
}

#[tokio::test]
async fn failed_execution_does_not_stop_dispatch_or_replay_on_restart() {
    let (store, executor, mut received) = fixture(json!([task("fail", &[]), task("good", &[])]));
    start(&store);
    let stop = CancellationToken::new();
    let daemon = tokio::spawn(dispatch::run(store.clone(), executor.clone(), stop.clone()));
    next(&mut received).await;
    next(&mut received).await;
    executor.release.add_permits(2);
    until(&store, "fail", "failed").await;
    until(&store, "good", "completed").await;
    stop.cancel();
    daemon.await.unwrap().unwrap();
    let stop = CancellationToken::new();
    let daemon = tokio::spawn(dispatch::run(store.clone(), executor, stop.clone()));
    assert!(
        tokio::time::timeout(std::time::Duration::from_millis(1100), received.recv())
            .await
            .is_err()
    );
    stop.cancel();
    daemon.await.unwrap().unwrap();
    assert_eq!(store.snapshot().unwrap().attempts.len(), 2);
}
