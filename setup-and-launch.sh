#!/usr/bin/env bash
set -euo pipefail

on_setup_exit() {
  local status=$?

  if [[ "$status" -ne 0 && -t 0 ]]; then
    echo
    echo "Setup stopped before the app could launch."
    read -r -p "Press Enter to close this window..." _ || true
  fi
}

trap on_setup_exit EXIT

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case "$SCRIPT_DIR" in
  */*.app/Contents/MacOS | */*.app/Contents/Resources)
    LAUNCHER_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
    ;;
  *)
    LAUNCHER_DIR="$SCRIPT_DIR"
    ;;
esac
REPO_URL="https://github.com/MarsLuay/CheapestFlightPicker.git"
REPO_DIR="$LAUNCHER_DIR"
STANDALONE_REPO_DIR="$LAUNCHER_DIR/CheapestFlightPicker"
APP_URL="http://localhost:8787"
HEALTH_URL="$APP_URL/api/health"
APP_START_MODE="existing"
APP_LOG_DIR=""
APP_LOG_FILE=""
APP_PID_FILE=""
TOOLCHAIN_INSTALLED=0
LOCAL_NODE_ROOT="${XDG_DATA_HOME:-$HOME/.local/share}/nodejs"

add_common_tool_paths() {
  local candidate

  for candidate in \
    "$LOCAL_NODE_ROOT/current/bin" \
    "$HOME/.local/bin" \
    /opt/homebrew/bin \
    /opt/homebrew/sbin \
    /usr/local/bin \
    /usr/local/sbin; do
    if [[ -d "$candidate" ]]; then
      PATH="$candidate:$PATH"
    fi
  done
}

activate_homebrew() {
  local brew_path

  for brew_path in /opt/homebrew/bin/brew /usr/local/bin/brew; do
    if [[ -x "$brew_path" ]]; then
      eval "$("$brew_path" shellenv)"
      return 0
    fi
  done

  return 1
}

install_homebrew() {
  case "$(uname -s)" in
    Darwin*) ;;
    *) return 1 ;;
  esac

  if command -v brew >/dev/null 2>&1 || activate_homebrew; then
    return 0
  fi

  if ! command -v curl >/dev/null 2>&1; then
    echo "Homebrew was not found, and curl is required to install it automatically."
    return 1
  fi

  echo "Homebrew was not found. Installing Homebrew..."
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  activate_homebrew
}

run_with_optional_sudo() {
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    "$@"
  fi
}

try_brew_install() {
  local package="$1"

  if command -v brew >/dev/null 2>&1 || activate_homebrew || install_homebrew; then
    echo "Trying Homebrew..."
    if brew install "$package"; then
      TOOLCHAIN_INSTALLED=1
      return 0
    fi
    echo "Homebrew install failed."
  fi

  return 1
}

try_apt_install() {
  local packages=("$@")

  if ! command -v apt-get >/dev/null 2>&1; then
    return 1
  fi

  echo "Trying apt-get..."
  if run_with_optional_sudo apt-get update && run_with_optional_sudo apt-get install -y "${packages[@]}"; then
    TOOLCHAIN_INSTALLED=1
    return 0
  fi

  echo "apt-get install failed."
  return 1
}

try_dnf_install() {
  local packages=("$@")

  if ! command -v dnf >/dev/null 2>&1; then
    return 1
  fi

  echo "Trying dnf..."
  if run_with_optional_sudo dnf install -y "${packages[@]}"; then
    TOOLCHAIN_INSTALLED=1
    return 0
  fi

  echo "dnf install failed."
  return 1
}

try_yum_install() {
  local packages=("$@")

  if ! command -v yum >/dev/null 2>&1; then
    return 1
  fi

  echo "Trying yum..."
  if run_with_optional_sudo yum install -y "${packages[@]}"; then
    TOOLCHAIN_INSTALLED=1
    return 0
  fi

  echo "yum install failed."
  return 1
}

try_pacman_install() {
  local packages=("$@")

  if ! command -v pacman >/dev/null 2>&1; then
    return 1
  fi

  echo "Trying pacman..."
  if run_with_optional_sudo pacman -Sy --noconfirm "${packages[@]}"; then
    TOOLCHAIN_INSTALLED=1
    return 0
  fi

  echo "pacman install failed."
  return 1
}

try_zypper_install() {
  local packages=("$@")

  if ! command -v zypper >/dev/null 2>&1; then
    return 1
  fi

  echo "Trying zypper..."
  if run_with_optional_sudo zypper --non-interactive install "${packages[@]}"; then
    TOOLCHAIN_INSTALLED=1
    return 0
  fi

  echo "zypper install failed."
  return 1
}

try_apk_install() {
  local packages=("$@")

  if ! command -v apk >/dev/null 2>&1; then
    return 1
  fi

  echo "Trying apk..."
  if run_with_optional_sudo apk add "${packages[@]}"; then
    TOOLCHAIN_INSTALLED=1
    return 0
  fi

  echo "apk install failed."
  return 1
}

try_snap_install() {
  local package="$1"
  shift || true

  if ! command -v snap >/dev/null 2>&1; then
    return 1
  fi

  echo "Trying snap..."
  if run_with_optional_sudo snap install "$package" "$@"; then
    TOOLCHAIN_INSTALLED=1
    return 0
  fi

  echo "snap install failed."
  return 1
}

download_to_file() {
  local url="$1"
  local destination="$2"

  if command -v curl >/dev/null 2>&1; then
    curl --fail --location --silent --show-error "$url" -o "$destination"
    return
  fi

  if command -v wget >/dev/null 2>&1; then
    wget --quiet --output-document="$destination" "$url"
    return
  fi

  echo "curl or wget is required to download $url automatically."
  return 1
}

install_node_from_binary() {
  local os_name cpu_arch node_arch version archive_name url extract_dir install_root

  if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
    return 1
  fi

  if ! command -v tar >/dev/null 2>&1; then
    echo "tar is required to install Node.js from the official binary archive."
    return 1
  fi

  case "$(uname -s)" in
    Darwin*) os_name="darwin" ;;
    Linux*) os_name="linux" ;;
    *) return 1 ;;
  esac

  case "$(uname -m)" in
    x86_64) node_arch="x64" ;;
    arm64 | aarch64) node_arch="arm64" ;;
    *) echo "Unsupported CPU architecture for automatic Node.js install: $(uname -m)"
      return 1 ;;
  esac

  local index_json
  index_json="$(mktemp)"
  if ! download_to_file "https://nodejs.org/dist/index.json" "$index_json"; then
    rm -f "$index_json"
    return 1
  fi

  if command -v python3 >/dev/null 2>&1; then
    version="$(
      python3 - "$index_json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    entries = json.load(handle)

for entry in entries:
    if entry.get("lts"):
        print(entry["version"])
        break
PY
    )"
  else
    version="$(
      awk '
        /"version":/ { match($0, /"version":"([^"]+)"/, version_match); version = version_match[1] }
        /"lts":/ {
          if ($0 !~ /"lts":false/) {
            print version
            exit
          }
        }
      ' "$index_json"
    )"
  fi
  rm -f "$index_json"

  if [[ -z "$version" ]]; then
    echo "Could not determine the current Node.js LTS version."
    return 1
  fi

  archive_name="node-${version}-${os_name}-${node_arch}.tar.xz"
  url="https://nodejs.org/dist/${version}/${archive_name}"
  install_root="$LOCAL_NODE_ROOT"
  extract_dir="$(mktemp -d)"

  echo "Downloading Node.js LTS from nodejs.org..."
  if ! download_to_file "$url" "$extract_dir/$archive_name"; then
    rm -rf "$extract_dir"
    return 1
  fi

  if ! tar -xJf "$extract_dir/$archive_name" -C "$extract_dir"; then
    rm -rf "$extract_dir"
    return 1
  fi

  mkdir -p "$install_root"
  rm -rf "$install_root/current"
  mv "$extract_dir/node-${version}-${os_name}-${node_arch}" "$install_root/current"
  rm -rf "$extract_dir"

  mkdir -p "$HOME/.local/bin"
  ln -sfn "$install_root/current/bin/node" "$HOME/.local/bin/node"
  ln -sfn "$install_root/current/bin/npm" "$HOME/.local/bin/npm"
  ln -sfn "$install_root/current/bin/npx" "$HOME/.local/bin/npx"
  PATH="$install_root/current/bin:$HOME/.local/bin:$PATH"
  TOOLCHAIN_INSTALLED=1
  hash -r
  return 0
}

install_git() {
  if command -v git >/dev/null 2>&1; then
    return 0
  fi

  echo "Git was not found. Trying to install it automatically..."
  try_brew_install git && return 0
  try_apt_install git && return 0
  try_dnf_install git && return 0
  try_yum_install git && return 0
  try_pacman_install git && return 0
  try_zypper_install git && return 0
  try_apk_install git && return 0
  try_snap_install git && return 0

  return 1
}

install_node() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    return 0
  fi

  echo "Node.js or npm was not found. Trying to install Node.js LTS automatically..."
  try_brew_install node && return 0
  try_apt_install nodejs npm && return 0
  try_dnf_install nodejs npm && return 0
  try_yum_install nodejs npm && return 0
  try_pacman_install nodejs npm && return 0
  try_zypper_install nodejs npm && return 0
  try_apk_install nodejs npm && return 0
  try_snap_install node --classic && return 0

  echo "Downloading Node.js LTS from nodejs.org..."
  install_node_from_binary
}

ensure_toolchain() {
  add_common_tool_paths

  local missing_git=0
  local missing_node=0

  command -v git >/dev/null 2>&1 || missing_git=1
  command -v node >/dev/null 2>&1 || missing_node=1
  command -v npm >/dev/null 2>&1 || missing_node=1

  if [[ "$missing_git" -eq 0 && "$missing_node" -eq 0 ]]; then
    return 0
  fi

  echo "Missing setup tools were detected."

  if [[ "$missing_git" -eq 1 ]]; then
    if ! install_git; then
      echo "Failed to install Git automatically."
      echo "Install Git, then run this launcher again."
      exit 1
    fi
  fi

  if [[ "$missing_node" -eq 1 ]]; then
    if ! install_node; then
      echo "Failed to install Node.js LTS automatically."
      echo "Install Node.js LTS, then run this launcher again."
      exit 1
    fi
  fi

  add_common_tool_paths
  hash -r

  if ! command -v git >/dev/null 2>&1 || ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    echo "Git, Node.js, or npm is still not available on PATH."
    if [[ "$TOOLCHAIN_INSTALLED" -eq 1 ]]; then
      echo "Close this terminal, open a new one, and run this launcher again."
    else
      echo "Install the missing tools manually, then run this launcher again."
    fi
    exit 1
  fi
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

ensure_toolchain

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
