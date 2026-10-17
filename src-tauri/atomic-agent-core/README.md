# Radium agent core

This crate contains Radium's existing agent loop and its prompt, grammar, batching,
loop guards, session, skill, path-policy, and local/OpenAI-compatible transports.
It builds without Tauri. The desktop `core/agent` modules re-export these shared
types and delegate each turn to this implementation; the native dispatcher
continues handling desktop, PTY, document parsing, and application integrations.

Hosts implement `tools::ToolExecutor`. A coordinated executor must enforce the
assigned workspace, tool permissions, network policy, cancellation, and durable
journaling before dispatch. Passing a worktree alone does not enforce a sandbox.
The core checks cancellation and disabled tools before calling the executor.
It does not certify artifacts or integrate changes.

Use `runner::run_turn` for the native 600-second completion ceiling, or
`runner::run_turn_with_deadline` to tighten it. Desktop timeout fixtures inject
their original short deadline explicitly, because a dependency crate does not
inherit the application's `cfg(test)`.

Session storage preserves the existing `threads/<id>/agent-session.json` layout.
Choose the application data root explicitly. Coordinated attempt/event durability
belongs to `atomic-control`, separately from conversational session state.

Publisher skill metadata is accepted through explicit fields and remains
informational. `allowed-tools`, publisher `permissions`, and `reviewed` values
never grant native permissions or bypass fingerprint approval. Unknown fields and
unsafe script paths remain rejected. Paragraph descriptions are folded into a
bounded single-line catalog. Long instructions are retrievable with
`LoadedSkills::view_page` / `skill.view { name, offset }`; offsets count Unicode
characters and every page stays within the existing prompt limits.

The imported BioNeMo name corrections are documented in
[CATALOG-NORMALIZATION.md](CATALOG-NORMALIZATION.md).

Verification:

```sh
cargo test --manifest-path src-tauri/atomic-agent-core/Cargo.toml
cargo clippy --manifest-path src-tauri/atomic-agent-core/Cargo.toml --all-targets -- -D warnings
```

On WSL, keep `--target-dir` on the Linux filesystem to avoid sharing Windows
compiler outputs. The crate's tests read the real sibling `resources/agent-skills`
catalog, so retain that directory when testing a source checkout.
