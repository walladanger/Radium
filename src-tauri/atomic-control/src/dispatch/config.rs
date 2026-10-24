use super::{Assignment, DispatchExecutor};
use crate::{
    err,
    execution::{
        sandbox_arguments, SandboxExecutor, SandboxLimits, SandboxRequest, WorktreeManager,
    },
    worker::{LocalModelBinding, TrustedRunRequest, WorkerCoordinator},
    Result, Store,
};
use async_trait::async_trait;
use serde::Deserialize;
use std::{
    collections::HashSet,
    path::{Component, Path, PathBuf},
    sync::Arc,
};
use tokio_util::sync::CancellationToken;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
/// Operator-owned provisioning, loaded once before the daemon serves requests.
/// Keep this outside repositories and sandbox mounts; it grants execution authority.
pub struct DispatchConfig {
    pub podman: PathBuf,
    pub git: PathBuf,
    pub workspace_root: PathBuf,
    pub data_root: PathBuf,
    pub image: String,
    pub workers: Vec<WorkerConfig>,
    pub projects: Vec<ProjectConfig>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
/// One prestarted direct local endpoint and its private key file.
/// Each configured service admits one generation; ports and identities must be distinct.
pub struct WorkerConfig {
    pub id: String,
    pub service_id: String,
    pub model_id: String,
    pub port: u16,
    pub key_file: PathBuf,
    pub context_window: usize,
    pub roles: Vec<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
/// Trusted repository, immutable base, allowed workers/scopes and independent checks.
/// An empty scope list permits read-only tasks only. Checks never come from task text.
pub struct ProjectConfig {
    pub id: String,
    pub repository: PathBuf,
    pub base_commit: String,
    pub workers: Vec<String>,
    pub write_scopes: Vec<String>,
    pub checks: Vec<Vec<String>>,
}

/// Provisioned adapter for the existing isolated worker coordinator.
pub struct LocalDispatch {
    coordinator: WorkerCoordinator,
    workers: Vec<(WorkerConfig, LocalModelBinding)>,
    projects: Vec<ProjectConfig>,
}

fn scope(value: &str) -> bool {
    // The execution boundary uses a trailing slash to create a new directory.
    let value = value.strip_suffix('/').unwrap_or(value);
    !value.is_empty()
        && !value.contains('\\')
        && !Path::new(value).is_absolute()
        && Path::new(value)
            .components()
            .all(|c| matches!(c, Component::Normal(p) if p != ".git"))
        && !value
            .split('/')
            .any(|p| p.is_empty() || p == "." || p == "..")
}

impl DispatchConfig {
    /// Load a bounded operator-owned JSON file. Reject malformed/unknown fields
    /// and group/other-writable files without echoing potentially sensitive input.
    pub fn load(path: &Path) -> Result<Self> {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let metadata = std::fs::symlink_metadata(path).map_err(|_| {
                err(
                    "invalid_request",
                    "trusted dispatch configuration unavailable",
                )
            })?;
            if !metadata.is_file() || metadata.permissions().mode() & 0o022 != 0 {
                return Err(err(
                    "invalid_request",
                    "dispatch configuration must not be writable by other users",
                ));
            }
        }
        let bytes = std::fs::read(path).map_err(|_| {
            err(
                "invalid_request",
                "cannot read trusted dispatch configuration",
            )
        })?;
        if bytes.len() > 262144 {
            return Err(err("invalid_request", "dispatch configuration too large"));
        }
        serde_json::from_slice(&bytes)
            .map_err(|_| err("invalid_request", "invalid dispatch configuration"))
    }

    /// Validate Linux sandbox provisioning and register immutable service/worker
    /// identities. Creates data/workspace directories, reads private model keys,
    /// and fails closed on missing prerequisites or conflicting registrations.
    pub async fn provision(self, store: Store) -> Result<Arc<LocalDispatch>> {
        if !cfg!(target_os = "linux") {
            return Err(err("sandbox_unavailable", "dispatch requires WSL Linux"));
        }
        let mut ids = HashSet::new();
        let mut ports = HashSet::new();
        let mut services = HashSet::new();
        if self.workers.is_empty() || self.projects.is_empty() {
            return Err(err(
                "invalid_request",
                "workers and trusted projects required",
            ));
        }
        let mut workers = Vec::new();
        for worker in self.workers {
            if worker.id.is_empty()
                || !worker.key_file.is_absolute()
                || !ids.insert(worker.id.clone())
                || !ports.insert(worker.port)
                || !services.insert(worker.service_id.clone())
            {
                return Err(err(
                    "invalid_request",
                    "distinct worker, service and endpoint identities required",
                ));
            }
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let metadata = tokio::fs::symlink_metadata(&worker.key_file)
                    .await
                    .map_err(|_| err("invalid_request", "private model key unavailable"))?;
                if !metadata.is_file() || metadata.permissions().mode() & 0o077 != 0 {
                    return Err(err(
                        "invalid_request",
                        "model key must be a private regular file",
                    ));
                }
            }
            let binding = LocalModelBinding {
                service_id: worker.service_id.clone(),
                model_id: worker.model_id.clone(),
                port: worker.port,
                api_key: tokio::fs::read_to_string(&worker.key_file)
                    .await
                    .map_err(|_| err("invalid_request", "model key unavailable"))?
                    .trim()
                    .into(),
                context_window: worker.context_window,
            };
            binding.client()?;
            if binding.api_key.is_empty()
                || worker.roles.is_empty()
                || worker.roles.iter().any(String::is_empty)
            {
                return Err(err(
                    "invalid_request",
                    "model key and worker roles required",
                ));
            }
            workers.push((worker, binding));
        }
        ids.clear();
        for project in &self.projects {
            if project.id.is_empty()
                || !ids.insert(project.id.clone())
                || project.base_commit.len() != 40
                || !project.base_commit.bytes().all(|b| b.is_ascii_hexdigit())
                || project.workers.is_empty()
                || project
                    .workers
                    .iter()
                    .any(|id| !workers.iter().any(|(w, _)| w.id == *id))
                || project.write_scopes.iter().any(|s| !scope(s))
                || project.checks.is_empty()
                || project
                    .checks
                    .iter()
                    .any(|c| c.is_empty() || c.iter().any(|a| a.contains('\0')))
            {
                return Err(err("invalid_request", "invalid trusted project profile"));
            }
            let repository = tokio::fs::canonicalize(&project.repository)
                .await
                .map_err(|_| err("invalid_request", "project repository unavailable"))?;
            if !project.repository.is_absolute()
                || !repository.is_dir()
                || repository.starts_with("/mnt")
            {
                return Err(err(
                    "invalid_request",
                    "project repository must use the Linux filesystem",
                ));
            }
        }
        tokio::fs::create_dir_all(&self.workspace_root)
            .await
            .map_err(|_| err("execution_error", "cannot create workspace root"))?;
        tokio::fs::create_dir_all(&self.data_root)
            .await
            .map_err(|_| err("execution_error", "cannot create worker data root"))?;
        let workspace_root = tokio::fs::canonicalize(&self.workspace_root)
            .await
            .map_err(|_| err("invalid_request", "workspace root unavailable"))?;
        if workspace_root.starts_with("/mnt") {
            return Err(err(
                "invalid_request",
                "workspaces must use the Linux filesystem",
            ));
        }
        // Reject an unpinned image or malformed mount path before accepting work.
        sandbox_arguments(&SandboxRequest {
            attempt_id: "provision".into(),
            fencing_token: 0,
            tool_id: "probe".into(),
            workspace: workspace_root,
            image: self.image.clone(),
            argv: vec!["/bin/true".into()],
            limits: SandboxLimits::default(),
        })?;
        let sandbox = Arc::new(SandboxExecutor::new(
            store.clone(),
            self.podman,
            &self.workspace_root,
        )?);
        sandbox.preflight().await?;
        let coordinator = WorkerCoordinator {
            store: store.clone(),
            sandbox,
            worktrees: WorktreeManager::new(&self.workspace_root, self.git)?,
            data_root: self.data_root,
            image: self.image,
            limits: SandboxLimits::default(),
        };
        // Restart reuses only an identical trusted registration, never overwrites it.
        for (worker, _) in &workers {
            let snapshot = store.snapshot()?;
            if let Some(service) = snapshot
                .model_services
                .iter()
                .find(|s| s["id"] == worker.service_id)
            {
                if service["capacity"] != 1
                    || service
                        .get("local_port")
                        .is_some_and(|port| port.as_u64() != Some(worker.port as u64))
                    || service
                        .get("model_id")
                        .is_some_and(|model| model != &worker.model_id)
                {
                    return Err(err("conflict", "configured service capacity changed"));
                }
            } else {
                store.register_model_service(&worker.service_id, 1)?;
            }
            if let Some(old) = snapshot.workers.iter().find(|w| w["id"] == worker.id) {
                if old["service_id"] != worker.service_id
                    || old["model"] != worker.model_id
                    || old["capabilities"] != serde_json::json!(worker.roles)
                {
                    return Err(err("conflict", "configured worker identity changed"));
                }
            } else {
                store.register_worker(
                    &worker.id,
                    "local",
                    &worker.service_id,
                    &worker.model_id,
                    &worker.roles,
                )?;
            }
        }
        Ok(Arc::new(LocalDispatch {
            coordinator,
            workers,
            projects: self.projects,
        }))
    }
}

#[async_trait]
impl DispatchExecutor for LocalDispatch {
    fn permits(&self, project: &str, worker: &str, scopes: &[serde_json::Value]) -> bool {
        self.projects.iter().any(|p| {
            p.id == project
                && p.workers.iter().any(|w| w == worker)
                && scopes.iter().all(|s| {
                    s.as_str().is_some_and(|s| {
                        scope(s)
                            && p.write_scopes.iter().any(|allowed| {
                                let s = s.strip_suffix('/').unwrap_or(s);
                                let allowed = allowed.strip_suffix('/').unwrap_or(allowed);
                                s == allowed || s.starts_with(&format!("{allowed}/"))
                            })
                    })
                })
        })
    }
    async fn execute(&self, assignment: Assignment, cancellation: CancellationToken) -> Result<()> {
        if cancellation.is_cancelled() {
            return Err(err("cancelled", "dispatch stopped"));
        }
        let snapshot = self.coordinator.store.snapshot()?;
        let task = snapshot
            .tasks
            .iter()
            .find(|t| t["id"] == assignment.task_id)
            .ok_or_else(|| err("not_found", "task unavailable"))?;
        let project_matches = snapshot
            .plans
            .iter()
            .any(|p| p["id"] == task["plan_id"] && p["project_id"] == assignment.project_id);
        if !project_matches
            || !task["write_scopes"].as_array().is_some_and(|scopes| {
                self.permits(&assignment.project_id, &assignment.worker_id, scopes)
            })
        {
            return Err(err("forbidden", "task outside trusted project profile"));
        }
        let project = self
            .projects
            .iter()
            .find(|p| p.id == assignment.project_id)
            .ok_or_else(|| err("forbidden", "project not provisioned"))?;
        let (_, binding) = self
            .workers
            .iter()
            .find(|(w, _)| w.id == assignment.worker_id)
            .ok_or_else(|| err("forbidden", "worker not provisioned"))?;
        self.coordinator
            .run(TrustedRunRequest {
                task_id: &assignment.task_id,
                revision: assignment.revision,
                worker_id: &assignment.worker_id,
                repository: &project.repository,
                base_commit: &project.base_commit,
                binding,
                checks: &project.checks,
                cancellation,
            })
            .await
            .map(|_| ())
    }
    async fn reconcile(&self, attempt: &str) -> Result<()> {
        self.coordinator.sandbox.reconcile(attempt).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn project_policy_requires_registered_identity_and_contained_scopes() {
        let root = std::env::temp_dir();
        let store = Store::open(":memory:").unwrap();
        let runtime = LocalDispatch {
            coordinator: WorkerCoordinator {
                store: store.clone(),
                sandbox: Arc::new(SandboxExecutor::new(store, root.join("podman"), &root).unwrap()),
                worktrees: WorktreeManager::new(&root, root.join("git")).unwrap(),
                data_root: root,
                image: String::new(),
                limits: SandboxLimits::default(),
            },
            workers: vec![],
            projects: vec![ProjectConfig {
                id: "trusted".into(),
                repository: PathBuf::new(),
                base_commit: String::new(),
                workers: vec!["worker".into()],
                write_scopes: vec!["src".into()],
                checks: vec![],
            }],
        };
        assert!(runtime.permits("trusted", "worker", &[json!("src/answer.txt")]));
        assert!(runtime.permits("trusted", "worker", &[json!("src/new-directory/")]));
        assert!(runtime.permits("trusted", "worker", &[]));
        assert!(!runtime.permits("other", "worker", &[]));
        assert!(!runtime.permits("other", "worker", &[json!("src/answer.txt")]));
        assert!(!runtime.permits("trusted", "other", &[json!("src/answer.txt")]));
        for scopes in [
            json!(["src-other"]),
            json!(["src/../checks"]),
            json!(["src/.git/config"]),
            json!(["/src"]),
            json!(["src\\answer"]),
            json!(["src", "checks"]),
        ] {
            assert!(
                !runtime.permits("trusted", "worker", scopes.as_array().unwrap()),
                "{scopes}"
            );
        }
    }

    #[test]
    fn configuration_rejects_unknown_fields_without_echoing_input() {
        let path = std::env::temp_dir().join(format!(
            "atomic-dispatch-config-{}.json",
            std::process::id()
        ));
        std::fs::write(&path, br#"{"api_key":"must-not-appear"}"#).unwrap();
        let error = DispatchConfig::load(&path).err().expect("invalid config");
        assert_eq!(error.code, "invalid_request");
        assert!(!error.message.contains("must-not-appear"));
    }
}
