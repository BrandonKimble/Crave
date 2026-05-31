---
name: map-lod-demotion-root-cause
description: Why search-map pins jitter/flicker/demote when panning or twisting the map without zooming
metadata:
  type: project
---

Diagnosed 2026-05-29. Symptom: panning/rotating the map aggressively (no zoom) demotes most pins to dots, sometimes collapsing to a couple pins, then recovering when motion settles. Expected: with no more-worthy pins entering, the initial pinned set stays stable when not zooming.

**Root cause (JS-side, not native).** Pin membership is recomputed every camera frame (~60fps) as "top-30 by rank ∩ markers inside the instantaneous viewport AABB," with:

1. **No membership hysteresis** — `buildMarkerRenderModel` ([map-render-model.ts](apps/mobile/src/screens/Search/utils/map-render-model.ts)) uses `currentPinnedMarkers` only for z-slot stability, never to keep a marker promoted. So any frame where a pin briefly fails the bounds test demotes it.
2. **Exact AABB bounds test, zero padding** — `isVisibleInBounds` against `coordinateBounds(for:)`. `padMapBounds` is never applied. Edge pins flicker in/out on pan; rotation/pitch makes the AABB↔visible-region mismatch worse (twisting amplifies it, matching the report).
3. **Degraded frame becomes the new resident** — publish early-return (`use-direct-search-map-source-controller.ts` ~1617) only skips when the new set equals resident; a transient bad frame is committed via `commitResidentSourceFrameSnapshot`, so the pin set ratchets down instead of recovering until a `full` publish.

Native (`applyPinVisualGroupOrderIfNeeded`, screenY z-order) does not demote — it faithfully renders/animates whatever JS classifies, so the jitter originates upstream in JS membership churn.

**Corrected fix model (agreed with user 2026-05-29; supersedes earlier "freeze/hysteresis" framing):**

- Promotion/demotion MUST stay live during active gesture — freezing membership during gesture is explicitly OFF LIMITS (it's a shortcut that defeats the point). Old-state dwell-timer hysteresis solved only marginal boundary-chatter, NOT the mass demotion — it is at most optional later polish, not the root fix.
- ROOT FIX 1 — screen-space bounds: replace the axis-aligned lat/lng `coordinateBounds(for:)` test with per-marker screen projection (`mapView.mapboxMap.point(for:)`) tested against the actual screen rect (+ small px pad). Inverts the test direction so pitch/twist "just work" (the lat/lng box can't rotate → on-screen corners fall outside it → mass demotion on twist; confirmed "worse when twisting"). Keep a generously-padded AABB only as a cheap coarse pre-cull. Add a horizon/behind-camera guard for pitch.
- ROOT FIX 2 — selection runs NATIVE per camera tick (user decision): JS pushes the full ranked catalog once per results change; Swift projects candidates each camera tick and picks visible top-30, writing feature-state. No JS round-trip / stale box / recommit-degraded-frame ratchet.
- ROOT FIX 3 — LOD = pure feature-state opacity crossfade (pin↔dot), both representations resident; never add/remove features for LOD. This is what makes per-frame LOD affordable during gesture and kills the pop/flicker.
- ROOT FIX 4 — 30 slot groups become permanent scaffolding (never created/destroyed at runtime). Slot reassignment happens only on genuine set change (a trickle), as a single tiny per-slot source update sequenced behind the fade.
- Z-order: keep native `moveLayer` per-slot by screen-Y (user decision) — it doesn't mutate sources, not a flicker source.

**Empirical baseline proof (2026-05-29, scenario-lod-baseline-clean):** the hardened `search-map-lod-pan-zoom` flow reproduces the bug. `native_pin_visual_order_contract.pinCount` collapses from a steady 30 → 27 → 22 → 13 → **4** → 7 → 12 during the aggressive movement loop. Meanwhile JS `lod_classification_contract.pinVisualIdentityCount` still reports 30 (sparse snapshots) — so the JS-side contract would PASS while the screen shows 4 pins. `totalRestaurants:36` (>30 slots) so minor pan churn is legitimate; a collapse to 4 is not. Run harness: `unset IOS_DEVICE_UDID IOS_DEVICE_NAME IOS_PREFER_DEVICE IOS_REQUIRE_DEVICE; IOS_SIMULATOR_NAME='iPhone 17 Pro' IOS_RUN=0 IOS_REQUIRE_OPEN=0 PERF_SHORTCUT_USE_SIMULATOR=1 PERF_SCENARIO_TIMEOUT_SECS=300 yarn perf:scenario:ios <flow> <name>`. Report+raw log at /tmp/perf-scenario-scenario-<runid>.json and the streamed stdout log. The stability contract to ADD: over a constant-zoom window, promoted pinCount must not fall far below min(visibleCandidates,30).

**Real stability contract (added + proven 2026-05-29).** `scripts/perf-scenario-parity-contracts.js` now has a promotion-stability check (in the `search_map_lod_pan_zoom`/`search_pin_selection_profile_open` block): over moving `native_pin_visual_order_contract` events, it detects collapse-and-recover oscillation of `pinCount` (drop >=12 from running peak, then rebound >=6) and FAILS on thrash. Proven: fails on current buggy build ("collapsed and recovered 9 time(s)... peak 30 to 2"), and 0 false positives on stable / monotonic-zoom-out / small-pan-churn sequences. Uses only `pinCount`+`isMoving` (no native field dependency). This is the regression gate for Stage A/B — should flip to PASS when LOD is fixed. Per-frame `lod_classification_contract` canNOT catch this (it reports intended set, not what natively rendered).

**Instrumentation quirk to revisit:** the native `pin_visual_order_contract` emit was given live `cameraZoom`/`cameraBearing` (SearchMapRenderController.swift ~8769) and JS forwards them, but only the 2 idle (isMoving:false) events carry them — all 313 moving events drop the fields (likely transient invalid cameraState/bearing during rapid animation → JSON omission). Not blocking (the stability contract is zoom-independent), but fix before relying on cameraZoom for Stage B scoping.

**FIX IMPLEMENTED + PROVEN (2026-05-29) — stable-membership selection policy.** Root fix for the mass-demotion (NOT the old dwell-timer hysteresis). In `buildMarkerRenderModel` ([map-render-model.ts](apps/mobile/src/screens/Search/utils/map-render-model.ts)): instead of recomputing "promoted = instantaneous top-N in viewport" each frame, the policy now (1) pads the membership bounds (`MARKER_RETENTION_BOUNDS_PAD_RATIO=0.35`, exported) to absorb rotation slop + gesture bounds-lag, and (2) retains a currently-promoted pin regardless of the bounds test — in-view markers take slot priority (top by rank), off-view retained pins fill leftover slots, so a pin demotes ONLY under genuine in-view contention (an in-view marker needs the slot). This stops demoting-for-being-out-of-bounds, which was the collapse mechanism. Result: pinCount steady 30 across the whole aggressive pan/twist loop (was 30↔2/4 thrash); stability gate GREEN; median 60fps (no regression); the transient label-collision-lock failure also cleared. The viewport-rank correctness contract (`buildViewportNormalPinRankContract` in use-direct-search-map-source-controller.ts) was updated from a positional "exactly top-N in raw viewport" match (which encoded the buggy policy) to a subset check over the in-view universe (candidates ∪ promoted, padded): the top `maxPins` by rank must all be promoted; retained off-view pins allowed. Only remaining gate failures are pre-existing hydration/SearchRuntimeBus contracts from a separate in-flight refactor (NOT map-related). Still TODO from the ideal model: native screen-space projection selection + resident-source/filter-bound topology (churn reduction) — deferred; the JS policy fix already flips the gate green.

**Glyph blocker (confirmed):** pin art is two stacked monochrome font glyphs (`PIN_GLYPH_OUTLINE` border + `PIN_GLYPH_FILL`) + shadow icon + rank text → multi-layer is REQUIRED for the crisp two-color border (a glyph is single-color; `text-halo` can't do a thick crisp border; SDF images were fuzzy). So the single-source + `symbol-z-order: viewport-y` collapse is OFF the table. The behavioral ideal is reached WITHOUT collapse via fixes 1–4 above. See [[map-lod-pin-architecture]].

## 2026-05-31 — Serious attribution: #2 demotion flash + #3 crossfade desync (static trace)

Traced the actual native transition machinery (SearchMapRenderController.swift) + JS source build (use-direct-search-map-source-controller.ts). Two DISTINCT root causes, both structural (why prior opacity-tweak fixes did nothing):

### #2 Demotion flash (fade out → FULL → out) — coalesce falls back to a baked property=1

- Pin opacity expr (search-map.tsx:2092): `['coalesce', ['feature-state','nativeLodOpacity'], ['get','nativeLodOpacity'], 1]`.
- JS bakes the pin source PROPERTY `nativeLodOpacity: 1` unconditionally (use-direct-search-map-source-controller.ts:1693).
- Native sets feature-state `nativeLodOpacity` to the stepped opacity ONLY while mid-transition; the per-feature record's featureState is left EMPTY `[:]` when `abs(currentOpacity-targetOpacity) < 0.001` (SearchMapRenderController.swift ~4188-4192), and the transition is REMOVED at completion (~6488).
- => At the END of a fade-out (and any frame where feature-state is momentarily absent on a still-rendered demoting pin), the coalesce falls through feature-state → PROPERTY = 1 → pin flashes to FULL, then the feature is removed. That is the "fade out → full → out".
- Fix direction: never let a rendered pin fall back to a full-opacity property. Either bake the property fallback to 0 (pins must not show without an explicit opacity), or always carry the current opacity in feature-state until the feature is removed (atomic remove of feature + state). Placement-preroll for INCOMING pins must keep using sourceFeatureOpacityForPlacementPreroll, not a constant 1.

### #3 Crossfade broken after first time — pin and dot LOD use different, unsynchronized mechanisms

- PIN promote/demote: driven by the native markerRoleFrame (immediate) + feature-state stepper. `isLiveMarkerRoleOnlyFrame` (SearchMapRenderController.swift:2188) requires markerRoleFrame≠nil AND sourceDeltas empty AND kind==live_update AND phase==live → reconcileAndApplyLiveMarkerRoleOutputs, dots visible = `roleTable.dotMarkerKeysInOrder` (SYNCHRONIZED with pins).
- DOT promote/demote on the OTHER path (reconcileAndApplyCurrentFrameSnapshots): dot visibility = `visibleDotMarkerKeys(from: desiredDots)` = dots whose `nativeDotOpacity` (feature-state OR baked property) > 0.001 (5372).
- The dot diffKey `buildDotSemanticRevision` = `${baseDiffKey}|dot|marker:${markerKey}` IGNORES nativeDotOpacity (891) → a promote/demote opacity flip does NOT change the dot's diffKey → it does not reliably propagate as fresh dot source data; the native dot source can keep a stale nativeDotOpacity property.
- Net: pin fade-out is immediate (role frame); dot fade-in is gated by which apply path runs + the JS publish cadence + a diffKey that ignores the opacity. => on the 2nd+ cycle pin fades out immediately while the dot fades in LATE / SNAPS (no shared transition), and demote shows no crossfade. "First time works" = initial feature-state/property are clean and aligned; later cycles diverge.
- Fix direction: make the dot's promote/demote a feature-STATE role change driven by the SAME role frame as the pin (dot visible iff markerKey ∈ roleTable.dotMarkerKeysInOrder), so pin-out and dot-in step together on one native frame. Stop encoding dot LOD as a baked JS source property; the dot source should carry a stable identity and let native feature-state own the crossfade. Then promote/demote is a pure live-marker-role frame (no source delta) → synchronized crossfade.

### Does Stage C help? NO.

Stage C = collision role proxies (which symbols WIN placement/collision). #2/#3 are opacity-fade TIMING + role-frame ROUTING defects, independent of collision. Stage C won't touch them. (Only tangential: unified collision affects WHEN a dot may place, not the pin-role-vs-dot-source timing desync.)

### Confirmation step before fixing (prior fixes failed on hypotheses)

Add a per-frame `lod_transition_trace` native emit (markerKey, apply path, isLiveMarkerRoleOnlyFrame, pin {prev/next present, target, current, featureStateApplied}, dot {prev/next visible, target, current, visibleSource, propertyOpacity}, allowNewTransitions) for markers whose pin/dot target changed; drive a zoom promote→demote→promote cycle (zoom DOES work via command lane) and read the trajectory to confirm the flash frame (empty feature-state + property=1) and the dot desync (late/snapped fade-in) before implementing.

## 2026-05-31 (cont) — instrumentation: the "crossfade clean" green was a FALSE NEGATIVE

- The flash/crossfade detectors already exist in `applyLivePinTransitionFeatureStates` (SearchMapRenderController.swift ~7763): `flashReversalCount` (pin transition startOpacity in (0.05,0.95) = reversed mid-fade) and `crossfadeGapCount` = pinExitMidFade − dotEnter (pin fading out with no dot fading in).
- BUT `QUIET_VISUAL_CONTRACT_FIELD_ALLOWLIST` in perf-scenario-attribution.ts strips event fields to an allowlist (pickPayloadFields, ~851), and `native_live_lod_transition_contract` did NOT list flashReversalCount/crossfadeGapCount/pinExitMidFadeCount → they were stripped before reaching the report → parity script read undefined→0 → "LOD crossfade clean: 0 flash/0 gap" was a FALSE GREEN. Fixed: added those + `lodTransitionTrace` to the allowlist.
- Added per-marker `lodTransitionTrace` to the emit (markerKey, fam, start/target/current opacity, the opposite family's transition target, awaitingCommit) so we can read the exact trajectory.
- Also: harness only did ONE zoom in/out; the bug is "cycle 2+". New flow maestro/perf/flows/search-map-lod-zoom-cycles.yaml does 4 promote↔demote cycles around a fixed center to trigger it.
- Build gotcha after restart: CocoaPods fails with `Unicode Normalization not appropriate for ASCII-8BIT` unless `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` is set for `yarn ios:sim:install`.

## 2026-05-31 CONFIRMED ROOT CAUSE (trace-backed) — boundary oscillation drives BOTH #2 and #3

Reproduced on the pan-zoom flow (panning crosses the promote/demote boundary; center-zoom does NOT because stable-membership retains the same 30). 151 transition frames, detectors now un-stripped:

- flashReversalCount>0 in 44 frames; crossfadeGapCount>0 in 81 frames.
- **14/14 demoting pins ALSO re-promote during the run = 100% oscillation** at the boundary (rank ~28-36 markers flip role frame-to-frame as they cross the viewport edge / the 30-slot contention line).
- 56 pin transitions start mid-fade (s=0.51, 0.918 → t=1) = the #2 "fade out → flash full → out": a fading pin is retargeted to 1 because its role flipped back.
- dot transitions are mostly PAIRED with demotes (174 paired vs 8 unpaired) → #3 is NOT "missing dot"; it's the dot transition being repeatedly REVERSED by the same oscillation, so it snaps/jumps instead of crossfading. "dot snaps out before pin shows" = role flipped mid-crossfade.

**Conclusion: ONE root cause — selection oscillation of boundary markers — produces both the flash (#2) and the broken/snapping crossfade (#3).** Prior fixes missed it because (a) detector fields were stripped by QUIET_VISUAL_CONTRACT_FIELD_ALLOWLIST (false green) and (b) attempts targeted opacity-fallback theories, not the role flip-flop.

**Stage C does NOT help** — it's collision/placement; these are selection-stability + opacity-transition bugs.

**Fix:** role hysteresis/debounce in selection (a boundary marker must sustain the new role for a dwell before the role commits) so markers stop flip-flopping → reversals stop (flash gone) → each crossfade completes once (desync gone). Plus remove the nativeLodOpacity coalesce → property → 1 flash fallback (default 0) so a cleared feature-state can never paint full. Stage B's per-tick screen-space visibility likely sharpened the edge flicker, but the oscillation root (no demote/promote hysteresis for boundary markers) predates it.

## 2026-05-31 FIXES (measured) — flash + oscillation eliminated; crossfade

1. **Visibility hysteresis** (use-direct-search-map-source-controller.ts: markerLastVisibleAtMsRef + MARKER_VISIBILITY_DWELL_MS=700; effective visible = native-visible ∪ seen-within-dwell, fed to buildMarkerRenderModel). Boundary markers no longer flip role on edge flicker. RESULT: flashReversalCount 44→0 frames; transition frames 151→17 (oscillation gone). The #2 demotion flash is fixed at the source.
2. **Dot-enter false-await removed** (SearchMapRenderController updateLiveDotTransitions: dot source is RESIDENT (dots=36, all markers; promoted opacity 0, demoted 1) so a dot-enter's feature is always present → isAwaitingSourceCommit=false). Demoting marker's dot now fades in immediately with the pin-exit instead of waiting for a source commit.
3. **Detector realness:** the "LOD crossfade clean" green was a FALSE NEGATIVE — flashReversalCount/crossfadeGapCount/pinExitMidFadeCount were stripped by QUIET_VISUAL_CONTRACT_FIELD_ALLOWLIST. Added them + lodTransitionTrace to the allowlist. Then refined crossfadeGapCount to intersect with markerRoleTable.dotMarkerKeysInOrder, because the raw detector miscounted VIEWPORT EXITS (a pin panning off-screen fades out with no dot — correct, dot is off-screen) as gaps. Trace proof: residual gap markers (a2e43d38 @30.208, a221cabe @30.216, 0d0763ca @30.334) are all at viewport EDGES with dotTarget=-1 (exiting, not demoting-in-place).

REMAINING (promotion direction): "dot snaps out before pin shows" on re-promote = pin-enter awaits its source commit (pin bundle is DYNAMIC/30-only) while the dot-exit fades immediately. The GROSS version was the oscillation (fixed); residual ≈ 1-2 frame pin-commit latency. Clean fix = cross-family await coordination (dot-exit awaits the pin-enter's awaitingSourceDataId; extend resolveAwaitingLivePinTransitionsForSourceCommit to start matching dot-exits from opacity 1) OR resident pin bundle — but slot assignment is a feature PROPERTY (filter), so promotion is inherently a source mutation → some await is fundamental. Deferred; validate on device first.

Stage C (collision proxies) does NOT help any of this — orthogonal (collision vs opacity-transition/selection).

## 2026-05-31 — Unified pin↔dot crossfade COUPLING (the proper crossfade fix)

Refined detector revealed BOTH directions still gapped after dot-await removal: demoting pins had NO dot transition created at all (dotTarget=-1; movement gating/visibility-delta skipped it), and promotes had pin-enter awaiting commit while dot-exit faded immediately. Root: pin & dot transitions were computed INDEPENDENTLY → desync/missing.
FIX (SearchMapRenderController.swift):

- `updateLiveDotTransitions` now reads the pin transitions and COUPLES: marker promoting (pin target 1) → dot target 0 (exit); marker demoting (pin target 0) → dot target 1 (enter). The dot transition is ALWAYS created when a pin transition exists (bypasses allowNewTransitions + previousVisible!=nextVisible gates). A demote's dot-enter is immediate (resident dot source); a promote's dot-exit AWAITS the same pin commit (isAwaitingSourceCommit when pinPromotingAwaitingCommit) so the dot stays visible until the pin is ready.
- `startAwaitingLivePinTransitions` records started pin-enter markers and un-awaits their coupled dot-exit (startedAtMs=now, keep startOpacity≈1) so dot fades out exactly as pin fades in. Added dotFamilyState + setDerivedFamilyState(dot).
- liveDotTransitionOpacity returns startOpacity while awaiting (verified) so the held dot-exit isn't prematurely dropped across frames.
  Expected: crossfadeGapCount → ~0 both directions, flashReversals stay 0. Validate via pan-zoom parity contract.
