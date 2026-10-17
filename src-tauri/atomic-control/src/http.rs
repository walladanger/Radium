//! Authenticated loopback transport. Artifact validation is deliberately not exposed.
use crate::{CommandEnvelope, Error, Store};
use axum::{
    extract::{DefaultBodyLimit, Query, State},
    http::{HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{
        sse::{Event, KeepAlive, Sse},
        IntoResponse, Response,
    },
    routing::{get, post},
    Json, Router,
};
use futures_core::Stream;
use serde::Deserialize;
use serde_json::json;
use std::{
    collections::VecDeque,
    convert::Infallible,
    pin::Pin,
    sync::Arc,
    task::{Context, Poll},
    time::Duration,
};

#[derive(Clone)]
struct Api {
    store: Store,
    token: Arc<str>,
    origins: Arc<Vec<String>>,
}

/// Build the API. The caller must bind its listener to loopback.
pub fn router(store: Store, token: impl Into<String>) -> Router {
    router_with_origins(store, token, Vec::new()).expect("empty origin list is valid")
}
/// Enable only explicitly trusted serialized origins. No wildcard or opaque origin.
pub fn router_with_origins(
    store: Store,
    token: impl Into<String>,
    origins: Vec<String>,
) -> Result<Router, Error> {
    for origin in &origins {
        let uri: axum::http::Uri = origin
            .parse()
            .map_err(|_| crate::err("invalid_request", "invalid origin"))?;
        if origin == "null"
            || origin.contains('*')
            || uri.authority().is_none()
            || uri.authority().is_some_and(|v| v.as_str().contains('@'))
            || !matches!(uri.scheme_str(), Some("http" | "https" | "tauri"))
            || uri.path_and_query().is_some_and(|v| v.as_str() != "/")
            || origin.ends_with('/')
        {
            return Err(crate::err(
                "invalid_request",
                "exact serialized origin required",
            ));
        }
    }
    let api = Api {
        store,
        token: Arc::from(token.into()),
        origins: Arc::new(origins),
    };
    Ok(Router::new()
        .route("/v1/control/capabilities", get(capabilities))
        .route("/v1/control/snapshot", get(snapshot))
        .route("/v1/control/commands", post(command))
        .route("/v1/control/events", get(events))
        .layer(DefaultBodyLimit::max(262_144))
        .layer(middleware::from_fn_with_state(api.clone(), authenticate))
        .with_state(api))
}
async fn authenticate(
    State(api): State<Api>,
    headers: HeaderMap,
    request: axum::extract::Request,
    next: Next,
) -> Response {
    let origin = headers.get("origin").and_then(|v| v.to_str().ok());
    if headers.contains_key("origin")
        && !origin.is_some_and(|v| api.origins.iter().any(|allowed| allowed == v))
    {
        return StatusCode::FORBIDDEN.into_response();
    }
    if request.method() == axum::http::Method::OPTIONS {
        let valid_method = headers
            .get("access-control-request-method")
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| matches!(v, "GET" | "POST"));
        let valid_headers = headers
            .get("access-control-request-headers")
            .and_then(|v| v.to_str().ok())
            .is_none_or(|v| {
                v.split(',').all(|h| {
                    matches!(
                        h.trim().to_ascii_lowercase().as_str(),
                        "authorization" | "content-type"
                    )
                })
            });
        if origin.is_none() || !valid_method || !valid_headers {
            return StatusCode::FORBIDDEN.into_response();
        }
        let mut response = StatusCode::NO_CONTENT.into_response();
        cors_headers(response.headers_mut(), origin.unwrap());
        response
            .headers_mut()
            .insert("access-control-allow-methods", "GET, POST".parse().unwrap());
        response.headers_mut().insert(
            "access-control-allow-headers",
            "authorization, content-type".parse().unwrap(),
        );
        return response;
    }
    let supplied = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));
    // Empty tokens are never valid, including a misconfigured empty server secret.
    if api.token.is_empty() || supplied != Some(api.token.as_ref()) {
        return (
            StatusCode::UNAUTHORIZED,
            Json(json!({"code":"unauthorized","message":"Bearer authentication required"})),
        )
            .into_response();
    }
    let mut response = next.run(request).await;
    if let Some(origin) = origin {
        cors_headers(response.headers_mut(), origin);
    }
    response
}
fn cors_headers(headers: &mut HeaderMap, origin: &str) {
    headers.insert(
        "access-control-allow-origin",
        origin.parse().expect("validated request origin"),
    );
    headers.append("vary", "Origin".parse().unwrap());
}
impl IntoResponse for Error {
    fn into_response(self) -> Response {
        let status = match self.code.as_str() {
            "invalid_request" => StatusCode::BAD_REQUEST,
            "not_found" => StatusCode::NOT_FOUND,
            "conflict" => StatusCode::CONFLICT,
            "forbidden" => StatusCode::FORBIDDEN,
            _ => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (status, Json(self)).into_response()
    }
}
async fn capabilities() -> Json<serde_json::Value> {
    Json(
        json!({"schema_version":1,"capabilities":["durable_tasks","resumable_events","worker_fencing","trusted_artifact_validation"]}),
    )
}
async fn snapshot(State(api): State<Api>) -> Result<Json<crate::Snapshot>, Error> {
    Ok(Json(public_snapshot(api.store.snapshot()?)))
}

fn fields(value: &serde_json::Value, names: &[&str]) -> serde_json::Value {
    serde_json::Value::Object(
        names
            .iter()
            .filter_map(|name| {
                value
                    .get(*name)
                    .map(|value| ((*name).to_owned(), value.clone()))
            })
            .collect(),
    )
}

/// The durable executor ledger is private. Add display fields explicitly here.
fn public_snapshot(mut snapshot: crate::Snapshot) -> crate::Snapshot {
    for attempt in &mut snapshot.attempts {
        *attempt = fields(
            attempt,
            &[
                "id",
                "task_id",
                "worker_id",
                "service_id",
                "model",
                "role",
                "status",
                "created_at",
                "finished_at",
                "stage",
                "step_index",
                "progress_revision",
                "current_tool",
                "step_count",
            ],
        );
    }
    for tool in &mut snapshot.tool_executions {
        *tool = fields(
            tool,
            &[
                "id",
                "attempt_id",
                "status",
                "started_at",
                "finished_at",
                "exit_code",
            ],
        );
    }
    snapshot
}

fn public_event(event: &serde_json::Value) -> serde_json::Value {
    let mut projected = fields(
        event,
        &[
            "sequence",
            "event_id",
            "event_type",
            "created_at",
            "task_id",
            "attempt_id",
        ],
    );
    projected["payload"] = fields(
        &event["payload"],
        &[
            "plan_id",
            "task_id",
            "attempt_id",
            "worker_id",
            "service_id",
            "model",
            "stage",
            "step_index",
            "current_tool",
            "step_count",
            "tool_id",
            "approval_id",
            "artifact_id",
            "candidate_id",
        ],
    );
    projected
}
async fn command(
    State(api): State<Api>,
    Json(command): Json<CommandEnvelope>,
) -> Result<Json<crate::CommandResult>, Error> {
    // Client credentials never confer executor or administration authority.
    match command.command["type"].as_str() {
        Some(
            "create_plan" | "update_task" | "start_plan" | "pause_plan" | "cancel_plan"
            | "cancel_task" | "retry_task" | "resolve_approval",
        ) => {}
        _ => {
            return Err(crate::err(
                "forbidden",
                "command requires a trusted executor or administrator",
            ))
        }
    }
    Ok(Json(api.store.command(command)?))
}
#[derive(Deserialize)]
struct Cursor {
    #[serde(default)]
    after: u64,
}
async fn events(
    State(api): State<Api>,
    Query(cursor): Query<Cursor>,
) -> Result<impl IntoResponse, Error> {
    if cursor.after > api.store.snapshot()?.sequence {
        return Err(crate::err("conflict", "cursor exceeds current sequence"));
    }
    Ok(Sse::new(EventStream {
        store: api.store,
        after: cursor.after,
        pending: VecDeque::new(),
        interval: tokio::time::interval(Duration::from_millis(200)),
        stopped: false,
    })
    .keep_alive(KeepAlive::default()))
}
struct EventStream {
    store: Store,
    after: u64,
    pending: VecDeque<serde_json::Value>,
    interval: tokio::time::Interval,
    stopped: bool,
}
impl Stream for EventStream {
    type Item = Result<Event, Infallible>;
    fn poll_next(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        if this.stopped {
            return Poll::Ready(None);
        }
        if this.pending.is_empty() {
            if this.interval.poll_tick(cx).is_pending() {
                return Poll::Pending;
            }
            match this.store.events(this.after) {
                Ok(events) => this.pending.extend(events),
                Err(_) => {
                    this.stopped = true;
                    return Poll::Ready(Some(Ok(Event::default()
                        .event("error")
                        .data("snapshot required"))));
                }
            }
        }
        if let Some(event) = this.pending.pop_front() {
            this.after = event["sequence"].as_u64().unwrap_or(this.after);
            return Poll::Ready(Some(Ok(Event::default()
                .id(this.after.to_string())
                .event("control")
                .data(public_event(&event).to_string()))));
        }
        // Register a wakeup for the next polling interval when no event exists.
        let _ = this.interval.poll_tick(cx);
        Poll::Pending
    }
}

#[cfg(test)]
mod projection_tests {
    use super::*;

    #[test]
    fn public_projection_excludes_executor_authority_and_raw_content() {
        let snapshot = crate::Snapshot {
            attempts: vec![
                json!({"id":"attempt", "stage":"preparing_tool", "current_tool":"read_file", "fencing_token":7, "lease_expires_at":123, "reasoning":"private"}),
            ],
            tool_executions: vec![
                json!({"id":"tool", "attempt_id":"attempt", "status":"succeeded", "exit_code":0, "argv":["secret"], "workspace":"private", "stdout":"private", "fencing_token":7}),
            ],
            ..Default::default()
        };
        let projected = public_snapshot(snapshot.clone());
        assert_eq!(
            projected.attempts[0],
            json!({"id":"attempt", "stage":"preparing_tool", "current_tool":"read_file"})
        );
        assert_eq!(
            projected.tool_executions[0],
            json!({"id":"tool", "attempt_id":"attempt", "status":"succeeded", "exit_code":0})
        );
        assert_eq!(snapshot.attempts[0]["fencing_token"], 7);
        let event = json!({"sequence":1, "event_type":"claim_task", "payload":{"attempt_id":"attempt", "fencing_token":7, "instructions":["private"], "stdout":"private"}});
        assert_eq!(
            public_event(&event),
            json!({"sequence":1, "event_type":"claim_task", "payload":{"attempt_id":"attempt"}})
        );
    }
}
