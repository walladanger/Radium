# dep-npm-next
status: PROPOSED_DISMISSAL
kind: dependency
source: dependabot
severity: critical
open_alerts: 22 of 22

## Facts (generated)
title: next (npm)
package: next
ecosystem: npm
manifests: docs/package.json
scopes: runtime/direct
vulnerable_ranges: >= 10.0.0, < 15.5.24 ; >= 13.4.0, < 15.5.24 ; >= 14.1.1, < 15.5.21 ; >= 13.0.0, < 15.5.21 ; >= 12.0.0, < 15.5.21 ; >= 12.2.0, < 15.5.16 ; >= 13.4.0, < 15.5.16 ; >= 13.4.6, < 15.5.16 ; >= 13.0.0, < 15.5.16 ; >= 10.0.0, < 15.5.16 ; >= 13.4.13, < 15.5.16 ; >= 13.0.0, < 15.5.15 ; >= 10.0.0, < 15.5.14 ; >= 9.5.0, < 15.5.13 ; >= 13.0.0, < 15.0.8 ; >= 10.0.0, < 15.5.10
patched_versions: 15.5.24, 15.5.21, 15.5.16, 15.5.15, 15.5.14, 15.5.13, 15.0.8, 15.5.10

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| D26 | open | critical | docs/package.json (runtime, direct) | GHSA-2xp9-vwfh-vxw4 Next.js: Unauthenticated Remote Code Execution in Image Optimization API when AVIF file... | 15.5.24 |
| D25 | open | critical | docs/package.json (runtime, direct) | GHSA-p293-qw3h-jr36 Next.js: Unauthenticated Remote Code Execution on windows-hosted servers [vulnerable >=... | 15.5.24 |
| D24 | open | high | docs/package.json (runtime, direct) | GHSA-89xv-2m56-2m9x Next.js: Server-Side Request Forgery in Server Actions on custom servers [vulnerable >=... | 15.5.21 |
| D20 | open | high | docs/package.json (runtime, direct) | GHSA-p9j2-gv94-2wf4 Next.js: Server-Side Request Forgery in rewrites via attacker-controlled destination ho... | 15.5.21 |
| D18 | open | high | docs/package.json (runtime, direct) | GHSA-m99w-x7hq-7vfj Next.js: Denial of Service in App Router using Server Actions [vulnerable >= 13.0.0, < ... | 15.5.21 |
| D11 | open | high | docs/package.json (runtime, direct) | GHSA-c4j6-fc7j-m34r Next.js vulnerable to server-side request forgery in applications using WebSocket upgra... | 15.5.16 |
| D10 | open | high | docs/package.json (runtime, direct) | GHSA-36qx-fr4f-26g5 Next.js has a Middleware / Proxy bypass in Pages Router applications using i18n [vulner... | 15.5.16 |
| D9 | open | high | docs/package.json (runtime, direct) | GHSA-8h8q-6873-q5fj Next.js Vulnerable to Denial of Service with Server Components [vulnerable >= 13.0.0, <... | 15.5.16 |
| D8 | open | high | docs/package.json (runtime, direct) | GHSA-q4gf-8mx6-v5v3 Next.js has a Denial of Service with Server Components [vulnerable >= 13.0.0, < 15.5.15] | 15.5.15 |
| D5 | open | high | docs/package.json (runtime, direct) | GHSA-h25m-26qc-wcjf Next.js HTTP request deserialization can lead to DoS when using insecure React Server C... | 15.0.8 |
| D23 | open | medium | docs/package.json (runtime, direct) | GHSA-68g3-v927-f742 Next.js: Cache confusion of response bodies for requests with bodies [vulnerable >= 13.... | 15.5.21 |
| D22 | open | medium | docs/package.json (runtime, direct) | GHSA-4633-3j49-mh5q Next.js: Cache confusion of response bodies for requests with bodies containing invalid... | 15.5.21 |
| D21 | open | medium | docs/package.json (runtime, direct) | GHSA-4c39-4ccg-62r3 Next.js: Unbounded Server Action payload in Edge runtime [vulnerable >= 13.0.0, < 15.5.21] | 15.5.21 |
| D19 | open | medium | docs/package.json (runtime, direct) | GHSA-955p-x3mx-jcvp Next.js: Unauthenticated disclosure of internal Server Function endpoints [vulnerable >... | 15.5.21 |
| D15 | open | medium | docs/package.json (runtime, direct) | GHSA-ffhc-5mcf-pf4q Next.js vulnerable to cross-site scripting in App Router applications using CSP nonces ... | 15.5.16 |
| D13 | open | medium | docs/package.json (runtime, direct) | GHSA-gx5p-jg67-6x7h Next.js has cross-site scripting in beforeInteractive scripts with untrusted input [vul... | 15.5.16 |
| D12 | open | medium | docs/package.json (runtime, direct) | GHSA-h64f-5h5j-jqjh Next.js has a Denial of Service in the Image Optimization API [vulnerable >= 10.0.0, < ... | 15.5.16 |
| D7 | open | medium | docs/package.json (runtime, direct) | GHSA-3x4c-7xq6-9pq8 Next.js: Unbounded next/image disk cache growth can exhaust storage [vulnerable >= 10.0... | 15.5.14 |
| D6 | open | medium | docs/package.json (runtime, direct) | GHSA-ggv3-7p47-pfv8 Next.js: HTTP request smuggling in rewrites [vulnerable >= 9.5.0, < 15.5.13] | 15.5.13 |
| D4 | open | medium | docs/package.json (runtime, direct) | GHSA-9g9p-9gw9-jx7f Next.js self-hosted applications vulnerable to DoS via Image Optimizer remotePatterns c... | 15.5.10 |
| D16 | open | low | docs/package.json (runtime, direct) | GHSA-3g8h-86w9-wvmq Next.js's Middleware / Proxy redirects can be cache-poisoned [vulnerable >= 12.2.0, < 1... | 15.5.16 |
| D14 | open | low | docs/package.json (runtime, direct) | GHSA-vfv6-92ff-j949 Next.js vulnerable to cache poisoning via collisions in React Server Component cache-bu... | 15.5.16 |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

### Attempt 1 | PROPOSE-DISMISS | PROPOSED_DISMISSAL | ITER 0002 | 2026-09-24T12:51:14Z
#### 1. LOOK
- `next` is a DIRECT runtime dep in `docs/package.json` (`"next": "^14.1.4"`). `docs/` is a STANDALONE project — NOT in the root yarn workspace (root workspaces = `core`, `web-app` only).
- `docs/` is a Next.js + nextra 2.x docs website, managed by **bun** (`bun.lock`/`bun.lockb`). bun is NOT installed on this machine.
- `next.config.mjs`: `output: 'export'` (STATIC export), `images.unoptimized: true` (image optimization DISABLED). `start` = `npx serve@latest out` (serves static `out/`). Netlify static hosting (`_headers`, `_redirects`).
- All 22 alerts are server-side Next.js features: image-optimization RCE (GHSA-2xp9-vwfh-vxw4, GHSA-p293-qw3h-jr36), SSRF in server actions/rewrites/WebSocket, DoS in server actions/server components, middleware/proxy bypass, HTTP request smuggling, cache poisoning, App-Router CSP-nonce XSS.
- Patched versions are all `>= 15.5.x`; every 14.x is vulnerable. The only fix is a major bump 14 -> 15.5.24+, which forces nextra 2->3, @next/third-parties 14->15, eslint-config-next 14->15, and likely react 18->19.

#### 2. ANALYZE
- Root cause: `next` 14.x has known server-side vulnerabilities (RCE, SSRF, DoS, XSS).
- Reachability: NOT reachable in this deployment. The docs site is a static export (`output: 'export'`) with image optimization disabled (`images.unoptimized: true`), served as static files. Every flagged vulnerability is a server-side feature (image-optimization endpoint, server actions, middleware, rewrites, WebSocket, server cache) that does not run in a static export. The docs site is also a standalone project, not part of the shipped Radium app.
- The only real fix is a full breaking migration (next 14->15 + nextra 2->3 + react 18->19) that I cannot verify here (bun not installed; no way to run the docs build). A DEP-BUMP-DIRECT would be an unverifiable, high-risk change.
- Strategy: PROPOSE-DISMISS (reason `not_used`) — the vulnerable server-side Next.js features are not used in this static-export docs site.

#### 3. FIX
- Strategy: PROPOSE-DISMISS (reason: not_used). No code change — the vulnerable code paths are not used in this deployment.
- No files changed. No lockfile touched.

#### 4. VERIFY
- No code change to verify. Justification is the deployment config, which I read directly:
  - `next.config.mjs`: `output: 'export'` (static), `images.unoptimized: true` (image optimization off).
  - `docs/package.json`: `start` = `npx serve@latest out` (static file server); `docs/` not in root workspace.
- RESULT: PROPOSED_DISMISSAL

#### 5. NEXT TIME
- A human should confirm the docs site is deployed ONLY as a static export (Netlify static hosting) and never run as a `next start` server. If it is ever served as a Next.js server, bump `next` to >= 15.5.24 (with the accompanying nextra 3 / react 19 migration) instead of dismissing.
- If the team prefers a fix over a dismissal, the concrete first step is: install bun, then in `docs/` bump `next` to `^15.5.24`, `nextra`/`nextra-theme-docs` to `^3`, `@next/third-parties` to `^15`, `eslint-config-next` to `^15`, `react`/`react-dom` to `^19`, then `bun install` and `bun run build` to verify.

dismiss_reason: not_used

## Refresh log
