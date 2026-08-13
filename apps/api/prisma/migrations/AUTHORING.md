# Writing a migration in this repo — the gotchas that already bit us

Recorded 2026-08-03 from the api-migrations audit (F303, F304, F305). Every
item here is a fact PROVEN against a full replay of the corpus onto an empty
database, not a style preference. Applied migrations are history and are never
edited — so these are rules for the NEXT migration, and diagnoses for the
existing ones that broke them.

---

## 1. A heavy migration MUST disable parallel workers (F303)

Prod Postgres has a small `/dev/shm`. Any migration that rewrites a whole table
— an `ALTER COLUMN ... TYPE` (which rewrites the table AND rebuilds every index
on it), a corpus-wide `UPDATE`, a big index build, an event-table-wide join —
dies there with `could not resize shared memory segment`, and because migrations
run in the container's boot command, a P3009 crash-loop takes the deploy with it.

Put this at the TOP of any such migration:

```sql
SET max_parallel_workers_per_gather = 0;
SET max_parallel_maintenance_workers = 0;
```

Five migrations do this correctly (`20260801230000_attribute_identity_unique`,
`20260801240000_edge_hygiene`, `20260802010000_unicode_fold`,
`20260802030000_empty_fold_guard`, `20260802050000_identity_key_app_written`).

**ENFORCED SINCE F2163** by `scripts/check-migration-parallel-guard.mjs` (CI).
A NEW migration containing an unambiguously heavy statement — `ALTER COLUMN ...
TYPE`/`SET DATA TYPE`, or an `UPDATE` with no `WHERE` — fails CI unless it
carries both `SET` lines. Applied migrations are immutable (Prisma has recorded
their checksums), so the pre-existing offenders are grandfathered by name in a
FROZEN list; adding a new name to that list does not make a migration safe, it
makes the next deploy crash-loop.

**`ADD COLUMN ... DEFAULT <const>` IS NOT A REWRITE** (measured 2026-08-09). Since
PG 11 a non-volatile default is stored as an attribute default and existing rows
are never touched: re-measured here on a full copy of `entity_surface` (62,799
rows), `ADD COLUMN ... DEFAULT now()` plus a second defaulted column took
**8.6 ms** — the shape `20260809100000_entity_surface_merge` uses. That
migration's own header says the `DEFAULT now()` "is a table rewrite" and gives it
as the REASON for the parallel-worker `SET`s. The reason is wrong; the `SET`s are
still right, because the same migration builds three indexes and runs a
corpus-wide `UPDATE` over the merged table. Applied migrations are history and are
never edited, so the correction lives here — do not copy that header's reasoning
into a new migration, and do not conclude from it that a plain `ADD COLUMN
DEFAULT` needs the guard. (A `DEFAULT` that is VOLATILE — `random()`, a function
call per row — or an `ADD COLUMN` with a `USING`/type change, still rewrites.)

`CREATE INDEX` and narrowed `UPDATE`s are deliberately NOT flagged: whether they
are heavy depends on the target table's size, which no static scan can know, and
a gate firing on ~16 false positives would be allowlisted into uselessness
within a week.

**SIX in the corpus do NOT, and cannot be fixed** (applied history). This
section said TWO until F2163; the gate found four more, one of which
(`20260621184323_poll_subject_id_text`) had also escaped a hand-scan because it
spells the rewrite `SET DATA TYPE` rather than `TYPE`:

- `20260802060000_timestamptz_everywhere` — 189 lines, 162 columns converted
  from `timestamp` to `timestamptz` across most tables. The heaviest rewrite in
  the corpus, and it carries the guard ZERO times. It is timestamped LATER than
  all five siblings that do, so this was an oversight, not a predecessor.
- `20260802170000_in_scoring_territory` — a corpus-wide `UPDATE` over
  `core_restaurant_locations`.

Both have already applied on the live databases, so this is not a live
emergency. The hazard is PROSPECTIVE: a fresh prod-shaped restore, a new
staging, or a replay against a large corpus on the small-`/dev/shm` container
will run these unguarded. If a restore/replay dies with a shared-memory error,
these two are the first suspects — and the fix is to `SET` those two GUCs in the
psql session before running `prisma migrate deploy`, not to edit the files.

## 2. `prisma migrate dev` will try to DROP things the schema cannot model (F304)

`prisma migrate diff --from-migrations --to-schema-datamodel` exits 2 with a
real delta, permanently. Most of that delta is CORRECT and must never be
"fixed" in `schema.prisma`. **Before accepting any auto-generated migration,
read it and delete any drop of the following.**

**Class 1 — Prisma-unmodelable, deliberate, never fix:**

- the HNSW vector index on `core_entities.name_embedding`;
- three partial/expression indexes on `core_entities` —
  `(type, status, enrichment_failure_count)`, `(type, identity_key)`,
  `(type, identity_key_sorted)`;
- ~~the `places` PARTIAL unique on `provider_place_id`~~ — RETIRED. This was
  `uq_places_fallback_identity`; the fallback lane it guarded was cut
  ("TomTom or nothing", owner ruling 2026-08-01) and migration
  `20260801120000_drop_fallback_identity_index` dropped the index. The
  composite unique `places_provider_place_id_level_key`
  (`@@unique([providerPlaceId, providerLevelCode])`) already covers identity
  and is fully Prisma-modeled, so no Class 1 entry remains for `places`'
  provider identity — do not re-add this bullet;
- the `curated_lists` NULLS-NOT-DISTINCT unique;
- `idx_claim_verdicts_unexecuted` on `claim_verdicts` — the PARTIAL index
  (`WHERE executed_at IS NULL`) that IS the resume queue for
  decided-but-unexecuted verdicts. Prisma cannot express the predicate, so it
  reports the index as removed; dropping it turns the crash-resume scan into a
  full-table read of every verdict ever reached;
- the `claim_verdicts_reason_stated` CHECK — the write-layer law that a verdict
  states its ground (H5 amendment (d)). Prisma models no CHECK constraints, so
  every drift-diff will offer to drop it, and dropping it silently permits the
  unauditable verdict the constraint exists to refuse;
- `place_geometries.geometry` — a PostGIS type, plus its GiST index. Prisma has
  no geometry type, so it reports the COLUMN ITSELF as removed;
- the `signals` primary key, which must be `(signal_id, occurred_at)` because
  Postgres requires the partition key in every unique constraint on a
  partitioned table.

**Class 2 — cosmetic:** index-name differences (raw-SQL names vs Prisma's
derived names) on `signal_demand_daily`, `signals`, `probed_regions`,
`spend_campaigns`, `vendor_lookup_misses`, `poll_creation_attempts`. Correct
as-is; renaming them buys nothing and costs an index rebuild.

**Class 3 — real drift** gets a forward migration. The two that existed (F301
orphaned enums, F302 `photo_events.event_type`) are fixed.

This is not theoretical: `20260705003434_recreate_entity_name_embedding_hnsw`
exists precisely because a `migrate dev` drift-diff silently dropped the HNSW
index inside an UNRELATED poll migration (`20260618201804`), and it had to be
recreated. That file's in-file warning is correct and generalizes to every item
in class 1.

## 3. The signals partitions run out, and a global flag can stop them (F305)

`signals` is RANGE-partitioned by month.
`20260720110000_signals_monthly_partitions` created partitions only through
`signals_p2026_10` (bounds stop at 2026-11-01), plus `signals_p_pre` for
MINVALUE→2026-06-01. Everything after that is minted at runtime by
`SignalPartitionMaintenanceService`'s `@Cron('10 3 * * *')`, which keeps
`[current .. current+2]` present.

An insert into a month with no partition FAILS, and the §3 law makes the signal
writer SWALLOW write failures — so the failure mode is **silently dropped
signals**, not an error anyone sees. Two couplings the migration cannot express:

- `CRONS_ENABLED=false` (`src/shared/utils/process-role.ts`) disables
  `ScheduleModule` entirely — it takes partition maintenance with it. A flag set
  for cost or lane reasons silently disarms ledger write availability.
- A database created FRESH after 2026-11-01 (new staging, a restore, a replay)
  has NO partition for "now" until the first 03:10 pass fires.

If you create a fresh database or turn crons off, run the maintenance pass
explicitly. (F205 is closed: the maintenance cron now emits a critical
`ops_alert` on failure AND asserts the lead-partition invariant independently
of the pass succeeding — see `SignalPartitionMaintenanceService`.)

## 4. Same-timestamp directory prefixes are resolved alphabetically (F306)

Eight groups in the corpus share a timestamp prefix. Prisma sorts by the FULL
directory name, so ties break on the suffix — deterministic and stable, and the
replay proves today's order is dependency-correct. The hazard is prospective: a
new migration authored with a COLLIDING timestamp whose suffix sorts BEFORE a
sibling it depends on will replay-fail on a fresh database while succeeding on
every already-migrated one. Give a new migration its own timestamp.
