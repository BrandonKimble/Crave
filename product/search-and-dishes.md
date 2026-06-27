# Search, Dishes & Result Sheet

> **Rolling canonical vision — not a changelog.** Keep this file thin and *current*: it describes
> only what we want this area of the app to be **today**. When something changes, edit or delete the
> old text in place — never append "superseded"/"old"/"previously" notes, history, or pointers to
> past ideas. If you follow this file, you know exactly what we want. Execution detail + migrations
> live in `plans/`; business/gating rationale lives in `business/`.

---

This area covers structured vs natural-language search, autocomplete, filters, the dual result sheet (restaurants + dishes), the dish-level ranking and dish-level search that is the paid hero, candidate generation with progressive relaxation, and the result-sheet transition/handoff.

The Crave Score ranking is **objective and global** — never personalized to user taste. Monetization is **freemium**, and the entire DISH intelligence layer is the Crave+ hero. We gate what Google/Yelp/Beli structurally can't do; we keep free what Google does (we just do it better).

- **Free:** the objective restaurant ranking, structured/keyword search, autocomplete, the map, open-now/price filters, restaurant-detail basics (top-N dishes), poll voting + discussion, and create/share favorites lists.
- **Crave+:** dish ranking/scores, dish-level search, the full dish list beyond top-N, natural-language/semantic search, rising/momentum + trending, the score-evidence "why," and power filters/sorts on favorites lists.

## Core search architecture

- **Dual-list results.** Every non-venue-specific query returns two score-ranked lists: a dish list (connections) and a restaurant list. A single list (one restaurant scoped to its menu) appears only when the query is restaurant-only with no food/attribute; a restaurant used as a filter alongside other entities still returns the dual list.
- **Entity-driven processing.** Queries resolve to four entity types — restaurants, food, food_attributes (spicy/vegan/crispy, connection-scoped), restaurant_attributes (patio/romantic, venue-scoped) — plus bounds/openNow/price/min-votes filters. Entity composition deterministically picks the return format.
- **`POST /search/run` contract.** Takes resolved `entities`, `bounds`, `openNow`, `risingActive`, `pagination`. Returns `format`, `plan` (filters + ranking + diagnostics), `food[]`, and `restaurants[]` with `topFood`, `matchEvidenceType`, `matchedTags`, `hasMenuItems`, `craveScore`.
- **Score-ranked, not a relevance sort.** Relevance is a property of candidate generation (which rows are eligible), never a separate sort. Restaurants order by restaurant score; dishes by dish/connection score.
- **Map viewport as the location filter.** Visible NE/SW bounds filter restaurants before ranking via the geo index — no text location parsing. The same query feeds the list and the map pins.

## Structured vs natural-language search

- **Two entrypoints.** Structured/keyword search (name, cuisine, food/restaurant attributes) is cheap and **free** — it's the word-of-mouth engine and we never meter it. Natural-language/semantic search (`/search/natural`, LLM interpretation + pgvector embeddings) costs an LLM call per query and is the **Crave+** "magic."
- **NL search degrades softly, not as a wall.** If we meter NL search, free users get a few NL searches per day before the Crave+ prompt (the Perplexity/ChatGPT pattern), never a blank wall.
- **Deterministic fast path before the LLM.** Bypass the LLM for exact restaurant-name, single-token food/entity, exact-attribute, and short noun-phrase queries; only invoke the LLM for multi-clause, ambiguous, conversational, or mixed-intent text. The LLM returns entities organized by type (`normalized_name`, `original_text`, resolved `entity_ids`) plus location_bounds, open_now, and user_context.

## Candidate generation & progressive relaxation

- **Multi-branch union.** Entity-ID evidence (food_id / categories / attributes / restaurant IDs) is unioned with text-evidence ID expansion, then score-ranked.
- **Hard eligibility gates.** A dish result must be a real connection row. A restaurant result requires ≥1 connection in our dataset (name match alone is never enough). We never surface attribute-only results that lose the primary entity (no "spicy-only" for "spicy taco").
- **Progressive relaxation.** Try strict (primary + all modifiers) first; if page-1 strict is below ~10, relax modifiers (drop food/restaurant attributes) while always preserving the primary food/restaurant target. When both attribute types exist, pick the single-drop stage with the higher `min(dishCount, restaurantCount)`.
- **Sectioned page-1 UX.** "Exact matches" (strict, up to 5, "show more" for 6–9), then "Broader matches" (relaxed-only, deduped), both score-sorted, with the explanation baked into the list (no popups/toggles). Page 2+ is the combined pool.
- **ID expansion from name + aliases.** Fuzzy/phonetic text search over `core_entities` (name + aliases) finds extra entity IDs to feed the ID-array filters — handling plurals, typos, alias-only naming, and gaps in the entity graph ("taco" → "birria tacos", "al pastor"). Triggered when strict coverage is low, unresolved terms exist, or the query is short/variant-prone, with per-type caps. A shared `EntityTextSearchService` (one implementation, trigram-GIN indexable) backs both this expansion and autocomplete.
- **Attribute-only queries.** With no food/restaurant entity, the attribute becomes the primary target. Food-attribute-only (e.g. "spicy") gets an OR fallback: `food_attributes match OR (food_id/categories match expanded IDs from attribute text)`.

## Query-aware top dishes & restaurant tag signals

- **Cards show query-relevant dishes.** When a query has a food target, each restaurant card's `topFood` is filtered by the same dish/connection constraints (food IDs + category overlap + active attributes) for the current relaxation stage — a taco search never shows a restaurant's top burger. Ordering stays dish-score; aliases apply via the same ID expansion.
- **Tags broaden matching without fake dishes.** Restaurant-level evidence for menu items, non-menu foods/categories, food attributes, and restaurant attributes (e.g. "El Perrito → taco", "Mattie's → brunch") is searchable without fabricating dish rows. Restaurant search matches via connection OR tag evidence, but eligibility still requires ≥1 real menu-item row somewhere; dish results stay connection-backed only. Responses expose `matchEvidenceType` (connection | tag_signal | mixed), `matchedTags` (with counts), and `hasMenuItems`.
- **Tag pills.** Cards and profiles show "Known for tacos", "coffee · 6 mentions", "brunch · 4" — top-N tags by mention count, mixed across entity types with badge counts.

## Filters & sorts

- **Open Now** (free) — binary filter on stored Google Places hours vs current time, applied before ranking, with a fetch multiplier so closed places get filtered before pagination.
- **Price level** (free) — `priceLevels[]`.
- **Minimum votes ("100+ votes")** — hides dishes/restaurants without enough community signal. It's the canonical "clone me" toggle: reruns the search, updates pins, preserves sheet state, is rapid-tap safe, and resets pagination.
- **Rising / Momentum sort** (Crave+) — switches ordering to the **continuous heat-surge momentum**: places where mentions are arriving faster lately than that place's own baseline, surfacing climbing/hidden-gem spots the stable score ranks low. Applies to both dish and restaurant axes; the mobile toggle clones the votes filter end-to-end.
- **Attribute combos / stacked filters** (Crave+) — multi-attribute queries ("spicy vegan ramen with patio"). Time/occasion attributes (brunch, happy hour, late night) are handled as attribute entities, not a separate filter.
- **"Best near me now"** (Crave+) — one-tap power discovery combining open-now + proximity + score.

## Dish-level ranking & dish search — the paid hero

- **Flat dish score.** A dish's own endorsement strength, `E_dish = w_m·log1p(mentions) + w_u·log1p(upvotes)` mapped to a global percentile [60, 99.9] (defaults w_m/w_u = 0.7/0.3). This is the dish ordering.
- **Dish-level search.** "Best birria in the city" ranks specific dishes across all restaurants — not a wall of 4.3-star venues. This is the differentiator Google/Yelp/Beli structurally can't do, and the entire dish side of the result sheet is gated behind Crave+.
- **Restaurant detail dish list.** Free users see top-N dishes ("Menu highlights", ranked by dish score); the full dish list plus per-dish detail/score beyond top-N is Crave+.
- **Dish map toggle** (Crave+) — the map can color/rank by dish score (dish view) instead of restaurant score; dishless restaurants are hidden on the dish surfaces.
- **Restaurant score** (free, the objective ranking) — a best-first discounted sum of its dishes' endorsement (`acclaim`, ρ≈0.5) plus a general-praise term: a standout dish drives the peak, breadth adds without dragging, and praise carries dishless restaurants. Mapped to a global percentile.
- **Score evidence.** Tooltips explain the scores ("Dish score combines poll votes + how often people rave… recent praise weighted heavier"); detail pages carry evidence ("Based on N polls with M votes", pollCount/voteCount, confidenceLabel). The full "why" is a Crave+ reveal.

## Autocomplete & suggestions

- **Lane-aware autocomplete.** Four lanes — entity, personal query, global query, attribute — with soft slot reservations (entities up to 3, personal queries up to 2, global query up to 1, attribute up to 1 when strong; overflow goes to the strongest remaining). Eligible from the first typed character, ranked per-lane rather than by one global score.
- **Entity match scoring.** `0.5·textConfidence + 0.35·globalPopularity + 0.1·userAffinity + favoriteBoost + viewAffinityBoost`, where view affinity (restaurants) = `0.7·exp(-days/30) + 0.3·min(log1p(viewCount)/log1p(10),1)`. Favorite/view boosts stay subtle — never "all your restaurants, all the time."
- **Query-text suggestions.** Prefix matches from search-log query text, capped at 3, counted by distinct request IDs, kept when userCount≥1 or globalCount≥3; global suggestions are distinct-user-dominant and recency-windowed.
- **Empty-query screen.** Two stacked sections — Recent searches and Recently viewed restaurants (top 10, with a view cooldown).
- **Badges.** Left icon marks dish/restaurant/query-text; right badges show heart (favorite), view (recently viewed), and clock (personal recent query).
- **Attribute lane gating.** Attributes enter the main lane only behind strict lexical gates with positive support — no non-exhaustive deny lists.
- **Selection as metadata.** Autocomplete selections are captured on `search_submitted` (`submissionSource='autocomplete'` + selectedEntityId), with no separate click event.

## Result sheet — transition & cross-tab session

- **Search-from-anywhere.** Launching search from any page (deep link, an entity tap in a comment) is one transition to results/restaurant, gated on `cardsReady && nativeMarkerFrameReady && sheetReady` — an origin-independent reveal join.
- **Dismiss returns to origin.** Closing search returns to the exact origin tab + snap + scroll (favorites/polls/profile), not a hard-coded search root.
- **Search Session Coordinator.** A single state machine (idle → launching → active → closing_to_collapsed → restoring_origin) owns launch/active/close/restore; the launch-time `SearchSessionContext` is frozen and consumed once at close, with an atomic collapsed handoff.
- **Suggestion ↔ results fade.** One shared `suggestionProgress` drives the search bar, shortcut chips, blur, suggestion panel, and cutout in parallel on the UI thread (~100–180ms); on submit the results sheet appears immediately in loading state while chips fade out and unmount.
- **Favorites-as-search.** Favorites/profile list taps reuse the search executor (`POST /favorites/lists/:listId/results` → a real `SearchResponse` with field-parity pins/sort) and run through the same results lifecycle and return-to-origin dismiss. Power sorts/filters over your own favorites lists are a Crave+ lever.
- **Re-sortable feeds disable MVCP.** Any list whose rows re-order on a sort/filter toggle disables FlashList `maintainVisibleContentPosition`, or the header/strip scrolls off.

## Result sheet — cards, evidence & actions

- **Restaurant cards (dual presentation).** Top-dish presentation when `hasMenuItems`; tag-pill presentation when the match is tag-only ("mentioned for tacos").
- **Evidence cards.** A top community quote with upvote count and recency, plus a "Join conversation" link to the source thread (Reddit app deep-link, web fallback); both the quote and the explicit CTA go to the same thread, with subtle "powered by communities" branding.
- **Activity indicators.** 🔥 trending / 🕐 active are visual only and never affect ranking order; they're served by the momentum axis.
- **Quick actions.** Order link (Google/direct), Google Maps link, save dish/restaurant to a list, share, and "also worth trying" alternatives.
- **Empty states.** Dishes: "Try a broader search or different area / not enough data yet, zoom the map." Restaurants: "Adjust price, map, or Open now / widen your map."

## On-demand collection

- **Low-result searches record demand.** A search writes an on-demand request with reason `unresolved | low_result`, recording which constraints were dropped plus strict-vs-relaxed counts, under a cooldown and a per-cycle entity cap.
- **Location-aware.** Resolve a `locationKey` (nearest subreddit) from the bounds centroid; only enqueue when one resolves (otherwise record demand only). Restaurant entities are location-aware so same-name spots in different cities stay distinct.
- **Name match without connections.** A restaurant whose name matches "taco" but has no taco connections is not surfaced as a taco result, but is recorded as low_result demand with `hasNameMatchCandidates: true`.

## Discovery, demand layer & performance

- **Discovery surfaces (Crave+).** Trending Deep Dives, Rising Stars, Hidden Gems, Neighborhood Insights, Time-Based Trends, Category Deep-Dives — "South Austin's rising stars", "what's hot for breakfast", "Austin's top-discussed pizza this month" — all built on the momentum axis. Smart trending alerts ("a dish you saved is getting a fresh wave of praise", "your favorite category spotted at a new location") combine momentum with favorites. The empty-query suggestion screen leads with "What are you craving?" plus recent, trending, and popular categories.
- **Search-demand layer.** A rebuildable `user_search_demand_daily` aggregate draws from search logs, cache reveals, on-demand asks, restaurant/food views, favorite events, and autocomplete selections, splitting `sourceKind` (provenance) from `signalKind` (interpretation) so consumers opt into signal kinds, with a dual market scope (UI `marketKey` vs `collectableMarketKey`). Polls, on-demand, and keyword collection share one scoring vocabulary: per-user log-scaled demand, distinct-user breadth as the main signal, diminishing repeat-ask power, recency with smooth decay, and cooldown/recovery curves rather than hard caps.
- **Caching & indexing.** Cache frequent/viral queries with 24h retention for full result sets so a follow-up "best tacos" is instant; cache reveals clone server-owned attribution (fresh searchRequestId, original id in metadata) distinguished by `eventKind`. Targets: <400ms cached, <3s uncached-with-LLM. `core_entities` text search uses a name prefix index, name trigram, and name+aliases FTS, with batched multi-term expansion and a gated phonetic fallback.

## Adjacent ideas

- **"Also worth trying"** score-ranked siblings under a dish/restaurant result.
- **Share-your-discovery / share-your-bookmarks** from the result/favorites surface (pre-filled social post, top-10 dish-restaurant infographic) as a viral loop; favorites are already publicly shareable via `share_slug`.
- **Search + power sort/filter within bookmarks** (momentum, stacked filters over your own lists) as a Crave+ lever, already enabled by favorites-as-search.

## Still to decide

- Where exactly the Crave+ paywall sits on the dish side of the result sheet — is the whole dish list hidden/blurred, or shown ranked with only detail/score gated? Hiding the best results of an objective ranking is the #1 "feels like a scam" trigger, so dish-list *visibility* vs dish-*detail* gating needs an explicit call.
- The locked value of N for restaurant detail's free "top-N dishes" floor.
- Whether NL/semantic search is metered as soft-degrade (a few free per day) or fully Crave+-only.
