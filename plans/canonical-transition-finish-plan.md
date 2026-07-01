# Canonical Transition Architecture + Finish-Both-Plans Build Plan

> THE canonical roadmap (2026-06-27, from a 9-agent review workflow, code-spot-checked). Supersedes the scattered
> transition plans for execution purposes (`transition-pillars-build-plan.md`, `sheet-transition-engine-design.md`,
> `transition-engine-increment-1.md` remain as design background). Goal: ONE trustworthy transition path, no cruft,
> and a FINITE end (work demonstrably ENDS at Phase 7). Full synthesis archived in the run output (wzi67785r).

## WHERE WE ARE
- **Plan A (Polls): essentially DONE.** BE phases 0–5 + FE creation/feed/cadence/thread built + sim-validated. Real
  remnants: (1) **description-as-seed** — `scanForKnownEntities` runs only on comments (polls.service.ts:826), never on
  `description`; graduation sends only `poll.question`. (2) **Sunday cron default** — POLL_RELEASE_DAY_OF_WEEK=1 (Monday)
  vs spec's Sunday — one-liner or record env-driven. (3) Phase-8 realtime rebuild — defer (functional). (4) §K
  search-from-anywhere return = transition Pillar 3/4 (lands in Phase 5, not standalone). Deferred-by-decision (NOT
  gaps): 5B sandbox, 5D disambiguation, §6.2 sentiment, media, restaurant-profile poll tabs.
- **Plan B (Transitions): only Pillar 1 shipped, via heavy scaffolding.** Pillar 2 (readiness primitive) NOT built —
  the missing keystone. Pillar 3 (reveal-from-child) PARTIAL — BUG 1 lives here. Pillar 4 (return-to-origin) NOT built
  (OverlayRouteEntry is {key,params} only; dismiss poll-hardcoded + collapsed-only). **19 cruft items to delete.**

## THE CANONICAL ARCHITECTURE — three composable layers (all load-bearing)
One sentence: **every scene declares readiness via one contract; every transition is a row in one descriptor table;
every navigation is a push/pop on one origin-carrying back-stack.** Nothing else governs timing, content, or return.
1. **Readiness contract (spine).** Replace the boolean-bag admission policy with `SceneReadinessContract`
   {requiredContentGates[], loadingGates?[], requiredRestoreGates?[]} + a transaction-keyed collector
   `markSceneContentGate(settleToken, gate)` (in app-route-scene-switch-controller.ts, beside activeSettlePlanesByToken).
   Generalizes the proven search reveal join {cards,nativeMarkerFrame,sheet}. The 'content' plane settles on
   ALL-gates-satisfied — **real rendered evidence, not a clock.**
2. **Descriptor table (surface).** One pure `TransitionDescriptor` per route {snapPolicy: coverFull|riseToMiddle|
   sameSnap|returnToOrigin; seeded: bool; contract; origin: rootTab|backStackEntry}. resolveContentHandoff/
   resolveMotionPlanes collapse to a table lookup. **No swapImmediately/preserveOutgoing value left to pass → opt-outs
   structurally impossible.**
3. **Origin-carrying back-stack (cross-surface + dismiss).** OverlayRouteEntry gains restoreState {snap, scrollOffset?,
   childAnchor?}. Two verbs: `revealRoute(target)` = PUSH (capture leaving entry's live restoreState);
   `dismissActiveRoute()` = POP to stack[len-2] + restore. Subsumes SearchSessionOriginContext; deletes both 'polls'
   hardcodes by construction.

## 320ms + FOLD-UP — explicit answer
- **320ms: REMOVED as the completer, kept as a never-hit watchdog** (renamed SCENE_READINESS_LIVENESS_MS) guarding
  Reanimated's non-guaranteed withTiming.onFinish. Layer 1 supplies the real ready signal → the timer stops governing
  normal behavior. Satisfies "no blind timers."
- **Fold-up: SCENE-fold DIES (confirmed); the READINESS-PRIMITIVE SURVIVES as Layer 1** (the spine). The owner's
  hypothesis is confirmed half-right — and the right half (one readiness contract for all scenes) is the whole fix.

## BOTH BUGS (canonical fixes, no special-casing)
- **BUG 2 (poll-card stale feed) = the `seeded` axis + Layer 1.** Keep the instant-cover snap (correct for a full-screen
  child). pollDetail seeded:true → seeded header paints same frame; `emptyComponent = loading ? null` (PollDetailPanel
  .tsx:1115) → `loading ? <CommentSkeleton/>`; the `thread` gate fires on comments-resolved. **Stale window = 0.**
- **BUG 1 (comment-span reveal behind pollDetail) = the `origin` axis + Layer 3.** The reveal becomes revealRoute(target)
  = PUSH from the pollDetail entry (capturing childAnchor=commentId). Host renders stack[top] → reveal covers pollDetail.
  Return pops to the exact comment. The child-vs-root distinction that caused the bug disappears.

## DELETION LIST (19, → zero opt-outs/hardcodes, one handoff path)
320ms-as-completer (→watchdog); 7 swapImmediately/preserveOutgoing opt-out sites; dead swapAfterCollapse enum (+ the
whole RouteSceneSwitchSheetContentHandoff enum); 2 'polls' dismiss hardcodes (closeActiveRoute polls@collapsed,
dismissAppSearchRouteResultsToPolls); 3 poll-welded dismiss gates (completeDismissHandoff + markPollPagePartReady +
commitDismissBoundary collapsed-only); armSearchCloseRestore clobber + ROOT-only SearchSessionOriginContext;
searchSurfaceOwnsVisibleSheet fork + isForwardOpen* relabel cluster; isFavoritesSourcedResults + favorites/
shouldHideResultsSheet suppression gates.

## BUILD SEQUENCE — finite, each phase sim-verifiable, deadlock seam LAST
- **Phase 0 — Close Plan A remnants** (independent, low-risk): ✅ IMPLEMENTED + diff/typecheck-verified (uncommitted).
  (1) description-as-seed: rebuildPollLeaderboard re-scans `poll.topic.description` (NOTE: description lives on
  PollTopic, not Poll) + folds keyed by createdByUserId in both axes; createStructuredPoll now calls rebuild at create.
  (2) graduation: description carried as an extractable creator-authored LLMComment unit (poll-{id}-description),
  prepended to llmComments, empty-thread guard updated. (3) cron: POLL_RELEASE_DAY_OF_WEEK default 1→0 (Sunday,
  getDay-correct), env-overridable. Files: polls.service.ts (rebuildPollLeaderboard + createStructuredPoll),
  poll-graduation.service.ts (closeAndGraduate), poll-scheduler.service.ts. COMPONENTS verified (scan proven, fold
  mirrors the proven comment path, typecheck 0). ⚠️ END-TO-END leaderboard-row confirm PENDING an AUTHENTICATED create
  (rebuild only triggers via authed create/comment/endorse — no unauth path): create a ranked poll whose description
  names a restaurant → GET /polls/:id/leaderboard shows the creator endorsing it. Realtime rebuild explicitly deferred.
- **Phase 1 — Readiness contract + collector, ADDITIVE.** ✅ DONE + SIM-VERIFIED (uncommitted). SceneReadinessContract +
  SceneReadinessGate (app-route-scene-descriptor-contract.ts); collector markSceneContentGate in
  app-route-scene-switch-controller.ts; dual-reported from the search surface's 3 marks. KEY FIX (on-device catch): the
  collector must key by the redraw **transactionId** (the marks carry it; it accumulates from submit), NOT the in-flight
  settle token — cards/nativeMarkerFrame fire during data-load BEFORE the overlay switch goes in-flight, so the
  settle-token/in-flight keying dropped them and content-ready never fired. After re-keying: on-device log shows
  gate=cards/nativeMarkerFrame/sheet under one txn + exactly one content-ready, dish results reveal normally (NULL
  delta). OBSERVE-ONLY (does not drive completion yet). NOTE: 3 pre-existing tsc errors (dish-result-card,
  restaurant-result-card, map-read-model-builder) are the in-flight crave-score-rising plan — separate, not transition.
- **Phase 2 — Skeleton primitive + capture-on-leave.** ✅ DONE + SIM-VERIFIED (uncommitted). Built
  apps/mobile/src/components/skeletons/ (SkeletonBox, CommentSkeleton, DishSkeleton, RestaurantSkeleton,
  SceneLoadingSurface) matching the real card geometries (unwired — Phase 3 wires them). Added
  OverlayRouteEntry.restoreState {snap, scrollOffset?, childAnchor?} + capture-on-leave in the controller's pushRouteState
  (stamps the leaving top entry's live shared-sheet snap; scroll/childAnchor null for now — Phase 5). Self-verified:
  `[RESTORESTATE] captured key=search snap=expanded` on a polls→pollDetail push; null-delta; areOverlayRoutesEqual
  ignores restoreState so no extra re-renders. Nothing reads restoreState yet.
- **Phase 3 — Cut forward opens to the descriptor's `seeded` axis, scene-by-scene; delete swapImmediately opt-outs.**
  - ✅ 3a pollDetail — DONE + RECORDING-VERIFIED (BUG 2 FIXED): SEEDED_FORWARD_OPEN_SCENES={pollDetail} in
    app-route-scene-transition-policy-runtime.ts; resolveContentHandoff(targetSceneKey) → swapImmediately for seeded
    forward opens; PollDetailPanel emptyComponent → <SceneLoadingSurface rowType="comment"/>. Recording: feed→pollDetail
    shell+skeleton in ONE frame (stale-feed window 0, was ~2.7s); comment resolves into the skeleton; search→results +
    pollDetail-dismiss unchanged; 0 new tsc errors.
  - ✅ 3b/3c/3d DONE + sim-verified: pollCreation/restaurant/saveList/profile added to SEEDED_FORWARD_OPEN_SCENES;
    DELETED the restaurant/saveList swapImmediately opt-out (#2, app-overlay-route-command-runtime.ts:172-186).
    CORRECTION: "cruft #3 (profile opt-out)" was MIS-IDENTIFIED — the only profile contentHandoff is a DISMISS-path
    branch (app-route-profile-route-intent-normalizer.ts:156), NOT a forward-open opt-out; left intact (STOP guard).
    No skeletons needed (restaurant has a SquircleSpinner, profile an ActivityIndicator — non-blank). Verified
    profile/restaurant/pollCreation open immediately (seeded swap, no stale feed); search→results unchanged. Tree now
    0 tsc errors (rising work resolved concurrently). FLAG: restaurant map-tap + pollCreation now swapImmediately (was
    preserveOutgoing) — intended seeded cutover, safer; map-tap path not interactively sim-verified (sheet-tap limit).
- **Phase 4 — Demote 320ms → watchdog + delete the search-surface fork + relabel cluster.** DoD (harness): watchdog
  never fires across all forward opens; NULL-DELTA search→results + tab switches with the fork removed.
- **Phase 5 — BUG 1.** 🔧 ATTRIBUTED + FIX APPLIED (verifying on sim). ATTRIBUTION OVERTURNED THE PLAN: the real root
  cause is NOT a missing revealRoute architecture — it's that the `restaurant` branch of the launch-intent consumer
  (apps/mobile/src/screens/Search/runtime/shared/use-search-foreground-launch-intent-runtime.ts) was MISSING the
  `prepareSearchSessionEntry({ captureOrigin: true })` call that the favorites + entity branches both make. That single
  call enters the search session (covering the originating overlay) AND captures the origin via the EXISTING
  SearchSessionOriginContext (which already gives cover + dismiss-back — favorites/entity prove it). Without it the
  restaurant profile opened BEHIND pollDetail (map panned, "page never changed"). FIX = add that one line to the
  restaurant branch (mirrors the working branches). The food/attr (`entity`) comment-span case ALREADY had the call, so
  it was never broken. The big revealRoute/childAnchor unification is UNNEEDED for BUG 1 — the origin context already
  does cover+return. (childAnchor "return to the EXACT comment" scroll remains a possible Phase-6 nicety, not required
  for the bug.) DoD (deep-link repro + screenshots): restaurant reveal COVERS pollDetail in front; dismiss returns to
  pollDetail; no bare-window flash; search→results unregressed; 0 new tsc.
- **Phase 6 — dismissActiveRoute pop-to-restore + delete the 'polls' hardcodes + origin clobber.** HOLD the
  collapsed-restore on the OLD poll predicate. DoD (sim): non-seam dismisses return to remembered origin+snap; the
  comment-origin returns to the exact comment.
- **Phase 7 — RISKIEST, LAST — generalize the dismiss-readiness gate; NULL-DELTA the deadlock seam.** Polls declares
  {header,body,host}@collapsed → byte-identical truth table by construction. GATE (DoD): harness asserts byte-identical
  {polls,search}@collapsed dismiss mut/step events vs Phase-6 BEFORE enabling any non-collapsed/non-poll restore. Then
  sweep residual cruft. **Final DoD: zero swapImmediately/preserveOutgoing; zero 'polls' hardcodes; 320ms a never-hit
  watchdog; both bugs fixed on sim; all 4 pillars built. WORK ENDS HERE.**

## OPEN RUNTIME QUESTIONS — sim-verify (instrument-first), per phase
- Q1 [3a]: instrument contentTransitionToken arm-vs-commit on the poll-CARD path (prior instrumentation was the
  comment-span path); confirm the ~2.7s split + that the `thread` gate closes the window.
- Q2 [1/3]: can markSceneContentGate generalize markPollPagePartReady's source-validation without regression?
- Q3 [3c]: does seedRestaurantProfile ALWAYS yield a non-null shell? If not, restaurant is readiness-gated (cover), not
  seeded — a descriptor-row change, not an architecture change.
- Q4 [7, THE seam]: NULL-DELTA proof on {polls,search}@collapsed — byte-identical pre/post. The hard gate.
- Q5 [4]: confirm the watchdog never fires on healthy opens across the full matrix.

## RISK (honest): Phases 0–4 low-risk/additive/reversible. Phase 5 medium (new cross-surface push). Phase 7 HIGH
(touches the 2026-06-22 deadlock) — mitigated to acceptable by going dead-last behind the mandatory NULL-DELTA harness
gate + byte-identical-by-construction for the existing seam.
