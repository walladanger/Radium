#!/usr/bin/env bash
#* Before bundle: clear xattr from artifacts and clean the bundle/macos directory (otherwise FinderInfo / iCloud
#* attributes carry over from the previous run to the .app — and codesign fails on the main binary).
set -euo pipefail
if [[ "$(uname -s)" != "Darwin" ]]; then
  exit 0
fi
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
for dir in \
  "$HERE/target/universal-apple-darwin/release" \
  "$HERE/target/release"; do
  if [[ -d "$dir" ]]; then
    xattr -cr "$dir" 2>/dev/null || true
  fi
done
if [[ -d "$HERE/resources/bin" ]]; then
  xattr -cr "$HERE/resources/bin" 2>/dev/null || true
fi
for bd in \
  "$HERE/target/universal-apple-darwin/release/bundle/macos" \
  "$HERE/target/release/bundle/macos"; do
  if [[ -d "$bd" ]]; then
    rm -rf "${bd:?}/"*
    mkdir -p "$bd"
    xattr -cr "$bd" 2>/dev/null || true
  fi
done
