#!/usr/bin/env bash
# Pre-load gate cert sweep driver (2026-08-30). Sequential; all read-only probes.
set -uo pipefail
cd /Users/brandonkimble/Crave/Crave/apps/api
FX=scripts/fixtures
LOG=/private/tmp/claude-501/-Users-brandonkimble-Crave-Crave/9c76ce4e-ff73-44a9-949c-84dcb10614d4/scratchpad/gate-cert.log
run() { echo "=== $(date +%T) $*" >> "$LOG"; TS_NODE_TRANSPILE_ONLY=1 npx ts-node "$@" >> "$LOG" 2>&1; echo "=== exit $? : $*" >> "$LOG"; }

for i in 1 2 3; do
  run scripts/prompt-gold.ts --kind=dish-knowledge --case-file=$FX/dish-knowledge-gold-cases.json --repeat=3 --out=$FX/dish-knowledge-gold.gate.run$i.result.json
  run scripts/prompt-gold.ts --kind=cuisine --case-file=$FX/cuisine-gold-cases.json --repeat=3 --out=$FX/cuisine-gold.gate.run$i.result.json
  run scripts/prompt-gold.ts --kind=chooser --case-file=$FX/chooser-gold-cases.json --repeat=3 --out=$FX/chooser-gold.gate.run$i.result.json
done
run scripts/entity-match-gold.ts --repeat=3
run scripts/attribute-merge-gold.ts --repeat=3
run scripts/attribute-placement-gold.ts --repeat=3
run scripts/widening-docket.ts --gold --repeat=3
for i in 1 2 3; do
  run scripts/prompt-ab.ts --case-file=$FX/prompt-ab-cases.json --repeat=3 --out=$FX/prompt-ab.gate.run$i.result.json
done
echo "ALL DONE $(date +%T)" >> "$LOG"
