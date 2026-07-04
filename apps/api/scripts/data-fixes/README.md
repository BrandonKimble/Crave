# Step-3 / B7 data-integrity fixes

Reviewable, idempotent, transactional data surgery for the four corpus-integrity
defects the audit's own gate reports (Part **B7** of `plans/search-system-ideal.md`),
plus a runbook for the **separate** `food_attributes` re-projection.

> ⚠️ **DESTRUCTIVE.** `fix-integrity-defects.sql` deletes entities, edits alias
> arrays, and merges references. **Review the SQL and take a fresh database backup
> before running it.** Nothing in this directory should be run unattended.

The gate that these fixes drive to zero:

```
yarn workspace api ts-node scripts/search-harness/corpus-integrity.ts
```

Baseline it reports (audit → target after Step 3):

| Defect                                             | Count | Target |
| -------------------------------------------------- | ----- | ------ |
| exact same-name duplicate pairs within a type      | 7     | 0      |
| word-order duplicate foods (trigram sim ≈ 1.0)     | 4     | 0      |
| ambiguous aliases (1 alias → N same-type entities) | 18    | 0      |
| mistyped entities (dish typed `restaurant`)        | 2     | 0      |

---

## Files

| File                             | What it is                                                                                       | Mutates data?         |
| -------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------- |
| `identify-integrity-defects.sql` | Read-only. Lists the exact defect rows (ids + names) so the fix is reviewable against real data. | **No**                |
| `fix-integrity-defects.sql`      | Transactional, idempotent fix for all four defect classes.                                       | **Yes** (guard first) |
| `README.md`                      | This file.                                                                                       | No                    |

---

## 1. Review the defects (read-only, safe anytime)

```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d crave_search \
  -X -P pager=off -f apps/api/scripts/data-fixes/identify-integrity-defects.sql
```

Requires the `pg_trgm` extension (already installed per `prisma/schema.prisma`).
Read the output and confirm it matches the "Defect rows found" section below
before touching the fix.

---

## 2. Back up, then run the fix

### a. Back up

```bash
pg_dump "postgresql://postgres:postgres@localhost:5432/crave_search" \
  -Fc -f crave_search.pre-b7-fix.dump
```

### b. Dry run (recommended) — proves it, persists nothing

`fix-integrity-defects.sql` `BEGIN`s and `COMMIT`s itself and runs an in-transaction
verification that **raises and rolls back** if any defect count is still non-zero.
To dry-run, flip the final `COMMIT;` to `ROLLBACK;` (there's a commented `ROLLBACK;`
right under it) and watch the `NOTICE` tally lines:

```
[merge]   13 loser->winner pair(s) live this run   (7 restaurants + 4 foods + 2 mistyped)
[mistype] pre-clean removed restaurant-axis artifacts: entity_events=9, signals=2, restaurant_events=6, public_scores=2
[merge]   loser rows still present after delete (want 0): 0
[alias]   ambiguous alias strings stripped: 11
[verify]  dupPairs=0 wordOrderFoods=0 ambiguousAliases=0 mistyped=0   (all want 0)
```

Re-running a second time is a proven no-op (`[merge] 0 pair(s) live`, `[alias] … 0`).

### c. Run for real

```bash
PGPASSWORD=postgres psql -h localhost -U postgres -d crave_search \
  -X -v ON_ERROR_STOP=1 -P pager=off \
  -f apps/api/scripts/data-fixes/fix-integrity-defects.sql
```

Then confirm the gate reads clean:

```bash
yarn workspace api ts-node scripts/search-harness/corpus-integrity.ts
```

---

## How the fix decides things (read before approving)

### Winner selection for the 7 duplicate pairs — **oldest wins, but nothing is lost**

The FK footprint of every pair is **split**, so this needed care:

- the **oldest** row holds the dish graph — `core_restaurant_items` (Connections),
  `core_restaurant_entity_signals`, richer entity events, and (for 4 of 7) the
  public score;
- the **newer** row holds the single `region-us-ny-new-york` `market_presence`
  row — which is **load-bearing**: restaurant recall is market-scoped to NYC
  (`scripts/search-harness/_shared.ts`), so an entity with no `market_presence` is
  invisible in NYC recall.

So **winner = the oldest row** (keeps the hard-to-recreate dish graph), and the fix
**explicitly moves the loser's `market_presence` + aliases onto the winner** before
deleting it. A naïve cascade-delete of the newer row would have silently dropped NYC
visibility for all 7 restaurants — this fix does not.

### The 2 "mistyped" entities are actually duplicates

`Fried Dumpling` and `Skirt Steak` are typed `restaurant`, but each already has a
`food` twin, and the mistyped rows have **zero** food-axis references. A plain
type-flip would just mint a **new** same-name food duplicate (and a new ambiguous
alias). So the fix **merges each mistyped row into its existing food twin** (winner
= the food twin, which owns the dish graph), and drops the mistyped row's
restaurant-axis artifacts (its `core_restaurant_events` / restaurant-side entity
events + signals, its `restaurant`-subject public score, its location + NYC
`market_presence`) — a food can never be a `restaurant_id`. This resolves the
mistype **and** avoids creating a duplicate in one operation.

### Ambiguous aliases

After merging the 7 dup pairs (which auto-resolves 7 of the 18 ambiguous aliases,
because a merged loser's alias vanishes with it), **11** genuinely-shared aliases
remain — e.g. `"Cattleack"` carried by both `Cattleack` and `Cattleack Barbeque`.
An alias that points at multiple entities carries zero disambiguating value and
defeats alias-exact recall, so the fix **strips it from every carrier** (canonical
`name` is never touched). Computed dynamically, so it's self-healing and re-runnable.

### Every FK / entity-UUID reference the merge repoints (and why)

`core_entities` has both declared Prisma FKs **and** string/uuid[] columns that hold
entity UUIDs without a declared FK. All are repointed loser → winner:

| Table / column                                                                                                        | Kind                   | Why                                                                                         |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------- |
| `core_restaurant_items` `.food_id` / `.restaurant_id`                                                                 | FK                     | dish graph (unique `restaurant_id,food_id` → conflict-skip)                                 |
| `core_restaurant_item_mentions`                                                                                       | via Connection cascade | moves with its Connection                                                                   |
| `core_entity_market_presence` `.entity_id`                                                                            | FK                     | NYC recall visibility (UNION, PK conflict-skip)                                             |
| `core_restaurant_locations` `.restaurant_id`                                                                          | FK                     | physical locations                                                                          |
| `core_restaurant_events` `.restaurant_id`                                                                             | FK                     | evidence (unique key → conflict-skip)                                                       |
| `core_restaurant_entity_events` `.restaurant_id` **and** `.entity_id`                                                 | FK                     | evidence, both sides (composite unique → conflict-skip)                                     |
| `core_restaurant_entity_signals` `.restaurant_id` **and** `.entity_id`                                                | FK                     | signal graph, both sides (composite PK → merge `mention_count`)                             |
| `core_public_entity_scores` `.subject_id`                                                                             | **string, not FK**     | Crave-Score (PK `subject_type,subject_id` → conflict-skip)                                  |
| `poll_topics` `.target_dish_id`/`.target_restaurant_id`/`.target_food_attribute_id`/`.target_restaurant_attribute_id` | FK                     | poll targets                                                                                |
| `poll_topics` `.category_entity_ids` / `.seed_entity_ids`                                                             | uuid[]                 | poll seeds (array replace + dedup)                                                          |
| `poll_leaderboard_entries` `.subject_id` / `poll_endorsements` `.subject_id`                                          | **string, not FK**     | restaurant-axis leaderboard/endorsements (PK includes subject_id → conflict-skip)           |
| `search_event_entities` `.entity_id`                                                                                  | FK                     | search telemetry                                                                            |
| `user_search_demand_daily` `.entity_id` / `demand_scoring_candidates` `.entity_id`                                    | FK                     | demand rollups / scoring                                                                    |
| `user_restaurant_views` `.restaurant_id` / `user_food_views` `.food_id`                                               | FK                     | view telemetry                                                                              |
| `user_entity_view_events` `.entity_id` / `.context_restaurant_id`                                                     | FK                     | view telemetry                                                                              |
| `user_favorites` `.entity_id` / `user_favorite_events` `.entity_id`                                                   | FK                     | favorites (unique `user,entity` → conflict-skip)                                            |
| `favorite_list_items` `.restaurant_id`                                                                                | FK                     | list membership (unique `list,restaurant` → conflict-skip)                                  |
| `collection_on_demand_requests` `.entity_id` / `collection_on_demand_ask_events` `.entity_id`                         | FK                     | on-demand lane                                                                              |
| `core_entities.restaurant_attributes` / `core_restaurant_items.categories`,`.food_attributes`                         | uuid[]                 | attribute refs (array replace + dedup)                                                      |
| `core_entities.primary_location_id`                                                                                   | —                      | **not touched**: winner keeps its own primary location; the loser's dies with the loser row |

Idempotency: every repoint targets only rows still pointing at a loser; loser
deletes are existence-guarded; composite-key repoints conflict-skip then drop the
now-duplicate loser row; alias/array edits use remove/replace (a no-op on a 2nd
run); the loser-merge map is empty on re-run (losers already gone).

---

## Defect rows found (verified against live `crave_search`, 2026-07-02)

Nothing below was mutated — these are read-only captures. The fix was validated by a
`ROLLBACK`-forced dry run + a double-pass idempotency run; the DB is byte-for-byte
identical to before (3654 entities, 1786 market presences, 1178 connections).

**1. Exact same-name duplicate pairs (7):** `[restaurant]` Alinea
(`73ca26fb…` winner / `a58b0b90…` loser), Millburn Deli (`b20c6031…`/`3dd83dd4…`),
Mitsitam Native Foods Cafe (`ec88b414…`/`53ad87ca…`), Owamni
(`5bf49a25…`/`d261e24f…`), Pradyumna Cafe (`5c699397…`/`d642848f…`), Tops Diner
(`a6cda643…`/`1a3b3692…`), Town Hall Deli (`c08353e6…`/`3c191737…`). In every case
the winner (oldest) holds the dish graph and the loser holds the NYC market presence.

**2. Word-order duplicate foods (4), trigram sim = 1.0000:**
`chinese american food` (`b74fb170…` winner) ≈ `american chinese food` (`f4907cac…`);
`crumb cake rainbow cookie` (`4d4e145f…`) ≈ `rainbow cookie crumb cake` (`eb7ce189…`);
`espresso lemonade` (`60c50ff9…`) ≈ `lemonade espresso` (`bc071848…`);
`spicy italian` (`4b30fc9d…`) ≈ `italian spicy` (`f2be1d5b…`).

**3. Ambiguous aliases (18):** 7 are the duplicate-pair names above (auto-resolved by
the merge). The other 11 are genuinely-shared aliases stripped from all carriers:
`cattleack`, `eppes essen`, `fleetwood bakery`, `gulluoglu baklava and cafe`,
`hobbys delicatessen and restaurant`, `hoodoo browns`, `le train bleu paris`,
`pik-nik`, `townline`, `uncle bacalas`, `wahpehpahs kitchen`.

**4. Mistyped entities (2):** `Fried Dumpling` (`1cf59f5c…`, typed `restaurant`) →
merge into food twin `8aba3959…`; `Skirt Steak` (`cca0b037…`, typed `restaurant`) →
merge into food twin `3b5d008f…`. Each mistyped row had 0 food-axis refs and only
restaurant-axis artifacts (dropped by the fix).

---

## SEPARATE fix — `food_attributes` re-projection (dish tags)

**This is NOT part of `fix-integrity-defects.sql`.** It is a code/pipeline run, not
SQL surgery. It is documented here per the plan (Step 3: "fresh extraction run to
unstrand `food_attributes`"). **Do not run it as part of this session** — this is a
runbook.

### The problem (verified against live DB, 2026-07-02)

- **461** `food_attribute` evidence events exist in `core_restaurant_entity_events`
  (`evidence_type = 'food_attribute'`).
- **All 461 are stranded on INACTIVE extraction runs**: `0` are on the active run.
  The 233 source documents that carry these events all have their
  `active_extraction_run_id` pointing at an **older run** (predating food-attribute
  extraction) that carries no FA events.
- Result: **0 of 1178** Connections (`core_restaurant_items.food_attributes`) have a
  dish tag.

**Why the projection writes 0** — `ProjectionRebuildService` reads entity events but
**filters to the document's active run only**
(`apps/api/src/modules/content-processing/reddit-collector/projection-rebuild.service.ts`,
lines ~203-205: `row.sourceDocument.activeExtractionRunId === row.extractionRunId`).
Events on inactive runs are silently dropped. So running the projection **alone will
not help** — the events must first become part of the documents' **active** run.

The stranded documents are all `platform=reddit`, `community=foodnyc`, with
`source_created_at` spanning **2026-05-18 → 2026-06-01**.

### The fix: promote a fresh active extraction run, then the projection auto-runs

Use the replay CLI
(`apps/api/scripts/replay-extraction-run.ts` → `ReplayService`,
`apps/api/src/modules/content-processing/reddit-collector/replay.service.ts`). The
`--activate` flag makes the new run authoritative for its documents **and** the
service then calls `ProjectionRebuildService.rebuildForRestaurants(...)` itself
(`replay.service.ts` ~line 477), so the dish tags get written in the same run — no
separate projection step needed.

Recommended (date-range replay over exactly the stranded `foodnyc` documents):

```bash
# JDK not needed; this is a Node/ts-node script.
yarn workspace api ts-node scripts/replay-extraction-run.ts \
  --platform reddit --community foodnyc \
  --start 2026-05-18 --end 2026-06-01 \
  --pipeline chronological \
  --activate
```

The command prints a summary (`documentCount`, `restaurantCount`, `connectionCount`).
Because `--activate` re-projects internally, you should **not** need a manual
projection pass. If you activated runs by some path that did **not** re-project, run
the full projection over every restaurant:

```bash
yarn workspace api crave-score:backfill-mentions   # scripts/backfill-item-mention-records.ts
```

### Verify

```bash
# dish-tag coverage should climb from 0 toward ~461 events spread across connections
PGPASSWORD=postgres psql -h localhost -U postgres -d crave_search -X -c "
  SELECT count(*) FILTER (WHERE array_length(food_attributes,1) > 0) AS tagged,
         count(*) AS total
  FROM core_restaurant_items;"

# and the food_attribute events should now be on the active run
PGPASSWORD=postgres psql -h localhost -U postgres -d crave_search -X -c "
  SELECT count(*) FILTER (WHERE sd.active_extraction_run_id = e.extraction_run_id) AS on_active,
         count(*) AS total
  FROM core_restaurant_entity_events e
  JOIN collection_source_documents sd ON sd.document_id = e.source_document_id
  WHERE e.evidence_type = 'food_attribute';"
```

**Caveat:** a fresh replay re-runs the extraction model, so exact tag counts depend on
the model's output for those documents; the guarantee is that the FA evidence stops
being stranded, not a fixed 461→N mapping. If you want to activate the **existing**
FA-bearing runs without re-extracting, use
`ReplayService.activateExtractionRunForDocuments({ extractionRunId, documentIds })`
per run (it activates + re-projects for that document subset) — but there are 27 such
runs, so the single date-range replay above is the cleaner path.
