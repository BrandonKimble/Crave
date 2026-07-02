# The Canonical-Swap Refactor — plan of record (2026-07-02)

Owner ruling (drive round 3): ONE canonical presentation flow for EVERY catalog-replacing trigger
(initial search, restaurant↔dish toggle, filter chips, re-search, search-this-area). Toggling without
moving the map = ZERO network. Complete refactor to the ideal shape, no dead/duplicate paths.

Derived from the `canonical-swap-refactor-design` workflow (5 structural maps → design synthesis + 2
adversarial bug hunts → verify). Device-confirmed so far: (a) guard removal left the reveal healthy
(clean canonical 300ms `reveal_start` ramp, no interference); (b) the desync reproduces
(`activeTab=dishes rawD:0 rawR:0` → empty catalog → no pins).

---

## ROOT CAUSE (structurally confirmed by reading, runtime-confirm still owed on a real repro)

The map has TWO independent publish channels, each with its OWN dedup gate, that can desync:

- **Pins** ← candidate catalog (`publishCandidateCatalog`, JS source ctrl ~1731; native `setCandidateCatalog`)
  → native LOD promotion → `lastPromotedInOrder` → `syncOverlayRoster` → CA-overlay pin tiles.
- **Dots + labels** ← resident source frame (`commitResidentSourceFrameSnapshot` ~1542/2329) → GL sources.

Two provable structural defects make pins desync from dots/labels on a toggle:

1. **Cached-reveal early return** (`use-direct-search-map-source-controller.ts:1617 return;`) sits ABOVE the
   only `publishCandidateCatalog` (~1731). The cached path commits the resident frame (dots/labels) + readiness,
   then returns — so pins are NEVER republished on a cached toggle reveal = "only dots and labels come back,
   not pins." VERIFIED by reading.
2. **Single-tab precompute** — `precomputedMarkerActiveTab`/`precomputedMarkerCatalog` are computed ONLY on a
   network response (`use-search-submit-response-owner.ts:710`). On a tab toggle they stay locked to the prior
   tab, so the reuse gate (`...:1444 precomputedMarkerActiveTab===activeTab`) FAILS → live rebuild from
   possibly-stale `mountedResults` (the `rawD:0` empty-dish case). VERIFIED by reading.

Stickiness (symptom 3): once the cached path is taken, native `setCandidateCatalog` never runs, so
`reprojectCatalogUnderCoverIfReady` finds `pending=false` every tick → no pin re-decide → stays broken.

---

## THE IDEAL SHAPE

### One flow (every trigger is an instance)

press-up canonical FADE-OUT → 300ms restarting quiet-window settle → under-cover ATOMIC catalog+source
recommit → canonical REVEAL. Produce EXACTLY ONE native `enter` transaction per settle, never `live_update`.

- **STEP 0 press-up** (all kinds): `beginInteractionFadeOut()` — already correct+idempotent. LIFT it out of
  the tab-toggle hook into the coordinator so tabs/chips/dropdowns all fire the identical native fade-out.
- **STEP 1 debounce**: the restarting 300ms quiet window (`DEFAULT_TOGGLE_SETTLE_MS`) is the sole commit clock
  for ALL kinds. Make it the coordinator's clock.
- **STEP 2 settle consequence**: (a) commit parameter state to `searchRuntimeBus` (activeTab / filter flags);
  (b) classify dataReadiness (network ONLY if bounds/query/market/entities/filters changed; tab toggle +
  net-zero = always `cache`); (c) `clearStaged` → `beginRedrawTransaction` → `stageSearchSurfaceResultsTransaction(
createSearchSurfaceResultsEnterTransaction(intentId,'initial_search','interaction_loading',null,dataReadyFrom))`
  → drives presentationPhase to `enter_requested`.
- **STEP 3 THE FIX — atomic recommit**: settle MUST unconditionally `recommitMarkerProjectionForTab(target)` to
  the mounted-results store BEFORE the source controller re-projects (pure fn running `computeMarkerPipeline`
  for the requested tab against CURRENT `mountedResults`, or an O(1) lookup from the both-tab precompute).
- **STEP 4 single-channel derive**: pins/dots/labels already derive from the SAME `projectedInitialCandidates`
  in the full-rebuild path — the ONLY defect is the two dedup gates + cached short-circuit.
- **STEP 5 native enter**: one `enter` frame; `beginInteractionFadeOut` already ran; under-cover reproject runs
  `engine.decide()` on the FRESH catalog, `syncOverlayRoster` rebuilds `coordByKey`, then the ramp fades in.
  Because catalog + resident frame committed together, pins/dots/labels reveal in lockstep.

### Data strategy (zero-network toggles)

- **Both-tab ranked reuse**: `SearchResponse` already carries `dishes[]` + `restaurants[]`. At response commit,
  run `computeMarkerPipeline` for BOTH tabs; store `precomputedMarkerCatalogByTab: {dishes, restaurants}`.
  Reuse gate reads `[activeTab]` → ALWAYS hits on toggle (no rebuild, no network).
- **Both-tab coverage prefetch at commit**: coverage key currently includes `activeTab` (`~187`), so toggles
  miss + re-fetch. Fire BOTH `includeTopDish` variants at initial commit, cache tab-agnostic (bounds/market/
  entities) with includeTopDish as a variant sub-key. Toggle = guaranteed cache hit = zero network. A fetch
  fires ONLY on bounds/market/entities change.
- **Channel lockstep**: DELETE the standalone candidate-catalog dedup (JS `~1682-1703` + native-owner
  `~3269-3281`). Publish the candidate catalog as PART OF the resident source-frame snapshot so ONE dedup
  (`areSearchMapSourceFrameSnapshotsEqual`, extended with a catalog key) governs BOTH. A canonical `enter`
  always carries a fresh transactionId/readinessKey, so the reveal gate gets a live key even on identical data
  (extend the always-publish already done for readiness at `~1551` to the enter transactionId).

### Shared toggle abstraction (PresentationSwapCoordinator)

Promote the toggle-lifecycle runtime into ONE coordinator serving restaurant/dish + filter chips + deferredApply
dropdowns. Today the tab hook and `query-mutation-orchestrator.scheduleToggleCommit` both wrap the same lifecycle
with DUPLICATED fade-out+stage logic — that duplication is the bug surface. Collapse both into the coordinator.

- Kinds: `instant` (no debounce, session inactive), `coordinated` (press-up fade + debounced heavy consequence,
  `cache` = zero-network; restaurant/dish + net-zero bursts), `deferredApply` (mutate a DRAFT, no fade/commit
  until the control CLOSES, then collapse to one coordinated/network settle; dropdowns).
- Owns: the single press-up entry, the sole 300ms settle clock, the settle consequence
  (`recommitMarkerProjectionForTab` + clearStaged/beginRedraw/stageEnter → one `enter`), the dataReadiness
  classification. A new toggle plugs in via `coordinator.beginSwap({kind, targetState, dataReadyFrom,
computeTargetProjection})` — never re-implements fade-out or transaction staging.

### Deletions (dead/duplicate once canonical)

- native-owner `~3269-3281` standalone candidate-catalog dedup+push (+ dead `lastPushedCandidateCatalogKeyRef`).
- source ctrl `~1682-1703` separate `candidateCatalogKey` publish gate (+ dead `lastPublishedCandidateCatalogKeyRef`).
- source ctrl `~1441-1462` single-tab reuse gate → replace with `precomputedMarkerCatalogByTab[activeTab]`.
- store `45-48,889-892` single `precomputedMarkerActiveTab/Catalog` scalars → `precomputedMarkerCatalogByTab` map.
- response owner `710-712` single-tab derivation → both-tabs precompute.
- source ctrl `187/200` `activeTab` in coverage request key → tab-agnostic + includeTopDish variant.
- Debug probes after fix: `[tclur]` (~1464, ~toggle hook 81-92), `[t4dbg]` (~1685).
- Duplicate press-up+stage: `scheduleToggleCommit` wrapper + tab-hook `66-136` → one coordinator.
- KEEP as assert (don't delete): `degraded=(promoted>0 && tiles==0)` at swift `~9134` — should never fire post-fix.

### Open risks — DEVICE-VERIFY (per the ATTRIBUTE-before-ideate rule; do not trust the static read alone)

1. Pin-disappear = candidate-catalog dedup skipping `setCandidateCatalog` while dots/labels republish —
   instrument native-owner `~3273` (key vs last + pushed?) AND swift `~8183` (per promoted key `coordByKey!=nil`)
   on a real R→D→R repro; confirm `degraded` at swift `~9134` fires.
2. Fade-slow = toggle landing in `live_update` not `enter` (phase already `live` at settle) — log phase+kind at
   `deriveSearchMapVisualFrameTransactionKind:730` during a toggle; confirm the staged transaction re-drives
   `enter_requested` and isn't coalesced (`shouldQueueNativeEnterMountAckFrame ~3628`).
3. Under-cover reproject is opacity-gated at `<=0.05` (swift `~1586`); a main-thread stall keeping opacity high
   on the first tick misses the swap → applies over opaque pins. Verify fade reaches ≤0.05 before the tick; if
   not, time-gate the reproject (snapSettled AND transaction committed) instead of opacity-gating.
4. Folding catalog into the snapshot changes `areSearchMapSourceFrameSnapshotsEqual` — add a catalog key but not
   so aggressively it breaks the camera-tick dedup (the pan-wiggle zero-removes invariant).
5. Both-tab precompute doubles `computeMarkerPipeline` on the network path — verify no TTFP regression; compute
   the 2nd tab eager-but-idle if it hurts the critical path (must land before the first toggle).
6. Dual-variant coverage prefetch fires two requests — verify the fetch-seq guard (`~2929`) still drops stale
   completions and a rapid move→toggle can't cross-bleed coverage between tabs.
7. Guard deletion — confirm no residual stash/replay ref and a rapid net-zero R→D→R burst produces exactly ONE
   enter, not a stuck reveal (the old toggle-intent:10-stuck-80s regression).

---

## Label z-order (owner: labels in front of pins) — separate architectural item

Pins render on a UIView overlay `addSubview` + `bringSubviewToFront` (swift 8147/8153) → structurally above the
WHOLE GL surface incl. GL labels. Pre-migration pins were GL layers below the label layers → labels in front.
To restore "labels in front" with pins on CA: render the label TEXT on the overlay above pins while collision
stays on the GL twin (consistent with the collision-twin split: collision on GL, render anywhere). Heavy; owner
wants it; design + decide before building.

---

## DEVICE CONFIRMATION (2026-07-02, sim-2, Manhattan real data — 20 results / 266 coverage)

- Guard removal LEFT REVEAL HEALTHY: clean `reveal_start` ramp 0→1 over ~300ms (canonical), no interference.
- **Channel-lockstep defect CONFIRMED ON DEVICE**: on the initial reveal the native engine had NO catalog
  (`projEnter ... catalogEmpty=true`, `toggleSettled promoted=0 tiles=0`) even though JS published
  `catalogPublish count:266 published:true` — the map showed the CARDS but ZERO pins/dots. A later camera
  nudge finally bridged it (`projEnter catalogEmpty=false`, `decide onScreen=240 promoted=30`) and pins
  appeared. So the candidate catalog reaches native ONLY on the next `sendNativeRenderFrame`, which can lag
  the reveal → the enter frame paints an empty/stale catalog. This is the ORDERING/ATOMICITY defect the fix
  targets: the catalog must ride the SAME frame that drives the reveal. (Owner's real chip-tap doesn't hit
  the initial-empty case — its timing differs from the perf deep-link — but the toggle desync is the SAME
  mechanism surfacing on the swap.)
- Perf-flow caveats: `submit_shortcut_restaurants` needs the scenario ARMED (expires at durationMs) AND a
  RESOLVED single market (multi_market Austin returns 0; use `region-us-ny-new-york` at Manhattan
  40.7446,-73.9871). The perf-deep-link initial reveal races the catalog (empty until a camera nudge) — a
  harness artifact, not the owner's bug, but it exposed the same delivery gap.
- Maestro chip taps do NOT fire the toggle `onPress` (coordinate AND text) — the documented gotcha. Add a
  `testID` to the Restaurants/Dishes/filter chips to drive the toggle reliably for validation.

---

## CHANNEL LOCKSTEP — LANDED + DEVICE-VALIDATED + COMMITTED (cb97686f, 2026-07-02)

Catalog now rides `SearchMapSourceFrameSnapshot.candidateCatalog` (dedup on `.key`, atomic with dots/labels,
carried by the cached-frame spread). Manhattan real-data drive: initial reveal settled `promoted=30 tiles=30
degraded=false` — pins + dots + labels all painted, NO camera nudge (before: `catalogEmpty=true promoted=0`
until a nudge). Deleted the standalone `publishCandidateCatalog` channel + `lastPublished*` dedup + `[t4dbg]`.

## REMAINING (ready to build; each needs toggle-drive validation the owner will do)

- **Both-tab precompute (task 4)**: `use-search-submit-response-owner.ts:710` computes ONE tab's projection;
  make it BOTH → `precomputedMarkerCatalogByTab` in the store; reuse gate reads `[activeTab]`. Fixes the
  stale/empty target-tab catalog on toggle (`rawD:0`). + recommit-on-settle in the tab hook.
- **Coverage tab-agnostic prefetch (task 4)**: prefetch both `includeTopDish` variants at commit → zero-network toggle.
- **PresentationSwapCoordinator (tasks 2/5)**: unify tab + chips + deferredApply; delete the duplicated
  `scheduleToggleCommit` / tab-hook fade+stage logic.
- **Label z-order (task 6)**: pins are a `bringSubviewToFront` UIView overlay above ALL GL incl. labels →
  labels behind pins. Owner wants labels in front. Move label render to the overlay (collision stays on GL twin).

## TOGGLE-DRIVE BLOCKER (for self-validation)

Maestro cannot tap the tab toggle: it's a `GestureDetector`(`Gesture.Tap`)-wrapped `View testID=
"search-segment-toggle"` (SearchFilters.tsx:372) — coordinate, text, AND id taps all fail/miss the gesture.
The filter chips are `Pressable onPress` (may tap by coord). To self-validate the toggle, either drive the GH
gesture another way or the owner drives it. The channel-lockstep fix is expected to fix the toggle
pin-desync (catalog rides the cached frame) — OWNER RETEST confirms.

## [lblsnap] FINDING (label flicker instrumentation, owner-deferred)

On a STATIC camera the selector fires every idle projEnter tick with `demote=42 cull=0 sideswitch=0 promote=0`
while `revealed=66` stays constant — 42 label winners are dropped (not in the 30-pin promotedSet) then
silently re-added the same pass, so the `__lea_revealed__` literal nets to zero (no visual flip). Continuous
churn though, and the 66-labels-vs-30-promoted-pins gap wants explaining. Pre-existing (the probe is new, the
demote logic isn't). This is the label-shape investigation the owner deferred to hysteresis-time — probe is
now in place for it.

---

## TOGGLE DEVICE-DRIVEN ATTRIBUTION (2026-07-02, sim-2 Manhattan, via the new perf toggle_tab command)

Added a `toggle_tab` perf deep-link (`crave://perf-scenario-command?action=toggle_tab&routeParam=dishes`) that
routes through the REAL `scheduleTabToggleCommit` (Maestro can't tap the GestureDetector). Drove restaurant→dish
→restaurant on real data. FINDINGS:

- **The channel-lockstep fix WORKS on the toggle**: dish tab reveals pins + dots + labels TOGETHER
  (`toggleSettled promoted=30 tiles=30 degraded=false`, screenshot shows dish pins 11/39/21/32 + dish labels).
  The old "dots+labels but no pins" desync is GONE.
- **THE REMAINING BUG = a ~12s BLANK on toggle-to-dishes** = an uncached COVERAGE NETWORK FETCH. Trace:
  `[SRCPROJ] early=shortcut-covNotReady {cov:loading}` repeats for ~12s → `[tclur] COV-SET {feats:101,
fetchTab:dishes}` lands → reveal proceeds. Coverage is keyed by activeTab (includeTopDish), so the dish
  variant was never fetched at search time. CONFIRMED by asymmetry: toggle-BACK to restaurants (coverage
  cached from the search) reveals INSTANTLY (`cacheReveal pins:277`, no covNotReady). This is the owner's
  "settles on dishes, nothing shows" — it's not never, it's a 12s coverage wait.
  → FIX = both-tab coverage prefetch at search commit (fetch BOTH includeTopDish variants, cache tab-agnostic).
  Source: the coverage fetch at use-direct-search-map-source-controller.ts ~2758 (`includeTopDish =
activeTab==='dishes'`, requestKey includes activeTab). Delicate/spec-locked (coverage-cache-policy.ts) — do
  it carefully as its own step + validate via toggle_tab.
- **Secondary: a bare-swap FLASH** — `[framecensus] kind=enter pres=1.0 removes=65 adds=0` fires at the START
  of the toggle (65 markers torn out while fully visible, before the fade covers). The press-up fade-out
  hadn't dropped presentation yet. Fix in the canonical-flow ordering (fade to cover BEFORE the swap frame applies).
- Also observed: reuse gate MISSES on toggle (`[tclur] CATALOG branch=live` for dishes) → live rebuild (works,
  data present, outLen 16) but confirms the single-tab precompute defect (both-tab precompute still wanted).
