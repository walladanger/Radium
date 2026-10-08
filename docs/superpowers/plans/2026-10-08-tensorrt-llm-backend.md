# TensorRT-LLM backend for Radium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Radium users on NVIDIA Linux machines serve models through [NVIDIA/TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM) (`trtllm-serve`) behind the existing `http://localhost:1337/v1` facade.

**Architecture:** TensorRT-LLM is a Python/CUDA runtime, not a binary we can bundle like llama.cpp. So it is staged in three phases, each shippable alone. Phase 0 is a spike that proves the facts below on real hardware. Phase 1 connects to a `trtllm-serve` the user already runs, using the existing remote-provider path (no Rust, no new extension). Phase 2 is a first-class `tensorrt-llm` local provider that Radium launches and stops itself, modelled on the MLX plugin. Phase 2 only starts if Phase 0 and Phase 1 show it is worth the maintenance.

**Tech Stack:** `trtllm-serve` (PyTorch backend, Apache-2.0), TypeScript extension, Rust Tauri plugin (Phase 2), React/Vite web-app.

**Spec:** None exists. This document is the spec and the plan. Decisions below need the user's sign-off before Phase 2 (see Open Decisions).

## What TensorRT-LLM is, as verified on 2026-10-08

Sources: the repo README, the `trtllm-serve` docs and the support matrix on nvidia.github.io/TensorRT-LLM.

| Fact | Consequence for Radium |
| ---- | ---------------------- |
| "Requires Linux x86_64 or Linux aarch64". Windows, WSL and macOS are not listed. | Linux only. Windows/WSL2 is out of scope and must not be advertised. |
| Tested GPUs: Ampere (SM80/86), Ada (SM89), Hopper, Grace Hopper, Blackwell. "If a GPU architecture is not listed, the TensorRT-LLM team does not develop or test the software on [it]." Consumer GeForce is not named. | Gate on NVIDIA + compute capability >= 8.0. RTX 3090 (SM86) qualifies, with no FP8. GeForce is "works but unsupported by NVIDIA"; say so in the UI. |
| Loads Hugging Face checkpoints on the PyTorch backend (default; `--backend` is deprecated). GGUF is not mentioned anywhere. | Needs an HF-checkpoint model path like MLX, not the GGUF library. |
| `trtllm-serve` exposes `/v1/models`, `/v1/chat/completions`, `/v1/completions`, `/v1/responses`, `/health`, `/metrics`, `/version`. | Standard OpenAI surface: the existing proxy can forward to it unchanged (AGENTS.md rule 3). `/health` is the readiness probe. |
| Flags: `--host --port --max_batch_size --max_seq_len --tp_size --kv_cache_free_gpu_memory_fraction --kv_cache_dtype (auto/fp8/nvfp4) --config <yaml>`. | Settings map onto these; anything else goes through the YAML. Do not invent flags (rule 2); read the pinned release's docs. |
| Multimodal needs a `chat_template` and chat API only; incompatible with KV block reuse. | Vision models are a later, separate task. |
| Speculative decoding exists (N-gram, MTP, others). | Do not expose until checked against the pinned release (AGENTS.md §3 says no unverified spec flags). |
| Repo badge shows `1.4.0rc0`. | The pin is a reviewed release, never `latest`. |
| License Apache-2.0. | Compatible; no bundling concern because we do not bundle it. |

The user's dual RTX 3090 desktop is Ampere SM86: supported, `--tp_size 2` applies, FP8 does not.

## Global Constraints

- New identifiers use `atomic` / `Radium`, never a new `jan*` name. Wiring into existing `@janhq/*` packages is fine (AGENTS.md §4).
- Provider id is `tensorrt-llm`. It is a new provider and must not be folded into `llamacpp`, `llamacpp-upstream` or `mlx`.
- llama.cpp-only features stay guarded by provider identity: `-ctk/-ctv turbo*` never reaches `tensorrt-llm` and TensorRT-LLM flags never reach llama.cpp (AGENTS.md §3).
- `http://localhost:1337/v1` stays OpenAI-compatible; non-standard additions only.
- Never widen another provider's hardware matrix from this probe or the reverse.
- The release is pinned; tag, URL and sha256 are recorded in one resolver script, never hardcoded in the extension (mirrors `scripts/resolve-upstream-backend.mjs`).
- No new top-level folders, config files or runtime dependencies without the user's explicit "ok" (AGENTS.md rule 6). The new extension and plugin live under the existing `extensions/` and `src-tauri/plugins/`; the name and any new dependency still need the "ok".
- Record each non-trivial decision as an ADR in `docs/decisions/` plus an `INDEX.md` line, same session (rule 8).
- Do not commit unless asked (rule 5). Commit steps below apply only when the user has asked for commits.
- Verify with `make verify` before finishing (rule 4).
- Agent mode is restricted to local llama.cpp providers (ADR 2026-07-24). `tensorrt-llm` stays out of Agent mode unless a new ADR says otherwise.

## Review Focus

- Mac or Windows user opens Providers: TensorRT-LLM must not appear, or must appear disabled with the reason "Linux with an NVIDIA GPU required". It must never offer an install that cannot work.
- Linux box with AMD/Intel GPU or an NVIDIA GPU below SM80 (Turing/Pascal): provider unavailable with the real reason, not a crash on launch.
- `trtllm-serve` not running or dies mid-chat: the user gets a clear "server unreachable" error from the proxy, not a hung stream; the model list does not keep showing it as loaded.
- Model id collision: a model named the same on `llamacpp` and `tensorrt-llm` must route deterministically (the proxy's session lookup order).
- Port clash: `trtllm-serve` default port against 1337 and other local servers; Radium must pick a free port, not assume one.
- Launch with `--tp_size 2` on a single-GPU machine, and a model larger than VRAM: fail with an actionable message, not a stuck "loading".
- App quit or crash: no orphan `trtllm-serve` process holding GPU memory (the MLX plugin has `cleanup_mlx_processes`; this needs the same).

---

## Phase 0 — Feasibility spike (no product code)

### Task 0: Prove the serve path on the 3090 desktop

**Files:**
- Create: `docs/decisions/2026-10-08-tensorrt-llm-spike-results.md` (from `_TEMPLATE.md`; add one line to `docs/decisions/INDEX.md`)

**Interfaces:**
- Produces: the pinned release string, the chosen install mechanism, measured tokens/s vs `llamacpp-upstream` on the same model, and the minimum driver/CUDA versions. Later tasks read these values.

- [ ] **Step 1:** On the Linux desktop, install the pinned release by the official pip route and, separately, the NGC container route. Record exact commands, disk size, install time and required driver/CUDA.
- [ ] **Step 2:** Run `trtllm-serve <hf-model> --port <free> --tp_size 1` with a model that fits one 3090, then with `--tp_size 2`. Record time-to-first-token and decode tokens/s through `curl` on `/v1/chat/completions`, and the same model/quant on `llamacpp-upstream`.
- [ ] **Step 3:** Confirm `/health` semantics (does it return 200 only after the model is ready) and what stderr looks like on OOM and on an unsupported GPU.
- [ ] **Step 4:** Write the ADR with a go/no-go. No-go if TensorRT-LLM is not meaningfully faster or cannot be installed without Docker/root. Stop here on no-go.

---

## Phase 1 — Connect to a user-run `trtllm-serve` (no Rust, no new extension)

Value on day one: any NVIDIA Linux user who already runs `trtllm-serve` can chat with it in Radium.

### Task 1: TensorRT-LLM remote-provider preset

**Files:**
- Modify: `web-app/src/constants/providers.ts` (add a predefined OpenAI-compatible provider)
- Test: `web-app/src/constants/__tests__/providers.test.ts`

**Interfaces:**
- Produces: a provider entry with `provider: 'tensorrt-llm-server'`, `base_url: 'http://localhost:8000/v1'`, no API key required. The id differs from the Phase 2 local provider id `tensorrt-llm` on purpose, so Phase 2 can replace the preset without a settings migration clash.

- [ ] **Step 1:** Write the failing test: the preset exists, its `base_url` is `http://localhost:8000/v1`, and an API key is not required.
- [ ] **Step 2:** Run `yarn workspace @janhq/web-app vitest run src/constants/__tests__/providers.test.ts`. Expect FAIL.
- [ ] **Step 3:** Add the preset following the shape of the neighbouring OpenAI-compatible entries. Hide it on non-Linux by the same platform check other platform-gated providers use.
- [ ] **Step 4:** Rerun the test. Expect PASS.

### Task 2: Launch-page / docs guidance

**Files:**
- Modify: `README.md` (one short section) or `DEVELOP.md`; do not add a new doc folder.

- [ ] **Step 1:** Document the supported-platform line, the one-line `trtllm-serve` start command from the pinned release, and "GeForce is untested by NVIDIA".
- [ ] **Step 2:** Run `make verify-fast`. Expect PASS.

Phase 1 ends with a go/no-go on Phase 2 informed by whether anyone uses it.

---

## Phase 2 — First-class `tensorrt-llm` provider (gated on Task 0 go and the Open Decisions)

Mirror the MLX layout exactly so reviewers recognise it: a Rust plugin that owns the process, a TS extension that owns settings and model discovery, the proxy routing, and web-app wiring.

### Task 3: Capability probe

**Files:**
- Modify: `src-tauri/plugins/tauri-plugin-hardware/` (add `tensorrt_llm_supported`), `web-app/src/hooks/` consumer
- Test: Rust unit test in the plugin; Vitest for the hook

**Interfaces:**
- Produces: `fn tensorrt_llm_capability() -> Capability { Supported | Unsupported(reason: &'static str) }`. Reasons: `"not_linux"`, `"no_nvidia_gpu"`, `"compute_capability_below_8_0"`, `"driver_too_old"`.

- [ ] **Step 1:** Write failing tests for each reason using fixture hardware profiles (an SM86 pair is `Supported`; macOS, AMD-only, Turing, and Linux-with-old-driver are each `Unsupported` with the matching reason).
- [ ] **Step 2:** Run `cd src-tauri && cargo test -p tauri-plugin-hardware tensorrt`. Expect FAIL.
- [ ] **Step 3:** Implement from the existing NVIDIA probe data; do not add a new probe path. Never reuse this result for llama.cpp selection.
- [ ] **Step 4:** Rerun. Expect PASS. Run `cargo clippy` in `src-tauri/`.

### Task 4: Pinned runtime resolver and installer

**Files:**
- Create: `scripts/resolve-tensorrt-llm-release.mjs`
- Create: `src-tauri/plugins/tauri-plugin-tensorrtllm/src/install.rs`
- Test: `scripts/` vitest, plus Rust tests for sha256 and version checks

**Interfaces:**
- Consumes: the install mechanism chosen in Task 0 / Open Decision 1.
- Produces: `install_runtime(app, on_progress) -> Result<InstalledRuntime>` and `InstalledRuntime { version: String, bin_path: PathBuf }` stored under `<data_folder>/tensorrt-llm/` (no new data path invented; follow `DEVELOP.md`).

- [ ] **Step 1:** Failing tests: resolver outputs the pinned tag and sha256 and refuses an unpinned or `latest` request; installer rejects a mismatched checksum and leaves no partial install.
- [ ] **Step 2:** Run both suites. Expect FAIL.
- [ ] **Step 3:** Implement. Install into an isolated venv (or container, per decision) so Radium never touches the system Python. Progress goes through the same download-event channel the other backends use.
- [ ] **Step 4:** Rerun. Expect PASS.

### Task 5: Process plugin

**Files:**
- Create: `src-tauri/plugins/tauri-plugin-tensorrtllm/` (copy the `tauri-plugin-mlx` layout: `lib.rs`, `commands.rs`, `process.rs`, `state.rs`, `cleanup.rs`, `error.rs`)
- Modify: `src-tauri/Cargo.toml` (optional dep + feature `tensorrt-llm`), `src-tauri/src/lib.rs` (init and cleanup, as the `mlx` feature does at lines 90 and 839)

**Interfaces:**
- Produces Tauri commands: `load_tensorrt_llm_model(config: TrtllmConfig) -> SessionInfo`, `unload_tensorrt_llm_model(pid: i32)`, `get_tensorrt_llm_all_sessions() -> Vec<SessionInfo>`, `is_tensorrt_llm_process_running(pid)`, `get_tensorrt_llm_random_port() -> i32`, `cleanup_tensorrt_llm_processes()`.
- `TrtllmConfig { model_path, model_id, port, tp_size, max_batch_size, max_seq_len, kv_cache_free_gpu_memory_fraction, kv_cache_dtype, extra_config_yaml }`. `SessionInfo` has the same fields as the MLX one (`pid, port, model_id, model_path, is_embedding, api_key`).

- [ ] **Step 1:** Failing tests: argument builder emits only the flags in the pinned docs; `kv_cache_dtype` outside `auto|fp8|nvfp4` is rejected; `tp_size` greater than detected GPUs returns a typed error; readiness waits on `/health` and times out with the process's stderr tail.
- [ ] **Step 2:** `cd src-tauri && cargo test -p tauri-plugin-tensorrtllm`. Expect FAIL.
- [ ] **Step 3:** Implement against the MLX plugin's process-group and reaper conventions so `process_reaper.rs` kills children on exit.
- [ ] **Step 4:** Rerun tests, `cargo clippy`, and `cargo check --features tensorrt-llm`. Expect PASS.

### Task 6: Proxy routing

**Files:**
- Modify: `src-tauri/src/core/server/proxy.rs` (`collect_served_models`, `is_local_backend`, the per-backend session lookups near lines 1088–1150 and 1285–1436)
- Test: `src-tauri/src/core/server/tests.rs`

**Interfaces:**
- Consumes: the plugin's session map (`Arc<Mutex<HashMap<i32, TrtllmBackendSession>>>`), threaded through like `mlx_sessions`.
- Produces: backend tag `"tensorrt-llm"`, `owned_by` `"tensorrt-llm"`, counted by `is_local_backend`.

- [ ] **Step 1:** Failing tests: `/v1/models` lists a loaded TRT-LLM model; a chat request for it forwards to its port with its bearer token; killing the session returns a clean 502-class error; a model id present on two providers routes deterministically.
- [ ] **Step 2:** `cd src-tauri && cargo test server::`. Expect FAIL.
- [ ] **Step 3:** Implement by extending the existing match arms; do not restructure the proxy (rule 1).
- [ ] **Step 4:** Rerun. Expect PASS.

### Task 7: TS extension

**Files:**
- Create: `extensions/tensorrt-llm-extension/` (`package.json`, `settings.json`, `rolldown.config.mjs`, `src/index.ts`, `src/buildTrtllmConfig.ts`)
- Modify: root `package.json` `build:extensions:*` exclusions so macOS/Windows builds skip it, as they do for mlx; `extensions/package.json` workspace list
- Test: `extensions/tensorrt-llm-extension/src/buildTrtllmConfig.test.ts`

**Interfaces:**
- Consumes: Task 5 commands via `invoke`.
- Produces: an extension with `providerId = 'tensorrt-llm'` implementing the same `LocalProvider` surface as `mlx-extension`: `load`, `unload`, `list`, `getLoadedModels`, `isModelLoaded`, plus `buildTrtllmConfig(settings, model, gpuCount) -> TrtllmConfig`.

- [ ] **Step 1:** Failing tests mirroring `buildMlxConfig.test.ts`: defaults, `tp_size` clamped to GPU count, FP8 KV cache refused on SM86, unknown settings dropped.
- [ ] **Step 2:** `yarn workspace <extension> vitest run`. Expect FAIL.
- [ ] **Step 3:** Implement. Package name needs the user's decision (Open Decision 3). Models come from an HF-checkpoint downloader reusing the MLX download path; no GGUF.
- [ ] **Step 4:** Rerun. Expect PASS.

### Task 8: Web-app wiring

**Files:**
- Modify: `web-app/src/hooks/useModelProvider.ts`, `web-app/src/containers/DropdownModelProvider.tsx`, `ModelSetting.tsx`, `SettingsMenu.tsx`, `ModelSupportStatus.tsx`, `constants/models.ts`, `types/analytics.ts` (the same set that special-cases `'mlx'` today)
- Test: the existing `__tests__` beside each

**Interfaces:**
- Consumes: Task 3 capability, Task 7 extension.
- Produces: provider appears only when `Supported`; when `Unsupported(reason)` the settings page shows the reason string and no install button.

- [ ] **Step 1:** Failing tests for each Review Focus platform/GPU case (hidden or disabled with reason) and for model-list rendering with a loaded TRT-LLM session.
- [ ] **Step 2:** Run the affected Vitest files. Expect FAIL.
- [ ] **Step 3:** Implement with a single `isTrtllmProvider(id)` helper rather than repeating string compares. Telemetry events use `atomic` names and pass `scripts/check-telemetry-props.mjs`.
- [ ] **Step 4:** Rerun, then `make typecheck` and `yarn lint`. Expect PASS.

### Task 9: Platform build gating and release

**Files:**
- Modify: `src-tauri/tauri.linux.conf.json`, `Makefile`, `package.json` build scripts

- [ ] **Step 1:** Ensure the Linux build enables feature `tensorrt-llm`; macOS and Windows builds do not compile it. The runtime itself is never bundled in the AppImage.
- [ ] **Step 2:** `make verify`. Expect PASS on the platform-supported suites.
- [ ] **Step 3:** Manual check on the 3090 desktop: install, load a model with `tp_size` 1 and 2, chat through `:1337/v1` from OpenCode, kill Radium and confirm no `trtllm-serve` survives (`nvidia-smi` shows freed memory).

### Task 10: ADRs

**Files:**
- Create: `docs/decisions/2026-10-08-add-tensorrt-llm-as-linux-nvidia-provider.md` and a second for install mechanism; add both to `docs/decisions/INDEX.md` and bump its count.

- [ ] **Step 1:** Write the records (Context, Decision, Consequences, Links). One mention of the new provider in `AGENTS.md` §3 only if it fits the 300-line cap; otherwise link only.

---

## Open Decisions (yours, not mine)

1. **Install mechanism for Phase 2.** (a) Managed venv with the official pip wheel: lighter, but pulls PyTorch/CUDA wheels (many GB) and depends on system driver. (b) NGC container: NVIDIA's recommended route, but requires Docker plus the NVIDIA container toolkit. (c) Stay at Phase 1 permanently. I recommend running Task 0 and letting the measurement decide; if forced now, (a).
2. **Windows via WSL2.** Not an officially listed platform. Recommend excluding in v1.
3. **Extension and crate naming.** Rule §4 forbids new `jan*` names, but every extension package is `@janhq/*`. Proposal: `@atomic/tensorrt-llm-extension` and crate `tauri-plugin-tensorrtllm`. Needs your "ok" as a new package name.
4. **Phase 2 at all.** Gate it on Task 0 numbers: if decode speed on the 3090s is not clearly above `llamacpp-upstream` for the models you use, Phase 1 is enough.

## Self-Review

- Spec coverage: platform gating, model format, process lifecycle, proxy routing, settings UI, packaging, ADRs each have a task. Vision, speculative decoding, embeddings and Agent mode are deliberately deferred.
- Types: `TrtllmConfig`, `SessionInfo`, `TrtllmBackendSession` and `buildTrtllmConfig` are used with the same names in Tasks 5–8.
- Unverified: exact flag spellings and the pinned version are taken from the live docs and must be re-read at the pinned tag in Task 0; the pip-install route and its requirements were not confirmed by the pages I could fetch.
