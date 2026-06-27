# Crave Score — Rising / Heat Redesign (replace the 7d/28d snapshot delta)

> Status: planned (2026-06-27). Replaces the snapshot-based `score_delta_7d/28d` + `movementState`
> with a continuous, exponential-decay **heat-surge** metric computed from the mention ledger.
> Supersedes the §7 "Momentum (Δ) axis" approach in `crave-score-v3-endorsement-redesign-plan.md`.

## Goal

A single, continuous **"rising"** signal that:
- has **no hard 7d/28d window** — exponential half-life decay, like the polls Trending "heat"
  (`exp(−ln2/H · ageDays)`), but tuned for restaurant data;
- measures **surge vs. the subject's own baseline** ("mentions arriving faster lately than this
  place's long-run pace"), so it's NOT redundant with the stable ranking and naturally zeroes out
  steady/famous places;
- is **one precomputed column** read by *every* Rising toggle (search result list, favorites
  per-list sort, the "All" list) for automatic consistency;
- **deletes** the snapshot-history machinery (no warm-up, no `insufficient_history`);
- collapses all movement labels to a single **rising** concept (no cooling/stable/insufficient).

## The metric

Per subject (restaurant AND dish), compute two exponentially-decayed **mention-count** masses from
the existing ledger (mirror the slow pass the scorer already runs, just with a second half-life):

```
M_slow = Σ over mentions of  0.5 ^ (ageDays / 365)     # the existing stable mass (half-life 365d)
M_fast = Σ over mentions of  0.5 ^ (ageDays / H_fast)   # NEW, half-life ≈ 21 days (≈3-month horizon)

rising = M_fast − (H_fast / 365) · M_slow
```

**Why the coefficient `(H_fast/365)`:** for a constant mention rate, `M_fast = (H_fast/365)·M_slow`,
so a *steady* place (famous or not) lands at `rising ≈ 0`. Only places whose **recent rate exceeds
their own historical rate** go positive. One-liner: *"rising = mentions arriving faster lately than
this place's long-run pace."*

- **Counts, not upvotes.** Use decayed mention *counts* (like the polls heat counts distinct
  engagers, not vote totals). This makes one viral high-upvote comment a non-event — viral-resistance
  falls out of the design, no guard needed.
- **Sort key.** Rising toggle = `ORDER BY rising DESC` (stable `display_score` as tiebreak). Negative
  `rising` = "not rising"; there are no other states.
- **Display (optional).** If a 0–100 "rising score" is ever needed in UI, percentile-normalize
  `rising` the same way `display_score` is; for sorting, raw `rising` is enough.

### Config (one dial, like `endorsementHalfLifeDays: 365`)
- `risingHalfLifeDays` — **default 21** (≈3-month horizon: 0.5^(90/21) ≈ 5%). Start here; tune down
  toward ~14 (2-month) only if Rising feels stale once we have real data.
- (optional, off at launch) `risingConfidenceK` — the `k` in the smooth confidence multiplier below.
  A continuous knob, never a hard cutoff. Leave unset unless the cold-start board looks noisy.

### Thin data — handled by magnitude, not a floor
A hard floor is **not required for the best shape.** `rising` is in raw decayed-count units, so a
single recent mention yields a *small* value (≈ 1) that ranks far below a real surge (≈ 5 for five
recent mentions) — it can never dominate, only sit at the bottom of the rising set. It would "fill
slots" only in a cold/thin city where there aren't enough real surges yet, and there it isn't even
wrong (it's the genuine recent activity). **Ship the pure surge first.**

If you do want thin surges down-weighted, **bake it into the equation, don't bolt on a floor.** Use a
smooth confidence multiplier:

```
rising = (M_fast − (H_fast/365)·M_slow) · ( M_fast / (M_fast + k) )
```

The `M_fast/(M_fast+k)` term → 0 for tiny recent volume and → 1 once there's real recent mass, so a
1-mention surge is continuously discounted (≈ 1/(1+k)) while a real burst is untouched. This beats a
hard floor: **no cliff** (a place with 2 mentions isn't abruptly "in" while 1.9 is "out"), one smooth
knob. It's the pragmatic form of the ideal question — *"is the recent rate **significantly** above
baseline?"* — i.e. dividing the surge by its own uncertainty, which naturally shrinks thin data. Start
without it; introduce `k` only if cold-start noise actually shows up. (No percentile-difference
artifact either way — we subtract in raw units, not between two separately-percentiled values.)

## Per-user / source spam — decision: do NOT build dedup for Rising now

Investigated 2026-06-27:
- **Author is not stored structured.** `SourceDocument` has no author column (only `rawPayload`
  JSON). Note: dish *provenance* IS intact — `core_restaurant_item_mentions` is a rebuilt projection
  (a decay-ledger cache, written only by `projection-rebuild.service.ts`) derived from
  `RestaurantEntityEvent`, which carries `sourceDocumentId` + `extractionRunId` + `mentionKey` for
  every dish mention; the pipeline is replayable via `ReplayService`. What's missing is the *author*,
  at every layer. → Per-author dedup is **currently impossible** without parsing `rawPayload` +
  backfill, regardless of which layer you dedup at.
- **It adds no new risk.** The stable Crave Score already sums un-deduped Reddit mentions; Rising
  decays the same ledger faster, inheriting the existing (accepted) posture — it does not increase
  exposure.
- **The abusable source is already deduped.** Polls feed the score distinct-user-deduped
  (`COUNT(DISTINCT user)` leaderboard + per-comment graduation). The only un-deduped source is
  **Reddit**, which is founder-controlled and the least abusable.
- **Mitigations already in the design:** counts-not-upvotes + log/percentile damping + optional
  `risingMinRecentMass` floor bound single-source influence enough for launch.

**Future hardening (out of scope here, record only):** capture the Reddit author as a structured
field on `SourceDocument` (verify it's already in `rawPayload`), link dish mentions to a source, then
dedup BOTH `M_slow` and `M_fast` to distinct `(author, subject)` per window. This improves the whole
score, not just Rising, and only matters once user-submitted content is a large share.

## Step 0 — verify before building
1. Confirm the Reddit author lives in `SourceDocument.rawPayload` (informs the future-hardening cost;
   not needed for v1).
2. Confirm nothing outside the score service reads `core_public_entity_score_history` or
   `movementState` (verified 2026-06-27: history is read only by `loadPriorScores`; `movementState`
   has zero downstream consumers in search/mobile/packages — both safe to delete).
3. Confirm the per-subject mention aggregation used by the slow pass so the fast pass mirrors it
   exactly (dishes ← `core_restaurant_item_mentions`; restaurants ← restaurant-level events/composite).

## Implementation

### 1. Scorer — `apps/api/src/modules/content-processing/public-crave-score/public-crave-score.service.ts`
- **Add** a fast-decay aggregate alongside the existing slow mass (reuse the decay SQL at ~L417/434
  with a second half-life `risingHalfLifeDays`). Produce `M_fast` per subject; `M_slow` is the mass
  the slow pass already computes.
- **Compute** `rising = M_fast − (risingHalfLifeDays/365)·M_slow` per subject; write to the new
  `rising` column.
- **Delete** `loadPriorScores` (~L491–529) and its call site; **delete** the delta + movementState
  computation block (~L287–313); **delete** the history INSERT (~L618) and prune DELETE (~L670) and
  the history read (~L508); **delete** the `movement_state` writes in the upsert/insert SQL
  (~L560/576/590/629/644) and the `score_delta_7d/28d` writes.
- Add `risingHalfLifeDays: 21` (and optional `risingMinRecentMass`) to `DEFAULT_CONFIG` (~L40).

### 2. Schema + migration — `apps/api/prisma/schema.prisma`
- `PublicEntityScore` (`core_public_entity_scores`): **add** `rising Decimal? @map("rising")`;
  **drop** `scoreDelta7d` (`score_delta_7d`), `scoreDelta28d` (`score_delta_28d`), `movementState`
  (`movement_state`).
- **Drop** the entire `PublicEntityScoreHistory` model + `core_public_entity_score_history` table,
  and the `history PublicEntityScoreHistory[]` relation on `CraveScoreRun` (~L214).
- **Drop** the `CraveScoreMovementState` enum (~L1410) and its `@@map("crave_score_movement_state")`.
- Migration: `ALTER TABLE core_public_entity_scores ADD COLUMN rising numeric(18,6)`, drop the three
  columns; `DROP TABLE core_public_entity_score_history`; `DROP TYPE crave_score_movement_state`.
- Add an index for the new sort: `idx_public_entity_scores_subject_rising (subject_type, rising DESC)`.

### 3. Search — `apps/api/src/modules/search/`
- `search-query.builder.ts`: change the four Rising `ORDER BY` paths from `score_delta_7d` →
  `rising` — restaurants (~L1606), dishes (~L1654), restaurant-top-dish (~L1634), favorites
  connection (~L1578); and **rename in every SELECT** that carries it (e.g. ~L264, 306, 374
  (`'scoreDelta7d'` JSON key → `'rising'`), 388, 573, 586, 615, 621, 1422, 1438, 1457, 1473).
- `search.service.ts`, `search-query.executor.ts`, `search-coverage.service.ts`,
  `favorites/favorite-lists.service.ts`: rename `score_delta_7d` / `scoreDelta7d` references → `rising`.
- `search/README.md` (~L36): update the Rising description (no more "7-day delta"; now "rising heat").

### 4. Types + mobile
- `public-crave-score.types.ts`: delete `CraveScoreMovementState` (~L2) and the `movementState` field
  (~L55); rename `scoreDelta7d/28d` → `rising`.
- `packages/shared/src/types/search.ts`: rename `scoreDelta7d` → `rising` on the result types.
- `apps/mobile/src/...`: rename `scoreDelta7d` (and any `movementState`) → `rising` on result +
  favorites types. (Grep `scoreDelta7d`, `score_delta_7d`, `movementState`, `movement_state` repo-wide
  to catch all consumers — the Rising toggle UI itself is unchanged, it just sorts by the new field.)

## Explicit DELETE / RENAME checklist

**Delete (schema):** `score_delta_7d`, `score_delta_28d`, `movement_state` columns;
`core_public_entity_score_history` table; `crave_score_movement_state` enum; `CraveScoreRun.history`
relation.

**Delete (code):** `loadPriorScores`; the delta/movementState compute block; history insert/prune/read;
`movement_state` SQL writes; `CraveScoreMovementState` type + `movementState` field in types.

**Rename:** `scoreDelta7d` / `score_delta_7d` → `rising` everywhere (scorer SELECTs, search builder/
executor/service/coverage, favorites service, README, shared types, mobile types). `scoreDelta28d` is
removed, not renamed.

**Add:** `rising` column + index; `M_fast` aggregate + `rising` computation in the scorer;
`risingHalfLifeDays` (default 21) config.

## Rollout
- **No backfill, no warm-up.** `rising` is computed from the ledger at the next score run, so every
  subject has a value on the first run after deploy (the old snapshot delta needed ~7 days of history).
- Ship the column + scorer first (populate `rising`), then flip the search ORDER BY, then drop the old
  columns/table/enum once nothing references them.

## Leave alone
- **The polls Trending heat** (`polls.service.ts`, `POLL_TRENDING_HALF_LIFE_DAYS = 3`) is a separate
  system for ranking the poll *feed* by engagement velocity. It's pure heat (no baseline subtraction)
  because feed redundancy with "Top" is fine there, and it's already spam-safe via distinct-engager
  dedup. **No change.**
