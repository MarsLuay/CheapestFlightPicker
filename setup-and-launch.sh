#!/usr/bin/env bash
set -euo pipefail

LAUNCHER_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_URL="https://github.com/MarsLuay/CheapestFlightPicker.git"
REPO_DIR="$LAUNCHER_DIR"
STANDALONE_REPO_DIR="$LAUNCHER_DIR/CheapestFlightPicker"
APP_URL="http://localhost:8787"
HEALTH_URL="$APP_URL/api/health"
APP_START_MODE="existing"
APP_LOG_DIR=""
APP_LOG_FILE=""
APP_PID_FILE=""

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
  hash -r

  if command -v "$command_name" >/dev/null 2>&1; then
    return
  fi

  echo "$display_name still was not found after the install attempt."
  echo "Install it manually, then run this launcher again."
  exit 1
}

is_app_healthy() {
  if command -v curl >/dev/null 2>&1; then
    curl --silent --fail --max-time 5 --output /dev/null "$HEALTH_URL"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget --quiet --spider --timeout=5 --tries=1 "$HEALTH_URL"
    return
  fi

  node -e 'const http = require("node:http"); const url = process.argv[1]; const request = http.get(url, (response) => { response.resume(); process.exit(response.statusCode === 200 ? 0 : 1); }); request.on("error", () => process.exit(1)); request.setTimeout(5000, () => { request.destroy(); process.exit(1); });' "$HEALTH_URL"
}

wait_for_app_ready() {
  local deadline=$((SECONDS + 30))

  until is_app_healthy; do
    if (( SECONDS >= deadline )); then
      return 1
    fi

    sleep 0.5
  done
}

open_browser() {
  local url="$1"

  case "$(uname -s)" in
    Darwin*)
      if command -v open >/dev/null 2>&1; then
        open "$url" >/dev/null 2>&1 && return 0
      fi
      ;;
    Linux*)
      if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$url" >/dev/null 2>&1 && return 0
      fi

      if command -v gio >/dev/null 2>&1; then
        gio open "$url" >/dev/null 2>&1 && return 0
      fi

      if command -v sensible-browser >/dev/null 2>&1; then
        sensible-browser "$url" >/dev/null 2>&1 && return 0
      fi
      ;;
  esac

  echo "Could not open your browser automatically. Open $url manually."
  return 1
}

launch_in_terminal() {
  local launch_command="$1"

  case "$(uname -s)" in
    Darwin*)
      if command -v osascript >/dev/null 2>&1; then
        osascript - "$launch_command" <<'APPLESCRIPT' >/dev/null 2>&1
on run argv
  tell application "Terminal"
    activate
    do script (item 1 of argv)
  end tell
end run
APPLESCRIPT
        return 0
      fi
      ;;
    Linux*)
      if [[ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]]; then
        if command -v x-terminal-emulator >/dev/null 2>&1; then
          x-terminal-emulator -e bash -lc "$launch_command" >/dev/null 2>&1 &
          return 0
        fi

        if command -v gnome-terminal >/dev/null 2>&1; then
          gnome-terminal -- bash -lc "$launch_command" >/dev/null 2>&1 &
          return 0
        fi

        if command -v konsole >/dev/null 2>&1; then
          konsole -e bash -lc "$launch_command" >/dev/null 2>&1 &
          return 0
        fi

        if command -v xterm >/dev/null 2>&1; then
          xterm -e bash -lc "$launch_command" >/dev/null 2>&1 &
          return 0
        fi
      fi
      ;;
  esac

  return 1
}

start_app() {
  local launch_command

  APP_LOG_DIR="$APP_DIR/.cache/launcher"
  APP_LOG_FILE="$APP_LOG_DIR/server.log"
  APP_PID_FILE="$APP_LOG_DIR/server.pid"

  printf -v launch_command 'cd %q && exec npm start' "$APP_DIR"

  if launch_in_terminal "$launch_command"; then
    APP_START_MODE="terminal"
    return 0
  fi

  mkdir -p "$APP_LOG_DIR"
  nohup bash -lc "$launch_command" >"$APP_LOG_FILE" 2>&1 < /dev/null &
  echo "$!" >"$APP_PID_FILE"
  APP_START_MODE="background"
  echo "Started the app in the background."
  echo "Logs: $APP_LOG_FILE"
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

echo "Checking for an existing app instance..."
if is_app_healthy; then
  echo "App is already running. Reusing the existing instance."
else
  echo "Launching app..."
  start_app

  if ! wait_for_app_ready; then
    echo "The server did not become ready within 30 seconds."
    if [[ "$APP_START_MODE" == "background" ]]; then
      echo "Check $APP_LOG_FILE for errors."
    else
      echo "Check the server terminal for errors."
    fi
    exit 1
  fi
fi

open_browser "$APP_URL" || true

if [[ "$APP_START_MODE" == "background" ]]; then
  echo "App launched in your browser. Stop the background server with: kill $(<"$APP_PID_FILE")"
elif [[ "$APP_START_MODE" == "terminal" ]]; then
  echo "App launched in your browser. Close the server terminal to stop it."
else
  echo "App launched in your browser. Reusing the existing app instance."
fi
