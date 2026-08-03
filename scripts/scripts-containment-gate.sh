#!/usr/bin/env bash
# @script-class: gate
# @run-by: .github/workflows/ci.yml (job no-bypass-search-runtime).
#
# SCRIPT CONTAINMENT IS A PROPERTY OF THE TREE, NOT OF THE AUTHOR'S MEMORY.
#
# This is the api-side lockdown (apps/api/src/shared/testing/script-containment.spec.ts,
# F414) ported one directory over, to root scripts/ — audit D37 / F716.
#
# WHY. Root scripts/ was a flat, undifferentiated bag of 57 files mixing four
# unrelated classes: live rig tooling, live build/lint tooling, orphaned gates,
# and dead map-saga scaffolding. NOTHING in a filename distinguished them. That
# is precisely how two defects stayed invisible for months:
#   - app-route-runtime-delete-gate.sh sat 16-checks RED, run by nothing (F702)
#   - the 12-file lod-* cluster parsed a [lodev] event stream no code emits,
#     sitting in scripts/ indistinguishable from live tooling (F709)
# Both were found only by running a repo-wide reference census by hand. This
# gate makes the class a FACT THE TREE CARRIES, so the next census is a grep
# and the next deletion sweep is mechanical instead of a judgement call.
#
# THE FOUR CLASSES. Declared as `@script-class: <c>` in the file's own header,
# on its own line, followed by `@run-by:` naming the runner (or NOTHING):
#
#   operational      — invoked by a runner: package.json, lefthook, a
#                      .claude skill, CLAUDE.md, or another script. The
#                      @run-by line names it.
#   gate             — a static guard that must be able to show RED. If it is
#                      not wired to a runner, @run-by says so and says why.
#   harness          — sim-driven, local/opt-in by design, never CI. Too slow
#                      or too stateful to gate a push.
#   dead-scaffolding — retained but provably driving or parsing something that
#                      no longer exists. A deletion candidate whose @run-by
#                      must state what proved it dead.
#
# THE RULE: a new script declares its class or CI fails. There is no fifth
# option and no silent default — an unclassified script is exactly the
# condition that produced F702 and F709.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

VALID_CLASSES="operational gate harness dead-scaffolding"

# Executable scripts only. Data files (.allowlist, .sql, .json) carry no class.
# (no `mapfile` — macOS ships bash 3.2 and this must run locally, not just in CI)
SCRIPT_FILES=()
while IFS= read -r script_file; do
  SCRIPT_FILES+=("$script_file")
done < <(
  find scripts -type f \
    \( -name '*.sh' -o -name '*.js' -o -name '*.py' -o -name '*.swift' \) \
    | sort
)

# NO-EMPTY-LOOP GREEN. An always-green guard is the disease, not the cure: if
# this scan ever loses the tree, every assertion below becomes vacuously true.
if [[ "${#SCRIPT_FILES[@]}" -lt 40 ]]; then
  echo "scripts-containment-gate: scan found only ${#SCRIPT_FILES[@]} scripts — it has lost the tree; the assertions below would be vacuously green." >&2
  exit 1
fi

undeclared=()
bogus=()
missing_runby=()

for file in "${SCRIPT_FILES[@]}"; do
  head_block="$(head -c 6000 "$file")"
  cls="$(printf '%s' "$head_block" | sed -n 's/.*@script-class:[[:space:]]*\([a-z-]*\).*/\1/p' | head -1)"

  if [[ -z "$cls" ]]; then
    undeclared+=("$file")
    continue
  fi

  if [[ " $VALID_CLASSES " != *" $cls "* ]]; then
    bogus+=("$file: $cls")
    continue
  fi

  if ! printf '%s' "$head_block" | grep -q '@run-by:'; then
    missing_runby+=("$file")
  fi
done

failed=0

if [[ "${#undeclared[@]}" -ne 0 ]]; then
  echo "scripts-containment-gate: every script under scripts/ must declare '@script-class: <c>' in its header. Undeclared:" >&2
  printf '  %s\n' "${undeclared[@]}" >&2
  failed=1
fi

if [[ "${#bogus[@]}" -ne 0 ]]; then
  echo "scripts-containment-gate: declared class must be one of: $VALID_CLASSES. Bogus:" >&2
  printf '  %s\n' "${bogus[@]}" >&2
  failed=1
fi

if [[ "${#missing_runby[@]}" -ne 0 ]]; then
  echo "scripts-containment-gate: a class without a runner is half a fact — every script must also declare '@run-by:' (name the runner, or say NOTHING and why). Missing:" >&2
  printf '  %s\n' "${missing_runby[@]}" >&2
  failed=1
fi

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

echo "scripts-containment-gate: pass (${#SCRIPT_FILES[@]} scripts, all classified)."
