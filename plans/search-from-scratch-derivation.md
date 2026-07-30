# Search: The From-Scratch Derivation (canonical spec, 2026-07-29)

Derived from requirements as if no code existed; the current implementation
compared at the end. This is the doc we build against. Everything marked
RATIFIED is an owner decision from the 2026-07-28/29 sessions; everything
marked MEASURED cites the evidence produced in them.

## 0. The requirements (what must be true)

1. **A claim is one comment saying one thing about one place**, counted
   once, credited to the most specific thing named (claim identity,
   d9e963da).
2. **A word's meaning lives in the data, not in a guess.** 827 of 17,949
   active names carry multiple entity types; "breakfast" is a food class
   AND a venue property simultaneously (MEASURED).
3. **The user's query is intent, not schema.** Nobody typing "spicy
   breakfast tacos" has heard of `food_attribute`.
4. **Score is sovereign** (RATIFIED, twice: the pooled-pure-score comment
   at search.service.ts:995 and re-confirmed 2026-07-29). The visible list
   is ALWAYS ordered by score (or trending — same law, different key).
   Matching influences MEMBERSHIP of the pool, never visible order.
   Sectioned/tiered presentation stays a shelved experiment
   (SEARCH_RANKING_MODE=sectioned, default off).
5. **Some constraints are non-negotiable** — and not only the toggle
   filters (see §3).
6. **Missing data is a signal, not a failure** — thinness feeds on-demand
   collection, and the signal should say WHICH word failed, not "few
   results".
7. **The user consumes two objects** — a dish card and a restaurant card.
   Product fact, not implementation choice. Two projections is the
   from-scratch answer, not a legacy accident.
8. **No fake numbers.** Weights, floors, and cut points are measured
   (sweeps, ledgers) or owner-chosen — never invented (no-fake-estimates
   law).

## 1. The pipeline: Understand → Ground → Filter → Pool → Rank → Learn

### 1.1 Understand (span segmentation; LLM demoted, not removed)

Order of lanes — deterministic facts first, calibrated judgment second,
LLM last (the session's recurring law: plural resolution, thinking
resolver, spend gate all landed on this shape):

1. **Gazetteer pass** (tier 0): scan the query with the existing
   span-preserving n-gram scanner (`scanForKnownEntities`) across ALL
   entity types INCLUDING ingredient, viewport/territory-scoped. Returns
   character spans → entities WITH the types the data says they have.
   Deterministic, one indexed query, no LLM.
   - Poll highlighting keeps its narrower type set — in a comment,
     attribute words are incidental prose; in a query every word was typed
     on purpose. One engine, per-consumer type set + display policy.
   - Overlap policy (OPEN, decide at build): longest span wins for
     segmentation; the shorter contained match ("taco" inside "breakfast
     taco") is retained as family evidence, not as its own span.
2. **Linker on the residue**: the calibrated conservative matcher
   (sweep-derived per-tier floors, tie plurality) for typos and variants
   the gazetteer can't see ("vgean" → vegan).
3. **LLM on the remaining residue only** — its irreplaceable jobs:
   - **Negation** ("no cilantro" — the gazetteer alone would ground
     cilantro as a POSITIVE constraint: the inverted-allergy failure, the
     most dangerous bug this design must make impossible);
   - filter words → structural filters ("cheap", "open late");
   - junk words → discarded ("best", "somewhere");
   - segmentation of unknown phrases (→ clean on-demand terms);
   - modifier↔subject attachment in multi-subject queries.
     **Skip gate (conservative):** the LLM may be skipped ONLY when the
     residue after lanes 1–2 is empty. Negation/filter/junk words are never
     entity names, so they always land in residue — the property that makes
     the skip safe.
4. **The LLM assigns NO types.** Typing was the root cause of every
   query-understanding bug found this session (breakfast, sushi, tasting
   menu): the guess was made at the layer that lacks the facts, and
   type-scoped recall then never looked in the right vocabulary (the
   never-look defect). Types come from grounding.

### 1.2 Ground (structured, never flattened)

Each span resolves to a STRUCTURED grounding — kept structured all the way
to the query builder:

- **anchors**: the entities the span names (all types it truly has);
- **family**: is-a instances via `derived_food_category_edges` (one-hop
  from anchors only — the transitive fan-out ban stands) + head-final name
  variants + twin ingredients. Family is MEANING, not widening: a "pizza"
  search that excluded neapolitan pizza would be wrong, not strict.
- **similar**: reciprocal-neighbor dense siblings (mutual-rank cut,
  ceiling-normalized relevance — the precomputed
  `derived_entity_sibling_edges` machinery survives unchanged).

**Anti-flattening law.** The current code merges everything into one
foodIds array and then reconstructs the distinctions with three pieces of
bookkeeping (exactFoodIds rebuild, relevanceByFoodId side-map, max-merge
rule). The ideal shape abolishes the flattening boundary instead of
compensating for it.

**One evidence engine for "same thing?", per-consumer floors.** The linker
(95%-precision floors) and search-time lexical expansion (different
floors) are today two independently tuned implementations of the same
question — the two-rate-tables disease. Unify the engine; keep DIFFERENT
admission floors per consumer, because the questions are differently
priced (a wrong LINK asserts identity; a wrong EXPANSION admit adds a
pool member that provenance + score-ranking absorb).

### 1.3 Filter (hard constraints — the four classes)

Hardness is a FACT, derived — never guessed per query:

| class                   | source              | examples                                                            | relaxable?            |
| ----------------------- | ------------------- | ------------------------------------------------------------------- | --------------------- |
| structural              | request             | viewport, open-now, price                                           | never                 |
| exclusion               | negation in text    | "no cilantro"                                                       | never                 |
| **dietary requirement** | **vocabulary flag** | vegan, gluten-free, halal, kosher, dairy-free, nut-free, vegetarian | **never**             |
| preference              | default             | spicy, crispy, patio, cozy                                          | soft (richness-gated) |

RATIFIED 2026-07-29: dietary attributes are hard. Today's ladder DROPS
"vegan" (it lives in the droppable food-attributes bucket) — for a vegan
user that is a wrong answer, not degradation. The fix: a small CURATED
`constraintClass` flag on the attribute entities themselves (closed set,
owner-approved; everything unflagged is soft). When a hard constraint
makes results thin we do NOT relax — we show what honestly exists and
fire the precise demand signal. "Include similar" (the chip) remains the
user's explicit opt-out.

### 1.4 Pool (one query; soft constraints; the richness gate)

One execution per projection. In-query, every candidate row computes which
constraints it satisfies (provenance). Membership policy:

1. Subject + family: always required (subject is sacred).
2. Hard constraints: absolute walls.
3. Each PREFERENCE is individually droppable — per WORD, not per type
   bucket (today "spicy vegan tacos" thin drops spicy AND vegan together;
   per-word can keep vegan-only matches first — and with vegan now hard,
   spicy alone is what relaxes).
4. **THE RICHNESS GATE (named invariant):** soft misses are admitted ONLY
   when full matches are scarce (threshold ≈ today's 10). Without it,
   score-alone ordering makes every soft word decorative — a high-score
   non-spicy taco would outrank spicy ones even when spicy tacos abound.
   Expressible in-query (window function). NOT optional.
5. Similar ring: admitted only behind the user's "Include similar" chip
   (existing behavior, kept).

What this dissolves — scaffolding that exists only because the pool is
assembled from separate executions: stage probe queries, exclusion-id
lists, hand-rolled strict/relaxed pagination stitching.

### 1.5 Rank

One pooled list per projection, ordered by score alone (or rising).
Provenance (exactMatch, relevance) rides as data for the chip, display,
and demand — never as sort key. Identical visible behavior to today
(HARD requirement, verified against code).

### 1.6 Learn

Unresolved spans (understanding) and per-word failures (pooling: "nothing
satisfied _vegan_ here") feed on-demand collection with the word, the
viewport, and the covering engines. This is strictly better input than
today's "few results" — the improvement falls out of provenance for free.

## 2. What the wideners actually are (the three-questions taxonomy)

They are not three tiers of one mechanism; they are answers to three
different questions, and belong in different layers:

- **Family membership** = _what does the word mean_ → grounding, every
  search. Not widening; a pizza search without neapolitan pizza is wrong.
- **Lexical retry + dense siblings** = _did we find who you meant_ →
  grounding (the one evidence engine), thin-triggered, budgeted,
  fail-open.
- **Preference relaxation** = _what did you require_ → the query layer,
  per-word, richness-gated. The ONLY mechanism that sacrifices any part
  of the ask.
- **On-demand collection** = _we don't have it; go get it_ → the fourth
  ring; any spec that omits it treats an open-world product as
  closed-world.

## 3. Comparison to current (how far off are we?)

SURVIVES the derivation unchanged (would rebuild the same):

- Two projections (dish/restaurant dual query) — requirement 7 produces
  it; "one merged query" is NOT the ideal (two output shapes, no latency
  to win — they already run in parallel).
- Pooled pure-score presentation incl. the continuous strict→relaxed
  pagination stream; the "Include similar" chip; fail-open interpretation
  (LLM outage → browse); open-now two-phase filter-then-hydrate;
  signals recording {entityId, term} untyped; sibling machinery
  (reciprocity cut + ceiling normalization, precomputed); one-hop family
  law; probeServesAsPage economics.

FAILS the derivation (one connected mistake — typing at the wrong layer —
plus one flattening):

- LLM assigns types → type-scoped recall never looks in the right
  vocabulary (never-look defect; the food→ingredient fallback lane is a
  hand-patch of exactly this).
- Six typed buckets, AND-composed → cannot express one span with two
  placements.
- Type-keyed relaxation ladder (whole-bucket drops; probe re-runs;
  exclusion lists; pagination stitching) → per-word, in-query provenance.
- Provenance flattening at the constraints boundary (one foodIds array +
  three reconstruction mechanisms).
- Dietary attributes relaxable (droppable bucket) → hard class.
- Two "same thing?" implementations with divergent floors → one engine,
  per-consumer floors.
- Gazetteer exists but is unused by search; missing ingredient type.

## 4. Migration order (each step shippable, reversible, behavior-preserving)

0. AFTER the Austin reload — grounding quality and the linker re-sweep
   depend on the post-reload graph; don't debug search atop moving data.
1. **Dietary hardness** (smallest, user-visible correctness): flag the
   curated set; exempt the flagged ids from the ladder's droppable bucket.
   Ships against today's ladder without any other change.
2. **Untyped grounding behind the existing buckets**: gazetteer-first (all
   types incl. ingredient) + linker on residue + conservative LLM skip
   gate; place grounded entities into today's buckets by their DATA
   types. Kills the never-look defect with the whole downstream untouched.
   Requires the linker re-sweep (floors were fit to type-scoped recall).
3. **Single-query pooling with provenance + richness gate**, run alongside
   the ladder on real queries until output matches, then delete the
   ladder, probes, exclusion lists, and pagination stitching.
4. **Structured grounding to the builder** (abolish the flattening +
   its three reconstruction mechanisms); unify the evidence engine with
   per-consumer floors.
5. Per-word demand signals (falls out of 3; wire to on-demand context).

## 5. Open questions (decide at build, not before)

- Gazetteer overlap policy details (longest-wins segmentation + contained
  matches as family evidence) — validate on real queries.
- The richness threshold (today's 10) — keep, or re-measure post-reload.
- Primary-entity rule for the search signal when a span grounds to
  multiple types (today: targets[0]; consider recording all).
- Whether the LLM skip gate should also require no digits/no comparatives
  (defensive additions to "residue empty").
- Linker re-sweep corpus refresh (974 pairs + 300 controls predate the
  reload vocabulary).

## 6. Worked example (the mental model)

Query: **"vgean breakfast tacos, no cilantro"**, map on Austin.

- Understand: gazetteer grounds "breakfast tacos" (anchors + family:
  migas taco, breakfast burrito…) and both readings of "breakfast";
  linker resolves "vgean"→vegan; residue "no cilantro" → LLM marks an
  exclusion.
- Constraints: viewport hard; cilantro-free hard (exclusion); vegan hard
  (dietary flag); breakfast-taco family required.
- One query: 12 vegan cilantro-free breakfast tacos exist → exactly
  those, score-ordered. Only 3 exist → still ONLY those 3 (vegan is
  hard; nothing relaxes), and collection is told "vegan failed in this
  viewport". If instead the soft word had failed ("spicy"), non-spicy
  rows would join the pool — one score-sorted list, same screen as
  today.
