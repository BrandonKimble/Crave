# 07 — VA-migration cleanup manifest (post pins→VA + labels→VA on Mapbox 11.26)

**Working state banked at `a9054e60`** (pins+labels→ViewAnnotation). This manifest is the deletion plan for everything that migration made dead. Produced by a 6-finder distributed audit (`wnl4ulrbw`), **conflict-resolved by cross-reference** — several finders wrongly flagged shared helpers as dead; the KEEP list below is authoritative and overrides any DELETE that collides with it.

**Discipline:** every DELETE was consumer-grepped by a finder. But the finders disagreed on a few shared helpers, so the **execution rule is: collapse the A/B flags first, then let the compiler prove deadness** — delete a chunk, build; if it fails to link, a "dead" item had a live consumer → restore it (it belongs on the KEEP list). The build is the final verifier.

---

## KEEP — do NOT delete (shared by live VA paths / other subsystems)

Two finders flagged some of these as dead; they are **live**:

- **Shared pin sprite/shadow:** `fixMislabeledPremultipliedAlpha`, `makePinShadowImage`, `cachedPinShadow`, `pinShadowBlur/FootprintScale/LiftUp/Tint/Alpha/CIContext` — used by `resolvePinVASprite`/`applyPinVASprite`.
- **Shared display link:** `ensureOverlayDisplayLink`, `cancelOverlayDisplayLink`, `handleOverlayDisplayLink`, `overlayDisplayLinks` — the VA alpha tick rides this (misnamed "overlay"; rename optional).
- **Shared helpers:** `resolveOverlayHighlightedKeys` (used by `applyPinVAHighlight`/`applyLabelVAHighlight`), `pinTapIntentRadiusPx`, `pinInteractionCenterShiftYPx` (used by `pinVAHitTest`).
- **All PinVA*/LabelVA* code:** `PinVAView`, `PinVAInstance`, `pinVAInstances`, `syncPinVARoster`, `refreshPinVAAlpha`, `pinVAHitTest`, `applyPinVAHighlight`, `teardownPinVA`, `resolvePinVASprite`, `applyPinVASprite`, `updatePinVAPriorities`, `pinVAEffectiveBadgeId`; `LabelVAView`, `HaloLabel`, `LabelVAInstance`, `labelVAInstances`, `syncLabelVARoster`, `refreshLabelVAAlpha`, `applyLabelVAHighlight`, `teardownLabelVA`, `labelVAAnchors`.
- **Dot LOD (still GL):** `__lea_lod__` literal + `swapLeaLiteral`/`replaceSentinelLiteral` for it + `commitSettledLeaAuthorityUnderCover`. Only `__lea_revealed__` (label winner) is dead.
- **LodEngine / MapLodKit** (untouched brain), the **dot GL SymbolLayer** + **DOT_PIN_COLLISION_STYLE** obstacle (dots yield to it), the **pin bundle source**, the **current-location puck**, the reveal/dismiss/presentation fade system, `withMapboxMap`, `clamp`, `isVisualSourceInactiveOrDismissing`, `lodLog`.
- **`setLabelRenderLayersVisible`** (the VA-off chokepoint — keep until the flag is removed), **`configureLabelObservation`** RPC entry (JS calls it — stub or coordinate JS removal), the **label press helpers** (`buildRenderedLabelPressTarget` etc. — fallback tap targets).
- **`restaurantName` on the catalog** (I just added it — the label VA needs it), the `stackRank` feature _property_ on label features (baked for diff-key stability; only the _computation_ is dead).

---

## DELETE — CA pin overlay (dead once `pinsUseViewAnnotation` is locked on)

All are the code AFTER the `if pinsUseViewAnnotation {…; return}` early-return, or CA-only helpers. `SearchMapRenderController.swift`:

- `PinOverlayView` class (82-87), `PinTileLayer` class (94-113), `PinOverlayInstance` class (8033-8051), `overlayInstances` (8052)
- `makeOverlayTileLayer` (8117-8122), `resolveOverlaySprite` (8125-8144), `configureTileSprite` (8195-8230), `overlayEffectiveBadgeId` (8406-8409)
- CA bodies (after the flag early-return): `syncOverlayRoster` (8238-8333), `refreshOverlayFrame` (8347-8375), `overlayHitTest` (8443-8466), `applyOverlayHighlight` (8427-8436), `teardownOverlay` (8471-8477)
- `overlayZAnchorSourceId` (if only CA uses it — grep)
- Debug logs: `[pinov] roster` (8328), `[pinov] tap HIT` (8460)

## DELETE — GL label stack (dead once `labelsUseViewAnnotation` is locked on)

`SearchMapRenderController.swift` — the observation/selector machinery:

- `scheduleLabelObservationRefresh` (9979-10035), `performLabelObservationRefresh` (10089-10236), `completeLabelObservationRefresh` (10037-10061), `retryLabelObservationRefreshIfPlacementPending` (10063-10087), `nextAdaptiveMovingLabelObservationDelay` (9958-9977)
- `commitRenderedLabelObservation` (9712-9836), `currentRenderedLabelObservationSnapshot` (9865-9876), `emptyRenderedLabelObservationResult` (10238-10253), `labelObservationEventPayload` (10255-10281), `renderedLabelCollisionContractFields` (10283-10336), `buildRenderedLabelObservation` (10338-10352), `parseRenderedLabelObservationFeature` (10466-10483), `labelCandidatePriority` (10356-10364)
- `applyLabelOneOfFourSelector` (10382-10440) + the **`__lea_revealed__`** literal writes/swaps (NOT `__lea_lod__`)
- `resetLabelObservationForDismissStart` (6698-6715) + the `labelObservation` state (`observationEnabled`, `movingAdaptiveRefreshMs`)
- Debug log: `[labelva] roster`; **strip the `[pinva] hitTest CALLED` diagnostic** (8627)
- **Verify then decide:** the label collision-twin (`labelPlacementQueryLayerIds`, `RESTAURANT_LABEL_COLLISION_TWIN_LAYER_ID`) — one finder said VA keeps it, but VA labels use `enableSymbolLayerCollision` not the twin; if only the (deleted) observation queried it, it's dead. **Grep after deleting the observation stack.**

## DELETE — GL label JS (`search-map.tsx` + `use-direct-search-map-source-controller.ts`)

- The 4-candidate label feature emit (`LABEL_CANDIDATES_IN_ORDER`, `nativeSlotFeatureKind=='label'` per-side features)
- The GL label layer style (`RESTAURANT_LABEL_LAYER_ID`, `restaurantLabelStyle*`, the `textAnchor`/`textOffset` `match` on `labelCandidate`, `nativeLabelSelectedExpression`)
- The label offset math (`labelRadial*`, `labelUpShift*`, `LABEL_RADIAL_OFFSET_EM`, `LABEL_MIN_*_GAP_PX`) — the resolved px now live in native `labelVAAnchors`; grep for other consumers first
- `configureLabelObservation` bridge call (once the native side is a no-op)

## DELETE — pre-upgrade leftovers (verified 0 live consumers)

- **LABEL_MUTEX family** (`search-map.tsx`): `LABEL_MUTEX_IMAGE_ID` + `<Images>` registration (587), `LABEL_MUTEX_ICON_OFFSET_EXPRESSION` (1062-1080), the const family (1039-1059), `LABEL_MUTEX_POINT` (187). Delete the offset expression FIRST (it's the keystone reader).
- **stackRank pipeline** (`use-direct-search-map-source-controller.ts` 973-996 pre-pass + the assignment) — computation dead (feeds only the dead mutex offset); **keep the feature property** (diff-key stability).
- **`nativePresentationOpacity`** (RETIRED per Swift comment) — the type field (`search-map.tsx:715`) + the `delete`/bake writes (`use-direct-...:913, 1029, 2060, 2099`). Keep its presence in `TRANSIENT_VISUAL_PROPERTY_KEYS` as a reparse safeguard.
- **`nativeLodRankOpacity`** — type field (712), the `delete` (910), the `search-map-source-store.ts` set entry (17) + type (26).
- Stale perf contract `maestro/perf/contracts/search-submit-visual-parity.json` — regenerate or retire (it references deleted symbols).

## DELETE — the A/B flags (LAST, after all the above is proven)

`pinsUseViewAnnotation` (8062) + `labelsUseViewAnnotation` (8084) + collapse all branch sites: `syncOverlayRoster`, `refreshOverlayFrame`, `overlayHitTest`, `applyOverlayHighlight`, `teardownOverlay` (pin), and the `if labelsUseViewAnnotation` gates + the `setLabelRenderLayersVisible` force-hide chokepoint. Collapse each to the VA path only. Then the CA/GL bodies are syntactically unreferenced → delete.

---

## SAFE EXECUTION SEQUENCE

Compiler-verified, one buildable step at a time:

1. **Pre-upgrade JS leftovers** (LABEL_MUTEX, stackRank comp, nativePresentationOpacity, nativeLodRankOpacity) — independent, low-risk, no native rebuild. `tsc` + bundle to verify.
2. **Strip debug logs** (`[pinva] hitTest CALLED`, and the `[pinov]`/`[labelva]` roster logs go with their subsystems).
3. **Collapse the pin A/B flag** → delete the CA pin overlay (classes + CA bodies + CA-only helpers). Build; if it fails to link, a "dead" helper was shared → restore + move to KEEP.
4. **Collapse the label A/B flag** → delete the GL label observation/selector stack + `__lea_revealed__`. Build.
5. **Delete the GL label JS** (4-candidate emit, layer style, offset math) + no-op `configureLabelObservation`. `tsc` + bundle + on-device.
6. **Rename** the misnamed "overlay" shared helpers (`ensureOverlayDisplayLink` → `ensurePinLabelVATick`, etc.) — optional polish.
7. **On-device smoke test** after each native step: pins/dots/labels/puck render + tap + collide, no regression.

## Risks

- Finder line numbers are from the current (post-commit) file; **re-grep the symbol** before deleting (numbers drift as you delete above).
- The label collision-twin's true deadness must be confirmed after the observation stack is gone.
- `configureLabelObservation` is a JS→native RPC — if JS still calls it, keep a no-op stub until the JS bridge call is removed (step 5), or JS throws.
- Do the flag collapse + its subsystem deletion in the SAME commit so the tree never has an orphaned branch.

Provenance: audit `wnl4ulrbw` (6 finders, findings recovered from transcripts after the synth agent's schema cap); working state `a9054e60`.
