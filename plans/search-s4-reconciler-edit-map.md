# S4 Edit Map — Reconciler + Reveal Statechart + (worldId, phase) Native Protocol (executable plan)

Produced 2026-07-07 by the S4 planning pass against the live tree (post-S3 complete, 0918f227). Parent: `plans/search-desired-state-architecture.md` §2/§5/§6/§7; style parent `plans/search-s3-resolver-edit-map.md`. `ROOT = apps/mobile/src/screens/Search`. All anchors verified on disk this pass.

S4 in one sentence: ONE reconciler subscribed to `desiredTuple` replaces the S2 chip reader AND every trigger-side `resolve()` kick; presentation intents become DERIVED from tuple transitions; the reveal statechart (already built pure at `ROOT/runtime/shared/search-reveal-statechart.ts`) replaces the surface-transaction machine; native renames to (worldId, phase) level-applies with ack-everything as mach-clock events; the legacy bus-key projections, fade-hold timers, and dual tab state die.

---

## 1. DIES / MOVES / STAYS (one chip toggle + one dismiss→resubmit traced)

Chip toggle trace (today, post-S3):

1. `toggleOpenNow` → `writeChipVariantTuple` (`ROOT/runtime/mutations/query-mutation-orchestrator.ts:302`) — **STAYS** (tuple write incl. settled-bounds adopt via `captureFreshTupleBounds`). This becomes the trigger's ONLY action.
2. The S2 thin reader (`query-mutation-orchestrator.ts:189-266`, chip-cause-scoped `desiredTuple` subscription) — **DIES**. The reconciler's subscription replaces it for ALL causes, not just chips.
3. `scheduleToggleCommit` → `runVariantRerunToggleCommit` (`:157-182`): `beginVariantRerunPresentationPending` + `resolveDesiredWorld(...)` — **DIES** as a trigger-side path. The resolver kick moves into the reconciler; the pending-cover arm becomes the statechart's `begin_cover` effect. The toggle coordinator's debounce/coalesce (`use-results-presentation-toggle-coordinator.ts`) — **DIES for network chips** (tuple overwrite + covered-episode monotonicity IS the coalescer; the charter bans debounce on tuple writes); its press-feedback haptics **MOVE** to the chip widget.
4. `seam.beginResolution` publishing `activeOperationId`/lanes (`ROOT/runtime/resolver/search-world-presentation-seam.ts:127-136`) — **DIES** (the transaction-id source dies with the transaction machine; `isSearchLoading` publish **MOVES** into the reconciler's covering entry).
5. `commitWorldToMountedState` structural batch (`seam.ts:186-242`) — **STAYS** as the arm-side store commit, but `onPageOneResultsCommitted` (`:243-254`) — **DIES**; the seam instead emits `world_ready {generation, worldId}` to the statechart. The represent-noop branch (`:154-184`) **MOVES**: re-assert of the presented world becomes the reconciler's `desire_matches_presented` (never reaches the seam).
6. `handlePageOneResultsCommitted` → staged transaction → gate ladder → runtime machine (`ROOT/runtime/shared/use-results-presentation-surface-transaction-runtime.ts`, whole file) — **DIES**. The 17-reason readiness ladder (`resolveResultsRevealBlockedReasons` :85-159), both watchdogs (:65-68 constants, :529-696), `beginSearchThisAreaPresentationPending` (:427-475, incl. the R0 null-operation contract), `beginVariantRerunPresentationPending` (:397-425), the deferred-stage frame scheduling (:957-974) — all structurally unrepresentable under the statechart (readiness is a data fact: prepared-rows store commit + native `armed` ack; nothing gates on layout).
7. Readiness SIGNALS — **STAY** as data facts rewired: `listPreparedRowsReady`/`preparedRows` store commits feed `world_ready`'s rows half; the native `sources_applied_hidden` ack feeds `armed_acked`. `markRedrawCardsReady`/redraw-transaction readiness bookkeeping in `ROOT/runtime/surface/search-surface-runtime.ts` — **DIES** (the circular redraw-phase chain measured in the perf fork dies here).

Dismiss→resubmit trace (task #16, dies structurally):

1. Dismiss: `use-search-clear-owner.ts:235-238` writes the tuple with cause `'dismiss'` (identity → idle) — **STAYS**. Everything after it (exit transport, `results_exit` snapshotKind driving `visualFrameTransaction.kind:'dismiss'` at `use-search-map-native-render-owner.ts:684-686`) — **DIES**: the reconciler classifies idle-identity as `session_exit` and the statechart drives it as a reveal of the IDLE world (`worldId:'world:idle'`, empty substrates). Dismiss and reveal share ONE (worldId, phase) register natively.
2. Resubmit: today the new enter's `visualFrameTransaction` can arrive while native still holds `lastDismissRequestKey` (Swift `:2844-2855` dismiss-in-progress bypass swallows it silently — no ack; `dismissSettleWorkItems`/`dismissFrameFallbackWorkItems` `:897-900` race the next frame; VA pins/labels stay in the unrevealed set). In S4 the payload has no dismiss key at all: a frame carrying `worldId:'world:W2', phase:'arming'` after `worldId:'world:idle'` is just a retarget; the reveal-during-dismiss wedge is unrepresentable in the payload shape (charter §6). Every frame acks (`accepted | superseded_by | dropped(reason)`), so even a superseded dismiss ramp is visible in the trace instead of a silent no-show.

## 2. New modules

### `ROOT/runtime/reconciler/search-world-reconciler.ts`

Env: `{ searchRuntimeBus, resolver (SearchWorldResolver), statechartHost, deriveViewInputs }`. Instantiated in `use-search-root-request-execution-authority-runtime.ts` (already the resolver's composition home; also the S3d execution authority — auto-open dedupe ref + dismiss cancel live here and become reconciler post-present effects). `start()` subscribes `['desiredTuple']` — the ONE subscription; nothing else in the codebase may subscribe to tuple changes for lifecycle (RED contract: a second `desired_tuple_*` listener label is a violation).

On each tuple change it computes the **transition class** from `(prevTuple, nextTuple, presentedWorldId, presentedTupleSnapshot)` — causes become trace LABELS only, never branching inputs (the owner directive: intents derived, not passed):

| Transition class (derived) | Condition (prev → next)                                                 | Statechart event                                                                                                  | Derived presentation intent                                                                                                                                                                                                                                                                           | Cover                    |
| -------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `session_enter`            | identity idle → non-idle                                                | `desire_changed`                                                                                                  | `initial_search`; `entrySurface` derived from identity kind (shortcut→pill, natural→input, entities→favorites, entity→tap, profileSeed→profile); `preserveSheetState:false`; `transitionFromDockedPolls` read from the poll-lane docked flag as a VIEW INPUT at transition time (not a trigger param) | full (`initial_loading`) |
| `session_replace`          | identity A → B, both non-idle                                           | `desire_changed`                                                                                                  | `initial_search` with `preserveSheetState := presentedWorldId != null` (an in-session identity swap keeps the sheet)                                                                                                                                                                                  | full                     |
| `variant_rerun`            | identity equal, filterVariant delta (bounds may co-change — chip adopt) | `desire_changed`                                                                                                  | `variant_rerun`, preserve sheet                                                                                                                                                                                                                                                                       | `interaction_loading`    |
| `area_rerun`               | identity+filters equal, committedBounds delta                           | `desire_changed`                                                                                                  | `search_this_area`, preserve sheet                                                                                                                                                                                                                                                                    | `interaction_loading`    |
| `tab_switch`               | only `tab` differs                                                      | `desire_changed`                                                                                                  | `tab_switch` (derivation-tier world; the statechart runs the same episode — cache/derivation hits make cover dwell ~0; `pendingTabSwitchTab` choreography dies)                                                                                                                                       | `interaction_loading`    |
| `retoggle_reversal`        | next tuple's worldId == presented worldId                               | `desire_matches_presented`                                                                                        | none (reversal effect)                                                                                                                                                                                                                                                                                | fade back in             |
| `session_exit`             | identity → idle                                                         | `desire_changed` targeting `world:idle`                                                                           | `dismiss`                                                                                                                                                                                                                                                                                             | fade to hidden           |
| `boot_seed`                | first write, nothing presented, identity idle                           | none (no-op)                                                                                                      | none                                                                                                                                                                                                                                                                                                  | none                     |
| `response_tab_adopt`       | resolver's own mid-resolution tab write                                 | `desire_changed` (episode extension — same cover, generation retarget; already idempotent per statechart :99-111) | inherit episode's intent                                                                                                                                                                                                                                                                              | inherited                |

After sending the statechart event, the reconciler kicks `resolver.resolve({tuple, generation, cause})` — `presentationIntentKind`, `onResolutionBegan`, `onResolutionFailed` are DELETED from `SearchWorldResolveArgs` (`search-world-resolver.ts:86-105`); failure flows through the statechart as a `world_failed` event (small statechart addition: `covering/covered/arming + world_failed → reversal-or-failed-state presentation`, per charter §3 failed-world rule — desired stays, chip shows error affordance). `requestDecoration` stays (analytics ride the request).

Foreground effects (`beginResolverSubmitForegroundUi`, `use-search-submit-entry-owner.ts:169-195` — keyboard dismiss, error clear, `isMapActivationDeferred`, tab set, `onPresentationIntentStart`) **MOVE** into the reconciler's per-class effect table (`session_enter/replace` run the full set; reruns run none of it). `setActiveTab` inside it dies (tab is already tuple state).

### `ROOT/runtime/reconciler/search-reveal-statechart-host.ts`

Holds `RevealPhase`, executes `RevealEffect`s from `transitionReveal` (pure machine unchanged, plus the `world_failed` extension above + model tests):

- `begin_cover` → native frame `(worldId: pending, phase:'covering')` + sheet cover mount + **collision membership OFF now** (fade-out start, min-dwell constant declared native-side).
- `reverse_to_presented` → native `(presentedWorldId, phase:'revealing')` from current opacity + collision ON.
- `arm_world` → seam's structural store commit (already done by the resolver by this point — the host applies the native source frame hidden: today's `hidden_preload` path in `use-search-map-native-render-owner.ts`).
- `open_joint` → native `(worldId, phase:'revealing')` + the O(1) sheet/cards/strip visibility flip (today's `commitSearchSurfaceResultsEnterPresentation` runtime-machine entry, kept as the flip primitive; its gating orchestration dies).
- `commit_presented` → reconciler `presentedWorldId ←`, bus publish `presentedWorldId`/`presentingPhase` (new bus keys replacing `activeOperationId`/`activeOperationLane` for the surviving token readers, §4).
- `contract_violation` → `reportSearchFlowContractViolation` (measure-only).

Event sources: `desire_changed`/`desire_matches_presented` from the reconciler; `world_ready` from the seam (rows committed + coverage terminal — a store fact); `fade_out_acked`/`armed_acked`/`reveal_acked` from the native ack events (§5). worldId convention: `buildSearchCardsWorldKey(tuple)`-derived id already used by the world cache; `'world:idle'` reserved.

## 3. Trigger-side simplifications (what remains)

- `submitViewportShortcut` (`use-search-structured-submit-owner.ts:132-207`) → reduces to: bounds adopt (`captureFreshTupleBounds` for STA / `captureCommittedBounds` otherwise) + ONE `writeSearchDesiredTuple`. The `resolveDesiredWorld` call, `beginResolverSubmitForegroundUi` closure, `onResolutionFailed` publish — deleted. `preserveSheetState`/`transitionFromDockedPolls`/`entrySurface`/`presentationIntentKind` options deleted from `RunBestHereOptions` (derived per §2).
- `runRestaurantEntitySearch` (`:60-130`), `launchFavoritesListResults` (`:209+`), `submitSearch` (`use-search-natural-submit-owner.ts:52-137`), entity taps, deep link, boot seed, dismiss (`use-search-clear-owner.ts:235`) → same reduction: tuple write only. `prepareNaturalSearchEntry` keeps its draft-validation + tuple write; its bus results-clearing block (`use-search-submit-entry-owner.ts:216-228`) moves to the reconciler's `session_enter` effects.
- Chips/price/tab (`query-mutation-orchestrator.ts`, `use-search-root-search-primitives-runtime.ts:190-199`) → already tuple writes; delete the reader + `resolveDesiredWorld` arg + `resultsRuntimeOwner` arg + `scheduleToggleCommit` threading. The orchestrator shrinks to draft management (price sheet) + tuple writes.
- Pagination: `resolver.resolveNextPage()` callers unchanged (appends are value versions, no choreography — statechart never sees them).
- profileSeed (the last lane-owned identity, chartered into S4): profile hydration writes `queryIdentity: {kind:'profileSeed',…}`; the resolver's derivation tier synthesizes the single-restaurant world zero-network (`search-world-fetch.ts` already carries the identity kind); the reconciler presents it with no sheet session (`isSearchSessionActive` derivation is already false for profileSeed in the writer — that rule moves into the tuple selectors, §4).

## 4. Legacy bus-key deletion — reader inventory and migration

The writer's projections (`search-desired-state-writer.ts:104-141`, `deriveLegacySearchMode` :30, `deriveLegacySubmittedQuery` :41) are deleted; the eight keys leave `SearchRuntimeBusState`. Migration is mechanical via a new **`ROOT/runtime/shared/search-desired-tuple-selectors.ts`** exposing the SAME semantics as tuple derivations (`selectSearchMode`, `selectSubmittedQuery`, `selectIsSearchSessionActive`, `selectActiveTab`, `selectFilterVariant`) plus a `useSearchDesiredTupleSelector` hook keyed on `['desiredTuple']` — readers change import + key list, not logic. Grep inventory (this pass, `ROOT`, excluding writer/bus/contract/spec):

- **`searchMode`** (~30 files): foreground submit/direct-submit/shortcut-sync runtimes, results-sheet interaction model, filter modal, freeze gates, shell/read-model builders, telemetry/instrumentation (6 files), `use-direct-search-map-source-controller.ts` (LOAD-BEARING: 'shortcut' selects the coverage frame projection — replace with `tuple.queryIdentity` kind test, same rule as `deriveLegacySearchMode` incl. the restaurant-entity + food/attr split), stall-pressure runtime, data-plane runtime. → selector.
- **`submittedQuery`** (~40 files): header read-models/title, editing/clear/submit foregrounds, presentation-owner state family (8 files), arrival runtime, on-demand query panel. → `selectSubmittedQuery`; the display-label rule stays exactly `deriveLegacySubmittedQuery`.
- **`isSearchSessionActive`** (~40 files incl. `runtime/native/search-chrome-scalar-*` producers): → `selectIsSearchSessionActive` (`identity.kind ∉ {idle, profileSeed}`).
- **`activeTab`** (~45 files: sectioned projections, list/chip read-models, mounted-results store, hydration publication, panel surface family): → `selectActiveTab` (= `tuple.tab`) for DESIRED reads (chips, pills); content reads (which tab's rows are mounted) already read the mounted snapshot's `activeTab` — the store field stays (it is presented state, world-scoped). `preferredActiveTab`/`hasActiveTabPreference` bus keys STAY (preference, not desire). The S3c "React activeTab synced at present" duality dies: components read tuple.tab; the presented tab lives only in the mounted snapshot.
- **`openNow` / `priceLevels` / `risingActive` / `includeSimilarActive`** (~15-20 files each: chip read-model builder, filters header, filter-chip bus-patch runtimes, filter modal owner, `SearchFilters.tsx`, filter-state runtime, panel filters state, overlay warmup, chrome-freeze): → `selectFilterVariant`. Chips keep reading DESIRED (optimistic) by construction.
- **Persist mirror** (`search-runtime-filter-state-store-bridge.ts`): `MIRRORED_BUS_KEYS` (:23-30) re-derives from the tuple — `attachSearchStoreRuntimeStateMirror` subscribes `['desiredTuple','preferredActiveTab','hasActiveTabPreference']` and writes the projected values through to zustand (write-through-only unchanged); seed path already writes the tuple.
- **`activeOperationId`/`activeOperationLane`**: the transaction-id role dies with the machine. Surviving token readers migrate to `(presentedWorldId, presentingPhase)`: `SearchMapWithMarkerEngine.tsx:137-190` (lane_e→lane_f→idle polish advance → keys off `presentingPhase:'revealing'→'idle'`), stall-pressure (`use-search-surface-redraw-stall-pressure-runtime.ts:65+`, per-episode token = worldId), redraw-phase transition runtime (dies with `search-surface-runtime` redraw transactions), close-cleanup (`use-results-presentation-close-search-cleanup-runtime.ts:68-86`, token = worldId). The lane ladder keys themselves are deleted after the marker engine migrates.

## 5. Native protocol delta

JS side (`ROOT/runtime/map/search-map-render-controller.ts`, `ROOT/components/hooks/use-search-map-native-render-owner.ts`):

- `SearchMapVisualFrameTransaction` (`render-controller.ts:415-427`) — the five request keys (`requestKey/visualCycleKey/readinessKey/shortcutCoverageRequestKey/markersRenderKey`) + `sourceFrameKey/sourceDataKey` collapse to **`worldId` + `phase` + `sourceSnapshotKind`** (`pending|ready|empty` stays — empty is a first-class reveal). `kind` (`bootstrap|hidden_preload|enter|live_update|dismiss|clear_hidden`, :405-411) and `deriveSearchMapVisualFrameTransactionKind` (`native-render-owner.ts:675-700`, derived from transport snapshotKind + bus `presentationPhase`) — DELETED; phase comes straight from the statechart host (`covering|covered|arming|revealing|idle`), never re-derived from transport state. `presentationStateJson` (transactionId/executionStage/coverState/startToken) shrinks to the (worldId, phase) pair + selection/highlight control state.
- Frame identity: `frameGenerationId`/`executionBatchId`/`frameTransportRevision` machinery (`native-render-owner.ts:940-1183`) — the transport queue STAYS (single-slot, synchronous main-thread apply is fine) but dedup keys on **(worldId, phase, sourceRevisions)** — never content. `SearchRuntimeMapPresentationPhase` (7-value bus enum, `search-runtime-bus.ts:35-42`) is replaced by the statechart's 5-phase enum published as `presentingPhase`.
- Acks: `NativeRenderOwnerSourceAck` (:952-959) + `render_frame_synced` are the seed — rename identity to worldId and add mach-clock timestamps as the ack time (fields already exist in `SearchMapRenderControllerSetRenderFrameResult`; the ACK EVENT must be the native emitter, not the JS promise). New/renamed events: `frame_acked {worldId, phase, disposition: accepted|superseded_by(worldId)|dropped(reason), nativeTimestampMs, stateSnapshot}` on EVERY payload including drops; `fade_out_acked` = the covering ramp reaching the dark floor (new native emit at ramp completion — today nothing acks fade-out); `armed_acked` maps from `sources_applied_hidden`/`sources_reused_resident`/`sources_cleared_hidden(empty)` outcomes; `reveal_acked` maps from `presentation_enter_started` (mach-stamped ramp start).

Swift side (`ios/cravesearch/SearchMapRenderController.swift`, 12.8k lines — targeted edits, not a rewrite):

- DELETE the silent-drop paths: dismiss-in-progress bypass (`:2844-2855`, `snapshot.dismiss_in_progress_bypass` `:2580`) and any JSON-equality/content dedupe on presentation state (`:1717` region) — replaced by (worldId, phase) idempotence: re-assert of the current pair = **acked no-op** (an empty→empty world transition with a NEW worldId still acks — kills empty-variant starvation).
- COLLAPSE `lastEnterRequestKey`/`lastEnterStartedRequestKey`/`lastEnterSettledRequestKey`/`lastDismissRequestKey` into one `(currentWorldId, currentPhase)` register; retarget algebra: any new worldId at any phase re-ramps from current opacity; a reveal assertion clears nothing because there is no dismiss key (task #16 dies here).
- DELETE the hold/heal timers in the same commit the inequality-hold is born: `interactionFadeHoldActive` + expiry heuristic (`:727-728, :1566-1567, :3114-3128`), `dismissSettleWorkItems`/`dismissFrameFallbackWorkItems` (`:897-900, :2956-3023`), `dismissSettleDelayMs` (`:180`) — hold = desired≠presented, lift = equality, driven entirely by phase levels from JS.
- Collision at fade START, both directions (owner directive): today collision restore runs at reveal PREROLL (`:6472-6485`) and release rides `presentation_visual_sources_collision_released` at exit settle. Move: membership OFF at the first `phase:'covering'` frame's ramp start; membership ON at the `phase:'revealing'` frame's ramp start; declared `collisionMinDwellMs` constant (RED-testable) protects the basemap crossfade from retoggle churn.
- RED instrument: periodic `read_state()` snapshot (worldId, phase, opacity) diffed against JS `presentedWorldId`/`presentingPhase` — divergence is a loud contract, never actuated on.

## 6. Strangler order (rig-validatable sub-stages, one presentation writer at each)

- **S4a — reconciler dark + intent-derivation parity.** Land reconciler + statechart host; reconciler classifies every tuple write and TRACES `[RECONCILE] {generation, class, derivedIntent}` next to the trigger-passed intent; RED contract on mismatch. Statechart runs shadow (events in, effects traced, none executed). No behavior change. Rig: full composite lane, zero mismatch lines across submit/STA/chips/tab/favorites/entity/dismiss/resubmit.
- **S4b — reconciler owns resolution.** Delete the S2 chip reader, all trigger `resolveDesiredWorld` calls, `beginResolverSubmitForegroundUi` (effects move per §2), resolver arg surface shrinks. Transaction machine still the presentation writer, driven by the reconciler through the EXISTING seam callbacks (temporary adapter: reconciler class → the machine's `beginVariantRerunPresentationPending`/staging entries, keyed by worldId-as-transactionId). Rig: S3 composite + torture lane (zoom/toggle/zoom/toggle/zoom-out/retoggle) — zero strands, chip stability.
- **S4c — statechart replaces the transaction machine (JS only).** Seam emits `world_ready`; host executes effects through an ADAPTER onto the existing native protocol (worldId → requestKey mapping; phases → today's `visualFrameTransaction` kinds) — still exactly one native writer, no native diff yet. DELETE: `use-results-presentation-surface-transaction-runtime.ts`, `search-surface-results-transaction.ts` coordinator, redraw-transaction runtime in `search-surface-runtime.ts`, both watchdogs, `pendingTabSwitchTab` lane, React-tab present-sync. Rig: joint gap ≤ 1 frame on `search_submit_dismiss_repeat`, empty-variant reveal, A→B→A reversal eyeball.

### S4c execution state (progressive slices, each committed green)

- **S4c-0 SHIPPED** (db58c719): `(presentedWorldId, presentingPhase)` published by the seam
  (`resolving` at beginResolution, `presented` at both commit paths, fail settles back onto
  the presented world). Lane ladder DELETED: `activeOperationLane`/`SearchRuntimeOperationLane`/
  `isMapActivationDeferred` + the SearchMapWithMarkerEngine polish-advance controller (provably
  dead — nothing published lane_e since S3d). Close-cleanup staleness token = episode token.
  `activeOperationId` now has exactly ONE reader left: the surface-transaction runtime itself.
- **S4c-1a SHIPPED** (ee830491): both reveal watchdogs deleted (−320 lines; log-only,
  perf-harness-gated). Runtime is now 871 lines.
- **S4c-1b NEXT — tab_switch rides the reconciler.** Today's lane
  (`use-results-presentation-tab-toggle-runtime.ts`): pill tap → toggle coordinator debounce →
  commit = commitTabChange (setActiveTab writes the tuple, cause `tab_toggle`) + clearStaged +
  `beginRedrawTransaction({reason:'toggle', targetTab})` + stage(enter tx, mutationKind
  'initial_search', dataReadyFrom 'cache'). Move the choreography INTO the reconciler's
  `tab_switch` branch (mirror of `kickRerunThroughCoordinator`, kind 'tab_switch'): the pill's
  tap becomes a pure tuple write ({tab}, cause tab_toggle) exactly like chips in S4b; the port
  gains a stage/redraw entry (or reuse beginVariantRerunPresentationPending? NO — tab stage is
  dataReadyFrom 'cache' with immediate stage, not response-keyed; add
  `beginTabSwitchPresentation(intentId, targetTab)` to the port). commitTabChange side effects
  (setActiveTab/setActiveTabPreference/pendingTabSwitchTab:null) become the branch's foreground
  effects via the view-inputs port. `pendingTabSwitchTab` optimistic hint keeps its writers
  (coordinator overlay publish) until S4e turns it into a tuple-vs-presented selector.
  GOTCHA: net-zero burst must still re-reveal (press-up fade dimmed markers) — the coordinator
  handles this today by always staging when session active; preserve by classifying net-zero
  as boot_noop at the tuple level BUT the coordinator's overlay/debounce still fires — keep the
  always-stage behavior inside the port implementation, not the classifier.
- **S4c-1b DESIGN CRUX (found on-code 2026-07-07): desired tab ≠ presented tab.**
  `setActiveTab` (use-search-root-search-primitives-runtime.ts:188) IS the tuple writer
  (cause `tab_toggle`) and the S2 writer projects `activeTab` in the SAME publish — but the
  rows/sheet read React `activeTab`, so a tap-time tuple write would swap the sheet BEFORE
  the coordinator's cover arms (visible flash). Today this is hidden because the tab lane
  defers `setActiveTab` into the coordinator's debounce commit. The ideal shape:
  1. `activeTab` becomes the PRESENTED tab — written ONLY by the presentation path (the
     tab-switch commit body + the seam's world commit `activeTab` arg + response adopt),
     never projected from the tuple write.
  2. The pill tap = pure tuple write ({tab: next}, cause tab_toggle) + setActiveTabPreference.
     `pendingTabSwitchTab` becomes derivable (tuple.tab ≠ presented activeTab) — keep the
     bus key as a projection until S4e, published by the writer (tuple.tab≠activeTab at
     write time → pendingTabSwitchTab: tuple.tab).
  3. Reconciler `tab_switch` branch → port.scheduleToggleCommit(kind 'tab_switch'); commit
     body re-reads CURRENT desire: presentTab = desiredTuple.tab; if presentTab ≠ activeTab
     → setActiveTabProjection(presentTab) (a DIRECT bus publish of activeTab +
     pendingTabSwitchTab:null, NOT the tuple writer) + clearStaged + beginRedrawTransaction
     ({reason:'toggle', transactionId:intentId, targetTab:presentTab, coverState:
     'interaction_loading'}) + stage(enter, 'initial_search', 'interaction_loading', null,
     'cache'). If equal (net-zero burst) → same staging WITHOUT the tab publish (re-reveal
     only, markers were dimmed by press-up).
  4. Idle-session tab writes (queryIdentity idle → classifier hits the idle branch first):
     the WRITER must still project activeTab directly when no session is active (home-screen
     pill has no choreography) — i.e. the writer's activeTab projection becomes conditional:
     `isSearchSessionActive ? defer-to-presentation : project-now`.
  5. Callers of setActiveTab that mean "present now" (worldPresentedEffects
     setActiveTab(tuple.tab), enter foreground effects) switch to the direct projection
     publish — they are presentation-path writers, not desire writers.
  6. DELETE after wiring: use-results-presentation-tab-toggle-runtime.ts, the
     scheduleTabToggleCommit plumbing chain (results-presentation-owner-contract →
     filters-header runtime), commitTabChange.
     Rig acceptance: tab toggle = identical choreography (press-up fade → cover → swap →
     reveal), net-zero burst re-reveals, rapid odd-count burst lands once on the target tab,
     home-screen pill (idle) swaps instantly with no cover, response tab adopt unaffected.
- **S4c-1c — the statechart proper (the big cut).** Re-key the level-triggered gate by worldId:
  - Seam's `onPageOneResultsCommitted` becomes the `world_ready` event into a new
    `search-world-presentation-host.ts` (runtime/reconciler/): on reconciler-begin it arms
    cover + redraw keyed by worldId; on world_ready it stages data-keyed; `maybeCommit` gate
    inputs are UNCHANGED (rows prepared/hydration/map-sources/visual-reveal triple — they are
    the composite readiness, keep them); finalize clears + publishes presentingPhase phases.
  - DELETE from the 871-line runtime: pendingPageOneResultsCommitRef merge lane,
    pendingStageTransactionRef, recoverablePreparedRowsDataKey recovery lane (cache worlds
    now always carry expectedResultsDataKey from the seam), beginSearchThisAreaPresentationPending's
    activeOperationId read (worldId comes from the reconciler), the 2-frame deferred stage
    (measure first — it existed to let the cover mount before staging).
  - `search-surface-results-transaction.ts` coordinator survives as the pure gate but keyed
    by worldId; transactionId == worldId end-to-end (the adapter maps worldId → requestKey
    for the native protocol; S4d deletes the mapping).
  - Four remaining `activeOperationId` consumers inside the runtime die with it; the key is
    then write-only from the seam → delete the key (S4e can be early for this one).
- **S4c-1d — redraw-transaction re-key.** `getSearchSurfaceRuntime().beginRedrawTransaction`
  - readiness triple (cardsReady/sheetReady/nativeMarkerFrameReady) stay (they ARE the
    composite reveal gate) but the id becomes the worldId; the redraw-phase instrumentation
    web (searchSurfaceRedrawCoordinator, ~30 files) is untouched — it reads its own coordinator.
- **S4c-1e — profileSeed zero-network synthesis** through the resolver (last lane-owned
  identity), then S4d.
- **S4d — native protocol.** (worldId, phase) payload + ack-everything mach-clock events + dedupe/dismiss-swallow/hold-timer deletions + collision-at-fade-start, all in ONE commit (never both hold regimes alive). Delete the S4c adapter. Rig: dismiss→resubmit VA-pin lane (task #16 acceptance), joint ≤ ~250ms post-commit on the matched drive, `read_state()` divergence silent.
- **S4e — legacy key deletion.** Selectors module in; migrate the §4 inventory per key (one commit per key is fine — each is independently green); delete the writer projections + the eight bus keys + `activeOperationId`/lane keys after the marker-engine/token migrations. Rig: chip render parity, persist round-trip (cold start filters), tab pill.

## 7. Deletion ledger (estimated)

- `use-results-presentation-surface-transaction-runtime.ts` (1,191) + `search-surface-results-transaction.ts` coordinator + enter-transaction execution runtime + redraw-phase/stall-pressure transaction plumbing + machine enter/exit transports (~3,500–4,500 lines).
- S2 reader + trigger resolve-kick threading + `beginResolverSubmitForegroundUi` + intent option plumbing across 4 submit owners (~600–900).
- Writer projections + 8 bus keys + `deriveLegacy*` + per-reader key-list shrink (~400 net, ~150 files touched mechanically).
- Native-owner `visualFrameTransaction` derivation + presentation-phase derivation + frame-kind machinery (~500–800 JS); Swift: dismiss bypass, dedupe, hold/heal timers, dismiss work-item maps, request-key registers (~600–1,000).
- Charter's S3+S4 total (~12–18k) holds: S3 deleted ~7.4k; S4 lands ~5–7k.

## 8. Riskiest couplings (named)

1. **The transaction-id economy.** `activeOperationId` is read as a token by the marker engine, stall-pressure, redraw-phase, and close-cleanup (§4). S4c must publish `(presentedWorldId, presentingPhase)` and migrate all four BEFORE deleting the lane ladder, or pin polish/cleanup silently key off null (the S3 map's riskiest coupling, inverted).
2. **`fade_out_acked` does not exist natively yet.** The statechart cannot leave `covering` without it; S4c's adapter must synthesize it from the existing enter/exit transport events, and S4d must emit it at the real ramp floor — get the synthesis wrong and every reveal wedges at `covering` (loud, but a full stop).
3. **Represent-noop vs (worldId, phase) idempotence.** The seam's on-screen re-assert skip (`seam.ts:154`) and the native pair-dedup must agree on worldId identity or a resubmit acks natively but never flips JS visibility (task #16's shape re-created one layer up). One worldId builder, imported by both.
4. **Intent derivation vs `preserveSheetState` edge cases.** Deep-link enter while a session is live, favorites launch (collapse suppressed), and docked-polls transitions are the three lanes where derived ≠ passed is plausible — S4a's parity trace exists precisely to catch them before S4b flips.
5. **Collision min-dwell vs retoggle churn.** Flipping at fade START both directions with a reversal mid-ramp can thrash basemap label crossfade; the declared dwell constant must be honored by the REVERSAL path too (RED test: cover→reverse within dwell emits one membership flip, not two).
6. **Tab-switch cover feel.** Folding `pendingTabSwitchTab` into the generic episode changes tab-toggle timing (today it has a bespoke light lane). Derivation-tier hits should make cover dwell ~0, but this needs an explicit rig eyeball, not just green contracts.
