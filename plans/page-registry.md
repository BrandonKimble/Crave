# Page Registry — the app's full page inventory + navigation contracts

**Status:** decided 2026-07-05 (owner-blessed decisions inline); **scene-key stub pass DONE +
on-sim verified same day** (`71587785` — all 7 child scene keys wired end-to-end, stub bodies
"coming soon", drivable via the deep-link recipe below; modals not yet stubbed). This is step 1
of the sequencing: page inventory → source-agnostic search flow → toggle primitive extraction.
The switching **engine** already exists (PresentationFrame single-writer + co-mounted legs +
skeleton hard-swap, merged `4eeaa27b` — see `plans/page-switch-handoff.md`); this doc is the
**inventory + contracts** that the search-flow and toggle efforts build against.

**Adding a page** = scene key + leg (or modal entry) + skeleton spec + header spec + (if
child) nav-stack participation. Registry code homes: `overlays/types.ts:9` (OverlayKey),
`navigation/runtime/app-overlay-route-types.ts:40` (metadata), `overlays/BottomSheetSceneStackHost.tsx:1590`
(legs), skeleton specs `BottomSheetSceneStackHost.tsx:769`, headers
`app-route-persistent-header-registry.ts:18`.

---

## 1. The registry

### Top-level scenes (bottom-nav legs; nav bar IN)

| Scene key   | Status   | Body                   | Skeleton                 | Notes                                                            |
| ----------- | -------- | ---------------------- | ------------------------ | ---------------------------------------------------------------- |
| `search`    | ✅ built | SearchMountedSceneBody | never-null skeleton page | results sheet; Restaurants/Dishes strip                          |
| `polls`     | ✅ built | PollsPanel             | `restaurant` rows        | Live/Results strip; `docked-polls` lane                          |
| `bookmarks` | ✅ built | BookmarksPanel         | `tile`                   | favorites home: 2-col list-of-lists grid + strip                 |
| `profile`   | ✅ built | ProfilePanel           | `restaurant`             | **own** profile only (nav stays); Created/Contributed/Lists tabs |

### Child scenes (result-analogous; nav bar OUT; participate in the child nav stack §2)

| Scene key       | Status          | Params                             | Skeleton                            | Notes                                                                                                                                                                                                                                                                                                    |
| --------------- | --------------- | ---------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `restaurant`    | ✅ built        | restaurantId                       | `dish`                              |                                                                                                                                                                                                                                                                                                          |
| `saveList`      | ✅ built        | listType, target                   | `tile`                              | save flow                                                                                                                                                                                                                                                                                                |
| `pollDetail`    | ✅ built        | pollId, commentAnchorId            | `comment` (frost)                   |                                                                                                                                                                                                                                                                                                          |
| `pollCreation`  | ✅ built        | marketKey?, bounds?                | `comment` (frost)                   |                                                                                                                                                                                                                                                                                                          |
| `userProfile`   | 🆕 NEW          | userId                             | `restaurant` (like profile)         | OTHER users only — deliberately NOT a param on `profile` (different lane: nav out, nestable, Follow action). Openable from any username anywhere + people-lane search.                                                                                                                                   |
| `listDetail`    | 🆕 NEW (hybrid) | listId, ownerUserId?               | reuse results skeleton              | **Body = the Search Results renderer; OPEN fires the shared search flow** (entityIds → map pins + reveal, favorites-as-search). Own scene key because it needs stack participation + its own strip/header variants (per-list sort/filter toggles). Serves both your lists and other users' public lists. |
| `followList`    | 🆕 NEW          | userId, mode: followers\|following | `tile`                              | one scene, param'd both ways; rows open `userProfile` (nesting)                                                                                                                                                                                                                                          |
| `notifications` | 🆕 NEW          | —                                  | `comment` or `tile` (pick at build) | in-app inbox — CONFIRMED a launch page. Trigger button placement TBD (leading: icon on the search bar; alts: polls header, profile). Open is source-agnostic like everything else.                                                                                                                       |
| `settings`      | 🆕 NEW          | —                                  | `tile`                              | CONFIRMED (owner 2026-07-05): in the shared sheet system, opens directly off the profile page, nav transitions out                                                                                                                                                                                       |
| `editProfile`   | 🆕 NEW          | —                                  | `tile`                              | CONFIRMED: a button on the profile page; shared sheet system; nav transitions out                                                                                                                                                                                                                        |
| `shareConfig`   | 🆕 NEW          | listId                             | `tile`                              | share-configuration surface off a list (part of the Spotify-like list cluster §1b); nav stays out (already ≥1 layer deep)                                                                                                                                                                                |

### Modal layer (`modalExtension` — no leg, no nav effect; pattern = existing `price`)

| Modal key       | Status   | Notes                                                                                                                                                                                                                                   |
| --------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `price`         | ✅ built |                                                                                                                                                                                                                                         |
| `scoreInfo`     | ✅ built |                                                                                                                                                                                                                                         |
| `sortSheet`     | 🆕 NEW   | the Rising→Sort dropdown modal (unbuilt ~7-file thread per `toggle-strip-regression-fix.md`); ALSO the template for every dropdown-toggle: **apply-tap = the toggle press-up** (dropdowns are not an exception in the toggle primitive) |
| `marketPicker`  | 🆕 NEW   | poll creation market value-picker                                                                                                                                                                                                       |
| `duplicatePoll` | 🆕 NEW   | "This looks like an active poll" sheet                                                                                                                                                                                                  |
| `pollInfo`      | 🆕 NEW   | the under-poll ⓘ modal (same pattern as scoreInfo)                                                                                                                                                                                      |
| `paywall`       | 🆕 NEW   | Crave+ contextual unlock; must be invocable from ANY surface (dish gate, list filters, movement-alert tap-through)                                                                                                                      |
| `listEdit`      | 🆕 NEW   | create/edit list panel (name/description/public-private) — reused by Save Sheet "New list" tile and per-list ellipsis Edit                                                                                                              |
| `listConfig`    | 🆕 NEW   | the per-list ellipsis (⋯) configuration surface — Spotify-playlist-like (see §1b). Modal vs full page TBD (owner leaning modal first; "be prepared for a lot of pages here")                                                            |

### 1b. The list-detail cluster (owner 2026-07-05: "by far the most involved page")

`listDetail` is expected to be the app's richest surface — it must make sharing elegant and
_beautiful_ (shared artifacts are the acquisition hook), while also carrying editing, custom
drag-and-drop sort, adding places, and (future) offline download. Modeled on Spotify's
playlist page. The cluster hanging off it:

- **`listConfig` (⋯ ellipsis):** make public/private; possibly a separate Spotify-style
  distinction between _private_ (only you + invitees) and _remove-from-profile_ (public by
  link but not displayed) — exact semantics TBD, see `product/favorites.md`; edit
  name/details (`listEdit`); share (`shareConfig`); download-for-offline (future).
- **Add places** — a button that opens SEARCH MODE in **pick mode**: selecting a result
  ADDS it to the list (no search flow trigger, no page switch). See §4 pick-mode contract.
- **Custom sort** — the drag-and-drop edit mode (sheet locks to full height, drag handle
  activator; already specced in `product/favorites.md`).
- **Offline download** (future) — see product docs; lists + maps offline.

This cluster gets its own dedicated design pass when we reach it — do not try to settle it
inside the search-flow effort.

### Outside the sheet system (full-screen, separate — NOT legs)

| Surface                  | Status   | Notes                                                                                                           |
| ------------------------ | -------- | --------------------------------------------------------------------------------------------------------------- |
| auth / onboarding        | partial  | Clerk flow                                                                                                      |
| handle picker            | 🆕       | post-auth username claim (debounced availability + suggestions)                                                 |
| search-suggestion screen | ✅ built | "the only true full-screen page" — search mode; its select-transition is a contract the search flow reuses (§4) |

### Deliberately NOT pages

- **The "All" list** — a synthetic union list; opens as `listDetail` with a virtual id + its extra include/exclude toggle.
- **Save Sheet** — exists (`saveList`).
- **Dish detail** — dish rows live inside `restaurant` / results; no standalone dish page for now.
- **Compare-lists / infographic / share flows** — later; share = OS sheet, not a page.

---

## 2. The child navigation stack (NEW architecture requirement — the big finding)

Owner requirement (2026-07-05): from any page, tap a username → `userProfile` over the same
sheet; from there → their `followList` → another `userProfile` → their `listDetail` → … —
**arbitrary-depth nesting of child scenes, including repeated same-key instances**, where
back/close pops EXACTLY one level and the bottom of the stack returns you to the precise
trigger origin (page + scroll + snap, per the return-to-origin foundation).

Today's system has a single co-mounted leg per scene key + a one-level `parentSceneKey`
pointer — it cannot represent `userProfile(A) → userProfile(B)`. The engine needs a
**child stack**: an ordered list of `{sceneKey, params, originCapture}` entries above the
active top-level scene. Design constraint: keep ONE leg per scene key (re-param the leg on
push/pop; capture-and-restore per entry) rather than mounting N legs — same philosophy as
the PF single-writer. This is the main engineering item this registry adds; it belongs to
the page-switch/search-flow effort, and the search flow's dismiss = "pop to stack bottom +
restore origin."

**Nav-tab invariance:** the selected nav tab NEVER changes while walking the child stack —
you can read a poll-commenter's profile while "Polls" stays selected.

---

## 3. Nav-bar visibility — a derived rule, never per-page

**The pattern (owner-articulated, codified):** the nav bar transitions out exactly when a
**result-analogous surface** presents; in engine terms:

> `PresentationFrame.laneKind === 'child'` (child stack non-empty) ⇒ nav bar OUT.
> `top-level` ⇒ nav bar IN. (`docked-polls` = in.)

The owner's articulation (2026-07-05, and it's the same rule): **"after the first page it's
gone"** — the four parent nav pages (search/polls/favorites/profile) keep the nav; ANY step
one layer deeper (poll detail, a favorites list, settings, edit-profile, notifications,
someone's profile, share config…) transitions it out, and it stays out at any depth of the
child stack. Depth ≥ 1 ⇔ `child` lane ⇔ nav out. No page ever decides its own nav
visibility. The nav in/out motion reuses the existing search-transition slide/mask.

---

## 4. Contracts the search-flow effort (step 2) builds against

- **Every child-scene OPEN is a search-flow trigger or a plain push.** `listDetail` and
  entity taps fire the shared flow (map reacts: pins/coverage load, synchronized reveal);
  `userProfile`/`followList`/`settings`/`notifications` are plain pushes (no map reaction).
  One `openChildScene(sceneKey, params, {searchFlow?})` API covers both.
- **Search-mode selection is source-agnostic:** picking anything from the search-suggestion
  screen (food query, person, restaurant) runs the SAME select-transition (fade-out of
  search mode → content swap in whatever sheet is already up → snap adjust). Snap rule:
  food search → mid snap (unless already there); profile select → TOP snap. Back after a
  search-mode selection returns to the page (search mode NOT re-armed) — matches today.
- **Sheet reuse:** the flow never slides a new sheet up if one is presented — it swaps
  content in place + adjusts snap (the toggle-style loading mode), reserving slide-up for
  the collapsed/home case.
- **Pick mode (NEW, owner 2026-07-05):** search mode has a second selection mode. Default =
  **navigate** (selection runs the search flow / opens the page). **Pick** = the selection
  is RETURNED to the requester (e.g. `listDetail` "Add places": tapping a result adds it to
  the list and search mode closes back to the list — no search flow, no page switch). Same
  search-suggestion screen, same transition in/out; only what selection _does_ differs. The
  search-mode API must take a mode + on-pick callback.

## 5. Open items (parked, non-blocking)

- Notifications trigger-button placement (search bar icon leading) — decide with the
  notifications product pass.
- `followList` could fold into `userProfile` as a tab later — kept separate for stack
  clarity.
- Skeleton row types for the new scenes are placeholders — pick at build time.
- ✅ Scene-key stubs BUILT + sim-verified 2026-07-05 (`71587785`): all 7 child scenes present
  with header + frost + placeholder body (`StubScenePanels.tsx`, testID `stub-scene-<key>`).
  Modal-layer stubs (sortSheet/marketPicker/…) still pending.
- **Driving any scene without UI (the recipe — arm FIRST or commands are ignored):**
  1. `crave://perf-scenario?scenario=<name>&durationMs=<ms>` (arm; commands are ignored
     with `no_active_scenario` otherwise)
  2. `crave://perf-scenario-command?action=open_overlay_scene&scene=<OverlayKey>`
     (now METADATA-driven — any `sceneSwitch` scene works: topLevel → setRootRoute,
     child → openChild push; was a hand-whitelist that silently rejected everything else)
  3. Verify via the painter probe: `grep '\[pageswitch\] host' /tmp/crave-metro.log` →
     `"displayed":"<scene>"` is the "actually presented" signal (not the command ack).
- Two systemic fixes landed with the stubs (both were hand-rolled whitelists that silently
  no-op'd unlisted scenes — the always-green disease in routing form):
  `use-perf-scenario-overlay-scene-command.ts` (default:false → metadata fallback) and
  `app-overlay-route-command-runtime.ts` `revealRoute` (only saveList/restaurant got a real
  openChild switch; now every child-role scene does).
- Stub finger-test residuals (owner eyes, non-blocking): the close (X) pop path on stubs
  (shared `closeActiveRoute`, same as every child), and whether the nav bar transitions out
  on stub opens per the §3 rule (couldn't confirm under the dev error toast).

## 6. Image/photo pages + the save funnel (owner discussion locked 2026-07-09)

Product design of record: product/images.md (moments, moderation, Cloudinary,
hero policy). This section registers the PAGES/FUNNELS it adds. "Funnel" =
the owner's term: a triggered flow of sheets that collapses back to the
trigger point when finished.

### The SAVE funnel (curation toolkit — trigger: any save/favorite button)

save button → **saveSheet** (pick an existing list → done collapses the
funnel; or "create new list" →) → **createList** page (finishing auto-saves
the item to the new list, funnel collapses back to the trigger context).
TOOLKIT on both saveSheet and createList: **Add photo** button (opt-in
affordance, NEVER a prompt — discovery-savers ignore it, just-ate savers
self-select) + **note** field (+ tags: schema now, UI fast-follow; tags later
filter lists via the toggle strip). Dish-save → photo pre-linked to the dish;
restaurant-save → dish question offered inside addPhotos.

### The ADD PHOTOS funnel (ONE reusable screen, context-parameterized)

**addPhotos(restaurant?, dish?)** — all entry points converge here; it
renders only the questions context can't answer:

- media picker (PHPicker, zero permission; in-app capture; photos-only v1)
- dish link: always offered, never required, pre-filled from context;
  restaurant context shows the RANKED dish list w/ typeahead + skip; last
  item "Other…" free text (caption + collection demand signal; never creates
  dish entities)
- "where is this?" step ONLY for the profile-gallery (archaeology) entry:
  search screen w/ own-lists+recents boosted in autocomplete, then the dish
  question below it (two opt-in questions, one page, child search collapses
  back)

Entry points (complete list): owner/collaborator "+" tile prepended to list-
card photo strips (never for viewers); restaurant-profile button-row chip
(the profile button row itself is NEW — Google-style scrollable chip list);
restaurant-profile gallery add entry; user-profile food-log add entry
(archaeology); save-funnel toolkit button.

### Gallery pages

- **restaurantGallery** — full gallery behind the profile's preview strip
  (strip scrollable L-R). Sections: "By dish" (rows ordered by dish RANK —
  the Google-can't-do differentiator) + "All photos".
- **userGallery (food log)** — on the user profile; auto-aggregates every
  photo the user added anywhere; grouped by restaurant, dishes within;
  takenAt kept for a later timeline view. Profile page design pass owns the
  presentation (parked — owner wants "attractive gallery", details TBD).

### Card contract (all restaurant/dish cards, everywhere incl. favorites)

Photo strip scrollable L-R on EVERY card (~3-4 visible, more on scroll) —
there is NO single-thumbnail slot anywhere (owner 2026-07-10). Strip ORDER
uses the ordering policy (product/images.md: quality-floor-then-recency →
tap-rate v2; position #1 = the old "hero"). Imageless cards render the
attractive PLACEHOLDER (display state only — the add button appears ONLY in
owner/collaborator list contexts). The same horizontal-scroll pattern =
the gallery dish-slice selector on restaurant/user profiles.

### Favorites two-sided note (owner, same discussion)

The dish side of favorites needs the analog of the restaurant side's
been/want-to-go: **tried / haven't tried** (copy TBD). Recorded in
product/favorites.md.

## 7. Registry v2 — owner lock-in session, items 1–9 (2026-07-10)

Owner brain-dump captured verbatim-in-spirit; this section + the updated
product pages are the record. Items 10–21 of the talking-point list are
still pending (owner returning to them).

### 7.1 Card anatomy (restaurant + dish cards, FINAL)

Top→bottom: metadata block → horizontal PHOTO-STRIP preview row →
horizontal BUTTON STRIP (chip row, toggle-strip-like but plain action
buttons) as the card's LAST element. The add-photo affordance on cards
exists ONLY when the card sits in the viewer's OWN saved/favorites list —
as the placeholder sliver / "+" tile on the LEFT end of the photo strip
(owner chose this over a toolkit-page approach: simpler, good basis).
Cards outside own lists: no add affordance (display-only placeholder).

### 7.2 Restaurant profile = ONE DYNAMIC SINGLE PAGE (Google Maps pattern)

NOT a family of child pages. Anatomy:

- PERSISTENT top region: header info (name/score/meta → later locations,
  website, contact), photo gallery preview strip, scrollable ACTION CHIP
  ROW (Google's Directions/Start/Ask row analog — ours: add photo,
  directions, call, share, save…).
- Below: a SEGMENTED SECTION SELECTOR (Google's Overview|Menu|Reviews|
  Photos row — industry "segmented tabs") that swaps the content region
  IN PLACE with one tap. Sections: Dishes, Discussions/Polls, Photos
  (details of the set = design pass). Scrolling up always returns to the
  same persistent header. One page, one scroll container, swappable body.
- Add-photo entries here: chip in the action row + an entry inside the
  Photos section (placement TBD).

### 7.3 User profile = the SAME dynamic single-page pattern

More similar to the restaurant page than different; social/visual vibe.

- PERSISTENT top: avatar, stats; on OTHERS' profiles an Instagram-style
  button pair — FOLLOW (left) + MESSAGE (right); on own profile — EDIT
  PROFILE button (+ messages-inbox entry, see §7.9; settings entry §7.7).
- SEGMENTED sections, currently FOUR: Polls (created), Comments (their
  poll/discussion comments, Reddit-style), Lists (public), Photos.
  Owner prefers THREE — open idea: merge Polls+Comments into one
  "Posts"/"Activity" section (Reddit precedent). Unresolved, park.
- Lists section on others' profiles: Spotify-playlists analog — simplified
  read-only view of public lists. Simplest = flat chronological; leaning
  toward carrying the toggle-strip filters (restaurant vs dish lists etc.)
  because list volume gets overwhelming; final call at implementation,
  AFTER the segmented single-page foundation exists.

### 7.4 THE POST PAGE (supersedes the "addPhotos screen" naming — same

concept, now concretized as the universal photo composer)

Every add-photo flow converges here. Core contract:

- STANDARD FIRST STEP app-wide: tapping ANY add-photo button (and the
  change-avatar button) opens THE shared global modal with exactly two
  options: **Take photo** / **Choose from library** (Twitter model; no
  Instagram-style import options).
  - Library → native Apple picker (PHPicker, multi-select, checkmark).
  - Camera → our own CUSTOM CAMERA page (snap, flip, flash, exit;
    retake / use-photo) — a NEW page to build; iOS gives no styled
    camera UI, apps roll their own.
- Then the POST PAGE: shows the restaurant (pre-filled from trigger
  context), the selected photos as a horizontal scrollable row, and a
  PER-PHOTO dish question: tap a photo in the row → a short-form RANKED
  dish list of that restaurant appears inline below (NOT a separate
  page — dropdown/inline; reuses the gallery-selector interaction) →
  assign; tap the next photo; repeat or skip. Unassigned photos = the
  general/"vibes" bucket — never nag; AI categorization later (owner
  prefers that over more questions). "Other…" free-text dish entry
  remains (demand signal).
- PUBLIC/PRIVATE control on the post: private photos appear only on the
  owner's profile (never restaurant pages); maybe friends-visible —
  EXACT semantics = the pending privacy discussion (talking point TBD).
- POST button → publish → funnel collapses back to the trigger.
- MULTI-RESTAURANT SESSIONS (user-profile entry only): the post page is
  SECTIONED — restaurant A + its photo row + dish assignments, then an
  "Add another restaurant" button → restaurant search mode → the 2-option
  modal → new section; repeat; ONE Post at the end disperses everything.
- USER-PROFILE entry ORDER (owner settled after deliberation): tap add →
  FIRST restaurant search (restaurant-only autocomplete; boost the
  user's saved lists + recents) → then the camera/library modal → post
  page. Restaurant is NEVER assumed from that entry point.
- Photos are addable for restaurants the user has NOT saved anywhere —
  that's why the picker is full search mode, not a saved-list picker.
- v2 enhancer (feasible, flagged): read EXIF GPS CLIENT-SIDE from picked
  photos to SUGGEST/group-by the nearby restaurant — PHPicker hands over
  the original file including GPS with no extra permission; compatible
  with our "GPS never persisted" rule if read transiently and never
  uploaded. No known app does this well; genuine differentiator; not v1.
- Photo EDIT mode (crop/aspect/orientation): likely needed eventually
  (Google rolled their own); NOT the launch focus; never blocks the flow.

### 7.5 The save-to-list TOOLKIT (CORRECTION — supersedes §6 + the

product-page version)

Copy Google exactly: the save sheet shows list selection PLUS inline
NOTE area + TAG area for the selected list. **NO add-photo button on the
save sheet** — at discovery/save time users rarely have a photo; photos
are added later via the card "+" affordance in their list (§7.1).
Toolkit = note + tags, inline, same page. Create-list stays the inline
expansion it already is.

### 7.6 listDetail add buttons

- Restaurant list → "Add places" → search mode → tap restaurant →
  IMMEDIATELY added (no toolkit page detour).
- Dish list → "Add dish" (copy TBD) → search mode; OPEN UX QUESTION to
  A/B at build: dish-scoped autocomplete vs restaurant-first-then-pick-
  from-dish-list (owner suspects restaurant-first matches fuzzy dish
  memory better). Either way: selection → immediately added.

### 7.7 Settings (kept light, LAST area to design-complete)

- Entry: button on own profile page.
- NAV EXCEPTION (⚠️ foundational-ish — flag to the charter owners): the
  settings sheet extends PAST the normal top snap to a new exceptional
  "full" snap point — full-page illusion, no grab handle, close X top
  right; nav bar transitions out like any child; close = nav bar returns
  - sheet returns to the snap it was at when triggered. This introduces
    a new snap-point kind ("full") to the sheet system.
- No skeleton for the settings ROOT (text-only, render instantly —
  industry norm); inner pages may use skeletons if needed; target = no
  visible loading anywhere in settings.
- Contents: build only as needed. Known: notification settings, account
  privacy, dark/light mode (future placeholder), billing management,
  legal, delete account (last three already exist as drill-ins). Fake/
  anticipate sections lightly; the real settings design waits until the
  features it toggles are settled.

### 7.8 Stacked friends bubble (FriendCluster)

- Display: max 3 stacked avatars + Instagram-style copy "X and N others"
  (NOT "+N"). The NAMED person = top of the closeness sort (closeness
  algorithm to be designed — assistant to propose).
- Tap → THE shared global modal listing ALL participating friends as
  tappable profile cards (same sort, nobody filtered) → tapping opens
  their user profile (another profile entryway, like discussion avatars).
- ⚠️ REQUIREMENT on the modal primitive: modals need an optional
  SCROLLABLE variant — extend the ONE global modal in ideal shape (there
  is only one modal type in this app, ever).

### 7.9 MESSAGING IS IN (net-new decision — reverses "mentioned nowhere")

- Every OTHER user's profile: Message button (right of Follow). Tap →
  DM SESSION page = a CHILD page of that profile (push; back returns to
  THEIR profile). Tapping Message fully extends the sheet first if not
  already extended; back returns to the prior snap.
- MESSAGES INBOX (all conversations) = its own surface, entered via a
  button on YOUR OWN profile page (likely in the header); a DM session
  is also reachable from the inbox. Treat inbox as a child of own
  profile.
- Assistant owns the FULL design (product shape, UX skeleton, plumbing,
  backend — well-trodden territory, ideal shape expected): deliver it
  foundationally complete + crude-visual; owner refines presentation
  later.

### 7.10 Registry-era DEVELOPMENT METHODOLOGY (owner directive)

- Build 100% of the FUNCTIONAL surface at the highest standard: every
  button hooked up, every modal opens, camera works, photos land in the
  post page, transitions/snap behavior/nav all real and smooth. Crude
  visuals are FINE. What is FORBIDDEN: deferring functionality because
  presentation is undecided ("the post page was subjective so nothing
  was implemented" is the failure mode to never hit).
- Subjective visual polish + copy = owner-in-the-loop passes at the END,
  one surface at a time.
- SKELETONS during the churn: ONE base super-simple placeholder skeleton
  everywhere; the real per-page cutout skeletons return as a FINAL pass
  after UI locks (do not hand-craft skeletons for pages still moving).
- While implementing, sweep the product/ pages: anything well-specified
  and registry-scoped gets built in the same wave.

### 7.11 Immediate reconcile executions (owner authorized)

- Paywall registry row → hard-paywall reality (done in this edit: the
  §1 modal-layer 'paywall' row is superseded — paywall = full-screen
  onboarding-end page + lapse takeover; contextual-unlock modal =
  dormant freemium machinery, git history).
- BUILD NOW: paywall wired to the END of onboarding (functional, decent
  looks, final design later).
- Username picker: audit to most-ideal shape; polish later.

## 8. Registry v2 — owner lock-in, items 10+ (2026-07-11)

### 8.1 Lists (home + detail — "just as involved as listDetail")

- EDIT MODE (custom re-rank by drag): triggered by a SEPARATE button
  outside the toggle strip (NOT a toggle — editing isn't slicing/sorting),
  labeled ~"Custom rank", visible ONLY while sort = Custom. Entering edit
  locks the sheet at full height, drag handle is the sole activator, home
  grid linearizes to one column, non-drag accessibility path ships too
  (all as previously specced in product/favorites.md).
- COLLABORATOR STACK CHIP on every list: same stacked-avatars primitive,
  but slot #1 = a plus-in-a-circle, slot #2 = the owner, then the rest.
  Accounts without avatars render first-letter monogram on a randomized
  color. Tap → the shared modal: row 1 = "Add collaborator" (plus circle)
  → opens the UNIVERSAL SHARE modal with "invite as collaborator"
  checked; other rows = collaborators (tap → their profile; kick via
  swipe-left or ellipsis-reveal delete, owner only).
- COLLABORATOR POWERS = full parity with owner (add/remove/reorder/invite
  others). Launch with that; tighten only if complaints. Collaborators
  get a LEAVE button on lists they joined. Owner making a list PRIVATE
  removes all collaborators and kills every outstanding share link; a
  dead link still opens the app but lands on a "this list is private"
  state (= the §5.6 dead-slug ListBody failure body — same surface).
  Industry check (Spotify model) confirms: private ⇒ links stop
  resolving for everyone else.
- LIST TAGS ARE DEAD. Owner killed the tags concept for lists entirely
  (was Google-copying; no felt value). Save-sheet toolkit = NOTE only.
  ⚠️ Schema cleanup: drop the FavoriteListItem.tags column landed in the
  images step-5 work. ("Tags" survives ONLY as the unrelated
  restaurant-profile mention-aggregate concept, §8.4.)
- SEARCH-WITHIN-A-LIST: dead too (owner call).
- PER-ITEM NOTES: shown on the list item card BELOW the photo strip row.

### 8.2 THE UNIVERSAL SHARE MODAL (new primitive — "a glorified modal")

One share surface, invocable from anywhere, for every shareable object:

- Objects + their deep-link behavior: LIST; RESTAURANT (card/profile —
  same thing); DISH card (opens the restaurant profile auto-scrolled/
  deep-linked to that dish — there is no dish profile); POLL; COMMENT
  (opens the poll scrolled to + highlighting that comment); USER PROFILE.
- Layout: a beautiful PREVIEW of the share package exactly as the
  recipient will see it, then context-dependent options (e.g. "invite as
  collaborator" checkbox ONLY when sharing your own list — checked =
  recipient joins as collaborator, unchecked = view-only), then
  destinations: Crave DMs + friends (sorted by THE universal closeness
  sort — one algorithm reused everywhere, assistant to design), then
  external targets: iMessage, Instagram (stories + DMs), WhatsApp,
  Telegram, X, email, Messenger, Snapchat, TikTok (posts + messages),
  LinkedIn, Facebook (feed + stories) — as exhaustive as the platform
  APIs allow; a RESEARCH PASS on each platform's share API is owed.
- The share PACKAGE (per object type: ranked-preview cards for lists,
  etc., adaptable to stories formats / link previews / the web landing
  page with get-the-app CTA): build the plumbing + a crude package now;
  the beauty pass is explicitly deferred owner-in-loop work. The web
  landing IS this package rendered at /l/{slug} — same investment.

### 8.3 Poll modals (reconciled)

- KEEP: pollInfo (the ⓘ "how polls work" explainer), marketPicker (a
  poll must belong to a city market — this picks WHICH city you're
  posting the poll into when it isn't your current one; pollCreation
  currently shows a placeholder message instead), duplicatePoll (the
  "this poll already exists" catch — checkPollDuplicate is wired, needs
  its sheet).
- DROPPED: the axis-inference confirm chip ("did you mean dish X?") —
  resolve the subject server-side, don't ask the user. Unresolved-dish
  subjects are ALREADY handled by design: dish-axis poll subjects are
  poll-local composite keys (no live entity writes); the close-time
  graduation/collection pass links — or creates via the pipeline — the
  entity later. No new machinery needed; verify at build.

### 8.4 Restaurant profile — full section anatomy (supersedes the sketch)

FOUR segmented views: **Overview / Dishes / Discussions / Photos**.

- OVERVIEW (best-of composite; EVERY element links to its full view):
  your/collaborators' saved NOTE for this place (if saved) → top ~5
  dishes → the Crave Score → (test) AI summary fed by top comments +
  top dishes → MENTION TAGS → top 3–5 discussions + "see all". Tapping
  any dish → Dishes view; any tag or "see all" → Discussions view.
- MENTION TAGS (the new, unrelated-to-lists "tags"): aggregated counts
  of entities mentioned across the restaurant's discussions — dishes,
  restaurant attributes, dish attributes. On Overview they render as a
  collage and act as LINKS into Discussions; inside Discussions they are
  MULTI-SELECT opt-in filters (select many; results sorted by votes).
- DISCUSSIONS view: score up top (+ maybe a simple visual metric
  explainer, + the AI summary if the test works) → tags COLLAGE (not a
  scroll strip) → the discussion list with a toggle strip = SORT ONLY
  (Top votes | Newest) + a SEARCH BAR over the discussions (search is IN
  here, unlike lists).
- DISCUSSION CARDS: each card = a vote-comment framed by its poll
  question (faint context line) so everything reads as organic mentions,
  never reviews. THREAD-MERGE RULE: replies that are themselves
  vote-comments for this restaurant render NESTED inside the same card
  (one thread-slice), skipping non-vote intermediate comments; e.g.
  "best vegan food" + its reply "and the best tofu" = one card, reply
  indented. Username/avatar shown (another userProfile entry point).
  Tap card → pollDetail scrolled to + highlighting that comment.
- ⚠️ SEMI-FOUNDATIONAL: pollDetail must be openable from ANY context
  (today it's polls-page-reachable only) with correct back-to-origin —
  "an orphan that is also not an orphan." Route to the charter owners
  with the other two flags.
- DISHES view: streamlined ranked dish list (rank, name, DISH scores,
  photo strip per dish) — deliberately NOT the results renderer (no
  restaurant metadata, no open-times).
- PHOTOS view: the gallery with its selector row (dish slices ranked,
  latest, other) as previously locked.

### 8.5 Blank search state: EXISTS (recents + recently viewed). Optional

add: market-scoped TRENDING searches/entities above them — park unless
cheap during the wave.

### 8.6 Report + block

- Every photo carries an ellipsis → shared modal with "what's wrong"
  reasons → report (feeds the existing report/auto-hide pipeline).
- Other users' profiles carry an ellipsis → includes BLOCK (the Apple
  1.2 UGC requirement). Block semantics to spec with messaging design.

### 8.7 Auto-created default lists + the automated-lists call

- AUTO-CREATED at signup, start empty, pinned top: restaurants side =
  Been + Want to go; dish side = Tried + Want to try (copy TBD).
- The "For You" automated-lists section (by city/market, cuisine, price)
  is ON HOLD — owner reasoned they're reachable as All + filters.
  Instead: add a MARKET filter toggle to the All list's strip. Revisit
  automated lists post-data.

### 8.8 The save sheet (add-to-list) — final shape

- Dynamically TWO-SIDED: opens on the side matching the trigger (dish
  card → dish lists; restaurant → restaurant lists) with a one-tap
  segmented switch to the other side always available.
- ROWS, not grid tiles (the note field sits under the selected row).
- Row order = the user's custom home order if set, else the home default
  (Recently updated).

### 8.9 Push-permission moment: after the user's first CONTRIBUTION —

first poll vote ("get notified when results land" = the canonical ask),
a photo posted publicly, or the first DM sent (reply notifications make
it self-evident). Never at first launch.

### 8.10 Hard-paywall supersede note for favorites

favorites.md's internal free-vs-Crave+ split (dish lists gated, list
filters gated) predates gate-everything: at launch every in-app user is
entitled, so those gates are DORMANT freemium-pivot framing, not launch
behavior. Keep the machinery mothballed; don't build per-feature gating
into the new list surfaces.

### 8.11 Edit mode — refined interaction spec (owner, 2026-07-11)

Applies to BOTH the list home and list detail. The toggle strip IS the
edit chrome:

- Strip layout: sort toggle, Restaurants|Dishes, the rest. When the user
  selects CUSTOM in the sort toggle, an EDIT toggle slides in smoothly
  immediately LEFT of the sort toggle (auto-scroll the strip to reveal
  it; implementation free to choose always-mounted-but-hidden vs
  animated insert — the feel is what's specced).
- Tapping Edit: the whole strip slides right out of view, revealing the
  EDIT-MODE strip: Cancel (left) · Undo · Redo (middle) · Save (right).
  Simultaneously the sheet auto-glides to the TOP snap if not there.
  Getting these two animations right = the polish of the feature.
- In edit mode: every row's ellipsis icon is replaced by a grab-handle
  icon; rows reorder LIVE as you drag (items shuffle around the finger).
  List scrolling still works; sheet swipe-down is disabled but
  RUBBER-BANDS (resists with a bounce rather than dead-stopping).
- Explicit commit: Save persists the new order; Cancel discards; Undo/
  Redo step through moves.
- ⚠️ OPEN interaction detail (assistant flag): "whole row = grab handle"
  conflicts with list scrolling — both are vertical gestures, so
  direction can't disambiguate. Options: (a) handle icon = instant drag,
  row body = scroll (industry standard), (b) whole row lifts after a
  short press-and-hold (~0.3s, iOS Reminders style), (c) both. Owner to
  feel-test; recommendation = (c): handle drags instantly, row body
  long-presses to lift, scroll everywhere else.
- The accessibility non-drag path (move up/down/top) still ships.

### 8.12 Profile Lists view + GPS flow — two calls

- PROFILE LISTS (viewing someone's lists on their profile): NO toggle
  strip (a lonely single toggle looks empty; a full strip is overkill
  for casual browsing). Shape: OWNER-PINNED lists first (pinning = a new
  small owner control, fits profile-as-curated-identity), then
  chronological; each list tile carries a small Restaurants/Dishes badge
  instead of a type toggle. Revisit a strip only if real volume proves
  painful.
- GPS-from-photo: PARKED. The locked profile add flow is
  restaurant-first (search → pick → photos), so GPS grouping has no
  moment. Recorded v2 shape if ever revived: a photos-first variant of
  the profile entry where GPS pre-groups picks by suggested restaurant;
  or a one-tap "looks like {nearby restaurant}?" prefill chip above the
  search step. Not v1.

### 8.13 marketPicker DELETED; poll market = map-resolved (owner, 2026-07-11)

A poll's market is resolved from where the user's MAP currently is — no
picker, no screens. Posting to another city = pan the map there first,
which is self-consistent (the map is the app's market lens: you SEE the
poll land where you're looking; a picked-but-not-viewed market would
post it somewhere invisible). The poll-create page shows a display-only
"Posting to {market}" label from the resolver (fallback: nearest/home
market when hovering nowhere). duplicatePoll stays and is just the
shared modal. Poll modal set is now: pollInfo + duplicatePoll.

### 8.14 Profile lists FINAL + viewer list-detail + drag semantics (owner, 2026-07-11)

- PROFILE LISTS (locked): pins + type badges, NO strip; middle step for
  volume = CITY HEADER GROUPING (pinned float above groups); named
  upgrade path if that fails = a strip of City + Restaurants|Dishes
  only. Tags-on-tiles idea considered and dropped (tiles too busy; city
  grouping answers it spatially).
- OWN-PROFILE tile editing: LONG-PRESS any list tile → shared modal:
  **Pin/Unpin · Share · Delete** (in that order). The editProfile PAGE
  stays minimal: name, bio, picture (+ future fields) — pinning lives on
  the tiles, not in editProfile.
- VIEWER'S LIST DETAIL (opening a list from someone's profile): YES to a
  toggle strip — it's the SAME strip component as the owner's list
  detail, role-gated: viewers get **Sort** (default = the owner's custom
  ranking when one exists — their opinion IS the artifact; plus Best/
  Crave-Score and Recently added — flipping between "their take" and
  "the canonical truth" is a core delight) + the item FILTERS (open now,
  price). NO edit toggle, no add buttons, no collaborator affordances
  (those appear only for owner/collaborators). One component, two roles.
  Strips belong where ITEMS get sliced (list detail, for everyone);
  the list-of-lists gallery stays strip-free.
- DRAG SEMANTICS confirmed: movement within the first ~0.3s = scroll;
  stillness through 0.3s = lift (row body); handle icon lifts instantly.
  During a drag: rows shuffle live around the finger (animation quality
  is a named polish target) and dragging to the list's top/bottom edge
  AUTO-SCROLLS the list.

### 8.15 City grouping mechanics + why own-favorites keeps its strip

- CITY GROUPING (profile Lists view, volume answer): lists render under
  city section headers (Pinned floats above as its own area). A list's
  city derives from its items' market(s): majority market wins;
  genuinely multi-city lists land under "Multiple cities"; empty lists
  under the newest group. Grouping ACTIVATES only at 2+ cities — a
  single-city profile stays flat (one header would be noise).
- OWN FAVORITES HOME: the strip STAYS (unchanged decision). The rule:
  surfaces where YOU work get controls (R|D toggle, sort, All/Mine/
  Shared, custom drag order, the All list); surfaces where OTHERS browse
  your identity get curation + passive structure (pins, badges, city
  headers). Auto city-groups are NOT applied to the own home — they
  would fight the user's custom drag order (two competing orderings; the
  user's own hand always wins on their own surface).
