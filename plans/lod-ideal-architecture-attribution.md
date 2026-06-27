# LOD — Architectural attribution of the remaining issues + the ideal cut-over

Goal: for each remaining map-LOD issue, the PROVEN root cause (instrumentation + code), the
architectural conflict that causes it, and the ideal shape to cut over to. Source of truth =
the `[lodev]` harness + the code, not screenshots.

Status of the verified wins (context):
- #8 (30 pins) FIXED: rank pool sourced from the ranked `shortcut_coverage` call, decoupled from
  card pagination. Verified promoted=30, ranks contiguous 1..30.
- #11 invisibility ORPHANS root-fixed (await self-resolves on bundle-resident in the stepper; demote
  finalize respects the live role + retains render state while bundle resident; a stepper convergence
  pass fades any promoted+resident+invisible marker). The opacity self-heal patch was DELETED.

---

## Issue A — dots don't yield to pin BODIES (#9) — ✅ IMPLEMENTED + VERIFIED
DONE (search-map.tsx, JS-only): added a second invisible obstacle `DOT_PIN_COLLISION_STYLE` (full pin
silhouette, scale 1.0) on layer `RESTAURANT_PIN_DOT_COLLISION_LAYER_ID`, positioned
`belowLayerID=SEARCH_LABELS_Z_ANCHOR_LAYER_ID` — BELOW the name-labels (labels never yield to it) but
ABOVE the dots (dots yield to the whole body). Verified: `labelFeat=labelEff=30/30` (no label-cull
regression) + `renderedDots` dropped with dots in gaps, not on bodies. Possible tuning: the outline
sprite's box is a rectangle over the teardrop (slightly over-culls tip/corner gap-dots); switch to the
FILL sprite for a tighter body-circle box if dot density feels too sparse.

### (original attribution, for reference)

### Proven root (code: apps/mobile/src/screens/Search/components/search-map.tsx:160-208)
There is exactly ONE invisible "pin collision obstacle" per promoted pin (the 3 obstacle layers,
`PIN_COLLISION_OBSTACLE_SCALE`, `iconIgnorePlacement:false` → it occupies collision space). It does
TWO jobs at once:
1. Make OTHER restaurants' dots (dot layer `iconAllowOverlap:false`) AND labels yield to this pin.
2. NOT cull THIS pin's own below-pin name-label.

These two jobs CONFLICT and the comment documents the whole tuning war:
- At scale 1.1 (commit 73719a62) the obstacle was ~10% bigger than the visible pin → it swallowed the
  pin's OWN min-gapped name-label → ALL name-labels vanished.
- So it was pinned back to 0.6 + shifted UP (`PIN_COLLISION_OFFSET_Y_PX = -0.25*size`): the obstacle now
  covers only the pin **core**, leaving the body edges + tip uncovered, so the own label clears it.

Consequence: at 0.6 the obstacle is SMALLER than the pin body. A neighbour restaurant's dot that lands
inside the pin body but outside the 0.6 core is NOT culled → it paints over the pin body = #9. (Same-
restaurant dot-under-pin is separate and already 0: `promDotOpaque=0` — that's the crossfade, not this.)

### The architectural conflict
One obstacle cannot be simultaneously "full pin body" (to make dots yield to the whole body) and
"smaller than the own label gap" (to not cull the own label). The single shared obstacle is a forced
compromise; 0.6 favours the label and loses the dots.

### Ideal cut-over: TWO obstacles at distinct collision priorities
Mapbox places symbols highest-priority-first (symbol-sort-key / layer order); a symbol is culled if it
overlaps an already-placed higher-priority symbol.

- **Label-collision obstacle** = the pin CORE (current 0.6 + up offset), priority ABOVE name-labels.
  Other restaurants' labels yield to the core; the pin's own label (higher priority than this in its own
  group, or simply min-gapped outside the core) clears it. (Unchanged behaviour — keeps labels working.)
- **Dot-collision obstacle** = the FULL pin body, priority BELOW labels but ABOVE dots
  (`iconAllowOverlap:true` so it always places + occupies space; `iconIgnorePlacement:false`). Dots yield
  to the full body; labels do NOT (they're higher priority, placed before it), so this does NOT
  re-introduce the own-label-culling regression.

Net: dots yield to the whole pin body (#9 fixed) without touching the label tuning. This is a pure
search-map.tsx style change (add one obstacle layer fed by the same promoted-pin filter, with a sort-key
between labels and dots).

---

## Issue B — labels stale/missing after dismiss → re-search (#10) — ATTRIBUTION CORRECTED (not the JS source)
CORRECTED by instrumentation (a `[L10]` console.log of the listener): after a dismiss→re-search the
NATIVE render state has `labelFeat=7/30` (only 7 promoted pins carry a name-label), BUT the JS label
SOURCE (`sourceFramePort.getSnapshot().labelSourceStore`) already holds labels for **390** distinct
markers — including all 30 promoted (`promoted=30 labeled=390 gap=false`). So the JS source is NOT the
bottleneck — it has the labels. The gap is one layer deeper: the per-marker label RENDER STATE
(`markerRenderStateByMarkerKey[key].labelFeatures`, native, fed by the role frame's
`desiredPayloads.labelFeaturesByMarkerKey`) is built for only 7 of the 30 promoted, even though their PIN
render state IS built (renderP=30). i.e. the re-search's scoped reconcile builds the pin half of the
render state for all 30 but the LABEL half for only 7 — same scoping-gap class as the pin invisibility
orphans, but for labels, and NOT reachable by a JS label-source re-publish.

WRONG FIX (built + REVERTED this pass): a port `setNativeVisibleMarkersListener` that rebuilt labels when
native reported promoted markers lacking a label in the JS source. It NEVER triggers because the JS
source already has them (`gap=false`) — the wrong signal. First search unaffected (good), re-search
unchanged (labelFeat=7). Reverted port/render-owner/event-type via git checkout + the controller hooks by
hand (kept the coverage rank pool + the #9 dot obstacle).

IDEAL CUT-OVER (corrected): the label RENDER STATE must be (re)built for every PROMOTED marker, not a
scoped/stale subset — the same way the pin render state + the stepper convergence already guarantee the
pin half. Either (a) build the role-frame `labelFeaturesByMarkerKey` for the full promoted set (un-gate it
from whatever stale on-screen set it currently uses — note the SOURCE build does NOT use that gate, hence
the 390-vs-7 split, so find the role-frame label build's gate and align it to the promoted set), or (b)
extend the native render-state convergence (finalize/render-state retention + the stepper pass that
already re-promotes pins) to also rebuild missing `labelFeatures` for a promoted marker from the resident
label source. NEXT STEP before coding: trace where `desiredPayloads.labelFeaturesByMarkerKey` is populated
vs where `labelSourceStore` is built (use-direct-search-map-source-controller.ts) and find why one is 7 and
the other 390 for the same frame.

### (original, partially-wrong attribution — superseded by the above)

### Proven root (harness: re-search settles roleP=30 renderP=30 but labelFeat=7/30; code:
### use-direct-search-map-source-controller.ts buildDirectLabelStores ~840-908 + ~1953)
Labels are built in **JS**, inside the data-frame (`publishSources`), gated on
`onScreenMarkerKeys = sourceFramePort.getNativeVisibleMarkerKeys()` — a **native-derived** on-screen set
delivered to JS via the `map_native_visible_markers` event. That is a native→JS→native round-trip:
native projects the on-screen set → JS reads it to decide WHICH resident pins get name-labels → JS
pushes the label source back to native.

The race: after a re-search, `publishSources` runs on coverage-completion BEFORE native re-projects the
new catalog, so `getNativeVisibleMarkerKeys()` returns a STALE/tiny set (e.g. 7). Labels build for 7 →
`labelFeat=7/30`. Nothing re-runs the label build when native finally projects the full set: the
`isMapMoving` effect only fires on gesture-END, and a discrete re-search is not a gesture. The JS
promotion SEED (`isPromoted`, top-N-by-rank) is filtered by the SAME stale native-visible (line 1678),
so it can't substitute.

Why the obvious patch fails (proven this session): a listener that re-publishes on native-visible change
REGRESSES the first search to 24/30 — it locks onto an INTERMEDIATE reveal projection, and the final
full projection arrives `isMoving=true` → skipped. The label gate genuinely needs the FINAL settled
on-screen set, which JS only ever sees second-hand and late.

### The architectural conflict
Native is the SOLE owner of promotion and the on-screen set, but the LABEL membership decision (which
on-screen pins show a name-label) lives in JS and is gated on a stale copy of native's set. The
round-trip is the root: JS's gate is always one projection behind native's truth.

### Ideal cut-over: NATIVE-OWNED label gating (mirror pin promotion)
Native already decides which markers are pins (`projectAndEmitOnScreenMarkers` →
`nativePromotedKeysInOrder`) every projection. Labels are exactly "the name-labels for the promoted +
crossfading-out pins" — the SAME on-screen membership native already computes. So:
- JS publishes label CONTENT once per search/data-change: for every candidate, its 4 label-candidate
  features (text/anchor/diffKey) — viewport-independent, no on-screen gate.
- NATIVE selects WHICH markers' labels to mount each projection from its own promoted/on-screen set (the
  set it already owns), and drives label opacity off the same pin crossfade it already drives.

This deletes the JS round-trip and the stale-gate race entirely: labels track the current native
promotion by construction, every projection, including the re-search reveal. (It also subsumes the
during-pan label lag — labels stop being a JS-frame concern.)

---

## Issue C — invisibility residual: bundle-missing under sustained panning

### PROVEN root (harness, refined this pass with gapPinSrc/gapCatalog over a 48-swipe storm):
596/1494 frames had `gapBundle>0`, and in EVERY one **`gapPinSrc=0` and `gapCatalog=0`**. So the
invisible marker:
- IS in the candidate catalog (gapCatalog=0) → JS published it (full residency includes it),
- IS in the pin/role source `pinSourceId` (gapPinSrc=0),
- is NOT in the pin BUNDLE source `pinBundleSourceId` (gapBundle>0) → no geometry/art to paint.

→ The pin source and the pin BUNDLE source are DECOUPLED and out of sync. "Full residency" (~1696)
pre-seeds the pin/role source (`pinSourceId`) with every candidate, but the BUNDLE source
(`pinBundleSourceId`, the actual teardrop geometry + art — the GeoJSON source whose re-tile is the choppy
O(N) cost) is populated INCREMENTALLY by the reconcile apply (`buildDirectSlotApplyPlans` for the bundle
source), and that apply DEFERS adds during motion (retain, to avoid the re-tile/wiggle). So during a fast
gesture a marker is promoted (role set in pinSourceId) before its bundle is mounted in pinBundleSourceId
→ invisible. The bundle source lags and usually catches up at settle (this run gapBundle→0); rarely it
doesn't (the prior-run 3-4 residual). Almost all gapBundle frames are `mv=T` (in-motion lag), the residual
is the rare case where the catch-up is missed at the settle frame.

### The architectural conflict
"Full residency / promote = pure opacity flip" is only HALF-implemented: the role source is fully
resident, but the BUNDLE source (the one that actually has to re-tile to add geometry) is still built
incrementally and deferred during motion. So the resident-model promise ("no source mutation mid-gesture")
is not guaranteed for the bundle source — promote can need a deferred bundle add that lands late or not at
all.

### Ideal cut-over
Make full residency cover the BUNDLE source too: pre-seed `pinBundleSourceId` with EVERY catalog
candidate's bundle at search time (one O(N) re-tile during the reveal, which is already a non-interactive
moment), so the bundle source is fully resident and a promote is ALWAYS opacity-only — no mid-gesture
bundle add, `gapBundle` structurally impossible. (Off-screen resident bundles are tile-culled ≈ free +
`iconIgnorePlacement` → no collision cost, exactly as the dot full-residency already does.) Lesser
fallback if the one-time full bundle pre-seed is too heavy: explicitly TRACK promoted-but-unmounted
markers and flush their bundle adds in a single non-retain settle pass (guaranteed, not best-effort).

---

## Summary of the ideal cut-overs
- #9: split the one shared pin obstacle into a label-core obstacle (priority > labels) and a full-body
  dot obstacle (labels > it > dots). Pure style change.
- #10: move label membership gating from JS (stale native-visible round-trip) to NATIVE (it already owns
  promotion + on-screen); JS supplies label content only. Deletes the race.
- #C: guarantee true full residency — every catalog candidate's bundle mounted before LOD can promote it,
  with a tracked settle-flush — so promote is always opacity-only and bundle-missing is impossible.
