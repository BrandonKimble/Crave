#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

changed_files="$(git diff --cached --name-only)"

needs_check=0
if command -v rg >/dev/null 2>&1; then
  if echo "$changed_files" | rg -q '^(package\.json|yarn\.lock|apps/[^/]+/package\.json|packages/[^/]+/package\.json)$'; then
    needs_check=1
  fi
else
  if echo "$changed_files" | grep -Eq '^(package\.json|yarn\.lock|apps/[^/]+/package\.json|packages/[^/]+/package\.json)$'; then
    needs_check=1
  fi
fi

if [[ "$needs_check" != "1" ]]; then
  exit 0
fi

echo "deps-check: running knip (dependency hygiene)…"
npx -y knip \
  --workspace 'apps/*' \
  --workspace 'packages/*' \
  --dependencies \
  --no-progress \
  --reporter compact \
  --isolate-workspaces
