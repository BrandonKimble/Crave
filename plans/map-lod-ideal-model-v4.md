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
