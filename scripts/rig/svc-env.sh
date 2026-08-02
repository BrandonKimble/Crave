#!/usr/bin/env bash
# Source this, don't run it:  source scripts/rig/svc-env.sh
#
# Loads every service credential from the repo's .env files into the current
# shell and derives the composite vars the CLIs expect. This is the ONE way
# service credentials enter a command — no `<tool> login`, no ~/.config
# credential files, no key ever pasted on a command line.
#
# Why: a stateful login duplicates a secret that already lives in .env, then
# silently drifts when the .env rotates. Env-sourcing has one source of truth
# and works identically in CI.
#
# GOTCHA this file exists to solve: these .env files contain unquoted values
# with spaces (e.g. CLERK_ADMIN_USER_IDS=id_a, id_b). A plain `. .env` makes
# the shell execute the second token as a COMMAND — you get
# "command not found: <id>" and a truncated value. So we parse, never source.

_svc_load_env() {
  [ -f "$1" ] || return 0
  local line name value
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|'#'*) continue ;;
      *'='*) ;;
      *) continue ;;
    esac
    line="${line#export }"
    name="${line%%=*}"
    value="${line#*=}"
    # only well-formed keys
    case "$name" in
      *[!A-Za-z0-9_]*|'') continue ;;
    esac
    # strip one layer of matching surrounding quotes
    case "$value" in
      \"*\") value="${value#\"}"; value="${value%\"}" ;;
      \'*\') value="${value#\'}"; value="${value%\'}" ;;
    esac
    export "$name=$value"
  done < "$1"
}

_SVC_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -n "$_SVC_ROOT" ] || _SVC_ROOT="$HOME/Crave/Crave"

_svc_load_env "$_SVC_ROOT/apps/api/.env"
_svc_load_env "$_SVC_ROOT/apps/mobile/.env"

# --- derived / aliased vars the CLIs read natively ---------------------------

# cloudinary-cli (`cld`) reads CLOUDINARY_URL only.
if [ -n "${CLOUDINARY_API_KEY:-}" ]; then
  export CLOUDINARY_URL="cloudinary://${CLOUDINARY_API_KEY}:${CLOUDINARY_API_SECRET}@${CLOUDINARY_CLOUD_NAME}"
fi

# stripe CLI: --api-key is explicit per call (see references/stripe.md); this
# alias exists so `$STRIPE_KEY` is short at the call site.
export STRIPE_KEY="${STRIPE_SECRET_KEY:-}"

# mapbox token lives in the mobile env under an EXPO_PUBLIC_ prefix.
export MAPBOX_TOKEN="${EXPO_PUBLIC_MAPBOX_TOKEN:-}"

# pipx-installed CLIs (cld) land in ~/.local/bin.
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$HOME/.local/bin:$PATH" ;; esac

unset -f _svc_load_env
unset _SVC_ROOT
