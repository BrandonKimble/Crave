# Poll Plan — Phase 0/1 Execution Scope (concrete tasks)

> Companion to `community-polls-discussion-driven-collection-plan.md` (the architecture).
> This breaks the **foundation** (Phases 0–1, mostly poll-independent) into actionable tasks.
> Each fixes real existing bugs and de-risks the poll-specific work. Status: NOT STARTED.

Legend: **Files** = primary touch points · **Dep** = depends on · **Accept** = done criteria.

---

## Phase 0 — Cross-cutting standards + hygiene (do first; independent of each other)

### P0.1 — Migration discipline (replace `db push`) ✅ DONE (commit c530c8c0)

**Shipped (baseline-in-place — NO data loss):** root cause was multi-session `db push` drift +
rolled-back duplicate `_prisma_migrations` rows + one migration file edited after apply (→
`migrate dev` demanded a reset). Verified live DB == schema.prisma (empty diff), then added
`20260609120000_capture_db_push_drift` (55 stmts) marked applied; removed 5 rolled-back dup rows;
fixed the post-apply checksum. Now: migrations fully reproduce schema.prisma, `migrate status`
clean, `migrate dev` works (empty migration when in sync). **Test data preserved** (1731 rest /
738+469 attrs) — so P1.2/P1.3 can validate against the real corrupted/attribute data.

---

### P0.1 — Migration discipline (replace `db push`) — original scope (for reference)

**Goal:** stop dev `db push`; establish real Prisma migrations so prod has ordered/reversible history.

- Reconcile current schema vs migration history (seam-2 `search_events` changes were `db push`'d → drift).
- Baseline the current schema as a migration; switch workflow to `migrate dev` / `deploy`.
- **Files:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`.
- **Dep:** none (do before any schema-touching task below).
- **Accept:** clean `migrate status`; a fresh DB built purely from migrations matches current schema.
- **Risk:** drift reconciliation; the DB is expendable so a reset-baseline is acceptable.

### P0.2 — LLM/model + thinking standards (§14) ✅ DONE (commit 82faffc4)

**Shipped:** removed `thinking.enabled` + `thinking.budget` (config/service/type/.env);
`getThinkingConfig` now always returns a `thinkingLevel` for Gemini 3 (defaults content=LOW,
query=MINIMAL) and the legacy budget path is gone; **cuisine moved to Lite**
(`gemini-3.1-flash-lite`). tsc + eslint clean; runtime-verified (cuisine + moderation healthy;
init log shows thinkingLevel=LOW / queryThinkingLevel=MINIMAL). Net −81/+23 lines.
Deferred (not blocking): a shared `LITE_MODEL` const (string is inlined in 3 spots).

---

### P0.2 — LLM/model + thinking standards (§14) — original scope (for reference)

**Goal:** one consistent LLM-call standard; kill legacy thinking config; assign model tiers.

- Remove `thinking.enabled` + `thinking.budget` (legacy Gemini-2.5); **always send `thinkingLevel`**
  (Gemini-3 defaults to HIGH if unset). Tiers: collection/ontology = `LOW`; query/cuisine/
  moderation/poll-subject/place-chooser = `MINIMAL`.
- Model tiers: cheap classify/parse → `gemini-3.1-flash-lite`; complex extraction/judgment →
  `gemini-3-flash`. Move **cuisine** to Lite (currently query model).
- Confirm all structured calls use native `responseJsonSchema` (not in-prompt JSON skeletons).
- **Files:** `llm.service.ts` (`getThinkingConfig` ~L2820, config reads ~L199-207), `configuration.ts`
  (llm.thinking.\*), `apps/api/.env` (drop `LLM_THINKING_ENABLED`/`LLM_THINKING_BUDGET`).
- **Dep:** none. **Accept:** no call omits a thinkingLevel; cuisine runs on Lite; tests/pipeline green.

### P0.3 — Moderation rebuild (§9) ✅ DONE

**Shipped (uncommitted in working tree):** deleted the Google-classifier impl + `moderation.*`
config + `GOOGLE_MODERATION_*` env; new `moderation-prompt.md` (principles-first, conservative)

- `MODERATION_RESPONSE_JSON_SCHEMA` + `LLMService.moderateText` (Lite model `gemini-3.1-flash-lite`,
  MINIMAL thinking, native schema); `ModerationService` rewritten to call it (interface unchanged,
  4 call sites untouched). **Verified at runtime via app context: 8/8** (food phrases incl. "rainbow
  unicorn wrap" ALLOW; threats/harassment BLOCK). tsc + eslint clean. Fail policy = pre-launch
  fail-open with a TODO for soft-hold (§9).
  **Grounding for next tasks:** `moderateText` relies on `getThinkingConfig` returning a MINIMAL
  level — which currently only happens because `thinking.enabled=true`. **P0.2 should be next** to
  make "always send a level" the rule (so moderation can't silently regress to HIGH).

---

### P0.3 — Moderation rebuild (§9) — original scope (for reference)

**Goal:** replace the broken no-op classifier with a food-aware Gemini pass (validated).

- DELETE the Google-classifier impl (fetch, threshold, `allowlistPhrases`/`isAllowlisted`),
  `GOOGLE_MODERATION_ENDPOINT`/`moderation.*` config, unused `GOOGLE_MODERATION_API_KEY`. KEEP the
  `ModerationDecision` interface (4 call sites unchanged: `username.service`, `polls.service` ×3).
- New impl: `moderation-prompt.md` + Gemini (Lite, MINIMAL thinking, reuse `LLMService`).
- Fail policy: soft-hold (pending) on outage, not auto-allow — pick the threshold.
- **Files:** `moderation.service.ts`, new `prompts/moderation-prompt.md`, `configuration.ts`, `.env`.
- **Dep:** P0.2 (model/thinking standard). **Accept:** food phrases ALLOW, threats/sexual/harassment
  BLOCK (the verified test set); old plumbing gone; outage → soft-hold.

---

## Phase 1 — Entity vocabulary + matcher foundation (sequence early)

### P1.1 — Collection-prompt holistic fix (ingredient/coconut bug) ✅ GOAL MET (without the structural rewrite)

**Resolved by the P1.3-era extraction work, NOT the proposed Step 3+4 merge.** The stated goal —
"stop ingredients landing in `food_attributes`" — is achieved: §3.2 now says peel only the
generic ingredient-free property and leave the ingredient with the dish tokens; §3.4 routes
ingredients + ingredient-bound phrases to composition; and the attribute adjudicator rejects any
residual ingredient that still leaks. **Evidence (27-run regen + targeted replay):** 0 ingredients
in `food_attributes` (no coconut/garlic/mayo/butter/sauce/broth…); `garlic`/`coconut` exist as
`food` entities and are referenced in dish `food_categories` (chicken in 81 dishes, coconut 2) —
correct composition.

**The structural "merge Steps 3+4" rewrite is DEFERRED as unjustified.** It was the _proposed fix_,
not an independent goal; the goal is met and the Step-3 peeling rule resolves the local circularity
without merging the staged contracts. A 685-line rewrite of working, validated staged contracts for
marginal gain is over-engineering — revisit only if composition evidence later shows a concrete
remaining problem.

---

### P1.1 — original scope (for reference)

**Goal:** stop ingredients (coconut milk, garlic) landing in `food_attributes`.

- Root cause = circular dependency: Step 3 classifies attributes before Step 4 composes the dish.
  Fix = **merge Steps 3+4** into one holistic step (dish + ingredients/categories + qualities together).
- **Files:** `collection-prompt.md`, `llm-response-schemas.ts` (COLLECTION schema if shape shifts).
- **Dep:** none. **Validate via DB replay:** use `replay.service.ts` + `buildChunkDataFromStoredInputs`
  to replay stored raw inputs through old vs new prompt; **Accept:** no regressions + coconut-class
  ingredients now land in `food_categories`/dish, not `food_attributes`.
- **Risk:** big prompt rewrite (685 lines, staged contracts) → replay gate is mandatory.

### P1.2 — Restaurant fusion fix (§6.6) ✅ DONE (commits 794dee71 + 4f7821df)

**Final shape (list-free — supersedes both the denylist AND the pairwise name gate):**

- **Brand-purity gate** on `mergeIntoCanonicalDomainEntityIfNeeded`: a domain is a chain key
  only when ALL same-domain restaurants (incoming included) form one brand cluster (all agree
  with the shortest brand-root name → branch suffixes don't break real chains). Generic hosts
  (facebook.com etc.) accumulate many brands → never merge, even on name coincidences. At N=1
  it degenerates to the pairwise name check → cold start works.
- **Second fusion path found + fixed:** `enrichSecondaryLocations` accepted any Google result
  with a matching domain as a "branch" (likely how Moe's Doughs absorbed 11 locations). Now a
  secondary location must also name-agree with the brand.
- **Deleted** `GENERIC_WEBSITE_DOMAIN_DENYLIST` + `isTrustedWebsiteDomain` +
  `resolveTrustedWebsiteDomain` — zero hand-maintained lists remain. Storing generic
  canonical domains is harmless (merge is the only reader) and feeds purity statistics.
- Verified 8/8 decision scenarios; tsc + eslint clean. Accepted residual: same-named unrelated
  pair on the same generic host at N=2 (indistinguishable from a 2-branch chain data-driven).
  **Deferred:** surgical un-merge of existing fused giants — dev data regenerable (gate prevents
  re-fusion); **production-only future task**. Name helpers fold into P1.4 shared-matcher core.

---

### P1.2 — Restaurant un-merge + name-agreement gate (§6.6) — original scope (for reference)

**Goal:** stop unrelated restaurants fusing via shared social domain; un-merge existing giants.

- Gate `mergeIntoCanonicalDomainEntityIfNeeded` on **name agreement** (real chains share domain AND
  name; false merges differ in name). Add social/link hosts to the denylist as belt-and-suspenders.
- One-time **un-merge cleanup**: split fused entities (e.g. "Moe's Doughs" = 11 unrelated locations)
  back into per-Place entities; design the split (by `google_place_id` + name clusters) carefully.
- **Files:** `restaurant-location-enrichment.service.ts` (merge fn ~L1852, `GENERIC_WEBSITE_DOMAIN_
DENYLIST` ~L104), a cleanup migration/script.
- **Dep:** P0.1. **Accept:** name-mismatched same-domain restaurants no longer merge; existing
  giants split; real chains (7-Eleven/Chipotle) still single-entity.
- **Risk:** data surgery (un-merge) — needs a reversible migration + spot-check.

### P1.3 — Attribute ontology + quarantine + queue worker (§6.6) 🔶 IN PROGRESS

**✅ Increment 1 — quarantine (commit 8174fe22):** `Entity.status` (active|pending, default
active, indexed (type,status)); collection creates new attributes `pending`; read surfaces gate
on `status='active'` (`EntityTextSearchService` + `connection_entity_names` view); resolution
still matches pending (dedup). DB-verified. Makes mid-cadence dirty reads structurally impossible.
**✅ Increment 2a — canonicalization brain, plan-only (commit 2c0b7250):** `attribute-ontology-prompt.md`
(principles-first, list-free, conservative) + `ATTRIBUTE_ONTOLOGY_RESPONSE_JSON_SCHEMA` +
`LLMService.adjudicateAttributes` ({existing,incoming}→{groups,rejected}, gemini-3-flash,
fail-closed parse) + `AttributeOntologyService.buildPlan(type, scope)` (chunked adjudication,
accumulates confirmed canonicals as context, resolves every echoed term back to a concrete entity
row → fully-resolved promote/merge/reject/unresolved plan, mutates nothing) + dry-run CLI
`scripts/canonicalize-attributes.ts`. **No separate ontology table** — the canonical vocabulary IS
the active attribute entities, synonyms in `aliases`. **Validated** (food_attribute, all 469):
0 unresolved, 121 sensible merges (huge/massive/enormous→giant), 188 sharp rejections.

**✅ Increment 2b — apply path + bulk (commit pending):** `applyPlan(plan, {apply})` — ONE
transaction: **promote** (status→active), **merge** (fold name+aliases onto canonical,
`array_replace`+dedupe the merged id→canonical id in `core_restaurant_items.food_attributes` /
`core_entities.restaurant_attributes`, delete merged), **reject** (`array_remove` + delete).
`assertPlanConsistent` backstop + plan-level `claimed` guard. Default mode runs every statement
then ROLLS BACK (verify); `--apply` persists. Also fixed the canonicalization contract (existing =
context/merge-targets only, never a member or rejection; output covers incoming only) — this
removed the chunked-'all' self-conflict.
**Bulk applied in place** (user-chosen; `/tmp/crave-attrs-backup-121436.sql` safety dump first):
food 469→**220** (154 merged, 95 rejected), restaurant 738→**126** (281 merged, 331 rejected) —
**1,207→346, 0 dangling refs**, 829 refs re-pointed + 3,990 stripped. Surviving vocab is clean
(outdoor seating+18 aliases, good for groups, allows dogs, fine dining, white-glove service).

**✅ Increment 2c — steady-state trigger + root-cause fixes (commit pending):**

- **Trigger (ON by default, NO config flag — user decision):** `unified-processing`
  `processSingleBatch` → `AttributeOntologyQueueService.queueAdjudication()` when new entities
  were created → Bull queue `attribute-ontology-adjudication`, time-bucketed jobId debounce
  (60s window; triggers during an active run land in the next bucket, never stranded) →
  `AttributeOntologyWorker` runs `buildPlan(type,'pending')` + `applyPlan({apply:true})`.
  Rationale for no flag: quarantine = a missed/failed run only delays visibility; placement is
  per-term, order-stable, fail-closed to `new`; reject only touches quarantined rows.
- **Extraction prompt root-cause fix:** collection-prompt §3.4–3.6 rewritten as one principled
  unit — attribute = filterable property (axis+value); praise/sentiment NEVER an attribute;
  ingredients→composition; price/value + accessibility→restaurant scope; meal-periods/serving
  contexts explicitly dual-scope by usage. (Old §3.4 was example lists; price was on neither
  list → `good value` leaked into food. Old §3.6 "capture descriptive language" invited junk.)
- **Placement prompt dual-scope carve-out:** meal-period terms never rejected for scope (the
  extraction design deliberately puts dish-tied ones in food; place-tied ones in restaurant).
- **Pass 3 naming:** new canonicals that absorbed synonyms get an LLM-chosen consumer-facing
  display label (Lite, one call per group) via `plan.renames` (old name → alias). Display-only:
  matching weighs name+aliases equally; autocomplete/tag chips render `name`.
- **Pass 4 — extraction sharpen (commit c0c552c0):** §3.4 reframed around _describes vs judges_
  (a real attribute states a property the food HAS; praise judges HOW GOOD — only descriptions
  qualify; discriminator "could it describe a BAD dish?"). Replay-verified the LLM extraction
  re-runs with this prompt (fingerprint-confirmed live): praise leakage 12+ terms → 1 straggler.

**✅ P1.3 COMPLETE — bulk applied + end-to-end verified in the live app.**

- **Bulk applied in place** (corrected prompts): food 469→185, restaurant 738→126→238;
  **1,207 → 423 clean canonicals**, 0 dangling refs, antonyms separated (casual|cozy|lively|
  quiet|upscale coexist), meal-periods kept on food side, naming applied (large anchors the
  size cluster). Safety dump at `/tmp/crave-attrs-backup-121436.sql`.
- **Steady-state loop verified END-TO-END in the running dev server** (not a CLI): replay →
  new extraction prompt coined pending → `unified-processing` trigger enqueued → the live
  server's Bull worker drained them (60s debounce) → adjudicated → 0 pending. Decisions correct:
  sentiment junk (best/delicious/high quality) rejected, different-word synonym `old school`
  merged into `traditional`, genuine novel attrs promoted. Quarantine held — junk never visible
  pre-adjudication. Ran twice (both prompts), both clean.

### P1.3 — Attribute ontology + quarantine + queue worker (§6.6) — original scope (for reference)

**Goal:** one AI-built canonical attribute ontology (restaurant + food); end fragmentation/junk.

- **Ontology table** (canonical + aliases), seeded from `GOOGLE_RESTAURANT_ATTRIBUTE_DEFINITIONS` (23).
- **Ontology prompt** (principles-first, conservative — "merge only interchangeable; keep qualifier-
  distinct; reject non-attributes") + JSON schema; `reason` debug-only.
- **Quarantine:** add `status` (pending/active) to attribute entities; runtime resolution attaches on
  ontology match, else creates `pending` (excluded from ALL reads). Route collection attributes
  (`resolveContextualAttributes`) through the ontology.
- **Worker:** event-driven off `unified-processing.resolveBatch`, debounced; low-freq backstop sweep.
- **One-time bulk** canonicalization of existing 738+469 attributes (human-reviewed — over-merge
  caveat from the 738/469 test runs).
- **Files:** schema (ontology table + attribute status), `entity-resolution.service.ts`, new prompt
  - schema, new Bull worker, a backfill script.
- **Dep:** P0.1, P0.2. **Accept:** "outdoor patio/seating/garden/space" → one canonical; "meat
  market" ≠ "seafood market" (conservative); junk rejected; pending attrs invisible until adjudicated.

### P1.4 — Shared matcher core (§6.5) 🔶 IN PROGRESS — reframed (no calibrated-confidence subsystem)

**Goal:** ONE excellent shared retrieval core — Google-level suggestions — consumed by autocomplete

- collection resolution + the gazetteer, so all three answer "which known entity is this string?"
  the same good way instead of three diverging paths.

**Reframed (decision 2026-06-13).** The original design centered on a calibrated-confidence / IDF /
selectivity subsystem to make "abstain" principled (don't link common-word entities like
`downtown`/`good`). **Dropped — P1.3 removed that problem at the source** (those were junk `*_attribute`
rows; they're no longer created). The residual case (a real entity named a common word) is rare and
**we will add NO abstain policy, no selectivity, no overlinking guard** — ship the matcher bare,
observe real behaviour, and optimize ONLY if data later shows it over-links. Don't pre-build a guard
for a problem we may not have. So P1.4 is now about **retrieval quality + convergence**, not scoring.

**Audited divergence (why they disagree today).**

- `EntityResolutionService` (collection): 3 tiers — exact (1.0) → alias (`aliases.hasSome`, 0.95) →
  fuzzy (`findBestFuzzyMatch`, **Sørensen–Dice** JS pkg + Levenshtein + restaurant-token heuristics,
  0.75). Its own crude matcher, separate from autocomplete's.
- `EntityTextSearchService` (autocomplete): the richer SQL stack — prefix ∪ FTS(`ts_rank_cd`) ∪
  trigram(`pg_trgm`, length-aware 0.7→0.35) ∪ phonetic(`dmetaphone`). **This is the keeper** — make it
  the shared retrieval core.

**The ideal we're chasing = this core + semantic recall.** Lexical lanes nail typos/short-forms
(restaurant proper nouns). Embeddings add the meaning lane that catches different-word synonyms
(`BEC`=`bacon egg and cheese`, `bao`=`pork bun`) — the dish/attribute gap. `EmbeddingService` exists
and is proven (P1.3). The open question is whether the quality gain justifies the latency (a per-query
embedding call) — so it starts as an **A/B experiment**, not a production wire-in.

**Increment sequence:**

- **4.1 (start here) — embedding-recall A/B harness.** Embed the entity corpus (in-memory kNN, no new
  infra), and for representative queries show lexical-only (current `EntityTextSearch`) vs
  lexical+embedding candidates side by side. Answers "do embeddings get us to Google-level, and where"
  before committing to a lane. Non-disruptive (experiment).
- **4.2 — converge collection resolution onto the shared retrieval:** replace its Sørensen–Dice fuzzy
  tier with `EntityTextSearch` candidate generation (keep exact/alias fast paths). Replay-gated: no
  resolution regression. This is the core "one matcher" win.
- **4.3 — containment / longest-match query mode** on `EntityTextSearchService` (the gazetteer needs
  it; FTS path ~90% there) → returns entity spans in free text. Link the best candidate, no abstain.
- **4.4 — fold P1.2 brand helpers** (`restaurantNamesAgree`/`normalizeBrandName`) into the shared core
  for restaurant chain-branch safety (a correctness gate, NOT selectivity); drop the private copies in
  `restaurant-location-enrichment`.
- **(later, only if observed)** — overlinking guard for common-word real-entity names, if data shows
  it; and the production path for embedding-query latency if 4.1 proves the lane worth shipping.

- **Files:** `entity-text-search.service.ts`, `entity-resolution.service.ts`,
  `restaurant-location-enrichment.service.ts`; new experiment script.
- **Dep:** P1.3 (clean vocab). **Accept:** autocomplete + resolution + gazetteer share one retrieval
  core; suggestions feel Google-level; gazetteer returns spans. **Risk:** cross-cutting (live
  collection + autocomplete) → replay + autocomplete regression mandatory.

---

## Suggested order & parallelism

- **Start:** P0.1 (gates schema work) ‖ P0.2 ‖ P1.1 (independent prompt fix, replay-gated).
- **Then:** P0.3 (after P0.2) ‖ P1.2 (after P0.1) ‖ P1.3 (after P0.1/P0.2).
- **Last in phase:** P1.4 (after P1.3 for clean vocab).
- Everything here is **poll-independent** and individually shippable — each lands a real bug fix.
