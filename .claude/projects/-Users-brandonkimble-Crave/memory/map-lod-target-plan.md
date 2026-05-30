---
name: map-lod-target-plan
description: Agreed target architecture + staged cutover plan for the search-map pin/dot LOD rework
metadata:
  type: project
---

Target model (agreed 2026-05-29). Fixes jitter/flicker/mass-demotion while keeping live promote/demote DURING gesture and the multi-glyph pin art. See [[map-lod-pin-architecture]], [[map-lod-demotion-root-cause]].

**Split:** JS owns policy (ranked catalog, ranking rules, styling) and pushes the full candidate catalog to native once per results change. Native applies that ranking to the live viewport each camera tick (execution, not decision). Mapbox owns animation + collision.

**Sources:** ONE permanent pin source + ONE permanent dot source + ONE permanent collision source, holding every marker, never mutated after load. (Today: 30 mutating slot sources — the churn/flicker source.)

**Slots:** 30 (+ overflow) orderable layer-groups stay (required because multi-glyph art can't be single-layer). Each binds to its current marker via a layer `filter` (id-match) = a style update, NOT a source delta. Reassignment is a filter swap, only on genuine set change (a trickle), sequenced behind the opacity fade. Source mutation after load → zero.

**LOD:** pure feature-state opacity crossfade (pin↔dot), both resident. Native feature-state opacity stepper ALREADY EXISTS (`livePinFeatureState(opacity:)`, `renderState.currentOpacity/targetOpacity`, display-link animator) — reuse it.

**Visibility:** native screen-space test — project candidate to screen via `point(for:)`, test against the view rect (+px pad) with a horizon/behind-camera guard. Padded lat/lng AABB kept only as a cheap coarse pre-cull. This is what fixes twist/pitch mass-demotion at root.

**Z-order:** keep native `moveLayer` per-slot by screen-Y (not a source mutation).

**Collision:** two role-filtered proxy layers (pin-obstacle: always visible / occupies space; dot+label victims: allow-overlap false, yield to pins). Role flip = filter update (not source mutation). Opacity crossfade is invisible to Mapbox collision, so transitions never fight collision. Mapbox recomputes collision natively per frame (bounded by on-screen symbol count).

**Staged cutover (keeps app working each step):**
- A. Resident sources + filter-bound slots (no selection change yet) — removes source-mutation churn. Fold in a filter-swap-cost spike.
- B. Native screen-space selection per tick; JS stops per-camera selection (pushes catalog only) — fixes twist demotion + live-during-gesture.
- C. Collision role proxies.
- D. Cleanup: delete dead JS `buildMarkerRenderModel`/`viewport_lod` cadence, obsolete role-frame transport, repurpose/remove `padMapBounds`.

**Constraint on process:** map rendering is visually verifiable only on-device by the user — Claude cannot see the screen. So implement stage-by-stage with a device checkpoint at each boundary; do not do a silent all-stages cutover. Watch items: filter-swap cost; on-screen dot collision count.
