# dep-rust-openssl
status: OPEN
kind: dependency
source: dependabot
severity: high
open_alerts: 8 of 8

## Facts (generated)
title: openssl (rust)
package: openssl
ecosystem: rust
manifests: src-tauri/Cargo.lock
scopes: runtime/unknown
vulnerable_ranges: >= 0.10.50, < 0.10.80 ; >= 0.10.0, < 0.10.79 ; >= 0.9.7, < 0.10.79 ; >= 0.9.27, < 0.10.78 ; >= 0.9.0, < 0.10.78 ; >= 0.10.24, < 0.10.78 ; >= 0.10.39, < 0.10.78 ; >= 0.9.24, < 0.10.78
patched_versions: 0.10.80, 0.10.79, 0.10.78

## Alerts (generated - do not edit)
| key | state | sev | location | summary | patched in |
|---|---|---|---|---|---|
| D118 | open | high | src-tauri/Cargo.lock (runtime, unknown) | GHSA-xp3w-r5p5-63rr rust-openssl has undefined behavior in X509Ref::ocsp_responders for certificates with n... | 0.10.79 |
| D116 | open | high | src-tauri/Cargo.lock (runtime, unknown) | GHSA-pqf5-4pqq-29f5 rust-openssl: Deriver::derive and PkeyCtxRef::derive can overflow short buffers on Open... | 0.10.78 |
| D114 | open | high | src-tauri/Cargo.lock (runtime, unknown) | GHSA-8c75-8mhr-p7r9 rust-openssl has incorrect bounds assertion in aes key wrap [vulnerable >= 0.10.24, < 0... | 0.10.78 |
| D113 | open | high | src-tauri/Cargo.lock (runtime, unknown) | GHSA-ghm9-cr32-g9qj rust-openssl: rustMdCtxRef::digest_final() writes past caller buffer with no length che... | 0.10.78 |
| D112 | open | high | src-tauri/Cargo.lock (runtime, unknown) | GHSA-hppc-g8h3-xhp3 rust-openssl: Unchecked callback length in PSK/cookie trampolines leaks adjacent memory... | 0.10.78 |
| D122 | open | medium | src-tauri/Cargo.lock (runtime, unknown) | GHSA-phqj-4mhp-q6mq rust-openssl: Potential out-of-bounds write in `CipherCtxRef::cipher_update_inplace` fo... | 0.10.80 |
| D121 | open | medium | src-tauri/Cargo.lock (runtime, unknown) | GHSA-xv59-967r-8726 rust-openssl vulnerable to heap buffer overflow when encrypting with AES key-wrap-with-... | 0.10.79 |
| D115 | open | low | src-tauri/Cargo.lock (runtime, unknown) | GHSA-xmgf-hq76-4vx2 rust-opennssl has an Out-of-bounds read in PEM password callback when returning an over... | 0.10.78 |

## Attempts
<!-- appended by `triage.mjs end` from CURRENT.md - newest last -->

## Refresh log
