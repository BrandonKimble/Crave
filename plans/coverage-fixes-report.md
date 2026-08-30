# Entity-type coverage fixes — pre-reload queue (F-1, F-3, F-2/F-8, F-13, red-team F2)

Date: 2026-08-30. Implements the pre-reload work queue of
`plans/entity-type-coverage-audit.md` plus the coordinator's scope addition
(red-team F2, `plans/wave-redteam-report.md`). All code uncommitted, on the
shared tree.

## F-1 — the demand slice can select place/item (and ingredient) demand

**File:** `apps/api/src/modules/content-processing/reddit-collector/keyword-slice-selection.service.ts`

`COLLECTIBLE_ENTITY_TYPES` carried the pre-R14 literals
`'restaurant','food'`. Its ONE consumer is
`SignalDemandReadService.territoryEntityDemand` (`entityTypes` param →
`signal-demand-read.service.ts:904`, `e.type::text = ANY(${...}::text[])`) —
a text-to-text compare, so the stale names errored nothing and matched no
row: place and item demand (74% of on-demand rows, ~93% of entities) never
selected, and the demand slice returned attributes only. Traced end-to-end:
no other consumer of the constant, no other cast of the values.

**Fix:** `export const COLLECTIBLE_ENTITY_TYPES: string[] =
Object.values(EntityType);` — derived from the live enum, so a rename can
never strand it again. The enum's `::text` values are exactly what the SQL
compares.

**Ingredient decision — INCLUDED.** Every entity type is collection demand:
an asked-for ingredient ("burrata") seeds collection exactly like a dish
word — the on-demand rail already accepts `entityType: 'ingredient'`
unfiltered, the residue segmenter now records ingredient demand (F-3), and
the demand read's territory kernel is type-agnostic. Excluding it would
recreate the same silent hole one type over: users who repeatedly search a
component we don't cover would never trigger collection. There is no
counter-argument from cost (the slice competes on measured demand score;
a type with no demand simply never wins a slot) or from semantics (the
keyword search downstream treats the entity name as a search term, which an
ingredient name is).

**Spec:** `collectible-entity-types.spec.ts` — set-equality with
`Object.values(EntityType)`, explicit place/item/ingredient membership,
explicit `'restaurant'`/`'food'` regression asserts. PASS.

## F-3 — the residue drain keeps the segmenter's fifth array

**File:** `apps/api/src/modules/search/unsegmented-residue.service.ts`

The residue prompt/schema emit five arrays (`ingredients` included:
`llm-response-schemas.ts:30-42`); the drain hand-copied four arms and
dropped `ingredients` — the exact F3800 forgot-a-group defect one system
upstream of the fixed one. Staging: zero ingredient on-demand rows ever.

**Fix (F3800 idiom applied):** the arm list now DERIVES from the one group
vocabulary — `RESIDUE_GROUP_ENTITY_TYPE` is `satisfies
Record<QueryEntityGroupKey, EntityType>` over `QUERY_ENTITY_GROUP_KEYS`, and
the drain flatMaps the keys. A sixth group added to the DTO becomes a tsc
error at this map, not a silently-discarded LLM answer.

**Spec:** `unsegmented-residue-ingredient.spec.ts` — an `ingredients:
['yuzu kosho']` answer becomes an `entityType: 'ingredient'` on-demand
request; an all-groups answer maps onto exactly `Object.values(EntityType)`;
the nothing-named discard path unchanged. PASS.

## F-2/F-8 — the dedupe sweep now scans ingredients, with the real judge kind

**File:** `apps/api/src/modules/content-processing/entity-resolver/food-dedupe-merge.service.ts`

Design: same lanes, once per vocabulary — `DEDUPE_SWEEP_TYPES = [item,
ingredient]`, never cross-type (`'beef'` the ingredient and a dish-word are
deliberately distinct). What changed per lane:

- **Support predicate (D5):** an ingredient is never a connection's
  `food_id`; its active support is REFERENCE — `core_restaurant_items.
  ingredients @> id` or an active dish's `canonical_ingredients @> id`
  (`sweepSupportSql`). Items keep the shared `activeSupportExistsSql`.
- **Winner selection:** evidence = reference count for ingredients
  (connections' arrays + dish canons), connection count for items; ties
  still break to the shorter name.
- **Judge kind (F-8):** `matchEntitiesBatch({ kind: 'ingredient' })` for
  ingredient pairs — the match prompt's ingredient doctrine now hears them
  instead of dish doctrine. Homes context for an ingredient = restaurants
  whose dishes CARRY it (lateral unnest of the arrays), same evidence shape
  the item arm reads.
- **Merge effect — the part nothing covered:** the search seam reads
  `c.ingredients && ids` / `canonical_ingredients && ids` with the
  query-time winner's id and NO redirect hop, so a loser id left in those
  arrays is evidence no search can reach. The merge now rewrites both
  columns in-transaction (array_replace-with-dedupe), gated to ingredient
  merges. Everything else rides the shared machinery unchanged:
  verdict-ledger (same sorted-pair claim key — uuid pairs, type-agnostic),
  `finalizeMergeCompletion` (alias banking, archive, redirect flatten),
  `rehomeEntityAnchors`, `rekeyEntityDimensionEventsToCanonical`, advisory
  locks now keyed by the pair's real type. `ItemMergePlan` gained
  `entityType?` — stored pre-extension plans replay as `'item'`.

**Spec:** `ingredient-dedupe-merge.integration.spec.ts` (yarn test:db,
real Postgres) — evidence-count winner selection, both array columns
re-pointed, dedupe when a row carried both twins, loser archived, redirect
written. PASS.

### Red-team F2 (scope addition) — the embedding docket actually drains

The embedding lane's `LIMIT 200` ran before the ledger's memory, so every
run recalled the same closest 200 pairs; once judged, later runs heard 0
and pairs 201+ were unreachable. Fix mirrors the attribute lane's order
(candidates → ledger filter → cap), pushed into the SQL: `undecidedPairSql`
anti-joins `claim_verdicts` at the current rule/fold version on the
sorted-pair claim key (`LEAST/GREATEST ... COLLATE "C"`, matching the
adapter's JS codepoint sort), applied INSIDE the lateral (K picks the
closest unjudged neighbors) and therefore before the outer LIMIT. The
trigram lane's `LIMIT 200` got the same anti-join. The ingredient extension
is born with this ordering — both types share the one query.

**Spec:** `embedding-docket-drain.integration.spec.ts` — two-run
simulation: seeded twin pair recalled on run 1; after a persisted 'hold'
verdict, run 2's recall excludes it at query level. PASS. (The recall query
was extracted to a `protected embeddingCandidatePairs` precisely so this is
testable without driving the destructive full sweep.)

### Ingredient dedupe DRY-RUN against staging (read-only; judge on the dev key)

Docket built from staging with the extended sweep's own predicates (2,204
active ingredients, 1,417 with active support): 7 order-twins, 12 trigram
pairs (floor 0.65), embedding pairs at cosine dist < 0.06 — 121 distinct
pairs judged with `kind: 'ingredient'` + homes context. **No DB writes; no
`--apply`.** Verdicts: **79 would merge, 42 held.**

Would-merge highlights (full table:
`scratchpad/ingredient-verdicts.json` of this session): beef ribeye ==
ribeye beef · ricotta cheese == ricotta · bbq sauce == barbecue sauce ·
mayonnaise == mayo · lemongrass == lemon grass · oaxaca == oaxacan cheese ·
green onion == scallion · nopal cactus == nopales · kampachi == kanpachi ·
choux pastry == pate a choux · matzoh meal == matzah meal.

Held (correctly): flour-tortilla vs tortilla, sourdough starter vs
sourdough, coconut milk vs coconut cream, lamb shank vs beef shank,
brick vs brie cheese, extra-virgin vs olive oil — the judge's
general-vs-specific doctrine is doing real work.

Watch-items for activation (not fixed here, flagged):
1. The deterministic NUMBER lane will auto-merge `bitter`/`bitters`
   (singular/plural, no judge) — the judge, asked, said REJECT ("generic
   adjective" vs the cocktail ingredient). Pre-existing deterministic law,
   now reaching ingredients; worth an owner glance before
   `DEDUPE_JUDGE_LANES_ENABLED` + the nightly sweep meet the ingredient
   corpus.
2. Judge transitivity: `barbecue sauce == bbq` (match) but `bbq sauce vs
   bbq` (new) — chains resolve over successive nightly runs, but the first
   run's merge order decides which name wins.
3. A few generous matches (`flour == wheat flour`, `sourdough == sourdough
   bread`, `pork fat == lard`) — the judge lane is still OFF by default;
   activation stays with the coordinator's sequencing.

## F-13 — the class-killer invariant

**Scanner:** `apps/api/scripts/check-entity-type-literals.ts` — parses the
EntityType enum out of `schema.prisma`, comment-strips every `.ts` under
`src/` + `scripts/` (1,015 files, <2s), and refuses any string literal in
the four incident shapes that is not an enum member: `'x'::entity_type`
casts, `*ENTITY_TYPES*`-named array literals, `entityTypes: [...]`
properties, and arrays cast/pinned to `EntityType`. Liveness floor (a scan
that saw <100 files fails itself); zero false positives on the live tree.

**Registry entry:** `vocabulary.entity-type-literals-are-enum-members` in
`src/shared/invariants/registry.ts`. Three mutations (each proven RED by
`yarn invariants vocabulary.entity-type`): the pre-fix F-1 literal VERBATIM
(the exact `['restaurant','food',...]` block of `git show 7a4ca0977` —
planted as a scratch probe and rejected), the `['food'] as EntityType[]`
cast shape (the 2026-08-19 incident), and the `'food'::entity_type` SQL
cast. Two legitimate cases (a hand-list of real members; a non-entity
vocabulary array) proven to still pass.

Proof run: `1 invariant(s), 5 proof(s) run. Every invariant rejected the
defect it was bought with.` (3 rejected, 2 allowed-not-too-broad.)

## Verification

- `npx tsc --noEmit`: clean for every touched file (three pre-existing
  errors from CONCURRENT sessions' in-flight edits —
  `restaurant-name-census.service.ts`, two `knowledge-maintenance` specs —
  not mine, not introduced by this work).
- Unit specs: 5/5 pass (`unsegmented-residue-ingredient`,
  `collectible-entity-types`).
- Integration (`yarn test:db`): `food-dedupe-merge-pair` (updated for the
  new signature), `ingredient-dedupe-merge`, `embedding-docket-drain` — all
  pass against the local dev DB.
- eslint: clean on all touched files.
- `yarn build`: green (exit 0).
- Invariants: FULL `yarn invariants` run GREEN — `43 invariant(s), 88
  proof(s) run. Every invariant rejected the defect it was bought with`,
  including the new `vocabulary.entity-type-literals-are-enum-members`
  entry (3 mutations rejected, 2 legitimate allowed). (Run serialized
  behind concurrent sessions' runs via the registry's own lock; completed
  clean. Note for the coordinator: a concurrent session's in-flight edit to
  `attribute-merge-prompt.md` carried an unversioned fingerprint
  `f5416506d060` for a while, which broke AppModule boot — not this work's,
  observed in passing.)
- Staging: SELECT-only; judge dry-run via the dev Gemini key (5 batched
  calls, ~121 pairs, cents).
