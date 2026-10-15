#!/usr/bin/env bash
#
# Build + publish Dash to GitHub releases (with auto-update metadata).
#
# Credentials load from scripts/release.env (gitignored) so they reliably reach
# electron-builder in one shell — no fragile inline exports. Copy
# scripts/release.env.example to scripts/release.env and fill it in once.
#
#   scripts/publish.sh mac      # signed + notarized dmg/zip
#   scripts/publish.sh win      # NSIS installer (needs wine on macOS)
#   scripts/publish.sh linux    # AppImage (needs a Linux toolchain / Docker)
#   scripts/publish.sh all      # mac + win (the targets buildable on this host)
#
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE="scripts/release.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a            # auto-export everything the file assigns
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  echo "⚠  $ENV_FILE not found — copy scripts/release.env.example and fill it in." >&2
fi

# Fail early with a clear message instead of deep inside electron-builder.
require() {
  local missing=0 v
  for v in "$@"; do
    if [[ -z "${!v:-}" ]]; then echo "✗ missing $v (set it in $ENV_FILE)" >&2; missing=1; fi
  done
  [[ $missing -eq 0 ]] || exit 1
}

publish_mac() {
  require GH_TOKEN APPLE_API_KEY APPLE_API_KEY_ID APPLE_API_ISSUER APPLE_TEAM_ID
  [[ -f "$APPLE_API_KEY" ]] || { echo "✗ APPLE_API_KEY file not found: $APPLE_API_KEY" >&2; exit 1; }
  echo "==> macOS: sign (Developer ID) → notarize → staple → publish"
  npm run dist:publish:mac
}

publish_win() {
  require GH_TOKEN
  echo "==> Windows: NSIS installer → publish"
  npm run dist:publish:win
}

publish_linux() {
  require GH_TOKEN
  echo "==> Linux: AppImage → publish"
  echo "    (needs a Linux toolchain; node-pty has no prebuild for Linux, so"
  echo "     this fails on macOS — build on Linux or via the electron-builder"
  echo "     Docker image. See scripts/release.env.example.)"
  npm run dist:publish:linux
}

case "${1:-}" in
  mac)   publish_mac ;;
  win)   publish_win ;;
  linux) publish_linux ;;
  all)   publish_mac; publish_win ;;   # linux can't build on macOS; run it separately
  *)     echo "usage: $0 {mac|win|linux|all}" >&2; exit 1 ;;
esac

echo "✓ done: $1"
