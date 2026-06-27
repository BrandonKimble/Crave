#!/usr/bin/env python3
"""Parse the [lodev] oracle/render stream into a zoom play-by-play.

The `oracle` event is the ground-truth: per camera settle it reports the viewport
(lat/lng/zoom/bounds), how many anchors are on screen, how many SHOULD be pins/dots
(expPins/expDots, by rank) vs how many actually ARE visible (renPins/renDots,
opacity+collision aware), the gaps (pinGap/dotGap), the collision-query cross-check
(qPins/qDots), and up to 25 positioned MISMATCH rows [id,rank,sx%,sy%,edge%,exp,act]
(exp/act: 2=pin 1=dot 0=none).

Usage: lod-oracle-parse.py [logfile]   (default /tmp/lodev.log)
"""
import re, json, sys

path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/lodev.log"
oracle, render, omiss = [], [], []
for line in open(path):
    m = re.search(r"\[lodev\] (\{.*\})", line)
    if not m:
        continue
    try:
        d = json.loads(m.group(1))
    except Exception:
        continue
    if d.get("ev") == "oracle":
        oracle.append(d)
    elif d.get("ev") == "render":
        render.append(d)
    elif d.get("ev") == "omiss":
        omiss.append(d)

NYC = (40.70, 40.82, -74.03, -73.91)  # s,n,w,e — sanity box for "over Manhattan"

def in_nyc(d):
    return NYC[0] <= d["lat"] <= NYC[1] and NYC[2] <= d["lng"] <= NYC[3]

print(f"=== ORACLE ({len(oracle)} settles) — opacity+collision aware ===")
print("zoom   lat      lng      onScr expPin renPin pinGap expDot renDot dotGap labelOverPin NYC mv")
for d in oracle:
    print(f"{d['zoom']:>5} {d['lat']:>8} {d['lng']:>8} {d['onScreen']:>5} "
          f"{d['expPins']:>6} {d['renPins']:>6} {d['pinGap']:>6} "
          f"{d['expDots']:>6} {d['renDots']:>6} {d['dotGap']:>6} "
          f"{d.get('labelOverPin','?'):>12} {'Y' if in_nyc(d) else 'N!':>3} {1 if d.get('moving') else 0}")

# Detail (mismatch rows + label-over-pin pairs) lives on the separate `omiss` event (split out so the
# oracle counts line always survives `log show`). Correlate omiss→oracle by nearest timestamp.
omiss_by_t = sorted(omiss, key=lambda d: d.get("t", 0))
def nearest_omiss(t):
    best, bestdt = None, 1e9
    for d in omiss_by_t:
        dt = abs(d.get("t", 0) - t)
        if dt < bestdt:
            best, bestdt = d, dt
    return best if bestdt < 50 else None  # within 50ms = same settle

# Label-over-pin detail (the #16 zoom-in bug): settles where labels overlap pins, with the pairs.
lop = [d for d in oracle if d.get('labelOverPin', 0) > 0]
if lop:
    print(f"\n=== LABEL-OVER-PIN ({len(lop)} settles with overlaps) — [labelId,pinId,dx_px,dy_px] ===")
    for d in lop[:20]:
        om = nearest_omiss(d.get("t", 0))
        pairs = om.get("lop", []) if om else []
        print(f"  zoom={d['zoom']} mv={1 if d.get('moving') else 0} count={d['labelOverPin']} {pairs}")

# Mismatch detail for the worst dot-gap and worst pin-gap settles.
def worst(key):
    cand = [d for d in oracle if d.get(key, 0) > 0]
    return max(cand, key=lambda d: d[key]) if cand else None

for key, label in (("dotGap", "DOT"), ("pinGap", "PIN")):
    w = worst(key)
    if not w:
        print(f"\n=== no {label} mismatches anywhere ===")
        continue
    om = nearest_omiss(w.get("t", 0))
    rows = om.get("miss", []) if om else []
    print(f"\n=== worst {label}-gap settle: zoom={w['zoom']} {key}={w[key]} mismatchN={w.get('mismatchN','?')} (showing up to 25) ===")
    print("  id      rank  sx%  sy% edge%  exp act   (exp/act: 2=pin 1=dot 0=none)")
    for r in rows:
        print(f"  {r[0]:<7} {r[1]:>4} {r[2]:>4} {r[3]:>4} {r[4]:>4}   {r[5]}   {r[6]}")

if render:
    print(f"\n=== RENDER cross-check ({len(render)}) — queryRenderedFeatures collision truth ===")
    print("zoom  onScreen shouldPromote renPins renDots renLabels missing extra")
    for d in render:
        print(f"{d['zoom']:>5} {d['onScreen']:>8} {d['shouldPromote']:>12} {d['renderedPins']:>7} "
              f"{d['renderedDots']:>7} {d['renderedLabels']:>9} {d['missing']:>7} {d['extra']:>5}")
