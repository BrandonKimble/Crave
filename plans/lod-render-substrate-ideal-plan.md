# LOD Render-Substrate — Ideal End-State Plan (ViewAnnotation pins + labels)

Status: DESIGN (decided, pre-playground). Generated 2026-06-27 by a 21-agent design workflow
(4 ground → 4 architect → 12 adversarial stress → lead-architect synthesis), then the load-bearing
claims were independently re-verified against source by the orchestrator. This is the chosen DIRECTION
for the map-LOD render substrate; the scrapped time-based wall-clock fade (`lod-v5-ideal-architecture-plan.md`)
is retained only as the GATE-A-fails fallback (§7). Composes with `lod-label-viewannotations-plan.md`.

## Load-bearing claims independently verified against source (orchestrator, file:line)
1. **Dots MUST stay a colliding SymbolLayer (NOT a CircleLayer).** Dots collide on purpose to SUPPRESS the
   basemap street labels — `search-map.tsx:2335-2346` ("Basemap labels must never show mid-search"). A
   CircleLayer has no symbol-collision participation, so the dots→CircleLayer swap every architect bundled in
   would regress a thing the team already fought and reverted. ✓ VERIFIED.
2. **GPU paint-transition is REJECTED — already tried and deleted here.** `iconOpacityTransition`'s 300ms
   smoothing "forced these ignorePlacement pins back through the placement/pixel-snap pass each frame, which
   is the pin jitter" — `search-map.tsx:2581-2588`. Candidate B re-introduces a proven-bad mechanism. ✓ VERIFIED.
3. **Snapping-killer holds.** The Mapbox SDK's `ViewAnnotation.place()` sets only `view.frame` + `view.isHidden`,
   NEVER `view.alpha` (`ViewAnnotation.swift:219/246/324`) → a Core-Animation `view.alpha` tween is unobstructed
   and composites at display refresh off the 12–18fps GL clock. ✓ VERIFIED.
4. **GATE-A risk is real.** Any view annotation flips the whole map to `presentsWithTransaction=true` (sync
   present) — `PresentationTransactionMode.swift:13/60/49` (`.automatic` resolves to `.sync` when annotations
   exist). This sync-present tax is what the playground must measure on-device. ✓ VERIFIED.

---

# Crave Map-LOD: Ideal Render-Substrate Plan

**Lead-architect decision, spot-checked against Mapbox iOS 11.16.6 source.** I committed to ONE primary substrate, corrected three load-bearing claims the stress agents disputed (and I re-verified in source), and sequenced it to land with the label-VA plan.

---

## TL;DR — the decision

**Primary recommendation: ViewAnnotation pins + ViewAnnotation labels (Core-Animation `view.alpha` crossfades) — i.e. SubstrateA / Frame-Locked-Hybrid for the HERO plane. But REJECT the dots→CircleLayer swap that every candidate bundled in. Dots STAY a colliding SymbolLayer.**

The pins+labels→VA cutover is the structurally complete answer for **snapping** and **wiggle** (both survived source verification cleanly). It also bounds **over-30** and substantially relieves **choppy** — but those two are *measured-improvements*, not structural guarantees, and I say so honestly below.

The other three candidates lose for concrete, source-verified reasons:
- **GPU Paint-Transition (31-slot sharding)** — REJECTED. Its core mechanism (`iconOpacityTransition` to GPU-tween the fade) is the *exact* thing this codebase already built and deleted: `search-map.tsx:2581-2588` states the transition "forced these ignorePlacement pins back through the placement/pixel-snap pass each frame, which is the pin jitter." It also resurrects per-slot layers the team purged (`search-map.tsx:267` "NOT symbolSortKey (that caused camera wobble)"). It re-introduces two proven-bad mechanisms to half-fix one issue.
- **Custom Metal Layer** — REJECTED as primary. SDK-confirmed (`MapView.swift` `updateFromDisplayLink` gates `metalView.draw()` on `needsDisplayRefresh`): `CustomLayerHost.render` runs *inside* the GL draw, so per-instance alpha updates at GL fps — it does NOT decouple the fade. Highest cost, highest blast radius, *least* benefit on the primary target. Reserve-only.
- **Dots→CircleLayer (bundled into A and the Hybrid)** — REJECTED. Verified at `search-map.tsx:2335-2346`: dots collide *on purpose* to "SUPPRESS the native basemap street labels … Basemap labels must never show mid-search," and "The earlier ignorePlacement:true attempt was wrong (it let basemap labels show during search)." A CircleLayer has no symbol-collision participation and cannot suppress basemap labels. This is a load-bearing regression the team already fought and reverted once.

---

## 1. Substrate per marker class + WHY

| Class | Count | Substrate | Why |
|---|---|---|---|
| **Pins** | ≤30 + forced | **ViewAnnotation** (UIView: baked badge `UIImageView` + `CALayer` shadow), `view.alpha` crossfade | UIView, not a source feature → no re-tile (kills wiggle). `view.alpha` rides Core Animation off the GL clock → kills snapping. Bounded dict → caps count. Leaves the symbol pipeline → relieves choppy. |
| **Labels** | ≤30 | **ViewAnnotation** (per the existing `lod-label-viewannotations-plan.md`), `variableAnchors` + `allowOverlap:false` + manual `view.alpha` | Same substrate as pins. Real pin VAs let labels yield to pins *in the same VA collision space* — **deletes the ~30 invisible pin-proxy VAs** the label-only plan needed (~90→~60 views). |
| **Dots** | ~500 | **KEEP today's colliding SymbolLayer** (`iconAllowOverlap:false`) — **unchanged** | Collision is load-bearing: it suppresses basemap street labels and yields to pin bodies (`search-map.tsx:2335-2346`). CircleLayer cannot do this. Dots are NOT animated per-marker (only the ≤30 pin-occupied dots fade, via the existing `1−p` feature-state write, kept). |

**Reconciliation with the label-VA plan:** this plan is its strict superset. Ship the label-VA plan *as written* (it's already red-teamed), then add pins as VAs in the **same `ViewAnnotationManager`**. The composition is favorable, not additive: pins-as-VA *removes* the label plan's proxy machinery. The label plan's GATE 1 (per-anchor distribution) remains the gate for the *label* leg; pins are independent of it (pins are `allowOverlap:true`, they never collision-distribute).

### 1a. Basemap-label suppression under pins — PRESERVED, but now a stated requirement (gap the workflow missed)

The visible pin sprite NEVER suppressed basemap labels — `PIN_SINGLE_SYMBOL_LAYER_ID` is `iconIgnorePlacement:true` (`search-map.tsx:2579`), i.e. always drawn but NOT a collision obstacle. Basemap-label suppression in a pin's footprint is done entirely by the INVISIBLE collision obstacle layers — both built from `STYLE_PIN_OUTLINE_IMAGE_ID` at the FULL pin silhouette (scale 1.0), `iconIgnorePlacement:false`, `iconOpacity:0.001`, above the basemap: `LABEL_PIN_COLLISION_STYLE` (`search-map.tsx:1220`, deleted when labels→VA) and `DOT_PIN_COLLISION_STYLE` (the dot-body obstacle, `search-map.tsx:1257`, KEPT). Both read the kept `labelCollisionSource` that `applyV5ObstacleReseed` reseeds to the promoted set.

**Therefore VA pins do NOT lose basemap suppression** — the visible pin was never the suppressor; the GL obstacle is, and the full-pin-body dot-body obstacle stays. Deleting `LABEL_PIN_COLLISION_STYLE` is safe because it is REDUNDANT with the dot-body obstacle for footprint coverage.

**REQUIREMENT (do not let this rot):** the dot-body obstacle (`DOT_PIN_COLLISION_STYLE` / `RESTAURANT_PIN_DOT_COLLISION_LAYER_ID`) is now DUAL-purpose — (a) coverage dots yield to pin bodies, AND (b) basemap street labels are suppressed under the full pin body. It must keep tracking the promoted-pin set via the reseed and must NOT be optimized away on "dots rarely overlap a pin" logic — that would silently leak basemap labels under pins. Add a playground gate: with VA pins + the kept dot-body obstacle (and the label-pin obstacle deleted), confirm basemap street labels stay suppressed under the WHOLE pin body, not just the small dot. **NOTE: §1b likely SUPERSEDES this** — if basemap labels are hidden globally, the obstacle reverts to its sole "dots yield to pins" duty.

### 1b. Basemap labels: HIDE GLOBALLY, don't fight them per-marker (resolves the label-VA basemap gap)

Our LABELS also currently suppress basemap labels (`textAllowOverlap:false` + `textIgnorePlacement:false` + the invisible mutex icon, `search-map.tsx:2462-2463`, above the basemap). Moving labels → VA loses this (a transparent UIView has no GL collision footprint), and basemap street labels would peek through around our restaurant-name text in the area BEYOND the pin body (uncovered by the dot-body obstacle). This is a gap in the label-VA plan itself.

The whole "markers collide-win over basemap labels in their own footprint" design is fragile (only suppresses where a marker is; leaks in sparse areas) and is the exact coupling that makes VA labels lossy. The code admits it is unsolved (`search-map.tsx:2339` "The real lever is collision PRIORITY/order vs the basemap (under investigation)").

**RESOLUTION (the daring-but-cleaner move): hide basemap label categories GLOBALLY during search via the Mapbox Standard import config** — `setStyleImportConfigProperty(showRoadLabels/showPlaceLabels/showPointOfInterestLabels/showTransitLabels = false)`. The style is `mapbox://styles/brandonkimble/cmhjzgs6i00cl01s69ff1fsmf` and the code's slot/import/default-top-anchor language confirms a Standard import; there is ZERO `setStyleImportConfigProperty` usage today (never tried). This: (1) GUARANTEES "no basemap labels mid-search" instead of depending on dot density; (2) removes the basemap-suppression burden from dots, pins-obstacle, AND labels → VA labels/pins lose nothing; (3) is granular (keep place/neighborhood names for orientation, kill roads+POIs). **Verify with a one-line `setStyleImportConfigProperty` test on-device** (confirms Standard import). Fallback if not Standard: toggle the named basemap symbol layers' `visibility`, or give VA labels an opaque scrim (weaker). This is an independent, low-risk win that can land BEFORE the VA work and de-risks both legs.

---

## 2. Full mental model

Two render planes, split by cardinality and animation need:

- **BULK plane (GL):** basemap + ~500-dot colliding SymbolLayer + the 2 obstacle layers (dotbody + label-pin collision). This is the *only* O(markers) collision load left. Dots never animate per-marker; membership changes only on data events, never on camera.
- **HERO plane (UIKit/CoreAnimation):** ≤30 pins + ≤30 labels as `ViewAnnotation` UIViews, in `viewAnnotationContainerView` which is `insertSubview(aboveSubview: metalView)` — structurally above all GL content. Per-marker opacity is `view.alpha`, a first-class CA-animatable property composited at display refresh, independent of the 12-18fps GL clock.

**The brain is untouched.** `LodEngine.decide(onScreenKeys:forcedKeys:)` recomputes the top-30 want-set each camera frame; `step(dtSeconds:)` returns plain `[(markerKey, pinOpacity)]` tuples (zero Mapbox dependency, `LodEngine.swift:142-156`). The CADisplayLink, budget(30), ranking, hysteresis, forcedKeys — all byte-intact. **The ONLY change is the write target** inside `applyV5OpacityWrites`: the pin/label branches go from `setFeatureState(nativeLodOpacity)` to `pinVA.view.alpha = pinOpacity × presentationOpacity`; the dot branch stays feature-state.

**Residency model (resolves the contradiction the stress agents flagged):** one VA per **promoted-or-fading** marker (≤30 + the handful mid-demote), NOT one-per-on-screen (~500). Add on promote, remove only after the demote alpha-ramp settles to 0. This is the *only* model that holds the ~60-view perf budget; the "one-per-on-screen ⇒ ~500 VAs" reading is rejected because the SDK explicitly warns VAs are "suboptimal for large amounts of data" (`ViewAnnotation.swift:10`). Churn on promote/demote is accepted — it's a synchronous UIView insert, not a throttled GeoJSON re-tile, so it carries no wiggle.

---

## 3. How each issue is eliminated (structural vs honest residual)

**SNAPPING — STRUCTURALLY KILLED (verified).** Root: the style expression language has no wall-clock operator (confirmed — `AllExpressions.swift` has only `interpolate`/`zoom`/`distance`/`feature-state`, no `now`), so feature-state opacity can only be CPU-stepped at the 12-18fps GL rate. Moving the pin/label fade to `view.alpha` puts it on Core Animation; the SDK never writes `view.alpha` (verified: `ViewAnnotation.place()` at `:313-335` touches only `view.frame`/`view.isHidden`), so a CA alpha tween is unobstructed and composites at 60/120fps regardless of GL fps. The frames-per-fade ceiling no longer applies to the hero plane.

**OVER-30 — STRUCTURALLY BOUNDED, honest residual.** Membership IS the controller-owned `[markerKey: ViewAnnotation]` dict, added in lockstep with `engine.lastPromotedInOrder` — no deferred GeoJSON render source to lag. **Honest residual:** a demoting pin is a non-zero-alpha UIView for ~180ms, so during rapid pinch churn the count of `alpha>0` views can transiently exceed 30. This is *gentler* than today (a dim fading-out view, not a snapped-on full pin) but "literally impossible to ever see 31" is overclaimed. **Mitigation:** none needed — a fading-out dim pin reads as correct motion, not a glitch.

**WIGGLE — STRUCTURALLY KILLED (verified).** Wiggle = mid-gesture `removeGeoJSONSourceFeatures` (`SearchMapRenderController.swift:10917`) bumps sourceRevision → whole-bundle placement re-snap. A VA promote/demote is `view.alpha` / `add`/`remove()` — mutates zero GeoJSON source; reposition is direct `view.frame` assignment. The entire `retainResidentDemotes`/deferred-remove machinery (`:5140-5211`) is deletable for pins. Dots stay GeoJSON but their membership changes only on data events, never camera — so they never mutate mid-gesture either.

**CHOPPY — SUBSTANTIALLY RELIEVED, honest residual + a NEW cost.** Removing the pin symbol+shadow layers + 4 label-candidate layers from the GL collision pass is a real saving. **Honest residual #1:** the dominant cost is partly *inferred* (the team's own `cwork` profile fingers the simulator's software renderer; on-device may already be milder). **Honest residual #2 (NEW cost):** any VA flips the map to `presentsWithTransaction=true` (verified: `PresentationTransactionMode.update()` resolves `_displaysAnnotations` in `.automatic`), which serializes the Metal present with the CA commit on the main thread — a throughput cost the choppy-win must outweigh. **Net:** expected positive but **perf-gated, not structural.** This is why GATE-A below is the make-or-break.

---

## 4. Crossfade mechanics + LodEngine plug-in

**Driver (the daring default): edge-triggered `UIView.animate`.** On each promote/demote want-edge from the engine:
```
UIView.animate(withDuration: 0.18, delay: 0,
  options: [.beginFromCurrentState, .curveEaseOut]) {
    pinVA.view.alpha = target          // 1 on promote, 0 on demote
    labelVA.view.alpha = target
}
```
CA interpolates on the render server at display refresh; `.beginFromCurrentState` makes a reversed mid-fade (budget thrash) pick up from current alpha — no snap. Fallback driver: per-tick `view.alpha = engine.pinOpacity(key) × presentationOpacity` off the existing CADisplayLink (also 60-120fps, decoupled from GL).

**Presentation (dismiss/reveal) ramp — the real wiring gotcha:** today on-screen opacity is `['*', presentation, lod]` — a GPU two-factor multiply driven by TWO independent steppers (LOD + `PresentationOpacityAnimator`). For VAs you must reproduce the multiply in Swift: `view.alpha = pinOpacity × currentPresentationOpacity`, written from BOTH the V5 tick AND `stepPresentationOpacityAnimation`. This is the label-VA plan's red-team #4 finding and it applies to pins verbatim. Keep VAs `visible:true` always and drive alpha manually — never rely on `isHidden` (verified: `isHidden` is an instant pop, `ViewAnnotation.swift:216-219`).

**Dot complementarity:** the ≤30 pin-occupied dots keep their `1−p` feature-state write from the same engine tick (cheap, ≤30 markers). The dot's GL staircase under a smoothly-fading CA pin is far less visible than a staircasing pin — **playground-gate this seam** but expect it acceptable.

**LodEngine plug-in:** `decide`/`step`/`advance`/budget/ranking/CADisplayLink unchanged. The single re-pointed site is the pin/label branch of `applyV5OpacityWrites` (`:7690`).

---

## 5. Perf model + THE single biggest risk + the playground that settles it

**Perf model.** GL side: basemap + ~500 colliding dots + 2 obstacles (the pin/label collision layers gone) — lighter than today. UIKit side: ~60 VAs get `view.frame` set + `bringSubviewToFront` per position callback + alpha composite. The fade itself is the cheapest CA work and is fps-independent. **Cost added:** `presentsWithTransaction=true` (sync present) once VAs exist.

**THE single biggest risk (GO/NO-GO): VA reposition behavior during fast pinch-zoom at ~60 views, under forced `presentsWithTransaction=true`.** The stress agents split on whether VAs can lag the basemap. Source truth: positions come from the GL render pass via `setViewAnnotationPositionsUpdateCallback` → `placeAnnotations` (verified, `ViewAnnotationManager.swift:391-433`), and `presentsWithTransaction` syncs the present with the frame-setting transaction — so they shouldn't *drift*, but the whole scene can *step together* at low GL fps, AND the sync-present + per-frame `bringSubviewToFront` over ~60 views is real main-thread cost. This cannot be settled by reading; it must be measured.

**The playground experiment (build FIRST, before any migration):**
1. Temporary controller debug entry: drop ~30 pin VAs + ~30 label VAs at real coords over a dense viewport, **force `presentationTransactionMode = .sync`** (so you measure the real VA-on cost).
2. Run `maestro/perf/flows/search-map-jitter-swipe.yaml` + a hard pinch.
3. Read the `[lodev]`/`cwork`/`frame` harness for: **(a)** VA frame-lag vs basemap mid-pinch, **(b)** fps at 60 VAs vs today's baseline, **(c)** the dot→pin seam, **(d)** per-frame `bringSubviewToFront` main-thread time, **(e)** basemap-label suppression: with the visible pin a VA and the dot-body GL obstacle the only pin-footprint collider, confirm basemap street labels stay culled under the WHOLE pin body (§1a).
4. **Measure on a real device, not just the sim** (the sim under-reports Mapbox render — per the team's own harness notes).

GO if 60 VAs hold an acceptable fps with imperceptible mid-pinch lag on-device; NO-GO otherwise.

---

## 6. Migration path (composed with the label-VA migration)

All phases flag-gated and individually revertible. The LodEngine/decide/step/CADisplayLink/budget stay byte-intact throughout, so the brain is never at risk.

- **Phase 0 — Playground (GATE-A above).** ~1-2 days. Settles GO/NO-GO before any production change.
- **Phase 1 — Labels → VA** = the existing `lod-label-viewannotations-plan.md`, shipped as written (already red-teamed; settles GATE 1 per-anchor distribution and the dual-clock alpha on the lower-risk surface). Flag: `labelsAsViewAnnotations`.
- **Phase 2 — Pins → VA**, composing into the **same** `ViewAnnotationManager`. Build `PinAnnotationView` (baked PNG `UIImageView` + `CALayer` shadow; highlight = `imageView.image` swap off `highlightedMarkerKey`), the residency dict, re-point `applyV5OpacityWrites` pin branch, per-pin `UITapGestureRecognizer` → existing `handlePressTarget`. **DELETE** on success: pin symbol+shadow layers, pin bundle source, `retainResidentDemotes`/gapBundle machinery, the `queryRenderedFeatures` pin branch (`:3294`), the pin-interaction CircleLayer, AND the label plan's ~30 pin-proxy VAs (now redundant). Flag: `pinsAsViewAnnotations`.
- **Phase 3 — Delete-old + harness.** Remove dead layers/sources; add a `[lodev]` VA channel (renderP/renderL go dark for UIViews — replace with a VA-alpha sampler).

**Dots are NOT migrated.** They stay as-is in every phase.

**Two net-new pin problems Phase 2 must solve (mechanical, not fatal):**
- **Viewport-y z-order + tap front-order** — `bringSubviewToFront` is clobbered by the SDK's own per-position call on the same tick, and `priority` is overloaded (it governs draw AND placement — verified, `ViewAnnotationOptions.swift:85`). Reproduce viewport-y by setting `priority` from a screen-y proxy *with pins in a band above labels* (so labels yield to pins) and accept the ≥1-frame async round-trip. This is the riskiest mechanical piece — validate tap-front == visual-front in the playground.
- **Highlight image delivery** — the baked active/normal sprites live in the JS style registry, not the Swift controller. Needs a native `UIImage` delivery path (RN→native) — unaccounted in "pixel-identical, mechanical." Budget for it.

---

## 7. Honest fallbacks if GATE-A fails

- **GATE-A (VA position/perf) fails on-device** → ship **Phase 1 (labels-as-VA) only**, keep pins as resident GL symbols. The existing residency model (`retainResidentDemotes` gating removes to settle, `:5140`) already kills *most* wiggle; tighten it to airtight residency (never remove during LOD) as a cheap independent win. Pins-only escape hatch = Custom Metal Layer, but only if a real-device profile proves the *placement pass* (not the basemap raster) is the fps floor.
- **GATE 1 (per-anchor label distribution) fails** → ship Phases 1-2 for pins, keep today's 4-candidate symbol-collision labels. There is no clean middle fallback for labels (the symbol opacity-slot idea is structurally broken — collision picks the side before opacity applies).
- **Both fail** → the substrate cutover is wrong for this scene; fall back to the in-flight **time-based fade + self-heal** in `lod-v5-ideal-architecture-plan.md` (wall-clock interpolation reaches target on-schedule regardless of fps). It does NOT kill snapping at 15fps the way CA alpha does, but it's a no-substrate-change improvement and a safe floor.

---

## Open questions for Brandon / the playground

1. **GATE-A go/no-go (on-device):** at ~60 VAs with `presentsWithTransaction=true`, does a fast pinch hold acceptable fps with imperceptible pin lag? This decides whether pins-as-VA ships at all. *Sim numbers don't count.*
2. **The `presentsWithTransaction` tax:** does flipping the whole map to sync-present (auto-triggered by any VA) cost more fps than removing pins+labels from collision saves? Measure the *net*, both directions.
3. **Viewport-y via `priority`:** is the ≥1-frame async `priority` round-trip visually acceptable for pin occlusion, and is tap-front-order correct under it? (No way to know without 30 overlapping pins in the playground.)
4. **Dot→pin seam:** with the dot staying a GL feature-state staircase (12-18fps) under a CA pin (60fps), is the ~180ms crossfade seam clean, or does it flash over-bright/faint?
5. **Is choppy even GL-collision-bound on-device, or is it the simulator?** If on-device fps is already fine, the whole cutover's choppy justification weakens and this becomes a snapping+wiggle play only — which changes the cost/benefit of Phase 2.
