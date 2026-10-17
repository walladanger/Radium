# Writing a panel for Radium

A panel is a folder with a `panel.json` and an entry HTML file. Copy
`examples/panels/mcp-tool-browser`, or point **Workspace → Install** at your
own folder.

The manifest schema, the SDK and the theme are **frozen as contract v1** and
served byte-for-byte by Radium and by ClaudeDesktopClient, so a panel folder
that satisfies them loads in either. The authority is
[`src-tauri/resources/panel-contract/panel.schema.json`](../../src-tauri/resources/panel-contract/panel.schema.json);
the reasoning is in
[the contract spec](../superpowers/specs/2026-10-03-panel-contract-v1.md) and
[the decision record](../decisions/2026-10-03-port-the-panel-mechanism-from-claudedesktopclient-not-its.md).

## panel.json

```json
{
  "contract": 1,
  "id": "mcp-tool-browser",
  "name": "MCP tool browser",
  "description": "Lists the tools one MCP server offers and runs the one you pick.",
  "version": "1.0.0",
  "author": "you",
  "entry": "index.html",
  "permissions": ["mcp.read", "mcp.call", "storage"],
  "mcpServers": ["filesystem"],
  "defaultSize": { "w": 5, "h": 7 }
}
```

`contract`, `id`, `name` and `entry` are required; everything else has a
default. `id` is lowercase with dashes and must equal the folder name. Unknown
keys are an error, not a warning — a typo in a permission name would otherwise
silently grant nothing.

If the manifest is wrong, the panel is not hidden. It appears in the panel
manager as broken, with every problem listed at once rather than one per
reinstall.

## The sandbox

A panel runs in an iframe with `sandbox="allow-scripts"` on the `panel://`
origin, and its files are served with `connect-src 'none'`. That means:

- no Node, no Tauri `invoke`, no access to the host page or its storage;
- **no network at all** — a panel cannot phone home, so a permission that lets
  it read something does not let it publish that something;
- no inline `<script src>` from a CDN. Vendor what you need into the folder.

Everything a panel can do goes through the SDK, and every call is authorised in
the Rust host against the permissions in your manifest. Ask for something you
did not declare and the call rejects with `permission_denied` naming the
permission you need.

These properties are locked by `tests/panel-sandbox.test.mjs`. Widening any of
them fails the build.

## The SDK

```js
import { panel } from '/panel-sdk.js'

const info  = await panel.host()                  // always allowed
const theme = await panel.theme()                 // always allowed

await panel.set('key', value)                     // needs "storage"
const value = await panel.get('key')              // needs "storage"

const tools  = await panel.tools()                // needs "mcp.read"
const result = await panel.callTool('read_file', { path: 'a.txt' }) // needs "mcp.call"

panel.onTheme((t) => { document.documentElement.dataset.theme = t })
panel.resize(6, 8)                                // board grid units
panel.ready()                                     // drops the host's spinner
```

`panel.call(method, params)` is the escape hatch for a method with no wrapper.
Every call rejects after 30 seconds rather than hanging, and a rejection
carries a `code`: `permission_denied` (your manifest is missing something),
`unknown_method` (the host is older than your panel expects), or `timeout`.

`/panel-theme.css` gives you the host's palette as CSS custom properties —
`--panel-bg`, `--panel-fg`, `--panel-muted`, `--panel-faint`, `--panel-border`,
`--panel-card`, `--panel-code`, `--panel-accent`, `--panel-danger` — so panels
follow light and dark automatically.

## Permissions

| Permission | Grants |
|---|---|
| `storage` | per-panel key/value storage, namespaced to your `id` |
| `mcp.read` | list the tools offered by the servers in `mcpServers` |
| `mcp.call` | run one of those tools |

Those three are the whole core set. `host.info`, `panel.theme`, `panel.ready`
and `panel.resize` need no permission: none of them reads or writes anything.

Anything host-specific must be namespaced `vendor:name` — for example
`cdc:usage.read`. A host that does not recognise the vendor refuses the panel
outright rather than dropping the capability and leaving it half working, so a
portable panel looks portable at a glance.

**`mcp.read` and `mcp.call` require `mcpServers`.** A panel does not get "the
MCP tools"; it gets the tools of the servers it named, and an unqualified tool
name is resolved only within that list. If two allowed servers offer the same
tool name, the call is refused as ambiguous rather than guessed.

Request the minimum. The permission list is shown to the user in the panel
manager, where they can read what they agreed to after the fact.

## Where panels live

Installing copies your folder into Radium's data directory, so editing the
original afterwards changes nothing until you reinstall. **Workspace → Panels →
Panels folder** opens the installed copy.

Symlinks are refused, both for `panel.json` and anywhere in the tree, and every
file request is resolved and then proved to be inside the panel's own folder —
a panel cannot serve `../../something`.

## Built-in panels

Radium's own panels are React components rather than folders: one file under
`web-app/src/panels/builtin/` exporting a `panel` descriptor, discovered by
`import.meta.glob` with no registry to update. They are trusted code and skip
the iframe entirely, which is why the board holds a descriptor rather than a
component — it does not care which kind it has.

If you are adding one, route every number through `Readout`
(`web-app/src/panels/Readout.tsx`): a measurement that has not arrived prints a
dash, never a zero. `0%` CPU before the first sample is a claim about the
machine that the panel cannot support.
