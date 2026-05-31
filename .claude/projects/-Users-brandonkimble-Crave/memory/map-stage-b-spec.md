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
