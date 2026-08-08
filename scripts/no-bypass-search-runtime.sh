#!/usr/bin/env bash
# @script-class: gate
# @run-by: .github/workflows/ci.yml (job no-bypass-search-runtime). Reads
#     no-bypass-search-runtime.allowlist.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# TOOL PRECONDITION (red-team P0, 2026-08-02; hoisted into the shared library by
# F8900, 2026-08-07): every check below ran `rg … || true`, which turns "rg not
# installed" (exit 127) into an EMPTY match set → count=0 → PASS. ripgrep ships
# on GH ubuntu-latest but is NOT installed on this dev machine, so every LOCAL
# run of this guard was a guaranteed green having verified NOTHING — a guard
# that lies exactly where the developer looks at it. This gate was the FIRST
# instance of the class; scripts/lib/gate-runner.sh is now its permanent owner.
source "$SCRIPT_DIR/lib/gate-runner.sh"
gate_init no-bypass accumulate
gate_require_tool rg
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ALLOWLIST_PATH="${1:-$SCRIPT_DIR/no-bypass-search-runtime.allowlist}"

if [[ ! -f "$ALLOWLIST_PATH" ]]; then
  echo "Allowlist not found: $ALLOWLIST_PATH" >&2
  exit 1
fi

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
    gate_note_failure
    continue
  fi

  # rg exits 1 for "no matches" (fine) but >1 for a REAL error (bad pcre2
  # pattern, unreadable file). Only the former may become an empty result —
  # swallowing the latter is how a broken check reports PASS. gate_scan is the
  # library primitive that hands back BOTH the match text and the raw status so
  # this loop can compare a count against the allowlist maximum.
  gate_scan "$pattern" --pcre2 "$target_path"
  if [[ "$GATE_STATUS" -gt 1 ]]; then
    echo "[no-bypass] FAIL $id: rg errored (exit $GATE_STATUS) — check not performed." >&2
    echo "$GATE_OUT" >&2
    gate_note_failure
    continue
  fi
  matches="$GATE_OUT"
  count="$(gate_count_lines "$matches")"

  if [[ "$count" -gt "$max_count" ]]; then
    echo "[no-bypass] FAIL $id: count=$count max=$max_count ($description)" >&2
    echo "$matches" >&2
    gate_note_failure
  else
    gate_pass "$id: count=$count max=$max_count"
  fi
done < "$ALLOWLIST_PATH"

if [[ "$checks" -eq 0 ]]; then
  echo "No no-bypass checks loaded from allowlist: $ALLOWLIST_PATH" >&2
  exit 1
fi

GATE_CHECKS="$checks"
gate_summary "OK ($checks checks)."
