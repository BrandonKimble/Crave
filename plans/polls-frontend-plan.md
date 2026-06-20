# Polls Frontend — Redesign Plan (DISCUSSION DRAFT)

> Builds on `sheet-v4-foundation-plan.md` (the sheet foundation lands first). This plan is the
> from-scratch polls UI on the **current backend model** (comment + endorsement + leaderboard +
> close-time graduation). Goal: world-class, on-brand, click-into-a-poll like a Reddit post.

## Reality check (why this is near-greenfield)

The current mobile poll UI (`PollsPanel`, `services/polls.ts`) is **broken against the live
backend** — it still calls the **deleted** vote endpoints (`POST /polls/{id}/votes`,
`/options`) and renders option bars / vote casting. The whole live model — comment threads,
gazetteer-highlighted comments, the endorsement leaderboard, close-time graduation — has **zero
frontend**. So we rebuild the data layer and the UI, keeping ~nothing.

## On-brand vocabulary (reuse exactly)

- **Type**: 4 sizes via `<Text variant>` — title 22 / subtitle 18 / body 14.5 / caption 13; weights
  regular(400) / semibold(600). `constants/typography.ts`.
- **Frosted + cutouts**: `FrostedGlassBackground` (intensity 45, light tint) + SVG-mask header
  cutouts (`OverlaySheetHeaderChrome` — circular holes punched to the frosted layer; grab-handle +
  badge cutouts). Reuse the header-cutout pattern for the poll sheet + poll detail headers.
- **Color/tokens**: primary pink `#e91e63`; `theme.ts` spacing (4/8/16/24/32), radius (8/12/16),
  shadows. **Exemplars to match**: `restaurant-result-card.tsx` (card rhythm), `RestaurantPanel.tsx`
  (sheet header + tabbed sections), `CraveScoreText` (color-graded metric).

## 1. Data layer rebind (`services/polls.ts` overhaul)

Replace the vote-model client with the live one:

- **Remove**: `PollOption`, `voteCount`, `addPollOption`, `voteOnPoll`, `consensus`.
- **Add** (bind to live endpoints):
  - `fetchPolls` / `fetchPoll` (exist) — but drop `options`, add `state`/`closedAt`/`graduatedAt`,
    market, axis/topic.
  - `listComments(pollId, sort)` → `GET /polls/:id/comments` (returns `entitySpans` for highlights).
  - `postComment` / `editComment` / `deleteComment` → the comment CRUD.
  - `toggleCommentLike` → `POST /polls/comments/:id/likes`.
  - `fetchLeaderboard(pollId)` → `GET /polls/:id/leaderboard` (ranked `entity` subjects +
    `distinctEndorsers`).
  - `createPoll` — rebind to question + axis + market (no options).
- Types mirror the backend DTOs (comment shape incl. `entitySpans: EntitySpan[]`, leaderboard entry
  `{subjectType, subjectId, distinctEndorsers, rank}`).

## 2. UX structure

### A. Poll sheet (a **nav** sheet → nav bar visible)

- **Header**: market context ("Polls in {Market}") with the live badge (`pollsHeaderVisuals`).
- **Active polls — highlighted at the top**: segmented/standout treatment, with a simple-but-creative
  "alive" signal (e.g. a soft pulsing live dot / accent rail — tasteful, not loud). These close on a
  cadence (`POLL_AUTO_CLOSE_DAYS`), so surface "closes in N days".
- **Historical below**: clearly closed (muted, "closed · {date}"), grouped by week.
- **Filter**: by axis/topic type and state (active/closed) — clone the search filter-toggle styling.
- **Sort**: none for now (decided 2026-06-19) — recency / active-first: active polls in order, then
  previously-active in order. No user-facing sort control.
- Cards: question (subtitle/semibold), axis + market (body), participation (caption: N comments · N
  endorsers), top-1 leaderboard preview ("leading: {entity}") for a hook.

### B. Poll detail (Reddit-style **click-into-its-own-page** — FLAT content-swap, the one-sheet ethos)

Tap a card → the sheet's CONTENT swaps to a `pollDetail` scene, **exactly like restaurant-profile
swaps in over search results** (NOT a nested push). Confirmed by the audit: scenes are pre-mounted
and swapped by visibility, the sheet never unmounts, and the hidden polls-list scene keeps its scroll
position — so "back" is a free swap back to the list. Content picks the snap target on switch; the
sheet owns the snap rules. Nav stays visible. Sections:

- **Header**: question + axis + market + state ("live · closes in N days" / "closed {date}").
- **Leaderboard (the projection — "what's winning")**: ranked entity rows (rank badge in pink,
  entity name, `distinctEndorsers`), tappable → restaurant/dish profile. This is the payoff of the
  whole endorsement system and is currently invisible — make it the centerpiece.
- **Discussion thread**: comments (nested replies, indented), each with:
  - **entity-highlighted tappable spans** (from `entitySpans`) → deeplink to the restaurant/dish.
  - like button (heart) + count; author; relative time; edit/delete on own.
  - compose box (compose + reply); posts via the rate-limited endpoint.
- **Empty/early states**: "Be the first to weigh in", live-tally disclaimer ("finalizes when the
  poll closes").

### C. Create flow (rebind)

Rebuild on the live model: question + inferred/explicit axis + market; **no options/votes** — the
discussion _is_ the contribution. Keep the existing template/autocomplete field UX where it still
fits; drop everything vote-shaped.

## 3. Polls in the search bar (autocomplete poll lane)

Net-new, **both** layers (corrects the earlier "already done" recollection — it isn't):

- **Backend**: add a `poll` result type to `AutocompleteMatchDto` + a poll lane in
  `mergeAutocompleteLanes` (match poll questions; rank with the entity/query lanes).
- **UI**: add a **poll icon** (reuse the nav-bar poll icon) to the suggestion-row icon switch
  (`SearchSuggestions.tsx:224`); tap → open the poll detail (route through the polls overlay's
  `pushDetail`). Title = poll question for now.

## 4. Nav rule

Poll sheet + poll detail = **nav visible** (per your call, "for now"). Encode via Sheet V4's
nav-visibility authority (kind = `nav`), not bespoke logic.

## 5. Features you may be missing (the "look around" ask)

- **Leaderboard subject granularity**: dish-axis polls endorse `(restaurant, dish-category)`
  Connections; restaurant-axis endorse restaurants. The leaderboard rows must render the right
  subject label + deeplink. (Backend already models `entity` vs `connection` subject types.)
- **Real-time**: `PollsGateway` already emits `pollUpdate` — wire the detail page to live-refresh the
  thread + leaderboard (comments/likes appear without manual refresh).
- **Market-scoping**: polls are market-scoped; the sheet must reflect the user's current market
  (same resolver as search). Out-of-market → "no polls here yet · create one".
- **Contribution identity / "you"**: show "you commented / you endorsed" state; profile already has a
  `ProfilePollCard` (created/contributed tabs) to rebind.
- **Moderation/abuse on comments**: report action on comments; comments are sync-moderated on post
  (Gemini) — surface rejection feedback.
- **Pagination/virtualization**: polls "can get extensive" — long threads + many polls need
  FlashList virtualization (the sheet core already provides it) + comment paging.
- **Share** a poll (deep link).
- **Graduation transparency** (optional/nice): once closed + graduated, the leaderboard is final +
  fed real evidence; a subtle "results finalized" state.

## 6. Decisions (RESOLVED as lead — build to these)

- **Sort**: none; recency / active-first (active polls in launch order, then closed by recency).
- **Active "alive" treatment**: a **thin pink accent rail** on the card's leading edge + a quiet
  `live · closes in Nd` caption. No pulsing dot, no pill, no animation. Closed cards: no rail,
  muted `closed · {date}` caption. Clean/elegant, not loud.
- **Leaderboard depth**: **card** shows the single top row — `Leading: {entity} · {n} endorsers`
  (the hook). **Detail** shows the full ranked list; if > 8 rows, show top-8 + a "see all N" expander.
- **Comment sort**: default **top** (by `score`), with a quiet top/new segmented toggle in the
  thread header. (`listPollComments(sort)` supports both.)
- **Detail page**: flat content-swap to a `pollDetail` scene (one-sheet ethos, like restaurant
  profile) — NOT a nested push, NOT a separate overlay. Declares `initialSnapPoint: 'expanded'`
  (snap-on-swap is already supported per Sheet V4 — no framework change).

## 7. Build-ready breakdown (component tree · scenes · hooks · styling)

**Scene registration** (`navigation/runtime/app-overlay-route-types.ts`): add `pollDetail` to
`APP_OVERLAY_ROUTE_METADATA_BY_KEY` — `role: 'child'`, `parentSceneKeys: ['polls']`,
`chromePolicy: 'searchChrome'` (nav stays visible, per NAV_SHEET_VISIBILITY_MAP). Open via the
scene-switch to `pollDetail` carrying the `pollId`; back = switch to `polls` (list scene stays
mounted → scroll preserved). An `openPoll(pollId)` action mirrors `openRestaurantProfilePreview`.

**Data hooks** (bind to the live data layer, already built):

- `usePollFeed()` — wraps `fetchPolls` + the bootstrap cache (exists); splits active/closed.
- `usePollDetail(pollId)` — `fetchPoll` + `fetchPollLeaderboard` + `listPollComments(sort)`; subscribes
  to `PollsGateway` `pollUpdate` to live-refresh thread + leaderboard.
- `usePollCommentMutations(pollId)` — `postPollComment`/`editPollComment`/`deletePollComment`/
  `togglePollCommentLike` with optimistic update + rollback.

**Component tree:**

- `PollsSceneBody` (list): `PollListHeader` (market + live badge), section list → `PollCard`
  (question, axis·market, `live · closes in Nd` rail, participation caption, leading-entity hook),
  active section then closed-by-week. FlashList-virtualized.
- `PollDetailSceneBody`: `PollDetailHeader` (question, axis, state) → `PollLeaderboard` (ranked
  rows, pink rank badge, name + `n endorsers`, tappable → restaurant/dish profile) → `PollThread`
  (top/new toggle; `PollComment` rows: nested indent, `EntitySpanText` tappable highlights, like
  heart + count, author/time, edit/delete own) → `PollComposer` (compose/reply, rate-limited).
- Empty/early states: "Be the first to weigh in" + "live tally · finalizes when the poll closes".

**Styling (reuse exactly):** `<Text variant>` 4 sizes; `FrostedGlassBackground` + `OverlaySheetHeaderChrome`
cutouts for both scene headers; pink `#e91e63` (rank badge, accent rail); `theme.ts` spacing/radius;
match `restaurant-result-card.tsx` card rhythm + `RestaurantPanel.tsx` header.

**EntitySpanText:** render `comment.body` with `entitySpans` as inline tappable segments → `openPoll`'s
sibling deeplinks (`openRestaurantProfilePreview` for restaurant spans; entity-scoped search for food).

## 8. Build order (after the device renders + Sheet V4 minor-verify)

0. **Seed realistic live-model poll data** (polls + threaded comments w/ entitySpans + leaderboard)
   so the UI is verifiable — the polls table is currently empty.
1. ✅ Data rebind (`services/polls.ts`) + types — DONE (28e180dd).
2. Poll list scene (active/historical + filter + cards).
3. Poll detail scene (leaderboard + thread + highlights + composer) — the core.
4. Autocomplete poll-lane UI (poll icon in `SearchSuggestions` + `openPoll` route) — backend DONE.
5. Create-flow rebind (question + axis + market; no votes).
6. **Sweep the dead vote model** (`PollsPanel` + vote runtimes + `services/polls.ts` vote exports +
   `ProfilePanel`/profile vote display) once the new UI replaces it.
7. Real-time + profile rebind + polish (empty states, share, report).
   Each UI step: verify on device + a maestro flow where it touches sheet motion/perf.
