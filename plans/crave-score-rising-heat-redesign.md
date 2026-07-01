# Crave Score — Endorsement-Count Unification + Rising/Heat Redesign

> Status: **IMPLEMENTED + verified locally (2026-06-28)** — expand release done: new scorer (pool +
> dual-pass), schema expand + M1 migration applied to local `crave_search`, global rebuild populated
> `rising` (1773 restaurants + 1175 dishes, 100% coverage, centered ≈0), full rename sweep (API +
> shared + mobile) at 0 tsc errors, fixture validator green (0 fails). **REMAINING:** deploy M1 +
> global rebuild to prod, then the **M2 contract** migration (drop legacy) as a separate later release
> (SQL staged below), and mobile runtime verification.
>
> Originally planned, red-teamed ×2 (2026-06-27). Two coupled changes: (1) **unify the base endorsement
> model** to a single decayed person-endorsement count (drop the split `0.7·log1p(mentions) +
> 0.3·log1p(upvotes)`), and (2) replace the snapshot `score_delta_7d/28d` + `movementState` with a
> continuous **dual-pass score-point surge** (`rising = recent − baseline`). Supersedes the §7
> "Momentum (Δ) axis" approach in `crave-score-v3-endorsement-redesign-plan.md`.

## Base-score model — pool mentions + upvotes 1:1 (KEEP the log)

The atomic unit is **one person-endorsement**, and a Reddit upvote = a mention = a poll like = **1**.
The ONLY change is pooling the two channels equally; **keep `log1p`** (see below for why):

```
# OLD:  endorse = 0.7·log1p(Σ decayed mentions) + 0.3·log1p(Σ decayed upvotes)
# NEW:  endorse = log1p( Σ decayed mentions  +  Σ decayed upvotes )     # = log1p(endorsers)
#        where  endorsers = Σ over the subject's mentions of (1 + source_upvotes)·0.5^(age/H)
```

- **DELIBERATE, NON-COSMETIC change — validate empirically.** This is NOT rank-preserving: `0.7·log(m)+
  0.3·log(u)` and `log(m+u)` are different functions of two variables, so they reorder subjects (e.g. a
  dish at (1 mention, 50 upvotes) rises above (10, 10) — the intended effect of counting upvotes as
  full equal votes). There is no percentile-invariance argument; the earlier claim was wrong.
- **Mentions and upvotes pool 1:1** (each unit = 1 person): `1 (author) + its upvotes`. Drop the
  `dishMentionWeight` / `dishUpvoteWeight` split from `DEFAULT_CONFIG`. The SQL change is literally
  *summing the two existing decayed columns* (`mentions + upvotes`) before the log — not a new aggregate.
- **KEEP `log1p` — it is load-bearing, not cosmetic.** For *dishes* (a single pooled mass) log-vs-raw is
  rank-identical, so the log costs nothing there. For the *restaurant composite* the log is essential:
  the composite percentiles a COMBINED value `dishWeight·(rho-discounted acclaim) + praiseWeight·praise`,
  and `rho`/`dishWeight`/`praiseWeight` were tuned against **log-scale operands (~0–5)**. Feeding raw
  counts (~0–hundreds) silently re-tunes those dials (a viral single-dish place leaps over a broad
  beloved one). Keeping the per-term `log1p` holds the composite operands on the tuned scale, so the
  composite dials stay valid and need **no** re-derivation.
- **Polls already route correctly with zero graduation change.** `comment.score` *is* the distinct-liker
  count (maintained in lockstep with `PollCommentLike` rows: PK `[commentId,userId]`, ±1 in the same
  tx), and it flows to `source_upvotes`. So under `endorse = log1p(mentions + upvotes)`, a comment with
  N likes already contributes `1 (author) + N (likers)` — consistent with Reddit. **Do NOT touch
  graduation** (the earlier per-liker proposal is infeasible AND unnecessary). Non-goal: per-liker decay
  timestamps (all likes inherit the comment's `mentioned_at`).
- **Sentiment stays a binary net-positive gate** (already in the LLM collection prompt). DECIDED: no
  per-mention 1–10 intensity weighting — self-selection already encodes sentiment, intensity rewards
  expressiveness over genuine strength (a systematic hype-bias), and it adds LLM noise/drift to an
  objective count. If ever revisited, use 2–3 claim-based tiers (casual vs explicit-superlative), not a
  continuous score.
- **The score leans volume/popularity by design** ("most endorsed/beloved"), same as today — not
  exposure-normalized "quality." That's an accepted, deliberate meaning; exposure-normalization is a
  future dial, out of scope.

## The metric — dual-pass display-point surge

Run the EXISTING scorer **twice** per run, identical except the decay half-life, and diff the two
display scores:

```
display_score       = score(half-life = 365d)  → percentile → 0–10   # today's "all-time" score (10·percentile)
display_score_fast  = score(half-life ≈ 21d)   → percentile → 0–10   # NEW "recent-weighted" score, SAME mapping
rising = display_score_fast − display_score                          # rating POINTS (0–10 units), signed
```

> **Display band:** the public score is on the native `0–10` scale (`10·percentile`, stored at 2
> decimals; `rising` at 3). See `plans/crave-score-1to10-scale-migration.md` for the band/format
> spec. References to the old `60–99.9` band below are historical — the percentile mechanics are
> unchanged, only the affine output band moved.

- **Same scorer, both passes.** Dishes go through dish scoring; restaurants through the rho-discounted
  composite (dish-acclaim + praise). We do NOT need a separate restaurant raw-count rollup — running
  the composite at the fast half-life gives `display_score_fast` for restaurants for free. **This
  dissolves the restaurant-composite blocker.**
- **It's a genuine score-point delta** (both operands are on the same `0–10` scale), so it drives the
  "↑X.X pts" arrow directly (rating points), and `ORDER BY rising DESC` is the Rising sort. One
  quantity, both jobs.
- **Inherits the unified base model above.** Both passes use the new `endorsers` count; rising is the
  fast-vs-slow display delta on top of it. No separate mention/upvote handling.
- **Semantic shift (intentional):** the old arrow was *temporal* ("moved +X over 7 days," needed
  snapshots). This is *cross-sectional* ("ranks +X higher on recent activity than on its baseline").
  Reads identically to a user, is always fresh (no warm-up), and is snapshot-free.
- **Steady ≈ 0 (approximate).** A place whose recent rate matches its baseline scores ~the same both
  passes → rising ≈ 0. Surging → positive; cooling → negative. Discrete sparse arrivals scatter around
  0, they don't sit exactly at it.
- **Global, not market-scoped.** `display_score`/percentile are global today (no market filter in
  `loadCandidates`); both passes and rising are likewise global. Per-market rising is NEW behavior
  (market-partitioned aggregation) — a deliberate non-goal here.
- **Thin data** is damped by the percentile mapping + the existing inclusion floor (a 1-mention place
  sits low in the fast percentile too), so no floor is required. If the cold-start board ever looks
  noisy, prefer raising the inclusion floor for the fast pass over a hard cutoff.

### Config
- `risingHalfLifeDays` — **default 21** (≈3-month horizon). One dial, tunable.

### Sort discrimination — sort on `rising`, stored at high precision
**Sort on `rising` (the point delta) — the SAME key as the displayed arrow**, so the Rising list is
always monotone in the number users can see. Do NOT sort on a percentile delta: because `display_score`
is a *nonlinear* map of percentile, the percentile delta is a *different ordering*, so sorting by it
while showing the point delta would put `↑3.0` above `↑5.0` (looks broken).

The "mushy tail" is a *precision* problem, not a wrong-key problem: it only happens if `rising` is
derived from the `0.1`-granular stored `display_score`. Fix it by **computing `rising` from the
un-rounded percentile→display values and storing it at `Decimal(5,3)`** (≈0.001 granularity); display
the arrow rounded to `0.1`. Clean tie-free sort + sort == arrow. (Ties cluster near `rising ≈ 0` — the
bottom of the list — anyway.) Never sort restaurants and dishes together by rising without per-type
normalization (the four sort paths are per-type, so within-type is fine).

## Per-user / source spam — unchanged posture
Rising inherits the base score's dedup posture (Reddit mentions un-deduped; polls distinct-user
deduped). It adds no new exposure. Future hardening: capture the Reddit author on `SourceDocument`,
then dedup the masses to distinct `(author, subject)`.

## Implementation

### 0. Verify before building
- Nothing outside the score service reads `core_public_entity_score_history` or `movementState`
  (verified: history read only by `loadPriorScores`; `movementState` has zero downstream consumers).
- `endorsementRaw` / `factorTrace` are **write-only** (zero downstream readers in api/mobile/packages) —
  safe; note `endorsement_raw` now holds hundreds–thousands instead of <10 (fits `Decimal(18,6)`).
- **`plans/polls-creation-feed-and-cadence-plan.md` references `core_public_entity_score_history`
  (~L467/849/911/978)** — reconcile before dropping the table (poll trending heat reads
  `poll_endorsements`/`poll_comments`, not score history — confirm and update that plan).
- **Add reorder-regime fixtures BEFORE shipping** — the scorer has **zero `*.spec.ts` coverage**, and
  the existing fixtures (`validate-crave-score-fixtures.ts` ~L218-256) use extreme separations that
  survive any model by luck (a green run would falsely imply "rankings didn't shift"). Add cases that
  exercise the flip: a *viral single-dish* restaurant vs a *broad-modest + praise* one; a *one-hot-comment*
  dish vs a *many-low-upvote-mentions* dish. Pin the intended ordering; run under old + new.

### 1. Scorer — `public-crave-score.service.ts`
- **Pool the endorsement channels** (the base change): in `endorse()` (~L154-156) use
  `log1p(mentions + upvotes)` — i.e. sum the two existing decayed columns (`mentions = SUM(decay)`,
  `upvotes = SUM(source_upvotes·decay)`, dish SQL ~L434-435; restaurant praise ~L447-448) before the
  log. **Keep `log1p`.** Remove `dishMentionWeight` / `dishUpvoteWeight` from `DEFAULT_CONFIG` (~L40).
  Restaurant composite (`dishWeight`/`praiseWeight`/`rho`) is **unchanged** — the log keeps its operands
  on the tuned scale. **No `poll-graduation.service.ts` change** (`comment.score` already = distinct-liker
  count). Optionally update `factorTrace.endorsement` to store the pooled count for diagnostic clarity.
- **Dual-pass inside ONE `rebuildAllScores`** — do NOT issue a second `createRun`/`writeScores`/prune
  (the keyed upsert + `pruneStaleSubjects` DELETE of rows with a different `score_run_id` ~L582/605-608
  means a literal second run wipes the first). Instead: `loadCandidates` emitting BOTH decayed masses in
  ONE SQL pass (two `SUM(power(0.5, age/H))` columns, `H=365` and `H=risingHalfLifeDays`, to avoid
  scanning the heavy mention/event tables twice); run `scoreCandidates` twice in-memory → two
  `rawDisplay` maps keyed `subjectType:subjectId`; compute `rising` per subject; write ONE row per
  subject. Both passes MUST share the identical `displayMin`/`displayMax` (override ONLY the half-life).
- **Compute `rising` from PRE-ROUND display values.** `buildScored` rounds `displayScore` to 0.1 at
  construction (~L282-285) and that rounded value is the only one that survives — diffing it reproduces
  the mushy tail. So carry a `rawDisplay = displayMin + (displayMax−displayMin)·percentile` (un-rounded)
  for BOTH passes on `ScoredCraveSubject`; set `rising = rawDisplayFast − rawDisplaySlow`, round to 3dp
  only for the `numeric(5,3)` write; keep the 0.1-rounded `displayScore` solely for the visible score +
  arrow. (Without this, `Decimal(5,3)` precision is inert.)
- **Delete as one unit** (else compilation breaks): `loadPriorScores` (method + call site ~L102), the
  `priorScores` var + params threaded through `scoreCandidates`/`buildScored`
  (~L106/148-151/276-279/286), and the `rawDelta7d/28d` + `movementState` block (~L286-313).
- **Delete** the history INSERT/prune (~L618/670) and read (~L508), and the `movement_state` /
  `score_delta_7d/28d` writes in the upsert SQL (~L560/576/590/629/644).
- Add `risingHalfLifeDays: 21` to `DEFAULT_CONFIG` (~L40).
- During the expand phase the new scorer writes `rising`, omits legacy columns (legacy nullable per M1).

### 2. Schema + migration — EXPAND / CONTRACT across ≥2 deploys (do NOT do it atomically)
Prisma `migrate deploy` is atomic per migration, so split:

**M1 (expand):**
- `ALTER` `movement_state` → **nullable** on BOTH `core_public_entity_scores` and
  `core_public_entity_score_history` (both are `NOT NULL` no-default today — without this neither old
  nor new binary can write during rollover).
- `ADD COLUMN rising numeric(5,3)` (nullable, signed point delta, range ~±10 in 0–10 units with 0.001 precision so
  the sort tail isn't mushy) on `core_public_entity_scores`; in `schema.prisma` use
  `rising Decimal? @db.Decimal(5,3)` (NOT bare `Decimal?`; computed from un-rounded display values, not
  the 0.1-granular stored `display_score`).
- Add index `idx_public_entity_scores_subject_rising (subject_type, rising DESC)`.
- **Deploy the new scorer** (writes `rising`, stops writing legacy/history). `rebuildAllScores` fires
  from long-lived pipelines (`reddit-batch-processing.service.ts`,
  `restaurant-location-enrichment.service.ts`), so the app MUST be on the new binary before any drop.
- **Trigger a global `rebuildAllScores()`** to populate `rising`, THEN flip search/reads to `rising`.
  Don't flip `ORDER BY rising DESC NULLS LAST` until ≥1 run has populated it.

**M2 (contract, separate later deploy, after old binary gone + rising verified):** **DB snapshot
first** (destructive, no down-migration). Also edit `schema.prisma`: remove `scoreDelta7d`/`scoreDelta28d`/
`movementState` from `PublicEntityScore`, drop the `PublicEntityScoreHistory` model + `CraveScoreRun.history`
relation + the `CraveScoreMovementState` enum, then `prisma migrate` to generate the folder (or hand-author
it with the SQL below) and `prisma generate`.

Ready-to-apply contract SQL (drop in `prisma/migrations/<ts>_crave_score_rising_contract/migration.sql`
in the NEXT release — NOT now; the current schema is at the expand state and applying this would drift it):

```sql
ALTER TABLE "core_public_entity_scores" DROP COLUMN "movement_state";
ALTER TABLE "core_public_entity_scores" DROP COLUMN "score_delta_7d";
ALTER TABLE "core_public_entity_scores" DROP COLUMN "score_delta_28d";
DROP TABLE "core_public_entity_score_history";   -- auto-drops its CraveScoreRun FK
DROP TYPE "crave_score_movement_state";          -- LAST: fails if any column still uses it
```

### 3. Rename surface — grep `score_delta_7d|scoreDelta7d` repo-wide (~45 API hits); do ALL
- `search-query.builder.ts`: the four Rising `ORDER BY` paths + every SELECT and JSON key (`'scoreDelta7d'`).
- `search.service.ts`: `getPublicRestaurantScore` (`SELECT score_delta_7d AS scoreDelta7d`, ~L1633)
  feeding the restaurant **profile** payload (~L1523), plus ~L64/1187/1237/1504.
- `search-query.executor.ts`: prefixed aliases `connection_score_delta_7d` / `restaurant_score_delta_7d`.
- `search-coverage.service.ts`: `top_food_score_delta_7d` (type ~L24, SQL ~L178, read ~L308) → `top_food_rising`.
- `favorites/favorite-lists.service.ts` (Prisma SELECT — sequence AFTER schema rename + `prisma
  generate`): `Pick` type `FavoritePublicScore` (~L59-61), `select { scoreDelta7d: true }` (~L928),
  `toPublicScoreDelta` helper (~L955-958), emit sites (~L999).
- `packages/shared/src/types/search.ts`: field decls (~L57/82/131/203) AND the `Omit` literal
  `'scoreDelta7d'` (~L159) + the `scoreDelta7d?: null` override (~L166) — all six.
- `search/README.md` (~L36): **reword** — it's the recent-vs-baseline surge, not a "7-day delta."

### 4. Mobile UI — keep the arrow, point it at `rising`
`rising` is now a real score-point delta, so the existing "↑X.X pts" arrow stays — just rename the
field it reads and reword copy (it's "trending vs baseline," not "last 7 days"):
- `quality.ts` (~L75-84, `formatCraveScoreMovementDetail`) and `SearchRankAndScoreSheets.tsx` (~L48):
  read `rising` instead of `scoreDelta7d`. The `CRAVE_RATING_SCALE` / `/10` divisor is GONE (the
  score is now native `0–10`, see `crave-score-1to10-scale-migration.md`) — render `rising`
  directly as `±X.X pts` on cards / `±X.XX pts` in the sheet; no scaling anywhere.
- Fed by `dish-result-card.tsx` (~L159) and `restaurant-result-card.tsx` (~L315) — rename.
- **GeoJSON write/read pair:** `map-read-model-builder.ts` writes `properties.scoreDelta7d`
  (~L96/149), `use-direct-search-map-source-controller.ts` reads it (~L2742) — rename BOTH. Plus
  `search-results-panel-environment-contract.ts`, `search-map.tsx`.
- **Do NOT touch** mobile's `useSearchMapMovementState` / `flushDeferredMapMovementState` — unrelated
  map-camera movement; a grep find/replace would corrupt the map runtime.
- `dist/` artifacts regenerate on build — never hand-edit.

## Rollout / rollback
- No warm-up (rising computes from the ledger each run) — but NULL until the first post-M1 global run,
  so trigger `rebuildAllScores()` and verify before flipping search.
- **Rollback:** destructive, no down-migration. Snapshot the DB before M2; gate M2 behind verification
  of the live `rising` path so it can be deferred without touching M1.

## Decided (folded into "Base-score model" above)
- Upvotes = mentions = poll likes = **1 person-endorsement each** (we trust Reddit: app-agnostic
  historical data + 1-vote-per-user). Pool channels 1:1: `log1p(mentions + upvotes)` — drop the 0.7/0.3
  split, **keep the log** (load-bearing for the restaurant composite scale).
- **No graduation change** — `comment.score` is already the distinct-liker count, so unification routes
  poll likes correctly on its own.
- The pooling **reorders rankings** (intended: upvotes now count fully) — validate empirically with new
  reorder-regime fixtures; do NOT claim it's rank-cosmetic.
- Sentiment = **binary net-positive gate only** (no 1–10 intensity weighting).
- Score **leans volume** ("most endorsed"); exposure-normalized "quality" is a future dial, not now.

## Leave alone
- The polls Trending heat (`polls.service.ts`, `POLL_TRENDING_HALF_LIFE_DAYS = 3`) — separate system,
  engagement-velocity heat for the poll *feed*, already spam-safe via distinct-engager dedup. No change.
