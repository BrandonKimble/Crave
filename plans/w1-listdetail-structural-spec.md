# W1 listDetail structural spec — entry-keyed mounts + the pre-mount law

Implementation spec for W1.1/W1.2 core (registry-implementation-plan.md), written 2026-07-11.
Sources: red-team-2026-07-10.md (RT-19 sharpened verdict + the pre-mount law), trigger-nav-
ideal-verdict.md §4/§5, page-registry.md §1b/§7.5/§7.6/§8.1/§8.14/§8.16, product/favorites.md,
plans/s-b-entries-as-values.md, and the code as of main@HEAD. This is a SPEC — no code here.

The charter sentence this executes (RT-19, red-team doc :328): _"REMAINING (listDetail-era
structural pass, one pass with the pre-mount law): entry-keyed mounts for true per-entry
state/scroll isolation"_ — combined with the pre-mount law (:283): _"a commit instant may
only FLIP VISIBILITY; it may never build."_

---

## A. The pre-mount + entry-keyed contract

### A.0 Ground truth (what exists today — verified by read)

- **Route layer is already per-entry.** `OverlayRouteEntry = {entryId, key, params, origin}`
  (app-overlay-route-types.ts:~495-520); `pushRouteState` ALWAYS stacks — the same-key
  top-replacement is deleted (app-overlay-route-stack-algebra.ts:~155, S-B slice 4 comment);
  pop restores the popped-to entry; `popToEntryRouteState` exists
  (app-route-scene-switch-controller.ts:916).
- **Rendering is still ONE LEG PER SCENE KEY.** The slice-4 comment says it outright:
  "Rendering stays one leg per scene key (a rendering CACHE under the hard-swap engine); the
  leg re-seeds from the top-most entry of its key." Concretely:
  - `resolveMountedSceneKeys` / `sceneEntryByKey` and ~10 sibling maps in
    app-route-scene-stack-runtime.ts (:807+, :927-939) are `Map<OverlayKey, …>`.
  - Panels read `useTopMostRouteEntryForScene(key)`
    (navigation/runtime/use-top-most-route-entry-for-scene.ts) — topmost-per-KEY, the exact
    shape RT-19 names.
  - The body host is a per-key switch: BottomSheetSceneStackMountedBodyRegistry.tsx renders
    `<ListDetailMountedSceneBody />` (today `createStubScene('listDetail')` in
    StubScenePanels.tsx:195) with NO entry identity in props.
  - Scroll/segment/detent lanes are keyed by scene-key-shaped strings (staged as "3b" in
    s-b-entries-as-values.md — deliberately NOT done yet; safe today only because the stub
    has no entry points, so two live listDetail entries cannot yet exist).
- **The state-loss HALF is fixed** (5b3aed1b): UserProfilePanel/FollowListPanel key page data
  on the react-query cache (`['userProfile', userId]`, staleTime 60s) so pop-back is
  instant-from-cache. That is the DATA pattern; the MOUNT isolation is what W1 builds.

### A.1 The contract, stated

**C1 — Entry-keyed mounts (children only).** For child scenes that can stack twice
(listDetail, userProfile, followList — the drill-loop set), the mounted unit is
`key#entryId`, not `key`. Root pages stay singleton per key by construction (tab-switch
warmth is sacred — s-b doc "The model"). Lifetime = the entry's lifetime in the stack
(+ the settle window while it is the frame's outgoing leg). Re-open after pop = new entry =
fresh mount. Depth-K eviction (verdict §5.3: legs beyond depth K unmount, entry keeps
data + origin for instant remount) ships with K=3 as a policy constant; with page data on
the query cache, an evicted-leg remount is skeleton-free anyway, so K is a memory knob, not
a UX knob.

**C2 — Params flow per-entry.** A mounted body receives ITS entry (entryId + params) —
by prop from the mount host, not by `useTopMostRouteEntryForScene`. The hook remains valid
only for singleton scenes; the listDetail body must never call it. This is what makes
`listDetail(A) → userProfile → listDetail(B)` render A and B as two live, independent
bodies with pop revealing A byte-exact.

**C3 — Per-entry isolation of the three state classes.**

- _Component state_: automatic once mounts are entry-keyed (React state lives in the
  instance). No serialization/restore machinery — the instance simply never unmounts while
  in-stack (below depth K).
- _Scroll lane_: the scroll-offset/segment registries that are string-keyed by scene key
  become keyed by `key#entryId` for children (the staged 3b work, executed HERE, scoped to
  the child set). Files: the scroll/segment lanes in
  useBottomSheetSharedScrollEventsRuntime.ts / useBottomSheetSharedActiveListRuntime.ts and
  the origin-capture provider + detent ledger seams noted at
  app-route-scene-switch-controller.ts:237-261.
- _Query subscriptions_: keyed by DATA identity (`['listDetail', listId]` etc.), NOT
  entryId — two entries for the same list SHARE the cache row (correct: one truth per list;
  a rename in B's edit mode must show in A on pop). Entry-keyed is for view state; data
  stays id-keyed. This is the 5b3aed1b pattern, unchanged.

**C4 — The pre-mount law.** A push/pop commit instant may only flip visibility. Applied to
listDetail:

- _Push_: the incoming listDetail body mounts INVISIBLY (alpha-0 / detached-from-pointer)
  at push-INTENT time, renders its skeleton (or cache-served content) into a real Fabric
  subtree, emits paint-ack; the transition commit then flips visibility and runs the motion.
  The existing paint-ack hard-swap engine already provides the ack slot (verdict §2 "generic
  transition core") — the change is that mount begins at intent, not at commit.
- _Data arrival upgrade_: when the list payload lands (often before settle, from cache
  immediately), rows reconcile inside the already-mounted invisible/visible tree — never a
  fresh subtree at a commit instant. Same law as prepared rows / sprite prewarm.
- _Pop_: the outgoing body unmounts AFTER settle (the existing
  preserveOutgoingUntilSettle contract), chunked if teardown proves heavy — measure first.
- _RED-provable_: keep the existing >30ms apply loud contract (821bcc22) as the gate; add a
  `[PREMOUNT]` violation log when a body's FIRST Fabric commit lands inside a transition
  window. A metric that can't show red is lying.

**C5 — Frame identity.** `PresentationFrame` gains `activeEntryId / presentedEntryId /
outgoingEntryId` alongside the existing key fields (the s-b "Frame gains instance identity
WITHOUT retyping its key fields" design). Key-typed consumers (native targets, silhouette,
sheet host) untouched; only the scene-stack runtime and the body host read the ids. This is
what lets a same-key transition (listDetail A→B) distinguish its two legs.

### A.2 What is touched vs reused (collision surface — anchor attention)

REUSED (no changes): stack algebra, pushRoute/popToEntry verbs, origin-on-entry capture,
paint-ack engine, skeleton engine (SceneLoadingSurface), results renderer, query-cache data
pattern, the one physical sheet + persistent header host.

TOUCHED — **shared machinery, collision with the active foundation session**:

1. `app-route-scene-stack-runtime.ts` (3,063 lines) — mounted-set becomes mounted-ENTRIES
   for the child set; `sceneEntryByKey` + sibling maps gain `key#entryId` keys for children.
   THE riskiest file; the foundation session tunes chrome/feel, not this runtime, but it is
   one import away from everything. Mitigation: a single surgical commit that is
   behavior-identical for every scene except the child set, landed early, rebased often.
2. `BottomSheetSceneStackMountedBodyRegistry.tsx` + the body-host mapping — from
   per-key switch to per-mounted-entry render (props carry the entry). Shared ground with
   any panel work; small diff.
3. Scroll/segment/detent lane keying (useBottomSheetShared\*Runtime) — string-key widening
   for children only. The foundation session's glide work reads these; coordinate by
   committing first.
4. `PresentationFrame` type + its equality fn — additive fields only.
5. StubScenePanels.tsx:195 — the stub export replaced by the real ListDetail body module.

NOT touched: transition-engine motion/chrome files (explicit collision-discipline
exclusion), the map surface, search reconciler.

### A.3 listDetail's scene shape (the pattern every child page copies)

listDetail is a **world-backed orphan** (verdict §4.1): its entry payload is a Desire with
the `list(listId)` identity arm (§5.2); pushing it runs the search flow (map pins +
synchronized reveal) via the SAME lane favorites-as-search already uses (BookmarksPanel.tsx
:531 — "the listDetail hybrid changes the policy arm, not this handler"; S-E already proved
crave://l/<slug> → list world end-to-end). W1 flips `executeEntityRefAction`'s list arm from
"present list world under the search scene" to "push(listDetail, desire)" — the world
machinery is reused, the stack entry becomes real. Full 8-piece scene contract: metadata row
(exists, flip `requiresOwnerSceneKey` to true when opens land), body, results skeleton
(reuse — registry §1: "reuse results skeleton"), header descriptor, origin provider,
failure/empty spec (§5.6 incl. the dead-slug "this list is private" body), snap, nav-out
(derived from depth — nothing to do).

---

## B. The data layer

### B.0 Existing (apps/api/src/modules/favorites)

- `GET /favorites/lists` (+ `GET /users/:userId/favorites/lists` public) — summaries.
- `GET /favorites/lists/:listId` — detail (owner-only today; :175 getListForUser).
- `POST /favorites/lists/:listId/results` (:60 / service :217 getListResults) — items
  through the search executor → map-ready results. Access: `ownerUserId == viewer OR
shareEnabled` (the RT-18 landmine).
- CRUD: create/update(list, incl. visibility)/position/delete; items add/update/remove
  (FavoriteListItem already has `note` VarChar(512) + `position` — schema.prisma:1196-1199).
- Share: `POST/DELETE /favorites/lists/:listId/share` (enable/rotate via `dto.rotate` /
  disable), `GET /favorites/lists/share/:shareSlug` (unauthenticated, writes a share event
  per hit — RT-18 flood note).

### B.1 Changes + missing endpoints

1. **RT-18 slug-as-capability (decided, rides W1).** `getListResults` + `getListForUser`
   replace the `shareEnabled` boolean grant with: owner OR collaborator OR
   `shareSlug`-presented-and-matching. DTO: both endpoints accept optional
   `shareSlug?: string`; rotation = revocation falls out. Add share-event write dedupe
   (per slug+ip/day or per slug+viewer). Private flip: `updateList(visibility:'private')`
   also nulls `shareEnabled`, deletes collaborators, keeps the slug row dead → dead-slug GET
   returns `410 {state:'private'}` (distinct from 404) so the client renders the §5.6 body.
2. **Viewer role resolution.** Extend the list-detail DTO with
   `viewerRole: 'owner'|'collaborator'|'viewer'` + `defaultSort:
'custom'|'best'|'recent'` (custom iff a custom order exists — §8.14 their-ranking
   default). One field; no separate endpoint.
3. **Collaborators (new model + endpoints).** `list_collaborators (listId, userId,
invitedByUserId, createdAt, @@unique(listId,userId))`. Endpoints:
   - `GET /favorites/lists/:listId/collaborators` → `{owner: PersonDto, collaborators:
PersonDto[]}` (PersonDto = the person-rows shape: userId, username, displayName,
     avatarUrl).
   - `POST /favorites/lists/:listId/collaborators/join` body `{shareSlug}` — the invite IS
     the slug presented with intent (universal-share "invite as collaborator" = a link
     whose accept calls join). Idempotent (P2002 → success, per RT-10 precedent).
   - `DELETE /favorites/lists/:listId/collaborators/:userId` — self (leave) or owner (kick).
   - Full-parity powers = the item/order mutation guards widen from owner-only to
     owner-or-collaborator (service :624/:704/:734/:591).
4. **Custom order read/write.** Write exists (`updateItem` position / `updateListPosition`).
   Add a batch reorder to avoid N PATCHes on drag-save:
   `PATCH /favorites/lists/:listId/items/order` body `{orderedItemIds: string[]}` —
   validates set-equality with current membership, single transaction. Results endpoint
   gains `sort?: 'custom'|'best'|'recent'` (custom = position asc; default per B.2 field).
5. **Notes read**: already on the item DTO (`note`); verify getListResults projects it into
   each result row (the renderer shows it under the photo strip); if absent, add
   `note?: string|null` to the result-row DTO — projection only, no new endpoint.
6. **The "All" list (§8.16)**: virtual id (`all:restaurants` / `all:dishes` [+ userId for
   profile-All]) accepted by getListResults, resolving to the public-lists union for the
   target user (own-All = all own lists). No stored row. Can land as W1's last slice.

---

## C. Build sequence (one commit each, sim-probe per slice)

1. **Frame entryIds + entry-keyed mounts for the child set** (runtime + body host; behavior
   identical for all existing scenes — listDetail still stub). Probe: drill loop
   userProfile(A)→followList→userProfile(B) shows TWO live bodies (temporary
   `[ENTRYMOUNT]` log: mount/unmount per key#entryId); pop to A restores A's scroll offset
   with zero refetch (Metro log: no network on pop). RED case first: before the slice, log
   proves B's body reuses A's mount.
2. **Per-entry scroll/segment/detent lane keying (children)** + origin restore reads the
   entry's lane. Probe: scroll A to row 40, drill to B, scroll B to top, pop → A at row 40.
3. **Pre-mount law on the child push path**: mount-at-intent, visibility-flip-at-commit,
   unmount-after-settle; `[PREMOUNT]` violation log. Probe: Release-lane frame sampler
   ([UIFPS]/[JSPERF]) over push/pop ×10 — zero >30ms applies at commit instants; the
   violation log provably fires when a slice-3 revert is applied (RED backstop).
4. **listDetail real body v1 (read-only)**: entry params {listId, ownerUserId?, shareSlug?},
   Desire list-arm push from BookmarksPanel/profile tiles/l-slug codec lane; results
   renderer body; results skeleton; failure body + dead-slug "this list is private";
   viewerRole rendering (no edit affordances yet). Probe: tap a favorites tile → listDetail
   pushed (nav bar out, depth 2), rows + map pins render; `crave://l/<slug>` lands the same
   scene; kill API → failure body with retry, never a stuck skeleton.
5. **RT-18 server slice** (slug capability + dedupe + 410-private + viewerRole/defaultSort
   fields). Probe: rotate slug → old slug 404/410 in-app body; private flip → dead-slug
   body; listId-holder without slug loses access (the RT-18 revocation contract, RED first).
6. **Sort strip + filters (role-gated)**: viewer strip = Sort (their-ranking default when
   custom exists, Best, Recently added) + open-now/price; owner strip adds the edit entry.
   Probe: viewer flip their-ranking↔Best reorders rows (MVCP disabled on this re-sortable
   list — the CLAUDE.md FlashList law); camera does NOT move on re-sort (§5.4).
7. **Notes on rows + quick actions** (order/maps/share mirroring result Quick Actions).
   Probe: a noted item shows the note under its photo strip.
8. **Edit mode + drag** (W1.3): strip morph, sheet locked full-height, handle-instant /
   body-0.3s-hold lift, live shuffle, edge auto-scroll, batch order PATCH on save,
   accessibility move-up/down path; same machinery re-used on the favorites home
   (grid linearizes). Probe: drag item 5→1, save, kill+relaunch → order persists; VoiceOver
   path reorders without drag.
9. **Collaborators** (model + endpoints + chip + modal + join-via-share + leave/kick +
   private-kills-all). Probe: second sim user joins via slug, adds an item (parity), owner
   flips private → collaborator's next open shows the private body.
10. **Save sheet v2 + auto-created default lists + All/market toggle + profile Lists view**
    (W1.4–W1.8) — sequenced after; out of this spec's structural scope.

Gates per slice: tsc, jest (runtime reducer/stack specs extend for entry-mounts), the
4-lane rig sweep, and the named probe. After slice 3: a Release-lane sampler pass (the
floor-60 assertion must not regress — it is the standing baseline from 4a510858).

---

## D. Risks / unknowns for the anchor

1. **Scene-stack runtime blast radius (highest).** Entry-keying the mounted set touches the
   file every transition flows through, while a foundation session tunes feel in parallel.
   _Recommendation_: land slice 1 FIRST and alone, behavior-frozen for non-child scenes,
   with the reducer spec extended before the change (tests-first here specifically); rebase
   the foundation session immediately after.
2. **Memory/perf of N live child bodies.** Drill loops mount real FlashLists per entry.
   _Recommendation_: ship depth-K=3 eviction in slice 1 (policy constant + pinned
   data/origin remount), and measure with the samplers during the slice-1 probe rather than
   trusting the shallow-stack assumption.
3. **Pre-mount vs the world reveal.** listDetail is world-backed: its reveal is the
   map-synchronized search reveal, which has its own readiness join. Does mount-at-intent
   double-drive the prepared-presentation machinery? _Recommendation_: treat the search
   reveal's existing prepared/seed path as ALREADY satisfying the pre-mount law for the
   world half; apply the new mount-at-intent only to the sheet BODY subtree; verify with
   the [PREMOUNT]/apply-slow logs, don't build a second readiness join.
4. **Warm 61ms JS commit target.** The red-team names the pre-mount law as the eraser of
   the warm 61ms submit commit — but that instant is the SEARCH body host, touched here
   only if slice 3 generalizes beyond children. _Recommendation_: scope slice 3 to child
   pushes in W1; measure; extend to the search swap as a follow-on only if the sampler
   still shows the 61ms.
5. **Desire list-arm vs plain params.** §5.2 says listDetail takes a Desire (list identity);
   the current stub params are `{listId, ownerUserId}`. _Recommendation_: entry params =
   the Desire (identity `list(listId)` + constraints for the strip filters + shareSlug as
   access material, not identity) — matching restaurantProfile's shape so the world-backed
   orphan pattern is copied, not forked.
6. **All-list virtual id through the executor** (cross-market fitAll behavior is a NAMED
   open owner call — §5.4). _Recommendation_: build the union resolution; keep fitAll exact
   per decree; surface the continent-zoom case to the owner in the finger-test checklist
   rather than clamping silently.
7. **Dish-add search shape** (§7.6 A/B: dish-scoped vs restaurant-first) and pick mode
   (S-F rides "Add places"). _Recommendation_: pick mode enters at slice 8+ as its own
   pass (centralized result-tap chokepoint first, per S-F's original spec); the A/B is an
   owner call at that build, not now.
8. **Share-event dedupe key** (slug+ip vs slug+viewer): _recommendation_ slug+viewer for
   authed, slug+day for anon — cheap, kills the flood vector, keeps virality counts honest.

## ANCHOR ADJUDICATION (2026-07-11): all eight D-items resolved per the

spec's recommendations, adopted without modification. Slice 1 lands alone,
tests-first, behavior-frozen outside the child set; depth-K=3 ships inside
slice 1; pre-mount applies to the sheet body subtree only (the world half's
prepared path already satisfies the law); slice-3 scope = child pushes;
entry params = the Desire list arm; All-list fitAll behavior goes to the
owner finger-test list; pick mode = its own pass at slice 8+; share-event
dedupe = slug+viewer (authed) / slug+day (anon).
