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
