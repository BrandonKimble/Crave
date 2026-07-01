# Search System — Ideal End-to-End Design (consensus)

From a 16-agent research + design-panel + red-team workflow (wgddps7d4, 2026-06-30): 7 deep readers
(incl. git archaeology) → 4 independent designers (inclusive-recall-first · google-parity-ux ·
minimal-change-pragmatist · ground-up-ideal) → 4 adversarial critics (exclusion/recall-harm ·
ambiguity/correctness · distance-perf-scale · overbuild/underbuild-migration) → 1 synthesizer.
Every runtime claim is VERIFIED-FROM-CODE or flagged NEEDS-DATA. This SUBSUMES the routing-only
[search-routing-redesign.md](search-routing-redesign.md) (§1b's simple/listless shape survives as
the Stage-1/Stage-2 entry policy; this doc adds distance, confidence, ranking, profile-vs-search).

Governing principle: honor "smart but not exclusionary" **structurally, not by taste** — reveal every
candidate the graph can justify and let the global-percentile Crave Score sort, WITHOUT (a) auto-linking
to a confidently-wrong entity, (b) burying the truly-relevant match below the fold, (c) globalizing
recall past what the index can absorb, or (d) silently starving on-demand learning. All four are
red-team-proven failure modes that every design tripped at least once.

## The shape: three stages, one of each core concept (confidence, decision, location)

### Stage 1 — INTERPRET (keep verbatim)
LLM (Gemini `analyzeSearchQuery`) segments free text and buckets each term into the four flat arrays;
**the array IS the type** (`llm.types.ts:278-282`, born `3f95aae4` Oct-2025, correct). This is the one
place a real LLM call belongs. The autocomplete-tap / single-entity bypass
(`{matchType:'entity', selectedEntityId, selectedEntityType}`) stays and correctly skips the LLM
(`search-orchestration.service.ts:314-386`). CONSOLIDATE the three duplicate selectedEntity→bucket
switches (orchestration:333, interpretation:730, search.service.ts:2249) into ONE router — each copy is
a silent wrong-table-empty-query surface.

### Stage 2 — RESOLVE-OR-LEARN
One shared recall core (`retrieveCandidates`, `entity-text-search.service.ts:153-244`) stays: RRF-fused
sparse+dense, **recall-only**, carrying raw per-lane features. **KEEP recall TYPE-SCOPED** (line 305,
`retrieveCandidates(term, [llmType])`) — do NOT broaden recall to all four types. The LLM's type is
authoritative for the LINK decision; broadening happens only at SQL fan-out (Stage 3) where the id is
already trusted. (Broadening recall re-opens the unguarded exact-`find` at line 318 → auto-links a food
term to a same-named restaurant at confidence=1 → wrong SQL lane.)

Replace the 15-line 0.82-reduce-to-max (interpretation.service.ts:334-347) with ONE confidence-tiered,
margin-based decision layer that CONSUMES the carried features (not re-derives):
- **EXACT**: `count(normalized-name-equal candidates) == 1` AND that candidate.type == the LLM bucket
  → LINK conf=1. (count==1 + type gates are NEW — close the same-type-duplicate "wrong Winson" hole.)
- **CONFIDENT-FUZZY**: top score ≥ θ (length-scaled, reuse `resolveSimilarityThreshold`, not one flat
  0.82) AND margin(top − runnerUp) ≥ δ. **Margin is subordinate to evidence** — an exact/aliasExact top
  always links regardless of a thin runner-up (fixes "Joe's Pizza" vs "Joe's Pizzeria" underbuild).
- **AMBIGUOUS** (cleared θ, thin margin, ≥2 near-equal): LINK ALL near-tied ids into their typed lanes
  (a defined multi-id SQL contract) so the UNION reveals them ranked. Do NOT feed on-demand as
  "unknown" — we have them.
- **MISS**: nothing clears → drop from SQL → on-demand.

Preserve three invariants: dense never drives a link alone (ramen→pho guard); the exact fast-path;
miss→on-demand.

**REUSE, don't reinvent, the accept/reject (verified wf wd86awlxo / direct agents 2026-06-30):** the
tiered layer is NOT a rival decision system — it is the CHEAP GATE that decides WHEN to spend the
accept/reject we ALREADY have. The ingestion resolver's Tier 3 (`performLlmMatches`,
`entity-resolution.service.ts:661-719`) already runs the SAME recall + an LLM sameness-judge
(`llmService.matchEntity`, `llm.service.ts:1348-1388`) → match(link)/new(reject), fail-closed. That
judge is a STATELESS, side-effect-free primitive `(term, kind, [{id,name}]) → {decision, candidateId,
reason}` with ZERO ingestion coupling, and `LLMService` is ALREADY injected into the query interpreter
(`search-query-interpretation.service.ts:71`) — so `this.llmService.matchEntity(...)` is callable from
`linkViaHybridRecall` today, no extraction. Compose them: the cheap tiers (exact / confident-fuzzy)
resolve the BULK at zero added latency; the AMBIGUOUS tail (near-θ, thin-margin, ≥2 near-tied — where
0.82 just guesses) ESCALATES to the reused `matchEntity` judge. This is "consolidate onto the existing
accept/reject exactly where it adds value, without paying its LLM round-trip on the 90% single-term
case" (a query expands to ~100 terms; ingestion affords the judge only because it's offline/batch).
Two caller-side decisions before wiring: (1) `matchEntity.kind` is only `restaurant|food`
(`llm.types.ts:327`) — keep the lexical rule for the two attribute types at first, don't extend the
prompt yet; (2) the tail's recall wants `denseMode:'always'` (ingestion's setting) so semantic
neighbours reach the judge, vs the linker's `'fallback'` default — a scoped divergence. There is NO
shared decision helper today (linker=0.82-lexical, ingestion=LLM-judge, each bespoke; the gazetteer is
a separate closed-set exact-equality path that never touches recall). OPTIONAL coherence win: extract a
single budget-parameterized policy wrapper (exact→margin-gate→LLM-tail) that BOTH callers route through
(query-time: LLM on the tail; ingestion: LLM always) — nice, not required. The minimal move is just
"the linker calls `matchEntity` for its ambiguous tail."

### Stage 3 — REVEAL-AND-RANK
Each RESOLVED id fans out to EVERY SQL lane its type legitimately touches (**type = join-target
selector, NOT recall filter**), via per-lane INDEXABLE UNION subqueries (never a single OR — seq-scans:
EXPLAIN 0.09ms indexed vs 0.35ms seq). This is where "search everything and rank" lives, safe because
the id was already type-verified upstream. Two independent lists (restaurants + dishes) via
`executeDual`, unchanged.

Ordering: global-percentile Crave Score stays the PRIMARY, index-orderable, precomputed backbone
(builder.ts:1593,1620). Two SUBORDINATE tiebreaks so the backbone still streams from the score CTE and
badge==position holds:
- (a) a BOUNDED relevance/match-quality tiebreak WITHIN score bands — the fix for the dominant red-team
  risk: broadening recall with a query-agnostic sort buries the relevant-but-modest-score match below
  the marginally-relevant-high-score one. Relevance nudges within bands, never dominates. **Non-optional.**
- (b) a proximity tiebreak (haversine / cos(lat)-scaled, NOT the raw-Euclidean `buildDistanceOrder`
  which is anisotropic across latitudes), on a bounded page.

## Answers to the specific questions

**Is the four-type→SQL split overbuilt?** NO — keep it. It's the join-key selector over two physically
different tables (exact `r.entity_id` on core_entities vs uuid[] array-overlap on connections,
builder.ts:752-999), not four filters on one column. Cross-type NAME overlap is **0.4%** (15/3654) —
your "separated at collection" belief is CONFIRMED; ids are structurally disjoint (EntityType
single-valued, schema.prisma:1375). The per-type UI routing that originally motivated the split
(restaurant_attribute→restaurant-only render) was ALREADY deleted in `ef6b4304` (Jan-2026) — only a
conceptual vestige remains, not live code. The real exclusion is that a food-bucketed term can only
LINK to food rows — but the fix is at **fan-out**, not recall: once resolved, fan the id to every lane
its type touches (the food lane already ORs food_id+categories; the restaurant query already ORs the
food-signal graph → "burger" surfaces 55 restaurants via signals + 28 dishes, ordered identically).

**"Just search everything and rank"?** YES for recall/inclusiveness — but as **search-every-lane-a-
resolved-id-touches** (indexable UNION), NOT type-blind recall, and with two mandatory guardrails
(relevance-band tiebreak; UNION-at-scale EXPLAIN discipline). The bare thesis without those trades away
exactly the reachability it was meant to deliver ("shown at position 340" = exclusion for a 3-row
scroller). Note: two attribute lanes are EMPTY in live data (food_attributes 0/1178) — "search
everything" is partly a no-op for attributes until on-demand fills them (data-maturity gap).

**The 15-line Stage-2 (exact + 0.82) — redundant double-check of the matcher?** The CHECK is NOT
redundant — the matcher is recall-only by explicit design (docstring:41-45,144-152: RRF "orders the
shortlist, NOT a relevance score"), always returns K rows incl. dense-only neighbours, makes NO
accept/reject call. Some decision layer MUST choose link-vs-on-demand — that's not double-checking, it's
the only place the binary is made, and re-checking exact IS new info (the matcher never surfaces a
single-best-exact). BUT the specific 0.82 RULE is antiquated: (a) exact fast-path is `.find()`
first-match, no count/type guard → "wrong Winson"; (b) no margin — links 0.83-over-0.82 as confidently
as 0.95-over-0.30; (c) 0.82 hardcoded, never swept, ignores length-context; (d) reads only
sparseSimilarity, ignores the evidence tier already computed. Replace with the tiered margin layer
above — which is exactly the "consume the matcher's features, don't re-derive worse" you were after.

**Does our matcher factor distance/viewport?** NO — confirmed. Location is a HARD single-market EXISTS
filter (`buildRestaurantMarketFilter`, entity-text-search.service.ts:1051-1071) with ZERO proximity
ranking; raw coords are discarded (autocomplete.service.ts:1415). This is the OPPOSITE of Google
(hard-scope, no rank) and the most exclusionary mechanism in the system. Ideal (bounded Google-parity):
- (1) BOUNDED fuzzy/dense recall as a MARKET-SET membership (viewport market + adjacent markets via
  core_markets polygon GiST adjacency, ST_Touches/ST_DWithin — indexable) → cross-metro without
  globalizing.
- (2) A SEPARATE CHEAP GLOBAL exact/alias lookup (btree on normalized name, tiny result) UNION'd in →
  an exact name in another country (Winson→Malaysia) still appears, ranked down. Recall breadth tiered
  by match quality: exact = global-and-cheap; fuzzy = bounded.
- (3) Proximity as a SUBORDINATE ORDER-BY tiebreak (never multiplied into the score — that dynamizes the
  sort key), d0 a FIXED metro-scale constant (NOT the viewport half-diagonal — zoom-coupled pathology).
Do NOT relax the hard EXISTS into a pure per-row global rerank (what all four designs first proposed) —
the market EXISTS is the ONLY thing bounding recall cardinality; restaurant POINTs have no spatial
index, and the dense lane is a pre-filtered HNSW (removing the filter makes ANN pick top-k with zero
geo-awareness; a post-hoc rerank can't recover a candidate the ANN never returned). Distance never gates
result EXISTENCE — only ORDER. Delivers your "Winson → NYC, Oklahoma, UK, Malaysia."

**Profile vs cards (Google-like, confidence-gated).** Open the PROFILE iff (server-side, over the
untruncated candidate set): (1) top.type == restaurant; (2) evidence ∈ {exact, **aliasExact**};
(3) **singleDominant**: exactly ONE exact/aliasExact candidate across ALL types (count==1); (4) type ==
restaurant. Else CARDS. Your "Pedroces→profile / Pedro Sis→cards" = count==1 exact vs fuzzy-only/multi.
The profile-jump runs the results search UNDERNEATH in parallel (as tap does today, line 117) so the
profile is one back-swipe from everything — never a dead-end. Distance stays OUT of the gate (only
breaks a multi-exact tie — nearest of two "Shake Shack" — never suppresses a lone far exact).
**BUG the panel initially missed:** the current `resolveEvidence` "alias" value is a garbage else-bucket
(entity-text-search.service.ts:561 — returned when nameSimilarity is BELOW threshold), so gating on it
jumps to a profile on fuzzy noise. FIX FIRST: split a genuine `aliasExact` tier (query normalized-equals
a stored alias) from the else-bucket. For no-tap typed-Return, gate STRICTER: exact-only.

**What is confidence today?** No unified concept — a 5+ notion patchwork on one recall core:
sparseSimilarity, denseCosine, rrf ("NOT a relevance score"), a categorical evidence tier, four
length-varying thresholds (0.7/0.55/0.45/0.35), a hardcoded never-swept 0.82 with no margin, and a DTO
`confidence` = max(dense,sparse) for real matches but hardcoded constants (0.65 favorites, 1
query-suggestions) — non-comparable, and used ONLY as a React list key (decorative). The useful evidence
tier is computed then DROPPED at the DTO. ~12 distinct hardcoded cutoffs across four files. Ideal: ONE
structured object `{ tier, sparseSimilarity, denseCosine, margin, singleDominant }`, computed once,
carried end-to-end, tier-PRIMARY (a tier is comparable across queries; a raw float isn't). Drives all
three decisions: suggestion ordering, profile-jump gate, link decision. Stop overloading — favorites/
viewed/query-suggestions carry an explicit source/hint tag, not a fake confidence.

## What changes / what stays

CHANGES: (1) fix `resolveEvidence` alias→aliasExact split; (2) forward evidence tier + margin +
singleDominant through the DTO, stop overloading numeric confidence; (3) replace Stage-2 with the tiered
margin layer (recall stays type-scoped); (4) search-every-lane UNION fan-out; (5) bounded relevance-band
secondary sort; (6) bounded market-set recall + cheap global exact lookup + proximity tiebreak;
(7) profile gate on {exact,aliasExact}+singleDominant+restaurant, on tap AND typed-Return, results
search underneath; (8) on-demand local-coverage fix (collect from three sets); (9) consolidate the three
selectedEntity switches; (10) DELETE inert `enableFuzzyMatching` flag, dead `rerankForAutocomplete`,
fold plan-expansion (`SearchEntityExpansionService`) onto `retrieveCandidates`.

STAYS (justified): the four-array LLM contract; the four-type→two-table predicates (change fan-out, keep
predicates); the two EMPTY attribute lanes (forward-correct scaffolding — do NOT delete, no-op cost);
the shared RRF recall core + recall-vs-decision split; **linker recall type-scoped (line 305)**; Crave
Score as primary precomputed sort + badge==position; the autocomplete-tap LLM bypass; executeDual always
returning both lists (tab is a frontend view); on-demand's existing guards; ingestion's LLM judge; the
three link invariants; LLM segmentation on the hot path.

## Migration (cheapest-high-value first; each independently shippable + gated)

- **STEP 0 (free, no behavior change):** fix `resolveEvidence` alias bucket + forward evidence/margin/
  singleDominant through the DTO. Unblocks the profile gate, the promoter, and coherent confidence.
- **STEP 1 (your #1 win, low risk):** typed-exact/single-entity profile promoter + gate on tap AND
  typed-Return, gated only on Step 0. Reuses the existing selected-entity bypass — no new server routing.
  Closes the 4.4s-on-typed-exact cost. Compute singleDominant server-side over the untruncated set.
- **STEP 2 (pure cleanup):** consolidate the three selectedEntity switches; delete inert flag + dead
  reranker.
- **STEP 3 (decision correctness, shadow-gated):** replace Stage-2 with the tiered margin layer.
  Shadow-log old-verdict vs new-verdict on live traffic; sweep θ/δ; cut over. Recall stays type-scoped.
- **STEP 4 (on-demand plumbing — MUST precede 5-7):** the local-coverage collection fix. Carry
  market-presence + evidence-tier to `collectUnresolvedTerms`; collect from three sets (unresolved /
  no-local-coverage / low-confidence-weak).
- **STEP 5 (ordering safety):** the bounded relevance-band tiebreak. Additive; must precede broadening.
- **STEP 6 (distance, shadow-gated):** bounded market-set recall + cheap global exact lookup + proximity
  tiebreak. Ship the ranking nudge first (safe), then relax the hard EXISTS (A/B on the hard sub-slice).
- **STEP 7 (broadening, EXPLAIN-gated):** search-every-lane UNION fan-out. Gate on EXPLAIN-at-scale (no
  Seq Scan) against a SYNTHETIC scaled corpus, not the 1.2k-row live DB. Depends on Steps 4+5.
- **STEP 8 (final delete):** fold plan-expansion onto `retrieveCandidates`.

Steps 0-2 = immediate, no gate. 3-7 each behind a shadow/A-B/EXPLAIN gate. All thresholds config-swept,
never inherited.

## Honest unresolved risks (do NOT paper over)

1. **THE ON-DEMAND "HOLE" — DISPROVEN (verified wf a107258a97, 2026-06-30).** My earlier claim that
   on-demand fires ONLY for null-entityId terms (so resolved terms are lost to learning) is **FALSE.**
   Two independent pathways feed collection and resolved terms DO feed learning: (a) the OnDemandRequest
   table (`unmet` slice) fires for BOTH unresolved terms AND resolved-but-low-coverage terms — recorded
   WITH entityId (`search.service.ts:3000-3068`, gated by `shouldTriggerOnDemand`); (b) EVERY page-1
   search unconditionally logs its resolved entities (`recordQueryImpressions`, search.service.ts:2205)
   → nightly `SearchDemandAggregationService` → the `demand` collection slice (quota 8, the LARGEST of
   the four). So even ordinary resolved-and-covered terms feed collection via the search-log/demand
   pathway, independent of any OnDemandRequest. Prioritization: 25 terms/cycle, quotas unmet=5 /
   refresh=10 / demand=8 / explore=2; unresolved gets flat severity=1, low_result gets coverage-weighted
   severity (`keyword-slice-selection.service.ts`). CONSEQUENCE: "resolve more" moves do NOT starve
   learning; the former Step-4 prerequisite and the "Steps 6-7 blocked" constraint are REMOVED. (Doubly
   moot since we also decided not to broaden — see the Stage-3 note.)
2. **Tiny-N percentile instability.** The whole "broaden recall, trust ranking" thesis leans on the
   Crave Score backbone, but that percentile is computed over ~1178 connections — coarse and unstable.
   Needs a score-stability audit (maybe shrinkage/smoothing) before broadened recall's extra rows are
   trustworthy. This is the real quality ceiling — not fetch breadth.
3. **UNION-at-scale perf UNPROVEN.** The live DB (1178 connections / 1801 restaurants) is too tiny to
   expose the Seq-Scan cliff. Needs a synthetic 100-1000× corpus. Single biggest unmeasured risk.
4. **Filtered-ANN cross-city semantic recall.** Keeping a bounded geo pre-filter on the dense lane
   (rather than globalizing) trades some cross-city SEMANTIC recall for correctness. Exact/alias
   cross-city is preserved (cheap global lookup); fuzzy/semantic cross-city is bounded. Deliberate,
   honest limitation — not full Google-parity for semantic queries in other cities.
5. NEEDS-DATA: θ / δ / d0 / market-adjacency uncalibrated (sweep on replayed logs); alias-data coverage
   audit (the profile gate leans on real aliasExact hits); whether coarse market grain (regional/locality
   only) needs a metro tier for the distance bias to feel sharp.
6. OUT OF SCOPE but noted: the 4.4s LLM hot-path latency (day-1 since 3f95aae4) — Steps 1 + the tap
   bypass avoid it for high-volume cases; the compound-query path still pays it.
