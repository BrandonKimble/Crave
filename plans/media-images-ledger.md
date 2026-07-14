# Media & data agent — ledger (wave2 §7)

Seat: images infra + dev test data. Started 2026-07-13. Fences: API/DB/scripts only;
no mobile UI; shared dev DB = additive seeds only; DO NOT COMMIT.

---

## 1. Image-ranking equation — DESIGN FOR RATIFICATION (no build until owner ratifies)

### Survey (industry prior art, distilled)

- **Reddit "hot"** — log-votes + submission-time offset: monotone age bonus, all-time
  votes still accumulate → an old mega-post IS catchable only because the time term is
  linear-in-log. Rejected: rank derives from posting time, not _current_ engagement.
- **Hacker News** — points / (age+2)^1.8: gravity divides ALL-TIME points by age.
  Closer, but score still keyed to age-since-upload, so a photo's rank is a function
  of when it was posted, not whether people engage with it _now_.
- **Exponentially time-decayed counters** (streaming/trending systems — half-life
  counters): keep counts that halve every H days; adding events and decaying is O(1)
  closed-form. This is the standard "currently trending" primitive. ADOPTED.
- **Wilson lower bound / Bayesian (Beta) smoothing** (Reddit "best", Evan Miller):
  rate estimates on tiny n are noise — 2/5 = 40% must not beat 300/2000. Bayesian
  mean with a prior pseudo-count is the simplest permanent form. ADOPTED (Bayesian
  mean, not Wilson: symmetric, trivially incremental, no z-score constant to tune).
- **Instagram/TikTok-style predicted engagement** — ML predicted p(engage). Overkill
  forever at our scale; the decayed empirical rate IS the non-ML limit of it.

### The equation (permanent form)

Per photo keep THREE exponentially decayed counters (half-life **H = 14 days**) plus
a decay timestamp:

- `I` decayed impressions, `T` decayed taps, `V` decayed view-seconds
  (single view's contribution capped at 10 s at ingest so one leave-it-open
  session can't masquerade as engagement).

Update on fold (closed form, O(1)): `X ← X · 2^(−Δt/H) + new events`.

**Engagement (tap-equivalents):** `E = T + V/8` (8 decayed view-seconds ≈ 1 tap).

**Score (Bayesian-smoothed current engagement rate):**

    score = (E + m·p0) / (I + m)        with  m = 50,  p0 = global prior engagement
                                        rate (recomputed monthly from all live
                                        photos' decayed counters; a slow constant,
                                        NOT a per-read input)

**Ordering key within a restaurant:** `(score DESC, focusScore DESC NULLS LAST,
uploadedAt DESC)`.

**Quality is an admission gate only** (existing `focusScore` floor + moderation) and
a tie-break — it is NOT a term in the score. Auto-quality can't judge appeal;
engagement is the honest signal (owner direction).

Properties that make it permanent:

- **Rate over a decayed window (~2H effective)** — counters are bounded at steady
  state by rate·H/ln2. There is NO all-time accumulation, hence no moat by
  construction, at any future scale.
- **Cold start is the prior**: a photo with I=T=0 scores exactly p0 — enters
  mid-pack, above decayed-dead photos (observed rate below prior), below currently
  engaging ones. New photos get exposure with no exploration hack; the m=50
  pseudo-impressions stop tiny-n noise from leapfrogging.
- One knob trio (H, m, p0-refresh cadence), each with a physical meaning; nothing
  keyed to upload age, nothing that changes when real users arrive.

### Worked examples (RED — computed, not asserted)

p0 = 0.05, m = 50, H = 14 d.

**RED 1 — old once-viral image is catchable.** Photo A peaked at 2 000 impressions /
300 taps (rate 0.15) then went dead for 60 days → decay ×0.0513 → I=102.5, T=15.4,
score = **0.117**. Photo B currently engaging: decayed I=300, T=68 → score =
**0.201** → B ranks above A. Under all-time taps (the moat we reject) A's 300 beats
B's 90 forever. The instrument goes RED on the naive ranker, GREEN on ours.

**RED 2 — a brand-new image with 2 taps does not leapfrog.** New photo: 2 taps on 5
impressions = naive rate 0.40 (would top every list). Our score = (2+2.5)/(5+50) =
**0.082** — barely above prior, far below the 0.201 leader. Naive rate ranking goes
RED; smoothed score stays sane. A no-data photo scores exactly 0.0500 = p0.

### Storage / update infra (build AFTER ratification)

- Migration (additive): `photos.eng_impressions float8`, `eng_taps float8`,
  `eng_view_seconds float8`, `eng_decayed_at timestamptz`, `eng_score float8`,
  index `(restaurant_id, status, eng_score DESC)`. (Prisma-migration trap applies:
  regenerate client + rebuild + restart shared :3000 API.)
- `photo_events` already exists (impression|tap, batched, fire-and-forget) — add
  `view` event type carrying seconds in `eventCount`-style payload (or a
  `view_seconds` column; decide at build).
- **Fold worker** (cron, every ~5 min): consume photo_events past a watermark →
  for touched photos decay+add+recompute `eng_score`. **Nightly full re-decay**
  (single closed-form UPDATE over live photos): needed because the smoothing
  constant m doesn't decay — an untouched photo's score must drift toward p0.
  Reads NEVER compute: every gallery/strip orders by the materialized `eng_score`.
  Per-restaurant continuous ranking, O(events) + O(photos/day).
- Interim (pre-ratification) ordering stays the shipped v1 policy in
  `photo-read.service.ts`: focus-floor + uploadedAt DESC.

---

## 2. Reconnaissance facts (logic-first walkthrough)

- **Photo pipeline EXISTS end-to-end**: `apps/api/src/modules/photos/*` —
  CloudinaryService (signed tickets, named variants t_crave_thumb/card/gallery/full,
  publicId `crave/{env}/photos/{photoId}`), PhotosService, PhotoReadService
  (focus floor + recency), PhotoEventService, moderation/reconciliation. Cloudinary
  env fully configured in apps/api/.env. photos table had **1 row** at start.
- **Google Places**: `external-integrations/google-places` uses Places API (New) v1
  (`places.googleapis.com/v1`), key = GOOGLE_PLACES_API_KEY in .env;
  `scripts/probe-google-place.ts` is the pattern. Restaurant → place linkage via
  `core_restaurant_locations.google_place_id` (primary_location_id on the entity).
- **Dev DB set**: 5 921 restaurants. "Café Pana"/"Tomani" DO NOT EXIST under those
  names (closest: La Panaderia, Comadre Panaderia — Austin). The real set used:
  top Austin-market restaurants by crave display_score WITH a google_place_id
  (Cuantos Tacos, Ramen Del Barrio, Uroko, Kiin Di, Micklethwait, Uchi, Nixta,
  Home Slice, Bouldin Creek Cafe, épicerie, …) + everything in the owner's lists.
- **Owner user**: kimble.brandonm@gmail.com = ee87e7c3-96ab-45a6-accd-146ee8244791.
  System lists exist both sides (been/want_to_go, tried/want_to_try) — ALL empty at
  start; 4 TEST lists (11111111…/22222222…/33333333…/44444444…) already populated.
- **Polls**: 89 polls, ALL closed, ALL NYC/NJ markets; 8 comments total. Owner is in
  Austin → feed resolves market from map bounds (polls.service resolveMarket), so
  Austin-market polls are what the owner will actually see. `scripts/
seed-poll-fixtures.ts` drives the REAL pipeline (gazetteer entitySpans →
  refreshPollLeaderboard) — template for the owner-fixture seeding.
- **Followers attribution (the reported bug)**: backend is COMPLETE
  (`GET /users/:userId/followers|following`, UserFollowService, block filtering).
  Mobile surface EXISTS: `FollowListPanel.tsx` + `followList` route in
  app-overlay-route-types. It IS wired from OTHER profiles —
  `UserProfilePanel.tsx:406` pushes `followList`. **The gap: the OWN-profile
  `ProfilePanel.tsx` renders the Followers/Following stat blocks as plain `View`s
  (PROFILE_STAT_LABELS row, ~line 113–130) with NO Pressable/onPress** — the tap
  opens nothing because no handler exists there, not because the surface is
  missing. One-line-class fix for a mobile leg: wrap stat blocks 2/3 in a Pressable
  that pushes `followList` with own userId + mode. NOT fixed here (mobile fence).

## 3. 2x2 list-tile gallery — DATA SHAPE (for the frontend legs)

Per home list tile, up to 4 images, slots TL(0)→TR(1)→BL(2)→BR(3), sparse (client
renders placeholders for missing slots, filling from top-left):

    tileImages: Array<{
      slot: 0 | 1 | 2 | 3;
      restaurantId: string;
      photoId: string;
      thumbUrl: string;      // server-built Cloudinary t_crave_thumb URL
    }>

Selection law:

- The list's **top-4 restaurants**: custom rank (item position) when the list is
  custom-ordered, else crave rank (core_public_entity_scores.display_score DESC).
  Dish-side lists resolve each item's restaurant through the connection
  (core_restaurant_items.restaurant_id); a restaurant appearing via multiple dishes
  fills ONE slot (dedupe, next restaurant moves up).
- Per restaurant: its **top-ranked live public photo** (interim: focus-floor +
  newest; post-ratification: eng_score). "Use your photos" (§2 setting): same
  slots restricted to photos with userId = list owner; gaps stay empty for the
  client's placeholder treatment.
- Delivered on the lists read path (favorites lists summary payload) as an
  additive field. See §5 for build status.

## 4. Work log

- Ledger created; equation designed + RED examples computed (above).
- **Google photo pull DONE**: `apps/api/scripts/seed-google-photos.ts` —
  verified GOOGLE_PLACES_API_KEY is photo-capable (Places v1 photos field +
  photo media endpoint), pulls up to 8 photos/restaurant for top-Austin-by-score
  (region-us-tx-austin) + owner-list restaurants, uploads THROUGH Cloudinary
  under the canonical publicId (`crave/dev/photos/{photoId}`), writes live
  public `photos` rows attributed to the "Crave Imports" user
  (google-import@crave-search.local). 128 photos across 16 restaurants
  (Cuantos Tacos, Ramen Del Barrio, Uroko, Kiin Di, Micklethwait, Uchi Austin,
  Home Slice, Bouldin Creek, Proud Mary, épicerie, Sunflower, J Carver's,
  Yeni's Fusion, 7-Eleven, Manu's Dabeli Station, Oyatte, The Eighty Six).
  Idempotent (skips restaurants with >=5 imports). NOTE: an ideal-shape
  `photos.source` column ('user'|'google_import') is the eventual attribution
  home — deferred to the ratification migration to avoid a mid-wave migration
  on the shared DB; the import user IS the attribution meanwhile.
- **Owner fixtures**: `apps/api/scripts/seed-owner-fixtures.ts` — 5 friend
  users (jess.eats, marco.atx, sofia.tastes, dan.bbq, priya.noms), follow
  edges (5 followers / owner following 3), system lists Been(6)/Want-to-go(5)/
  Tried(4)/Want-to-try(3) + custom "ATX heavy hitters"(5 restaurants, public) +
  "Best bites ATX"(4 dishes, public), and 5 Austin polls (3 active, 2 closed;
  2 owner-created) with threaded discussions (owner participating), comment
  likes, endorsements, real gazetteer entitySpans + refreshPollLeaderboard.
  Market = region-us-tx-austin (the roll-up resolver's outermost covering
  market for an Austin anchor — what the owner's feed will resolve to).
- **Tile-gallery API BUILT** (additive):
  `favorite-list-tile-gallery.service.ts` (new) + `tileImages` on
  `FavoriteListSummary` + wired into `FavoriteListsService.listForUser`
  (owner home read). Rides PhotoReadService.stripPhotos (the ONE shipped
  ordering policy) and FavoriteListMapper.loadPublicScores; custom-vs-crave
  rank via the existing `hasCustomOrder` law; dish lists resolve via
  connection.restaurantId; dedupe; a photo-less top restaurant yields its
  slot to the next (galleries stay full). "Use your photos" needs a
  `favorite_lists.use_own_photos` column — deferred with the §2 ellipsis leg
  (no migration now); the service then just adds `userId` to the photo query.
  Gates: tsc 0, eslint 0, favorites jest 52/52 green. §10 note: touched
  favorite-lists.service.ts/mutations.spec.ts which carry another session's
  in-flight edits — my edits are purely additive (new ctor dep + tileImages
  attach + spec stub arg); nothing reverted.
- **Composite verification (RED-capable, not intent)**:
  `scripts/tile-gallery-probe.ts` runs the REAL
  FavoriteListTileGalleryService + PhotoReadService + CloudinaryService
  against the live dev DB — all 10 owner lists return signed t_crave_thumb
  URLs in ranked slots (Been/Want-to-go/Tried/ATX heavy hitters = 4/4 slots);
  a sample signed thumb URL fetches 200 image/jpeg from the CDN. Unit spec
  `favorite-list-tile-gallery.spec.ts` (5 cases incl. the custom-rank-beats-
  crave-rank RED case). Full favorites suite 57/57.
- **Shared dev API on :3000 REBUILT + RESTARTED** (yarn build → kill 54024 →
  nohup node dist/main >> /tmp/crave-api.log) so the lists read now serves
  `tileImages`. No prisma migration was run this session (no client regen
  needed). Health 200 confirmed post-restart.
- Final dev-DB state: 129 live photos; 5 ownerFixture Austin polls (3 active /
  2 closed, 18 comments incl. owner replies, 32 comment likes, leaderboards +
  15 endorsements); owner lists filled both sides; follows = 5 followers /
  3 following on the owner.

---

## Leg 2 (2026-07-13) — own-photos loop closed + scale/photo data gaps killed

### 1. "Use your photos" gallery effect (conformance audit ND #2) — BUILT

The law as implemented (`favorite-list-tile-gallery.service.ts`):

- Flag OFF: unchanged — top-4 restaurants by the rank law, photo-less
  restaurant YIELDS its slot (galleries stay full, sparse-at-end).
- Flag ON: the SAME top-4 restaurants rank the slots, but each slot draws
  only from photos with `userId = list ownerUserId` — `PhotoReadService.
stripPhotos` gained an additive `userId` param (same windowed query +
  ordering policy, `AND user_id =` filter; counts filtered too). A top-4
  restaurant the owner hasn't shot keeps its slot EMPTY (no yield) — sparse
  ANYWHERE, the deliberate-incompleteness placeholder ("you haven't shot
  this one yet").
- `loadTileImages` signature: `TileGalleryListRef[]` ({listId, ownerUserId,
  useOwnPhotos}) — the caller already holds the rows; own-photo strips are
  batched per owner. `favorite-lists.service.ts` listForUser passes them.
- CLIENT NOTE (no UI change needed): `tileImages` is unchanged in shape, but
  own-photos lists can be sparse MID-array — place by `slot`, never index.
  BookmarksPanel's existing `bySlot` map already does exactly this.
- Specs: +3 own-photos cases in `favorite-list-tile-gallery.spec.ts`, incl.
  the RED case (old unfiltered code would surface the stranger photo in
  slot 1). Favorites suite 64/64; photos 22/22; tsc 0; eslint 0.

### 2. Scale + photo data (audit DU #1/#2) — `scripts/seed-owner-scale-fixtures.ts`

Idempotent, additive, owner account. Run order: script → seed-google-photos
→ script again (B/C phases then find assets). Done this session:

- **10 new restaurant lists + 10 new dish lists** (mixed sizes 2–15, several
  past one screen; public/private mix) from a bounded pool of the top 50
  Austin restaurants with place ids (bounds the Google spend) and their top
  connections (≤2/restaurant by mention_count). Owner totals now
  16 restaurant-side + 15 dish-side lists → home grid scrolls well past one
  screen on both sides.
- **Google pull round 2**: +176 photos (new pool restaurants incl. the
  previously-failed Bouldin Creek Cafe). Dev DB now 313 live photos across
  39 restaurants.
- **Connection-level links**: every owner dish-list connection with zero
  photos got up to 3 of its restaurant's unlinked import photos linked
  (connection_id set) — 69 links this session, 103 connection-linked photos
  total. Probe `scripts/dish-connection-photo-probe.ts` (RED-capable, real
  cardStrips path): **80/80 owner dish-list connections return photos**.
- **Owner-attributed photos**: 8 (2 each at Cuantos Tacos, Micklethwait,
  Home Slice, Ramen Del Barrio) — Cloudinary side-copies of import assets
  (signed source URLs; no Google spend), real `photos` rows under the owner.
- **"My shots ATX"** (restaurant list, `use_own_photos = true`): the 4 shot
  restaurants + Uchi Austin/Uroko un-shot → live gallery = 3 own tiles with
  a sparse mid-grid slot; global pool = 4. `tile-gallery-probe.ts` extended
  with the own-photos law check (asserts every flagged tile's photo belongs
  to the owner; prints own-vs-global): **OWN-PHOTOS PROBE: PASS**.

### 3. Shared :3000 API rebuilt + restarted (no migration, no client regen);

health 200, fresh dist verified. What the sim sweep can now exercise: home
grid scroll/drag-auto-scroll/header-clamp at scale both sides, tile 2x2
galleries on ~30 lists, dish cards with real connection photos on any
account, and the Use-your-photos toggle flipping "My shots ATX" between own
(sparse) and global galleries.
