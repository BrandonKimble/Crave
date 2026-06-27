# Sheet Page-Transition Engine — Ideal Shape (design spec)

Status: **DESIGN (pre-implementation)**. Authoritative spec for replacing the non-ideal sheet
page-switch mechanics with the industry-standard **overlap** model. Produced by a map+design+adversarial
workflow (4 area maps → architect → 2 red-team reviewers), then refined by the review findings below.
Goal: every page switch in the app — in-sheet swaps, full-screen nav-push, modal/trial — is **gapless**,
**interruptible**, and **declared per route**, reusing the strongest existing structures.

---

## The bug, precisely

Poll-card → pollDetail is an `openChild` with **no explicit `contentHandoff`** → it defaults to
`swapImmediately` (`app-route-scene-transition-policy-runtime.ts:251-265`), which presents the incoming
scene **the same frame the switch commits — before it has painted** → blank. Result→restaurant uses the
same path; it only *looks* fine because that page paints within a frame. **Both modes are render-at-swap,
never overlap**: `swapImmediately` shows only the incoming (too early), `preserveOutgoingUntilSettle`
shows only the outgoing (incoming never renders until settle). Visibility is a binary opacity snap
(`resolveSceneStackStaticVisibility`, `sceneKey === displayedSceneKey`) on a plain `<View>` — no crossfade
primitive exists.

## What's already ideal (KEEP — do not rebuild)

- **Declarative policy layer**: `resolveAppRouteSceneTransitionPlan` + the `RouteSceneSwitchRequestInput`
  contract. Routes declare intent; one pure resolver produces the plan. Extend, don't replace.
- **The simultaneous-mount substrate**: `ActiveSceneStackSurfaceHost` already renders every scene as an
  absolute-fill sibling, **never unmounted mid-switch**. "Both scenes live during the window" is *already
  structurally true* — only opacity arbitration + content-readiness gating change. (This is the big de-risk.)
- **Token-gated multi-plane settle barrier** (`activeSettlePlanesByToken` + `completeRouteSceneSwitchMotionPlane`):
  the exact mechanism to add a `content` (incoming-painted) plane.
- **`AppRouteSceneBodyAdmissionPolicy`** (per-scene retain/prewarm flags, plumbed end-to-end): the new
  "admit incoming during transition" belongs here.
- The nav-push signal+latch pattern, the chin-rides-the-body geometry, the `OverlayModalSheet` modal path,
  and the persistent-poll / search-surface forcings — all preserved; only their *triggering* moves into the engine.
- **Reuse the existing `isTransitionParticipant` signal** (`app-route-scene-stack-runtime.ts:1909`) for
  admission — it already identifies the incoming scene during the window. Don't add a parallel flag.

## The ideal engine (overlap, refined to no-compromise)

One transition lifecycle, **one `transitionProgress` driver**, two co-rendered layers, settle gated on
incoming-paint:

1. **PREPARE** (commit): resolve a per-route **preset**; build a `{ outgoing, incoming, preset, progress }`
   display descriptor; **admit + render the incoming HIDDEN** (opacity 0) while outgoing stays at 1.
2. **AWAIT-PAINT**: incoming body reports first paint (onLayout/commit ack) → *gates* the ramp start.
3. **OVERLAP** (~one window): `progress` 0→1 drives both layers per the preset; both opacity-live.
4. **SETTLE**: completion rides the **crossfade's `onFinish`** (UI-thread guaranteed); drop outgoing.

### Four no-compromise refinements the red-team forced (vs my first draft)

1. **DELETE `swapImmediately` entirely.** React Navigation / UINavigationController / View Transitions have
   exactly **one** path — there is no "present-before-paint" mode anywhere in them. Bootstrap (first mount,
   no outgoing) is just the overlap with `outgoing = null, progress = 1` — same descriptor, no special enum.
   Keeping it as an "escape hatch" preserves the exact foot-gun the references structurally cannot express.
2. **Drive `progress` off the sheet-position value (`sheetYValue`), not a fixed `withTiming` clock.** Enter
   and interactive drag-to-dismiss then share one continuous, **interruptible** driver (UIKit
   `percentDrivenInteractiveTransition`). A fixed 200ms clock fights a flick-to-dismiss mid-enter.
3. **Bound the `content` plane with a timeout.** Complete it on the crossfade `onFinish`; the paint-ack only
   *gates clock start* under a max-wait. A missed ack degrades to "slightly-early reveal" (today's behavior),
   never a permanently stuck overlay. (The settle barrier currently only ever *deletes* planes — no timeout.)
4. **Single-source the preset from the registry**, not a `resolveTransitionPreset` scene-key switch. The
   `transitionKind` selects among the presets the route *declares it supports* in `APP_ROUTE_SCENE_POLICY_BY_KEY`.

### Presets (motion styling on the one engine)
- **bodySwap** — sibling pages, shared header pinned; body crossfade/slide. (result↔restaurant, top-level)
- **navPush** — full-screen promotion; incoming lifts + nav slides; header morphs its cutout set. (pollDetail)
- **modal** — `OverlayModalSheet` owns its own fade over a dimmed backdrop. (price/scoreInfo, trial pages)
- **dismiss** — reverse overlap (generalize the existing `preserveOutgoingUntilSettle` seam).

## Regression holes the red-team found — MUST pin before/while implementing

1. **Same-scene (source==target)** param-only/sort-flip re-entry: must early-out to a no-op, else the
   crossfade fades the single live scene out-and-back = self-flicker on every in-place update.
2. **Poll-lane base flips to the child at commit** (`resolveDisplaySnapshot`): the outgoing "polls" layer must
   be sourced from `handoffSceneKey/sourceSceneKey`, NOT the already-flipped lane base.
3. **THREE scalar `displayedSceneKey` forcings**, not one — authority (preserve/poll/search), host-level
   `effectiveDisplayedSceneKey` ('search' override), and `isSearchDismissPollBoundaryCommitted` ('polls' pin).
   The descriptor must thread through **all three** or one silently re-forces over the overlap.
4. **`shellSpec != null` gate must apply to BOTH legs as a unit** (or fall back), else a freshly-mounted
   source without a published shellSpec drops the outgoing mid-crossfade → blank returns.
5. **navPush clip for non-dockedPersistentPoll origins** (results/favorites-origin pushes) is unwired today
   → those would paint behind a sheet that never promotes. **Clip-from-source/target-surfaces is a SHIP
   prerequisite for navPush, not a [VERIFY].**
6. **search-dismiss preserve is a second, controller-independent preserve source** + the search surface
   renders on a **separate** host — so a search↔polls bodySwap crossfades only the polls layer. Both must be
   modeled, not bypassed.
- Plus: closeChild's explicit `swapImmediately` override (decide: honor or strip); modal-opened-mid-transition
  must not orphan the `content` plane; restaurant-root surface-suppression must no-op the descriptor;
  `preserveLiveY` children (favoriteListDetail) have no sheet plane → settle hinges on the content-plane
  timeout. Equality fan-out: add the admission field to BOTH `areSceneContentActivitySelectionsEqual` and
  `shouldSkipSceneStackBodyContentLayerUpdate` (incl. its separate 'search' sub-branch); carry `progress` as
  a stable token in `areDisplaySnapshotsEqual`.

## Cross-canvas transitions (the search surface) + future flows

There are TWO render canvases: the **scene-stack body** (most pages, stacked siblings — the engine animates
their opacity) and a **separate search surface** (`SearchSceneStackBodyDisplayTarget` / the results bundle).

- **scene-stack ↔ scene-stack** (polls↔pollDetail, result↔restaurant, **restaurant↔pollDetail**, profile↔X):
  both layers on the engine's canvas → **symmetric, gapless — fully covered.** The future flow
  "restaurant page → linked poll discussion/comment → poll detail" is this case; no extra work.
- **search ↔ scene-stack** (tap "Polls in NY" = search→polls, dismiss back): asymmetric today because the
  search RESULTS BODY publishes through a bespoke path, not because of the map.

  **INVESTIGATION FINDING (overturns the old "search is coupled to the map" premise).** The native MapView is
  a **persistent full-screen BASE layer** (`SearchScreen` renders only `<SearchMapRenderSurface>`; the sheet
  host is a sibling overlay above it), bound to JS purely by **React node tag** (`findNodeHandle → attach({mapTag})`).
  It is **orthogonal** to which sheet body is mounted — nothing in `SearchMapRenderController.swift` references
  the scene-stack body. AND the search **body is already a scene-stack scene** ('search' ∈ PERSISTENT_ROUTE_SCENE_STACK_KEYS,
  wrapped in the SAME `BottomSheetSceneStackPageFrame` as polls/profile). So **the canvas is already shared and
  the map is already separate.** What actually makes search special is the **`SearchSurfaceRuntime` transaction
  lifecycle** — the native-readiness **reveal join** (`cardsReady && nativeMarkerFrameReady && sheetReady`, where
  `nativeMarkerFrameReady` comes from the map's `render_frame_synced` handshake) and the **sheet-drag dismiss
  handoff** — which the generic admission model (boolean-only retention) cannot express. The docked-persistent-poll
  resting lane *also* lives inside this surface (`activeBundle.kind==='poll'`), so it's entangled too.

  **So the "ultimately ideal" is NOT "move search to the canvas" (it's already there) — it's FOLD UP: generalize
  the strong transaction/readiness abstraction into the generic scene model**, so any future native-readiness-gated
  transition (e.g. a restaurant detail that must wait on a native marker frame) is first-class instead of spawning
  its own bespoke surface. Staged path:
  - **Stage 0 (gate):** capture the reveal + **dismiss** lockstep on the LOD harness as a regression baseline
    (`markPollPagePartReady` header/body/host vs `commitDismissBoundary` vs `completeDismissHandoff` — the
    2026-06-22 deadlock fix proves THIS is the most fragile gate, more than the reveal join).
  - **Stage 1 (now):** **Option B** — feed the engine `progress` into the search surface for symmetric crossfades,
    routed **through the existing `effectiveDisplayedSceneKey`-aware opacity path** (NOT a parallel opacity input)
    to avoid double-driving against the `searchSurfaceOwnsVisibleSheet` override. Acceptance test (falsifiable):
    search↔polls and search↔profile crossfade symmetrically, no `render_owner_invalidated`, and
    `commitDismissBoundary` still fires on snap==='collapsed' with identical timing. Zero map change.
  - **Stage 2:** add a **transaction-keyed readiness/freeze primitive** to `AppRouteSceneBodyAdmissionPolicy`
    (fold the SearchSurfaceRuntime semantics UP, keep it as the policy producer — do NOT encode as booleans).
  - **Stage 3:** migrate the search body onto it and **delete the `sceneKey==='search'` fork** + the ownership
    override. Now symmetric **by construction**; the special case became the general case.

  MUST-PRESERVE (byte-identical): the MapView never remounts (stable React tag); the 3-way reveal join order;
  the sheet-drag dismiss handoff + readiness sequencing; the reveal/dismiss ↔ pin-LOD lockstep; the camera
  split-brain (center/zoom UNCONTROLLED, only padding controlled) — never make camera a controlled prop.

## Launch-a-search-from-anywhere = `readinessGatedReveal` preset (the payoff of fold-up)

Triggering a search from ANY page (deep link, a button on profile/favorites, tapping a highlighted entity in
a poll-detail comment) → origin goes to loading → native map settles → results-list OR restaurant-profile
reveals with correct timing — is ONE transition: *origin scene* → *results/restaurant scene* with a
**`readinessGatedReveal`** preset. It decomposes onto the two systems already in this doc:
- **Outgoing**: the overlap **engine** crossfades the origin out — origin-agnostic (polls, profile, favorites,
  restaurant, all the same).
- **Incoming**: the **generalized readiness primitive** (fold-up Stage 2) runs loading → the native-marker-frame
  join → reveal. That join (`cardsReady && nativeMarkerFrameReady && sheetReady`) is about the results+map+sheet,
  **origin-independent** — so the timing that's correct from polls today is correct from everywhere once it's a
  general primitive.
- **Launcher**: "run search" is a command ANY page dispatches (command layer already centralized); the
  entity-tap-in-comment is one launcher. The reveal target can be the results list or a specific restaurant
  profile — both are readiness-gated reveals.

Implication for sequencing: **the REVEAL is portable and high-value; the DISMISS is the entangled seam.** So
fold-up's first real payoff is `readinessGatedReveal`-from-anywhere (low risk, origin-independent join),
delivered once Stage 2's transaction-keyed admission primitive exists — and it's reusable by any FUTURE page
that must wait on native readiness before revealing, not just search. This is the "search isn't special, it's
the first user of a general primitive" goal made concrete.

## Dismiss = return-to-origin (unified back-navigation) — the genuinely ideal shape

INVESTIGATION FINDING. Position-memory exists but is fragmented, and an origin-restore is **half-built**:
- The route back-stack (`overlayRouteStack[]`) stores **only `{key, params}`** — no per-frame snap/scroll.
- Child-back (pollDetail→polls) does **not** restore a remembered snap; it `preserveLiveY`s and only *looks*
  preserved because poll children share one physical sheet that never moved.
- `SearchSessionOriginContext { rootOverlay, tabSnap }` already captures origin + snap and restores it — but
  only for ROOT overlays, and `armSearchCloseRestore` **clobbers the snap to `collapsed`** for the search/poll
  origin, so it's *actively wrong* for the most common case, not just incomplete.
- There are **TWO** polls hardcodes (`dismissAppSearchRouteResultsToPolls` AND `closeActiveRoute`'s
  restaurant-with-no-parent → polls@collapsed), plus a press-up-vs-finalize **race** (two targets issued).

**The genuinely ideal shape (don't bolt on a wider search descriptor — fix the ROOT defect):** put
**snap + scroll on the back-stack entry** (`OverlayRouteEntry` gains a per-frame position) and make **search a
real frame** on that stack. Then *child-back and search-dismiss are literally ONE mechanism* (pop → restore the
entry's scene + snap + scroll), both polls hardcodes dissolve, and "search-dismiss is just back-navigation"
becomes true instead of approximated by a parallel session descriptor. `results → docked-polls@collapsed`
becomes the case where the popped entry is `polls@collapsed`.

**The hard, fragile part (net-new infra, harness-gated):** the dismiss READINESS HANDOFF is **collapsed-only
and poll-shaped in 3–4 places** — `commitDismissBoundary` fires only on `snap==='collapsed'`; the release gates
(`completeDismissHandoff`, the activeBundle swap, the settle gate) all require `pollHeader/Body/HostReady`. So
restoring to a *non-collapsed* or *non-poll* origin re-triggers the exact **2026-06-22 deadlock** ("leftover
sheet, can't search again"). Generalizing it to **target-snap-driven + substrate-agnostic** release is the real
work, and it MUST keep `{polls,search}@collapsed` byte-identical. The `searchSurfaceOwnsVisibleSheet` override
also only holds the frozen results while `displayedSceneKey ∈ {null,search,polls}`, so a restaurant/profile
origin needs the engine crossfade to cover the surface drop.

**Forward vs back (settled):** keep FORWARD = policy (`resolveDefaultSheetMotionPlan`), BACK = remembered
snapshot with policy as fallback. Do NOT reuse `promoteAtLeast` for back (it no-ops when already above the
floor → can't move *down* to a remembered lower snap); back uses explicit `snapTo descriptor.sheetSnap`,
clamped to the target's `allowedSnaps`.

**VERIFY-FIRST (load-bearing):** does launch-search actually RESET `overlayRouteStack` to `[search]`? If it
leaves the stack intact, child-origin back-navigation may ALREADY work via `closeChild`, shrinking this to
"generalize the readiness handoff" only. Prove on device before building the capture mechanism.

## Favorites-as-search = a second results SOURCE (independently buildable NOW)

INVESTIGATION FINDING — most of this already exists, and it does **not** depend on the transition engine.
- **A favorites list IS just entity IDs.** `FavoriteListItem` = `restaurantId` XOR `connectionId` + `position`;
  `listType` is single-axis (all-restaurant or all-dish). All display data is hydrated at read time. So
  "favorites = IDs we hydrate" is exactly right.
- **The FE surface is already source-agnostic at ONE seam:** `publishSearchMountedResultsDataSnapshot(results:
  SearchResponse, …)` / `handleSearchResponse` is the SOLE input for the list, sectioned projection, cards,
  marker catalog, AND the `cardsReady/nativeMarkerFrameReady/sheetReady` reveal gates. **Nothing downstream
  reads the query string.** Any source that yields a `SearchResponse` reuses the list + toggle strip + pins +
  reveal/dismiss for free. The "source abstraction" = add a `SearchRequestRuntimeMode = 'favorites'` that
  fetches and routes a `SearchResponse` through the existing funnel.
- **The hydrate endpoint reuses the search EXECUTOR**, not the hand-rolled favorites mapper: build a `QueryPlan`
  whose `restaurantFilters` carry the favorite entity IDs → `parseFilters → collectEntityIds → r.entity_id =
  ANY(...)` (zero builder change for **restaurant** lists), then call `SearchQueryExecutor.executeDual` and
  hand-assemble a `SearchResponse` envelope. The executor computes rank/craveScore/open-now/price/distance/
  lat-lng/locations/topFood in one SQL — exactly the fields the favorites mapper hardcodes to null today, so
  pins + cards + sort reach **parity-for-every-field-the-surface-reads** (NOT "byte-identical": query-only
  fields like matchEvidenceType/coverage legitimately differ, but no FE pin/sort path reads them).
- **Sort parity holds** (both order by score columns, no query-relevance term), so badge==list-position is real.

### v1 now-slice (refined by the parity review — these are correctness gates, not polish)
- **RESTAURANT lists only.** DISH lists need a new builder filter — a dish favorite stores a `connectionId`,
  but the builder has no `connection_id` filter (only `food_id`, which fans out to many restaurants). Add
  `EntityScope.CONNECTION` + a `c.connection_id = ANY(...)` branch (mirrors the existing `excludeConnectionIds`
  clause) as a fast-follow; ship restaurant lists first (zero change).
- **Omit viewport bounds** — fit pins to the list extent. The executor's bounds JOIN would silently drop
  favorited restaurants off-screen ("opening a saved list shows ALL of it" is the rule).
- **Surface `droppedItemCount`** — `executeDual` INNER-JOINs scores/locations/inventory, so a favorited
  restaurant with no score/geocode is silently dropped → `itemCount` (12 saved) ≠ rendered (9 shown). Compute
  requested-vs-returned IDs server-side, put it in `analysisMetadata` (no type change), so the surface can show
  "3 not shown yet."
- **Endpoint: `POST /favorites/lists/:listId/results`** (favorites-scoped, auth-aligned, shape-changeable) — NOT
  a generic `/search/hydrate` yet (don't freeze a by-IDs contract before a second consumer exists). Inject
  `SearchQueryExecutor` directly (the `runForPlan` wrapper doesn't exist); define its OWN DTO (the search DTO's
  `searchRequestId` is `@IsUUID()` — synthesize `favorites:${listId}:${updatedAt}` which the FE accepts).
- **FE**: redirect `BookmarksPanel`'s `openFavoriteListDetailRoute` to invoke the `'favorites'` runtime mode
  (records the favorites screen as reveal origin → return-to-origin dismiss); extend `resolveResponseActiveTab`
  with a favorites branch; the standalone `FavoriteListDetail` FlashList is then deletable.
- **Verify**: curl the endpoint, diff restaurants vs a query-search response for the same IDs; LOD-harness assert
  `renderP==roleP` for a list containing a score-less item AND an off-viewport item (the two silent-drop traps).
- **Defer**: dish lists, manual drag-`position` ordering vs score sort, multi-location pins, filter chips (hide in v1).

**Key implication: this is the ONE piece buildable NOW, independent of the transition engine** — the reveal/
dismiss flow already exists and already consumes a `SearchResponse`. It's also the natural first proof that the
"source-agnostic results" thesis is real.

### BUILD STATUS — BE DONE (uncommitted), FE next
`POST /api/v1/favorites/lists/:listId/results` is built + live (401-guarded; 0 TS errors; two adversarial
review rounds). It reuses `SearchQueryExecutor.executeDual` by entity IDs for BOTH axes:
- **restaurant list** → restaurants scoped to favorited IDs; dishes `[]` + `totalFoodResults:0` (TODO: skip the
  dish query once the executor exposes a single-axis path — today it runs and is discarded).
- **dish list** → dishes = favorited connections; restaurants = those connections' DISTINCT restaurants (so the
  map pins are correct).
- **empty-axis guard** short-circuits to an empty `SearchResponse` (the builder omits `= ANY(...)` on an empty
  array → would otherwise flood the global universe).
- `droppedItemCount` (in `metadata.analysisMetadata.favorites`) reconciles saved-vs-shown (executor INNER-JOINs
  scores/locations → score-less/un-geocoded favorites silently drop).
Files: `favorite-lists.service.ts` (getListResults), `favorites.controller.ts`, `favorites.module.ts`
(imports SearchModule), `favorites/dto/favorite-list-results.dto.ts` (new), `search.module.ts` (exports the
executor), `search-query.builder.ts` (+ first-class `connection_id` filter — additive, inert for normal search),
`search-query.dto.ts` + `packages/shared/.../search.ts` (`EntityScope` widened with `'connection'`).
**Remaining:** runtime parity-diff needs a real Clerk token (no dev bypass) → validate end-to-end via the FE on
the sim (real auth). Then the **FE `'favorites'` source mode**: route `BookmarksPanel`'s list tap through
`handleSearchResponse` (records favorites as reveal origin → return-to-origin dismiss), extend
`resolveResponseActiveTab`, delete the standalone `FavoriteListDetail` FlashList.

## Sequence (instrument-FIRST per CLAUDE.md, then build increment-by-increment)

0. **VERIFY on-sim first** (the red-team's explicit gate): prove the blank = incoming presented before paint
   (Metro `[MARKER]` of displayedSceneKey flip vs incoming `shouldRenderListBody` vs incoming onLayout);
   confirm which settle plane lands last; measure the blank window (1 vs several frames); confirm a paint-ack
   round-trips fast enough; profile two FlashList bodies co-rendered at intermediate opacity for thrash.
1. Contract + registry (preset descriptor, `content` plane, delete `swapImmediately`/`swapAfterCollapse`).
2. Policy resolver (preset from registry, content-plane in motionPlanes).
3. Controller (descriptor + progress token; seed content plane; paint-ack + onFinish completion w/ timeout).
4. Activity snapshot (admit incoming during transition via `isTransitionParticipant`; fix equality sets).
5. Presentation resolvers → 2-scene descriptor; thread the THREE forcings; both-legs shellSpec gate.
6. Render (Animated.View per-scene opacity from progress; pointerEvents handoff; onLayout ack).
7. Progress off `sheetYValue` (interruptible).
8. navPush preset (engine-driven nav-hide + clip-from-surfaces); modal preset (authorize OverlayModalSheet).
9. Cleanup + README.

Each step lands with on-device proof before the next; nothing committed until the owner has seen it work.
