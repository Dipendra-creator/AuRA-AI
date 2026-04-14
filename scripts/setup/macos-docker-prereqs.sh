#!/usr/bin/env bash
set -euo pipefail

# Installs OCR dependencies + verifies Docker workflow prerequisites on macOS.

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required. Install from https://brew.sh and re-run this script."
  exit 1
fi

brew update

# OCR stack still needed on host because backend executes OCR locally.
brew list tesseract >/dev/null 2>&1 || brew install tesseract
brew list poppler >/dev/null 2>&1 || brew install poppler

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker CLI not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
  exit 1
fi

# Validate daemon availability.
if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but daemon is not running. Start Docker Desktop and re-run."
  exit 1
fi

echo "✅ Docker prerequisites validated."
echo "Next: docker compose up -d mongodb redis --wait"
