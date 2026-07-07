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

### D6c — NATIVE GAP DECODED (2026-07-05, [NGAP] probes)

cardsAdmit→rampStart partitions into two named waits (fence + reproject exonerated):
**(A) token-over-prop transport, 50–167ms** — the enter-start token travels as a React prop,
so it waits for a React commit to flush (toggle-back's heavier JS delays it most). Remedy:
send the enter-start as a DIRECT bridge call (the beginInteractionFadeOut pattern).
**(B) source-ready wait, 68–118ms** — at token arrival `mountedHidden=0/srcReady=0`: the
incoming tab's source mutations only begin applying when the token lands. Remedy: apply the
(already-prewarmed) frame under cover at debounce-commit time, so srcReady is green before
the start signal. Both remedies belong to the coordinator-unification chunk (restore the
March single-file coordinator = TR5): the coordinator's commit phase becomes
"apply frame under cover (direct call) → when ready, fire start (direct call)".
**[NGAPJS] refinement:** cardsAdmit==tokenStaged (synchronous — NO effect delay); the gap =
32ms full-frame build/serialize (the token needlessly rides the whole frame pipeline) + 78ms
native bridge-queue/source-apply/ready. Sources+token travel in ONE frame at admit — the
rewrite must (1) flush the mutation frame at debounce-COMMIT so sources apply under cover
early, (2) send the enter start as a tiny direct call, not a frame rebuild. Expected result:
pair-gap ≈ native arm only (single-digit ms, matching the enter lane's 3ms).

### D6b — R2-C ROUND RESULTS (2026-07-05, commit 22d06921)

JS commit window CLEARED: the toggle was a keyed full FlashList remount (~250-290ms card
render) → dual co-mounted per-tab lists, flip-only (per-tab scroll offsets now persist —
owner to bless); the ~125-142ms source-frame build → sibling prewarm into the fingerprint
cache via the same build path, re-armed after every live publish (fp-diff probe proved the
settle-time prewarm drifted: camera-fit bounds + promoted-hash). Toggle lookup HITS;
contracts silent. Replay path itself costs ~84ms (re-stamp/commit/equality — future trim).

**THE REMAINING GAP IS NATIVE:** cardsAdmit↔rampStart = ~107ms UNCHANGED across every JS
variant (enter lane does request→ramp in 3ms). The toggle's native reveal path (under-cover
reproject → QRF → commit fence → ramp arm in SearchMapRenderController.swift) owns it.
Next: Swift-side mach-clock timestamps partitioning beginInteractionFadeOut →
reprojectCatalogUnderCoverIfReady → presentation arm → first ramp tick. ALSO STILL OPEN:
toggle-back corruption (R3) truncates every multi-toggle distribution — pull R3 forward if
it keeps blocking R2's p90 gate.

### TR5-N — NETWORK-TOGGLE UNIFICATION (charter, 2026-07-06): every toggle rides the tab toggle's lifecycle

**STATUS (2026-07-06): BUILT + MEASURED + COMMITTED** (e146ad5a core lane, e7a815eb
coverage-follows-filters, 9076070a empty-page store groundwork). All four chip runners
route through `runVariantRerunToggleCommit` → `beginVariantRerunPresentationPending(intentId)`
(pending cover keyed to the TOGGLE INTENT so the coordinator finalizes at enter-settle) →
`fireRerunActiveSearch({presentationIntentKind:'variant_rerun'})` (skips
clearResultsForReplacement + immediate enter staging) → enter staged at RESPONSE commit in
`handlePageOneResultsCommitted`, data-keyed on `expectedResultsDataKey`. Swift fade-hold
expiry parks while coverState is `interaction_loading`.

Acceptance measured on cold full-bundle drives: 5-tap open-now alternation with ONE reveal
per intent on the new data (respD/respR 14/12 ↔ 20/20, cardsAdmit→rampStart 0.8–9.4 ms =
sub-frame, tab-toggle parity); rising on/off + include-similar network flip same shape;
rapid 3-tap burst = 3 intents/3 reveals; tab-toggle regression green; collision doctrine
eyeballed intact. RED self-mutation (corrupted expectedResultsDataKey): the joint REFUSES
to open — mismatched data never paints (fails closed).

Two defects found + fixed DURING validation (same stale-lane class):

1. Toggle flips computed `next` from lane-memo prop copies that froze after the first
   commit (5 taps kept emitting the same variant while the chip color — bus-fed — looked
   right). Fix: flips + rerun identity (searchMode/activeTab/submittedQuery) read the
   RUNTIME BUS at press/commit time (commitPriceSelection already did this).
2. `rerunActiveSearch`'s empty-query bail silently stranded the armed cover (~9s watchdog
   force-commit). Fix: the shortcut branch no longer needs the query (per-tab fallback
   label), and a variant_rerun drop on the natural path is a LOUD logger.error.
3. Shortcut coverage (the map's pin/dot set) was filter-free by design → filtered cards
   over a stale map. Fix: coverage carries openNow (JS hours post-filter) /
   priceLevels (SQL) / rising (sort), and the coverage requestKey gains a filters segment
   (frame fingerprint inherits). Both directions screenshot-verified.
4. (owner-reported post-ship, fixed ecc84d77) The PIN RANK badges ignored rising: the
   visual-candidate sort hard-coded craveScoreExact DESC, so the list re-sorted by rising
   while the map kept crave order. Fix: the sort takes rankOrder ('crave'|'rising') from
   the same bus snapshot as the coverage filters key — rising DESC (missing last), then
   the existing craveScoreExact tie-break chain. Both directions screenshot-verified
   (rising ON: Legends=7 rising-tinted; OFF: Ambassadors=2/Milk Bar=12/HOWOO=18 restored).
5. (owner-reported post-ship, fixed 245b402a) INITIAL reveal showed cards ~0.5–1s before the
   strip+pins joint: page-1 rows hydrate into the live list during initial_loading (the
   transition leg's skeleton ends at scene settle; nothing covered the body until the joint).
   Fix: the cutout-skeleton loading cover now also renders for initial_loading (full-body —
   the strip is hidden in that mode); rows mount+measure beneath it, the joint lifts the
   cover + reveals strip + starts the pin ramp same-tick. Video-verified (frame extraction):
   pre-fix cards-alone window; post-fix cards+strip+pins land in ONE frame step. Permanent
   dev probe: [REVEALSYNC] rowsAdmission (shell↔full transitions). Price toggle map-follow
   verified end-to-end (chip → sheet → Done → filtered cards + filtered coverage map;
   testIDs search-price-toggle/search-price-done added). RIG GOTCHA confirmed live: an
   orphaned stale `dist/main` held :3000 serving pre-TR5-N code (price coverage 400/empty
   map) — kill it and relaunch `yarn start:dev` when coverage behaves impossibly.

**OPEN — MOVED-BOUNDS AUDIT (owner directive 2026-07-06, work in flight):** owner reports:
after a search + a REAL map pan, a toggle makes ALL map items vanish permanently — pins,
dots, AND the native basemap street labels never return (cards do change). Basemap labels
stuck = the dismiss-side basemap-suppress/collision ran and the matching ENTER never
landed. REPRO ATTEMPTS THAT ALL PASS (cannot reproduce yet, 6 drives): shortcut submit +
set_map_camera pan + open-now; + maestro finger-pan (search-this-area chip armed) +
open-now; + 3x big finger pans + open-now (video'd — full choreography, new-viewport pins);

- finger-pan + tab toggle. All revealed correctly with fresh-bounds data. SUSPECTED missing
  ingredient: NATURAL (typed) search mode — every drive above is shortcut mode; the
  variant_rerun natural branch (submitSearch path in rerunActiveSearch) is unexercised on the
  rig (maestro type-into-search lane not landing yet; testID search-header-input added).
  NEED FROM OWNER: exact repro — typed query or shortcut? which tab? which toggle? zoom
  change or pure pan? Also owner-directed follow-ups queued for this audit:
  (a) chip toggles feel SLOW vs tab toggle — FULLY ATTRIBUTED 2026-07-06 (fork session,
  attribution scenario `search_submit_dismiss_repeat` — NOTE: the `toggle` scenario is NOT
  in the attribution allowlist, which is why lifecycle/gate events were dark all day).
  Measured commit→joint budget for one open-now toggle, no map move:
  · /search/run round trip: 224–366ms — the SERVER IS FAST (backend refactor confirmed).
  · Coverage was SERIALIZED behind the search (+340–460ms): the commit-time fetch used the
  OLD searchRequestId's stale request bounds and was thrown away; the needed
  viewport-bounds fetch only started after the response. FIXED bbf97e85: while a
  non-append page-1 op is in flight, coverage fetches against the CURRENT viewport →
  post-response fetch = terminal-cache hit; coverage now completes ~+70ms, parallel.
  Joint moved +737ms → +441ms on the matched drive.
  · REMAINING response→joint pipeline: 300–470ms (varies) = rows prepare+list layout+
  preparedRows commit ~135ms, then a ~115ms gap between the JS frame publish and the
  native set_render_frame bridge dispatch, native apply+mounted-hidden ack ~45ms, plus
  gate notify ticks. NEXT TARGETS: the frame→bridge dispatch gap, and the rows leg.
  · Plus the pre-commit press-up debounce (settle source 'frost_ready').
  · ARCHITECTURAL NOTE: the redraw-phase chain is circular for reruns (rows release wants
  phase hydration_ready, which advances on phase_b_materializing AFTER visual_released =
  after the reveal) — the reveal actually opens via the preparedRows committed path, and
  the rows-release rAF spin only resolves post-settle. Untangle in the R2 pass.
  If first-flip should be INSTANT, the ideal remains the include-similar pattern: page-1
  carries the variant union so the flip is local — product/arch decision.
  (b) pins SNAPPED in with the strip on a toggle reveal instead of fading — eyeball'd once
  by owner; check native ramp duration on the variant_rerun lane.
  (c) collision timing directive: basemap-label collision must flip ON at fade-IN START and
  OFF at fade-OUT START (never wait for ramp end), and basemap labels must keep their native
  crossfade. Native change on the precious map surface — needs its own careful pass.
  Owner authorizes ground-up redo of the moved-bounds rerun lane if it's messy — it is the
  foundation of search-this-area and will be global.

**OPEN (one acceptance item, root-caused partway):** the EMPTY variant (0-row page) never
opens the reveal joint — cover holds forever (fails closed; watchdogs stay SILENT — no
reveal-watchdog bark, no tier-1/2). Evidence trail: response commits (MOUNT-PUBLISH 0/0) →
phaseA fires → handlePageOneResultsCommitted stages the variant_rerun enter with the empty
data key → prepared-rows now stage+commit ready=true for the empty identity (store fix
9076070a) → then silence: no stage work-span, no armResultsRevealWatchdog ticks, no
cardsAdmit. The RED self-mutation reproduces the IDENTICAL silent strand with a non-empty
page and a mismatched key ⇒ the strand is in the staged-transaction path itself (deferred
runDeferredStage / staging-coordinator gate), not the empty data. Also still missing: the
empty-state message surface (list shows skeleton, not "no results") and the zero-pin native
frame ack (T4DEDUP suppresses byte-equal empty frames → nativeMarkerFrameReady may starve).
Needs a focused pass; reproduce with: submit shortcut at Madison Sq → set_map_camera to
40.7035,-74.0250 (Hudson) → tap open-now.

**FLAGGED TO OWNER (product call, do not decide alone):** `openNow` PERSISTS across app
restarts (zustand persist mirror). Cold starts therefore submit an already-filtered search
(observed repeatedly on the rig: baseline "unfiltered" drive was actually filtered). Is a
sticky open-now across sessions the intended product behavior?

**THE MEASURED DEFECT (owner-reported, rig-asserted end to end):** a NETWORK toggle
(open-now / rising / price / mid-pagination include-similar) reveals at COMMIT time with the
STALE data, then the response lands into an already-settled surface:
`press-up fade → +300ms runner fires the network request → +160ms cardsAdmit+rampStart on a
search-surface-results-transaction staged by the SUBMIT path → seconds later MOUNT-PUBLISH
commits the real response → cards hard-snap late; the map's enter already ran so pins keep
the old variant; the chip's bus state gets fought by the post-settle response lifecycle
(visually stuck inactive after the first tap).` The tab toggle never shows any of this
because its variant is LOCAL at commit — data and choreography can't be out of order. The
include-similar PAGE-1 flip is also local (applyIncludeSimilarLocalSwap) and correct; its
mid-pagination path shares the network defect.

**ROOT CAUSE (structural):** the chip runners call `fireRerunActiveSearch`, which routes
through the INITIAL-SEARCH submit machinery (`prepareSearchRequestForegroundUi` →
`scheduleSubmitUiLanes` → stages the enter transaction NOW). That machinery was designed for
fresh searches where the leg's skeleton page is the loading visual — not for an in-place
variant swap under the interaction cover. The coordinator's `awaitVisualSync` then waits on
the WRONG (immediate, stale) transaction. Supporting defects, same lineage: the
interaction-fade hold's 1500ms expiry re-reveals the OLD map mid-wait; an EMPTY page-1
commit renders a BLANK body (no empty-state message; map keeps stale pins); the initial
reveal admits CARDS before the map+strip joint (owner: skeleton → cards → map+strip late —
the both-ready joint isn't gating the card admission on this lane).

**THE IDEAL SHAPE (the tab toggle IS the template — one lifecycle for every variant swap):**

1. Press-up: optimistic chip flip + interaction fade + skeleton cover (SHIPPED, shared).
2. Commit: runner resolves the NEXT VARIANT'S DATA — locally (tab flip, page-1
   include-similar) or by awaiting the network response — WITHOUT staging any reveal. The
   cover holds while waiting; the fade hold must NOT expire during an active awaited toggle
   (extend/park the 1500ms expiry while toggleInteraction.kind != null).
3. Data-ready: commit the response into mountedResults, THEN stage the enter transaction —
   apply frame under cover → both-ready joint → reveal cards+map+strip on the SAME tick
   (the D6d contract). The rerun path must NOT call clearResultsForReplacement /
   scheduleSubmitUiLanes — an in-place variant swap owns no initial-search UI lanes.
4. Empty data is a first-class variant: reveal = empty-state message + empty map catalog
   (pins clear under the same cover), strip stays (shipped: strip=chrome, bba30c51).
5. Chip truth: the bus is the single writer (shipped); the response lifecycle must never
   republish filter state (audit `resetFilters`/persistence-bridge writes on response
   commit — the owner sees the chip revert after the first rerun).

**AUDIT SCOPE for the focused session:** query-mutation-orchestrator runners (all 4 chips) ·
rerunActiveSearch / submitViewportShortcut / prepareSearchRequestForegroundUi lane usage ·
use-search-surface-results-enter-transaction-execution staging vs response lifecycle ·
interaction-fade-hold expiry interplay · both-ready joint gating of cardsAdmit on the
initial-reveal lane (owner: cards admit before map+strip) · openNow session persistence
product call. Measurement kit in place: [REQPROBE] (outgoing filters), [tclur] MOUNT-PUBLISH
(response rows), [REVEALSYNC] (admit/ramp pairs), [PUBTRIG] (publish triggers),
[CONTRACT] empty_page_with_nonzero_totals. Acceptance: for EVERY toggle — one reveal, on the
NEW data, cards+map+strip on the same joint, chip state stable across repeated taps, p90
pair gap parity with the tab toggle; RED self-mutation per the methodology.

### D6e — ✅ SURGERY COMPLETE (2026-07-05, commit 2e0bd8d8): the collision promotion round-trip

**SHIPPED + measured.** Candidate B (native-owned obstacle gating) picked by evidence:
`applyV5ObstacleReseed` already existed and writes source properties (reparse-immune — no
LEA channel needed). Changes: (1) JS bakes every collision obstacle demoted
(`nativeLodOpacity: 0`, the pin doctrine) — `promotedMarkerKeys` plumb +
`nativePromotedReuseKey` cache segment deleted; (2) native re-asserts obstacle gating
after every JS apply that mutates the collision source (reconcile + live_role hooks stash
`lastPromotedInOrder` → reseed), and blocked reseeds RE-STASH instead of dropping;
(3) transport dedup rekeyed generation→`frameTransportRevision` — generation reuse
activating for the first time exposed that the acked-generation dedup dropped the toggle's
presentation-only `entering` frame (reveal stalled at pending_mount, empty map; caught by
the verified-bundle drive).
**Measured:** collision-only generation mints 0; cardsAdmit↔rampStart (native clock,
24-toggle torture incl. toggle-backs) p90 3.7ms / median 0.7ms / max 6.2ms (was
105–285ms) = enter-lane parity; idle [T4DEDUP] churn gone; [R3RECON] silent at idle
(toggle-publish ledger corrections unchanged = the structural backstop); zero MapLoad;
collision doctrine eyeballed before/after at z15.5 + a z13→z16 mid-zoom-promotion pass
(labels yield incl. newly promoted pins, dot thinning, basemap suppression). NEXT (not
started): D6d parallel-path deletion + rerun/dismiss unification → R4 gates.

Original attribution below for the record.

#### (historical) ENDGAME ROOT CAUSE (2026-07-05, [GENREUSE]+VDIAG)

The residual toggle gap's full causal chain, every link measured:
`buildStableCollisionFeature` BAKES the live native promoted set into the collision
features (`nativeLodOpacity: promotedNativeLodOpacity` — the "#16" fix), while the label
builder explicitly strips those transient keys for stability. Every LOD promotion therefore
round-trips native→JS→collision-rebuild→republish; after a reveal promotes 30 pins, that
republish lands BETWEEN the mutation frame and the token frame → `changedIds=labelCollisions`
→ the token frame mints a NEW generation → native resets mount/source-ready/election and
re-mounts identical sources (~106ms). ONE flaw, THREE ledger symptoms: the generation reset
(this), the [R3RECON] duplicate-adds on restaurant-label-collision-source (R3's ledger
corrects them structurally), and the idle both-tab republish churn (ledger #4).

**THE SURGERY (own focused session — touches the precious map's load-bearing label-collision
doctrine; load map-architecture-shipped + map-lod memories first):** make the collision
source's JS representation PROMOTION-INDEPENDENT — the obstacle's promotion gating moves
fully native (native already reseeds obstacles from the catalog via applyV5ObstacleReseed;
the JS-baked seed becomes the reparse-immune fallback exactly like the LEA pattern), OR the
promotion opacity rides the transient/feature-state channel (already excluded from semantic
identity) instead of baked properties. Constraints: obstacle correctness during mid-zoom
promotion (#16's original bug), basemap suppression, dense thinning — the full collision
doctrine. Acceptance: [GENREUSE] shows generation REUSE on the token frame; toggle pair-gap
≈ enter lane (~3ms); [R3RECON] silent at steady state; idle [T4DEDUP] churn gone. Then:
parallel-path deletion + rerun/dismiss unification + R4 gates.

### D6d — THE ENDGAME: single native lifecycle for every variant swap (designed 2026-07-05)

**Diagnosis chain complete.** After U1+U2a (27596f09) the toggle's residual ~140ms is the
LAST structural defect: the toggle runs TWO overlapping native lifecycles —
(a) the redraw/reproject path (`beginInteractionFadeOut` → `reprojectCatalogUnderCoverIfReady`
→ `presentation_toggle_settled`) and (b) the enter machine (executionBatch → mounted_hidden
election → start token → enter_started). The enter lane's mountedHidden election waits for
the frame with its matching executionBatch, which today leaves JS only at admit-time.

**Target shape:** ONE lifecycle — the enter machine — for enter, toggle, rerun, dismiss:

1. Coordinator commit (U2 marker #1): publish stores AND flush the mutation frame
   IMMEDIATELY (U2b) — the frame with the new executionBatch leaves at commit; the render
   owner's admission must emit (not defer) covered structural frames on the commit path.
2. Native applies under cover → mounted_hidden election → JS `markRedrawNativeMarkerFrameReady`
   → the both-ready joint opens → cardsAdmit + `commitEnterStart` (U2a, done) on the same
   tick → native ramp fires the moment srcReady flips. Expected pair-gap ≈ enter lane's ~3ms.
3. DELETE the parallel path: `reprojectCatalogUnderCoverIfReady`'s toggle role +
   `presentation_toggle_settled` fold into the enter settle; `beginInteractionFadeOut` stays
   (press-up presentation fade only — it is not a data lifecycle). Rerun (search-this-area)
   and dismiss ride the same machine (dismiss = the exit lifecycle it already has).
4. Contracts: a toggle that produces TWO native settles (redraw + enter) becomes a contract
   violation during the migration window; delete the redraw settle path once silent.

**Gates (R4 pulls in):** pair Δ ≤ 1 frame p90×20 ALL lanes incl. toggle-back; zero MapLoad
across a 50-toggle torture; zero [R3RECON] corrections steady-state (the ledger stays as the
structural backstop); RED self-mutations per contract. This chunk is native reveal-machinery
surgery on SearchMapRenderController.swift + the render-owner admission + the enter runtime —
sized for a focused session with this spec + the [NGAP]/[NGAPJS]/[T1DBG] kit.

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
