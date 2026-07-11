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
