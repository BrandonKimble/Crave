# Crave Score Cutover Plan

## Status

Execution-ready target plan. This supersedes `plans/contextual-score-cutover-plan.md`.

This is a cleanup-first cutover. Do not preserve `contextualScore` as a
compatibility alias, do not keep rank-derived forced-100 display scores, and do
not expose raw quality values as the public score.

## Objective

Replace the current contextual score system with one stable public Crave Score
and contextual ordinal rank.

The target product model is:

```text
raw evidence -> raw quality -> public Crave Score -> search rank
```

Not:

```text
raw quality -> viewport percentile -> contextualScore -> forced 100
```

The public score answers:

```text
How strong is this restaurant or dish on Crave's global calibrated scale?
```

The search rank answers:

```text
Where does this result sit in the current search, viewport, and intent?
```

Those are separate concepts. The score must not change because the user pans the
map or narrows a viewport.

## Locked Decisions

- Delete public contextual score entirely.
- Keep contextual ordinal rank.
- Rank search results by the tab-native Crave Score after query filters and
  search intent are applied: restaurant tab by restaurant score, dish tab by
  dish/connection score.
- Do not force the top result in any market, viewport, or result set to `100`.
- Do not keep Local / Global score toggles.
- Do not keep compatibility fallbacks that silently map `contextualScore` to
  `craveScore`.
- Do not use total market size, geographic area, raw vote volume, or raw mention
  volume as direct score multipliers.
- Use market evidence to decide reliability/confidence, not to directly inflate
  or deflate quality.
- Keep backend raw quality unconstrained. The public display curve owns the
  visible range.
- Public display range should be `60.0` to `99.9` for normal scoring. `100.0`
  should not be emitted by a rank rule. If it ever exists, it should be an
  exceptional calibrated outcome, not a guaranteed top slot.
- Always show computed restaurant and dish scores in v1. Do not add score
  eligibility hiding, null-score UI, or `NEW` score states yet.
- Use tab-native scores: the restaurant tab shows/ranks/colors restaurant Crave
  Scores, and the dish tab shows/ranks/colors dish connection Crave Scores.
- Store daily score history from the start, but show movement only when a real,
  non-zero movement value is available.
- Keep confidence out of compact cards. Use it only in the score info modal with
  simple user-facing copy.
- Use the existing market roll-up semantics for `scoring_market_key`; do not
  create strict tiny-locality scoring cohorts by default.
- Public evidence language is polls, votes, and Crave Score. Backend evidence
  may remain source-aware privately for rebuilds, tuning, and double-count
  prevention.

## Current System Problems

### 1. `contextualScore` is a rank artifact

Current search paths compute rank-derived display scores with window functions
and special-case the first row to `100`.

Examples:

- `apps/api/src/modules/search/search-query.builder.ts`
- `apps/api/src/modules/search/search-coverage.service.ts`
- `apps/api/src/modules/search/search.service.ts`
- `apps/api/src/modules/content-processing/rank-score/rank-score.service.ts`

This means the number currently answers:

```text
Where did this result rank in this cohort?
```

It does not answer:

```text
How good is this result?
```

That is the wrong public score model.

### 2. The same score name has inconsistent cohorts

`core_display_rank_scores` is keyed by market, but search can recompute
rank-derived scores over submitted geography, viewport-ish cohorts, profile
fetch paths, and coverage paths. The same public name can therefore mean
different cohorts.

This prevents users from learning the scale.

### 3. Raw quality is useful but not display-ready

Current durable raw quality lives mostly on:

- `core_entities.restaurant_quality_score`
- `core_restaurant_items.food_quality_score`

These values are useful internal signals, but they are not the final public
score. They are cumulative, evidence-volume sensitive, and currently polluted by
poll pseudo-signal writes.

### 4. Poll evidence is flattened too early

Poll votes currently become pseudo mentions/upvotes and are merged into decayed
connection scores. That loses source composition. A long-term scorer needs to
know whether evidence came from direct collection mentions, support mentions,
poll choices, distinct poll voters, favorites, views, or search demand.

## Target Vocabulary

Use these terms consistently.

- `rawQualityScore`: internal quality signal from collection and poll evidence.
- `craveScore`: public stable score shown to users.
- `entityConfidence`: internal evidence strength for this subject score.
- `scoreInfo`: user-facing score explanation shown in the info modal.
- `marketReliability`: how mature the subject's scoring market is.
- `searchRank`: ordinal rank in the current search snapshot.
- `scoreDelta`: change in public Crave Score over a period.
- `chartRankDelta`: change in rank inside a named, stable chart scope.

Delete or rename these terms from active public contracts:

- `contextualScore`
- `contextualPercentile`
- `restaurantContextualScore`
- `rankScoreDisplay`
- `rankPercentile` as a public score concept

## Data Ownership

### Red-team table decision

The repo already has most of the durable input facts needed for Crave Score.
Do not create new fact tables just to restate existing data.

Use existing tables as inputs:

- `core_entities.restaurant_quality_score` for raw restaurant quality.
- `core_restaurant_items.food_quality_score` and connection evidence fields for
  raw dish/connection quality.
- `collection_source_documents`, `core_restaurant_events`, and
  `core_restaurant_entity_events` for collection evidence breadth, recency, and
  source context.
- `poll_topics`, `polls`, `poll_options`, `poll_votes`, and `poll_metrics` for
  poll-relative performance and distinct voter evidence.
- `user_search_logs`, `user_search_demand_daily`, `user_entity_view_events`,
  and `user_favorite_events` for confidence, demand, trend, and collection
  priority. These are not direct quality multipliers.
- `core_markets` and `core_entity_market_presence` for market membership and
  scoring-market resolution.

Do not expand `core_entities` and `core_restaurant_items` with public score
columns as the first move. That would be fewer tables, but it would leave too
much on the table:

- restaurant and connection scores would need duplicated fields and duplicated
  write logic
- current score, score history, score version, factor trace, and movement would
  be split across unrelated owner tables
- public score would be harder to rebuild from a run ledger
- raw quality and public display score would be easy to confuse again

The long-term shape should add four durable score-owner tables:

1. `core_public_entity_scores` for the latest public score per restaurant or
   connection.
2. `core_crave_score_runs` for the scoring run ledger.
3. `core_crave_score_market_stats` for per-run market normalization stats.
4. `core_public_entity_score_history` for score snapshots and score movement.

Do not add a rank-movement table in the base cutover. Add
`core_entity_chart_position_history` later only if the product ships named,
stable chart surfaces.

### New score projection

Create a new durable projection owner:

```text
core_public_entity_scores
```

Suggested fields:

```text
subject_type              enum: restaurant | connection
subject_id                uuid
score_run_id              uuid
scoring_market_key        varchar nullable
raw_quality_score         decimal
global_z                  decimal
market_z                  decimal nullable
market_reliability        decimal(6,5)
entity_confidence         decimal(6,5)
normalized_signal         decimal
posterior_signal          decimal
display_score             decimal(5,1)
score_delta_7d            decimal(5,1) nullable
score_delta_28d           decimal(5,1) nullable
movement_state            enum: rising | cooling | stable | insufficient_history
score_version             varchar
display_curve_version     varchar
factor_trace              jsonb
computed_at               timestamptz
```

Primary key:

```text
(subject_type, subject_id)
```

Do not key the public score by viewport, query, or current bounds.

Recommended indexes:

```text
(subject_type, display_score desc)
(scoring_market_key, subject_type, display_score desc)
(score_run_id)
```

Restaurant and dish ownership:

- for `subject_type = restaurant`, `subject_id` is `core_entities.entity_id`
  where the entity type is `restaurant`
- for `subject_type = connection`, `subject_id` is
  `core_restaurant_items.connection_id`

Do not score a dish by the generic food entity alone. A dish score means this
specific item at this specific restaurant, so the durable public dish subject is
the restaurant-item connection.

### Score run ledger

Create a run ledger so score changes are explainable and reproducible:

```text
core_crave_score_runs
```

Suggested fields:

```text
score_run_id             uuid primary key
score_version            varchar
display_curve_version    varchar
display_min              decimal(5,1)
display_max              decimal(5,1)
status                   enum: running | completed | failed
recency_reference_date   date
started_at               timestamptz
completed_at             timestamptz nullable
input_counts             jsonb
config_snapshot          jsonb
error_message            text nullable
```

Every public score row and score snapshot should point back to the run that
created it.

### Market score stats

Create a market-stat projection for each score run:

```text
core_crave_score_market_stats
```

Suggested fields:

```text
score_run_id             uuid
subject_type             enum: restaurant | connection
market_key               varchar
eligible_subject_count   int
raw_median               decimal
raw_mad                  decimal
raw_iqr                  decimal
raw_spread               decimal
global_median            decimal
global_spread            decimal
market_reliability       decimal(6,5)
evidence_summary         jsonb
factor_trace             jsonb
computed_at              timestamptz
```

Primary key:

```text
(score_run_id, subject_type, market_key)
```

This table owns the market-normalization inputs. Do not recompute market
reliability ad hoc inside request-time search.

Do not store these stats on `core_markets`. Market reliability is not a static
market attribute; it is tied to subject type, score version, evidence window,
and score run.

### Score snapshots and movement

Create score history as a required part of movement:

```text
core_public_entity_score_history
```

Suggested fields:

```text
score_run_id
snapshot_date
subject_type
subject_id
scoring_market_key
score_version
display_curve_version
display_score
normalized_signal
posterior_signal
entity_confidence
market_reliability
movement_state           enum: rising | cooling | stable | insufficient_history
factor_trace
computed_at
```

Primary key:

```text
(snapshot_date, subject_type, subject_id, score_version)
```

Use this table for score movement only. It answers:

```text
How did this subject's public Crave Score change?
```

It does not answer:

```text
How did this subject's rank change in Austin or in burgers?
```

Rank movement is chart-scope-specific and needs a separate chart snapshot table
only when the product is ready to show rank movement in named chart surfaces.
It is not meaningful for arbitrary viewport search results, because the
comparison cohort changes whenever the user pans, zooms, filters, or submits a
different search.

The history table should store snapshots, not be the second owner of deltas.
Compute `score_delta_7d` and `score_delta_28d` during the score run and store
the latest values on `core_public_entity_scores` for request-time reads.

### Optional chart/rank movement

Do not ship rank movement in normal viewport search results.

Rank movement is only valid when the scope is stable and named, for example:

```text
#3 in Austin burgers
#12 in NYC pizza
#5 on this week's Austin restaurants chart
```

In those cases, `up 2 ranks this week` means the subject moved from position 5
to position 3 inside the same chart definition. Without that stable chart
definition, the delta is just an artifact of the current viewport.

If the UI needs `#3 in Austin · up 2 ranks this week`, create:

```text
core_entity_chart_position_history
```

Suggested fields:

```text
snapshot_date
chart_scope_type         enum: global | market | market_category | market_dish
chart_scope_key          varchar
subject_type             enum: restaurant | connection
subject_id               uuid
rank_position            int
rank_delta_7d            int nullable
score_at_snapshot        decimal(5,1)
score_run_id             uuid
computed_at              timestamptz
```

Primary key:

```text
(snapshot_date, chart_scope_type, chart_scope_key, subject_type, subject_id)
```

Do not store one generic `rankDelta` on `core_public_entity_scores`. Rank
movement has no meaning without a scope. Do not add rank movement to the default
search result payload unless the payload also identifies the exact chart scope
used to compute it.

### What happens to existing raw fields

Keep these as internal raw inputs:

- `Entity.restaurantQualityScore`
- `Connection.foodQualityScore`

Do not expose them to the mobile app as the public score after cutover. If they
remain in API responses for admin/debug routes, name them as raw fields and hide
them from normal search/profile payloads.

No new poll-performance table is required for the base cutover. The public
scorer can derive poll and vote performance from `poll_options`, `poll_votes`,
and `poll_metrics`. Add a poll-performance projection later only if score-job
runtime becomes a real problem.

Public language must stay unified around polls and votes. Do not expose
implementation source names like Reddit, source documents, or collected
mentions to users. Internally, keep enough source provenance in factor traces
and rebuild paths to retune evidence weights and avoid double-counting.

## Score Model

### Step 1: Build raw evidence

Raw quality should come from evidence that says something about preference or
quality:

- direct restaurant/dish mentions
- source upvotes on direct evidence
- support mentions when they match the subject
- poll performance
- distinct poll voters
- recency of evidence
- source breadth

Do not use these as direct quality inputs in v1 public score:

- raw search count
- cache replay count
- profile views
- favorites

Those are engagement and demand signals. They are useful for trend, confidence,
poll planning, collection priority, and movement, but they should not directly
make a restaurant "better."

### Step 2: Normalize source-aware evidence before public scoring

Poll votes should be scored relative to the poll they came from.

A simple long-term shape:

```text
expected_share = 1 / option_count
actual_share = (votes + alpha * expected_share) / (total_votes + alpha)
poll_performance = logit(actual_share) - logit(expected_share)
poll_confidence = distinct_voters / (distinct_voters + k)
poll_signal = poll_performance * poll_confidence
```

This makes a strong result in a small Austin poll and a strong result in a large
New York poll comparable because both are measured against the opportunity set
inside the poll, not raw vote count.

The product-facing model can treat collected evidence and poll evidence as the
same kind of public support: polls and votes. The backend should still know
where evidence came from before it is normalized into one public Crave Score.
That lets the scorer rebuild, explain, dedupe, and retune without exposing
source names to users.

Long-term, stop relying on poll votes permanently incrementing decayed
mention/upvote fields as the only path into public scoring. Poll aggregation
should maintain poll facts and poll metrics; the Crave Score job should read
those facts and combine them with collection-derived evidence in a source-aware
private trace.

### Step 3: Compute market reliability

Market reliability answers:

```text
How much should we trust this market's local distribution?
```

It should not answer:

```text
How good are restaurants in this market?
```

Use capped/log-scaled evidence such as:

```text
eligible_scored_restaurants
eligible_scored_connections
source_document_count
direct_mention_count
distinct_source_documents_with_events
poll_count
distinct_poll_voters
poll_option_breadth
collection_freshness
source_community_freshness
```

Demand can be a secondary reliability input only after capping and source
separation:

```text
distinct_search_users
distinct_view_users
distinct_favorite_users
```

Do not let demand volume directly raise the public Crave Score.

Example curve:

```text
marketReliability = 1 - exp(-effective_market_evidence / k)
```

Thresholds are tuning parameters and should be fixture-calibrated. Do not treat
initial constants as product truth.

`scoring_market_key` should follow the app's existing market roll-up behavior.
For example, a Round Rock restaurant inside the Austin regional market should
normally normalize against Austin, not a tiny Round Rock-only cohort. This
matches the current resolver shape, which prefers active regional markets and
uses dominant viewport overlap with regional priority in close ties.

### Step 4: Compute entity confidence

Entity confidence answers:

```text
How much should we trust this entity's own score?
```

Use capped/log-scaled evidence such as:

```text
direct_mention_count
support_mention_count
distinct_source_documents
decayed_upvote_mass
poll_appearances
distinct_poll_voters
evidence_recency
source_mix
```

Example curve:

```text
entityConfidence = 1 - exp(-effective_entity_evidence / k)
```

Low-confidence entities shrink toward the public-score baseline. They should not
receive fake low scores or fake elite scores.

### Step 5: Market-normalize without creating a local score

For each subject type, compute robust distributions:

```text
global median and spread
market median and spread
```

Use median and MAD/IQR-style spread, not average and standard deviation, because
restaurant evidence distributions are lopsided.

Conceptual model:

```text
globalZ = robust_z(rawQualityScore, global_distribution)
marketZ = robust_z(rawQualityScore, market_distribution)

normalizedSignal =
  marketReliability * marketZ +
  (1 - marketReliability) * globalZ

posteriorSignal = entityConfidence * normalizedSignal
```

Product interpretation:

- mature markets can use local distribution to correct for market-size bias
- sparse markets are pulled toward the global baseline
- elite scores require both strong relative performance and enough evidence
- the final value is still one global Crave Score because it is stable across
  query, viewport, and UI context

### Step 6: Map to public display

Use a display curve instead of exposing raw values.

Recommended public range:

```text
60.0 to 99.9
```

Rationale:

- `0-100` looks like a school grade and makes normal discovery results feel bad.
- `50` still reads harshly to many users.
- `60` gives enough lower-range room without making normal restaurants feel
  broken.
- `100` should not be guaranteed by rank.
- elite scores should be rare because the curve and confidence shrinkage make
  them hard to earn.

Example curve:

```text
displayScore = 60 + 39.9 * sigmoid((posteriorSignal - center) / scale)
```

Then round to one decimal.

The backend can keep raw values below 60 or above 100 internally. Only the
public display projection uses this bounded range.

Store `display_score` as a numeric one-decimal value. Do not store formatted
display text in the database.

Public UI formatting:

```text
96.8 -> 96.8°
96.0 -> 96°
88.4 -> 88.4°
```

Use the compact degree treatment for both restaurant scores and dish/connection
scores. Rank stays separate and should not use the degree symbol:

```text
#3
96.8°
```

The formatter should suppress `.0` only at presentation time. The stored score
can still be `96.0` so sorting, deltas, and history stay numeric.

### Step 7: Map score to color

Color is a presentation of the stable Crave Score, not a scoring input and not a
stored backend fact.

Current mobile behavior already uses the right philosophy: a continuous
gradient interpolation, not discrete buckets. The existing palette lives in
`apps/mobile/src/constants/color-palette.json`:

```text
green -> light green -> yellow -> orange -> coral
```

The current utility interpolates between RGB stops in
`apps/mobile/src/utils/quality-color.ts`. The stops are anchors, not categories.
Keep that continuous shape.

For the Crave Score cutover:

- keep the existing palette for v1
- derive color from the same numeric `craveScore` shown in the UI
- do not derive color from `rank`, result index, viewport percentile, or row
  order
- do not derive color from raw `restaurantQualityScore`, `foodQualityScore`, or
  legacy `qualityScore`
- do not store `display_color` in score tables
- keep color client-owned so the palette can evolve without recomputing public
  scores

Recommended v1 mapping:

```text
t = 1 - clamp(craveScore / 100, 0, 1)
color = interpolateQualityGradient(t)
```

This preserves the current visual language:

```text
higher score -> greener
lower score -> warmer
```

Because public scores normally live in `60.0-99.9`, the visible app will mostly
use the green-to-yellow portion of the palette. That is acceptable for v1
because it avoids making normal surfaced restaurants look bad. If score
distribution later feels visually compressed, add a separate presentation-only
color curve version, for example:

```text
scoreColorT = curve(craveScore, displayMin, displayMax, colorCurveVersion)
```

Do not solve that by returning to rank percentiles or by forcing each result set
to span the full palette.

The long-term mobile utility should be renamed around the public concept:

```ts
getCraveScoreColorFromScore(craveScore)
```

The old `quality` naming can remain only during migration. The final public
runtime should not expose `pinColorGlobal`, `pinColorContextual`, or
percentile-color helpers.

## Search Ranking Contract

Search remains contextual through rank, not score.

Every returned row should identify the stable tab-native score used for that
row:

```text
restaurant tab -> scoreSubjectType = restaurant, scoreSubjectId = entity_id
dish tab       -> scoreSubjectType = connection, scoreSubjectId = connection_id
craveScore     -> score for scoreSubjectId
```

Use that `craveScore` for:

- visible score text
- map/card/profile score color
- ranking within the filtered result set

This keeps color, score, and rank aligned. Restaurant cards use restaurant
scores. Dish cards use dish/connection scores. Do not make restaurant cards look
like their restaurant score changed because the query was dish-oriented.

### Restaurant search

The server filters the candidate set by the submitted search intent and
geography. It then sorts by the tab-native Crave Score and returns a 1-based
`rank`.

For restaurant-tab rows:

```text
filter/match by submitted query and geography
rank by restaurant.craveScore
```

If the query is dish-oriented, use the query to filter/match eligible
restaurants, but keep the restaurant tab's score, color, and rank based on the
restaurant Crave Score:

```text
filter/match by relevant dish evidence
rank by restaurant.craveScore
```

This matches the current restaurant/dish toggle model: the restaurant tab
answers restaurant strength, while the dish tab answers dish strength.

### Dish search

Dish rows rank by connection-level Crave Score:

```text
rank by connection.craveScore
```

Nested restaurant snippets can include the restaurant Crave Score, but the dish
score is the primary score for dish results.

### Shortcut map coverage

Preserve the separate shortcut coverage contract.

A shortcut search has two different payload needs:

- page-one sheet data for cards, pagination, hydration, and profile entry
- broad map coverage for pins/dots/labels in the submitted viewport

The API should continue to satisfy those separately.

The first page response should stay page-sized:

```text
20-ish restaurant/card results
```

The map coverage response should stay coverage-sized:

```text
all eligible restaurants or dish matches in the submitted viewport, capped only
by an operational safety limit
```

This means a shortcut search over Austin can show a filled-out map even when the
result sheet only renders page one. Do not collapse map dots to page-one results.

Current implementation evidence:

- `POST /search/shortcut/coverage` already exists as a separate coverage path.
- `SearchCoverageService` builds a GeoJSON `FeatureCollection` and currently
  caps at `50000`, not the page size.
- mobile shortcut submission publishes a coverage snapshot after the page-one
  response, then the map source controller fetches coverage and merges coverage
  features with page-one result features.
- the projector dedupes by restaurant plus coordinate identity, so coverage and
  page-one features should not create duplicate pins for the same visual place.

Keep this ownership shape during the Crave Score cutover. The score migration
must change which score field ranks/colors coverage features, not whether
coverage exists.

Coverage eligibility should be explicit and product-owned. The current path
requires:

```text
restaurant entity
at least one dish/item connection
valid map location
valid Google place id
valid address
inside submitted bounds
inside active market geometry when marketKey is supplied
```

That is why a sparse local DB can legitimately produce fewer dots even when the
coverage system is healthy. In the current local Austin data, the limiting factor
is dish/item inventory: only about 50 restaurants are coverage-eligible even
though many more restaurant entities and valid locations exist.

Do not ship unscored context dots in this cutover. A future non-blocking option
is to show all geocoded restaurants as faint unscored context dots, with scored
Crave restaurants promoted to ranked pins/dots.

For the Crave Score cutover, the locked v1 behavior is:

```text
show only score-eligible restaurants in scored coverage
```

Do not mix unscored restaurants into the same visual language until the product
has a separate "unscored context dot" treatment.

### Map pins and cards

Map pin color, result cards, profile headers, and score info sheets use the
tab-native row score:

```text
craveScore
```

Not:

```text
contextualScore
restaurantQualityScore
foodQualityScore
qualityScore
rankScoreDisplay
```

## Public API Contract

Replace public search/profile fields with explicit score names.

`craveScore` is a numeric API field. The mobile app formats it with the compact
degree treatment.

Restaurant result:

```ts
interface RestaurantResult {
  rank?: number;
  scoreSubjectType: 'restaurant';
  scoreSubjectId: string;
  craveScore: number;
  scoreDelta7d?: number | null;
  scoreInfo?: ScoreInfoSummary;
}
```

Dish/connection result:

```ts
interface DishResult {
  rank?: number;
  scoreSubjectType: 'connection';
  scoreSubjectId: string;
  craveScore: number;
  restaurantCraveScore?: number | null;
  scoreDelta7d?: number | null;
  scoreInfo?: ScoreInfoSummary;
}

interface ScoreInfoSummary {
  confidenceLabel: 'early' | 'solid' | 'strong';
  evidenceCopy: string;
  pollCount?: number | null;
  voteCount?: number | null;
}
```

`scoreDelta7d` should be omitted or null until movement is available and
meaningful. `scoreInfo` powers the info modal, not the compact card chip.

Do not include these in normal public payloads after cutover:

```ts
contextualScore
contextualPercentile
restaurantContextualScore
restaurantQualityScore
foodQualityScore
```

If a debug route needs raw values, expose them under an explicit debug object:

```ts
scoreTrace?: {
  rawQualityScore: number;
  scoringMarketKey: string | null;
  globalZ: number;
  marketZ: number | null;
  normalizedSignal: number;
  posteriorSignal: number;
  marketReliability: number;
  entityConfidence: number;
  scoreVersion: string;
  displayCurveVersion: string;
}
```

## Movement UI Semantics

Compute movement daily, but display only meaningful weekly movement.

Daily movement is too noisy for a restaurant discovery UI, especially while
poll/data volume is still sparse. Weekly movement matches the expected poll
cadence and gives users enough time to understand that the score has changed for
a real reason.

Persist daily snapshots immediately so movement history exists when the product
is ready to show it. Do not show `NEW`, `Stable`, or any null-score placeholder
in v1. Compact cards always show the score itself.

The compact score chip can show:

```text
85.4° ↑2.1°
```

Only show this when the value is available and non-zero. If there is no usable
prior-week snapshot, or the movement is zero, show only the score:

```text
85.4°
```

The score info sheet must label the movement:

```text
Crave Score increased 1.2 points this week.
```

Do not show a bare single digit like:

```text
↑2
```

in normal search results.

Rank movement is allowed only in named chart contexts:

```text
#3 in Austin · up 2 ranks this week
```

Recommended display rules:

- Show score movement only when `scoreDelta7d` is available and non-zero.
- If movement is unavailable, show only the score.
- Do not hide or replace the score based on confidence in v1.
- Do not show `NEW` or `Stable` score states in v1.
- Use `rising` for positive score movement.
- Use `cooling` for negative score movement, but keep it subdued in compact
  cards.
- Explain confidence only inside the info modal, using simple user-facing copy.
- Do not show rank movement on arbitrary viewport search results.
- Keep chart rank movement separate and always include the word `rank` or
  `ranks`.

Example compact states:

```text
85.4° ↑2.1°

91.1°

#3 in Austin burgers
up 2 ranks this week
```

Do not combine score delta and chart rank delta in one unlabeled badge. If both
are shown in a named chart surface, render them as two separate lines or chips:

```text
Score +1.2 this week
up 2 ranks in Austin
```

## Calibration Fixture Suite

Do not pick display-curve or confidence constants by instinct. The score
implementation must include a fixture runner that calibrates and validates the
whole scoring shape before the public API cutover is considered promotable.

Create:

```text
apps/api/scripts/validate-crave-score-fixtures.ts
plans/crave-score-fixture-validation-report.md
```

Add a package script:

```json
"crave-score:fixtures": "ts-node scripts/validate-crave-score-fixtures.ts"
```

Use the existing demand-fixture harness pattern:

- create synthetic fixture rows in the real local database
- tag every inserted row with `fixtureRunId` in metadata or deterministic names
- run the real scorer, projection writer, search readers, and movement logic
- write expected-versus-observed results to the report
- clean up fixture rows by default
- support `--keep` for debugging
- verify cleanup leaves fixture users, entities, connections, markets, polls,
  votes, source docs, events, score runs, score rows, history rows, and traces at
  `0`

### Two-layer fixture design

Use the same scenario definitions for both layers.

Layer 1 is a pure scorer calibration pass. It feeds synthetic subject evidence
directly into the scorer's math module and sweeps candidate constants:

```text
displayBaseline
displayMax
displayCenter
displayScale
entityConfidenceK
marketReliabilityK
marketReliabilityCaps
entityEvidenceCaps
pollAlpha
pollConfidenceK
robustSpreadFloor
sourceWeightCaps
```

The calibration pass should choose the lowest-loss config that passes all hard
invariants. Do not tune exact vanity scores. Tune target bands and ordering.

Layer 2 is a DB integration pass. It seeds Prisma rows for markets, restaurants,
food entities, restaurant-item connections, poll topics, polls, options, votes,
source documents, restaurant events, restaurant-entity events, demand rows, view
events, and favorite events. Then it runs the real public score job and search
readers.

The pure layer proves the math. The DB layer proves ownership, joins, cleanup,
factor traces, API contracts, and search behavior.

### Calibration outputs

The fixture report must include:

- selected constants
- rejected constants count
- hard invariant pass/fail table
- soft target-band loss score
- per-fixture raw evidence summary
- per-fixture `globalZ`, `marketZ`, `marketReliability`, `entityConfidence`,
  `posteriorSignal`, and `displayScore`
- score distribution histogram by subject type
- highest score, median score, lowest surfaced score
- count of scores above `90`, `95`, `98`, and `99`
- cleanup counts

The selected constants must be copied into the scorer config and captured in
`core_crave_score_runs.config_snapshot`. Changing constants later must increment
`score_version` or `display_curve_version`.

### Hard invariants

The fixture suite must fail if any of these are false:

- no fixture gets `100` because it is first in a result set
- the same subject keeps the same `craveScore` across viewport changes
- the same subject keeps the same `craveScore` across query changes
- restaurant-tab rows rank and color by restaurant Crave Score
- dish-tab rows rank and color by connection Crave Score
- a dish-intent query does not mutate the restaurant score shown on restaurant
  cards
- raw search count, cache replay count, profile views, and favorites do not
  directly increase raw quality
- NYC-style volume does not win from volume alone
- Austin-style smaller-market strength can compete when relative performance and
  evidence breadth are strong
- sparse-market winners shrink toward baseline instead of receiving fake elite
  scores
- sparse-market subjects with genuinely strong global raw evidence can still
  become strong scores
- one viral source or one tiny poll cannot create an elite score alone
- broad distinct voter support beats repeat-heavy or narrow support
- poll performance is relative to poll opportunity set, not raw vote count
- robust market stats are not dominated by one outlier
- a single-result viewport does not display `100`
- score movement comes from score history, not request-time rank
- missing or zero movement does not display `NEW`, `Stable`, or a movement chip
- factor traces retain private source provenance
- public score info copy uses polls, votes, and Crave Score language only

### Soft target bands

Use internal calibration labels only. Do not expose these labels in product UI.

```text
elite calibrated standout:        96.0-99.5
excellent mature-market standout: 92.0-96.0
great strong local favorite:      85.0-92.0
good normal surfaced result:      78.0-85.0
thin or mixed evidence result:    68.0-78.0
weak eligible result:             60.0-68.0
```

The runner should treat these as soft bands with tolerance, not exact expected
scores. Ordering and invariants matter more than hitting a specific decimal.

### Required fixture scenarios

`market_maturity_curve`

- Seed four markets: sparse rural, emerging city, Austin-like mature, NYC-like
  high-volume.
- Keep restaurant quality patterns comparable across markets while varying
  eligible subject count, source breadth, poll count, and distinct voters.
- Expected behavior: market reliability rises with evidence and then saturates.
  NYC having much more data should increase confidence, not automatically push
  NYC restaurants above Austin.
- Counterfactual: if raw poll vote rows increase but distinct voters, poll count,
  source breadth, and eligible subjects stay fixed, market reliability should not
  change.
- Counterfactual: if the same market voters fan out across more options or
  subjects, market reliability should not increase; use true market-level
  distinct voters, not the sum of per-subject voter counts.

`local_standout_vs_global_average`

- Create an Austin standout with strong relative local performance and broad
  evidence.
- Create a NYC average restaurant with much higher raw mention/vote volume but
  average relative performance.
- Expected behavior: the Austin standout outranks the NYC average on public
  score.

`sparse_market_winner_not_fake_elite`

- Create a five-restaurant sparse market where one place is clearly first but
  total evidence is low.
- Expected behavior: it ranks first locally but lands in a normal or good band,
  not the elite band.

`sparse_market_real_strength_can_escape_baseline`

- Create a sparse-market restaurant with high raw evidence, source breadth, and
  distinct voter support that is globally unusual, not merely locally first.
- Expected behavior: it can reach a strong score despite low market reliability,
  because `globalZ` and `entityConfidence` carry real evidence.

`poll_opportunity_set`

- Compare a 25-vote option in a 10-option, 100-vote poll with a 25-vote option in
  a two-option, 100-vote poll.
- Expected behavior: the 10-option result is much stronger because it beats its
  expected share by more.

`poll_confidence_distinct_voters`

- Compare a small poll landslide, a broad poll plurality, and repeated narrow
  support across several tiny polls.
- Expected behavior: broad distinct-voter evidence wins unless the small poll
  also gains enough confidence.

`source_breadth_vs_single_viral_source`

- Compare one high-upvote source against many moderate independent sources with
  similar total raw mass.
- Expected behavior: source breadth improves confidence and protects against one
  viral item creating an elite score by itself.

`demand_is_not_quality`

- Give one restaurant high searches, views, and favorites without quality
  evidence.
- Give another restaurant quality evidence without demand spikes.
- Expected behavior: demand may affect confidence/trend fields where allowed,
  but it does not directly raise raw quality or public Crave Score.

`robust_stats_outlier`

- Add one extreme outlier to a market with otherwise normal restaurants.
- Expected behavior: median/MAD/IQR stats keep the normal restaurants stable and
  do not collapse all non-outliers into the bottom of the range.

`restaurant_vs_dish_subjects`

- Create a strong restaurant with a weak dish connection.
- Create an average restaurant with one iconic dish connection.
- Expected behavior: restaurant-tab ranking uses restaurant score, dish-tab
  ranking uses connection score, and map/card color follows the tab-native score.

`viewport_rank_stability`

- Search the same synthetic market with a large viewport, small viewport, and a
  one-result viewport.
- Expected behavior: rank changes with the result set, but `craveScore` and
  score color stay stable.

`market_rollup_round_rock_austin`

- Seed an Austin regional market and a Round Rock-style locality inside it.
- Expected behavior: `scoring_market_key` uses the Austin regional market under
  the current roll-up semantics.

`movement_from_history`

- Seed score snapshots for today and seven days earlier.
- Expected behavior: `scoreDelta7d` is emitted only when a non-zero prior-week
  comparison exists; unavailable or zero movement is omitted/null in compact
  payloads.

`public_score_info_language`

- Generate score info for a subject whose private trace includes source
  documents and collected mentions.
- Expected behavior: user-facing copy says polls, votes, and Crave Score, while
  private traces keep source-aware provenance.

`cleanup_contract`

- Run the full fixture suite twice.
- Expected behavior: the second run is not affected by the first run, and cleanup
  reports zero remaining fixture rows.

### Calibration acceptance

The Crave Score implementation is not promotable until:

- all hard invariants pass
- soft band loss is below the accepted threshold chosen in the report
- no more than a small, explicitly explained number of fixture subjects land
  outside their target band
- the score distribution is not compressed into a narrow `86-99` cluster
- elite scores are rare in fixtures and require broad evidence
- every selected constant is captured in the run config snapshot
- the report is regenerated from the current code and committed with the cutover
  when implementation happens

## Delete Gates

Add a delete gate script for the cutover, for example:

```text
scripts/crave-score-cutover-delete-gate.sh
```

It should fail active runtime code on:

- `contextualScore`
- `contextualPercentile`
- `restaurantContextualScore`
- `rankScoreDisplay`
- `rank_score_display`
- `rank_percentile` in public API paths
- `core_display_rank_scores`
- `DisplayRankScore`
- `RankScoreModule`
- `RankScoreService`
- `PERCENT_RANK()` in score-producing search paths
- mobile copy that describes a score as contextual
- score fallback chains like `contextualScore ?? restaurantQualityScore`
- score fallback chains like `contextualScore ?? foodQualityScore`
- score fallback chains like `contextualScore ?? qualityScore` in dish result
  paths
- public dish/card/map payloads that expose `qualityScore` as the display score
- color derived from result index, rank, viewport percentile, or
  `contextualPercentile`
- color derived from raw `restaurantQualityScore`, `foodQualityScore`, or legacy
  `qualityScore` in public result surfaces
- `pinColorGlobal` and `pinColorContextual` in final public map feature
  properties
- public runtime use of `getQualityColorFromPercentile`
- normal public score UI that hides computed scores behind low-confidence, null,
  or `NEW` states
- compact-card confidence badges or numeric confidence values

Allow these terms only in:

- historical migrations
- superseded plans
- explicit delete-gate allowlists
- one migration that drops old schema

## Implementation Sequence

### Phase 0: Contract lock and delete gate

- Add this plan as the source of truth.
- Mark `plans/contextual-score-cutover-plan.md` as superseded.
- Add the delete gate script before feature work.
- Add the `validate-crave-score-fixtures.ts` runner skeleton and the
  `crave-score:fixtures` package script.
- Add initial failing fixtures for forced-100, viewport-variant score behavior,
  and tab-native restaurant/dish scoring.

Exit gate:

- A fresh agent can tell that contextual score is dead.
- The delete gate fails on existing active contextual paths.
- The fixture runner can execute, write a report, and clean up even while the
  score implementation is still incomplete.

### Phase 1: New schema owner

- Add `core_public_entity_scores`.
- Add `core_crave_score_runs`.
- Add `core_crave_score_market_stats`.
- Add `core_public_entity_score_history`.
- Add scorer version fields and factor trace JSON.
- Backfill score rows from existing raw quality inputs.
- Do not expose the table to mobile yet.

Exit gate:

- Every score-eligible restaurant and connection has one public score row.
- No score row is keyed by viewport/query/current bounds.
- No score row is created by forced rank position.

### Phase 2: Public score service

- Add a `PublicCraveScoreService` or equivalent owned module.
- Read raw quality from current raw fields and evidence facts.
- Compute market reliability and entity confidence.
- Compute market-normalized posterior signal.
- Apply the `60.0-99.9` display curve.
- Write durable factor traces.
- Add scorer config support for fixture-calibrated constants and run config
  snapshots.
- Run the pure calibration layer and select an initial lowest-loss config that
  passes hard invariants.

Exit gate:

- Same entity produces the same `craveScore` across different viewport bounds.
- Sparse-market fixtures shrink toward baseline.
- Mature-market fixtures can produce elite scores with enough evidence.
- Demand spikes do not directly raise public quality.
- Pure calibration fixtures pass and write selected constants into the report.

### Phase 3: Poll evidence cleanup

- Stop public score dependence on poll pseudo increments.
- Keep `PollOption`, `PollVote`, `PollMetric`, and poll topic facts as the poll
  source of truth.
- Compute poll performance from poll-relative vote share and distinct voters.
- Treat polls and collected evidence as unified public evidence units while
  retaining private source-aware traces.
- Rebuild affected raw projections so old pseudo increments do not contaminate
  public scoring.

Exit gate:

- Polls and collection evidence affect Crave Score through unified public
  evidence units with private source-aware trace.
- Removing/replaying poll facts can rebuild the same score.
- Polls no longer need to masquerade as mentions for public scoring.
- User-facing score explanations use polls, votes, and Crave Score language, not
  Reddit/source-document terminology.

### Phase 4: Search API cutover

- Join `core_public_entity_scores` for restaurants and connections.
- Replace public `contextualScore` fields with `craveScore`.
- Sort restaurant and dish tabs by their tab-native Crave Score after search
  filters.
- Restaurant-tab rows sort by restaurant Crave Score.
- Dish-tab rows sort by connection Crave Score.
- Keep `rank` as the only contextual output.
- Preserve `POST /search/shortcut/coverage` as a separate full-coverage map
  endpoint. It should return coverage features independent of page-one result
  pagination.
- Update shortcut coverage features to emit `craveScore` and rank by the
  tab-native Crave Score.
- Delete `buildContextualRestaurantScoresCte`.
- Delete `buildContextualConnectionScoresCte`.
- Delete `core_display_rank_scores` reads from active search paths.

Exit gate:

- No active search response includes `contextualScore`.
- No active shortcut coverage response includes `contextualScore`.
- Top result in a one-item result set does not become `100`.
- Rank changes with query/viewport; Crave Score does not.
- A shortcut search with page size 20 can still publish more than 20 map
  features when the viewport has more than 20 coverage-eligible restaurants.
- DB integration fixtures prove search rank is contextual while `craveScore` is
  stable.

### Phase 5: Mobile cutover

- Update shared types to require `craveScore`.
- Delete score fallback chains.
- Update map pins, cards, profile panels, and score sheets to read `craveScore`.
- Replace contextual-score explanatory copy.
- Use score color from tab-native row `craveScore`.
- Update score info modal copy to simple polls/votes/Crave Score language, with
  confidence explained there only.
- Show movement next to the compact score only when `scoreDelta7d` is available
  and non-zero.
- Do not show `NEW`, `Stable`, or compact-card confidence labels.
- Rename or wrap the old quality-color utility as
  `getCraveScoreColorFromScore`.
- Delete final runtime dependence on `pinColorGlobal`, `pinColorContextual`, and
  percentile-color helpers.
- Keep rank badges as ordinal rank only.

Exit gate:

- No mobile surface labels contextual score as restaurant or dish score.
- No mobile code falls back from contextual score to raw quality.
- No mobile color path falls back to raw quality, viewport percentile, result
  index, or rank.
- The score chip and rank badge are visually and semantically separate.
- Computed restaurant and dish scores always render in v1.
- Confidence appears only in score info surfaces, not compact result cards.

### Phase 6: Delete old rank-score ownership

- Drop `core_display_rank_scores`.
- Remove `DisplayRankScore` from Prisma schema.
- Remove rank-score refresh queue, worker, service, and module.
- Remove poll score refresh calls that only exist to refresh display rank scores.
- Remove old migration-era runtime readers.

Exit gate:

- Delete gate passes without allowlisting active runtime code.
- Search still returns rank, but rank is not backed by display-rank score tables.

### Phase 7: Movement and charts

- Run the public score job daily after collection/poll aggregation settles.
- Persist one public score snapshot per subject per day.
- Compute score movement from the latest score versus the nearest available
  snapshot around seven days earlier.
- Expose weekly score movement only when it is available and non-zero; otherwise
  omit or null movement fields.
- Do not expose `NEW` or `Stable` as compact score states in v1.
- Do not compute or expose rank movement for arbitrary viewport search results.
- Compute chart/rank movement only when a concrete, named, stable scope exists:
  - `#3 in Austin burgers`
  - `up 2 ranks this week`
  - `new on this chart`
- Keep movement separate from score calculation.

Exit gate:

- Score movement is derived from score history, not request-time rank.
- Chart rank movement is derived from chart scope history, not public score
  history or request-time viewport rank.
- Neither movement path changes the public score directly.
- A result never exposes an unlabeled single number that could mean either
  score points or rank positions.

### Phase 8: Final calibration certification

- Run the full two-layer Crave Score fixture suite.
- Regenerate `plans/crave-score-fixture-validation-report.md`.
- Verify selected constants match the scorer config and score run snapshots.
- Verify cleanup reports zero remaining fixture rows.
- Re-run the delete gate after fixture validation.

Exit gate:

- `yarn workspace api crave-score:fixtures` passes.
- The report shows all hard invariants passing.
- Soft band loss is accepted and explained.
- Score distribution is not compressed into a narrow high-score cluster.
- Delete gate passes without active-runtime allowlists.

## Validation Fixtures

The calibration suite above is the source of truth. At minimum it must cover:

- one result in viewport does not display `100`
- same entity score is unchanged across two viewport bounds
- same entity score is unchanged across two query terms when the same subject is
  returned
- restaurant-tab rows rank by restaurant Crave Score even for dish-oriented
  queries
- dish-tab rows rank by matched connection Crave Score
- sparse market winner ranks first locally but does not receive an elite score
- mature market standout can receive an elite score
- NYC-style high-volume market does not win from volume alone
- Austin-style smaller market can compete through strong relative evidence and
  confidence
- Round Rock-style locality inside the Austin regional market uses the Austin
  scoring market
- poll winner with broad distinct voters outranks raw vote spam
- demand/cache replay changes demand/poll planning, not public quality
- mobile score copy contains no contextual-score language
- computed scores always render in v1; no `NEW`, null, or hidden score states
- movement renders next to score only when non-zero weekly delta is available
- confidence appears only in score info modal copy, not compact cards
- user-facing score info copy uses polls/votes/Crave Score language and does not
  expose Reddit/source-document terminology
- shortcut coverage returns all score-eligible map features for the submitted
  viewport, not only page-one card results
- shortcut coverage count is explained by eligibility/data inventory when it is
  low
- score color is continuous across adjacent Crave Score values, not stair-stepped
- the same subject keeps the same color across viewport changes when its
  `craveScore` is unchanged
- result rank changes do not change score color unless the tab-native score
  subject or `craveScore` changes

## Final Target Shape

The ideal user-facing result is:

```text
#3
96.8°
```

When meaningful score movement is available, the compact score may become:

```text
#3
96.8° ↑1.2°
```

Where:

- `#3` is contextual to the current search/list/map.
- `96.8°` is the stable Crave Score.
- color comes from the stable Crave Score.
- weekly movement is a separate signal.
- confidence is explained only in the score info modal.
- no hidden viewport percentile creates the number.

## Implementation Notes From Cutover

- Public Crave Score rebuilds are global calibration runs. Collection,
  enrichment, and poll refresh paths may trigger a rebuild, but they must not
  pass market-scoped or subject-scoped filters because that would recalculate
  `globalZ` against a partial universe.
- Public raw quality input uses source facts plus normalized poll-performance
  signal and intentionally excludes legacy poll pseudo-mentions/upvotes. Poll
  facts enter once through the poll branch; they are not allowed to inflate raw
  mentions.
- Public raw quality is not clamped to `0-100` before normalization. The bounded
  `60.0-99.9` range belongs only to `display_score`.
- User-facing poll counts are distinct poll counts, not poll-option row counts.
  A restaurant or dish represented by multiple options in the same poll still
  reports one poll.
- Poll confidence and poll aggregation use distinct users, not vote rows. A
  user voting for multiple options in one poll must not count as multiple
  participants.
- Market reliability uses distinct poll breadth and poll count, not raw poll
  vote row volume.
- The distinct poll breadth used for market reliability is market-level distinct
  users. Per-subject distinct voter counts can affect entity confidence, but they
  must not be summed into market reliability because one user may vote for
  multiple options or subjects.
- Missing public score rows are treated as data integrity failures in public
  payload paths. Do not synthesize `0`, `60`, or any placeholder as a public
  score. Real public result, favorite, and coverage contracts require numeric
  `craveScore`; preview shells use a dedicated preview type that can carry
  `craveScore: null` until hydrated.
- Shortcut coverage is fail-closed. Restaurant coverage requires a restaurant
  public score. Dish coverage requires a scored connection row and must not
  borrow the restaurant score for a dish pin.
- Favorite-list previews are public score surfaces. Their preview item contract
  is numeric `craveScore`, and preview dot colors use the same shared continuous
  Crave Score color curve as cards and map pins.
- Score info copy is public-facing and should use polls, votes, and Crave Score
  language. Source-document, Reddit, mention, and confidence internals stay in
  private traces unless a later UX explicitly exposes them.
- The v1 color mapping is continuous and based on `score / 100`, not viewport
  rank, percentile, result index, `index / total`, or a rescaled 60-100 band.
- The fixture suite now has a pure calibration layer plus a DB rebuild
  integration layer that verifies latest score coverage, no forced `100`, market
  stats, and same-day score history.
- The fixture suite also seeds real DB fixture entities, connections, poll
  options/votes, locations, favorite lists, public scores, shortcut coverage
  reads, SearchQueryExecutor dual-list reads, and favorite preview reads. It
  verifies poll-performance influence, distinct poll counts, one-result viewport
  score stability, page-one-independent coverage above 20 map features,
  score-sorted restaurant/dish page-one results, distinct multi-option voters,
  dish-coverage subject correctness, favorite preview `craveScore`, and fixture
  cleanup across seeded users/entities/connections/polls/scores/favorites.
