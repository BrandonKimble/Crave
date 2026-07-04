# Search validation harnesses — Step 1 / Deliverable 0

Replay harnesses for the Crave search master plan
([`plans/search-system-ideal.md`](../../../../plans/search-system-ideal.md), Part C
"Deliverable 0", Migration Step 1). Each later REPLACE step ships only with a green
run of its named harness attached — **the harness is the merge gate, not
documentation.**

These scripts are **new and self-contained**. They do **not** edit any hot search
file (`entity-text-search.service.ts`, `autocomplete.service.ts`,
`search-query-interpretation.service.ts`, …). They:

- read the **live dev DB READ-ONLY** (creds in `apps/api/.env`, DB `crave_search`
  on localhost),
- bootstrap the **real Nest AppModule** (`NestFactory.createApplicationContext`,
  `PROCESS_ROLE='api'`) exactly like the deleted `scripts/entity-search-ab.ts`, so
  every recall/link call runs the **actual production code path**
  (`EntityTextSearchService.retrieveCandidates`, dense OFF — same as the query-time
  linker), and
- enumerate the corpus from a **frozen, versioned fixture** so the query set is
  stable and the gate can't rot.

## Scripts

Run each from the repo root:

```bash
yarn workspace api ts-node scripts/search-harness/<name>.ts
```

### 1. `frozen-fixture.ts`

Dumps all active `core_entities` (id, type, name, aliases) + market presence to a
versioned JSON file (`frozen-fixture.v1.json`, git-ignorable). **Regenerate only on
demand** — the replay harnesses read this file so their corpus can't shift
mid-sweep.

```bash
yarn workspace api ts-node scripts/search-harness/frozen-fixture.ts
```

### 2. `typo-replay.ts`

Over the fixture's entity names, generates synthetic typos per **length bucket**
(≤2 / 3-5 / 6-8 / 9+ chars) — single-char substitution / deletion / transposition /
insertion, plus a prefix-truncation case — and runs each through the **actual recall
SQL** (`retrieveCandidates`, dense OFF). Reports per bucket:

- **recall@10** — was the true entity in the top-10 shortlist?
- **avgJunk** — non-true candidates admitted per query.
- **junk-link rate on no-true-entity queries** — feeds random gibberish through the
  current **0.82** linker rule and counts how often it still (wrongly) links.

Documents the current `0.7/0.55/0.45/0.35` length ladder + 0.82 linker — the
baseline the edit-distance rework (Step 6) must beat.

```bash
SAMPLE_PER_BUCKET=60 GIBBERISH_COUNT=120 yarn workspace api ts-node scripts/search-harness/typo-replay.ts
```

Env: `SAMPLE_PER_BUCKET` (default 60), `GIBBERISH_COUNT` (120), `SEED` (1337),
`MARKET_KEY`.

### 3. `variant-link-replay.ts`

Builds two pair sets from the corpus and runs each through the linker's exact
decision logic — **replicated from `linkViaHybridRecall`, reading the real
`retrieveCandidates` shortlist, without modifying the service**:

- **(a) alias → canonical** (non-name-copy aliases): variant-link recall — do
  aliases link to the correct entity?
- **(b) containment** ("Joe's" ⊂ "Joe's Pizza", restaurants): wrong-link error count
  — does the short name link to the wrong (longer) entity?

Baseline for the planned `0.82 → margin` change (B6).

```bash
yarn workspace api ts-node scripts/search-harness/variant-link-replay.ts
```

Env: `MAX_ALIAS` (0 = all), `CONTAINMENT_TYPES` (default `restaurant`), `MARKET_KEY`.

### 4. `corpus-integrity.ts`

Pure read-only SQL audit (no recall, no fixture). Prints the counts the plan's Part
B7 audit reported — these are the gate Step 3 must drive to zero:

- exact same-name duplicate pairs within a type (audit **7**),
- word-order duplicate foods at trigram sim ~1.0 (audit **4**),
- ambiguous aliases — one alias → multiple entities (audit **18**),
- entities with a mistyped type — dish name typed `restaurant` (audit **2**),
- apostrophe-variant alias coverage (audit **~44%**).

```bash
yarn workspace api ts-node scripts/search-harness/corpus-integrity.ts
yarn workspace api ts-node scripts/search-harness/corpus-integrity.ts --json   # CI line
```

## Baseline (measured against the live dev DB, 2026-07-02, fixture v1, 3654 entities)

**corpus-integrity** — every audit number reproduced exactly:

| Defect                                               | Measured        | Audit |
| ---------------------------------------------------- | --------------- | ----- |
| Exact same-name duplicate pairs                      | 7               | 7     |
| Word-order duplicate foods (sim 1.0)                 | 4               | 4     |
| Ambiguous aliases (same type)                        | 18              | 18    |
| Mistyped-type entities (Fried Dumpling, Skirt Steak) | 2               | 2     |
| Apostrophe-variant coverage                          | 45.4% (104/229) | ~44%  |
| Alias name-copy rate                                 | 75.7%           | ~76%  |

**typo-replay** (SAMPLE=40/bucket) — the length ladder rejects most realistic typos;
recall collapses on short words (the plan's core finding):

| Bucket    | recall@10 |
| --------- | --------- |
| ≤2 chars  | 3.2%      |
| 3-5 chars | 26.9%     |
| 6-8 chars | 61.5%     |
| 9+ chars  | 82.4%     |

Gibberish junk-link rate through the 0.82 rule = **0%** — the other half of the
argument: 0.82 is so strict it rejects real variants too.

**variant-link-replay** — alias recall **99.0%** (1160/1172), 12 "wrong-entity"
links that are actually the ambiguous-alias/duplicate **data defects** surfacing
(B7 coupling); containment **96.8%** correct (30/31), 1 wrong-link ("Le Train Bleu"
→ "Le Train Bleu Paris" @0.94) — the same-brand risk the margin change targets.

## Notes

- **Read-only.** No harness writes to the DB or edits any service.
- **tsc-clean.** `node_modules/.bin/tsc --noEmit` from `apps/api` stays exit 0;
  `scripts/**/*` is already in `tsconfig.json`'s include.
- **Dependency-light.** Only `ts-node` + what the AppModule already pulls in; no new
  deps.
- **Market scoping.** The dev corpus is ~99% NYC (`region-us-ny-new-york`), the
  default `MARKET_KEY`. Foods/attributes are never market-filtered; only restaurant
  recall is scoped.
- **Determinism.** Typo generation uses a seeded PRNG (`SEED`), so runs are
  reproducible.
