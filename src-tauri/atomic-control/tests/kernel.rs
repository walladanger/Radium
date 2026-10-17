use atomic_control::{ArtifactEvidence, Clock, CommandEnvelope, Store};
use futures_core::Stream;
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
    revision: Option<u64>,
    value: Value,
) -> atomic_control::Result<atomic_control::CommandResult> {
    store.command(CommandEnvelope {
        command_id: id.into(),
        expected_revision: revision,
        command: value,
    })
}
fn task(id: &str, deps: Vec<&str>) -> Value {
    json!({"id":id,"title":id,"description":"bounded work","role":"edit","dependencies":deps,"write_scopes":["src"]})
}
fn setup() -> (Store, Arc<TestClock>) {
    let clock = Arc::new(TestClock(AtomicI64::new(1000)));
    let store = Store::open_with_clock(":memory:", clock.clone()).unwrap();
    command(&store,"plan",None,json!({"type":"create_plan","project_id":"p","title":"plan","tasks":[task("a",vec![]),task("b",vec![]),task("join",vec!["a","b"])]})).unwrap();
    command(
        &store,
        "start",
        Some(1),
        json!({"type":"start_plan","plan_id":"plan-1"}),
    )
    .unwrap();
    store.register_model_service("gpu0", 1).unwrap();
    store.register_model_service("gpu1", 1).unwrap();
    for (id, service, model) in [
        ("w1", "gpu0", "m1"),
        ("w2", "gpu1", "m2"),
        ("w3", "gpu0", "alias-m1"),
    ] {
        store
            .register_worker(id, "local", service, model, &["edit".into()])
            .unwrap();
    }
    (store, clock)
}
fn revision(store: &Store, id: &str) -> u64 {
    store
        .snapshot()
        .unwrap()
        .tasks
        .iter()
        .find(|t| t["id"] == id)
        .unwrap()["revision"]
        .as_u64()
        .unwrap()
}
fn claim(store: &Store, id: &str, worker: &str, task: &str) -> Value {
    command(
        store,
        id,
        Some(revision(store, task)),
        json!({"type":"claim_task","worker_id":worker,"task_id":task}),
    )
    .unwrap()
    .result
}
fn finish(store: &Store, id: &str, claim: &Value) {
    store
        .validate_artifact(
            claim["attempt_id"].as_str().unwrap(),
            claim["fencing_token"].as_u64().unwrap(),
            ArtifactEvidence {
                id: format!("artifact-{id}"),
                kind: "patch".into(),
                path: "result.patch".into(),
            },
        )
        .unwrap();
    command(store,id,None,json!({"type":"finish_attempt","attempt_id":claim["attempt_id"],"fencing_token":claim["fencing_token"],"outcome":"succeeded","artifacts":[]})).unwrap();
}
#[test]
fn dag_and_trusted_validation() {
    let (store, _) = setup();
    let a = claim(&store, "claim-a", "w1", "a");
    let rejected = command(
        &store,
        "fake",
        None,
        json!({"type":"finish_attempt","attempt_id":a["attempt_id"],"fencing_token":a["fencing_token"],"outcome":"succeeded","artifacts":[{"validated":true}]}),
    );
    assert_eq!(rejected.unwrap_err().code, "conflict");
    finish(&store, "done-a", &a);
    assert_eq!(store.snapshot().unwrap().tasks[2]["status"], "planned");
    let b = claim(&store, "claim-b", "w2", "b");
    finish(&store, "done-b", &b);
    assert_eq!(store.snapshot().unwrap().tasks[2]["status"], "ready");
}
#[test]
fn unknown_outcome_fences_and_reserves_capacity_until_trusted_reconciliation() {
    let (store, clock) = setup();
    let before = store.snapshot().unwrap().sequence;
    store.recover_expired().unwrap();
    assert_eq!(store.snapshot().unwrap().sequence, before);
    let a = claim(&store, "claim-a", "w1", "a");
    clock.0.store(31000, Ordering::SeqCst);
    store.recover_expired().unwrap();
    let recovered_sequence = store.snapshot().unwrap().sequence;
    store.recover_expired().unwrap();
    assert_eq!(store.snapshot().unwrap().sequence, recovered_sequence);
    assert_eq!(
        store.snapshot().unwrap().attempts[0]["status"],
        "outcome_unknown"
    );
    assert!(command(
        &store,
        "late",
        None,
        json!({"type":"heartbeat","attempt_id":a["attempt_id"],"fencing_token":a["fencing_token"]})
    )
    .is_err());
    assert!(command(
        &store,
        "blocked",
        Some(revision(&store, "b")),
        json!({"type":"claim_task","worker_id":"w3","task_id":"b"})
    )
    .is_err());
    store
        .reconcile_stopped(a["attempt_id"].as_str().unwrap())
        .unwrap();
    claim(&store, "recovered", "w3", "b");
}
#[test]
fn failed_commands_do_not_mutate_and_idempotency_is_exact() {
    let (store, _) = setup();
    let before = store.snapshot().unwrap().sequence;
    let c = json!({"type":"pause_plan","plan_id":"plan-1"});
    assert!(command(&store, "stale", Some(1), c.clone()).is_err());
    assert_eq!(store.snapshot().unwrap().sequence, before);
    let first = command(&store, "pause", Some(2), c.clone()).unwrap();
    let second = command(&store, "pause", Some(2), c).unwrap();
    assert_eq!(first.sequence, second.sequence);
    assert!(command(
        &store,
        "pause",
        Some(3),
        json!({"type":"start_plan","plan_id":"plan-1"})
    )
    .is_err());
}
#[test]
fn cycles_and_missing_dependencies_are_rejected_atomically() {
    for tasks in [
        vec![task("a", vec!["b"]), task("b", vec!["a"])],
        vec![task("a", vec!["missing"])],
    ] {
        let store = Store::open(":memory:").unwrap();
        assert!(command(
            &store,
            "invalid",
            None,
            json!({"type":"create_plan","project_id":"p","title":"p","tasks":tasks})
        )
        .is_err());
        assert_eq!(store.snapshot().unwrap().sequence, 0);
    }
}

#[test]
fn restart_preserves_events_state_and_command_receipts() {
    let path = std::env::temp_dir().join(format!(
        "atomic-control-test-{}-{}.sqlite",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    let envelope = CommandEnvelope {
        command_id: "persist".into(),
        expected_revision: None,
        command: json!({"type":"create_plan","project_id":"p","title":"persist","tasks":[task("a",vec![])]}),
    };
    let first = {
        let store = Store::open(&path).unwrap();
        store.command(envelope.clone()).unwrap()
    };
    let store = Store::open(&path).unwrap();
    assert_eq!(store.snapshot().unwrap().plans.len(), 1);
    assert_eq!(store.command(envelope).unwrap().sequence, first.sequence);
    assert_eq!(store.events(0).unwrap().len(), 1);
    drop(store);
    std::fs::remove_file(path).unwrap();
}

#[test]
fn capacity_cancellation_retry_budget_and_approval_race() {
    let (store, _) = setup();
    let a = claim(&store, "a", "w1", "a");
    assert!(command(
        &store,
        "same-model",
        Some(revision(&store, "b")),
        json!({"type":"claim_task","worker_id":"w3","task_id":"b"})
    )
    .is_err());
    let approval=command(&store,"ask",None,json!({"type":"request_approval","attempt_id":a["attempt_id"],"fencing_token":a["fencing_token"],"kind":"tool","description":"permit check"})).unwrap().result;
    command(
        &store,
        "allow",
        Some(1),
        json!({"type":"resolve_approval","approval_id":approval["approval_id"],"decision":"allow"}),
    )
    .unwrap();
    assert!(command(
        &store,
        "deny",
        Some(1),
        json!({"type":"resolve_approval","approval_id":approval["approval_id"],"decision":"deny"})
    )
    .is_err());
    command(
        &store,
        "cancel",
        Some(revision(&store, "a")),
        json!({"type":"cancel_task","task_id":"a"}),
    )
    .unwrap();
    assert_eq!(
        store.snapshot().unwrap().attempts[0]["status"],
        "outcome_unknown"
    );
    store
        .reconcile_stopped(a["attempt_id"].as_str().unwrap())
        .unwrap();
    assert_eq!(store.snapshot().unwrap().attempts[0]["status"], "cancelled");
    let b = claim(&store, "b", "w2", "b");
    command(&store,"fail1",None,json!({"type":"finish_attempt","attempt_id":b["attempt_id"],"fencing_token":b["fencing_token"],"outcome":"failed"})).unwrap();
    command(
        &store,
        "retry",
        Some(revision(&store, "b")),
        json!({"type":"retry_task","task_id":"b"}),
    )
    .unwrap();
    let b = claim(&store, "b2", "w2", "b");
    command(&store,"fail2",None,json!({"type":"finish_attempt","attempt_id":b["attempt_id"],"fencing_token":b["fencing_token"],"outcome":"failed"})).unwrap();
    assert!(command(
        &store,
        "third",
        Some(revision(&store, "b")),
        json!({"type":"retry_task","task_id":"b"})
    )
    .is_err());
}

#[tokio::test]
async fn sse_replays_after_cursor_and_rejects_future_cursor() {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;
    let (store, _) = setup();
    let sequence = store.snapshot().unwrap().sequence;
    let app = atomic_control::router(store, "secret");
    let response = app
        .clone()
        .oneshot(
            Request::builder()
                .uri(format!("/v1/control/events?after={}", sequence - 1))
                .header("authorization", "Bearer secret")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(response.headers()["content-type"], "text/event-stream");
    let mut body = response.into_body().into_data_stream();
    let bytes = tokio::time::timeout(
        std::time::Duration::from_secs(1),
        std::future::poll_fn(|cx| std::pin::Pin::new(&mut body).poll_next(cx)),
    )
    .await
    .unwrap()
    .unwrap()
    .unwrap();
    let text = std::str::from_utf8(&bytes).unwrap();
    assert!(text.contains(&format!("id: {sequence}")));
    assert!(text.contains("event: control"));
    let future = app
        .oneshot(
            Request::builder()
                .uri(format!("/v1/control/events?after={}", sequence + 1))
                .header("authorization", "Bearer secret")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(future.status(), StatusCode::CONFLICT);
}
#[tokio::test]
async fn transport_requires_header_auth_and_has_no_validation_endpoint() {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;
    let (store, _) = setup();
    let app = atomic_control::router(store, "secret");
    let unauth = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v1/control/snapshot?token=secret")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unauth.status(), StatusCode::UNAUTHORIZED);
    let auth = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v1/control/snapshot")
                .header("authorization", "Bearer secret")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(auth.status(), StatusCode::OK);
    let forbidden = app
        .oneshot(
            Request::builder()
                .uri("/v1/control/validate_artifact")
                .header("authorization", "Bearer secret")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(forbidden.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn authenticated_snapshot_omits_executor_authority() {
    use axum::{
        body::{to_bytes, Body},
        http::Request,
    };
    use tower::ServiceExt;
    let (store, _) = setup();
    let claimed = claim(&store, "claim-private", "w1", "a");
    assert!(claimed["fencing_token"].is_number());
    let response = atomic_control::router(store.clone(), "secret")
        .oneshot(
            Request::builder()
                .uri("/v1/control/snapshot")
                .header("authorization", "Bearer secret")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let bytes = to_bytes(response.into_body(), 1024 * 1024).await.unwrap();
    let public: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(public["attempts"][0]["id"], claimed["attempt_id"]);
    assert!(public["attempts"][0].get("fencing_token").is_none());
    assert!(public["attempts"][0].get("lease_expires_at").is_none());
    assert!(store.snapshot().unwrap().attempts[0]["fencing_token"].is_number());
}

#[tokio::test]
async fn client_credentials_cannot_register_or_execute_workers() {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;
    let (store, _) = setup();
    let sequence = store.snapshot().unwrap().sequence;
    let app = atomic_control::router(store.clone(), "secret");
    for kind in [
        "register_worker",
        "claim_task",
        "heartbeat",
        "finish_attempt",
        "request_approval",
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/v1/control/commands")
                    .header("authorization", "Bearer secret")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({"command_id":kind,"command":{"type":kind}}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN, "{kind}");
    }
    assert_eq!(store.snapshot().unwrap().sequence, sequence);
}
#[test]
fn trusted_registry_survives_restart_and_rejects_rebinding() {
    let path = std::env::temp_dir().join(format!(
        "atomic-registry-{}-{}.sqlite",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    {
        let store = Store::open(&path).unwrap();
        assert!(store.register_model_service("gpu0", 0).is_err());
        store.register_model_service("gpu0", 1).unwrap();
        assert!(store
            .register_worker("w", "local", "missing", "m", &["edit".into()])
            .is_err());
        store
            .register_worker("w", "local", "gpu0", "m", &["edit".into()])
            .unwrap();
        assert!(store
            .register_worker("w", "local", "gpu0", "alias", &["edit".into()])
            .is_err());
        assert!(command(
            &store,
            "untrusted",
            None,
            json!({"type":"register_worker","worker_id":"other","model":"alias"})
        )
        .is_err());
    }
    let store = Store::open(&path).unwrap();
    let snapshot = store.snapshot().unwrap();
    assert_eq!(
        snapshot.model_services[0],
        json!({"id":"gpu0","capacity":1})
    );
    assert_eq!(snapshot.workers[0]["service_id"], "gpu0");
    assert_eq!(snapshot.workers.len(), 1);
    drop(store);
    std::fs::remove_file(path).unwrap();
}

#[tokio::test]
async fn cors_is_explicit_and_preflight_does_not_authorize_commands() {
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use tower::ServiceExt;
    let store = Store::open(":memory:").unwrap();
    for invalid in [
        "*",
        "null",
        "http://localhost:1420/path",
        "http://user@localhost:1420",
        "http://localhost:1420/",
    ] {
        assert!(atomic_control::http::router_with_origins(
            store.clone(),
            "secret",
            vec![invalid.into()]
        )
        .is_err());
    }
    let app = atomic_control::http::router_with_origins(
        store.clone(),
        "secret",
        vec!["http://localhost:1420".into()],
    )
    .unwrap();
    let preflight = app
        .clone()
        .oneshot(
            Request::builder()
                .method("OPTIONS")
                .uri("/v1/control/commands")
                .header("origin", "http://localhost:1420")
                .header("access-control-request-method", "POST")
                .header(
                    "access-control-request-headers",
                    "Authorization, Content-Type",
                )
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(preflight.status(), StatusCode::NO_CONTENT);
    assert_eq!(
        preflight.headers()["access-control-allow-origin"],
        "http://localhost:1420"
    );
    assert!(!preflight
        .headers()
        .contains_key("access-control-allow-credentials"));
    for (origin, method, requested_header) in [
        ("http://evil.test", "POST", "authorization"),
        ("http://localhost:1420", "DELETE", "authorization"),
        ("http://localhost:1420", "POST", "x-admin"),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("OPTIONS")
                    .uri("/v1/control/commands")
                    .header("origin", origin)
                    .header("access-control-request-method", method)
                    .header("access-control-request-headers", requested_header)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        assert!(!response
            .headers()
            .contains_key("access-control-allow-origin"));
    }
    let unauth = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/v1/control/snapshot")
                .header("origin", "http://localhost:1420")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(unauth.status(), StatusCode::UNAUTHORIZED);
    let auth = app
        .oneshot(
            Request::builder()
                .uri("/v1/control/snapshot")
                .header("origin", "http://localhost:1420")
                .header("authorization", "Bearer secret")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(auth.status(), StatusCode::OK);
    assert_eq!(
        auth.headers()["access-control-allow-origin"],
        "http://localhost:1420"
    );
    let disabled = atomic_control::router(store, "secret")
        .oneshot(
            Request::builder()
                .uri("/v1/control/snapshot")
                .header("origin", "http://localhost:1420")
                .header("authorization", "Bearer secret")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(disabled.status(), StatusCode::FORBIDDEN);
}
