#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

load_api_env_var() {
  local name="$1"
  if [[ -n "${!name:-}" || ! -f apps/api/.env ]]; then
    return
  fi
  local value
  value="$(
    awk -F= -v key="$name" '
      $1 == key {
        sub(/^[^=]*=/, "")
        print
        exit
      }
    ' apps/api/.env
  )"
  value="${value%$'\r'}"
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"
  if [[ -n "$value" ]]; then
    export "$name=$value"
  fi
}

load_api_env_var TOMTOM_API_KEY
load_api_env_var TOMTOM_API_KEY_DEV
load_api_env_var TOMTOM_API_KEY_PROD
load_api_env_var APP_ENV
load_api_env_var CRAVE_ENV

APP_ENV_VALUE="${APP_ENV:-${CRAVE_ENV:-}}"
if [[ -z "$APP_ENV_VALUE" ]]; then
  if [[ "${NODE_ENV:-development}" == "production" ]]; then
    APP_ENV_VALUE="prod"
  else
    APP_ENV_VALUE="dev"
  fi
fi

APP_ENV_VALUE="$(printf '%s' "$APP_ENV_VALUE" | tr '[:upper:]' '[:lower:]')"
if [[ "$APP_ENV_VALUE" == "prod" || "$APP_ENV_VALUE" == "production" ]]; then
  TOMTOM_SCOPED_KEY="${TOMTOM_API_KEY_PROD:-}"
else
  TOMTOM_SCOPED_KEY="${TOMTOM_API_KEY_DEV:-}"
fi

if ! yarn tomtom-market:health; then
  if [[ -z "${TOMTOM_API_KEY:-}" && -z "$TOMTOM_SCOPED_KEY" ]]; then
    echo "tomtom-market-deploy-gate: TOMTOM_API_KEY or scoped TOMTOM_API_KEY_DEV/PROD is required before migrations when regional market seed repair may be needed" >&2
    exit 1
  fi
fi

yarn workspace api db:migrate:deploy
if yarn tomtom-market:health; then
  echo "tomtom-market-deploy-gate: regional market health already ok; seed skipped"
else
  if [[ -z "${TOMTOM_API_KEY:-}" && -z "$TOMTOM_SCOPED_KEY" ]]; then
    echo "tomtom-market-deploy-gate: TOMTOM_API_KEY or scoped TOMTOM_API_KEY_DEV/PROD is required when regional market seed is needed" >&2
    exit 1
  fi
  yarn workspace api db:seed
  yarn tomtom-market:health
fi

echo "tomtom-market-deploy-gate: ok"
