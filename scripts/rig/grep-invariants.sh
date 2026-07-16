#!/bin/bash
# Grep invariants (Leg 5 gate — search-lifecycle design §8 + the Q-2 dissolution).
# Each check asserts a KILLED DISEASE CLASS stays dead (code lines, comments exempt),
# a SINGLE-OWNER fact stays single-owner, or a GUARD stays present. RED by
# construction: reintroducing the pattern (or deleting a guard) fails the run.
# Usage: scripts/rig/grep-invariants.sh   (exit 0 = all hold)

set -u
cd "$(dirname "$0")/../.." || exit 1
SRC="apps/mobile/src"
PASS=0; FAIL=0

# code_count <pattern> <scope...> — non-spec, non-comment lines
code_count() {
  local pattern="$1"; shift
  grep -rn "$pattern" "$@" --include="*.ts" --include="*.tsx" 2>/dev/null \
    | grep -v "\.spec\." | grep -vE ':[0-9]+: *(//|\*)' | wc -l | tr -d ' '
}

file_count() {
  local pattern="$1"; shift
  grep -rln "$pattern" "$@" --include="*.ts" --include="*.tsx" 2>/dev/null \
    | grep -v "\.spec\." | wc -l | tr -d ' '
}

check_eq() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" -eq "$expected" ]; then
    PASS=$((PASS+1)); echo "  PASS: $name ($actual)"
  else
    FAIL=$((FAIL+1)); echo "  FAIL: $name — expected $expected, found $actual"
  fi
}

echo "=== DEAD CLASSES stay dead (zero code occurrences) ==="
check_eq "markPaintAck (deleted T5)" 0 "$(code_count 'markPaintAck' $SRC)"
check_eq "joinSceneChromeAck (deleted T5)" 0 "$(code_count 'joinSceneChromeAck' $SRC)"
check_eq "markSceneContentGate (deleted S3)" 0 "$(code_count 'markSceneContentGate' $SRC)"
check_eq "SCENE_READINESS_LIVENESS (deleted S3)" 0 "$(code_count 'SCENE_READINESS_LIVENESS' $SRC)"
check_eq "world-reveal-admission-store (deleted, T4 keyless)" 0 "$(code_count 'world-reveal-admission' $SRC)"
check_eq "favorites: key-prefix parse (identity matching now)" 0 "$(code_count "startsWith(\`favorites:" $SRC)"
check_eq "redraw readiness triple (shrunk)" 0 "$(code_count '\.readiness\.' $SRC/screens/Search $SRC/overlays)"
check_eq "REDRAW_COVER_WATCHDOG (deleted S3a)" 0 "$(code_count 'REDRAW_COVER_WATCHDOG' $SRC)"

echo "=== GUARDS stay present ==="
# The terminal-home dismissal invariant bark (the guard that catches the old
# fallthrough class if it ever returns). Deleting the guard fails this run.
check_eq "NAV-CONTRACT invariant bark present" 1 \
  "$(code_count 'NAV-CONTRACT' $SRC/navigation/runtime/app-search-route-command-runtime.ts)"

echo "=== SINGLE-OWNER facts stay single-owner ==="
# §8.2: the render owner is the ONE wire writer
check_eq "setCandidateCatalog caller files (render owner only)" 1 \
  "$(file_count 'searchMapRenderController.setCandidateCatalog' $SRC)"
check_eq "submitRenderFrameFireAndObserve caller files (render owner only)" 1 \
  "$(file_count 'searchMapRenderController.submitRenderFrameFireAndObserve' $SRC)"
# The unified producers: one producer file each (reveal-pipeline design §2)
check_eq "rows-residency producer files (mounted store only)" 1 \
  "$(file_count 'setWorldRowsResidency(' $SRC/screens/Search/runtime/shared)"
check_eq "wire-ack producer files (render owner only)" 1 \
  "$(file_count 'offerWorldMapFrameEvidence()' $SRC)"
# Txn staging: the route stager + the episode stager (one module each)
check_eq "stageTransitionTxn caller files (2 stagers)" 2 \
  "$(grep -rln 'stageTransitionTxn(' $SRC --include='*.ts' --include='*.tsx' 2>/dev/null | grep -v '\.spec\.' | grep -v 'transition-transaction.ts' | wc -l | tr -d ' ')"
# The gate: paintAck writers live in the host (txn subscription + reconcile) + the
# player's own reset — two files, no strays
check_eq "paintAck writer files (host + player)" 2 \
  "$(file_count 'paintAck.value = ' $SRC)"

echo "=== RESULT: PASS=$PASS FAIL=$FAIL ==="
[ "$FAIL" -eq 0 ]
