# S-D — One Desire + EntityLink (execution plan)

**Charter:** plans/trigger-nav-ideal-verdict.md S-D + GAP D + §5.2/§5.8. Grounded in the
2026-07-09 cut-surface sweep (file:line inventory below is verified). DEPENDS ON: S-C.3-B/C
(the restaurant launch arm's re-root chrome must die first — trap 1).

## The one policy, encoded 4× today (all collapse into `entityRef → action`)

1. PollDetailPanel entity spans + dispatch fork (`overlays/panels/PollDetailPanel.tsx:132-195,
958-1001`): restaurant → LaunchIntent restaurant; food/attribute → LaunchIntent entity.
2. Bookmarks + profile list rows (BYTE-IDENTICAL copies: `BookmarksPanel.tsx:531-540`,
   `profile-panel-actions-runtime.ts:35-44`): → LaunchIntent favorites.
3. Search-side `selectedEntityId` submission shape (3 sites, never touches LaunchIntent:
   `use-search-foreground-suggestion-submit-runtime.ts:100-124`,
   `use-search-submit-owner.ts:442-464`, `use-search-natural-submit-owner.ts:43-63` +
   recents history encoding).
4. The launch-intent restaurant arm itself (`use-search-foreground-launch-intent-runtime.ts:
82-194`) — a SECOND restaurant-open lane distinct from autocomplete's fast-path (trap 2).

## The design

- **`EntityRef`** (new, one type): superset of `EntitySpan` (`services/polls.ts:8-15`) and the
  autocomplete row identity — `{entityId, entityType: 'restaurant'|'food'|'food_attribute'|
'restaurant_attribute'|'person'|'list', label, childAnchor?}`. `childAnchor` optional
  (poll spans only — trap 6).
- **ONE policy fn `resolveEntityRefAction(ref) → { kind: 'pushScene', scene, params } |
{ kind: 'searchDesire', identity }`**: restaurant → restaurantProfile push (post-S-C the
  profile IS a world push); food/attribute → entity desire; person → push(userProfile);
  list → push(listDetail). Lives beside the stack algebra (nav layer — it bridges route
  controller + desire construction).
- **`<EntityLink entityRef>`** component (net-new; none exists — closest primitives:
  PollDetailPanel's span `<Text onPress suppressHighlighting>` styles :1664-1670 and
  StubScenePanels' DrillInRow). Renders span-style or row-style; calls the policy fn; zero
  per-surface wiring (I6). Home: `components/ui/EntityLink.tsx`.
- **LaunchIntent dissolves**: search-shaped members (restaurant, search, entity, favorites)
  become desire-constructions through the policy fn; pure-nav members (polls, external)
  become plain pushes. `saved_place` is DEAD today (parse-only, no consumer branch — trap 7):
  delete or wire deliberately, never leave ambient.
- **`list(listId)` Desire arm** (§5.2): replaces the `entities`+listId piggyback. Touches:
  contract union (search-desired-state-contract.ts:24-64), worldKey serializer (:213),
  resolver fetch fork (search-world-fetch.ts:171-174), and `launchFavoritesListResults`
  (becomes the list-desire constructor).
- **Autocomplete row kinds** (§5.8): widen `matchType` (services/autocomplete.ts:28) to
  include 'person'|'list'; the submit fork + SearchSuggestions render branches + telemetry
  bucketing widen IN THE SAME COMMIT (type-list disease — trap 3); new kinds route through
  the SAME EntityLink policy (NOT poll's bespoke early-return teardown — trap 4). The
  desired-tuple entity union does NOT widen (people/lists are pushes — confirmed §5.8).
- **Notifications** (S-E overlap): PollNotificationListener's payload discrimination
  generalizes to payload→Desire/push through the same values when S-E lands.

## Slices

- **S-D.1** ~~EntityRef + policy fn + EntityLink component~~ **SHIPPED 2026-07-09 (f02f9e5c)**:
  entity-ref-action-policy.ts (restaurantWorld = the warm-profile COMPOSITE, not a bare push —
  correction recorded in plans/s-c5-restaurant-stack-fact.md §S-D) + components/ui/EntityLink.tsx;
  PollDetailPanel fork + handleEntityPress + onEntityPress threading DELETED. RIG-PROVEN with the
  FIRST-EVER poll-dish-from-comment entry point (comment seeded via the dev perf token — BE
  resolves entitySpans server-side on POST /polls/:id/comments): gelato span → skip-LLM entity
  world → X → popToEntry back to the exact comment; Caffè Panna span → warm-profile composite.
  RIG LEVER (record): seed spans with `curl -X POST .../polls/<id>/comments -H "Authorization:
Bearer crave-dev-perf-scenario" -d '{"body":"<text mentioning known entities>"}'`; open the
  poll via testID poll-card-title-<pollId>; spans tap via coordinates on the detail sheet.
- **S-D.2** ~~List rows + list desire arm~~ **SHIPPED 2026-07-10 (a48e96ef)**: kind:'list' is
  first-class {listId, listType, displayTitle} (the 'entities' id-set piggyback + nullable
  listId + fetch throw arm are DEAD); policy list arm = listWorld (favorites-as-search today;
  the listDetail hybrid changes the arm in ONE place); executor extracted
  (use-entity-ref-action-executor — EntityLink renders + executes, row handlers execute) and
  both byte-identical handleListPress copies route through it. Rig: list tap → world key
  list:<id>:<type>, resolver fetched by listId, X-pop restored Favorites.
- **S-D.3 SCOPE VERDICT (2026-07-10)**: the person/list row widening is BE-GATED (autocomplete
  serves no such rows — widened client arms would be dead code); the selectedEntityId
  submission collapse is INTERLOCKED with recents/history/deep-link wire encodings
  (6+ producer sites, not the plan's 3) and belongs WITH S-D.4's channel dissolution. Do
  S-D.3+S-D.4 as one focused session: typed entity identity end-to-end, LaunchIntent
  dissolution, saved_place resolution, THEN the row widening when the BE serves the rows.
- **S-D.3** Autocomplete: row-kind widening (all unions in one commit) + person/list rows
  push through the policy; the selectedEntityId submission triplication collapses into the
  desire constructor.
- **S-D.4** LaunchIntent dissolution: remaining members become pushes/desires; the queue/
  normalize machinery in AppRouteCoordinator simplifies; `saved_place` resolved.

Validation per slice on the rig; red team after S-D.4.
