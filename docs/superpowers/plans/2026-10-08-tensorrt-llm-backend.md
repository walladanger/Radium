# TensorRT-LLM backend for Radium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Radium users on NVIDIA Windows (primary) and Linux machines get TensorRT-LLM speed behind the existing `http://localhost:1337/v1` facade with no setup by default, while developers keep every knob.

**Architecture:** TensorRT-LLM is a Linux-only Python/CUDA runtime, so on Windows it runs inside WSL2 and Radium, a Windows app, drives it through `wsl.exe`. Radium owns a private WSL2 distro, so it never touches the user's own distros and can install system packages as root inside it without a Windows admin prompt. One `RuntimeHost` interface has two implementations, `Wsl2` (Windows) and `NativeLinux`, so everything above it is shared. Phase 0 is a spike on the Windows 3090 desktop. Phase 1 builds the runtime. Phase 2 builds the experience: automatic engine choice and progressive settings, with the runtime listed beside the other local runtimes in Settings.

**Tech Stack:** `trtllm-serve` (PyTorch backend, Apache-2.0), WSL2 + Ubuntu 24.04, TypeScript extension, Rust Tauri plugin, React/Vite web-app.

**Spec:** None exists. This document is the spec and the plan. Decisions that need the user's sign-off are in Open Decisions.

## What TensorRT-LLM is, as verified on 2026-10-08/09

Sources: the repo README, the `trtllm-serve` docs, the support matrix and the Linux install page on nvidia.github.io/TensorRT-LLM; [NVIDIA's CUDA on WSL guide](https://docs.nvidia.com/cuda/wsl-user-guide/index.html); a [third-party mirror of the CLI reference](https://www.mintlify.com/NVIDIA/TensorRT-LLM/cli/trtllm-serve); [GitHub issue 2864](https://github.com/NVIDIA/TensorRT-LLM/issues/2864).

| Fact | Consequence for Radium |
| ---- | ---------------------- |
| The support matrix says "requires Linux x86_64 or Linux aarch64". Windows and WSL are not listed. Third-party 2026 guides say native Windows is unsupported and WSL2 or Docker Desktop is the practical route. | On Windows it runs in WSL2 as a Linux environment. NVIDIA does not test WSL2 as a platform, so the UI must say "works, not officially supported". |
| Tested GPUs: Ampere (SM80/86), Ada (SM89), Hopper, Grace Hopper, Blackwell. Consumer GeForce is not named. | Gate on NVIDIA + compute capability >= 8.0. RTX 3090 (SM86) qualifies, with no FP8. |
| **It does not run GGUF.** `trtllm-serve MODEL` takes a model name, a Hugging Face checkpoint path or a TensorRT engine path. The default backend is PyTorch (`--backend` is deprecated). | Needs its own Hugging Face model download. The GGUF library cannot be reused, so TRT models cost extra disk. A GGUF-only model is never routed here. |
| `trtllm-serve` exposes `/v1/models`, `/v1/chat/completions`, `/v1/completions`, `/v1/responses`, `/health`, `/metrics`, `/version`. | Standard OpenAI surface: the proxy forwards unchanged (AGENTS.md rule 3). `/health` is the readiness probe. |
| Flags: `--host --port --max_batch_size --max_seq_len --tp_size --kv_cache_free_gpu_memory_fraction --kv_cache_dtype (auto/fp8/nvfp4) --config <yaml>`. | These become the Advanced settings. Anything else goes through the YAML. Re-read the pinned release's docs; do not invent flags (rule 2). |
| Multimodal needs a `chat_template`, chat API only, incompatible with KV block reuse. Speculative decoding exists. | Both deferred; spec flags need checking against the pinned release first (AGENTS.md §3). |
| Version badge `1.4.0rc0`. Apache-2.0. | Pin a reviewed release, never `latest`. No bundling, so no license problem. |

**CUDA on WSL2 (NVIDIA's WSL guide):**

| Item | Detail | Consequence |
| ---- | ------ | ----------- |
| Driver | Install the NVIDIA **Windows** driver only; never a Linux display driver inside WSL. R495 or later is the floor for CUDA on WSL2. | Radium checks the Windows driver version; it never installs a driver. The floor for TensorRT-LLM itself is likely higher and unpublished; Task 0 finds it. |
| Windows | Windows 11 (Windows 10 only via Insider builds). WSL kernel 5.10.16.3 or later recommended. | Preflight gates on Windows 11 and `wsl --version`. |
| Toolkit | Install the WSL-Ubuntu `cuda-toolkit-*` package; never the `cuda`, `cuda-12-x` or `cuda-drivers` meta-packages (they install a Linux driver). | The provisioning script uses only the toolkit package. |
| GPUs | Pascal and newer on GeForce/Quadro in WDDM mode. | Compatible with the 3090s. |
| Limits | Pinned memory is limited; no full Unified Memory; **you cannot filter GPUs by index**; some NVML queries are unsupported; `nvidia-smi` lives in `/usr/lib/wsl/lib/`. | `CUDA_VISIBLE_DEVICES`-style GPU choice and multi-GPU behaviour must be tested, not assumed. |
| Multi-GPU | Issue 2864 reports `tp_size 2` failing on two RTX 5090s under WSL2 + Docker. It used release 0.17.0.post1, which is old. | **Risk for your dual 3090s.** Task 0 tests `tp_size 2` on WSL2 and the plan has a fallback (one GPU per instance). |
| Docker | Supported through Docker Desktop with NVIDIA Container Toolkit v2.6.0+ / libnvidia-container 1.5.1+. | The container route is an alternative, not the default (Open Decision 1). |

**Install requirements (Linux page, Ubuntu 24.04, Python 3.12), run inside the WSL2 distro:**

| Step | Command / requirement | Catch |
| ---- | --------------------- | ----- |
| CUDA Toolkit | 13.1, with `CUDA_HOME` set | A `cuda-compat-13-1` package "may be required" depending on the driver; no minimum driver version is published. |
| PyTorch | `pip3 install torch==2.10.0 torchvision --index-url https://download.pytorch.org/whl/cu130` | pip's default torch is a CUDA 12.8 build and will not match. On some systems (notably Ubuntu 22.04) installing `tensorrt_llm` silently swaps CUDA 13.0 torch for 12.8; NVIDIA's workaround is a constraints file pinning the current torch. |
| Open MPI | `sudo apt-get -y install libopenmpi-dev` | Root inside the private distro: no Windows admin prompt. |
| Wheel | `pip3 install --ignore-installed pip setuptools wheel && pip3 install tensorrt_llm` | Downloads further third-party open-source projects with their own licenses; review before shipping. |

The root-level prerequisites that blocked a zero-effort Linux install are not a problem in a Radium-owned WSL distro, because Radium is root there. What remains outside Radium's control: enabling WSL2 itself (`wsl --install` needs Windows admin and may need a reboot), BIOS virtualization, and the Windows NVIDIA driver version.

## Global Constraints

- New identifiers use `atomic` / `Radium`, never a new `jan*` name. Wiring into existing `@janhq/*` packages is fine (AGENTS.md §4).
- Provider id is `tensorrt-llm`. It is a new provider and is not folded into `llamacpp`, `llamacpp-upstream` or `mlx`.
- llama.cpp-only features stay guarded by provider identity: `-ctk/-ctv turbo*` never reaches `tensorrt-llm` and TensorRT-LLM flags never reach llama.cpp (AGENTS.md §3). Never widen one provider's hardware matrix from another's probe.
- `http://localhost:1337/v1` stays OpenAI-compatible; non-standard additions only.
- The release is pinned; tag, URL and sha256 live in one resolver script, never hardcoded in the extension (mirrors `scripts/resolve-upstream-backend.mjs`). The Ubuntu rootfs used for the private distro is pinned and sha256-checked the same way.
- **Radium never modifies a user-owned WSL distro or `.wslconfig` silently.** The private distro is the only one it creates, runs and deletes. Any global WSL setting (for example the memory cap) is shown to the user and changed only on consent.
- **Zero-config by default.** A user with eligible hardware picks a model and chats without opening Settings, loading a runtime by hand or choosing an engine. Every default is chosen by Radium; no setting is required.
- **Progressive disclosure.** Three tiers: Tier 0 nothing to configure; Tier 1 a plain status card; Tier 2 a collapsed Advanced section with every option. Advanced values never change behaviour until the user changes them, and "Reset to defaults" restores Tier 0 behaviour exactly.
- **One home for runtimes.** TensorRT-LLM appears in Settings -> Providers' local-engine list beside llama.cpp, MLX and the others, not on the Cloud page and not on a separate settings page.
- Multi-GB downloads and anything needing Windows admin (`wsl --install`, a reboot) happen only after explicit consent, once.
- Runtime data lives under the existing data folder (`%APPDATA%\Radium\data\tensorrt-llm\` on Windows); add its row to the `DEVELOP.md` data-folder table and teach the uninstaller to `wsl --unregister` the private distro (AGENTS.md §5: do not invent data paths).
- No new top-level folders, config files or runtime dependencies without the user's explicit "ok" (AGENTS.md rule 6). The new extension and plugin live under existing `extensions/` and `src-tauri/plugins/`; the package name and any new dependency still need the "ok".
- Record each non-trivial decision as an ADR in `docs/decisions/` plus an `INDEX.md` line, same session (rule 8).
- Do not commit unless asked (rule 5); commit steps below apply only when the user has asked for commits.
- Verify with `make verify` before finishing (rule 4). All `wsl.exe` and Linux process logic sits behind a `CommandRunner` trait so its tests run on any OS in CI.
- Agent mode is restricted to local llama.cpp providers (ADR 2026-07-24). `tensorrt-llm` stays out of Agent mode unless a new ADR says otherwise.

## Review Focus

- macOS user opens Providers: TensorRT-LLM must not appear. Windows with AMD/Intel, a pre-Ampere NVIDIA GPU, Windows 10, WSL absent, WSL1 only, or virtualization disabled: it must not appear or must show the real reason, never a crash on launch.
- A model that only exists as GGUF must never be routed to `tensorrt-llm`, and a TRT-LLM model must never be offered to the llama.cpp engines.
- First chat on eligible hardware with the runtime not installed: chat works immediately on the standard engine, and the TRT-LLM offer is one non-blocking prompt showing download size and the one-time admin step, asked once.
- `tp_size 2` on the dual 3090s under WSL2 fails (the issue-2864 pattern): the user gets an actionable message and an automatic fall back to one GPU, not a stuck "loading".
- Model files read from `/mnt/c` are very slow: models must be stored and loaded on the distro's own ext4 filesystem, and the card must show their size there.
- WSL2 default memory cap (half the host RAM) makes a large load OOM: the error names the cap and offers to raise it, with consent.
- App quit or crash must not leave `trtllm-serve` or the distro holding GPU memory; WSL's idle shutdown must not kill a server mid-chat.
- Windows can reach the server on `localhost` (WSL2 forwarding differs between NAT and mirrored networking): verify both modes.
- Advanced values that are invalid or brick launch produce an actionable error and a one-click "Reset to defaults".
- `trtllm-serve` unreachable or dying mid-chat: the proxy returns a clear error, not a hung stream, and the model list stops showing it as loaded.
- External-endpoint mode with a typo or a down server shows a connection error in the card and does not disable the managed runtime.

---

## Phase 0 — Feasibility spike (no product code)

### Task 0: Prove the WSL2 path on the Windows 3090 desktop

**Files:**
- Create: `docs/decisions/2026-10-08-tensorrt-llm-spike-results.md` (from `_TEMPLATE.md`; add one line to `docs/decisions/INDEX.md`)

**Interfaces:**
- Produces: the pinned release, the chosen host (private WSL distro or Docker), the minimum Windows driver, whether `tp_size 2` works on WSL2, whether GPU filtering works, measured tokens/s vs `llamacpp-upstream`, the models worth offering, and the localhost-forwarding result per networking mode. Later tasks read these values.

- [ ] **Step 1:** `wsl --import radium-trtllm <dir> <ubuntu-24.04-rootfs.tar.gz>` into a private distro. In it, follow the install table exactly as root and record commands, download size, time, and `ext4.vhdx` size.
- [ ] **Step 2:** Try to remove prerequisites: run with the Windows driver only, then without the system CUDA Toolkit (pip-provided CUDA libraries), then without apt Open MPI. Record which are truly needed at serve time and the lowest Windows driver that works.
- [ ] **Step 3:** Run `trtllm-serve <hf-model> --port <free> --tp_size 1`, then `--tp_size 2`, with BF16 and INT4 checkpoints that fit the 3090s, with the model on the distro's ext4 and again on `/mnt/c`. Record time-to-first-token and decode tokens/s via `curl` from **Windows** on `/v1/chat/completions`, against `llamacpp-upstream` with a GGUF quant of similar bit width. If `tp_size 2` fails, record the error and test one instance per GPU.
- [ ] **Step 4:** Test whether `CUDA_VISIBLE_DEVICES` selects a GPU under WSL2 (the guide says GPUs cannot be filtered by index).
- [ ] **Step 5:** Check localhost reachability from Windows in NAT and mirrored networking; check whether killing `wsl.exe` leaves `trtllm-serve` running; check WSL's idle shutdown behaviour; confirm `/health` semantics and the stderr shape on OOM.
- [ ] **Step 6:** Repeat Step 1 and the serve test with Docker Desktop + the NGC container and record download size, start time and any WSL2 errors, for comparison.
- [ ] **Step 7:** Build the comparison matrix on the same model family and similar bit width: (A) `llamacpp-upstream` native Windows (the baseline Radium ships today), (B) TensorRT-LLM in the private WSL2 distro, (C) `llamacpp-upstream` inside the same WSL2 distro, (D) TensorRT-LLM via Docker Desktop. For each, record: model load time, prompt-processing tokens/s at 512 and 8k tokens, decode tokens/s at 1 concurrent request, aggregate decode tokens/s at 4 and 8 concurrent requests, peak VRAM, and idle VRAM and RAM. B vs C isolates TensorRT-LLM's gain from WSL2's cost; C vs A isolates WSL2's cost. Use current builds of both engines: the only head-to-head figures found (Jan, Mistral 7B, older builds, AWQ vs Q4_K_M) are not a basis for decisions.
- [ ] **Step 8:** Write the ADR with a go/no-go for Phase 1. **The bar (set by the user, 2026-10-09): B must decode at least 30% faster than A at 1 concurrent request**, same model family and similar bit width, on models Radium actually offers. Aggregate throughput at 4-8 requests, prompt processing, load time and VRAM are recorded and reported but do not change the verdict. No-go also if the install needs more than one consented admin step. Do not move the bar after seeing results; if B misses it, stop.

---

## Phase 1 — The runtime (gated on Task 0 go)

Mirrors the MLX layout: a Rust plugin owns the process, a TS extension owns settings and models, the proxy routes.

### Task 1: Capability probe

**Files:**
- Modify: `src-tauri/plugins/tauri-plugin-hardware/` (add `tensorrt_llm_capability`), plus a web-app hook that reads it
- Test: Rust unit tests in the plugin; Vitest for the hook

**Interfaces:**
- Produces: `fn tensorrt_llm_capability(profile: &HardwareProfile, host: &HostProbe) -> Capability` where `Capability = Supported { gpu_count: u32, host: HostKind } | Unsupported(reason)`, `HostKind = Wsl2 | NativeLinux`, and `HostProbe { os, windows_build, wsl_installed, wsl_version, virtualization_enabled, windows_driver_version }`. Reasons: `"not_supported_os"`, `"windows_too_old"`, `"wsl_missing"`, `"wsl_v1_only"`, `"virtualization_disabled"`, `"no_nvidia_gpu"`, `"compute_capability_below_8_0"`, `"driver_too_old"` (floor from Task 0). `wsl_missing` is fixable and carries an `action: EnableWsl`.

- [ ] **Step 1:** Failing tests per reason with fixture profiles: Windows 11 + WSL2 + two SM86 cards is `Supported { gpu_count: 2, host: Wsl2 }`; macOS, Windows 10, WSL absent, WSL1, AMD-only, Turing and old driver are each `Unsupported` with the matching reason.
- [ ] **Step 2:** `cd src-tauri && cargo test -p tauri-plugin-hardware tensorrt`. Expect FAIL.
- [ ] **Step 3:** Implement from the existing NVIDIA probe data and the bounded Windows GPU detection (ADR 2026-07-23); no new probe path. The WSL check follows the existing `detect_via_wsl` approach in `src-tauri/src/core/system/commands.rs`. The result is never reused for llama.cpp selection.
- [ ] **Step 4:** Rerun, then `cargo clippy` in `src-tauri/`. Expect PASS.

### Task 2: Pinned runtime environment manager

**Files:**
- Create: `scripts/resolve-tensorrt-llm-release.mjs`
- Create: `src-tauri/plugins/tauri-plugin-tensorrtllm/src/host.rs` (the `RuntimeHost` trait, `CommandRunner` trait), `wsl2.rs`, `native_linux.rs`, `provision.rs`
- Test: `scripts/` vitest; Rust tests using a fake `CommandRunner`

**Interfaces:**
- Consumes: the host, rootfs and prerequisite choices from Task 0.
- Produces:
  - `trait RuntimeHost { fn status(&self) -> HostStatus; fn provision(&self, on_progress: ProgressFn) -> Result<InstalledRuntime>; fn spawn(&self, args: &[String], env: &HashMap<String,String>) -> Result<HostProcess>; fn exec_to_completion(&self, args: &[String]) -> Result<Output>; fn teardown(&self) -> Result<()>; fn storage_root(&self) -> PathBuf }`
  - `HostStatus = NotSupported(reason) | NeedsWsl | NeedsReboot | NotProvisioned { download_bytes: u64 } | Ready { version: String }`
  - `InstalledRuntime { version: String, python_env: String }`.
  - `Wsl2Host` owns the distro `radium-trtllm`, stored under `<data_folder>/tensorrt-llm/wsl/`.

- [ ] **Step 1:** Failing tests with a fake `CommandRunner`: the resolver emits the pinned tag and sha256 and refuses `latest`; `Wsl2Host.status()` maps `wsl.exe` outputs to each `HostStatus`; `provision` imports the rootfs only after a sha256 match, then runs the provisioning script and leaves no distro on failure; the script pins torch by constraints file so `tensorrt_llm` cannot swap it; `NeedsWsl` is reported, never an automatic `wsl --install`; `teardown` runs `wsl --unregister radium-trtllm` and nothing else.
- [ ] **Step 2:** Run both suites. Expect FAIL.
- [ ] **Step 3:** Implement. Progress uses the existing download-event channel. `wsl --install` is a separate, consented command (`enable_wsl`) that returns `NeedsReboot` when the machine needs one.
- [ ] **Step 4:** Rerun. Expect PASS.

### Task 3: Process plugin

**Files:**
- Create: the rest of `src-tauri/plugins/tauri-plugin-tensorrtllm/` (`lib.rs`, `commands.rs`, `process.rs`, `state.rs`, `cleanup.rs`, `error.rs`), following `tauri-plugin-mlx`
- Modify: `src-tauri/Cargo.toml` (optional dep + feature `tensorrt-llm`), `src-tauri/src/lib.rs` (init and cleanup, as the `mlx` feature does)

**Interfaces:**
- Produces Tauri commands: `get_tensorrt_llm_status() -> HostStatus`, `enable_tensorrt_llm_wsl() -> HostStatus`, `provision_tensorrt_llm_runtime()`, `load_tensorrt_llm_model(config: TrtllmConfig) -> SessionInfo`, `unload_tensorrt_llm_model(pid: i32)`, `get_tensorrt_llm_all_sessions() -> Vec<SessionInfo>`, `is_tensorrt_llm_process_running(pid)`, `get_tensorrt_llm_random_port() -> i32`, `cleanup_tensorrt_llm_processes()`, `remove_tensorrt_llm_runtime()`.
- `TrtllmConfig { model_path, model_id, port, tp_size: Option<u32>, gpu_ids: Option<Vec<u32>>, max_batch_size: Option<u32>, max_seq_len: Option<u32>, kv_cache_free_gpu_memory_fraction: Option<f32>, kv_cache_dtype: Option<KvDtype>, extra_config_yaml: Option<String>, extra_args: Vec<String>, env: HashMap<String,String> }`. Every optional field is `None` in the zero-config launch. `SessionInfo` has the MLX fields plus `host: HostKind`.

- [ ] **Step 1:** Failing tests: an all-`None` config launches with only model and port; the argument builder emits only flags present in the pinned docs; `kv_cache_dtype` outside `auto|fp8|nvfp4` is rejected; `tp_size` above detected GPUs returns a typed error naming both numbers; readiness waits on `/health` and times out with the stderr tail; on WSL2, `unload` and `cleanup` kill the Linux process inside the distro (not just `wsl.exe`); a held `wsl.exe` keeps the distro alive during a session.
- [ ] **Step 2:** `cd src-tauri && cargo test -p tauri-plugin-tensorrtllm`. Expect FAIL.
- [ ] **Step 3:** Implement against `RuntimeHost`, with the MLX plugin's reaper conventions so `process_reaper.rs` also ends the WSL-side process on exit. The server binds `127.0.0.1` inside the distro; Windows reaches it via localhost forwarding as verified in Task 0.
- [ ] **Step 4:** Rerun, `cargo clippy`, and `cargo check --features tensorrt-llm` on Windows and Linux targets. Expect PASS.

### Task 4: Proxy routing

**Files:**
- Modify: `src-tauri/src/core/server/proxy.rs` (`collect_served_models`, `is_local_backend`, the per-backend session lookups where `mlx_sessions` is threaded)
- Test: `src-tauri/src/core/server/tests.rs`

**Interfaces:**
- Consumes: the plugin's session map `Arc<Mutex<HashMap<i32, TrtllmBackendSession>>>`, threaded like `mlx_sessions`.
- Produces: backend tag and `owned_by` `"tensorrt-llm"`, counted by `is_local_backend`.

- [ ] **Step 1:** Failing tests: `/v1/models` lists a loaded TRT-LLM model; a chat request forwards to its port with its bearer token; a killed session returns a clean 502-class error; a model id on two providers routes deterministically.
- [ ] **Step 2:** `cd src-tauri && cargo test server::`. Expect FAIL.
- [ ] **Step 3:** Extend the existing match arms; do not restructure the proxy (rule 1).
- [ ] **Step 4:** Rerun. Expect PASS.

### Task 5: TS extension, model downloads inside the host, external-endpoint mode

**Files:**
- Create: `extensions/tensorrt-llm-extension/` (`package.json`, `settings.json`, `rolldown.config.mjs`, `src/index.ts`, `src/buildTrtllmConfig.ts`, `src/modelCatalog.ts`)
- Modify: root `package.json` `build:extensions:*` (the new extension builds on win32 and linux; macOS keeps excluding it, as for mlx); `extensions/package.json` workspace list
- Test: `src/buildTrtllmConfig.test.ts`, `src/modelCatalog.test.ts`

**Interfaces:**
- Consumes: Task 3 commands via `invoke`.
- Produces: `providerId = 'tensorrt-llm'` implementing the `LocalProvider` surface as `mlx-extension` does (`load`, `unload`, `list`, `getLoadedModels`, `isModelLoaded`); `buildTrtllmConfig(settings: TrtllmSettings, model: ModelRef, gpuCount: number) -> TrtllmConfig`, where empty `settings` yields the all-`None` config; `TrtllmSettings.endpoint?: string` selects external mode (an existing `trtllm-serve`, no managed process, no provisioning); `modelCatalog: CatalogModel[]` with `{ id, hfRepo, quant: 'bf16'|'int4-awq'|'int4-gptq'|'fp8'|'nvfp4', minComputeCapability, ggufTwin?: string }`.

- [ ] **Step 1:** Failing tests: empty settings give the default config; `tp_size` clamps to GPU count; `fp8`/`nvfp4` entries are filtered out on SM86; unknown settings are dropped; with `endpoint` set no provisioning or process command is issued; every catalog `ggufTwin` points at an id that exists in the GGUF catalog.
- [ ] **Step 2:** Run `yarn workspace <extension> vitest run`. Expect FAIL.
- [ ] **Step 3:** Implement. Hugging Face downloads run **inside the distro** with `huggingface_hub` into `RuntimeHost.storage_root()`, with progress parsed into the existing download events; nothing writes into the GGUF library and nothing is read from `/mnt/c`. Package name per Open Decision 3.
- [ ] **Step 4:** Rerun. Expect PASS.

---

## Phase 2 — The experience: zero-config, progressive settings, one home

### Task 6: Automatic engine resolution ("just works")

**Files:**
- Create: `web-app/src/lib/engineResolution.ts`
- Modify: the model-load entry point that today picks a provider from the selected model (find with `grep -rn "ensureRemoteProviderReady\|useModelProvider" web-app/src/hooks`)
- Test: `web-app/src/lib/__tests__/engineResolution.test.ts`

**Interfaces:**
- Consumes: Task 1 `Capability`, Task 2 `HostStatus`, Task 5 `modelCatalog`, any per-model user override.
- Produces: `resolveEngine(model: ModelRef, ctx: { capability: Capability; host: HostStatus; override?: ProviderId }) -> { engine: ProviderId; offer?: { kind: 'set_up_trtllm'; downloadBytes: number; needsAdmin: boolean; needsReboot: boolean } }`. Rules, in order: a user override wins; a GGUF-only model resolves to the llama.cpp default; a model with a TRT-LLM variant resolves to `tensorrt-llm` only when the capability is `Supported`, the host is `Ready`, and Task 0 measured it faster; otherwise it resolves to the existing default and returns an `offer` only when the capability is `Supported` or fixable (`wsl_missing`) and the host is not yet `Ready`.

- [ ] **Step 1:** Failing tests for each rule, including: GGUF-only on a perfect machine -> llama.cpp and no offer; macOS -> never an offer; `NotProvisioned` -> default engine plus one `offer` with byte size and `needsAdmin: false`; `NeedsWsl` -> offer with `needsAdmin: true` and the reboot flag; `Ready` and faster -> `tensorrt-llm`; override beats everything.
- [ ] **Step 2:** `yarn workspace @janhq/web-app vitest run src/lib/__tests__/engineResolution.test.ts`. Expect FAIL.
- [ ] **Step 3:** Implement as a pure function; the chat path calls it and never blocks on the offer. The offer shows as one dismissible inline prompt with size, any admin or reboot step, and "No thanks, don't ask again". Accepting runs `enable_tensorrt_llm_wsl` if needed, then `provision_tensorrt_llm_runtime` in the background.
- [ ] **Step 4:** Rerun. Expect PASS.

### Task 7: Settings grouping and the three tiers

**Files:**
- Modify: `web-app/src/lib/providerOrder.ts` (add `'tensorrt-llm'` to `PROVIDER_PRIORITY` beside the other local engines), `web-app/src/containers/SettingsMenu.tsx` (show the entry only when capability is `Supported` or fixable, as `mlx` is hidden off macOS), `web-app/src/routes/settings/providers/$providerName.tsx`
- Create: `web-app/src/containers/TensorrtLlmSettings.tsx` (Tier 1 status card and Tier 2 Advanced)
- Test: `web-app/src/lib/__tests__/providerOrder.test.ts`, `web-app/src/containers/__tests__/TensorrtLlmSettings.test.tsx`, `web-app/src/lib/__tests__/cloud-providers.test.ts`

**Interfaces:**
- Consumes: `TrtllmSettings` and `buildTrtllmConfig` (Task 5), `HostStatus` (Task 2).
- Produces: the provider registers with `persist: true`, so `isLocalEngineProvider` is true; it lists under Providers with the other runtimes and never on `/cloud`.
- Tiers: **Tier 0** no UI, defaults only. **Tier 1** a status card: `Ready | Needs WSL2 | Needs restart | Not set up | Unsupported (reason)`, version, one action button, a "works, not officially supported by NVIDIA on WSL2" note, and a link to Advanced. **Tier 2** a collapsed "Advanced" section: Managed vs External endpoint, GPU selection and `tp_size`, `max_batch_size`, `max_seq_len`, `kv_cache_free_gpu_memory_fraction`, `kv_cache_dtype`, extra YAML, extra args, environment variables, port override, runtime version pin, storage location and size, WSL memory cap (read-only with an "open .wslconfig guidance" action; never edited silently), remove runtime, and "Reset to defaults".

- [ ] **Step 1:** Failing tests: `sortProvidersForSettings` places `tensorrt-llm` among the local engines; `isLocalEngineProvider(tensorrt-llm)` is true and `isCloudProvider` false; on `Unsupported` (macOS) the menu has no entry; the card renders with Advanced collapsed and no inputs in the DOM by default; expanding shows every option; changing a value then "Reset to defaults" gives a `buildTrtllmConfig` identical to the empty-settings result.
- [ ] **Step 2:** Run the three Vitest files. Expect FAIL.
- [ ] **Step 3:** Implement. Follow the neighbouring provider settings page and the existing collapsible/accordion component; do not invent a new pattern. Strings go through i18n with `atomic` / Radium naming.
- [ ] **Step 4:** Rerun, then `make typecheck` and `yarn lint`. Expect PASS.

### Task 8: Remaining web-app wiring

**Files:**
- Modify: the files that special-case `'mlx'` today: `useModelProvider.ts`, `DropdownModelProvider.tsx`, `ModelSetting.tsx`, `ModelSupportStatus.tsx`, `constants/models.ts`, `types/analytics.ts`
- Test: the existing `__tests__` beside each

- [ ] **Step 1:** Failing tests: a loaded TRT-LLM model appears in the picker; per-model settings reuse Task 7's Advanced controls; GGUF-only models never list `tensorrt-llm` as a choice.
- [ ] **Step 2:** Run the affected Vitest files. Expect FAIL.
- [ ] **Step 3:** Implement with a single `isTrtllmProvider(id)` helper instead of repeated string compares. Telemetry names use `atomic` and pass `scripts/check-telemetry-props.mjs`.
- [ ] **Step 4:** Rerun, `make typecheck`, `yarn lint`. Expect PASS.

### Task 9: Build, installer and data-path changes

**Files:**
- Modify: `src-tauri/tauri.windows.conf.json`, `src-tauri/tauri.linux.conf.json`, `src-tauri/tauri.bundle.windows.nsis.template` (uninstaller offers to `wsl --unregister radium-trtllm`), `DEVELOP.md` (new data-folder row), `Makefile`, `package.json` build scripts

- [ ] **Step 1:** Windows and Linux builds enable feature `tensorrt-llm`; macOS does not. Nothing from TensorRT-LLM, CUDA or the rootfs is bundled in the installer.
- [ ] **Step 2:** `make verify`. Expect PASS on the platform-supported suites.
- [ ] **Step 3:** Manual run on the Windows 3090 desktop with a clean profile: pick a catalog model, confirm chat works at once on the standard engine, accept the one prompt, confirm the switch to TRT-LLM with no Settings visit, chat from OpenCode via `:1337/v1`, set `tp_size` 2 under Advanced, hit "Reset to defaults", quit Radium and confirm `nvidia-smi` shows freed memory and `wsl -l -v` shows the private distro stopped, then uninstall and confirm the distro is gone.

### Task 10: ADRs

**Files:**
- Create: `docs/decisions/2026-10-08-add-tensorrt-llm-as-nvidia-provider-via-wsl2.md`, a second for the host choice (private WSL2 distro vs Docker), a third for zero-config engine resolution and progressive settings; add all to `docs/decisions/INDEX.md` and bump its count.

- [ ] **Step 1:** Write the records (Context, Decision, Consequences, Links). Mention the provider in `AGENTS.md` §3 only if it fits the 300-line cap; otherwise link only.

---

## Open Decisions (yours, not mine)

1. **Host for the runtime on Windows. DECIDED (2026-10-09): a private WSL2 distro that Radium creates and owns.** No Docker, root inside the distro, one admin step only if WSL2 isn't enabled yet. Task 0 still measures Docker Desktop for comparison, but only to confirm the choice, not to reopen it.
2. **Dual-GPU on WSL2.** Issue 2864 reports `tp_size 2` failing on WSL2. If Task 0 confirms it on your 3090s, do you accept one model per GPU as the fallback?
3. **Naming.** AGENTS.md §4 forbids new `jan*` names but every extension is `@janhq/*`. Proposal: `@atomic/tensorrt-llm-extension` and crate `tauri-plugin-tensorrtllm`; needs your "ok" as new package names.
4. **Whether to do this at all.** Gate on Task 0: if decode speed on the 3090s is not clearly above `llamacpp-upstream`, stop.
5. **Consent for the download and the admin step.** "Just works" and a multi-GB distro plus a possible `wsl --install` and reboot pull against each other. Recommendation: chat never blocks, falls back to the standard engine, and asks once with size and admin/reboot disclosed. I advise against a silent install.
6. **Auto-prefer TRT-LLM?** Recommendation: only for catalog models where Task 0 measured a clear win, never for GGUF-only models, and a per-model override always wins.
7. **Rootfs source. DECIDED (2026-10-09): mirror Ubuntu 24.04 in `atomic-chat-conf`**, signed and sha256-pinned like the llama.cpp builds (ADR 2026-08-13). Task 2's resolver reads tag, URL and sha256 from the mirror, with Canonical as the fallback for an unmirrored version.

## Self-Review

- Coverage: platform gating, WSL2 host, no-GGUF model path, install details, process lifecycle, routing, zero-config resolution, progressive disclosure, grouped Settings entry, installer/uninstaller and data path, and ADRs each have a task. Vision, speculative decoding, embeddings and Agent mode are deliberately deferred.
- Types: `Capability`, `HostProbe`, `HostKind`, `HostStatus`, `RuntimeHost`, `CommandRunner`, `InstalledRuntime`, `TrtllmConfig`, `TrtllmSettings`, `buildTrtllmConfig`, `CatalogModel` and `resolveEngine` use the same names wherever they appear.
- Proportion: tasks give signatures, rules and test assertions, not bodies.
- Unverified: the exact flag spellings and pinned version come from live docs and are re-read at the pinned tag in Task 0. Whether WSL2 runs `tp_size 2` on 3090s, whether GPU filtering works, localhost forwarding in each networking mode, whether CUDA Toolkit and Open MPI are needed at serve time, and the Windows driver floor are exactly what Task 0 tests; none is asserted here. The existing `ModelSetting.tsx` has no Advanced section today, so Task 7 relies on the existing collapsible component.
