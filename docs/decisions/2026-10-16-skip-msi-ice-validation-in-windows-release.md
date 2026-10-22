---
date: 2026-10-16
title: "Skip MSI ICE validation in the Windows release build"
---

# 2026-10-16 — Skip MSI ICE validation in the Windows release build

- **Context:** The Windows release build (`yarn tauri build --config
  src-tauri/tauri.windows.conf.json`) failed deterministically at the MSI link
  step. `light.exe` reported `LGHT0217` (ICE01–ICE08) and `LGHT0216` (Win32
  `0x643`, "The Windows Installer Service could not be accessed") — every ICE
  validation action failed, and tauri-bundler's `output_ok` surfaced only the
  generic `failed to run light.exe`, hiding the real stderr. The exact same
  command (same args, same cleared `SYSTEMROOT/TMP/TEMP` environment, same
  working directory, cold Windows Installer Service) succeeded when run
  manually and produced a valid MSI. The failure was specific to tauri's
  spawn: `clear_env_for_wix` strips the environment and `output_ok` pipes
  stdout/stderr, and in that process tree light's ICE validators cannot reach
  the `msiserver` service. Manual validation of the produced MSI surfaced only
  benign warnings (ICE03, ICE60, ICE61), none blocking.

- **Decision:** Ship a thin `light.exe` shim that forwards all arguments to the
  real linker (`light.real.exe`) and appends `-sval`, which skips MSI/MSM
  validation only. The shim source is checked in at `scripts/light-shim.rs`;
  `scripts/build-windows-release.ps1` extracts `WixTools314` (the official
  wix314-binaries.zip, SHA-256 verified) if absent, renames `light.exe` to
  `light.real.exe`, and compiles the shim before `yarn tauri build`. `light.exe`
  is in tauri-bundler's `WIX_REQUIRED_FILES`, so the renamed real binary and
  the shim keep tauri from re-extracting WixTools.

- **Consequences:** The Windows MSI now links green under tauri. ICE validation
  is skipped for this target — a non-blocking quality gate, not a correctness
  gate; the installer still links and installs correctly. If a future
  tauri-bundler release fixes the underlying spawn/validation issue (or exposes
  a validation-suppression option), the shim and this patch step can be removed.
  The shim lives under `%LOCALAPPDATA%\tauri\WixTools314`, outside the repo, so
  the build script must keep regenerating it on machines where it is absent.

- **Owner:** team

- **Links:** `scripts/light-shim.rs`; `scripts/build-windows-release.ps1`;
  tauri-bundler `msi-mod.rs` (`run_light`, `clear_env_for_wix`) and
  `utils-mod.rs` (`output_ok`).
