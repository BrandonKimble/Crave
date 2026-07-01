# Search Routing — Ground-Up Ideal Design (RESOLVE-OR-ESCALATE)

From an 18-agent from-scratch design panel (workflow wc3mj0ipu, 2026-06-30): the ideal
autocomplete/natural/shortcut routing so the LLM fires ONLY for genuine ambiguity — cutting cost +
latency without compromising recall. Every runtime claim is VERIFIED-FROM-CODE (citations at bottom)
or flagged NEEDS-DATA. This is a BACKEND search workstream (separate from the toggle/map work).

## 1. The regression — what actually happened (premise CORRECTED)

- **"P1.4 put the LLM on the hot path" is causally WRONG.** `SearchQueryInterpretationService.interpret()`
  has called the LLM as its first BLOCKING op since the service was BORN (commit `3f95aae4` — opens with
  `analysis = await this.llmService.analyzeSearchQuery(request.query)`). The ~4.4s Gemini cost is
  **day-1 architectural debt, not a regression** — no commit introduced it; it was always there.
- **What P1.4 actually changed:** the post-LLM entity-LINKING step. `3c3e2c96` added `linkViaHybridRecall`
  (lexical+dense RRF, no LLM) behind a flag; `70f09738` made it unconditional + deleted the legacy
  Sørensen-Dice `resolveBatch`. Net: P1.4 IMPROVED the post-LLM link + consolidated the matcher.
- **The two genuine P1.4 regressions:** (1) lost the non-LLM degradation path — `interpret()` now THROWS
  `LLMUnavailableError` on outage (search-query-interpretation.service.ts:104), no fallback; (2) a
  no-margin linker (`sparseSimilarity ≥ 0.82`, plain reduce-to-max, lines 334-338) is now load-bearing —
  fine post-LLM (clean input), dangerous if reused as a bypass gate (raw input).
- **Restore vs rebuild:** RESTORE only the non-LLM degradation path (now via gazetteer+recall). REBUILD
  everything else net-new. The "regression to fix" is primarily the day-1 debt.

## 1b. OWNER-CHOSEN SHAPE (2026-06-30) — SIMPLE + LISTLESS, supersedes the maximalist ladder

The full 10-leaf ladder below is the maximal-cheapness version. The owner chose a **simpler, more
reliable, list-free** shape — "handle the single-term bulk well, AI for everything else." HARD
CONSTRAINTS: **no non-exhaustive lists or content-based exception guards, ever** (the cuisine guard is
DELETED — it needed a list). Reliability + elegance > squeezing cost; the LLM calls aren't expensive,
and most searches are a single term/entity, so capturing those is the win.

**One structural rule replaces all five guards:** typed text that EXACTLY equals ONE known entity
(one word or multi-word like "pad thai"), type-unambiguous, and nothing more → no AI. Everything else
(multi-word, entity + extra text, ambiguous, generic, unknown) → AI. This drops generic-only detection,
the gazetteer multi-span resolution, partial-coverage, uncovered-compound, AND the cuisine guard —
they only existed to salvage cheapness on multi-word queries, which now just go to the AI.

**The chosen 4-rule shape (no lists, no exceptions):**
1. Shortcut CHIP (entry point, not content) → structured search, no AI.
2. Autocomplete TAP → resolved identity, no AI.
3. Typed text == exactly one known entity, TYPE-UNAMBIGUOUS → exact-match promoter (§6b), no AI.
4. Everything else → AI.

The ONLY surviving guard is the **type-conflict check** at rule 3, and it is **data-driven, not a
list**: "does this exact string match >1 entity / >1 type in the DB?" (autocomplete already returns
separate rows per type — "salsa" dish vs restaurant, "spicy" food-attr vs restaurant-attr → ≥2 exact
rows → escalate to AI). A query against our own data, never a hardcoded vocabulary.

WHY THE TYPE-CONFLICT GUARD IS NON-OPTIONAL (VERIFIED-FROM-CODE, workflow wzuhilpuw 2026-06-30):
entity TYPE is the single most load-bearing value in the pipeline — it is NOT a label that gets
thrown away after resolution. Trace: the LLM emits FOUR flat arrays (restaurants / foods /
foodAttributes / restaurantAttributes; `llm.types.ts:278`) — the ARRAY an entity lands in IS its type
(there is no explicit type field). That type is passed as a HARD FILTER into the linker
(`retrieveCandidates(term, [input.entityType], …)` → `WHERE e.type = ANY(...)` on both recall lanes,
`search-query-interpretation.service.ts:303`), then routes SQL: the four types compile to four
DIFFERENT predicates across TWO DIFFERENT tables (restaurant → `r.entity_id` on core_entities;
restaurant_attr → `r.restaurant_attributes && …` + EXISTS on signals; food → `c.food_id` on the
connections/dish table; food_attr → `c.food_attributes && …`; `search-query.builder.ts:752-999`). So a
uuid dropped in the WRONG type bucket emits a wrong-table query and returns EMPTY — SILENTLY, no error.
On the SERVER the guard is implicit/structural: recall is type-scoped so a resolved id physically can't
drift from the type that scoped it. But the CLIENT promoter has NO LLM bucket — it starts from raw
typed text where the same string ("salsa") is legitimately two typed rows. Picking one = GUESSING the
authoritative routing type = silent wrong-table risk. The type-conflict guard is the client-side
stand-in for the LLM's bucketing: one type → route it; >1 type → AI. That is why it survives when the
other four guards were deleted.

NOTES: generic-only ("best places nearby") is NOT detected — it just goes to AI (handles new entities
safely); the Best-restaurants/dishes CHIPS stay free via the entry-point rule, not content analysis.
The promoter uses EXACT (binary) equality — NO new 0.82-style cutoff. The existing `0.82`
(`HYBRID_LINK_SIMILARITY_THRESHOLD`) stays in its current job: the POST-LLM linker `linkViaHybridRecall`
("link the AI's extracted term to a DB row only if fuzzy-confident, else leave unresolved") — untouched.
Validate via shadow-run vs AI-only; the gazetteer multi-span is an OPT-IN experiment only, never the
default, and only if listless.

## 2. The ideal — RESOLVE-OR-ESCALATE (maximal-cheapness reference — see 1b for the chosen shape)

The LLM has exactly ONE irreplaceable job: **segment + type-classify free text containing UNKNOWN or
COMPOUND spans.** Everything resolvable (shortcuts, taps, exact tokens, gazetteer phrases, confident
single-token recall, generics, filters) is deterministic in single-digit ms.

A query is a sequence of SPANS — each (a) client-resolved to entityId+type, (b) server-resolvable, or
(c) UNRESOLVED. **Single LLM-fire condition:** after the full deterministic ladder, the LLM fires iff
≥1 non-generic residual span is unresolved OR an uncovered multi-word compound exists OR a span is
type-conflicted in the ambiguity band — and it receives ONLY the residual text (never the whole query,
filters, or resolved spans), merging back with the resolved spans. **The server is always the
authority; the client is an accelerator, never a correctness dependency** (bare submit →
resolvedSpans:[], residualText=rawQuery, server ladder takes over identically).

## 3. The routing decision tree (first matching leaf wins)

residualText is an ORDERED SPAN-LIST over rawQuery char offsets (not a flat string); demotion
re-inserts at the original offset so compounds survive.

```
0. kind=='favorites'  → short-circuit to favorites response pipeline (getListResults{listId,listType}). [no LLM]
1. kind=='shortcut'   → structured /search/run, entities:{} + ranking.                                   [no LLM]
2. kind=='resolved' & spans cover full query → SpanRevalidator (id+type+market+sourceText@offset);
   survivors → MultiEntityBypassBuilder → runQuery; failures demote to residual.                         [no LLM]
3. FilterTokenParser (SERVER-authoritative): peel numeric+currency filters → structured fields.
4. scanForKnownEntities (gazetteer) FIRST, then stripGenericTokens of leftover; isGenericOnly → viewport scan. [no LLM]
5. residual empty (all spans resolved + filters) → MultiEntityBypassBuilder → runQuery.                  [no LLM]
6. gazetteer spans cover ALL residual non-generic tokens AND single-type-dominant (TYPE-CONFLICT GUARD)
   AND no uncovered-compound AND no world-knowledge cuisine/style word (CUISINE GUARD) → entities → runQuery. [no LLM]
   (partial coverage → escalate)
7. exactly ONE single-word residual span → confident recall: resolve iff exact OR (≥θ AND clear MARGIN
   AND single-type-dominant); attribute-only → attribute viewport scan; typo/long/compound-shaped → ESCALATE. [mostly no LLM]
8. matched nothing & garbage-shaped (not in-vocab any language) → near-empty + on-demand.                [no LLM]
   (in-vocab-but-unmatched / non-Latin / known transliteration → LLM-eligible)
9. ResidualEscalationGate — THE ONLY LLM LEAF: unresolved residual span OR uncovered compound OR
   type-conflict → analyzeSearchQuery(residual ONLY) → linkViaHybridRecall → merge → runQuery.          [LLM]
10. LLM unavailable → DEGRADATION FALLBACK: gazetteer/recall-only partial + on-demand, flagged degraded. Never throw. [no LLM]
```

**Taxonomy → path (LLM only on the last 4):** SHORTCUT, FAVORITES, RESOLVED-ENTITY(tap), MULTI-RESOLVED,
EXACT-TOKEN (**the day-1 regression class — "ramen"/"tacos" typed-then-enter**), GENERIC-ONLY,
KNOWN-PHRASE, ENTITY+MODIFIER, ATTRIBUTE-ONLY, FILTER-LADEN, TYPO-FUZZY, SINGLE-RESIDUAL-UNKNOWN → all
NO LLM. MULTI-ENTITY-MIXED, AMBIGUOUS/FREEFORM, UNCOVERED-COMPOUND, TYPE-CONFLICT, CUISINE-INCONGRUENT
→ LLM.

## 4. The submit/resolution contract

Replace the loose `submissionContext: Record` with a typed discriminated union:
`{ shortcut | favorites{listId,listType} | resolved|freeform{ rawQuery, residualText: SpanList,
resolvedSpans:[{entityId,entityType,name,sourceText,typedPrefix,origin:'tap'|'exact-token'}],
filters:{openNow?,priceLevels?,minimumVotes?,ratingMin?,risingActive?}, bounds, viewportPolygon?,
userLocation, pagination } }`. Built by ONE shared **data-request** builder all surfaces call before
runSearch (distinct from the presentation-intent adapters — shortcut-adapter.ts returns
`SearchSessionEventPayload`, a different layer). Client resolves (taps + ClientExactMatchPromoter with
a staleness guard + category-term exclusion); server SpanRevalidator re-checks every span and is the
SOLE owner of the LLM decision. Favorites is a 1st-class `kind` that short-circuits before the ladder
(it reuses the RESPONSE pipeline, not the resolution ladder). Server accepts legacy `submissionContext`
during cutover (→ 1-span resolved), so the worst half-migrated regression is an extra LLM call.

## 5. Cost + quality (honest)

- **~80–92% of real natural-search submits avoid the LLM** (conservative band — the guards escalate more
  than a maximalist bypass). Latency 4.4s → **<150ms** on dominant traffic.
- **FREE immediate win (STEP 0a):** the two-tier query-result cache already exists but is OFF by default
  (`queryResultCacheTtlSeconds = 0`, llm.service.ts:153). Flipping it > 0 removes repeating-query LLM
  cost TODAY, zero code, zero recall risk. Re-baseline all bypass savings against cache-MISS traffic.
- **Recall preserved by non-interference + 5 precision guards:** TYPE-CONFLICT, MARGIN, PARTIAL-COVERAGE-
  IS-A-MISS, UNCOVERED-COMPOUND, CUISINE. **Honest caveat:** the gazetteer rung is a NEW resolver — NOT
  byte-identical to the LLM path (only Rung 4 reuses 0.82); its agreement is UNMEASURED until a shadow-run.
- **Mis-resolution risk** (gazetteer over-claims a span the user meant differently) is the most-cited risk;
  0.82 + the margin are UNKNOWN params to sweep on shadow data, NOT inherited constants.

## 6. Migration plan (ordered, de-risked)

- **STEP 0a** — enable the result cache (one config flip). Measure cache-miss LLM rate.
- **STEP 0b** — build the typed data-request submit contract + the single shared builder; server accepts
  legacy too. Zero behavior change.
- **STEP 0c** — instrument: replay a week of real queries through gazetteer+recall offline, measure
  full-coverage rate per class (ROI gate — if thin, lean on shortcuts/taps/exact-token + cache).
- **STEP 1** — ship the ClientExactMatchPromoter (staleness guard + category-term exclusion). **Closes the
  day-1 EXACT-TOKEN regression with ZERO new server work** (routes through the existing single-entity bypass).
- **STEP 2** — build server primitives WITHOUT enabling bypass: SpanRevalidator, server FilterTokenParser,
  **rebuild scanForKnownEntities to emit per-span match GROUPS** (the TYPE-CONFLICT GUARD has no input
  today — current dedup is type-blind, lines 1077-1085; this is a resolver-contract REWRITE, not a graft),
  gazetteer-before-generic-strip, MultiEntityBypassBuilder (delete applySelectedAutocompleteEntity's
  replace-all), margin gate, CUISINE GUARD, QueryShapeClassifier, ResidualEscalationGate.
- **STEP 3** — SHADOW-RUN behind the live LLM: log canonicalized QueryPlan (ladder vs LLM) per class,
  sweep θ+margin, measure result-coverage on the HARD sub-slice + on-demand-queue delta. The key de-risk.
- **STEP 4** — flip bypass ON class-by-class, only where non-inferior on the hard sub-slice, safest first.
- **STEP 5** — non-LLM degradation fallback (replace the LLMUnavailableError throw).
- **STEP 6** — n-gram compound decomposition into recall (run FIRST for compounds — the search LLM schema
  is FLAT, llm.types.ts:278-282, so it does NOT emit the decomposition chain we'd credited it with).
- **STEP 7** — delete legacy submissionContext, gated on client-version adoption (decoupled from bypass).

## 6b. The exact-match promoter — decided shape (matcher investigation w2bpm6kfw)

The shared matcher has NO public single-best-exact resolver — every method RANKS a shortlist. The only
pure exact-match is `scanForKnownEntities` (the gazetteer: closed-set name/alias equality, no LLM) but
it runs server-side over the DB. So:

- **Build the promoter on the AUTOCOMPLETE SUGGESTIONS the client already holds — NOT a new matcher
  endpoint, NOT a direct matcher call.** Each suggestion already carries the fully-resolved
  `entityId + entityType` (= what an exact matcher call would return). A server call would re-derive an
  identity the client has, for a second hop + freshness window, zero gain.
- **Reuse the EXISTING server bypass:** send `submissionContext = {matchType:'entity', selectedEntityId,
  selectedEntityType}`; `buildSelectedEntitySearchRequest` (search-orchestration.service.ts:314-366)
  short-circuits BEFORE `interpret` → runQuery directly, no LLM. The TAP path already builds this exact
  payload (use-search-foreground-suggestion-submit-runtime.ts:108-117) — the promoter is its
  submit-without-tap twin.
- **THE ONE SERVER FIX (~2 lines):** the suggestion carries the identity but the server DROPS the
  exactness `evidence` at the DTO map (autocomplete.service.ts:306-313 — computed at
  entity-search.service.ts:58, never forwarded); `matchType` is hardcoded 'entity', `confidence` is a
  noisy proxy, `aliases` is []. Forward `evidence` (or a derived `isExactMatch`/`isAliasMatch`) so the
  client can trust "exact" and handle alias/accent/typo cases ("Café"/"Cafe", "&"/"and"). NOT the heavy
  "wire rerankForAutocomplete (dead code) into the live path" — just the passthrough.
- **Load-bearing GATES (the server does NOT revalidate id↔name; it trusts the id as the filter, line
  330):** promote only on `evidence==='exact'|'alias'` AND normalized name-equality AND a SINGLE
  unambiguous `matchType==='entity'` row AND freshness (compare the RAW typed text to `response.query`,
  NOT the sanitized `normalizedQuery`). Multiple exact rows across types (e.g. "thai" cuisine-attr vs a
  restaurant named "Thai") → DO NOT auto-promote (autocomplete ranks by popularity, not the user's
  sense) → fall through to the LLM. Drop `query`/`poll` rows (non-UUID id → 400).
- **PRODUCT DECISION to confirm:** on TAP a restaurant short-circuits to its profile preview (no search,
  suggestion-submit-runtime.ts:100-105). Should typing a restaurant name + Return do the same, or run a
  results search? Safe default = results-only; confirm before building.
- **Verify first:** does the natural-submit owner have the current suggestion list + its source query in
  scope (the structural prerequisite — not yet confirmed); the freshness comparison string.

## 7. Open questions (needs-data before committing)

Multi-entity AND/OR composition semantics; margin-gate calibration (δ vs ratio); shadow agreement bar +
metric (QueryPlan equality vs recall@k, given LLM nondeterminism); attribute-vocab completeness;
filter-grammar aggressiveness; ladder latency on the still-escalating path; on-demand recording for
bypassed garbage/novel tokens; n-gram-vs-LLM on compounds.

## Load-bearing citations
LLM unconditional since birth `3f95aae4`; P1.4 link-only `3c3e2c96`/`70f09738`; `LLMUnavailableError`
throw search-query-interpretation.service.ts:104; 0.82 + no-margin link lines 61/334-338; marketKey null
for non-restaurant interpretation.service.ts:264; applySelectedAutocompleteEntity replace-all :710;
scanForKnownEntities single-type EntitySpan entity-text-search.service.ts:59-61/979, SQL match 1037-1044,
type-blind dedup 1077-1085; flat search schema llm.types.ts:278-282; result cache OFF llm.service.ts:153;
generic list generic-token-handling.ts:7-28; "ceaser salad" + single-entity builder
search-orchestration.service.ts:140/314; FE two-layer split shortcut-adapter.ts:16,33 +
use-search-structured-submit-owner.ts:79; favorites short-circuit :548.
