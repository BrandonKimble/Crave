#!/usr/bin/env bash
# LOD zoom-sweep harness driver — DETERMINISTIC, STAYS OVER NYC.
#
# Why this exists: relative-% Maestro swipes drift off New York and never zoom, so they
# structurally miss the zoom-in / zoom-out LOD bugs. This driver instead jumps the camera
# with the perf `set_map_camera` deep link (animationMode:'none' = exact lat/lng/zoom, no
# drift), sweeping zoom IN then OUT over a fixed dense-Manhattan center, then panning at a
# mid zoom. Each jump fires handleNativeCameraChanged → projectAndEmit → driveNativeLod →
# the [lodev] `oracle` (per-anchor expected-vs-actual) + `render` events. We read the log
# AFTER via `log show` (reliable buffer read; the live `log stream` races the jumps).
#
# Usage: scripts/lod-zoom-sweep.sh [outfile]   (default /tmp/lodev.log)
set -uo pipefail
DEV="${DEV:-7B0DD874-3496-46F7-9480-3EDDABCE2F31}"
BUNDLE="com.brandonkimble.cravesearch"
OUT="${1:-/tmp/lodev.log}"
export JAVA_HOME="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17}"

# Dense Manhattan center (Midtown). All pan steps stay inside lat 40.74–40.77, lng -74.00 to -73.97.
LAT=40.7549
LNG=-73.9840

# Step list: "lat lng zoom". Zoom IN first (13→16), then OUT (16→10), then PAN at z14.
STEPS=(
  "$LAT $LNG 13" "$LAT $LNG 14" "$LAT $LNG 15" "$LAT $LNG 16"
  "$LAT $LNG 15" "$LAT $LNG 14" "$LAT $LNG 13" "$LAT $LNG 12" "$LAT $LNG 11" "$LAT $LNG 10"
  "$LAT $LNG 14"
  "40.7649 -73.9840 14" "40.7449 -73.9840 14" "40.7549 -73.9740 14" "40.7549 -73.9940 14"
  "$LAT $LNG 14"
)

cd "$(dirname "$0")/.." || exit 1

# Pre-warm Metro: the FIRST request after an `expo start` (re)start triggers a multi-second full
# bundle build. Without this, a cold launch races the build → the chip tap hits a loading screen →
# no search → empty capture. Force the build and wait for the `Bundled` line before launching.
echo "[sweep] pre-warming Metro bundle"
curl -s -o /dev/null -w "  bundle http %{http_code}\n" \
  "http://localhost:8081/apps/mobile/AppEntry.bundle?platform=ios&dev=true" || true

echo "[sweep] launching $BUNDLE on $DEV"
xcrun simctl terminate "$DEV" "$BUNDLE" 2>/dev/null
sleep 2
xcrun simctl launch "$DEV" "$BUNDLE" >/dev/null 2>&1
sleep 7

echo "[sweep] submitting search (Best restaurants chip ~27%,20%) — with load verification + retry"
cat > /tmp/_sweep_submit.yaml <<'EOF'
appId: com.brandonkimble.cravesearch
---
- tapOn:
    point: "27%, 20%"
- waitForAnimationToEnd:
    timeout: 7000
EOF
# The chip tap can miss (it sits at the search-bar edge). Verify the search actually loaded by
# watching for a [lodev] frame/oracle event; retry the tap up to 3× if nothing shows.
loaded=0
for attempt in 1 2 3; do
  maestro test /tmp/_sweep_submit.yaml > /tmp/_sweep_submit.log 2>&1
  sleep 3
  if xcrun simctl spawn "$DEV" log show --last 8s --style compact \
       --predicate 'eventMessage CONTAINS "[lodev]" AND eventMessage CONTAINS "ev\":\"frame"' 2>/dev/null \
       | grep -q '"visible"'; then
    loaded=1; echo "[sweep] search loaded (attempt $attempt)"; break
  fi
  echo "[sweep] search NOT loaded on attempt $attempt — retrying chip tap"
done
[ "$loaded" = 0 ] && echo "[sweep] WARNING: search never confirmed loaded; sweep may be empty"

echo "[sweep] starting perf scenario (so camera commands are accepted)"
RUN="sweep$(date +%s)"
xcrun simctl openurl "$DEV" "crave://perf-scenario?scenario=lodattr&scenarioRunId=$RUN&durationMs=600000" >/dev/null 2>&1
sleep 2

T0=$(date +%s)
i=0
for step in "${STEPS[@]}"; do
  read -r slat slng szoom <<< "$step"
  i=$((i+1))
  echo "[sweep] step $i/${#STEPS[@]}: lat=$slat lng=$slng zoom=$szoom"
  xcrun simctl openurl "$DEV" "crave://perf-scenario-command?action=set_map_camera&lat=$slat&lng=$slng&zoom=$szoom&animation=none" >/dev/null 2>&1
  sleep 3
done
SECS=$(( $(date +%s) - T0 + 6 ))

echo "[sweep] reading [lodev] from log buffer (last ${SECS}s) → $OUT"
xcrun simctl spawn "$DEV" log show --last "${SECS}s" --style compact \
  --predicate 'eventMessage CONTAINS "[lodev]"' > "$OUT" 2>&1
echo "[sweep] captured $(wc -l < "$OUT") lines"
