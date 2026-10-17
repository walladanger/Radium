---
date: 2026-10-03
title: "Reuse the runtime adapter branch and default managed Ollama to local execution"
---

# 2026-10-03 — Reuse the runtime adapter branch and default managed Ollama to local execution

- **Context:** The shared local workspace requires runtime discovery and bounded GPU placement. `origin/feat/runtime-adapter-layer` already supplies the catalog, probes, resource helpers, provider connection, and managed Ollama controls. Creating another registry would duplicate that source. Its Ollama state registration was unconditional despite the module being desktop-only, and its new-settings cloud default was enabled.
- **Decision:** Reconcile commits `49bbff015`, `3667c95f5`, and `5e3f1ca10` into the current source without creating commits. Preserve the Tasks route and existing behavior. Guard Ollama state registration to match the desktop module. Default new or absent Ollama settings to `OLLAMA_NO_CLOUD=1`.
- **Consequences:** Existing explicitly stored settings remain intact. Runtime catalog descriptions do not prove backend compatibility or hardware performance. User-configured environment overrides remain available for native runtime use; coordinated execution must independently enforce grants and network policy. The managed runtime panel is not a sandbox or a replacement for the shared controller. Tests need generated resources/icons prescribed by the existing Makefile; those placeholders are never release artifacts.
- **Owner:** @walladanger
- **Links:** `src-tauri/src/core/runtimes/`, `web-app/src/routes/settings/runtimes.tsx`, `2026-09-24-integrate-inference-runtimes-behind-one-adapter-layer.md`, [Pinned Ollama environment source](https://github.com/ollama/ollama/blob/v0.34.4/envconfig/config.go).
