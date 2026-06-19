# Map LOD — ground-up redesign to one granular per-pin rule (2026-06-19)

Decision: stop layering hysteresis / stable-membership / quantized-cadence / whole-frame
republish on top of a model that drifted from the simple thing that worked. Restore the
granular per-pin behavior the OLD code had (Feb–Mar 2026) and that EVERY later plan
specified, in the efficient native-owned shape.

Investigation: 3 sub-agents (archaeology + plans + current-cruft), 2026-06-19. Corroborated.

---

## THE ONE RULE

A marker is a **PIN** iff it is in the **top-`maxFullPins` by rank among the markers
currently ON SCREEN** (native screen-space projection). Everything else is a **DOT**.

- The on-screen set is the native projection with per-marker spatial enter/exit hysteresis
  (enter pad 64px < exit pad 128px) — already implemented, correct under pitch/twist.
- As the camera moves, the on-screen set changes ONE marker at a time (a marker crosses the
  spatial edge). So promotions/demotions are per-pin, stair-step — "one in, one out" —
  for free. No swap logic, no time dwell, no group batch.
- Each pin crossfades pin↔dot on its OWN clock via the existing per-pin opacity stepper.

That is the whole model. Hysteresis-on-the-rank-cutoff, flash-suppression, dot↔pin polish:
LATER. They hide the behavior we're trying to get right; build the granular core first.

## WHY (what the investigation proved)

- OLD granular era (commits f94b7b6e Feb 8 → 2ca844dd~1 Mar 3): swap-based top-N (carry set
  forward, swap only at the margin `min(promote,demote)`) + per-pin eased fade clocks. This is
  the "one pin enters, one leaves, super granular" behavior. Lost at 2ca844dd (per-pin fade →
  setFeatureState flip), then dc202882 (90ms clock), then 9fa642d7 (whole-frame republish).
- ALL later plans specified exactly the target model and said the decision should be NATIVE,
  per-pin, event-driven, never a whole-frame republish:
  - map-lod-ideal-model-v4.md: "marker-by-marker (stair-step). No group batching … role is a
    per-marker opacity crossfade … no source writes during LOD."
  - map-lod-target-plan.md: "JS owns policy (push catalog once per results change); native
    applies ranking to the live viewport each camera tick (execution, not decision) …
    selection runs NATIVE per camera tick, no JS round-trip / stale box."
  - search-map-per-pin-group-cutover-plan.md: "a role change should affect that marker's
    slot, not force a global promoted-family refresh … no source replace for live role-only
    frames."
  - map-motion-pressure-cutover-plan.md: re-LOD on MATERIAL change (top-pin frontier / viewport
    bucket / data), not a timer. (Half-built: gates on a coarse grid token, not the frontier.)
- Native ALREADY computes the per-pin on-screen set every frame (projectAndEmitOnScreenMarkers
  - ScreenSpaceVisibility, spatial hysteresis) AND already owns a per-pin opacity stepper
    (livePinTransitionsByMarkerKey / updateLivePinTransitions / CADisplayLink). The ONLY gap:
    the decision (top-N-among-visible) lives in JS, so each edge-cross triggers a whole-frame
    republish (~3500 feature objects) back over the bridge. Move the decision native → the gap
    closes and the perf + group-fade problems both vanish.

## TARGET ARCHITECTURE

**JS = policy, pushed ONCE per data change. Native = per-frame execution.**

1. Resident catalog (JS → native, on data change only — new search / page / coverage /
   result replacement; NEVER on camera move). Per marker: markerKey, lng, lat, rank, and the
   presentation bits JS currently bakes per-publish: badgeImageId (or rank+craveScore+inRegion
   so native can pick the sprite), isSelected/forcePromote. Extends the existing
   publishCandidateCatalog (already pushes key/lng/lat/rank).
2. Native LOD core (per camera frame, in projectAndEmitOnScreenMarkers):
   a. project visible set (KEEP — spatial enter/exit hysteresis).
   b. partial-sort the (small) visible subset by rank; top-`maxFullPins` = promoted, rest = dot.
   c. diff promoted vs last frame → per-marker enter/leave delta.
   d. feed the delta to updateLivePinTransitions (already consumes per-marker nextPinIds) →
   the existing CADisplayLink stepper crossfades each flipped marker pin↔dot over 300ms.
   No JS round-trip. No source mutation (role = feature-state opacity, resident sources).
3. Force-promote the tapped restaurant = a single native pin/unpin command (not a whole-set
   sort). Selected marker always promoted regardless of rank/visibility.
4. JS retains ONLY: the resident-catalog publish (data events), the selected force-promote
   command, the reveal/dismiss lifecycle (the labels-before-pins gate stays), teardown.

## KEEP (already correct, the substrate)

- Residency: pin + dot sources hold every candidate, mutated only on data change. Role =
  opacity feature-state. (search-map.tsx single pin layer + single shadow layer — just landed.)
- Native projection + spatial enter/exit hysteresis (SearchMapRenderController.swift
  computeOnScreenMarkerKeys; MapLodKit/ScreenSpaceVisibility.swift). The anti-flicker truth.
- Per-pin opacity stepper (livePinTransitionsByMarkerKey / updateLivePinTransitions / the
  CADisplayLink loop; durationMs 300). Already per-marker; just needs its trigger sourced from
  the native projection instead of the JS frame.
- Badge sprites (rankBadgeImageId / scoreBadgeImageId), baked per marker.
- Reveal/dismiss lifecycle + presentation-opacity animator (separate from LOD; do NOT touch).

## DELETE / RIP OUT (scar tissue)

- map-render-model.ts buildMarkerRenderModel top-N re-slice (:313-314) + buildStableSlotMap
  (:167-219, vestigial — z-order is native viewport-y) + the padded-AABB fallback
  (isVisibleInBounds / MARKER_RETENTION_BOUNDS_PAD_RATIO; native always has the set).
- The per-camera-tick whole-frame republish: publishSources rebuilding ALL pin/dot/label/
  collision feature stores on each viewport_lod tick (use-direct-...:1805-1895, etc.).
- buildShortcutViewportProjectionToken 10×10 grid token (the spatially-quantized cadence).
- resolveMapPlannerAdmission / motion-pressure admission for workClass 'lod_pins' (the clock).
  (Keep any genuine data-readiness/transaction deferral if still needed — small replacement.)
- The viewport_lod no-change short-circuit (:1677-1683) — replaced by native owning the delta.
- The native-visible-set subscriber → republish (5ed5f3a0) — replaced by native-internal flow.
- Dwell/hysteresis remnants: previousRawVisibleKeysRef (diagnostic dead ref),
  shortcutViewportLodCadenceRef, the just-reverted rank hysteresis (stays out).
- Native isAwaitingSourceCommit / crossfade-commit-reversal guard's main justification (it
  exists because the JS republish reverses roles mid-fade; native per-pin enter/leave won't).

## PHASED, FLAG-GATED MIGRATION (no big-bang)

Phase 0 — Enrich the catalog. Push badge/inRegion/selected into the resident catalog
(publishCandidateCatalog) so native has everything it needs. JS path unchanged. Ship.
Phase 1 — Native LOD core behind a flag. Implement native top-N-among-visible + per-pin
opacity flip off the projection, running in SHADOW (compute + log a parity contract vs the
JS-decided set; do NOT drive opacity yet). Validate the native decision matches JS on
pan/zoom (parity ≈ 100% modulo intended granularity).
Phase 2 — Cut over. Flip the flag: native drives LOD opacity off its own projection; JS stops
the per-camera-tick republish (publishSources runs ONLY on data change). Validate in-sim:
per-pin promote/demote on pan (one in/one out), no whole-frame republish during motion (perf
trace), reveal still works (lifecycle untouched), ranks correct, no stuck pins.
Phase 3 — Delete. Remove the dead JS decision/publish/cadence machinery listed above. Update
the property tests (map-render-model.spec) to the native model or move them to a native
parity test. Re-validate.

## VALIDATION (per phase)

- Per-pin granularity: record a slow pan; assert promotions/demotions are stair-step
  (≤ small N flips per frame), each pin's fade independently timed — NOT band/group fades.
- No whole-frame republish during motion: perf trace shows zero source-frame rebuilds on
  camera ticks (only on data events).
- No stuck pins: a marker that re-enters the viewport always re-promotes (native projection is
  the live truth every frame; no stale JS box, no missed settle-flush).
- Reveal/dismiss unaffected: the labels-before-pins gate + presentation animator are a separate
  lane; fresh search still reveals (no hang), dismiss still resident.

## EXPLICITLY DEFERRED (do AFTER the granular core works)

- Rank-cutoff hysteresis / stickiness (the "fixed margin blocks the best pin" tradeoff) — only
  if the raw per-frame top-N feels too churny at the budget edge; design a smarter rule then.
- Dot↔pin crossfade polish / flash suppression / per-marker fade start-clock niceties.
- The two-group geographic split is already presentation-only (badge); leave it.
