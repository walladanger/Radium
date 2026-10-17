# Atomic local controller

Independent Rust crate for the coordinated task state, authenticated API, and
durable event history. It does not change Radium's existing model API.

## Run and verify

Run `cargo test` and `cargo clippy --all-targets -- -D warnings` in this directory.
The executable requires `ATOMIC_CONTROL_DATABASE` (a database file on the WSL
Linux filesystem for production) and `ATOMIC_CONTROL_TOKEN` (at least 32 bytes
from a secure secret generator). It binds only `127.0.0.1:17432`; never publish
this port directly to a LAN. Tokens are provided in the Authorization header.

The API exposes capabilities, snapshots, commands, and resumable SSE under
`/v1/control`. A snapshot watermark followed by `/events?after=watermark`
reconstructs current state without a subscribe race. Events remain in SQLite;
retention and snapshot compaction are not implemented yet.

## Authority and recovery

Worker reports cannot validate artifacts. A trusted in-process verifier calls
`Store::validate_artifact` only after checks and artifact capture. Successful
completion requires such evidence. The method is a trust boundary, not a
verifier implementation. The trusted `worker::WorkerCoordinator` uses the
extracted Radium loop, isolated tool broker, configured deterministic checks,
and digest-named scoped file snapshots before calling this seam. A failed check
cannot validate an artifact. These snapshots are not integration-ready commits.

Expired or cancelled running attempts become `outcome_unknown`. They retain
worker/model capacity until a trusted executor confirms termination and calls
`Store::reconcile_stopped`. Old fencing tokens cannot heartbeat or finish.
The executable reconciles expired leases at startup and every second. Idle
recovery does not append events; database recovery errors stop serving. An
eventual executor must actually terminate cancelled processes.

## Remaining production work

This crate currently stores a serialized state snapshot and durable command
receipts/events in SQLite transactions. Normalized schemas and migration
policy, bounded retention, network worker authentication, daemon dispatch,
cloud grants, candidate assembly, telemetry, backup, and failure soak
tests remain release gates. The client API secret authorizes only plan creation/lifecycle, task cancellation/retry,
and approval resolution. It cannot register workers, claim attempts, heartbeat,
report completion, or request approvals. Trusted in-process administration calls
`register_model_service` and `register_worker`; the immutable service binding,
not a caller's model alias, owns admission capacity. `Store::command` remains a
trusted executor interface and must not be exposed wholesale to workers. A
separate authenticated worker broker remains required before worker networking.
Existing persisted workers without service bindings must be administratively
migrated; admission fails closed. Unknown legacy attempts reserve all services.

CORS is disabled by default. `ATOMIC_CONTROL_ALLOWED_ORIGINS` is an explicit
comma-separated list of serialized origins; for browser development configure
`http://localhost:1420` (verified in `web-app/vite.config.ts` and Tauri `devUrl`).
Wildcard, opaque `null`, paths, credentials, and trailing slashes are rejected.
Allowed preflight methods are GET/POST and headers Authorization/Content-Type.
Actual calls still require the Bearer token. Unapproved origins are rejected.
Production Tauri origin must be verified on the target platform and configured
explicitly; CSP references are not proof of the running WebView origin.
The paired phone gateway remains a separate unfinished component.

## Isolated execution boundary

`execution::WorktreeManager` creates detached worktrees at exact commit SHAs on
the Linux filesystem. It disables hooks and filesystem monitors, rejects local
checkout filters, and leaves existing workspaces intact. Git metadata stays
outside the worker mount; controller-side Git owns artifact bookkeeping.

`execution::SandboxExecutor` requires a trusted absolute Podman executable,
rootless operation, seccomp, and cgroups v2. There is no Docker or host-shell
fallback. The canonical assigned repository is mounted read-only. Writable
file and directory submounts come exclusively from trusted task write scopes;
the execution request cannot override them. Root scopes, traversal, Git metadata,
symlinks, hardlinks, special objects, and overlapping scopes are rejected.
New assigned files are prepared after durable journaling. File mounts support
direct writes; rename-based saves require an explicitly approved directory scope.
Containers use a digest-pinned preinstalled image, no network, read-only root,
no capabilities, no new privileges, private namespaces, bounded CPU/memory/PIDs,
bounded captured output, and an execution deadline. Environment variables and
credentials from the controller are not inherited by payloads. Image contents
and host Podman configuration must be reviewed before production use.

Tool starts persist before spawn. Duplicate tool IDs and uncertain previous
executions cannot replay. Startup marks incomplete tools and attempts
`outcome_unknown`; a trusted executor must stop their recorded containers
before reconciliation releases capacity. Cancellation removes the entire
container with `podman rm --force --time=0`; simply killing its client process
is insufficient. Podman's default graceful stop exceeded an initial observation
timeout in the live test and correctly produced an unknown outcome.
The trusted worker coordinator must renew the attempt lease during long tools;
the executor stops when the lease is expired or the attempt is cancelled.

Cross-platform deterministic tests cover engine rejection, argv boundaries,
bounded output drainage, and durable interrupted-tool recovery. The explicit
Linux-only integration test `cargo test --test sandbox -- --ignored --nocapture`
requires `ATOMIC_SANDBOX_TEST_ROOT` on the Linux filesystem and
`ATOMIC_SANDBOX_IMAGE` pinned by digest. It checks actual cgroup limits, denied
host access, read-only root, no credentials/network, worktree isolation, and
container-tree cancellation. Test fixtures are retained for inspection.

The isolation probe uses Ubuntu only; it does not prove coding toolchain support,
repository-wide toolchain dependency support. A separate Linux worker fixture
does prove local coder -> extracted loop -> sandboxed write -> trusted checks ->
validated scoped artifact -> completed durable task, including a deliberate
failed-check case. Daemon/UI dispatch and integration approval remain unverified.
The live scope tests additionally
prove assigned writes succeed while protected files, Git metadata, and
unassigned siblings remain unchanged.

Implementation references: [Podman run](https://docs.podman.io/en/latest/markdown/podman-run.1.html),
[Podman removal](https://docs.podman.io/en/latest/markdown/podman-rm.1.html),
[Git worktrees](https://git-scm.com/docs/git-worktree), and
[Git configuration](https://git-scm.com/docs/git-config).
