# Radium (Jan / Tauri) Signing for macOS

Following the [official Tauri scheme](https://v2.tauri.app/distribute/sign/macos/): environment variables + `yarn build`. Manual `codesign` over the entire `.app` is not needed — the Tauri CLI does it during the build.

## What is needed

1. **Apple Developer Program** ($99/year): [developer.apple.com](https://developer.apple.com/programs/).
2. In the keychain — **Developer ID Application** (not "Apple Distribution" for the Mac App Store).

The certificate is created only at Apple: CSR on Mac → upload to [Certificates](https://developer.apple.com/account/resources/certificates/list) → download `.cer` → open (the key will go to the "Keychain"). **The certificate cannot be generated for you from the repository** — your developer account is required.

---

## Step 1: Find out the signing identity

```bash
security find-identity -v -p codesigning
```

A string like `Developer ID Application: … (TEAMID)` — is the **full name**. If there are multiple matches, it is safer to specify the **SHA-1** from the first column.

---

## Step 2: Build with signing (as in the project)

From the root of the `jan/` repository:

```bash
# if necessary, put extensions in pre-install (copied to the bundle)
cp src-tauri/resources/pre-install/*.tgz pre-install/ 2>/dev/null || true

export APPLE_SIGNING_IDENTITY="Developer ID Application: SpaceshipIntelligence OU (UT6WGPGTGR)"
# or: export APPLE_SIGNING_IDENTITY="XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

CI=false yarn build
```

`CI=false` is required: otherwise, Tauri in CI mode might **not** sign.

Ready **universal** DMG (Intel + Apple Silicon):

`src-tauri/target/universal-apple-darwin/release/bundle/dmg/Radium_*.dmg`

(the name is taken from `productName` in `tauri.conf.json`.)

Verifying the application signature:

```bash
codesign -dv --verbose=2 "src-tauri/target/universal-apple-darwin/release/bundle/macos/Radium.app" 2>&1 | grep -E "Authority|Timestamp|runtime"
```

There should be a chain **Developer ID** → **Developer ID Certification Authority** → **Apple Root CA**, **Timestamp**, on the main binary — **flags** with runtime (Hardened Runtime is set by Tauri during signing).

Before the bundle phase, `src-tauri/scripts/strip-macos-xattrs.sh` is run (removing `xattr`), otherwise `codesign` sometimes crashes with `resource fork, Finder information, or similar detritus not allowed`.

Tauri signs only `Contents/MacOS/*`. Copies of the CLI from `bundle.resources` end up in `Contents/Resources/resources/bin/` **without** being re-signed, which causes notarytool to reject the archive. The script `src-tauri/scripts/sign-macos-resource-binaries.sh` (in the `beforeBundleCommand` chain) signs `jan-cli`, `mlx-server`, `foundation-models-server` in `resources/bin/` before copying to the bundle — when `APPLE_SIGNING_IDENTITY` is set.

---

## Optional: Notarization

Without notarization, users who download the DMG from Telegram/browser will see **"Apple could not verify … free of malware"** (Quarantine + Gatekeeper).

Ready-made script from the `jan/` root (checks variables and calls `yarn build`):

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: …"
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="UT6WGPGTGR"
yarn build:macos:notarized
```

Script: `scripts/macos-build-signed-notarized.sh`. Alternative — API keys: `APPLE_API_KEY`, `APPLE_API_ISSUER`, `APPLE_API_KEY_PATH` (see [Tauri — Notarization](https://v2.tauri.app/distribute/sign/macos/)).

---

Apple credentials are required:

- **APPLE_ID** — developer's Apple ID email.
- **APPLE_PASSWORD** — [app-specific password](https://appleid.apple.com/account/manage) (not the regular Apple ID password).
- **APPLE_TEAM_ID** — Team ID (10 characters, visible in the certificate and on developer.apple.com).

```bash
export APPLE_SIGNING_IDENTITY="…"
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="UT6WGPGTGR"
CI=false yarn build
```

Tauri will send the build for notarization after building (see Tauri docs). Or manually after building: `xcrun notarytool submit … --wait` and `xcrun stapler staple` for the DMG — see [notarytool](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution).

---

## Native build only for the current Mac (faster, not universal)

For local tests without the Intel layer:

```bash
CI=false APPLE_SIGNING_IDENTITY="…" yarn build:web && yarn build:icon && yarn copy:assets:tauri && CI=false APPLE_SIGNING_IDENTITY="…" yarn build:tauri:darwin:native
```

DMG: `src-tauri/target/release/bundle/dmg/Radium_*_aarch64.dmg` (on Apple Silicon).

---

## If there is no Apple Developer

It is not possible to distribute a signed build "for everyone". Locally, you can open an unsigned application: right click → **Open**, or:

```bash
xattr -cr "/Applications/Radium.app"
```
