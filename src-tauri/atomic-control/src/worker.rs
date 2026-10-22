//! Trusted coordinator for the extracted Radium loop. No host tool fallback exists.
use crate::execution::{SandboxExecutor, SandboxLimits, SandboxRequest, WorktreeManager};
use crate::{err, find, find_mut, lease, ArtifactEvidence, CommandEnvelope, Result, Store};
use async_trait::async_trait;
use atomic_agent_core::{
    llm_client::SamplingOverrides,
    model_profile::AgentModelProfile,
    openai_client::{OpenAiCompatibleClient, OpenAiTarget, OpenAiTargetKind},
    path_policy::EditableRoots,
    prompt::{self, CapabilitiesSummary},
    runner::{run_turn, RunTurnInput},
    session::{self, AgentSessionState},
    skills::SkillRegistry,
    tools::{ApprovalHook, FolderAccessHook, ToolContext, ToolExecutor},
    types::{
        AgentEvent, AgentReasoning, ApprovalDecision, ApprovalRequest, FolderAccessRequest,
        ToolCallPayload, ToolOutcome, ToolStatus,
    },
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::sync::{watch, Mutex};
use tokio_util::sync::CancellationToken;

/// Supplied by trusted provisioning, never by model output or HTTP commands.
pub struct LocalModelBinding {
    pub service_id: String,
    pub model_id: String,
    pub port: u16,
    pub api_key: String,
    pub context_window: usize,
}
impl LocalModelBinding {
    pub fn client(&self) -> Result<OpenAiCompatibleClient> {
        if self.port == 0
            || self.port == 1337
            || self.service_id.is_empty()
            || self.model_id.is_empty()
            || !(2048..=32768).contains(&self.context_window)
        {
            return Err(err(
                "invalid_request",
                "direct local model binding required",
            ));
        }
        OpenAiCompatibleClient::new(OpenAiTarget {
            kind: OpenAiTargetKind::LocalApiServer,
            base_url: format!("http://127.0.0.1:{}/v1", self.port),
            api_key: Some(self.api_key.clone()),
            model_id: self.model_id.clone(),
            has_vision: false,
            context_window: Some(self.context_window),
            json_schema: true,
        })
        .map_err(|e| err("execution_error", &e.to_string()))
    }
}

pub struct WorkerCoordinator {
    pub store: Store,
    pub sandbox: Arc<SandboxExecutor>,
    pub worktrees: WorktreeManager,
    pub data_root: PathBuf,
    pub image: String,
    pub limits: SandboxLimits,
}
pub struct TrustedRunRequest<'a> {
    pub task_id: &'a str,
    pub revision: u64,
    pub worker_id: &'a str,
    pub repository: &'a Path,
    pub base_commit: &'a str,
    pub binding: &'a LocalModelBinding,
    pub checks: &'a [Vec<String>],
    pub cancellation: CancellationToken,
}

const TOOLS: &[&str] = &[
    "reply",
    "tool.view",
    "os.shell.run",
    "os.fs.read",
    "os.fs.write",
    "os.fs.edit",
    "os.fs.list",
    "os.fs.mkdir",
];

struct DenyAuthority;
struct Observation<'a> {
    stage: &'a str,
    step: Option<u32>,
    tool: Option<&'a str>,
    step_count: Option<u32>,
}
struct CancelOnDrop(CancellationToken);
impl Drop for CancelOnDrop {
    fn drop(&mut self) {
        self.0.cancel();
    }
}
#[async_trait]
impl ApprovalHook for DenyAuthority {
    async fn is_allowed(&self, _: &str) -> bool {
        false
    }
    async fn request(&self, _: ApprovalRequest) -> std::result::Result<ApprovalDecision, String> {
        Ok(ApprovalDecision::Deny)
    }
}
#[async_trait]
impl FolderAccessHook for DenyAuthority {
    async fn request(&self, _: FolderAccessRequest) -> std::result::Result<bool, String> {
        Ok(false)
    }
}

struct Broker {
    sandbox: Arc<SandboxExecutor>,
    attempt: String,
    fence: u64,
    workspace: PathBuf,
    image: String,
    limits: SandboxLimits,
    next: AtomicU64,
    serial: Mutex<()>,
}
impl Broker {
    async fn dispatch(
        &self,
        argv: Vec<String>,
        cancellation: &CancellationToken,
        mut limits: SandboxLimits,
    ) -> Result<crate::execution::ToolOutcome> {
        let _guard = self.serial.lock().await;
        if cancellation.is_cancelled() {
            return Err(err("cancelled", "attempt cancelled"));
        }
        limits.timeout_secs = limits.timeout_secs.min(self.limits.timeout_secs);
        let tool_id = format!(
            "{}-worker-{}",
            self.attempt,
            self.next.fetch_add(1, Ordering::SeqCst)
        );
        let (send, recv) = watch::channel(false);
        let token = cancellation.clone();
        let bridge = tokio::spawn(async move {
            token.cancelled().await;
            let _ = send.send(true);
        });
        let sandbox = self.sandbox.clone();
        let request = SandboxRequest {
            attempt_id: self.attempt.clone(),
            fencing_token: self.fence,
            tool_id,
            workspace: self.workspace.clone(),
            image: self.image.clone(),
            argv,
            limits,
        };
        // Cleanup remains alive if the coordinator future is aborted. Its drop
        // guard cancels the bridge, and the executor still stops the container.
        let execution = tokio::spawn(async move { sandbox.execute(request, recv).await });
        let result = execution
            .await
            .map_err(|_| err("execution_error", "sandbox supervisor stopped"))?;
        bridge.abort();
        result
    }
}
#[async_trait]
impl ToolExecutor for Broker {
    async fn execute(&self, call: &ToolCallPayload, context: &ToolContext<'_>) -> ToolOutcome {
        if !TOOLS.contains(&call.tool.as_str()) {
            return ToolOutcome::denied(
                "Unsupported coordinated tool",
                "tool is outside the trusted profile",
            );
        }
        if call.tool == "reply" {
            return ToolOutcome::ok("Reply recorded");
        }
        if call.tool == "tool.view" {
            let name = call.args["name"].as_str().unwrap_or("");
            if !TOOLS.contains(&name) {
                return ToolOutcome::denied("Tool unavailable", "outside profile");
            }
            return context.loaded_tools.view(name).await;
        }
        let encoded = match serde_json::to_string(&json!({"tool":call.tool,"args":call.args})) {
            Ok(v) if v.len() <= 262144 => v,
            _ => return ToolOutcome::error("Tool arguments exceed the bounded request limit"),
        };
        let mut limits = self.limits.clone();
        if let Some(ms) = call.args["timeoutMs"].as_u64() {
            limits.timeout_secs = ms.div_ceil(1000).max(1).min(limits.timeout_secs as u64) as u32;
        }
        match self
            .dispatch(
                vec![
                    "/usr/bin/python3".into(),
                    "-c".into(),
                    HELPER.into(),
                    encoded,
                ],
                context.cancellation,
                limits,
            )
            .await
        {
            Ok(result) => ToolOutcome {
                status: if result.status == "succeeded" && result.exit_code == Some(0) {
                    ToolStatus::Ok
                } else if result.status == "cancelled" {
                    ToolStatus::Cancelled
                } else {
                    ToolStatus::Error
                },
                summary: if result.stdout.is_empty() {
                    result.stderr.clone()
                } else {
                    result.stdout.clone()
                },
                details: Some(
                    json!({"exit_code":result.exit_code,"stderr":result.stderr,"truncated":result.output_truncated}),
                ),
            },
            Err(error) => ToolOutcome::error(error.to_string()),
        }
    }
}

// The only filesystem implementation is inside the network-disabled container.
// Inputs are JSON argv, never interpolated Python or shell source.
const HELPER: &str = r#"
import json,os,pathlib,subprocess,sys
c=json.loads(sys.argv[1]); a=c['args']; t=c['tool']; root=pathlib.Path('/workspace')
def path(value):
 p=pathlib.Path(value or '.')
 if not p.is_absolute(): p=root/p
 p=p.resolve()
 if p!=root and root not in p.parents: raise ValueError('path outside assigned workspace')
 if '.git' in p.relative_to(root).parts: raise ValueError('Git bookkeeping is controller owned')
 return p
if t=='os.shell.run':
 cmd=a['cmd']; args=a.get('args',[])
 if not isinstance(cmd,str) or not cmd or not isinstance(args,list) or not all(isinstance(x,str) for x in args): raise ValueError('structured executable and args required')
 result=subprocess.run([cmd,*args],cwd=path(a.get('cwd','.')))
 sys.exit(result.returncode)
p=path(a.get('path','.'))
if t=='os.fs.read':
 offset=a.get('offset',0); limit=a.get('limit',16384)
 if not isinstance(offset,int) or offset<0 or not isinstance(limit,int) or not 1<=limit<=65536: raise ValueError('invalid byte page')
 with open(p,'rb') as f: f.seek(offset); data=f.read(limit)
 print(data.decode('utf-8',errors='replace'),end='')
elif t=='os.fs.write':
 content=a['content']; mode=a.get('mode','replace')
 if not isinstance(content,str) or mode not in ['replace','append']: raise ValueError('invalid write')
 p.parent.mkdir(parents=True,exist_ok=True)
 with open(p,'a' if mode=='append' else 'w',encoding='utf-8') as f: f.write(content)
 print('File written')
elif t=='os.fs.edit':
 old=a['oldString']; new=a['newString']; text=p.read_text(); count=text.count(old)
 if not old or count==0 or (count!=1 and not a.get('replaceAll',False)): raise ValueError('edit must match uniquely')
 with open(p,'w',encoding='utf-8') as f: f.write(text.replace(old,new))
 print('File edited')
elif t=='os.fs.mkdir':
 p.mkdir(parents=a.get('recursive',False),exist_ok=True); print('Directory created')
elif t=='os.fs.list':
 for child in sorted(p.iterdir()): print(('symlink' if child.is_symlink() else 'dir' if child.is_dir() else 'file')+' '+child.name)
else: raise ValueError('unsupported tool')
"#;

impl Store {
    fn bind_local_service(&self, binding: &LocalModelBinding) -> Result<()> {
        self.mutate("local_service_bound",json!({"service_id":binding.service_id,"port":binding.port,"model_id":binding.model_id}),|state,_| {
            if state.model_services.iter().any(|service|service["id"]!=binding.service_id && service["local_port"].as_u64()==Some(binding.port as u64)) {
                return Err(err("conflict","one local endpoint cannot own separate admission services"));
            }
            let service=find_mut(&mut state.model_services,&binding.service_id)?;
            if service.get("local_port").is_some() {
                if service["local_port"].as_u64()!=Some(binding.port as u64) || service["model_id"]!=binding.model_id {
                    return Err(err("conflict","local service binding is immutable"));
                }
                return Ok(());
            }
            service["local_port"]=json!(binding.port);service["model_id"]=json!(binding.model_id);
            Ok(())
        })
    }
    /// Metadata only; caller-provided content is never copied into telemetry.
    fn agent_progress(
        &self,
        attempt: &str,
        fence: u64,
        stage: &str,
        step: Option<u32>,
    ) -> Result<()> {
        self.agent_observation(
            attempt,
            fence,
            Observation {
                stage,
                step,
                tool: None,
                step_count: None,
            },
        )
    }
    fn agent_observation(
        &self,
        attempt: &str,
        fence: u64,
        observation: Observation<'_>,
    ) -> Result<()> {
        let Observation {
            stage,
            step,
            tool,
            step_count,
        } = observation;
        let snapshot = self.snapshot()?;
        let identity = find(&snapshot.attempts, attempt)?;
        self.mutate(
            "agent_progress",
            json!({"attempt_id":attempt,"task_id":identity["task_id"],"worker_id":identity["worker_id"],"service_id":identity["service_id"],"model":identity["model"],"stage":stage,"step_index":step,"current_tool":tool,"step_count":step_count}),
            |state, now| {
                lease(state, attempt, fence, now)?;
                let record = find_mut(&mut state.attempts, attempt)?;
                record["stage"] = json!(stage);
                if let Some(step)=step {record["step_index"] = json!(step);}
                record["current_tool"]=json!(tool);
                if let Some(count)=step_count {record["step_count"]=json!(count);}
                record["progress_revision"] =
                    json!(record["progress_revision"].as_u64().unwrap_or(0) + 1);
                Ok(())
            },
        )
    }
}

impl WorkerCoordinator {
    /// Runs one newly claimed task. Checks are trusted profile commands, not model proposals.
    pub async fn run(&self, request: TrustedRunRequest<'_>) -> Result<String> {
        let TrustedRunRequest {
            task_id,
            revision,
            worker_id,
            binding,
            checks,
            ref cancellation,
            ..
        } = request;
        if checks.is_empty() || checks.iter().any(|check| check.is_empty()) {
            return Err(err(
                "invalid_request",
                "at least one trusted acceptance check required",
            ));
        }
        let client = binding.client()?;
        let snapshot = self.store.snapshot()?;
        let task = find(&snapshot.tasks, task_id)?;
        if task["revision"].as_u64() != Some(revision) || task["status"] != "ready" {
            return Err(err(
                "conflict",
                "task must be ready at the supplied revision",
            ));
        }
        let worker = find(&snapshot.workers, worker_id)?;
        if worker["service_id"] != binding.service_id || worker["model"] != binding.model_id {
            return Err(err(
                "forbidden",
                "model binding does not match registered worker",
            ));
        }
        self.sandbox.preflight().await?;
        self.store.bind_local_service(binding)?;
        let claim = self.store.command(CommandEnvelope {
            command_id: format!("claim-{worker_id}-{task_id}-{revision}"),
            expected_revision: Some(revision),
            command: json!({"type":"claim_task","task_id":task_id,"worker_id":worker_id}),
        })?;
        let attempt = claim.result["attempt_id"]
            .as_str()
            .ok_or_else(|| err("internal", "missing attempt"))?
            .to_string();
        let fence = claim.result["fencing_token"]
            .as_u64()
            .ok_or_else(|| err("internal", "missing fence"))?;
        let store = self.store.clone();
        let aid = attempt.clone();
        let token = cancellation.clone();
        let heartbeat_stop = CancellationToken::new();
        let stop = heartbeat_stop.clone();
        let _heartbeat_guard = CancelOnDrop(heartbeat_stop.clone());
        let _execution_guard = CancelOnDrop(cancellation.clone());
        let heartbeat = tokio::spawn(async move {
            let mut count = 0u64;
            loop {
                tokio::select! { _=stop.cancelled()=>break, _=tokio::time::sleep(Duration::from_secs(5))=>{
                    count+=1;
                    if token.is_cancelled() || store.command(CommandEnvelope {command_id:format!("heartbeat-{aid}-{count}"),expected_revision:None,
                        command:json!({"type":"heartbeat","attempt_id":aid,"fencing_token":fence})}).is_err() { token.cancel(); break; }
                } }
            }
        });
        let result = self.run_claimed(&attempt, fence, &client, &request).await;
        heartbeat_stop.cancel();
        let _ = heartbeat.await;
        if result.is_err() {
            // Unknown outcomes stay reserved; never assert stop merely because the runner ended.
            let _ = self.store.command(CommandEnvelope {command_id:format!("finish-{attempt}"), expected_revision:None,
                command:json!({"type":"finish_attempt","attempt_id":attempt,"fencing_token":fence,"outcome":"failed"})});
        }
        result.map(|()| attempt)
    }

    async fn run_claimed(
        &self,
        attempt: &str,
        fence: u64,
        client: &OpenAiCompatibleClient,
        request: &TrustedRunRequest<'_>,
    ) -> Result<()> {
        let repository = request.repository;
        let base = request.base_commit;
        let checks = request.checks;
        let cancellation = &request.cancellation;
        let workspace = self.worktrees.create(repository, attempt, base).await?;
        let snapshot = self.store.snapshot()?;
        let task = find(
            &snapshot.tasks,
            find(&snapshot.attempts, attempt)?["task_id"]
                .as_str()
                .unwrap(),
        )?;
        let broker = Broker {
            sandbox: self.sandbox.clone(),
            attempt: attempt.into(),
            fence,
            workspace: workspace.clone(),
            image: self.image.clone(),
            limits: self.limits.clone(),
            next: AtomicU64::new(1),
            serial: Mutex::new(()),
        };
        let available = TOOLS
            .iter()
            .map(|name| name.to_string())
            .collect::<BTreeSet<_>>();
        let registry = SkillRegistry::load(
            self.data_root.join("reviewed-skills"),
            &BTreeSet::new(),
            &available,
        )
        .map_err(|e| err("execution_error", &e))?;
        let disabled = prompt::ITERATION_ONE_TOOLS
            .iter()
            .filter(|d| !available.contains(d.name))
            .map(|d| d.name.to_string())
            .collect::<BTreeSet<_>>();
        let descriptors = prompt::ITERATION_ONE_TOOLS
            .iter()
            .filter(|d| available.contains(d.name))
            .cloned()
            .collect::<Vec<_>>();
        let prefix = prompt::build_stable_prefix(
            &descriptors,
            &[],
            &CapabilitiesSummary {
                platform: "linux".into(),
                arch: "x86_64".into(),
                browser_channel: "none".into(),
                working_dir: "/workspace".into(),
                has_clipboard: false,
                has_wmctrl: false,
                has_notifications: false,
            },
            1,
            None,
        );
        let roots = EditableRoots::new(&workspace, &[])
            .await
            .map_err(|e| err("execution_error", &e))?;
        let mut session = AgentSessionState::new(attempt);
        tokio::fs::create_dir_all(self.data_root.join("threads").join(attempt))
            .await
            .map_err(|e| err("execution_error", &e.to_string()))?;
        let instructions=format!("Task: {}\n{}\nInstructions: {}\nAcceptance criteria: {}\nWritable scopes: {}\nWork only on this bounded task. Paths in tools are relative to /workspace. Report when ready for deterministic acceptance checks. Acceptance criteria are requirements, not proof of success; the controller runs separate trusted checks.",task["title"],task["description"],task.get("instructions").cloned().unwrap_or(json!([])),task.get("acceptance_criteria").cloned().unwrap_or(json!([])),task["write_scopes"]);
        let mut terminal = String::new();
        run_turn(
            RunTurnInput {
                run_id: attempt,
                session_id: attempt,
                user_message: &instructions,
                selected_skill: None,
                stable_prefix: &prefix,
                model_profile: AgentModelProfile::Plain,
                working_dir: &workspace,
                editable_roots: &roots,
                external_read_only_roots: &[],
                trusted_read_roots: &[],
                max_steps: 12,
                reasoning: AgentReasoning::Off,
                sampling: &SamplingOverrides::default(),
                mcp: None,
                docs: None,
                documents_note: None,
                disabled_tools: &disabled,
                auto_approve_mcp: false,
                client,
                approval: &DenyAuthority,
                folder_access: &DenyAuthority,
                executor: &broker,
                cancellation,
                session: &mut session,
                skill_registry: &registry,
                bundled_script_runtime: None,
                // Workers never take the coordinator's pinned llama.cpp slot,
                // so they cannot evict its KV prefix or queue behind it.
                slot_id: atomic_agent_core::runner::ANY_SLOT,
            },
            |event| {
                if let AgentEvent::ToolCallParsed { ref call, .. } = event {
                    self.store
                        .agent_observation(
                            attempt,
                            fence,
                            Observation {
                                stage: "preparing_tool",
                                step: None,
                                tool: Some(&call.tool),
                                step_count: None,
                            },
                        )
                        .map_err(|e| e.to_string())?;
                    return Ok(());
                }
                if let AgentEvent::ToolCallExecuted { ref result } = event {
                    self.store
                        .agent_observation(
                            attempt,
                            fence,
                            Observation {
                                stage: "tool_finished",
                                step: None,
                                tool: Some(&result.call.tool),
                                step_count: None,
                            },
                        )
                        .map_err(|e| e.to_string())?;
                    return Ok(());
                }
                if let AgentEvent::TurnFinished {
                    ref reason,
                    step_count,
                    ..
                } = event
                {
                    terminal = reason.clone();
                    self.store
                        .agent_observation(
                            attempt,
                            fence,
                            Observation {
                                stage: if reason == "reply" {
                                    "awaiting_checks"
                                } else {
                                    "agent_stopped"
                                },
                                step: None,
                                tool: None,
                                step_count: Some(step_count),
                            },
                        )
                        .map_err(|e| e.to_string())?;
                    return Ok(());
                }
                let stage = match event {
                    AgentEvent::StepStarted { step_index } => Some(("model", Some(step_index))),
                    _ => None,
                };
                if let Some((stage, step)) = stage {
                    self.store
                        .agent_progress(attempt, fence, stage, step)
                        .map_err(|e| e.to_string())?;
                }
                Ok(())
            },
        )
        .await
        .map_err(|e| err("execution_error", &e))?;
        session::save_session(&self.data_root, &session)
            .await
            .map_err(|e| err("execution_error", &e))?;
        if terminal != "reply" || cancellation.is_cancelled() {
            return Err(err(
                "execution_error",
                "agent did not complete the bounded turn",
            ));
        }
        let mut results = Vec::new();
        self.store
            .agent_progress(attempt, fence, "verification", None)?;
        for check in checks {
            let result = broker
                .dispatch(check.clone(), cancellation, self.limits.clone())
                .await?;
            if result.status != "succeeded" || result.exit_code != Some(0) {
                return Err(err(
                    "verification_failed",
                    "trusted acceptance check failed",
                ));
            }
            results.push(json!({"argv":check,"exit_code":result.exit_code,"stdout":result.stdout,"stderr":result.stderr,"truncated":result.output_truncated}));
        }
        let files = scoped_snapshot(
            &workspace,
            task["write_scopes"]
                .as_array()
                .ok_or_else(|| err("internal", "missing scopes"))?,
        )?;
        let content = serde_json::to_vec(
            &json!({"attempt_id":attempt,"base_commit":base,"files":files,"checks":results}),
        )
        .map_err(crate::Error::from)?;
        let digest = format!("{:x}", Sha256::digest(&content));
        let artifact_root = self.data_root.join("artifacts");
        std::fs::create_dir_all(&artifact_root)
            .map_err(|e| err("execution_error", &e.to_string()))?;
        let path = artifact_root.join(format!("{attempt}-{digest}.json"));
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|e| err("execution_error", &e.to_string()))?;
        file.write_all(&content)
            .and_then(|()| file.sync_all())
            .map_err(|e| err("execution_error", &e.to_string()))?;
        file.set_permissions({
            let mut p = file
                .metadata()
                .map_err(|e| err("execution_error", &e.to_string()))?
                .permissions();
            p.set_readonly(true);
            p
        })
        .map_err(|e| err("execution_error", &e.to_string()))?;
        self.store.validate_artifact(
            attempt,
            fence,
            ArtifactEvidence {
                id: format!("artifact-{attempt}"),
                kind: "workspace_snapshot".into(),
                path: path.to_string_lossy().into(),
            },
        )?;
        self.store.command(CommandEnvelope {command_id:format!("finish-{attempt}"),expected_revision:None,
            command:json!({"type":"finish_attempt","attempt_id":attempt,"fencing_token":fence,"outcome":"succeeded"})})?;
        Ok(())
    }
}

fn scoped_snapshot(root: &Path, scopes: &[Value]) -> Result<Vec<Value>> {
    let mut files = Vec::new();
    let mut pending = Vec::new();
    let mut bytes = 0usize;
    for scope in scopes {
        pending.push(
            root.join(
                scope
                    .as_str()
                    .ok_or_else(|| err("invalid_request", "invalid scope"))?,
            ),
        );
    }
    while let Some(path) = pending.pop() {
        let metadata = std::fs::symlink_metadata(&path)
            .map_err(|e| err("verification_failed", &e.to_string()))?;
        if metadata.file_type().is_symlink() {
            return Err(err(
                "verification_failed",
                "artifact scope contains a symlink",
            ));
        }
        let canonical = path
            .canonicalize()
            .map_err(|e| err("verification_failed", &e.to_string()))?;
        if !canonical.starts_with(root)
            || canonical
                .components()
                .any(|part| part.as_os_str() == ".git")
        {
            return Err(err("verification_failed", "artifact outside scope"));
        }
        if metadata.is_dir() {
            for entry in
                std::fs::read_dir(&path).map_err(|e| err("verification_failed", &e.to_string()))?
            {
                pending.push(
                    entry
                        .map_err(|e| err("verification_failed", &e.to_string()))?
                        .path(),
                );
                if pending.len() + files.len() > 4096 {
                    return Err(err("verification_failed", "artifact file budget exceeded"));
                }
            }
        } else if metadata.is_file() {
            #[cfg(unix)]
            {
                use std::os::unix::fs::MetadataExt;
                if metadata.nlink() != 1 {
                    return Err(err("verification_failed", "artifact contains a hard link"));
                }
            }
            bytes = bytes.saturating_add(metadata.len() as usize);
            if bytes > 4 * 1024 * 1024 {
                return Err(err("verification_failed", "artifact byte budget exceeded"));
            }
            let content =
                std::fs::read(&path).map_err(|e| err("verification_failed", &e.to_string()))?;
            files.push(json!({"path":path.strip_prefix(root).unwrap().to_string_lossy(),"sha256":format!("{:x}",Sha256::digest(&content)),"bytes":content}));
        } else {
            return Err(err(
                "verification_failed",
                "artifact contains a special file",
            ));
        }
    }
    files.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn model_binding_never_accepts_cloud_facade() {
        let binding = LocalModelBinding {
            service_id: "gpu1".into(),
            model_id: "coder".into(),
            port: 1337,
            api_key: "private".into(),
            context_window: 8192,
        };
        assert!(binding.client().is_err());
    }
    #[test]
    fn admission_endpoint_cannot_be_rebound_or_counted_twice() {
        let store = Store::open(":memory:").unwrap();
        store.register_model_service("gpu1", 1).unwrap();
        store.register_model_service("other", 1).unwrap();
        let mut binding = LocalModelBinding {
            service_id: "gpu1".into(),
            model_id: "coder".into(),
            port: 17441,
            api_key: "secret".into(),
            context_window: 8192,
        };
        store.bind_local_service(&binding).unwrap();
        let sequence = store.snapshot().unwrap().sequence;
        store.bind_local_service(&binding).unwrap();
        assert_eq!(store.snapshot().unwrap().sequence, sequence);
        binding.service_id = "other".into();
        assert!(store.bind_local_service(&binding).is_err());
        binding.service_id = "gpu1".into();
        binding.port = 17442;
        assert!(store.bind_local_service(&binding).is_err());
        assert!(!serde_json::to_string(&store.snapshot().unwrap())
            .unwrap()
            .contains("secret"));
    }
    #[test]
    fn progress_carries_trusted_identity_and_rejects_stale_fence() {
        let store = Store::open(":memory:").unwrap();
        store.command(CommandEnvelope {command_id:"plan".into(),expected_revision:None,command:json!({"type":"create_plan","project_id":"fixture","title":"test","tasks":[{"id":"edit","title":"test","description":"bounded edit","role":"edit","dependencies":[],"write_scopes":["src"]}]})}).unwrap();
        store
            .command(CommandEnvelope {
                command_id: "start".into(),
                expected_revision: Some(1),
                command: json!({"type":"start_plan","plan_id":"plan-1"}),
            })
            .unwrap();
        store.register_model_service("gpu", 1).unwrap();
        store
            .register_worker("w", "wsl", "gpu", "m", &["edit".into()])
            .unwrap();
        let claim = store
            .command(CommandEnvelope {
                command_id: "claim".into(),
                expected_revision: store.snapshot().unwrap().tasks[0]["revision"].as_u64(),
                command: json!({"type":"claim_task","task_id":"edit","worker_id":"w"}),
            })
            .unwrap();
        let id = claim.result["attempt_id"].as_str().unwrap();
        let fence = claim.result["fencing_token"].as_u64().unwrap();
        store.agent_progress(id, fence, "model", Some(0)).unwrap();
        let event = store.events(claim.sequence).unwrap().pop().unwrap();
        assert_eq!(event["task_id"], "edit");
        assert_eq!(event["payload"]["worker_id"], "w");
        assert!(store.agent_progress(id, fence + 1, "tool", None).is_err());
    }
    #[test]
    fn scope_snapshot_rejects_escape_and_symlinks() {
        let root =
            std::env::temp_dir().join(format!("atomic-artifact-test-{}", std::process::id()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("assigned.txt"), "evidence").unwrap();
        let root = root.canonicalize().unwrap();
        let files = scoped_snapshot(&root, &[json!("assigned.txt")]).unwrap();
        assert_eq!(files.len(), 1);
        assert_eq!(
            files[0]["sha256"],
            format!("{:x}", Sha256::digest(b"evidence"))
        );
        assert!(scoped_snapshot(&root, &[json!("../")]).is_err());
        #[cfg(unix)]
        {
            let link = root.join("escape-link");
            if !link.exists() {
                std::os::unix::fs::symlink("/etc/passwd", &link).unwrap();
            }
            assert!(scoped_snapshot(&root, &[json!("escape-link")]).is_err());
        }
    }
}
