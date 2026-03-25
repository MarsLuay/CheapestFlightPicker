#!/usr/bin/env bash
set -euo pipefail

LAUNCHER_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_URL="https://github.com/MarsLuay/CheapestFlightPicker.git"
REPO_DIR="$LAUNCHER_DIR"
STANDALONE_REPO_DIR="$LAUNCHER_DIR/CheapestFlightPicker"

run_with_optional_sudo() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    "$@"
  fi
}

install_toolchain() {
  if command -v brew >/dev/null 2>&1; then
    echo "Installing missing packages with Homebrew..."
    brew install git node
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    echo "Installing missing packages with apt-get..."
    run_with_optional_sudo apt-get update
    run_with_optional_sudo apt-get install -y git nodejs npm
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    echo "Installing missing packages with dnf..."
    run_with_optional_sudo dnf install -y git nodejs npm
    return
  fi

  if command -v yum >/dev/null 2>&1; then
    echo "Installing missing packages with yum..."
    run_with_optional_sudo yum install -y git nodejs npm
    return
  fi

  if command -v pacman >/dev/null 2>&1; then
    echo "Installing missing packages with pacman..."
    run_with_optional_sudo pacman -Sy --noconfirm git nodejs npm
    return
  fi

  if command -v zypper >/dev/null 2>&1; then
    echo "Installing missing packages with zypper..."
    run_with_optional_sudo zypper --non-interactive install git nodejs npm
    return
  fi

  if command -v apk >/dev/null 2>&1; then
    echo "Installing missing packages with apk..."
    run_with_optional_sudo apk add git nodejs npm
    return
  fi

  echo "Could not find a supported package manager to install git, node, and npm automatically."
  exit 1
}

ensure_command() {
  local command_name="$1"
  local display_name="$2"

  if command -v "$command_name" >/dev/null 2>&1; then
    return
  fi

  echo "$display_name was not found. Trying to install the missing toolchain..."
  install_toolchain

  if command -v "$command_name" >/dev/null 2>&1; then
    return
  fi

  echo "$display_name still was not found after the install attempt."
  echo "Install it manually, then run this launcher again."
  exit 1
}

ensure_command git "git"
ensure_command node "Node.js"
ensure_command npm "npm"

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

echo "Installing dependencies..."
npm install

echo "Running typecheck and tests..."
npm run check
npm run test

echo "Building server and web app..."
npm run build

echo "Build complete."
