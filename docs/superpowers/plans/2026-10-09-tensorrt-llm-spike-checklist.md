# TensorRT-LLM spike (Task 0): checklist

Run this on the Windows desktop with the dual RTX 3090s. It produces the numbers for the go/no-go in [the plan](2026-10-08-tensorrt-llm-backend.md) and the facts Phase 1 needs. Nothing here changes Radium.

**The bar (set 2026-10-09):** TensorRT-LLM in the private WSL2 distro (B) must decode at least **30% faster** than llama.cpp on native Windows (A), at 1 concurrent request, same model family and similar bit width. Everything else is reported, not decisive. Do not move the bar after seeing results.

**Measurement script:** `scripts/trtllm-spike-bench.py` (Python 3, standard library only). Run it from **Windows PowerShell** against every configuration, so client overhead is identical. It was tested against a fake server here, not against real engines.

Things I could not verify from the cloud environment are marked **[verify]**. If one fails, note what happened; that is a spike finding, not a mistake.

## 0. Ground rules

- [ ] Close games, browsers with video, and anything using the GPU. Note what remains in Task Manager.
- [ ] Windows power plan: High performance. Laptop: plugged in.
- [ ] Use temperature 0, the same context size (16384) and the script's defaults for every configuration.
- [ ] Keep a results folder outside the repo, e.g. `$env:TEMP\trtllm-spike\`. Do not commit result files.
- [ ] Rerun any configuration whose decode CV prints above 5%.

## 1. Record the machine

- [ ] `nvidia-smi` (driver version, both GPUs, VRAM used with nothing running)
- [ ] `winver` (must be Windows 11)
- [ ] `wsl --version` and `wsl --status`; note whether WSL2 was already enabled
- [ ] Contents of `%UserProfile%\.wslconfig`, or "none"; total RAM
- [ ] BIOS virtualization enabled (Task Manager -> Performance -> CPU -> Virtualization: Enabled)

If WSL2 is not installed, `wsl --install --no-distribution` needs an administrator PowerShell and may need a reboot. Record how many steps that took; the plan allows one consented admin step.

## 2. Pick the models

Check `web-app/src/constants/models.ts` for a model Radium actually offers and use it if it has both an INT4 GGUF and an INT4 Hugging Face checkpoint. Otherwise use this default pair (both official, ungated):

| Pair | llama.cpp (A, C) | TensorRT-LLM (B, D) |
| ---- | ---------------- | ------------------- |
| **Primary: 4-bit** | `Qwen/Qwen2.5-7B-Instruct-GGUF`, `q4_k_m` | `Qwen/Qwen2.5-7B-Instruct-AWQ` |
| Supplementary: 16-bit | same repo, `fp16` GGUF | `Qwen/Qwen2.5-7B-Instruct` (BF16) |

- [ ] The bar is judged on the **primary 4-bit pair**, the format people run. This is my interpretation of "30% faster decode"; change it here before running if you meant otherwise.
- [ ] If TensorRT-LLM cannot load the AWQ checkpoint, record the error, try a GPTQ-INT4 checkpoint of the same model, and note it. If neither loads, that alone is a finding.
- [ ] Both models fit one 3090 (24 GB). Note that FP8 is not available on Ampere, so do not use FP8 checkpoints.
- [ ] Download the GGUF to a Windows folder, e.g. `D:\models\`, and keep the HF checkpoint for step 4 inside WSL.

## 3. Configuration A: llama.cpp native Windows (the baseline)

- [ ] Use Radium's own bundled upstream server so the baseline is what ships: find `llama-server.exe` under `%APPDATA%\Radium\data\llamacpp-upstream\backends\` and run `.\llama-server.exe --version`; write down the build number (you need the same one for C).
- [ ] Single-request launch (port 8001, one slot, enough context for the 8k prompt test):

  ```powershell
  .\llama-server.exe -m D:\models\<q4_k_m>.gguf --host 127.0.0.1 --port 8001 -ngl 999 -c 16384 -np 1
  ```

- [ ] Time load: start `python scripts\trtllm-spike-bench.py ready --url http://127.0.0.1:8001` within a second of launching the server. It prints the seconds until ready (accurate to about 2 s).
- [ ] Run:

  ```powershell
  python scripts\trtllm-spike-bench.py run --url http://127.0.0.1:8001 --label A --engine "llama.cpp <build> CUDA native" --quant Q4_K_M --notes "-ngl 999 -c 16384 -np 1" --skip-concurrency --out $env:TEMP\trtllm-spike\A1.json
  ```

- [ ] Stop the server. llama.cpp only serves requests in parallel with multiple slots, so relaunch for the concurrency phase:

  ```powershell
  .\llama-server.exe -m D:\models\<q4_k_m>.gguf --host 127.0.0.1 --port 8001 -ngl 999 -c 32768 -np 8
  python scripts\trtllm-spike-bench.py run --url http://127.0.0.1:8001 --label A --engine "llama.cpp <build> CUDA native" --quant Q4_K_M --notes "-c 32768 -np 8" --only-concurrency --out $env:TEMP\trtllm-spike\A2.json
  ```

- [ ] If the Radium log shows a different command line for its own launches (`%APPDATA%\Radium\data\logs\app.log`) **[verify it does]**, note any flag that differs from the above.

## 4. Configuration B: TensorRT-LLM in a private WSL2 distro

### 4a. Create the distro

- [ ] Download the Ubuntu 24.04 WSL root filesystem from Canonical's WSL image list **[verify the current URL]**. Record its sha256.
- [ ] Import it as a private distro:

  ```powershell
  wsl --import radium-trtllm D:\wsl\radium-trtllm <rootfs-file> --version 2
  ```

  If `wsl --import` rejects the file format, note that and use `wsl --install --from-file <file> --name radium-trtllm` instead **[verify]**.
- [ ] `wsl -d radium-trtllm` and confirm you are root: `id -u` prints 0.
- [ ] `/usr/lib/wsl/lib/nvidia-smi` must show both GPUs. If not, stop and record the Windows driver version; this is the driver-floor finding.

### 4b. Provision (inside the distro, as root; this follows NVIDIA's documented steps)

- [ ] `apt-get update && apt-get install -y python3-venv python3-pip libopenmpi-dev openmpi-bin wget`
- [ ] CUDA Toolkit from the **WSL-Ubuntu** repository. Never install the `cuda`, `cuda-12-x` or `cuda-drivers` meta-packages (they pull a Linux display driver). The keyring package exists at `developer.download.nvidia.com/compute/cuda/repos/wsl-ubuntu/x86_64/cuda-keyring_1.1-1_all.deb`; whether `cuda-toolkit-13-1` is published there I could not confirm **[verify]**:

  ```bash
  wget https://developer.download.nvidia.com/compute/cuda/repos/wsl-ubuntu/x86_64/cuda-keyring_1.1-1_all.deb
  dpkg -i cuda-keyring_1.1-1_all.deb && apt-get update
  apt-get install -y cuda-toolkit-13-1
  export CUDA_HOME=/usr/local/cuda-13.1
  ```

- [ ] Python environment, then PyTorch (CUDA 13.0 build), then the wheel, with torch pinned so pip cannot swap it:

  ```bash
  python3 -m venv /opt/trtllm && . /opt/trtllm/bin/activate
  pip install torch==2.10.0 torchvision --index-url https://download.pytorch.org/whl/cu130
  python -c "import torch; print(torch.__version__)" | sed 's/^/torch==/' > /tmp/torch-constraint.txt
  pip install --ignore-installed pip setuptools wheel
  pip install tensorrt_llm -c /tmp/torch-constraint.txt
  ```

- [ ] Record: wall time of each step, total download size, `du -sh /opt/trtllm /usr/local/cuda-13.1`, and `D:\wsl\radium-trtllm\ext4.vhdx` size.
- [ ] Which prerequisites are really needed at serve time? Try, and record the result of each: (1) uninstall `cuda-toolkit-13-1` and serve again; (2) uninstall `libopenmpi-dev` and serve again. Reinstall after.

### 4c. Serve and measure

- [ ] Download the checkpoint **inside** the distro, onto its own ext4 disk, never `/mnt/c`:

  ```bash
  pip install -U huggingface_hub
  hf download Qwen/Qwen2.5-7B-Instruct-AWQ --local-dir /root/models/qwen25-7b-awq
  ```

- [ ] Serve (one GPU, enough batch/context for every test; the memory fraction leaves room for Windows' display use of VRAM):

  ```bash
  trtllm-serve /root/models/qwen25-7b-awq --host 127.0.0.1 --port 8000 --tp_size 1 --max_batch_size 8 --max_seq_len 16384 --kv_cache_free_gpu_memory_fraction 0.8
  ```

  Re-read the flag names against `trtllm-serve --help` for the installed version; they come from the docs, not from a run.
- [ ] From Windows, start `python scripts\trtllm-spike-bench.py ready --url http://127.0.0.1:8000` right after launching the server to time load. Record whether it succeeded through `localhost` with no extra setup.
- [ ] Run:

  ```powershell
  python scripts\trtllm-spike-bench.py run --url http://127.0.0.1:8000 --label B --engine "trtllm <version> WSL2" --quant AWQ-INT4 --notes "tp1 batch8 seq16384 kv0.8" --out $env:TEMP\trtllm-spike\B.json
  ```

  If the script reports "server sent no token usage", the server does not honour `stream_options.include_usage`; the rates are then approximate and you should say so in the ADR.

## 5. Configuration C: llama.cpp inside the same distro (isolates the WSL2 cost)

ggml-org publishes no Linux CUDA binary, so this is a source build. Use the same release as A.

- [ ] `apt-get install -y build-essential cmake git` (inside the distro)
- [ ] ```bash
  git clone https://github.com/ggml-org/llama.cpp && cd llama.cpp
  git checkout <tag matching A's build>
  cmake -B build -DGGML_CUDA=ON && cmake --build build --config Release -j
  ```
  Record the build time.
- [ ] Copy the GGUF onto the distro's ext4 disk (`/root/models/`), then repeat step 3's two launches with `build/bin/llama-server` on port 8002 (`-np 1 -c 16384`, then `-np 8 -c 32768`), labels `C`, outputs `C1.json` and `C2.json`.

## 6. Configuration D: Docker Desktop (optional, confirmation only)

The host is decided (private distro). Do this only if you have time, to confirm Docker would not have been better.

- [ ] Docker Desktop with the WSL2 backend, and the NGC TensorRT-LLM release container whose tag matches the version in B **[verify the tag on NGC]**; run with `--gpus all --ipc=host -p 8003:8000`.
- [ ] Record the image size, pull time, start time, and the same benchmark as B with label `D`.

## 7. The Phase 1 questions (record the answer to each)

- [ ] **Two GPUs:** serve with `--tp_size 2`. Does it start? Does it stay up under the benchmark? Record the exact error if not (issue 2864 reports failure on dual 5090s under WSL2 + Docker, on an old release). If it fails, run one instance per GPU.
- [ ] **GPU selection:** does `CUDA_VISIBLE_DEVICES=1 trtllm-serve ...` use only the second GPU (watch Windows `nvidia-smi`)? NVIDIA says GPUs cannot be filtered by index on WSL2.
- [ ] **Networking:** is `127.0.0.1:8000` reachable from Windows in the default (NAT) mode? Then, with a backup of `.wslconfig` first, set `networkingMode=mirrored` under `[wsl2]`, run `wsl --shutdown`, and test again. Restore your `.wslconfig` afterwards.
- [ ] **Process lifetime:** start the server from a `wsl.exe` command, then kill the `wsl.exe` process from Task Manager. Is `trtllm-serve` still running (`wsl -d radium-trtllm -- pgrep -a trtllm`)? Is GPU memory still held?
- [ ] **Idle shutdown:** leave the distro with no open `wsl.exe` for 10 minutes. Does the VM stop and kill the server?
- [ ] **Filesystem:** load the same checkpoint from `/mnt/c/...` and from ext4. Record both load times.
- [ ] **Memory cap:** with the default `.wslconfig`, does the 7B load fit? Record `free -h` inside the distro during load.
- [ ] **Health and failures:** does `/health` return 200 only when the model is ready? Record stderr when it runs out of memory (try an oversized `--max_seq_len`) and the exit code.
- [ ] **Cleanup:** `wsl --unregister radium-trtllm`; confirm the `ext4.vhdx` is deleted and `nvidia-smi` shows VRAM freed.

## 8. Compare and decide

```powershell
python scripts\trtllm-spike-bench.py compare $env:TEMP\trtllm-spike\A1.json $env:TEMP\trtllm-spike\A2.json $env:TEMP\trtllm-spike\B.json $env:TEMP\trtllm-spike\C1.json $env:TEMP\trtllm-spike\C2.json
```

- [ ] The printed `B/A` line and verdict are the go/no-go. `B/C` is TensorRT-LLM's own gain; `C/A` is the WSL2 cost.
- [ ] Read the "configurations" block: both sides must be the same model family and similar bit width. Read every WARNING.
- [ ] Repeat the compare for the 16-bit pair if you ran it. It is reported, not decisive.
- [ ] Paste the compare output and your answers to sections 1, 4b, 4c, 6 and 7 into `docs/decisions/2026-10-08-tensorrt-llm-spike-results.md` (copy `docs/decisions/_TEMPLATE.md`; add one line to `docs/decisions/INDEX.md`). Ask Claude to fill it in and apply the plan's Step 8 rules.
- [ ] **NO-GO means stop.** Phase 1 does not start. Keep the ADR as the record.
