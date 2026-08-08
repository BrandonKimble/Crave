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
#   bless            — regenerates a frozen oracle/digest ON PURPOSE, refusing
#                      without an explicit --bless flag (F6604). @run-by names
#                      the human act, never a runner: a bless is never automatic.
#   library          — a module IMPORTED by other scripts, never invoked
#                      directly (scripts/lib/*). @run-by names an importer; it
#                      runs whenever they do.
#
# THE RULE: a new script declares its class or CI fails. There is no silent
# default — an unclassified script is exactly the condition that produced F702
# and F709. New NAMED classes are added here deliberately (bless arrived with
# F6604); what is forbidden is a script with no class, not the vocabulary
# growing to name a real new kind.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# F8900 (2026-08-07): the per-root floors were computed with `grep -c … || true`
# and the per-file class lookup used a bare `grep -q`, whose non-zero-is-no-match
# reading folds a BROKEN grep into "no @run-by declared". Both now go through the
# shared vocabulary, which discriminates grep's exit 1 (ran, found none) from
# anything else (did not run). find/grep/sed are this gate's tools; absent = FAIL.
source "$ROOT_DIR/scripts/lib/gate-runner.sh"
gate_init scripts-containment-gate accumulate
gate_require_tool find grep sed sort

VALID_CLASSES="operational gate harness dead-scaffolding bless library"

# THE FENCE IS EVERY SHELL PROGRAM IN THE REPO, NOT ONE DIRECTORY (F1653, 2026-08-04).
# The scan root used to be `scripts` alone, so the single largest dead script in the repo
# (maestro/perf/map-accept.sh, 470 lines, 100% inoperative — F1651) sat OUTSIDE the fence
# the whole time the fence existed. maestro/ is now scanned too. apps/ is deliberately NOT
# scanned here: apps/api has its own spec-side lockdown
# (apps/api/src/shared/testing/script-containment.spec.ts) and the two stay disjoint by
# EXPLICIT exclusion, not by accident. Adding a new top-level script home means adding it
# to SCAN_ROOTS — the per-root floors below make a forgotten root fail loudly.
SCAN_ROOTS="scripts maestro"

# Executable scripts only. Data files (.allowlist, .sql, .json) carry no class.
# (no `mapfile` — macOS ships bash 3.2 and this must run locally, not just in CI)
SCRIPT_FILES=()
while IFS= read -r script_file; do
  SCRIPT_FILES+=("$script_file")
done < <(
  find $SCAN_ROOTS -type f \
    \( -name '*.sh' -o -name '*.js' -o -name '*.mjs' -o -name '*.py' -o -name '*.swift' \) \
    | sort
)

# NO-EMPTY-LOOP GREEN. An always-green guard is the disease, not the cure: if
# this scan ever loses the tree, every assertion below becomes vacuously true.
# PER-ROOT floors, because a whole-repo total can stay above a single floor while
# one root silently contributes zero (which is exactly how maestro/ went unscanned).
scripts_seen="$(gate_count_matching "$(printf '%s\n' "${SCRIPT_FILES[@]}")" '^scripts/')"
maestro_seen="$(gate_count_matching "$(printf '%s\n' "${SCRIPT_FILES[@]}")" '^maestro/')"
gate_require_floor "scripts under scripts/ (the assertions below would be vacuously green)" "$scripts_seen" 40
gate_require_floor "scripts under maestro/ (the F1653 widening has lost that root; scripts there would be unfenced again)" "$maestro_seen" 1

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

  if ! printf '%s' "$head_block" | gate_grep_quiet '@run-by:'; then
    missing_runby+=("$file")
  fi
done

failed=0

if [[ "${#undeclared[@]}" -ne 0 ]]; then
  echo "scripts-containment-gate: every script under $SCAN_ROOTS must declare '@script-class: <c>' in its header. Undeclared:" >&2
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

GATE_CHECKS="${#SCRIPT_FILES[@]}"
gate_summary "pass (${#SCRIPT_FILES[@]} scripts, all classified)."
