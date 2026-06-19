#!/usr/bin/env node
/* LOD harness analyzer. Parses the [lodev] JSONL event stream and flags anti-patterns.
 * See plans/lod-observability-harness.md. Usage: node lod-harness-analyze.js <jsonl> [video] */
const fs = require('fs');

const jsonlPath = process.argv[2];
const videoPath = process.argv[3] || null;
const videoStartMs = process.argv[4] ? Number(process.argv[4]) : null;
if (!jsonlPath || !fs.existsSync(jsonlPath)) {
  console.error('usage: lod-harness-analyze.js <jsonl> [video] [videoStartMs]');
  process.exit(1);
}

const events = [];
for (const line of fs.readFileSync(jsonlPath, 'utf8').split('\n')) {
  const s = line.trim();
  if (!s) continue;
  try {
    events.push(JSON.parse(s));
  } catch {
    /* skip malformed */
  }
}
events.sort((a, b) => (a.t || 0) - (b.t || 0));

const frames = events.filter((e) => e.ev === 'frame');
const lods = events.filter((e) => e.ev === 'lod');
const steps = events.filter((e) => e.ev === 'step');
const GROUP_THRESHOLD = 5; // >= this many in one event = a "group" (not per-pin)

console.log(`\n=== LOD HARNESS REPORT ===`);
console.log(`events: ${events.length}  frames: ${frames.length}  lod(role-flips): ${lods.length}`);
if (frames.length === 0 && lods.length === 0) {
  console.log('NO EVENTS — harness not emitting (build/flag?) or no map activity.');
  process.exit(0);
}

const flags = [];

// --- TOP-N CORRECTNESS: of the markers IN VIEW, exactly the top-min(visible,40) by rank must
// be promoted at every frame. By construction promoted should EQUAL min(visible,40); if promoted
// is LESS, the projection/decision dropped markers that should be pins (under-promotion). ---
for (const f of frames) {
  const expected = Math.min(f.visible, 40);
  if (f.promoted > expected + 0.001) {
    flags.push({ issue: 'count_sanity', t: f.t, detail: `promoted ${f.promoted} > min(visible ${f.visible},40)` });
  }
  // Under-promotion: in view but not enough promoted. The headline zoom bug = visible>0 but
  // promoted=0 (dots on screen, nothing promoted). Also catch promoted << expected generally.
  if (f.visible > 0 && f.promoted < expected - 0.001) {
    flags.push({ issue: 'under_promotion', t: f.t, detail: `visible ${f.visible} but only ${f.promoted} promoted (expected ${expected}) zoom=${f.zoom} moving=${f.moving}` });
  }
}
// --- ZOOM-DISAPPEAR: during a zoom-in (zoom rising), did the visible set collapse toward 0 /
// promoted go to 0 even though markers were on screen just before? (the "dots vanish" bug) ---
for (let i = 1; i < frames.length; i++) {
  const a = frames[i - 1], b = frames[i];
  if (b.zoom > a.zoom + 0.05 && a.visible >= 10 && b.visible <= 2) {
    flags.push({ issue: 'zoom_collapse', t: b.t, detail: `zoom ${a.zoom}->${b.zoom}: visible collapsed ${a.visible}->${b.visible} (markers vanished on zoom-in)` });
  }
  if (b.zoom > a.zoom + 0.05 && a.promoted >= 5 && b.promoted === 0) {
    flags.push({ issue: 'zoom_depromote', t: b.t, detail: `zoom ${a.zoom}->${b.zoom}: promoted ${a.promoted}->0 (nothing promoted after zoom-in)` });
  }
}

// --- group_enter: many markers entered the viewport in one frame ---
const groupEnters = frames.filter((f) => (f.enter || 0) >= GROUP_THRESHOLD);
for (const f of groupEnters.slice(0, 8)) {
  flags.push({ issue: 'group_enter', t: f.t, detail: `${f.enter} entered at once (moving=${f.moving})` });
}

// --- group_flip: many role flips in one lod event (should be per-pin, ~1-2) ---
const groupFlips = lods.filter((l) => (l.affected || 0) >= GROUP_THRESHOLD);
for (const l of groupFlips.slice(0, 8)) {
  flags.push({ issue: 'group_flip', t: l.t, detail: `${l.affected} flips at once (promote ${l.promote}/demote ${l.demote}, moving=${l.moving})` });
}

// --- THE SNAP DETECTOR: are role flips happening DURING motion (per-pin) or clustering
// after the gesture stops (snap)? Compare promotes attributed to moving vs idle lod events. ---
const movingLods = lods.filter((l) => l.moving === true);
const idleLods = lods.filter((l) => l.moving === false);
const promMoving = movingLods.reduce((s, l) => s + (l.promote || 0), 0);
const promIdle = idleLods.reduce((s, l) => s + (l.promote || 0), 0);
const allowNewMovingFalse = movingLods.filter((l) => l.allowNew === false).length;

// frames that were moving vs idle (to know how much motion there was)
const movingFrames = frames.filter((f) => f.moving === true).length;
const idleFrames = frames.filter((f) => f.moving === false).length;

console.log(`\n--- motion split ---`);
console.log(`frames moving=${movingFrames} idle=${idleFrames}`);
console.log(`role-flips while MOVING: ${movingLods.length} (promotes=${promMoving})`);
console.log(`role-flips while IDLE : ${idleLods.length} (promotes=${promIdle})`);
console.log(`lod events with allowNew=false while moving: ${allowNewMovingFalse}`);

// Heuristic verdict for the snap-after-gesture bug.
if (movingFrames > 5 && movingLods.length === 0 && idleLods.length > 0) {
  flags.push({
    issue: 'snap_after_gesture',
    t: idleLods[0]?.t,
    detail: `0 role-flips during ${movingFrames} moving frames, but ${idleLods.length} flips once idle — promotions are DEFERRED to settle (the snap).`,
  });
} else if (promIdle > promMoving * 2 && movingFrames > 5) {
  flags.push({
    issue: 'snap_skew',
    t: idleLods[0]?.t,
    detail: `promotions skew to idle (${promIdle} idle vs ${promMoving} moving) — partial snap-after-gesture.`,
  });
}
if (allowNewMovingFalse > 0) {
  flags.push({ issue: 'deferred_in_motion', t: movingLods.find((l) => l.allowNew === false)?.t, detail: `${allowNewMovingFalse} role-flips during motion had allowNew=false (transitions suppressed → snap).` });
}

// --- STEP (render) analysis: is opacity ANIMATING during motion, or only after? ---
// This is the snap-after-gesture detector at the RENDER level. midFade>0 = pins mid-crossfade.
const movingSteps = steps.filter((s) => s.moving === true);
const idleSteps = steps.filter((s) => s.moving === false);
const movingMidFade = movingSteps.reduce((s, e) => s + (e.midFade || 0), 0);
const idleMidFade = idleSteps.reduce((s, e) => s + (e.midFade || 0), 0);
const movingStepsAnimating = movingSteps.filter((s) => (s.midFade || 0) > 0).length;
const idleStepsAnimating = idleSteps.filter((s) => (s.midFade || 0) > 0).length;
if (steps.length > 0) {
  console.log(`\n--- step (render) ---`);
  console.log(`steps total ${steps.length}: moving ${movingSteps.length} (animating ${movingStepsAnimating}, midFadeSum ${movingMidFade}) | idle ${idleSteps.length} (animating ${idleStepsAnimating}, midFadeSum ${idleMidFade})`);
  // SNAP at render: crossfade intensity (mid-fade pins per frame) concentrated at SETTLE vs
  // during motion. If the idle rate >> moving rate, the per-pin fades are being deferred and
  // burst at gesture-end = the snap the eye sees.
  const movingRate = movingSteps.length ? movingMidFade / movingSteps.length : 0;
  const idleRate = idleSteps.length ? idleMidFade / idleSteps.length : 0;
  const movingAnimFrac = movingSteps.length ? movingStepsAnimating / movingSteps.length : 0;
  console.log(`midFade/frame: moving ${movingRate.toFixed(2)} | idle ${idleRate.toFixed(2)}`);
  console.log(`moving frames animating: ${(movingAnimFrac * 100).toFixed(0)}% | idle role-flips: ${idleLods.length}`);
  // The real snap test: are per-pin crossfades happening DURING the gesture? If <30% of moving
  // frames have any mid-fade pin (fades not animating while moving) AND the idle burst is large,
  // the fades are deferred to settle (the snap). In-flight fades *completing* during the brief
  // idle tail (with idle role-flips == 0) is NORMAL, not a snap.
  if (movingSteps.length > 10 && movingAnimFrac < 0.3 && idleRate > 3) {
    flags.push({ issue: 'render_snap', t: idleSteps[0]?.t, detail: `only ${(movingAnimFrac * 100).toFixed(0)}% of moving frames had a crossfade, then ${idleRate.toFixed(0)} mid-fade pins/frame at settle — fades deferred to gesture-end (the snap).` });
  }
  if (idleLods.length > 2) {
    flags.push({ issue: 'flips_at_settle', t: idleLods[0]?.t, detail: `${idleLods.length} role-flips fired only AFTER motion stopped — promotion decision is deferred to settle.` });
  }

  // --- CROSSFADE DESYNC (demotion bug): a pin demoting-in-place whose dot is NOT fading in
  // alongside it (xfadeGap>0) → the dot snaps in late after the pin fully faded out. ---
  const gapSteps = steps.filter((s) => (s.xfadeGap || 0) > 0);
  const gapTotal = gapSteps.reduce((s, e) => s + (e.xfadeGap || 0), 0);
  // also: dots barely crossfade vs pins (dot fades are sequential, not synchronized)
  const pinMidSum = steps.reduce((s, e) => s + (e.pinMidFade || 0), 0);
  const dotMidSum = steps.reduce((s, e) => s + (e.dotMidFade || 0), 0);
  console.log(`crossfade: pinMidFade total ${pinMidSum} | dotMidFade total ${dotMidSum} | xfadeGap steps ${gapSteps.length} (sum ${gapTotal})`);
  if (gapSteps.length > 2) {
    flags.push({ issue: 'crossfade_desync', t: gapSteps[0]?.t, detail: `${gapSteps.length} frames had a demoting pin with NO synchronized dot fade-in (xfadeGap sum ${gapTotal}) — dot appears late after the pin is gone.` });
  } else if (pinMidSum > 20 && dotMidSum < pinMidSum * 0.25) {
    flags.push({ issue: 'crossfade_desync', t: steps[0]?.t, detail: `pins crossfade (${pinMidSum}) but dots barely do (${dotMidSum}) — demotion dot fade-in not synchronized with the pin fade-out.` });
  }

  // --- JANK / choppiness: stepper frame interval while ANIMATING. ~16.7ms = 60fps; sustained
  // >24ms (<~42fps) during active crossfades = choppy. ---
  const animSteps = steps.filter((s) => (s.activePin || 0) > 0 || (s.activeDot || 0) > 0);
  const dtVals = animSteps.map((s) => s.dtMs || 0).filter((d) => d > 0 && d < 2000);
  if (dtVals.length > 5) {
    const avgDt = dtVals.reduce((a, b) => a + b, 0) / dtVals.length;
    const janky = dtVals.filter((d) => d > 24).length;
    const fps = avgDt > 0 ? (1000 / avgDt).toFixed(0) : 'n/a';
    console.log(`perf: ${dtVals.length} animating frames, avg ${avgDt.toFixed(1)}ms (~${fps}fps), ${janky} frames >24ms`);
    if (janky / dtVals.length > 0.25 || avgDt > 24) {
      flags.push({ issue: 'jank', t: animSteps.find((s) => (s.dtMs || 0) > 24)?.t, detail: `render choppy during animation: avg ${avgDt.toFixed(1)}ms/frame (~${fps}fps), ${janky}/${dtVals.length} frames >24ms.` });
    }
  }
}

// --- timeline (compact): one line per frame showing the live counts + flips ---
console.log(`\n--- timeline (frame: vis/prom enter/leave moving | lod flips) ---`);
const lodByT = new Map();
for (const l of lods) lodByT.set(l.t, l);
let shown = 0;
for (const f of frames) {
  const l = lodByT.get(f.t);
  const lodStr = l ? ` | LOD +${l.promote}/-${l.demote} allowNew=${l.allowNew}` : '';
  const interesting = (f.enter || 0) > 0 || (f.leave || 0) > 0 || l;
  if (interesting && shown < 40) {
    console.log(
      `t=${f.t} vis=${f.visible} prom=${f.promoted} +${f.enter}/-${f.leave} moving=${f.moving}${lodStr}`
    );
    shown++;
  }
}

console.log(`\n=== FLAGS (${flags.length}) ===`);
if (flags.length === 0) {
  console.log('none — per-pin during motion, no group/snap detected.');
} else {
  const byIssue = {};
  for (const fl of flags) (byIssue[fl.issue] ||= []).push(fl);
  for (const [issue, list] of Object.entries(byIssue)) {
    console.log(`\n[${issue}] x${list.length}`);
    for (const fl of list.slice(0, 5)) console.log(`  t=${fl.t}  ${fl.detail}`);
  }
}

// EXACT-MOMENT frame extraction (TRUST THE SIM). Each `frame` event carries both t (mach ms)
// and e (epoch ms). The video started at videoStartMs (epoch). So for ANY event at mach-time t:
//   epoch(t) ≈ t + median(e - t over frames);  videoOffsetSec = (epoch(t) - videoStartMs)/1000.
if (videoPath && fs.existsSync(videoPath)) {
  const teDiffs = frames.filter((f) => f.e != null).map((f) => f.e - f.t).sort((a, b) => a - b);
  const teOffset = teDiffs.length ? teDiffs[Math.floor(teDiffs.length / 2)] : null;
  console.log(`\nvideo: ${videoPath}`);
  if (teOffset != null && videoStartMs != null) {
    const offs = [];
    for (const fl of flags.slice(0, 8)) {
      if (fl.t == null) continue;
      const sec = ((fl.t + teOffset - videoStartMs) / 1000).toFixed(2);
      if (Number(sec) >= 0) offs.push(sec);
      console.log(`  [${fl.issue}] t=${fl.t} -> video ${sec}s`);
    }
    if (offs.length) {
      console.log(`\nextract exact-moment frames (AVFoundation, no ffmpeg):`);
      console.log(`  swift /tmp/vframe.swift ${videoPath} /tmp/lodframe ${offs.join(' ')}`);
    }
  } else {
    console.log(`  (no videoStartMs/epoch sync — pass it as argv[4] and ensure frame events carry "e")`);
  }
}
