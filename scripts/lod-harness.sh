#!/usr/bin/env bash
# LOD observability harness runner. Drives a deterministic map session on the sim while
# capturing the native [lodev] event stream + a screen recording, then runs the analyzer.
# See plans/lod-observability-harness.md.
#
# Usage: scripts/lod-harness.sh [udid]
# Assumes the app is already built+installed and metro is running on 8081.
set -uo pipefail

# Maestro needs a JRE; export JAVA_HOME if not already set (openjdk@17 via homebrew).
if [ -z "${JAVA_HOME:-}" ]; then
  for cand in "$(/usr/libexec/java_home 2>/dev/null)" /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home; do
    [ -x "$cand/bin/java" ] && export JAVA_HOME="$cand" && break
  done
fi
export PATH="$JAVA_HOME/bin:$PATH"

UDID="${1:-7B0DD874-3496-46F7-9480-3EDDABCE2F31}"
APP="com.brandonkimble.cravesearch"
TS="$(date +%Y%m%dT%H%M%S)"
OUT="/tmp/lod-$TS"
JSONL="$OUT.jsonl"
VIDEO="$OUT.mp4"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "[harness] out=$OUT"

# NYC (data is NYC-only) so searches return results.
xcrun simctl location "$UDID" set 40.7580,-73.9855 2>/dev/null || true

# Clean launch.
xcrun simctl terminate "$UDID" "$APP" 2>/dev/null || true
sleep 2
xcrun simctl launch "$UDID" "$APP" >/dev/null 2>&1
echo "[harness] launched, waiting for bundle..."
sleep 30

# Start event-stream capture + screen recording.
xcrun simctl spawn "$UDID" log stream --style compact \
  --predicate 'processImagePath CONTAINS "cravesearch" AND eventMessage CONTAINS "[lodev]"' \
  > "$OUT.rawlog" 2>&1 &
LOGPID=$!
xcrun simctl io "$UDID" recordVideo --codec=h264 "$VIDEO" >/dev/null 2>&1 &
VIDPID=$!
# Wall-clock epoch (ms) when recording started, so the analyzer can map an event's epoch (e)
# to a video offset = (event.e - VIDEO_START_MS)/1000 for EXACT-MOMENT frame extraction.
VIDEO_START_MS=$(python3 -c 'import time; print(int(time.time()*1000))')
echo "$VIDEO_START_MS" > "$OUT.videostart"
sleep 1

mkdir -p /tmp/lodflows
# Deterministic flow: search -> settle -> collapse -> slow pans -> ZOOM IN (double-taps) ->
# settle -> zoom out (pinch via swipe-pair n/a; double-tap zoom-in is the reported-bug case).
# Double-tap on a map point zooms Mapbox in one level; we step in several times to shrink the
# visible set and force dot->pin promotion (the "zoom in -> dots vanish, nothing promotes" bug).
cat > /tmp/lodflows/run.yaml <<EOF
appId: $APP
---
- tapOn: { point: '30%, 17%' }      # Best restaurants shortcut
- extendedWaitUntil: { visible: 'Close results', timeout: 15000 }
- waitForAnimationToEnd: { timeout: 4000 }
- swipe: { start: '50%, 44%', end: '50%, 92%', duration: 400 }   # collapse sheet
- waitForAnimationToEnd: { timeout: 1500 }
- swipe: { start: '60%, 45%', end: '30%, 30%', duration: 700 }   # slow pan 1
- waitForAnimationToEnd: { timeout: 2000 }
- swipe: { start: '40%, 30%', end: '70%, 50%', duration: 700 }   # slow pan 2
- waitForAnimationToEnd: { timeout: 2000 }
# ZOOM IN bug repro: zoom in RAPIDLY on a dense dot cluster (short waits ~= a continuous pinch).
# Reported bug: dots vanish on zoom-in and never promote to pins. Step in 5x fast so the on-screen
# set shrinks quickly and many markers cross the rank boundary at once.
- doubleTapOn: { point: '50%, 40%' }   # ZOOM IN 1
- waitForAnimationToEnd: { timeout: 700 }
- doubleTapOn: { point: '50%, 40%' }   # ZOOM IN 2
- waitForAnimationToEnd: { timeout: 700 }
- doubleTapOn: { point: '50%, 40%' }   # ZOOM IN 3
- waitForAnimationToEnd: { timeout: 700 }
- doubleTapOn: { point: '50%, 40%' }   # ZOOM IN 4
- waitForAnimationToEnd: { timeout: 700 }
- doubleTapOn: { point: '50%, 40%' }   # ZOOM IN 5
- waitForAnimationToEnd: { timeout: 2500 }
EOF

echo "[harness] running flow..."
maestro test /tmp/lodflows/run.yaml 2>&1 | tail -3

sleep 2
# recordVideo MUST be stopped with SIGINT so it finalizes the mp4 moov atom; SIGTERM/SIGKILL
# leaves a corrupt/unopenable file. Give it a moment to flush.
kill -INT "$VIDPID" 2>/dev/null
for _ in 1 2 3 4 5 6; do kill -0 "$VIDPID" 2>/dev/null || break; sleep 1; done
kill "$LOGPID" 2>/dev/null

# Extract the [lodev] JSON objects (one per line) from the raw log.
grep -oE '\[lodev\] \{.*\}' "$OUT.rawlog" 2>/dev/null | sed 's/^\[lodev\] //' > "$JSONL"
echo "[harness] captured $(wc -l < "$JSONL" | tr -d ' ') events -> $JSONL ; video -> $VIDEO"

node "$ROOT/scripts/lod-harness-analyze.js" "$JSONL" "$VIDEO" "$VIDEO_START_MS"
