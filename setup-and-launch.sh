#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_DIR="$SCRIPT_DIR/workspace"
APP_DIR="$WORKSPACE_DIR/app"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required but was not found on PATH."
  exit 1
fi

if [[ ! -d "$SCRIPT_DIR/.git" ]]; then
  echo "The repo metadata was not found at $SCRIPT_DIR."
  echo "Re-clone the Cheapest Flight Picker repo before running this launcher."
  exit 1
fi

echo "Checking for repo updates..."
if [[ -z "$(git -C "$SCRIPT_DIR" status --porcelain --untracked-files=normal)" ]]; then
  git -C "$SCRIPT_DIR" pull --ff-only origin main
else
  echo "Local changes detected. Skipping auto-update so your work stays untouched."
fi

if [[ ! -f "$APP_DIR/package.json" ]]; then
  echo "workspace/app is missing or incomplete."
  echo "Re-clone the Cheapest Flight Picker repo so the tracked app files are restored."
  exit 1
fi

cd "$APP_DIR"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found on PATH."
  exit 1
fi

echo "Installing dependencies..."
npm install

echo "Running typecheck and tests..."
npm run check
npm run test

echo "Building server and web app..."
npm run build

echo "Build complete."
