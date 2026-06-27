# SUPERSEDED → `map-lod-master-plan.md`

This ViewAnnotations migration plan is **dead**. ViewAnnotations were ruled out (they leave Mapbox's
collision world, breaking basemap-label-yield + the dismiss crossfade — both hard requirements). The label
stacking fix is **Option A "per-rank mutex offset"**, and the whole marker system (pins · dots · labels ·
collision · fade · engine) is now documented canonically in **`map-lod-master-plan.md`** (§4 = labels).
