use atomic_control::{Clock, CommandEnvelope, Store};
use serde_json::{json, Value};
use std::sync::{
    atomic::{AtomicI64, Ordering},
    Arc,
};
struct TestClock(AtomicI64);
impl Clock for TestClock {
    fn now_ms(&self) -> i64 {
        self.0.load(Ordering::SeqCst)
    }
}
fn command(
    store: &Store,
    id: &str,
    rev: Option<u64>,
    command: Value,
) -> atomic_control::Result<atomic_control::CommandResult> {
    store.command(CommandEnvelope {
        command_id: id.into(),
        expected_revision: rev,
        command,
    })
}
fn edit() -> Value {
    json!({"type":"update_task","task_id":"a","title":"Revised task","description":"Specific bounded work","instructions":["Read before writing"],"acceptance_criteria":["Trusted checks pass"]})
}
fn revision(store: &Store) -> u64 {
    store.snapshot().unwrap().tasks[0]["revision"]
        .as_u64()
        .unwrap()
}
#[test]
fn production_edits_require_cas_and_paused_inactive_work_without_scope_expansion() {
    let clock = Arc::new(TestClock(AtomicI64::new(1000)));
    let store = Store::open_with_clock(":memory:", clock.clone()).unwrap();
    command(&store,"plan",None,json!({"type":"create_plan","project_id":"p","title":"Plan","tasks":[{"id":"a","title":"A","description":"original","role":"edit","dependencies":[],"write_scopes":["src"]}]})).unwrap();
    let saved = command(&store, "edit", Some(1), edit()).unwrap();
    assert_eq!(saved.result["revision"], 2);
    assert_eq!(
        store.snapshot().unwrap().tasks[0]["instructions"],
        json!(["Read before writing"])
    );
    let snapshot = store.snapshot().unwrap();
    assert!(command(&store, "stale", Some(1), edit()).is_err());
    assert_eq!(store.snapshot().unwrap(), snapshot);
    let replay = command(&store, "edit", Some(1), edit()).unwrap();
    assert_eq!(saved.sequence, replay.sequence);
    let mut expanded = edit();
    expanded["write_scopes"] = json!(["."]);
    assert!(command(&store, "expand", Some(2), expanded).is_err());
    let mut invalid = edit();
    invalid["instructions"] = json!([{"tool":"shell"}]);
    assert!(command(&store, "invalid", Some(2), invalid).is_err());
    command(
        &store,
        "start",
        Some(1),
        json!({"type":"start_plan","plan_id":"plan-1"}),
    )
    .unwrap();
    assert!(command(&store, "active-edit", Some(revision(&store)), edit()).is_err());
    store.register_model_service("gpu", 1).unwrap();
    store
        .register_worker("w", "wsl", "gpu", "model", &["edit".into()])
        .unwrap();
    let claim = command(
        &store,
        "claim",
        Some(revision(&store)),
        json!({"type":"claim_task","task_id":"a","worker_id":"w"}),
    )
    .unwrap();
    command(
        &store,
        "pause",
        Some(2),
        json!({"type":"pause_plan","plan_id":"plan-1"}),
    )
    .unwrap();
    assert!(command(&store, "running-edit", Some(revision(&store)), edit()).is_err());
    clock.0.store(40000, Ordering::SeqCst);
    store.recover_expired().unwrap();
    assert!(command(&store, "unknown-edit", Some(revision(&store)), edit()).is_err());
    store
        .reconcile_stopped(claim.result["attempt_id"].as_str().unwrap())
        .unwrap();
    let attempt = store.snapshot().unwrap().attempts[0].clone();
    command(&store, "failed-edit", Some(revision(&store)), edit()).unwrap();
    assert_eq!(
        store.snapshot().unwrap().attempts[0],
        attempt,
        "editing a task must preserve historical execution evidence"
    );
    assert_eq!(
        store.snapshot().unwrap().tasks[0]["write_scopes"],
        json!(["src"])
    );
}
#[tokio::test]
async fn authenticated_http_editor_uses_the_canonical_command() {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;
    let store = Store::open(":memory:").unwrap();
    command(&store,"plan",None,json!({"type":"create_plan","project_id":"p","title":"Plan","tasks":[{"id":"a","title":"A","description":"original","role":"edit","dependencies":[],"write_scopes":["src"]}]})).unwrap();
    let app = atomic_control::router(store.clone(), "private");
    let payload = serde_json::to_vec(&CommandEnvelope {
        command_id: "edit".into(),
        expected_revision: Some(1),
        command: edit(),
    })
    .unwrap();
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/v1/control/commands")
                .header("authorization", "Bearer private")
                .header("content-type", "application/json")
                .body(Body::from(payload))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        store.snapshot().unwrap().tasks[0]["acceptance_criteria"],
        json!(["Trusted checks pass"])
    );
}
