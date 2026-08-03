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
# Realistic LOD drive flow — animated (continuous "swoop") zoom + slight pan, STAYS centered over Midtown
# (no Central Park drift), zooms IN first, varies zoom-out depth each cycle, and RETURNS to the exact origin
# viewport at the end so we can assert FM#5 (origin must restore exactly the top-30). Loads the search via the
# deep-link submit (reliable; the chip-tap coordinate is flaky across home-layout changes).
#
# Usage: scripts/lod-drive.sh [outfile]   (default /tmp/lodev-drive.log)
set -uo pipefail
DEV="${DEV:-7B0DD874-3496-46F7-9480-3EDDABCE2F31}"
BUNDLE="com.brandonkimble.cravesearch"
OUT="${1:-/tmp/lodev-drive.log}"

# Origin viewport (dense Midtown). All pans stay within ~40.751-40.759 / -73.979 to -73.989 — a few blocks,
# never up into Central Park (~40.78+).
OLAT=40.7549; OLNG=-73.9840; OZOOM=13

# Animated steps: "lat lng zoom durationMs". Zoom IN first; slight pans; VARIED zoom-out depths; end at origin.
STEPS=(
  "$OLAT $OLNG 15.5 1200"            # zoom in
  "40.7590 -73.9840 15.5 800"        # pan up a touch
  "$OLAT $OLNG 15.5 800"             # back
  "$OLAT $OLNG 13.8 1000"            # zoom out partway (not all the way)
  "$OLAT $OLNG 16.0 1200"            # zoom in deeper
  "$OLAT -73.9890 16.0 700"          # pan left
  "$OLAT -73.9790 16.0 900"          # pan right
  "$OLAT $OLNG 16.0 700"             # back
  "$OLAT $OLNG 12.2 1300"            # zoom out further (varied depth)
  "$OLAT $OLNG 14.5 1100"            # zoom in
  "40.7510 $OLNG 14.5 800"           # pan down
  "$OLAT $OLNG 14.5 800"             # back
  "$OLAT $OLNG 13.3 1000"            # zoom out a little
  "$OLAT $OLNG 15.0 900"             # zoom in
  "$OLAT $OLNG $OZOOM 1200"          # RETURN to exact origin viewport
)

cd "$(dirname "$0")/.." || exit 1

echo "[drive] launching $BUNDLE"
xcrun simctl terminate "$DEV" "$BUNDLE" 2>/dev/null; sleep 2
xcrun simctl launch "$DEV" "$BUNDLE" >/dev/null 2>&1; sleep 7

RUN="drive$(date +%s)"
echo "[drive] starting scenario + loading search (deep-link submit) at origin"
xcrun simctl openurl "$DEV" "crave://perf-scenario?scenario=lodattr&scenarioRunId=$RUN&durationMs=600000" >/dev/null 2>&1; sleep 1
xcrun simctl openurl "$DEV" "crave://perf-scenario-command?action=set_map_camera&lat=$OLAT&lng=$OLNG&zoom=$OZOOM&animation=none" >/dev/null 2>&1; sleep 1
xcrun simctl openurl "$DEV" "crave://perf-scenario-command?action=submit_shortcut_restaurants" >/dev/null 2>&1
# wait for the search to actually project (oracle fires only when visible) — gate on an oracle event, not camentry.
for t in $(seq 1 8); do
  sleep 2
  if xcrun simctl spawn "$DEV" log show --last 3s --style compact --predicate 'eventMessage CONTAINS "[lodev]"' 2>/dev/null | grep -q '"ev":"oracle"'; then
    echo "[drive] search projecting after ~$((t*2))s"; break
  fi
done

T0=$(date +%s)
i=0
for step in "${STEPS[@]}"; do
  read -r slat slng szoom sdur <<< "$step"
  i=$((i+1))
  echo "[drive] step $i/${#STEPS[@]}: lat=$slat lng=$slng zoom=$szoom dur=${sdur}ms"
  xcrun simctl openurl "$DEV" "crave://perf-scenario-command?action=animate_map_camera&lat=$slat&lng=$slng&zoom=$szoom&cameraDurationMs=$sdur" >/dev/null 2>&1
  # dwell = animation duration + a little, so each move completes before the next (smooth, not interrupted-stacked)
  sleep "$(awk "BEGIN{print $sdur/1000 + 0.5}")"
done
echo "[drive] settling at origin for the return-to-top-30 check"
sleep 6
SECS=$(( $(date +%s) - T0 + 6 ))

echo "[drive] reading [lodev] (last ${SECS}s) -> $OUT"
xcrun simctl spawn "$DEV" log show --last "${SECS}s" --style compact \
  --predicate 'eventMessage CONTAINS "[lodev]"' > "$OUT" 2>&1
echo "[drive] captured $(wc -l < "$OUT") lines"
