---
name: map-lod-pin-architecture
description: How the search-map pin/dot LOD, label candidates, z-order stacking, and per-pin slot source groups work (JS + native iOS)
metadata:
  type: project
---

Search map marker rendering ("get comfortable with the map stuff"). Mobile, Mapbox (rnmapbox).

**Layer model.** Each promoted pin owns a *slot* (0..29) with its own native source group + symbol-layer stack (art layers stacked for the layered/bordered pin look Mapbox can't do natively) + interaction layer + 4 label candidate layers + a collision feature. `STYLE_PIN_STACK_SLOTS = 30` (+ overflow slots for a selected multi-location restaurant). 4 label candidates per pin exist because Mapbox can't vary anchor↔label offset per side, so each side is its own candidate layer with its own collision; they negotiate the best free side by priority. Per-pin source groups (vs the old single pin/dot source) were chosen because LOD changes forced switching a marker between the dot source group and pin source group, and *source-group switches* caused flicker; extra symbol LAYERS are cheap, source-group churn is not.

**Where the work lives.**
- JS decides pin-vs-dot MEMBERSHIP. Native only renders what JS classifies + animates LOD fades + restacks z-order. Native does NOT demote on its own.
- LOD selection: `buildMarkerRenderModel` in [map-render-model.ts](apps/mobile/src/screens/Search/utils/map-render-model.ts). Pinned = top-`maxPins`(=30) by rank that pass `isVisibleInBounds(currentBounds)`. `currentPinnedMarkers` is used ONLY for stable z-slot assignment (`buildStableSlotMap`), NOT to keep a marker promoted — there is **no membership hysteresis**.
- Publish path: `publishSourcesRef.current` in [use-direct-search-map-source-controller.ts:1239](apps/mobile/src/screens/Search/hooks/use-direct-search-map-source-controller.ts). Viewport subscription (~line 2617) calls it with reason `viewport_lod` on every bounds change. Early-return skip at ~1617 only fires when the new pinned set EQUALS resident; a changed (degraded) set is committed as the new resident -> ratchets down.
- Bounds come from native `camera_changed` (`handleNativeCameraChanged`, ~line 10620 in SearchMapRenderController.swift) via `coordinateBounds(for:)` (axis-aligned), fed to `viewportBoundsService.setBounds`. `padMapBounds` exists but is UNUSED in the LOD path — exact AABB containment, zero padding.
- Native z-order restack: `applyPinVisualGroupOrderIfNeeded` (~line 8640) runs on every camera change, projects each pin to screenY, sorts (selected on top, then lower-screenY = higher z), and reorders only the LCS-"moved" slot layer stacks via `moveLayer` (cheap, no source mutation).

See [map-lod-demotion-root-cause]].
