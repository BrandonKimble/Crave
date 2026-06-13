# Map LOD Ideal Model v4 — "Decide once, fade once"

Last updated: 2026-06-11
Status: active (supersedes map-marker-lod-v3.md LOD sections and the LOD portions of
search-map-per-pin-group-cutover-plan.md; the single-layer pin insight obsoleted the
per-slot group model those plans assumed)

## Why v4 exists

The single-layer pin cutover (one SymbolLayer for all pins + shared shadow + label
candidate layers, viewport-y z-order, hundreds of resident markers) obsoleted the
per-slot promoted-group architecture mid-flight. The surviving implementation is a mix
of both eras, and the seams produced three user-visible defects: synchronized opacity
flashing on demote, vertical pin jitter, and batched after-gesture demotions. v4 is the
clean target model for the single-layer era.

## Product invariants (the definition of correct)

1. **Resident membership.** Every result candidate is resident in BOTH the pin and dot
   sources at all times. Source membership changes only on real data changes (new
   search, coverage arrival, result replacement) — never on camera motion.
2. **Role is opacity.** Pin-vs-dot is purely an opacity crossfade per marker
   (promoted → pin 1 / dot 0; demoted → pin 0 / dot 1). No source writes during LOD.
3. **Live, per-marker, immediate.** Promotion/demotion happens during gestures, the
   moment a marker's situation changes, marker-by-marker (stair-step). No group
   batching of decisions, no defer-to-settle, no synchronized expiry.
4. **A fade never reverses mid-flight.** Once a crossfade starts it runs to its
   endpoint ("impossible to snap back in"). Enforced natively (the commit invariant in
   updateLivePinTransitions). With a stable decision layer this guard should almost
   never engage — it is a safety net, not the mechanism.
5. **No jitter.** Nothing may move a rendered pin's screen position per-frame except
   the camera itself.

## The three-layer ownership model

### L1 — Data plane (JS, structural)

Owns: candidate catalog, ranks, coordinates, badges, region classification, source
membership. All of it **frozen per search/data-change**. Publishes resident
FeatureCollections. Runs on data changes only.

### L2 — Decision plane (JS, per-eval ~90ms during motion)

Owns: the promoted set. It is a **pure function of one dynamic input** — the projected
on-screen marker set — because rank, region, and budgets are frozen:

    promoted = topN(visible ∩ inRegion, maxFullPins) ∪ topN(visible ∩ outRegion, 30)

**Consequence (the core v4 insight):** if the visible set is well-behaved, the
promoted set cannot oscillate. During a monotone zoom-out the visible set only grows,
so demotions are pure rank displacement — stair-step, one pin in / one pin out.
Therefore ALL decision stability work belongs in the visibility signal, none of it in
extra selection hysteresis:

- **Per-marker spatial hysteresis in the native projection** (enter pad < exit pad): a
  marker becomes visible inside the tighter bound and stays visible until it crosses
  the looser bound. Absorbs sub-pixel projection noise at the screen edge without any
  time-batching.
- **No time-dwell group behavior.** The 700ms visibility dwell is deleted. It created
  the settle-batch (entries stamped during the gesture all expiring together) and a
  mid-gesture sawtooth. Markers that genuinely leave the screen demote immediately
  (invariant 3).
- Data arrival mid-gesture (coverage fetch) is a legitimate one-time reshuffle (L1
  event), not churn.

### L3 — Render plane (native, per-frame)

Owns: the only writer of rendered opacity (the CADisplayLink crossfade stepper writing
`nativeLodOpacity`/`nativeDotOpacity`/`nativeLabelOpacity` feature-state). Receives the
desired role per marker, fades current → target in 300ms, never reverses mid-fade
(invariant 4); a deferred opposite decision re-evaluates against the CURRENT desired
role at fade completion (no stale-flip replay). Baked feature properties carry only the
settled role for pre-stepper initial paint.

## Known seams to delete (the mixed bag)

- `MARKER_VISIBILITY_DWELL_MS` + `markerLastVisibleAtMsRef` (JS time-dwell) → replaced
  by native spatial hysteresis.
- Dual opacity animation: Mapbox `iconOpacityTransition` AND the native stepper both
  smooth the same value. The Mapbox transition is currently load-bearing for
  reveal-settle (`visual_released`); a later slice should make the stepper own reveal
  too, then delete the style transitions. Do not delete before re-staging reveal.
- `lodPinnedVisualKey` early-return must never let decision-layer baselines
  (`lodPinnedMarkersRef`) drift from the inputs the next eval will use.
- NM4 leftovers per search-native-marker-family-cutover-plan.md (split-owner label
  interaction assembly diagnostics, mismatch-tolerance remnants).

## Jitter hypotheses (validate after decision-churn fix)

1. **The blink IS the jitter**: pin (tall, bottom-anchored) ↔ dot (small, centered)
   crossfading rapidly reads as vertical pumping. Fixing decision churn should fix it.
2. If residual: `viewport-y` draw-order swaps between near-equal-Y overlapping pins.
3. If residual: badge image swaps (`rankBadgeImageId` ↔ `scoreBadgeImageId`) — should
   be impossible while the region is frozen; verify.

## Acceptance contracts

- `native_live_lod_transition_contract.flashReversalCount == 0` (no mid-fade reversal)
- `lod_target_change_contract`: during a monotone zoom-out, per-marker target flips
  ≤ 1 (a marker demotes at most once; no demote→re-promote), demotes are stair-step
  (no eval demoting a large batch), `demoteLostVisibility` ≈ 0 at settle (no dwell
  batch).
- `raw_visible_set_shrink_contract`: rawVisibleRemoved == 0 during monotone zoom-out.
- `lod_membership_churn_contract`: zero source add/remove during camera motion.
- On-device: no flash, no jitter, stair-step promote/demote during continuous pinch.

## Execution sequencing — the SINGLE-OWNER opacity cutover (the remaining work)

The biggest remaining "not clean" is **two writers of pin opacity**: the native
CADisplayLink stepper writes `setFeatureState(nativeLodOpacity)` on pins every frame
during transitions, AND a Mapbox `iconOpacityTransition` animates the same value in
parallel. The end state is **the native stepper is the SOLE writer of render opacity**.
The pin JITTER is almost certainly a symptom of this: an `ignorePlacement` pin is
normally placed once and GPU-reprojected smoothly, but per-frame feature-state writes +
an active style transition can force it back through the placement/pixel-snap pass each
frame (which is why plain past symbols never jittered). Fixing it = finishing this
cutover. Sequence (chosen by user 2026-06-13):

1. **Reveal/dismiss lane separation FIRST**
   (plans/search-map-reveal-dismiss-smooth-cutover-plan.md, Gates A–E). This must come
   first because the Mapbox `iconOpacityTransition` is currently load-bearing for the
   reveal fade (`nativePresentationOpacity`); deleting it before the stepper owns the
   reveal deadlocks the presentation phase machine (`visual_released` never fires).
   - Phase machine (JS): `executionStage` in
     results-presentation-runtime-machine-state.ts —
     `enter_pending_mount`/`enter_mounted_hidden` (covered mount) → `enter_executing`
     (visible reveal) → `settled` (live) → `exit_requested`/`exit_executing` (dismiss).
   - Observation lane is already partly gated to `isPresentationLive ||
isPreparingEnterPlacement` (use-search-map-native-render-owner.ts:~2630) — the job
     is tightening leaks (no `queryRenderedFeatures` / sticky reapply / structural apply
     during `enter_executing` or `exit_executing`) and staging structural publish under
     cover (`enter_mounted_hidden`) and dismiss cleanup AFTER settle.
   - Cluster 1 (do first, low-risk, unblocks the rest): an explicit "allowed work by
     phase" policy module (`{allowStructuralApply, allowObservation, allowSheetSnap}` per
     executionStage) + Gate-E lane diagnostics (per reveal/dismiss window: structural
     apply count/ms, observation count/ms, sheet-snap overlap, first-visible-frame ms).
   - Touches: use-search-map-native-render-owner.ts (3668 lines), SearchMapRenderController.swift,
     the Android module, results-presentation-\* runtime, search-results-sheet.tsx.

2. **THEN delete the dual animation** (task: stepper owns reveal):
   - Make the native stepper own `nativePresentationOpacity` (the reveal fade), not just
     `nativeLodOpacity`.
   - Delete `iconOpacityTransition` / `textOpacityTransition` from search-map.tsx
     (pin ~2378, shadow ~2325, dot ~2140). Stepper-interpolated feature-state is the only
     opacity animation.
   - Expected result: steady (non-transitioning) pins receive ZERO per-frame writes →
     pure GPU reprojection → **jitter resolves**. Re-verify on device.

3. **Remaining seams** (cleanup, after the above): lodPinnedVisualKey baseline-drift
   (instant set_map_camera collapse), stale-producer (publish still emits stepper-key
   values native now blocks), NM4 split-owner label-interaction diagnostics.

Validation: run the reveal/dismiss + zoom-flash flows, confirm flashReversal 0 / no
new crossfadeGap, reveal reaches hydration_ready, and on-device jitter gone.
