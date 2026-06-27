#!/usr/bin/env bash
# Read/reset the v5 LOD ATTRIBUTION file sink (bypasses os_log, survives dense-repro drops).
# Usage: lod-attr.sh reset | path | read
set -euo pipefail
UDID=7B0DD874-3496-46F7-9480-3EDDABCE2F31
BUNDLE=com.brandonkimble.cravesearch
CONTAINER=$(xcrun simctl get_app_container "$UDID" "$BUNDLE" data)
ATTR="$CONTAINER/Library/Caches/lod-attr.jsonl"

case "${1:-read}" in
  reset) rm -f "$ATTR"; echo "cleared $ATTR" ;;
  path)  echo "$ATTR" ;;
  read)
    if [[ ! -f "$ATTR" ]]; then echo "NO attr file yet ($ATTR)"; exit 0; fi
    python3 - "$ATTR" <<'PY'
import sys, json
rows = []
for line in open(sys.argv[1]):
    line = line.strip()
    if not line: continue
    try: rows.append(json.loads(line))
    except: pass
print(f"=== {len(rows)} attribution events ===")
from collections import Counter
kinds = Counter(r.get("k") for r in rows)
for k, n in kinds.most_common(): print(f"  {n:5d}  {k}")

def show(title, kind, fmt):
    rs = [r for r in rows if r.get("k") == kind]
    if not rs: return
    print(f"\n--- {kind}: {len(rs)} ({title}) ---")
    for r in rs[-25:]:
        print("   " + fmt(r))

# FLASH-OUT analysis (paint_snap): is the drop engine-driven or a desync? stall or fast?
snaps = [r for r in rows if r.get("k") == "paint_snap" and r.get("to",100) < r.get("from",0)]
if snaps:
    print(f"\n=== FLASH-OUT (paint_snap, downward): {len(snaps)} ===")
    eng_driven = [r for r in snaps if abs(r.get("engOp",100) - r.get("to",0)) <= 20]
    desync     = [r for r in snaps if abs(r.get("engOp",100) - r.get("to",0)) >  20]
    pres_snap  = [r for r in snaps if r.get("pres",100) < 50 and r.get("lod",0) > 50]
    baked_fall = [r for r in snaps if r.get("baked") == 1]
    stall      = [r for r in snaps if r.get("dtMs",0) > 50]
    fast       = [r for r in snaps if r.get("dtMs",0) <= 50]
    print(f"  engine-driven (engOp≈to): {len(eng_driven)}   desync (engOp≠to, paint diverged): {len(desync)}")
    print(f"  presentation-snap (pres<50,lod>50): {len(pres_snap)}   baked-fall (fs cleared): {len(baked_fall)}")
    print(f"  during stall (dtMs>50): {len(stall)}   fast (dtMs<=50, ~1 frame): {len(fast)}")
    if stall:
        dts = sorted(r.get("dtMs",0) for r in stall)
        print(f"  stall dtMs: min={dts[0]} med={dts[len(dts)//2]} max={dts[-1]}")

# BUDGET-VIOLATION probes (consensus #2): forced_count, v4_authority_fire, gpu_demote_census
fc = [r for r in rows if r.get("k") == "forced_count"]
v4 = [r for r in rows if r.get("k") == "v4_authority_fire"]
gc = [r for r in rows if r.get("k") == "gpu_demote_census"]
if fc or v4 or gc:
    print("\n========== BUDGET-VIOLATION VERDICT ==========")
    # forced_count: is the >budget intentional (forced) or a leak?
    if fc:
        pf = max(r.get("forced",0) for r in fc); pp = max(r.get("promoted",0) for r in fc)
        print(f"  forced_count: {len(fc)} samples  peak forced={pf}  peak promoted={pp}")
        print(f"    >>> {'FORCED OVERFLOW (intentional) — highlightedMarkerKeys is large' if pf > 5 else 'forced is small ('+str(pf)+') → over-budget is a LEAK, not forced'}")
    else:
        print("  forced_count: 0 fired → promoted never exceeded 33 AND forced<=2 (no forced overflow)")
    # v4_authority_fire: is the ungated v4 path writing under v5?
    if v4:
        byfn = Counter(r.get("fn") for r in v4); byreason = Counter(r.get("reason") for r in v4 if r.get("reason"))
        print(f"  v4_authority_fire: {len(v4)} FIRES under v5 (the V4 leak is ACTIVE)  by fn={dict(byfn)}")
        if byreason: print(f"    reconcile reasons: {dict(byreason)}")
        overb = [r for r in v4 if r.get("pinned",0) > 35 or r.get("desiredPins",0) > 35]
        print(f"    fires with pinned/desiredPins > 35 (v4 driving >budget): {len(overb)}")
        for r in (overb or v4)[-8:]:
            print(f"      fn={r.get('fn')} reason={r.get('reason')} pinned={r.get('pinned')} desiredPins={r.get('desiredPins')} v5pins={r.get('v5pins')}")
    else:
        print("  v4_authority_fire: 0 → the ungated v4 path did NOT run under v5 this repro (v4 remnant not the active writer)")
    # gpu_demote_census: does the GPU actually paint >30 pins (the divergence)?
    if gc:
        pv = max(r.get("gpuVisibleTotal",0) for r in gc); pp = max(r.get("gpuPerceptible",0) for r in gc)
        pmid = max(r.get("demoMid",0)+r.get("promMid",0) for r in gc)
        print(f"  gpu_demote_census: {len(gc)} samples  peak gpuVisibleTotal(>0.5)={pv}  peak gpuPerceptible(>0.1)={pp}  peak mid-band={pmid}")
        print(f"    >>> {'CONFIRMED: ~'+str(pp)+' PERCEPTIBLE pins on GPU = '+str(pv)+' full + '+str(pmid)+' mid-opacity (the '+chr(34)+'60'+chr(34)+' = 30 promoted + ~30 stuck/transitioning mid)' if pp > 40 else 'GPU perceptible ~'+str(pp)+' — not a large over-budget even at the perceptible threshold (moment missed or different cause)'}")
        for r in sorted(gc, key=lambda r: r.get("gpuPerceptible",0))[-8:]:
            print(f"      perceptible={r.get('gpuPerceptible')} full(>0.5)={r.get('gpuVisibleTotal')} [promHigh={r.get('promHigh')} demoHigh={r.get('demoHigh')} promMid={r.get('promMid')} demoMid={r.get('demoMid')}] demotedChecked={r.get('demotedChecked')} ex={r.get('ex')}")
    else:
        print("  gpu_demote_census: 0 → oracle didn't run (no motion/settle samples)")

# CWORK PROFILE — what eats the camera-frame budget that starves the stepper (production vs harness)
cw = [r for r in rows if r.get("k") == "cwork"]
if cw:
    print("\n========== CWORK PROFILE (per camera-frame main-thread cost) ==========")
    def stat(key):
        vals = sorted(r.get(key,0) for r in cw)
        return f"med={vals[len(vals)//2]} p90={vals[int(len(vals)*0.9)]} max={vals[-1]}"
    moving = [r for r in cw if r.get("moving")]
    print(f"  cwork samples: {len(cw)}  ({len(moving)} during motion)")
    print(f"  projectMs (production: project ~530 markers): {stat('projectMs')}")
    print(f"  driveMs   (production: reconcile):            {stat('driveMs')}")
    print(f"  oracleMs  (HARNESS: queryRenderedFeatures):   {stat('oracleMs')}")
    print(f"  totalMs   (cwork total):                      {stat('totalMs')}")
    worst = sorted(cw, key=lambda r: r.get("totalMs",0))[-6:]
    print("  worst frames:")
    for r in worst:
        print(f"    total={r.get('totalMs')}ms  project={r.get('projectMs')} drive={r.get('driveMs')} oracle={r.get('oracleMs')}  moving={r.get('moving')}")

# DRIFT — engine vs painted mirror gap, measured every tick (the lag that snaps on catch-up)
dr = [r for r in rows if r.get("k") == "drift"]
if dr:
    print("\n========== DRIFT (engine vs painted mirror) ==========")
    pa = max((r.get("ahead",0) for r in dr), default=0)
    pb = max((r.get("behind",0) for r in dr), default=0)
    pm = max((r.get("maxPct",0) for r in dr), default=0)
    idle_dr = [r for r in dr if r.get("idle")]
    print(f"  drift samples: {len(dr)}  ({len(idle_dr)} while engine IDLE)")
    print(f"  peak aheadN(mirror lagging)={pa}  peak behindN(mirror stale-high)={pb}  peak maxPct={pm}")
    for r in sorted(dr, key=lambda r: r.get("ahead",0)+r.get("behind",0))[-8:]:
        print(f"    ahead={r.get('ahead')} behind={r.get('behind')} maxPct={r.get('maxPct')} idle={r.get('idle')} pendMotion={r.get('pendingMotion')} dtMs={r.get('dtMs')} ex={r.get('ex')}")

# GROUP-WRITE — which batch writer (step/reassert/seed) snaps a group of pins in one write
gw = [r for r in rows if r.get("k") == "group_write"]
if gw:
    print("\n========== GROUP-WRITE (the unison group snap, by writer) ==========")
    byreason = Counter(r.get("reason") for r in gw)
    print(f"  group writes by reason: {dict(byreason)}")
    bign = sorted(gw, key=lambda r: r.get("n",0))[-8:]
    for r in bign:
        print(f"    reason={r.get('reason')} n={r.get('n')}/{r.get('writes')}  ex={r.get('ex')}")

# H1 VERDICT — the V4 leak: role-only frame clobbers role table + wipes the pin bundle on settle
bm = [r for r in rows if r.get("k") == "bundle_mut"]
fd = [r for r in rows if r.get("k") == "fsdrop"]
ir = [r for r in rows if r.get("k") == "idle_reassert"]
if bm or fd or ir:
    print("\n========== H1 VERDICT (V4 live_marker_role_frame leak) ==========")
    # smoking gun: role-only frame, not moving, bundle removed, role table clobbered while engine holds promoted
    gun = [r for r in bm if r.get("bundleRem",0) > 0 and not r.get("moving") and r.get("roleTablePins",99) <= 2 and r.get("engVisible",0) > 5]
    clobber = [r for r in bm if r.get("roleTablePins",99) <= 2 and r.get("engVisible",0) > 5]
    roleRemoves = [r for r in bm if r.get("bundleRem",0) > 0]
    print(f"  bundle_mut samples: {len(bm)}")
    print(f"  CLOBBER (roleTablePins<=2 while engVisible>5): {len(clobber)}")
    print(f"  bundle pin-REMOVES (bundleRem>0): {len(roleRemoves)}")
    print(f"  *** H1 SMOKING GUN (rem>0 + not moving + clobber): {len(gun)} ***")
    byreason = Counter(r.get("reason") for r in roleRemoves)
    print(f"  removes by reason: {dict(byreason)}")
    upd = [r for r in bm if r.get("bundleUpd",0) > 0]
    print(f"  bundle UPDATES (bundleUpd>0, re-bake → mirror reset suspect): {len(upd)}")
    byreason_u = Counter(r.get("reason") for r in upd)
    if upd: print(f"    updates by reason: {dict(byreason_u)}  peak bundleUpd={max(r.get('bundleUpd',0) for r in upd)}")
    for r in (gun or roleRemoves or upd or clobber)[-10:]:
        print(f"    reason={r.get('reason')} moving={r.get('moving')} bundleAdd={r.get('bundleAdd')} bundleUpd={r.get('bundleUpd')} bundleRem={r.get('bundleRem')} roleTablePins={r.get('roleTablePins')} engVisible={r.get('engVisible')}")
    if fd:
        mg = max((r.get("groupSnapMagnitude",0) for r in fd), default=0)
        print(f"  fsdrop events: {len(fd)}  peak groupSnapMagnitude={mg}  (≈budget ⇒ unison wipe)")
        for r in sorted(fd, key=lambda r: r.get("groupSnapMagnitude",0))[-5:]:
            print(f"    pinRem={r.get('pinRem')} pinSnap={r.get('pinSnap')} dotSnap={r.get('dotSnap')} groupSnap={r.get('groupSnapMagnitude')}")
    if ir:
        print(f"  idle_reassert (C2 snap-back-in) events: {len(ir)}  peak writes={max((r.get('writes',0) for r in ir), default=0)}  peak pendingMotion={max((r.get('pendingMotion',0) for r in ir), default=0)}")
    if not gun and not roleRemoves:
        print("  >>> NO bundle pin-removes captured — H1 bundle-removal mechanism would be REFUTED. Re-check.")

# CULL CENSUS (render-truth flash via collision): the binary 100->0 the opacity monitor can't see
culls = [r for r in rows if r.get("k") == "cull_census"]
if culls:
    md = max((r.get("dotsCulled",0) for r in culls), default=0)
    ml = max((r.get("lblCulled",0) for r in culls), default=0)
    mp = max((r.get("pinsGone",0) for r in culls), default=0)
    moving = [r for r in culls if r.get("moving")]
    print(f"\n=== CULL CENSUS (collision flash): {len(culls)} samples ({len(moving)} during motion) ===")
    print(f"  peak dotsCulled={md}  peak labelsCulled={ml}  peak pinsGone(removed)={mp}")
    print("  worst samples:")
    for r in sorted(culls, key=lambda r: r.get("dotsCulled",0)+r.get("lblCulled",0)+r.get("pinsGone",0))[-8:]:
        print(f"    moving={r.get('moving')} dotsCulled={r.get('dotsCulled')}/{r.get('dotsWanted')} lblCulled={r.get('lblCulled')}/{r.get('lblWanted')} pinsGone={r.get('pinsGone')} zoom={r.get('zoom')} ex={r.get('ex')}")

# STUCK analysis (mid_dwell): frozen vs oscillating
dwells = [r for r in rows if r.get("k") in ("mid_dwell","mid_dwell_end")]
if dwells:
    print(f"\n=== STUCK-AT-MID (mid_dwell): {len(dwells)} ===")
    frozen = [r for r in dwells if (r.get("maxP",0)-r.get("minP",0)) <= 8 and r.get("flips",0)==0]
    osc    = [r for r in dwells if r.get("flips",0) >= 2]
    wide   = [r for r in dwells if (r.get("maxP",0)-r.get("minP",0)) > 8 and r.get("flips",0)<2]
    print(f"  FROZEN (range<=8, 0 flips): {len(frozen)}   OSCILLATING (flips>=2): {len(osc)}   wide-but-few-flips: {len(wide)}")
    if osc:
        fl = sorted(r.get("flips",0) for r in osc)
        print(f"  oscillation flips: min={fl[0]} med={fl[len(fl)//2]} max={fl[-1]}")
    longest = sorted(dwells, key=lambda r: r.get("frames",0))[-5:]
    print("  longest dwells: " + " | ".join(f"id={r.get('id')} frames={r.get('frames')} range={r.get('minP')}-{r.get('maxP')} flips={r.get('flips')}" for r in longest))

show("flash via source-feature removal", "remove_promoted", lambda r: f"src={r.get('src')} n={r.get('n')} totalRem={r.get('totalRem')} adds={r.get('adds')}")
show("flash via teardown fs-nuke", "clearknown_promoted", lambda r: f"src={r.get('src')} n={r.get('n')}")
show("flash via reset fs-clear", "reset_clear_promoted", lambda r: f"reason={r.get('reason')} n={r.get('n')}")
show("STUCK: link not stepping while motion pending", "link_stall", lambda r: f"stepAgeMs={r.get('stepAgeMs')} pendingMotion={r.get('pendingMotion')}")
show("painted snap (flash)", "paint_snap", lambda r: f"id={r.get('id')} {r.get('from')}->{r.get('to')} lod={r.get('lod')} pres={r.get('pres')} baked={r.get('baked')} engOp={r.get('engOp')} engWant={r.get('engWant')} dtMs={r.get('dtMs')}")
show("painted stuck-at-mid", "paint_stuck", lambda r: f"id={r.get('id')} val={r.get('val')} lod={r.get('lod')} pres={r.get('pres')} engOp={r.get('engOp')} engWant={r.get('engWant')}")
show("painted vanish (fs+baked gone)", "paint_vanish", lambda r: f"id={r.get('id')} from={r.get('from')} engOp={r.get('engOp')} engWant={r.get('engWant')}")
show("mid-dwell (lingering mid)", "mid_dwell", lambda r: f"id={r.get('id')} frames={r.get('frames')} range={r.get('minP')}-{r.get('maxP')} flips={r.get('flips')} engOp={r.get('engOp')} engWant={r.get('engWant')} dtMs={r.get('dtMs')}")
show("mid-dwell end", "mid_dwell_end", lambda r: f"id={r.get('id')} frames={r.get('frames')} range={r.get('minP')}-{r.get('maxP')} flips={r.get('flips')} settledAt={r.get('settledAt')}")
PY
    ;;
esac
