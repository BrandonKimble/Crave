#!/usr/bin/env node
/* LOD harness analyzer. Parses the [lodev] JSONL event stream and flags anti-patterns.
 * See plans/lod-observability-harness.md. Usage: node lod-harness-analyze.js <jsonl> [video] */
const fs = require('fs');

const jsonlPath = process.argv[2];
const videoPath = process.argv[3] || null;
if (!jsonlPath || !fs.existsSync(jsonlPath)) {
  console.error('usage: lod-harness-analyze.js <jsonl> [video]');
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

// --- count sanity: promoted <= min(visible, 40) ---
for (const f of frames) {
  if (f.promoted > Math.min(f.visible, 40) + 0.001) {
    flags.push({ issue: 'count_sanity', t: f.t, detail: `promoted ${f.promoted} > min(visible ${f.visible},40)` });
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

if (videoPath && fs.existsSync(videoPath)) {
  console.log(`\nvideo: ${videoPath}`);
  console.log(`to extract the frame at a flagged event t (ms since launch ~ event t minus first-frame t):`);
  const t0 = frames[0]?.t || lods[0]?.t || 0;
  console.log(`  first event t0=${t0}; for flag at t, video offset ≈ (t - t0)/1000 s`);
  for (const fl of flags.slice(0, 5)) {
    if (fl.t == null) continue;
    const off = ((fl.t - t0) / 1000).toFixed(2);
    console.log(`  [${fl.issue}] ffmpeg -ss ${off} -i ${videoPath} -frames:v 1 /tmp/lodframe_${fl.issue}_${fl.t}.png`);
  }
}
