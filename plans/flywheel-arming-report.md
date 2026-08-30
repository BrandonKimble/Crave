# Flywheel arming — the two manual-only learners get standing rails (2026-08-30)

Owner-ordered arming of the flywheel's manual-only learners
(docs/llm-systems-map.md flags; plans/dormant-systems-audit.md items 1–2).
Both rails ship DEFAULT OFF; plans/launch-flip-list.md (created with this
work) is the single list that arms them at launch.

## 1. Demand-vocabulary learner — now on a rail

**What shipped**
- `apps/api/src/modules/search/demand-vocabulary-rail.service.ts` — new thin
  rail: `@Cron('30 4 * * *')`, gated `isSchedulerRuntime()` (CRONS_ENABLED +
  PROCESS_ROLE) AND `DEMAND_VOCABULARY_SWEEP_ENABLED` (default OFF). Calls
  the untouched sweep; failures land in `logger.error` and never escape into
  the scheduler. Registered in `search.module.ts`.
- The sweep itself (`demand-vocabulary.service.ts`) is unchanged except ONE
  fix found during wiring — see the collision below.

**Rail choice, justified (the brief's vocabulary-vs-knowledge question)**
The audit's cadence recommendation — the vocabulary family, next to the 4AM
word-hearing drain — stands. But registering the sweep ON the
vocabulary-maintenance rail's own service is a module cycle: that rail lives
in `entity-resolver`, and `search` (the sweep's home — it reads the signals
ask ledger and drives EntityTextSearchService) already imports
`entity-resolver`. Dependency order therefore puts the CODE in the search
module and the CADENCE in the vocabulary family: 4:30AM, offset from the 4AM
drain. The knowledge-maintenance rail (6AM, entity-display) was the wrong
family anyway — it is watermark-driven concept passes; this is a demand-ledger
sweep with its own idempotency story (learned terms leave the docket by
becoming known; `addSurfaces` writes are idempotent; the spend is what the
advisory lock protects).

**The advisory-lock collision (real defect, fixed)**
`DEMAND_VOCABULARY_ADVISORY_LOCK_KEY` was `0x766f6362` ('vocb') — BYTE-IDENTICAL
to `VOCABULARY_MAINTENANCE_LOCK_KEY` in vocabulary-maintenance.service.ts.
Two different nightly jobs on one pg advisory key: whichever runs second
silently skips while the other is mid-flight — and they were about to share a
4AM-ish window. The sweep's key is now `0x64656d76` ('demv'); a spec pins the
distinctness. The lock semantics themselves are respected: the rail adds no
lock of its own — the sweep's dedicated-session lock (F8/R1) is the
cross-process single-runner, exactly as before.

**Stale-type-literal check (the 2026-08-19 'food' cast class)**
Verified by eye AND mechanism: the sweep's candidate types are real enum
members (`EntityType.item/ingredient/item_attribute/place_attribute` — all
present in schema.prisma's enum), no `as EntityType[]` casts remain, and the
repo invariant `check-entity-type-literals.ts` scans this file. The R14 class
cannot recur here silently.

**Budget/watermark**: per-run cap 100 distinct terms ⇒ ≤~100 identity-judge
calls/night worst case, $0 on a quiet ledger; no watermark by design (the
whole ledger is re-read nightly because yesterday's `leftAsDemand` becomes
learnable when collection mints the concept). Spend lands under lane
`entity_match` (audit-noted, accepted).

## 2. Restaurant-name court feeder — the census, built from scratch

**What shipped**
- `apps/api/src/modules/content-processing/entity-resolver/restaurant-name-census.service.ts`
  — the generic-word census the service header always referenced and no
  session ever committed. Registered + exported in entity-resolver.module.
- Rail: **step 3 of the knowledge-maintenance rail** (6AM, entity-display) —
  per the audit's recommendation, and it fits: watermark-driven (the court's
  verdict ledger IS the watermark), covered by the rail's cross-process
  advisory lock, isolated try/catch like the satisfies step. Own flag
  `RESTAURANT_NAME_CENSUS_ENABLED` (default OFF) under the rail's flag; the
  coupling (both must flip) is documented in the rail header and flip-list.
- Manual driver: `apps/api/scripts/run-restaurant-name-census.ts`
  (`--docket-only` = SQL census, NO LLM; default dry-run; `--apply`).

**Feeder design derivation (audit: "a census, word-role/genericness verdicts
as signals, never a stop-list")**
- POPULATION = every single-token active recall form on an active place
  entity (`form_folded` with no whitespace, role <> 'display'). That is the
  exposure class: one word grounds a hard AND with no second token to rescue
  the query. Nothing is excluded by word shape — the court decides names.
- SIGNALS order the docket, riskiest first:
  1. ungrounded before grounded (junk mints live ungrounded; a grounded name
     already survived a Places match — but grounded rows stay in the
     population, e.g. a wrong extra surface on a real place);
  2. `word_elsewhere` — the same folded form active as recall on a NON-place
     entity: the corpus's own vocabulary proving the word lives in queries
     (`bacon`, `bbq`, `gumbo`, `halal`) — verdicts-as-signals made concrete;
  3. bare numerics (`7`, `512`).
- UNHEARD-BEFORE-CAP: already-decided claims (rule+fold in force, via
  `decidedKeys`) are subtracted BEFORE the docket cap (400/run), so settled
  upholds can never crowd unheard rows out of a night. `hear()` re-checks the
  same predicate at its own chokepoint.
- SPEND: cap 400 ≈ 50 LLM calls at 8 claims/call, well under the court's
  2,000/24h rolling allowance; a `DrainExceedsStandingCapError` is CAUGHT and
  reported (`refusedByBudget`) — the remainder is tomorrow's docket. Apply
  runs `resumePendingEffects()` first (verdict-then-effect crash law).

**Dry-run docket against staging (SELECT-only psql, same SQL)**
- Population: **3,816** single-word place recall surfaces; **397 ungrounded**
  (the audit's 399, two churned since); 17 ungrounded+word-elsewhere; 16
  numeric-only; ~82 entities already carry restaurant_name verdicts (the
  2026-08-16 manual run).
- Docket head, exactly the predicted class and order: `bacon`, `bbq`,
  `caramelo`, `esme's`, `graeters`, `greens`, `gumbo`, `halal`, `joes`, `la`,
  `lemongrass`, `margs`, `otto`, `papas`, `pub`, `sprinkles`, `tiki`, then
  numerics `1417`, `512`, `7`, then the proper-name tail (`alonzos`,
  `angelos`, …). No LLM consulted, no writes.

**Dependency noted, out of scope**: an upheld name on an ungroundable ghost
("Best") dies only at the enrichment lifecycle — the janitor
(`LOCATION_LIFECYCLE_CRON_ENABLED`) is a launch flip-list row PAIRED with the
census row. Court+census without the janitor closes the wrong-name hole, not
the ghost-entity hole (SD-3, audit item 1/3).

## Flags added to the flip-list
`DEMAND_VOCABULARY_SWEEP_ENABLED`, `RESTAURANT_NAME_CENSUS_ENABLED` — plus
the full harvest of every deliberately-off flag (16 rows + defaults-on
notes) in plans/launch-flip-list.md.

## Verification
- `yarn build` green.
- Targeted specs green (18 tests): `demand-vocabulary-rail.spec.ts`
  (default-off, armed, CRONS kill-switch wins, failure containment, lock-key
  distinctness), `restaurant-name-census.spec.ts` (risk ordering,
  unheard-before-cap crowd-out proof, cap, claims handoff + dryRun
  passthrough, resume-first on apply, budget-refusal containment, empty
  docket consults no court), `knowledge-maintenance-rail.spec.ts` (existing
  contract + census step default-off / armed / isolated).
- `yarn invariants` GREEN: 43 invariants, 88 proofs, "Every invariant
  rejected the defect it was bought with", exit 0. (An earlier attempt
  reported `spend.every-gemini-generation-caller-is-profiled` failing on the
  "clean" tree — that was lock/tree contention with the fix agent actively
  editing the LLM files that check guards; the queued re-run on the settled
  tree passed everything. No new LLM caller was added by this work — the
  census speaks through the existing `aliases.place_name_judge`.)
