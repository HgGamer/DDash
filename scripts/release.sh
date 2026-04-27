#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "error: .env not found. Create one with GH_TOKEN=<your_token>" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

if [ -z "${GH_TOKEN:-}" ]; then
  echo "error: GH_TOKEN not set in .env" >&2
  exit 1
fi

VERSION=$(node -p "require('./package.json').version")
echo "Releasing v${VERSION} for mac + win + linux…"

if ! command -v wine >/dev/null 2>&1 && ! command -v wine64 >/dev/null 2>&1; then
  echo "warning: wine not found — windows NSIS build will likely fail." >&2
  echo "  install with: brew install --cask --no-quarantine wine-stable" >&2
fi

npx electron-vite build
npx electron-builder --mac --win --linux --publish always

REPO="HgGamer/DDash"
TAG="v${VERSION}"
echo "Cleaning up .blockmap assets from ${TAG}…"
RELEASE_JSON=$(curl -sf -H "Authorization: Bearer ${GH_TOKEN}" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/${REPO}/releases/tags/${TAG}")
echo "${RELEASE_JSON}" | node -e '
  const r = JSON.parse(require("fs").readFileSync(0, "utf8"));
  for (const a of r.assets || []) if (a.name.endsWith(".blockmap")) console.log(a.id, a.name);
' | while read -r id name; do
  [ -z "$id" ] && continue
  echo "  deleting ${name}"
  curl -sf -X DELETE -H "Authorization: Bearer ${GH_TOKEN}" "https://api.github.com/repos/${REPO}/releases/assets/${id}" >/dev/null
done
echo "Done."
