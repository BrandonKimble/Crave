# Search Flow — the source-agnostic trigger/reveal/dismiss spine (step 2)

**Status:** designed 2026-07-05 from a 3-mapper grounding pass (triggers · origin/stack ·
reveal timing), all findings file:line-verified against current `main`. Step 2 of the
sequencing (after `plans/page-registry.md`, before toggle-primitive extraction).

**The requirement (owner):** one search flow, agnostic to its trigger source. From anywhere —
search bar, shortcut, favorites list, poll-comment entity tap, another user's shared list —
the SAME flow runs: press-up reactive, sheet content swaps in place (never a second sheet),
snap adjusts per flow kind, map pins/coverage load, and the **cards reveal exactly when the
map items START fading in — gated on BOTH being ready, and not a ms later than that**.
Dismiss is equally agnostic: map items start fading OUT on press-up, and the content pops
back to the EXACT trigger origin (page + scroll + snap + anchor), one stack level at a time.

---

## 0. Grounded reality — what already exists (do not rebuild)

**Triggers already converge.** Every trigger path funnels into ONE executor:
`ResultsSurfaceEnterTransactionExecutor` (`use-search-surface-results-enter-transaction-execution-runtime.ts:35`).
The submit-owner API surface (`use-search-foreground-interaction-runtime-contract.ts:23`) already
has `submitSearch` / `submitViewportShortcut` / `rerunActiveSearch`, plus launch-intents
`launchFavoritesListResults` (favorites-as-search IS built — `BookmarksPanel.tsx:541`) and
`launchEntitySearchResults` (poll entity taps — `PollDetailPanel.tsx:967`, with `childAnchor`
return-to-comment). Snap rules already match the registry contract (`preserveSheetState`
→ in-place; else `middle`).

**The child stack is built.** `overlayRouteStack` is an unbounded array with same-key
re-entry (`userProfile(A)→userProfile(B)` = two entries), pop-exactly-one
(`closeActiveRouteState` slices one), nav-tab invariance (nav follows `rootOverlayKey`),
and the §3 nav rule is already structural (`resolvePresentationLaneKind`,
`app-route-presentation-frame-contract.ts:98`).

**The readiness gate exists — for cards only.** `canCommitReveal = cardsReady ∧
nativeMarkerFrameReady ∧ sheetReady` (`search-surface-runtime.ts:170-195`) gates
`canAdmitResultsBody`, with 800/1200ms watchdogs. The map fade-in, however, starts
unconditionally when the reveal request reaches native — so map and cards desync by
0–160ms+. Native already has both signals we need: `reveal_generation_ready`
(catalog projected under cover = ready-to-START) and `presentation_toggle_settled`
(ramp COMPLETE).

## 1. The gaps (all of step 2 is these four)

| #   | Gap                                                                                                                                                                                                                                                                               | Where                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| G1  | **No both-ready reveal joint.** Map fade starts unconditionally; cards gate independently. Owner wants cards-admit == map-fade-START, both-ready.                                                                                                                                 | `search-surface-runtime.ts:170` + `SearchMapRenderController.swift` reveal arm |
| G2  | **Dismiss fade is not universal.** `beginInteractionFadeOut()` fires on toggles + search-this-area; other dismiss paths (child close from favorites-launched results, etc.) never fade the map on press-up.                                                                       | `armDismissMotion` (`search-surface-runtime.ts:740`) vs `closeActiveRoute`     |
| G3  | **Origin capture is global, not per-entry.** Stack entries are `{key, params}`; one origin per dismiss. Nested flows (profile→followers→profile→list) restore wrong. Rich re-push exists only for pollDetail (`resolveChildOriginRePush`).                                        | `app-route-scene-switch-controller.ts:285-310`, session-state-controller       |
| G4  | **Trigger-specific coupling on top of the shared executor.** `prepareSubmitChrome` variants, `entrySurface` micro-behaviors, `shouldPrepareShortcutSheetTransition`, launch-intents on a side path. Works, but a NEW source today means learning five idioms. Plus: no pick mode. | submit-owner runtimes                                                          |

## 2. Design decisions

### D1 — The synchronized reveal joint (G1): START-sync, both-ready, JS owns the gate

> **⚠️ PHASE-1 SCOPE CORRECTION (2026-07-05, pre-build ground pass):** the ENTER lane
> already HAS this joint — do NOT rebuild it. In
> `use-results-presentation-marker-enter-runtime.ts:46-93`: `nativeMarkerFrameReady` is
> marked at native **mounted-hidden** (ready-to-START, not ramp-complete — the mapper's
> "settled" reading was the toggle lane's naming), the native start request is **gated on
> `canAdmitResultsBody`** (the 3-way joint) with a pending-flush on surface change
> (:115-122), and `markEnterNativeStartRequested` flips `coverState:'hidden'` in the SAME
> transition (enter-completion-transport.ts:21-30) — cover lift and ramp start are already
> atomic. Native holds the ramp until the JS-published `enterStartToken`
> (`SearchMapRenderController.swift:5721-5731` `startEnterPresentationIfReady`).
> **Phase 1 therefore starts with ATTRIBUTION, not code:** timestamp-probe the real lanes
> (fresh search enter · favorites-entry · toggle redraw · search-this-area rerun) —
> native `presentation_enter_started.startedAtMs` vs the JS cover-hide/cards-admit tick —
> and fix the lane(s) that actually diverge (suspects: the toggle/rerun lanes, which ride
> `beginInteractionFadeOut`/`reprojectCatalogUnderCoverIfReady` OUTSIDE this machine, and
> any gap between `coverState:'hidden'` and painted pixels). The D1 mechanism below remains
> the TARGET SHAPE for whichever lane lacks it.
> Probe recipe: arm scenario → `trigger` via `submit_shortcut_restaurants` / favorites
> `open_overlay_scene`+list tap / `toggle_tab` → grep `presentation_enter_started`,
> `markEnterNativeStartRequested`, `[pageswitch]` cover events; compare timestamps.

Owner's words are explicit: cards reveal when map items **start** their fade-in, gated on
both ready. So:

- **"Map ready to reveal" = `reveal_generation_ready`** (under-cover catalog projected +
  first QRF done), NOT ramp-complete. Redefine `nativeMarkerFrameReady` to this signal.
- **The joint** stays where the 3-way gate lives (`selectSearchSurfaceVisualPolicy`): when
  `cardsReady ∧ sheetReady ∧ mapReadyToReveal` first becomes true, ONE commit does BOTH on
  the same tick: (a) JS → native `commitReveal(requestKey)` — native starts the 160ms
  presentation ramp; (b) `canAdmitResultsBody` flips — cards paint. Native ARMS the reveal
  (preroll, under-cover work) as today but does NOT start the opacity ramp until
  `commitReveal`.
- **Watchdogs keep their job** (never hang): tier-1 force-flags map-ready, tier-2
  force-commits — both now force the JOINT, not just the cards.
- **Anti-lying guardrail:** two mach-clock emits — native logs `revealRampStartMs`
  (first ramp tick), JS logs `cardsAdmitMs` (admit flip) — and the contract
  `|revealRampStart − cardsAdmit| ≤ 1 frame` is asserted in the harness run, with a
  self-mutation (delay the commitReveal dispatch 100ms) proving it can go RED.
  `presentation_toggle_settled` keeps meaning ramp-complete (finalize/cover-teardown).

### D2 — Universal press-up dismiss (G2)

`closeActiveRoute()` / every dismiss entry point calls `beginInteractionFadeOut()` on
press-up when (and only when) the closing surface owns live map content (results/listDetail
lanes; plain children like settings/userProfile don't touch the map). One rule, lane-derived
— not per-call-site. The pop/restore continues in parallel; the fade never waits for it.

### D3 — Per-entry origins (G3): the stack entry grows an `originCapture`

`OverlayRouteEntry` → `{key, params, originCapture?}`. Capture at `pushRouteState()` via the
existing origin-capture-registry (a scene without a rich provider gets the degenerate
capture — always safe). `closeActiveRoute()` restores FROM the popped entry's capture.
Extend `resolveChildOriginRePush` with `userProfile`/`listDetail`/`followList` branches
(params re-push, like pollDetail's comment anchor). Acceptance flow: push
restaurant → userProfile(A) → listDetail → userProfile(B); three pops restore B's, A's,
restaurant's origins in order, nav tab never moves.

### D4 — The trigger contract (G4): `openSearchFlow`, a thin façade — not a rewrite

One typed entry point wrapping the EXISTING executor:

```ts
openSearchFlow({
  source:  // provenance + chrome variant, replaces entrySurface sprawl
    'searchBar' | 'shortcut' | 'favoritesList' | 'entityTap' | 'sharedList' | 'command',
  request: // exactly one
    | { kind: 'query'; query: string }
    | { kind: 'structured'; targetTab; label }
    | { kind: 'entities'; entityIds; label }        // favorites / shared lists
    | { kind: 'entity'; entityId; entityType; label } // poll entity taps
    | { kind: 'rerun'; presentationIntentKind },      // search-this-area class
  origin?: { childAnchor? },   // per-entry capture happens at push regardless
  selection?: { mode: 'navigate' } | { mode: 'pick'; onPick },  // pick mode (registry §4)
})
```

Existing runtimes become one-line delegates; behavior is preserved (this is convergence,
not migration risk). **Pick mode** threads through the search-mode select-transition: same
UI, same transition; `mode:'pick'` returns the selection to the requester and closes back —
no search flow, no page switch (listDetail "Add places" is the first consumer).

### D1a — EMPIRICAL DEFECT LEDGER (2026-07-05, isolated rig `Crave-flow`, all measured)

Phase-1 attribution ran headless (arm scenario → camera/market → `submit_shortcut_restaurants`
→ `toggle_tab&routeParam=…`×3; probes `[REVEALSYNC]` `[SRINULL]` `[T4DEDUP]` `[SRCPROJ]` in
`/tmp/crave-flow-metro.log`). Findings, most severe first:

1. **Toggle-BACK breaks the map source (root of T4 + the "MapLoad = env" myth).** Reproduced
   2/2 clean runs: toggle dishes→restaurants emits `cardsAdmit` but NEVER `rampStart`; 3 log
   lines later native throws `MapLoad error: "Failed to add duplicate feature to GeoJSON
source"` + `"Failed to remove non-exist feature"`. JS's delta bookkeeping vs the actual
   native source content DIVERGES on the cached-tab path → mutation rejected → enter never
   arms → source corrupts incrementally → repeated toggles kill the map entirely (0 markers,
   the state past sessions misdiagnosed as an environment failure needing relaunch).
2. **~300ms JS-thread stall at toggle commit (T1, measured).** `frameMs: 303.7`, `floorFps:
3.3` sitting exactly between `cardsAdmit` and `rampStart` → toggle Δ = 105–111ms
   (reproducible; enter lane Δ = 1.9–6.4ms passes). Tracked spans account for only ~53ms —
   the burner is untracked synchronous work in the commit window.
3. **Silent submit failure.** 2 of 3 command-driven submits produced NO `MOUNT-PUBLISH`
   (response never committed) with zero error surface — everything downstream no-ops
   silently (`noSri` guard publishes `ready:false` forever, unlogged before our probe).
4. **Frame-republish churn.** `[T4DEDUP]` shows both tabs' frames re-published (and
   suppressed as byte-equal) roughly every second at idle — a subscription loop.
5. **Identity-key proliferation** (`searchRequestId`/`requestKey`/`transactionId`/
   `readinessKey`/`pvck`/`executionBatchId`/`frameGenerationId`…) with silent no-op guards at
   each translation — the mechanism behind 1–3 being invisible until instrumented.

6. **Pagination BROKEN — reproduced + attributed 2026-07-05 (two stacked defects).**
   (a) FIXED: the anti-auto-load gate (`hasUserScrolledResults`) was permanently closed —
   the gesture-handoff scroll container produces NO native drag events (finger on the
   sheet's GestureDetector; worklet-driven scroll), so `markResultsListUserScrollStart`
   never fired. Fix: new `onUserListScrollActivity(offsetY)` transport signal from the
   list's live onScroll (≥100px threshold preserves the anti-auto-load intent; drag events
   still mark too when the sheet is expanded and the list owns the gesture).
   (b) ✅ FIXED 1a25b52c: load-more trigger derived from the scrollOffset SharedValue
   (useAnimatedReaction → runOnJS; the Reanimated handler MUST stay the direct onScroll
   prop — a JS wrapper throws). PROVEN end-to-end on-sim: page-2 API call + append 20→40
   rows both tabs; spurious reveal-time zone entry correctly gate-blocked. New
   `scroll_results&offsetY=` command verb (Maestro swipes are handoff-consumed, ~35px net).
   Historical note — the original (b) finding: FlashList `onEndReached` never fires from handoff scrolling (only as
   reveal-time layout artifacts at offset≈0; raising onEndReachedThreshold 0→0.5 did not
   produce firings; PAGDBG-verified across 3 drives). The R2 pipeline should derive the
   pagination trigger from the offset signal (contentOffset/contentSize distance-from-end
   in the body's onScroll wrapper) instead of FlashList's event — same move as (a):
   replace dead gesture-era events with live owned signals. Repro lever: `maestro/perf/flows/search-results-scroll-repeat.yaml`
   (cards scroll → `loadMoreResults` → `/search` page-2 append). Suspects to check when
   attributed: the page-1-only client cache gate, append-merge in the response owner, and the
   identity key's page/count factors (R1b preserved these semantics deliberately). Schedule:
   attribute right after R1c, before R2 (R2 rebuilds the commit path pagination rides).

**Owner directive (2026-07-05):** don't patch this shape — audit the entire data/logic flow
(calls, stores, projection, pagination, map-vs-cards split, toggle evolution since the
`2ca844dd` "good era") and produce an ideal-shape verdict: refactor vs ground-up redesign.
Audit running (3 agents: data-flow architecture · git archaeology · API call semantics);
synthesis lands in this doc as §D6.

### D6a — T1 STALL ATTRIBUTED (2026-07-05, measured; the R2-C design input)

Toggle commit window ≈ 490ms, partitioned by [T1DBG] marks (probes committed as the R2
measurement kit): **~150–175ms inside the coordinator runner** (pre-projection; internals
still coarse) + **~250–290ms React child-commit rendering the incoming tab's visible dish
cards (~30–50ms/card, cardRender-counter confirmed)** + rowsPrepare/listData/projection all
<5ms (innocent). The catalog rebuild was already eliminated (R1a-2). **R2-C remedy: prewarm
the secondary list under cover (the primary/secondary list infrastructure already exists) so
the tab swap is a pointer flip — evicting the card render from the commit window entirely —
plus attribute the runner's ~150ms interior with one more mark pass.**

### D6 — FULL-FLOW AUDIT VERDICT (2026-07-05): keep the call layer, REBUILD the middle

Owner-directed audit (4 agents: data-flow · git archaeology · API semantics · identity keys)

- the D1a empirical ledger. Full agent reports in the session transcript; conclusions:

**The CALL layer is well-designed — keep it.** Dual-list response (both axes in one call →
zero-network tab toggle, confirmed in code), coverage deliberately filter-free (dots = the
universe; filters shape results only), skip-LLM entity/favorites launches, sibling-tab
coverage prefetch (`use-direct-search-map-source-controller.ts:2669`), page-1 client cache.
Claimed frictions — **verified against code 2026-07-05 before R1**: bounds-missing-from-cache-key
is REFUTED (both caches include bounds: `normalizeParams` keys it; `buildSearchCacheKey`
stringifies the full payload, `search.ts:167`); coverage already bounds-buckets its requestKey.
The one SURVIVING friction: filter-burst races (overlapping `rerunActiveSearch` calls
unserialized) — fold into R2's coordinator (the restarting debounce serializes them by design).

**The MIDDLE layer (response-commit → native bridge) is accreted — rebuild it.** Evidence:

- **13 identity-key types** (`searchRequestId`→`sectionedSearchRequestId`→`resultsHydrationKey`
  →`readinessKey`; `transactionId`; `executionBatchId`/`frameGenerationId`; `visualCycleKey`;
  `markersRenderKey`; …) with translation hops, **8 of whose mismatch guards silently no-op**
  (census in the identity-key audit) — the mechanism behind every D1a defect being invisible.
- **Archaeology:** the March "good era" (`2ca844dd`) was ONE 268-line coordinator: press-up →
  restarting 300ms debounce → runner once → visual-sync → finalize, linear, one clock.
  `e11f6202` (Apr 9, the frost split) deleted the debounce + split it into today's 3-file
  ref-callback choreography; June–July added a PARALLEL toggle path (`beginInteractionFadeOut`
  - under-cover reproject) beside the canonical enter machinery — the plan's own
    `07-IDEAL-ARCHITECTURE-INVESTIGATION.md` already concluded that parallel path IS the bug
    surface, and `cb97686f` (canonical-swap) started the unification but stopped.
- **Native-truth divergence (D1a #1):** the frame port dedups against cached-per-tab
  baselines, not against what the native source actually holds → toggle-back computes wrong
  deltas → `duplicate feature`/`non-exist feature` → progressive source corruption.
- **Marker catalog computed TWICE** (store-hop audit): `buildMarkerCatalogReadModel` in the
  data store AND `collectSearchMapVisualCandidates` re-dedup/re-rank in the 3300-line map
  source controller — card order ≠ marker order whenever tie-breaks drift.
- **Filter state dual-sourced:** zustand `searchStore` AND `searchRuntimeBus` both hold
  `openNow`/`priceLevels`/`activeTab`; updates are not atomic (orchestrator syncs on
  explicit toggles only).
- CORRECTION to an earlier live hypothesis: cards and map DO read the same committed
  snapshot on the happy path — the "cards without store" runs were silently-failed submits
  where nothing had data (defect #3), not a second source.

**THE IDEAL SHAPE (one pipeline, one key, loud contracts):**

```
SearchIntent (openSearchFlow, D4)
  → call layer (unchanged) → SearchResponse{dishes, restaurants, meta}
  → ONE ResultsState commit (single store; cards AND map read the SAME commit;
    identity = searchRequestId:page threaded end-to-end — kill the translations)
  → derived projections (card rows · marker catalog · source frames) — pure functions of
    ResultsState + {activeTab, filters, camera}; a toggle = variant-select, NOT a new pipeline
  → ONE presentation machine (the canonical enter path): enter / toggle-swap / rerun /
    dismiss are all "fade → commit variant under cover → both-ready joint → reveal";
    coordinator restored to the March shape (single file, restarting debounce, seq guard)
    — this IS the TR5 portable toggle primitive of step 3
  → native bridge with ACKNOWLEDGED deltas: dedup/delta computed ONLY against the last
    native-acknowledged applied state (seq-numbered), never a JS-side cached belief
  → contracts: every key-mismatch/no-op guard logs a reason in dev + emits a contract event;
    ready:false always says WHY; a silent no-op is a build failure of the design
```

**Verdict: focused REBUILD of the middle layer** (not refactor-in-place, not total rewrite —
the call layer, native renderer, and the enter machine's core survive). Reasons: (1) the
defect classes are structural (parallel paths, belief-vs-truth dedup, key translation maze) —
each patch adds a 14th key; (2) the owner's step-3 toggle primitive REQUIRES the single
coordinator anyway; (3) archaeology shows the target shape already existed twice (March
coordinator; July canonical-swap direction) — this is convergence with proof, not invention.

**Rebuild phases (each committed + measured before the next):**

- **R0 — loud contracts (cheap, immediate):** convert the 8 silent guards to logged contract
  events; keep [REVEALSYNC]/[T4DEDUP]/[SRINULL] probes as permanent dev telemetry.
- **R1 — one ResultsState:** fold search-mounted-results-data-store into the single commit
  both consumers read; thread `searchRequestId:page`; delete key translations. Also the call
  frictions: bounds→cache key, coverage debounce, serialize filter reruns.
- **R2 — one presentation path:** toggle/rerun/filters ride the canonical enter machinery
  (variant-select under cover); delete the parallel reproject path; restore the single-file
  restarting-debounce coordinator (= TR5 primitive). Fixes T1's stall window by moving the
  variant commit off the interaction frame (measure!).
- **R3 — acknowledged deltas:** native acks each applied source mutation (seq); JS deltas
  diff against acked state only → structurally kills duplicate/non-exist corruption.
- **R4 — the measurement gate:** REVEALSYNC ≤1 frame on ALL lanes incl. toggle-back (p90
  over 20 runs), zero MapLoad errors across a 50-toggle torture run, stall p95 < 32ms at
  commit, plus RED self-mutations for each contract.

### D5 — Command-bus verbs ride along (methodology phase-0)

- `trigger_search` → `openSearchFlow({source:'command', ...})`, ack + `{transactionId}`.
- `dismiss_search` → the universal dismiss; ack.
- `read_search_state` → `{phase, canAdmitResultsBody, readiness triple, revealRequestKey,
stackDepth, activeSceneKey}` — the honest "what state am I actually in" read.
  Verification of every phase below uses these + the painter probe + the D1 timing emits —
  never the command ack alone (lesson: the stub pass's green-ack-wrong-screen).

## 3. Build phases (each lands committed + sim-verified before the next)

**Phase 1 — The reveal joint + universal dismiss (G1+G2, the feel prize).**
Native: split arm vs start (`commitReveal`), emit `revealRampStartMs`. JS: redefine
`nativeMarkerFrameReady`→ready-to-start, single-tick joint commit, watchdog re-point;
lane-derived dismiss fade in `closeActiveRoute`. Verify: mach-clock subtraction
(`touchUp→fadeOutStart` on dismiss; `|rampStart−cardsAdmit|`) over 10 runs via the
command verbs; self-mutation proves RED.

**Phase 2 — `openSearchFlow` façade + verbs (G4 minus pick).**
Introduce the type + delegate the five existing runtimes; add `trigger_search`/`dismiss_search`/
`read_search_state`. Verify: every legacy trigger drives byte-identical transactions
(replay each entry surface via Maestro id-taps + verbs; diff the transaction snapshots).

**Phase 3 — Per-entry origins + rich re-push (G3).**
Entry shape change + capture-at-push + restore-from-entry + re-push branches for
userProfile/listDetail/followList. Verify: the D3 acceptance flow on-sim (drive with
`open_overlay_scene`, assert restored `{scroll, snap, segment, params}` via
`read_search_state` + painter probe), including the stub scenes.

**Phase 4 — Pick mode.**
`selection.mode:'pick'` through the select-transition; first consumer = listDetail
"Add places" (can land with the listDetail real build if that's sooner). Verify: pick
returns the selection, NO search transaction created, origin restore intact.

## 4. Open questions for the owner (non-blocking to Phase 1)

1. **Reveal-start vs perceived latency:** D1 means the map's fade-in now WAITS for cards
   (today it can start earlier). Net feel should improve (no straggler cards), but if a slow
   data lane ever holds a fast map hostage past the watchdog window, the tier-1 forced joint
   commits both — acceptable? (Recommend: yes; the watchdog ceiling is the guarantee.)
2. **`source` list:** is `'sharedList'` distinct enough from `'favoritesList'` to keep as a
   separate provenance, or collapse? (Recommend: keep — analytics + future gating differ.)
3. **Dismiss-fade lane rule:** confirm plain children (settings/userProfile/followList)
   should NOT fade the map on their dismiss (they never faded it in). (Recommend: confirm.)
