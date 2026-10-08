# Panel Contract v1

The agreement between a panel and whatever hosts it. Frozen: Radium and
`walladanger/ClaudeDesktopClient` (CDC) serve the same schema, the same SDK and
the same theme, so a panel folder that satisfies this document loads in either.

Decision: `docs/decisions/2026-10-03-port-the-panel-mechanism-from-claudedesktopclient-not-its.md`
Plan: `docs/superpowers/plans/2026-10-03-radium-panel-system-implementation.md`

Artefacts, all under `src-tauri/resources/panel-contract/`:

| File | Role |
|---|---|
| `panel.schema.json` | the manifest shape, and the only definition of it |
| `panel-sdk.js` | served to every panel at `/panel-sdk.js`; the sole way out |
| `panel-theme.css` | served at `/panel-theme.css`; the host's palette as tokens |

Enforcement lives in `tests/panel-contract.test.mjs`, which runs inside
`make test-hardening-contracts` and therefore inside `make verify`. The
conformance fixture is `tests/fixtures/panels/conformance/`; the deliberately
broken manifests are in `tests/fixtures/panels/invalid/`.

## What a panel is

A folder with `panel.json` and an entry HTML file. Nothing else is required and
nothing else is implied: no build step, no framework, no package manager.

```text
my-panel/
  panel.json
  index.html
```

## The manifest

```json
{
  "contract": 1,
  "id": "my-panel",
  "name": "My Panel",
  "entry": "index.html",
  "permissions": ["storage"],
  "defaultSize": { "w": 4, "h": 6 }
}
```

`contract`, `id`, `name` and `entry` are required. `id` must equal the folder
name, is lowercase letters, digits and dashes, and is 3 to 40 characters.
`entry` is relative, ends in `.html`, and may not escape the folder — the
schema refuses `..` outright rather than normalising it away, because at a
security boundary a logged refusal beats a quiet rewrite.

`contract` exists so a host can refuse what it does not understand. A host
reading `contract: 2` must decline the panel, not guess at it.

## The sandbox

A panel runs in an iframe with `sandbox="allow-scripts"` on the `panel://`
origin. That means an opaque origin with no `allow-same-origin`: no access to
the host page, no host IPC, no app storage, no file system. The response
carries its own restrictive CSP — `connect-src 'none'` among it — so a panel
cannot reach the network at all. It cannot phone home, and it cannot be made
to by its author.

Everything a panel can do goes through `postMessage` into a single bridge in
the host process, which authorises each call against the permissions in the
manifest before dispatch. Unknown methods are rejected rather than forwarded,
so a capability only exists once someone adds it deliberately.

## Permissions

Core permissions are portable: every host understands them.

| Permission | Grants |
|---|---|
| `storage` | `storage.get`, `storage.set` — key/value storage namespaced to this panel |
| `mcp.read` | `mcp.listTools` — the tools on the servers this manifest allows |
| `mcp.call` | `mcp.callTool` — running one of those tools |

Four methods need no permission at all: `host.info`, `panel.theme`,
`panel.ready` and `panel.resize`.

`mcp.read` and `mcp.call` both require `mcpServers`, naming the server ids the
panel may reach. The schema enforces that: asking for MCP access without an
allowlist is a mistake, not a grant of everything. An empty list is a
deliberate nothing and is allowed.

Everything beyond that core goes through MCP rather than growing this table.
That is the load-bearing decision in the ADR: the host surface stays small, and
panel authors write against a protocol they already know instead of a
hand-written method list that only ever grows.

### Host-specific permissions

A host may understand capabilities no other host has. Those are namespaced —
`vendor:name`, as in `cdc:usage.read` — and a host that does not recognise one
refuses to install the panel rather than silently dropping the capability and
leaving the panel half-working. A panel that sticks to the core set runs
everywhere; a panel that reaches for a vendor permission has said so plainly in
its manifest, where a user can read it before installing.

CDC's existing panels predate this and use bare `usage.read`, `logs.read` and
friends. Bringing them onto v1 means prefixing them, which is Phase 7 of the
plan rather than a change anyone has to make today.

## The SDK

```js
import { panel } from '/panel-sdk.js'

const host = await panel.host()          // always allowed
const tools = await panel.tools()        // needs "mcp.read"
await panel.set('key', value)            // needs "storage"
panel.onTheme((t) => { document.documentElement.dataset.theme = t })
panel.ready()                            // hides the host's spinner
```

`panel.call(method, params)` is the escape hatch for anything without a
wrapper. Every call returns a promise and times out after 30 seconds, so a host
that never answers cannot hang a panel forever.

A rejection carries a `code` the panel can act on:

| `code` | Means |
|---|---|
| `permission_denied` | the manifest is missing a permission, and the message names it |
| `unknown_method` | the host is older than the panel expects |
| `unknown_panel` | the host has no record of this panel |
| `handler_error` | the call reached the host and failed there |
| `timeout` | no answer within 30 seconds |

## Messages

Panel to host: `panel:request` (`{ contract, id, method, params }`),
`panel:ready`, `panel:resize` (`{ w, h }`).

Host to panel: `host:init` (`{ theme }`), `host:theme` (`{ theme }`),
`host:response` (`{ id, ok, result }` or `{ id, ok: false, error, code }`).

The host pushes the theme on init, so a subscriber registered while the module
is still evaluating does not miss the first value.

## Changing this contract

Additions go through a version bump, not a quiet edit. Three things make a
change breaking: removing or renaming a method, narrowing what a permission
grants, or changing a message shape. Adding a method, adding a permission, or
adding an optional manifest field is additive and stays at v1 — but it still
has to land in the schema, the SDK and the conformance fixture together, and
`tests/panel-contract.test.mjs` pins the permission list precisely so a
capability cannot be bolted on without someone noticing.
