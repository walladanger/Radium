---
date: 2026-10-20
title: "Dispatch ready tasks through trusted local profiles"
---

# 2026-10-20 — Dispatch ready tasks through trusted local profiles

- **Context:** The durable controller and sandboxed WorkerCoordinator existed, but the daemon never called the runner. Starting a plan in the UI therefore did not execute its ready tasks. Scheduled readiness also needed a background clock.
- **Decision:** Add a daemon supervisor that polls durable readiness, selects provisioned workers, and calls the existing coordinator. Operator-owned project profiles supply Linux repositories, exact base commits, allowed scopes, model bindings and acceptance commands. The HTTP interface retains its restricted plan lifecycle authority. Store claims remain the atomic capacity and fencing authority. No new runtime dependencies are added.
- **Consequences:** Plans execute independently of an open UI after explicit activation. Pause blocks future claims; cancellation and daemon shutdown signal runners and drain them before sandbox reconciliation. Interrupted outcomes reserve capacity until termination is confirmed; no automatic retry occurs. Missing provisioning leaves planning available with execution explicitly disabled. Live GPU pinning and installed-app acceptance require runtime evidence separately from scheduler tests. The first live attempt in this session was blocked by Ubuntu WSL disk I/O errors and read-only fallback after restart; no dual-GPU acceptance is claimed.
- **Owner:** @walladanger.
- **Links:** `src-tauri/atomic-control/src/dispatch.rs`, `src-tauri/atomic-control/src/dispatch/config.rs`, `src-tauri/atomic-control/tests/dispatch.rs`, [controller operating guide](../../src-tauri/atomic-control/README.md).
