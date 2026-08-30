# The One Unknown-Search Intake — study, merge, and proof (2026-08-30)

Owner order: merge the Word Learner and the Phrase Splitter into one
unknown-search intake, now. This doc is the study (Q1–3), the stall census
with the timing answer, the design + pros/cons, and the before/after proof.
Code is uncommitted on `main`; flags stay DEFAULT OFF.

---

## Q1 — What each system did, end to end

### The Phrase Splitter (`unsegmented-residue.service.ts`, now retired into the intake)

- **Trigger**: every search's gazetteer Understand leaves *residue* — text no
  dictionary entry claimed. After the judged-vocabulary door
  (`demandTerm`, search-query-interpretation.service.ts ~line 770) approved
  it, residue of **3+ tokens** was staged into
  `collection_on_demand_unsegmented_residue` (one row per ask, capped 3 per
  request). Residue of **≤2 tokens skipped the splitter entirely** and wrote
  a direct untyped `on_demand_ask` signal from the hot path.
- **Drain**: a 10-minute cron (`@Cron('*/10 * * * *')`), unconditional,
  batch 100, one `interpretResidue` LLM call per DISTINCT text
  (residue-prompt.md: the ORDER/PREDICTION/STANDALONE tests; five output
  arrays).
- **Output**: every emitted piece became a **typed on-demand request** via
  `OnDemandRequestService.recordRequests` (per staged row, keeping
  user/engines/bounds/locale) — which also writes the paired
  `on_demand_ask` signal. Empty segmentation → row `discarded`; 3 failures
  → `failed`.
- **"Learn it" meant**: *record demand and go collect* — a paid Reddit
  keyword search per piece, eventually. It never asked whether we already
  hold the concept.

### The Word Learner (`demand-vocabulary.service.ts` + rail + script)

- **Reads**: the `on_demand_ask` signals ledger (distinct `subject_text`),
  joined through the k-anonymity floor `signal_emittable_terms` (≥3 distinct
  actors ever typed the term). Nightly rail 4:30AM,
  `DEMAND_VOCABULARY_SWEEP_ENABLED` default OFF; manual
  `scripts/run-demand-vocabulary.ts`; advisory lock `'demv'`.
- **Per term**: fold-known check in the term's own locale chain (app-side
  `canonicalFold` vs `entity_surface.form_folded`, recall roles only) → if
  unknown, dense retrieval (`retrieveCandidates`, 8 candidates, ask-locale
  lane open) → the Same-Thing Judge (`llm.matchEntity`) with each
  candidate's recall aliases in the ask's locale chain as evidence → on a
  confident match, `addSurfaces` banks the term as a `query_banking` alias,
  locale = `bankableLanguageTag(ask locale)` (language only, never region),
  under the P0-b collision guard. Fails closed everywhere.
- **"Learn it" meant**: *make the word vocabulary* — the next search that
  types it gets an instant lexical hit; the term stops looking like demand.

## Q2 — THE TIMING QUESTION (khachapuri and adjika)

Trace, with real cadences (pre-merge shape; §marks are stalls, censused below):

1. Search "khachapuri and adjika" → gazetteer claims nothing → residue.
   Judged-vocabulary door §S1: if ANY word is unheard, the term is **held,
   not recorded** — the word queues for the 4AM hearing and the ask is lost
   until the user searches again (interpretation ~line 781/`demandTerm`,
   judged-vocabulary.service.ts:398–407).
2. Recordable → staged; splitter cron ≤10 min → `khachapuri`, `adjika`
   typed on-demand requests + `on_demand_ask` signals.
3. Collection's unmet lane reads asks only when: the ask has **geo that
   attributes to an engine territory** (§S2 — geo-less asks are invisible:
   signal-demand-read.service.ts:975–982 joins `places`); the 15-min
   `signal_demand_daily` aggregate has rolled the day (§S3,
   signal-demand-aggregate.service.ts:115); and the term clears the
   **k-anonymity floor: ≥3 distinct actors** (§S4,
   `signal_emittable_terms`, migration 20260803222952). One curious user
   typing khachapuri once = a term collection may NEVER speak. This is the
   honest answer to "might they never get processed": **yes — a
   single-asker term stalls forever at the privacy floor, by design.**
4. Flags: `COLLECTION_SCHEDULER_ENABLED` must be on (§S5,
   collector-pacer.service.ts:101 — and prod currently runs
   `CRONS_ENABLED=false` in the iteration phase, §S6). Pacer ticks every 10
   min but the keyword lane is due on a **days-scale derived cadence**
   (§S7, source_collection_lanes.cadence_days); each dispatch is 25 terms
   with an unmet floor of 5 (keyword-slice-selection.service.ts:73–80), and
   unmet quality bar = 1 unit of demand mass (one asker's log2(1+1)=1 —
   just clears it). Unheard words hold the candidate a cycle (§S8,
   normalizeAndFilterCandidates:588–592).
5. Reddit search → extraction → entity minted → embeddings/aliases → next
   search works. Hours after dispatch.

**Honest end-to-end estimate**: with flags armed and ≥3 distinct askers,
roughly **1–4 days** (10-min split + 15-min aggregate + the keyword lane's
next due window + extraction); the splitter half is minutes, the collection
half is days. With fewer than 3 askers: **never** (until 2 more people ask).
With today's prod flags: **never** (nothing collects at all).
The old sweep-based Learner had the same ≥3-actor + nightly + flag-off
gates, so `gambas`→`shrimp` also waited days-to-never.

### Stall census (file:line)

| # | Stall | Where | Forever? |
|---|-------|-------|----------|
| S1 | Unheard-word HOLD drops the ask (recurs only if the user re-searches after the 4AM hearing) | search-query-interpretation.service.ts ~781; judged-vocabulary.service.ts:398 | Until re-ask |
| S2 | Geo-less ask never attributes to a territory → unmet lane blind | signal-demand-read.service.ts:975–982 | Forever for that ask |
| S3 | Aggregate refresh cadence | signal-demand-aggregate.service.ts:115 (`*/15`) | ≤15 min |
| S4 | K-anonymity floor: <3 distinct actors → term unspeakable to collection AND to the sweep | prisma/migrations/20260803222952…; demand-vocabulary.service.ts (emittable join) | **Forever** (by design) |
| S5 | `COLLECTION_SCHEDULER_ENABLED` off | collector-pacer.service.ts:101 | Forever while off |
| S6 | Prod `CRONS_ENABLED=false` (iteration phase) | process-role kill-switch | Forever while off |
| S7 | Keyword lane due-cadence (days) + 25-term dispatch, unmet floor 5 | collector-source-registry (cadence_days); keyword-slice-selection.service.ts:73–80 | Days; crowd-out possible but floor guarantees attention |
| S8 | Slice-level unheard-word hold (candidate returns next cycle judged) | keyword-slice-selection.service.ts:588–592 | One cycle |
| S9 | `DEMAND_VOCABULARY_SWEEP_ENABLED` off → the Learner never ran | demand-vocabulary-rail.service.ts:58 | Forever while off |
| S10 | 5-min per-target cooldown + 5-entity cap on queueing | on-demand-request.service.ts:375–380 | Minutes; cap is a blast-radius stance |
| S11 | Splitter retry: 3 failures → `failed` terminal | unknown-search-intake.service.ts (unchanged law) | Forever for that row (visible, countable) |

## Q3 — Overlap analysis (pre-merge)

- **Did a split phrase's pieces ever get the Learner's alias check?** No.
  The splitter recorded every piece as demand with no vocabulary lookup —
  it happily queued paid collection for `taco` out of "birria tacos" when
  taco has been an entity since day one. The Learner would only see the
  piece nightly (flag off = never), only after 3 distinct actors, and only
  as an `on_demand_ask` subject.
- **Did a single unknown word ever get split/normalized?** No. ≤2-token
  residue bypassed the splitter and the staging table entirely (the sweep's
  own header documents this as why it reads the ledger instead).
- **What each door did better**: the Splitter — typing (five entity groups),
  chain expansion, junk discard, per-ask attribution, retry discipline; the
  Learner — knowing what we already hold (fold law, locale chains), the
  identity judge with alias evidence, collision-guarded ledgered banking,
  bankable-locale law. The merge is exactly the union.

---

## The build — one intake

`unknown-search-intake.service.ts` (replaces `unsegmented-residue.service.ts`):

1. **Hot path** (search-query-interpretation.service.ts): EVERY recordable
   residue — one word or many — stages (one INSERT). The ≤2-token
   direct-signal branch is deleted; its signal now comes from the intake
   with an identical shape (geo, fused locale, `askSearchRequestId`,
   `source: 'gazetteer_residue'`), ≤10 min later. Zero per-search LLM,
   unchanged; the residue-join/cap laws untouched.
2. **Drain** (unchanged 10-min cadence, batch 100, dedupe by distinct
   text): segment if multi-word (the splitter's LLM + prompt, unchanged);
   a single word IS its own untyped piece (no LLM).
3. **Per piece**:
   - `matcher.isKnown` (free, always on): fold-known in the group's locale
     chain → NO-OP — never demand.
   - `matcher.match` (the Learner's move, extracted to
     `DemandVocabularyService.createMatcher()`): flag-gated
     `UNKNOWN_INTAKE_ALIAS_MATCH_ENABLED` (default OFF), ≤100 judge
     calls/pass (the sweep's own per-run prior). `learned` → alias banked
     (`query_banking`, collision-guarded, `bankableLanguageTag`), not
     demand. `refused`/`left_as_demand` → falls through to demand (a
     collision means the judge could not make it vocabulary — failing
     toward collection is the conservative old behavior).
   - Remaining typed pieces → `recordRequests` per staged row (unchanged);
     a remaining untyped single word → direct `on_demand_ask` per row.
4. **Privacy**: the judge call carries ONE asker's own piece + our
   candidate names — own-actor scoped, the same outbound shape as the
   segmentation call this drain always made. Cross-person reads (sweep,
   unmet lane) keep the `signal_emittable_terms` floor untouched.
5. **The nightly sweep stays** — repurposed as the RETRY lane: the intake
   judges a piece once at arrival; the sweep re-reads the whole ledger
   nightly so yesterday's left-as-demand can learn the day collection mints
   the concept. Same matcher, same lock, same script. (Flip-list rows
   updated for both flags.)
6. **Deleted**: `unsegmented-residue.service.ts`, its ingredient spec
   (tests carried into `unknown-search-intake.spec.ts`), the hot-path
   direct-signal branch, and the stale subject-text-emission classification
   entry for the interpretation file.

### What this changes for a user

Old: type "gambas" → we hold shrimp, but the app records demand, waits for
2 more strangers to type it, then maybe pays Reddit to search a word that
was never missing. New: within 10 minutes "gambas" becomes a Spanish alias
of shrimp; the next person who types it gets results instantly, and
collection money goes only to genuinely missing things (khinkali still
collects). A single asker is enough — the k-anon floor governs speaking
terms ACROSS people, not fixing our own dictionary from one person's own ask.

### Pros / cons and alternatives

- **Chosen shape** (stage everything; match at the drain): one door, one
  budget, zero hot-path cost, single-asker learning, known-piece no-ops.
  Cost: 2-token phrases now get a segmentation LLM call (they used to skip
  it) — deduped per distinct text and worth it (typed demand + chains);
  short asks' signals arrive ≤10 min later (no user-visible effect — the
  readers are 15-min/nightly/days-scale).
- **Rejected: judge in the hot path** — unboundable latency/cost (already
  tested and rejected in the Learner's header).
- **Rejected: keep two doors and just cron the Learner harder** — the
  splitter's pieces still never meet the vocabulary check, and single-asker
  terms still die at the emittable floor; the overlap gap is structural.
- **Rejected: intake replaces the sweep entirely** — arrival-time judging
  is once-per-piece; without the nightly re-read, a term that was
  unlearnable on day 1 (no candidates yet) never gets re-asked.

## Before/after proof (real data, dry run — nothing written)

41 real inputs (staging `collection_on_demand_requests` ask ledger +
local residue staging zone; fixture
`apps/api/scripts/fixtures/unknown-intake-sim-inputs.json`; runner
`apps/api/scripts/simulate-unknown-intake.ts`, dev key, matcher dryRun):

| Metric | Old shape | New intake |
|---|---|---|
| Demand records sent toward paid collection | **42** | **4** |
| Pieces resolved as already-known vocabulary (no-op) | 0 | **48** |
| Instant alias banks (would-learn) | 0 | **3** (tortas ahogadas→ahogada, ahogadas→ahogada, tacos pastor→al pastor tacos) |
| Collision-guard refusals | — | 0 |
| Junk discarded (unchanged) | 7 | 7 |

No regressions: every genuinely-novel term still routes to collection
(`pastel`, `griego`, `a la diabla`, `tiền mặt`), junk stays junk, and the
would-learn matches are correct same-thing pairs. ~90% of what the old
shape would have spent collection budget on was vocabulary we already held.

## Verification

- `unknown-search-intake.spec.ts`: 12 tests — five-group mapping (F-3),
  discard-on-empty, single-word untyped lane (no splitter LLM), known
  no-op, learned-not-demand mixed query, collision-refused → demand, flag
  default off spends nothing, 100-call budget cap, group-locale
  newest-decided, distinct-text dedupe, 3-attempt failure law. All green.
- Refactored sweep: `demand-vocabulary-term-locale.integration.spec.ts`
  (real DB) 4/4 green; rail spec, on-demand-ask-signal, residue-run
  contiguity, orchestration specs green (44 total targeted).
- `yarn invariants`: 43 invariants / 88 proofs green (after removing the
  now-stale subject-text classification row).
- Boot smoke: dist boots, `/health` healthy (scratch port 3999).
- `yarn build`: my files clean; the tree currently fails on a CONCURRENT
  session's uncommitted `restaurant-location-enrichment.service.ts`
  (severity `'error'` not in `OpsAlertSeverity`) — not this territory,
  left untouched.
