---
date: 2026-10-24
title: "Move MCP to rmcp 2 and Streamable HTTP; keep a minimal SSE fallback"
---

# 2026-10-24 — Move MCP to rmcp 2 and Streamable HTTP; keep a minimal SSE fallback

- **Context:** Radium's MCP client was held on rmcp 0.8.5 by a Dependabot
  ignore because rmcp 2 removed its SSE client transport, and users can add
  remote MCP servers with `"type": "sse"`. rmcp < 2.1 has open security
  advisories (GHSA-33f5-2c5q-wgwj, GHSA-89vp-x53w-74fx, GHSA-9g45-5xwm-f3wc,
  GHSA-9pj6-vhgr-3mwh, GHSA-c9xm-49cp-xcr9). The MCP spec replaced HTTP+SSE
  with Streamable HTTP in revision 2025-03-26, and the hosted servers we ship
  connectors for (Linear, Webflow, Atlassian) now document Streamable HTTP
  endpoints. Some self-hosted servers still only speak SSE.
- **Decision:** Upgrade rmcp to 2.2 in every crate and remove the Dependabot
  ignore. Streamable HTTP (`"type": "http"`) is the transport for remote
  servers; built-in connectors and saved configs pointing at retired hosted
  SSE URLs are migrated to the providers' Streamable HTTP endpoints on load
  (`RETIRED_SSE_ENDPOINTS` in `core/mcp/commands.rs`). `"type": "sse"` keeps
  working through a small in-tree client (`core/mcp/legacy_sse.rs`, ~100 lines)
  instead of being dropped silently: GET the SSE stream, take the `endpoint`
  event, POST JSON-RPC messages to it, read replies from the stream. It
  supports the same OAuth sign-in as HTTP servers, refuses cross-origin POST
  endpoints so headers and tokens cannot be redirected, and logs a
  deprecation warning on every connect.
- **Consequences:** Security advisories on rmcp are fixed and Dependabot can
  propose future rmcp releases (including 3.x) normally. rmcp 2 uses reqwest
  0.13 while the app is on 0.12, so MCP code uses a renamed `mcp-reqwest`
  dependency until the app moves to 0.13 (two reqwest versions in the build).
  The SSE fallback has no automatic reconnect: if the stream drops, the server
  shows as disconnected and is restarted like any other failed server. Remove
  the fallback once no supported server needs SSE.
- **Owner:** @walladanger
- **Links:** `src-tauri/src/core/mcp/legacy_sse.rs`,
  `src-tauri/src/core/mcp/helpers.rs`, `.github/dependabot.yml`, closed PR
  #161, MCP spec "Backwards compatibility" (2025-03-26 transports).
