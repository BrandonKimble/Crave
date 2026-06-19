#!/usr/bin/env bash
# LOD observability harness runner. Drives a deterministic map session on the sim while
# capturing the native [lodev] event stream + a screen recording, then runs the analyzer.
# See plans/lod-observability-harness.md.
#
# Usage: scripts/lod-harness.sh [udid]
# Assumes the app is already built+installed and metro is running on 8081.
set -uo pipefail

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
sleep 1

mkdir -p /tmp/lodflows
# Deterministic flow: search -> settle -> collapse sheet -> several slow pans -> settle.
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
- swipe: { start: '60%, 50%', end: '30%, 35%', duration: 500 }   # pan 3
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

node "$ROOT/scripts/lod-harness-analyze.js" "$JSONL" "$VIDEO"
