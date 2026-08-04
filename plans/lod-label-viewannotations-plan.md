# SUPERSEDED → `map-lod-master-plan.md`

This ViewAnnotations migration plan is **dead**. ViewAnnotations were ruled out (they leave Mapbox's
collision world, breaking basemap-label-yield + the dismiss crossfade — both hard requirements). The label
stacking fix is **Option A "per-rank mutex offset"**, and the whole marker system (pins · dots · labels ·
collision · fade · engine) is now documented canonically in **`map-lod-master-plan.md`** (§4 = labels).

---

> **Correction 2026-08-03 (truth audit): this document's own death notice is WRONG, and
> so is the supersession it points at.** "ViewAnnotations were ruled out" was REVERSED —
> the shipped map renders **both pins and labels as Mapbox ViewAnnotations**:
>
> - `apps/mobile/ios/cravesearch/SearchMapRenderController.swift:5`
>   `@_spi(Experimental) import MapboxMaps   // Experimental unlocks
ViewAnnotation.enableSymbolLayerCollision (label VA wins over basemap)`
> - :77-97 `PinVAView` — "The per-pin view HOSTED BY a Mapbox ViewAnnotation".
> - :99-101 "Phase-2 (labels → ViewAnnotation): the per-restaurant NAME label hosted by a
>   self-colliding VA (enableSymbolLayerCollision → wins over basemap; variableAnchors →
>   the SDK picks the first open side)."
>
> The load-bearing objection ("VAs leave Mapbox's collision world, breaking
> basemap-label-yield") was dissolved by an SDK upgrade: the repo is now on
> **MapboxMaps 11.26.0-rc.1** (`apps/mobile/ios/Podfile.lock:387`), where
> `enableSymbolLayerCollision` exists (`Pods/MapboxMaps/Sources/MapboxMaps/Annotations/
ViewAnnotation.swift:120`). Every "ZERO matches in 11.16.6" verification in the LOD
> plan family is obsolete against the pinned SDK. The GL label substrate this plan was
> replacing (`RESTAURANT_LABEL_RENDER_SOURCE_ID`, the 4 candidate layers, the
> per-restaurant mutex icon) no longer exists in `search-map.tsx`. The map is SHIPPED and
> best-in-class as of ~2026-07; treat this file as archaeology, not as a live ruling.
