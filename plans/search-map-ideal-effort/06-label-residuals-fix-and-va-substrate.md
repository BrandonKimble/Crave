# 06 — Label Snap-Out Fix + Residual Elimination (Phase 1) → VA Substrate (Phase 2, conditional)

**Author:** analysis/attribution session (6497f062). **For:** the active map session.
**Status:** ready to implement Phase 1; Phase 2 is a conditional prototype spec.
**Date:** 2026-07-03.
**Every file:line here was re-read fresh from HEAD (`8f6c14c0`) via a 7-reader ground-truth pass — no stale/inferred references.** If a line has drifted by the time you read this, re-grep the named symbol; do not trust the number blindly.

> Companion memory: `memory/map-lod-label-attribution.md` (the two 2026-07-03 entries at the bottom). Panels behind this: `wxvp3xpz9` (twin/triangle), `wsq67159x` (residual fixability), `wxffqjjh9` (this ground-truth read). All under `…/6497f062-…/tasks/`.

---

## 0. TL;DR

The labels **snap out during rapid pans/twists and batch-pop-in on settle.** Root cause is _not_ a collision-index regression (the "collision-twin" the other analysis cited is fiction — verified, see §2.3). It's that our **one-label selector gates visibility with a DEFAULT-HIDDEN paint literal (`__lea_revealed__`) fed by an ASYNC, motion-stretched observation** — so when a twist moves which side wins collision, Mapbox culls the old side and the new side isn't revealed yet → **vanish**; on settle the selector reveals everything at once → **batch pop-in.**

- **Phase 1 (do now, low-risk, ~1 file of real change):** invert the selector from a _default-hidden reveal_ to a **default-visible + suppressed-set** model, and delete the motion cadence-stretch. A Mapbox-_placed_ candidate then shows **immediately**; our logic can only ever _add_ a suppression (dedup a redundant twin), **never remove the last label**. The owner's whole ruling ("collide live; only vanish when fully cold; never batch") falls out for free. Failure mode inverts from **vanish (unacceptable)** → **transient dup (owner-accepted)**.
- **Two residuals remain** after Phase 1, both provably the _same_ single SDK limitation (no synchronous placement readback): **R1** a genuine full-block cull is a ~300ms fade not a snap; **R2** a fast twist can briefly show a duplicate on two open opposite sides. Neither has a clean fix that stays on the GL layer _and_ keeps our non-negotiable per-side asymmetric offsets (§2.4).
- **Phase 2 (conditional — the long-term ideal):** migrate labels to a **ViewAnnotation bound to the in-index winner** (`annotatedFeature = .layerFeature`). Its deeper value beyond fixing the residuals: it **separates the two opacity axes the GL layer fuses** — collision visibility becomes an app-owned `UILabel.alpha` _gate_ (**snaps**, kills R1) while LOD becomes the pin's own opacity _scalar_ (**fades** in lockstep). One view per restaurant = no dup (kills R2); visibility placement-gated = never overlaps basemap; mechanism A keeps the GL collision layer so it **still collides with basemap/labels/pins/dots unchanged**; and it **deletes** the label visibility/literal/QRF stack (§5.0). Gated **twice**: only if the finger-test says the residuals matter (or the owner elects the ideal), and only after **GATE 0 (§5.1)** — a ~1hr spike — proves the placement-gating alive on-device. **No migration code before GATE 0 passes.**

**Verify-first is mandatory** (CLAUDE.md "measure don't assert"; this thread has produced _two_ confident-but-hallucinated root causes). Land Phase 1, finger-test the two exact repros, and only reach for Phase 2 if the cull-snap specifically proves non-negotiable when felt.

---

## 1. Symptom & owner requirements

**Symptom (owner, on-device):** during rapid/large pans + twists, labels progressively _leave_ their pins — the harder/longer you twist, the more leave. On release, **all** the missing labels snap back onto their pins **at the same instant** (a batch). The batch-on-settle is the fingerprint.

**Owner ruling (the acceptance bar):**

1. Labels collide **live and immediately** — react to the current camera, not a stretched cadence.
2. A label may disappear **only** when it is colliding on **all four sides** (fully cold). Never merely because the map is moving.
3. Labels must **never** appear "all together in a batch" on settle.
4. Labels must **never visibly overlap basemap text** (pre-existing hard constraint — see `map-lod-label-attribution.md` 2026-06-30 entry; this is _why_ labels live in the collision index and must stay there).
5. Per-side **asymmetric** offsets are **non-negotiable** — top-offset ≠ bottom-offset because the pin is tip-anchored and taller-than-wide (existing `radialTop < radialY-bottom`).

**Accepted trade (owner, explicit):** a transient **duplicate** during a fast twist is acceptable; a **vanish** is not. "dup > vanish."

---

## 2. The reasoning — why the residuals exist and why every alternative is out

### 2.1 The one root: there is no synchronous placement readback (SDK-verified)

Verified against the binary headers in `apps/mobile/ios/Pods/MapboxCoreMaps` (MapboxMaps **11.16.6** / MapboxCoreMaps 11.16.6 per `Podfile.lock`):

- Every `queryRenderedFeatures` / `querySourceFeatures` / `getFeatureState` returns `id<MBXCancelable>` + a **callback** — async only, no synchronous overload (`MBMMap_Internal.h:158-203`).
- `RenderFrameFinished` carries only `placementChanged: BOOL` (a bare viewport bool, no per-feature data) and is emitted **async by design** ("so the callback does not stall the rendering pipeline") — `MBMRenderFrameFinished.h:39`.
- No `getPlacedSymbols` / `isPlaced` / collision-index accessor exists anywhere (grepped Headers + PrivateHeaders — **NOT FOUND**).

So **the app cannot know "this candidate is placed/culled this frame" in-frame.** Every consequence below traces to this one fact.

### 2.2 The current architecture is correct — do not revert it

The visible label layer (`RESTAURANT_LABEL_LAYER_ID`, `search-map.tsx:991`, rendered at `:258-259`) is a **single GL `SymbolLayer`, `textAllowOverlap:false`, `textIgnorePlacement:false`, `symbolZOrder:'source'`** (`:2301`). It emits **4 candidate features per restaurant** (bottom→right→top→left in source order, `use-direct-search-map-source-controller.ts:937-960`, ordering `LABEL_CANDIDATES_IN_ORDER` `:817` / `search-map.tsx:982`), with per-side asymmetric `textAnchor` (`:2378-2389`) and `textOffset` (`:2391-2402`) via a data-driven `match` on `labelCandidate`.

Because it is `textAllowOverlap:false`, it is a **full cross-source collision subject**: Mapbox's synchronous placement pass culls, _in the same frame before compositing_, any candidate that would overlap basemap or a neighbor. **A culled feature paints nothing regardless of what our paint literal says.** That is the load-bearing property: **never-overlap-basemap is engine-enforced in-frame with ZERO async dependency.** The async selector can only ever choose the wrong _side among already-safe (placed) candidates_ — it can never cause a basemap overlap.

The "label collision layer" that was recalled as a planned twin **does exist in the code** — `RESTAURANT_LABEL_PIN_COLLISION_LAYER_ID` / `labelCollisionLayerIds` (`search-map.tsx:993`, `:1926-1932`) — but it is the invisible **pin-obstacle** that makes labels yield to _pins_, **not** a text-render twin. Don't confuse the two.

### 2.3 Rejected alternatives (each verified, not asserted)

- **The "collision-twin regression" / "irreducible triangle {snap, sync-no-flicker, basemap-yield}" from the other analysis is FICTION.** The commits it cited (`9e5dd2a9`, `1a15eb56`) **do not resolve**; the label layer is `textAllowOverlap:false` at **both** HEAD and the "good state" — byte-identical; `git diff` touches the label collision config not at all. Labels were never out of the index. There is nothing to revert.
- **A real twin (invisible in-index collision layer + a separate `allowOverlap:true` render layer)** _would_ decouple our snap from the global fade — but the render layer, being `allowOverlap`, does **not** yield to basemap, so its async-hide lag = **transient basemap overlap** (a correctness violation of req #4). **The twin is a net regression. Never build it.** (Panel `wxvp3xpz9`.)
- **`textVariableAnchor` (collapse 4 features → 1 with in-order anchors)** would give engine-native one-label + no-vanish with no async selector — **but it forfeits the per-side asymmetric offsets.** Re-verified this session: `text-variable-anchor-offset` **does not exist in 11.16.6** (`SymbolLayer.swift` has only `textVariableAnchor: Value<[TextAnchor]>`, `:215`/`:663`; the offset is one symmetric `[x,y]` — same |x| L/R, same |y| T/B). Violates req #5. **Out.**
- **Engine-mutex (mutually-overlapping candidate collision boxes so Mapbox places exactly one)** also kills the dup — but this repo already tried a shared mutex icon and it **cross-suppressed _neighbors_, dropping labels in dense scenes** (`map-lod-label-attribution.md` 2026-06-29/30 entries). Same failure re-invited. **Out.**
- **Snapping via the global fade (`styleTransition` duration≈0)** works but is **style-global** — it snaps **basemap** street/POI names too. That is a genuine owner tradeoff, offered as an _optional_ R1 polish knob (§4.4), **not** a required part of the fix. There is **no per-layer symbol-placement transition** in 11.16.6 (`SearchMapRenderController.swift:1211` comment confirms styleTransition is "the ONLY snap lever"; the only per-layer `*-fade-duration` in the whole spec is `raster-fade-duration`, raster-only).

### 2.4 The two residuals, defined precisely

After Phase 1 (default-visible), two artifacts remain — **both the same root (§2.1) surfacing twice:**

- **R1 — cull = fade, not snap.** When _all four_ sides of a restaurant genuinely block (fully cold), the currently-visible side is collision-culled; its rendered opacity = `collision_fade(1→0 over the global ~300ms) × our_literal(1)` = a **fade-out**, not a snap. To snap it we'd have to zero our literal _the instant the side culls_ — but "culled" is only knowable async (§2.1). **Honest note:** a 300ms fade on a label that has _genuinely lost to basemap_ arguably reads _better_ than a pop; it's a graceful exit, not the motion-churn the owner reported. This may simply be acceptable (see the finger-test, §4.5).
- **R2 — transient dup on a fast twist.** With default-visible, if two open opposite sides of a pin are both placed at once, both show until the next observation suppresses the loser → a brief **duplicate**. To show exactly-one-open-side in-frame we'd need synchronous placement (§2.1). This is precisely the owner-accepted "dup > vanish" trade.

**Why they're not symmetric:** R2 _could_ be killed without a readback by pushing side-selection into the engine (`textVariableAnchor` / engine-mutex) — but both are out for _other_ reasons (§2.3), so on the GL layer R2's only clean outcome is "accept the dup." R1 has **no** non-substrate escape at all — once the engine owns selection a cull is a collision transition on the global fade.

### 2.5 The one clean fix for BOTH (Phase 2)

A **ViewAnnotation bound to the in-index winner** — `annotatedFeature = .layerFeature(layerId, featureId)` (`AnnotatedFeature.swift:25`; `ViewAnnotation.swift:27/58`). It is a `UIView`, so:

- **alpha is app-owned → true snap** on cull (kills R1),
- **visibility is engine-placement-gated** — documented contract: _"if the associated feature's symbol is hidden, the annotation will also remain invisible"_ (`MBMAnnotatedLayerFeature_Internal.h:28`) → never overlaps basemap (req #4 kept, synchronously),
- **one view per restaurant → no dup** (kills R2),
- **per-side asymmetric offsets are trivial** (each label is its own view, positioned exactly — req #5 kept),
- and it **deletes** the entire async selector + `__lea_revealed__` + `swapLeaLiteral` + QRF observation stack — the cleanest "start-over" shape, mirroring exactly what pins did (self-owned view), except pins went self-owned to _escape_ collision (must-win) while labels _bind into_ it (must-yield).

This is **genuinely different** from the "ViewAnnotations" this project rejected before (`map-lod-label-attribution.md` 2026-06-30): that rejection was about _free-floating_ VAs and a _manually_-positioned CA-text-on-a-GL-box (independent positions → a reparse seam that leaks over basemap). The `.layerFeature`-**bound** VA is SDK-positioned at the bound feature's _resolved_ placement and auto-hidden on cull — no independent-position seam **in principle**. "In principle" is doing real work there; see the device smoke-tests (§5.6).

---

## 3. Plan shape: two phases, verify-first

```
Phase 1  ──►  finger-test the two repros  ──►  clears bar?  ──► DONE (Phase 2 = over-engineering)
(invert selector,                                  │
 delete cadence)                                   └── fails on cull-snap
                                                       (or owner elects the ideal shape)
                                                          │
                                                          ▼
                                              GATE 0 spike (§5.1, ~1hr)  ──► fails ──► accept Phase 1
                                              "is Phase 2 alive?"           │
                                                                            └── passes ──► Phase 2 (VA),
                                                                                          behind A/B flag
                                                                                          (mechanism A or B
                                                                                           per GATE 0)
```

Phase 1 is worth doing **regardless** — it fixes the actual reported bug (vanish/batch). Phase 2 is a _substrate change_ that eliminates the two residuals AND separates the snap/fade axes the GL layer can't (the long-term ideal, §5.0) — but it is **gated twice**: only pursued if the finger-test says the residuals matter (or the owner elects the ideal), and only built if **GATE 0 (§5.1)** proves it alive on-device first. No migration code is written before GATE 0 passes.

---

## 4. PHASE 1 — invert the selector to default-visible

### 4.1 Current state (verbatim, from HEAD)

**JS gate — `search-map.tsx:2209-2221`, DEFAULT-HIDDEN:**

```js
const nativeLabelSelectedExpression = React.useMemo(
  () =>
    [
      'case',
      [ 'in',
        ['concat', ['get', 'markerKey'], '::', ['get', 'labelCandidate']],
        ['literal', ['__lea_revealed__']] ],
      1,  // visible if composite key is in revealed set
      0,  // default hidden (opacity 0)
    ] as const,
  []
);
```

This is a factor of the `text-opacity` product (`:2370-2377`): `presentation × nativeLabelOpacity(__lea_lod__) × nativeLabelSelected(__lea_revealed__) × base`.

**Native selector — `SearchMapRenderController.swift:9965-10011` (`applyLabelOneOfFourSelector`):**

- `observedByMarker` parse (`:9972-9978`) — groups the QRF-observed (i.e. **placed**) candidates by markerKey with source priority.
- Empty-observation bail (`:9979-9982`) — `guard !observedByMarker.isEmpty else { return }`. **Load-bearing, keep.**
- Demote-only drop (`:9983-9992`) — prune winners whose markerKey left `lodV5Engine.lastPromotedInOrder`. **Load-bearing, keep.**
- Sticky winner select (`:9993-10001`) — keep current winner if still placed; else highest-priority placed candidate. **Keep.**
- Swap reveal (`:10002-10011`) — `revealedKeys = winners.map { "\($0.key)::\($0.value)" }`; `swapLeaLiteral(sentinel: leaRevealedSentinel, keys: revealedKeys)`.

Invoked from `performLabelObservationRefresh` inside the `queryRenderedFeatures` `.success` callback (`:9759`, selector call `:9788`).

**Sentinels — `:8580-8581`** (`leaLodSentinel = "__lea_lod__"`, `leaRevealedSentinel = "__lea_revealed__"`); registered in `sentinelLiteralHeads` `:8608-8615`; swapped by `swapLeaLiteral` `:8584` → `replaceSentinelLiteral` `:8617-8636`.

**Under-cover reveal commit — `:8531-8574` (`commitSettledLeaAuthorityUnderCover`):** synchronously commits `__lea_lod__` (via `takeSettledRoleChangeIfAny()`, `:8538`) **and** `__lea_revealed__` from the persisted `labelWinnerByInstance`, **additively unioning, never shrinking** (`:8564`, the L1 reveal-flash fix). Runs before the presentation ramp crosses visible.

**Cadence stretch — `:9543-9620`:** `nextAdaptiveMovingLabelObservationDelay` (`:9543-9562`) + `scheduleLabelObservationRefresh` (`:9564-9620`); the stretch is `normalizedDelayMs = max(delayMs, movingAdaptiveRefreshMs)` when `currentViewportIsMoving` (`:9582-9591`). `movingAdaptiveRefreshMs` (field `:492`) **scales up dynamically** to 32/64/96ms as quiet passes accumulate during motion. `isRefreshInFlight` (`:489`) coalesces overlapping requests. `currentViewportIsMoving` set at `:11494`. Idle/moving base constants `search-map.tsx:107-108`.

### 4.2 The change

**(a) JS gate — invert to default-visible + suppressed-set** (`search-map.tsx:2209-2221`):

```js
const nativeLabelSelectedExpression = React.useMemo(
  () =>
    [
      'case',
      [ 'in',
        ['concat', ['get', 'markerKey'], '::', ['get', 'labelCandidate']],
        ['literal', ['__lea_suppressed__']] ],
      0,  // hidden ONLY if this composite key is in the suppressed (loser) set
      1,  // DEFAULT VISIBLE — a Mapbox-placed candidate shows immediately
    ] as const,
  []
);
```

Keep it a factor of the same `text-opacity` product. Keep the composite-key `concat` byte-identical to the Swift builder (`:10371`, `"markerKey::label::candidate"` parse vs `"markerKey::candidate"` reveal-key — **note the reveal key uses `::` not `::label::`; keep that exactly, only the _sentinel_ and the _branch order_ change**).

**(b) New sentinel** — replace `leaRevealedSentinel = "__lea_revealed__"` with `leaSuppressedSentinel = "__lea_suppressed__"` at `:8580-8581`, and update `sentinelLiteralHeads` (`:8608-8615`) to list it. (`__lea_lod__` is untouched — it must keep coexisting in the same product; the sentinel-routed swap is exactly what keeps them from clobbering, see §4.3.)

**(c) Native selector — compute LOSERS, swap the suppressed set** (`:10002-10011`). Keep steps 1-4 (`:9972-10001`) **exactly** (parse, empty-bail, demote-drop, sticky winner). Replace only the swap tail:

```swift
labelWinnerByInstance[instanceId] = winners
// Suppress only the OBSERVED (placed) non-winner candidates — unplaced ones
// already paint nothing, so they need no suppression.
var suppressedKeys: [String] = []
for (markerKey, candidatesUnsorted) in observedByMarker {
  guard let winner = winners[markerKey] else { continue }
  for c in candidatesUnsorted where c.candidate != winner {
    suppressedKeys.append("\(markerKey)::\(c.candidate)")
  }
}
for layerId in labelLayerIds {
  Self.swapLeaLiteral(
    layerId: layerId, property: "text-opacity",
    sentinel: Self.leaSuppressedSentinel, keys: suppressedKeys, mapboxMap: mapboxMap
  )
}
```

`swapLeaLiteral` **replaces** (rewrites the inner array to `[sentinel] + keys`), which is correct for a non-monotonic set (a loser that becomes the winner must be able to leave the suppressed set — see §4.3).

**(d) Delete the cadence stretch.** In `scheduleLabelObservationRefresh` (`:9564-9620`) remove the moving branch so the delay is always the idle base — i.e. drop `nextAdaptiveMovingLabelObservationDelay` (`:9543-9562`), the `movingAdaptiveRefreshMs` field (`:492`) and its use at `:9582-9591`. Keep `isRefreshInFlight` coalescing (`:9598-9605`) — it's an unrelated, correct backpressure gate. **Rationale:** once visibility is default-visible, the observation is only a **dedup refiner**, so a stretched cadence only makes a dup _linger_, never a vanish. Running it at idle cadence resolves dups promptly. **Perf caveat:** full-cadence `queryRenderedFeatures` during a fast fling has a cost; if the device shows frame-pacing regression during motion, re-introduce a _mild fixed_ stretch (e.g. cap at ~48ms) — the dup just lives a few ms longer, still no vanish. Measure before deciding.

### 4.3 Subtle points / risks — read before editing

1. **Sentinel coexistence is the highest-risk surface.** `__lea_lod__` and `__lea_suppressed__` live in the **same** `text-opacity` expression. `replaceSentinelLiteral` (`:8617-8636`) recurses **all** children and does **not** stop after the first match (`:8631-8633`); its only safety is "one node per sentinel." The debug guard (`:8596-8599`) merely _logs_ heads — it does **not** fatal-assert on a clobber. **When you add `__lea_suppressed__`, verify by log that a suppressed-swap leaves the `__lea_lod__` node byte-identical and vice-versa.** A silent clobber re-breaks the shipped dot/label LOD anti-flash and is only caught by wrong on-screen opacity. Consider upgrading the guard to a real assertion while you're in here.
2. **The under-cover commit must invert too, and its union semantics change** (`commitSettledLeaAuthorityUnderCover`, `:8531-8574`). The additive-**union-never-shrink** (`:8564`) was correct for a _revealed_ (monotonic-add: "never un-reveal a winner under cover") set. A _suppressed_ set is **non-monotonic** — a loser that becomes the winner must be un-suppressed — so the union-never-shrink is **wrong** for it. **Recommended:** for labels, drop the under-cover label commit entirely and let the **preroll observation** handle dedup (the selector already runs under cover before the visible fade — `map-lod-label-attribution.md` 2026-06-30 notes "reveal has NO flash — the preroll observation runs the selector BEFORE the visible fade"). With default-visible, the reveal no longer _needs_ a pre-commit to avoid a vanish (placed candidates already show); it only needs dedup, which the preroll provides. Worst case is a brief reveal-dup under cover — invisible (behind frost) and owner-accepted anyway. **Keep the `__lea_lod__` commit in this function unchanged** (that's the separate dot/pin LOD authority; do not touch it).
3. **Keep the empty-observation bail and demote-only-drop exactly** (`:9979-9992`). They are still correct and still load-bearing (preroll QRF race safety; stale-marker pruning). The inversion changes _what we write_ (losers vs winners), not _when we may write_.
4. **`labelWinnerByInstance` stays the source of truth** for "who is the winner" — the suppressed set is _derived_ from it each pass. Don't try to persist a suppressed set; derive it.
5. **Composite-key exactness.** The Swift reveal/suppress key is `"markerKey::candidate"` (`:10371` region), the JS `concat` is `['concat', markerKey, '::', candidate]` — these must produce identical strings. `markerKey` may itself contain `::`; it is never split on the JS side (the parse only splits the _feature id_ on `"::label::"`, `:10352-10357`). Do not "fix" this.

### 4.4 Optional R1 polish — the global-fade knob (owner decision)

If, after Phase 1, the **cull fade** specifically bothers the owner but you don't want a substrate migration: the existing dev kit already drives the global fade. `applyBasemapSymbolFadePolicy` (`:1248-1256`) sets `mapboxMap.styleTransition = TransitionOptions(duration, delay, enablePlacementTransitions)`; fields `basemapSymbolFadeDurationMs` / `basemapSymbolPlacementTransitionsEnabled` (`:862-863`, default 300ms/true, re-applied on style load `:11088`); driven at runtime by `crave://perf-scenario-command action=set_label_transition` (`perf-scenario-deep-link.ts:207-208` → `PerfScenarioCoordinator.tsx:257-261`). Dropping the duration toward ~0 makes the cull **snap** — **but it is style-global, so basemap street/POI names snap too** (req #4 stays intact; only the _fade aesthetic_ changes). This is the one genuine owner tradeoff; expose it, let them feel 300 vs ~60 vs 0 ms, and pick. It is **not** required for the vanish/batch fix.

### 4.5 Expected result + finger-test gates

**Expected after Phase 1:** a Mapbox-placed candidate is visible the instant it's placed; the selector only ever hides a _redundant co-placed twin_. Therefore: **no vanish during motion, no batch-pop on settle, labels collide live** (reqs #1-3 met), **never overlap basemap** (req #4, unchanged — still in-index), **per-side offsets intact** (req #5, unchanged). Residuals: R1 graceful fade on genuine full-block; R2 transient dup on a fast twist (owner-accepted).

**Finger-test (owner, on device — this is the gate for whether Phase 2 is even needed):**

- **Repro A (R1):** find a restaurant whose label is boxed in on all four sides (dense midtown), and watch it disappear. PASS if the fade reads as a natural exit; FAIL if the owner wants a hard snap there.
- **Repro B (R2):** hard-twist the map where pins have open space on opposite sides; watch for a brief duplicate. PASS if the dup is sub-perceptual / acceptable; FAIL if it's objectionable.
- **Regression:** confirm the old symptom is gone — no label vanishes purely from motion, nothing batch-pops on release.

If both PASS → **done; Phase 2 is over-engineering.** If Repro A FAILs and the owner deems cull-snap non-negotiable → Phase 2. (Repro B failing alone does **not** justify Phase 2 unless A also fails — R2 has no clean GL fix, so a VA migration is the only lever, and it's not worth it for the dup alone.)

---

## 5. PHASE 2 (CONDITIONAL) — ViewAnnotation `.layerFeature` substrate

**Two hard preconditions before any migration code is written:** (1) Phase 2 is only warranted if the §4.5 finger-test fails on cull-snap (or the owner elects the ideal shape regardless); and (2) **GATE 0 (§5.1) must pass first** — it is a ~1-hour throwaway spike that answers "is this even alive on this device" before anyone invests in the migration. Treat all of Phase 2 as a **prototype behind an A/B flag**, gated, never a commit-on-code-reasoning change.

### 5.0 Why this is the long-term ideal — the axis separation

The reason the VA keeps looking more like the _real_ ideal (not just an R1/R2 patch) is one structural property: **it separates two opacity axes that the GL substrate fundamentally fuses.**

On the GL layer, a label's on-screen opacity is a **single product** — `collision_fade × LOD_fade(__lea_lod__) × selector(__lea_revealed__) × presentation`. The collision fade is style-global and entangled in that product, which is _exactly why_ you cannot snap a collision transition without also disturbing the LOD/basemap fade — they share one channel. Every bit of GL-side cleverness (the sentinel literals, the reparse-immunity, the observation cadence) is machinery to manage that one fused channel.

On the VA, the two axes become **independent knobs:**

| axis                                          | GL today                                                                 | VA                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **collision visibility** (side-change / cull) | rides the style-global fade; can't snap without snapping basemap         | app-owned `UILabel.alpha` gate, binary 0/1 → **snaps**, independent of the global fade              |
| **LOD** (promote/demote, reveal/dismiss)      | separate `__lea_lod__` literal + presentation, reparse-immune gymnastics | the pin's own `engine.pinOpacity × presentation` scalar → **fades**, lockstep with the pin for free |

Final `alpha = (engine.pinOpacity × presentation) × (placed ? 1 : 0)`. The product composes them cleanly: **LOD transitions fade, collision transitions snap** — which is precisely the owner's ask, and something no amount of GL-side work can deliver because on GL those two live in the same multiply.

**How each owner want maps onto the VA (assuming GATE 0 passes):**

- **snap without fading** (side-change, cull) → yes; a side-change is a UIView reposition (instant), a cull snaps the alpha gate to 0. Not dependent on the global fade at all → **R1 gone.**
- **fade away with the pin on promote/demote** → yes; the LOD factor _is_ the pin's opacity scalar → perfect lockstep, and _simpler_ than today (no separate label LOD literal).
- **still collide with dots, other labels, and pins** → yes, **fully**, in mechanism A — because A keeps the invisible GL collision layer, so every relationship (basemap-yield in-index, label-vs-label competition, pin-obstacle, dot-obstacle) is preserved **unchanged**; the VA is render-only and inherits the winner's placement.
- **one label per restaurant, per-side asymmetric offsets** → yes; one view per restaurant (no dup → **R2 gone**), and offsets are trivial UIView frame offsets (no more fighting the missing `text-variable-anchor-offset`).

**What else gets better (beyond the two residuals):**

1. **Independent snap/fade axes** — the headline above.
2. **The whole visibility/literal stack is deleted** — `__lea_revealed__`/`__lea_suppressed__`, `swapLeaLiteral`/`replaceSentinelLiteral`'s label usage, the sentinel-coexistence risk (§4.3.1), the reparse-immunity dance, the cadence tuning. All of it existed _only_ because a paint literal was our visibility lever; the VA gates on placement directly.
3. **No reparse artifacts on the visible label** — the VA isn't tiled, so the flash/wiggle class on rendered text disappears (the collision layer still reparses, but it's invisible).
4. **Crispness you control** — CoreText `UILabel` at explicit `contentsScale` can match/beat the GL SDF atlas at fractional zoom.
5. **Tappable labels become trivial** — a UIView handles touches natively (the pin overlay already does); GL label taps need QRF hit-testing. Free option value.
6. **Richer labels possible** — multi-line, an icon, a rating chip — a UIView can hold anything a SymbolLayer can't.
7. **Architectural consistency** — pins _and_ labels become self-owned views on the same proven `PinOverlayView` infrastructure; dots stay GL. One mental model, not three special cases.

**What stays harder / the honest costs:** you keep an invisible GL collision layer (collision complexity does _not_ go away in mechanism A); the label text is laid out twice (invisible GL box for collision + visible VA — minor cost); position is more manual (you place the UIView vs declarative `textAnchor/textOffset`); ~30-60 UIViews to perf-check; and everything is gated on GATE 0.

### 5.1 GATE 0 — "Is Phase 2 alive?" (run FIRST, before writing any migration code)

A ~1-hour throwaway spike (behind a `__DEV__` flag, no roster/teardown/engine wiring — just add a couple of VAs by hand and watch them). It answers two questions; the answers decide _whether_ Phase 2 proceeds and _which_ mechanism:

**Gate 0-A — does the `.layerFeature`-bound VA place-gate synchronously with no seam? (decides mechanism A viability):**

1. **Synchronous hide-on-cull.** Add one VA bound via `annotatedFeature = .layerFeature(labelLayerId, "<markerKey>::label::<side>")` to a known label feature. Twist the map so a basemap label collides that feature. **PASS** = the VA hides _the same frame_ the feature culls (no lag where the VA text sits over the basemap label). This is the make-or-break: the headers say VA positions are delivered on the main render thread on iOS (`MBMViewAnnotationPositionsUpdateListener_Internal.h:13`, `MapView.swift:105`), i.e. it _should_ be synchronous — but this repo has never run the VA placement path, so **prove it, don't trust the header.**
2. **No position/footprint seam through reparse.** Pan/twist/zoom across the label source's `maxZoomLevel:13` reparse. **PASS** = the VA stays pinned to its feature with no jump, and its rendered text stays inside the GL collision box that was cleared (mitigation if the footprint slightly overhangs: pad the invisible GL collision box a hair larger than the VA text — do this in the spike if needed).

**Gate 0-B — does a self-colliding VA yield to basemap in 11.16.6? (decides whether the _even cleaner_ mechanism B is on the table):** 3. Add one VA bound to the pin feature with `variableAnchors = [.bottom,.right,.top,.left]`, `allowOverlap = false`, and `mapboxMap.viewAnnotationAvoidLayers = {a basemap symbol layer id}`. **PASS** = the VA visibly avoids/culls against basemap labels (never overlaps them). If it overlaps basemap, B is dead in this SDK (`enableSymbolLayerCollision` — the "VA participates in symbol collision" feature — is understood to land ~11.26.x), and you keep the GL collision layer (mechanism A).

**Decision from GATE 0:**

- **0-A passes, 0-B passes** → build **B** (the higher ceiling: delete the GL label layer _and_ the selector; one self-colliding VA does collision + side-selection + render).
- **0-A passes, 0-B fails** → build **A** (the safe floor: keep the invisible GL collision layer + selector; VA is render-only). This is the expected outcome given the SDK version.
- **0-A fails** (async hide / unfixable seam / overlaps basemap) → **Phase 2 is dead.** Ship Phase 1 (GL + accepted residuals). Do **not** proceed to the migration on hope.

Record the GATE 0 result in this doc before writing migration code.

### 5.2 Mechanism A (safe floor) vs B (higher ceiling)

Two shapes surfaced in panel `wsq67159x`. **A is the recommended floor for 11.16.6** (its gating is the _documented_ path); **B is a higher ceiling** unlocked only if GATE 0-B passes.

- **A (safe floor) — invisible GL collision layer + VA bound to the winner.** Keep the current 4-candidate GL label layer **as the collision participant only** (make its text invisible — `text-opacity 0` — it exists purely to yield to basemap in-index and to _be_ the placement authority). Keep the selector picking a winner. Bind **one VA per promoted restaurant** to the winning candidate feature via `annotatedFeature = .layerFeature(labelLayerId, "<markerKey>::label::<winnerSide>")`. Render the visible text in the VA's `UILabel`. The VA auto-hides when its bound feature is culled (`MBMAnnotatedLayerFeature_Internal.h:28`). On a side-change, re-bind (or reposition) the VA. Per-side offset = the VA's positional offset for the winning side (you know the side from the selector). **Keeps the proven in-index basemap/label/pin/dot collision exactly; adds only the app-owned render on top.** This is why "still collides with everything" is a _yes_: you didn't move the collision, only the pixels.
- **B (higher ceiling) — one self-colliding VA.** One VA per restaurant bound to the **pin** feature for position, with `variableAnchors = [.bottom,.right,.top,.left]` (`ViewAnnotation.swift:157`), `allowOverlap = false` (`:66`), `mapboxMap.viewAnnotationAvoidLayers = {basemap symbol ids} ∪ {dot id} ∪ {pin-obstacle id}` (`ViewAnnotationManager.swift:89-91`). This **deletes the GL label layer _and_ the selector _and_ the QRF** — dramatically simpler. Viable **only if GATE 0-B passes**; otherwise it risks real basemap overlap in this SDK.

### 5.3 Template — mirror the pin CA overlay exactly

Pins are the proven precedent for a self-owned, promote/demote-driven, engine-opacity-bound overlay. Copy its lifecycle shape:

- **Roster reconcile on decide (not per frame):** `syncOverlayRoster` (`:8112-8211`) adds/removes/recycles pin tiles once per `decide` (camera frame / reveal / toggle entry — call sites `:1647`, `:11549`). For VAs: **add a VA on promote, remove on demote**, in the same reconcile, keyed off `lodV5Engine.lastPromotedInOrder`. (VAs need **no** per-frame `point(for:)` projection — Mapbox positions them via the binding — so you _skip_ the `refreshOverlayFrame` position work, `:8222-8251`. You _do_ still bind opacity to the engine, see below.)
- **Opacity = `engine.pinOpacity(nowMs) × presentation`** (the pin tile rule, `refreshOverlayFrame` `:8246-8248`, GOTCHA "product not sum"). Drive `UILabel.alpha` from the **same** scalar so LOD promote/demote + reveal/dismiss fades stay lockstep for free — **and** snap alpha to 0 on `onVisibilityChanged` → hidden (`ViewAnnotation.swift:167`) for the R1 cull-snap.
- **One-writer discipline:** pins split opacity authority between the presentation animator's display link (`writeOpacity:true`) and the overlay's own link (`writeOpacity:false`) to avoid desync (`:8246-8248`/`:8267-8273`, and the "ONE-WRITER" gotcha). If you add a VA display-link path, respect the same single-writer rule.
- **Add-frame guard:** newly-added overlays can land at origin/hidden for one frame (pin GOTCHA 9; VA starts `isHidden=true` until first `placeAnnotations`, `ViewAnnotationManager.swift:121` region). Gate initial `alpha` to the reveal ramp so there's no add-time pop-in.

### 5.4 Exact VA APIs (11.16.6, verified)

`ViewAnnotation` init + `annotatedFeature` (`ViewAnnotation.swift:58`); `.layerFeature(layerId:featureId:)` (`AnnotatedFeature.swift:25`, `ViewAnnotation.swift:27`); `allowOverlap` (`:66`); `selected` (`:112`); `variableAnchors` (`:157`); `onVisibilityChanged` (`:167`); manager `add` (`ViewAnnotationManager.swift:121`), `viewAnnotationAvoidLayers` (`:89-91`). Placement-gating contract: `MBMAnnotatedLayerFeature_Internal.h:28`.

### 5.5 Delete list (after the VA is proven)

Once the VA render is verified, delete the GL _render_ path (keep the invisible collision layer for A):

- The visible text on `RESTAURANT_LABEL_LAYER_ID` → set `text-opacity 0` (A keeps the layer as collision-only) **or** delete the layer entirely (B).
- `nativeLabelSelectedExpression` + the `__lea_suppressed__`/`__lea_revealed__` sentinel + `swapLeaLiteral`/`replaceSentinelLiteral`'s label usage (`search-map.tsx:2209`, `SearchMapRenderController.swift:8580-8636`) — **only the label parts; `__lea_lod__` for dots stays.**
- `applyLabelOneOfFourSelector` + `performLabelObservationRefresh`'s label query + `scheduleLabelObservationRefresh` + `labelWinnerByInstance` (`:887`, `:9543-10011`) — for **B**; for **A** you keep the selector (it picks the winner the VA binds to) but drop the reveal-literal swap.
- The label part of `commitSettledLeaAuthorityUnderCover` (`:8531-8574`).
- **Layer-id list plumbing (silent-break risk):** if you delete/rename the GL label layer, remove its id from `labelVisualLayerIds` (`search-map.tsx:1925`) **and** every native loop over `state.labelLayerIds` (`:651`, `updateLeaMembershipLiterals` `:8501`, `setLabelRenderLayersVisible` `:8889`). If you touch a collision layer, `labelCollisionLayerIds` toggles **in pairs** (`setLabelCollisionObstacleLayersVisible` `:6840`) — remove both or one stays permanently active in the placement pipeline.

**The `LodEngine` brain stays byte-intact** (`LodEngine.swift` — `decide` `:132`, `step` `:166`, `snapSettled` `:195`, `takeSettledRoleChangeIfAny` `:258`; pure, no Mapbox I/O). It still decides _which restaurants are promoted_ = which VAs exist. Do not touch it.

### 5.6 Expected result (Phase 2) + build-time verification

**Result (if GATE 0 passes and the migration lands):** true cull-snap (app-owned alpha), one label per restaurant (no dup), never-overlap-basemap (placement-gated), per-side asymmetric offsets (per-view), LOD/reveal/dismiss fades lockstep (shared engine scalar), and — in mechanism A — every collision relationship (basemap/label/pin/dot) preserved unchanged — **all five owner reqs + both residuals resolved** — with the label visibility/literal/QRF stack **deleted** (and in B, the GL label layer + selector too). Gated on GATE 0 (§5.1).

**Verify during the build (distinct from GATE 0's aliveness check):**

- **Perf + crispness at ~30-60 promoted VAs** (LOD-capped — _not_ the ~200-total-candidates fear). `UILabel` CoreText at explicit `contentsScale` should match or beat the GL SDF atlas at fractional zoom; confirm no frame-pacing regression at torture zoom, reusing the pin-overlay perf posture.
- **A/B parity vs Phase 1** behind the flag — the owner compares the VA build against the GL+accepted-residuals build and confirms the snap/fade behavior is the win, not a regression.
- **Fade/snap composition** — on a promote-then-immediately-blocked case, confirm the label fades in (LOD) only while placed and snaps out if culled mid-fade (the `alpha = LOD_scalar × placement_gate` product behaves).

---

## 6. What NOT to do (hard rejects, with the reason)

- **Do not build the twin** (invisible in-index + `allowOverlap` render). It re-introduces transient basemap overlap. Net regression. (§2.3)
- **Do not use `textVariableAnchor`** to collapse candidates — it can't express the non-negotiable asymmetric per-side offsets (`text-variable-anchor-offset` absent in 11.16.6). (§2.3)
- **Do not re-introduce a shared mutex icon / overlapping collision boxes** — proven dense-scene neighbor cross-suppression in this repo. (§2.3)
- **Do not "revert the collision-twin"** — there is no twin; the layer is `textAllowOverlap:false` and always has been. The cited commits are phantom. (§2.3)
- **Do not touch `LodEngine`** (the pure brain) or the pin CA overlay for this work.
- **Do not clobber `__lea_lod__`** when adding/removing the label sentinel — route every swap by sentinel and verify the sibling is byte-identical. (§4.3)
- **Do not carry the under-cover union-never-shrink onto the suppressed set** — it's a non-monotonic set. (§4.3)

---

## 7. Owner decisions still open

1. **R1 fade vs snap** — after Phase 1, is the graceful fade on _genuine full-block_ acceptable (done), or is a hard cull-snap non-negotiable (→ Phase 2, or the global-fade knob with a basemap-snap side-effect)?
2. **Global-fade knob (§4.4)** — if used, basemap street/POI names snap too. Acceptable?
3. **Elect the ideal regardless?** — Phase 2 also delivers the snap/fade _axis separation_ (§5.0), which is a genuine architectural improvement even if the residuals themselves are tolerable. The owner may choose to pursue it as the long-term ideal rather than purely as a residual fix. Either way it's still gated by GATE 0.
4. **Phase 2 mechanism A vs B** — _not_ a preference call; decided by **GATE 0 (§5.1)**. A is the expected floor for 11.16.6; B unlocks only if GATE 0-B passes.

---

## 8. Definition of done

**Phase 1:** old vanish/batch symptom gone on device; labels collide live; no basemap overlap; per-side offsets intact; `tsc` 0-new; native build SUCCEEDED; `__lea_lod__` anti-flash verified un-clobbered (§4.3.1); the two finger-test repros run and their verdict recorded. Residuals R1/R2 explicitly accepted or escalated to Phase 2.

**Phase 2 (if pursued):** **GATE 0 (§5.1) passed and its result recorded in this doc** _before_ migration code; the mechanism (A or B) chosen by GATE 0, not preference; A/B flag lets the owner compare against Phase 1; the snap/fade axis-separation (§5.0) verified (collision snaps, LOD fades, composition correct); all five owner reqs + both residuals met; in mechanism A, collision relationships (basemap/label/pin/dot) confirmed unchanged; perf/crispness at ~30-60 VAs verified; delete list applied; layer-id plumbing consistent (no silent-break); `LodEngine` untouched.

---

## 9. Appendix — provenance

- Panels: `wxvp3xpz9` (twin/triangle — twin is a net regression, no sync readback), `wsq67159x` (residual fixability — VA is the only clean both-fix), `wxffqjjh9` (this ground-truth read).
- Memory: `memory/map-lod-label-attribution.md` (2026-07-03 entries — snap-out root cause, twin-is-fiction, residual fixability + VA).
- SDK: MapboxMaps/MapboxCoreMaps **11.16.6**, @rnmapbox/maps **10.2.9**.
- **Discipline note for the implementer:** this thread has burned two confident root causes on hallucinated commits/symbols. Every reference above was re-read from HEAD; re-grep the _symbol_ if a line number has drifted, and verify SDK behavior on-device rather than from headers where §5.5 says so.

```

```
