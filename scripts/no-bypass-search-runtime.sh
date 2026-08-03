#!/usr/bin/env bash
# @script-class: gate
# @run-by: .github/workflows/ci.yml (job no-bypass-search-runtime). Reads
#     no-bypass-search-runtime.allowlist.
set -euo pipefail

# TOOL PRECONDITION (red-team P0, 2026-08-02): every check below ran
# `rg … || true`, which turns "rg not installed" (exit 127) into an EMPTY
# match set → count=0 → PASS. ripgrep ships on GH ubuntu-latest but is NOT
# installed on this dev machine, so every LOCAL run of this guard was a
# guaranteed green having verified NOTHING — a guard that lies exactly where
# the developer looks at it. Missing tooling is a FAILURE, never a pass.
if ! command -v rg >/dev/null 2>&1; then
  echo "[no-bypass] FAIL: ripgrep (rg) is not installed — this guard cannot verify anything." >&2
  echo "  Install it (brew install ripgrep) and re-run; refusing to report a green that means nothing." >&2
  exit 1
fi

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

  # rg exits 1 for "no matches" (fine) but >1 for a REAL error (bad pcre2
  # pattern, unreadable file). Only the former may become an empty result —
  # swallowing the latter is how a broken check reports PASS.
  set +e
  matches="$(rg -n --pcre2 "$pattern" "$target_path")"
  rg_status=$?
  set -e
  if [[ "$rg_status" -gt 1 ]]; then
    echo "[no-bypass] FAIL $id: rg errored (exit $rg_status) — check not performed." >&2
    failures=$((failures + 1))
    continue
  fi
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
