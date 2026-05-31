---
name: map-stage-b-spec
description: Execution-ready spec for Stage B — native screen-space per-tick LOD selection (the "use the phone screen as bounds" rewrite)
metadata:
  type: project
---

Start here for Stage B. Prereqs done: single bundle-source cutover (renders), stable-membership selection (gate green), #1 camera fix, #12 label-obs fix, detectors+gates. Baseline commit: 0d82bd96. See [[map-lod-target-plan]], [[map-lod-pin-architecture]].

## Goal

Replace the JS per-tick padded-AABB selection with **native screen-space projection** selection, so promotion/demotion is accurate under pitch/twist (not a padded-AABB approximation) and runs on the live camera each tick. JS owns POLICY (ranked catalog + rules); native APPLIES policy to the live viewport; Mapbox animates.

## Current selection path (what Stage B replaces)

- `buildMarkerRenderModel` (apps/mobile/src/screens/Search/utils/map-render-model.ts): selects promoted set = top `maxPins`(30) by rank among `isVisibleInBounds(paddedBounds)`, with stable-membership retention (retainedInView/offView + contention-only demotion). Runs in `publishSourcesRef.current` (use-direct-search-map-source-controller.ts ~1600) on `viewport_lod` publish (triggered by viewportBoundsService.setBounds from native camera_changed, ~line 2629).
- JS builds the markerRoleFrame (pinned/dot/resident sets + upsertRoles with pin/interaction/4-labels/collision/dot features per marker) and source frame; native applies (single bundle source + feature-state opacity + moveLayer z-order by screenY).
- Native already projects per-marker via `point(for:)` for z-order in `applyPinVisualGroupOrderIfNeeded` (~8640) on every camera change — projection machinery PROVEN and present.

## Two implementation options

### Option A (FULL, the agreed ideal): native owns selection

- JS pushes the FULL candidate catalog ONCE per results change: every marker's rank + coordinate + pre-built features (pin bundle feature, interaction, 4 labels, collision, dot). New transport (extend attach/setRenderFrame, NOT per-tick).
- Native stores the catalog. On each camera tick: coarse lat/lng cull → `point(for:)` project survivors → screen-rect test (+px pad) with horizon/behind-camera guard → top-N by JS rank → stable-slot assignment → build the markerRoleTable from the catalog → drive feature-state + moveLayer.
- JS stops per-tick selection; remove buildMarkerRenderModel viewport_lod path.
- Pros: no per-tick bridge round-trip; true ideal. Cons: port the stable-membership policy to Swift (~map-render-model.ts logic) + catalog transport + role-table assembly natively. Large.

### Option B (LIGHTER): native screen-space visibility, JS keeps selection policy

- JS pushes catalog (markerKey + coordinate) once. Native, per camera tick, projects all catalog markers and emits the on-screen markerKey set (+ screenY) via camera_changed (or a sibling event).
- JS selection replaces `isVisibleInBounds(paddedBounds)` with membership in the native-visible set; stable-membership policy stays in JS unchanged.
- Pros: much smaller; keeps the proven JS policy; achieves screen-accurate visibility (the actual user want). Cons: per-tick native→JS event (small markerKey set; bridge traffic during gesture — likely fine, measure).

RECOMMENDATION: start with Option B (smaller, lower-risk, delivers the screen-accuracy benefit, keeps the working policy). If per-tick bridge cost shows up in samplers, escalate to Option A. Either way, JS catalog push is the shared first step.

## Incremental, committable steps

- B1: JS builds + pushes the candidate catalog (markerKey + lng/lat + rank) to native once per results change (additive; native stores it, no behavior change). Commit.
- B2 (Option B): native projects catalog per camera tick → emits on-screen markerKey set; add a parity diagnostic comparing native-visible vs JS isVisibleInBounds. Commit.
- B3: JS selection consumes the native-visible set instead of AABB; keep stable-membership. Verify stability gate stays green + screenshots under twist. Commit.
- B4: remove the now-dead AABB `isVisibleInBounds` path / padMapBounds-for-selection. Commit.

## Verification (autonomous loop — works on simulator regardless of user's phone)

- Run env: `unset IOS_DEVICE_UDID IOS_DEVICE_NAME IOS_PREFER_DEVICE IOS_REQUIRE_DEVICE; IOS_SIMULATOR_NAME='iPhone 17 Pro' IOS_RUN=0 IOS_REQUIRE_OPEN=0 PERF_SHORTCUT_USE_SIMULATOR=1 PERF_SCENARIO_TIMEOUT_SECS=300 yarn perf:scenario:ios <flow> <name>`
- Native rebuild after Swift changes: `IOS_SIMULATOR_NAME='iPhone 17 Pro' yarn ios:sim:install` (~5-8 min).
- Gates: stability (no oscillation), LOD crossfade clean (0 flash/gap), classification, slot topology, family alignment — must stay green. The key NEW proof for Stage B: twist/pitch with bearing!=0 must keep on-screen markers promoted (screen-space test). The validate flow's command-lane bearing didn't visibly rotate — use a real Maestro pinch/rotate gesture or verify bearing applies, to prove screen-space vs AABB difference.
- Screenshot: `xcrun simctl io booted screenshot /tmp/x.png` then Read it.

## Risks / watch

- Per-tick projection cost (Option A or B): coarse-cull to bound the projected count; reuse the z-order projection pass.
- Horizon/behind-camera: `point(for:)` returns points for coords behind camera/above horizon — must guard or false-visible.
- Don't regress the working stable-membership behavior (gate is the guard).

## PROGRESS 2026-05-30 — B1+B2 implemented (Option B), pending native rebuild+validate

Also this session (confirmed on device): camera made UNCONTROLLED (defaultSettings + imperative commit) → fixed viewport snap-to-initial (#1) AND the per-tick mirror "bounce". Dot layer set textAllowOverlap/IgnorePlacement:true → demoted dots always paint (every showable result visible; pins are an enhancement on top).

B1+B2 combined into ONE native rebuild (B1 storage + B2 projection/emit) so the parity/visibility contract validates both:

- NATIVE (SearchMapRenderController.swift): added `CandidateCatalogEntry` struct + `InstanceState.candidateCatalog` + `lastVisibleMarkerSetSignature` (init at the single ctor site). Added `@objc setCandidateCatalog(_:resolver:rejecter:)` (parses {markerKey,lng,lat,rank}, stores, resets visible-set signature). Added `computeOnScreenMarkerKeys(catalog:handle:)` = project each via `mapboxMap.point(for:)`, test against `mapView.bounds.insetBy(-nativeScreenSpaceVisibilityPadPx=64)`, reject behind-camera via `coordinate(for:)` round-trip (>0.001° divergence). In `handleNativeCameraChanged` per-instance loop: compute on-screen set, emit `map_native_visible_markers` {markerKeys,markerCount,catalogCount,zoom,bearing,pitch,isMoving} only when the sorted-key signature changes.
- BRIDGE (UIFrameSamplerBridge.m): added RCT_EXTERN_METHOD(setCandidateCatalog:resolver:rejecter:).
- TS controller (search-map-render-controller.ts): nativeModule.setCandidateCatalog type, controller `setCandidateCatalog` method, `map_native_visible_markers` event-union member.
- PORT (search-map-source-frame-port.ts): added `SearchMapCandidateCatalog{key,entries}` + `SearchMapNativeVisibleMarkers{markerKeys,catalogCount}` + port methods publish/getCandidateCatalog + publish/getNativeVisibleMarkerKeys (catalog kept OFF the per-frame snapshot to avoid viewport-tick churn; both sides already hold the port).
- SOURCE CONTROLLER (use-direct-search-map-source-controller.ts): after rankedCandidates (the FULL rank-ordered catalog, pre-viewport-filter), build entries {markerKey,lng,lat,rank=properties.rank??index} + fingerprint key; `sourceFramePort.publishCandidateCatalog` only when key changes (lastPublishedCandidateCatalogKeyRef).
- OWNER (use-search-map-native-render-owner.ts): before submitRenderFrameFireAndObserve, read port.getCandidateCatalog(); if key != lastPushedCandidateCatalogKeyRef → `searchMapRenderController.setCandidateCatalog({instanceId,entries})`. On `map_native_visible_markers` event → port.publishNativeVisibleMarkerKeys(...) (pre-wires B3) + emit `map_native_screenspace_visibility_contract` {nativeVisibleMarkerCount,catalogCount,zoom,bearing,pitch}. NOTE: owner has TWO sourceFramePortRef scopes — the submit/event closures are the SECOND (~line 2814), declare refs there.
- JS tsc: 0 errors.

NEXT: `IOS_SIMULATOR_NAME='iPhone 17 Pro' yarn ios:sim:install` (rebuild), then run LOD flow and grep `map_native_screenspace_visibility_contract` — expect nativeVisibleMarkerCount ~36 at search viewport, catalogCount ~48, count shrinking on zoom-in / changing under twist. Then B3 (JS-only): in buildMarkerRenderModel selection, replace isVisibleInBounds(paddedBounds) with membership in port.getNativeVisibleMarkerKeys() set (keep stable-membership); verify stability gate green. B4: delete dead AABB path.

## STATUS 2026-05-31 — Stage B (Option B) DONE & validated; B4 resolved

**B1 ✅** JS publishes the full ranked candidate catalog (markerKey+lng/lat+rank) to the source frame port on results change → native via `setCandidateCatalog`. Verified: `catalogCount=36`.

**B2 ✅** Native projects the catalog per camera tick in `handleNativeCameraChanged` via `computeOnScreenMarkerKeys` (`point(for:)` + screen-rect test +64px pad + coordinate round-trip horizon guard), throttled to set-change, emits `map_native_visible_markers` → JS stores it in the frame port (`publishNativeVisibleMarkerKeys`) and emits `map_native_screenspace_visibility_contract`. **Proven camera-accurate**: nativeVisible=34-35 at zoom 11.4, drops to 15-17 at zoom 13.15 (shrinks on zoom-in — true projection, not a static AABB).

**B3 ✅** `buildMarkerRenderModel` gains `nativeVisibleMarkerKeys`; `isVisible(feature)` uses the native set when present, padded-AABB only as bootstrap. Stable-membership policy unchanged. Wired in use-direct-search-map-source-controller. Also aligned `buildViewportNormalPinRankContract` to the SAME native-visible predicate (its AABB universe was false-failing the classification contract at the rank boundary). Gates: classification ✅, promotion stability (no oscillation) ✅, crossfade clean (0 flash/0 gap) ✅, coverage preserved 36→30 pins+6 dots ✅. Parity contracts deterministically GREEN (exit 0).

**B4 — resolved, NOT a removal.** In Option B the padded-AABB `isVisibleInBounds`/`padMapBounds(MARKER_RETENTION_BOUNDS_PAD_RATIO)` is the ONE-FRAME BOOTSTRAP path: the first publish after results runs in the same tick as the catalog push, so the native visible set (async round-trip) isn't available yet. It is the defined initial-frame behavior, not dead/legacy code. Steady state (every frame after the first camera tick) uses native screen-space. Removing the bootstrap would add fragility (blank first frame / forced async) for purity — kept and documented.

**Twist coverage gap (harness, not code).** Maestro `waitForAnimationToEnd` does NOT wait for native Mapbox camera eases, so command-lane bearing twists are interrupted before the camera rotates (observed cameraBearing stays ~0 despite 75°/110° commands; zoom DOES apply). The `native_pin_visual_order` twist contract was false-failing on this; now gated on OBSERVED bearing (>5°) and emits a SKIPPED note otherwise. Native projection handles bearing by construction (`point(for:)`). To actually prove twist end-to-end, a real Maestro pinch/rotate gesture (or a paced hold that lets the native ease settle) is needed — follow-up.

Files: SearchMapRenderController.swift (CandidateCatalogEntry, candidateCatalog, setCandidateCatalog, computeOnScreenMarkerKeys, map_native_visible_markers emit, nativeScreenSpaceVisibilityPadPx=64, lastVisibleMarkerSetSignature), search-map-source-frame-port.ts (catalog + nativeVisibleMarkers port), search-map-render-controller.ts (setCandidateCatalog + map_native_visible_markers event), use-search-map-native-render-owner.ts (catalog push + visibility handler + contract), use-direct-search-map-source-controller.ts (catalog build + nativeVisibleMarkerKeys into model + rank contract), map-render-model.ts (nativeVisibleMarkerKeys + isVisible), perf-scenario-parity-contracts.js (observed-bearing twist gate).
