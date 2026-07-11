# Restaurant Profile Page

> **Rolling canonical vision — not a changelog.** Keep this file thin and _current_: it describes
> only what we want this area of the app to be **today**. When something changes, edit or delete the
> old text in place — never append "superseded"/"old"/"previously" notes, history, or pointers to
> past ideas. If you follow this file, you know exactly what we want. Execution detail + migrations
> live in `plans/`; business/gating rationale lives in `business/`.

---

The restaurant profile (the detail surface in `apps/mobile/src/overlays/panels/RestaurantPanel.tsx`) is where Crave's objective ranking becomes one concrete decision: "is this place good, and what should I order here." A user lands on it after tapping a restaurant result, map pin, or favorite. The page is ONE dynamic single page with four segmented views — **Overview / Dishes / Discussions / Photos** (registry §8.4; SHIPPED W3, registry run, incl. mention tags + thread-merged discussion cards → pollDetail; visuals crude pending the design pass).

The hard frame: the **objective ranking + restaurant basics are FREE** — this is the trust/word-of-mouth engine and the integrity promise, so the page never blurs or locks the answer to whether a place is good. The **dish intelligence layer is the paid hero (Crave+)**. **Discussion stays FREE.** The Crave Score is global and objective; nothing on this page re-ranks to user taste.

## The free core

- **Crave rating card** — the restaurant's global Crave Score as the lead metric, with a tap-to-explain tooltip ("looks at the top dishes, overall menu consistency, and general praise").
- **Score evidence / receipts** — a "Based on N polls with M votes" row near the rating so the score is auditable, not a black box, plus the highest-scoring recent community quotes that drove it, with attribution ("u/handle on r/austinfood, 2 days ago, 67↑") and a "Join conversation" deep-link to the source thread. This evidence-based transparency is core to "beats Google." A basic teaser is free; the deep evidence trail is part of the paid "why."
- **Price & hours** — price level rendered as `$`–`$$$$`, and an "Open until {time}" / "Closed until {time}" status summary, with full weekly hours per location in the expanded card. Backed by Google Places.
- **Quick actions** — Website, Call, Directions (Maps/Apple Maps), and native Share. Order and reservation links (delivery, OpenTable) are free utility actions as integrations land.
- **Save / favorite** — a heart toggle in the header, plus save-to-list (the restaurant or a specific dish) into named, public-shareable lists. Power filters/sort on your own lists is a paid lever.
- **"Known for" pills** — top restaurant entity signals (foods, attributes, categories, vibe like `birria 3`, `patio 8`, `brunch 6`) as tag pills with mention counts, sourced from `core_restaurant_entity_signals`. Captures non-menu evidence without fabricating fake dish rows. Synthesize the dominant tag into a one-line header descriptor ("Known for tacos"). Pills can group by type once volume justifies it.
- **Rising / momentum badge** — a continuous heat-surge indicator (mentions arriving faster lately than the place's own baseline) on the restaurant and on hot dishes in the list.

## The dish list — the paid hero (Crave+)

The dish list ("Menu highlights," ranked by dish score) is the differentiated, every-meal value and the conversion surface.

- **Locked-but-visible teaser** — show the genuine free top-N dishes (the real top dishes by score, never a degraded teaser), then a blurred continuation of the full ranking with a Crave+ unlock CTA. Never fully hide the section — visible-but-locked converts; hidden reads as "they took the answer away."
- **Depth behind the wall** — the full ranking beyond top-N, and per-dish detail (score breakdown, evidence) are Crave+.
- **Dish row evidence** — each dish shows Poll count + Total votes (cheap, free); a top community quote / "raved about X times" inline is part of the paid "why."
- **Never lock the restaurant answer** — gate dish DEPTH only. Hiding the best results of an objective ranking is the #1 "feels like a scam" trigger, so the top-N restaurants are never paywalled.

## Friend signals

When people you follow have ranked or saved this place, their take surfaces here as the shared **FriendCluster** — stacked overlapping friend avatars + "Saved by {name} and others" (named friend = highest-affinity; tap to expand). An explicit, visually-distinct overlay that never alters the objective Crave Score (full design in `profile.md`).

- **Restaurant-level (free):** the cluster near the header / "Known for."
- **Dish-level (rides with the dish layer):** on a dish card, "Saved by Sarah and others" (and "Sarah ranks this #2 on her Tacos list" on expand). Since dish detail is the Crave+ layer, dish-level signals travel with it; restaurant-level signals stay free.

## Discussion section (FREE)

The bottom-most section of the profile — **called "Discussion," not "Reviews."** It aggregates _every comment/mention linkable to this restaurant or its dishes_ across polls and threads into one place: our reviews surface, but real sourced discussion (the same graduation/collection linkage that feeds the Crave Score), not star reviews.

- **Tap a mention → deep-link straight to that poll's detail page**, opening directly to where the mention occurred so the user can read the surrounding context.
- **Filter / sort** — sort by votes/likes on the comment; filter by tags (the restaurant entity signals); text-search within this restaurant's comments only.
- **Static highlighting** — highlight words matching the user's search terms and/or the tapped tag(s) so the relevant bit jumps out.
- **Dishless restaurants** are a contribution hook: an "add a dish / start a poll" CTA turns an empty profile into a free contribution surface.

Discussion and tags stay free forever (cheap to serve, feeds the secondary flywheel) — this free "reviews" surface is also the slow taste that drives the paid dish layer.

## Multi-location & identity

One business identity is unified by trusted official root domain (e.g. Chipotle across Austin/Houston = one entity with shared stats). The profile shows only active-market locations by default, as collapsible per-location cards (address, phone, weekly hours, per-location website). Display-location priority: active-market primary → active-market nearest → entity primary fallback. The Website button collapses to one when all locations share a URL and shows per-location rows when they differ. A profile may show "3 locations here · N nationwide" via an optional total-location count.

## B2B / claimed profiles (Phase 2 — never touches ranking)

Post-density, restaurants can claim their profile to feature select community quotes, highlight verified favorites, and surface promotions — and there is owner-facing mention/sentiment/dish-performance analytics as a paid B2B tier. This is never injected into the ranking (no pay-to-rank, ever). Eater-pays subscription is the launch revenue; B2B is the larger long-run pool, held for later.

## Still to decide

- The exact free top-N dish cap (3? 5?) and how the locked continuation presents (blur + hidden-count, single CTA row, etc.).
- Where the line falls on score evidence: a free basic "Based on N polls/M votes" + quotes teaser with deep receipts gated, vs. the whole evidence section as a Crave+ teaser.
- How polls/discussion are scoped to a restaurant (per-restaurant lane vs. dish-level polls vs. city polls), and that section's exact placement relative to the dish list.
- Whether dishless-restaurant "add a dish / start a poll" CTA is in scope for launch.
- Whether to show a "N nationwide" total-location count or keep market-only to avoid location sprawl.
