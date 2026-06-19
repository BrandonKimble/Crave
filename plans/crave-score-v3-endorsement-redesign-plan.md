# Crave Score v3 — Endorsement Redesign Plan

## Status

Ground-up redesign of the public Crave Score. Design agreed 2026-06-19; **not yet implemented.**
Supersedes the scoring math in `plans/crave-score-cutover-plan.md` (which is kept for its
non-scoring product framing). Replaces `crave-score-v2`.

This is a cleanup-first cutover, per project ethos: no compatibility aliases, no parallel
scoring systems left standing, no faked signals — just the correct flow.

---

## 1. Why (the diagnosis that drove this)

Two problems, both proven on real data (1,801 restaurants / 1,175 dishes):

1. **The score compresses to ~80 and the map is one color.** `crave-score-v2` is
   `displayScore = sigmoid(entityConfidence^3.8 × robustZ(rawQuality))`. At our evidence
   levels confidence ≈ 0.3, and `0.3^3.8 ≈ 0.01` annihilates the signal → everything
   collapses to the curve's neutral point (~80). Only ~3 of the 8 map color buckets are
   ever used; nothing scores below ~75.
   - **Confidence shrinkage is the wrong tool for our data.** Bayesian/confidence shrinkage
     suits noisy _ratings_ (Google/IMDb, where review count = popularity-noise you distrust).
     Reddit mentions are _volitional endorsements_ — people only post when a place is worth
     posting about, so the count **is** the quality signal. There is no rating to shrink
     toward a mean. → Delete the confidence/posterior/robust-z-shrink machinery entirely.

2. **The scorer ignores restaurant-level endorsement.** `restaurant_raw` in
   `apps/api/src/modules/content-processing/public-crave-score/public-crave-score.service.ts`
   builds restaurant evidence only from dish rollups (`core_restaurant_items`) and uses the
   `core_restaurant_events` praise ledger _only to count distinct source documents_ —
   discarding the mentions and upvotes. `generalPraiseUpvotes` is unused. Result: 68% of
   restaurants (those without dishes) read as empty and pile at 80. In reality only **28 of
   1,801 (2%)** are truly empty — 90% have general praise, 97% have mention events
   (~45k ignored upvotes). They aren't empty; their endorsement is in fields we don't read.

A third structural fact: there are **two parallel scoring systems**. The old
`quality-score.service.ts` (PRD §5.3 — `50% top dishes + 30% consistency + 20% general
praise`, decayed) still runs in the Reddit collector / `projection-rebuild` path and writes
`foodQualityScore` (used for search ordering). `public-crave-score` (the map score) ignores
it and recomputes from raw counts. This redesign unifies them into one score.

> **This redesign is also a prerequisite for community-polls Phase 5C** (`§6.3` close-time
> graduation). That plan assumes "mentions flow into the same evidence ledger the scoring
> layer already rebuilds from" — but the scorer doesn't actually rebuild from the events
> ledger today. Until it does, poll/contribution endorsement would land in
> `core_restaurant_events` and never move the score. Fixing the score to read the unified
> ledger is what makes 5C deliver. See [[polls-plan-structure]].

---

## 2. Philosophy — what the score means

> **The Crave Score = a place's standing among the places the community actually
> recommends** — its recency-weighted _endorsement strength_. We trust the counts. No faked
> confidence; uncertainty is expressed by _absence_ (unrated), not by shrinking toward a
> neutral middle.

- **Votes = mentions = endorsements = (future) profile-adds.** All are equal endorsement
  events in one source-tagged ledger; equal weight by default (tunable per `source_kind`).
- **Decay is the Reddit phase-out engine.** Equal source weights + time decay means old
  Reddit data naturally fades as in-app (poll/contribution) endorsement accrues — no manual
  reweighting needed. If we ever want to accelerate the transition, lower the `reddit`
  source weight; the architecture allows it.
- **Two axes.** A stable _endorsement score_ (this doc) and a _momentum (Δ)_ axis (§7) that
  surfaces new/rising/hidden gems. A new or thin place is honestly "low but rising," not
  buried in a neutral pile.

---

## 3. Foundation — the unified endorsement ledger

The score rebuilds from the source-tagged evidence ledger, not from denormalized rollups:

- `core_restaurant_events` — **restaurant-level** endorsement (by-name mentions / general
  praise), with `source_upvotes`, `mentioned_at`, `evidence_type`, `mention_key`,
  `source_document_id`, and (per polls 5C) `source_kind ∈ {reddit, poll_thread, …}`.
- `core_restaurant_entity_events` — **dish/entity-level** endorsement (a specific item at a
  restaurant). Same shape.
- `core_restaurant_items` — the connection (dish) projection; its decayed fields
  (`decayedMentionScore`, `decayedUpvoteScore`, support variants) are the recency-weighted
  dish signal.

Rules:

- **Source-agnostic with per-source weights.** Default weight `1.0` for every `source_kind`.
- **Decay / recency** via the existing `decayed*` fields (and `mentioned_at` for events).
  Keep the existing half-lives as a starting point (mentions ~365d, upvotes ~240d), tunable.
- **Dedup is handled upstream at ledger-write** — polls dedup by distinct user per the
  community-polls plan §13A; Reddit by `mention_key`. The scorer counts already-deduped
  events and adds no dedup logic of its own.

---

## 4. The model

### 4.1 Dish score (atomic → flat)

A dish has no internal structure, so its score is simply its own endorsement strength:

```
E_dish(d) = w_m · log1p(decayedMentionScore_d  + supportDecayedMentionScore_d)
          + w_u · log1p(decayedUpvoteScore_d   + supportDecayedUpvoteScore_d)
```

- `displayDish(d) = globalPercentile_over_dishes(E_dish) → [60, 99.9]`.
- Drives the **dish-side** results ranking and the dish-map-toggle color.
- Replaces `foodQualityScore` for search ordering (§9 retires `quality-score.service`).

### 4.2 Restaurant score (composite → discounted acclaim + praise)

A restaurant _is_ composite (a bundle of dishes + its own by-name praise), so it aggregates.
The aggregation is a **discounted sum of its dishes' endorsement, best-first**, plus a
general-praise term — never a flat volume sum (which rewards menu size over quality) and
never an average (which lets one weak dish drag a great place down):

```
dishes      = sort_desc( [ E_dish(d) for d in restaurant.dishes ] )      // raw endorsement, pre-percentile
acclaim(r)  = Σ_i  discount(i) · dishes[i]          // discount(i) diminishing, i = 0,1,2,…
praise(r)   = w_pm · log1p(decayedRestaurantMentions_r)
            + w_pu · log1p(decayedRestaurantUpvotes_r)            // from core_restaurant_events
E_rest(r)   = w_dish · acclaim(r)  +  w_praise · praise(r)
displayRest = globalPercentile_over_restaurants(E_rest) → [60, 99.9]
```

What this single mechanism buys:

- **Peak ("great dishes"):** the best dish dominates (`discount(0)=1`). The Franklin-brisket
  intuition. A standout dish makes a restaurant great.
- **Breadth, not average:** each additional good dish _adds_ a smaller increment; a weak dish
  adds ≈0 and never _drags_. Deep-good menus are rewarded; one bad dish costs nothing. No
  separate consistency/average term needed.
- **General praise:** its own additive slot — the by-name "people love this place" signal —
  which also **carries dishless restaurants** (their `acclaim` term is 0, `praise` stands
  alone). Same equation for every restaurant; nothing hard-zeros.
- **Gated by endorsement:** only endorsed evidence contributes (a dish must clear its own
  ≥1-mention floor; a blank/user-added dish contributes nothing until it's actually
  mentioned/voted). Inflation by adding empty dishes is impossible.

**The discount curve is the one product dial** (replaces the old 50/30/20 + magic scales).
Geometric `discount(i) = ρ^i`, ρ∈(0,1):

- steep (ρ→0): a restaurant is rated by its single best dish.
- shallow (ρ→1): approaches flat volume sum (breadth dominates).
  Default start: **ρ ≈ 0.5** (lean peak, depth a bonus), tuned against real data + eyeballing
  the resulting map/rankings (§10). Flat-sum and the old hard-capped top-5 are both special
  cases of this curve.

### 4.3 Normalization — global percentile

- Normalize each subject type **globally** (restaurants among restaurants, dishes among
  dishes): rank → `[60, 99.9]`. One stable meaning everywhere (a "72" means the same in
  Austin and NYC). Austin still spreads locally; NYC honestly runs greener.
- Proven on real data: global percentile over the endorsed set → ~13% of restaurants in
  **every** one of the 8 map color buckets, full 60–100 range.
- Default mapping is uniform percentile; an optional mild S-curve (smoothstep) to fatten the
  middle or tails is a tunable, decided by eyeballing the map (§10).
- **Color = score, everywhere.** No relative/percentile-per-viewport coloring, no hybrid —
  rejected as "two color meanings on one screen." (`apps/mobile/src/utils/quality-color.ts`
  buckets stay as-is.)

---

## 5. Inclusion & visibility

- **Inclusion floor: `E_rest > 0`** (any endorsement — a dish mention or by-name praise).
  ~98% of restaurants qualify. The ~28 true empties (no dishes, no events, no praise) are
  **unrated and hidden**, not scored.
- Dishes are 100% endorsed already (every connection has ≥1 mention).

Visibility matrix:

| Surface                   | Ranks                | Shows dishless restaurants?       |
| ------------------------- | -------------------- | --------------------------------- |
| Results — restaurant side | restaurants by score | ✅ yes                            |
| Results — dish side       | dishes (connections) | ❌ no — nothing to rank           |
| Map — restaurant view     | restaurants by score | ✅ yes                            |
| Map — dish toggle         | dishes               | ❌ no                             |
| Anywhere                  | —                    | ❌ hide only the ~28 true empties |

- A high-praise **dishless restaurant is a feature**: it shows a strong pin on the restaurant
  surfaces and becomes the **collection hook** — its empty dish panel is the "add a dish"
  entry point. Per the polls roadmap, adding a dish/restaurant from the profile will act as a
  vote = a mention = an endorsement event (community-polls §11, deferred). The score needs no
  special handling for that — the contribution simply lands in the ledger and counts.

---

## 6. (removed — folded into §4/§5)

---

## 7. Momentum (Δ) axis & the Rising filter

The stable endorsement score answers "how strong is this place's standing." A second axis —
recency momentum — answers "what's climbing": new spots, hidden gems, places popping off that
the stable score ranks low today. A new place is honestly "low but rising," surfaced here
rather than inflated into the main ranking.

### 7.1 The signal (already exists, both sides)

- `scoreDelta7d` / `scoreDelta28d` / `movementState` are already computed for **both**
  restaurants and dishes and stored on `core_public_entity_scores`. v3 recomputes them on the
  v3 score (better signal than v2's).
- Δ is computed **within a score version** — never compared across the v2→v3 regime change
  (first v3 run → null deltas / `insufficient_history`, which is correct).

### 7.2 Backend — a "Rising" sort (small)

- The search query **already SELECTs `score_delta_7d`** for restaurants and dishes
  (`search-query.builder.ts`) — it's fetched, just unused for ordering.
- Sorting is parameterized via `plan.ranking.restaurantOrder` / `foodOrder` → `ORDER BY`.
  Rising = **one new order option**: `ORDER BY score_delta_7d DESC` (display_score tiebreak),
  for both the restaurant and dish ranked CTEs. No new data pull.
- Because the sort lives in the search query, it **automatically** (a) re-populates map pins
  (same query feeds list + markers) and (b) resets pagination while preserving sheet state —
  no bespoke pin/pagination path needed.

### 7.3 Frontend — a Rising toggle (clone the votes filter)

- Add a toggle to the strip in `apps/mobile/src/screens/Search/components/SearchFilters.tsx`,
  styled with the existing `buildToggleBaseStyle` + accent-when-active. **There is no old
  global/local toggle to reuse** — the closest was a dead `filter_rank` enum removed Jun 18,
  never rendered; use the current toggle styling.
- **Clone the `100+ votes` filter toggle end-to-end** — it already does exactly what's
  required (reruns search, updates pins, preserves sheet state, rapid-tap safe via
  `scheduleToggleCommit`, resets pagination):
  - store state + setter in `useSearchStore`
  - handler in `query-mutation-orchestrator.ts` mirroring `toggleVotesFilter` →
    `fireRerunActiveSearch({ … preserveSheetState: true, ranking: 'rising' })`
  - add `filter_rising` to `ToggleInteractionKind` (`results-toggle-interaction-contract.ts`)
- Works on whichever side is active: Rising + restaurants → restaurants by Δ; Rising + dishes
  → dishes by Δ.
- **Must match the other toggles' performance/state/loading contract exactly** (rapid-tap
  safe, sheet state stable, loading cover). If any existing toggle diverges from that
  contract, bring it in line as part of this work.

### 7.4 Dependency & sequencing

- Rising reads `score_delta_7d`, so it's **forward-compatible**: it functions on today's v2
  deltas but is only _meaningful_ once v3 produces good deltas. So it's a fast-follow to the
  scoring work, built in this plan at Phase 4 — after the score + deltas are solid.

---

## 8. Knobs & defaults

| Knob                   | Default                       | Notes                                                                                                                  |
| ---------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `source_kind` weights  | 1.0 each                      | equal votes=mentions=adds; lower `reddit` later to accelerate phase-out                                                |
| discount steepness `ρ` | **0.5**                       | peak-vs-breadth dial (Phase 0: 0.4–0.6 barely differ — most menus are short)                                           |
| `w_dish` / `w_praise`  | **1.0 / 2.0**                 | Phase 0: praise×2 softens the has-dishes cliff, keeps the top iconic, lets beloved dishless places reach ~top quartile |
| dish `w_m` / `w_u`     | **0.7 / 0.3**                 | mention vs upvote weight (Phase 0 validated)                                                                           |
| decay half-lives       | mentions ~365d, upvotes ~240d | the Reddit phase-out rate                                                                                              |
| percentile curve       | uniform                       | optional smoothstep, decided by eyeballing the map                                                                     |

---

## 9. Migration & cleanup

- Bump `scoreVersion` `crave-score-v2 → crave-score-v3`; `displayCurveVersion` only changes
  if the percentile mapping changes (it conceptually does — set a v3 curve id).
- **Delete** from `public-crave-score`: `entityConfidence` / `entityConfidencePower` /
  `confidenceShrink` / `posteriorSignal` / `marketReliability` blend / robust-z stats — the
  whole shrinkage pipeline. Replace `loadCandidates`' `restaurant_raw`/`connection_raw` with
  the unified-ledger endorsement reads (§3–§4).
- **Retire `quality-score.service.ts`** (and its module/types/repo wiring in the Reddit
  collector + `projection-rebuild`). Its `foodQualityScore` / search-ordering role is served
  by the new flat dish score. One scoring system, not two.
- First v3 run yields `insufficient_history` / null deltas (history filters by score version —
  correct for a regime change).
- Orphaned-score pruning: see existing follow-up (rebuild already gained `pruneStaleSubjects`).

---

## 10. Validation plan (prove before/while building)

- **Phase 0 — model probe (no production code):** compute v3 (`E_dish`, `E_rest` with the
  discount, praise, global percentile) over all real subjects via a throwaway script
  (`NestFactory` context + the ledger reads). Show: the 8-bucket distribution, and a named
  list of top / median / bottom restaurants and dishes, so we sanity-check that beloved
  one-hit places and broadly-strong places both surface sensibly. Tune `ρ`, `w_dish/w_praise`,
  and the percentile curve here by eyeballing — lock them before writing service code.
- Re-run the fixtures validator (`scripts/validate-crave-score-fixtures.ts`) rewritten around
  v3 expectations (full-range distribution; no pile; dishless carried by praise).

---

## 11. Phasing

1. **Phase 0 ✅** — model probe + dial tuning on real data (§10). Dials locked: ρ=0.5,
   w_dish/w_praise=1.0/2.0, dish w_m/w_u=0.7/0.3.
2. **Phase 1 ✅** — unified-ledger candidate loader (restaurant praise via
   `core_restaurant_events` + dish rollup via `core_restaurant_items`).
3. **Phase 2 ✅** — v3 math: flat dish score; discounted-acclaim + praise restaurant score;
   global percentile; shrinkage pipeline + market-stats deleted; bump v3. Migration
   `20260619120000_crave_score_v3`. Verified on real data + the rewritten fixture validator.
4. **Phase 3 — split:**
   - **✅ Inclusion floor (backend, done):** scoring excludes true empties (E_rest=0; the ~28
     no-dish/no-praise shells get no score row → absent from search via the INNER score join).
   - **⏸ Surfacing relaxation (deferred — ships WITH frontend):** the restaurant search still
     requires `EXISTS core_restaurant_items` (`search-query.builder` ~L126). Relaxing it to
     `items OR core_restaurant_events` would surface endorsed dishless restaurants — but that
     pushes them into result cards/pins the (deferred) frontend isn't built to render
     (empty dish view). So the gate relaxation ships together with the dishless-card/pin
     frontend work, not before it. Dish surfaces already only show has-dishes (they rank
     connections), so no change needed there.
5. **Phase 4 — Rising filter (§7):** backend sort on `score_delta_7d` + mobile toggle. The
   backend sort is only triggered by the (deferred) toggle via the query plan, so it ships
   with the frontend too; build both together as the documented fast-follow.
6. **Phase 5 — retire `quality-score.service` (partial: public surfaces done; deletion blocked):**
   - ✅ **No public surface depends on it anymore.** Dish search ordering already used
     `pcs.display_score` (the v3 connection score). Autocomplete (`entity-text-search.service`)
     was migrated off `restaurant_quality_score` onto the v3 restaurant score via scalar
     subquery (commit `5151aab0`). So the map, main search, and autocomplete are all off
     quality-score.
   - ⛔ **Service deletion is blocked by shared infrastructure, not just scoring.** Beyond
     writing `foodQualityScore` / `restaurant_quality_score` (via `refreshQualityScores`, called
     from `unified-processing`, `replay`, and `restaurant-entity-merge`), quality-score **hosts
     the decay-config** (`timeDecay.mentionCountDecayDays` / `upvoteDecayDays`, with
     `QUALITY_SCORE_*` env overrides) that `projection-rebuild.buildRestaurantItemProjections`
     uses to compute `decayedMentionScore` / `decayedUpvoteScore` on every connection. Deleting
     the service would break decayed-score computation in the live projection layer. Retiring it
     cleanly first requires **relocating the decay config** to a standalone home and tracing all
     `decayed*` consumers (search/activity/etc.) — a deliberate, testable refactor, not a blind
     autonomous deletion. Left as the next focused pass. The redundancy is benign meanwhile.
7. **(Unblocks)** community-polls Phase 5C — poll/contribution endorsement now flows into the
   score because the scorer reads the unified ledger.

---

## 12. Open / tuning questions

- Discount steepness `ρ` (peak vs breadth) — tune on data (§10).
- `w_dish` vs `w_praise` balance — tune on data.
- Should `generalPraiseUpvotes` be used directly or is it a denormalized rollup of
  `core_restaurant_events` (double-count risk)? Verify the source-of-truth at implementation;
  prefer the event ledger as canonical.
- Whether a single comment that praises both a place and a dish logs to both ledgers
  (potential mild double-count); dedup by `mention_key`/source if so.
- Percentile curve shape (uniform vs gentle S-curve) — decided by eyeballing the map.

---

## 13. Decay & recency — ideal shape + status

**Recency window — RETIRED (Phase 5 Step 1, done).** `recentMentionCount` / `activityLevel`
were display-only and the delta/momentum axis subsumes "active/hot/rising". Gone.

**Decay — ideal shape (designed, NOT yet implemented):**

- **Exponential, ONE half-life, applied per event by the event's age.** Kill the old
  mention-365d / upvote-240d asymmetry — a mention and its upvotes are the same event at the
  same instant. One dial: `endorsementHalfLifeDays`, framed as the **community-memory
  half-life** ("how long an endorsement stays ~half-trustworthy"). Restaurants drift over
  years → start ~**12–18 months**, tune by eyeballing whether once-hot-now-quiet places sink.
- **Decay-on-read, from the event ledger, by the original post date.** Compute at rebuild in
  SQL: `weight = power(0.5, age_days / halflife)`, `age_days` from the event's **`mentioned_at`**
  — which is the Reddit post date (`mentionCreatedAt = new Date(mention.source_created_at)`;
  verified equal to `collection_source_documents.source_created_at` for 100% of events, so no
  source-doc join is needed). Sum decayed weights over `core_restaurant_entity_events` (dishes) /
  `core_restaurant_events` (praise). No materialized decayed columns (dropped). Data in DB, dial
  in code, math in SQL at rebuild. This moves dish endorsement onto the event ledger too
  (advances the 5C foundation).

**⏸ Deferred to the launch archive collection.** Today's corpus is a **~2-week slice** because
_chronological_ collection only pulls recent posts (post dates 2026-05-17 → 06-01, ages 20–32d).
At any sane half-life every event weighs ~0.95 → decay is inert and the half-life is untunable
now. At launch, the **archive collection backfills ~5 years of historical posts**; the post-date
plumbing is already correct (`mentioned_at` = post date), so the data will span years and decay
becomes meaningful + tunable automatically — **no data-pipeline work needed for decay.** Remaining
work then is just **implementing Step 2** (the loadCandidates decay-weighted sum above + the one
`endorsementHalfLifeDays` dial) and **tuning the half-life** by eyeballing whether once-hot-now-
quiet places sink. Until then v3 stays on raw counts — correct, just time-flat (which is fine,
since the whole corpus is the same age anyway).
