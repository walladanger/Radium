---
date: 2026-10-24
title: "Keep plain-HTTP scope for user-configured AI servers"
---

# 2026-10-24 — Keep plain-HTTP scope for user-configured AI servers

- **Context:** DevSkim rule DS137138 ("insecure URL") flags the
  `{"url": "http://*:*"}` entry of the `http:default` permission in every
  Tauri capability (`src-tauri/capabilities/{default,desktop,mobile,
  log-app-window,logs-window,system-monitor-window}.json`) and the
  loopback/Tauri-internal `http://` origins in the CSP `connect-src` of
  `src-tauri/tauri.conf.json`. Radium talks to *user-configured* inference
  servers (Ollama, llama.cpp, LM Studio, vLLM, OpenAI-compatible gateways)
  that very commonly run on the same machine or the LAN over plain HTTP
  with no TLS, and are addressed by arbitrary hostnames (`gpu-box.local`,
  `nas`, Tailscale `100.x` / MagicDNS names, Docker service names) as well
  as by IP.
- **Decision:** Keep `http://*:*` in the Tauri HTTP plugin scope and keep
  the loopback / Tauri-internal `http://` origins in CSP `connect-src`.
  Tightening to explicit `localhost` / `127.0.0.1` / RFC 1918 globs was
  evaluated and rejected: Tauri scope globs match URL text, not resolved
  addresses, so they cannot express "private network only"; a host list
  would break every hostname-, mDNS-, Tailscale- or IPv6-addressed server
  that users configure today, while giving no real protection (a public
  host could still be reached through a DNS name). The CSP stays
  loopback-only (`http://127.0.0.1:*`, `ws://localhost:*`, and Tauri's own
  `http://asset.localhost` / `http://ipc.localhost` protocol origins);
  arbitrary remote/LAN hosts are reached only through the Rust-side HTTP
  plugin, never directly from webview `fetch`. The DevSkim alerts are
  dismissed as "won't fix" referencing this ADR.
- **Consequences:** Users can keep using LAN/local AI servers over plain
  HTTP; traffic to such servers is unencrypted, which is the user's choice
  of endpoint. Mitigations stay in place: HTTPS is used for all
  Radium-owned endpoints, the local API server requires an API key off
  loopback and refuses untrusted browser origins (see 2026-10-10 ADRs).
  Revisit if Tauri gains resolved-address (private-IP) scope matching.
- **Owner:** @walladanger
- **Links:** DevSkim code-scanning alerts #547 #548 #551 #555 #559 #561
  #659 #661; `src-tauri/capabilities/*.json`; `src-tauri/tauri.conf.json`.
