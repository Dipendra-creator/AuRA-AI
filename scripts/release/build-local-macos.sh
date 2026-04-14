#!/usr/bin/env bash
set -euo pipefail

# Professional local release build for macOS.
# Usage:
#   bash scripts/release/build-local-macos.sh docker
#   bash scripts/release/build-local-macos.sh native

MODE="${1:-docker}"

if [[ "$MODE" != "docker" && "$MODE" != "native" ]]; then
  echo "Usage: bash scripts/release/build-local-macos.sh [docker|native]"
  exit 1
fi

echo "▶ Mode: $MODE"

# 1) Ensure JS deps
npm install

# 2) Build backend universal binary for bundling
pushd backend >/dev/null
make build-mac-universal
popd >/dev/null

# 3) Validate runtime prerequisites according to mode
if [[ "$MODE" == "docker" ]]; then
  bash scripts/setup/macos-docker-prereqs.sh
  docker compose up -d mongodb redis --wait
else
  bash scripts/setup/macos-native-prereqs.sh
fi

# 4) Build desktop distributables (DMG + ZIP + PKG if configured)
npm run build:mac

echo "✅ Build complete. Artifacts are in dist/."
