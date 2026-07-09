# Search, Dishes & Result Sheet

> **Rolling canonical vision — not a changelog.** Keep this file thin and _current_: it describes
> only what we want this area of the app to be **today**. When something changes, edit or delete the
> old text in place — never append "superseded"/"old"/"previously" notes, history, or pointers to
> past ideas. If you follow this file, you know exactly what we want. Execution detail + migrations
> live in `plans/`; business/gating rationale lives in `business/`.

---

This is the engine: structured and natural-language search, autocomplete, filters, the dual result sheet (restaurants + dishes), the dish-level ranking that is the paid hero, candidate generation with progressive relaxation, and the result-sheet transition. The Crave Score ranking is **objective and global** — never personalized to taste. Monetization is **freemium**, and the entire DISH intelligence layer is the Crave+ hero. We gate what Google/Yelp/Beli structurally can't do; we keep free what Google does (we just do it better).

- **Free:** the objective restaurant ranking, structured/keyword search, autocomplete, the map, open-now/price filters, restaurant-detail basics (top-N dishes), poll voting + discussion, create/share favorites lists.
- **Crave+:** dish ranking/scores, dish-level search, the full dish list beyond top-N, natural-language/semantic search, rising/momentum + trending, the score-evidence "why," and power filters/sorts on favorites lists.

## Core search architecture

Every non-venue-specific query returns **two score-ranked lists** — a dish list (connections) and a restaurant list. A single list (one restaurant scoped to its menu) appears only when the query is restaurant-only with no food/attribute; a restaurant used as a filter alongside other entities still returns the dual list.

Queries resolve to four entity types — restaurants, food, food_attributes (spicy/vegan/crispy, connection-scoped), restaurant_attributes (patio/romantic, venue-scoped) — plus bounds/openNow/price/min-votes filters. Entity composition deterministically picks the return format. The contract is `POST /search/run` (resolved `entities`, `bounds`, `openNow`, `risingActive`, `pagination` → `format`, `plan`, `food[]`, `restaurants[]` with `topFood`, `matchEvidenceType`, `matchedTags`, `hasMenuItems`, `craveScore`).

Results are **score-ranked, never a relevance sort** — relevance is a property of candidate generation (which rows are eligible), not a separate ordering. Restaurants order by restaurant score, dishes by dish/connection score. The **map viewport is the location filter**: visible NE/SW bounds filter restaurants before ranking via the geo index, no text location parsing, and the same query feeds the list and the map pins.

## Structured vs natural-language search

Two entrypoints. Structured/keyword search (name, cuisine, food/restaurant attributes) is cheap, **free**, and never metered — it's the word-of-mouth engine. Natural-language/semantic search (LLM interpretation + pgvector embeddings) costs an LLM call per query and is the **Crave+** magic. If we meter it, free users get a few NL searches a day before the Crave+ prompt (the Perplexity/ChatGPT pattern) — a soft degrade, never a blank wall.

A **deterministic fast path runs before the LLM**: exact restaurant-name, single-token food/entity, exact-attribute, and short noun-phrase queries bypass it entirely. The LLM is only invoked for multi-clause, ambiguous, conversational, or mixed-intent text, and returns entities by type (`normalized_name`, `original_text`, resolved `entity_ids`) plus location_bounds, open_now, and user_context.

## Candidate generation & progressive relaxation

- **Multi-branch union.** Entity-ID evidence (food_id / categories / attributes / restaurant IDs) is unioned with text-evidence ID expansion, then score-ranked.
- **Hard eligibility gates.** A dish result must be a real connection row. A restaurant result requires ≥1 connection in our dataset — name match alone is never enough. We never surface attribute-only results that lose the primary entity (no "spicy-only" for "spicy taco").
- **Progressive relaxation.** Try strict (primary + all modifiers) first; if page-1 strict is below ~10, relax modifiers (drop attributes) while always preserving the primary food/restaurant target. With both attribute types present, pick the single-drop stage with the higher `min(dishCount, restaurantCount)`.
- **Sectioned page 1.** "Exact matches" (strict, up to 5, "show more" for 6–9), then "Broader matches" (relaxed-only, deduped), both score-sorted, with the explanation baked into the list — no popups or toggles. Page 2+ is the combined pool.
- **ID expansion from name + aliases.** Fuzzy/phonetic search over `core_entities` (name + aliases) finds extra entity IDs to feed the ID-array filters, handling plurals, typos, alias-only naming, and graph gaps ("taco" → "birria tacos", "al pastor"). Triggered on low strict coverage, unresolved terms, or short/variant-prone queries, with per-type caps. One shared `EntityTextSearchService` (trigram-GIN indexable) backs both this and autocomplete.
- **Attribute-only queries.** With no food/restaurant entity, the attribute becomes the primary target; food-attribute-only ("spicy") gets an OR fallback (`food_attributes match OR food_id/categories match expanded IDs from attribute text`).

## Query-aware top dishes & tag signals

- **Cards show query-relevant dishes.** When a query has a food target, each card's `topFood` is filtered by the same dish/connection constraints for the current relaxation stage — a taco search never shows a restaurant's top burger. Ordering stays dish-score; aliases apply via the same ID expansion.
- **Tags broaden matching without fake dishes.** Restaurant-level evidence (menu items, non-menu foods/categories, food/restaurant attributes) is searchable without fabricating dish rows. Restaurant search matches via connection OR tag evidence, but eligibility still requires ≥1 real menu-item row somewhere; dish results stay connection-backed only. Responses expose `matchEvidenceType` (connection | tag_signal | mixed), `matchedTags` (with counts), and `hasMenuItems`.
- **Tag pills.** Cards and profiles show "Known for tacos", "coffee · 6 mentions", "brunch · 4" — top-N tags by mention count, mixed across entity types.

## Filters & sorts

- **Open Now** (free) — binary filter on stored hours vs current time, applied before ranking with a fetch multiplier so closed places filter out before pagination.
- **Price level** (free).
- **Minimum votes ("100+ votes")** — hides dishes/restaurants without enough community signal. The canonical "clone me" toggle: reruns the search, updates pins, preserves sheet state, rapid-tap safe, resets pagination.
- **Rising / Momentum sort** (Crave+) — switches ordering to the continuous heat-surge momentum: places where mentions arrive faster lately than that place's own baseline, surfacing climbing/hidden-gem spots the stable score ranks low. Applies to both axes.
- **Attribute combos / stacked filters** (Crave+) — multi-attribute queries ("spicy vegan ramen with patio"). Time/occasion attributes (brunch, happy hour, late night) are attribute entities, not a separate filter.
- **"Best near me now"** (Crave+) — one-tap power discovery combining open-now + proximity + score.

## Dish-level ranking & dish search — the paid hero

- **Flat dish score.** A dish's own endorsement strength, `E_dish = w_m·log1p(mentions) + w_u·log1p(upvotes)` mapped to a global percentile on the native `0–10` scale (`10·percentile`, defaults 0.7/0.3). This is the dish ordering.
- **Dish-level search.** "Best birria in the city" ranks specific dishes across all restaurants — not a wall of 4.3-star venues. This is the differentiator Google/Yelp/Beli structurally can't do, and the entire dish side of the result sheet is Crave+.
- **Restaurant detail dish list.** Free users see top-N dishes ("Menu highlights", ranked by dish score); the full list plus per-dish detail/score is Crave+.
- **Dish map toggle** (Crave+) — the map can color/rank by dish score instead of restaurant score; dishless restaurants hide on the dish surfaces.
- **Restaurant score** (free, the objective ranking) — a best-first discounted sum of its dishes' endorsement (ρ≈0.5) plus a general-praise term: a standout dish drives the peak, breadth adds without dragging, praise carries dishless restaurants. Mapped to a global percentile.
- **Score evidence.** Tooltips explain the scores ("combines poll votes + how often people rave… recent praise weighted heavier"); detail pages carry "Based on N polls with M votes" (pollCount/voteCount). The full "why" is a Crave+ reveal.

## Autocomplete & suggestions

- **Lane-aware.** Four lanes — entity, personal query, global query, attribute — with soft slot reservations (entities up to 3, personal queries up to 2, global query up to 1, attribute up to 1 when strong; overflow goes to the strongest remaining). Eligible from the first character, ranked per-lane rather than by one global score.
- **Entity match scoring.** `0.5·textConfidence + 0.35·globalPopularity + 0.1·userAffinity + favoriteBoost + viewAffinityBoost`, where view affinity = `0.7·exp(-days/30) + 0.3·min(log1p(viewCount)/log1p(10),1)`. Favorite/view boosts stay subtle — never "all your restaurants, all the time."
- **Query-text suggestions.** Prefix matches from search-log text, capped at 3, counted by distinct request IDs, kept when userCount≥1 or globalCount≥3; global suggestions are distinct-user-dominant and recency-windowed.
- **Empty-query screen.** Recent searches and Recently viewed restaurants (top 10, with a view cooldown), led by "What are you craving?" plus trending and popular categories.
- **Badges.** Left icon marks dish/restaurant/query-text; right badges show heart (favorite), view (recently viewed), clock (personal recent query).
- **Selection as metadata.** Autocomplete selections are captured on `search_submitted` (`submissionSource='autocomplete'` + selectedEntityId), no separate click event.

## Result sheet — transition & cross-tab session

- **Search-from-anywhere.** Launching search from any page (deep link, an entity tap in a comment) is one transition to results/restaurant, gated on `cardsReady && nativeMarkerFrameReady && sheetReady` — an origin-independent reveal join.
- **Dismiss returns to origin.** Closing search returns to the exact origin tab + snap + scroll (favorites/polls/profile), not a hard-coded search root.
- **Search Session Coordinator.** A single state machine (idle → launching → active → closing_to_collapsed → restoring_origin) owns launch/active/close/restore; the launch-time `SearchSessionContext` is frozen and consumed once at close, with an atomic collapsed handoff.
- **Suggestion ↔ results fade.** One shared `suggestionProgress` drives the search bar, shortcut chips, blur, suggestion panel, and cutout in parallel on the UI thread (~100–180ms); on submit the results sheet appears immediately in loading state while chips fade out.
- **Favorites-as-search.** Favorites/profile list taps reuse the search executor (`POST /favorites/lists/:listId/results` → a real `SearchResponse` with field-parity pins/sort) and run through the same lifecycle and return-to-origin dismiss. Power sorts/filters over your own lists are a Crave+ lever.
- **Re-sortable feeds disable MVCP.** Any list whose rows re-order on a sort/filter toggle disables FlashList `maintainVisibleContentPosition`, or the header/strip scrolls off.

## Result sheet — cards, evidence & actions

- **Restaurant cards (dual presentation).** Top-dish presentation when `hasMenuItems`; tag-pill presentation when the match is tag-only ("mentioned for tacos").
- **Evidence cards.** A top community quote with upvote count and recency, plus a "Join conversation" link to the source thread (Reddit deep-link, web fallback); both quote and CTA go to the same thread, with subtle "powered by communities" branding.
- **Activity indicators.** 🔥 trending / 🕐 active are visual only and never affect ranking order; served by the momentum axis.
- **Quick actions.** Order link (Google/direct), Google Maps link, save dish/restaurant to a list, share, and "also worth trying" alternatives.
- **"Best dish" shortcut.** The one-tap best-dish shortcut chip is a **Crave+** gate (a one-tap entry into dish discovery, part of the paid dish layer). Restaurant shortcuts stay free.
- **Empty states.** Dishes: "Try a broader search or different area / not enough data yet, zoom the map." Restaurants: "Adjust price, map, or Open now / widen your map."

## Friend signals on results

Results that people you follow have saved or ranked carry the shared **FriendCluster** — stacked overlapping friend avatars + "Saved by {name} and others" (the named friend is the highest-affinity one; tap to expand). It's an in-context way to spot a trusted pick at a glance while you browse normally. The full friend-graph design (following, the cluster, affinity naming, your-circle consensus) lives in `profile.md` — this is the search-surface entry point, not a duplicate.

It is an **explicit overlay, never a re-rank.** The ordering stays the pure objective Crave Score; the cluster only annotates rows. Consensus truth and your circle's taste stay visibly separate, the same way a custom-ranked list shows its own order beside each row's objective Score dot.

A **Friends lens** (an opt-in toggle that filters results to _only_ friend-saved picks) is **still under discussion** — the ambient cluster above may already cover the "what do my friends like for [cuisine]?" need, so the lens is a maybe to validate, not a committed feature.

## On-demand collection

- **Low-result searches record demand.** A search writes an on-demand request with reason `unresolved | low_result`, recording which constraints were dropped plus strict-vs-relaxed counts, under a cooldown and a per-cycle entity cap.
- **Location-aware.** Resolve a `locationKey` (nearest subreddit) from the bounds centroid; only enqueue when one resolves. Restaurant entities are location-aware so same-name spots in different cities stay distinct.
- **Name match without connections.** A restaurant whose name matches "taco" but has no taco connections isn't surfaced as a taco result, but is recorded as low_result demand with `hasNameMatchCandidates: true`.

## Discovery, demand layer & performance

- **Discovery surfaces (Crave+).** Trending Deep Dives, Rising Stars, Hidden Gems, Neighborhood Insights, Time-Based Trends, Category Deep-Dives — "South Austin's rising stars", "what's hot for breakfast", "Austin's top-discussed pizza this month" — all built on the momentum axis. Smart alerts ("a dish you saved is getting a fresh wave of praise") combine momentum with favorites.
- **Search-demand layer.** A rebuildable `user_search_demand_daily` aggregate draws from search logs, cache reveals, on-demand asks, views, favorite events, and autocomplete selections, splitting `sourceKind` (provenance) from `signalKind` (interpretation) so consumers opt into signal kinds, with a dual market scope (UI `marketKey` vs `collectableMarketKey`). Polls, on-demand, and keyword collection share one scoring vocabulary: per-user log-scaled demand, distinct-user breadth as the main signal, diminishing repeat-ask power, recency with smooth decay, and recovery curves rather than hard caps.
- **Caching & indexing.** Cache frequent/viral queries with 24h retention so a follow-up "best tacos" is instant; cache reveals clone server-owned attribution (fresh searchRequestId, original id in metadata) distinguished by `eventKind`. Targets: <400ms cached, <3s uncached-with-LLM. `core_entities` text search uses a name prefix index, name trigram, and name+aliases FTS, with batched multi-term expansion and a gated phonetic fallback.

## Failure & offline UX (plumbing BUILT 2026-07-08 — UI polish needed)

**REVISED (owner call, 2026-07-08 evening):** the failure announcement is now the ONE
standard modal, not per-surface chips/banners — uniform across every page and
transition. Offline is the universal hang.

- **Offline (app-wide standard):** navigate freely; loaded content stays; anything NEW
  hangs in its skeleton/loading state (never an error surface); the black system banner
  explains; back-out always works; reconnect auto-retries pending desires (the hang is
  finite). Rig-proven for search; the same standard applies to every other scene by
  construction (their loads simply don't complete offline).
- **Online failure → THE STANDARD MODAL:** "Something went wrong / We couldn't complete
  that. Please try again." with Try again + Not now. One surface everywhere — no
  per-surface failure design exists. The failed empty state remains as the search
  sheet's resting surface behind the modal. (The interim strip retry chip was removed.)
- **THE STANDARD MODAL SURFACE (all modals):** OverlayModalSheet is now the app-wide
  modal primitive — dimmed backdrop, no snap points, no grab handle, grab-to-rubber-band
  (asymptotic upward resistance), swipe-down-only dismiss (distance or flick), backdrop
  tap dismiss. AppModalHost (the Alert.alert replacement, 13 call sites) renders through
  it — the old centered non-swipeable card is gone. The price + rank/score sheets get
  the gesture for free.
- **Polish / finger-check pass:** the sheet gesture FEEL (rubber-band ceiling 56,
  dismiss distance 110, flick velocity 900, settle spring — all tunable constants at the
  top of OverlayModalSheet), modal typography/spacing, EmailAuthModal migration to the
  primitive (auth-critical, deferred), and the failure modal copy.

The behavior is in its ideal shape and rig-proven; what remains is making the surfaces
pretty. The architecture: a single `searchResolutionFailure` LEVEL on the runtime bus
(written by the presentation seam on a failed resolution, cleared when the next attempt
begins), and ONE retry mechanism (`retrySearchDesiredResolution` re-asserts the current
desired tuple; the reconciler classifies it `reassert_unresolved` and re-resolves —
in-place rerun choreography over stale results, fresh enter when nothing is presented).

- **Stale results + failure** → a compact **retry chip in the strip family** (next to the
  "N similar" chip): "Couldn't update · Retry". Results are never destroyed. _Polish:_
  visual design of the chip (currently a functional red-tinted pill), placement/motion,
  possibly auto-dismiss after a successful unrelated action. Needs a finger-test pass.
- **Nothing presented + failure** → the **empty surface renders failure copy + a Retry
  button** ("Something went wrong…" / offline variant "You're offline — results will load
  when you're back online"). _Polish:_ illustration/icon, button styling (currently a
  plain dark pill), copy review.
- **Offline** → the **hang** (owner call): an offline "failure" is a PAUSED resolution,
  not a failure — the loading state simply persists (universal across every transition in
  the app, zero per-surface offline styling), the existing black system banner explains,
  and on reconnect the pending desire **auto-retries** — so the hang is FINITE and
  self-completing, unlike Airbnb's open-ended version. The retry chip and failure copy
  never show for offline; the banner owns that story. Rig-observed: Wi-Fi off →
  banner + skeleton hold steady, no error state, no toast.
- **Dev**: real failures still raise the LogBox toast; canceled/superseded resolutions log
  info only.

## Adjacent ideas

- **"Also worth trying"** — score-ranked siblings under a dish/restaurant result.
- **Share-your-discovery / share-your-bookmarks** from the result/favorites surface (pre-filled social post, top-10 dish-restaurant infographic) as a viral loop; favorites are already publicly shareable via `share_slug`.
- **Search + power sort/filter within bookmarks** (momentum, stacked filters over your own lists) as a Crave+ lever, already enabled by favorites-as-search.

## Still to decide

- Where the Crave+ paywall sits on the dish side of the result sheet — is the whole dish list hidden/blurred, or shown ranked with only detail/score gated? Hiding the best results of an objective ranking is the #1 "feels like a scam" trigger, so dish-list _visibility_ vs dish-_detail_ gating needs an explicit call.
- The locked value of N for restaurant detail's free "top-N dishes" floor.
- Whether NL/semantic search is metered as soft-degrade (a few free per day) or fully Crave+-only.
- Whether the Friends _lens_ (filter-to-only-friends) is worth building at all, given the ambient FriendCluster may already cover the need — and if so, free or a Crave+ lever.
- **Optional "relevancy sort" as a dense-co-inclusion backstop.** Dense entity-to-entity co-inclusion broadens the candidate set with related dishes (a "ramen" search also surfaces its noodle family: miso ramen, lo mein, kimchi noodles). Today's principle is _score-ranked, never a relevance sort_ (see Core search architecture) — relevance lives in candidate generation, not a separate ordering. If co-inclusion succeeds _too_ well and the most-relevant results get buried under pure score-ranking, we may need an optional relevance ordering — ideally a **grouped** one: cluster co-included dishes by dense-score band (the winner's own family first, then the next-closest family…) and sort by crave-score _within_ each band, so the best-and-most-relevant surfaces at the very top and relevance decays down the list while quality still wins locally. Behind the scenes it stays "smart" (still favors higher-ranked places within a band). Build only if we actually observe the burying — not a launch dependency, and the stated ideal is to get the co-inclusion _pick_ good enough that no relevance sort is ever needed.
