//! Trusted local execution boundary. Model workers never receive the host engine.
use crate::{err, find_mut, lease, Result, Store};
use serde_json::{json, Value};
use std::{
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::{
    io::{AsyncRead, AsyncReadExt},
    process::Command,
    sync::watch,
};

#[derive(Clone, Debug)]
pub struct SandboxLimits {
    pub memory_mib: u32,
    pub cpus: u16,
    pub pids: u16,
    pub timeout_secs: u32,
    pub output_bytes: usize,
}
impl Default for SandboxLimits {
    fn default() -> Self {
        Self {
            memory_mib: 2048,
            cpus: 2,
            pids: 128,
            timeout_secs: 300,
            output_bytes: 65536,
        }
    }
}
#[derive(Clone, Debug)]
pub struct SandboxRequest {
    pub attempt_id: String,
    pub fencing_token: u64,
    pub tool_id: String,
    pub workspace: PathBuf,
    pub image: String,
    pub argv: Vec<String>,
    pub limits: SandboxLimits,
}
#[derive(Debug)]
pub struct ToolOutcome {
    pub status: String,
    pub exit_code: Option<i32>,
    pub stdout: String,
    pub stderr: String,
    pub output_truncated: bool,
}

fn identifier(value: &str) -> Result<()> {
    if value.is_empty()
        || value.len() > 80
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err(err(
            "invalid_request",
            "execution identifier must be bounded ASCII",
        ));
    }
    Ok(())
}
fn io_error(error: std::io::Error) -> crate::Error {
    err("execution_error", &error.to_string())
}
fn engine_command(engine: &Path) -> Command {
    let mut command = Command::new(engine);
    command.arg("--remote=false").env_clear();
    // Rootless Podman needs its user storage/runtime directory. Payload processes
    // receive only explicit --env entries and never these engine environment values.
    for key in [
        "HOME",
        "PATH",
        "XDG_RUNTIME_DIR",
        "DBUS_SESSION_BUS_ADDRESS",
    ] {
        if let Some(value) = std::env::var_os(key) {
            command.env(key, value);
        }
    }
    command.stdin(Stdio::null());
    command
}

/// Validate Podman's actual host report rather than assuming Docker is rootless.
pub fn validate_engine_info(info: &Value) -> Result<()> {
    if info
        .pointer("/host/security/rootless")
        .and_then(Value::as_bool)
        != Some(true)
        || info.pointer("/host/cgroupVersion").and_then(Value::as_str) != Some("v2")
        || info
            .pointer("/host/security/seccompEnabled")
            .and_then(Value::as_bool)
            != Some(true)
    {
        return Err(err(
            "sandbox_unavailable",
            "rootless Podman with cgroups v2 is required",
        ));
    }
    Ok(())
}

/// Build restrictive engine arguments from a trusted, bounded request.
pub fn sandbox_arguments(request: &SandboxRequest) -> Result<Vec<String>> {
    identifier(&request.attempt_id)?;
    identifier(&request.tool_id)?;
    if request.argv.is_empty()
        || request.argv[0].starts_with('-')
        || request.argv.iter().any(|a| a.contains('\0'))
    {
        return Err(err("invalid_request", "explicit command argv required"));
    }
    let digest = request
        .image
        .rsplit_once("@sha256:")
        .map(|(_, digest)| digest);
    if digest
        .is_none_or(|digest| digest.len() != 64 || !digest.bytes().all(|b| b.is_ascii_hexdigit()))
        || request.image.starts_with('-')
    {
        return Err(err(
            "invalid_request",
            "sandbox image must be pinned by sha256 digest",
        ));
    }
    let limits = &request.limits;
    if !(64..=16384).contains(&limits.memory_mib)
        || !(1..=8).contains(&limits.cpus)
        || !(16..=512).contains(&limits.pids)
        || !(1..=3600).contains(&limits.timeout_secs)
        || !(1024..=1048576).contains(&limits.output_bytes)
    {
        return Err(err(
            "invalid_request",
            "sandbox limits outside approved bounds",
        ));
    }
    let workspace = request
        .workspace
        .to_str()
        .ok_or_else(|| err("invalid_request", "workspace must be UTF-8"))?;
    if !request.workspace.is_absolute() || workspace.contains([',', '\n', '\r']) {
        return Err(err(
            "invalid_request",
            "workspace path cannot be represented safely as a mount",
        ));
    }
    let mut args = vec![
        "run".into(),
        "--pull=never".into(),
        "--rm".into(),
        "--name".into(),
        format!("atomic-{}-{}", request.attempt_id, request.tool_id),
        "--network=none".into(),
        "--read-only".into(),
        "--cap-drop=all".into(),
        "--security-opt=no-new-privileges".into(),
        "--userns=keep-id".into(),
        "--cgroupns=private".into(),
        "--ipc=private".into(),
        "--pid=private".into(),
        "--pids-limit".into(),
        limits.pids.to_string(),
        "--memory".into(),
        format!("{}m", limits.memory_mib),
        "--memory-swap".into(),
        format!("{}m", limits.memory_mib),
        "--cpus".into(),
        limits.cpus.to_string(),
        "--tmpfs".into(),
        "/tmp:rw,nosuid,nodev,size=64m".into(),
        "--env".into(),
        "HOME=/tmp/atomic-home".into(),
        "--mount".into(),
        format!("type=bind,src={workspace},dst=/workspace,ro"),
        "--workdir=/workspace".into(),
        "--entrypoint".into(),
        request.argv[0].clone(),
        request.image.clone(),
    ];
    args.extend(request.argv.iter().skip(1).cloned());
    Ok(args)
}

#[derive(Clone, Debug)]
struct WriteMount {
    relative: String,
    source: PathBuf,
    directory: bool,
}
fn write_mounts(workspace: &Path, scopes: &[String]) -> Result<Vec<WriteMount>> {
    if scopes.len() > 128 {
        return Err(err("forbidden", "too many write scopes"));
    }
    let mut mounts = Vec::new();
    for scope in scopes {
        let directory = scope.ends_with('/');
        let relative = scope.trim_end_matches('/');
        if relative.is_empty()
            || relative.contains(['\\', ',', '\n', '\r', '\0', ':'])
            || relative.split('/').any(|part| {
                part.is_empty() || part == "." || part == ".." || part.eq_ignore_ascii_case(".git")
            })
        {
            return Err(err(
                "forbidden",
                "write scope must be an explicit relative file or directory without Git metadata",
            ));
        }
        let path = Path::new(relative);
        if path.is_absolute() {
            return Err(err("forbidden", "absolute write scope denied"));
        }
        let mut source = workspace.to_path_buf();
        for component in path.components() {
            source.push(component);
            match std::fs::symlink_metadata(&source) {
                Ok(metadata) => {
                    if metadata.file_type().is_symlink() {
                        return Err(err("forbidden", "symlinks cannot grant write scope"));
                    }
                    if !metadata.is_file() && !metadata.is_dir() {
                        return Err(err(
                            "forbidden",
                            "write scope contains a special filesystem object",
                        ));
                    }
                    #[cfg(unix)]
                    if metadata.is_file() {
                        use std::os::unix::fs::MetadataExt;
                        if metadata.nlink() > 1 {
                            return Err(err(
                                "forbidden",
                                "hard-linked files cannot grant write scope",
                            ));
                        }
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(io_error(error)),
            }
        }
        let directory = if source.exists() {
            source.is_dir()
        } else {
            directory
        };
        if directory && source.exists() {
            reject_nested_git(&source)?;
        }
        if mounts
            .iter()
            .any(|mount: &WriteMount| mount.relative == relative)
        {
            return Err(err("forbidden", "duplicate write scope"));
        }
        mounts.push(WriteMount {
            relative: relative.into(),
            source,
            directory,
        });
    }
    // Reject redundant overlapping entries rather than changing the meaning of a file scope.
    for a in &mounts {
        for b in &mounts {
            if a.relative != b.relative && b.source.starts_with(&a.source) {
                return Err(err(
                    "forbidden",
                    "overlapping write scopes must be reduced explicitly",
                ));
            }
        }
    }
    Ok(mounts)
}
fn reject_nested_git(root: &Path) -> Result<()> {
    let mut directories = vec![root.to_path_buf()];
    let mut entries = 0usize;
    while let Some(directory) = directories.pop() {
        for entry in std::fs::read_dir(directory).map_err(io_error)? {
            let entry = entry.map_err(io_error)?;
            entries += 1;
            if entries > 100000 {
                return Err(err(
                    "forbidden",
                    "directory scope exceeds metadata inspection limit",
                ));
            }
            if entry
                .file_name()
                .to_str()
                .is_some_and(|name| name.eq_ignore_ascii_case(".git"))
            {
                return Err(err(
                    "forbidden",
                    "directory scope includes nested Git metadata",
                ));
            }
            let file_type = entry.file_type().map_err(io_error)?;
            #[cfg(unix)]
            if file_type.is_file() {
                use std::os::unix::fs::MetadataExt;
                if entry.metadata().map_err(io_error)?.nlink() > 1 {
                    return Err(err(
                        "forbidden",
                        "directory scope includes hard-linked files",
                    ));
                }
            }
            if !file_type.is_file() && !file_type.is_dir() && !file_type.is_symlink() {
                return Err(err(
                    "forbidden",
                    "directory scope includes special filesystem objects",
                ));
            }
            if file_type.is_dir() {
                directories.push(entry.path());
            }
        }
    }
    Ok(())
}
fn prepare_mounts(workspace: &Path, mounts: &[WriteMount]) -> Result<()> {
    for mount in mounts {
        // Revalidate after journaling, before any host-side preparation.
        write_mounts(
            workspace,
            std::slice::from_ref(&format!(
                "{}{}",
                mount.relative,
                if mount.directory { "/" } else { "" }
            )),
        )?;
        let parent = mount
            .source
            .parent()
            .ok_or_else(|| err("forbidden", "scope parent missing"))?;
        std::fs::create_dir_all(parent).map_err(io_error)?;
        if !mount.source.exists() {
            if mount.directory {
                std::fs::create_dir(&mount.source).map_err(io_error)?;
            } else {
                std::fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(&mount.source)
                    .map_err(io_error)?;
            }
        }
    }
    Ok(())
}
fn scoped_arguments(request: &SandboxRequest, mounts: &[WriteMount]) -> Result<Vec<String>> {
    let mut args = sandbox_arguments(request)?;
    let insertion = args
        .iter()
        .position(|arg| arg == "--workdir=/workspace")
        .unwrap();
    let mut scope_args = Vec::new();
    for mount in mounts {
        scope_args.push("--mount".into());
        scope_args.push(format!(
            "type=bind,src={},dst=/workspace/{},rw",
            mount
                .source
                .to_str()
                .ok_or_else(|| err("invalid_request", "non-UTF8 write scope"))?,
            mount.relative
        ));
    }
    args.splice(insertion..insertion, scope_args);
    Ok(args)
}

pub struct WorktreeManager {
    root: PathBuf,
    git: PathBuf,
}
impl WorktreeManager {
    pub fn new(root: impl AsRef<Path>, git: impl AsRef<Path>) -> Result<Self> {
        let root = std::fs::canonicalize(root).map_err(io_error)?;
        if !root.is_dir() || !git.as_ref().is_absolute() {
            return Err(err(
                "invalid_request",
                "existing workspace root and absolute Git executable required",
            ));
        }
        Ok(Self {
            root,
            git: git.as_ref().to_owned(),
        })
    }
    /// Create a detached attempt worktree at an exact verified commit.
    pub async fn create(
        &self,
        repository: &Path,
        attempt_id: &str,
        base_commit: &str,
    ) -> Result<PathBuf> {
        if !cfg!(target_os = "linux") {
            return Err(err(
                "sandbox_unavailable",
                "worktrees must be managed inside WSL Linux",
            ));
        }
        identifier(attempt_id)?;
        if base_commit.len() != 40 || !base_commit.bytes().all(|b| b.is_ascii_hexdigit()) {
            return Err(err("invalid_request", "exact Git commit SHA required"));
        }
        let repository = std::fs::canonicalize(repository).map_err(io_error)?;
        if repository.starts_with("/mnt") || self.root.starts_with("/mnt") {
            return Err(err(
                "invalid_request",
                "repositories and worktrees must use the Linux filesystem",
            ));
        }
        let destination = self.root.join(attempt_id);
        if destination.exists() {
            return Err(err("conflict", "attempt workspace already exists"));
        }
        let configured_filters = Command::new(&self.git)
            .args(["-C"])
            .arg(&repository)
            .args([
                "config",
                "--local",
                "--includes",
                "--get-regexp",
                "^filter\\..*\\.(smudge|process)$",
            ])
            .output()
            .await
            .map_err(io_error)?;
        if configured_filters.status.success() {
            return Err(err(
                "forbidden",
                "repository checkout filters require an explicitly reviewed adapter",
            ));
        }
        if configured_filters.status.code() != Some(1) {
            return Err(err(
                "execution_error",
                "cannot inspect repository filter configuration",
            ));
        }
        let output = Command::new(&self.git)
            .env_clear()
            .env("PATH", "/usr/bin:/bin")
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", "/dev/null")
            .env_remove("GIT_DIR")
            .env_remove("GIT_WORK_TREE")
            .args([
                "-c",
                "core.hooksPath=/dev/null",
                "-c",
                "core.fsmonitor=false",
                "-C",
            ])
            .arg(repository)
            .args(["worktree", "add", "--detach"])
            .arg(&destination)
            .arg(base_commit)
            .stdin(Stdio::null())
            .output()
            .await
            .map_err(io_error)?;
        if !output.status.success() {
            return Err(err(
                "execution_error",
                "Git refused isolated worktree creation",
            ));
        }
        Ok(destination)
    }
}

pub struct SandboxExecutor {
    store: Store,
    engine: PathBuf,
    workspace_root: PathBuf,
}
impl SandboxExecutor {
    pub fn new(
        store: Store,
        engine: impl AsRef<Path>,
        workspace_root: impl AsRef<Path>,
    ) -> Result<Self> {
        if !engine.as_ref().is_absolute() {
            return Err(err(
                "invalid_request",
                "absolute trusted Podman executable required",
            ));
        }
        Ok(Self {
            store,
            engine: engine.as_ref().to_owned(),
            workspace_root: std::fs::canonicalize(workspace_root).map_err(io_error)?,
        })
    }
    pub async fn preflight(&self) -> Result<()> {
        if !cfg!(target_os = "linux") {
            return Err(err(
                "sandbox_unavailable",
                "sandbox executor must run inside WSL Linux",
            ));
        }
        let output = tokio::time::timeout(
            Duration::from_secs(10),
            engine_command(&self.engine)
                .args(["info", "--format=json"])
                .output(),
        )
        .await
        .map_err(|_| err("sandbox_unavailable", "Podman probe timed out"))?
        .map_err(io_error)?;
        if !output.status.success() {
            return Err(err("sandbox_unavailable", "Podman info failed"));
        }
        validate_engine_info(&serde_json::from_slice::<Value>(&output.stdout)?)
    }
    /// Stop every journaled container before releasing an uncertain attempt.
    pub async fn reconcile(&self, attempt_id: &str) -> Result<()> {
        self.preflight().await?;
        identifier(attempt_id)?;
        let state = self.store.snapshot()?;
        for tool in state.tool_executions.iter().filter(|tool| {
            tool["attempt_id"] == attempt_id
                && (tool["status"] == "running" || tool["status"] == "outcome_unknown")
        }) {
            let name = tool["container"]
                .as_str()
                .ok_or_else(|| err("internal", "journal container missing"))?;
            let output = tokio::time::timeout(
                Duration::from_secs(10),
                engine_command(&self.engine)
                    .args(["rm", "--force", "--ignore", "--time=0", name])
                    .output(),
            )
            .await
            .map_err(|_| err("outcome_unknown", "container reconciliation timed out"))?
            .map_err(io_error)?;
            if !output.status.success() {
                return Err(err(
                    "outcome_unknown",
                    "container termination not confirmed",
                ));
            }
        }
        self.store.reconcile_stopped(attempt_id)
    }
    pub async fn execute(
        &self,
        mut request: SandboxRequest,
        mut cancel: watch::Receiver<bool>,
    ) -> Result<ToolOutcome> {
        self.preflight().await?;
        request.workspace = std::fs::canonicalize(&request.workspace).map_err(io_error)?;
        if !request.workspace.starts_with(&self.workspace_root)
            || request.workspace == self.workspace_root
            || self.workspace_root.starts_with("/mnt")
            || request.workspace.file_name().and_then(|name| name.to_str())
                != Some(request.attempt_id.as_str())
        {
            return Err(err(
                "forbidden",
                "workspace outside controller-owned Linux root",
            ));
        }
        sandbox_arguments(&request)?;
        let scopes = self.store.execution_write_scopes(&request)?;
        let mounts = write_mounts(&request.workspace, &scopes)?;
        let name = format!("atomic-{}-{}", request.attempt_id, request.tool_id);
        self.store.begin_tool(&request, &name)?;
        if let Err(error) = prepare_mounts(&request.workspace, &mounts) {
            self.store.finish_tool(&request.tool_id, "failed", None)?;
            return Err(error);
        }
        let args = scoped_arguments(&request, &mounts)?;
        let mut child = match engine_command(&self.engine)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(child) => child,
            Err(error) => {
                self.store.finish_tool(&request.tool_id, "failed", None)?;
                return Err(io_error(error));
            }
        };
        let stdout = tokio::spawn(capture(
            child.stdout.take().unwrap(),
            request.limits.output_bytes,
        ));
        let stderr = tokio::spawn(capture(
            child.stderr.take().unwrap(),
            request.limits.output_bytes,
        ));
        let deadline = tokio::time::sleep(Duration::from_secs(request.limits.timeout_secs as u64));
        tokio::pin!(deadline);
        let mut check = tokio::time::interval(Duration::from_millis(200));
        let (status, exit_code) = loop {
            tokio::select! {
                exit=child.wait()=>{match exit {Ok(exit)=>break (if exit.success(){"succeeded"}else{"failed"},exit.code()),Err(_)=>break ("outcome_unknown",None)}},
                _=&mut deadline=>{break (self.stop(&name,&mut child).await,None)},
                changed=cancel.changed()=>{if changed.is_err()||*cancel.borrow(){break (self.stop(&name,&mut child).await,None)}},
                _=check.tick()=>{let active=self.store.snapshot().is_ok_and(|state|lease(&state,&request.attempt_id,request.fencing_token,self.store.clock.now_ms()).is_ok());if !active||*cancel.borrow(){break (self.stop(&name,&mut child).await,None)}}
            }
        };
        let read_output = async {
            let out = stdout
                .await
                .map_err(|_| err("execution_error", "stdout reader failed"))??;
            let error = stderr
                .await
                .map_err(|_| err("execution_error", "stderr reader failed"))??;
            Ok::<_, crate::Error>((out, error))
        };
        let output = tokio::time::timeout(Duration::from_secs(5), read_output).await;
        self.store
            .finish_tool(&request.tool_id, status, exit_code)?;
        let ((out, out_truncated), (error, error_truncated)) =
            output.map_err(|_| err("execution_error", "output pipe did not close"))??;
        Ok(ToolOutcome {
            status: status.into(),
            exit_code,
            stdout: String::from_utf8_lossy(&out).into_owned(),
            stderr: String::from_utf8_lossy(&error).into_owned(),
            output_truncated: out_truncated || error_truncated,
        })
    }
    async fn stop(&self, name: &str, child: &mut tokio::process::Child) -> &'static str {
        let stopped = tokio::time::timeout(
            Duration::from_secs(10),
            engine_command(&self.engine)
                .args(["rm", "--force", "--time=0", name])
                .output(),
        )
        .await;
        let _ = child.kill().await;
        if matches!(stopped,Ok(Ok(output)) if output.status.success()) {
            "cancelled"
        } else {
            "outcome_unknown"
        }
    }
}
async fn capture(mut stream: impl AsyncRead + Unpin, limit: usize) -> Result<(Vec<u8>, bool)> {
    let mut output = Vec::new();
    let mut truncated = false;
    let mut buffer = [0u8; 4096];
    loop {
        let count = stream.read(&mut buffer).await.map_err(io_error)?;
        if count == 0 {
            break;
        }
        let remaining = limit.saturating_sub(output.len());
        output.extend_from_slice(&buffer[..count.min(remaining)]);
        truncated |= count > remaining;
    }
    Ok((output, truncated))
}

impl Store {
    fn execution_write_scopes(&self, request: &SandboxRequest) -> Result<Vec<String>> {
        let state = self.snapshot()?;
        let attempt = lease(
            &state,
            &request.attempt_id,
            request.fencing_token,
            self.clock.now_ms(),
        )?;
        let task = crate::find(
            &state.tasks,
            attempt["task_id"]
                .as_str()
                .ok_or_else(|| err("internal", "attempt task missing"))?,
        )?;
        task["write_scopes"]
            .as_array()
            .ok_or_else(|| err("internal", "task scopes missing"))?
            .iter()
            .map(|scope| {
                scope
                    .as_str()
                    .map(String::from)
                    .ok_or_else(|| err("forbidden", "invalid trusted task scope"))
            })
            .collect()
    }
    fn begin_tool(&self, request: &SandboxRequest, container: &str) -> Result<()> {
        self.mutate("tool_started",json!({"attempt_id":request.attempt_id,"tool_id":request.tool_id}),|state,now| {
            let attempt=lease(state,&request.attempt_id,request.fencing_token,now)?;
            let task=crate::find(&state.tasks,attempt["task_id"].as_str().unwrap())?;
            let scopes=task["write_scopes"].clone();
            if state.tool_executions.iter().any(|tool|tool["id"]==request.tool_id||tool["attempt_id"]==request.attempt_id&&(tool["status"]=="running"||tool["status"]=="outcome_unknown")) {return Err(err("conflict","tool id or attempt execution already active or uncertain"));}
            state.tool_executions.push(json!({"id":request.tool_id,"attempt_id":request.attempt_id,"fencing_token":request.fencing_token,"container":container,"workspace":request.workspace,"image":request.image,"argv":request.argv,"write_scopes":scopes,"status":"running","started_at":now}));Ok(())
        })
    }
    fn finish_tool(&self, id: &str, status: &str, exit_code: Option<i32>) -> Result<()> {
        self.mutate("tool_finished", json!({"tool_id":id}), |state, now| {
            let tool = find_mut(&mut state.tool_executions, id)?;
            tool["status"] = json!(status);
            tool["exit_code"] = json!(exit_code);
            tool["finished_at"] = json!(now);
            Ok(())
        })
    }
    /// Mark incomplete journal entries uncertain on controller startup; never retry them.
    pub fn recover_tools(&self) -> Result<()> {
        if !self
            .snapshot()?
            .tool_executions
            .iter()
            .any(|tool| tool["status"] == "running")
        {
            return Ok(());
        }
        self.mutate("tools_recovered", json!({}), |state, _| {
            let mut attempts = Vec::new();
            for tool in &mut state.tool_executions {
                if tool["status"] == "running" {
                    tool["status"] = json!("outcome_unknown");
                    attempts.push(tool["attempt_id"].as_str().unwrap().to_owned());
                }
            }
            for id in attempts {
                let attempt = find_mut(&mut state.attempts, &id)?;
                if attempt["status"] == "running" {
                    attempt["status"] = json!("outcome_unknown");
                    let task_id = attempt["task_id"].as_str().unwrap().to_owned();
                    let task = find_mut(&mut state.tasks, &task_id)?;
                    task["status"] = json!("blocked");
                    crate::bump(task);
                }
            }
            Ok(())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn engine_report_fails_closed_without_rootless_seccomp_and_cgroup_v2() {
        assert!(validate_engine_info(&json!({"host":{"security":{"rootless":true,"seccompEnabled":true},"cgroupVersion":"v2"}})).is_ok());
        for report in [
            json!({}),
            json!({"host":{"security":{"rootless":false,"seccompEnabled":true},"cgroupVersion":"v2"}}),
            json!({"host":{"security":{"rootless":true,"seccompEnabled":false},"cgroupVersion":"v2"}}),
        ] {
            assert!(validate_engine_info(&report).is_err());
        }
    }
    fn request() -> SandboxRequest {
        SandboxRequest {
            attempt_id: "attempt-1".into(),
            fencing_token: 1,
            tool_id: "tool-1".into(),
            workspace: std::env::current_dir().unwrap(),
            image: format!("docker.io/library/ubuntu@sha256:{}", "a".repeat(64)),
            argv: vec!["/bin/echo".into(), "$(touch /host/file); literal".into()],
            limits: SandboxLimits::default(),
        }
    }
    #[test]
    fn argv_preserves_literal_arguments_and_forces_confinement() {
        let request = request();
        let args = sandbox_arguments(&request).unwrap();
        assert_eq!(args.last().unwrap(), "$(touch /host/file); literal");
        for flag in [
            "--network=none",
            "--read-only",
            "--cap-drop=all",
            "--pull=never",
            "--security-opt=no-new-privileges",
        ] {
            assert!(args.iter().any(|a| a == flag));
        }
        assert_eq!(
            args.iter().filter(|a| a.starts_with("type=bind,")).count(),
            1
        );
        let mut malicious = request.clone();
        malicious.image = "latest".into();
        assert!(sandbox_arguments(&malicious).is_err());
        malicious = request;
        malicious.tool_id = "../other".into();
        assert!(sandbox_arguments(&malicious).is_err());
    }
    #[test]
    fn write_scopes_are_explicit_and_cannot_expand_or_target_git() {
        let workspace = std::env::current_dir().unwrap();
        for denied in [
            ".",
            "/",
            "../outside",
            ".git",
            ".git/config",
            "src/../secret",
            "src//other",
            "src\\other",
            "src,ro=false",
        ] {
            assert!(
                write_mounts(&workspace, &[denied.into()]).is_err(),
                "{denied}"
            );
        }
        assert!(write_mounts(&workspace, &["src".into(), "src/execution.rs".into()]).is_err());
        let mounts = write_mounts(&workspace, &["README.md".into()]).unwrap();
        let args = scoped_arguments(&request(), &mounts).unwrap();
        assert!(args.iter().any(|arg| arg.ends_with("dst=/workspace,ro")));
        assert!(args
            .iter()
            .any(|arg| arg.ends_with("dst=/workspace/README.md,rw")));
    }
    #[cfg(unix)]
    #[test]
    fn symlink_and_hardlink_write_grants_are_denied() {
        let root = std::env::temp_dir().join(format!("atomic-scope-links-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        let target = root.join("target");
        std::fs::write(&target, "source").unwrap();
        std::os::unix::fs::symlink(&target, root.join("symlink")).unwrap();
        std::fs::hard_link(&target, root.join("hardlink")).unwrap();
        assert!(write_mounts(&root, &["symlink".into()]).is_err());
        assert!(write_mounts(&root, &["hardlink".into()]).is_err());
    }
    #[tokio::test]
    async fn output_is_bounded_but_stream_is_fully_drained() {
        let (mut writer, reader) = tokio::io::duplex(64);
        let writer = tokio::spawn(async move {
            use tokio::io::AsyncWriteExt;
            writer.write_all(&[b'x'; 500]).await.unwrap();
        });
        let (bytes, truncated) = capture(reader, 50).await.unwrap();
        writer.await.unwrap();
        assert_eq!(bytes.len(), 50);
        assert!(truncated);
    }
    #[test]
    fn durable_started_journal_blocks_replay_and_recovers_as_unknown() {
        let path = std::env::temp_dir().join(format!(
            "atomic-tool-journal-{}-{}.sqlite",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let store = Store::open(&path).unwrap();
        let command = |id: &str, revision: Option<u64>, value: Value| {
            store
                .command(crate::CommandEnvelope {
                    command_id: id.into(),
                    expected_revision: revision,
                    command: value,
                })
                .unwrap()
        };
        command(
            "plan",
            None,
            json!({"type":"create_plan","project_id":"p","title":"p","tasks":[{"id":"t","title":"t","description":"bounded","role":"edit","dependencies":[],"write_scopes":[]}]}),
        );
        command(
            "start",
            Some(1),
            json!({"type":"start_plan","plan_id":"plan-1"}),
        );
        store.register_model_service("gpu", 1).unwrap();
        store
            .register_worker("w", "local", "gpu", "m", &["edit".into()])
            .unwrap();
        let revision = store.snapshot().unwrap().tasks[0]["revision"]
            .as_u64()
            .unwrap();
        let claim = command(
            "claim",
            Some(revision),
            json!({"type":"claim_task","task_id":"t","worker_id":"w"}),
        )
        .result;
        let mut request = request();
        request.attempt_id = claim["attempt_id"].as_str().unwrap().into();
        request.fencing_token = claim["fencing_token"].as_u64().unwrap();
        store.begin_tool(&request, "atomic-journal-test").unwrap();
        assert!(store.begin_tool(&request, "atomic-journal-test").is_err());
        drop(store);
        let store = Store::open(&path).unwrap();
        store.recover_tools().unwrap();
        let state = store.snapshot().unwrap();
        assert_eq!(state.tool_executions[0]["status"], "outcome_unknown");
        assert_eq!(state.attempts[0]["status"], "outcome_unknown");
        assert!(store.begin_tool(&request, "atomic-journal-test").is_err());
        store.reconcile_stopped(&request.attempt_id).unwrap();
        assert_eq!(
            store.snapshot().unwrap().tool_executions[0]["status"],
            "cancelled"
        );
        drop(store);
        std::fs::remove_file(path).unwrap();
    }
}
