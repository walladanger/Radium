# dep-npm-next
status: OPEN
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

## Refresh log
