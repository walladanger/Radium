//! Explicit opt-in live Linux test; never silently substitutes host execution.
#![cfg(target_os = "linux")]
use atomic_control::{
    execution::{SandboxExecutor, SandboxLimits, SandboxRequest, WorktreeManager},
    CommandEnvelope, Store,
};
use serde_json::json;
use std::path::Path;
#[tokio::test]
#[ignore = "requires provisioned rootless Podman and pinned local image in WSL"]
async fn live_rootless_worktree_confinement_and_cancellation() {
    let root =
        std::env::var("ATOMIC_SANDBOX_TEST_ROOT").expect("explicit Linux test root required");
    let image = std::env::var("ATOMIC_SANDBOX_IMAGE").expect("pinned local test image required");
    let fixture = Path::new(&root).join(format!("probe-{}", std::process::id()));
    std::fs::create_dir_all(&fixture).unwrap();
    let repository = fixture.join("repository");
    let workspaces = fixture.join("workspaces");
    std::fs::create_dir(&repository).unwrap();
    std::fs::create_dir(&workspaces).unwrap();
    async fn git(repository: &Path, args: &[&str]) -> String {
        let output = tokio::process::Command::new("/usr/bin/git")
            .arg("-C")
            .arg(repository)
            .args(args)
            .output()
            .await
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).trim().into()
    }
    git(&repository, &["init"]).await;
    std::fs::write(repository.join("source.txt"), "original").unwrap();
    std::fs::write(repository.join("protected.txt"), "protected").unwrap();
    std::fs::create_dir(repository.join("editable")).unwrap();
    std::fs::write(repository.join("editable/owned.txt"), "owned").unwrap();
    git(
        &repository,
        &["add", "source.txt", "protected.txt", "editable/owned.txt"],
    )
    .await;
    git(
        &repository,
        &[
            "-c",
            "user.name=Atomic test",
            "-c",
            "user.email=atomic-test@localhost",
            "commit",
            "-m",
            "fixture",
        ],
    )
    .await;
    let base = git(&repository, &["rev-parse", "HEAD"]).await;
    let manager = WorktreeManager::new(&workspaces, "/usr/bin/git").unwrap();
    let store = Store::open(fixture.join("controller.sqlite")).unwrap();
    store.command(CommandEnvelope{command_id:"plan".into(),expected_revision:None,command:json!({"type":"create_plan","project_id":"probe","title":"probe","tasks":[{"id":"probe","title":"probe","description":"check isolation","role":"edit","dependencies":[],"write_scopes":["source.txt","new/result.txt","editable/"]}]})}).unwrap();
    store
        .command(CommandEnvelope {
            command_id: "start".into(),
            expected_revision: Some(1),
            command: json!({"type":"start_plan","plan_id":"plan-1"}),
        })
        .unwrap();
    store.register_model_service("probe", 1).unwrap();
    store
        .register_worker("probe", "local", "probe", "none", &["edit".into()])
        .unwrap();
    let revision = store.snapshot().unwrap().tasks[0]["revision"]
        .as_u64()
        .unwrap();
    let claim = store
        .command(CommandEnvelope {
            command_id: "claim".into(),
            expected_revision: Some(revision),
            command: json!({"type":"claim_task","task_id":"probe","worker_id":"probe"}),
        })
        .unwrap()
        .result;
    let workspace = manager
        .create(&repository, claim["attempt_id"].as_str().unwrap(), &base)
        .await
        .unwrap();
    let executor = SandboxExecutor::new(store.clone(), "/usr/bin/podman", &workspaces).unwrap();
    let request=SandboxRequest{attempt_id:claim["attempt_id"].as_str().unwrap().into(),fencing_token:claim["fencing_token"].as_u64().unwrap(),tool_id:"isolation-probe".into(),workspace:workspace.clone(),image:image.clone(),argv:vec!["/bin/sh".into(),"-c".into(),"set -eu; test ! -e /mnt/c; test ! -e /root/.ssh; test ! -e /host; test -z \"${ATOMIC_CONTROL_TOKEN:-}\"; test \"$(cat /sys/fs/cgroup/memory.max)\" = 268435456; test \"$(cat /sys/fs/cgroup/pids.max)\" = 64; test \"$(cat /sys/fs/cgroup/cpu.max)\" = '100000 100000'; grep -q '^NoNewPrivs:[[:space:]]*1' /proc/self/status; test \"$(ls /sys/class/net)\" = lo; if touch /etc/atomic-escape 2>/dev/null; then exit 1; fi; if printf escaped > /workspace/protected.txt 2>/dev/null; then exit 1; fi; if printf escaped >> /workspace/.git 2>/dev/null; then exit 1; fi; if touch /workspace/new/unassigned.txt 2>/dev/null; then exit 1; fi; printf changed > /workspace/source.txt; printf new > /workspace/new/result.txt; printf directory > /workspace/editable/owned.txt; printf isolation-ok".into()],limits:SandboxLimits{memory_mib:256,cpus:1,pids:64,timeout_secs:10,output_bytes:4096}};
    let (_sender, cancel) = tokio::sync::watch::channel(false);
    let result = executor.execute(request.clone(), cancel).await.unwrap();
    assert_eq!(result.status, "succeeded", "{}", result.stderr);
    assert_eq!(result.stdout, "isolation-ok");
    assert_eq!(
        std::fs::read_to_string(repository.join("source.txt")).unwrap(),
        "original"
    );
    assert_eq!(
        std::fs::read_to_string(workspace.join("source.txt")).unwrap(),
        "changed"
    );
    assert_eq!(
        std::fs::read_to_string(workspace.join("protected.txt")).unwrap(),
        "protected"
    );
    assert_eq!(
        std::fs::read_to_string(workspace.join("new/result.txt")).unwrap(),
        "new"
    );
    assert_eq!(
        std::fs::read_to_string(workspace.join("editable/owned.txt")).unwrap(),
        "directory"
    );
    assert!(!workspace.join("new/unassigned.txt").exists());
    assert_eq!(
        store.snapshot().unwrap().tool_executions[0]["write_scopes"],
        json!(["source.txt", "new/result.txt", "editable/"])
    );
    let mut cancellation = request;
    cancellation.tool_id = "cancellation-probe".into();
    cancellation.argv = vec!["/bin/sh".into(), "-c".into(), "sleep 120 & wait".into()];
    cancellation.limits.timeout_secs = 1;
    let (_sender, cancel) = tokio::sync::watch::channel(false);
    let cancelled = executor.execute(cancellation, cancel).await.unwrap();
    assert_eq!(cancelled.status, "cancelled");
    let inspect = tokio::process::Command::new("/usr/bin/podman")
        .args([
            "container",
            "exists",
            &format!(
                "atomic-{}-cancellation-probe",
                claim["attempt_id"].as_str().unwrap()
            ),
        ])
        .status()
        .await
        .unwrap();
    assert!(!inspect.success());
    assert_eq!(store.snapshot().unwrap().tool_executions.len(), 2);
    println!("Verified real rootless confinement, resource limits, isolated worktree writes, durable tool records, and process-tree cancellation. Fixture retained at {}",fixture.display());
}
