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

Results order by the **Crave Score**, greatest-to-least (or `rising`) — PURE
and GLOBAL (owner ruling 2026-08-08, supersedes the former tier-first order).
Never by relevance, cosine, RRF, or tier. The only ORDER BY keys anywhere are
`crave_score_exact DESC, crave_score DESC, upvotes, mentions, id`. Tiers
decide ADMISSION only (who enters the page when it cannot fill) and ride as
row metadata; they never order.

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

## 9. IDEAL-SHAPE CLOSURE PLAN (2026-08-06 — everything open, one list)

1. **Negation: doctrine reasserted (owner, 2026-08-06).** The app does NOT
   support query negation, deliberately — dietary toggles are the ONLY walls;
   "sin queso" showing queso is intended teaching (Google-like). R5-3 records
   and never enforces; the sweep's sin-X aliases (sin queso→cheeseless) are
   KEPT — grounding them as soft attributes is better-than-required under the
   doctrine. Work: re-author ng-02/03/18 to assert non-inversion only (the
   'constraint recorded' clause is stale for grounded sin-X spans); decide if
   a grounded sin-X span should still emit the demand record it used to. The
   earlier 'constraint inversion / hard wall' framing here was WRONG and is
   withdrawn.
2. **Sweep watermark → surface coverage.** Label-existence watermark means
   pre-prompt-fix entities (mexican/japanese/peruvian/coffee) never re-offer;
   gender forms missing on real corpus (89.3 vs 98.0 sim). Re-offer when
   locale surface coverage is incomplete, not when a label exists.
3. **Corpus merges (data session):** pollo→chicken, fideos↔fideo dual-ground,
   lima→lime; then re-author cp-12/18/sn-35/hg-13 gold.
4. **Dense truth.** Three sites: Understand tier (always on), sibling
   membership (`includeSimilar===true` only, service:3168), and a DTO comment
   promising "silent thin-results widening" that siblingsWanted does not
   implement — reconcile comment vs code. RULED 2026-08-06 (owner): cousins
   AUTO-FILL only when exact+decomposed+partial cannot fill the page (same
   admission discipline as partial words, Crave-Score order, one list). The
   CHIP STAYS, separate purpose: explicit user intent to explore similar
   REGARDLESS of fill ("I might be in the mood for something similar").
   Fill-gated auto-inclusion + intent-gated chip are two different doors to
   the same judged ring.
5. **One-list presentation.** exactMatch stays row metadata; no client
   divider (owner ruling). Pooled admission (full-fills-first) stays.
6. **Batch rail + prompt registry** for vocabulary/satisfies passes (50% off,
   shadow-replayable); script-shell dedupe; writeLabels N+1.
7. **Deploy** staging→prod after 1–3 land; re-run gate + parity on staging.

8. **Language rollout (ruled set: es, vi, zh, ko).** Only es is seeded
   (15,046 aliases); vi/zh/ko are not in SUPPORTED_LOCALES at all. Per
   language: add to roster → author gold corpus (the real work — es's 150
   strata entries are the falsifiability engine) → run v2 sweep (~$5) →
   gate. PRE-FLIGHT for zh: verify the analyzer tokenizes unspaced CJK so
   the gazetteer can match what the sweep banks — measure before spending.
   The es p95 984ms tail is the cost of missing vocabulary (miss → live
   dense probe); each seeded language collapses its own tail the same way.

9. **Collision guard needs adjudication, not just refusal (found 2026-08-06,
   v2 sweep: 12,455 banked / 4,698 BLOCKED).** P0-b is first-writer-wins: a
   wrong incumbent squats forever (picante→hot sauce blocks spicy;
   vegetariana→serves-vegetarian-food blocks vegetarian; cafe blocks
   coffee). Post-sweep gate 90.7 vs 98.0 sim (sim bypassed the guard) — the
   remaining gap IS this class. Ideal: a blocked inferred surface whose
   target disagrees with the incumbent goes to the identity judge for
   eviction/keep, instead of silent refusal. Morphology class is CLOSED
   (japonés/mexicano/peruanos pass; 19,168 es aliases live).

### §9.9 BUILT (2026-08-08, commit 8f7e4096c) — the claims registry

WordClaimAdjudicatorService + reconcile-surface-claims.ts + lane-4 removal.
One law, one store: labels display, aliases ground, contested inferred
claims get the judge, verdicts remembered. Red team found and fixed one
judicial rule live (testimony bars EVICTION, not a co-claim hearing —
first version cost café→coffee). 1,543 surfaces reconciled; es gate 98.7
(new high). Judge v2: OWED at this writing, SHIPPED later the same night
(a8dbe5442) — see §9 progress below; no contradiction, this line is the
earlier timestamp.

### §9 progress (2026-08-08, commit a8dbe5442)

- §9 rail BUILT: KnowledgeMaintenanceService (sweep→reconcile→satisfies,
  cron + RUN_KNOWLEDGE_MAINTENANCE_ON_BOOT prod one-shot). Judge v2 live.
  Red-team catch: the 'both win' verdict was unwritable through the guard
  (862-claim forever-loop) — addAliases.adjudicated fixes it; drain complete
  (611 coexist / 22 evict / 211 refused), watermark now reaches offered:0.
  es gate 98.7 held.
- LANGUAGE PRE-FLIGHT (measured, $0): Vietnamese tokenizes+folds perfectly
  (pho / pho bo / pho bo tai) — GREEN, needs only its gold corpus + sweep.
  Chinese FAILS as feared: unspaced 辣的中国菜 yields ONE whole-string
  n-gram, no tokens — zh REQUIRES CJK segmentation (char n-grams for han
  runs, or a segmenter) in the analyzer BEFORE any vocabulary spend.
- NEXT: author vi gold corpus (150 entries, es methodology) → vi sweep →
  vi gate; then the zh segmentation build; ko after (spaced, likely
  vi-shaped — verify with the same pre-flight). Prod one-shot: set
  RUN_KNOWLEDGE_MAINTENANCE_ON_BOOT=1 on the worker, redeploy, unset.

## 10. ADJUDICATIONS + DISPOSITIONS (owner-proxy audit, 2026-08-08)

**(a) One-list / client divider — RULING STANDS, UI FIX OWED (mobile lane).**
Provenance: owner, this session, 2026-08-06, verbatim: "I don't want to do
that [visually sectioning]… keeps everything in one list ranked according to
score… it's sort of copping out to visually split them," reaffirmed 2026-08-07
("the tier mechanism… is allowed specifically because" it is admission, "no
need to have visually two different tiers"). exactMatch stays row metadata.
The live client divider (list-read-model-builder.ts:108-129,
sectioned-projection.ts, render-item-runtime.tsx) predates the ruling and now
violates it — mobile-lane fix, flagged to the owner for scheduling.

**(b) Cousin auto-fill — RULING = AUTO-FILL, code comments were stale, FIXED.**
Provenance: owner, this session, 2026-08-07, verbatim: "Only when we can't
[fill a] full page should we start… including the cousins… we're never going
to retire the chip" — implemented 290d5f244 (pooled_tier=2 arm +
pooled_eligible_count). The "never silently widens" comment (search.service)
and the DTO's phantom-mechanism comment were pre-ruling leftovers — both
rewritten to cite the ruling and the mechanism (this commit).

**(c) Batch rail + llm_prompts registry — DEFERRED, dated 2026-08-08.**
Deliberate: the three passes are watermark-bounded (<$10 per full re-pay,
~$0 quiet nights), so batch pricing saves <$5/bump today; registry wiring is
owed BEFORE any pass's prompt iterates via shadow-replay (the satisfies pass
declares versioning it cannot replay — that claim stays false until wired).
Not deploy-blocking; first prompt-iteration on any pass is the trigger.

**(d) Flags declared** in .env.example (this commit); both read through the
canonical isEnvFlagEnabled reader already.
**(e) Stale "NOT WIRED TO A CRON" comment fixed** (this commit).
**(f)** §9.2: prompt-version watermark SHIPPED (d07926e8e); the separate
"surface-coverage" criterion was superseded by it — plan text stands
corrected here. lima→lime: applied on LOCAL (hg-13 passes locally); prod
application rides the DB-audit session's repair pass with the rest of the
merge class. sin-X demand record: PARKED with gating condition — decide when
real traffic shows unmet sin-X asks in the demand ledger (needs the launch
it cannot precede). writeLabels N+1: accepted, dated — offline path, ≤200
rows/batch, upsert-per-row is the atomic is_default election; revisit only
if sweep wall-time matters.

## 11. THE REDERIVATION AUDIT (2026-08-08, three end-to-end lanes) — verdict + punchlist

**VERDICT: the search CORE is at ideal shape** — every industry alternative
(ES/Algolia, embedding-first, per-query LLM, BM25-as-primitive, flat index,
LTR, analyzer synonyms) ADOPTED-already or REFUTED with code-cited evidence;
the two honest divergences are deliberate (no distance term in ranking;
zh blocked on segmentation). **The knowledge layer's PLUMBING is not** —
it versions outputs but never records runs.

LIVE BUGS (fix pre-launch):
- C1 restaurant axis still tier-ordered on sectioned-without-pooled — FIXED 23912fa9e.
- C2 delete-dictionary/edit lane truncated before ranking (SymSpell unreachable at K=5).
- C3 includeSimilar/risingActive dropped in request translation; DIETARY WALL dropped
  on the autocomplete-selected path (false claim). Fix = destructuring passthrough.
- H2 dietary walls fail OPEN on cold cache — preload at boot or fail the search.
- KL-A satisfies pass starves at oldest-200-empty-residual; metrics cannot show red.
- KL-D rung-2 containment: judge uses canonicalFold, query uses lower() — silent
  hole for accented/NFD pairs; fix by materializing containment on the folded key.
- H5 similar[id] ??1 defaults unmeasured relevance to exact-match value.
- H3 prefix similarity hardcoded 0.94 > floor 0.82 — auto-links; G2 patch is the tell.
- M9 indexOf -1 makes an unlisted EntityType HIGHEST placement priority.

STRUCTURAL (the real answer to "better shape we missed"):
1. PASS-RUN LEDGER (subject, pass, prompt_version, outcome, ran_at) written
   unconditionally — closes satisfies starvation, demand-loop re-judging,
   judge unversioned verdicts, and makes the satisfies "diff not re-run"
   claim true. THE one mechanism the layer lacks.
2. entity_labels + entity_alias = ONE entity_surface table with a role column
   (display|recall|both) — the standing reconciler is the proof of the wrong
   split; deletes reconcileLabelSurfaces.
3. Materialize name-containment edges on the folded key (fixes KL-D, deletes
   the un-indexable LIKE + maxAnchors cap, opens rung 2 to non-English).
4. Retire core_entities.aliases[]; make en a real locale ('und' carries two
   meanings today and detonates when en needs its own sweep).
5. One resolveFoodWidening() — sibling/cousin/satisfies reads happen 3x/request
   with divergent cousin gating; also memoize (industry-audit's only real miss).
6. Preview strings: render from dataSql, delete the second source of truth.
7. Tokenized surface store (surface_token) — subsumes containment, gives zh
   its segmentation home, makes rung 2 language-neutral. The long-term shape.

DEFERRED with reasons: score-sorted early termination (blocked by the
window-count gate; the scaling lever at 10x corpus); wire DemandVocabulary
into the nightly rail when launch traffic exists; sweep-scale fixes
(whole-vocab Set, correlated-count ORDER BY, writeLabels N+1) before any
100k-concept corpus. Vestige/stale-comment sweep listed in audit output.

### §11 punchlist progress (2026-08-08, commits 23912fa9e/9f17b9e6f/f6eae7f5b)

DONE: C1 (restaurant tier-order, +guard spec), C2 (edit lane reachable —
merge-rank-cut), C3 (toStructuredSearchRequest destructuring — dietary wall
can no longer be dropped), H2 (dietary fail-CLOSED + boot preload), H3
(honest prefix coverage; G2 patch deleted), H4 (sweep omits unmeasured
tiers; generated file de-laundered), H5 (??1 → cousin floor), H7 (one
budget authority, Damerau everywhere, edit_budget vestige deleted), M9
(rankIn — unlisted type goes LAST). Gate 98.7 through every change.

REMAINING, in order: KL-A pass-run ledger (one migration + write-through in
satisfies/demand/judge — closes starvation, re-judging, unversioned
verdicts); KL-D containment materialization on the folded key (fixes the
two-fold divergence, deletes the un-indexable LIKE); H6 resolveFoodWidening
(one widening resolution per request + memoization); H8 open-now two-mechanism
verify; stale-comment sweep + dead exports; then structural: entity_surface
merge, retire aliases[], preview-from-SQL, tokenized surface store.

### §11 structural item 2 DONE — the surface merge (2026-08-09)

`entity_labels` is GONE. One table, `entity_surface`, with a ROLE column
(display|recall|both) keyed on (entity_id, locale, form) — the key BOTH
tables already used, which was the split's own confession. Migration
20260809100000; data merged losslessly: 15,817 twinned rows collapsed to
role='both', 1,021 label-over-deprecated-alias rows to role='display'
(the refused recall claim is now CARRIED BY role, not by a second table),
3,418 label-only rows to role='display', 42,541 recall rows unchanged.
62,797 rows total, 16,838 duplicates deleted.

`reconcileLabelSurfaces` is DELETED and cannot return: a label form is
offered for recall exactly ONCE, when its row is written, and if the
collision guard refuses it `addSurfaces` DEGRADES the row to role='display'
instead of dropping it. The row is simultaneously the label the user reads
and the memory that its recall claim lost — so there is no gap between two
stores for a standing pass to close. `upsertLabelRow` is deleted too; its
atomic is_default election (F9342) moved into the one writer.

Renamed `entity_alias` -> `entity_surface` (and addAliases -> addSurfaces):
neither 'alias' nor 'labels' names the merged concept, and keeping either
would re-encode the deleted split in the table name.

EVERY recall arm now carries `role <> 'display'` (gazetteer localized lane,
sparse per-form arm, the two matched-forms arms, lexicon/typo dictionary,
demand-vocabulary known-surface set, adjudicator incumbents + judge
context); the display read carries `role <> 'recall'`. Verified: launch
gate 98.7 (148/150, unchanged), autocomplete flow gate 18/18, decomposed
tier probe GREEN, yarn test:db 41/41, 22 invariants / 40 proofs green.

REMAINING structural: retire aliases[] (item 4) and previews-from-dataSql
(item 6) — both scoped and mapped, neither started. See the commit body.

## 12. OWNER RULINGS 2026-08-08 (evening) — toggles + negation v2

**(a) FRESH TOGGLES PER SEARCH (Google-style).** Every new search submission
starts with cleared toggles; no filter state carries across submissions.
CLIENT change (stop carrying toggle state into a new submit); the server
stays truthful about whatever the request carries (C3 passthrough stands),
and the dietary fail-closed guard stands (a request that DOES carry a wall
must never be served unwalled — the wall lookup is a separate cached query
that can fail while results succeed).

**(b) NEGATION = LITERAL IGNORE (supersedes the record-not-enforce shape).**
"tacos no cilantro" grounds cilantro as a POSITIVE mention — exactly as if
the user listed an ingredient. The cue-span machinery (negatedSpan drops,
excludedSpans recording, the small cue-word list's grounding effects) is the
crude middle the owner rejected: it misfires on names ("No Name Burgers"
loses "name") and teaches nothing. DELETE it. The ONE surviving rule,
reframed as dense-input hygiene not negation handling: cue tokens are
stripped from any phrase before the DENSE fallback embeds it, so the
semantic model can never interpret a negation ("sin cerdo" → embeds
"cerdo" → pork, positively; the vegan-ramen inversion stays impossible).
Gold negation stratum re-authors to: mentioned word grounds positively +
non-inversion. Dietary toggles remain the only real exclusions.
Implementation: mostly deletive; FIRST item of the next working session.

## 13. AUTOCOMPLETE MULTILINGUAL — deep-read verdict (2026-08-08)

VERDICT: structurally close to ideal (same localeLookupChain, canonicalFold
in the localized lane, submitToken on 100% of rows, labels display-only) —
but the i18n lane was BOLTED BESIDE the pre-i18n lane instead of replacing
it. One P0, measured live:

P0 — THE ATTRIBUTE LANE HAS NO LOCALE PARAMETER AT ALL. 1,921 es attribute
surfaces exist and the chips RENDER in Spanish, but an es user typing
'vegetariano' can never surface the vegetarian chip they can see.
Display-localized, match-English-only.

P1s: sparse lane still reads the unlocalized aliases[] haystack (F2 latent —
0 leaking rows today by data coincidence, nothing enforces it) and matches
on lower() not the fold (Despaña/Harry's reachable in search, not in
autocomplete); localized lane is exact+prefix only (typo tolerance is an
English-only privilege). P2s: Redis cache key omits locale though locale
changes recall (stated invariant false); food names never localize while
ingredients do (mixed-language panel after twin-merge); dense embeds on
EVERY keystroke after the first space (comment says autocomplete shouldn't).
Crave Score is only a deep tie-break in suggestions, not a ranking input —
flag for owner. Fix order: attr-locale → alias-arm to registry → fold
symmetry → cache key → food-localization ruling → localized fuzzy → dense
throttle.

### §13 addendum — owner ratifications (2026-08-08)

RATIFIED AS INTENDED BEHAVIOR: (a) with a dietary wall on, a restaurant card
MAY show non-wall dishes in its preview strip — the wall asks "is this a
viable venue", the strip shows the venue's best; (b) see-locations mode
ignores walls (the user named the restaurant). Both now documented as
deliberate — auditors stop flagging them. AUTOCOMPLETE WORKSTREAM GREENLIT:
full empirical flow testing → design → complete implementation → behavior
tests → language-gate reruns when vi/zh/ko land.

### §13 progress (2026-08-08, commits ea79cb388 / fe2378691)

AUTOCOMPLETE FLOW GATE built (autocomplete-flow-gate.ts) — 12/12 GREEN.
LANDED: AC-P0 attr-lane locale (picante / sin gluten chips typed-reachable
in es); AC-P2c localized trigram arm + GIN index (typo tolerance for every
language, honest 'fuzzy' tier); AC-P2a locale in the cache key. EMPIRICAL
CORRECTIONS to the deep-read: Despaña + the vegetariano chip already worked
(legacy und data); dish names source-faithful BY DESIGN (concepts localize,
dishes never — encoded in gate es-05/es-07).
REMAINING (AC-P1a): retire the aliases[] haystack/tsv/unnest arms onto the
locale-chained registry — core-recall surgery, own session with EXPLAIN
parity; INTERIM: aliases-projection-und-only.integration.spec.ts turns the
"0 leaking forms" coincidence into a checked law (mutation-provable).
Dense-per-keystroke throttle: P3, unchanged. OWNER RULING STILL OPEN:
should Crave Score rank suggestions (today it is only a deep tie-break /
recall-truncation input)? LANGUAGE RERUNS: add a vi/zh/ko entry block to
the flow gate per rollout — that IS the re-test the owner mandated.

### §13 CLOSED (2026-08-08, commits ac0d2a4ea / 4e9957631)

AC-P1a COMPLETE: recall reads the locale-chained registry — aliases[] is
read by NOTHING in the match path (lexicon, attr lane, sparse arms all on
entity_alias; per-form scoring; fold-symmetric name arms; locale in every
cache key). Judge re-earned picante/café by machine. editScore is a
first-class merge signal (the carnes-trigram trap loses to Damerau merit).
Cost: +~30ms cold per novel term, 0 cached — measured old-vs-new, recorded.
Flow gate 12/12, search gate 98.7, projection-guard specs green. The
remaining aliases[] readers (embedding doc, und projection writer) are the
knowledge-layer retirement item (I-2), not autocomplete. Language reruns:
add vi/zh/ko blocks to autocomplete-flow-gate.ts per rollout.

## 14. IDEAL-END-STATE PUSH (2026-08-09) — everything-remaining session

DONE this session (each commit gate-proven at es 98.7 before landing):
- H6 one-widening-resolution-per-request (memoized reader) — bb2e4956d.
- H8 open-now parity spec — CAUGHT 80 tz-null locations hidden from
  Open-now while displaying "Open now"; tz backfill heals, spec keeps it.
- Negation-v1 vestige purge (−359 lines: negatedSpan, ExcludedSpan,
  gate exclusion clause) — e3939057d.
- CJK segmentation (Han/Kana char sub-tokens, separator-aware ngrams) —
  zh UNBLOCKED on analysis, ko verified ready — 73e241245. zh/ko still
  need vocabulary sweeps before joining SUPPORTED_LOCALES.
- VIETNAMESE LIVE: vi in SUPPORTED_LOCALES; sweep complete (14,375
  active vi surfaces, 8,751 labels, watermark-bottomed at 27 junk);
  flow gate 18/18 — a571b457c. vi GOLD CORPUS (150 queries) — 51df8266;
  first run 95.3 with the tone-mark fold defect as the launch blocker
  (bò→avocado class; fix in flight).
- entity_surface MERGE (§11 item 2): entity_labels + entity_alias = one
  table, role display|recall|both; reconcileLabelSurfaces deleted as
  unwritable; 16,838 duplicate rows gone — a5fbd91db.

IN FLIGHT: aliases[] retirement w/ resolution-tier gate first (§11 item
4); previews derived from dataSql (§11 item 6); vi tone-mark tie-break
(diacritics-as-evidence over fold-collapse). Then: staging→prod deploy,
multi-agent red team.

FINDINGS FOR OWNER: (a) tôm (shrimp) judged to prawns — one-way door,
picante-class ruling candidate; (b) each new language re-litigates
incumbent languages' word claims by fold (vi cost es 17 surfaces, gate
unmoved — but know it before language 4); (c) en-as-real-locale: 577 en
rows already exist while display path treats en as implicit — a
vocabulary-sweep decision, not blocking.

### §14 CLOSED (2026-08-09, eb12cd764) — red team ran, refuted, and was answered

The 3-agent adversarial pass produced 11 executed-proof defects; ALL fixed
same night, each fix independently gate-proven: per-token accent evidence
(aa3d45fd8; 161→39 on the partial-accent A/B), CJK adjacency joiner +
run-level residue (52388c76d), cousins labeled + display-score out of ALL
ordering (8135d2237, 0 map-vs-card contradictions after), H6 memo
order/aliasing + sqlPreview wiring (d64dae20f), containment boot self-heal
(ed87eef65 — prod had been serving with rung-2 OFF), guard bypasses closed
+ eviction keeps the user's label (0e439c897/56512df51/74b346ff4), and the
night's deepest cut: CLAIMS ARE PER-FORM, NOT PER-FOLD (c65ac0b74 — tone
marks are phonemic; every vi-vs-vi hearing was a false conflict) with the
74-row false-conflict clear + vocabulary completion (a50bf2cc1).
Final control at HEAD: es 98.7 / vi 98.8 / flow 18/18 / resolution 49/49 /
invariants 22. Ship handed to the deploy session at eb12cd764.
PROD FOLLOW-UP OWED: run the false-conflict clear + vi vocabulary pass
against prod's registry after the deploy (local-only tonight).
Attacks that FAILED (also §14 evidence): tier never orders anywhere; DST
parity 75 instants × 11k locations; preview injection/execution; the
WordClaimVerdict brand itself; zero residual aliases[] readers.
