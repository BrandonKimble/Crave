# SEARCH-FLOW REDERIVATION (R7 pre-implementation research)

2026-08-03. The dedicated research pass OA6 mandates before any R7 code change.
READ-ONLY archaeology + code trace; no source was edited. Verdict up front:

**The machinery is NOT broken — it is substantially MORE unified than the owner's
memory of it.** The reveal-pipeline unification (Q-2 phase 5) shipped through its
S2 inversion and S3 deletion: every mouth's reveal joins {paint, mapFrame, sheet}
through ONE TransitionTxn episode, and all five OA6 entry points already resolve
through ONE entity→action policy and ONE launch chokepoint. What R7 owes is not a
rebuild but: (1) the skeleton half of the choreography (G-READY/G-SKEL on the
track host — the skeleton today is a hardcoded restaurant-row cold-leg material,
not the per-scene loading state OA1/OA2 describe), (2) the OA1 falsifier (no RED
exists for cards-before-map), (3) closing two deliberate deferrals in the track
host's sheet leg, and (4) making `worldJoin` declared data instead of an implicit
"there is exactly one world surface" assumption.

---

## 1. ARCHAEOLOGY — the intent and the bar

Primary sources (all in /Users/brandonkimble/Crave/Crave/plans/):

- **search-lifecycle-phase0-requirements.md** — THE ratified requirements ledger.
  The choreography bar:
  - H1 (line 150): **60 fps on BOTH UI and JS threads through every transition**
    — reveal included. Already a ratified hard requirement; OA7 restates it.
  - T4 / P-13 (line ~429): **the JOINT** — cards admit within ±1 frame of the
    native marker ramp start; a lifted cover with no content is a forbidden frame.
    This IS OA1's "revealed at the exact same instant", ratified 2026-07.
  - O-1 (334): complete-bundle freeze — no partial header/strip/body frames.
  - O-5 (~352): press-up = one chrome commit; body reveal joins {paint-ack,
    chromeAck}; **a skeleton counts as painted content** (honest ack).
  - O-6 (354): LOD promotion + label placement settle UNDER cover before the
    fade begins; nothing re-places mid-ramp.
  - O-12: warm-hit rule — a cache-hit world reveals immediately (no fake wait).
  - O-13: never-see-through — sheet surface alpha constant 1.0.
  - L-1 (252): the task law — no long JS tasks inside a transition window.
- **search-reveal-pipeline-unification-design.md** (2026-07-15) — the clean-room
  design that cured the four-lanes disease: a world presentation episode IS a
  TransitionTxn `revise` with exactly three total producers (`paint` = mounted-rows
  residency, `mapFrame` = the native wire ack, `sheet` = the sheet-motion fence),
  ADMITTED = the txn's 'revealed' edge, consumers derive from the txn, per-lane
  watchdogs and the P5 collector delete. Migration S1→S2→S3.
- **map-presentation-choreography-derivation.md / map-presentation-epoch-and-participation.md** —
  the epoch/participation model on the native side (finished; out of scope).
- **listdetail-ideal.md + w1-listdetail-structural-spec.md + entity-ref/wave-4 §3**
  — listDetail as a child page that a list WORLD presents into (favorites-as-search);
  the tap is a composite verb: push child + run world; the panel holds rows on the
  same admission gate as results.
- **transition-endstate-contract.md** — OA1 (world-join family = {search/results,
  listDetail}, extensible by data; reveal joins {map items ready, cards ready};
  skeleton sheet is the loading state throughout; cards-before-map is RED), OA2
  (skeleton variants are data), OA6 (five source-agnostic entry points), G-READY/
  G-SKEL rows.

**The bar, condensed:** one join, one reveal instant (±1 frame), skeleton as the
honest loading content, settle-under-cover, 60fps both threads, warm hits reveal
instantly, and every mouth rides the same machinery.

---

## 2. CODE TRUTH — the shared spine (exists, live)

All paths under /Users/brandonkimble/Crave/Crave/apps/mobile/src/.

- **One entity→action policy**: `navigation/runtime/entity-ref-action-policy.ts`
  (`resolveEntityRefAction`). Every tappable entity — poll comment spans, lists
  rows, profile gallery tiles, home shelves, autocomplete — resolves through it.
  Vocabulary: `restaurantWorld`, `entityDesire`, `pushScene`, `listWorld`
  (composite: push listDetail + run the list's search world; carries
  `targetUserId`, `source: 'curated'`, `shareSlug`, `slice`).
- **One executor**: `navigation/runtime/use-entity-ref-action-executor.ts` —
  pushes the child for `listWorld` (title warm-seeds the header at frame 1),
  then dispatches the world half over the launch channel.
- **One launch chokepoint**: `screens/Search/runtime/shared/use-search-foreground-launch-intent-runtime.ts`
  — stamps world identity onto the active route entry
  (`stampActiveRouteEntryDesire`, line ~64) and calls the one submit verb per
  kind (`launchListSearchResults`, `launchEntitySearchResults`,
  `runRestaurantEntitySearch`, `submitSearch`).
- **One classifier/driver**: `screens/Search/runtime/reconciler/search-world-reconciler.ts`
  — classifies every desired-tuple transition (session_enter/replace, lens_flip,
  variant_rerun, area_rerun, retoggle_reversal…) and drives the presentation.
  List worlds present INTO the pushed listDetail child (`preserveSheetState`,
  lines ~113-127) — a list enter never takes over the results scene.
- **One join**: `screens/Search/runtime/surface/search-surface-runtime.ts`.
  - The episode txn: `maybeStageQ2DeferredRevise` (lines ~820-880) stages a
    `revise` (`targetSceneKey:'search'`) with `joinInputs: ['paint','mapFrame','sheet']`,
    `joinLivenessMs: 10000` (STUCK net, not choreography), deferred until the
    route txn terminates (route-coupled enters, design §3).
  - Producers are TOTAL by construction: `setWorldRowsResidency` (mounted-store
    rows residency, full OR legitimately-empty → 'paint', lines ~533-540),
    `offerWorldMapFrameEvidence` / `markWorldMapFrameDirty` (native wire ack
    residency, lines ~542-553), and the sheet fence (`markRedrawSheetReady`).
    Cached re-presents seed offers from residency state (warm-hit rule honored).
  - **S2 inversion landed**: `completeRedrawAtEpisodeReveal` (line ~781) —
    `canAdmitResultsBody` is txn-derived under its unchanged selector.
  - **S3 deletion landed**: tier-1/tier-2 cover watchdogs deleted (comment at
    ~885-890); the engine's join-liveness watchdog is the one never-stuck net,
    LOUD `[TXN-CONTRACT]` on degrade. The old P5 collector's live-path role is
    gone (`app-route-scene-transition-policy-runtime.ts:174` references only
    the txn-side evaluation).
- **Consumers of the ONE reveal fact** (`canAdmitResultsBody`):
  - results rows / shell model: `shared/use-results-presentation-shell-model-runtime.ts:152`.
  - native marker enter-start: `shared/use-results-presentation-marker-enter-runtime.ts:57-63`
    (`canStartMarkerEnterForSurface` — the T4 joint's map side; `[REVEALSYNC]`
    instrument at ~80).
  - ListDetailPanel hold: `overlays/panels/ListDetailPanel.tsx:1101-1135`
    (worldRevealAdmitted; 1500ms `[JOINT]` RED bark if a hold outlives the redraw).
  - sheet leg producer: `tracksheet/TrackSheetRouteHost.tsx:504-524` — the track
    host is the sheet-motion authority now (settle → ready; already-at-rest →
    ready immediately).
- **The sheet host**: `tracksheet/TrackSheetRouteHost.tsx` is the DEFAULT system
  (`tracksheet/track-flip-store.ts:12`, `on: true`); the old
  `SearchOverlayRouteSheetSurfaceHost` renders only when the flip is off
  (`overlays/AppOverlayRouteHost.tsx:140-146` — emergency rollback, deletion
  scheduled for R8 after burn-in).

## 2b. CODE TRUTH — per entry point

**E1. Query search (search page).** `submitSearch` → desired-tuple write →
reconciler `session_enter`/`session_replace` → route txn (results push) reveals
chrome at press-up; the world episode revise defers to the route txn's
termination, joins {paint, mapFrame, sheet}, and its 'revealed' edge admits rows
AND releases the native marker enter in the same tick. **Exists, coordinated,
conforms.** Loading state: for a fresh enter the results leg is cold → the track
skeleton shows (TrackSheetRouteHost.tsx:807-809); for an in-session re-submit the
OLD world stays frozen under cover until the join (O-1/O-12 model), NOT a
skeleton — see Deviation D5.

**E2. listDetail from the LISTS page.** `overlays/panels/ListsPanel.tsx:661-675`
→ `executeEntityRefAction` with `listType` → `listWorld` composite → push +
desire stamp + `launchListSearchResults` → reconciler presents the world into the
child (`preserveSheetState`) → panel holds rows on the SAME admission gate
(ListDetailPanel.tsx:1101-1135). **Exists, coordinated, same join.**

**E3. listDetail from a profile's shared lists.**
`overlays/panels/ProfileSectionsBody.tsx:190,325-327` — same executor, passes
`listType` and `targetUserId` (scopes virtual-All unions + viewer role). Slug
opens (`/l/<shareSlug>`) ride the launch runtime's `sharedList` arm
(use-search-foreground-launch-intent-runtime.ts:~118-125) into the same panel.
**Exists, same flow.** A tap site that omits `listType` degrades to a plain push
with a dev bark (entity-ref-action-policy.ts:~112-120) — the "silent half-world"
is guarded, not silent.

**E4. Curated list from HOME.** IMPLEMENTED (contrary to OA6's "may not be"):
`overlays/panels/HomePanel.tsx:497-505` — "a curated open rides THE listWorld
composite", `listSource: 'curated'`. Curated ids are a distinct identity
namespace; the deep-link lane (`/cl/<id>`) pushes the child if none is live
(launch runtime lines ~44-59). **Exists, same flow.**

**E5. Poll-detail comment text-highlight spans.**
`overlays/panels/PollDetailPanel.tsx:119-172` — spans render through THE
EntityLink; tap resolves via `resolveEntityRefAction`.

- DISH span (`food`/`food_attribute`/`ingredient`) → `entityDesire` →
  `launchEntitySearchResults` (skip-LLM entity search) → the query-search flow.
- RESTAURANT span → `restaurantWorld` → launch runtime lines ~146-230: ADOPT
  (restaurant already in the resident world: profile opens over the LIVE world,
  world untouched) vs OWN (committed single-restaurant search lifecycle with
  warm-seeded profile header, `runRestaurantEntitySearch`). Both ride the
  committed-search machinery, hence the same episode join.
  **Exists, unified — this is the machinery the owner suspected broken; statically
  it is fully wired.** Unresolved spans (no entityId) render without a press
  affordance by design.

---

## 3. REDERIVATION — the ideal shape from the intent

The minimal primitive set (most of it exists):

1. **THE EPISODE** (exists, keep): a world presentation is a TransitionTxn
   `revise` with join inputs {paint, mapFrame, sheet}; 'revealed' is THE one
   admitted fact; 'settled' is motion-complete. One producer per input, total by
   construction. This is OA1's join, already generalized past the two named
   scenes: ANY mouth that mounts rows into the one store and ships a frame over
   the one wire participates for free.
2. **THE COMPOSITE VERB** (exists, keep): EntityRef → action → {push child?} +
   {world desire}. Per-entry differences are already data on the action
   (`listType`, `targetUserId`, `source`, `slice`, `shareSlug`).
3. **worldJoin AS DECLARED DATA** (missing): today listDetail participates via
   the implicit invariant "there is exactly one world surface, so no identity
   key is needed" (ListDetailPanel.tsx:~1108). The contract wants
   `worldJoin: true` as a scene-descriptor row. Ideal: the scene foundation/
   descriptor declares it; the hold-gate and skeleton selection derive from the
   declaration, not from a per-panel `worldBacked` prop + bespoke subscription.
4. **THE SKELETON AS THE READINESS STATE** (half-missing): G-READY's axis —
   a not-ready entry presents THE skeleton, per-scene shape from
   `navigation/runtime/scene-foundation-spec.ts` (rowType + strip pills). Today
   the track host's skeleton is cold-leg-only and hardcoded
   (`rowType="restaurant"`, TrackSheetRouteHost.tsx:735); it is "the leg's own
   content state, once per cold visit, never a transition state" (809) — which
   is exactly what G-READY/OA1 change: readiness is an AXIS, and a world-join
   scene whose episode is unjoined is not-ready by condition.
5. **THE FALSIFIER** (missing): OA1 says cards-before-map (or vice versa) is
   RED. Today `[REVEALSYNC]` measures the joint and `[JOINT]` barks on a stuck
   hold, but nothing barks on a SPLIT reveal (one side painting while the other
   input is unoffered). Build: a dev assert at the admission edge that both
   residency facts are present at 'revealed' (they are join inputs, so the only
   split path is a consumer bypassing the gate — the bark catches exactly that
   class, e.g. a new panel reading the store directly).

### What is wrong / fragile (deviations)

> **CORRECTION (coordinator plans-audit) 2026-08-08 — parts of this deviation list and of
> the R7 gap list below ask for work that has SHIPPED, and one address moved.** The
> sheet-motion authority is no longer only `TrackSheetRouteHost.tsx:504-524`: the ready
> edge is `markSearchSurfaceSheetReadyForVisibleSnap` →
> `navigation/runtime/app-route-sheet-host-authority-controller.ts:1707`, and **D2(a)'s
> motion-PENDING side IS wired** — `markRedrawSheetMotionPending` is called from the same
> controller at :1696 (and from `tracksheet/use-track-motion-controller.ts:66`), landing in
> `search-surface-runtime.ts:1031` with spec coverage. **D1 is closed** as well: the
> skeleton is per-scene data through one resolver (`trackSkeletonMaterialForScene`) in
> `tracksheet/use-track-leg-resolver.tsx:328-357`, which explicitly records "never a
> hardcoded rowType" — so gap-list item 1 (G-SKEL) is done. Re-verify D3–D6 before
> scheduling them; only D1/D2a were re-checked here.

- **D1 — skeleton material is not per-scene data.**
  TrackSheetRouteHost.tsx:735 hardcodes `rowType="restaurant"` and renders no
  strip-in-skeleton pills. Violates OA2/G-SKEL. Fix: resolve from
  SCENE_FOUNDATION_SPECS (`scene-foundation-spec.ts:21-31` already declares
  `skeleton.rowType` + `strip` per scene).
- **D2 — sheet leg deferrals (the two honest holes, both documented in place).**
  (a) TrackSheetRouteHost.tsx:~515-524: the motion-PENDING side of the fence is
  NOT wired — a sheet about to move can offer 'sheet' while at rest, so the
  reveal may land just before/during sheet motion (mid-slide law protects the
  commit publish via `q2RedrawCommitPendingFenceRestore`, search-surface-
  runtime.ts:~795-815, but only once motionSettled=false is actually observed).
  (b) the deferral is recorded as deliberate ("would trade a hang for a
  freeze") — R7 must either wire a proven motion-pending signal from the track
  physics or ratify that the atomic swap subsumes it (A2/G-TOUCHGATE style
  verdict, with evidence).
- **D3 — dual sheet systems still mounted behind the flip**
  (AppOverlayRouteHost.tsx:140-146). Old-system deletion is R8's job; R7 must
  not build on any old-host authority (the sheet-leg authority already moved to
  the track host — the comment at TrackSheetRouteHost.tsx:505-511 records the
  breakage window when NOTHING produced 'sheet'; that class of regression is
  what the OA1 falsifier must catch).
- **D4 — worldJoin is implicit** (see #3 above). One-world-surface holds today;
  the uniform model's entry-keyed stack (G-ENTRY, stacked entries of the same
  scene) will break the "no identity key needed" shortcut. Re-key the admission
  read to the entry's stamped desire (the identity tuple ALREADY on the entry
  via `stampActiveRouteEntryDesire`) when G-ENTRY lands.
- **D5 — CONTRACT TENSION to surface to the owner (possible OA1 amendment).**
  OA1: "the skeleton sheet as the loading state throughout." The ratified O-1/
  O-12/warm-hit corpus and the shipped code deliberately show the FROZEN OLD
  WORLD under cover for in-session revises (re-submit, toggle, re-slice), with
  skeleton only for cold enters (fresh leg). These are different loading states
  for different episode kinds, both ratified at different times. Recommendation:
  amend OA1 to "skeleton for enters into a cold/child entry; complete-bundle
  freeze for revises of a presented world" — matching both the corpus and the
  code — OR the owner rules that revises also skeletonize (a real behavior
  change, and arguably worse UX than the crossfade).
- **D6 — episode plan always declares all three inputs.**
  `maybeStageQ2DeferredRevise` hardcodes `['paint','mapFrame','sheet']` +
  `movesSheet: true`; the design said 'sheet' iff motion-expected, and toggles
  join on {paint} only. Benign today (the at-rest sheet self-offers
  immediately), but it erases the plan-as-data distinction the design wanted.
  Low priority; fold into D2's fence work.

### R7 gap list, ordered

1. **G-SKEL on the track**: skeleton material from SCENE_FOUNDATION_SPECS
   (rowType per scene + strip pills). Falsifier: the G-SKEL jest from the
   contract (render every spec key, assert rowType/pills). Fixes D1.
2. **G-READY on world-join scenes**: not-ready-by-condition — a world-join
   scene with an unjoined live episode presents the skeleton as its content
   state (results cold enter already does; make the condition, not the cold
   visit, the trigger). Depends on R2's G-READY groundwork.
3. **worldJoin as data**: scene-descriptor flag; ListDetailPanel's bespoke
   `worldBacked` subscription and the results-side selector both derive from
   it; admission read keyed to the entry's stamped desire (D4).
4. **The OA1 falsifier**: dev RED at the admission edge + a jest that suppresses
   one producer and asserts LOUD degrade (the RED-provable property S3 claimed;
   make it an invariant, not a claim).
5. **Sheet-leg fence verdict** (D2): wire motion-pending from track physics or
   ratify subsumption with trace evidence. Plus D6's plan-shape cleanup.
6. **60fps verification**: L-1 task-law samplers (`src/perf/`) over the five
   mouths; this is measurement, not new machinery.
7. **Owner FYI**: D5 amendment; E4 "may not be implemented" is stale (it is).

### Contract corrections for the parent to apply

- OA6's "curated list from the home page (possibly not implemented)" → it IS
  implemented (HomePanel.tsx:497-505); the R7 scope row should say "verify",
  not "build".
- OA1's "skeleton sheet as the loading state throughout" needs the D5 nuance
  ratified before a falsifier can be written for it.
- The world-join family is already wider than {search/results, listDetail}: the
  restaurantWorld and entityDesire lanes ride the same episode. The contract's
  "extensible by data" clause is ALREADY the code's shape; record it.

---

## 4. RED TEAM OF THIS DOCUMENT — weakest claims + runtime evidence needed

1. **"The machinery is not broken" is a STATIC claim.** Everything above is
   code-reading; the CLAUDE.md attribution law says runtime bugs hide from
   exactly this method. Confirm on-sim: one full trace per mouth showing
   `push(skeleton) → settled` then `revise → join:paint → join:mapFrame →
join:sheet → revealed → settled` ([TXN-TRACE]) with zero [TXN-CONTRACT]
   degrades and zero [JOINT]/[PRESENTATION-WATCHDOG] barks. The five mouths:
   fresh query, lists tap, profile shared-list tap, home curated tap, poll span
   (dish AND restaurant, ADOPT and OWN variants).
2. **Poll spans specifically**: the owner suspects them; my trace shows wiring,
   not behavior. The span → EntityLink → executor path depends on the backend
   populating `spans` with resolved entityIds — an empty/unresolved spans array
   renders no press affordance and would LOOK broken with zero client defect.
   Evidence: inspect a live poll comment's spans payload before blaming the flow.
3. **The track-host sheet leg under real motion** (D2): I claim the mid-slide
   latch covers the gap in practice; a reveal landing during the listDetail
   spring-to-middle would falsify that. Evidence: slow-network listDetail enter,
   watch whether rows paint mid-spring.
4. **Design-doc §7 open items were never explicitly closed** in any doc I found
   (coverage-lane ack on device, zero-result enter vs the emptying-catalog
   floor, the post-S3 route-window hold on slow fetch). The code contains the
   claimed mechanisms (residency discriminator, seeding), but the "prove it"
   items have no recorded proof. Evidence: zero-result search + slow-fetch
   enter on-sim.
5. **60fps**: asserted by ratification, measured by nobody recently. The perf
   samplers exist (`apps/mobile/src/perf/`); run them across the mouths before
   declaring R7's bar met.
6. **I did not deep-read the enter/exit transaction execution runtimes**
   (`use-search-surface-results-enter-transaction-execution-runtime.ts` and the
   exit sibling) or the toggle coordinator; a defect could live in the route-txn
   half of a route-coupled enter without contradicting anything above.
