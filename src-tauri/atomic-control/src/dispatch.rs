//! Daemon scheduling. Execution authority comes from local provisioning, never task text.
use crate::{err, Result, Store};
use async_trait::async_trait;
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;

pub mod config;

#[derive(Clone)]
/// A revision-pinned task selected from a plan and its registered worker.
/// Executors must claim through Store; this is not an HTTP execution command.
pub struct Assignment {
    pub task_id: String,
    pub revision: u64,
    pub worker_id: String,
    pub project_id: String,
}

/// Trusted adapters claim through Store and retain its admission and fencing checks.
#[async_trait]
pub trait DispatchExecutor: Send + Sync + 'static {
    fn permits(&self, project: &str, worker: &str, scopes: &[serde_json::Value]) -> bool;
    async fn execute(&self, assignment: Assignment, stop: CancellationToken) -> Result<()>;
    async fn reconcile(&self, attempt: &str) -> Result<()>;
}

/// Polling also promotes scheduled tasks when no browser or command is active.
/// Shutdown drains execution futures so sandbox cleanup outlives cancellation.
pub async fn run(
    store: Store,
    executor: Arc<dyn DispatchExecutor>,
    stop: CancellationToken,
) -> Result<()> {
    let mut jobs: Jobs = JoinSet::new();
    let mut active: HashMap<String, (String, CancellationToken)> = HashMap::new();
    let mut interval = tokio::time::interval(Duration::from_secs(1));
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let result = loop {
        tokio::select! {
            _ = stop.cancelled() => break Ok(()),
            completed = jobs.join_next(), if !jobs.is_empty() => {
                match completed {
                    Some(Ok((worker, result))) => {
                        active.remove(&worker);
                        if let Err(error) = result {
                            // No task/model content or credentials enter daemon logs.
                            eprintln!("[atomic-dispatch] worker {worker}: {}", error.code);
                        }
                    }
                    _ => break Err(err("execution_error", "dispatch supervisor stopped")),
                }
            }
            _ = interval.tick() => {
                if let Err(error) = schedule(&store, &executor, &mut jobs, &mut active).await {
                    break Err(error);
                }
            }
        }
    };
    for (_, token) in active.values() {
        token.cancel();
    }
    while jobs.join_next().await.is_some() {}
    // Running futures are now stopped; only the sandbox may release uncertain capacity.
    reconcile(&store, &executor, &HashMap::new()).await?;
    result
}

type Active = HashMap<String, (String, CancellationToken)>;
type Jobs = JoinSet<(String, Result<()>)>;

async fn reconcile(
    store: &Store,
    executor: &Arc<dyn DispatchExecutor>,
    active: &Active,
) -> Result<()> {
    for attempt in store.snapshot()?.attempts {
        if attempt["status"] == "outcome_unknown"
            && !active.contains_key(attempt["worker_id"].as_str().unwrap_or(""))
        {
            // Failed termination preserves the durable reservation and stops dispatch.
            executor
                .reconcile(attempt["id"].as_str().unwrap_or(""))
                .await?;
        }
    }
    Ok(())
}

async fn schedule(
    store: &Store,
    executor: &Arc<dyn DispatchExecutor>,
    jobs: &mut Jobs,
    active: &mut Active,
) -> Result<()> {
    store.recover_expired()?;
    let snapshot = store.snapshot()?;
    for (worker, (task, token)) in active.iter() {
        if snapshot
            .tasks
            .iter()
            .any(|t| t["id"] == *task && t["status"] == "cancelled")
            || snapshot.attempts.iter().any(|a| {
                a["worker_id"] == *worker
                    && a["task_id"] == *task
                    && a["status"] == "outcome_unknown"
            })
        {
            token.cancel();
        }
    }
    reconcile(store, executor, active).await?;
    let snapshot = store.snapshot()?;
    let reserved: Vec<_> = snapshot
        .attempts
        .iter()
        .filter(|a| a["status"] == "running" || a["status"] == "outcome_unknown")
        .collect();
    for task in snapshot.tasks.iter().filter(|t| t["status"] == "ready") {
        // Bound supervisors too, including futures which have not claimed yet.
        let occupied: std::collections::HashSet<_> = reserved
            .iter()
            .filter_map(|a| a["worker_id"].as_str())
            .chain(active.keys().map(String::as_str))
            .collect();
        if occupied.len() >= 2 {
            break;
        }
        let task_id = task["id"].as_str().unwrap_or("");
        if active.values().any(|(id, _)| id == task_id) {
            continue;
        }
        let Some(plan) = snapshot
            .plans
            .iter()
            .find(|p| p["id"] == task["plan_id"] && p["status"] == "active")
        else {
            continue;
        };
        let project = plan["project_id"].as_str().unwrap_or("");
        let Some(scopes) = task["write_scopes"].as_array() else {
            continue;
        };
        for worker in &snapshot.workers {
            let id = worker["id"].as_str().unwrap_or("");
            let service = &worker["service_id"];
            let capacity = snapshot
                .model_services
                .iter()
                .find(|s| s["id"] == *service)
                .and_then(|s| s["capacity"].as_u64())
                .unwrap_or(0);
            let occupied_service: std::collections::HashSet<_> = reserved
                .iter()
                .filter(|a| a.get("service_id").is_none() || a["service_id"] == *service)
                .filter_map(|a| a["worker_id"].as_str())
                .chain(
                    active
                        .keys()
                        .filter(|id| {
                            snapshot
                                .workers
                                .iter()
                                .any(|w| w["id"] == **id && w["service_id"] == *service)
                        })
                        .map(String::as_str),
                )
                .collect();
            if active.contains_key(id)
                || occupied_service.len() as u64 >= capacity
                || reserved.iter().any(|a| a["worker_id"] == id)
                || !worker["capabilities"]
                    .as_array()
                    .is_some_and(|roles| roles.contains(&task["role"]))
                || !executor.permits(project, id, scopes)
            {
                continue;
            }
            let assignment = Assignment {
                task_id: task_id.into(),
                revision: task["revision"].as_u64().unwrap_or(0),
                worker_id: id.into(),
                project_id: project.into(),
            };
            let token = CancellationToken::new();
            active.insert(id.into(), (task_id.into(), token.clone()));
            let executor = executor.clone();
            let worker_id = id.to_owned();
            jobs.spawn(async move { (worker_id, executor.execute(assignment, token).await) });
            break;
        }
    }
    Ok(())
}
