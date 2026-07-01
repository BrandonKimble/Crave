# Pin -> ViewAnnotation Migration Architecture

## Decision summary

Migrate the <=30 promoted pins off the tiled GL `restaurant-pin-single-symbol-layer` (search-map.tsx:386) + `restaurant-pin-shared-shadow-layer` (search-map.tsx:371) onto a **self-owned `PinOverlayView` UIView holding pooled per-pin `CALayer`-backed tiles, positioned by per-frame `mapboxMap.point(for:)` projection on the existing LodEngine CADisplayLink** — NOT the Mapbox `ViewAnnotationManager`. This is the **performance proposal's spine** (single own-clock pass = project + opacity + z-order, no SDK collider, no second positioning signal, no `bringSubviewToFront` churn), grafted with the **correctness proposal's lifecycle/parity rigor** (per-instance ownership keyed by `(mapTag, markerKey)`, demoting-residual latched on the *delivered* `pinOpacity==0` write + `engine.wants(key)==false`, single-clock presentation multiply as the default, async tap-resolve integration) and the **minimal proposal's seam discipline** (the only engine change is the write target inside `applyV5OpacityWrites`; `LodEngine` stays byte-intact). The decisive reason to reject Mapbox VA: I re-verified that `ViewAnnotationManager.placeAnnotations` calls `containerView.bringSubviewToFront(view)` **per annotation on every GL-Native positions pass** (ViewAnnotationManager.swift:404) and that with `allowOverlap=true` "the ordering of the views are determined by the order of their addition" (ViewAnnotationOptions.swift:32; class doc line 48: "Z-index is based on addition order") — there is **no per-frame screen-Y z-lever in the VA SDK**, and the SDK re-applies its own subview order each pass, so any manual resort is fought every frame. A self-owned overlay sidesteps this entirely: sibling `CALayer.zPosition` under one superlayer gives exact continuous viewport-y ordering with zero SDK interference. The wiggle dies because position comes from `point(for: coordinate)` every frame (no geojson-vt tile, no re-quantization) — structurally, at any zoom.

> **Naming note:** despite the title "ViewAnnotation Migration," the chosen substrate is a **hand-built overlay that mirrors `ViewAnnotationsContainer`'s hitTest passthrough**, not the Mapbox VA API. This is deliberate and load-bearing (see Z-order). The VA *concept* (UIView bound to a coordinate, above GL, frame-only positioning) is preserved; the VA *manager* is not used.

---

## Components

### `PinOverlayView.swift` (NEW — `apps/mobile/ios/cravesearch/`)
- **Responsibility:** one passthrough `UIView` per map instance, inserted as a sibling directly above `handle.mapView` (so it tracks the MapView's frame and sits above all GL content, matching where VAs would live). Hosts all pin tile views as direct subviews under its single `layer`. Owns the pool.
- **Key types / API:**
  - `override func hitTest(_:with:) -> UIView?` — **exact mirror of `ViewAnnotationsContainer.hitTest` (ViewAnnotationsContainer.swift:13-16):** `let v = super.hitTest(...); return v == self ? nil : v`. Returns nil for empty areas so map pan/zoom pass through; returns the hit tile otherwise. **Verified** this is the correct passthrough idiom.
  - `func setSubviewsOrderedByScreenY()` — not needed for compositing (zPosition handles that) but kept available for hit-test ordering (see Z-order).
  - `userInteractionEnabled = true`, `clipsToBounds = false`, `layer.masksToBounds = false`, **no `shouldRasterize`** (would flatten and ignore zPosition).

### `PinTileView.swift` (NEW — nested or sibling file)
- **Responsibility:** one reusable per-pin view. `CALayer` tree built **once**, rebound on reuse:
  - `bodyLayer: CALayer` — `contents` = the `(bucket,rank)` badge `CGImage`, `anchorPoint=(0.5,1.0)` (tip at bottom-center → tip lands on the projected coordinate), `contentsScale = UIScreen.main.scale`, bounds = 28pt box.
  - `shadowLayer: CALayer` — `contents` = `restaurant-pin-shadow` `CGImage`, `anchorPoint=(0.5,1.0)`, constant screen-space offset `(0, +STYLE_PINS_SHADOW_TRANSLATE.y)` below the tip, sized `PIN_MARKER_RENDER_SIZE/98` (search-map.tsx:198), composited **below** bodyLayer.
  - **Both layers are children of `tileView.layer`; `tileView.layer.zPosition` is the per-frame viewport-y sort key.**
- **Key API:** `configure(markerKey:restaurantId:badgeCGImage:activeCGImage:)`, `setHighlighted(_:)` (swaps bodyLayer.contents body↔active), `setCombinedOpacity(_:)` (body & shadow), `setScreenPoint(_:)`, `reset()` (clear contents, opacity 0, transform identity, highlight false). Implements `point(inside:)` override to expand the hit area to `PIN_TAP_INTENT_RADIUS_PX` (= `PIN_MARKER_RENDER_SIZE/2`, search-map.tsx:1166) with `PIN_INTERACTION_CENTER_SHIFT_Y_PX` (search-map.tsx:1165) for tap-geometry parity.

### `PinOverlayController` slice (NEW methods in `SearchMapRenderController.swift`)
- **Responsibility:** **per-instance** state, keyed alongside the existing instance/handle maps. Holds `[instanceId: PinOverlayInstance]` where `PinOverlayInstance = { overlayView, slotsByMarkerKey: [String: PinTileView], freePool: [PinTileView], cgImageCache: [String: CGImage] }`.
- **Key methods:**
  - `syncOverlayRoster(instanceId:promotedInOrder:anchorsByKey:)` — lifecycle reconcile (create/recycle).
  - `applyOverlayOpacities(instanceId:writes:presentationOpacity:)` — opacity write.
  - `projectOverlayPositions(instanceId:handle:)` — **unconditional per-frame** position + zPosition pass.
  - `applyOverlayHighlight(instanceId:highlightedKeys:highlightedRestaurantId:)`.
  - `overlayHitTest(instanceId:point:) -> (markerKey, restaurantId, coordinate)?` — front-to-back probe for tap.
  - `teardownOverlay(instanceId:)`.

### `PinSpriteCatalog` (NEW — native sprite bridge)
- **Responsibility:** resolve sprite ids → `CGImage` **lazily** for the <=~34 in-roster ids only. Mirrors `rankBadgeImageId`/`activeRankBadgeImageId`/`plainBucketImageId` (quality-color.ts:91-109, search-map.tsx:130).
- **CRITICAL (reviewer mustFix):** PIN_BADGE_IMAGES are RN Metro asset modules, not loose bundle PNGs — `[UIImage(named:)]`-by-filename will fail in release builds. The catalog must receive a **native `[imageId: UIImage]` table delivered over the bridge** (resolving the RN asset refs the JS side already imports), then decode-to-`CGImage` on demand. **Asset count is ~1100 `pin-rank-b{0..9}-{1..99|overflow}` + ~100 `pin-rank-active-*` + 10 `pin-b{0..9}` + shadow** (the "369" figure from two proposals is wrong; verify the real matrix). Lazy decode keeps memory bounded.

### Seam edits in `SearchMapRenderController.swift`
- `applyV5OpacityWrites` (7721-7778): branch on `pinSubstrate` flag — in `.overlay` mode route pinOpacity to `applyOverlayOpacities`, **skip** the pin + shared-shadow `setFeatureState` writes (dot + label writes unchanged).
- New **unconditional** per-frame projection pass added to the live-pin display-link handler (see Z-order/Opacity).
- `decide` drive site (~10461): after `engine.decide`, call `syncOverlayRoster(promoted, anchorsByKey:)`.
- `applyHighlightedMarkerState` (7986-8040): keep the dot/label `setFeatureState` loop; append `applyOverlayHighlight`.
- `resolveRenderedPressTarget` (3289 pin branch): prepend `overlayHitTest` as the first pin-priority probe (see Tap).
- `invalidate`/`removeInstance` cleanup: wire `teardownOverlay` **before** the MapView/container is torn down.

### `PinSubstrate` flag (NEW — `enum { gl, overlay }` on `InstanceState`, plus a Step-1 `overlayMirrorsGl: Bool` sub-flag)

---

## Opacity & crossfade

**The brain stays byte-intact.** `LodEngine.decide`/`step`/`Fade`/`takeSettledRoleChangeIfAny`/`pinOpacity`/`wants`/`lastPromotedInOrder` are untouched — they operate on pure scalars and emit `[(markerKey, pinOpacity)]` with zero Mapbox coupling. The **only** change is the write target.

**Today (GL):** `applyV5OpacityWrites` (7721-7763), per `(markerKey, pinOpacity)`: `let p = clamp(pinOpacity, 0, 1)`; `setFeatureState(pinPhysicalSourceId, markerKey, [nativeLodOpacity: p, nativeLodRankOpacity: p])`. The GL expression `iconOpacity: ['*', presentation, lod]` (search-map.tsx:2664) does the multiply on the GPU.

**After (overlay):** at the same call site, in `.overlay` mode:
```
let p = clamp(pinOpacity, 0, 1)
let presentation = state.currentPresentationOpacityValue   // per-instance scalar, 8090/8191
let combined = Float(p * presentation)
CATransaction.begin(); CATransaction.setDisableActions(true)
tile.bodyLayer.opacity = combined
tile.shadowLayer.opacity = combined * Float(STYLE_PINS_SHADOW_OPACITY)  // 0.65, search-map.tsx:190
CATransaction.commit()
```
`setDisableActions(true)` defeats CALayer's implicit 0.25s opacity animation, so `layer.opacity` exactly equals the engine's wall-clock projection each tick — **the engine's `Fade` IS the animation curve**, never CA's.

**Clock — the single decisive correctness fix (resolves the cross-proposal "same clock" error).** There are genuinely **two CADisplayLinks**: the per-controller main link that steps presentation, and the per-instance converge link that steps LOD. Two independent failure modes were surfaced by reviewers and are resolved here:

1. **`engine.step()` returns `[]` for LOD-stable pins** and `applyV5StepFeatureStates` early-returns on empty writes (7687). During a reveal/dismiss, resident promoted pins are NOT in motion → the LOD path never re-pushes their opacity. **Fix:** the presentation stepper, when `pinSubstrate == .overlay`, must **re-multiply `engine.pinOpacity(key) * presentation` into EVERY resident tile each presentation tick** (read `pinOpacity` via the public accessor; it returns the settled value for resident keys), in addition to updating `state.currentPresentationOpacityValue`.

2. **Dismiss cancels the LOD link** (`applyLivePinTransitionFeatureStates` → `cancelLivePinTransitionAnimation`, 7919-7921). If the LOD link were the sole VA writer, pins would snap off on dismiss (a flash). Because (1) makes the **presentation stepper** the writer-of-record for resident-but-LOD-stable pins, the dismiss fade (presentation→0) drives every tile's opacity to 0 cleanly before `removeAll`. **No flash.**

**Adopt the "airtight single-clock" option as the DEFAULT, not a contingency:** fold the presentation scalar into the LOD step tick by having `applyV5StepFeatureStates` recompute presentation from its animator's start/duration on the step clock **when there ARE writes**, AND keep the presentation stepper's own per-tile re-multiply for the no-LOD-motion case. Net: every tile gets `pinOpacity * presentation` with at most one tick (8-16ms) of skew — identical to today's two-independent-feature-state-writers timing, so no regression. Both inputs always compose multiplicatively, exactly replicating the GL `['*', ...]`.

**Demoting residual:** engine keeps a demoted key in `motion`/`fades` emitting `pinOpacity→0` for the full 180ms; `applyOverlayOpacities` drives that tile 1→0 on the engine clock — pixel-identical to the GL fade — and the tile is recycled only after the 0-settle (see Lifecycle).

---

## Z-order

**Strategy:** replicate `symbolZOrder: 'viewport-y'` (search-map.tsx:2622; lower-on-screen draws in front) via **`CALayer.zPosition` on sibling tile layers under the one `PinOverlayView.layer`**, set in the **same unconditional per-frame pass** that projects positions.

**Per-frame pass (unconditional — runs every display-link tick regardless of `engine.step` motion):**
```
for each resident tile:
  let sp = handle.mapView.mapboxMap.point(for: coordinate)   // MapboxMap.swift:809, VERIFIED public
  guard sp is finite (reuse computeOnScreenMarkerKeys behind-camera/NaN guard, 10345)
  tile.layer.position = sp                                    // bottom-center anchor → tip on coord
  tile.layer.zPosition = CGFloat(sp.y)                        // larger y = lower = front = correct
```
All tile layers are siblings under a single non-flattening superlayer → CoreAnimation honors `zPosition` for compositing **regardless of subview-array index**, with no re-add/remove and no layout pass. This is a UIKit/CA fact (not a Mapbox one) and is the **single Step-1 on-device validation item** flagged below.

**Hit-test order** (separate from compositing): UIView `hitTest` walks subviews back-to-front by **array order**, which `zPosition` does NOT affect. So after the position pass, when residency or screen-Y order changes, also reorder the actual subviews ascending-by-screenY (`overlayView` brings each tile to front in screen-Y order) so the **frontmost-composited (largest y) pin is also last in the subview array = hit first**. Because we own the container (no SDK `bringSubviewToFront` fighting us — the whole reason for rejecting the VA manager), this resort is authoritative and never overwritten. Skip the subview resort on ticks where neither residency nor relative screen-Y order changed (cache last order) to avoid waste.

**Forced/selected bias:** a highlighted pin gets `zPosition += FORCED_Z_BIAS` (e.g. +100000) and is brought to the front of the subview array, so a selected pin floats above neighbors (GL emphasis parity).

**Shadow z:** shadow is a sublayer of its own tile, composited below that tile's body, and the whole tile composites as one unit at the tile's zPosition. **Known deviation from GL:** GL draws ALL shadows in one shared layer *under* ALL bodies; here a nearer pin's shadow can draw over a farther pin's body. **Decision: accept this** — under dense overlap it is visually negligible and the wiggle/perf win dominates. If a Step-4 pixel-compare shows it objectionable, render shadows in a separate sub-plane (a second container layer below the body container, both sorted by the same screenY) — specified as the fallback, not the default.

**Per-frame cost:** 30× `point(for:)` (cheap matrix transform) + 30 `position`/`zPosition` scalar writes + an occasional 30-element subview resort. Well under 0.1ms against 16.6ms. GATE-A already proved 30 views hold 60fps; re-measure with this full write load before deleting GL (open question).

**API basis (re-verified):** `mapboxMap.point(for:)` is public (MapboxMap.swift:809). The VA SDK's z-levers (`priority`, ViewAnnotation.swift:117-130; addition-order under `allowOverlap`, ViewAnnotationOptions.swift:32) are **explicitly not used** — they cannot express continuous per-frame screen-Y and the manager re-applies its own order every pass (ViewAnnotationManager.swift:404). Self-owned `zPosition` is strictly better and is the reason for the overlay substrate.

---

## Tap, highlight & press

**Tap detection — extend the EXISTING press lifecycle, do NOT add per-view tap recognizers as the primary path.** Keep the single `NativePressLifecycleGestureRecognizer` on the MapView (188-272) so the two-phase began→moved(cancel >`nativePressCancelMovementThresholdPx` 10px, 10245)→ended bridge and sequence dedup are reused verbatim. In `resolveRenderedPressTarget` (called at press-began, 10183), **prepend `overlayHitTest(point)` as the first pin-priority probe**, before the label (3256) and dot (3229) `queryRenderedFeatures` probes — preserving pin>label>dot priority. `overlayHitTest` iterates resident tiles **front-to-back (largest screenY first, matching draw order)**, expands each hitbox to `PIN_TAP_INTENT_RADIUS_PX` with `PIN_INTERACTION_CENTER_SHIFT_Y_PX` via `point(inside:)`, **ignores tiles with combined opacity <= 0.5** (a fading/demoting ghost is visually a dot, not tappable), and returns the first hit.

**Async-chain integration (reviewer mustFix):** `resolveRenderedPressTarget` is callback-based (the three `queryRenderedFeatures` completions, 10209). `overlayHitTest` is **synchronous** — so it resolves immediately and short-circuits the async chain when it hits, stashing `resolvedTarget` on the session and skipping the GL queries entirely (one resolution, no double-resolve). When it misses, fall through to the existing label/dot async queries unchanged.

**Event contract (reviewer mustFix — correct field name):** on resolve, emit the **same** `native_press_target_resolved` event via the existing `buildRenderedPinPressTarget`/emit path; the target dict uses **`targetKind: 'pin'`** (SearchMapRenderController.swift:9172-9176), **not `kind`** — the JS reader (search-map.tsx:1624 → `commitRestaurantPressTarget` 1567 → `onMarkerPress` → `profileCommandPort.openProfileFromMarker`) reads `event.target.targetKind`. JS routing is byte-identical; restaurant detail opens exactly as today.

**Gesture arbitration:** `PinOverlayView.hitTest` returns nil for empty areas (verified passthrough idiom) so map pan/zoom recognizers on the MapView still fire; a touch landing on a tile is consumed by the press lifecycle. A touch that starts on a pin but becomes a pan still pans (the 10px cancel threshold in the press session releases the resolve and the pan recognizer takes over). No per-tile `UITapGestureRecognizer` competes with the map pan recognizer because there is none.

**Highlight:** `applyHighlightedMarkerState` (7986) keeps writing `nativeHighlighted` feature-state for dot+label sources (unchanged — harmless for pins). Append `applyOverlayHighlight(highlightedMarkerKeys, highlightedRestaurantId)`: for each resident tile, `setHighlighted(keys.contains(tile.markerKey) || tile.restaurantId == highlightedRestaurantId)`, swapping bodyLayer.contents from `rankBadgeImageId(score,rank)` to `activeRankBadgeImageId(rank)` (active #ff3368, same rank number) — exact parity with the GL `case` expression (search-map.tsx:2627-2634), including iterating the multi-key Set. Forced-promotion is unchanged: `highlight_change` clears `lastVisibleMarkerSetSignature` → re-decide → engine promotes the tapped key via `forcedKeys` (10460) → `syncOverlayRoster` creates its tile → it fades in. Navigation stays decoupled from highlight (both keyed off `restaurantId`, independent).

**Press feedback:** today there is **none** for pins. Ship Steps 1-5 with none (exact parity). Optional later polish: `touchesBegan` → `tile.layer` scale 0.92 with anchorPoint at the tip, `touchesEnded` → identity, inside a short CATransaction — **never touch `layer.opacity`** (engine-owned). Additive, off by default; confirm with owner before adding.

---

## Geometry

**Anchor / tip-on-coordinate:** `bodyLayer.anchorPoint = (0.5, 1.0)` and `tile.layer.position = point(for: coordinate)` → the layer's bottom-center sits exactly on the projected coordinate, pixel-exact every frame, matching GL `iconAnchor: 'bottom'` (search-map.tsx:2661). No anchor competition, no SDK frame math (we own the layer position directly — sidestepping the VA `systemLayoutSizeFitting` measurement path, ViewAnnotation.swift:376-385, which the correctness reviewer correctly flagged as a zero-size risk for the VA approach; irrelevant here because we set layer bounds explicitly).

**Coordinate source:** the native candidate catalog (`setCandidateCatalog`, struct ~550; `CandidateCatalogEntry`/`LodEngine.Anchor.coordinate`, public `let`). **Verified independent of the GL pin layer** — deleting `PIN_SINGLE_SYMBOL_LAYER_ID` does not affect projection. Updated per result set in `syncOverlayRoster`.

**Icon variant (reviewer mustFix — native data channel):** native must pick the bucket from `craveScore`, which `CandidateCatalogEntry`/`Anchor` do **not** carry today (only `{markerKey, coordinate, rank}`). **Add a data channel:** extend the candidate-catalog payload (`setCandidateCatalog`, ~1355-1372) with the **resolved `badgeImageId` and `activeBadgeImageId` strings per marker** (JS already computes them at use-direct-search-map-source-controller.ts:1864-1867 — pass them through rather than re-deriving score natively). This also handles **live rank changes** (reviewer mustFix): when a pin's rank shifts during pan without a promote/demote, JS re-emits the catalog entry with the new `badgeImageId`; `syncOverlayRoster` detects the changed id on an existing slot and calls `configure` to swap `bodyLayer.contents`. No stale rank numbers.

**View size:** `bodyLayer.bounds` = 28pt box (`PIN_MARKER_RENDER_SIZE`, search-map.tsx:59-61), `contentsScale = UIScreen.main.scale`, same @3x generated PNG → 1:1 pixel parity with GL `icon-size:1`. Set per-device `contentsScale` for two-sim @3x parity.

**Shadow:** `shadowLayer` is a tile sublayer at constant screen offset `(0, +STYLE_PINS_SHADOW_TRANSLATE.y)` where `STYLE_PINS_SHADOW_TRANSLATE = [0, 1.25 + 18*(28/98)]` (search-map.tsx:190-194), sized `PIN_MARKER_RENDER_SIZE/98` (search-map.tsx:198), opacity `combined * 0.65`. Because GL uses `iconTranslateAnchor: 'viewport'` (screen-space offset, search-map.tsx:1264) and overlay tiles are screen-axis-aligned, a **constant point offset IS a viewport offset** — it rides the tile and moves with the camera automatically, exact parity, no per-frame shadow math. (Verify the map never pitches/rotates — open question; if it does, project two points or convert. Crave's search map appears north-up/unpitched.)

---

## Lifecycle

**Roster authority** = `engine.lastPromotedInOrder` (public, the promote set) **∪ locally-tracked still-fading slots** (demoting stragglers). Driven by `syncOverlayRoster` right after `engine.decide` (~10461), idempotent.

**CRITICAL (reviewer mustFix — do NOT read private engine internals):** `engine.motion`/`fades` are **private** (LodEngine.swift). A settled key is dropped from `motion` and `step()` stops emitting for it (line 184). So the demoting set is tracked **controller-side**, not by querying the engine: a slot enters "demoting" when it leaves `lastPromotedInOrder`; removal is latched on **(the last `(markerKey, pinOpacity)` write actually delivered to `applyOverlayOpacities` had `pinOpacity <= 0.001`) AND `engine.wants(key) == false`** (`wants` is public, line 196). This is airtight: the fade is driven to 0 by the delivered writes, then removed.

**Create / pool / reuse:** for each desired-resident key with no slot — take a `PinTileView` from `freePool` (alloc only if empty; cap at budget+headroom ~34 to cover `budget + |forcedKeys|`, reviewer-noted >30 case), `configure(...)`, set `bodyLayer.opacity = 0` (engine fade ramps 0→1 → **no add-flash**, mirroring the v5 seed fix at 7691-7758), add as `overlayView` subview. For an existing slot whose key persists: update coordinate if changed; update `badgeImageId` if rank shifted (live re-sprite).

**Remove / recycle:** when the demoting-latch fires, recycle the tile (`reset()` → freePool); it is NOT deallocated. Views are never destroyed mid-session (matches "VAs don't reuse views" reality but we add our own pool so zero per-frame allocations during pan). **No leak:** every alloc'd tile is either resident (added) or pooled (removed from superview); pool bounded.

**`setRanking` / new search:** the engine prunes vanished keys from `fades`/`want` immediately. **Reviewer-flagged regression:** for those keys `engine.pinOpacity` drops to 0 at once → a tile would *pop*, not fade. **Decision:** accept the pop for new-search (the whole map is being replaced; the result-engine's gapless transition covers it) OR, if owner wants a fade, hold a controller-side 180ms fade for vanished keys before recycle. Default: **document the pop**; revisit only if it reads badly on device.

**Dismiss / teardown:** on `isVisualSourceInactiveOrDismissing` (same guards at 7919/7992), the **presentation stepper** drives every resident tile's opacity to 0 over the dismiss (per the Opacity section — this is why the presentation stepper, not the cancelled LOD link, owns resident-pin opacity). On terminal hidden / instance teardown: `teardownOverlay` removes all tiles, empties the pool, drops refs, and **`overlayView.removeFromSuperview()`** — wired into the existing per-instance cleanup (`cancelLivePinTransitionAnimation`/`removeInstance`/`invalidate` 887-903) so the overlay is torn down **before** the MapView, no orphaned views.

**Multi-instance (reviewer mustFix):** all overlay state is **per-`instanceId`** (`[instanceId: PinOverlayInstance]`), the overlay view is created from the **correct `ResolvedMapHandle.mapView`**, and slots are keyed by `(instanceId, markerKey)`. No shared singleton.

**Coexistence during cutover:** see Cutover Step 1-2 (GL pins stay mounted, opacity-mirrored then zeroed, deleted only at Step 6).

---

## What stays untouched

- **Dots (~500): the colliding `restaurant-dot-layer` GL `SymbolLayer`** — its collision (`allowOverlap`/`ignorePlacement`) suppresses basemap street labels = load-bearing. Untouched. Its `setFeatureState` `nativeLodOpacity` writes (the `1-p` channel) in `applyV5OpacityWrites` stay exactly as today.
- **Labels: GL `SymbolLayer`** — live collision during gestures, basemap suppression, Option-A stacked-label mutex. Untouched.
- **LEA refined-membership-literal + lagged-literal flicker fix** — stays for `restaurant-dot-layer` + label layers (reparse-immune crossfade on the tiled substrate). **Drop only the two pin entries** (`restaurant-pin-single-symbol-layer`, `restaurant-pin-shared-shadow-layer`) from `updateLeaMembershipLiterals` (7796-7799) at Step 6 — the overlay is non-tiled so it has no reparse to defend against; **keep `restaurant-dot-layer` + labels in that swap.**
- **The invisible pin-collision OBSTACLE source** (`labelCollisionSource` / `PIN_COLLISION_OBSTACLE_GEOMETRY`, search-map.tsx:152-181; reseeded during motion at ~10589) — **stays GL, fed from `engine.lastPromotedInOrder`** so labels/dots still yield to promoted pins. It is non-rendered (no visible wiggle). **BUT** it is still tiled: see Risks for the residual label-axis wiggle check.
- **`LodEngine` (`MapLodKit/Sources/MapLodKit/LodEngine.swift`)** — byte-intact.

---

## Cutover sequence

**STEP 1 — RENDER OVERLAY + PROVE ZERO-WIGGLE (the make-or-break gate; GL still authoritative).**
Build `PinOverlayView` + `PinTileView` + `PinSpriteCatalog` + the candidate-catalog `badgeImageId` channel. Ship behind `pinSubstrate=.overlay`, `overlayMirrorsGl=true`: overlay tiles are created/positioned for the engine's promoted set and their combined opacity is set to the **same `p*presentation` the GL path computes** (read `engine.pinOpacity(key)` + presentation in the unconditional projection pass), while the **GL pin + shadow layers STILL PAINT unchanged**. On screen: GL pin + overlay pin co-located. **No tap/z-resort/shadow port yet** (flat zPosition acceptable here, single body layer; or include shadow if trivial). Drive the zoom-out jitter repro (`maestro/perf/flows/search-map-jitter-swipe.yaml` + `crave://perf-scenario-command?action=set_map_camera` deep links) on **BOTH sims (7B0DD874 + Pro Max 8116E09B)**. **GATE:** via the `[lodev]` harness + screen recording, confirm the **GL pins wiggle on zoom-out (known) while the overlay pins do NOT** (they reposition by `point(for:)` every frame, no tiling). Also validate the unconditional projection pass holds 60fps with full write load. **If the overlay wiggles, STOP — the projection clock is wrong; fix before proceeding.** No GL deletion.

> **Harness measurability (reviewer mustFix):** in Step 1, the engine **keeps writing pin `nativeLodOpacity` feature-state in parallel** (telemetry-only) so `renderP`/`roleGap` (which read feature-state) stay valid through the gate. The parallel write is removed at Step 6 (and the harness pin metric repointed to overlay tile opacity then). CLAUDE.md mandates the harness as source of truth, so it must not go blind during the gate.

**STEP 2 — FLIP OPACITY AUTHORITY (GL invisible but resident).**
Set `overlayMirrorsGl=false`. `applyV5OpacityWrites` in `.overlay` mode skips the pin + shared-shadow `setFeatureState` writes and force-writes `nativeLodOpacity=0` to the GL pin/shadow **once** so they go fully transparent but the layers stay mounted (rollback-safe, no re-tile). Wire the **single-clock presentation multiply** (Opacity section) so reveal/dismiss/demote all compose correctly. **GATE (both sims):** promote/demote crossfade ~180ms, no flash, reveal/dismiss fades clean, demote fades then recycles.

**STEP 3 — Z-ORDER PORT.** Add per-frame `zPosition = screenY` + forced-z-bias + the hit-test subview resort. Validate stacking matches `viewport-y` (nearer-bottom in front) on a dense overlap during pan with rank shifts.

**STEP 4 — SHADOW PORT.** Add `shadowLayer` (viewport-anchored constant screen offset). Pixel-compare tip-on-coordinate + shadow-under-tip at multiple zooms vs a pre-migration screenshot. Decide on the shadow-z deviation (accept vs separate sub-plane).

**STEP 5 — TAP + HIGHLIGHT PORT.** Prepend `overlayHitTest` in `resolveRenderedPressTarget`; emit `targetKind:'pin'`; remove the pin branch (3289) of the GL query; append `applyOverlayHighlight`. Validate: tap opens detail identically; active sprite recolor; tapped-dot forced-promotes to a tile; pin>label>dot priority; dots/labels tap unchanged. **Gate the GL pin tap query OFF the moment `overlayHitTest` is live** (don't wait for Step 6) to avoid double-resolution. Two-sim.

**STEP 6 — DELETE GL PIN LAYERS.** Only after Steps 1-5 green on both sims: delete `PIN_SINGLE_SYMBOL_LAYER_ID` (search-map.tsx:386) + `PIN_SHARED_SHADOW_LAYER_ID` (371) + their style/expression/registration; remove the pin + shadow entries from `updateLeaMembershipLiterals` (7796-7799, **keep dot + labels**); remove the pin feature-state branch (incl. the Step-1 telemetry mirror) from `applyV5OpacityWrites`; repoint the harness pin metric to overlay opacity; delete the pin `queryRenderedFeatures` path. **Keep:** engine, dots GL + LEA, labels GL + collision/mutex, the invisible obstacle source (still fed from `lastPromotedInOrder`). The pin GL *source* may be slimmed to data-only or kept for the obstacle feed. **GATE:** full two-sim regression — wiggle (zoom-in AND zoom-out, extreme), crossfade, tap, highlight, z-order, shadow, dismiss-fade, no leaks (instrument pool size + live count), LEA/lagged-literal still operating for dots+labels.

**STEP 7 — Cleanup.** Remove the `overlayMirrorsGl` scaffolding and the `pinSubstrate` flag (overlay is the only path). Final two-sim regression.

---

## Pre-build API verifications

**Re-verified by me against Pods source (confirmed):**
- `mapView.viewAnnotations` is `public private(set)` (MapView.swift:44) — *not used* but confirms the manager is reachable; the overlay's "above all GL content" placement mirrors VA behavior (ViewAnnotation.swift:12).
- `mapboxMap.point(for: coordinate) -> CGPoint` is public (MapboxMap.swift:809); batch `points(for:)` at 820 — the per-frame projection lever exists.
- `ViewAnnotationsContainer.hitTest` returns nil for self (ViewAnnotationsContainer.swift:13-16) — the passthrough idiom `PinOverlayView` copies. **Confirmed correct.**
- Z-order reality: `placeAnnotations` calls `containerView.bringSubviewToFront` per annotation per positions pass (ViewAnnotationManager.swift:404); with `allowOverlap=true`, "ordering of the views are determined by the order of their addition" (ViewAnnotationOptions.swift:32); class doc "Z-index is based on addition order" (line 48). **Confirms the VA manager has no per-frame screen-Y z-lever → rejecting it is correct.**
- `place(with:)` writes only `view.frame`, `anchorCoordinate`, `anchorConfig`, `isHidden` — **never `alpha`/`layer.opacity`** (ViewAnnotation.swift:313-335); `ViewAnnotationOptions` has no opacity field. **Opacity-safety confirmed** (moot for the overlay, but validates owning `layer.opacity`).
- `AnnotatedFeature.geometry(_:)` takes a `GeometryConvertible` (AnnotatedFeature.swift:33) → correct form is `.geometry(Point(coord))`, **not** `.geometry(.point(Point(coord)))` (corrects the correctness proposal). Only relevant if the VA API is ever used.
- `ViewAnnotationAnchorConfig(anchor:.bottom, offsetX:0, offsetY:0)` valid (ViewAnnotationAnchorConfig.swift:10); offsetY positive = up. Only relevant if VA API used.
- VA size via `systemLayoutSizeFitting` (ViewAnnotation.swift:376-385) — **the overlay avoids this entirely** by setting `CALayer.bounds` directly (the correctness reviewer's zero-size risk does not apply).

**Must verify on-device before/early in coding (cannot confirm from source):**
1. **`CALayer.zPosition` reorders sibling tile layers under `PinOverlayView.layer` for compositing without re-adding subviews, given no `shouldRasterize`/flattening mask.** This is a CA fact, not Mapbox — **Step 1 on-device validation item.** If it fails (unlikely), fall back to subview-array reordering (which we fully own).
2. **`mapboxMap.point(for:)` cadence vs GL paint during fast pan.** Driven on the LOD/converge display link, it may lag GL dots by ≤1 frame, uniform across all 30 pins (not jittery). Measure against a recording in Step 1; if a visible drift appears, also project inside `onCameraChanged`/`onMapIdle`.
3. **`point(for:)` behavior for behind-camera/off-screen coords** — reuse the existing `computeOnScreenMarkerKeys` finiteness/behind-camera guard (10345) before positioning a tile (a NaN position mis-places/crashes a layer).
4. **Exact `state.currentPresentationOpacityValue` source** — read the presentation stepper body (8090/8191) to confirm the cached scalar is bit-identical to what the GL `nativePresentationOpacity` feature-state received, so the CPU multiply matches the old GPU multiply.
5. **`queryRenderedFeatures` on an `iconOpacity:0` GL pin layer during Step 1-2 coexistence** — empirically confirm it does/doesn't still return pins; gate the GL pin query OFF as soon as `overlayHitTest` is live regardless.
6. **Where to insert `PinOverlayView`** in the RN/MapView hierarchy (direct MapView subview vs RNMBX host sibling) so it tracks the MapView frame and doesn't clip against ornaments/attribution.
7. **Real sprite-id matrix + asset count** (~1100 rank + ~100 active + 10 bucket + shadow, NOT 369) and the native `[imageId: UIImage]` bridge resolving RN asset refs for release builds; add an init-time non-nil assert per in-roster id.

---

## Risks & open questions

- **Residual label-axis wiggle (the one real coverage gap).** The pins move off tiling, but the **invisible collision obstacle source stays tiled** and is reseeded during motion. If it re-quantizes on zoom-out like the pin source did, **promoted-pin name LABELS (which yield to it) could still shift on zoom-out** even though the pins don't. **Add a Step-1 validation item:** after overlay pins are live, zoom-out on a dense scene and confirm labels don't wiggle from obstacle re-quantization. If they do, the obstacle source needs the same non-tiled/extent-bump treatment, OR the "zero wiggle" claim is scoped to pins+labels-positions only (labels would still be GL-collided, which is acceptable per requirements). This is the honest boundary of the wiggle kill.
- **Two-display-link presentation skew** — mitigated by the single-clock-default design; validate during a simultaneous reveal+crossfade in Step 2 for any opacity beat.
- **`setRanking` pop** for new-search vanished keys (engine prunes the fade immediately) — accepted/documented by default; controller-side hold-fade available if owner objects.
- **Shadow-z deviation** under dense overlap (nested-per-tile vs GL shared-under-all) — accepted by default; separate sub-plane fallback specified.
- **VA-above-all-GL parity** — the overlay sits above GL dots/labels (same as VAs would). During Step-1 co-location the overlay pin draws over the GL label/dot; confirm on-device this matches the intended stack and doesn't regress label legibility (labels stay GL below the overlay; the LEA pin/label mutex still governs which labels show).
- **CGImage memory** — lazy-decode only in-roster ids (<=~34), cache by id; never pre-decode the full matrix.
- **Open: does the search map ever pitch/rotate?** If yes, the constant-offset shadow and `screenY` z-sort need rotation-aware handling. Confirm camera/gesture config before Step 4.
- **Open: GATE-A 60fps headroom** with the full Step-1-3 write load (project + opacity + zPosition + subview resort, worst-case budget+forced ~34 tiles) — re-measure on both sims before deleting GL.
- **Open: press-scale feedback** — add it (parity requirement mentions it) or strictly match today's none? Confirm with owner before Step 5.