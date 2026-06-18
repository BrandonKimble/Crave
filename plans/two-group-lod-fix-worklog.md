# Two-Group Pin LOD — diagnosis + fix worklog (2026-06-18)

From on-device testing: several behaviors don't match the intended model. Investigation
(3 agents) found one central defect + two specific issues. Two of this session's earlier
changes worsened things. Do NOT stop until #1-#3 + #5 are fixed; #4 (jitter) is deferred per
the user (it is a steady-pin geometric anchor shift, NOT crossfade churn — separate problem).

Status: [ ] todo · [~] in progress · [x] done+committed
Validate native with IOS_RUN=1. API on :3000. Sim UDID 7B0DD874-3496-46F7-9480-3EDDABCE2F31.

---

## CENTRAL DEFECT — the native visible set is stale and never re-triggers a decision

`nativeVisibleMarkerKeys` / `lastVisibleMarkerSetSignature` is the load-bearing input to the LOD
decision (buildMarkerRenderModel requireVisibility). Flaws:

1. Computed ONLY on camera-move/idle (handleNativeCameraChanged) — never on catalog arrival.
   SearchMapRenderController.swift sets lastVisibleMarkerSetSignature=nil on catalog push and
   defers to "next camera tick" (~1301-1303).
2. When the visible set updates, it does NOT re-run the JS decision: publishNativeVisibleMarkerKeys
   is a silent setter (search-map-source-frame-port.ts ~261), and the render-owner handler
   (use-search-map-native-render-owner.ts ~2247) does not call publishSourcesRef.
3. The decision reads getNativeVisibleMarkerKeys only when publishSources runs for some OTHER reason
   (use-direct-search-map-source-controller.ts ~1592).
   Natural-search residency (#3 of red-team, commit 6c02810f) made the decision lean 100% on this
   gate (full catalog), so it WORSENED symptoms 1+2.

### 1. [ ] FIX visible-set: live + authoritative (fixes ranks-40s + collapse)

- [ ] Compute an immediate projection on catalog arrival (don't defer to next camera tick) so a
      fresh search has a real on-screen set before the first decision.
- [ ] Make a visible-set update TRIGGER a re-decision (publishNativeVisibleMarkerKeys -> notify ->
      re-publish), so the corrected set actually re-runs buildMarkerRenderModel.
- [ ] On the bootstrap/seed frame, do not promote against the padded lat/lng AABB fallback when the
      native set is null — wait for the real projection (or project synchronously).
- [ ] Validate: fresh "best restaurants" shows ranks ~1-30 visible-in-region (not 40s/50s); no full
      collapse on catalog swap. Use the contract gate + a new promote-vs-viewport cross-ref.
      Evidence: map-render-model.ts:258-314; use-direct-search-map-source-controller.ts:1592,1648-1738;
      SearchMapRenderController.swift:1301-1303,10176-10195,10635-10663; search-map-source-frame-port.ts:261.

## 3. [x] FIX label-gate reveal deadlock (REGRESSION from dormancy rewrite cec34d26)

Reveal-start (startEnterPresentationIfReady ~5442) hard-gates on isActiveFrameLabelPlacementReady
(~6302-6316: needs committed observation with effectiveRenderedFeatureCount>0). The dormancy
rewrite made label layers visibility:none until reveal preroll; queryRenderedFeatures on un-laid-out
layers returns 0 -> gate never opens -> the WHOLE reveal (pins+dots+labels share one opacity
animation) stays at ~0 opacity until a camera move re-triggers observation. = "labels/dots don't
show until I zoom." Also configureLabelObservation can drop the enable if it arrives while native
is still .hidden (~8885). Passed Maestro because the flow checks JS redraw phase, not pixels.
USER INTENT (confirmed): KEEP the gate — labels-locked-before-pins is wanted, on reveal, for both
sheet + map. Do NOT bypass it / do NOT force-start reveal with unplaced pins. Gate is reveal-ONLY
(startEnterPresentationIfReady; flag reset at beginRevealVisualLifecycle) — must NOT affect
post-submit LOD promote/demote (separate live-transition path). Fix = make labels actually PLACE so
the gate opens as designed.

- [ ] REAL FIX: make label observation reliably commit on reveal — fix the .hidden-race where the
      observation-ENABLE config is dropped (configureLabelObservation !canRefreshRenderedLabels ~8885
      cancels + schedules nothing) by re-applying/re-scheduling the last config when native flips to
      .preparingReveal (layers now woken); the 16ms retry then covers layer-layout delay.
- [ ] SAFETY NET (not a bypass): keep re-attempting PLACEMENT if it hasn't committed; if it still
      can't after N tries, log loudly — never silently reveal unplaced pins.
- [ ] Verify the gate does NOT gate post-submit LOD changes (reveal-only invariant holds).
- [ ] Validate with a PIXEL assertion (screenshot) that pins+dots+labels are visible right after a
      fresh search with no camera move.
      Evidence: SearchMapRenderController.swift:5456,6302-6316,7446-7449,6008/6078,8885-8889,9123-9156,
      10665-10668; use-search-map-native-render-owner.ts:2705-2713,2856.

## 4 (group 2). [ ] Out-region collision-based selection (ideal shape; depends on #1)

Out-region today: async-coverage-fetch-gated (batch, not live) + flat top-30 budget + always-draw
layer (allowOverlap:true) -> too many overlapping. Team previously tried collision-ON out-region and
REVERTED it (search-map.tsx ~2393) because collision on the RESIDENT layer flickered mid-crossfade.

- [ ] Out-region promotion = Mapbox symbol collision: separate out-region layer with
      icon-allow-overlap:false + icon-ignore-placement:false + symbol-sort-key = rank, fed ONLY
      promoted (opacity>0) out-region features so resident opacity-0 pins stay out of placement.
- [ ] Demote the flat OUT_REGION_MAX_FULL_PINS to a loose safety cap; let the renderer arbitrate
      one-per-area, highest-rank-of-colliders wins, isolated pins always show.
- [ ] Make out-region as LIVE as in-region (decouple from the async fetch where possible, or
      re-eval on the resident coverage set).
      Requires #1 (stable promoted set) first.

## 2/jitter. [ ] DEFERRED — steady pin anchor shift (NOT crossfade churn)

User correction: the pin never demotes; it shifts in place. pin/dot anchor difference is not it.
Genuine per-frame geometric/placement disturbance on a steady symbol. Investigation ruled out steady
per-frame feature-state writes and found badge/coordinate swaps instrumented ~0. Re-attribute with
frame tooling (extract-frames/frame-mad/align-residual, recreate in /tmp) on a real recorded pan.
Fix AFTER #1/#3/#4.

## 5. [ ] Pixel-level validation + promote-vs-viewport cross-reference

- [ ] Maestro/screenshot assertion that markers are actually painted (not just JS chrome_ready).
- [ ] Auto cross-reference: pins leaving the viewport == pins demoted; pins entering == promoted,
      during pan/zoom flows. Contracts exist (raw_visible_set_shrink_contract, lod_target_change_contract,
      lod_membership_churn_contract, demoteLostVisibility) — wire into perf-scenario-contract-gate.js.
