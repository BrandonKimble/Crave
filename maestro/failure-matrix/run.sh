#!/bin/bash
# THE FAILURE MATRIX (product/README.md pre-launch gate; design of record:
# plans/foundation-hardening-and-failure-matrix.md §D).
#
# Repeatable driver for the four failure cases, per page. Run it on every page
# before launch AND on every page added later — the gate is part of what a page IS.
#
#   ./run.sh offline-on|offline-off|offline-clear   # the dev offline lever
#   ./run.sh shot <label>                           # screenshot into the evidence dir
#   ./run.sh mark <text>                            # marker into the metro log
#   ./run.sh scenario                               # arm the perf command scenario
#
# THE FOUR CASES (drive the page between lever calls; the EYE judges screenshots):
#  1 offline-enter : offline-on → navigate to the page → SHOT (skeleton + banner,
#                    no error UI) → back-out works → offline-off (reconnect edge:
#                    paused work must RESUME — search retries, polls feed refreshes)
#                    → SHOT → offline-clear.
#  2 enter-failure : API down (kill -9 the :3000 process; SIGSTOP = slow variant —
#                    coordinate with other rig users first) → enter the page → SHOT
#                    (the uniform 'Something went wrong' modal) → dismiss → SHOT
#                    (returned to origin).
#  3 action-failure: page loaded, API down → drive one mutation/toggle → SHOT
#                    (modal; page intact behind it).
#  4 no-silent     : grep the metro window for the announcement on every driven
#                    mutation: grep -a "Something went wrong\|announceFailure" LOG.
#
# PER-PAGE EXPECTED OUTCOMES (doctrine — do not misread):
#  - polls feed REFRESH failure = retry ladder + deferred freshness state, NEVER the
#    modal (blessed exception). Poll MUTATIONS (vote, comment) announce.
#  - quiet "couldn't load" empty states are resting surfaces, not announcements.
#  - hearts/votes need a signed-in user + seeded data: hands-on items, not faked.
set -euo pipefail
SIM="${SIM_UDID:-$(xcrun simctl list devices booted | grep -o '[0-9A-F-]\{36\}' | head -1)}"
EVIDENCE="${MATRIX_EVIDENCE_DIR:-/tmp/failure-matrix-$(date +%Y%m%d)}"
METRO_LOG="${METRO_LOG:-/tmp/crave-metro.log}"
mkdir -p "$EVIDENCE"
case "${1:-}" in
  scenario)
    xcrun simctl openurl "$SIM" "crave://perf-scenario?scenario=manual&durationMs=600000" ;;
  offline-on)
    xcrun simctl openurl "$SIM" "crave://perf-scenario-command?action=set_system_offline&routeParam=1" ;;
  offline-off)
    xcrun simctl openurl "$SIM" "crave://perf-scenario-command?action=set_system_offline&routeParam=0" ;;
  offline-clear)
    xcrun simctl openurl "$SIM" "crave://perf-scenario-command?action=set_system_offline&routeParam=clear" ;;
  shot)
    xcrun simctl io "$SIM" screenshot "$EVIDENCE/${2:-shot}-$(date +%H%M%S).png" ;;
  mark)
    echo "=== MATRIX ${2:-mark} $(date +%H:%M:%S) ===" >> "$METRO_LOG" ;;
  *)
    echo "usage: run.sh scenario|offline-on|offline-off|offline-clear|shot <label>|mark <text>"; exit 1 ;;
esac
