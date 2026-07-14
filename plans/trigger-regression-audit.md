# Trigger-regression audit (wave3 charter §5) — READ-ONLY findings

2026-07-13. Brief: did the list-open two-step fate (built a48e96ef → unplugged 43ee4d01 →
erased 9bec4810) hit any OTHER designed source-agnostic search trigger? Designed truth:
page-registry.md §1 (listDetail: "OPEN fires the shared search flow") + §4 ("Every
child-scene OPEN is a search-flow trigger or a plain push. listDetail and entity taps fire
the shared flow"); product/polls.md:66 (entity-highlighted comment spans → restaurant
profile or entity-scoped search); listdetail-ideal.md §1; leg-9/leg-10 ledger records.

## VERDICT

**The two-step fate hit exactly ONE lane — the list world — but that lane has FIVE consumer
mouths, all dead on the world half today.** Every non-list search trigger (restaurant,
entity/food, natural query, shortcut, polls) is ALIVE end-to-end. Two designed span
surfaces were NEVER built (not regressions): profile-page comment spans and restaurant-
profile mention spans — the latter already receives entitySpans from the API and drops
them on the floor.

## Per-trigger findings

### DEAD (world half) — all five are the ONE list lane

1. **Lists home → regular list tiles.**
   Designed: page-registry §1 listDetail row. Today: `BookmarksPanel.tsx:673-684`
   `handleListPress` → `executeEntityRefAction({entityType:'list'})` →
   `entity-ref-action-policy.ts:60-67` list arm = plain `pushScene` → `ListDetailPanel`
   self-fetches (`getListResults`). No desire write, no map, no reveal.
   Unplugged 43ee4d01 (arm flip), erased 9bec4810 (listWorld lattice deleted).
   Distance-back SHORT: identity arm, resolver fetch (`search-world-fetch.ts:170`),
   reconciler case, reveal machinery all alive+orphaned (listdetail-ideal §1 inventory).

2. **Lists home → per-side All tiles.**
   Today: `BookmarksPanel.tsx:663-671` `handleOpenAll` → **direct `pushRoute('listDetail',
{listId:'all:*'})`, BYPASSES the policy entirely** (no title warm-seed, no single flip
   point). Same dead world half; one worse — it won't inherit the composite-verb fix unless
   rerouted through the executor. Born bypassed (43ee4d01 era).

3. **Profile-page list taps (own Profile tab + userProfile child, shared body).**
   Designed: registry §1 (listDetail "serves both your lists and other users' public
   lists") — and GIT-PROVEN world-backed at a48e96ef ("profile-panel-actions-runtime's
   byte-identical handleListPress copies now route through THE policy"; rig-verified
   favorites-as-search). Fate: 43ee4d01 flipped the arm (2026-07-11 05:22), then the SAME
   DAY the W3 profile rebuild aab98111 (07:03) rebuilt list tiles as **direct
   `pushRoute('listDetail', {listId, targetUserId})`** — `ProfileSectionsBody.tsx:320-330`
   `openListTile`. So this trigger suffered the two-step fate PLUS a third step: policy
   bypass. `profile-panel-actions-runtime.ts` survives with its list press amputated
   (settings/messages/followList only).

4. **`/l/<shareSlug>` deep link (share opens, join invites).**
   Designed: S-E rode the listWorld lane (listdetail-ideal §1 item 1). Today:
   `use-search-foreground-launch-intent-runtime.ts:70-77` sharedList → plain
   `pushRoute('listDetail', {shareSlug})`. Erased to plain push in 9bec4810 (the `/list/`
   codec arms + launch-intent consumer deleted; `desire-url-codec.ts` today has only the
   slug arm at case 'l').

5. **Messaging shared-list card.**
   `MessagingPanels.tsx:211-235` SharedEntityCard maps `list → entityType:'list'` →
   the same dead policy arm. Inherits the fix for free once the arm is composite.

### ALIVE (traced, not assumed)

6. **PollDetail comment entity spans** — `PollDetailPanel.tsx:161-185` `buildBodySegments`
   → `EntityLink` → executor: restaurant → `restaurantWorld` committed single-restaurant
   lifecycle (`use-search-foreground-launch-intent-runtime.ts:98-` — warm-seed profile +
   `runRestaurantEntitySearch`, pins/chrome/snap per canonical-sheet Phase 4);
   food/attributes → `entityDesire` → `launchEntitySearchResults` (skip-LLM). Person →
   plain push (designed plain, registry §4). The launch-intent consumer is mounted
   globally (search screen hosts all scenes), so spans fire from the polls child stack.

7. **ListDetail result-card presses** — `ListDetailPanel.tsx:994-1004` → executor
   restaurantWorld. ALIVE (leg-11).

8. **Shortcut/chip buttons** — `submitViewportShortcut` (+ `/s/<tab>` deep link,
   launch-intent runtime searchDesire branch). ALIVE, daily-proven.

9. **Search bar from any page** — ONE globally-mounted header chrome
   (`AppOverlayRouteHost.tsx:134` → SearchOverlayChromeHost → SearchOverlayHeaderChrome);
   submit rides the source-agnostic `submitSearch` verb (same one `/q/<query>` uses). ALIVE.

10. **Deep links** — `/r` restaurantWorld ALIVE; `/e` entityDesire ALIVE; `/q` `/s` ALIVE;
    `/p`/`/polls` ALIVE; `/u` plain push (designed). Only `/l` dead (item 4).

### NEVER BUILT (designed gaps, not regressions)

11. **Profile-page comment spans** ("click a comment span → map search flow from profile").
    NEVER wired at any commit: the W3 birth commit aab98111 already rendered
    `{comment.body}` as plain Text (today `ProfileSectionsBody.tsx:378-397`; row press →
    pollDetail push), and the API row (`GET /polls/users/:userId/comments`,
    `polls.controller.ts:97`; mobile `UserProfileCommentRow`, services/polls.ts:469) carries
    NO entitySpans. `git log -S EntityLink` on all profile files: zero hits ever. The owner's
    recollection almost certainly refers to spans working on PollDetail (reachable FROM the
    profile comments row via its pollDetail push + commentAnchorId). Design cite for spans
    generally: product/polls.md:66.

12. **Restaurant-profile Discussions (mentions) spans** — bonus finding: the mentions API
    was BUILT delivering entitySpans (aab98111: "entitySpans containment") but
    `RestaurantProfileViews.tsx:150-176` MentionCard renders `{card.body}` plain. Data
    shipped, render dropped.

13. **Notifications rows** — only `follower_added` has a press handler
    (`NotificationsPanel.tsx:84-91`, plain userProfile push, designed plain). Other types
    dead-end. Product gap, not a search-trigger regression.

## Consolidated restoration plan (the world-push leg — one coherent cut)

Sequencing: runs immediately after the perf/map session commits (leg-10 gate record,
ledger :1270-1283). Design of record: listdetail-ideal §1d + leg-9 wiring notes + leg-10
step-2 artifacts (commitFitAllCamera + 'middle' motion row already built and waiting).

1. **Composite verb (L — the core, design ready).** Policy list arm →
   `{kind:'pushScene', scene:'listDetail', params, world:{identity:{kind:'list', listId,
listType, displayTitle}}}`; executor pushes route THEN writes the desired tuple (sort
   rides filterVariant-class, shareSlug = access material). Presentation lane = a
   PARAMETERIZATION of `requestSearchPresentationIntent` (scene-agnostic "present world"
   keyed by the pushing entry — NOT a parallel path; lens-forward-compatible per the
   leg-10 gate read of map-world-lens-transport.md). Camera: `commitFitAllCamera` at
   reveal-ramp start, bark on arbiter-false (RED). Dismiss v1 = idle-write on
   last-world-entry pop; residency binding = the ideal (leg-9 defect #7). ListDetail body
   reads the presented world (self-fetch dies); strip flips consequence content→'world'.

2. **Consumer unification (S — this audit's additions).** Extend the EntityRef list arm
   with `listType` (known at every tap site) and optional `targetUserId`; then:
   `handleOpenAll` (BookmarksPanel:663) and `openListTile` (ProfileSectionsBody:320) route
   through the executor — deleting the two policy bypasses; the messaging list card and
   the `/l/<slug>` lane inherit (slug lane: the desire write rides the panel's
   slug→listId resolution edge, per §1d). Result: FIVE mouths, ONE verb — better than
   a48e96ef ever was (which had only Bookmarks + old profile panel).

3. **Span build-outs (M — closes the designed gaps; same leg or immediate follow).**
   (a) Extract the span renderer (buildBodySegments + EntityLink composition) from
   PollDetailPanel into a shared component. (b) API: user-comments endpoint returns
   entitySpans — `highlightCommentSpans` already exists (polls.service.ts:882); additive
   DTO field. (c) ProfileSectionsBody comments render spans (row press stays pollDetail;
   span press = the executor — search flow from the profile page, the owner's ask).
   (d) MentionCard renders its already-delivered entitySpans. All consumers get
   restaurant/entity taps ALIVE for free via the executor.

4. **RED contracts** (listdetail-ideal §1d): unresolved world tuple → failure body, not
   stuck skeleton; unexecuted camera intent barks; open-at-top → sheet demotes to middle +
   camera-settle and reveal-ramp land in one joint window (mach-clock, composite).

Sizing: item 1 = L (designed, gated only on the perf/map commit); item 2 = S; item 3 =
M (API S + shared renderer S + two render sites S); item 4 rides items 1-3.
