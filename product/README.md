# `product/` — Canonical Feature Vision

One file per area of the Crave app. Each file is the **current, canonical vision** for that area —
what we want it to be — not a backlog, log, or history.

- **`PRD.md` / `BRD.md`** (repo root) = the original v3 spec. Stale — superseded by these files. Don't cite them.
- **`plans/`** = concrete _execution_ plans + migrations (technical, sequenced).
- **`product/`** (this folder) = the thin, current vision per area; `business/` holds the gating/monetization rationale.

## The rule (every file states it at the top)

- **Rolling canonical vision, not a changelog.** Keep each file thin and _current_: it describes only
  what we want the area to be today. If you follow it, you know exactly what we want.
- **Edit and delete in place.** When something changes, change the text — never append
  "superseded"/"old"/"previously" notes, status logs, or pointers to past ideas.
- **No provenance/status scaffolding.** Don't tag lines with sources or `shipped/idea/planned`. State
  the vision; if "today vs. wanted" matters, say it in a line of prose.
- **Read the area's file before building in it; update it as the vision changes.** Execution detail goes in `plans/`.

## Files

| File                                           | Area                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| [favorites.md](favorites.md)                   | Favorites & lists (incl. the auto "All" list + cross-list intelligence)         |
| [notifications.md](notifications.md)           | Notifications & alerts (incl. quality "movement alerts")                        |
| [profile.md](profile.md)                       | User profile & social graph (usernames, followers, activity tabs)               |
| [polls.md](polls.md)                           | Polls (creation, feed, discussion, graduation into the Score)                   |
| [restaurant-profile.md](restaurant-profile.md) | Restaurant detail page (dish list gate, discussion, score evidence)             |
| [search-and-dishes.md](search-and-dishes.md)   | Search, dish ranking + dish-level search, result sheet, filters                 |
| [map.md](map.md)                               | Map surface (LOD, markers, map-based UX ideas)                                  |
| [images.md](images.md)                         | Photos/UGC: post funnel, strips, galleries, moderation                          |
| [messaging.md](messaging.md)                   | DMs (inbox + sessions; shipped W3 of the registry run)                          |
| [sharing.md](sharing.md)                       | Universal share modal + the share package (shipped W3; beauty pass owed)        |
| [scoring/](scoring/)                           | The Crave Score — what it means + how to tune the ranking when real data exists |

## Anchoring decisions (true across every area)

- **The Crave Score ranking is OBJECTIVE and global — never personalized to user taste.**
  Taste enters Crave only two ways: the user _searches_ (e.g. "vegan"), or the user builds
  their own _favorites lists_. There is no preference-based re-ranking, ever.
- **Monetization at launch is a HARD paywall** (owner final, 2026-07-09): everything is gated;
  every in-app user is entitled. The freemium split described across these files (free =
  objective restaurant ranking/search/map/filters/polls; Crave+ = the **dish** intelligence
  layer, rising/trending, power list filters) is the **dormant pivot framing** — keep the
  machinery mothballed, don't build per-feature gates into new surfaces. See
  [`../business/monetization-and-gating.md`](../business/monetization-and-gating.md).
- **Gating principle:** gate what Google/Yelp/Beli structurally _can't_ do; keep free the
  things they do (we just do them better — the free tier is the "this app is good" taste).

## The Page Foundation (true across every area — current AND future pages)

Every page in the app is built from the same eight foundation pieces; a new feature
page is not designed/built until each has an explicit answer: (1) persistent header,
(2) frost + white plate with cutout support, (3) cutout skeleton, (4) the shared
toggle/filter strip (never hand-rolled), (5) snap-point rows in the motion table,
(6) child-page nav-out (canon: `laneKind: child` ⇔ the nav transitions out),
(7) the shared no-bounce scroll container, (8) the failure/offline standard.

The engineering home for the standard is
`apps/mobile/src/navigation/runtime/ADDING_A_SCENE.md` §5; the hardening work queue is
`plans/page-foundation-codification.md` (compile-time enforcement so a new page
CANNOT silently skip a piece).

**The failure/offline standard (owner spec, 2026-07-08 — applies to every surface):**

- **Offline = the universal hang.** Navigate freely; loaded content stays; anything
  new hangs in its skeleton; the black system banner explains; back-out always works;
  reconnect auto-resumes. NO per-surface offline UI, ever.
- **Online failure = THE one modal.** "Something went wrong / …Please try again." with
  a single OK button; every close path (button, swipe, backdrop) is identical: return
  the user to the last state that worked. The modal never auto-retries. A failed
  page-ENTER unwinds to the exact origin (page + snap + scroll) via the surface's
  self-guarding unwind; a failed action over a working page unwinds nothing.
- **No bespoke failure copy, inline retry buttons, toasts, or `Alert.alert` anywhere.**

**PRE-LAUNCH GATE (required):** before launch, walk EVERY page — including any feature
pages added between now and then — through the failure matrix: (a) offline enter →
hangs in skeleton + banner, back-out works, reconnect resumes; (b) online enter
failure → modal → dismiss returns to exact origin; (c) online action failure over a
loaded page → modal → dismiss leaves the page intact; (d) mutation failures announce
(nothing silent). A page ships only when all four pass on the sim/device. New pages
inherit this gate automatically — it is part of what a page IS in this app.
