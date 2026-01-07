#!/usr/bin/env bash
set -euo pipefail

required_major="22"

ensure_node_22() {
  if command -v node >/dev/null 2>&1; then
    local current_major
    current_major="$(node -p "process.versions.node.split('.')[0]")"
    if [ "$current_major" = "$required_major" ]; then
      return 0
    fi
  fi

  if ! command -v nvm >/dev/null 2>&1; then
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
      # shellcheck disable=SC1090
      . "$NVM_DIR/nvm.sh"
    fi
  fi

  if command -v nvm >/dev/null 2>&1; then
    nvm use "$required_major" >/dev/null 2>&1 || nvm install "$required_major"
  fi

  if ! command -v node >/dev/null 2>&1; then
    echo "lefthook: node is not available; install Node $required_major (recommended: nvm install $required_major)" >&2
    exit 1
  fi

  local current_major
  current_major="$(node -p "process.versions.node.split('.')[0]")"
  if [ "$current_major" != "$required_major" ]; then
    echo "lefthook: Node $required_major is required, got $(node -v). Run: nvm use $required_major" >&2
    exit 1
  fi
}

ensure_node_22
exec "$@"

