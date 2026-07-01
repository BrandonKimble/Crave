# Transition Engine — Pillars 2/3/4 + §J/§K build plan (the "uncompromising end state")

Resumable build plan for the deferred spec items (owner: "tackle these to get to the uncompromising end
state"). Derived from `sheet-transition-engine-design.md` + two code-map passes (2026-06-27). The increment-1
engine is ACTIVATED + gapless crossfade + INSTANT-COVER done (see memory `page-transition-and-results-engine.md`).
Instrument-FIRST per CLAUDE.md; each piece lands with on-device proof; NOTHING committed until owner sees it.

## 🐞 TWO TRANSITION BUGS — owner finger-test feedback (2026-06-27), instrument-confirmed
ISSUE 1 (comment-span reveal — PROVEN via deep-link repro + before/after screenshots): tapping a comment entity span
fires the reveal (handleEntityPress → dispatchLaunchIntent → launch-intent handler runs, `[REVEALINTENT] type=restaurant`
confirmed; openRestaurantProfilePreview opens the search-lane profile + the camera pans = map moves), BUT the POLLS-LANE
overlay (pollDetail) NEVER DISMISSES — the reveal opens BEHIND it. Symptom: pollDetail jerks down a hair (search bar
peeks above), map slides behind, "page never changes." ROOT CAUSE: the cross-lane dismiss doesn't fire from a CHILD
scene. favorites works because it launches from a ROOT tab (bookmarks) — switching the search session swaps the root
overlay; pollDetail is a CHILD route in the polls root, so entering the search session doesn't clear it. FIX = the reveal
dispatched from the polls lane must reset/dismiss the polls overlay + child route to the search surface (cross-surface-
from-child = Step 5/6 navigation; restaurant handler also lacks prepareSearchSessionEntry — entity handler has it but a
child route still isn't cleared). Delicate route-stack work (setRootRouteState / search-session-entry from a child).
ISSUE 2 (poll-CARD → pollDetail open — PROVEN via 30fps recording /tmp/cardtap_*.png): tapping a poll card should swap
the sheet CONTENT (header+body → detail) seamlessly at the SAME snap. ACTUAL sequence is unambiguous: frame 520 = feed
at MIDDLE snap; frame 560 = sheet JUMPED to the TOP snap but content STILL the FEED (poll card + Live/Results/All filter
chips — NO content change); frame 640 = content finally swaps to the detail (LATE). So the snap-change is decoupled from
+ fires AHEAD of the content handoff (jump-to-top then late swap), instead of the instant-cover/crossfade. No loading
state. So the poll-card→pollDetail path is NOT driving the transition engine's instant-cover/crossfade. FIX: route the
poll-card open (openPollDetail/pushRoute('pollDetail')) through the same instant-cover content-handoff the engine uses
(swap content at/with the snap, not a raw snap-to-expanded + decoupled late content). Delicate transition-engine work.
NOTE: Maestro CANNOT drive the inline comment span by ANY selector (text/id/coordinate/accessibilityLabel all fail —
RN merges nested <Text> so the span is not an addressable a11y node; the bottom-sheet pan also eats raw coord taps).
Only a real finger reaches it. The seeded poll (8eacf03f…, "Where is the best pizza in NYC?") is LEFT IN THE DB for
finger-testing.

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

### INVESTIGATION RESULT (2026-06-27): the dual entity-tap ALREADY EXISTS as `handleSuggestionPress`.
The autocomplete entity-suggestion click (`use-search-foreground-suggestion-submit-runtime.ts:60-123`) IS the
exact behavior: (a) RESTAURANT entity → `openRestaurantProfilePreview(entityId,name)` opens the profile
IMMEDIATELY on tap (before the search returns) + `pendingRestaurantSelectionRef={restaurantId}` locks it →
GUARANTEED profile, NO results-list-first (answers the determinism worry — it's NOT the fragile single-candidate
collapse heuristic; that's only the fallback at profile-auto-open-action-runtime.ts:85-98). (b) FOOD entity → no
pendingSelection → results list. (c) BOTH set `submissionContext.selectedEntityId/Type` → the BE
`buildSelectedEntitySearchRequest` shortcut (search-orchestration.service.ts:314-366) intercepts BEFORE the LLM →
$0 LLM, pure SQL, 100% deterministic (same path favorites uses). (d) BOTH `prepareSearchSessionEntry({captureOrigin})`.
SKIP-LLM proven for ALL 4 entity types (restaurant/food/food_attribute/restaurant_attribute) via FilterClause +
the query builder; ID PARITY complete (every comment span `entityId` is a `core_entities.entity_id` matching the
search filters). Comment spans are restaurant+food ONLY in practice (gazetteer scanner polls.service.ts:828 extracts
only those; attributes never appear). Today only restaurant spans are tappable (PollDetailPanel.tsx:149).

### NET-NEW WORK (small; no fold-up, no new BE):
0. **BE gazetteer**: enable attribute extraction for comment spans — `polls.service.ts:828` change the scan array
   `[restaurant, food]` → `[restaurant, food, food_attribute, restaurant_attribute]` (owner-requested). The scanner
   (`entity-text-search.service.ts:947+`) already takes any `EntityType[]` (`e.type = ANY(typeArray)`), and the
   skip-LLM shortcut (`buildSelectedEntitySearchRequest` switch) + the query builder already handle all 4 types →
   first-class, no search-code change. CONSIDERATION (not a blocker): attributes are open-set, so VERIFY highlight
   quality on real comments (precision/over-highlight); tune the matcher's attribute confidence threshold if noisy.
   Reveal: restaurant→profile; food/food_attribute/restaurant_attribute→results list (food_attr = dishes with the
   attribute `c.food_attributes && [id]`; restaurant_attr = restaurants with it `r.restaurant_attributes && [id]`).
1. Make ALL 4 entity span types tappable in comments (today restaurant-only; others styled-only) — PollDetailPanel
   L149 (the `tappable` gate) + L804-816 (handleEntityPress branches: restaurant→profile, else→results).
2. ROUTE the comment tap → the `handleSuggestionPress` core via a LaunchIntent (comment is a child scene; favorites
   use this pattern). Carry {entityId, entityType, name}; the search-surface launch-intent runtime runs the same
   selectedEntity submit (restaurant→instant profile preview; food→results list).
3. Return-to-origin to the poll COMMENT = Pillar 4 child-origin (origin-capture is ROOT-only today → v1 returns to
   search home; exact-comment return is the careful deadlock-seam-adjacent part).
WHY NO FOLD-UP (final): the restaurant profile opens instantly OVER the map, and the map pin comes from the fast
skip-LLM search — the profile rides the search surface. Nothing bypasses the search surface, so there's no
non-results scene needing the native-map readiness gate. CAVEAT to verify on sim: confirm the autocomplete
restaurant click is visually clean today (instant profile, no flash); the comment tap inherits that.

## ✅ ARCHITECTURE DECISION (2026-06-27 — entity-reveal-architecture workflow, 9 agents, all facts code-confirmed)

THE FOUR CANDIDATE APPROACHES ARE NOT RIVALS — THEY ARE 4 LAYERS OF ONE ARCHITECTURE. Recommended shape:
  RevealIntent (command) → SearchSource adapter (skip-LLM when ids known) → TWO independent ports: the existing
  results funnel + a NEW seeded MapMarkerLayer → PresentationArbiter (profile vs results) → readiness-gated reveal
  (the REVEAL join is ALREADY substrate-agnostic) → return-to-origin via a PUSH/POP back-stack carrying
  {snap, scrollOffset, childAnchor}.

FOLD-UP VERDICT: SUPERSEDED as a scene refactor. No variant needs it — every reveal rides the SEARCH surface; the
  profile rides it via SEEDED markers. Surviving piece = its DIAGNOSIS (REVEAL=already-generic, DISMISS=poll-welded)
  + the requiredGates-as-declarative-set idea, used ONLY for the LAST step (the dismiss-handoff generalization).
  → the owner's fold-up instinct was right that there's an asymmetry to fix; the fix is the seeded marker port +
    the dismiss-gate generalization, NOT folding the scene onto a non-search canvas.

RESTAURANT FAST-PATH = a map-only SEEDED-marker DATA path (publishMapMarkerSource({kind:'seeded'})), NOT a fold-up,
  NOT a render-substrate decouple. The render substrate is ALREADY decoupled (verified: shouldProjectResultSources
  gates on data presence not sheet visibility; single-restaurant catalog branch exists; MapView is a persistent root
  layer). The ONLY coupling: marker geometry is built from SearchResponse.restaurants, sole writer = the results
  lifecycle. A seeded port severs "I want a pin" from "I committed a search" → profile + 1 pin, NO results sheet
  (STRUCTURAL — the sheet is never in the transaction's gate set — not a shouldHideResultsSheet race). Seed comes
  from seedRestaurantProfile's existing payload (profile-preview-action-execution.ts:31) — fast path can even skip
  the network for the pin.

RETURN-TO-ORIGIN = ONE mechanism for all origins: RevealOrigin lives ON the back-stack entry; reveals PUSH (not
  setRoot); dismiss = one POP + restore. Extend OverlayRouteEntry {key,params} → +{snap?,scrollOffset?,childAnchor?}
  (app-overlay-route-types.ts:364). Child-back (pollDetail→comment) and search-dismiss become the SAME pop; the two
  'polls' hardcodes (app-overlay-route-command-runtime.ts:77-91; dismissAppSearchRouteResultsToPolls) + the ROOT-only
  SearchSessionOriginContext snap-clobber DISSOLVE.

THE ARBITER kills the verified autocomplete-restaurant-→-results bug: resolvePresentationTarget(response, hint) —
  'auto' + entityType==='restaurant' → profile via the DETERMINISTIC pendingSelection lock (NOT the fragile
  single-candidate heuristic). Unifies 3 scattered gates: resolveProfileAutoOpenAction
  (profile-auto-open-action-runtime.ts:21-99), the favorites null-out (use-search-submit-response-owner.ts:732),
  shouldHideResultsSheet (:758).

BUILD SEQUENCE (each independently sim-verifiable; deadlock seam LAST):
 1. BE: extract buildEntityResults core + getEntityResults endpoint (reuse favorites getListResults body; NO
    dish-query "cleanup" — favorites restaurant axis ALREADY uses executeSingle, favorite-lists.service.ts:416). LOW.
 2. Layer-2 seeded MapMarkerLayer port: publishMapMarkerSource({kind:'seeded'}) + controller restaurants-resolution
    (use-direct-search-map-source-controller.ts:1178) + gate ext (:1172). MAKE-OR-BREAK; verify via LOD harness.
 3. Layer-1 RevealIntent + dispatchReveal + entity/list SearchSource adapters (widen restaurant-only entity-adapter;
    add list mode mirroring favorites). food/attr/favorites reveals → results + multi-pin, $0 LLM.
 4. Layer-2 PresentationArbiter (collapse the 3 gates) + restaurant fast-path (seeded pin + profile, NO sheet). MED.
 5. Comment span first-class launcher: all 4 span types tappable (PollDetailPanel.tsx:149,806); handleEntityPress →
    dispatchReveal {child, pollDetail, childAnchor}. + BE gazetteer extend to food_attribute/restaurant_attribute
    (polls.service.ts:828). MED.
 6. Return-to-origin back-stack: extend OverlayRouteEntry, reveals PUSH not setRoot, restore {snap,scrollOffset,
    childAnchor}; uniform origin capture (fix restaurant-branch gap); dissolve the 2 polls hardcodes + the snap-clobber.
    HIGH (does NOT yet touch the handoff gates).
 7. HIGHEST RISK, LAST: generalize the dismiss handoff to target-snap-driven + substrate-agnostic (A's gate-set;
    poll-restore descriptor declares {pollHeader,pollBody,pollHost}@collapsed so the truth table is byte-identical).
    {polls,search}@collapsed NULL-DELTA verified FIRST, then non-collapsed/non-poll restores. Harness-gated.
 Steps 1-5 deliver the full variant×origin matrix on one path (bulk of value, low/med risk). 6-7 = the fragile
 back-stack/dismiss generalization. Fallback for the child case if step-7 too risky: re-open+scroll (single-level).

OPEN RUNTIME QUESTIONS — verify on the sim MYSELF (instrument-first), NOT static:
 Q1 [STEP2 make-or-break]: one seeded pin → renderP:1, roleGap:0, no wiggle, reveal gate satisfied, through the
    UNCHANGED pipeline (1-element-catalog edges: shortcutCoverageReady etc.)? If FALSE → fall back to
    "run-the-search-then-suppress" for the fast path. THE one load-bearing unverified assumption.
 Q2 [STEP4]: restaurant tap → pin + profile with NO results-sheet flash (z-order/timing, not just end state)?
 Q3 [STEP5]: attribute-span entityIds match core_entities.entity_id (open-set highlight precision)?
 Q4 [STEP7]: generalized dismiss handoff releases cleanly + {polls,search}@collapsed byte-identical?
 Q5 [STEP6]: child-comment scrollOffset accurate after pollDetail restore (anchor on commentId; capture render-time —
    effects don't fire in scene body-spec hooks per CLAUDE.md).

### STEP 2 GROUNDED DESIGN + ⚠️ GEOMETRY CORRECTION (2026-06-27, code-read myself)
CORRECTION to the synthesis's "skip the network for the pin": the profile-open SEED has NO geometry. The preview
plan (profile-preview-presentation-plan-runtime.ts:40-49) builds a RestaurantResultScorePreview with restaurantId/
name/score-subject ONLY — NO latitude/longitude. A pin needs geometry, so the seed alone CANNOT place a pin. BUT
hydrateRestaurantProfileById ALREADY fires at profile open (profile-preview-action-execution.ts:38) and returns a
full RestaurantResult (latitude?/longitude? present on the shared type, packages/shared/src/types/search.ts:137-138).
→ The real fast-path: instant profile (seeded shell) → when hydration lands the restaurant WITH geometry, publish a
  seeded marker source → pin appears. NO extra network, NO results sheet.
SEAM (verified in use-direct-search-map-source-controller.ts publishSourcesRef ~L1162-1400):
 - A profile sets highlightedRestaurantId (profile-preview-action-execution.ts:30 → setMapHighlightedRestaurantId),
   so selectedRestaurantId != null → shouldProjectResultSources ALREADY true (L1173) AND isSearchVisualProjectionLive
   true (L1220) AND the shortcutCoverage gates are SKIPPED (L1343-1344 require selectedRestaurantId == null) → a
   seeded profile pin bypasses coverage entirely (this is why Q1 looks answerable YES from code).
 - restaurants = mountedResults?.restaurants (L1178). markerCatalog: when selectedRestaurantId != null it ALWAYS takes
   buildMarkerCatalogReadModel({markerRestaurants: restaurants, selectedRestaurantId, ...}) (L1383-1400), NOT the
   precomputed branch. So feeding the seeded restaurant into `restaurants` builds the single highlighted pin.
STEP-2 EDITS (minimal): (1) data store search-mounted-results-data-store.ts — add module-level seededMarkerRestaurants
  + publishMapMarkerSource(restaurants|null) + getSeededMarkerRestaurants(), bump version + notify `listeners` (do NOT
  pollute `results`). (2) controller L1178 — when mountedResults has no restaurants but seededMarkerRestaurants exists,
  use the seed for `restaurants` (keep searchRequestId null so the precomputed-catalog branch is skipped). (3) profile
  hydration (profile-hydration-runtime-state-owner.ts) — publishMapMarkerSource([hydratedRestaurant]) when hydration
  lands geometry; publishMapMarkerSource(null) paired with setMapHighlightedRestaurantId(null) on dismiss
  (profile-owner-action-surface-runtime.ts:52,61). VERIFY Q1 on the LOD harness: open a restaurant profile from
  autocomplete (no committed results) → renderP:1, roleGap:0, no wiggle, pin at the restaurant.

### ✅ STEP 2 + RESTAURANT FAST-PATH — BUILT & INSTRUMENT-VERIFIED (2026-06-27, uncommitted)
DONE + verified on the sim (all JS, no native rebuild — force-bundle + cold-launch):
- FAST-PATH (use-search-foreground-suggestion-submit-runtime.ts handleSuggestionPress): a restaurant entity →
  openRestaurantProfilePreview + EARLY RETURN (skip submitSearch). Profile content = hydration; map = seeded pin; NO
  results sheet ever mounts. VERIFIED on sim: tapping the "Scarr's Pizza" suggestion opens the PROFILE (heart/share/X),
  NOT a results sheet — fixes the verified autocomplete-→-results bug. Non-restaurant entities/queries still search.
- STEP 2 seed port (agent-built, 4 files: search-mounted-results-data-store.ts publishMapMarkerSource/getSeededMarkerRestaurants;
  use-direct-search-map-source-controller.ts wire; profile-panel-hydration-runtime.ts publish-on-hydrate;
  profile-shell-state-publisher.ts clear-on-highlight-clear). Seed publishes correctly — INSTRUMENT-CONFIRMED the
  hydrated restaurant carries valid geometry + a real displayLocation/locations[0] with googlePlaceId.
- TWO catalog bugs found+fixed via instrument-first (the seed reached the controller fine; the CATALOG dropped it):
  (1) RANK: buildMarkerCatalogReadModel (map-read-model-builder.ts:116-119) drops any restaurant with no numeric
      rank (rank is a search concept; a hydrated profile restaurant has none). FIX: seed gets rank 1
      (profile-panel-hydration-runtime.ts).
  (2) ACTIVETAB: the catalog branches on activeTab; the fast-path skips the search so activeTab stays 'dishes' → the
      builder takes the empty-dishes branch → 0 pins. FIX: controller forces activeTab:'restaurants' for the pure-seed
      projection (isSeededRestaurantProjection, use-direct-search-map-source-controller.ts).
  → after both fixes the catalog builds exactly ONE pin: ctrl-catalog entries=1 primary=1. Q1 RESOLVED at the catalog
    level (the seed yields a clean single pin through the same pipeline that renders every search pin). Debug logs removed.

### ✅ CAMERA-FOCUS-ON-HYDRATION — DONE & sim-verified (2026-06-27)
New file profile-seeded-camera-focus-handler.ts: a module-level register/get bridge (mirrors the data-store seed
pattern) that sidesteps the construction-ordering gap. The owner (profile-owner-runtime.ts) registers
profileActions.focusRestaurantProfileCamera via an effect; the hydration calls focusSeededMarkerCamera(seededRestaurant)
right after publishMapMarkerSource. NO scoping flag needed — the underlying camera motion is IDEMPOTENT (no-ops when the
camera is already on the restaurant, which is exactly the results/map-pin opens that already focused), so only the
no-coordinate fast-path actually moves. VERIFIED on sim: instrumented `native pins=1` (the seed pin reaches the native
map) AND the map visibly recentered from Midtown to the LES (Scarr's) on profile open.
→ THE COMPLETE MAP-AWARE RESTAURANT FAST-PATH IS DONE + SIM-VERIFIED: autocomplete restaurant suggestion → restaurant
  PROFILE (no results sheet, fixes the verified bug) → map centers on the restaurant → its single pin renders (pins=1).
  Typecheck clean (0 errors), bundle clean (no debug logs). NOTHING committed.
FLAG (not mine): the controller diff carries a PRE-EXISTING uncommitted `[stack]`/stackRankByMarkerKey block with a
`console.log('[stack]…')` "REMOVE after" (buildDirectLabelStores ~L883-911) from prior label-stack work — strip before commit.
POLISH (deferred): the 'autocomplete' camera motion keeps the CURRENT zoom; opening a profile from a far-out camera lands
a wide view. Could focus to a consistent closer zoom for a tighter restaurant view.

### IN PROGRESS — comment-span entity reveal (Steps 3+5)
- ✅ BE GAZETTEER attributes DONE (polls.service.ts highlightCommentSpans ~L826: added EntityType.food_attribute +
  restaurant_attribute to scanForKnownEntities). Typecheck clean. FE/BE span types match (services/polls.ts EntitySpan
  is `string`). ⚠️ PRODUCT CAVEAT (agent-flagged): the matcher is closed-set + word-boundary (NO spurious substring
  matches), BUT short common attribute words ("spicy","fresh","cozy") highlight PER-OCCURRENCE wherever they appear
  (incl. non-food contexts) IF they exist as active attribute entities. Vocabulary-curation decision, not a code bug —
  needs an owner call (min-length / multi-word-only / stop-list) before relying on attribute spans in the wild.
- ✅ FE REVEAL WIRING DONE (code, typecheck clean): new LaunchIntent `{type:'entity'; entityId; entityType; submittedLabel}`
  + launchEntitySearchResults (submitSearch w/ selectedEntityId/Type → skip-LLM results) + launch-intent handler
  (mirrors favorites) + PollDetailPanel handleEntityPress dispatches: restaurant → `{type:'restaurant'}` (the verified
  fast-path), food/attr → `{type:'entity'}` (submittedLabel=entity.name); all 4 span types tappable; the map-less
  openRestaurantRoute path DELETED. Files: app-route-types.ts, use-search-submit-owner.ts, the launch-intent
  contract/runtime, use-search-root-runtime-control-stage-runtime.ts, PollDetailPanel.tsx.
- ✅ FOOD ENTITY REVEAL — SIM-VERIFIED: autocomplete "pizza" food-entity tap → ranked DISH results list (house round
  slice 9.9 / mushroom slice 8.7 / pizza slice 8.6 @ Scarr's) + map pins. SKIP-LLM ($0) DEFINITIVELY CONFIRMED by API-log
  contrast: the food-entity tap produced NO `analyze_search_query` log (LLM never called), while a control natural
  search ("romantic rooftop dinner with a view") DID fire `analyze_search_query` (LLM extracted restaurantAttributes
  [romantic,rooftop,dinner,view]). This is the SAME submitSearch-w/-entity path launchEntitySearchResults uses.
- ✅ GAZETTEER attribute scan is SOUND: scanForKnownEntities (entity-text-search.service.ts:947) uses its OWN clean
  query (no publicCraveScore) → attribute comment spans WILL be produced. (Distinct from the broken autocomplete path.)
- ⚠️ FOUND (instrument-first, API log) — PRE-EXISTING attribute-AUTOCOMPLETE bug: searchEntitiesForTerms throws
  Postgres 42703 `column "publicCraveScore" does not exist` for food_attribute/restaurant_attribute types
  (entity-text-search.service.ts:385). Breaks attribute SUGGESTIONS while typing → the attribute reveal is currently
  untestable via autocomplete. Does NOT affect the gazetteer spans or the restaurant/food reveals. Spawned task_91491cba.
- ✅ COMMENT-SPAN RENDER — SIM-VERIFIED via a DB seed: inserted a poll ("Where is the best pizza in NYC?",
  region-us-ny-new-york, mode=discussion, poll_id 8eacf03f…) + a comment ("Scarr's Pizza has the best pizza",
  comment_id 84a1c589…) with precomputed entity_spans. Navigated the app: polls band → poll → poll detail. The comment
  renders with BOTH spans as tappable red-underlined links ("Scarr's Pizza" restaurant + "pizza" food). So
  gazetteer→entity_spans→tappable-rendering works end-to-end on real data. (Seed LEFT IN THE DB for manual finger-tap.)
- ⚠️ THE ACTUAL SPAN TAP is NOT machine-verifiable on this sheet: Maestro can't drive it — RN merges nested <Text> so
  the inline span isn't a queryable a11y node (testID/accessible both failed to expose it), and the bottom-sheet pan
  responder eats raw coordinate taps (a temp [SPANTAP] log never fired from a coordinate tap). This is the documented
  CLAUDE.md limitation; a REAL FINGER tap fires the standard RN onPress. CONFIDENCE the feature works on a real tap is
  HIGH: dispatchLaunchIntent→launch-intent-handler is the SAME proven path favorites uses (same overlay runtime), and
  both reveal targets are sim-verified. The one on-device-unverified link is purely the synthetic tap firing onPress.
  → To close it: tap a span with a finger on the seeded poll, OR add a temp Pressable test-button (next session).
- ⚠️ RETURN-TO-ORIGIN: this increment returns to the POLLS-ROOT on dismiss (existing root origin capture), NOT the
  exact comment. The user's v1 spec is "return to the exact comment" → that's Step 6 (child-origin back-stack), the
  next focused step. The reveal plumbing built here is reused; only the origin capture/restore changes in Step 6.

### NEXT: Step 6 (child-origin return-to-exact-comment) + Step 7 (dismiss-handoff). Step 1 (BE buildEntityResults)
deferrable — the entity reveals use the existing skip-LLM search path (selectedEntityId/Type), no new BE endpoint.

---

### ⚠️ INSTRUMENT-FIRST CORRECTION (2026-06-27): the autocomplete restaurant suggestion → RESULTS, not a profile.
Recorded tapping the "Scarr's Pizza" restaurant suggestion (acr2 frames): 395 = a "Scarr's Pizza" sheet with the
LOADING SQUIRCLE; 410 + final = a RESULTS sheet (filter chips Restaurants/Dishes/Open-now/Price + "1. Scarr's
Pizza" row). So `handleSuggestionPress`'s `openRestaurantProfilePreview` did NOT yield a restaurant PROFILE — it runs
a results search. The single-candidate collapse did NOT fire (a dish "pizza slice" was in the response). So my
earlier "reuse handleSuggestionPress → instant profile" was WRONG.
IMPLICATION — the fold-up question is REOPENED for the restaurant PROFILE-WITH-MAP:
- GUARANTEEING the profile is easy (explicitly openRestaurantRoute — deterministic, no results-first).
- But MAKING IT MAP-AWARE (the restaurant's pin) is the real question: map pins come from the search/results
  surface (`publishSearchMountedResultsDataSnapshot`), coupled to the results sheet. To show the pin on a PROFILE
  (no results sheet) you need EITHER (A) a map-only search path (populate markers, suppress the results sheet),
  (B) the profile over a hidden results sheet (no fold-up, but dismiss reveals the results), OR (C) the profile
  driving the map directly = the FOLD-UP / a direct profile→map integration.
- So before recommending the restaurant flow, INVESTIGATE the map-population coupling: can the native map show a
  single restaurant pin INDEPENDENT of the results sheet (a clean map-only path), or is markers⇄results-sheet
  inseparable (→ fold-up needed for a clean map-aware profile)? The FOOD/attribute → results-list case is
  unaffected (it WANTS the results sheet) and remains clean + skip-LLM.

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
