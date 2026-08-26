#!/usr/bin/env bash
# THE ITERATION BENCH runner (plans/iteration-bench.md). Thin wrapper over
# apps/api/scripts/bench.ts — same REEXTRACT_DB targeting law as
# reextract.sh (local db unless REEXTRACT_DB is set; staging is the
# sanctioned laptop target, prod refuses in prisma.service).
#
#   bench.sh start <version> [communities]   bench.sh status
#   bench.sh advance                         bench.sh preflight
#   bench.sh approve <hash>                  bench.sh campaign <id>
#   bench.sh drive-loop                      bench.sh diff-artifact <path>
#   bench.sh close-review <summary>          bench.sh outcome <verdict>
#
# drive-loop = law 3 made operational: loops one drive step until DRAINED,
# exits loudly on STALLED (exit 2) so silence can never mean anything.
set -euo pipefail
API="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../apps/api" && pwd)"
db_url() { echo "${REEXTRACT_DB:-postgresql://postgres:postgres@localhost:5432/crave_search}"; }
run_node() { (cd "$API" && DATABASE_URL="$(db_url)" TS_NODE_TRANSPILE_ONLY=1 npx ts-node scripts/bench.ts "$@"); }

VERB="${1:-status}"; shift || true
case "$VERB" in
  drive-loop)
    while true; do
      OUT="$(run_node drive)" || { echo "$OUT"; echo "STALLED — investigate the poller"; exit 2; }
      echo "$OUT"
      case "$OUT" in
        DRAINED*) exit 0 ;;
      esac
      sleep 120
    done
    ;;
  *)
    run_node "$VERB" "$@"
    ;;
esac
