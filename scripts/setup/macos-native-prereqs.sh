#!/usr/bin/env bash
set -euo pipefail

# Installs native local dependencies for Aura AI on macOS (no Docker).

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required. Install from https://brew.sh and re-run this script."
  exit 1
fi

brew update

# OCR stack
brew list tesseract >/dev/null 2>&1 || brew install tesseract
brew list poppler >/dev/null 2>&1 || brew install poppler

# MongoDB 7
brew tap mongodb/brew >/dev/null 2>&1 || true
brew list mongodb-community@7.0 >/dev/null 2>&1 || brew install mongodb-community@7.0

# Ensure service is running
brew services start mongodb-community@7.0

echo "✅ Native prerequisites installed."
echo "Next: npm install && cd backend && go mod tidy"
