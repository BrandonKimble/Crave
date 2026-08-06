#!/usr/bin/env node
/**
 * GATE: a NEW heavy migration must disable parallel workers.
 *
 * THE LAW (apps/api/prisma/migrations/AUTHORING.md §1, F303). Prod Postgres has
 * a small `/dev/shm`. A migration that rewrites a whole table dies there with
 * `could not resize shared memory segment` — and because migrations run in the
 * container's boot command, a P3009 crash-loop takes the whole deploy with it.
 * The fix is two lines at the top of the file:
 *
 *     SET max_parallel_workers_per_gather = 0;
 *     SET max_parallel_maintenance_workers = 0;
 *
 * It was written down and never enforced. `20260802060000_timestamptz_everywhere`
 * converts 160 columns — the heaviest rewrite in the corpus — and carries the
 * guard ZERO times, despite being timestamped LATER than five siblings that do.
 * An oversight, not a predecessor. That is what an unenforced law looks like.
 *
 * WHY PROSPECTIVE ONLY. Applied migrations are immutable history: editing one
 * changes a checksum Prisma has already recorded, so the corpus below is
 * GRANDFATHERED by name and frozen. The hazard those two carry is real but not
 * fixable here (AUTHORING.md records the operational remedy: SET the GUCs in
 * the psql session before a restore or replay). This gate exists so the NEXT
 * one cannot happen.
 *
 * WHAT COUNTS AS HEAVY, and why the definition is narrow. `ALTER COLUMN ...
 * TYPE` rewrites the table AND rebuilds every index on it — unambiguous from
 * the text alone. A bare `UPDATE` with no WHERE is corpus-wide by definition.
 * Deliberately NOT included: `CREATE INDEX` and narrowed `UPDATE`s, because
 * whether they are heavy depends on the target table's size, which no static
 * scan can know. A gate that fired on all of those would report ~16 false
 * positives against 2 real ones and be allowlisted into uselessness within a
 * week — the failure mode that matters more than a missed case here, since the
 * operational remedy for a missed case exists and is documented.
 */
import { readdirSync, readFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(REPO_ROOT, 'apps/api/prisma/migrations');

/**
 * FROZEN. Every migration that already carried an unguarded heavy statement
 * when this gate was written, and has already applied to the live databases.
 * Adding a NEW name here does not make a new migration safe — it makes the
 * next deploy crash-loop. Fix the migration instead.
 */
const GRANDFATHERED = new Set([
  // AUTHORING.md named TWO unguarded heavy migrations. This gate found SIX —
  // the four below were absent from that inventory, and one of them
  // (`poll_subject_id_text`) also slipped a hand-scan done while writing this
  // file, because it spells the rewrite `SET DATA TYPE` rather than `TYPE`.
  // The doc has been corrected.
  '20260514203000_search_demand_event_kind_and_on_demand_facts',
  '20260515203000_demand_entity_lanes_and_favorite_events',
  '20260621184323_poll_subject_id_text',
  '20260803020000_access_grant_kind',
  '20250320000000_add_polls',
  '20250321010000_notification_user_id_text',
  '20251221010151_reconcile_db',
  '20251221040000_subreddits_citext',
  '20260515193500_drop_market_type_local_fallback',
  '20260515201000_provider_neutral_regional_markets',
  '20260609120000_capture_db_push_drift',
  '20260628120000_crave_score_0to10_scale',
  '20260708090000_workkind_enum_ledger_dedupe',
  '20260710120000_photos_hardening',
  '20260722100000_drop_dormant_poll_enum_members',
  '20260802060000_timestamptz_everywhere',
  '20260802170000_in_scoring_territory',
]);

const COLUMN_REWRITE = /ALTER\s+COLUMN\s+"?[A-Za-z_][A-Za-z0-9_]*"?\s+(?:SET\s+DATA\s+)?TYPE\b/i;
/** `UPDATE <table> SET ...` with no WHERE anywhere in the statement. */
const UNBOUNDED_UPDATE = /^\s*UPDATE\s+[^;]*?\bSET\b[^;]*?;/gim;

if (!existsSync(MIGRATIONS)) {
  console.error(`FAIL: ${MIGRATIONS} does not exist — the scan is broken.`);
  process.exit(1);
}

const dirs = readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

// Missing tooling is a FAILURE, never a pass.
if (dirs.length === 0) {
  console.error('FAIL: no migration directories found — the scan is broken.');
  process.exit(1);
}

const failures = [];
let heavyCount = 0;

for (const name of dirs) {
  const file = join(MIGRATIONS, name, 'migration.sql');
  if (!existsSync(file)) continue;
  const sql = readFileSync(file, 'utf8');

  const reasons = [];
  if (COLUMN_REWRITE.test(sql)) {
    reasons.push('ALTER COLUMN ... TYPE (rewrites the table and every index on it)');
  }
  for (const stmt of sql.match(UNBOUNDED_UPDATE) ?? []) {
    if (!/\bWHERE\b/i.test(stmt)) {
      reasons.push('an UPDATE with no WHERE (corpus-wide by definition)');
      break;
    }
  }
  if (reasons.length === 0) continue;
  heavyCount += 1;

  const guarded =
    /SET\s+max_parallel_workers_per_gather\s*=\s*0/i.test(sql) &&
    /SET\s+max_parallel_maintenance_workers\s*=\s*0/i.test(sql);
  if (guarded) continue;
  if (GRANDFATHERED.has(name)) continue;

  failures.push(
    `${name}/migration.sql: heavy — ${reasons.join('; ')} — but does not ` +
      `disable parallel workers. On prod's small /dev/shm this dies with ` +
      `"could not resize shared memory segment", and because migrations run in ` +
      `the container boot command a P3009 crash-loop takes the deploy with it. ` +
      `Put both lines at the TOP of the file:\n` +
      `        SET max_parallel_workers_per_gather = 0;\n` +
      `        SET max_parallel_maintenance_workers = 0;`,
  );
}

// A grandfather entry that no longer matches anything is a stale exemption:
// it silently widens the next time a name is reused or a file is edited.
for (const name of GRANDFATHERED) {
  if (!dirs.includes(name)) {
    failures.push(
      `${name}: grandfathered here but no such migration exists — stale ` +
        `exemption, delete it.`,
    );
  }
}

if (failures.length) {
  console.error(
    'migration-parallel-guard FAILED:\n' +
      failures.map((f) => `  - ${f}`).join('\n'),
  );
  process.exit(1);
}
console.log(
  `migration-parallel-guard OK — ${dirs.length} migrations, ${heavyCount} ` +
    `heavy, each guarded or grandfathered (${GRANDFATHERED.size} frozen ` +
    `pre-existing).`,
);
