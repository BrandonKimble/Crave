#!/usr/bin/env bash
# @script-class: library
# @run-by: sourced by the shell gates under scripts/ —
#     app-route-runtime-delete-gate.sh, crave-score-cutover-delete-gate.sh,
#     search-results-prepared-rows-delete-gate.sh, ios-camera-symbol-gate.sh,
#     no-bypass-search-runtime.sh, mobile-native-authority-gate.sh,
#     scripts-containment-gate.sh, audit-coverage-ledger-gate.sh,
#     findings-ledger-gate.sh, deps-check.sh. It runs whenever they do.
#     Its own mutation proof is scripts/lib/gate-runner.test.sh
#     (`yarn gate:lib-test`, wired into .github/workflows/ci.yml job
#     no-bypass-search-runtime).
#
# ─────────────────────────────────────────────────────────────────────────────
# THE TOOL-ABSENCE SWALLOW, KILLED BY CONSTRUCTION (F8900, 2026-08-07)
# ─────────────────────────────────────────────────────────────────────────────
#
# The single most recurrent defect this audit found — four separate findings
# (F8500, F8700, F8800, and the 2026-08-02 red-team P0) — is one sentence:
#
#     a shell gate that treats a TOOL FAILURE as "no match, therefore clean".
#
# Two shapes produce it, and both read as ordinary, careful bash:
#
#     if rg -q "$banned" src/; then fail; fi        # exit 2 (bad regex) and
#                                                  # 127 (rg absent) are both
#                                                  # non-zero → the ban PASSES
#
#     count="$(rg -c "$banned" src/ || true)"       # 127 → empty → count 0 →
#                                                  # the ban PASSES
#
# In both, the gate reports green having scanned NOTHING, precisely where a
# developer looks at it for reassurance. On this dev machine ripgrep was not
# installed for months, so every local run of no-bypass-search-runtime.sh was a
# guaranteed green over zero files. Each finding was patched one gate at a time,
# and each patch re-typed the same 20-line status-discriminating helper — six
# near-identical copies, which is a convention, not a mechanism. This file is
# the mechanism: the vocabulary below has no shape in which a broken tool can
# produce a pass, so a gate written with it cannot regress into the class.
#
# THE CONTRACT every scan here obeys:
#     rg exit 0  → matches found
#     rg exit 1  → no matches found            ← the ONLY status that may be
#                                                interpreted as evidence
#     rg exit 2  → invalid pattern / unreadable path  → GATE FAILS
#     anything   → tool broke or is absent (127)      → GATE FAILS
#
# ─────────────────────────────────────────────────────────────────────────────
# USAGE
# ─────────────────────────────────────────────────────────────────────────────
#
#     source "$(dirname "${BASH_SOURCE[0]}")/lib/gate-runner.sh"
#     gate_init my-gate fast          # or: gate_init my-gate accumulate
#     gate_require_tool rg
#
#     gate_ban_absent      no_legacy_x "legacy X must stay deleted" \
#         'legacyX|LEGACY_X' apps/mobile/src
#     gate_require_present seam_alive "the prepared-rows seam must exist" \
#         'PreparedRows' apps/mobile/src
#
#     gate_summary                    # prints the tally; exits 1 if any failed
#
# TWO FAILURE MODES, both fail-closed:
#   fast        — the first failure exits 1 immediately. Use when the checks are
#                 a chain and the first broken link is the whole story.
#   accumulate  — failures are counted and reported together by gate_summary.
#                 Use when a human wants the full list in one run.
# `gate_require_tool` is fatal in BOTH modes: a gate that cannot scan has no
# result to accumulate.
#
# ─────────────────────────────────────────────────────────────────────────────

# Guard against double-sourcing (a gate that sources this twice would reset its
# counters mid-run and under-report failures).
if [[ -n "${GATE_RUNNER_SOURCED:-}" ]]; then
  return 0 2>/dev/null || true
fi
GATE_RUNNER_SOURCED=1

GATE_NAME="${GATE_NAME:-gate}"
GATE_MODE="${GATE_MODE:-fast}"
GATE_FAILURES=0
GATE_CHECKS=0
# Last capture: set by gate_capture / the scan helpers.
GATE_OUT=""
GATE_STATUS=0

# gate_init <name> [fast|accumulate]
gate_init() {
  GATE_NAME="$1"
  GATE_MODE="${2:-fast}"
  if [[ "$GATE_MODE" != "fast" && "$GATE_MODE" != "accumulate" ]]; then
    echo "[gate-runner] FATAL: unknown gate mode '$GATE_MODE' (expected fast|accumulate)" >&2
    exit 1
  fi
  GATE_FAILURES=0
  GATE_CHECKS=0
}

# gate_require_tool <tool>... — ALWAYS fatal. Missing tooling is a failure,
# never a pass: there is no partial result to accumulate from a scan that could
# not run. This is the guard whose absence produced the whole defect class.
gate_require_tool() {
  local tool missing=0
  for tool in "$@"; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      echo "[$GATE_NAME] FAIL: \`$tool\` is not installed — this gate cannot verify anything." >&2
      missing=1
    fi
  done
  if [[ "$missing" -ne 0 ]]; then
    echo "[$GATE_NAME] Refusing to report a green that means nothing. Install the missing tool(s) and re-run (e.g. brew install ripgrep)." >&2
    exit 1
  fi
}

# gate_fail <message...> — mode-aware failure. In fast mode this exits 1.
gate_fail() {
  echo "[$GATE_NAME] FAIL: $*" >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
  if [[ "$GATE_MODE" == "fast" ]]; then
    exit 1
  fi
}

# gate_fail_hard <message...> — exits 1 regardless of mode. For preconditions
# (a missing ledger, an unparseable rules file) where continuing would make
# every later check vacuous.
gate_fail_hard() {
  echo "[$GATE_NAME] FAIL: $*" >&2
  exit 1
}

# gate_note_failure — increment the tally from a hand-rolled call site that
# already printed its own message. Kept so bespoke checks inside an accumulate
# gate share ONE counter with the helpers (two counters silently under-report).
gate_note_failure() {
  GATE_FAILURES=$((GATE_FAILURES + 1))
}

gate_pass() {
  echo "[$GATE_NAME] PASS $*"
}

# gate_capture <cmd> [args...] — run a command with `set -e` suspended, storing
# its combined output in GATE_OUT and its exit status in GATE_STATUS. Callers
# MUST discriminate GATE_STATUS; this helper deliberately does not decide.
gate_capture() {
  set +e
  GATE_OUT="$("$@" 2>&1)"
  GATE_STATUS=$?
  set -e
}

# gate_scan <pattern> <rg-args-and-paths...> — the raw scanning primitive, for
# gates that need the match TEXT as well as the verdict (e.g. an allowlist gate
# comparing a count against a per-check maximum). It sets GATE_OUT / GATE_STATUS
# and decides nothing; the caller MUST discriminate GATE_STATUS, where anything
# other than 0 or 1 means the scan did not run.
#
# NOTE ON COMMAND SUBSTITUTION: helpers that PRINT a value (gate_scan_count,
# gate_count_lines, gate_extract_count) are normally used as `x="$(helper …)"`,
# which runs them in a subshell — a fatal `exit 1` inside would only kill that
# subshell. They stay sound because the non-zero status propagates to the
# assignment and `set -euo pipefail` (which every gate here sets) aborts the
# script. Do not use them with `|| true`; that is the exact swallow this library
# exists to prevent.
gate_scan() {
  _gate_scan "$@"
}

# _gate_scan <pattern> <rg-args-and-paths...> — the single scanning primitive.
# Everything else is polarity and reporting on top of it.
_gate_scan() {
  local pattern="$1"
  shift
  set +e
  GATE_OUT="$(rg -n "$@" -e "$pattern" 2>&1)"
  GATE_STATUS=$?
  set -e
}

# _gate_report_tool_break <id> <pattern> <what> — the shared exit-2/other arm.
_gate_report_tool_break() {
  local id="$1" pattern="$2" what="$3"
  if [[ "$GATE_STATUS" -eq 2 ]]; then
    echo "[$GATE_NAME] FAIL $id: invalid rg pattern (\`$pattern\`) or unreadable path — the $what did not run." >&2
  else
    echo "[$GATE_NAME] FAIL $id: rg exited with status $GATE_STATUS — the $what was NOT performed." >&2
  fi
  echo "$GATE_OUT" >&2
  GATE_FAILURES=$((GATE_FAILURES + 1))
  if [[ "$GATE_MODE" == "fast" ]]; then
    exit 1
  fi
}

# gate_ban_absent <id> <description> <pattern> <rg-args-and-paths...>
#   A NEGATIVE ban: the banned symbol must not exist. Only rg exit 1 passes.
#     0 → banned symbol present → FAIL
#     1 → absent                → PASS
#     2 → invalid pattern       → FAIL (the scan did not run)
#     * → tool broke / absent   → FAIL
gate_ban_absent() {
  local id="$1" description="$2" pattern="$3"
  shift 3
  GATE_CHECKS=$((GATE_CHECKS + 1))
  _gate_scan "$pattern" "$@"
  if [[ "$GATE_STATUS" -eq 1 ]]; then
    gate_pass "$id"
  elif [[ "$GATE_STATUS" -eq 0 ]]; then
    echo "[$GATE_NAME] FAIL $id: $description" >&2
    echo "$GATE_OUT" >&2
    GATE_FAILURES=$((GATE_FAILURES + 1))
    if [[ "$GATE_MODE" == "fast" ]]; then
      exit 1
    fi
  else
    _gate_report_tool_break "$id" "$pattern" "ban on '$description'"
  fi
}

# gate_require_present <id> <description> <pattern> <rg-args-and-paths...>
#   The inverted twin: the symbol MUST exist. Only rg exit 0 passes; exit 1 is
#   the designed failure, and 2/other are reported DISTINCTLY so a rotted
#   pattern is never misread as a genuinely missing symbol.
gate_require_present() {
  local id="$1" description="$2" pattern="$3"
  shift 3
  GATE_CHECKS=$((GATE_CHECKS + 1))
  _gate_scan "$pattern" "$@"
  if [[ "$GATE_STATUS" -eq 0 ]]; then
    gate_pass "$id"
  elif [[ "$GATE_STATUS" -eq 1 ]]; then
    echo "[$GATE_NAME] FAIL $id: $description" >&2
    GATE_FAILURES=$((GATE_FAILURES + 1))
    if [[ "$GATE_MODE" == "fast" ]]; then
      exit 1
    fi
  else
    _gate_report_tool_break "$id" "$pattern" "required-symbol check for '$description'"
  fi
}

# gate_scan_count <pattern> <rg-args-and-paths...> — echo the number of matching
# lines, with the same exit-status discrimination. A tool break FAILS the gate
# rather than returning 0 (the `rg -c … || true` swallow, closed).
# Prints the count on stdout; callers use it in a command substitution.
gate_scan_count() {
  local pattern="$1"
  shift
  _gate_scan "$pattern" "$@"
  if [[ "$GATE_STATUS" -eq 1 ]]; then
    printf '0\n'
    return 0
  fi
  if [[ "$GATE_STATUS" -ne 0 ]]; then
    _gate_report_tool_break "scan_count" "$pattern" "match count"
    printf '0\n'
    return 0
  fi
  printf '%s\n' "$GATE_OUT" | _gate_count_nonempty
}

# _gate_count_nonempty — count non-empty lines from stdin, discriminating grep's
# OWN exit status. grep -c exits 1 on zero matches (legitimate: it ran and found
# none) but >1 on a real error; `|| true` flattened both. Only exit 1 is
# swallowed here.
_gate_count_nonempty() {
  local out status
  set +e
  out="$(grep -c . 2>&1)"
  status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    printf '%s\n' "$out"
  elif [[ "$status" -eq 1 ]]; then
    printf '0\n'
  else
    echo "[$GATE_NAME] FAIL: \`grep -c\` exited $status while counting — the count is not a fact, so it cannot be compared against a floor." >&2
    echo "$out" >&2
    exit 1
  fi
}

# gate_count_lines <text> — non-empty line count of a string, sound against a
# broken grep. Replaces the repo-wide `printf '%s\n' "$x" | grep -c . || true`.
gate_count_lines() {
  printf '%s\n' "$1" | _gate_count_nonempty
}

# gate_count_matching <text> <grep-args...> — non-empty count of lines in <text>
# matching a grep pattern, same discrimination. Replaces
# `printf … | grep -c '^scripts/' || true`.
gate_count_matching() {
  local text="$1"
  shift
  printf '%s\n' "$text" | gate_count_matching_stdin "$@"
}

# gate_extract_count <extractor> <target> <pattern> — run a binary-inspection
# extractor (nm, strings, otool…) over <target> and count lines matching
# <pattern>. The extractor's own failure is fatal: an extractor that could not
# read the file yields an empty match set, which a NEGATIVE ban would read as
# "banned symbol absent → pass" (F8700).
gate_extract_count() {
  local extractor="$1" target="$2" pattern="$3"
  local raw status
  set +e
  raw="$("$extractor" "$target" 2>/dev/null)"
  status=$?
  set -e
  if [[ "$status" -ne 0 ]]; then
    echo "[$GATE_NAME] FAIL: \`$extractor\` exited $status on $target — cannot inspect the binary; a symbol check that could not run is a failure, never a pass." >&2
    exit 1
  fi
  printf '%s\n' "$raw" | gate_count_matching_stdin "$pattern"
}

# gate_count_matching_stdin <grep-args...> — the stdin form of gate_count_matching.
gate_count_matching_stdin() {
  local out status
  set +e
  out="$(grep -c "$@" 2>&1)"
  status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    printf '%s\n' "$out"
  elif [[ "$status" -eq 1 ]]; then
    printf '0\n'
  else
    echo "[$GATE_NAME] FAIL: \`grep -c $*\` exited $status — the count is not a fact." >&2
    echo "$out" >&2
    exit 1
  fi
}

# gate_grep_quiet <pattern> <grep-args-and-paths...> — a sound `grep -q`.
# Returns 0 (match) / 1 (no match); ANY other grep status fails the gate rather
# than being folded into "no match".
gate_grep_quiet() {
  local out status
  set +e
  out="$(grep -q "$@" 2>&1)"
  status=$?
  set -e
  if [[ "$status" -eq 0 || "$status" -eq 1 ]]; then
    return "$status"
  fi
  echo "[$GATE_NAME] FAIL: \`grep -q $*\` exited $status — the check was NOT performed." >&2
  echo "$out" >&2
  exit 1
}

# gate_grep_extract <text> <grep-args...> — echo the matching parts of <text>.
# grep's exit 1 (ran, matched nothing) yields the empty string; ANY other status
# fails the gate. This is the SOUND form of `… | grep -oE … || true`: that idiom
# is load-bearing under `set -e` (a non-matching grep otherwise kills the script
# before it can report WHICH row is malformed — a gate that cannot say why it
# failed is the same disease as one that cannot fail at all), but `|| true`
# cannot tell exit 1 from exit 2 or 127.
gate_grep_extract() {
  local text="$1"
  shift
  local out status
  set +e
  out="$(printf '%s' "$text" | grep "$@" 2>&1)"
  status=$?
  set -e
  if [[ "$status" -eq 0 ]]; then
    printf '%s\n' "$out"
  elif [[ "$status" -eq 1 ]]; then
    printf ''
  else
    echo "[$GATE_NAME] FAIL: \`grep $*\` exited $status — the extraction did not run." >&2
    echo "$out" >&2
    exit 1
  fi
}

# gate_require_floor <label> <count> <floor> — the NO-EMPTY-LOOP-GREEN assertion,
# named once. A parse that has lost its table makes every downstream check
# vacuously true; the floor is what turns that into RED.
gate_require_floor() {
  local label="$1" count="$2" floor="$3"
  if [[ "$count" -lt "$floor" ]]; then
    gate_fail_hard "parsed only ${count} ${label} (floor ${floor}) — the parse has lost its subject, so every check that follows would be vacuously green."
  fi
}

# gate_summary [success message] — the standard exit protocol.
gate_summary() {
  local success_message="${1:-OK}"
  if [[ "$GATE_FAILURES" -gt 0 ]]; then
    echo "[$GATE_NAME] FAILED ($GATE_FAILURES of $GATE_CHECKS checks)." >&2
    exit 1
  fi
  echo "[$GATE_NAME] $success_message"
  exit 0
}
