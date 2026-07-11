# Owner finger-test checklist — registry run W0–W4 (2026-07-11)

One consolidated pass, ordered by surface so you can sweep each page once.
Everything here is FUNCTIONAL and sim-verified except where marked ⚠️ (needs
your finger/hardware/second account). Visuals are crude by design — the
subjective polish pass is separate and owner-led. Sim-verified items are listed
only where the _feel_ still needs your eye.

## Setup

- Two accounts help a lot (blocking, DMs, share fan-out, private photos).
  Account B on a second sim or TestFlight device is fine.
- Camera + photo library items need real hardware.
- Everything else: dev client + `scripts/rig/reload-dev-client.sh`.

## 1. Favorites home + lists (W1)

- [ ] Sort toggle (Recent|Custom) and side toggle; Custom slides the Edit chip
      in — check the strip **label truncation** when Edit joins the row
      (flagged: labels compress; should the strip scroll instead?).
- [ ] Edit mode: grid linearizes, system lists (Been/Want to go) locked with
      dashed borders and no handles, user lists get drag handles.
- [ ] ⚠️ **The actual drag**: handle = instant lift; row body = press-and-hold
      ~0.3s then lift; live shuffle; drag to the top/bottom edge auto-scrolls;
      Save persists order after kill+relaunch (round-trip). Both favorites home
      and within-list edit.
- [ ] Mid-glide grab: entering edit while the sheet glides rubber-bands from
      expanded (expected per design — confirm it feels right).
- [ ] Edit lock: while editing, hard swipe down — sheet must stay pinned.
- [ ] listDetail: sort strip, disabled "Market · soon" chip, collaborator chip
      → modal (invite copy-link `?join=1` vs the new "Share list" row).
- [ ] ⚠️ Collaborator join round-trip on account B (`/l/<slug>?join=1`), then
      slug ROTATION kills the old link (410 private body with a dead slug).

## 2. Photos (W2)

- [ ] Strips render on: search result cards, favorites list rows, restaurant
      dish rows (placeholders when empty — display context only).
- [ ] Add-photo funnel from the restaurant page: source modal → "Use test
      images (dev)" → post page → tap photo → assign dish → chip.
- [ ] ⚠️ **Post → upload** on device with real Cloudinary: per-photo progress
      badges, a failure shows retry, success collapses the funnel; the strip
      gains the photo after webhook settle (may take the reconcile cron).
- [ ] ⚠️ Custom camera on hardware: snap → retake → use photo → lands in the
      post page; flash + flip.
- [ ] ⚠️ Library multi-select on device.
- [ ] ⚠️ Long-press a strip photo → report modal (4 reasons) → confirm.
- [ ] ⚠️ Private photo (toggle Private before posting) invisible to account B
      (their gallery/strips/food-log), visible in your own food log.

## 3. Restaurant profile (W3)

- [ ] View switcher Overview|Dishes|Discussions|Photos — swap feel + scroll
      reset between views.
- [ ] Overview: "Mentioned here" tag collage, top discussions, top dishes,
      "See all N dishes" → Dishes view.
- [ ] Discussions: tag multi-select + search + Top votes/Newest (keyboard on
      the sheet); ⚠️ a discussion card → pollDetail must scroll to/highlight
      the exact comment (needs a poll with a real mention).
- [ ] Photos view with a photo-heavy restaurant (grid, per-dish slices; >60 photos truncate — known crude bit, no paging yet).

## 4. User profiles + social (W3)

- [ ] Own profile (settings → My public profile): 4 sections
      Polls/Comments/Lists/Photos; stats row == section contents (the poll
      count drift is fixed — verify).
- [ ] Lists section: city grouping (2+ cities), pinned lists first, All tiles
      last; long-press own list → Pin/Unpin/Share/Delete (system lists have no
      Delete).
- [ ] Foreign profile: Follow, **Message**, share icon; Comments row →
      pollDetail comment anchor.
- [ ] ⚠️ Block → their profile shows "unavailable" (and from account B: your
      profile too) → gone from follow lists → any DM conversation freezes
      (composer replaced by notice) → Unblock restores.
- [ ] Avatar change on editProfile (picker → upload → "will appear once
      reviewed" while moderation-pending).
- [ ] RT-19 drill loop feel: profile → followList → profile → ... (deep
      stack), then X-pop one at a time — each pop restores the EXACT previous
      entry (list scroll included). Depth-K eviction beyond 3 deep re-fetches
      (expected).

## 5. Messaging (W3/W4)

- [ ] Inbox from the own-profile chat icon; empty state honest.
- [ ] DM from a foreign profile: composer pinned at the sheet bottom, thread
      above; keyboard lifts the composer flush (W4 fix — verify feel);
      send → bubble appends, thread stays bottom-anchored.
- [ ] ⚠️ Two-account round-trip: account B receives in inbox (≤15s poll),
      unread dot, request lane if B never messaged you (Accept / Block
      banner), read cursor clears the dot.
- [ ] ⚠️ Share fan-out: share modal → select B → Send → B gets the
      entity_share bubble; tapping it opens the entity (restaurant/poll/list).
- [ ] Drag-to-dismiss from the header still works with the nested thread
      scroll (flagged as a possible gesture conflict — check).

## 6. Universal share modal (W3)

- [ ] From: restaurant header, result cards, poll detail, profile, list
      long-press. Copy link → paste shows /r /p /u /l /e links.
- [ ] "Share via…" opens the OS sheet.
- [ ] ⚠️ Send-to ranked row with a real follow graph (closeness order).
- [ ] Sharing someone ELSE's slug-less list: copy-link fails honestly
      (enableShare is owner-only); send-in-app works — owner call whether
      that's acceptable v1.

## 7. Settings + paywall (W4)

- [ ] Settings: opens FULL-snap (past the normal top), **no grab handle**
      (every other page keeps its handle — RED check), drag rubber-bands, X
      returns to origin.
- [ ] Rows: blocked users (block someone first → row + Unblock), subscription
      status + Manage (App Store), Terms/Privacy, replay onboarding, sign out,
      delete account (typed confirm), version footer; honest Coming-soons
      (notification prefs, appearance).
- [ ] Poll creation → "How do polls work?" explainer modal.
- [ ] Paywall enforce-drive (verified on sim): `ENTITLEMENT_GATING=enforce` +
      API restart → cold launch hits the full-screen Crave+ wall.
      ⚠️ NOTE: wall showed **$9.99/$79.99** — business model doc says
      $7.99/$39.99 w/ annual-only intro trial. That's RevenueCat product
      config, not code. Reconcile before launch.
- [ ] ⚠️ Purchase/restore flows on TestFlight sandbox.

## 7.5 Red-team additions (new since the checklist was written)

- [ ] Restaurant page: **Directions** chip opens Apple Maps at the right
      place; your saved **note** shows on Overview when the restaurant is in
      a list with a note.
- [ ] Post photos: "Add another restaurant" → pick → per-section photos +
      dishes; own profile → Photos → "Add photos" starts with a restaurant
      pick; list-row "+" tile opens the funnel preassigned.
- [ ] ⚠️ Push permission: the OS prompt appears only after your FIRST
      contribution (vote/comment/photo/DM), never at launch.
- [ ] Report a comment (Report action on a comment) and a user (row under
      Block) → "Report received".
- [ ] ⚠️ Drag a row to the edge and HOLD STILL — the list keeps scrolling
      while the row stays glued under your finger and the slot advances
      (the stationary-finger fix).
- [ ] Copy-link on a PRIVATE list you own → a confirm explains it becomes
      public; sharing someone else's list shows send-in-app only.
- [ ] ⚠️ Tap Message on a profile and back out WITHOUT sending — the other
      account's Requests list stays empty (ghost-conversation fix).
- [ ] OWNER ACTION: set EXPO_PUBLIC_SHARE_BASE_URL (links currently fall
      back to https://crave-search.app).

## 8. Known crude bits (deliberate, for the polish pass)

- Strip heights/aspects eyeballed; totalCount "+N" overflow not rendered.
- Share modal has no rich preview card (see plans/w4-share-package-research.md).
- dmSession header says "Chat" not the peer name (per-entry dynamic header
  needs its own pass); session poll is a 5s full refetch, not deltas.
- Restaurant Discussions: no result highlighting, no debounce; tag chips on
  Overview don't pre-select the filter.
- No gallery paging (>60), no photoViewer (grid tap is a no-op seam).
- Profile section tabs/tiles are plain pills/text rows.
- Poll close/delete/report have NO backend yet (nothing fake-wired).
