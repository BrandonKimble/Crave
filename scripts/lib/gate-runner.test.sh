#!/usr/bin/env bash
# @script-class: gate
# @run-by: package.json (`yarn gate:lib-test`) and .github/workflows/ci.yml
#     (job no-bypass-search-runtime, step 'Static guard: gate-runner library
#     mutation proof'). Runs on every push, ahead of the gates that depend on it.
#
# THE MUTATION PROOF FOR scripts/lib/gate-runner.sh.
#
# The library exists to kill one defect: a gate that reports GREEN when its tool
# is missing or broken. An untested library making that claim would be the same
# disease one level up — an always-green instrument asserting that nothing can
# be always-green. So every claim it makes is executed here against a DELIBERATE
# mutation, and each mutation must produce RED:
#
#   1. TOOL ABSENT      — run a gate with rg removed from PATH → must FAIL.
#   2. TOOL ABSENT, ban — the negative-ban path specifically (the dangerous
#                         polarity: "no match" is its pass) → must FAIL.
#   3. EXIT 2           — a rotted/invalid regex → must FAIL, not read as clean.
#   4. UNREADABLE PATH  — scanning a path that does not exist → must FAIL.
#   5. GENUINE NO-MATCH — the ONE case that may pass → must PASS.
#   6. GENUINE MATCH    — a banned symbol really present → must FAIL.
#   7. REQUIRED ABSENT  — a required symbol really missing → must FAIL.
#   8. COUNT HELPERS    — gate_count_lines / gate_grep_extract must fail on a
#                         broken grep and stay correct on a legitimate no-match.
#   9. FAIL MODES       — fast exits on the first failure; accumulate reports all.
#
# Test 1/2 are the load-bearing ones: they are the exact condition (`rg` absent
# on this dev machine) under which every local run of no-bypass-search-runtime.sh
# was a guaranteed green over zero files for months.
set -uo pipefail

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$LIB_DIR/gate-runner.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass_count=0
fail_count=0

expect() {
  # expect <expected-exit> <name> <script-body> [PATH override]
  local expected="$1" name="$2" body="$3" path_override="${4:-}"
  local script="$TMP/case.sh"
  {
    echo '#!/usr/bin/env bash'
    echo 'set -euo pipefail'
    echo "source \"$LIB\""
    echo "$body"
  } >"$script"
  local out actual
  if [[ -n "$path_override" ]]; then
    out="$(PATH="$path_override" bash "$script" 2>&1)"
  else
    out="$(bash "$script" 2>&1)"
  fi
  actual=$?
  if [[ "$actual" -eq "$expected" ]]; then
    echo "[gate-runner.test] PASS $name (exit $actual)"
    pass_count=$((pass_count + 1))
  else
    echo "[gate-runner.test] FAIL $name: expected exit $expected, got $actual" >&2
    echo "$out" | sed 's/^/    /' >&2
    fail_count=$((fail_count + 1))
  fi
}

# A tree with a known-present and a known-absent symbol.
mkdir -p "$TMP/tree"
printf 'const liveSymbol = 1;\n' >"$TMP/tree/live.ts"

# A PATH containing the shell essentials but NOT ripgrep. This is the mutation:
# it simulates the machine (and the CI image) where rg is not installed.
mkdir -p "$TMP/nobin"
for tool in bash sed grep cat printf mktemp rm dirname; do
  src="$(command -v "$tool" 2>/dev/null || true)"
  [[ -n "$src" ]] && ln -sf "$src" "$TMP/nobin/$tool"
done
NO_RG_PATH="$TMP/nobin"

# The same mutation for grep: everything the shell needs EXCEPT grep, so the
# counting helpers face a genuinely missing tool rather than a broken PATH.
mkdir -p "$TMP/nogrep"
for tool in bash sed cat printf mktemp rm dirname rg; do
  src="$(command -v "$tool" 2>/dev/null || true)"
  [[ -n "$src" ]] && ln -sf "$src" "$TMP/nogrep/$tool"
done
NO_GREP_PATH="$TMP/nogrep"

if PATH="$NO_RG_PATH" command -v rg >/dev/null 2>&1; then
  echo "[gate-runner.test] FATAL: the rg-free PATH still resolves rg — the tool-absence mutation would be vacuous." >&2
  exit 1
fi

# ── 1. TOOL ABSENT: gate_require_tool must FAIL, loudly. ─────────────────────
expect 1 tool_absent_require_tool_fails \
  'gate_init t fast
gate_require_tool rg
echo "REACHED-THE-SCANS"' \
  "$NO_RG_PATH"

# ── 2. TOOL ABSENT on the BAN path — the dangerous polarity. Without the
#      library, `if rg -q …` here reads "non-zero → no match → clean → PASS".
expect 1 tool_absent_ban_fails_closed \
  "gate_init t fast
gate_ban_absent no_live \"live symbol must be gone\" 'liveSymbol' '$TMP/tree'
gate_summary" \
  "$NO_RG_PATH"

# ── 3. EXIT 2: a rotted pattern (unbalanced bracket) must FAIL, not pass. ────
expect 1 invalid_pattern_ban_fails \
  "gate_init t fast
gate_ban_absent rotted \"banned thing must be gone\" 'unclosed[' '$TMP/tree'
gate_summary"

expect 1 invalid_pattern_require_fails \
  "gate_init t fast
gate_require_present rotted \"required thing must exist\" 'unclosed[' '$TMP/tree'
gate_summary"

# ── 4. UNREADABLE PATH: a scan set that no longer exists is not evidence. ────
expect 1 missing_path_ban_fails \
  "gate_init t fast
gate_ban_absent gone \"banned thing must be gone\" 'anything' '$TMP/tree/does-not-exist'
gate_summary"

# ── 5. GENUINE NO-MATCH: the only status that may be read as evidence. ───────
expect 0 genuine_no_match_passes \
  "gate_init t fast
gate_ban_absent absent_ok \"deleted symbol must stay deleted\" 'deletedSymbol' '$TMP/tree'
gate_summary"

# ── 6/7. The gate's DESIGNED failures still fire. ────────────────────────────
expect 1 real_banned_symbol_fails \
  "gate_init t fast
gate_ban_absent live_present \"live symbol is banned\" 'liveSymbol' '$TMP/tree'
gate_summary"

expect 1 real_missing_required_fails \
  "gate_init t fast
gate_require_present needed \"required symbol must exist\" 'neverWrittenSymbol' '$TMP/tree'
gate_summary"

expect 0 real_present_required_passes \
  "gate_init t fast
gate_require_present needed \"required symbol must exist\" 'liveSymbol' '$TMP/tree'
gate_summary"

# ── 8. COUNT + EXTRACT helpers. ──────────────────────────────────────────────
expect 0 count_lines_counts_correctly \
  'gate_init t fast
n="$(gate_count_lines "$(printf "a\nb\n\nc")")"
[[ "$n" == "3" ]] || { echo "expected 3, got $n"; exit 9; }
z="$(gate_count_lines "")"
[[ "$z" == "0" ]] || { echo "expected 0, got $z"; exit 9; }'

expect 1 count_lines_fails_without_grep \
  'gate_init t fast
gate_count_lines "anything"' \
  "$NO_GREP_PATH"

expect 0 scan_count_counts_matches \
  "gate_init t fast
n=\"\$(gate_scan_count 'liveSymbol' '$TMP/tree')\"
[[ \"\$n\" == \"1\" ]] || { echo \"expected 1, got \$n\"; exit 9; }
z=\"\$(gate_scan_count 'nothingHere' '$TMP/tree')\"
[[ \"\$z\" == \"0\" ]] || { echo \"expected 0, got \$z\"; exit 9; }"

expect 1 scan_count_fails_without_rg \
  "gate_init t fast
gate_scan_count 'liveSymbol' '$TMP/tree'" \
  "$NO_RG_PATH"

expect 0 grep_extract_empty_on_no_match \
  'gate_init t fast
v="$(gate_grep_extract "no trailer here" -oE "STATUS: [A-Z]+")"
[[ -z "$v" ]] || { echo "expected empty, got $v"; exit 9; }
w="$(gate_grep_extract "row STATUS: FIXED" -oE "STATUS: [A-Z]+")"
[[ "$w" == "STATUS: FIXED" ]] || { echo "expected STATUS: FIXED, got $w"; exit 9; }'

# ── 9. FAIL MODES. ───────────────────────────────────────────────────────────
expect 1 fast_mode_exits_on_first_failure \
  "gate_init t fast
gate_ban_absent one \"banned\" 'liveSymbol' '$TMP/tree'
echo SHOULD-NOT-REACH
gate_summary"

expect 0 accumulate_mode_reports_every_failure \
  "gate_init t accumulate
gate_ban_absent one \"banned\" 'liveSymbol' '$TMP/tree'
gate_ban_absent two \"banned\" 'liveSymbol' '$TMP/tree'
[[ \"\$GATE_FAILURES\" == \"2\" ]] || { echo \"expected 2 failures, got \$GATE_FAILURES\"; exit 9; }"

# The fast-mode case above must not have printed SHOULD-NOT-REACH; prove it.
{
  echo '#!/usr/bin/env bash'
  echo 'set -euo pipefail'
  echo "source \"$LIB\""
  echo 'gate_init t fast'
  echo "gate_ban_absent one \"banned\" 'liveSymbol' '$TMP/tree'"
  echo 'echo SHOULD-NOT-REACH'
} >"$TMP/fastcase.sh"
fast_out="$(bash "$TMP/fastcase.sh" 2>&1 || true)"
if printf '%s' "$fast_out" | grep -q 'SHOULD-NOT-REACH'; then
  echo "[gate-runner.test] FAIL fast_mode_stops_the_script: execution continued past a failure" >&2
  fail_count=$((fail_count + 1))
else
  echo "[gate-runner.test] PASS fast_mode_stops_the_script"
  pass_count=$((pass_count + 1))
fi

# NO-EMPTY-LOOP GREEN: this test file's own floor. If a refactor drops cases,
# a shrunken-but-passing suite must not read as proof.
if [[ "$pass_count" -lt 16 ]]; then
  echo "[gate-runner.test] FAIL: only ${pass_count} cases ran — the suite has lost its cases, so a green here proves nothing." >&2
  exit 1
fi

if [[ "$fail_count" -gt 0 ]]; then
  echo "[gate-runner.test] FAILED (${fail_count} of $((pass_count + fail_count)) cases)." >&2
  exit 1
fi

echo "[gate-runner.test] OK (${pass_count} cases — tool absence, exit 2, unreadable path, and genuine matches all produce RED)."
