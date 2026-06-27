#!/usr/bin/env bash
# Summarize the LAST N seconds of [lodev] for a manual-session cue ("I saw X just now"). Reads the
# os_log buffer directly (reliable) and prints the three issue-signals + viewport so we can pinpoint:
#   - JANK: camentry dt stalls (>50ms) — choppiness / "gets weird"
#   - WIGGLE: mut bundle removes while moving (>0) — the zoom-out wiggle
#   - LABEL-OVER-PIN: oracle labelOverPin>0 + the omiss lop pairs — labels covering pins
#   - LOD GAPS: oracle pinGap/dotGap, and life:hidden (search died → data invalid)
#
# Usage: scripts/lod-window.sh [seconds]   (default 12)
set -uo pipefail
DEV="${DEV:-7B0DD874-3496-46F7-9480-3EDDABCE2F31}"
SECS="${1:-12}"
TMP="$(mktemp)"
xcrun simctl spawn "$DEV" log show --last "${SECS}s" --style compact \
  --predicate 'eventMessage CONTAINS "[lodev]"' > "$TMP" 2>&1
python3 - "$TMP" <<'PY'
import re, json, sys, statistics
ev = {k: [] for k in ("camentry","mut","oracle","omiss","step")}
for line in open(sys.argv[1]):
    m = re.search(r"\[lodev\] (\{.*\})", line)
    if not m: continue
    try: d = json.loads(m.group(1))
    except Exception: continue
    if d.get("ev") in ev: ev[d["ev"]].append(d)
cam, mut, orc, omi, step = ev["camentry"], ev["mut"], ev["oracle"], ev["omiss"], ev["step"]

life = set(c.get("life") for c in cam)
if cam and life == {"hidden"}:
    print("!! search is HIDDEN this whole window (no LOD activity) — data invalid, reload the search.")

# JANK
dts = [c["dt"] for c in cam if c.get("moving") and c.get("dt",-1) > 0]
if dts:
    stalls = [d for d in dts if d > 50]
    print(f"JANK: {len(dts)} moving frames, median {round(statistics.median(dts))}ms, "
          f"max {max(dts)}ms, stalls>50ms: {len(stalls)}" + (f"  STALLS={sorted(stalls,reverse=True)[:8]}" if stalls else ""))

# WIGGLE
mv = [m for m in mut if m.get("moving")]
wig = [m for m in mv if isinstance(m.get("bundle"), list) and len(m["bundle"])>=3 and m["bundle"][2] > 0]
if mv:
    print(f"WIGGLE: {len(mv)} moving muts, removes>0 (wiggle): {len(wig)}" +
          (f"  e.g. {[(m['bundle'], m.get('reason')) for m in wig[:5]]}" if wig else ""))

# LABEL-OVER-PIN + LOD gaps (oracle counts), with zoom
if orc:
    print("ORACLE (z | renPins/expPins gap | GHOST pinMid | renDots dotGap | lop | mv/hb/st):")
    for d in orc[-14:]:
        tag = "hb" if d.get("hb") else ("mv" if d.get("moving") else "st")
        print(f"  z{d['zoom']:<5} pins {d.get('renPins')}/{d.get('expPins')} gap={d.get('pinGap')} | "
              f"GHOST={d.get('ghostN','?')} pinMid={d.get('pinMid','?')} | "
              f"dots {d.get('renDots')} dotGap={d.get('dotGap')} | lop={d.get('labelOverPin','?')} | {tag}")
    ghost_omi = [o for o in omi if o.get("ghostRanks")]
    if ghost_omi:
        print(f"  GHOST ranks (rank>top-N but pin still painting): {ghost_omi[-1]['ghostRanks']}")
    # The native lop count uses a LOOSE window (dx<60,dy<28) and over-reports proximity. Re-score the
    # raw pairs into TIGHT (genuine cover: dx<20 & dy<16) vs near, so the signal is trustworthy.
    lop_omi = [o for o in omi if o.get("lop")]
    if lop_omi:
        pairs = lop_omi[-1]["lop"]
        tight = [p for p in pairs if p[2] < 20 and p[3] < 16]
        print(f"  label-over-pin: {len(tight)} TIGHT (real cover) of {len(pairs)} shown; tight={tight}")
PY
rm -f "$TMP"
