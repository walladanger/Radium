//! Durable single-authority local controller. HTTP workers cannot validate evidence.
pub mod execution;
pub mod http;
pub mod worker;
pub use http::router;
use rusqlite::{params, Connection, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    path::Path,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

pub trait Clock: Send + Sync {
    fn now_ms(&self) -> i64;
}
struct WallClock;
impl Clock for WallClock {
    fn now_ms(&self) -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64
    }
}
#[derive(Debug, Clone, Serialize)]
pub struct Error {
    pub code: String,
    pub message: String,
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for Error {}
impl From<rusqlite::Error> for Error {
    fn from(e: rusqlite::Error) -> Self {
        err("internal", &e.to_string())
    }
}
impl From<serde_json::Error> for Error {
    fn from(e: serde_json::Error) -> Self {
        err("invalid_request", &e.to_string())
    }
}
fn err(code: &str, message: &str) -> Error {
    Error {
        code: code.into(),
        message: message.into(),
    }
}
pub type Result<T> = std::result::Result<T, Error>;
#[derive(Clone, Serialize, Deserialize)]
pub struct CommandEnvelope {
    pub command_id: String,
    pub expected_revision: Option<u64>,
    pub command: Value,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct CommandResult {
    pub sequence: u64,
    pub result: Value,
}
#[derive(Clone, Serialize, Deserialize, Default, Debug, PartialEq)]
pub struct Snapshot {
    pub schema_version: u32,
    pub sequence: u64,
    pub plans: Vec<Value>,
    pub tasks: Vec<Value>,
    pub attempts: Vec<Value>,
    pub workers: Vec<Value>,
    #[serde(default)]
    pub model_services: Vec<Value>,
    pub approvals: Vec<Value>,
    pub artifacts: Vec<Value>,
    pub candidates: Vec<Value>,
    #[serde(default)]
    pub tool_executions: Vec<Value>,
}
#[derive(Clone)]
pub struct Store {
    db: Arc<Mutex<Connection>>,
    clock: Arc<dyn Clock>,
}
/// Evidence is accepted only through this in-process interface after a trusted verifier ran.
pub struct ArtifactEvidence {
    pub id: String,
    pub kind: String,
    pub path: String,
}
impl Store {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        Self::open_with_clock(path, Arc::new(WallClock))
    }
    pub fn open_with_clock(path: impl AsRef<Path>, clock: Arc<dyn Clock>) -> Result<Self> {
        let db = Connection::open(path)?;
        db.busy_timeout(std::time::Duration::from_secs(5))?;
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1),body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY,body TEXT NOT NULL,result TEXT NOT NULL); CREATE TABLE IF NOT EXISTS events(sequence INTEGER PRIMARY KEY,body TEXT NOT NULL);")?;
        let initial = Snapshot {
            schema_version: 1,
            ..Default::default()
        };
        db.execute(
            "INSERT OR IGNORE INTO state VALUES(1,?1)",
            [serde_json::to_string(&initial)?],
        )?;
        Ok(Self {
            db: Arc::new(Mutex::new(db)),
            clock,
        })
    }
    pub fn snapshot(&self) -> Result<Snapshot> {
        let db = self
            .db
            .lock()
            .map_err(|_| err("internal", "database lock poisoned"))?;
        read(&db)
    }
    pub fn events(&self, after: u64) -> Result<Vec<Value>> {
        let db = self
            .db
            .lock()
            .map_err(|_| err("internal", "database lock poisoned"))?;
        let mut q =
            db.prepare("SELECT body FROM events WHERE sequence>?1 ORDER BY sequence LIMIT 1000")?;
        let rows = q.query_map([after], |r| r.get::<_, String>(0))?;
        rows.map(|r| Ok(serde_json::from_str(&r?)?)).collect()
    }
    pub fn command(&self, envelope: CommandEnvelope) -> Result<CommandResult> {
        if envelope.command_id.is_empty() || envelope.command_id.len() > 128 {
            return Err(err("invalid_request", "command_id must be 1..128 bytes"));
        }
        let body = serde_json::to_string(&envelope)?;
        if body.len() > 262144 {
            return Err(err("invalid_request", "command too large"));
        }
        let mut db = self
            .db
            .lock()
            .map_err(|_| err("internal", "database lock poisoned"))?;
        let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let old = tx.query_row(
            "SELECT body,result FROM commands WHERE id=?1",
            [&envelope.command_id],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)),
        );
        match old {
            Ok((previous, result)) => {
                if previous != body {
                    return Err(err("conflict", "command_id payload conflict"));
                }
                return Ok(serde_json::from_str(&result)?);
            }
            Err(rusqlite::Error::QueryReturnedNoRows) => {}
            Err(e) => return Err(e.into()),
        }
        let mut state = read(&tx)?;
        let now = self.clock.now_ms();
        let result = apply(&mut state, &envelope, now)?;
        refresh(&mut state, now);
        let kind = text(&envelope.command, "type")?;
        persist(&tx, &mut state, kind, &envelope.command, now)?;
        let result = CommandResult {
            sequence: state.sequence,
            result,
        };
        tx.execute(
            "INSERT INTO commands VALUES(?1,?2,?3)",
            params![envelope.command_id, body, serde_json::to_string(&result)?],
        )?;
        tx.commit()?;
        Ok(result)
    }
    /// Trusted administration only: configure a concrete inference service before workers.
    /// Identities must describe physical admission domains, not model aliases.
    pub fn register_model_service(&self, id: &str, capacity: u64) -> Result<()> {
        if id.is_empty() || capacity == 0 || capacity > 2 {
            return Err(err(
                "invalid_request",
                "service id and capacity 1..2 required",
            ));
        }
        self.mutate(
            "model_service_registered",
            json!({"service_id":id}),
            |s, _| {
                if s.model_services.iter().any(|v| v["id"] == id) {
                    return Err(err("conflict", "service already registered"));
                }
                s.model_services.push(json!({"id":id,"capacity":capacity}));
                Ok(())
            },
        )
    }
    /// Bind a trusted executor to an immutable admission service and permitted roles.
    /// This method is deliberately unavailable through the client HTTP API.
    pub fn register_worker(
        &self,
        id: &str,
        host: &str,
        service: &str,
        model: &str,
        capabilities: &[String],
    ) -> Result<()> {
        if [id, host, service, model].iter().any(|v| v.is_empty())
            || capabilities.is_empty()
            || capabilities.iter().any(|v| v.is_empty())
        {
            return Err(err(
                "invalid_request",
                "worker fields and nonempty capabilities required",
            ));
        }
        self.mutate("worker_registered", json!({"worker_id":id}), |s, _| {
            find(&s.model_services, service)?;
            if s.workers.iter().any(|v| v["id"] == id) {
                return Err(err("conflict", "worker already registered"));
            }
            s.workers.push(json!({"id":id,"host_id":host,"service_id":service,"model":model,"capabilities":capabilities,"status":"idle"}));
            Ok(())
        })
    }
    pub fn validate_artifact(
        &self,
        attempt_id: &str,
        fencing_token: u64,
        evidence: ArtifactEvidence,
    ) -> Result<()> {
        if evidence.id.is_empty() || evidence.path.is_empty() || evidence.kind.is_empty() {
            return Err(err("invalid_request", "evidence fields required"));
        }
        self.mutate("artifact_validated",json!({"attempt_id":attempt_id}),|s,now|{ let a=lease(s,attempt_id,fencing_token,now)?.clone(); if s.artifacts.iter().any(|v|v["id"]==evidence.id) {return Err(err("conflict","artifact id already exists"));} s.artifacts.push(json!({"id":evidence.id,"kind":evidence.kind,"path":evidence.path,"task_id":a["task_id"],"attempt_id":attempt_id,"validated":true})); Ok(()) })
    }
    pub fn recover_expired(&self) -> Result<()> {
        self.mutate("leases_recovered", json!({}), |s, now| {
            for a in &mut s.attempts {
                if a["status"] == "running" && a["lease_expires_at"].as_i64().unwrap_or(0) <= now {
                    a["status"] = json!("outcome_unknown");
                    a["finished_at"] = json!(now);
                    let task = find_mut(&mut s.tasks, a["task_id"].as_str().unwrap_or(""))?;
                    task["status"] = json!("blocked");
                    bump(task);
                }
            }
            Ok(())
        })
    }
    /// Release uncertain capacity only after a trusted executor confirms process termination.
    /// This method is never available to HTTP workers.
    pub fn reconcile_stopped(&self, attempt_id: &str) -> Result<()> {
        self.mutate(
            "attempt_reconciled",
            json!({"attempt_id":attempt_id}),
            |s, now| {
                let attempt = find(&s.attempts, attempt_id)?.clone();
                if attempt["status"] != "outcome_unknown" {
                    return Err(err("conflict", "attempt is not awaiting reconciliation"));
                }
                let task = find_mut(&mut s.tasks, attempt["task_id"].as_str().unwrap())?;
                for tool in &mut s.tool_executions {
                    if tool["attempt_id"] == attempt_id
                        && (tool["status"] == "running" || tool["status"] == "outcome_unknown")
                    {
                        tool["status"] = json!("cancelled");
                        tool["finished_at"] = json!(now);
                    }
                }
                let cancelled = task["status"] == "cancelled";
                if !cancelled {
                    task["status"] = json!("failed");
                    bump(task);
                }
                let attempt = find_mut(&mut s.attempts, attempt_id)?;
                attempt["status"] = json!(if cancelled { "cancelled" } else { "failed" });
                attempt["finished_at"] = json!(now);
                Ok(())
            },
        )
    }
    fn mutate(
        &self,
        kind: &str,
        payload: Value,
        f: impl FnOnce(&mut Snapshot, i64) -> Result<()>,
    ) -> Result<()> {
        let mut db = self
            .db
            .lock()
            .map_err(|_| err("internal", "database lock poisoned"))?;
        let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)?;
        let mut s = read(&tx)?;
        let previous = s.clone();
        let now = self.clock.now_ms();
        f(&mut s, now)?;
        refresh(&mut s, now);
        if s == previous {
            tx.commit()?;
            return Ok(());
        }
        persist(&tx, &mut s, kind, &payload, now)?;
        tx.commit()?;
        Ok(())
    }
}
fn read(db: &Connection) -> Result<Snapshot> {
    Ok(serde_json::from_str(&db.query_row(
        "SELECT body FROM state WHERE id=1",
        [],
        |r| r.get::<_, String>(0),
    )?)?)
}
fn persist(db: &Connection, s: &mut Snapshot, kind: &str, payload: &Value, now: i64) -> Result<()> {
    s.sequence += 1;
    let event = json!({"sequence":s.sequence,"event_id":format!("event-{}",s.sequence),"event_type":kind,"created_at":now,"task_id":payload.get("task_id"),"attempt_id":payload.get("attempt_id"),"payload":payload});
    db.execute(
        "INSERT INTO events VALUES(?1,?2)",
        params![s.sequence, serde_json::to_string(&event)?],
    )?;
    db.execute(
        "UPDATE state SET body=?1 WHERE id=1",
        [serde_json::to_string(s)?],
    )?;
    Ok(())
}
fn text<'a>(v: &'a Value, key: &str) -> Result<&'a str> {
    v[key]
        .as_str()
        .filter(|v| !v.is_empty())
        .ok_or_else(|| err("invalid_request", &format!("{key} is required")))
}
fn find<'a>(items: &'a [Value], id: &str) -> Result<&'a Value> {
    items
        .iter()
        .find(|v| v["id"] == id)
        .ok_or_else(|| err("not_found", "object does not exist"))
}
fn find_mut<'a>(items: &'a mut [Value], id: &str) -> Result<&'a mut Value> {
    items
        .iter_mut()
        .find(|v| v["id"] == id)
        .ok_or_else(|| err("not_found", "object does not exist"))
}
fn cas(v: &Value, revision: Option<u64>) -> Result<()> {
    if revision.is_none() || v["revision"].as_u64() != revision {
        Err(err("conflict", "expected_revision required and must match"))
    } else {
        Ok(())
    }
}
fn bump(v: &mut Value) {
    v["revision"] = json!(v["revision"].as_u64().unwrap_or(0) + 1);
}
fn validate_task_text(value: &Value) -> Result<()> {
    let title = text(value, "title")?;
    if title.len() > 1024
        || value["description"]
            .as_str()
            .is_none_or(|description| description.len() > 32768)
    {
        return Err(err(
            "invalid_request",
            "bounded title and description required",
        ));
    }
    for field in ["instructions", "acceptance_criteria"] {
        if let Some(items) = value.get(field) {
            let items = items.as_array().ok_or_else(|| {
                err(
                    "invalid_request",
                    "instruction and acceptance criteria arrays required",
                )
            })?;
            if items.len() > 64
                || items
                    .iter()
                    .any(|item| item.as_str().is_none_or(|text| text.len() > 4096))
            {
                return Err(err(
                    "invalid_request",
                    "instruction and criteria entries must be bounded strings",
                ));
            }
        }
    }
    Ok(())
}
fn lease<'a>(s: &'a Snapshot, id: &str, token: u64, now: i64) -> Result<&'a Value> {
    let a = find(&s.attempts, id)?;
    if a["status"] != "running"
        || a["fencing_token"].as_u64() != Some(token)
        || a["lease_expires_at"].as_i64().unwrap_or(0) <= now
    {
        return Err(err("conflict", "expired or fenced attempt"));
    }
    Ok(a)
}
fn refresh(s: &mut Snapshot, now: i64) {
    for worker in &mut s.workers {
        worker["status"] = json!(if s.attempts.iter().any(|a| a["worker_id"] == worker["id"]
            && (a["status"] == "running" || a["status"] == "outcome_unknown"))
        {
            "busy"
        } else {
            "idle"
        });
    }
    let done: HashSet<String> = s
        .tasks
        .iter()
        .filter(|v| v["status"] == "completed")
        .filter_map(|v| v["id"].as_str().map(String::from))
        .collect();
    let active: HashSet<String> = s
        .plans
        .iter()
        .filter(|v| v["status"] == "active")
        .filter_map(|v| v["id"].as_str().map(String::from))
        .collect();
    for t in &mut s.tasks {
        if t["status"] == "planned" || t["status"] == "ready" {
            let ready = active.contains(t["plan_id"].as_str().unwrap_or(""))
                && t["scheduled_at"].as_i64().unwrap_or(0) <= now
                && t["dependencies"]
                    .as_array()
                    .is_some_and(|a| a.iter().all(|d| done.contains(d.as_str().unwrap_or(""))));
            let next = if ready { "ready" } else { "planned" };
            if t["status"] != next {
                t["status"] = json!(next);
                bump(t);
            }
        }
    }
}
fn apply(s: &mut Snapshot, e: &CommandEnvelope, now: i64) -> Result<Value> {
    let c = &e.command;
    let kind = text(c, "type")?;
    match kind {
        "create_plan" => {
            let title = text(c, "title")?;
            let project = text(c, "project_id")?;
            let tasks = c["tasks"]
                .as_array()
                .ok_or_else(|| err("invalid_request", "tasks array required"))?;
            if tasks.is_empty() || tasks.len() > 256 {
                return Err(err("invalid_request", "plan requires 1..256 tasks"));
            }
            let mut ids = HashSet::new();
            for t in tasks {
                let id = text(t, "id")?;
                validate_task_text(t)?;
                text(t, "role")?;
                if !ids.insert(id) || s.tasks.iter().any(|v| v["id"] == id) {
                    return Err(err("conflict", "duplicate task id"));
                }
                if !t["write_scopes"].is_array() || !t["description"].is_string() {
                    return Err(err(
                        "invalid_request",
                        "description and write_scopes required",
                    ));
                }
                if t["write_scopes"].as_array().unwrap().iter().any(|scope| {
                    scope.as_str().is_none_or(|scope| {
                        scope.is_empty()
                            || scope.starts_with('/')
                            || scope.starts_with('\\')
                            || scope.contains(':')
                            || scope.split(['/', '\\']).any(|part| part == "..")
                    })
                }) {
                    return Err(err(
                        "invalid_request",
                        "write_scopes must be relative paths without parent traversal",
                    ));
                }
                if t.get("scheduled_at")
                    .is_some_and(|value| !value.is_null() && value.as_i64().is_none())
                {
                    return Err(err(
                        "invalid_request",
                        "scheduled_at must be UTC integer milliseconds",
                    ));
                }
            }
            for t in tasks {
                let id = text(t, "id")?;
                let deps = t["dependencies"]
                    .as_array()
                    .ok_or_else(|| err("invalid_request", "dependencies required"))?;
                for d in deps {
                    let d = d
                        .as_str()
                        .ok_or_else(|| err("invalid_request", "dependency must be string"))?;
                    if d == id || !ids.contains(d) {
                        return Err(err("invalid_request", "self or missing dependency"));
                    }
                }
            }
            let mut visited = HashSet::new();
            loop {
                let before = visited.len();
                for t in tasks {
                    if t["dependencies"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .all(|d| visited.contains(d.as_str().unwrap()))
                    {
                        visited.insert(t["id"].as_str().unwrap());
                    }
                }
                if visited.len() == tasks.len() {
                    break;
                }
                if before == visited.len() {
                    return Err(err("invalid_request", "dependency cycle"));
                }
            }
            let id = format!("plan-{}", s.sequence + 1);
            s.plans.push(json!({"id":id,"project_id":project,"title":title,"revision":1,"status":"draft","created_at":now}));
            for t in tasks {
                let mut t = t.clone();
                t["plan_id"] = json!(id);
                t["revision"] = json!(1);
                t["status"] = json!("planned");
                t["created_at"] = json!(now);
                for field in ["instructions", "acceptance_criteria"] {
                    if t.get(field).is_none() {
                        t[field] = json!([]);
                    }
                }
                s.tasks.push(t);
            }
            Ok(json!({"plan_id":id}))
        }
        "update_task" => {
            let allowed = [
                "type",
                "task_id",
                "title",
                "description",
                "instructions",
                "acceptance_criteria",
            ];
            if c.as_object()
                .is_none_or(|object| object.keys().any(|key| !allowed.contains(&key.as_str())))
            {
                return Err(err(
                    "invalid_request",
                    "update_task cannot alter task scope, role, dependencies or state",
                ));
            }
            validate_task_text(c)?;
            if !c["instructions"].is_array() || !c["acceptance_criteria"].is_array() {
                return Err(err(
                    "invalid_request",
                    "instructions and acceptance_criteria required",
                ));
            }
            let id = text(c, "task_id")?;
            let task = find(&s.tasks, id)?;
            cas(task, e.expected_revision)?;
            let plan = find(&s.plans, text(task, "plan_id")?)?;
            if !matches!(plan["status"].as_str(), Some("draft" | "paused"))
                || !matches!(
                    task["status"].as_str(),
                    Some("planned" | "ready" | "blocked" | "failed")
                )
                || s.attempts.iter().any(|attempt| {
                    attempt["task_id"] == id
                        && matches!(
                            attempt["status"].as_str(),
                            Some("running" | "outcome_unknown")
                        )
                })
            {
                return Err(err(
                    "conflict",
                    "pause the plan and wait for active or uncertain attempts before editing",
                ));
            }
            let task = find_mut(&mut s.tasks, id)?;
            for field in [
                "title",
                "description",
                "instructions",
                "acceptance_criteria",
            ] {
                task[field] = c[field].clone();
            }
            task["updated_at"] = json!(now);
            bump(task);
            Ok(json!({"task_id":id,"revision":task["revision"]}))
        }
        "start_plan" | "pause_plan" | "cancel_plan" => {
            let id = text(c, "plan_id")?;
            let p = find_mut(&mut s.plans, id)?;
            cas(p, e.expected_revision)?;
            if p["status"] == "cancelled" || p["status"] == "completed" {
                return Err(err("conflict", "terminal plan"));
            }
            p["status"] = json!(match kind {
                "start_plan" => "active",
                "pause_plan" => "paused",
                _ => "cancelled",
            });
            bump(p);
            if kind == "cancel_plan" {
                let ids: Vec<String> = s
                    .tasks
                    .iter()
                    .filter(|t| t["plan_id"] == id && t["status"] != "completed")
                    .map(|t| t["id"].as_str().unwrap().to_owned())
                    .collect();
                for id in ids {
                    cancel(s, &id, now)?;
                }
            }
            Ok(json!({}))
        }
        "cancel_task" | "retry_task" => {
            let id = text(c, "task_id")?;
            let t = find(&s.tasks, id)?;
            cas(t, e.expected_revision)?;
            if kind == "cancel_task" {
                cancel(s, id, now)?;
            } else {
                if t["status"] != "failed" {
                    return Err(err("conflict", "only known failed tasks can retry"));
                }
                if s.attempts.iter().filter(|a| a["task_id"] == id).count() >= 2 {
                    return Err(err("conflict", "maximum two attempts"));
                }
                let t = find_mut(&mut s.tasks, id)?;
                t["status"] = json!("planned");
                bump(t);
            }
            Ok(json!({}))
        }
        "register_worker" => Err(err(
            "forbidden",
            "worker registration requires trusted administration",
        )),
        "claim_task" => {
            refresh(s, now);
            let id = text(c, "task_id")?;
            let wid = text(c, "worker_id")?;
            let t = find(&s.tasks, id)?;
            cas(t, e.expected_revision)?;
            if t["status"] != "ready" {
                return Err(err("conflict", "task not ready"));
            }
            let w = find(&s.workers, wid)?;
            if !w["capabilities"].as_array().unwrap().contains(&t["role"]) {
                return Err(err("conflict", "worker lacks task role"));
            }
            let model = w["model"].clone();
            let service_id = text(w, "service_id")?;
            let service = find(&s.model_services, service_id)?;
            let capacity = service["capacity"]
                .as_u64()
                .ok_or_else(|| err("internal", "invalid service capacity"))?;
            let running: Vec<_> = s
                .attempts
                .iter()
                .filter(|a| a["status"] == "running" || a["status"] == "outcome_unknown")
                .collect();
            if running.len() >= 2
                || running.iter().any(|a| a["worker_id"] == wid)
                || running
                    .iter()
                    .filter(|a| a["service_id"] == service_id || a.get("service_id").is_none())
                    .count() as u64
                    >= capacity
            {
                return Err(err("conflict", "worker/service/global capacity occupied"));
            }
            if s.attempts.iter().filter(|a| a["task_id"] == id).count() >= 2 {
                return Err(err("conflict", "maximum two attempts"));
            }
            let aid = format!("attempt-{}", s.sequence + 1);
            let token = s.sequence + 1;
            let expires = now + 30000;
            s.attempts.push(json!({"id":aid,"task_id":id,"worker_id":wid,"service_id":service_id,"model":model,"role":t["role"],"status":"running","created_at":now,"fencing_token":token,"lease_expires_at":expires}));
            let t = find_mut(&mut s.tasks, id)?;
            t["status"] = json!("running");
            bump(t);
            Ok(json!({"attempt_id":aid,"fencing_token":token,"lease_expires_at":expires}))
        }
        "heartbeat" | "finish_attempt" => {
            let aid = text(c, "attempt_id")?;
            let token = c["fencing_token"]
                .as_u64()
                .ok_or_else(|| err("invalid_request", "fencing token required"))?;
            let a = lease(s, aid, token, now)?.clone();
            if kind == "heartbeat" {
                find_mut(&mut s.attempts, aid)?["lease_expires_at"] = json!(now + 30000);
                return Ok(json!({"lease_expires_at":now+30000}));
            }
            let outcome = text(c, "outcome")?;
            if s.tool_executions.iter().any(|tool| {
                tool["attempt_id"] == aid
                    && (tool["status"] == "running" || tool["status"] == "outcome_unknown")
            }) {
                return Err(err(
                    "conflict",
                    "tool execution must be stopped and reconciled before finishing attempt",
                ));
            }
            if outcome != "succeeded" && outcome != "failed" {
                return Err(err("invalid_request", "invalid outcome"));
            }
            if outcome == "succeeded"
                && !s
                    .artifacts
                    .iter()
                    .any(|v| v["attempt_id"] == aid && v["validated"] == true)
            {
                return Err(err("conflict", "trusted validated evidence required"));
            }
            let a_mut = find_mut(&mut s.attempts, aid)?;
            a_mut["status"] = json!(outcome);
            a_mut["finished_at"] = json!(now);
            let t = find_mut(&mut s.tasks, a["task_id"].as_str().unwrap())?;
            t["status"] = json!(if outcome == "succeeded" {
                "completed"
            } else {
                "failed"
            });
            bump(t);
            Ok(json!({}))
        }
        "request_approval" => {
            let aid = text(c, "attempt_id")?;
            let token = c["fencing_token"]
                .as_u64()
                .ok_or_else(|| err("invalid_request", "fencing token required"))?;
            let a = lease(s, aid, token, now)?.clone();
            let kind = text(c, "kind")?;
            if kind == "cloud" {
                return Err(err("forbidden", "cloud dispatch disabled"));
            }
            let description = text(c, "description")?;
            let id = format!("approval-{}", s.sequence + 1);
            s.approvals.push(json!({"id":id,"task_id":a["task_id"],"attempt_id":aid,"kind":kind,"description":description,"status":"pending","revision":1,"expires_at":now+60000}));
            Ok(json!({"approval_id":id}))
        }
        "resolve_approval" => {
            let id = text(c, "approval_id")?;
            let approval = find_mut(&mut s.approvals, id)?;
            cas(approval, e.expected_revision)?;
            if approval["status"] != "pending"
                || approval["expires_at"].as_i64().unwrap_or(0) <= now
            {
                return Err(err("conflict", "approval expired or resolved"));
            }
            let decision = text(c, "decision")?;
            if decision != "allow" && decision != "deny" {
                return Err(err("invalid_request", "invalid decision"));
            }
            approval["status"] = json!(if decision == "allow" {
                "allowed"
            } else {
                "denied"
            });
            bump(approval);
            Ok(json!({}))
        }
        _ => Err(err("invalid_request", "unsupported command")),
    }
}
fn cancel(s: &mut Snapshot, id: &str, now: i64) -> Result<()> {
    let t = find_mut(&mut s.tasks, id)?;
    if t["status"] == "completed" {
        return Err(err("conflict", "completed task cannot cancel"));
    }
    t["status"] = json!("cancelled");
    bump(t);
    for a in &mut s.attempts {
        if a["task_id"] == id && a["status"] == "running" {
            a["status"] = json!("outcome_unknown");
            a["finished_at"] = json!(now);
        }
    }
    Ok(())
}
