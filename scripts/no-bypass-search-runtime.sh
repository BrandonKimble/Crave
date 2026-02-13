#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ALLOWLIST_PATH="${1:-$SCRIPT_DIR/no-bypass-search-runtime.allowlist}"

if [[ ! -f "$ALLOWLIST_PATH" ]]; then
  echo "Allowlist not found: $ALLOWLIST_PATH" >&2
  exit 1
fi

failures=0
checks=0

while IFS='|' read -r id path pattern max_count description; do
  # Skip comments and empty lines.
  if [[ -z "${id// }" ]]; then
    continue
  fi
  if [[ "$id" =~ ^[[:space:]]*# ]]; then
    continue
  fi

  checks=$((checks + 1))

  target_path="$REPO_ROOT/$path"
  if [[ ! -f "$target_path" ]]; then
    echo "[no-bypass] FAIL $id: missing path $path" >&2
    failures=$((failures + 1))
    continue
  fi

  # rg exits non-zero when no matches; convert to zero-match safely.
  matches="$(rg -n --pcre2 "$pattern" "$target_path" || true)"
  if [[ -n "$matches" ]]; then
    count="$(printf '%s\n' "$matches" | wc -l | tr -d ' ')"
  else
    count=0
  fi

  if [[ "$count" -gt "$max_count" ]]; then
    echo "[no-bypass] FAIL $id: count=$count max=$max_count ($description)" >&2
    echo "$matches" >&2
    failures=$((failures + 1))
  else
    echo "[no-bypass] PASS $id: count=$count max=$max_count"
  fi
done < "$ALLOWLIST_PATH"

if [[ "$checks" -eq 0 ]]; then
  echo "No no-bypass checks loaded from allowlist: $ALLOWLIST_PATH" >&2
  exit 1
fi

if [[ "$failures" -gt 0 ]]; then
  echo "[no-bypass] FAILED ($failures checks exceeded allowlist)." >&2
  exit 1
fi

echo "[no-bypass] OK ($checks checks)."
