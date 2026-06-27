#!/usr/bin/env bash
# Drop a timestamped MARKER into the manual capture the instant an issue is seen, so we can find the
# surrounding [lodev] events. Appends a marker line to the capture file AND emits one into os_log via
# a perf-scenario-mark deep link (belt-and-suspenders; shows up inline in the stream).
#
# Usage: scripts/lod-mark.sh "label covered pin while zooming in"
set -uo pipefail
DEV="${DEV:-7B0DD874-3496-46F7-9480-3EDDABCE2F31}"
OUT="${LODEV_MANUAL_OUT:-/tmp/lodev-manual.log}"
NOTE="${*:-mark}"
TS="$(date '+%H:%M:%S.%3N')"
echo ">>> MARK $TS :: $NOTE <<<" >> "$OUT"
# Also push a marker through the app's log so it interleaves at the right spot in the stream.
ENC=$(printf '%s' "$NOTE" | sed 's/ /%20/g')
xcrun simctl openurl "$DEV" "crave://perf-scenario-mark?phase=manual&label=$ENC" >/dev/null 2>&1 || true
echo "marked: $TS :: $NOTE"
