#!/bin/bash
# Release-lane transition baseline (H3 / L-1 — search-lifecycle Leg 5).
# Runs the SAME sampler protocol as the dev reference against the Release build and
# captures [JSPERF]-sunk sampler lines from os_log (console is stripped in Release).
# Usage: scripts/rig/release-baseline.sh [udid]

set -u
UDID="${1:-7B0DD874-3496-46F7-9480-3EDDABCE2F31}"
RUN="baseline-rel-$(date +%s)"
OUT="/tmp/crave-release-baseline-$RUN.log"

# os_log capture (background) — the native sink NSLogs "[JSPERF] <SearchPerf json>".
xcrun simctl spawn "$UDID" log stream --style compact \
  --predicate 'eventMessage CONTAINS "JSPERF"' > "$OUT" 2>&1 &
LOGPID=$!
sleep 2

open_url() { xcrun simctl openurl "$UDID" "$1"; }

open_url "crave://perf-scenario?scenario=transition_baseline&scenarioRunId=$RUN&durationMs=120000&jsSampler=1&uiSampler=1&jsWindowMs=500&uiWindowMs=500"
sleep 3
open_url "crave://perf-scenario-mark?phase=submit&scenarioRunId=$RUN"; sleep 1
open_url "crave://perf-scenario-command?action=submit_shortcut_restaurants&scenarioRunId=$RUN"; sleep 12
open_url "crave://perf-scenario-mark?phase=toggle&scenarioRunId=$RUN"; sleep 1
open_url "crave://perf-scenario-command?action=toggle_tab&scenarioRunId=$RUN"; sleep 5
open_url "crave://perf-scenario-mark?phase=child_push&scenarioRunId=$RUN"; sleep 1
open_url "crave://perf-scenario-command?action=push_child_scene&scene=restaurant&scenarioRunId=$RUN"; sleep 6
open_url "crave://perf-scenario-clear?scenarioRunId=$RUN"
sleep 3
kill $LOGPID 2>/dev/null

echo "RUN=$RUN"
echo "OUT=$OUT"
echo "--- JS task windows (maxLagMs):"
grep -oE '"maxLagMs":[0-9.]+' "$OUT" | sort -t: -k2 -rn | head -8
# SAMPLER SPLIT (2026-07-21 attribution fix): p95FrameMs/floorFps exist in BOTH the
# JsFrameSampler and UiFrameSampler lines — the old combined grep let a JS-thread
# stall masquerade as the "UI worst window" and contaminated every cross-build
# comparison. Report the two threads separately, with timestamps for the worst.
echo "--- JS frame windows (JsFrameSampler worst p95FrameMs):"
grep "JsFrameSampler" "$OUT" | grep -oE '"p95FrameMs":[0-9.]+' | sort -t: -k2 -rn | head -4
echo "--- UI frame windows (UiFrameSampler worst p95FrameMs / floorFps):"
grep "UiFrameSampler" "$OUT" | grep -oE '"p95FrameMs":[0-9.]+' | sort -t: -k2 -rn | head -4
grep "UiFrameSampler" "$OUT" | grep -oE '"floorFps":[0-9.]+' | sort -t: -k2 -n | head -3
echo "--- worst JS window line (timestamp for phase alignment):"
WORST_JS=$(grep "JsFrameSampler" "$OUT" | grep -oE '"p95FrameMs":[0-9.]+' | sort -t: -k2 -rn | head -1 | cut -d: -f2)
grep "JsFrameSampler" "$OUT" | grep "\"p95FrameMs\":$WORST_JS" | head -1 | cut -c1-60
echo "--- marks:"
grep -oE '"event":"scenario_mark"[^}]*' "$OUT" | head -6
