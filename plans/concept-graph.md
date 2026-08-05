# THE CONCEPT GRAPH — vocabulary + relations

**One sentence:** every concept in the graph learns (a) what it is CALLED, in every
language we support, and (b) how it RELATES to its neighbours — both by one batched
LLM sweep over a versioned watermark, with dense retrieval as the candidate supplier.

Status: design locked in the sections marked **LOCKED**. Sections marked **OPEN**
are still being decided — do not build them yet. Evidence for every claim is in
MEASURED FACTS at the bottom; nothing here is asserted from plausibility.

---

## 0. THE INVARIANT THAT GOVERNS EVERYTHING (do not violate)

Results are ordered by the **Crave Score**, greatest-to-least (or `rising`), within a
tier. Never by relevance, cosine, or RRF. Verified across the whole search surface:
the only ORDER BY keys are `match_tier ASC, crave_score_exact DESC, crave_score DESC,
upvotes, mentions, id`.

Two consequences that drive every decision below:

1. **Matching decides ELIGIBILITY and SECTION only.** It never orders anything.
2. **Precision matters more here than in a normal search engine.** In a
   relevance-ranked system a false positive sinks to the bottom. Here a false
   positive with a high Crave Score ranks **first**. So the front section must be
   precise, and anything blurry must stay behind the page-fill gate.

---

## 1. ARCHITECTURE

```
OFFLINE (batch, versioned watermark, Gemini batch rail)
  A. VOCABULARY pass   concept          -> canonical label + aliases, per language
  B. RELATIONS pass    concept + its dense neighbours -> typed edges (same/cousin/reject)
     (candidates supplied by the existing nightly sibling cron)

LIVE (per query)
  1. GROUND      text -> concept ids   (lexical alias/label -> fuzzy -> dense fallback)
  2. LEVEL 1     + `same` edges         ALWAYS ON        -> front section
  3. ELIGIBILITY restaurants in viewport serving any of those, minus hard diet walls
  4. LEVEL 2     + `cousin` edges       ONLY IF front section < one page
  5. ORDER       Crave Score            UNTOUCHED
```

Language enters at step 1 ONLY. Everything after is concept-to-concept and therefore
language-independent — adding a language costs a vocabulary pass, never a new graph.

---

## 2. LOCKED DECISIONS

**L1 — Dense is the candidate SUPPLIER, not the decider. It is not deleted.**
The relations pass is only affordable because dense reduces 5,815 foods to ~20
relevant candidates per concept. Without it the pass is O(n²) (~17M pairs) or
hallucinatory — the LLM would never guess real rows like `b.i.g. chicken sandwich`.
Additionally `retrieveCandidates` is shared infrastructure with FOUR consumers
(autocomplete, collection-time entity resolution, poll seeding, search
interpretation), so dense is load-bearing for ingestion, not just search.

**L2 — The LLM is the judge; geometry cannot make the judgment.**
No geometric measure distinguishes "is the same craving as" from "is the parent of"
from "is an ingredient in". Measured: for `cheese pizza`, mutual-rank ≤ 6 admits
`cheese` (an ingredient), `pizza` (a 175-member category) and `cheese-based dishes`
(junk), while the wrong-form leaks (`birria pizza`, `chocolate chip pancakes`,
`fried flounder sandwich`) sit INSIDE the tight band at mutual 2-4.

**L3 — The structural filter is the permanent floor, and it is complementary.**
Exclude category-entities (entities with ≥N category members) and wrong-typed
entities from Level 1. This is a hard stored fact, costs nothing, and catches
exactly the class the LLM got wrong (it placed the 175-member `pizza` category in
`same`). The LLM catches ingredients, junk and wrong-form, which the filter cannot.
Neither is sufficient alone. **Both ship.**

**L4 — Arbitrary thresholds move from the DECISION to the SHORTLIST.**
`cosine ≥ 0.7 / forward_rank ≤ K / mutual_rank ≤ R` stop deciding what matches and
only decide how many candidates the LLM sees. A too-loose cut just means more
rejects. This is the structural fix for the uncalibrated-floors problem: an
arbitrary number is now cheap to get wrong.

**L5 — Two expansion levels, mapped onto machinery that already exists.**
Level 1 = `same` edges, always on, front section. Level 2 = `cousin` edges, admitted
only when tier 0 cannot fill a page — the existing gate
(`POOLED_COVERAGE_THRESHOLD = DEFAULT_PAGE_SIZE`). No new gating machinery.

**L6 — Graceful degradation: dense is the floor, typed edges are the upgrade.**
A brand-new concept has dense edges immediately and typed edges after the next
sweep. Until typed, Level 1 falls back to geometric + the structural filter. Nothing
is ever broken, only less precise.

**L7 — The vocabulary pass replaces the spine seed AND the label sweep.**
One mechanism for every concept; no spine special-case. Output: `canonical_label` ->
`entity_labels` (display), `aliases` -> `entity_alias` (matching), locale-tagged,
through the existing ingress primitives (`normalizeSurface`, `isDisplayable`,
`normalizeLocaleTag`).

**L8 — Launch languages.** `es-419` + `es` fallback, `vi`, `zh-Hans`, `zh-Hant`, `ko`.
Adding one later is a watermark bump plus a batch run.

**L9 — Both passes share ONE sweep engine.** Same watermark shape
`(entity, dimension, prompt_version)`, same Gemini batch rail (submit + poll, the
existing `gemini-batch.service.ts` pattern), same versioned-prompt discipline as
extraction. A prompt-version bump re-derives.

**L10 — The gold-corpus gate stays LOCAL ONLY.** It is a bench instrument for
building trust, not shipped code; delete it once the passes are trusted. Trust is
earned by maniacal local testing, the same way extraction prompts are trusted.

**L11 — The relations question is entity-type-general, not food-specific.**
The judgment is "if a user asked for A and we showed them B, would they be
satisfied?" — which is meaningful for foods, ingredients, attributes and
categories alike. Edges never cross type (a food is never `same` as an attribute).

---

## 3. THE TWO PROMPTS (drafts — to be red-teamed before build)

### A. VOCABULARY (per concept × language)

> You are localizing a food-discovery app's CONCEPTS into {language} ({bcp47}).
> Concept: "{name}" · type: {type}
>
> Return:
>
> 1. `canonical_label` — the most natural way a native speaker sees this on a
>    filter/label in a food app (most typical register and form).
> 2. `aliases` — every distinct way a native speaker would TYPE this exact concept
>    when searching: gender/number variants, common synonyms, regional variants —
>    only if they still mean this exact concept.
> 3. `description` — a short gloss (≤ 8 words).
>
> RULES: every alias must mean THIS concept and ONLY this concept; if a word is
> commonly ambiguous, OMIT it (narrower-but-safe beats broad-but-ambiguous). Never
> translate a proper noun or brand — return it unchanged with `proper_noun: true`.
> Words the culture uses untranslated stay untranslated. If unsure the concept has a
> real {language} form, set `abstain: true` with empty aliases. Never invent.

Validated on 15 real entities in Spanish + 5 in Korean/Chinese. See MEASURED FACTS.

### B. RELATIONS (per concept, over its dense neighbours)

> A user searched for "{name}" ({type}) in a restaurant app.
> Below are candidates FROM OUR DATABASE, found by similarity. Sort EVERY candidate
> into exactly one bucket. The question for each is:
> **if the user asked for "{name}" and we showed them this instead, would they be
> satisfied?**
>
> - `same` — yes. Same thing, a variant, or a renaming of it.
> - `cousin` — no, but it is a reasonable "similar" suggestion: same family,
>   different craving (swapped protein, changed form, different flavour direction).
> - `reject` — not a substitute at all: a COMPONENT/ingredient of it rather than a
>   kind of it, a BROAD CATEGORY containing it rather than a kind of it, a different
>   entity type, or unrelated.
>
> Be STRICT on `same`: a swapped protein or a changed form (pizza vs ramen vs
> pancake) is a `cousin`. Every candidate appears exactly once, named verbatim.

Note the type-general framing (L11) — no food-specific wording, so ingredients,
attributes and categories use the same prompt with `{type}` supplied.

---

## 4. OPEN — still being decided, DO NOT BUILD

**O1 — Live LLM verification for foreign-word grounding.**
Today dense grounds an unenumerated foreign word by plain cosine and is imprecise
(`만두` → `mantou` 0.766 over `dumpling` 0.738). Proposal: when the narrow M4 gate
fires, ask the LLM "is {query word} the same concept as any of these candidates?",
and bank the alias only on confirmation. This would make self-learn SAFE (it was
killed earlier precisely because banking an unverified dense guess was risky) and is
self-limiting: each weird word costs one call ONCE, then it is an alias forever.
_Current lean: DO IT, but strictly guarded_ — only on the existing narrow gate (no
lexical hit AND non-English/non-Latin), best-effort with a short timeout so it can
never break a search, a rate-limit/circuit-breaker so a traffic anomaly cannot run
up cost, and metered like every other call. **Needs: a latency measurement and a
decision on the cap before building.**

**O2 — Do `same` edges enter tier 0, or their own section?** Product/UX call.
Leaning tier 0 (it IS what the user asked for), but that is also the highest-blast-
radius place for a wrong edge (front section, ordered by Crave Score).

**O3 — Candidate window size** (how many neighbours the LLM sees). A recall knob per
L4; needs a small sweep. Err loose.

**O4 — Should the relations pass feed the MERGE backlog?** True synonyms across
entities (`scallion`/`green onion`) arguably should be merged, not linked. The merge
pipeline already exists. Synergy is real but so is scope creep.

**O5 — Per-type semantics for attributes/ingredients/categories.** Agreed in
principle (L11); the concrete "what does `same` mean for an attribute" needs
worked examples before the pass runs on those types.

**O6 — Cost envelope and model tier.** Rough order: ~5,815 food relations calls +
~14k vocabulary calls (concepts × languages), batched, Flash-Lite. Cheap and
diminishing (steady state = new entities only), but the actual envelope is unmeasured
and any real spend is owner-gated.

**O7 — The M4 dense floors** (`cosine 0.72`, `margin 0.02`, `rrfRankMax 3`) remain
uncalibrated placeholders. Per L4 they become far less load-bearing; if O1 lands they
matter less again. Not worth calibrating before those land.

---

## 5. BUILD ORDER

1. **Structural filter** (L3) — exclude category-entities/wrong types from Level 1.
   Cheap, immediate, and the permanent floor.
2. **The sweep engine** (L9) — watermark + batch submit/poll + versioned prompts.
3. **Relations pass, foods first** (L2). Test maniacally locally; iterate the prompt.
4. **Vocabulary pass, Spanish first** (L7/L8), then vi / zh-Hans / zh-Hant / ko.
5. **Wire Level 1 / Level 2** (L5) — feed `same` edges into the tier-0 set; `cousin`
   behind the existing gate.
6. **Extend relations to ingredients/attributes/categories** (pending O5).
7. **Delete**: spine seed script, label sweep, unverified self-learn banking, and
   (after trust) the launch-gate script.

---

## 6. MEASURED FACTS (the evidence base — all executed, 2026-08-04)

- **Ranking**: only ORDER BY keys anywhere are tier → crave_score_exact →
  crave_score → upvotes → mentions → id. No cosine/RRF/relevance in any sort.
- **Gate**: `POOLED_COVERAGE_THRESHOLD = DEFAULT_PAGE_SIZE` — tier 1 opens exactly
  when tier 0 cannot fill one page.
- **Scale**: 5,815 active foods, ALL with sibling edges (no coverage gap);
  174,240 sibling edges; 7,312 category edges.
- **Sibling cron**: nightly 4AM full rebuild; stores cosine + forward_rank +
  mutual_rank; cut is `cosine ≥ 0.7 ∧ forward_rank ≤ K ∧ mutual_rank ≤ R`.
- **Geometry cannot type relations** (`cheese pizza`, mutual rank in parens):
  admits `cheese` (4) an ingredient, `pizza` (6) a 175-member category,
  `cheese-based dishes` (4) junk; and rates `birria pizza` (2),
  `chocolate chip pancakes` (4), `fried flounder sandwich` (3) as tight-band "same".
- **Category member counts** cleanly identify categories: `pizza` 175, `cheese` 17,
  `margherita pizza` 1.
- **LLM relations pass** (7 anchors, real neighbours): correctly rejected `cheese`,
  `cheese-based dishes`, `pho broth`, `romaine lettuce`, `phat buffalo`; correctly
  demoted `birria pizza/ramen`, `chocolate chip pancakes/pudding`,
  `fried flounder sandwich` to `cousin`. ONE error: placed the `pizza` category in
  `same` — the exact class L3's structural filter catches.
- **LLM vocabulary pass**: correct morphology (`ahumado/ahumada/ahumados/ahumadas`),
  real regional variants (`annatto → achiote/urucú/onoto`), borrowed words kept
  (`brunch`), proper nouns flagged (`khachapuri`, brand `Gansito` preserved),
  already-in-language recognized (`pollo al limón`). Korean/Chinese equally strong;
  the fold preserves CJK aliases intact.
- **`retrieveCandidates`** has four consumers (autocomplete, entity resolution, poll
  seeding, search interpretation); introduced as the deliberate "shared recall core".
