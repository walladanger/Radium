# Radium

Radium is a local-first AI application built with Tauri, Rust, React, and
TypeScript. It runs local models through provider extensions, connects to
external model servers, and exposes an OpenAI-compatible API for other apps.

Radium is a fork of [Atomic Chat](https://github.com/AtomicBot-ai/Atomic-Chat),
with Jan ancestry. Existing `jan*` and `@janhq/*` package names are retained for
compatibility; the product name is Radium.

## Install and start

Check [Radium releases](https://github.com/walladanger/Radium/releases) for
available installers and their platform-specific notes. Desktop build targets
include Windows x64, macOS Universal, and Linux AppImage. The repository also
contains iOS and Android build targets; a build target does not guarantee a
published installer.

For local chat, complete onboarding, select a compatible backend, and download
or import a supported model. Local inference can work offline after the required
models and backend files are installed. Downloads, remote providers, and
network-backed integrations require connectivity.

## Inference providers and external runtimes

| Provider | Purpose |
| --- | --- |
| `llamacpp-upstream` | Stock llama.cpp integration; default local llama.cpp provider. |
| `llamacpp` | Optional TurboQuant llama.cpp fork with its own supported settings and backend builds. |
| `mlx` | MLX-VLM integration for Apple Silicon. |
| Apple Foundation Models | Apple-platform integration, subject to OS and hardware availability. |
| Connected providers | OpenAI-compatible external servers and configured remote providers. |

Windows and Linux release packaging includes both llama.cpp provider trees.
GPU support and optional flags depend on the selected provider and pinned
backend build. Fork-only TurboQuant cache settings do not apply to
`llamacpp-upstream`. See the [backend rules](AGENTS.md#3-backends--the-part-that-is-easy-to-get-wrong)
and [engineering decisions](docs/decisions/INDEX.md).

Use **Settings > Runtimes** to connect a detected OpenAI-compatible server.
The connection uses the server's model list and adds or updates a provider.
For example, LM Studio commonly uses `http://127.0.0.1:1234/v1` and Ollama
uses `http://127.0.0.1:11434/v1`; confirm the address in the running server.
Connecting a runtime does not install or start that runtime.

Chat uses the chat transport by default. Agent mode is opt-in and routes
supported turns to the Rust agent loop; provider restrictions, audio attachments,
and upstream DFlash can send a turn through the chat transport instead.
See [route selection](web-app/src/lib/agent-route.ts).

## Local API

Start the server under **Settings > Local API Server**. Its default base URL is
`http://127.0.0.1:1337/v1`; use the configured host, port, and prefix if changed.
The server routes requests to local engines and registered external providers,
so a request through a local URL can still use a remote provider.

Set an API key in the server settings, then list the available model ids:

```bash
curl http://127.0.0.1:1337/v1/models \
  -H "Authorization: Bearer YOUR_RADIUM_API_KEY"
```

Use an id returned by that endpoint in a chat request:

```bash
curl http://127.0.0.1:1337/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_RADIUM_API_KEY" \
  -d '{"model":"YOUR_MODEL_ID","messages":[{"role":"user","content":"Hello"}]}'
```

The server's API key authenticates clients to Radium. External provider
credentials are configured separately.

## Develop from source

Read [AGENTS.md](AGENTS.md) and [CONTRIBUTING.md](CONTRIBUTING.md) before changing
the repository. Use Node.js 22.12 or newer (CI uses Node.js 24), Yarn 4.5.3 as
pinned in `package.json`, Rust, GNU Make, and the native build prerequisites
for your Tauri target.

```bash
git clone https://github.com/walladanger/Radium.git
cd Radium
make dev
```

`make dev` installs dependencies, builds the core and extensions, prepares
backend resources, and launches Tauri. On Windows, `make dev-windows` invokes
the repository's Windows development helper. After initial preparation,
`yarn dev` starts the development loop. See [DEVELOP.md](DEVELOP.md) for
runtime data locations and troubleshooting. Development and installed builds
can share user data; inspect any reset target before running it.

| Command | Purpose |
| --- | --- |
| `yarn lint` | Frontend ESLint checks. |
| `make typecheck` | Frontend TypeScript build-mode check. |
| `yarn test` | Root Vitest projects, not every repository suite. |
| `make verify-fast` | Lint, typecheck, quality/security guards, and critical coverage checks. |
| `make verify` | Required agent gate, including supported Rust checks and selective verification. |
| `make build` | Prepare dependencies and build platform artifacts. |

Before compiling a new distributable, follow the
[version-number policy](DEVELOP.md#every-build-gets-a-new-version-number).
Documentation edits alone do not produce a new installer.

## Repository map

| Path | Responsibility |
| --- | --- |
| `web-app/` | React UI, model/provider settings, chat and runtime connection logic. |
| `core/` | Shared TypeScript SDK, engine registry, model types, and extension contracts. |
| `extensions/` | Inference and supporting extensions. |
| `src-tauri/` | Native shell, IPC commands, local API proxy, and Rust plugins. |
| `scripts/` | Build, packaging, backend resolution, and verification helpers. |
| `docs/` | Documentation site, plans, and architectural decisions. |
| `tests/`, `benchmarks/`, `autoqa/` | Contract checks, benchmarks, and automated QA. |

## Function documentation

Exported helpers should document behavior a caller cannot infer from a type:
units, accepted inputs, fallback rules, mutation, asynchronous side effects,
and failure conditions. Comment the reason for complex logic near that logic.

Examples maintained alongside the implementation:

- [Model parameter normalization and context stepping](core/src/browser/models/utils.ts).
- [Chat-template reasoning detection](core/src/browser/models/reasoning.ts).
- [Runtime connections and model-list merging](web-app/src/lib/connect-runtime.ts).
- [Context growth and provider-scoped unloading](web-app/src/lib/context-size.ts).
- [Time-to-first-token markers and partial snapshots](web-app/src/lib/ttft-timing.ts).

## Further reading

- [Developer guide](DEVELOP.md)
- [Contribution guide](CONTRIBUTING.md)
- [Engineering decisions](docs/decisions/INDEX.md)
- [Security policy](SECURITY.md)
- [License](LICENSE)

The root license is Apache 2.0. Check component and bundled dependency licenses
when redistributing; individual packages can declare different terms.
