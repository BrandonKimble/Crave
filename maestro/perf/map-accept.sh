#!/usr/bin/env bash
# map-accept.sh — probe-asserting acceptance run for the search-map presentation flow
# (search-map-ideal-effort roadmap Step 1: promote the throwaway rework-validate /
# toggle-back-staleness Maestro drives into a durable, trace-asserting acceptance script).
#
# Drives: fresh search reveal -> toggle to dishes -> toggle back -> rapid 8-tap burst -> dismiss
# (maestro/perf/flows/map-accept-drive.yaml + map-accept-dismiss.yaml), then ASSERTS on probe
# output — never screenshots:
#   JS (Metro log slice, pre-dismiss window):
#     js.probe_liveness   [t4dbg] catalogPublish lines exist (guards the stale-bundle gotcha)
#     js.toggle_back_t4   a restaurants publish (published:true, count>0) AFTER dishes appeared
#     js.final_state      last pre-dismiss [t4dbg]: activeTab=restaurants, count>0
#     js.coverage_cache   last completed [tclur] COV-CACHE-HIT agrees (refFeat==resFeat, or a later
#                         [t4dbg] for that tab shows count==resFeat — the hit line logs the
#                         PRE-restore ref, so transient mismatches are healthy)
#   Native (xcrun simctl spawn <udid> log show):
#     native.presramp     the [presramp] reason=reveal_start ramp(s) are monotonic non-decreasing
#                         and at least one reaches opacity>=0.999
#   Informational (never gates): [lbldbg] REVEALCOMMIT union growth + last SELECTOR DROPPED=[],
#     [tclur] TOGGLE-CB intent count, post-dismiss [t4dbg] frame count.
#
# Metro-log windowing: the run marker is written for humans, but Metro's fd is usually NOT
# O_APPEND (launched with '>'), so an externally appended marker can be overwritten by Metro's
# next write. Byte offsets captured around each leg are the authoritative slice boundaries.
#
# Usage:
#   maestro/perf/map-accept.sh [options]
#     --dry-run              print the plan (config, drive steps, assertions) and exit 0
#     --udid <udid>          simulator udid            (env MAP_ACCEPT_UDID)
#     --metro-log <path>     Metro stdout log          (env MAP_ACCEPT_METRO_LOG)
#     --assert-only          skip the drive; assert against the LAST existing run marker in the
#                            Metro log + a native 'log show --last <window>' capture
#     --native-window <w>    native window for --assert-only (default 10m)
#     --freshen-bundle       curl the Metro bundle URL before driving (forces a FULL bundle so a
#                            cold launch doesn't serve stale code; multi-second)
#     --js-slice <file>      offline fixture mode: assert on this pre-captured Metro slice
#     --native-dump <file>   offline fixture mode: assert on this pre-captured os_log dump
#                            (both fixture flags together; no simulator or Maestro involved)
# Defaults: udid 8116E09B-A11F-4AFC-B489-32B4981FC3EB, metro log /tmp/crave-metro-8082.log.
# Exits 0 iff every gating assertion passes; prints a PASS/FAIL summary per assertion.
# Preconditions (drive mode): sim booted, dev-client app FOREGROUNDED on this Metro (the flows do
# not launchApp — a dev-client cold terminate drops to the server picker), maestro CLI + JDK 17.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

UDID="${MAP_ACCEPT_UDID:-8116E09B-A11F-4AFC-B489-32B4981FC3EB}"
METRO_LOG="${MAP_ACCEPT_METRO_LOG:-/tmp/crave-metro-8082.log}"
METRO_PORT="${MAP_ACCEPT_METRO_PORT:-8082}"
NATIVE_WINDOW="${MAP_ACCEPT_NATIVE_WINDOW:-10m}"
DRIVE_FLOW="$REPO_ROOT/maestro/perf/flows/map-accept-drive.yaml"
DISMISS_FLOW="$REPO_ROOT/maestro/perf/flows/map-accept-dismiss.yaml"
MAESTRO_CONFIG="$REPO_ROOT/maestro/perf/config.yaml"

DRY_RUN=0
ASSERT_ONLY=0
FRESHEN_BUNDLE=0
FIXTURE_JS_SLICE=""
FIXTURE_NATIVE_DUMP=""

usage() {
  sed -n '2,44p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --dry-run) DRY_RUN=1; shift ;;
    --assert-only) ASSERT_ONLY=1; shift ;;
    --freshen-bundle) FRESHEN_BUNDLE=1; shift ;;
    --udid) UDID="${2:?--udid needs a value}"; shift 2 ;;
    --metro-log) METRO_LOG="${2:?--metro-log needs a value}"; shift 2 ;;
    --native-window) NATIVE_WINDOW="${2:?--native-window needs a value}"; shift 2 ;;
    --js-slice) FIXTURE_JS_SLICE="${2:?--js-slice needs a value}"; shift 2 ;;
    --native-dump) FIXTURE_NATIVE_DUMP="${2:?--native-dump needs a value}"; shift 2 ;;
    *) echo "[map-accept] unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

FIXTURE_MODE=0
if [[ -n "$FIXTURE_JS_SLICE" || -n "$FIXTURE_NATIVE_DUMP" ]]; then
  if [[ -z "$FIXTURE_JS_SLICE" || -z "$FIXTURE_NATIVE_DUMP" ]]; then
    echo "[map-accept] --js-slice and --native-dump must be provided together." >&2
    exit 2
  fi
  FIXTURE_MODE=1
fi

RUN_ID="$(date +%Y%m%dT%H%M%S)-$$"
ARTIFACT_DIR="${MAP_ACCEPT_ARTIFACT_DIR:-/tmp/map-accept-$RUN_ID}"

# ---------------------------------------------------------------------------
# Dry run: print the plan, touch nothing.
# ---------------------------------------------------------------------------
if [[ "$DRY_RUN" == "1" ]]; then
  cat <<EOF
[map-accept] DRY RUN — plan only, nothing is driven or asserted.

Config:
  udid          = $UDID
  metroLog      = $METRO_LOG
  metroPort     = $METRO_PORT
  driveFlow     = $DRIVE_FLOW
  dismissFlow   = $DISMISS_FLOW
  artifactDir   = $ARTIFACT_DIR
  mode          = $([[ "$FIXTURE_MODE" == "1" ]] && echo fixture || { [[ "$ASSERT_ONLY" == "1" ]] && echo assert-only || echo drive; })

Drive plan (drive mode):
  1. Preconditions: sim booted, Metro log present, maestro CLI + JDK, app foregrounded on Metro :$METRO_PORT.
  2. Write run marker '=== MAP-ACCEPT RUN $RUN_ID BEGIN ===' to the Metro log (human aid);
     capture the log BYTE OFFSET (authoritative window start) + native wall-clock start.
  3. Leg 1 (map-accept-drive.yaml): close any sheets -> home -> camera seed deep link ->
     tap 'Best restaurants' chip (point 32%,16%) -> wait 'Close results' -> toggle to dishes
     (tapOn id search-segment-toggle) -> toggle back -> rapid 8-tap burst -> settle.
  4. Capture the PRE-DISMISS byte offset (final-state assertions stop here).
  5. Leg 2 (map-accept-dismiss.yaml): tap 'Close results' -> settle.
  6. Slice the Metro log by byte offsets; capture native os_log via
     xcrun simctl spawn $UDID log show --start <t0> --predicate '[presramp] OR [lbldbg]'.

Assertions (gating -> exit 1 on any failure):
  driver.maestro     both Maestro legs exit 0
  js.probe_liveness  >=1 '[t4dbg] catalogPublish' line in the pre-dismiss window
  js.toggle_back_t4  a [t4dbg] activeTab=restaurants published=true count>0 line AFTER the first
                     activeTab=dishes line (toggle-back re-published the restaurant catalog)
  js.final_state     LAST pre-dismiss [t4dbg]: activeTab=restaurants AND count>0 (settles non-empty)
  js.coverage_cache  last completed [tclur] COV-CACHE-HIT: refFeat==resFeat, or a later [t4dbg]
                     with activeTab==resTab and count==resFeat (post-restore agreement)
  native.presramp    [presramp] reason=reveal_start ramp(s): >=5 ticks, monotonic non-decreasing
                     (eps 0.0015, ramp-restart tolerant), at least one ramp reaches >=0.999
Informational (reported, never gates):
  [lbldbg] REVEALCOMMIT union non-decreasing; last SELECTOR DROPPED=[]; [tclur] TOGGLE-CB count;
  post-dismiss [t4dbg] frame count.
EOF
  exit 0
fi

# ---------------------------------------------------------------------------
# Result collection
# ---------------------------------------------------------------------------
RESULT_NAMES=()
RESULT_STATUS=()
RESULT_DETAIL=()
INFO_LINES=()

record() { # record <PASS|FAIL|SKIP> <name> <detail>
  RESULT_STATUS+=("$1")
  RESULT_NAMES+=("$2")
  RESULT_DETAIL+=("$3")
}

info() { INFO_LINES+=("$1"); }

# ---------------------------------------------------------------------------
# JS-slice assertions (Metro log window). All greps are -a (binary-safe) and
# quote-tolerant: they accept '"key": "value"' as well as "key: 'value'" so a
# Metro formatter change doesn't silently break the gate.
# ---------------------------------------------------------------------------
T4_RE='\[t4dbg\] catalogPublish'
COV_RE='\[tclur\] COV-CACHE-HIT'

kv_str_re() { printf '"?%s"?: '"'"'?"?%s' "$1" "$2"; }
kv_num_field() { # kv_num_field <key> <line> -> prints the integer or nothing
  printf '%s\n' "$2" | sed -nE 's/.*"?'"$1"'"?: ('"'"'?)(-?[0-9]+).*/\2/p'
}
kv_str_field() { # kv_str_field <key> <line> -> prints the bare string value
  printf '%s\n' "$2" | sed -nE 's/.*"?'"$1"'"?: ["'"'"']?([A-Za-z0-9_-]+).*/\1/p'
}

assert_js() { # assert_js <js_slice_file>
  local slice="$1"

  # js.probe_liveness
  local t4_count
  t4_count="$(grep -acE "$T4_RE" "$slice" || true)"
  if [[ "${t4_count:-0}" -gt 0 ]]; then
    record PASS js.probe_liveness "${t4_count} [t4dbg] catalogPublish lines in the window"
  else
    record FAIL js.probe_liveness "no [t4dbg] lines — stale JS bundle (force a FULL Metro bundle + cold launch), wrong --metro-log, or the probes were stripped"
    record SKIP js.toggle_back_t4 "skipped: no [t4dbg] lines"
    record SKIP js.final_state "skipped: no [t4dbg] lines"
  fi

  if [[ "${t4_count:-0}" -gt 0 ]]; then
    # js.toggle_back_t4 — a restaurants publish AFTER dishes first appeared.
    local first_dish_ln pub_line pub_ln
    first_dish_ln="$(grep -anE "$T4_RE" "$slice" | grep -E "$(kv_str_re activeTab dishes)" | head -1 | cut -d: -f1 || true)"
    if [[ -z "$first_dish_ln" ]]; then
      record FAIL js.toggle_back_t4 "no [t4dbg] activeTab=dishes line — the toggle to dishes never projected (driver miss or toggle broken)"
    else
      pub_line="$(grep -anE "$T4_RE" "$slice" \
        | grep -E "$(kv_str_re activeTab restaurants)" \
        | grep -E "$(kv_str_re published true)" \
        | grep -E '"?count"?: [1-9]' \
        | awk -F: -v m="$first_dish_ln" '$1 > m' | tail -1 || true)"
      if [[ -n "$pub_line" ]]; then
        pub_ln="${pub_line%%:*}"
        record PASS js.toggle_back_t4 "restaurants publish (count=$(kv_num_field count "$pub_line")) at slice line ${pub_ln} > first dishes line ${first_dish_ln}"
      else
        record FAIL js.toggle_back_t4 "no [t4dbg] activeTab=restaurants published=true count>0 line after dishes (line ${first_dish_ln}) — the T4 toggle-back staleness signature"
      fi
    fi

    # js.final_state — last pre-dismiss [t4dbg] settles on restaurants, non-empty.
    local last_t4 final_tab final_count
    last_t4="$(grep -aE "$T4_RE" "$slice" | tail -1)"
    final_tab="$(kv_str_field activeTab "$last_t4")"
    final_count="$(kv_num_field count "$last_t4")"
    if [[ "$final_tab" == "restaurants" && "${final_count:-0}" -gt 0 ]]; then
      record PASS js.final_state "last [t4dbg]: activeTab=restaurants count=${final_count}"
    else
      record FAIL js.final_state "last [t4dbg]: activeTab=${final_tab:-?} count=${final_count:-?} — expected restaurants with count>0 (empty/stuck settle)"
    fi
  fi

  # js.coverage_cache — last completed COV-CACHE-HIT must agree, directly or via a later [t4dbg].
  # NOTE: the probe logs refFeat BEFORE the restore, so transient mismatches on earlier hits are
  # healthy; only the final settled hit is load-bearing.
  local hit hit_ln res_tab res_feat ref_feat later_agree
  hit="$(grep -anE "$COV_RE" "$slice" | grep -E "$(kv_str_re resStatus completed)" | tail -1 || true)"
  if [[ -z "$hit" ]]; then
    record FAIL js.coverage_cache "no completed [tclur] COV-CACHE-HIT in the window — toggle-back should cache-hit (stale bundle, probes stripped, or the drive never toggled back)"
  else
    hit_ln="${hit%%:*}"
    res_tab="$(kv_str_field resTab "$hit")"
    res_feat="$(kv_num_field resFeat "$hit")"
    ref_feat="$(kv_num_field refFeat "$hit")"
    if [[ -n "$res_feat" && "$res_feat" == "$ref_feat" ]]; then
      record PASS js.coverage_cache "last completed COV-CACHE-HIT resTab=${res_tab} resFeat=${res_feat} refFeat=${ref_feat} (agree)"
    else
      later_agree="$(grep -anE "$T4_RE" "$slice" \
        | awk -F: -v ln="$hit_ln" '$1 > ln' \
        | grep -E "$(kv_str_re activeTab "${res_tab:-__none__}")" \
        | grep -E '"?count"?: '"${res_feat:-__none__}"'[^0-9]' | head -1 || true)"
      if [[ -n "$later_agree" ]]; then
        record PASS js.coverage_cache "last completed COV-CACHE-HIT logged pre-restore refFeat=${ref_feat}; a later [t4dbg] ${res_tab} count=${res_feat} confirms the restore landed"
      else
        record FAIL js.coverage_cache "last completed COV-CACHE-HIT resTab=${res_tab} resFeat=${res_feat} vs refFeat=${ref_feat}, and no later [t4dbg] ${res_tab} count=${res_feat} — the features ref never switched (stale coverage)"
      fi
    fi
  fi

  # Informational: TOGGLE-CB intents observed in the window.
  local cb_count
  cb_count="$(grep -acE '\[tclur\] TOGGLE-CB' "$slice" || true)"
  info "js: ${cb_count:-0} [tclur] TOGGLE-CB settle callbacks in the window (drive fires 10 toggle taps)"
}

# ---------------------------------------------------------------------------
# Native assertions (os_log dump).
# ---------------------------------------------------------------------------
assert_native() { # assert_native <native_dump_file>
  local dump="$1"

  # native.presramp — strict triple match so 'log show' meta lines (which echo the predicate,
  # including the literal "[presramp]") can never count as ticks.
  local summary ticks ramps viol reached viol_sample
  summary="$(awk '
    match($0, /\[presramp\] t=[0-9]+ opacity=[0-9.]+ reason=reveal_start/) {
      s = substr($0, RSTART, RLENGTH)
      split(s, parts, " ")
      t = substr(parts[2], 3) + 0
      o = substr(parts[3], 9) + 0
      n++
      # Ramp restart = a big inter-tick time gap (well above the known ~148-196ms mid-fade stalls)
      # or a reset to near-zero (a fresh fade arms at ~0.001). A mid-value drop is NEVER a restart —
      # that is exactly the regression this assertion exists to catch.
      if (n > 1 && (t - pt > 700 || (o < po && o <= 0.1))) {
        ramps++   # ramp restart (new reveal / re-arm), not a violation
      } else if (n > 1 && o < po - 0.0015) {
        viol++
        if (violSample == "") violSample = po " -> " o " at t=" t
      }
      if (o >= 0.999) reached = 1
      pt = t; po = o
    }
    END {
      printf "ticks=%d ramps=%d viol=%d reached=%d sample=%s\n", n, ramps + 1, viol, reached, (violSample == "" ? "-" : violSample)
    }' "$dump")"
  ticks="$(printf '%s' "$summary" | sed -nE 's/.*ticks=([0-9]+).*/\1/p')"
  ramps="$(printf '%s' "$summary" | sed -nE 's/.*ramps=([0-9]+).*/\1/p')"
  viol="$(printf '%s' "$summary" | sed -nE 's/.*viol=([0-9]+).*/\1/p')"
  reached="$(printf '%s' "$summary" | sed -nE 's/.*reached=([0-9]+).*/\1/p')"
  viol_sample="$(printf '%s' "$summary" | sed -nE 's/.*sample=(.*)$/\1/p')"

  if [[ "${ticks:-0}" -lt 5 ]]; then
    record FAIL native.presramp "only ${ticks:-0} [presramp] reveal_start ticks — no reveal ramp captured (stale native binary, lodDebugLoggingEnabled=false, wrong --udid, or the reveal never fired)"
  elif [[ "${viol:-0}" -gt 0 ]]; then
    record FAIL native.presramp "${viol} monotonicity violation(s) across ${ticks} ticks / ${ramps} ramp(s); first: ${viol_sample} — opacity regressed mid-ramp"
  elif [[ "${reached:-0}" != "1" ]]; then
    record FAIL native.presramp "reveal ramp never reached opacity>=0.999 (${ticks} ticks / ${ramps} ramp(s)) — reveal stalled short of full"
  else
    record PASS native.presramp "${ticks} ticks / ${ramps} ramp(s), monotonic non-decreasing, peak >= 0.999"
  fi

  # Informational: [lbldbg] REVEALCOMMIT union growth + last SELECTOR stability (healthy L1
  # signature: union only grows, settled SELECTOR shows DROPPED=[]). Reported, never gates —
  # legitimate demote-drops exist mid-drive.
  local lbl_summary
  lbl_summary="$(awk '
    match($0, /\[lbldbg\] REVEALCOMMIT [^"]*union=[0-9]+/) {
      s = substr($0, RSTART, RLENGTH)
      u = s; sub(/.*union=/, "", u); u += 0
      commits++
      if (prevSet && u < prev) shrinks++
      prev = u; prevSet = 1
    }
    /\[lbldbg\] SELECTOR / { lastSelector = $0 }
    END {
      stable = (lastSelector ~ /DROPPED=\[\]/) ? "yes" : "no"
      if (lastSelector == "") stable = "none-seen"
      printf "commits=%d shrinks=%d lastSelectorStable=%s\n", commits, shrinks, stable
    }' "$dump")"
  info "native: [lbldbg] ${lbl_summary}"
}

# ---------------------------------------------------------------------------
# Summary printer
# ---------------------------------------------------------------------------
print_summary_and_exit() {
  local i status name detail fails=0 total=0
  echo ""
  echo "== map-accept results (run ${RUN_ID}) =="
  # ${#arr[@]} guards keep macOS bash 3.2 (set -u) happy on empty arrays.
  if [[ "${#RESULT_NAMES[@]}" -gt 0 ]]; then
    for i in "${!RESULT_NAMES[@]}"; do
      status="${RESULT_STATUS[$i]}"
      name="${RESULT_NAMES[$i]}"
      detail="${RESULT_DETAIL[$i]}"
      printf '%-4s %-22s %s\n' "$status" "$name" "$detail"
      if [[ "$status" == "FAIL" ]]; then fails=$((fails + 1)); fi
      if [[ "$status" != "SKIP" ]]; then total=$((total + 1)); fi
    done
  fi
  if [[ "${#INFO_LINES[@]}" -gt 0 ]]; then
    for i in "${!INFO_LINES[@]}"; do
      printf 'INFO %s\n' "${INFO_LINES[$i]}"
    done
  fi
  if [[ -d "$ARTIFACT_DIR" ]]; then
    echo "artifacts: $ARTIFACT_DIR"
  fi
  if [[ "$fails" -gt 0 ]]; then
    echo "RESULT: FAIL (${fails}/${total} gating assertions failed)"
    exit 1
  fi
  echo "RESULT: PASS (${total}/${total})"
  exit 0
}

# ---------------------------------------------------------------------------
# Fixture mode: assert on pre-captured files, no simulator involved.
# ---------------------------------------------------------------------------
if [[ "$FIXTURE_MODE" == "1" ]]; then
  [[ -f "$FIXTURE_JS_SLICE" ]] || { echo "[map-accept] --js-slice not found: $FIXTURE_JS_SLICE" >&2; exit 2; }
  [[ -f "$FIXTURE_NATIVE_DUMP" ]] || { echo "[map-accept] --native-dump not found: $FIXTURE_NATIVE_DUMP" >&2; exit 2; }
  record SKIP driver.maestro "fixture mode (--js-slice/--native-dump): no drive performed"
  assert_js "$FIXTURE_JS_SLICE"
  assert_native "$FIXTURE_NATIVE_DUMP"
  print_summary_and_exit
fi

# ---------------------------------------------------------------------------
# Live modes: shared preconditions.
# ---------------------------------------------------------------------------
if [[ ! -f "$METRO_LOG" ]]; then
  echo "[map-accept] Metro log not found: $METRO_LOG (is Metro running with '> $METRO_LOG'?)" >&2
  exit 2
fi
if ! xcrun simctl list devices booted 2>/dev/null | grep -q "$UDID"; then
  echo "[map-accept] simulator $UDID is not booted." >&2
  exit 2
fi

mkdir -p "$ARTIFACT_DIR"
JS_SLICE_FILE="$ARTIFACT_DIR/js-slice.log"
JS_DISMISS_SLICE_FILE="$ARTIFACT_DIR/js-dismiss-slice.log"
NATIVE_DUMP_FILE="$ARTIFACT_DIR/native.log"

capture_native_since() { # capture_native_since <start 'YYYY-MM-DD HH:MM:SS'|""> -> writes NATIVE_DUMP_FILE
  local start_ts="$1"
  if [[ -n "$start_ts" ]]; then
    xcrun simctl spawn "$UDID" log show --start "$start_ts" --style compact \
      --predicate 'eventMessage CONTAINS "[presramp]" OR eventMessage CONTAINS "[lbldbg]"' \
      > "$NATIVE_DUMP_FILE" 2>/dev/null || true
  else
    xcrun simctl spawn "$UDID" log show --last "$NATIVE_WINDOW" --style compact \
      --predicate 'eventMessage CONTAINS "[presramp]" OR eventMessage CONTAINS "[lbldbg]"' \
      > "$NATIVE_DUMP_FILE" 2>/dev/null || true
  fi
}

# ---------------------------------------------------------------------------
# Assert-only: use the LAST existing run marker (best-effort — see the O_APPEND note above)
# and a --last native window.
# ---------------------------------------------------------------------------
if [[ "$ASSERT_ONLY" == "1" ]]; then
  begin_entry="$(grep -an "=== MAP-ACCEPT RUN .* BEGIN" "$METRO_LOG" | tail -1 || true)"
  if [[ -z "$begin_entry" ]]; then
    echo "[map-accept] --assert-only: no '=== MAP-ACCEPT RUN ... BEGIN' marker in $METRO_LOG (markers can be overwritten by Metro; run a fresh drive instead)." >&2
    exit 2
  fi
  begin_ln="${begin_entry%%:*}"
  prior_run_id="$(printf '%s' "$begin_entry" | sed -nE 's/.*MAP-ACCEPT RUN ([^ ]+) BEGIN.*/\1/p')"
  pre_dismiss_ln="$(grep -an "=== MAP-ACCEPT RUN ${prior_run_id} PRE-DISMISS" "$METRO_LOG" | tail -1 | cut -d: -f1 || true)"
  if [[ -n "$pre_dismiss_ln" ]]; then
    sed -n "$((begin_ln + 1)),$((pre_dismiss_ln - 1))p" "$METRO_LOG" > "$JS_SLICE_FILE"
    sed -n "$((pre_dismiss_ln + 1)),\$p" "$METRO_LOG" > "$JS_DISMISS_SLICE_FILE"
  else
    sed -n "$((begin_ln + 1)),\$p" "$METRO_LOG" > "$JS_SLICE_FILE"
    : > "$JS_DISMISS_SLICE_FILE"
    info "js: no PRE-DISMISS marker for run ${prior_run_id} — final-state window runs to EOF (post-dismiss count=0 frames may leak in)"
  fi
  capture_native_since ""
  record SKIP driver.maestro "assert-only: re-asserting run ${prior_run_id} (native window: last ${NATIVE_WINDOW})"
  assert_js "$JS_SLICE_FILE"
  assert_native "$NATIVE_DUMP_FILE"
  post_count="$(grep -acE "$T4_RE" "$JS_DISMISS_SLICE_FILE" || true)"
  info "js: ${post_count:-0} post-dismiss [t4dbg] frames (informational)"
  print_summary_and_exit
fi

# ---------------------------------------------------------------------------
# Drive mode.
# ---------------------------------------------------------------------------
if ! command -v maestro >/dev/null 2>&1; then
  echo "[map-accept] maestro CLI not found on PATH." >&2
  exit 127
fi
# Maestro needs a JDK; mirror scripts/perf-scenario-ios.sh's fallbacks.
if [[ -z "${JAVA_HOME:-}" && -d /opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home ]]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home"
  export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
elif [[ -z "${JAVA_HOME:-}" && -d /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home ]]; then
  export JAVA_HOME="/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"
  export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"
fi
export MAESTRO_CLI_NO_ANALYTICS="${MAESTRO_CLI_NO_ANALYTICS:-1}"

if [[ "$FRESHEN_BUNDLE" == "1" ]]; then
  echo "[map-accept] freshening the Metro bundle (multi-second full rebuild)..."
  bundle_status="$(curl -s -o /dev/null -w "%{http_code}" \
    "http://localhost:${METRO_PORT}/apps/mobile/AppEntry.bundle?platform=ios&dev=true" || true)"
  echo "[map-accept] bundle request -> HTTP ${bundle_status}"
fi

metro_size() { stat -f %z "$METRO_LOG"; }

run_maestro_leg() { # run_maestro_leg <flow> <leg_log> -> maestro exit status
  local flow="$1" leg_log="$2" status=0
  (
    cd "$REPO_ROOT"
    maestro test --platform ios --udid "$UDID" --config "$MAESTRO_CONFIG" "$flow"
  ) > "$leg_log" 2>&1 || status=$?
  return "$status"
}

echo "[map-accept] run ${RUN_ID}: udid=${UDID} metroLog=${METRO_LOG} artifacts=${ARTIFACT_DIR}"

start_offset="$(metro_size)"
native_start_ts="$(date '+%Y-%m-%d %H:%M:%S')"
# Human-aid marker (byte offsets above are the authoritative window boundary).
printf '=== MAP-ACCEPT RUN %s BEGIN %s ===\n' "$RUN_ID" "$native_start_ts" >> "$METRO_LOG" || true

echo "[map-accept] leg 1/2: drive (reveal -> toggle -> toggle-back -> 8-tap burst -> settle)..."
leg1_status=0
run_maestro_leg "$DRIVE_FLOW" "$ARTIFACT_DIR/maestro-drive.log" || leg1_status=$?
sleep 2  # let Metro flush the settle-window probe lines
pre_dismiss_offset="$(metro_size)"
printf '=== MAP-ACCEPT RUN %s PRE-DISMISS %s ===\n' "$RUN_ID" "$(date '+%Y-%m-%d %H:%M:%S')" >> "$METRO_LOG" || true

echo "[map-accept] leg 2/2: dismiss..."
leg2_status=0
run_maestro_leg "$DISMISS_FLOW" "$ARTIFACT_DIR/maestro-dismiss.log" || leg2_status=$?
sleep 2
end_offset="$(metro_size)"

if [[ "$leg1_status" -eq 0 && "$leg2_status" -eq 0 ]]; then
  record PASS driver.maestro "both flow legs completed"
else
  record FAIL driver.maestro "maestro exit: drive=${leg1_status} dismiss=${leg2_status} (see ${ARTIFACT_DIR}/maestro-*.log); probe assertions below run on whatever evidence exists"
fi

# Byte-offset slices (pre-dismiss window is the assertion window).
if [[ "$pre_dismiss_offset" -gt "$start_offset" ]]; then
  tail -c "+$((start_offset + 1))" "$METRO_LOG" | head -c "$((pre_dismiss_offset - start_offset))" > "$JS_SLICE_FILE"
else
  : > "$JS_SLICE_FILE"
fi
if [[ "$end_offset" -gt "$pre_dismiss_offset" ]]; then
  tail -c "+$((pre_dismiss_offset + 1))" "$METRO_LOG" | head -c "$((end_offset - pre_dismiss_offset))" > "$JS_DISMISS_SLICE_FILE"
else
  : > "$JS_DISMISS_SLICE_FILE"
fi

capture_native_since "$native_start_ts"

assert_js "$JS_SLICE_FILE"
assert_native "$NATIVE_DUMP_FILE"
post_count="$(grep -acE "$T4_RE" "$JS_DISMISS_SLICE_FILE" || true)"
info "js: ${post_count:-0} post-dismiss [t4dbg] frames (informational; count=0 frames are legitimate there)"

print_summary_and_exit
