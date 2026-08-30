# Entity-type coverage audit — mechanism × {place, item, item_attribute, place_attribute, ingredient}

Date: 2026-08-30. Read-only audit of the defect class "machinery built for one
entity type silently excluding the others." Spine: `docs/llm-systems-map.md` +
`docs/search-flow.md`; every verdict below is backed by code read (file:line)
and, where the bite is measurable, staging DB counts (SELECT-only,
2026-08-30: 8,834 place / 4,823 item / 204 item_attribute / 571
place_attribute / 2,728 ingredient active+other entities).

Verdicts: **COVERED** · **OMITTED-BITES-NOW** · **OMITTED-BITES-LATER** ·
**CORRECT-EXCLUSION(reason)** · **IN-FLIGHT** (known, being fixed — not
re-litigated here).

---

## 1. Resolution & identity

| Mechanism | place | item | item_attr | place_attr | ingredient |
|---|---|---|---|---|---|
| Exact tier (name + identity_key fold probe) | COVERED | COVERED | COVERED | COVERED | COVERED |
| Number-variant probes (`itemNameVariants`) | CORRECT-EXCLUSION (branding: "Torchy's Tacos" ≠ "Taco" — `entity-resolution.service.ts:98-103`) | COVERED | CORRECT-EXCLUSION (see F-7) | CORRECT-EXCLUSION (see F-7) | COVERED |
| Alias/surface tier | COVERED | COVERED | COVERED | COVERED | COVERED |
| Tier-3 LLM matcher (`useLlmMatcher`) | COVERED | COVERED | CORRECT-EXCLUSION (attributes route to ontology placement instead — `entity-resolution.service.ts:524-540`) | CORRECT-EXCLUSION (same) | COVERED (`:534` with rationale comment) |
| Intra-batch near-duplicate guard (`primaryNewEntityMap` + variant keys) | COVERED (fold-keyed) | COVERED (+variants `:2584-2590`) | COVERED (fold-keyed only) | COVERED (fold-keyed only) | COVERED (+variants) |
| Tombstone/reject sink | OMITTED-BITES-LATER (F-6) | OMITTED-BITES-LATER (F-6) | COVERED (`entity-resolution.service.ts:2269-2300`) | COVERED (same block) | OMITTED-BITES-LATER (F-6) |
| Metro-aware adoption | COVERED | CORRECT-EXCLUSION (metro-locality is a brand-presence question; foods are global vocabulary) | CORRECT-EXCLUSION (same) | CORRECT-EXCLUSION (same) | CORRECT-EXCLUSION (same) |
| Entity surface writer (`entity-surface.service.ts`) | COVERED — keyed by entity_id, type-agnostic | COVERED | COVERED | COVERED | COVERED |
| Canonical folds / identity_key | COVERED (all types, `entity-identity.ts`) | COVERED | COVERED | COVERED | COVERED |
| Place grounding / secondary expansion | COVERED | CORRECT-EXCLUSION (only places have Google Place ids) | — | — | — |

## 2. Merge / redirect plumbing

| Mechanism | place | item | item_attr | place_attr | ingredient |
|---|---|---|---|---|---|
| Offline dedupe-merge sweep | COVERED (restaurant-entity-merge, nightly) | COVERED (food-dedupe-merge, nightly — `type='item'` at `food-dedupe-merge.service.ts:296,370,415,518`) | IN-FLIGHT (attribute-dedupe-merge built, manual + judge flag off) | IN-FLIGHT (same) | **OMITTED-BITES-NOW (F-2)** — no sweep scans `type='ingredient'` |
| Same-claim / active-active merge doctrine | IN-FLIGHT (owner brief) | IN-FLIGHT | IN-FLIGHT | IN-FLIGHT | IN-FLIGHT |
| `entity_redirects` writers | COVERED | COVERED | COVERED (attribute-dedupe writes them, `attribute-dedupe-merge.service.ts`) | COVERED | COVERED (would be, via food-merge path if it ever ran on ingredients) |
| Redirect readers — signals subject identity (`subject-identity.ts:56-70`, SQL join) | COVERED (id-keyed, type-agnostic) | COVERED | COVERED | COVERED | COVERED |
| Redirect readers — autocomplete personalization (`autocomplete.service.ts:704-730`) | COVERED | COVERED | COVERED | COVERED | COVERED |
| Redirect readers — saved lists / saveable resolver (`saveable-entity.resolver.ts:68-111`) | COVERED | COVERED | COVERED | COVERED | COVERED |
| Redirect readers — sibling/satisfies expansion (`search-sibling-expansion.service.ts:307,474,531`) | — | COVERED | (n/a until attr satisfies lands) | (n/a) | COVERED (twin-ingredient arm uses same join) |
| Redirect readers — profile/search place hop (`search.service.ts:1052-1057,1244-1248`) | COVERED | — | — | — | — |
| User-anchor rehome (`entity-anchor-rehome.service.ts`) | COVERED (id-keyed; called by both merge services and by attribute-dedupe) | COVERED | COVERED | COVERED | COVERED |
| Post-merge stale-edge pruning of `entity_satisfies` / sibling edges | — | COVERED (read-side one-hop redirect + drop, `search-sibling-expansion.service.ts:283-286` — nothing prunes, by design) | n/a | n/a | COVERED (same read-side law) |

Verdict on the redirect question the brief asked: the redirect plumbing is
genuinely type-agnostic — every consumer resolves by entity_id with no type
filter. An attribute merge's redirect IS followed by demand readers, saved
lists, and autocomplete. No omission found here.

## 3. Vocabulary

| Mechanism | place | item | item_attr | place_attr | ingredient |
|---|---|---|---|---|---|
| Word-genericness/negation/role lanes | COVERED — word-GLOBAL by design (facets of the word, not of an entity type; `word-vocabulary-lanes.ts`). CORRECT: a frame word is a frame word in every group | ✓ | ✓ | ✓ | ✓ |
| Judged-vocabulary door | COVERED (word-global) | ✓ | ✓ | ✓ | ✓ |
| Attribute ontology placement (pending → active) | CORRECT-EXCLUSION (attributes only, by charter) | CORRECT-EXCLUSION | COVERED | COVERED | CORRECT-EXCLUSION |
| Demand-vocabulary learner candidate pool (`demand-vocabulary.service.ts:246-251`) | CORRECT-EXCLUSION (an unknown place name is collection demand, not vocabulary) | COVERED | COVERED | COVERED | COVERED — but judge `kind` hardcoded `'item'` even for attribute candidates (`:290`) — doctrine smell, OMITTED-BITES-LATER (F-8) |
| Residue splitter typed outputs (`unsegmented-residue.service.ts:136-152`) | COVERED | COVERED | COVERED | COVERED | **OMITTED-BITES-NOW (F-3)** — prompt/schema emit `ingredients` (`residue-prompt.md:21,95`; `llm-response-schemas.ts:30-42`), the drain maps only 4 arrays and drops them |
| Alias/surface banking (all banking sites → surface writer) | COVERED | COVERED | COVERED | COVERED | COVERED |
| Embedding reconciler (`entity-embedding-reconciler.service.ts:123,151`) | COVERED — explicit 5-type IN list | ✓ | ✓ | ✓ | ✓ |
| Sibling edge builder (`entity-sibling-edge-builder.service.ts:76,99` — `type='item'`) | CORRECT-EXCLUSION (place similarity is not a neighborhood ask) | COVERED | IN-FLIGHT — the widening-satisfies build sources attribute neighborhoods its own way (`widening-satisfies.service.ts` exists, uncommitted-adjacent) | IN-FLIGHT | OMITTED-BITES-LATER (F-9) — no ingredient neighborhoods; ingredient-satisfies rule v3 exists (`widening-satisfies-rule.ts:17`) so candidate sourcing is the in-flight build's problem — verify it doesn't assume item sibling edges |
| Name-containment edges (`name-containment-edge-builder.service.ts:91-115` — item only) | CORRECT-EXCLUSION (head-final dish grammar) | COVERED | OMITTED-BITES-LATER (F-10: "dog friendly patio" ⊃ "patio" containment could seed attr widening; acceptable to leave to satisfies lane) | same | CORRECT-EXCLUSION (ingredient containment is the twin-union arm, different mechanism) |
| Food-category edges (`food-category-edge-builder.service.ts:119`) | CORRECT-EXCLUSION | COVERED | CORRECT-EXCLUSION (ontology owns attr hierarchy) | same | CORRECT-EXCLUSION |
| Entity-lexicon (typo dictionary) builder (`entity-lexicon-builder.service.ts:62-78` — NO type filter) | COVERED | COVERED | COVERED | COVERED | COVERED |
| Surface-locale index | COVERED (all surfaces) | ✓ | ✓ | ✓ | ✓ |

## 4. Knowledge

| Mechanism | place | item | item_attr | place_attr | ingredient |
|---|---|---|---|---|---|
| Dish-knowledge synthesis | — | COVERED | — | — | COVERED as a *product* (it mints ingredient entities + links, `dish-knowledge-synthesis.service.ts:266-269`) but no ingredient-anchored knowledge pass (aliases FOR an ingredient itself) — OMITTED-BITES-LATER (F-11) |
| Restaurant knowledge | COVERED — cuisine/venue-facts extraction (Places summary → cuisines + venue attrs) is the place analog | — | — | COVERED (it mints pending place_attributes) | — |
| Attribute knowledge | — | — | COVERED by ontology placement + display-name choice (that IS attribute world-knowledge) | ✓ | — |
| Concept-satisfies (item rule v1) | — | COVERED (`entity_satisfies` item-only today; staging: 2,126 edges) | IN-FLIGHT (rule v2, `widening-satisfies-rule.ts`) | IN-FLIGHT | IN-FLIGHT (rule v3) |
| Ontology hierarchy | CORRECT-EXCLUSION | CORRECT-EXCLUSION (category edges own it) | COVERED | COVERED | CORRECT-EXCLUSION (no ingredient taxonomy needed while twin-union + satisfies-v3 cover the ask) |
| Photo vision / moderation | COVERED — content-typed (photos, user text), not entity-typed. CORRECT-EXCLUSION for the rest | ✓ | n/a | n/a | n/a |

## 5. Search

| Mechanism | place | item | item_attr | place_attr | ingredient |
|---|---|---|---|---|---|
| Gazetteer grounding scan | COVERED (all 5 — `docs/search-flow.md` Stage 1.2, verified against interpretation service) | ✓ | ✓ | ✓ | ✓ |
| QUERY_ENTITY_GROUP_KEYS derivations (`search-query.dto.ts:142-160`) | COVERED — exhaustive-both-directions type pin; consumers at `search.service.ts:2277,2833,3696`, `search-orchestration.service.ts:305` derive | ✓ | ✓ | ✓ | ✓ |
| Autocomplete lanes (`autocomplete.service.ts:1544-1590`) | COVERED | COVERED | COVERED (attribute lane, default ON `:277-280`) | COVERED | COVERED (owner-ruled 2026-07-25; twin-name seat rule `:141-183`) |
| Lexical expansion on thin/unresolved (`search.service.ts:3484-3524`) | CORRECT-EXCLUSION (fuzzy place expansion would ground wrong restaurants; place identity is exact/alias-only at query time by design, `entity-resolution.service.ts:521-527`) | COVERED | COVERED | COVERED | **OMITTED-BITES-LATER (F-4)** — no `takeTerms(request.entities.ingredients)` arm; unresolved/thin ingredient terms get no expansion |
| Dish widening stack (category/containment/twin/satisfies/siblings) | — | COVERED | IN-FLIGHT (attribute-satisfies = extra soft-concept arm, `search-flow.md` §consequences) | IN-FLIGHT | PARTIAL — twin-ingredient union COVERED; satisfies v3 IN-FLIGHT |
| Starvation / demand recording | COVERED (group-key derived post-F3800) | ✓ | ✓ (per-soft-concept starvation) | ✓ | ✓ (records; staging shows 0 rows — see F-3, its feeder drops ingredient residue) |
| On-demand request rail (`on-demand-request.service.ts` — `entityType: EntityType`, no filter) | COVERED | ✓ | ✓ | ✓ | ✓ (rail accepts them; feeders rarely send them) |
| On-demand → **collection demand slice** (`keyword-slice-selection.service.ts:128-133` `COLLECTIBLE_ENTITY_TYPES = ['restaurant','food','item_attribute','place_attribute']`) | **OMITTED-BITES-NOW (F-1)** — `'restaurant'` matches nothing | **OMITTED-BITES-NOW (F-1)** — `'food'` matches nothing | COVERED | COVERED | OMITTED (F-1) — never listed at all |
| Coverage/status enumerations | COVERED (derive from the group vocabulary) | ✓ | ✓ | ✓ | ✓ |

## 6. Lifecycle, hygiene, scoring

| Mechanism | place | item | item_attr | place_attr | ingredient |
|---|---|---|---|---|---|
| GC (`scripts/reload/gc-unsupported-entities.sql:14-33`) | COVERED — reference-based, all array columns incl. `ingredients`, `restaurant_attributes`, `canonical_ingredients`; archived tombstones kept | ✓ | ✓ | ✓ | ✓ |
| Wipe preserved-anchors | COVERED (id/reference-based, type-agnostic) | ✓ | ✓ | ✓ | ✓ |
| Restaurant-name court | COVERED (manual-only — separate known gap) | OMITTED-BITES-LATER (F-5: no junk-surface court for dish/ingredient/attr surfaces; the 399-junk finding was place-scoped but ghost recall surfaces can exist on any type; attributes partly covered by tombstone sink + word-claim adjudicator) | partial (word-claim adjudicator hears collisions) | partial | OMITTED-BITES-LATER (F-5) |
| Crave scoring (`public-crave-score.service.ts:200-225` — subjects: restaurant, connection) | COVERED | COVERED (as connection) | CORRECT-EXCLUSION — attributes are filters/provenance, never ranked subjects; order is pure crave score of the carrying dish/place (`search-flow.md` Stage 3) | same | CORRECT-EXCLUSION — same; ingredient asks rank the carrying dishes |
| Rescore / projections | COVERED (subject-scoped, follows scoring exclusions correctly) | ✓ | n/a | n/a | n/a |
| Janitor / partitions / retention | CORRECT-EXCLUSION for non-place (they manage locations/signals/PII, not entity vocabulary) | — | — | — | — |

## 7. Verdict infrastructure

| Mechanism | coverage |
|---|---|
| Rehearing budget | COVERED — lane-keyed, type-agnostic (`claim-rehearing-budget.service.ts`, used by all lanes) |
| Bench probers | OMITTED-BITES-LATER (F-12) — flip-rate prober registry covers the 3 word lanes only (`llm-systems-map.md` "Unprobed lanes"); `entity_match`, `entity_dedupe`, `attribute_merge`, `concept_satisfies` (and future satisfies v2/v3) report unprobed on approval sheets — a per-type prompt regression ships blind |
| Invariant registry (`shared/invariants/registry.ts`) | OMITTED-BITES-LATER (F-13) — no invariant pins "entity-type enumerations derive from the enum/vocabulary." The F3800 fix pinned SEARCH groups only (`search-query.dto.ts` tsc pin); `COLLECTIBLE_ENTITY_TYPES` (F-1) proves the class recurs outside search. The 2026-08-19 demand-vocab fix (`demand-vocabulary.service.ts:241-245`) was the SAME stale-literal bug one file away — found by hand, not by a guard |

---

## Ranked findings

### Bites now

**F-1 — Collection's demand slice can never collect place or item demand.**
`keyword-slice-selection.service.ts:128-133` filters territory demand with the
pre-R14 literals `'restaurant','food'`; the SQL compares `e.type::text = ANY(...)`
(`signal-demand-read.service.ts:904`) so nothing errors — place and item rows are
silently filtered out and the demand slice returns attributes only (ingredients
never listed either). Staging: place+item are 74% of on-demand rows and ~93% of
entities. User impact: when people repeatedly search a dish or restaurant we
don't cover, the collector never goes looking for it — the demand loop is dead
for exactly the two types users ask for most. (Same bug family as the
`'food'::entity_type` crash fixed 2026-08-19 in demand-vocabulary — this one
survives because ANY() over text[] fails silent instead of loud.)

**F-2 — Ingredient entities have no dedupe-merge sweep.** Every scan in
`food-dedupe-merge.service.ts` is `type='item'` (`:296,370,415,518`); the
resolver's LLM matcher covers ingredients at mint time (`entity-resolution.
service.ts:534`) but nothing merges the duplicates already in the corpus.
Staging: ~329 active ingredient pairs at similarity > 0.75 ("beef ribeye" /
"ribeye beef", "roasted pepper" / "roasted red pepper"). User impact: an
ingredient search splits its evidence across twins, so "ribeye" results
under-count and under-rank.

**F-3 — The residue splitter throws away its own ingredient output.** The
prompt and schema emit an `ingredients` array (`residue-prompt.md:21,95`,
`llm-response-schemas.ts:30-42`) but `unsegmented-residue.service.ts:136-152`
maps only places/items/itemAttributes/placeAttributes into typed demand.
Exact F3800 shape, one system upstream of the fixed one. Staging: 0 ingredient
on-demand rows ever recorded. User impact: a multi-word search that contains a
component we don't know ("something with yuzu kosho") records no ingredient
demand — we never learn we're missing it.

### Bites later

**F-4 — Lexical expansion skips the ingredients group** (`search.service.ts:
3484-3524` has item/item_attr/place_attr arms only): a misspelled or thin
ingredient ask gets no expansion pass. Low bite while the lexicon typo layer
covers interpretation, but the thin-page rescue lane is type-incomplete.

**F-5 — No junk-surface court for non-place types.** The restaurant-name court
judges place surfaces only; dish/ingredient ghost recall surfaces have no
analog (attributes are partly protected by tombstone-adopt + the word-claim
adjudicator).

**F-6 — Reject/tombstone-adopt exists for attributes only**
(`entity-resolution.service.ts:2269-2300`). Items/ingredients/places have no
remembered-reject sink; if an item-level reject path ever mints archived junk
verdicts, repeat mentions will re-mint instead of absorbing. Latent until an
item court exists (F-5 and F-6 are the two halves of the same missing organ).

**F-7 — Attributes get no variant/lemma forms anywhere.** Number variants are
item+ingredient only (correct for "vibe"/"vibes"? — today the ontology
placement lane unifies attribute morphology case-by-case at LLM cost; staging
shows 0 near-dup active attributes so it is holding, but the guarantee is
stochastic, not mechanical).

**F-8 — Demand-vocabulary judge calls every candidate `kind:'item'`**
(`demand-vocabulary.service.ts:290`) even when the candidate pool includes
attributes/ingredients — the judge reasons with dish doctrine about an
attribute word.

**F-9/F-10 — No ingredient/attribute neighborhoods** (sibling edges and
name-containment are item-only). Mostly absorbed by the in-flight satisfies
build; verify that build does not silently depend on item-only sibling edges
for its candidate pairs.

**F-11 — No ingredient-anchored knowledge pass** (aliases/locale surfaces FOR
an ingredient come only as a side effect of dish synthesis).

**F-12 — Bench probers cover the 3 word lanes only**; every entity-typed lane
ships prompt changes unprobed.

**F-13 — No invariant guards entity-type enumerations.** The class this audit
exists for has now produced three confirmed instances (F3800 search groups,
demand-vocab `'food'` cast, F-1). Cheap guard: a source-scan invariant that
flags any string-literal list containing `'restaurant'`/`'food'` compared
against `entity_type`, plus a rule that new type lists must be
`Object.values(EntityType)`-derived or `satisfies`-pinned like
`QUERY_ENTITY_GROUP_KEYS`.

### In-flight (marked, not re-litigated)
Satisfies v2 (attributes) + v3 (ingredients) build (`widening-satisfies.
service.ts`, `widening-satisfies-rule.ts`); same-claim merge doctrine;
attribute-merge lane activation (built, judge flag off, no scheduler).

---

## Recommended work queue

**Pre-reload** (these shape what the reload learns/collects):
1. F-1 — one-line fix (`['place','item','item_attribute','place_attribute','ingredient']`
   or `Object.values(EntityType)`) + F-13 invariant so it stays fixed.
2. F-3 — add the `ingredients` arm to the residue drain (5 lines, F3800 shape).
3. F-2 — extend the dedupe sweep scan to `type IN ('item','ingredient')` (the
   merge machinery, locks, and judge kind already handle ingredients).
4. F-8 — pass the candidate's real kind to the judge (rides along with 3).

**Post-reload:**
5. F-4 ingredient expansion arm; F-12 prober registrations for entity-typed
   lanes; F-5/F-6 design a shared junk-surface court + reject sink for
   non-place types (one design, two organs); F-7 decide whether attribute
   morphology deserves a mechanical fold; F-11 ingredient knowledge pass if
   locale recall data shows misses.
