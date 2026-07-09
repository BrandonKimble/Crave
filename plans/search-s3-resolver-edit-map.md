# S3 Edit Map — Resolver + Global World Cache (executable plan)

Produced 2026-07-07 by the S3 planning pass against the live tree (post-S1/S2). Parent:
`plans/search-desired-state-architecture.md` §3/§7. This file is the execution reference
for the S3 build; anchors verified at commit d543d58f. `ROOT = apps/mobile/src/screens/Search`.

## 1. DIES / MOVES / STAYS (one submit traced end-to-end)

Shortcut submit trace (`submitViewportShortcut`, `ROOT/hooks/use-search-structured-submit-owner.ts:427`):

1. Tuple write (S2) — STAYS; becomes the resolver's sole input.
2. Attempt config (`createShortcutStructuredInitialAttemptConfig`, entry-owner :456) — shadow
   payload DIES; label/tab derivation already lives in the tuple writer.
3. `runManagedRequestAttempt` + shadow machine (`use-search-request-runtime-owner.ts:565`,
   `activateRuntimeShadowOperation` :347) — DIES; desiredTupleGeneration IS the requestId;
   superseded = generation mismatch.
4. `prepareSearchRequestForegroundUi` (entry-owner :321): includeSimilar reset (already a
   tuple write) STAYS at trigger; `setSearchRequestInFlight` MOVES (resolver publishes
   `isSearchLoading` while current-generation network resolution in flight);
   `onPresentationIntentStart` STAYS (called via seam.beginResolution);
   `scheduleSubmitUiLanes` lane-A publishes (:261-269) DIE (tuple writer already projects
   identical values; only `pendingTabSwitchTab:null` + `isLoadingMore:false` ride the
   resolver's begin publish); `clearResultsForReplacement` (:299) DIES.
5. Payload build (`use-search-request-preparation-owner.ts:415`): filter/price assembly
   MOVES into the resolver's network tier READING THE TUPLE; bounds resolution MOVES to
   the writer side (async `captureFreshCommittedBounds` BEFORE the tuple write for
   STA/rerun; the resolver never touches the map ref); polygon/userLocation attach MOVES.
6. Coverage prime + `publishShortcutCoverageForResponse` relay
   (`use-search-submit-structured-helper-owner.ts:32/:56` → session-interaction-primitives
   → map controller post-response fetch) — DIES ENTIRELY: resolver fetches
   coverageWorld(tuple) in PARALLEL with cards and commits via
   `commitSearchMountedResultsCoverage`. Delete the relay chain AND the bbf97e85 interim
   (`use-direct-search-map-source-controller.ts:3022-3037`).
7. Network (`executeShortcutStructuredSearchAttempt` → `runSearch`, execution-owner
   :589-753) — MOVES; staleness re-checks (:622/:675) become one generation check.
8. Response commit chain (`use-search-submit-response-owner.ts:1794`):
   - `normalizeSearchResponse`/`mergeSearchResponses`/`deriveSearchResponseResultsCommitPatch`
     (:574) + both-tab marker-projection precompute (:127-231, :636-718) — MOVES: this IS
     the world-value constructor.
   - The atomic commit batch (:1408-1502) — STAYS as the SEAM BODY, relocated into ONE
     `commitWorldToMountedState()` (empty_page contract :1438 stays inside).
   - `commitSearchResponsePhaseA` (:1328): shadow ack DIES; `lane_b_data_commit` publish
     DIES; `onPageOneResultsCommitted` (:1365) STAYS — THE seam, adapter unchanged at
     `use-search-root-submit-ui-results-presentation-ports.ts:34` →
     `handlePageOneResultsCommitted` (surface-transaction-runtime :986).
   - `scheduleResponsePostCommitUiSequence` (:1171): `resolveResponseActiveTab` (:466)
     MOVES to a resolver tab-adopt tuple write (cause `response_tab_adopt` — keep ONE
     writer); pagination patch (:525) MOVES; history/keyboard/scroll UI (:1277-1303)
     MOVES to a thin post-commit effect; lane_c DIES.
   - `scheduleResponseShadowSettleSequence` (:1061) — DIES (healthy-frame polling).
9. Single-restaurant/favorites suppression (:769-806) — MOVES to world metadata.

**Shadow readers outside the owners** (why two bus keys survive to S4):

- `SearchMapWithMarkerEngine.tsx:137-189` advances `lane_e_map_pins → lane_f_polish → idle`.
- `use-results-presentation-surface-transaction-runtime.ts:199-217, 429-435, 1004, 1025,
1040` — activeOperationId is the TRANSACTION-ID SOURCE for STA/variant-rerun enters
  (loud contract at :429 when null) — THE RISKIEST COUPLING: seam.beginResolution must
  publish `activeOperationId = 'world:'+generation` SYNCHRONOUSLY BEFORE
  beginSearchThisAreaPresentationPending/beginVariantRerunPresentationPending read it.
- stall-pressure/redraw-phase runtimes + close-cleanup use it as tokens.
  Resolver keeps publishing `activeOperationId` + reduced lane ladder (lane_a_ack at start →
  lane_b_data_commit at world commit → lane_e_map_pins; marker engine advances the rest).
  The shadow statechart (`search-session-controller.ts` + 4 adapters) dies.
  `isSearchRequestInFlightRef` readers (load-more guards, clear owner) → `resolver.isResolving()`.
  Resolver keeps writing `lastSearchRequestIdRef` at commit (profile auto-open reads it) until S4.
  Verify in S3a via trace: no legitimate submit relies on shadow REJECTION for dedupe
  (tuple idempotence replaces it).

## 2. New modules

- `ROOT/runtime/resolver/search-world-resolver.ts` — env: {searchRuntimeBus, runSearch,
  shortcutCoverage, getListResults, userLocationRef, getMarketKey, seam}. API: start()
  (subscribes ['desiredTuple']), resolve(tuple, generation, cause) (imperative kick for
  S3a), resolveNextPage(), isResolving(), cancel(reason).
  Ladder per generation: cache (both keys fresh-in-TTL ⇒ commit 'cache') → derivation
  (tab-only change = recompose with target tab's coverage entry; page-1 includeSimilar =
  relocated buildIncludeSimilarVariantResponse from response-owner :1828-1910) → network
  (PARALLEL independently-cached sub-fetches).
  Identity→fetch table: natural → runSearch natural payload from tuple (NO coverage lane
  today — keep); shortcut → runSearch structured + shortcutCoverage (includeTopDish =
  tab==='dishes') + sibling warm (relocated prefetchSiblingTabCoverage); entities →
  favoriteListsService.getListResults(listId…) (ADD listId/listType to the entities
  identity variant); entity → structured restaurants-entity payload (restaurant taps,
  absorbs applyRestaurantEntityStructuredRequest helper :71) or natural+submissionContext
  (food/attr taps, absorbs launchEntitySearchResults); profileSeed → LOCAL SYNTHESIS
  (single-restaurant world from seed; publishMapMarkerSource becomes resolver-internal).
  Generation semantics: sub-fetches always commit into cache; present iff
  generation === current desiredTupleGeneration. Partial failure: failed half's entry =
  'failed'; retry re-runs only that key.
- World cache: EXISTS (search-world-cache.ts, d543d58f) — extend value type per map
  (committedResponse, markerProjectionByTab, resultsIdentityKey, paginationMeta,
  coverageByTab; openNow short-TTL option).
- Resolver core: EXISTS (search-world-resolver-core.ts).
- `ROOT/runtime/resolver/search-world-presentation-seam.ts` — beginResolution /
  commitWorldToMountedState / failResolution. Commit body in ONE bus.batch, exactly the
  :1408-1502 order: (1) publishSearchMountedResultsDataSnapshot(+projections,+identity);
  (2) per-tab commitSearchMountedResultsCoverage; (3) surface-authority publish
  ('world_commit'); (4) root-bus results+pagination patch; (5) activeOperationId
  'world:'+generation + lane_b_data_commit + isSearchLoading:false. Then OUTSIDE the
  batch: onPageOneResultsCommitted({presentationIntentKind, dataReadyFrom,
  resultsDataKey, searchInputKey}) → unchanged adapter. Transaction machine stays sole
  presentation writer.
  Instantiation: replace useSearchSubmitOwner composition in
  `use-search-root-request-execution-authority-runtime.ts` (only instantiator of
  useSearchRequestRuntimeOwner).

## 3. Pagination

loadMoreResults/loadMoreShortcutResults → resolver.resolveNextPage(); guards read the
world's paginationMeta + isResolving(). Append payload built from the WORLD's identity
inputs (not live bounds; today's applyShortcutStructuredAppendRequestState pinning,
helper-owner :44) + searchRequestId from committedResponse.metadata. Result:
cache.appendVersion(cardsKey, merge with mergeSearchResponses + pagination derivation
:525). Same identity ⇒ NO choreography: seam steps 1,3,4,5 only (no
onPageOneResultsCommitted, no coverage refetch); isLoadingMore brackets. Appends landing
after a retoggle commit into the non-presented world and publish nothing. Natural append
rides the same path (kind-dispatched).

## 4. Strangler order (one writer per store per event at every sub-stage)

- **S3-pre:** async `captureFreshCommittedBounds` in the writer module; STA/rerun triggers
  await it BEFORE the tuple write. Add listId/listType to entities identity. Land
  resolver/seam modules dark.
- **S3a — chip-cause reruns:** in query-mutation-orchestrator (:160-193 area),
  runVariantRerunToggleCommit keeps clearStaged + beginVariantRerunPresentationPending
  but replaces fireRerunActiveSearch with resolver.resolve(tuple, generation, cause);
  seam emits the same onPageOneResultsCommitted with 'variant_rerun'. includeSimilar
  page-1 local swap moves into the derivation tier (delete applyIncludeSimilarLocalSwap
  threading). ALSO delete the bbf97e85 interim block (controller :3022-3037).
  ORDERING: seam.beginResolution publishes activeOperationId BEFORE the pending arm reads it.
- **S3b — initial submits (natural + shortcut incl. STA):** submit bodies reduce to the
  tuple write; resolver observes generation. prepareSearchRequestForegroundUi's surviving
  effects (presentation-intent start, keyboard dismiss, error clear) → seam.beginResolution.
  Delete natural/shortcut execution paths + coverage snapshot relay.
- **S3c — launches:** favorites, entity taps (both kinds), profileSeed (hydration writes
  the tuple; map write becomes resolver-internal). Pagination cutover.
- **S3d — deletion:** the 10 owner files (≈5,940 lines: submit-owner 442, entry 682,
  natural 262, structured 679, execution 893, response 1919, helper 118, action 156,
  request-runtime 714, preparation 694) + shadow controller/events/4 adapters (342) +
  the controller's post-response coverage fetch lane + snapshot refs. Ports files shrink
  to the seam adapter. Keep activeOperationId/Lane bus keys (resolver-published) until S4.

## 5. Traces/contracts to add (measure-only)

`[RESOLVE]` per generation {generation, cause, cardsKey, coverageKey, tier,
dedupedInFlight} · `[WORLD-COMMIT]` {generation, worldKey, version, dataReadyFrom,
counts, coverageStatusByTab, msFromTupleWrite} · LOUD world_subfetch_failed {half,
worldKey, willRetryOnlyHalf} · superseded-completion trace (proves A→B→A) · RED: second
commitWorldToMountedState for same (worldKey, version) is a violation (one structural
frame per world) · pinned-key eviction = loud impossible.

## 6. S3b-2 execution notes (design settled 2026-07-07, next window executes)

Scope: NON-APPEND natural submits WITHOUT submissionContext (manual typed searches +
natural STA). Context-carrying submissions (entity taps via launchEntitySearchResults /
autocomplete) stay legacy until S3c folds them into the 'entity' identity kind.

- **Discriminator in submitSearch:** `options?.submission?.context == null && !append` →
  resolver path; else legacy. prepareNaturalSearchEntry ALREADY writes the natural tuple
  (S2); reuse its write result (return {writeResult} from it or re-read bus state).
- **Foreground:** beginResolverSubmitForegroundUi({mode:'natural', targetTab:
  preRequestTab, submittedLabel: trimmedQuery, ...config}) in onResolutionBegan.
- **Tab adopt:** relocate `resolveNaturalResponseActiveTab` (response-owner :437) +
  `resolveSubmissionDefaultTab` usage into the resolver dir. In resolve()'s land path,
  natural identities compute adoptedTab from the LANDED response; if ≠ tuple.tab, ONE
  writeSearchDesiredTuple({tab}, 'response_tab_adopt') (add the cause to the contract)
  BEFORE presentEntry, and present with the NEW tuple (cardsKey is tab-agnostic so the
  entry still matches; the reader ignores non-chip causes).
- **Single-restaurant candidate:** `resolveSingleRestaurantCandidate(response)` (utils/
  response) becomes WORLD METADATA (value.singleRestaurantCandidate). The seam exposes it
  on onPageOneResultsCommitted... NO — keep the seam contract stable: add
  `value.presentation = {singleRestaurantCandidate}` and a thin post-commit effect in the
  submit owner (env.onWorldCommitted already exists) that replicates
  deriveSearchResponseDeferredUiProjection: hide the results sheet
  (resetSheetToHidden) when candidate != null && mode natural, and let the existing
  profile auto-open runtime (which keys off lastSearchRequestIdRef — already truthful)
  fire as today. Natural fetch does NOT fold coverage (no coverage lane for natural).
- **History push:** post-commit effect (onWorldCommitted): updateLocalRecentSearches(
  trimmedQuery) + loadRecentHistory — replicate scheduleResponsePostCommitUiSequence's
  history block (:1277-1303) for the resolver path only.
- **Natural STA bounds:** prepareNaturalSearchEntry still adopts SYNC service bounds (S2
  behavior). Upgrade to captureFreshTupleBounds when routing natural STA — the entry fn
  must become async or the STA trigger awaits capture before calling submitSearch (prefer
  the latter: rerunActiveSearch's natural branch awaits captureFreshTupleBounds() and
  passes bounds via a new SubmitSearchOptions.committedBoundsOverride consumed by
  prepareNaturalSearchEntry's tuple write).
- **includeSimilar variants:** natural resolver fetch already attaches tuple filters;
  effectiveIncludeSimilar reads the tuple (not the bus legacy key).
- Gates: tsc, jest, rig lane = typed query submit → reveal; qualifying single-restaurant
  query → sheet hides + auto-open; tab adopt on a dish-heavy query from restaurants tab;
  natural STA (pan + search-this-area on a natural session).
