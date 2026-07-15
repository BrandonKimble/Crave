#!/bin/bash
# Lifecycle-harness matrix v0 (Phase-3 Leg 1d — plans/search-lifecycle-phase3-charter.md).
# Drives mouth × dismiss flows through the lifecycle-harness command bus and asserts on
# acked composite state. Run against a booted sim with Metro logging to /tmp/crave-metro.log.
#
# Usage: scripts/rig/lifecycle-matrix.sh [udid]
# Exit: 0 all assertions pass; 1 otherwise. KNOWN-RED flows (old-code defects, the Leg-1
# RED proofs) are reported as EXPECTED-RED and do not fail the run until their owning leg
# lands — flip expected_red=0 per flow as legs 3-4 fix them.

set -u
UDID="${1:-7B0DD874-3496-46F7-9480-3EDDABCE2F31}"
METRO_LOG="/tmp/crave-metro.log"
LIST_A="8a876fd8-3184-4d52-96cf-71937c3f5adf"   # Out-of-towner tour (15)
LIST_B="e050f14f-71d2-44e2-9fc4-c882dc644557"   # Date night ATX (12)
PASS=0; FAIL=0; XRED=0

enc() { python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$1"; }

# send <verb> <id> <json-payload or ''> ; echoes the ack JSON line
send() {
  local verb="$1" id="$2" payload="${3:-}"
  local url="crave://lifecycle-harness?verb=${verb}&id=${id}"
  [ -n "$payload" ] && url="${url}&payload=$(enc "$payload")"
  local start_size
  start_size=$(stat -f%z "$METRO_LOG")
  xcrun simctl openurl "$UDID" "$url" || { echo ""; return; }
  for _ in $(seq 1 40); do
    sleep 0.5
    local ack
    ack=$(tail -c +"$start_size" "$METRO_LOG" | grep -F "[HARNESS-ACK] {\"id\":\"${id}\"" | tail -1)
    if [ -n "$ack" ]; then echo "${ack#*\[HARNESS-ACK\] }"; return; fi
  done
  echo ""
}

# assert <name> <ack-json> <python-expr over parsed ack as a> [expected_red]
check() {
  local name="$1" ack="$2" expr="$3" expected_red="${4:-0}"
  local ok
  ok=$(python3 - "$ack" "$expr" <<'PY'
import json,sys
try:
    a=json.loads(sys.argv[1]); print("1" if eval(sys.argv[2]) else "0")
except Exception:
    print("0")
PY
)
  if [ "$ok" = "1" ]; then
    if [ "$expected_red" = "1" ]; then echo "  UNEXPECTED-GREEN (fix landed? flip flag): $name"; FAIL=$((FAIL+1));
    else echo "  PASS: $name"; PASS=$((PASS+1)); fi
  else
    if [ "$expected_red" = "1" ]; then echo "  EXPECTED-RED (old-code defect): $name"; XRED=$((XRED+1));
    else echo "  FAIL: $name"; FAIL=$((FAIL+1)); echo "    ack: $ack"; fi
  fi
}

settle() { sleep "$1"; }
RUN=$RANDOM

echo "=== FLOW 1: home shortcut mouth -> searchBarX (the golden loop) ==="
send open_scene "f1o$RUN" '{"scene":"search"}' >/dev/null; settle 3
A=$(send trigger_mouth "f1t$RUN" '{"kind":"shortcut"}'); settle 6
S=$(send read_lifecycle_state "f1s$RUN");
check "shortcut presents results" "$S" "a['state']['surface']['activeBundleKind']=='results'"
check "session entry pushed (depth 2)" "$S" "a['state']['stackLength']==2"
check "sheet at middle on reveal" "$S" "a['state']['sheetSnaps']['search']=='middle'"
D=$(send dismiss "f1d$RUN" '{"affordance":"searchBarX"}'); settle 5
E=$(send read_lifecycle_state "f1e$RUN")
check "dismiss lands home depth 1" "$E" "a['state']['stackLength']==1 and a['state']['root']=='search'"
check "no residual results bundle" "$E" "a['state']['surface']['activeBundleKind']!='results'"

echo "=== FLOW 2: home list tile mouth -> searchBarX ==="
A=$(send trigger_mouth "f2t$RUN" "{\"kind\":\"list\",\"entityId\":\"$LIST_A\",\"label\":\"Out-of-towner tour\",\"listType\":\"restaurant\"}"); settle 8
S=$(send read_lifecycle_state "f2s$RUN")
check "list world presents into listDetail" "$S" "a['state']['activeKey']=='listDetail' and a['state']['surface']['activeBundleKind']=='results'"
D=$(send dismiss "f2d$RUN" '{"affordance":"searchBarX"}'); settle 5
E=$(send read_lifecycle_state "f2e$RUN")
check "X returns to origin (home root, depth1)" "$E" "a['state']['stackLength']==1 and a['state']['root']=='search'"
check "world torn down after X" "$E" "a['state']['surface']['activeBundleKind']!='results'"

echo "=== FLOW 3: list world -> sheet X (closeActiveRoute) — STALE-WORLD RED ==="
A=$(send trigger_mouth "f3t$RUN" "{\"kind\":\"list\",\"entityId\":\"$LIST_B\",\"label\":\"Date night ATX\",\"listType\":\"restaurant\"}"); settle 8
D=$(send dismiss "f3d$RUN" '{"affordance":"back"}'); settle 4
E=$(send read_lifecycle_state "f3e$RUN")
check "route popped to depth 1" "$E" "a['state']['stackLength']==1"
check "world torn down after sheet-X pop" "$E" "a['state']['surface']['activeBundleKind']!='results'" 1
# cleanup residual world for next flow
send dismiss "f3c$RUN" '{"affordance":"searchBarX"}' >/dev/null; settle 4

echo "=== FLOW 4: bookmarks-root list world -> searchBarX — NAV-CONTRACT RED ==="
SZ4=$(stat -f%z "$METRO_LOG")
send open_scene "f4o$RUN" '{"scene":"bookmarks"}' >/dev/null; settle 3
A=$(send trigger_mouth "f4t$RUN" "{\"kind\":\"list\",\"entityId\":\"$LIST_A\",\"label\":\"Out-of-towner tour\",\"listType\":\"restaurant\"}"); settle 8
D=$(send dismiss "f4d$RUN" '{"affordance":"searchBarX"}'); settle 5
if tail -c +"$SZ4" "$METRO_LOG" | grep -q "NAV-CONTRACT"; then
  echo "  EXPECTED-RED (old-code defect): no NAV-CONTRACT bark on non-home dismiss"; XRED=$((XRED+1))
else
  echo "  UNEXPECTED-GREEN (fix landed? flip flag): no NAV-CONTRACT bark"; FAIL=$((FAIL+1))
fi
E=$(send read_lifecycle_state "f4e$RUN")
check "X from bookmarks returns to bookmarks" "$E" "a['state']['root']=='bookmarks' and a['state']['stackLength']==1"
check "world torn down" "$E" "a['state']['surface']['activeBundleKind']!='results'"
send open_scene "f4z$RUN" '{"scene":"search"}' >/dev/null; settle 3

echo "=== FLOW 5: drill-in gate (Leg 2d) — list world -> restaurant sub-mouth -> back ==="
UROKO="fb6459cb-d05a-424c-9bce-f860dfaf1df2"
A=$(send trigger_mouth "f5t$RUN" "{\"kind\":\"list\",\"entityId\":\"$LIST_A\",\"label\":\"Out-of-towner tour\",\"listType\":\"restaurant\"}"); settle 8
S=$(send read_lifecycle_state "f5s$RUN")
check "list world presented" "$S" "a['state']['activeKey']=='listDetail' and a['state']['surface']['activeBundleKind']=='results'"
B=$(send trigger_mouth "f5r$RUN" "{\"kind\":\"restaurant\",\"entityId\":\"$UROKO\",\"label\":\"Uroko\"}"); settle 8
S2=$(send read_lifecycle_state "f5u$RUN")
check "restaurant pushed over list world (depth 3)" "$S2" "a['state']['activeKey']=='restaurant' and a['state']['stackLength']==3"
D=$(send dismiss "f5b$RUN" '{"affordance":"back"}'); settle 5
E=$(send read_lifecycle_state "f5e$RUN")
check "back reveals listDetail (level restored)" "$E" "a['state']['activeKey']=='listDetail' and a['state']['stackLength']==2"
check "list world SURVIVED the sub-mouth round trip (B3)" "$E" "a['state']['surface']['activeBundleKind']=='results'"
send dismiss "f5c$RUN" '{"affordance":"searchBarX"}' >/dev/null; settle 4

echo ""
echo "=== MATRIX v0: PASS=$PASS FAIL=$FAIL EXPECTED-RED=$XRED ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
