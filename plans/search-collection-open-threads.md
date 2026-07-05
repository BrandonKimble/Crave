# Search + Collection — Open Threads (backlog & pickup plan)

**Provenance.** This gathers everything we touched but did **not** finish across the
long search-retrieval + collection-pipeline session (2026-07-04/05), so we can come
back tomorrow with a fresh, well-scoped view. It captures both what's _applied but
uncommitted_ and what's _still open_. Companion memory: [[search-closeness-certainty-verdict]],
[[search-linker-architecture]], [[collection-prompt-hub-and-aliases]], [[autocomplete-redteam]].

**Nothing here is committed.** Current branch `data/reddit-archives-2025-refresh` does
not match this work — see Housekeeping.

---

## Status snapshot

**Applied (uncommitted), validated — ready to commit:**

- **Linker margin decider** — `search-query-interpretation.service.ts` (`:340` exact-by-evidence
  fix + margin rule, `HYBRID_LINK_MARGIN=1.3`, floor 0.82). Validated: variant-link-replay
  99.9% alias recall / 2-of-32 containment.
- **Autocomplete tiered confidence + dense-off-mid-token** — `autocomplete/entity-search.service.ts`.
  Validated: `ram`→ramen #1, `banh it ram` demoted, no `raspberry/parm/ravioli` junk.
- **Expansion evidence gate** — `search.service.ts` (`EXPANSION_STRONG_EVIDENCE` +
  `passesExpansionEvidence`, 4 filter sites). Drops `weak`/`phonetic`, floors `fuzzy` at 0.5.
- **Collection prompt: food/cuisine 3.0 + empty-set gate + food-side anti-synthesis law +
  praise holistic-only/emit-once** — `llm/prompts/collection-prompt.md`. Blind-tested, NOT yet
  run on real archive extractions.
- **Crave-Score fan-out dedup** — `reddit-collector/projection-rebuild.service.ts` (per
  `(sourceDocument, restaurant)`).
- **HNSW index recreation** — `prisma/migrations/20260705003434_recreate_entity_name_embedding_hnsw`.
  Fixes a real pre-existing bug (the index was Prisma-auto-dropped weeks ago; `searchByEmbedding`
  was silently seq-scanning). Applied to dev + migration file. **KEEP.** (Needs a guard — thread B.)
- **`weak`-is-load-bearing safeguard comment** — `entity-text-search.service.ts` `resolveEvidence`
  (documents the 3 jobs `weak` does, so nobody repeats the "delete the dead label" mistake).

**Reverted this session (clean slate for redesign):** dense co-inclusion — `findDenseNeighbors`,
`expandFoodCoInclusion`, the `search.service` wiring, and the probe. See thread A for why + the
learnings to rebuild from.

---

## Foundational reference: the TWO widening systems (read before touching dense/expansion)

The search pipeline has **two structurally different widening levers**, run in sequence.
Conflating them is what derailed the dense build.

**Lever 1 — Plan Expansion = _add more matching entity IDs_** (`search.service.ts:426`)

- Fires when `strictCoverageCount < expansionStrictCoverageTarget (default 25)` **OR** unresolved terms.
- Builds a wider entity-ID set, then **re-runs the strict query** with that bigger IN-list.
- Five sub-types today: (1) lexical food, (2) lexical food-attribute, (3) lexical restaurant-attribute,
  (4) `foodIdsFromPrimaryFoodAttributeText`, (5) _(dense co-inclusion would be #6)_.
- Effect: changes _which_ entities match; lands in the strict/primary result set via the re-run.

**Lever 2 — Relaxation stages = _drop constraint clauses_** (`search.service.ts:512`)

- Fires when `canRelax` **AND** strict exact count `< RELAX_STRICT_THRESHOLD (10)` — checked
  separately per axis (restaurant / dish).
- `canRelax` requires a **droppable attribute/modifier** (`resolveRelaxationCapabilities`) — a bare
  dish query ("ramen", no attribute) has `canRelax=false`.
- Stages: `relaxed_food_attributes` / `relaxed_restaurant_attributes` / `relaxed_modifiers`. Runs a
  looser query, pools with strict, re-ranks by Crave Score. Does **not** add siblings.

**The trap:** Lever 2 is _not_ a "dishes are thin, widen more" hook — it's "drop an attribute."
Any "widen when dishes are thin" idea must live in Lever 1 or a **new** mechanism, never on the
relaxation stage.

---

## A. Dense co-inclusion — ✅ BUILT (2026-07-05, uncommitted). See `~/.claude/plans/quirky-riding-frog.md`

Redesigned from the ground up and built the same day. Final shape (supersedes everything above in
this thread):

- **Cutoff = MUTUAL RANK** (the elegant no-AI mechanism the owner asked for): keep sibling S for
  anchor A iff `cos ≥ 0.75 ∧ forward rank ≤ 25 ∧ mutual rank ≤ 20`, where mutual rank = A's rank in
  S's OWN neighborhood. Kills the junk that interleaves by cosine (ramen→pasta cos .822 mutual 54;
  pho→viet coffee 24/po boy 43 all die) while right-sizing sparse dishes (bun bo hue keeps its true
  4 relatives). Owner locked: strict R≈20, pure math (no LLM polish yet), default mode `expansion`.
- **Materialized offline**: `derived_entity_sibling_edges` (superset top-30/anchor with raw
  cosine/forward/mutual stats; K/R/floor applied AT READ from env knobs → retune without rebuild),
  built by `EntitySiblingEdgeBuilderService` (4AM cron + `scripts/rebuild-sibling-edges.ts`;
  1,725 anchors → 51,631 edges in ~12s). Runtime = ONE indexed read
  (`SearchSiblingExpansionService.getSiblingFoodIds`), zero vector math, fail-open.
- **3-mode flag** `SEARCH_DENSE_SIBLINGS_MODE` = off | expansion (default) | always; knobs
  `..._FORWARD_K/MUTUAL_R/COSINE_FLOOR/MAX_ANCHORS`. `always` seeds siblings BEFORE the first
  strict probe (every stage sees them; relaxation decided after dense — owner's ordering). E2E
  verified distinct: pizza off=10 dishes/51 rests → always=21/72; thin queries widen in both
  expansion+always; off = baseline.
- **Gotcha found+fixed**: pgvector `hnsw.ef_search` defaults to 40 candidates and the index spans
  ALL entity types → post-filter truncation (pho's neighborhood cut to 20 rows, mutual ranks
  wrongly NULL). Builder + harness spot-check run `SET LOCAL hnsw.ef_search = 400`.
- Harnesses: `sibling-sweep.ts` (owner-eyeball printouts + invariants, all green),
  `sibling-mode-e2e.ts`. HNSW guard shipped too (boot self-heal + migration tripwire spec).

**Still open in this thread:** (1) owner eyeball of the full sweep before freezing K/R defaults for
launch; (2) real-data observation after the first-city load (the `always` vs `expansion` product
call); (3) future relevancy sort (hook documented in the plan; edges carry cosine+mutual_rank);
(4) noted corpus quirk: "bun" (bread) survives as a bun-bo-hue sibling via the bún homograph —
revisit with real data / thread D hygiene.

**Confidence:** HIGH on the top-K/floor/geometry mechanics; OPEN on the architectural home.

---

## A2. Retrieval red-team verdict (2026-07-05, 5-dimension multi-agent, live-DB probes, 18/24 confirmed)

Owner asked for the same rigor on the lexical/linker/consumer stack as the dense work got. Full
findings in the session transcript; the confirmed set, grouped by build package:

**Cleared as ideal (do NOT rebuild):** matcher-ranks/consumers-decide split; RRF as recall
ordering; evidence-tier-over-scalar house pattern; a learned/logistic decider REJECTED (n≈2 real
training pairs in the decision region; correlated features; not debuggable) — the deterministic
per-tier table IS the end-state; dense sibling graph canNOT replace categories (symmetric
similarity ≠ directed is-a) — the ideal is TWO edge sets over the one food-entity node space.

**FOUNDATIONAL (2):**

1. **Calibration corpus is broken**: 1176/1178 alias-replay pairs short-circuit at the exact tier
   — the 0.82/1.3/0.5 constants are validated by n≈2. Fix: perturbation-generated corpus
   (typo-replay machinery; probe showed n=806 spread across all 4 decision regions) + negative
   controls; ALL decider constants sweep-derived into a generated, versioned artifact.
2. **Categories are per-mention noise on connections**: 56/111 (50.5%) multi-connection foods have
   DISAGREEING category sets (burger: {burger} on 20 conns, {burger,sandwich} on 10 → a "sandwich"
   search returns 10 of 30 identical burgers). Fix: per-FOOD directed `food_category_edges`
   (is-a), reconciled across all mentions, query joins through food_id — mirrors the sibling-edge
   pattern. (Plus the already-decided ONE-HOP rule: category fan-out from exact ids only.)

**SIGNIFICANT (10):** containment→own evidence tier w/ honest coverage score (not fake 1.0 —
the omakase class); levenshtein branch→own 'edit' tier w/ edit-score (today it only feeds junk RRF
mass as 'weak'); singleton dead-zone in the margin rule (`runnerSim>0` makes the margin path
unfireable for UNCONTESTED candidates — the largest recoverable region; fix = singleton floor
~0.65); per-tier threshold-table decider replaces the 40-line if-chain; prefix's synthetic 0.94
sparseSimilarity→explicit tier rule; autocomplete bands violate their own invariant (popularity
can cross tiers; fix = lexicographic (tier, score) sort); collection LLM matcher→BATCH the judge
(~10x request cut) + give it aliases/features not bare names; expansion is fail-closed+unbounded
in the hot path (fix = Promise.race ~300ms budget, fail-open + metric); on-demand dedup ('reason'
inside the identity key + two uncoordinated signal sites; fix = identity excludes reason +
searchRequestId idempotency); relaxation dedupe/totals break when pageSize<10 (fix = clamp probe
take + full strict id-set for exclusions).

**MINOR (6):** delete phonetic lane (no surviving consumer, junk-heavy) once 'edit' tier exists;
lattice seq-scan + `<%` gist-indexability = the 50k-scale shape (defer); market scoping can hide
an exact owner while leaving in-market fuzzy linkable (exact-lane exemption, surface annotated);
two-edge-sets framing (no extra build); perRestaurantLimit full delete (~60 lines, zero consumers);
page>1 strict full-page execution wasted when relaxation fires (reorder ~15 lines).

**✅ ALL PACKAGES BUILT 2026-07-05 (single marathon session, every gate green).** P1: singleton
floor (then superseded by the calibrated table), relaxation clamp + pooled-page slice, lazy
strictPage (double-relax pages save a query), expansion fail-open budget (SEARCH_EXPANSION_BUDGET_MS
=1500), on-demand identity w/o reason + searchRequestId ask-dedup (minted at interpretation,
shared by both signal sites), perRestaurantLimit + dead executor execute() deleted (shared type
field removed). P4: derived_food_category_edges (per-food is-a, union-reconciled, refresh hook in
projection rebuild) + one-hop (category members resolved at plan time from EXACT ids only;
`c.categories &&` SQL arms deleted) + 43 cuisine hubs archived (LLM one-shot classify,
entity_status 'archived' added; sibling edges rebuilt 1682 anchors). P2: 'contains' tier w/
coverage score + 'edit' tier w/ 1−lev/len + phonetic lane DELETED (quantified cost: 1/1178 alias
recall) + honest similarity in the mapper; consumers banded (autocomplete 0.55/0.4 + band-ceiling
clamp making tier-crossing structurally impossible; linker eligible; expansion contains=strong,
edit≥0.75). P3: linker-calibration-sweep.ts (974-pair perturbation corpus + negatives) →
linker-calibration.generated.ts (fuzzy 0.67 abs/0.51 singleton @96% measured precision; small-n
tiers conservative); per-tier table decider; TIE-PLURALITY (same-tier ε-ties → entityIds[] →
one OR-filter group); replay replica imports the generated table (drift-proof). P5: judge BATCHED
(matchEntitiesBatch, ~10 items/call, aliases in payload, per-item fail-closed); E: prompt 4.6
food_aliases (established-shorthand only, structural super/subset filter at the sink); F:
intra-batch overlay dedupe (cheap deterministic gate lev≤3/containment → strict LLM judge →
alias banking + `intra_batch_near_duplicate_collapsed` counter). Remaining in this doc: G
(archive-load validation) + Deferred section + sectioned-relevancy sort ✅ BUILT (0eb8f9f4:
tier 0 = query food + category members, tier 1 = siblings/lexical; exactMatch row provenance
awaits the mobile divider UI).

**Suggested packages:** P1 correctness quick-wins (singleton floor, relaxation clamp, expansion
fail-open, on-demand idempotency, perRestaurantLimit delete, page>1 reorder) · P2 evidence-tier
honesty (containment tier + edit tier + phonetic delete + prefix rule — one SQL area, one replay
gate) · P3 calibration harness + per-tier table decider (+ tie-plurality from thread C rides
along) · P4 category edges (foundational #2 + one-hop) · P5 consumers (autocomplete lexicographic,
LLM-judge batching). P4 before the first archive load if possible (categories bake into the
projection rebuild).

## A3. "Include similar" toggle — OWNER-SETTLED product shape (2026-07-05, spec'd, buildable now)

Owner design (supersedes sections AND blend — both permanently rejected; blend rejected because
Crave Score legibility is the product: no boosting, no 1-4-3-2 scrambling, badge==position):
**default = exact + instances only · user toggle "Include similar" adds siblings · PURE Crave
Score ranking in both states.** ("Instances" = canonical category MEMBERS: neapolitan pizza IS
pizza — always in the default; "similar" = dense siblings, the different-dish family.)

Spec:

- **Request param `includeSimilar?: boolean`** replaces the env mode for user-facing behavior
  (env keeps the operator default). OFF → foodIds = exact ∪ categoryMembers; ON → + siblings.
  Toggle flip = a NEW query (new totals, reset to page 1) — honest, since the pool changes.
- **Thin-results chip** (the toggle's front door): when `exactTotal < pageSize` AND
  `similarCount > 0`, response metadata carries `similarAvailable: N` → client renders
  "Only X matches — show N similar dishes?" One tap = same search with includeSimilar=true.
  similarCount = cheap side count over sibling ids' connections, computed only when thin.
- **End-of-pagination chip**: when the LAST page of an exact-only search returns (< pageSize
  rows), same metadata → client shows the chip as a footer instead of dead-ending. No automatic
  merging of similars into later pages (that would be sections-by-pagination — rejected).
- **Threshold**: keyed to PAGE CAPACITY (pageSize, client sends 20), NOT the relaxation
  threshold (10) — relaxation is an internal attribute-drop mechanism and stays invisible.
  Chip logic = "does page 1 have room + do similars exist", nothing else.
- **Pagination compatibility**: includeSimilar is stateless per request; offset pagination
  unchanged; `exactMatch` + graded `relevance` already on every row (badging + analytics).
- Server work: ~small (param + metadata count + chip fields). Client owns chip/toggle UX.
- NOTE server-side pagination verified correct (page2-probe.ts: pages 1-3 × 20 rows, right
  totals) — the current mobile load-more dead-end is CLIENT-side.

## B. HNSW index guard _(near-term, small)_

The `name_embedding` HNSW index will be re-dropped on the next `prisma migrate dev` (Prisma can't
model HNSW → sees it as drift → writes a DROP; that's how it vanished last time). `migrate deploy`
(prod) is safe. Agreed guard:

1. **Self-heal on boot** — idempotent `CREATE INDEX IF NOT EXISTS …` in a startup hook; the
   `EntityEmbeddingReconcilerService` (owns the column) is the natural home. Caveat: a from-scratch
   rebuild briefly locks writes on `core_entities` (trivial at current size; only when actually missing).
2. **CI tripwire** — a test that scans `prisma/migrations/**` in order and fails if the net final
   state of `idx_entities_name_embedding_hnsw` is _dropped_ (handles the historical create→drop→create).

**Confidence:** HIGH. Independent of co-inclusion — `searchByEmbedding` needs it either way.

---

## C. Linker — tie-plurality + margin calibration _(medium)_

The margin decider is applied. Two follow-ons the panel + research red-team flagged:

- **Tie-plurality (reveal-all):** `omakase`→5 tied entities, `joes`→Joe's Pizza + Trader Joe's both
  1.0 — today argmax silently picks the first (a certainty violation). Ideal: linker returns
  `string[]` (cardinality = decision: 1 confident / >1 revealed plurality / 0 abstain), `denseMode:
'corroborate'`, add L2c (marginal lexical top + strong `denseCosine` on the same entity → promote,
  recovers `ramne`→ramen). The shadow `shadowMarginLinkDecision` already exists; make it live. Gate:
  variant-link-replay.
- **Margin on a CALIBRATED score, not RRF:** RRF's rank-0-vs-1 gap is a fixed ~0.00027 regardless of
  semantic separation, so a margin over RRF measures rank adjacency, not confidence. Minimum:
  monotonic/logistic calibration of `sparseSimilarity`; ideal: a small learned pairwise decider over
  the features already carried. Order the K=5 shortlist by the quantity the margin compares.

**Sibling co-inclusion stays SEPARATE** from tie-plurality (opposite provenance: tie = "unsure
which," disjunction; co-inclusion = "sure, here's the family"). Do not merge them into one
`entityIds[]`.

---

## D. Cuisine-hub reclass migration _(prerequisite for A)_

The prompt now **prevents new** hubs (Step 4.2 empty-set gate applied), but **50 existing**
`% food` / `% meal` entities are still mis-filed as `type='food'` (e.g. `vietnamese food`,
`indian meal`). Injecting a hub id into the filter drags every restaurant of that cuisine into the
ranking = the exact "Google interleaves everything" failure.

**Fix (no stop-list):** a one-shot pass running the _same test as the prompt gate_ over
`type='food'` names — strip filler (`food`/`meal`/`dish`), and if the remainder is a
cuisine/nationality adjective → delete the entity and reroute its connections (they carry only
`general_praise`) to the restaurant-level path. Same test as the gate so they never diverge. Spare
legit categories (`comfort food`, `soul food`, `street food`, `breakfast`). Dry-run + review the 50
before applying.

**Confidence:** HIGH on approach. This unblocks clean dense co-inclusion.

---

## E. `food_aliases` prompt field _(medium; ship the field, defer the worker)_

Not applied yet. Ship a collection-prompt `food_aliases` field **restricted to canonical
abbreviation / established shorthand** (`bec`, `bbq↔barbecue`) as new subsection **4.6 at the end of
Step 4, after `food_categories`** — the first moment the LLM holds the finished canonical phrase.
Ship it **together with** the food-side anti-synthesis law (already applied) — the field is the ONE
sanctioned exception to that law and is only safe with the law in place. Wiring (verified):
`llm.types.ts ~:121`, Step 4 Outputs + Step 6.2, sink `unified-processing.service.ts:862`,
downstream structural filter (reject an alias that is a token super/subset of the food, or collides
with another food's canonical name — guards embedding-poisoning). Resolver/reconciler unchanged
(marks `name_embedding_stale` → re-embeds).

**Defer the alias worker** (broad dialect-synonym generation) until production miss-data justifies —
it's the higher-recall 2nd writer to the same `aliases[]` sink, never a rework. Only 15/1725 foods
(0.9%) have >1 alias today; no live distribution to size the broad payoff.

---

## F. Within-batch dish dedupe _(the chicken-patty bug — owner-named #2)_

**Bug:** the matcher only recalls _persisted_ entities, so two dishes extracted in the _same batch_
from _different source docs_ (e.g. `chicken patty` / `chicken patties`) both create new entities —
an intra-batch new-vs-new blind spot.

**Decision (owner-set): reuse the matcher, NOT a lemmatizer/stoplist.** The ideal is **in-memory
injection of uncommitted new entities** into the recall→strict-`matchEntity`-judge so a later dish in
the batch can match an earlier new one. Correct polarity here (dedup: `BEC` ↔ `bacon egg and cheese`
IS the same-entity case, unlike the strict-identity co-inclusion case). No lemmatizer, no stoplist
(constraint inheritance is automatic). Red-team preferred in-memory injection over deferred-commit /
staging-table (those are a partial-batch-commit correctness hazard).

**Sequence:** measure the intra-batch new-entity trigger frequency FIRST (the value gate — semantic
intra-run merges may be rare), then build. `entity-resolution.service.ts:907-913` is the in-batch map.
_(Note: an earlier "deterministic-lemmatizer-on-the-key" Phase-1 idea is recorded in
[[collection-prompt-hub-and-aliases]] but was superseded by the reuse-the-matcher decision.)_

**Confidence:** MEDIUM (value depends on the unmeasured trigger frequency).

---

## G. Validate applied collection-prompt changes on REAL extractions _(gate on archive load)_

The food/cuisine 3.0 refactor, empty-set gate, anti-synthesis law, and praise holistic/emit-once are
applied + blind-tested but have **not** run on real reddit archive data. Validate during the
first-city load: cuisine-hub over/under-fire, praise false-positive rate, dish-token faithfulness,
no fabricated dishes.

---

## Deferred (don't build speculatively)

- **Alias worker** (thread E) — data-gated.
- **Homograph downstream venue-name rescue** — residual of the homograph-anchor fix.
- **Typeahead prefix FST/trie** — replace the per-keystroke 6-way fuzzy SQL scan; LOW urgency,
  decide after corpus-size/write-cadence.
- **Batch dedupe Phase 3** (emit-raw + staging batch resolver + delete LLM canonicalization) — only
  if thread F's Phase-2 measurement justifies.

---

## Housekeeping

- **Commit.** All the "Applied, validated" work above is uncommitted on
  `data/reddit-archives-2025-refresh` (a mismatched branch). Decide: a fresh branch for the
  search/collection work, and whether to commit the validated set now (linker, autocomplete,
  expansion gate, collection prompt, Crave-Score dedup, HNSW migration + safeguard comment) as one
  checkpoint before tomorrow.
- **Scratchpad artifacts** (`scratchpad/`, the `.diff` files) are throwaway.

---

## Suggested next sequence (tomorrow)

1. **Commit the validated set** on a clean branch (checkpoint).
2. **HNSW index guard** (B) — small, unblocks safe migrate-dev.
3. **Cuisine-hub reclass** (D) — unblocks A; dry-run the 50 first.
4. **Dense co-inclusion redesign** (A) — decide the architectural home against the two-lever map;
   build the primitive; keep it **dark** for the first archive load.
5. **First-city archive load** → validate G + observe a real baseline for A.
6. Then, as data justifies: tie-plurality (C), food_aliases (E), within-batch dedupe (F, measure first).
