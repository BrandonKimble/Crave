# Transition Engine — Pillars 2/3/4 + §J/§K build plan (the "uncompromising end state")

Resumable build plan for the deferred spec items (owner: "tackle these to get to the uncompromising end
state"). Derived from `sheet-transition-engine-design.md` + two code-map passes (2026-06-27). The increment-1
engine is ACTIVATED + gapless crossfade + INSTANT-COVER done (see memory `page-transition-and-results-engine.md`).
Instrument-FIRST per CLAUDE.md; each piece lands with on-device proof; NOTHING committed until owner sees it.

## ⚠️ MAJOR REFRAME (2026-06-27, owner-confirmed): the fold-up (Stage 2/3) is NOT needed for the payoff.
Owner clarified Pillar 3's real ask: the poll-comment **entity-tap** should run an **entity-driven API search**
(like a favorite list) revealing **results + the map pin** via the readiness-gated reveal — NOT the bare profile
sheet it opens today. Code-map finding: the **favorites-as-search machinery already IS this** (FE
`launchFavoritesListResults` → BE `/favorites/lists/:listId/results` → `executeDual`/`executeSingle` by entity
IDs → `handleSearchResponse` → the SAME native-map readiness join). And there's an existing `runRestaurantEntitySearch`
(mode 'entity'). So the entity reveal targets the SEARCH SURFACE, which already has the readiness join — it does
**NOT need the Stage 2/3 fold-up** (that generalizes readiness to NON-search-surface scenes, which neither the
entity-tap nor the list work needs). Fold-up = DEFERRED (pure architecture, high risk, no payoff for these flows).

### WHY NO FOLD-UP (owner asked, confirmed 2026-06-27): the fold-up lifts the native-map readiness gate OUT
of the search surface so a NON-results scene could reveal gated on the map. EVERY flow here reveals the RESULTS
LIST + map = the search surface, which already owns that gate. The fold-up's motivating case was making the
restaurant PROFILE sheet map-aware — but we're DELETING the profile-sheet behavior in favor of results, so its
reason-to-exist evaporates. The non-restaurant → natural-search case proves it: that's literally the search bar's
own behavior (the original user of the existing gate), needs NO new BE. Fold-up only matters if a reveal must land
on a bespoke non-results scene gated on the map — which we explicitly avoid.

### DUAL entity-tap behavior (by entity type):
- **restaurant** entity (has `entity_id`) → entity-driven search BY ID (the favorites-style `buildEntityResults`
  core / new endpoint) → reveals that restaurant + its dishes + map pin.
- **food / food_attribute / restaurant_attribute** entity → **NATURAL search** by the entity TEXT (the EXISTING
  natural-search submit path — no new BE, it's a normal `/search`) → reveals the normal results list + map.
- Both reveal via the SAME search surface + readiness join; both want return-to-origin to the poll comment.
  `handleEntityPress` (currently restaurant-only, `entity.type !== 'restaurant'` early-return) branches on type:
  restaurant → entity LaunchIntent (by id); else → natural-search LaunchIntent (by `entity.text`/`entity.name`).
  (Today only restaurant spans are tappable — make food/attribute spans tappable too.)

### THE ENTITY-DRIVEN REVEAL — actual stages (much lower risk; reuses favorites):
- **BE**: extract favorites `getListResults` core (favorite-lists.service.ts L283-488: IDs→QueryPlan→
  executeSingle/executeDual→SearchResponse + empty-axis guard) into a reusable `buildEntityResults({isRestaurantAxis,
  restaurantIds, connectionIds, dishListRestaurantIds, dto, searchRequestId, sourceNote, buildAnalysisMetadata})`.
  Add `getEntityResults(userId, {restaurantIds?, connectionIds?})` + endpoint (e.g. POST `/api/v1/search/entity-results`
  or `/favorites/results-by-ids`) stamping `analysisMetadata.entityQuery`. The reusable core ALSO serves the list work.
- **FE**: entity LaunchIntent ({type:'entity', restaurantIds/connectionIds, label}) in
  `use-search-foreground-launch-intent-runtime.ts` (mirror the favorites intent at L23-35); a launcher
  `launchEntityResults` (mirror `launchFavoritesListResults`, use-search-structured-submit-owner.ts L548-620) that
  calls the new endpoint via an `executeEntityHydrateAttempt` (mirror `executeFavoritesHydrateAttempt`,
  use-search-submit-execution-owner.ts L492-590) → `startStructuredResponseLifecycle`. Update the single-restaurant
  suppression (`isFavoritesSourcedResults` in profile-auto-open-action-runtime + the singleRestaurantCandidate gate)
  to ALSO key off `analysisMetadata.entityQuery`. `handleEntityPress` (PollDetailPanel.tsx L804-816) dispatches the
  entity LaunchIntent instead of `openRestaurantRoute`. EntitySpan carries `entityId` + `type`('restaurant'|...).
- **Return-to-origin (Pillar 4-coupled)**: the comment origin is the CHILD scene `pollDetail` (origin-capture is
  ROOT-only today → would return to search home, not the poll). This is the Pillar 4 work (snap+scroll on the
  back-stack entry + child-origin capture). Phase 2 — do carefully (deadlock seam). v1 may return to search home.

## Order (lowest-risk/most-independent → highest-risk deadlock-seam):
1. **§J keyboard choreography** (poll creation) — self-contained, infra-proven, NOT entangled with the seam.
2. **Pillar 2 Stage 1** — symmetric search-surface crossfade (search↔polls/profile), Option B through the
   existing `effectiveDisplayedSceneKey` opacity path. Zero map change.
3. **Pillar 2 Stage 2** — transaction-keyed readiness/freeze primitive on `AppRouteSceneBodyAdmissionPolicy`.
4. **Pillar 3 readinessGatedReveal** — search-from-anywhere (entity-tap-in-comment → restaurant). HIGH value;
   depends on Stage 2's primitive.
5. **Pillar 2 Stage 3** — migrate search body onto the primitive; DELETE the `sceneKey==='search'` fork +
   `searchSurfaceOwnsVisibleSheet` override. Symmetric by construction.
6. **Pillar 4 dismiss=return-to-origin** — snap+scroll on the back-stack entry; the deadlock-seam
   generalization. HIGHEST risk — do last, extra verification, must keep {polls,search}@collapsed byte-identical.
7. **§K child-scene draft-restore** — depends on Pillar 3.

---

## KEY MAP REFS (file:line) — the load-bearing seams

### Search surface fold-up (Pillars 2/3)
- **The fork**: `BottomSheetSceneStackHost.tsx` ~L851-883. `searchSurfaceOwnsVisibleSheet` (useSearchSurfaceRuntimeSelector,
  true if `activeBundle.kind==='results' || heldBundle!=null || redrawTransaction!=null || dismissTransaction!=null`).
  `effectiveDisplayedSceneKey` forces 'search' when owns && displayed∈{null,search,polls} (L863-870). `effectiveOutgoing`
  relabels 'search'|'polls'→'search' when owns (L874-880); `effectiveIncoming` keeps the REAL key (INTENTIONAL — so it
  crossfades in). Search leg ALREADY rides `transitionProgress` via `resolveSceneStackLegRole` (L65-81) +
  `animatedLegOpacityStyle` (L408-416). Search renders via `SearchSceneStackBodyDisplayTarget` (L598-677, no
  contentEntry from authority). Activity-equality SKIPS search (L185-187).
- **SearchSurfaceRuntime** (`screens/Search/runtime/surface/search-surface-runtime.ts`): reveal join
  `cardsReady && nativeMarkerFrameReady && sheetReady` (L870-879). Dismiss: `armDismissMotion` (L635-695),
  `markPollPagePartReady` (L720-769, gates `sceneKey!=='polls'` L730), `completeDismissHandoff` (L800-826, needs
  pollHeader/Body/HostReady + bottomBoundaryReached + committedAtMs), `commitDismissBoundary` (L697-718, COLLAPSED-ONLY).
  Visual policy phases idle/results_redrawing/results_dismissing (L169-232).
- **Admission policy** (`navigation/runtime/app-route-scene-descriptor-contract.ts:73-81`): BOOLEAN-ONLY (7 fields:
  retainListBody/retainMountedBody/prewarm/delayFirstData/delayDataOnActivation/dataDelayMs/keepDataSubscribed).
  Consumed in `app-route-scene-stack-runtime.ts` (L579/624/658 sync; L680-694 retain; L1973-1975 activity). Equality
  L260-275. **Stage 2 extends this with a transaction-keyed readiness gate (NOT booleans).**
- **MUST-PRESERVE byte-identical**: MapView never remounts (stable React tag); 3-way reveal join order; sheet-drag
  dismiss handoff; reveal/dismiss↔pin-LOD lockstep; camera split-brain (center/zoom UNCONTROLLED).

### Back-stack / dismiss (Pillar 4)
- **VERIFY-FIRST ANSWERED**: `setRootRouteState` (`app-route-scene-switch-controller.ts:208-223`) UNCONDITIONALLY
  resets `overlayRouteStack=[nextRoute]`. Launch-search uses routeAction:'setRoot' → stack reset → child-origin
  back-nav does NOT work via the stack. So origin-capture-on-the-entry is genuinely needed.
- **OverlayRouteEntry** (`app-overlay-route-types.ts:364-367`): just `{key, params}` — NO snap/scroll. EXTEND with
  `snap?`, `scrollOffset?`. Persist in setRoot/push/update (controller L208-309).
- **Two polls hardcodes**: `closeActiveRoute` restaurant→polls@collapsed (`app-overlay-route-command-runtime.ts:77-90`);
  `dismissAppSearchRouteResultsToPolls` (`app-search-route-command-runtime.ts:53-74`). Press-up vs finalize race:
  `commitDismissBoundary` (use-results-presentation-close-transition-state-runtime.ts:262) vs `completeDismissHandoff`
  (use-results-presentation-close-transition-finalize-runtime.ts:72).
- **Origin context**: `SearchSessionOriginContext {rootOverlay, tabSnap}` (`searchRouteSessionTypes.ts:7-10`),
  captured `app-route-overlay-session-state-controller.ts:195-223` (ROOT-ONLY). **`armSearchCloseRestore` BUG
  (L225-245)**: clobbers tabSnap→searchRootRestoreSnap('collapsed') for search origin.
- **Deadlock seam**: `completeDismissHandoff` gated on pollHeader/Body/HostReady (collapsed-only visibility ⇄
  readiness circular dep, app-route-scene-stack-runtime.ts ~L1280-1304). Must become TARGET-snap-driven (fire on
  target snap reaching 'collapsed', not current).
- **Forward vs back**: forward=`resolveDefaultSheetMotionPlan` (policy, L167-225). Back=preserveLiveY (no rise).
  `promoteAtLeast` NO-OPS moving DOWN (L156-165) → back MUST use explicit `snapTo descriptor.sheetSnap` clamped to
  allowedSnaps.

---

## §J keyboard choreography (FIRST — independent)
Spec §J (poll creation): autofocus subject + keyboard-up on open; dismiss-on-drag; re-raise on top-snap. Infra
PROVEN in `PollDetailPanel.tsx` §D composer (`useAnimatedKeyboard`, `keyboardDismissMode:'on-drag'`,
`keyboardShouldPersistTaps`, the composeChin). `PollCreationPanel.tsx` currently has NO autoFocus/keyboardDismissMode
(red-team confirmed). Apply the PollDetailPanel composer pattern to the creation subject field.

## STATUS
- [x] **§J keyboard choreography — DONE (2026-06-27, uncommitted, sim-verified).** `PollCreationPanel.tsx`:
  `autoFocus={visible}` on the subject (cursor-on-open verified; a ref+effect.focus() RACED the body-surface mount
  and found a null ref — instrumented `[JCHECK]` proved `ref=false` at runAfterInteractions, so autoFocus is the
  robust fix); Publish CTA moved from inline → a keyboard-aware pinned chin (`useAnimatedKeyboard` + `publishChin`,
  mirrors PollDetailPanel composer) that RAISES above the keyboard (verified on tap); `useNavHideIntent('pollCreation',
  visible)` pushes the tab bar down so the chin owns the bottom band; `keyboardDismissMode:'on-drag'`. Sim caveat:
  the headless sim's hardware keyboard is "connected" so autoFocus shows the cursor but not the soft keyboard
  (a manual tap shows it + the chin raise) — on device autoFocus→keyboard. tsc 0 / lint 0.
- [x] **Pillar 2 Stage 1 (symmetric search crossfade) — VERIFIED ACHIEVED (2026-06-27), no new code.**
  Instrument-first (60fps): search↔profile crossfades SYMMETRICALLY (both directions show the two scene
  layers at intermediate opacity — s1f frame 336 forward, s1b frame 296 back); search↔polls is the docked
  lane's sheet-EXPAND (collapsed "Polls in NY" bar grows into the feed, search home persists above — the correct
  affordance for a resting bar, symmetric expand/collapse, NOT changed to a content crossfade); NO
  render_owner_invalidated in Metro. ROOT: the engine ACTIVATION done earlier this session already fed the engine
  `transitionProgress` into the search leg through the EXISTING `resolveSceneStackLegRole`/`animatedLegOpacityStyle`
  path (= the spec's "Option B, not a parallel input"). The asymmetric `effectiveOutgoing`-only relabel engages
  ONLY when `searchSurfaceOwnsVisibleSheet` (results/held/dismiss bundle) — i.e. results-entangled transitions
  (Stage 3 / Pillar 3/4), not these tab/docked switches. So Stage 1's goal is met; the activity-equality
  search-SKIP (BottomSheetSceneStackHost.tsx:185-187) is a Stage-2/3 concern (readiness propagation), not crossfade.
- [ ] Pillar 2 Stage 2 (admission readiness primitive)
- [ ] Pillar 3 readinessGatedReveal
- [ ] Pillar 2 Stage 3 (migrate + delete fork)
- [ ] Pillar 4 dismiss=return-to-origin (deadlock seam — last, careful)
- [ ] §K draft-restore
