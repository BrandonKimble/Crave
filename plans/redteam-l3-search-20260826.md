# Red team L3 — search read path + market membership (c76f14638)

Date: 2026-08-26. Standard: ideal abstractions only; guards/special-cases are findings.
Scope: `apps/api/src/modules/search/*` + `restaurant-enrichment/market-membership.service.ts`.
All quotes verified against the working tree; DB claims verified against the local corpus.

---

## F1 (HIGH) — market_excluded_at readers are hand-enumerated, and four were missed

The verdict column is filtered at exactly four sites (grepped): the search builder's
`buildPlaceConditions` (`Prisma.sql\`r.market_excluded_at IS NULL\``, search-query.builder.ts:1037),
search-coverage.service.ts:107 (map dots), and public-crave-score.service.ts:941/986
(both score lanes). There is no shared "servable place" fragment — each reader
re-states `type = 'place' AND status <> 'archived' AND market_excluded_at IS NULL`
by hand, the exact shape the extraction-scope service was built to kill for events
("The fragment is the scope service's ONE definition; never hand-roll this join" —
the builder's own comment, 30 lines above a hand-rolled predicate set).

**Missed readers (verified: no `market_excluded_at` in file):**
- `autocomplete.service.ts:1413` — corpus-support counts (`scoped_restaurants` =
  ALL places) include the 220 excluded rows; attribute demand denominators are skewed.
- `signals/signal-demand-read.service.ts:525,769` — demand reads count excluded places.
- `teaser/teaser.service.ts:297` — the teaser can name an out-of-market place
  (Grape Creek Vineyards as an Austin teaser example).
- `home/curated-list-builder.service.ts:832` — protected only INDIRECTLY: the
  `core_public_entity_scores` join plus the city-polygon `ST_Covers`. The score
  join is a one-night stale window (see F2), and the polygon does not encode the
  verdict — it encodes a different, tighter geometry.
- Favorites/polls read user-scoped rows — arguably correct to keep serving
  (a user's saved place shouldn't vanish), but that is currently an ACCIDENT of
  omission, not a ruling. It should be a documented decision.

**Rederived shape:** one exported fragment, same pattern as
`activePlaceEventExistsSql` — `servablePlaceConditionsSql(alias)` returning
`{alias}.type='place' AND {alias}.status <> 'archived' AND {alias}.market_excluded_at IS NULL`
(with a variant for readers that legitimately keep archived/excluded, e.g. user-owned
surfaces, which must OPT OUT by name). Every current site rewritten onto it; an
invariant scanner is the wrong tool — the fragment IS the chokepoint.

## F2 (HIGH) — score-pool residue: excluded places keep serving through the score join for up to a day, and ordering is uncoupled

Verified on the local corpus: **220 restaurant rows and 189 dish rows still sit in
`core_public_entity_scores` for places with `market_excluded_at IS NOT NULL`.**
The score writer filters its INPUT (`AND r.market_excluded_at IS NULL`) and its
stale-prune (`DELETE FROM core_public_entity_scores` for subjects not upserted
this run, public-crave-score.service.ts:1207) will clear them — but only on the
next score rebuild. Until then every score-join reader (curated lists, teaser,
autocomplete ranking, anything trusting `core_public_entity_scores` membership as
"servable") serves excluded places with live scores and stale percentiles.

Worse, the coupling is implicit: the nightly convergence phase runs the membership
reconcile (nightly-convergence.service.ts) and the score rebuild is a separate
cron; nothing orders reconcile-before-scores. A reconcile that lands after the
score build leaves the residue for a full extra day.

**Rederived shape:** the verdict write and the pool are one transaction of intent —
either (a) the reconcile's UPDATE returns the entity ids whose verdict CHANGED and
enqueues a scoped score refresh/prune for exactly those subjects (the reconcile
already computes `changed`), or (b) the convergence phase owns BOTH steps in
order. (a) is ideal: the verdict writer is the only actor who knows the delta.

## F3 (HIGH) — the concept-with-columns primitive exists only for cuisine; three sibling representations of "attribute constraint" survive

`PooledSoftConcept {id, columns[]}` (search-execution-directives.ts:7-10) is carried
cleanly through builder + starvation + gate via ONE renderer,
`buildSoftConceptExpr` (search-query.builder.ts:1002) — within its lane, uniform.
But the lane sits beside three other representations of the same idea:

1. **Plain attributes** still ride `ParsedFilters.itemAttributeIds` /
   `placeAttributeIds` and compile through `buildArrayOverlapClause` single-column
   paths (builder:1047,1071,1189,1224) when hard, and are wrapped into
   single-home concepts (`columns: ['food_attributes']`, search.service.ts:1643)
   when soft — the service hand-assigns the column per bucket instead of the
   attribute knowing its homes.
2. **Dietary walls** are a bespoke third shape
   (`dietaryWalls: Array<{name, itemAttributeId?, placeAttributeId?}>`) with their
   own registry and their own two SQL renderers
   (`DietaryConstraintRegistry.dishWallConditions/placeWallConditions`) — yet a
   dietary wall IS a concept with per-axis homes and hardness=wall. Its
   restaurant-axis SQL (`venue @> OR EXISTS dish`) is byte-parallel to the cuisine
   wall's (builder:243-252 vs the same shape at the cuisine site).
3. **Cuisine hard walls** are a fourth: `cuisineConceptIds: string[]` — note it
   DROPS the columns! The directive is a bare id list and the builder re-hardcodes
   the two homes at three sites (dish wall :725, restaurant wall :248, pooled arms).
   The concept primitive exists in the type system and then gets erased at the
   directive boundary for the hard case.

So yes: **cuisine-as-special-case is the new patch.** The commit built the right
primitive and then applied it to one facet.

**Rederived shape:** every attribute constraint is
`{id, columns[], hardness: 'wall' | 'soft'}`. Columns derive from the facet
(dietary pair → both, per-axis-asymmetric; cuisine → both; plain place_attribute →
restaurant_attributes; plain item_attribute → food_attributes). ONE directive
field, ONE renderer per axis (wall = AND into WHERE, soft = concept in the pooled
gate), dietary's per-projection asymmetry expressed as per-axis column sets
(dish axis: food only; restaurant axis: both) instead of a parallel registry code
path. `cuisineConceptIds`, `dietaryWalls`, and the residual single-column attribute
membership paths all dissolve into it.

## F4 (MEDIUM) — precedence-by-list is accretion; the ordering principle is "curated verdict outranks type accident" and should live on the facet

`pickPlacedWinner` (search-query-interpretation.service.ts:1206-1225): dietary
`.find()`, then cuisine `.find()`, then `CROSS_TYPE_PLACEMENT_ORDER`. Each new
facet = a new registry class + a new hardcoded tier + a new parameter threaded
through 4 call sites (`dietaryIds, cuisineIds` already ride every placement call).
The underlying principle IS articulable: **a curated facet verdict about the
vocabulary beats the accidental type of whichever entity matched** (the registry
comment says exactly this), and among facets, the more restrictive/safety-bearing
verdict wins (dietary is a correctness constraint; cuisine a relevance one).
That is a RANK ON THE FACET, not a list in the code.

**Rederived shape:** one `FacetRegistry` (subsumes DietaryConstraintRegistry's id
set + CuisineFacetRegistry) serving `facetOf(entityId) → {facet, placementRank,
columns, hardness-semantics}`; `pickPlacedWinner(candidates)` sorts by
`(placementRank, CROSS_TYPE_PLACEMENT_ORDER)`. A new facet is a ROW (facet column
value + registry metadata), not a tier of code. This also collapses the third
cuisine vocabulary found in the wild: `curated-list-builder.service.ts:898`
derives "cuisine" from `restaurant_metadata->'cuisineExtraction'->'attributeIds'`
— a SECOND definition of the cuisine set that will drift from `facet='cuisine'`.

## F5 (MEDIUM) — market_excluded grain: per-entity-global is defensible TODAY only because territories are unioned and readers are geo-scoped; the principle should be written down before NY

The verdict (market-membership.service.ts) is: excluded iff NO geocoded location
is inside ANY crediting community's territory (union semantics across
communities). Single global column. Consequences, checked:

- **Two-community credit (Landry's-class chains):** if NY onboards and its events
  credit a place physically in NY, the union clears the verdict — the place
  re-enters the GLOBAL score pool and global demand/autocomplete lanes that Austin
  percentiles are computed over. Search itself stays correct (viewport-scoped),
  but the score pool is one pool: percentile lanes will mix cities the moment
  two markets share the corpus. The single-column verdict is CORRECT under the
  question it answers ("is this place inside anyone's market?"); it is the
  READERS whose question will change to "inside THIS community's market?" —
  score lanes and demand lanes will need community scoping regardless of this
  column's grain.
- **Second community onboarding:** everyone's verdict does recompute — the
  nightly reconcile is corpus-wide and the verdict is a pure function of stored
  state (`(r.market_excluded_at IS NOT NULL) IS DISTINCT FROM v.excluded` makes
  it idempotent and self-clearing). No stale-verdict trap here; good.
- So: **(entity, community) membership is NOT needed for exclusion** — exclusion
  is genuinely global ("nobody's market wants it"). What IS coming is per-community
  IN-market attribution for pool/percentile scoping, which is a different table
  (derivable on demand from the same territory join) — don't pre-build it, but
  the service header should state the grain ruling so NY doesn't patch a
  community_id column onto a verdict that means something else.
- Nit: `COALESCE(r.market_excluded_at, now())` preserves the first exclusion
  timestamp across flaps — deliberate and right (it's an audit fact).

## F6 (MEDIUM) — SOFT_ID_CAP is per-bucket, so the "8 covers everything" DoS bound is actually 24

search.service.ts:1631-1662: the cap comment says "DoS bound … 8 covers every
real query shape", but `.slice(0, SOFT_ID_CAP)` is applied independently to item
attributes, place attributes, AND cuisine concepts — up to 24 concepts, each a
window-count column + gate arm (the cuisine ones two-armed). The cuisine bucket
addition silently widened a bound whose comment still says 8.
**Rederived shape:** cap the assembled `softConcepts` list once, after concat —
the bound belongs to the QUERY, not the bucket (falls out of F3's single list).

## F7 (LOW) — CuisineFacetRegistry invalidation: acceptable staleness, but the error path retries every search and there is no mint-side bust

- Staleness: 5-min TTL, per-process. The knowledge lane minting a facet row
  mid-process (worker) leaves the API serving old placement/projection ≤5 min —
  degradation is the documented pre-facet behavior, fail-open to empty set.
  Acceptable for a curation-rate vocabulary; NOT a patch.
- But the catch block (`return this.cache?.ids ?? new Set()`) does not extend
  `expiresAt` — during a DB blip every search re-runs the failed query (no
  backoff), and with a cold cache each returns a FRESH empty set. One-line fix in
  the ideal shape: on error, install the degraded value with a short TTL.
- The real dissolve is F4's FacetRegistry: today there are two identical cache
  classes (dietary + cuisine) and a third facet will copy-paste again.

## F8 (LOW) — SQL/indexes: dual-home OR is correct; one dead index; the pooled venue-arm asymmetry is deliberate but undocumented

- **Correctness under empty homes:** `buildSoftConceptExpr` maps a nonempty
  `columns[]` (always 1–2 by construction); single-home renders bare containment
  (byte-equivalent to pre-concept SQL, as claimed). Dedup across homes is free —
  OR on one row, never a join fan-out. Starvation windows read the CTE's own
  output columns (`fci.food_attributes` / `fci.place_attributes_arr`, selected at
  builder:768/783) — one JSON key per concept, the F5 duplicate-key trap is dead.
- **Indexes (verified live):** `idx_connections_attributes_gin` GIN on
  `core_restaurant_items.food_attributes`; partial GIN
  `idx_entities_restaurant_attributes_validation ... USING gin (restaurant_attributes) WHERE type='place'`
  — both membership homes covered; the restaurant-axis venue-arm EXISTS rides
  `idx_connections_restaurant`. But `idx_entities_restaurant_attributes` is a
  plain **BTREE on a uuid[]** (recreated non-GIN in 20251221010607) — useless for
  `@>`/`&&`, pure write cost. Drop it.
- No index on `market_excluded_at` — correct call (residual filter on an already
  narrow row set; a partial index would be a guard against nothing).
- Asymmetry worth one comment, not a change: the pooled restaurant-axis food arm
  scopes its dish EXISTS to `connectionMatchSql` (builder:197) while the hard
  cuisine wall's venue arm (builder:248) and the dietary place wall deliberately
  do NOT. Tier-0 meaning ("the MATCHING dish carries the concept") vs wall meaning
  ("the venue is X-viable") — both right, neither says why they differ.

---

## Ranked fix order
1. F1 servable-place fragment + missed readers (correctness now, 220 rows live).
2. F2 verdict→score coupling (one-day serve-window every reconcile).
3. F3 unify constraint representations (dissolves F6, most of F7, half of F4).
4. F4 facet-owned placement rank + kill the curated-list's second cuisine vocabulary.
5. F5 write the grain ruling into the service header before NY onboards.
6. F8 drop the dead btree array index; add the asymmetry comment.
