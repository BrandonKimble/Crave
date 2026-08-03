#!/usr/bin/env bash
# @script-class: dead-scaffolding
# @run-by: NOTHING (audit F709/F729/F752). This is the [lodev] cluster. These
#     scripts drive and parse a `[lodev]` JSONL event stream that NO CODE
#     EMITS: a repo-wide grep for "lodev" over apps/ returns exactly ONE
#     hit, and it is a stale COMMENT
#     (apps/mobile/ios/cravesearch/SearchMapRenderController.swift:10417).
#     Live map telemetry is narrative [LODDBG] NSLog behind
#     `lodDebugLoggingEnabled = false`. CLAUDE.md already adjudicated
#     this: "The [lodev] JSONL telemetry harness ... DOES NOT EXIST in
#     the code ... Treat it as dead scaffolding." The verdict is now
#     carried to the scripts themselves. NOT DELETED, deliberately:
#     CLAUDE.md forbids stripping map instrumentation outside a real map
#     change, and the DRIVE half of this cluster still uses live perf
#     verbs (animate_map_camera / set_map_camera, registered in
#     apps/mobile/src/perf). It is the OBSERVE/ANALYZE half that has no
#     producer. Retire the cluster as PART of the next real map change,
#     not as a naked delete.
# CONTINUOUS-MOTION cycle driver — the deterministic version of Brandon driving zoom in/out by hand.
# Uses `animate_map_camera` (real eased camera motion, ~60fps continuous frames — NOT instant jumps,
# so it DOES exercise the motion artifacts the jump-sweep misses: wiggle, jank, cross-cycle degradation).
# Stays over a fixed Midtown center. Replicates Brandon's repro: zoom WAY in, then repeated equal
# in/out cycles ("things get weird after zooming way in").
#
# Usage: scripts/lod-zoom-cycle.sh [outfile] [cycles]   (defaults /tmp/lodev-cycle.log, 5)
set -uo pipefail
DEV="${DEV:-7B0DD874-3496-46F7-9480-3EDDABCE2F31}"
BUNDLE="com.brandonkimble.cravesearch"
OUT="${1:-/tmp/lodev-cycle.log}"
CYCLES="${2:-5}"
LAT=40.7549; LNG=-73.9840
DUR=1400  # ms per animated leg
cd "$(dirname "$0")/.." || exit 1

cam() { xcrun simctl openurl "$DEV" "crave://perf-scenario-command?action=set_map_camera&lat=$LAT&lng=$LNG&zoom=$1&animation=none" >/dev/null 2>&1; }
anim() { xcrun simctl openurl "$DEV" "crave://perf-scenario-command?action=animate_map_camera&lat=$LAT&lng=$LNG&zoom=$1&cameraDurationMs=$DUR" >/dev/null 2>&1; }

# FRESH search load (a reused/stale search dismisses into a poll when we drive the camera). Relaunch,
# pre-warm Metro, chip-submit with load verification — same robust path as lod-zoom-sweep.sh.
echo "[cycle] fresh launch + submit"
curl -s -o /dev/null "http://localhost:8081/apps/mobile/AppEntry.bundle?platform=ios&dev=true" || true
xcrun simctl terminate "$DEV" "$BUNDLE" 2>/dev/null; sleep 2
xcrun simctl launch "$DEV" "$BUNDLE" >/dev/null 2>&1; sleep 7
cat > /tmp/_cycle_submit.yaml <<'EOF'
appId: com.brandonkimble.cravesearch
---
- tapOn:
    point: "27%, 20%"
- waitForAnimationToEnd:
    timeout: 7000
EOF
for attempt in 1 2 3; do
  maestro test /tmp/_cycle_submit.yaml > /tmp/_cycle_submit.log 2>&1
  sleep 3
  if xcrun simctl spawn "$DEV" log show --last 8s --style compact \
       --predicate 'eventMessage CONTAINS "[lodev]" AND eventMessage CONTAINS "ev\":\"frame"' 2>/dev/null \
       | grep -q '"visible"'; then echo "[cycle] search loaded (attempt $attempt)"; break; fi
  echo "[cycle] not loaded attempt $attempt — retry"
done

echo "[cycle] starting scenario + baseline camera"
RUN="cycle$(date +%s)"
xcrun simctl openurl "$DEV" "crave://perf-scenario?scenario=lodattr&scenarioRunId=$RUN&durationMs=600000" >/dev/null 2>&1
sleep 1
cam 14; sleep 2
T0=$(date +%s)
echo "[cycle] zoom WAY in (14 -> 17.5) — the trigger"
anim 17.5; sleep 3
for c in $(seq 1 "$CYCLES"); do
  echo "[cycle] cycle $c/$CYCLES: out 17.5->13.5, in 13.5->17.5"
  anim 13.5; sleep 3
  anim 17.5; sleep 3
done
echo "[cycle] final zoom out 17.5 -> 11"
anim 11; sleep 3
SECS=$(( $(date +%s) - T0 + 3 ))
xcrun simctl spawn "$DEV" log show --last "${SECS}s" --style compact \
  --predicate 'eventMessage CONTAINS "[lodev]"' > "$OUT" 2>&1
echo "[cycle] captured $(wc -l < "$OUT") lines → $OUT"
