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

---

## EXECUTION LOG (2026-07-04)

**DONE + committed:**

- **`3b26e86b`** — deleted the dead CA pin overlay (pins are ViewAnnotations). Collapsed the 5 overlay dispatchers to their VA siblings; deleted `PinOverlayView`/`PinTileLayer`/`PinOverlayInstance`/`overlayInstances`/`makeOverlayTileLayer`/`resolveOverlaySprite`/`configureTileSprite`/`overlayEffectiveBadgeId` + the `pinsUseViewAnnotation` flag. Kept the shared helpers (`fixMislabeledPremultipliedAlpha`, `makePinShadowImage`/`cachedPinShadow`, the display-link trio, `resolveOverlayHighlightedKeys`, pin-tap consts). `invalidate()` now tears down the VA instances; the toggle-settled `overlayTileCount`/`degraded` telemetry now reads the VA roster (the old CA read was always 0 → `degraded` spuriously true every reveal → a bogus `[PRESENTATION-WATCHDOG] DEGRADED` warn on every reveal, now gone). −314 lines, compiler-verified.
- **`28254183`** — deleted the dead `LABEL_MUTEX` family + `TRANSPARENT_PIXEL_IMAGE` + the `stackRank` pre-pass/property/type (zero consumers: the mutex layer was already gone; native never read `stackRank`). Added `restaurantName` to `SearchMapCandidateCatalogEntry` (the a9054e60 catalog write was missing the type field). tsc-clean.
- **`58d27180`** — deleted the GL label observation/selector stack (native) + neutralized the reveal gate. `isActiveFrameLabelPlacementReady` → `return true` (VA labels place synchronously). Deleted the observation refresh/selector block (`commitRenderedLabelObservation` … `applyLabelOneOfFourSelector` … `parseRenderedLabelObservationFeature`) + the `configureLabelObservation` RN RPC + the 7 external `scheduleLabelObservationRefresh`/`retry` call sites. Stripped the `__lea_revealed__` half of `commitSettledLeaAuthorityUnderCover` (kept `__lea_lod__` = live dot LOD). JS: guarded the `configureLabelObservation` wrapper so the removed RPC no-ops. Gated by a 5-surface adversarial sweep (`w033hkxxi`: reveal/dismiss/camera/dot-collision-LEA/js) that confirmed the reveal gate was the ONLY behavioral coupling. **ON-DEVICE VERIFIED** (iPhone 17 Pro, Maestro): search reveal starts (no deadlock/blank), VA labels + pins + dots render, dismiss + re-reveal clean, zero errors/forced-timeout/DEGRADED in the Metro log.
- **`2006de00`** — deleted the now-dead `__lea_revealed__` literal helpers (`readSentinelLiteralKeys`/`firstSentinelLiteralKeys`/`leaRevealedSentinel`) + the unreferenced `visibleDismissLabelFeatureIds`. Compiler-verified.

**REMAINING (all inert/dead — the observation is functionally gone + verified; these are polish, safe to do incrementally with re-verification):**

1. ~~Native dead-code (inert watchdog + observation state)~~ **DONE** — `e05224e7` (watchdog + `labelWinnerByInstance`/`labelObservationRefreshWorkItems`/`revealStartDeadlock*`/`prerollGate*` state + ~17 cleanup sites) + `26e8c45d` (the 4 trivially-true gate guards simplified away, `isActiveFrameLabelPlacementReady`/`labelPlacementReadinessSummary` deleted, `LabelFamilyObservationState` struct + field + `settledVisibleFeatureIds` + init + `revealPlacementGateForcedRequestKey` deleted). Compiler + on-device verified. **No `labelObservation` code remains in native.**
2. ~~JS observation config/apply/telemetry~~ **DONE** — `f997aef9` (−602 lines): render-owner `applyLabelObservationConfig` + 2 effects + config-apply machinery (`effectiveObservationEnabled`/`shouldObserve*`/`logLabelObservationConfig`/`buildLabelObservationConfigKey` + transaction/deferred refs) + `label_observation_updated` handler & switch-case + the `labelObservationEnabled`/`labelObservationConfig`/`onLabelObservationUpdated` props (types + destructures) + `SearchMapLabelObservationConfig`/`SearchMapNativeLabelObservationApplyStatus` types; search-map.tsx `resolveMapLabelObservationPolicy`/`labelObservationConfig` memo/`requestedNativeLabelObservationEnabled`/`labelObservationEnabled`/snapshot-refs/`clearLabelObservationSnapshotRefs` + effects/the perf-attribution `onLabelObservationUpdated` telemetry callback/`map_pin_label_observation_config_contract` emit; render-controller `configureLabelObservation` wrapper + method type + config type + `label_observation_updated` event type. tsc-clean, on-device verified (reveal/dismiss/re-reveal/pin-tap→open all clean). **Left a few unused-var lint WARNINGS** (non-blocking) that step 3 resolves: `LABEL_OBSERVATION_REFRESH_MS_IDLE/MOVING`, `areStringArraysEqual`, `visualReadyRequestKey`, `isResultsExitActive`, `presentationTelemetryPhase` (pure Group-A dead), plus `getLabelCandidateFromFeatureId`/`getMarkerKeyFromLabelFeatureId`/`shouldRenderLabels` (Group-B, resolved in step 3).
3. **JS GL label RENDER layer** (`search-map.tsx`) — `RESTAURANT_LABEL_LAYER_ID` + layer/style (`restaurantLabelStyle*`, `nativeLabelSelectedExpression`, the `__lea_revealed__` style expression, the `textAnchor`/`textOffset` `match`), `RESTAURANT_LABEL_COLLISION_TWIN_LAYER_ID` + layer, `LABEL_CANDIDATES_IN_ORDER`/`LabelCandidate`/`buildLabelCandidateFeatureId`/`getLabelCandidateFromFeatureId`/`getMarkerKeyFromLabelFeatureId`, the 4-candidate label feature emit in `buildDirectLabelStores`, the label offset math (`LABEL_RADIAL_OFFSET_EM`/`LABEL_MIN_*_GAP_PX`), `nativeLabelOpacity` prop. **KEEP the dot obstacle** (`RESTAURANT_LABEL_COLLISION_SOURCE_ID`/`labelCollisionSourceStore`/`DOT_PIN_COLLISION_STYLE`/`RESTAURANT_PIN_DOT_COLLISION_LAYER_ID`/`RESTAURANT_LABEL_PIN_COLLISION_LAYER_ID`/`promotedPinCollisionObstacleFilter`) — the collision SOURCE feeds both the (dead) twin AND the (live) dot obstacle; only delete the twin + render halves. Re-verify dot-vs-pin collision on-device after. **⚠️ NOT a clean cut — the LABEL-TAP dependency (resolve FIRST):** `LabelVAView.isUserInteractionEnabled = false` (SearchMapRenderController.swift ~:129) — VA labels do NOT self-tap; label taps resolve via a native hit-test (`labelTapHitbox` + `state.labelLayerIds`) where JS passes `labelLayerIds: labelVisualLayerIds = [RESTAURANT_LABEL_LAYER_ID]` (search-map.tsx ~:1941) to `configureNativePressTargeting` and `labelPlacementQueryLayerIds = [RESTAURANT_LABEL_COLLISION_TWIN_LAYER_ID]` at ~:2484 to `queryRenderedPressTarget`. Deleting the GL render + twin layers points those at nonexistent layers → label taps may break. BEFORE deleting: determine whether label taps actually resolve off `queryRenderedFeatures(labelLayerIds)` on the (visibility:none) render layer, or purely off `labelTapHitbox` GEOMETRY (in which case the layer-ids can go, but the hitbox path stays). Test: reveal → tap a restaurant-name LABEL (not the pin) → does the profile open? (2026-07-04: pin-tap→open verified working; a one-off `frame sync failed: unknown instance or frame` render error was seen once on a label tap at 57%,35% — untouched press-target/frame-sync path, likely a transient, but re-check when doing step 3.) Also delete the 5 Group-A unused-var leftovers listed in step 2.
4. **Collapse `labelsUseViewAnnotation`** (native, ~`:8019`) + `setLabelRenderLayersVisible`'s GL-hide — do LAST, together with step 3 (once the GL label render layer is gone, the force-hide is moot).

**Corrected file paths** (the manifest's were stale): `search-map.tsx` → `apps/mobile/src/screens/Search/components/search-map.tsx`; the source store → `apps/mobile/src/screens/Search/runtime/map/search-map-source-store.ts`.

**`nativePresentationOpacity` / `nativeLodRankOpacity` are NOT dead leftovers** — native WRITES them as feature-state (`nativeLodRankOpacity` at multiple sites; only `nativePresentationOpacity` is comment-marked RETIRED). Do not lump them into "pre-upgrade leftovers"; they belong to a careful substrate pass that verifies the GL opacity-expression coalesce.

### ⚠️ CRITICAL FINDING — the GL label observation is NOT passive; it drives the REVEAL GATE

The manifest (and the 6-finder audit) assumed the GL label observation stack was dead/passive telemetry. **It is not.** `isActiveFrameLabelPlacementReady(state:)` (≈ `SearchMapRenderController.swift:7008`) is the gate the SINGLE shared presentation-opacity reveal animation (pins+dots+labels) waits on. When `labelCount > 0` it returns true **only** when `observation.observationEnabled && observation.hasCommittedObservationForConfiguredRequest && observation.lastEffectiveRenderedFeatureCount > 0` — all set by the observation refresh. Delete the observation refresh naively and the gate never opens → **every reveal deadlocks at opacity ~0 (blank map) until the `armRevealStartDeadlockFallback` watchdog force-opens it after a timeout** → a laggy/janky reveal regression.

Callers/guards of the gate: `:5936, :6002, :6110, :6287, :6396, :10247, :10275` (+ the reveal-preroll re-arm at ≈`:6677` and the watchdog arm at ≈`:6695`).

**The correct deletion requires neutralizing the gate first:** with labels as ViewAnnotations they place synchronously (no async GL placement to observe), so `isActiveFrameLabelPlacementReady` should just `return true`. THEN the observation refresh + the `armRevealStartDeadlockFallback` watchdog + the whole placement-gate machinery become genuinely dead and deletable. **This is a reveal-CHOREOGRAPHY behavioral change** (the reveal no longer waits on GL-label placement) → it MUST be verified on-device (labels fade in synced with pins/dots, no flash, no deadlock, no watchdog-forced reveals) before committing. This was attempted 2026-07-04, reverted at the gate discovery to avoid shipping a blind reveal-timing change — per the ethos + the "verify this runtime machinery on-device, don't trust static reads" memory. Next session: do it WITH eyeball verification of the reveal.

### Complete native + JS deletion inventory (2-agent map, `ad1c7ccf` native + `a33aa230` JS)

**Native DELETE** (all in `SearchMapRenderController.swift`, re-grep — numbers drift): the observation block is contiguous `commitRenderedLabelObservation`→`parseRenderedLabelObservationFeature` (was 9398–10169 at HEAD `3b26e86b`); the RPC `configureLabelObservation(_ payload:...)` (was 3266–3309, `@objc`); `resetLabelObservationForDismissStart`; state `labelObservationRefreshWorkItems` (933) + `labelWinnerByInstance` (925) + the `labelObservation` sub-struct on `LabelFamilyObservationState`; the 7 external `scheduleLabelObservationRefresh`/`retry…` call sites the compiler flags. **KEEP:** `parseRenderedLabelCandidateFeatureId` (shared with the label press/tap hitbox at ≈`:10357`), `buildRenderedDotPressTarget`/the whole label+dot tap path, `labelCandidateString`, `featureIdentifierString`.

**Native surgical strip** (live reveal path — do NOT delete the function): `commitSettledLeaAuthorityUnderCover` (8628) — keep the `__lea_lod__` half (dots!, 8634–8639), strip only the `__lea_revealed__` half (8641–8670) + `readSentinelLiteralKeys`/`firstSentinelLiteralKeys` + `sentinelLiteralHeads` (debug) + the `leaRevealedSentinel` const. `swapLeaLiteral`/`replaceSentinelLiteral`/`updateLeaMembershipLiterals`/`setLayerPresentationOpacity`/`setLabelRenderLayersVisible`/`leaLodSentinel` all STAY (shared with the live dot LOD). Verify dots still LOD-fade on the `[lodev]` harness after this.

**JS DELETE** (observation config/apply/telemetry): `configureLabelObservation` (bridge def in `search-map-render-controller.ts:49,1044` + caller in `use-search-map-native-render-owner.ts` ≈1402); `onLabelObservationUpdated` (handler + the perf-attribution-only consumer in `search-map.tsx:1985`); `labelObservationEnabled`/`requestedNativeLabelObservationEnabled`/`labelObservationConfig` + `clearLabelObservationSnapshotRefs`/`visibleLabelFeatureIdListRef`/`didLogLabelVisibilityContractRef`; the config-apply machinery (`effectiveObservationEnabled`, `shouldObserve*`, `activeLabelObservationTransactionKeyRef`, `logLabelObservationConfig`, `native_label_observation_config_apply_contract`); `labelPlacementQueryLayerIds`; the `label_observation_updated` type + handler; the perf label-visibility telemetry block.

**JS DELETE** (GL label render): `RESTAURANT_LABEL_LAYER_ID` + layer/style (`restaurantLabelStyle*`, `nativeLabelSelectedExpression`, the `__lea_revealed__` style expression, the `textAnchor`/`textOffset` `match` on `labelCandidate`); `RESTAURANT_LABEL_COLLISION_TWIN_LAYER_ID` + layer; `LABEL_CANDIDATES_IN_ORDER`/`LabelCandidate`/`buildLabelCandidateFeatureId`/`getLabelCandidateFromFeatureId`/`getMarkerKeyFromLabelFeatureId`; the 4-candidate label feature emit inside `buildDirectLabelStores` (use-direct-…:≈997) — **keep the collision-feature emit**; the label offset math (`LABEL_RADIAL_OFFSET_EM`, `LABEL_MIN_*_GAP_PX`); `nativeLabelOpacity` prop + expression; `labelCandidate` prop.

**JS KEEP (dot obstacle — deleting breaks dot collision):** `RESTAURANT_LABEL_COLLISION_SOURCE_ID`, `labelCollisionSourceStore`, `DOT_PIN_COLLISION_STYLE`, `RESTAURANT_PIN_DOT_COLLISION_LAYER_ID`, `promotedPinCollisionObstacleFilter`, `nativeLodOpacity`. The collision SOURCE feeds BOTH the (dead) twin AND the (live) dot-obstacle layer; VA labels read their text from the candidate CATALOG (`restaurantName`), not the GL label source → the label source builder is deletable but its collision half is NOT.

**Corrected sequence:** (1) `isActiveFrameLabelPlacementReady` → `return true` + on-device reveal verify; (2) delete the observation refresh/selector block + RPC + reset + call sites + state (compiler-guided); (3) `commitSettled` `__lea_revealed__` strip + harness-verify dots; (4) JS observation config/apply/telemetry; (5) JS GL label render + 4-candidate emit (keep collision builder); (6) collapse `labelsUseViewAnnotation` + `setLabelRenderLayersVisible`; (7) full reveal/dismiss/zoom/tap on-device pass.
