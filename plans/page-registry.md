# Page Registry — the app's full page inventory + navigation contracts

**Status:** decided 2026-07-05 (owner-blessed decisions inline). This is step 1 of the
sequencing: page inventory → source-agnostic search flow → toggle primitive extraction.
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
- Stub order when building: `userProfile` → `listDetail` → `notifications` → `settings`/
  `editProfile` → modals (each stub = key + leg + skeleton + header, no body).
