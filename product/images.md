# Images — UGC photos (canonical product spec)

This file is the design of record for the photo system; plans/page-registry.md
§7 is the authority on the photo UI surfaces (page/funnel entries). The app
launches with ZERO images — every photo is UGC.

## The model (one sentence)

Every photo belongs to a RESTAURANT (required) and optionally to a DISH; it
propagates to every surface those entities render (restaurant gallery, dish
cards/strips, result sheets, favorites lists, the owner's profile food log);
contribution is not a destination — it is placed at the exact moments of
intent. No review-begging, ever: the collection pipeline gets sentiment from
organic conversation; the ONLY thing we ask users for is photos.

## Photos are FOR

Making cards/profiles look alive; helping people visualize what the food
looks like (come to terms with what they're craving); engagement. The most
valuable photos are dish-linked. Google-Maps-like galleries, minus Google's
contribution-nagging apparatus.

## The moment inventory (where "add photo" lives — and where it doesn't)

1. **At the table / owner curating a list**
   - Owner/COLLABORATOR-only "+" tile PREPENDED to the photo strip on their
     list cards (first item of the scrollable strip). Never shown to
     viewers of someone else's list.
   - "Add photo" chip in the restaurant profile's (upcoming) scrollable
     button row.
2. **Just ate (minutes-hours later)**
   - Search → restaurant profile → chip (same as above).
   - THE SAVE FUNNEL: saving = curating. The save sheet (pick list / create
     list) and the create-list page carry a quiet NOTE field (+ tags at the
     schema level, UI fast-follow) — inline, Google-style, an affordance and
     NEVER a prompt/interrupt. The save sheet does NOT carry an add-photo
     button; photos enter a list via the card "+" tile on the owner's own
     list cards (dish-save pre-links the photo to the dish; restaurant-save
     offers the dish list, skippable). Notes make shared lists feel authored
     (lists are a virality surface).
3. **Archaeology (photos already in the camera roll)**
   - Profile food-log gallery has its own add entry: flow INVERTS —
     pick photos first, then "where is this?" (search screen with the
     user's own lists + recents weighted up in autocomplete), then the
     dish question. Seeds the food log in one sitting; this is what makes
     the profile gallery alive in week one.
   - Restaurant profile gallery also has its own add entry (Google-style).
4. **Explicit NON-moments**: browsing search results, viewing someone
   else's list, any dish the user hasn't eaten. Empty image slots there are
   a DISPLAY state (attractive placeholder, NO button). A photo prompt at a
   non-eater invites junk.

## The ONE reusable Add Photos screen — THE POST PAGE

All funnels converge on a single screen — the POST PAGE (registry §7.4): a
universal composer taking context `(restaurant?, dish?)` and rendering only
the unanswered questions, with per-photo dish assignment via an inline
ranked dish list, a public/private control, multi-restaurant sections when
entered from the profile, and a Post action that collapses the funnel:

- STANDARD FIRST STEP everywhere: a shared 2-option modal (Take photo /
  Choose from library) → the iOS PHPicker or our custom camera page.
- Media picker: iOS PHPicker (ZERO photo-library permission needed — the
  system picker is out-of-process and returns only what the user selects).
  In-app camera capture also available. PHOTOS ONLY at launch (owner rec:
  video doubles moderation cost + playback UI; schema carries mediaType so
  video is a fast-follow, not a redesign). [owner may veto]
- Dish link: ALWAYS OFFERED, NEVER REQUIRED, PRE-FILLED when context knows
  it. Restaurant context → the restaurant's RANKED dish list with
  typeahead + skip. Dish context → pre-linked, question not shown.
- Last dish-list item = "Other…" free text: photo stays restaurant-level
  with the text as caption; the unmatched name is a DEMAND SIGNAL for the
  collection/on-demand side (user photographed X at Y → when the dish later
  materializes, the photo can be re-linked). NO dish entities are ever
  created from photo tagging — dish identity belongs to the collection
  pipeline.
- Where-is-this (archaeology entry only): search screen, own-lists/recents
  boosted.

## Galleries

- **Restaurant profile**: gallery preview strip (scrollable L-R) above a
  full gallery. Organization = "By dish" (rows ordered by DISH RANK — the
  thing Google cannot do: top dishes, in order, in pictures) + "All
  photos". The gallery copies Google's pattern: a horizontal-scrolling
  SELECTOR mini-row at the top (sections as tappable thumbnails/chips —
  "All photos" first, then the dishes RANKED left-to-right); tapping a chip
  swaps the gallery grid below. Skip Google's menu/vibe ML categories at
  launch; a cheap async classifier can later split the general bucket
  (food/drink/interior).
- **User profile (the food log)**: auto-aggregates every photo the user
  adds anywhere. Grouped by restaurant (self-organizing), dishes within.
  takenAt (EXIF) stored from day one so a timeline view needs no schema
  change. Vision: the place people put ALL their food photos — replacing
  the camera roll for food. Recognition mechanics (photo credits) render
  here and on every photo (see product/profile.md).
- Cards everywhere (restaurant + dish cards in results, favorites lists —
  yours, friends', anyone's): photo strip scrollable L-R, Google-style.

## Strip ordering

Cards NEVER show a single photo — every card carries a horizontal photo strip.

- Every restaurant/dish card renders a horizontally scrollable STRIP
  (~3-4 photos visible, more on scroll). There is NO single-thumbnail slot
  anywhere — the old "hero" concept survives only as WHO LEADS THE STRIP
  (position #1) and how the rest are ordered.
- Ordering policy: most-recent ABOVE A QUALITY FLOOR first (the moderation
  pass scores focus for free — no blurry photo leads a strip), then
  recency; v2 = tap-rate (taps ÷ impressions, age-normalized — raw
  views/view-time just measure age, rejected).
- The SAME horizontal-scroll pattern is the gallery selector on restaurant
  profile + user profile pages: scroll across dish slices ordered by dish
  rank, like a toggle selector.
- Requirement NOW: track impressions + taps per photo from day one (taps in
  a gallery = interest signal, owner-confirmed). Batched fire-and-forget
  events (usage-ledger pattern); metrics may later drive strip ordering and
  profile sorting.

## Moderation (fully automated — owner can NEVER be an approval bottleneck)

Upload → AUTO-GATE (safety + is-food + quality score, e.g. Cloudinary
moderation add-on / vision pass) → publish immediately → report button →
threshold auto-hide → owner audits the hidden pile at leisure. Users can
upload unlimited photos per dish/restaurant.

## Cloudinary architecture (ideal shape)

- Client asks API for a SIGNED UPLOAD ticket → uploads DIRECTLY to
  Cloudinary (bytes never proxy through the API) → API records the Photo
  row (status pending) → moderation → approved.
- Delivery: CDN with f_auto,q_auto + named transformations (thumb, card,
  gallery, full) — every surface pulls right-sized images; thumbnails are
  the workhorse. Public IDs: crave/{env}/photos/{photoId}. Free tier
  (~25GB) covers launch.

## Data model (one entity, everything else is a query)

Photo (`schema.prisma`, `model Photo`): photoId, userId (owner/credit),
restaurantId (REQUIRED), connectionId? (the dish link), publicId, mediaType
('photo' now), caption?, takenAt (EXIF), uploadedAt, status
(pending|live|hidden|removed), focusScore (Cloudinary `quality_analysis`
focus, 0..1), width/height, visibility (`PhotoVisibility` public/private),
reportCount, pendingDishName, bytes, moderatedAt. Plus `PhotoEvent`
(impression|tap, batched). List-item note + tags live on the favorites side
(see product/favorites.md), not on Photo.

## Considered and DEFERRED (do not relitigate without the owner)

- **User feed**: parked, ~50-50 but deliberately avoided. Polls are the
  engagement center. If ambient social ever ships it's the Spotify-peek
  analog (e.g. "X added 3 places to Want to Go"), NOT a posting feed.
- Video uploads; tags UI (schema first); AI dish-suggestion (cheap async
  batch pass post-launch — never blocking, never at capture time); gallery
  ML categories; likes on photos (metrics only, no like button).
- **v2 restaurant-suggest enhancer**: a transient client-side EXIF-GPS read
  to suggest the restaurant (never uploaded/persisted — compatible with the
  GPS privacy rule).
