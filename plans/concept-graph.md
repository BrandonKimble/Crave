# THE CONCEPT GRAPH — vocabulary + substitutability

**One sentence:** every concept learns (a) what it is CALLED in each supported
language, and (b) which OTHER concepts satisfy a request for it — both by batched
LLM sweeps that run only on what cheaper, deterministic mechanisms cannot decide.

Status: **v2 (full rewrite, 2026-08-05).** v1 was invalidated by testing — it added a
fourth competing answer to "what satisfies this query" without reconciling the three
that already exist, and its central premise was unmeasured. Both are fixed here.
Everything in §8 was executed; nothing is asserted from plausibility.

---

## 0. THE INVARIANT (do not violate)

Results order by the **Crave Score**, greatest-to-least (or `rising`), within a tier.
Never by relevance, cosine, or RRF. The only ORDER BY keys anywhere are
`match_tier ASC, crave_score_exact DESC, crave_score DESC, upvotes, mentions, id`.

Two consequences that drive every decision:

1. **Matching decides ELIGIBILITY and SECTION only.** It never orders anything.
2. **Precision matters MORE here than in a relevance-ranked engine.** There, a false
   positive sinks. Here a false positive with a high Crave Score ranks **first**.
   The front section must be precise; anything blurry stays behind the page-fill gate.

---

## 1. THE SHAPES, AND WHY THEY STAY SEPARATE

Six judgments and five expansions already answer query-ish questions. They do not
merge, for four hard reasons: **risk polarity** (identity is destructive and fails
closed; substitutability is additive), **direction** (identity is symmetric,
substitutability is not), **input shape** (vocabulary is generative, the rest
classify a candidate list), and **lifecycle** (category edges are a projection
rebuilt from mentions — an LLM verdict stored there is destroyed by the next
rebuild).

What unifies them is NOT one table. It is (a) the precedence ladder in §2 so two
mechanisms can never silently disagree, and (b) one judgment ledger (L9) from which
aliases and edges are projected.

---

## 2. THE PRECEDENCE LADDER (the core of this plan)

The prior version's fatal flaw: it proposed LLM-typed edges as a **fourth** answer to
"what foods satisfy this query" alongside three existing mechanisms, with no stated
precedence. The codebase has already been burned by exactly this — a second,
disagreeing answer produced a **13.3% divergence** defect where "the shadow verdict
silently depended on which branch fired" (`search-query.builder.ts`).

So the LLM runs **only on the residual** that free mechanisms cannot decide:

| #   | Rung                                      | Cost         | Decides                                                                                                      |
| --- | ----------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------ |
| 1   | Exact / alias / label grounding           | free         | the concept itself → **tier 0**                                                                              |
| 2   | **Head-final name containment**           | free, ~9ms   | `carbonara udon`→`carbonara` IS-A → **tier 0**; `pizza dough` MENTIONS → **tier 1**                          |
| 3   | Category edges (symmetric pair = synonym) | free, stored | membership → tier 0/1                                                                                        |
| 4   | **LLM `satisfies`**                       | ~$3 batch    | ONLY pairs with no shared words and no edge: `margherita`↔`cheese pizza`, `xiao long bao`↔`soup dumplings` |
| 5   | Dense siblings                            | free         | the existing **tier-2 ring** + Include-similar chip                                                          |

Rung 2 is the discovery that reshaped this plan. English compound nouns are
head-final, so grammar alone separates "it IS the thing" from "it merely mentions
the thing" — deterministically, with no LLM and no staleness. It is owner-ruled and
data-proven: of **9,472** containment pairs, **57% carried no category edge**, so it
is also the widest single source of true relationships.

**Precedence rule:** a lower-numbered rung always wins. The LLM never overrides
grammar or a stored structural fact; it only fills gaps.

---

## 3. LOCKED DECISIONS

**L1 — Dense is the candidate SUPPLIER, never the decider, and is not deleted.**
`retrieveCandidates` has four consumers (autocomplete, ingestion resolution, poll
seeding, search interpretation), so it is load-bearing for ingestion, not just
search. Deleting it makes the residual pass O(n²) (~17M pairs) or hallucinatory.

**L2 — The FEEDER is `retrieveCandidates`, NOT the sibling graph.** Measured recall
against an LLM-judged gold set: **RRF hybrid 95%, plain cosine 93%, reciprocity 66%,
lexical containment 54%**. Reciprocity collapses to **10% on `pho`** — dense
neighbourhoods with many near-identical variants push the true variants out of the
mutual-rank window. Reciprocity is a PRECISION filter; using it to feed a judge is
using it backwards. Its correct home is rung 5.

**L3 — The LLM is the judge for the residual; geometry cannot type relations.**
For `cheese pizza`, mutual-rank ≤ 6 admits `cheese` (an ingredient), `pizza` (a
175-member category) and `cheese-based dishes` (junk), while wrong-form leaks
(`birria pizza`, `chocolate chip pancakes`, `fried flounder sandwich`) sit INSIDE
the tight band at mutual 2-4.

**L4 — The structural filter is complementary and permanent.** Exclude
category-entities (a read against the already-indexed `derived_food_category_edges`,
not a new column) and wrong types. It catches the one class the LLM got wrong (it
placed the 175-member `pizza` category in `same`); the LLM catches ingredients, junk
and wrong-form, which the filter cannot. **Both ship.**

**L5 — Thresholds move from the DECISION to the SHORTLIST.** Cosine/rank cuts stop
deciding what matches and only decide how many candidates the judge sees. A loose
cut just means more rejects. This is the structural fix for uncalibrated floors.

**L6 — Edges are DIRECTED and named `satisfies`.** The question is inherently
directional ("user asked A, we showed B"), and under §0 a symmetric table is the
most expensive possible error: `cheese → cheese pizza` is fine, the reverse is
catastrophic. Judging both directions costs nothing extra — same batch, same
candidates. **Never read the edge backwards.**

**L7 — `same` splits in two; only one is new.**

- **identity-same** ("one entity, two spellings") → the EXISTING merge pipeline. No
  new table. Its fold already carries names, locales and provenance.
- **query-same** ("two entities, one craving") → `satisfies`, directed, new.
  Bonus: the merge pipeline generates candidates **lexically only** (trigram > 0.65),
  so it structurally cannot see semantically-identical, lexically-different duplicates
  (`soup dumplings` / `xiao long bao`). The residual pass runs over dense candidates
  and therefore feeds merge a class it is blind to today.

**L8 — Store `reject` verdicts too.** They make the pass idempotent, turn a
prompt-version bump into a DIFF rather than a full re-run, and stop re-judging.

**L9 — One judgment LEDGER; aliases and edges are PROJECTIONS of it.** Store
verdicts keyed by `(subject, dimension, prompt_version)`; project `entity_alias`
rows and `satisfies` edges from it. This is the pattern the codebase already
established (alias rows are truth, `aliases[]` is a derived projection) and every
`derived_*` table follows. Reuse the EXISTING versioned-prompt + shadow-replay
machinery (`llm_prompts`, the re-extract architecture) — a second sweep dialect is
a defect, not a feature.

**L10 — Degradation FAILS NARROW.** (v1 had this backwards.) An untyped concept
falls back to rungs 1–3 only: exact ids + head-final containment + category edges.
It must NOT fall back to dense in tier 0 — §0 says a false positive in the front
section is the costliest error, and rung-5 dense demonstrably admits `birria pizza`
there. Dense stays in the tier-2 ring.

**L11 — Level 2 uses the EXISTING tier-2 ring and Include-similar chip.** It is
already gated, already counted (`similarAvailable` is a measured fact), and already
user-visible. v1 proposed silently injecting cousins on underfill; the existing
mechanism is strictly better because it surfaces the choice.

**L12 — The vocabulary pass replaces the spine seed AND the label sweep**, and is
the multilingual extension of `dish-knowledge-synthesis` under the existing
testimony/knowledge doctrine (knowledge = "re-derivable offline for pennies").

**L13 — Launch languages:** `es-419` + `es`, `vi`, `zh-Hans`, `zh-Hant`, `ko`.
Adding one is a watermark bump plus a batch run.

**L14 — No consensus sampling.** Measured: 3 runs × 6 anchors at temp 0.1 produced
**100% agreement, zero flip-floppers**, including non-food types. The earlier
instability was PROMPT sensitivity, not variance — which is the good version (the
policy is tunable) but makes prompt wording load-bearing and version-pinned.

**L15 — The gold gate stays LOCAL-ONLY** and is deleted once the passes are trusted.

---

## 4. PREREQUISITES (build nothing else first)

**P0-a — Delete (or `und`-restrict) `core_entities.aliases[]`.**
It is the unlocalized hub feeding THREE systems: the lexical recall core's six arms,
the embedding doc, and the typo dictionary. The gazetteer already removed its
legacy-array arm for this exact reason (seeded `es` forms grounded for English —
the F2 class). Adding five languages re-creates that bug where it was never fixed.
**Unaccounted-for effect found in review:** the fuzzy arm concatenates all aliases
into ONE similarity haystack, so more languages **mechanically dilute English
trigram similarity for every entity**, and the coverage term degrades as the
haystack grows. Deleting is better than `und`-restricting; `und`-restricting is the
minimum.

**P0-b — Alias collision guard at write time.** Before activating an alias, refuse
it if its folded form collides with another entity's `name`/`identity_key` or
another concept's active alias. Deterministic, no LLM. **This is not theoretical:**
the enumeration test emitted `soup → caldo` and `caldo → sopa` (near-synonyms
cross-linked), and `caldo` already existed as an entity name — grounding at
confidence 1.0 and producing the only regression in the test. Highest-blast-radius
error class in the design; the guard is cheap and catches it structurally.

**P0-c — The vocabulary prompt is strictly TRANSLATIONAL.** Same-language
near-synonyms (`sopa`/`caldo`) are a RELATION, not an alias, and belong to the
residual pass. The v1 prompt said "omit ambiguous words" and still failed; the rule
must be structural, not advisory.

---

## 5. THE PROMPTS

### A. VOCABULARY (per concept × language, generative, no candidates)

> You are localizing a food-discovery app's CONCEPTS into {language} ({bcp47}).
> Concept: "{name}" · type: {type}
>
> Return `canonical_label` (the most natural way a native speaker sees this on a
> filter in a food app), `aliases` (every way a native speaker would TYPE this exact
> concept: gender/number variants, regional variants), and a short `description`.
>
> HARD RULES — this is TRANSLATION, not association:
> • An alias must be THIS concept expressed in {language}. A related or
> near-synonymous concept is NOT an alias, even in the same language
> (`caldo` is not an alias for `soup`) — omit it.
> • If a word is commonly ambiguous, OMIT it. Narrower beats broader.
> • Never translate a proper noun or brand — return unchanged, `proper_noun: true`.
> • Words the culture uses untranslated stay untranslated.
> • Unsure it has a real {language} form → `abstain: true`, empty aliases.
> • Never invent.

### B. SATISFIES (per concept, over residual candidates only)

> A user searched for "{name}" ({type}) in a restaurant app.
> Below are candidates FROM OUR DATABASE. For each, answer the DIRECTED question:
> **if the user asked for "{name}" and we showed them this instead, would they be
> satisfied?**
>
> • `satisfies` — yes. The same thing, a variant, or a renaming of it.
> • `cousin` — no, but a reasonable "similar" suggestion (swapped protein, changed
> form, different flavour direction).
> • `reject` — not a substitute: an INGREDIENT/component of it, a BROAD CATEGORY
> containing it, a different entity type, or unrelated.
>
> Answer for THIS direction only; do not assume the reverse holds.
> Every candidate appears exactly once, verbatim.

Type-general by construction — `{type}` is supplied, and the judgment is meaningful
for foods, ingredients and attributes alike (verified). Edges never cross type.

---

## 6. BUILD ORDER

1. **P0-a, P0-b, P0-c** — prerequisites. Nothing ships before them.
2. **Vocabulary pass** (highest measured value: **+19.4 points**), Spanish first,
   then vi / zh-Hans / zh-Hant / ko.
3. **The judgment ledger + sweep** (L9), reusing the versioned-prompt machinery.
4. **`satisfies` residual pass** — only pairs rungs 1–3 cannot decide.
5. **Wire the ladder** (§2) with explicit precedence; reuse the tier-2 ring for L11.
6. **Demand→vocabulary sweep**: read the `on_demand_ask` signals ledger (NOT the
   residue table — 1-token residue never reaches it), verify against candidates,
   bank on match via the reserved-and-unused `query_banking` alias source, else
   leave it as demand.
7. **Fix the ingestion gap**: LLM-matched (`fuzzy`) results bank NO alias today, so
   every re-occurrence re-pays dense + LLM forever. Bank using the
   post-revalidation id so it never lands on a tombstone.
8. **Extend `satisfies` to attributes** — but have `placeAttribute` EMIT the edge
   rather than running a second pass; it already makes that judgment and discards it.

**Deletions — verified before removing, and two of the four were WRONG:**

- `scripts/seed-spine-labels.ts` + `scripts/seed-spine-aliases.ts` — DELETED.
  Unreferenced anywhere, and the vocabulary pass covers the spine as an ordinary
  subset of the corpus (L12's "no spine special case").
- `AliasManagementService` — **KEPT. It is NOT orphaned.** The red-team note that
  suggested otherwise was explicitly scoped to three files; a repo-wide check finds
  three live consumers (`restaurant-cuisine-extraction`, `restaurant-location-
enrichment`, `entity-resolution` — the creation path's `addOriginalTextAsAlias`
  and `validateScopeConstraints`). Deleting it would have broken entity creation.
  Its hardcoded scope-keyword blocklist is still a real smell, but that is a
  rederivation, not a deletion.
- `NoopLabelGenerator` — **KEPT.** It is the default generator, and that is what
  makes `sweep-entity-labels.ts` without `--apply` measure the backlog while
  spending nothing. Deleting it would delete the honest dry run.
- The query-time geometric mutual-rank cut and the gold gate — still to go, once
  typed coverage is broad enough to retire the floor.

**Smell recorded, not yet fixed:** rejected-tombstone adoption banks aliases onto
archived junk entities.

---

## 7. OPEN

- **O1 — Does `satisfies` improve real result sets?** Edge quality ≠ search quality.
  Needs the build; measure before trusting.
- **O2 — Do `satisfies` ids enter tier 0 or their own section?** Leaning tier 0 (it
  is what the user asked for), and rung-2 `isVariantOf` sets the precedent — but it
  is also the highest-blast-radius placement.
- **O3 — Storage shape for `satisfies`:** a `satisfied_by uuid[]` array on the
  concept (matching `canonicalIngredients`, read-shaped, no join) vs an edge table.
  Array likely better for `satisfies`; table better for `cousin` (reverse lookup +
  provenance).
- **O4 — Autocomplete alias inflation:** aliases creating prefix hits
  _unconditionally_ admit attributes at 1-3 chars, and mass tier-ties drain the
  tie-break chain down to **alphabetical order**. P0-a mitigates; verify after.
- **O5 — Embedding doc composition:** an A/B is recorded showing a _richer_ doc was
  a net negative. Whether multilingual aliases belong in the doc is unmeasured, and
  the doc feeds four consumers.
- **O6 — k-anonymity floor of 3** means 1-2-actor demand is invisible to collection;
  confirm the banking sweep may read raw signals below it.
- **O7 — Cost envelope** is measured (§8) but any real spend stays owner-gated.

---

## 8. MEASURED FACTS (all executed, 2026-08-04/05)

### 8.0 THE PRODUCTION PIPELINE, BUILT AND RUN (2026-08-05)

P0-a, P0-b and the vocabulary pass are IMPLEMENTED and were run end to end
through the real service against the live local corpus:

- Swept **3,000** of 8,560 due `es` concepts (~26% coverage): **2,896 written**,
  104 abstained (an abstain writes nothing — the watermark stays honest).
  Corpus now holds **3,117 `es` labels and 5,430 `es` surfaces**.
- **Launch gate: 77.3% → 90.0%** on the REAL pipeline at that partial coverage.
  single_noun 75.0 → **95.0**, attribute 70.0 → **100**, homograph 85 → **90**,
  negation held **100**. Two clauses GREEN (top-1 95.0%, negation 100%); two
  still RED (constraint preservation 75.0%, one homograph mis-grounding).
- The earlier TARGETED experiment — enriching exactly the 110 concepts the gold
  corpus expects — reached **96.7%**. The gap between 90.0% and 96.7% is
  coverage, not capability: the sweep orders by age, not by what the gold set
  asks for, and 8,412 concepts remain due.
- **P0-b is working:** the pre-guard targeted run produced 2 homograph
  mis-groundings; this run, with 22× more surfaces, produced 1 — and that one
  (`lima → key lime`) is NOT a collision (no entity is named `lima`, so the
  guard correctly did not fire). It is a milder SPECIFICITY error: the corpus
  has `key lime` but no plain `lime`, so the Spanish word attached to the
  nearest available concept. That class is the substitutability pass's job.
- **P0-a is holding:** zero locale-tagged forms leaked into `aliases[]` across
  5,430 new tagged surfaces.

- **Enumeration lift — the central premise, now proven.** One vocabulary pass over
  110 gold concepts (275 `es` alias rows, `entity_alias` only, not projected):
  **overall 77.3% → 96.7%**; single_noun 75.0 → **97.5%**; compound 50.0 → **96.7%**;
  attribute 70.0 → **100%**; negation held **100%**. Three of four threshold clauses
  flipped GREEN (top-1 81 → 96%, constraint preservation 65 → 98.3%).
- **The one regression it caused:** homograph mis-groundings 0 → **2**
  (`soup→caldo`, `caldo→sopa`) — same-language near-synonyms emitted as aliases,
  grounding at confidence 1.0. Cause of P0-b and P0-c. Experiment reverted.
- **Failure causes (why the 25% failed):** `MISSING_CONCEPT: 0`;
  **27 of 34 = concept exists, no alias**; remainder mostly inflection gaps in
  compounds. Enumeration targets essentially the entire failure population.
- **Feeder recall** vs an LLM-judged gold set: RRF hybrid **95%**, cosine top-30
  93%, reciprocity **66%** (10% on `pho`), lexical containment 54%.
- **Judge stability:** 3 runs × 6 anchors (3 food, 1 restaurant_attribute, 1
  food_attribute, 1 ingredient) at temp 0.1 → **100% agreement, 0 unstable**.
- **Cost:** measured 217 in / 182 out tokens per call, Flash-Lite ($0.25/M in,
  $1.50/M out, 50% batch). Corpus 8,798 concepts (5,815 food, 2,384 ingredient,
  428 restaurant_attribute, 171 food_attribute). Residual pass ≈ **$2.75**;
  vocabulary × 6 locales ≈ **$7**. **Under $10 all-in**, trivial steady state.
- **Head-final containment coverage:** 9,472 containment pairs, only 4,112 carried a
  category edge — **57% invisible to edge recall**; runs in ~9ms at 7.8k foods.
- **Precedent for the divergence defect:** two disagreeing answers to the same
  membership question produced **13.3%** shadow-pair divergence.
- **Scale:** 5,815 active foods, ALL with sibling edges; 174,240 sibling edges;
  7,312 category edges. Gate `POOLED_COVERAGE_THRESHOLD = DEFAULT_PAGE_SIZE`.
- **Geometry cannot type relations** (`cheese pizza`, mutual rank in parens): admits
  `cheese` (4) an ingredient, `pizza` (6) a 175-member category, `cheese-based
dishes` (4) junk; rates `birria pizza` (2), `chocolate chip pancakes` (4),
  `fried flounder sandwich` (3) as tight-band "same".
- **Design bug caught by testing:** 1-token residue records a signal and `continue`s
  — it never reaches the residue table, so a cron over that table would never see
  single foreign words. Hence build-order step 6 reads the signals ledger.

### 8.1 QUERY-SIDE MAXIMAL LINKING (2026-08-06, committed e76ae45bc)

The consume rule ("a compound span replaces its parts") was never a decision —
it rode in with the typo-join work and cost 17/38 missed concepts on the es
gate. Now a compound emits BOTH readings, and RUNG 2 (name containment) is the
query-side guard: a part only counts when the compound concept's own name
contains it (`vegetarian taco` ⊇ taco ✓; `pan dulce` ⊉ bread ✗). Same law,
both sides of the system.

OWNER RULING (supersedes the tier-0/tier-1 proposal): ONE list, Crave Score
order, NO decomposed section. Precision comes from reading parts as
MODIFIERS — attribute → soft conjunct (pooled gate), ingredient → hard
conjunct, food only as fallback (`DECOMPOSED_PLACEMENT_ORDER`). "arroz con
pollo" = the dish OR rice∧chicken, never "any rice dish".

Measured (sim corpus, audit fixes + completed vocab): es gate 86.7 → 98.0;
compound 50 → 93.3. The audit data fixes ALONE were +0.0 — decisive proof the
algorithm, not the data, was the blocker. Probe:
`scripts/search-harness/decomposed-tier-probe.ts`.

Residual owed: pollo/fideo/lima-class corpus merges (data session); the
sweep's watermark is label-existence, so entities labeled BEFORE the
gender-complete prompt never re-offer — inflection completeness needs a
surface-coverage watermark (open).
