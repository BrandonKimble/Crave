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
