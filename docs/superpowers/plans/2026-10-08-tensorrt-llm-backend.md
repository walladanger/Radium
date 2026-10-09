# TensorRT-LLM backend for Radium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Radium users on NVIDIA Linux machines get TensorRT-LLM speed behind the existing `http://localhost:1337/v1` facade with no setup by default, while developers keep every knob.

**Architecture:** TensorRT-LLM is a Python/CUDA runtime, not a binary we can bundle like llama.cpp. A Phase 0 spike proves what it takes to install and run it without user effort. Phase 1 builds the runtime: a hardware probe, a pinned installer, a Rust process plugin, proxy routing and a TS extension, mirroring the MLX layout. Phase 2 builds the experience: automatic engine choice so the user never opens Settings, and progressive disclosure so the full option set exists but stays out of the way. The runtime lives in the same Settings list as every other local runtime.

**Tech Stack:** `trtllm-serve` (PyTorch backend, Apache-2.0), TypeScript extension, Rust Tauri plugin, React/Vite web-app.

**Spec:** None exists. This document is the spec and the plan. Decisions that need the user's sign-off are in Open Decisions.

## What TensorRT-LLM is, as verified on 2026-10-08/09

Sources: the repo README, the `trtllm-serve` docs, the support matrix and the Linux install page on nvidia.github.io/TensorRT-LLM; a third-party mirror of the CLI reference ([mintlify](https://www.mintlify.com/NVIDIA/TensorRT-LLM/cli/trtllm-serve)).

| Fact | Consequence for Radium |
| ---- | ---------------------- |
| "Requires Linux x86_64 or Linux aarch64". Windows, WSL and macOS are not listed. | Linux only. Windows/WSL2 is out of scope and must not be advertised. |
| Tested GPUs: Ampere (SM80/86), Ada (SM89), Hopper, Grace Hopper, Blackwell. "If a GPU architecture is not listed, the TensorRT-LLM team does not develop or test the software on [it]." Consumer GeForce is not named. | Gate on NVIDIA + compute capability >= 8.0. RTX 3090 (SM86) qualifies, with no FP8. GeForce is "works but unsupported by NVIDIA"; say so in Advanced. |
| **It does not run GGUF.** `trtllm-serve MODEL` takes a model name, a Hugging Face checkpoint path or a TensorRT engine path. GGUF is not mentioned anywhere; third-party summaries point GGUF users to llama.cpp. The default backend is PyTorch (`--backend` is deprecated; `tensorrt` and `_autodeploy` exist). | Needs its own Hugging Face model download like MLX. The existing GGUF library cannot be reused, so TRT models cost extra disk. A GGUF-only model is never routed here. |
| `trtllm-serve` exposes `/v1/models`, `/v1/chat/completions`, `/v1/completions`, `/v1/responses`, `/health`, `/metrics`, `/version`. | Standard OpenAI surface: the proxy forwards unchanged (AGENTS.md rule 3). `/health` is the readiness probe. |
| Flags: `--host --port --max_batch_size --max_seq_len --tp_size --kv_cache_free_gpu_memory_fraction --kv_cache_dtype (auto/fp8/nvfp4) --config <yaml>`. | These become the Advanced settings. Anything else goes through the YAML. Re-read the pinned release's docs; do not invent flags (rule 2). |
| Multimodal needs a `chat_template`, chat API only, and is incompatible with KV block reuse. | Vision is a later, separate task. |
| Speculative decoding exists (N-gram, MTP, others). | Not exposed until checked against the pinned release (AGENTS.md §3). |
| Version badge `1.4.0rc0`. Apache-2.0. | Pin a reviewed release, never `latest`. License is no bundling concern because we do not bundle it. |

**Install requirements (Linux page, tested on Ubuntu 24.04 with Python 3.12):**

| Step | Command / requirement | Catch |
| ---- | --------------------- | ----- |
| CUDA Toolkit | 13.1, with `CUDA_HOME` set | System-level install. A `cuda-compat-13-1` package "may be required" depending on the driver; **no minimum driver version is published**. |
| PyTorch | `pip3 install torch==2.10.0 torchvision --index-url https://download.pytorch.org/whl/cu130` | pip's default torch is a CUDA 12.8 build and will not match. On some systems (notably Ubuntu 22.04) installing `tensorrt_llm` silently swaps a CUDA 13.0 torch for a 12.8 one; NVIDIA's workaround is a constraints file pinning the current torch. |
| Open MPI | `sudo apt-get -y install libopenmpi-dev` | Needs root. `libzmq3-dev` is only for disaggregated serving, not needed. |
| Wheel | `pip3 install --ignore-installed pip setuptools wheel && pip3 install tensorrt_llm` | Downloads additional third-party open-source projects with their own licenses; review before shipping an installer. |
| Container alternative | NGC TensorRT LLM container | Needs Docker plus the NVIDIA container toolkit. Also the fix when the wheel clashes with NVIDIA's PyTorch 25.12 container. |

Consequence: a zero-effort install is **not guaranteed possible**. CUDA Toolkit and Open MPI are root-level system packages, the torch wheel is multi-GB, and the driver floor is unpublished. Task 0 decides whether a no-sudo, self-contained install exists (venv with pip-provided CUDA libraries and a non-apt MPI) or whether Radium can only offer a guided one-time step. Do not promise "just works" in the UI before Task 0 answers this.

The user's dual RTX 3090 desktop is Ampere SM86: supported, `--tp_size 2` applies, FP8 does not (use BF16 or INT4 AWQ/GPTQ checkpoints).

## Global Constraints

- New identifiers use `atomic` / `Radium`, never a new `jan*` name. Wiring into existing `@janhq/*` packages is fine (AGENTS.md §4).
- Provider id is `tensorrt-llm`. It is a new provider and is not folded into `llamacpp`, `llamacpp-upstream` or `mlx`.
- llama.cpp-only features stay guarded by provider identity: `-ctk/-ctv turbo*` never reaches `tensorrt-llm` and TensorRT-LLM flags never reach llama.cpp (AGENTS.md §3). Never widen one provider's hardware matrix from another's probe.
- `http://localhost:1337/v1` stays OpenAI-compatible; non-standard additions only.
- The release is pinned; tag, URL and sha256 live in one resolver script, never hardcoded in the extension (mirrors `scripts/resolve-upstream-backend.mjs`).
- **Zero-config by default.** A user with eligible hardware must be able to pick a model and chat without opening Settings, loading a runtime by hand or choosing an engine. Every default is chosen by Radium; no setting is required.
- **Progressive disclosure.** Three tiers, each reachable only when wanted: Tier 0 nothing to configure; Tier 1 a plain status card; Tier 2 a collapsed Advanced section with every option. Advanced values never alter behaviour until the user changes them, and a "Reset to defaults" restores Tier 0 behaviour exactly.
- **One home for runtimes.** TensorRT-LLM appears in Settings -> Providers' local-engine list beside llama.cpp, MLX and the others, not on the Cloud page and not as a separate settings page.
- Multi-GB downloads and anything needing root happen only after explicit consent, once.
- No new top-level folders, config files or runtime dependencies without the user's explicit "ok" (AGENTS.md rule 6). The new extension and plugin live under existing `extensions/` and `src-tauri/plugins/`; the package name and any new dependency still need the "ok".
- Record each non-trivial decision as an ADR in `docs/decisions/` plus an `INDEX.md` line, same session (rule 8).
- Do not commit unless asked (rule 5); commit steps below apply only when the user has asked for commits.
- Verify with `make verify` before finishing (rule 4).
- Agent mode is restricted to local llama.cpp providers (ADR 2026-07-24). `tensorrt-llm` stays out of Agent mode unless a new ADR says otherwise.

## Review Focus

- Mac or Windows user opens Providers: TensorRT-LLM must not appear. Linux with AMD/Intel or a pre-Ampere NVIDIA GPU: it must not appear or must show the real reason, never a crash on launch.
- A model that only exists as GGUF must never be routed to `tensorrt-llm`, and a TRT-LLM model must never be offered to the llama.cpp engines.
- First chat on eligible hardware with the runtime not installed: the chat works immediately on the standard engine, and the TRT-LLM offer is a single non-blocking prompt showing the download size, asked once.
- An Advanced value that is invalid or bricks launch (for example `tp_size` 2 on one GPU, or an oversized `max_seq_len`) must produce an actionable error and a one-click "Reset to defaults", never a stuck "loading" state.
- `trtllm-serve` unreachable or dying mid-chat: the proxy returns a clear error, not a hung stream, and the model list stops showing it as loaded.
- Port clash: Radium picks a free port; it never assumes `trtllm-serve`'s default.
- App quit or crash leaves no orphan `trtllm-serve` holding GPU memory.
- External-endpoint mode (a user-run `trtllm-serve`): URL typo or server down shows a connection error in the card, and does not disable the managed runtime.

---

## Phase 0 — Feasibility spike (no product code)

### Task 0: Prove the install and serve path on the 3090 desktop

**Files:**
- Create: `docs/decisions/2026-10-08-tensorrt-llm-spike-results.md` (from `_TEMPLATE.md`; add one line to `docs/decisions/INDEX.md`)

**Interfaces:**
- Produces: the pinned release, the chosen install mechanism, the minimum driver/CUDA, whether a no-sudo install exists, measured tokens/s vs `llamacpp-upstream`, and the model families worth offering. Later tasks read these values.

- [ ] **Step 1:** On a clean Ubuntu 24.04 user account, follow the install table above exactly and record commands, download size, time and disk use.
- [ ] **Step 2:** Try to remove each system prerequisite: run with only the NVIDIA driver plus pip-provided CUDA libraries in a venv (no system CUDA Toolkit, no `nvcc`), then with an MPI that is not apt-installed. Record which of CUDA Toolkit 13.1 and Open MPI are truly needed at serve time, and the lowest driver that works.
- [ ] **Step 3:** Run `trtllm-serve <hf-model> --port <free> --tp_size 1`, then `--tp_size 2`, with BF16 and INT4 checkpoints that fit the 3090s. Record time-to-first-token and decode tokens/s via `curl` on `/v1/chat/completions`, against `llamacpp-upstream` with a GGUF quant of similar bit width.
- [ ] **Step 4:** Confirm `/health` semantics (200 only when the model is ready) and what stderr shows on OOM and on an unsupported GPU.
- [ ] **Step 5:** Write the ADR with a go/no-go for Phase 1. No-go if it is not meaningfully faster or cannot be installed with at most one consented root step. Stop on no-go.

---

## Phase 1 — The runtime (gated on Task 0 go)

Mirrors the MLX layout: a Rust plugin owns the process, a TS extension owns settings and models, the proxy routes.

### Task 1: Capability probe

**Files:**
- Modify: `src-tauri/plugins/tauri-plugin-hardware/` (add `tensorrt_llm_capability`), plus a web-app hook that reads it
- Test: Rust unit tests in the plugin; Vitest for the hook

**Interfaces:**
- Produces: `fn tensorrt_llm_capability(profile: &HardwareProfile) -> Capability` where `Capability = Supported { gpu_count: u32 } | Unsupported(reason)`. Reasons: `"not_linux"`, `"no_nvidia_gpu"`, `"compute_capability_below_8_0"`, `"driver_too_old"` (floor from Task 0).

- [ ] **Step 1:** Failing tests per reason with fixture profiles: two SM86 cards is `Supported { gpu_count: 2 }`; macOS, AMD-only, Turing, and Linux with an old driver are each `Unsupported` with the matching reason.
- [ ] **Step 2:** `cd src-tauri && cargo test -p tauri-plugin-hardware tensorrt`. Expect FAIL.
- [ ] **Step 3:** Implement from the existing NVIDIA probe data; no new probe path. The result is never reused for llama.cpp selection.
- [ ] **Step 4:** Rerun, then `cargo clippy` in `src-tauri/`. Expect PASS.

### Task 2: Pinned runtime resolver and installer

**Files:**
- Create: `scripts/resolve-tensorrt-llm-release.mjs`
- Create: `src-tauri/plugins/tauri-plugin-tensorrtllm/src/install.rs`
- Test: `scripts/` vitest; Rust tests for checksum, version and preflight

**Interfaces:**
- Consumes: install mechanism and prerequisites from Task 0.
- Produces: `preflight() -> Preflight { ready: bool, missing: Vec<Prerequisite>, download_bytes: u64 }` where `Prerequisite` is e.g. `CudaToolkit`, `OpenMpi`, `Driver { have, need }`; `install_runtime(app, on_progress) -> Result<InstalledRuntime>`; `InstalledRuntime { version: String, bin_path: PathBuf }` stored under `<data_folder>/tensorrt-llm/` (no new data path invented; follow `DEVELOP.md`).

- [ ] **Step 1:** Failing tests: the resolver emits the pinned tag and sha256 and refuses `latest`; `preflight` reports each missing prerequisite and the download size; the installer rejects a checksum mismatch and leaves no partial install; torch is pinned by constraints file so `tensorrt_llm` can never swap it (the 22.04 caveat).
- [ ] **Step 2:** Run both suites. Expect FAIL.
- [ ] **Step 3:** Implement into an isolated venv (or container, per Task 0) so Radium never touches system Python. Anything needing root is surfaced as a `missing` prerequisite with the exact command, never run silently. Progress uses the existing download-event channel.
- [ ] **Step 4:** Rerun. Expect PASS.

### Task 3: Process plugin

**Files:**
- Create: `src-tauri/plugins/tauri-plugin-tensorrtllm/` (copy the `tauri-plugin-mlx` layout: `lib.rs`, `commands.rs`, `process.rs`, `state.rs`, `cleanup.rs`, `error.rs`)
- Modify: `src-tauri/Cargo.toml` (optional dep + feature `tensorrt-llm`), `src-tauri/src/lib.rs` (init and cleanup, as the `mlx` feature does)

**Interfaces:**
- Produces Tauri commands: `load_tensorrt_llm_model(config: TrtllmConfig) -> SessionInfo`, `unload_tensorrt_llm_model(pid: i32)`, `get_tensorrt_llm_all_sessions() -> Vec<SessionInfo>`, `is_tensorrt_llm_process_running(pid)`, `get_tensorrt_llm_random_port() -> i32`, `cleanup_tensorrt_llm_processes()`.
- `TrtllmConfig { model_path, model_id, port, tp_size: Option<u32>, max_batch_size: Option<u32>, max_seq_len: Option<u32>, kv_cache_free_gpu_memory_fraction: Option<f32>, kv_cache_dtype: Option<KvDtype>, extra_config_yaml: Option<String>, extra_args: Vec<String>, env: HashMap<String,String> }`. Every field is optional so an all-`None` config is the zero-config launch. `SessionInfo` matches the MLX one.

- [ ] **Step 1:** Failing tests: an all-`None` config launches with only model and port; the argument builder emits only flags present in the pinned docs; `kv_cache_dtype` outside `auto|fp8|nvfp4` is rejected; `tp_size` above detected GPUs returns a typed error naming both numbers; readiness waits on `/health` and times out with the stderr tail.
- [ ] **Step 2:** `cd src-tauri && cargo test -p tauri-plugin-tensorrtllm`. Expect FAIL.
- [ ] **Step 3:** Implement with the MLX plugin's process-group and reaper conventions so `process_reaper.rs` kills children on exit.
- [ ] **Step 4:** Rerun, `cargo clippy`, and `cargo check --features tensorrt-llm`. Expect PASS.

### Task 4: Proxy routing

**Files:**
- Modify: `src-tauri/src/core/server/proxy.rs` (`collect_served_models`, `is_local_backend`, per-backend session lookups where `mlx_sessions` is threaded)
- Test: `src-tauri/src/core/server/tests.rs`

**Interfaces:**
- Consumes: the plugin's session map `Arc<Mutex<HashMap<i32, TrtllmBackendSession>>>`, threaded like `mlx_sessions`.
- Produces: backend tag and `owned_by` `"tensorrt-llm"`, counted by `is_local_backend`.

- [ ] **Step 1:** Failing tests: `/v1/models` lists a loaded TRT-LLM model; a chat request forwards to its port with its bearer token; a killed session returns a clean 502-class error; a model id on two providers routes deterministically.
- [ ] **Step 2:** `cd src-tauri && cargo test server::`. Expect FAIL.
- [ ] **Step 3:** Extend the existing match arms; do not restructure the proxy (rule 1).
- [ ] **Step 4:** Rerun. Expect PASS.

### Task 5: TS extension, Hugging Face models, external-endpoint mode

**Files:**
- Create: `extensions/tensorrt-llm-extension/` (`package.json`, `settings.json`, `rolldown.config.mjs`, `src/index.ts`, `src/buildTrtllmConfig.ts`, `src/modelCatalog.ts`)
- Modify: root `package.json` `build:extensions:*` exclusions so macOS/Windows skip it, as for mlx; `extensions/package.json` workspace list
- Test: `src/buildTrtllmConfig.test.ts`, `src/modelCatalog.test.ts`

**Interfaces:**
- Consumes: Task 3 commands via `invoke`.
- Produces: `providerId = 'tensorrt-llm'` implementing the `LocalProvider` surface as `mlx-extension` does (`load`, `unload`, `list`, `getLoadedModels`, `isModelLoaded`); `buildTrtllmConfig(settings: TrtllmSettings, model: ModelRef, gpuCount: number) -> TrtllmConfig`, where an empty `settings` yields the all-`None` config; `TrtllmSettings.endpoint?: string` selects external mode (talk to an existing `trtllm-serve`, no managed process, no install); `modelCatalog: CatalogModel[]` with `{ id, hfRepo, quant: 'bf16'|'int4-awq'|'int4-gptq'|'fp8'|'nvfp4', minComputeCapability, ggufTwin?: string }`.

- [ ] **Step 1:** Failing tests: empty settings give the default config; `tp_size` clamps to GPU count; `fp8`/`nvfp4` entries are filtered out on SM86; unknown settings are dropped; with `endpoint` set no install or process command is issued; every catalog entry with a `ggufTwin` points at an id that exists in the GGUF catalog.
- [ ] **Step 2:** Run `yarn workspace <extension> vitest run`. Expect FAIL.
- [ ] **Step 3:** Implement. Downloads reuse the MLX Hugging Face download path into a TRT-LLM models folder under the data folder; nothing writes into the GGUF library. Package name per Open Decision 3.
- [ ] **Step 4:** Rerun. Expect PASS.

---

## Phase 2 — The experience: zero-config, progressive settings, one home

### Task 6: Automatic engine resolution ("just works")

**Files:**
- Create: `web-app/src/lib/engineResolution.ts`
- Modify: the model-load entry point that today picks a provider from the selected model (find with `grep -rn "ensureRemoteProviderReady\|useModelProvider" web-app/src/hooks`)
- Test: `web-app/src/lib/__tests__/engineResolution.test.ts`

**Interfaces:**
- Consumes: Task 1 capability, Task 2 `preflight`, Task 5 `modelCatalog`, per-model user override if any.
- Produces: `resolveEngine(model: ModelRef, ctx: { capability: Capability; runtime: 'installed'|'missing'|'unsupported'; override?: ProviderId }) -> { engine: ProviderId; offer?: { kind: 'install_trtllm'; downloadBytes: number } }`. Rules, in order: a user override wins; a GGUF-only model resolves to the llama.cpp default; a model with a TRT-LLM variant resolves to `tensorrt-llm` only when the capability is `Supported`, the runtime is `installed`, and Task 0 measured it faster; otherwise it resolves to the existing default and returns an `offer` only when the runtime is `missing` and the capability is `Supported`.

- [ ] **Step 1:** Failing tests for each rule, including: GGUF-only on a perfect machine -> llama.cpp and no offer; macOS -> never an offer; `missing` runtime -> default engine plus one `offer` with the byte size; `installed` and faster -> `tensorrt-llm`; override beats everything.
- [ ] **Step 2:** `yarn workspace @janhq/web-app vitest run src/lib/__tests__/engineResolution.test.ts`. Expect FAIL.
- [ ] **Step 3:** Implement as a pure function; the chat path calls it and never blocks on the offer. The offer shows as one dismissible inline prompt with size and a "No thanks, don't ask again"; accepting runs Task 2's installer in the background (consent covers the download and, if `preflight.missing` has a root step, shows the exact command once).
- [ ] **Step 4:** Rerun. Expect PASS.

### Task 7: Settings grouping and the three tiers

**Files:**
- Modify: `web-app/src/lib/providerOrder.ts` (add `'tensorrt-llm'` to `PROVIDER_PRIORITY` beside the other local engines), `web-app/src/containers/SettingsMenu.tsx` (hide the entry unless capability is `Supported`, as `mlx` is hidden off macOS), `web-app/src/routes/settings/providers/$providerName.tsx`
- Create: `web-app/src/containers/TensorrtLlmSettings.tsx` (Tier 1 status card and Tier 2 Advanced)
- Test: `web-app/src/lib/__tests__/providerOrder.test.ts`, `web-app/src/containers/__tests__/TensorrtLlmSettings.test.tsx`, `web-app/src/lib/__tests__/cloud-providers.test.ts`

**Interfaces:**
- Consumes: `TrtllmSettings` and `buildTrtllmConfig` (Task 5), `preflight` (Task 2).
- Produces: the provider registers with `persist: true`, so `isLocalEngineProvider` is true and it lists under Providers with the other runtimes and never on `/cloud`.
- Tiers: **Tier 0** is no UI, defaults only. **Tier 1** is a status card: `Ready | Not installed | Needs setup | Unsupported (reason)`, version, one action button, and a link to the Advanced section. **Tier 2** is a collapsed "Advanced" section: Managed vs External endpoint, `tp_size`, `max_batch_size`, `max_seq_len`, `kv_cache_free_gpu_memory_fraction`, `kv_cache_dtype`, extra YAML, extra args, environment variables, port override, runtime version pin and install location, and "Reset to defaults".

- [ ] **Step 1:** Failing tests: `sortProvidersForSettings` places `tensorrt-llm` among the local engines; `isLocalEngineProvider(tensorrt-llm)` is true and `isCloudProvider` false; on `Unsupported` the menu has no entry; the card renders with Advanced collapsed and no inputs in the DOM by default; expanding shows every option; changing a value then "Reset to defaults" gives a `buildTrtllmConfig` identical to the empty-settings result.
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

### Task 9: Platform build gating

**Files:**
- Modify: `src-tauri/tauri.linux.conf.json`, `Makefile`, `package.json` build scripts

- [ ] **Step 1:** The Linux build enables feature `tensorrt-llm`; macOS and Windows builds do not compile it. The runtime itself is never bundled in the AppImage.
- [ ] **Step 2:** `make verify`. Expect PASS on the platform-supported suites.
- [ ] **Step 3:** Manual run on the 3090 desktop: fresh profile, pick a catalog model, confirm chat works at once on the standard engine, accept the one prompt, confirm the switch to TRT-LLM with no Settings visit, chat from OpenCode via `:1337/v1`, set `tp_size` 2 under Advanced, hit "Reset to defaults", quit Radium and confirm `nvidia-smi` shows freed memory.

### Task 10: ADRs

**Files:**
- Create: `docs/decisions/2026-10-08-add-tensorrt-llm-as-linux-nvidia-provider.md`, a second for the install mechanism, a third for zero-config engine resolution and progressive settings; add all to `docs/decisions/INDEX.md` and bump its count.

- [ ] **Step 1:** Write the records (Context, Decision, Consequences, Links). Mention the provider in `AGENTS.md` §3 only if it fits the 300-line cap; otherwise link only.

---

## Open Decisions (yours, not mine)

1. **Install mechanism.** (a) Managed venv with the pip wheel: lighter, but needs CUDA Toolkit 13.1 and Open MPI unless Task 0 shows they are avoidable. (b) NGC container: no host toolchain, but requires Docker plus the NVIDIA container toolkit. (c) Don't ship an installer, only the External-endpoint mode. Recommendation: let Task 0 decide; if it shows no-sudo works, (a).
2. **Windows via WSL2.** Not an officially listed platform. Recommend excluding in v1.
3. **Naming.** AGENTS.md §4 forbids new `jan*` names but every extension is `@janhq/*`. Proposal: `@atomic/tensorrt-llm-extension` and crate `tauri-plugin-tensorrtllm`; needs your "ok" as new package names.
4. **Whether to do this at all.** Gate on Task 0: if decode speed on the 3090s is not clearly above `llamacpp-upstream` for your models, stop.
5. **Consent for the download.** "Just works" and a multi-GB install (plus a possible root step) pull against each other. Recommendation: Radium never blocks chat, falls back to the standard engine, and asks once with the size shown. Alternative is a silent background install, which I advise against because of disk use and the root step.
6. **Auto-prefer TRT-LLM?** Recommendation: only for catalog models where Task 0 measured a clear win, never for GGUF-only models, and a per-model override always wins.

## Self-Review

- Coverage: platform gating, no-GGUF model path, install details, process lifecycle, routing, zero-config resolution, progressive disclosure, grouped Settings entry, packaging and ADRs each have a task. Vision, speculative decoding, embeddings and Agent mode are deliberately deferred.
- Types: `Capability`, `Preflight`, `InstalledRuntime`, `TrtllmConfig`, `TrtllmSettings`, `buildTrtllmConfig`, `CatalogModel` and `resolveEngine` use the same names wherever they appear.
- Proportion: Phase 2 tasks are signatures, rules and test assertions, not bodies.
- Unverified: exact flag spellings and the pinned version come from live docs and are re-read at the pinned tag in Task 0. The CUDA Toolkit, Open MPI and driver floor requirements are as the install page states them; whether they are needed at serve time is exactly what Task 0 step 2 tests. The existing `ModelSetting.tsx` has no Advanced section today, so Task 7 relies on the existing collapsible component rather than a known pattern.
