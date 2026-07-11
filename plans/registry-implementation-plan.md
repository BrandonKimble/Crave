# Registry implementation plan — the anchor run (2026-07-11)

Owner directive: complete ALL waves without stopping; anchor session (this
one) makes every judgment call; all subagents are Fable 5; uncompromising
ideal shapes — at every step ask whether a more ideal long-term
architecture should be cut over to instead of patching; sim-simulated
"finger tests" after every wave by the anchor; the OWNER's finger-test
checklist is aggregated ONCE at the end across all waves.

Canonical inputs: plans/page-registry.md §1–§9 (v2 complete),
product/{images,favorites,profile,messaging,sharing,restaurant-profile,
polls,search-and-dishes,notifications}.md, plans/images-ideal-shape.md,
plans/registry-era-kickoff.md, plans/trigger-nav-ideal-verdict.md (the
foundation contracts pages build against).

GATE STATUS (verified 2026-07-11): RT-19 state-loss half FIXED
(5b3aed1b); entry-keyed-mounts remainder EXPLICITLY assigned to the
listDetail structural pass (= W1 here, "one pass with the pre-mount
law"). Content-swap frames closed (c86eb652 floor-60 assertion). RT-18
DECIDED: slug-as-capability, rotation = revocation — implementation
rides listDetail (W1). Person rows landed (a6b4f739). Owner feel checks
run in the parallel foundation session and do NOT gate this run.

COLLISION DISCIPLINE (a foundation session is active on chrome/feel):
never touch the transition-engine/chrome files it is tuning; small
commits, rebase often; panels are shared ground — coordinate by
committing first and keeping diffs surgical.

## Wave structure

### W0 — shared primitives (everything else consumes these)

1. Scrollable variant of the ONE OverlayModalSheet (ideal shape, not a
   fork — one primitive, an opt-in `scrollable` capability).
2. settings "full" snap: a `full` snap kind above the top snap — sheet
   fills the screen, grab handle hidden, X close; generic (any scene may
   declare it), settings is the first consumer.
3. pollDetail-from-anywhere: openChild arm from arbitrary contexts with
   correct origin pop (uses the S-B entries-as-values machinery; no new
   nav physics expected — verify, don't assume).
4. PhotoStrip component (horizontal, ~3-4 visible, lazy `expo-image`
   thumbs via server URLs) + the attractive imageless PLACEHOLDER +
   owner-context "+" lead tile variant + the base interim skeleton row.
5. photoSourcePicker modal content (Take photo / Choose from library) as
   the app-wide standard first step.
6. Mobile photo plumbing: expo-image + expo-image-picker deps,
   Info.plist strings (NSCameraUsageDescription; PHPicker needs none for
   library), photos service (ticket → direct multipart upload → confirm,
   against the already-built backend).
7. Closeness sort: ONE shared util (v1 heuristic: follow recency +
   interaction counts from existing tables; designed to be replaced by a
   real algorithm later without call-site changes).
8. Onboarding→paywall seam verify (routing axis exists; confirm the flow
   feels like one motion, enforced=false dev behavior sane) +
   username-picker ideal-shape audit.
9. FavoriteListItem.tags column drop migration (owner killed tags).

### W1 — lists cluster (center of gravity)

1. listDetail structural pass WITH the pre-mount law + entry-keyed
   mounts (the RT-19 remainder — build the page on per-entry state
   isolation from day one, never retrofit).
2. listDetail body: results-renderer reuse, owner vs viewer roles, sort
   strip (their-ranking default for viewers w/ custom order, Best,
   Recently added; filters open-now/price), per-item notes under the
   photo strip, quick actions.
3. Edit mode: strip morph (Custom → Edit slides in; Edit → Cancel/Undo/
   Redo/Save chrome), sheet glide-to-top, drag semantics (§8.14: handle
   instant, row-body 0.3s hold, edge auto-scroll, live shuffle),
   position persistence, accessibility non-drag path. Same machinery on
   the favorites home (grid linearizes).
4. Save sheet v2: rows not tiles, opens on trigger side w/ segmented
   switch, note field under selected row, order = custom home order.
5. Auto-created default lists (Been/Want to go; Tried/Want to try) at
   signup + backfill for existing users; pinned top.
6. All-list market toggle; All on profiles (2 tiles, public union,
   pinned by default, not unpinnable).
7. Collaborators: model (list_collaborators), invites via
   slug-as-capability (RT-18), full-parity powers, leave/kick,
   private-kills-links + "this list is private" dead-slug body (§5.6
   surface — one build).
8. Profile Lists view: pins (long-press modal Pin/Share/Delete), type
   badges, city-header grouping (≥2 cities), profile-All tiles.

### W2 — photos UI (backend exists; pure client + one funnel)

1. postPhotos scene: context param, photo row, per-photo dish assignment
   (inline ranked dish list; "Other…" free text → demand signal),
   public/private control, Post → optimistic uploads → funnel collapse.
2. Multi-restaurant sections (own-profile entry): restaurant search
   first (restaurant-only autocomplete, saved/recents boosted), "Add
   another restaurant" loop.
3. cameraCapture full-screen page (snap/flip/flash → retake/use).
4. Strips on all cards (search results, favorites rows, restaurant dish
   list) via the W0 PhotoStrip; add-tile only in own-list context.
5. Restaurant Photos view + own-profile Photos section (selector row:
   dish slices ranked, latest, other) — as segmented views, not scenes.
6. Report flow on photos (ellipsis → reasons modal → existing report
   API). photo_events client emission (impressions/taps, batched).

### W3 — profiles + social

1. Dynamic single-page pattern: ONE shared segmented-page machine
   (persistent header region + section selector + swappable body in one
   scroll container) — build once, both profiles consume.
2. Restaurant profile: Overview (note→top-5→score→[AI-summary test]→
   mention tags→top discussions), Dishes, Discussions (tags collage
   multi-select + Top/Newest sort + search bar), Photos. Backend slices:
   mention-tag aggregation (entity mentions across the restaurant's
   discussions) + thread-merge query (vote-comment chains, non-vote
   intermediates skipped, per-restaurant splitting).
3. Discussion cards → pollDetail-from-anywhere with scroll-to +
   highlight of the comment.
4. User profile: 4 sections (Polls/Comments/Lists/Photos; propose Posts
   merge to owner AT THE END with the finger tests), Follow+Message
   header, edit profile (name/bio/avatar via photoSourcePicker + crop
   later), FriendCluster expand modal.
5. Universal share modal: preview package v1 (crude but real per object
   type), context options (invite-as-collaborator), Crave DMs + friends
   (closeness sort), native share sheet for external targets first
   (platform-specific stories APIs = W4 research), /l/{slug} behavior
   for every object type.
6. Messaging: ideal-shape design doc first (model, endpoints,
   poll-vs-push decision at this scale, read states, requests from
   non-friends, block interaction), then build: conversations +
   messages tables, REST + polling v1 (architected so realtime swaps in
   without schema change), dmSession + messagesInbox scenes, unread
   badge, push hookup stub.
7. Blocking: user_blocks model, enforcement at read paths (photos,
   comments, DMs, profiles), profileActions modal entry.
8. Avatar picker wiring in editProfile (server path exists).

### W4 — long tail + close-out

1. Settings tree: full-snap scene; rows→children: notifications prefs
   (per-type opt-in store, poll_release first), account privacy,
   appearance placeholder, billing management (manage/cancel via
   MANAGE_IN_APP_STORE path, access status render), legal, delete
   account (exists). Build-as-needed discipline: sections stubbed
   honestly, no fake settings.
2. Poll modals: pollInfo, duplicatePoll; poll market = map-resolved +
   display label (delete picker path from pollCreation).
3. Blank-search trending (market-scoped) IF genuinely cheap; else park.
4. Push-permission moment: trigger after first poll vote / public photo
   / first DM (whichever first), never at launch.
5. Share-package/stories API research pass + web landing upgrade.
6. Stale-doc sweep: mark the 2026-04 master plan superseded; schema
   comment fixes; registry ✅ marks.
7. THE OWNER FINGER-TEST AGGREGATION: one checklist across all waves,
   ordered by surface, with exact drive recipes (deep links/taps) per
   item.

## Method per wave

Spec-slice from the registry → build FULL functional surface (crude
visuals fine; deferring functionality is the named failure mode) →
self-red-team (Fable subagents, adversarial) → anchor sim run mimicking
the owner's finger pass (screenshots + logs, attribute-before-fix) →
commit → next. Subagents: Fable 5 ONLY (`model: fable`); backend slices
and bulk reading delegated; every subagent output reviewed by the anchor
before merge.

## W0 running log (anchor)

- W0.1/W0.5 DONE (modal scrollable + photoSourcePicker) — committed.
  Deliberate tradeoff on record: no offset-aware scroll→dismiss handoff
  inside modal content (backdrop/chrome dismiss suffice); revisit only if
  the owner's finger test wants it.
- W0.4/W0.6 DONE (PhotoStrip + photo plumbing) — committed. CORRECTIONS
  to plans/images-ideal-shape.md step 1 from the real backend: there is
  NO client confirm endpoint (UGC photos settle via Cloudinary webhook +
  reconciliation cron; GET /photos/:id is the owner's pending-read; only
  avatars have an explicit confirm). Strip DTOs carry ready URLs, no
  aspect (PhotoStrip defaults 4:3 — add width/height server-side only if
  card design needs true aspect). Quality-floor lead ordering currently
  degrades to recency (focus score unavailable on the free Cloudinary
  plan). ⚠️ pod install required before the next native build
  (expo-image, expo-image-picker).
- W0.2 ADJUDICATED (ideal-shape checkpoint): NO new 'full' snap kind in
  the universal union — the existing per-scene snapPointsOverride
  mechanism (pollDetail precedent) IS the owner's "exception snap above
  extended": settings declares expanded ≈ safe-area top. Grab-handle
  hiding = a scene-spec flag added WITH its first consumer (settings, W4)
  — no dead engine plumbing now.
- W0.3 pollDetail-from-anywhere: machinery verified by read — pushRoute
  from any context is metadata-driven (parentSceneKeys has zero runtime
  consumers), fetchPoll(pollId) hydrates seedless, commentAnchorId param
  already threaded (scroll-to consumption = W3). Live sim proof deferred
  to the W1 sim pass (current sim blocked on the tags-migration API
  restart).
- W0.3 PROVEN on-sim (2026-07-11): push_child_scene probe verb landed;
  pollDetail pushed FROM bookmarks context, hydrated seedless via
  fetchPoll, X-close popped back to bookmarks (painter probe
  displayed:bookmarks). From-anywhere = working foundation behavior.
- W0.8 paywall seam: enforce-mode drive deliberately deferred to W4
  (flipping ENTITLEMENT_GATING on the SHARED dev API would wall the
  foundation session's dogfooding; W4 runs it in a scoped window).
  Routing axis + log-mode behavior verified in the payments era.
- W0 CLOSED. Tags-migration API restart done (favorites 500 root-caused
  to the expected cross-session schema window; healthy again).

## W1 running log (anchor)

- Slices 1-2 LANDED (af507813) after an anchor fix the sim probe caught:
  per-key content-attach guillotined in-stack units at settle — child
  keys with any in-stack entry within depth-K now retain attach. Drill
  loop proven live (three simultaneous units, exact-entry unmounts on
  pop, A never churned).
- Backend data layer LANDED (RT-18 capability, collaborators, batch
  reorder, All unions; 25/25 RED->GREEN). updateListPosition kept
  owner-only (agent adjudication accepted: home-grid order is personal).
- Save sheet v2 + auto-created defaults LANDED (rows/note/flip;
  system_kind; provisioning on the userStats.ensure seam — existing
  users backfill on next sign-in). API restarted on the new build.
- SCOPE MOVES: profile Lists view (pins/badges/city groups) moves W1→W3
  (it is a SECTION of the user-profile dynamic single page); W1's
  collaborator UI ships with a plain copy-invite-link step — upgraded to
  the universal share modal in W3.
- In flight: slices 3-4 (pre-mount + listDetail real body), slice 8a
  (drag machinery + home edit mode).
- W1 closer LANDED (e57e7ea0): within-list edit (batch order PATCH w/
  loud partial-render guard + favoriteListItemId row projection),
  collaborator chip/modal/join (invite v1 = /l/<slug>?join=1, joinIntent
  bijective in the codec), All tiles + honestly-disabled market chip (no
  market data on favorites rows yet — W-later data slice).
- Edit lock LANDED (UI-thread lock registry; gesture bound + release
  destination both gated; inert when unset).
- W1 SIM PASS (anchor, screenshots in session scratchpad): home
  toggles/All tile/system defaults ✓; virtual All union + sort chips ✓;
  listDetail sort strip + collaborator chip ✓; collaborator modal
  (add-link row + owner row) ✓; edit morph [Cancel|Undo Redo|Save] +
  one-column linearize + locked system rows w/ lock glyphs + handles ✓;
  RUBBER-BAND LOCK holds under a hard swipe ✓. pollDetail-from-anywhere
  - the 3-unit drill loop proven earlier in-wave.
- OWNER FINGER-TEST items accumulated from W1 (for the final checklist):
  the actual drag gesture (lift/shuffle/edge-autoscroll/save round-trip,
  both surfaces); strip label truncation when Edit joins the row (labels
  compress — should the strip scroll instead?); collaborator join
  round-trip on a second account; 410-private body with a real dead
  slug; the enter-edit glide grab (rubber-bands from expanded — expected
  per design).
- [ENTRYMOUNT]/[PREMOUNT] dev logs STAY until the W4 cleanup pass.
- W1 CLOSED.

## W2 running log

- W2A LANDED (76992b16): postPhotos child scene (full registration diff =
  listDetail pattern + params-equality disambiguation), openPostPhotosFunnel
  global host, custom expo-camera cameraCapture full-screen page (new native
  binary w/ camera pods installed), **DEV** test-images row, RestaurantPanel
  "Add photo" entry.
- W2B LANDED (76992b16/3232f301): POST /photos/strips batch endpoint +
  16ms-dataloader client hook; strips on search cards / favorites rows /
  restaurant dish rows; photo-events buffer (impression/tap, 10s/50/background
  flush); long-press report modal w/ reason enum (migration).
- W2C LANDED (3232f301): photos.visibility enum, ticket→row at create, ALL
  public reads exclude private (8-site audit; getPhoto non-owner was the one
  leak-shaped site), owner reads include own private; specs for each.
- W2 SIM PASS (anchor): results cards carry strips (batch endpoint hit,
  log-mode paywall line confirms auth'd route) ✓; restaurant page Add-photo
  chip ✓; source modal 3 rows ✓; CUSTOM CAMERA page live (permission prompt
  w/ app.json string → viewfinder page w/ shutter/flip/flash/close) ✓;
  test-images → Post photos child scene (2 thumbs, Public/Private, CTA) ✓;
  dish assignment (ranked real dishes, typeahead, Other…, chip, Clear,
  re-assign) ✓. NOT sim-provable: the final Post press → upload progression
  (sheet eats the Maestro tap; Cloudinary creds absent on dev anyway) —
  OWNER FINGER-TEST item; upload pipeline unit-gated.
- GOTCHA reconfirmed ×3: coordinate taps on scene-stack sheets get eaten;
  tapOn id: is the only reliable lever (post-photos-submit testID added).
  A stray paramless push_child_scene&scene=restaurant poisons the restaurant
  scene (skeleton forever) — always pass routeParamsJson.
- OWNER FINGER-TEST items from W2: Post-photos end-to-end on device (press
  Post, watch per-photo progress/failure badges + retry, verify strip gains
  the photo after webhook settle); camera snap→retake→use-photo on real
  hardware; library multi-select; long-press report on a real strip photo;
  private photo invisible to a second account.
- W2 CLOSED (UI complete; visuals crude by design — W3/W4 design pass).

## W3 running log

- W3A LANDED: restaurant Overview/Dishes/Discussions/Photos views +
  GET /polls/restaurants/:id/mentions (entitySpans containment, signal
  tags, thread-merge). W3B LANDED: user profile 4 sections, public lists
  view (pinned+city grouping), user_blocks + 7-site enforcement, avatar
  picker on editProfile. W3C: plans/w3-messaging-design.md (design of
  record). W3E LANDED: messaging M1 (schema+9 endpoints+22 specs) + M2
  (inbox/dmSession scenes, entry-keyed, entry points). W3F LANDED: owner
  list long-press modal + server-honest blocked profile read. W3D LANDED:
  universal ShareModal (share-targets endpoint, fan-out, copy-link,
  OS share) replacing every ad-hoc share.
- W3 SIM PASS (anchor): restaurant view switcher + Mentioned-here tag
  collage + Discussions (tags/sort/search/honest-empty) + Photos
  (add-photos CTA/empty) ✓; own profile tab w/ inbox icon ✓; messagesInbox
  honest empty ✓; own userProfile (4 sections, share icon, stats) ✓;
  followList → foreign profile (Message/Following/share/Block user) ✓;
  dmSession: composer send → bubble rendered + DB row (`text|Hello from
the rig`) + sendMessage handler hit ✓; 5×X pop chain exact-entry ✓;
  card share icon → ShareModal (Send-to ranked row, Copy link, Share
  via…) ✓.
- FOUND during pass (owner finger-test / small fixes): dmSession composer
  sits under the keyboard while typing (lift not visible mid-thread —
  feel item; Send works after dismiss); foreign profile stat said
  "2 Polls" while Polls section said "No polls yet" (created-vs-
  contributed count mismatch — check PollsService.listPollsForUser
  filter vs the stat source); share-modal Send-to row not exercised
  (needs 2nd account) — finger item.
- OWNER FINGER-TEST accumulation (W3): DM round-trip on two accounts
  (request lane + accept + unread badge); share fan-out → entity bubble
  on the recipient; block → frozen conversation + profile unavailable +
  unblock loop; avatar change w/ moderation-pending copy; discussions
  card → pollDetail comment anchor; drag the RT-19 drill loop
  (inbox→DM→profile→DM) for depth-eviction feel; composer keyboard feel.
- W3 CLOSED (functional surface complete; visuals crude by design).

## W4 running log + RUN CLOSE

- W4A LANDED: settings full-snap (pinned shell) + grabHandle scene literal
  (compile-exhaustive; settings first 'hidden' consumer), real settings tree
  (blocked users + GET /users/me/blocks, subscription, legal, version, honest
  Coming-soons), pollInfo modal; poll close/delete/report = NO backend
  (reported, not faked). W4B LANDED: pollsCreatedCount counter-drift killed
  (live count, same predicate as the list, spec-pinned; increments deleted),
  dmSession composer = bottom-pinned static-mode layout (root cause of the
  first cut's regression: sanitizeContentContainerStyle strips flex from
  transports — static branch now owns the fill); trending SKIPPED with
  reasoning (suggestion-plane plumbing, not a cheap read). W4C LANDED:
  stale-doc sweep (ship statuses across product/ + registry §9e) +
  plans/w4-share-package-research.md.
- PAYWALL ENFORCE-DRIVE (anchor): ENTITLEMENT_GATING=enforce + restart →
  cold launch hit the full Crave+ wall (products/legal/restore) ✓; reverted
  to log. ⚠️ wall prices $9.99/$79.99 vs business-model $7.99/$39.99 —
  RevenueCat config, reconcile before launch.
- W4 SIM PASS (anchor): settings full-snap + NO handle + tree + blocked-users
  loads ✓ (first read 404'd — TWO stale API processes were racing on :3000;
  killed all, single instance, clean); dmSession regression caught on-screen
  → sent back to the agent → root-caused + fixed + probe-verified ✓.
- OWNER FINGER-TEST AGGREGATION: plans/owner-finger-test-checklist.md —
  the ONE consolidated pass, ordered by surface, ⚠️-marked for finger/
  hardware/second-account items, with drive recipes + crude-bit inventory.
- Ops gotcha recorded: `kill $(lsof -ti :3000 | head -1)` leaks a second
  API instance if one piled up — always `lsof -ti :3000 | xargs kill`.
- ALL WAVES W0–W4 CLOSED. Remaining = owner finger-test pass + the
  owner-led design/polish passes + RevenueCat price reconcile.

## POST-RUN RED TEAM (2026-07-11, owner-directed)

Six lenses: registry completeness, lists, photos/restaurant, social/messaging/
share, cleanup, ideal-shape. Verdict: 1 BLOCKER (public profile lists
projected shareSlug — published the collaborator capability), ~10 SIGNIFICANT,
7 registry misses falsifying "100% surface", a cleanup inventory, 3 ranked
refactors. Remediation waves dispatched; every finding is either FIXED,
recorded DEFERRED-with-trigger, or an OWNER CALL below.

OWNER CALLS surfaced by the red team (decide at the finger-test pass):

- Dish share link = entity-search (/e/food) vs §8.2's "restaurant profile
  scrolled to the dish". Current build = search. Reconcile spec or code.
- Poll market fallback (§8.13 "nearest/home market when hovering nowhere")
  vs the current honest "Pick a market" modal.
- Unblock can silently demote a follow-edge-only conversation back to the
  peer's Requests lane (derived-state honest; surprising).
- Viewer sharing someone ELSE's slug-less list: send-in-app only (copy-link
  hidden after the fix) — acceptable v1?

DEFERRED with explicit triggers (ideal-shape, recorded not lost):

- Single per-scene registration module (SceneDefinition object, registries
  derive; L effort) — trigger: next multi-scene wave; absorbs comparators +
  layout-mode as fields.
- ONE typed modal registry (price/scoreInfo leave OverlayKey; M) — trigger:
  the owner design/polish pass (touches every modal anyway).
- sceneLayoutMode 'sheet-scroll'|'sheet-static'|'full-page' as a first-class
  concept (S-M) — trigger: 3rd consumer of static-mode or full-page tricks.
- Section-surface primitive across the 3 panel switchers — trigger: design
  pass or 4th consumer (premature before visuals settle). NOTE: the W3 plan's
  "one shared segmented-page machine" was never built — claim corrected here.
- DB-backed contract-test lane (testcontainers/tx-rollback) for raw-SQL +
  constraint races (mocked specs can't fail on query shape) — trigger: before
  Austin load.
- messaging shareFanOut/shareTargets move out of MessagingService into a
  share-domain service — trigger: realtime (M3) work.
- unreadCount O(conversations×queries) poll — optimize when the badge lands
  (zero consumers today).

## Red-team wave-2 notes

- **FriendCluster (§7.8 / §9b modal) — DEFERRED, assessed 2026-07-11.**
  Voter/endorser IDENTITY is not exposed anywhere in the poll read surface:
  the feed DTO carries counts only (`endorserCount`, per-candidate
  `distinctEndorsers`, viewer-local `currentUserEndorsed` —
  apps/mobile/src/services/polls.ts `Poll`/`PollCandidate`; server side
  attachPollStats), and the only identity-bearing reads are comment authors
  on the detail thread. Building the stacked-avatars row honestly requires a
  NEW aggregation: a per-poll ranked-voters read (first ~5 distinct
  endorser identities for the viewer, closeness-ranked via ClosenessService,
  batched across the feed page — i.e. a `voterPreviews` field on the list
  endpoint or `GET /polls/:pollId/voters?limit=5`). Future build shape:
  server ranked-voters read → `FriendClusterRow` (max 3 overlapping
  monograms + "X and N others", closeness sort names the leader) on poll
  cards → tap opens THE one app modal (scrollable variant) listing all
  participants as profile cards → userProfile push. Not built in this wave
  because it is new server aggregation, not a registry wiring miss.

## Red-team remediation CLOSE (2026-07-11)

Wave 1 (1b970b04): shareSlug BLOCKER closed (audience-aware summaries);
favorites god-service split (AccessPolicy/Assembler/mappers) + reorder
subset/409 + score-gap degrade + blocked-slug 410; stationary-finger drag
recompute (pure worklet + RED spec) + per-entry edit locks; mentions GIN
index/bounded CTE/block filter/honest totalCount; photo report+delete
oracle fixes, event clamp, ticket exclusivity, confirm-retry no-dup,
stash release-on-collapse; messaging ghost-conversation read filter,
fan-out dedupe + FAILED codes, tuple after-cursor, resolver block gate
helper, optimistic prune; private-list copy-link confirm + non-owner
link hiding; comment shares deep-link (resolver pollId); live profile
stats (followers/following/lists/favorites); push permission at first
contribution (§8.9); comment+user report endpoints/tables/UI (§9b);
per-scene params comparator table + typed SceneBodyContentInsets
(sanitizer DELETED).

Wave 2 (this commit set): Directions chip; saved-note on Overview
(+ entity memberships endpoint); multi-restaurant post + own-profile
archaeology entry; add-tile wired; friendCluster deferred (voter identity
not in DTOs — see Red-team wave-2 notes); ALL user_stats counter columns
dropped (pollsContributed = live endorsed-or-commented distinct count;
user_stats = pure ensure() seam); shareConfig scene deleted end-to-end;
listWorld lane + launchFavoritesListResults lattice deleted; clipboard
wrapper (expo-clipboard at next native rebuild); MonogramAvatar (8→1) +
one relative-time util; spec renames; ChildScenePanels rename.

Post-remediation gates: API 245/245, mobile 188/188, tsc clean both
(2 exempt camera errors), boot clean via verified reload, profile stats
live on-screen (0 Polls == empty section).

STILL-DEFERRED CUT (recorded): the search-world list-identity resolver
lane (search-desired-state-contract kind:'list' + fetch-table arm) is now
unreachable — its only writer was the deleted launcher. It is charter
(S1-S4) tuple-contract surface; cut it in the next search-flow session,
not from a cleanup pass.
OWNER ACTIONS from the sweep: set EXPO_PUBLIC_SHARE_BASE_URL (share links
silently fall back to https://crave-search.app); NotificationsPanel
RowAvatar + PollDetailPanel CommentAvatar are trivial MonogramAvatar
follow-ups.

## Page-chrome standard (owner decree 2026-07-11) — SHIPPED

Three laws, all foundation-level (ADDING_A_SCENE.md §5 records them):

1. FLUSH: zero top spacing between the header's bottom edge and first
   content, every page (per-panel tops removed; paddingBottom kept).
2. DIVIDER: the result sheet's scroll-fade hairline ([0,3,14]→[0,.35,1],
   rgba(15,23,42,.14)) belongs to the header everywhere — scene-keyed
   scroll-offset registry (stack semantics for entry-keyed children),
   fallback to the shared container offset; forked copies deleted.
3. WHITE LAYER: bodySurface:'white' is a required scene-foundation literal
   (bare frost unrepresentable); SceneBodyFoundationSurface renders it;
   FrostCutout punches measured, scroll-tracked holes (house
   MaskedHoleOverlay). First cutout: profile metrics box.
   Also fixed: EditProfilePanel hooks-order crash (useCallback below early
   returns). Sim-verified: profile cutout live, flush seams, settings scroll
   clip + divider. OWNER EYE items in checklist §7.6 (incl. polls/restaurant
   frost-gap look change — FrostCutout wrap if wanted back).

## Owner feedback round 2 (2026-07-11 evening)

- Settings full-screen (y=0 + radius morph + header safe-area inset) was
  BUILT then REVERTED same-day per owner — settings stays the W4 pinned
  safe-area-top sheet, snap-locked. Do not rebuild without a fresh ask.
- profile→settings JERK root-caused + fixed: motion command vs shell
  config were non-atomic (command resolved against the outgoing scene's
  snaps; settings shell synced ~50ms later). Motion executor now stamps
  the target scene's shell snap points onto the command (atomic commit);
  snap execution prefers command-carried points.
- FrostCutout drift fixed (re-measure sweep on content re-layout — RN
  onLayout misses position-only shifts).
- SCROLLABLE-BY-DEFAULT law: every page scrolls even when short;
  direction-gated bounce preserves the top-edge handoff contract.
- Native-divider sweep: dead headerDivider style/prop deleted; only the
  scroll-fade primitive may appear under a header. All row-separator
  borders audited = legitimate, untouched.
- NOTE: profile TAB (Created/Contributed/Favorites segments) vs
  userProfile CHILD page (Polls/Comments/Lists/Photos sections) are two
  different pages by design — owner flagged the inconsistency; unifying
  the root profile onto the 4-section shape is an OWNER CALL, recorded.
