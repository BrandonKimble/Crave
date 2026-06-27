# Crave — Monetization & Gating (Free vs Paid)

> Last updated 2026-06-27. The feature-level companion to [business-model.md](business-model.md).
> This is where the free/paid line and the reasoning behind it live.

## The principle (use this for every gating decision)

> **Gate what Google / Yelp / Beli structurally *can't* do. Keep free the things they *do* — we
> just do them better.** The free tier's job is to be an unmistakably-better restaurant finder than
> Google: that's the "this app is genuinely good" taste that earns the install and the word-of-mouth.
> The paid tier is everything those incumbents can't touch.

Two sub-frames that resolve the hard cases:

1. **Taste vs. crutch.** Ask of any free feature: does it *whet the appetite* for the paid thing
   (a taste → keep free), or does it *satisfy the need* so they never upgrade (a crutch → gate it)?
2. **Discovery vs. decision.** The un-substitutable value is **discovery** ("where's the best birria
   in the city?" — you can't brute-force what you don't know exists). The **decision** job ("what
   should I order *here*?") is more substitutable. Gate the depth; tease the discovery.

## The free / paid map

| Surface / feature | Free | Crave+ | Notes |
|---|:--:|:--:|---|
| Objective restaurant ranking + Crave Score (every place), uncapped | ✅ | | The integrity promise + trust + word-of-mouth. Never blurred, never capped. |
| Restaurant search + autocomplete (name, cuisine, "vegan", attributes) | ✅ | | Table stakes; cheap. Don't meter the core. |
| Map + pins + rank badges | ✅ | | Free discovery surface. |
| Open-now / price filters | ✅ | | Google does these → free. |
| Restaurant detail basics (score, price, hours, locations, call/site) | ✅ | | |
| Restaurant score transparency / "why this is ranked here" | ✅ | | **Keep free** — hiding *why* the objective ranking ranks a place undercuts "no pay-to-rank." |
| Poll voting + discussion / comments | ✅ | | Contribution feeds the Score + community + virality. **Never gate.** |
| Create + share **restaurant** favorites lists (public slugs) | ✅ | | Normal saved-list behavior; shareable lists = virality. Gate the *count* maybe, never creation/sharing. |
| Create **dish** favorites lists (dishes saved as restaurant+dish pairings) | | ✅ | The whole dish-list side is Crave+; free users get restaurant lists only. Dishes are the paid hero. |
| Profile / following (when shipped) | ✅ | | Network/virality layer. |
| **Dish ranking + scores + dish list (on restaurant profile)** | | ✅ | **Hero.** Locked-but-visible teaser on the profile. |
| **Dish-level search** ("best birria in the city," ranked across restaurants) | | ✅ | **Hero.** The single most differentiated thing; Google can't rank a city by a dish. |
| **Rising / momentum sort + any "trending" list** | | ✅ | Google has no trending. |
| **Power filter/sort on your own favorites lists** (incl. the "All" list filters, cross-list intelligence, sort-by-trending, map-all-saved) | | ✅ | Google's saved lists are dumb buckets. |
| Dish-level score evidence / receipts | | ✅ | Part of the paid dish layer (distinct from free restaurant-level transparency). |
| Power-discovery (best-near-me-now, stacked filters) | | ✅ | |

**Heroes:** dish-level search (discovery) and the restaurant-profile dish list (decision) — together,
"the entire dish intelligence layer." Rising/momentum and favorites power-filters are *supporting*
gates (lower urgency); don't expect them to convert on their own. Dishes carry conversion.

## Resolved gating decisions (and why)

- **Dishes are gated *completely* — profile dish list AND cross-restaurant dish search.** Keeping the
  profile dish *scores* free is a **crutch**: a patient user brute-forces "best tacos" by opening top
  restaurants and reading their dish lists, which trains the restaurant-first habit and suppresses the
  dish-discovery product. Gating the profile dish scores is the specific lever that closes that leak.
- **Discussion stays free.** It's contribution (feeds the Score), it's below the Google baseline to
  gate, and it's the *slow taste* that sells the instant ranked answer ("read 30 comments… or unlock
  the ranked dishes"). The free discussion sitting next to the locked dish list is a conversion driver.
- **Locked-but-visible, not hidden.** Gated dish sections show a blurred "Top 8 dishes, ranked →
  Crave+" teaser — visible-and-locked beats invisible (creates the curiosity gap).
- **Personalization is OFF, permanently.** No taste-based re-ranking ever. (Don't reintroduce it as a
  paid feature — it's not how the product works.)
- **Favorites is two-sided: restaurant lists free, dish lists paid.** A parent toggle splits the
  restaurant side (free — normal saved lists) from the dish side (Crave+ — dishes saved as
  restaurant+dish pairings). No mixed lists. Per-list power filters (rank / rising / open-now / price,
  cuisine TBD) are the Crave+ layer; the **"All" meta-list** is the only list with an include/exclude
  toggle. (founder, 2026-06-27 — see `../product/favorites.md`)

## The one open card-preview decision (A/B at launch)

The restaurant *card* in results shows top dishes. Showing top-3 *with scores* free would gut the
hero. Two arms to test (substitution rate vs. viral lift are empirical, not deducible):

- **Arm A (strict):** card shows a single top-dish *name* only (no score/rank) as a free hook; all
  scored/ranked dish data gated. Maximizes conversion. (Recommended default — dish *names* aren't the
  differentiator since Google shows "popular dishes" too; the *ranking/scoring* is.)
- **Arm B (viral):** a thin free dose of dish *discovery* (e.g. free users see the #1 cross-restaurant
  result, locked beyond) — protects the viral hook (dish-ranking is the most shareable "whoa"), at
  some cannibalization risk.

The tension is real: **dishes are simultaneously the best paid hero AND the most viral feature**, and
you can't go viral behind a wall. The trial + locked teasers mitigate; the A/B settles it.

## Search cost fact (verified in code — matters for unit economics)

Not every search is an LLM call:
- `/search/run` (structured) → **no LLM**.
- `/search/natural` short-circuits: a **selected autocomplete entity** → no LLM (runs the resolved
  entity); a **generic-only** query (stop-words) → no LLM; **otherwise** → `llmService.analyzeSearchQuery()`
  = a real LLM call ([search-orchestration.service.ts](../apps/api/src/modules/search/search-orchestration.service.ts),
  [search-query-interpretation.service.ts:90](../apps/api/src/modules/search/search-query-interpretation.service.ts)).
- So **typing "pizza" and submitting without picking a suggestion → LLM call; tapping the "pizza"
  suggestion → no LLM.** Food-item identification without the LLM is done by the shared matcher
  (aliases/fuzzy/embeddings/similarity), not generative AI.

**Implication:** free users' *freeform* searches cost real money. Cache aggressively, keep nudging
users to tap autocomplete suggestions, and treat a soft daily cap on freeform searches (if ever
needed) as a **cost backstop**, not a monetization lever. And per the gating principle, **don't gate
NL search** — Google Maps does NL search, so it's not a differentiator. (Likewise **offline fails the
"Google can't do it" test** — Google Maps has offline — so it's a weak headline gate.)
