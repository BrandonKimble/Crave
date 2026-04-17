# Contextual Score Cutover Plan

Last updated: 2026-04-13
Status: delivered
Scope:

- `/Users/brandonkimble/crave-search/apps/api/src/modules/search/**`
- `/Users/brandonkimble/crave-search/apps/api/src/modules/content-processing/quality-score/**`
- `/Users/brandonkimble/crave-search/apps/api/src/modules/content-processing/rank-score/**`
- `/Users/brandonkimble/crave-search/packages/shared/src/types/search.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/store/searchStore.ts`
- `/Users/brandonkimble/crave-search/apps/mobile/src/screens/Search/**`

Related plans:

- `/Users/brandonkimble/crave-search/plans/polls-coverage-resolution-cutover-plan.md`
- `/Users/brandonkimble/crave-search/plans/restaurant-identity-domain-rollup-plan.md`
- `/Users/brandonkimble/crave-search/plans/location-optional-cutover-plan.md`

## Objective

Cut directly from the old explicit `Local / Global` score-toggle model to a dynamic contextual-scoring model:

- one stable canonical score still exists internally
- user-facing ranking and color are contextual by default
- contextual score is derived from the submitted search geography, not a hardcoded toggle
- local/market and multi-market searches both work without exposing internal score vocabulary
- remove legacy toggle plumbing and old score-mode branching from active UX paths

## Current system

### 1. Canonical quality score is cumulative and volume-sensitive

Current quality score behavior is driven primarily by cumulative decayed signal:

- connection strength uses decayed mention count and decayed upvotes
- restaurant quality uses top-food quality, menu consistency, and general praise upvotes
- mention and upvote inputs are log-normalized and time-decayed, but they still fundamentally reward more accumulated signal

This means:

- the current canonical score is directionally useful
- but cross-community comparisons are not equally fair when source communities differ a lot in size or activity
- the signal is strongest when comparing restaurants that had roughly comparable chance to be mentioned in the same contextual universe

### 2. Current user-facing scoring still uses an explicit toggle

The active app still exposes:

- `global_quality`
- `market_local`

Today:

- `global_quality` orders by canonical quality score
- `market_local` orders by `core_display_rank_scores` for one resolved active market

### 3. Current "local" score is market-relative, not search-context-relative

The current local mode:

- resolves one active market
- filters search to `viewport ∩ active market`
- uses precomputed market rank percentiles/display scores from `core_display_rank_scores`

It does **not** currently mean:

- "relative to the actual submitted search cohort"

It only means:

- "relative to this one active market"

### 4. Current color logic is simple and reusable

The current color system is fine structurally:

- it maps a `0-100` score or percentile into a fixed gradient
- it does not contain market-specific logic itself

So the color system does not need a conceptual redesign.
What needs to change is the score input we feed into it.

## Target product model

### 1. Canonical score stays internal and stable

Keep:

- `restaurantQualityScore`
- `foodQualityScore`

Use them as:

- the stable underlying signal
- tie-break and fallback inputs
- profile/debug/analytics truth
- the base ordering input before contextual normalization

Do **not** use them as the main user-facing score in normal search.

### 2. Contextual score becomes the primary user-facing score

The user-facing search score should answer:

- "how strong is this result within what I just searched?"

Not:

- "how strong is this result compared with the whole database?"

So cards, pins, colors, sort order, and list ranking should use contextual score by default.

### 3. The cohort should be the submitted search cohort

Contextual score should be computed from the actual submitted search geography.

That means:

- if the search geography is effectively one market, normalize within that geographic market cohort
- if the search geography spans multiple markets, normalize within the submitted multi-market geographic cohort

This is intentionally different from both:

- the old hardcoded one-market local toggle
- semantic-subset normalization like "pizza only vs pizza only"

### 4. No user-facing local/global toggle

Remove the explicit `Local / Global` score selector from active UX.

The app should infer the contextual cohort automatically from the search that was submitted.

If we ever expose the canonical score, it should be secondary and descriptive, not the main sort-mode control.

## Cohort rules

These rules should define contextual score.

### 1. Single-market search

If the submitted search resolves to one active market and the result universe stays within that market:

- cohort = all eligible matches inside that market under the submitted filters and search intent

This should cover the normal "best burgers in Austin" case.

### 2. Multi-market search

If the submitted search is intentionally broad enough that the eligible result universe spans multiple markets:

- cohort = all eligible matches inside the submitted viewport/filter universe

This should cover deliberate broad browsing, not accidental pan drift.

Because search only refreshes on submit, viewport-based cohorting is stable enough for this.

### 3. Unresolved/no-market search

If there is no resolved market but the search still has bounds:

- cohort = all eligible matches inside the submitted bounds

### 4. Fallback behavior

If contextual scoring cannot be computed cleanly:

- fall back to canonical quality score

But this should be the exception, not the default.

## Architectural recommendation

## A. Stop making `core_display_rank_scores` the primary user-facing score source

The old table was built for:

- one market
- one precomputed percentile store
- one explicit local/global toggle

That is not the new model.

The new model needs contextual scoring over the submitted search cohort, which can be:

- one market
- many markets
- market-less bounds

So the cleanest approach is:

- compute contextual rank/percentile at query time over the filtered search cohort

Not:

- precompute one score per market and try to stretch it to all search contexts

### What this means

Search should:

- build the geographic cohort first
- compute contextual percentile/rank over that geographic cohort with window functions
- emit `contextualScore` and `contextualPercentile`

This makes single-market and multi-market behavior consistent.

## B. Canonical score remains the base signal

Use canonical score as the base ranking signal inside the geographic cohort:

- first order by canonical quality score
- use mentions/upvotes as stable tiebreakers
- then compute contextual percentile from that ordered cohort

This preserves the current quality-score investment while fixing the UX semantics.

## C. Market still matters for search geography, not score semantics

Keep:

- `viewport ∩ active market` for normal local search
- active-market location filtering
- market-scoped poll and presence logic

Do not let market continue to define the meaning of the displayed score.

## D. Colors should follow contextual score

Keep the current gradient.

Change the input:

- map cards and pins should use `contextualScore` or `contextualPercentile`
- canonical score can still be available in details, analytics, or explanatory UI

That gives users visual diversity within the results they are actually browsing.

## What needs to change

## Phase 1: Lock semantics and API vocabulary

- Replace `global_quality | market_local` with one active primary score concept:
  - `contextual`
- Add explicit optional secondary fields in API responses:
  - `contextualScore`
  - `contextualPercentile`
  - `overallScore`
- Stop using `displayScore` / `displayPercentile` as the long-term user-facing contract names
- Decide whether to keep compatibility aliases briefly during cutover; if yes, delete them in the same promotion sequence

## Phase 2: Backend query model

- Remove score-mode branching from:
  - `search-constraints.compiler.ts`
  - `search-query.builder.ts`
  - `search-coverage.service.ts`
  - `search.service.ts`
- Build contextual cohort scoring directly in the search SQL pipeline with window functions over the filtered candidate set
- Use canonical quality score as the base ordering signal for contextual rank generation
- Make shortcut/coverage/search-dot payloads emit contextual score fields from the same query-time cohort logic

## Phase 3: Search-context cohort logic

- Define cohort selection logic in one backend place:
  - single active market => one-market cohort
  - multi-market submitted universe => multi-market cohort
  - unresolved market + bounds => bounds cohort
- Remove any hidden assumption that "contextual" always means exactly one active market

## Phase 4: Mobile/UI cutover

- Delete the Local/Global rank sheet options from `SearchRankAndScoreSheets.tsx`
- Remove `scoreMode` from:
  - search store
  - request builders
  - runtime mutation orchestration
  - map render keys
  - perf harness config where it is user-facing behavior rather than diagnostics
- Make cards, pins, and route panels read:
  - `contextualScore`
  - with `overallScore` as secondary metadata only if needed
- Keep the same color palette, but drive it from contextual score

## Phase 5: Delete gates

Delete in the same promotion slice:

- `SearchScoreMode` shared type
- DTO enums accepting `global_quality | market_local`
- score-mode-specific client state and selectors
- search query branches that choose between canonical quality and display rank
- map/card conditional color logic based on score mode

After cutover, there should be no active UX path where the user is switching between local/global score modes.

## Current implementation pieces that are now outdated

These are the main remnants of the old model that should be removed or demoted.

### Backend

- `core_display_rank_scores` as the primary search UX score source
- `scoreMode` branching in search compiler/query builder/coverage service
- DTOs and contracts that still expose `global_quality | market_local`
- any path that assumes local score is always one active market percentile

### Shared contracts

- `SearchScoreMode`
- response fields named purely around old display-rank vocabulary when they actually mean contextual presentation

### Mobile

- explicit Local/Global toggle UI
- store persistence for score mode
- map/card/routing code that conditionally swaps between two score concepts

## Implications

### Good

- users see strong local variation when browsing locally
- users still get sensible broader ranking when they intentionally search broadly
- we keep a stable canonical score internally
- we stop exposing internal scoring jargon directly in the UI

### Tradeoffs

- contextual score becomes search-submission dependent, not universally fixed
- score payloads must be recomputed from the submitted cohort instead of reused from one precomputed market rank table
- any old analytics or tests that assumed `displayScore === market rank` need to be updated

## Judgment

This is a better model than both:

- fully global user-facing scoring
- the current explicit `Local / Global` toggle

The current quality-score implementation is not ideal for broad global comparisons because it is still materially driven by cumulative decayed mentions and upvotes from uneven communities. It is much more defensible as:

- a canonical underlying signal
- plus a contextual user-facing presentation layer

That means the right cutover is:

- keep canonical quality internally
- make contextual score primary in the product
- remove the toggle
- compute context from the submitted search universe

## Immediate implementation checklist

- [x] Replace the old score-mode plan language in active plans with contextual-score language.
- [x] Add contextual score fields to shared search response types.
- [x] Remove `scoreMode` from request DTOs and shared request types.
- [x] Build contextual geographic-cohort/window-function scoring into the main search SQL path.
- [x] Cut shortcut coverage and map-dot payloads to the same contextual score contract.
- [x] Remove mobile Local/Global toggle state and UI from active UX paths.
- [x] Switch cards, markers, sheets, and profile previews to contextual score as primary.
- [x] Delete the remaining user-facing reliance on `core_display_rank_scores`.
