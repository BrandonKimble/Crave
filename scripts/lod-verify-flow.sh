#!/usr/bin/env bash
# Red-team the DRIVE FLOW from the harness log alone (no video): prove the camera (1) stayed over NYC, (2)
# zoomed IN before it panned, and (3) produced the moment-to-moment per-anchor play-by-play during motion.
# Usage: scripts/lod-verify-flow.sh [lodev-log]   (default /tmp/lodev-v5-clean.log)
set -uo pipefail
LOG="${1:-/tmp/lodev-v5-clean.log}"
[ -f "$LOG" ] || { echo "no log: $LOG"; exit 1; }

# NYC bounds (generous Manhattan box). Any frame center outside = drift.
LAT_MIN=40.68; LAT_MAX=40.84; LNG_MIN=-74.06; LNG_MAX=-73.88

python3 - "$LOG" "$LAT_MIN" "$LAT_MAX" "$LNG_MIN" "$LNG_MAX" <<'PY'
import json, re, sys
log, latmin, latmax, lngmin, lngmax = sys.argv[1], *map(float, sys.argv[2:6])
frames=[]
anchors_moving=0
for line in open(log, errors='ignore'):
    i=line.find('[lodev] ')
    if i<0: continue
    try: ev=json.loads(line[i+8:])
    except Exception: continue
    t=ev.get('ev')
    if t=='frame': frames.append(ev)
    elif t=='v5anchors' and ev.get('moving') is True: anchors_moving+=1

if not frames:
    print("FAIL: no frame events (search did not project)"); sys.exit(1)

# (1) stays over NYC
drift=[f for f in frames if not (latmin<=f.get('lat',0)<=latmax and lngmin<=f.get('lng',0)<=lngmax)]
lats=[f['lat'] for f in frames if 'lat' in f]; lngs=[f['lng'] for f in frames if 'lng' in f]
print(f"[NYC]  frames={len(frames)} lat[{min(lats):.4f},{max(lats):.4f}] lng[{min(lngs):.4f},{max(lngs):.4f}] driftFrames={len(drift)}  -> {'PASS' if not drift else 'FAIL'}")

# (2) zoom-before-pan: find first frame whose zoom rose >0.5 above the start (zoom-in), and the first frame
# whose center moved >150m from the start (pan). Pan must not precede the first zoom-in.
import math
z0=frames[0].get('zoom'); la0=frames[0].get('lat'); ln0=frames[0].get('lng')
def m(la,ln):
    dlat=(la-la0)*111000; dlng=(ln-ln0)*111000*math.cos(math.radians(la0)); return math.hypot(dlat,dlng)
first_zoom=next((k for k,f in enumerate(frames) if f.get('zoom',z0)-z0>0.5), None)
first_pan=next((k for k,f in enumerate(frames) if m(f.get('lat',la0),f.get('lng',ln0))>150), None)
ok = first_zoom is not None and (first_pan is None or first_pan>=first_zoom)
print(f"[ZBP]  firstZoomInIdx={first_zoom} firstPanIdx={first_pan} (pan must be >= zoom)  -> {'PASS' if ok else 'FAIL'}")

# (3) moment-to-moment per-anchor play-by-play exists DURING motion
print(f"[PBP]  v5anchors(moving) frames={anchors_moving}  -> {'PASS' if anchors_moving>=5 else 'FAIL'}")
PY
