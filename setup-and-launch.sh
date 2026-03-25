#!/usr/bin/env bash
set -euo pipefail

LAUNCHER_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_URL="https://github.com/MarsLuay/CheapestFlightPicker.git"
REPO_DIR="$LAUNCHER_DIR"
STANDALONE_REPO_DIR="$LAUNCHER_DIR/CheapestFlightPicker"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required but was not found on PATH."
  exit 1
fi

if [[ -d "$REPO_DIR/.git" ]]; then
  if [[ ! -f "$REPO_DIR/workspace/app/package.json" ]]; then
    echo "The repo metadata was found at $REPO_DIR, but workspace/app is missing."
    echo "Re-clone the Cheapest Flight Picker repo so the tracked app files are restored."
    exit 1
  fi
else
  REPO_DIR="$STANDALONE_REPO_DIR"
  if [[ ! -d "$REPO_DIR/.git" ]]; then
    if [[ -d "$REPO_DIR" ]] && [[ -n "$(ls -A "$REPO_DIR" 2>/dev/null)" ]]; then
      echo "$REPO_DIR already exists but is not a git clone."
      echo "Move or delete that folder, then run this launcher again."
      exit 1
    fi

    echo "No local repo was found next to this launcher."
    echo "Cloning Cheapest Flight Picker into $REPO_DIR..."
    git clone "$REPO_URL" "$REPO_DIR"
  fi
fi

echo "Checking for repo updates..."
if [[ -z "$(git -C "$REPO_DIR" status --porcelain --untracked-files=normal)" ]]; then
  git -C "$REPO_DIR" pull --ff-only origin main
else
  echo "Local changes detected. Skipping auto-update so your work stays untouched."
fi

WORKSPACE_DIR="$REPO_DIR/workspace"
APP_DIR="$WORKSPACE_DIR/app"

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
