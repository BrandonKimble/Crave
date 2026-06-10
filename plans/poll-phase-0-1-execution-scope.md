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

### P1.1 — Collection-prompt holistic fix (ingredient/coconut bug)

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
**⬜ Increment 2 — adjudication worker (NEXT, the meaty part):**

1. Ontology prompt `.md` (principles-first, conservative — the validated v2) + `ONTOLOGY_
ADJUDICATION` JSON schema in `llm-response-schemas.ts` + `LLMService.adjudicateAttributes`
   (Lite, MINIMAL thinking). Input: pending attrs + existing active canonicals (context);
   output per pending: `{action: merge|promote|reject, canonicalName?, reason?}`.
2. `AttributeOntologyService.adjudicatePending(type, limit)`: fetch pending + active canonicals
   → LLM → apply: **promote** (status=active +aliases), **merge** (add as alias to target +
   `array_replace` the pending id → target id in `core_restaurant_items.{food_attributes,
categories}` and `core_entities.restaurant_attributes`, then delete pending), **reject**
   (delete — quarantined so no reads affected). ⚠️ the array_replace reference re-pointing is
   the data-surgery risk — write + dry-run carefully.
3. Trigger: event off unified-processing batch completion (debounced) + low-freq cron backstop.
4. **One-time bulk canonicalization** of the existing 738+469 active attrs (same logic, human-
   reviewed) — also validates increment 2 against real fragmentation (outdoor patio/seating/
   garden/space → one; reject junk).
   **NOTE (interim state):** until increment 2 lands, newly collection-created attributes stay
   pending (invisible). Fine in dev (no users; existing active attrs unaffected) — but increment 2
   is required to complete P1.3.

---

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

### P1.4 — Shared matcher core + calibrated confidence + containment mode (§6.5)

**Goal:** converge the two matchers; add principled abstain; enable the gazetteer.

- Make `EntityTextSearchService` the shared retrieval/candidate core; reduce `EntityResolutionService`
  to a thin decision layer (pick-best + create-new) on top.
- Add **calibrated confidence** (evidence tier + similarity + term selectivity/IDF + entity quality)
  so abstain is principled (kills common-word false links like "downtown"/"good" — mostly already
  removed by P1.3 at the source).
- Add **containment / longest-match** query mode to `EntityTextSearchService` (gazetteer needs it;
  its FTS path is ~90% there).
- **Files:** `entity-text-search.service.ts`, `entity-resolution.service.ts`.
- **Dep:** P1.3 (clean vocab improves calibration). **Accept:** resolution + autocomplete + gazetteer
  share one matcher; abstain works on common-word names; containment mode returns entity spans in text.
- **Risk:** the most foundational/cross-cutting — touches collection resolution + autocomplete; needs
  the test-pipeline + autocomplete regression checks.

---

## Suggested order & parallelism

- **Start:** P0.1 (gates schema work) ‖ P0.2 ‖ P1.1 (independent prompt fix, replay-gated).
- **Then:** P0.3 (after P0.2) ‖ P1.2 (after P0.1) ‖ P1.3 (after P0.1/P0.2).
- **Last in phase:** P1.4 (after P1.3 for clean vocab).
- Everything here is **poll-independent** and individually shippable — each lands a real bug fix.
