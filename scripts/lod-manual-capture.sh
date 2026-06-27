#!/usr/bin/env bash
# MANUAL harness capture — Brandon drives the sim by hand; this records the [lodev] stream with
# wall-clock timestamps so issues he calls out can be located in the log. Run in the background;
# stop with: kill $(cat /tmp/lodev-manual.pid).
#
# Pair with scripts/lod-mark.sh "<note>" to drop a timestamped marker the instant an issue is seen,
# and scripts/lod-oracle-parse.py / grep to analyze a window.
#
# Usage: scripts/lod-manual-capture.sh [outfile]   (default /tmp/lodev-manual.log)
set -uo pipefail
DEV="${DEV:-7B0DD874-3496-46F7-9480-3EDDABCE2F31}"
OUT="${1:-/tmp/lodev-manual.log}"
: > "$OUT"
echo "=== MANUAL CAPTURE START $(date '+%H:%M:%S.%3N') ===" >> "$OUT"
# --style compact prefixes each line with a wall-clock timestamp for correlation.
xcrun simctl spawn "$DEV" log stream --style compact \
  --predicate 'eventMessage CONTAINS "[lodev]"' >> "$OUT" 2>&1 &
echo $! > /tmp/lodev-manual.pid
echo "capturing → $OUT (pid $(cat /tmp/lodev-manual.pid)); drive the map now."
