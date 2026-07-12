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
- **RESOLVED + DELETED (2026-07-11):** the label collision-twin (`RESTAURANT_LABEL_COLLISION_TWIN_LAYER_ID`) was dead as an observable AND actively harmful: its 4-candidates-per-on-screen-restaurant invisible boxes culled dots in phantom label-sized groups (the dense-then-thin fade-in bug + the dismiss density pop). VA labels carry their own collision via `enableSymbolLayerCollision` at the placed side only. Deleted from search-map.tsx (layer JSX, dorm/wake list, const); on-device verified: flat post-reveal dot density, no dismiss pop, dots still yield under visible labels, basemap still suppressed.

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
   2b. ~~Label-tap dependency~~ **RESOLVED + FIXED** — `2ede3774`: label taps were BROKEN since the VA migration (a9054e60) — confirmed on-device (3 different labels opened nothing; pins worked). Cause: the tap path queried the GL collision-twin via `queryRenderedFeatures(labelLayerIds)`, but once labels became ViewAnnotations the twin's GL-collision placement no longer coincided with the SDK-placed (variableAnchors) label → the query at the tap point returned nothing. FIX: added `labelVAHitTest` (native, the label sibling of `pinVAHitTest`) — hit-tests each label VIEW's actual on-screen frame (`mapView.convert(view.bounds, from: view)`, small tolerance, smallest-box-wins, alpha-gated), wired into `resolveRenderedPressTarget` as **pin > label > dot** (the label VA hit replaces the GL label query; dots still query GL). On-device verified: tapping "Three Roosters" label opens its profile + highlights it. **This UNBLOCKS step 3 — the GL label render + twin + tap-query are now all fully dead + deletable.** (The one-off `frame sync failed: unknown instance or frame` seen earlier was a transient in the untouched press-target/frame-sync path — pin-tap + label-tap both verified clean after the fix.)

3. **JS GL label RENDER layer + native GL-label-tap path (now fully dead — labelVAHitTest replaced taps, VA replaced render).** Precise plan mapped by agent `a77afb03` (re-grep every anchor; some of its line numbers are stale + its step 14/15 reference already-deleted `__lea_revealed__`/`scheduleLabelObservationRefresh` — ignore those). It's ONE large coupled multi-file deletion (~30 JS + ~15 native edits); do JS-first (tsc) then native (compile), then a FULL on-device pass (labels render VA, label-tap opens profile, dots yield to pins, reveal/dismiss). **JS (`search-map.tsx`):** `renderSearchMapLabelLayers` + its render ShapeSource (the twin + render `SymbolLayer`s), `RESTAURANT_LABEL_LAYER_ID`/`RESTAURANT_LABEL_COLLISION_TWIN_LAYER_ID`/`RESTAURANT_LABEL_RENDER_SOURCE_ID` consts, `LABEL_FEATURE_FILTER`, the `labelLayerStyle` memo + its prop on `SearchMapMarkerScene` (type+destructure+eq+2 passes), `nativeLabelOpacityExpression`+`nativeLabelSelectedExpression`, the label offset math (`labelRadialXEm`/`labelRadialYEm`/`labelRadialTopEm`/`labelUpShiftEm` memos + `LABEL_RADIAL_OFFSET_EM` import + `LABEL_MIN_*_GAP_PX` + `LABEL_TAP_*` consts), `labelVisualLayerIds`+`labelPlacementQueryLayerIds`, the label-tap params (`labelTapHitbox`/`labelLayerIds`) threaded through `buildSearchMapInteractionRuntime`/`configureNativePressTargeting`/`queryRenderedPressTarget`, `buildLabelCandidateFeatureId`/`getLabelCandidateFromFeatureId`/`getMarkerKeyFromLabelFeatureId`/`LabelCandidate`, + the 5 Group-A unused-var leftovers. **JS (`use-direct-search-map-source-controller.ts`):** the 4-candidate label emit loop in the label-store builder + `LABEL_CANDIDATES_IN_ORDER` + `nativeLabelOpacity`/`labelCandidate` props — **KEEP the collision-feature emit** (1-per-pin, carries `nativeLodOpacity` → the dot obstacle). **Native (`SearchMapRenderController.swift`):** `queryLabelTarget` closure + `labelSourceIds` in `resolveRenderedPressTarget`; `buildRenderedLabelPressTarget`/`isRenderedLabelPressFeatureIntentional`/`parseRenderedLabelPressFeature`/`parseRenderedLabelCandidateFeatureId`/`labelCandidateString`/`buildRenderedLabelCandidateFeatureId`/`LabelTapHitboxConfig`/`parseLabelTapHitboxConfig`; the `labelLayerIds`/`labelTapHitbox`/`labelQueryRect` params on `resolveRenderedPressTarget`/`queryRenderedPressTarget`/`configureNativePressTargeting`; `setLabelRenderLayersVisible` + `labelsUseViewAnnotation` flag; `state.labelLayerIds`/`state.labelPlacementQueryLayerIds` + `configureNativeLayerGroups`'s label-layer handling + the `operationCount` reads; **in `updateLeaMembershipLiterals` delete the LABEL `__lea_lod__` text-opacity loop but KEEP the DOT `__lea_lod__` icon-opacity loop** (`restaurant-dot-layer` — dot LOD crossfade MUST survive) + drop its `labelLayerIds` param at both call sites. **KEEP** the collision source/dot obstacle (`RESTAURANT_LABEL_COLLISION_SOURCE_ID`/`labelCollisionSourceStore`/`DOT_PIN_COLLISION_STYLE`/`RESTAURANT_PIN_DOT_COLLISION_LAYER_ID`/`RESTAURANT_LABEL_PIN_COLLISION_LAYER_ID`/`promotedPinCollisionObstacleFilter`/`nativeLodOpacity`), all `LabelVA*`, `labelVAHitTest`, `labelCollisionLayerIds` (minus the twin). **ATTEMPTED + REVERTED 2026-07-04 — it is NOT low-risk; the full JS deletion PROVABLY BREAKS THE REVEAL.** See the ⚠️ block below for the exact mechanism. The whole JS cut (4 files, tsc-green + eslint-clean) was applied and driven on-device: the results **sheet** opened (JS side is fine) but the **map stayed at the home camera with zero markers + no auto-zoom** — the native reveal never fired. Reverting the JS restored a clean reveal (pins 14/16/18 + VA labels + dots + auto-zoom), proving the regression is entirely the JS label deletion. Reverted to `92669d3b` (clean). This cut must be redone WITH the native `labelRenderSourceId` removal in the same pass (below).

### ⚠️ CRITICAL FINDING #2 — deleting the GL label render source STARVES the reveal commit-fence (proven on-device 2026-07-04)

The manifest assumed the remaining GL-label code was "dead code operating on now-unmounted layers." **Wrong — `labelRenderSourceId` is a first-class member of the native visual-source set, and the reveal is gated on it committing.** Mechanism, proven by attribution:

- The reveal-enter is blocked by a **commit fence**: `capturePendingVisualSourceCommitFence(state:)` (≈`:2827`) → if `hasPendingCommitFence`, the enter is parked as `blockedEnterStartCommitFenceBySourceId` and logs `reveal_start_commit_fence_blocked`. The dismiss path has the twin fence (≈`:2909`).
- The fence is captured over `visualSourceIds(for:)` (≈`:8933`) = `[pinBundleSourceId, **labelRenderSourceId**, dotSourceId, labelCollisionSourceId]`.
- The GL label render source (`RESTAURANT_LABEL_RENDER_SOURCE_ID` in JS → `state.labelRenderSourceId` native) is one of those 4. Delete its JS emit/layer and the native still waits for that source's pending commit data to arrive — **it never does → the fence never clears → the reveal-enter is parked forever.** Symptom is exactly what we saw: JS opens the results sheet, but the native map never reveals (home camera, no markers, no auto-zoom).
- `labelRenderSourceId` is referenced ~30× across the frame pipeline (frame-sync, source admission, mutation tracking `mutationSummaryBySourceId`, `phaseSummary`, `sourceRevision`, `visualAndInteractionSourceIds`). This is NOT a leaf deletion.

**Prerequisite for the JS GL-label-render deletion:** the native must first stop treating `labelRenderSourceId` as a visual source. Concretely, in the SAME cut: drop `state.labelRenderSourceId` from `visualSourceIds`/`visualAndInteractionSourceIds` (≈`:8933`/`:8937`) + the commit-fence capture + `sourceRevision`/admission/mutation tracking, so the fence is captured over `[pinBundle, dot, labelCollision]` only. THEN the JS side (`renderSearchMapLabelLayers`, `RESTAURANT_LABEL_RENDER_SOURCE_ID`) can go. This makes the cut even more coupled than CRITICAL FINDING #1 — it touches the reveal's spine (the commit fence), so **every step needs on-device reveal verification** (reveal fires, markers render, auto-zoom, dismiss, re-reveal). Best done as its own focused pass, not a session-tail finish. Attempted 2026-07-04 JS-only → proven regression → reverted to `92669d3b`.

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

---

## ✅ FINAL RESOLUTION (2026-07-04) — peripheral dead code DONE; render-source cut is WON'T-FIX (twin is load-bearing)

Executed against the adversarially-verified plan (workflow `wd4ni1k0d`), step by buildable+device-verified step:

- **STEP 1 — `066689df`** — deleted the dead GL label-TAP query path (native + JS bridge). `resolveRenderedPressTarget` already resolves pin(`overlayHitTest`) > label(`labelVAHitTest`) > dot; the old GL `queryLabelTarget` closure had no call site. Removed it + `labelSourceIds` + the helper cluster (`buildRenderedLabelPressTarget`/`isRenderedLabelPressFeatureIntentional`/`parseRenderedLabelPressFeature`/`parse`+`buildRenderedLabelCandidateFeatureId`/`labelCandidateString`/`parseLabelTapHitboxConfig`/`LabelTapHitboxConfig`) + the label press params + `NativePressTargetConfig` label fields; JS dropped `labelLayerIds`/`labelTapHitbox` from the two bridge method types + the interaction-runtime hook + the `labelTapHitbox` memo + `LABEL_TAP_*` consts. KEPT `featureIdentifierString`, the dot press path, and the attach-channel `labelLayerIds`. **On-device verified** (reveal, label-tap opens profile via `labelVAHitTest`, no errors). −369 lines.
- **STEP 2 — `e0263db3`** — deleted the dead label TEXT-OPACITY writes (labels are VA → force-hidden GL render layers, so these were already visually inert). In `updateLeaMembershipLiterals`: dropped the `labelLayerIds` param + the label `text-opacity` `__lea_lod__` loop, KEPT the dot `icon-opacity` loop (`restaurant-dot-layer`); updated both callers. Deleted the label presentation-opacity write (KEPT the dot one) and the `applyV5OpacityWrites` label branch (`labelFamilyState`/`labelSourceState`/`labelPhysicalSourceId`/loop/`setFeatureState`/`sync`), KEPT pin+dot branches; deleted the orphaned `liveLabelFeatureState`. **On-device verified** (dot LOD crossfade + presentation fade intact: reveal fades dots in + promotes pins, dismiss fades out, repeatable). −45 lines.

- **STEP 3 (the render-source + fence cut) — BLOCKED / WON'T-FIX.** ⚠️ The manifest's premise — that the GL label render source + collision-TWIN are dead once labels are VA — is **FALSE**, proven on-device + confirmed by a second adversarial panel (workflow `wa04firzo`).
  - **Q0 finding (camera-controlled on-device A/B, pins pixel-aligned, reproducible 2/2 each way):** taking the twin (`RESTAURANT_LABEL_COLLISION_TWIN_LAYER_ID`, `textOpacity:0` + `textIgnorePlacement:false`, on the render source) OUT of placement makes basemap POI/street labels (**Strawberry Fields, W 59TH ST, W SIDE HWY**) + extra coverage dots reappear across the whole search area, far from any restaurant label. The twin provides **BROAD basemap + dot suppression** — a field of invisible name-width collision boxes at 4 candidate offsets per on-screen marker. The VA labels' `enableSymbolLayerCollision` only covers each PROMOTED label's own bbox (≤~30), so it does **NOT** replicate the twin's broad field. Suppressing basemap is the owner's stated principle ("our features win over basemap"), so the twin's behavior must be preserved.
  - **No clean replacement exists** (panel: all of a1/a2/b/c/d have confirmed high-confidence fatal flaws; only "keep the twin" survives). The twin's suppression = **4-candidate name-TEXT boxes**, and that machinery lives ONLY on the render source: the collision source emits ONE text-less feature per marker (`{markerKey, restaurantId, nativeLodOpacity, …}`, invariant `labelCount == collisionCount × 4` at `use-direct-…:711-713`); native commits it via the single-feature `buildScopedSingleFeatureFamilyApplyPlan` (not the multi-slot `buildDirectSlotApplyPlans`); `applyV5ObstacleReseed` strips it to `{markerKey, nativeLodOpacity}` on every promote/demote during camera motion; the `slotKind:"label"` stamp (`LABEL_FEATURE_FILTER`) is render-source-only. Hosting the twin on the kept collision source = **rebuilding the render source's entire multi-slot + slot-kind + reseed machinery there** (no net simplification) AND re-fattening collision features = re-earning the zoom-out **wiggle** the un-bundling killed. A fixed-size proxy box (a2) is geometrically broken (culls the marker's own coverage dot; can't match variable name width → basemap leaks in the exact gaps). A new source (b) must enter `visualSourceIds` to be fence-committed → re-introduces the exact coupling. Dots (c) can't reach dot-free open space. VA-for-all (d) blows the <100-view ceiling (~220 markers).
  - **Resolution:** KEEP the twin + the render source. The residual coupling — `labelRenderSourceId` staying in `visualSourceIds` (native `:8839-8840`) / the reveal commit-fence — is a **benign bookkeeping entry, not a behavioral bug**: the render source is force-hidden under VA (`setLabelRenderLayersVisible`), its only live job is hosting the twin's collider geometry. Paying one fence slot for correct broad suppression is the right trade. **The `⚠️ CRITICAL FINDING #2` commit-fence-starvation danger stands as the reason NOT to delete `labelRenderSourceId` from the fence.**
  - **Only reopen path** (not worth one fence entry now): a full native refactor making the COLLISION source carry the 4-candidate name-text field itself (migrate collision to `buildDirectSlotApplyPlans` + add `slotKind:"label"` stamp + rewrite `applyV5ObstacleReseed` to re-emit the fanout), THEN detach the twin from the render source and delete the render source. Must clear two on-device gates: **(A) wiggle** — `[lodev]` harness `mut bundle:[*,*,removes]` while `moving:true` after re-fattening collision features; **(B) suppression A/B** — the same camera-controlled pins-aligned test confirming Strawberry Fields/W 59TH ST stay suppressed + coverage-dot count matches, whole-area, no collateral culling of our own VA labels/dots.

**Net:** the peripheral GL-label dead code (tap query path + text-opacity writes) is removed and verified; the GL label render SOURCE + collision-twin are **retained by design** because the twin's broad basemap/dot suppression is live and not replicable without rebuilding the same machinery. STEP 3's "delete the source + drop the fence entry" is closed as won't-fix.

> Note: the earlier "JS KEEP" line calling the twin "the (dead) twin" is superseded — the twin is LIVE (broad suppressor). The label source _builder's render half_ is likewise NOT deletable (the twin reads it).

---

## EXECUTION STATUS (2026-07-11, distributed re-audit + Phase A landed)

**Already done by earlier passes (manifest was stale):** A/B flags (zero matches), CA pin overlay
classes/bodies (the surviving `overlay*` fns are LIVE thin dispatchers over PinVA/LabelVA — KEEP),
`configureLabelObservation`, `buildRenderedLabelPressTarget` (labelVAHitTest replaced it),
LABEL_MUTEX family, JS RPC call sites, tests (none referenced deleted symbols).

**Phase A LANDED (JS, safe set):** GL label SymbolLayer + LABEL*FEATURE_FILTER +
renderSearchMapLabelLayers + labelLayerStyle/restaurantLabelStyle threading (search-map.tsx,
SearchMapWithMarkerEngine.tsx, use-direct-search-map-source-controller.ts) + the
nativeLabelOpacity/**lea_revealed** expressions + per-side offset math + LABEL_MIN*\* /
LABEL_RADIAL_OFFSET_EM / LABEL_TEXT_SIZE consts + the dead style assertion. The
RESTAURANT_LABEL_RENDER_SOURCE_ID ShapeSource remains MOUNTED (empty, no layers) because native
still writes that source. On-device verified: pins/labels/dots/basemap-suppression intact.

**Phase B LANDED (2026-07-11):** attach guards relaxed (labelLayerIds no longer required),
`setLabelRenderLayersVisible` + `state.labelLayerIds` + the native labelRender family +
`labelRenderSourceId` deleted; JS dropped `labelLayerIds`/`labelVisualLayerIds`/
`RESTAURANT_LABEL_LAYER_ID` + the label-render ShapeSource. Full Xcode rebuild (binary
freshness verified) + on-device re-verify: reveal, VA labels, dots, basemap suppression,
dismiss teardown — all clean. NOTE: the repo path now contains a space ("Crave App"), which
broke three unquoted pod/app script phases (EXConstants get-app-config, EXUpdates
create-updates-resources, the RN bundle phase) — quoted in cravesearch.xcodeproj (committed)
and Pods/Pods.xcodeproj (REGENERATED BY POD INSTALL — re-patch or fix the path if builds
break again after a pod install).

**Phase B plan (as executed):**

1. Native: relax the attach guards that REJECT registration when `labelLayerIds` is empty
   (SearchMapRenderController.swift ~1276-1284 and ~3399-3407).
2. Native: delete `setLabelRenderLayersVisible` (~6756-6800; hard-coded isVisible=false — dead
   effect) + its 3 call sites (~6083, ~6628, ~6671) + `state.labelLayerIds` (decl ~689, parse
   ~1273/3396, assign ~1300/3409, init ~1350, operationCount reads ~6597/6687/6768).
3. Native: delete the labelRender family (labelRenderRecordsByMarkerKey/labelRenderFamilyState/
   labelRenderOrderedKeys build ~4148-4200, apply-plan wiring ~4189/4711, labelRenderSourceId
   ~682 + managedSourceIds/residentSourceIds entries ~9253/9257/9400).
4. JS: drop `labelLayerIds` payload + labelVisualLayerIds + RESTAURANT_LABEL_LAYER_ID; delete the
   RESTAURANT_LABEL_RENDER_SOURCE_ID ShapeSource + const.
5. Full Xcode build (verify binary mtime > source mtime), simctl install, on-device re-verify:
   reveal fade-in density, VA labels place + collide, pin/label taps, toggle, dismiss, basemap
   suppression, dots yield under visible labels.

**FLAGGED FOLLOW-UP (dedicated pass, NOT mechanical):** the `labelSourceId` data family
(derivedFamilyState 'restaurant-source') + the 4-candidate emit (labelBuilder) + labels payload +
the LABEL half of the lea writes. After Phase B its only outputs are counts/diagnostics +
readiness gates (promotedRoleFamiliesAreComplete label clause) — reduce to counts-only or delete
with the readiness gates rewritten. CAUTION: `onScreenMarkerKeys` gate is SHARED with the KEPT
collision emit — do not delete. `guard let labelSourceId` at ~1267 is attach-required until then.
