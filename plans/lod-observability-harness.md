# LOD + Map Observability Harness — plan & worklog (2026-06-19)

GOAL (user /goal): a harness I can run myself that exposes EVERYTHING about LOD + map objects
as a parseable event stream, so I can move the map and verify exactly what happened — per-pin
enter/leave/promote/demote/fade, on-screen membership (pitch-adjusted), counts, AND map
performance/smoothness — and flag anti-patterns automatically. Plus exact-moment visual truth
(screenshot/frame at the instant an event fired). TRUST THE SIM: if a frame at the event's
exact moment contradicts the event, the harness is wrong — fix the harness, not the screen.

Do NOT call done until: (1) all LOD redesign phases finished + dead code deleted, (2) harness
built, (3) the finished LOD run through it, real issues exposed, (4) harness validated to match
the sim (events ↔ exact-moment frames agree).

ORDER (user): finish phases → build harness → run LOD through it → iterate.

---

## KNOWN BUG to expose+fix (headline): "pins all snap in AFTER the gesture is over"

Native decision evolves DURING the gesture (native_lod logs fire reason=camera_moving with the
set changing), but the rendered opacity only applies on settle → batch snap. Hypothesis: a
during-motion deferral in the apply path — `allowsIncrementalMarkerTransitions` /
`shouldAnimateIncrementalTransitions` (reconcileAndApplyLiveMarkerRoleOutputs ~4955) gates new
transitions off during motion (old anti-flash behavior from commit 9d896a91 "no fresh
promotions during camera motion"). The per-pin model WANTS promotions during motion. The
harness must catch exactly this: "decision changed at T (moving) but apply deferred to settle."

---

## PHASE 3 — delete the dead JS/native LOD machinery (finish the redesign)

After Phase 2 native owns LOD. Delete (all recorded in git):

- JS use-direct-search-map-source-controller.ts:
  - buildMarkerRenderModel call + the whole viewport_lod branch of publishSources (the top-N
    re-slice, the source-frame rebuild on LOD). publishSources keeps ONLY the data-change path
    (resident catalog + resident pin/dot/label sources). Native decides; JS never decides LOD.
  - buildShortcutViewportProjectionToken + VIEWPORT*PROJECTION*\* consts + normalizeViewportProjectionSpan
    - ShortcutViewportLodCadence + shortcutViewportLodCadenceRef (the grid token / cadence).
  - the viewport_lod publish reason, isViewportLodPublish, the no-change short-circuit.
  - lodPinnedMarkersRef / lodPinnedVisualKeyRef / buildLodPinnedVisualKey if only LOD-publish used.
  - the lod_target_change_contract / demoteVisible\* attribution (or move to the harness).
- map-render-model.ts: buildMarkerRenderModel top-N slice + buildStableSlotMap + isVisibleInBounds
  - retentionBounds + MARKER_RETENTION_BOUNDS_PAD_RATIO (the padded-AABB fallback) — IF nothing
    else consumes them. (Native is the sole decider now.) Keep collectSelectedEntries only if still
    used; otherwise delete. Update/relocate map-render-model.spec.
- Native: remove the temporary [mapdiag] native_lod NSLog (replaced by the harness event stream).
- Then: move maxFullPins (40, currently a Swift const shadowLodMaxFullPins) to a JS-pushed config
  (publishCandidateCatalog payload or a setLodConfig command), so the budget is one source of truth.
- VALIDATE after Phase 3: reveal no-hang, pan LOD intact, no dead-import lint, tsc clean.

---

## THE HARNESS — design ("most ideal shape", my call)

Principle: NATIVE is the source of truth (it computes projection, roles, opacity, transitions,
frame timing). Emit a structured, timestamped event stream from Swift; capture via
`simctl log stream` (proven to work). A runner drives a scripted map session AND records video.
A parser reconstructs per-marker timelines + aggregates + flags anti-patterns. For exact-moment
visual truth, extract video frames at flagged-event timestamps and compare.

### 1. Native event stream (Swift) — prefix `[lodev]`, one JSON object per line

Emit on every camera frame + every role/opacity transition. Schema:

- `{ev:"frame", t, reason, visible, promoted, dot, pitch, zoom, bearing, frameMs}` — per camera
  tick: counts of on-screen / promoted / dot, camera, and the frame work time.
- `{ev:"enter", t, key, rank}` / `{ev:"leave", t, key, rank}` — marker entered/left the
  pitch-adjusted on-screen projection (from ScreenSpaceVisibility enter/exit hysteresis).
- `{ev:"promote", t, key, rank}` / `{ev:"demote", t, key, rank}` — role flip.
- `{ev:"fade", t, key, kind:"pin"|"dot", from, to, durMs}` — a crossfade STARTED (per-pin).
- `{ev:"snap", t, key, kind, from, to}` — role/opacity changed with NO crossfade (anti-pattern).
- `{ev:"apply", t, reason, affected, reconcileMs, deferred:bool, allowNew:bool}` — did the
  reconcile apply now or defer (THE SNAP detector: deferred=true while moving=true).
- `{ev:"perf", t, frameMs, displayLinkDeltaMs, dropped}` — CADisplayLink smoothness.
- `{ev:"marker", t, key, rank, onScreen, pinOpacity, dotOpacity, role}` — optional full per-marker
  snapshot on demand (debounced / sampled) for ground-truth reconstruction.
  Implementation: a HarnessLog gate (compile-time or a runtime flag set by JS for harness runs) so
  it's free in prod. Reuse the existing emit/NSLog infra; the existing visualdiag/contract events
  can feed it.

### 2. Runner — scripts/lod-harness.sh (or .js)

- set sim location to Manhattan (data is NYC-only).
- launch app; start `xcrun simctl io <udid> recordVideo /tmp/lod-<ts>.mp4` AND
  `simctl log stream --predicate '... eventMessage CONTAINS "[lodev]"' > /tmp/lod-<ts>.jsonl`.
- emit a SYNC event at t0 (so log time ↔ video time can be aligned).
- drive a deterministic maestro flow: search → settle → slow pan (several) → zoom in → zoom out
  → fast fling → settle. (A fixed script so runs are comparable.)
- stop capture; run the analyzer; on flagged issues, extract the video frame at the event's t.

### 3. Analyzer — scripts/lod-harness-analyze.js

Parse JSONL → reconstruct per-marker state timeline + aggregates. FLAG anti-patterns:

- group_enter / group_promote / group_demote: ≥K events at the same (or ~same) t (should stagger).
- snap: any `snap` event (role changed w/o fade).
- deferred_in_motion: `apply` with deferred=true while a `frame` reason=camera_moving — the
  snap-after-gesture bug.
- no_replacement: a pin promoted-out (left viewport) with no compensating promote within Δt.
- stuck: a marker left then re-entered but never re-promoted while eligible.
- jank: frameMs/displayLinkDelta > ~16.7ms sustained, or dropped>0 — map not smooth.
- count_sanity: promoted ≤ min(visible, maxFullPins); dot = resident − promoted; etc.
  Output: a concise report (issue, count, sample timestamps) + a list of (t, issue) for frame grab.

### 4. Exact-moment visual validation (TRUST THE SIM)

For each flagged (t, issue): extract the video frame at t (ffmpeg/AVFoundation; reuse the
/tmp/extract-frames.swift tooling). Count pins/dots in the frame; compare to the event's claimed
counts/state. If they DISAGREE → the harness/event is lying → FIX THE HARNESS. Only once events ↔
frames agree do we trust the harness to judge LOD correctness.
NOTE on screenshots: stop taking ad-hoc late screenshots. Use the recorded video + event
timestamps to get the frame at the EXACT moment. (Sync via the t0 event + known video fps.)

---

## VALIDATION / DONE criteria

- Phase 3 done: dead code deleted, app builds, reveal+pan work.
- Harness emits the full event stream; runner produces a parsed report; analyzer flags real issues.
- Harness validated: pick ≥3 flagged events, extract the exact-moment frame, confirm the event
  matches the frame (counts/state). Where it didn't, the harness was fixed until it did.
- Run the finished LOD through it: the snap-after-gesture bug (deferred_in_motion) is EXPOSED by
  the harness, then FIXED (promote during motion, per-pin), and the harness shows it gone +
  no new group/snap/jank regressions, confirmed against exact-moment frames.

## WORKLOG (append as we go)

- 2026-06-19: plan written. Phases 1+2 of the granular redesign already done+committed
  (e8f4c1c0, 93571263). Starting Phase 3 (delete dead), then the harness.

## WORKLOG cont.

- 2026-06-19: Harness BUILT + WORKING. Native [lodev] event stream (frame/lod/step) in
  SearchMapRenderController.swift; scripts/lod-harness.sh (runner: NYC loc, launch, log-stream +
  recordVideo, deterministic maestro flow, analyze) + scripts/lod-harness-analyze.js (parses
  JSONL, flags group_enter/group_flip/render_snap/snap_after_gesture/count_sanity).
- DIAGNOSIS (harness-found, matches user's on-device report): the promotion DECISION is per-pin
  during motion (lod events: LOD +1/-1 allowNew=true). But the OPACITY CROSSFADES are deferred
  to settle: step events show midFade/frame moving≈0.5-0.8 vs idle≈34 (skew ~40-70x) =
  render_snap. Likely cause: reconcile creates transitions in isAwaitingSourceCommit state
  (legacy from the JS-republish model) whose source commit is deferred during motion → the fades
  burst at gesture-end (the "pins snap in after the gesture" the user sees).
- VALIDATED vs sim (qualitative): recorded video shows the real session (search + rank pins). NOTE:
  recordVideo MUST be stopped with SIGINT (not SIGTERM) or the mp4 is corrupt — fixed in runner.
  No ffmpeg on box; use /tmp/vframe.swift (AVFoundation) to extract frames.
- TODO: (a) add epoch (Date) to [lodev] events + record recordVideo-start epoch in runner so the
  analyzer can extract the EXACT-moment frame for strict event↔frame validation. (b) FIX the snap:
  make native-driven LOD transitions NOT await a source commit (opacity-only, markers resident) —
  then re-run harness to confirm render_snap gone (midFade rate even across moving/idle).
