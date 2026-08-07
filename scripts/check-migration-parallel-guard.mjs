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
import { execFileSync } from 'child_process';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(REPO_ROOT, 'apps/api/prisma/migrations');

/**
 * FROZEN — name AND CONTENT (F3914, 2026-08-06). Every migration that already
 * carried an unguarded heavy statement when this gate was written, and has
 * already applied to the live databases. Adding a NEW name here does not make a
 * new migration safe — it makes the next deploy crash-loop. Fix the migration
 * instead.
 *
 * THE EXEMPTION USED TO BE A NAME. This list checked only that the DIRECTORY
 * still existed, while its own comment warned the exemption "silently widens...
 * [when] a file is edited" — so an edit that ADDED a new unguarded heavy
 * statement to a grandfathered migration was invisible, which is precisely the
 * hazard the gate exists to stop, wearing the one costume the gate could not
 * see. Each entry now pins the file's BLOB SHA. Editing a grandfathered
 * migration fails the gate until someone re-rules it — which is the correct
 * price, because editing an APPLIED migration is itself a checksum-breaking
 * act that deserves a decision, not a silent pass.
 *
 * Refresh a sha only when the edit has been read and ruled safe:
 *   git hash-object apps/api/prisma/migrations/<name>/migration.sql
 */
const GRANDFATHERED = new Map([
  // AUTHORING.md named TWO unguarded heavy migrations. This gate found SIX —
  // four were absent from that inventory, and one of them
  // (`poll_subject_id_text`) also slipped a hand-scan done while writing this
  // file, because it spells the rewrite `SET DATA TYPE` rather than `TYPE`.
  // The doc has been corrected.
  ['20260514203000_search_demand_event_kind_and_on_demand_facts',
    '659eca6910a4fa5c12b77ae706baf269d4f97371'],
  ['20260515203000_demand_entity_lanes_and_favorite_events',
    '79971e81fa1ec4182e7406da76a0fe75e3024b6b'],
  ['20260621184323_poll_subject_id_text',
    '4cd218096cfae67f7c3c945f5e6897078cccfb9b'],
  ['20260803020000_access_grant_kind',
    '4bd1385660d6f126c779fd86521d7cd9bb71324e'],
  ['20250320000000_add_polls',
    'f30f336cb83b1abbd9cb0def20e9830952b15d51'],
  ['20250321010000_notification_user_id_text',
    'a2c8fd05bc1b7bedfeaffff271b5403169aa4188'],
  ['20251221010151_reconcile_db',
    'b32964030f032fe944731c9f64c5596a194df374'],
  ['20251221040000_subreddits_citext',
    'c6b2547a91db00be24b66b3db6ea1125b48da916'],
  ['20260515193500_drop_market_type_local_fallback',
    '65a0212912bee2311a4e1b96aff3eb83d7ce26fc'],
  ['20260515201000_provider_neutral_regional_markets',
    '9c6940e39cf70d07cb5742b5c2732c0de3b4e78a'],
  ['20260609120000_capture_db_push_drift',
    'f69a9862d86ba7af5c2559422e97a66e559add50'],
  ['20260628120000_crave_score_0to10_scale',
    '157043e0355366b8e4f09bd63cecf42411515b2b'],
  ['20260708090000_workkind_enum_ledger_dedupe',
    'f12ad471cc1bf561effc23b0b508ae1662ec7931'],
  ['20260710120000_photos_hardening',
    'bd4a99105ae3da65a3ae231065442f3594db6f8d'],
  ['20260722100000_drop_dormant_poll_enum_members',
    'dd2a45e34f925daefb2a27f0f72aed9aa4759ef1'],
  ['20260802060000_timestamptz_everywhere',
    '65607d27d4236c4a2b1f0105a23777ba08305b10'],
  ['20260802170000_in_scoring_territory',
    '4e6e5c12f547887dbeea7e4cfbc2f052efa782e3'],
]);

const COLUMN_REWRITE = /ALTER\s+COLUMN\s+"?[A-Za-z_][A-Za-z0-9_]*"?\s+(?:SET\s+DATA\s+)?TYPE\b/i;
const GUARD_GATHER = /SET\s+max_parallel_workers_per_gather\s*=\s*0/i;
const GUARD_MAINTENANCE = /SET\s+max_parallel_maintenance_workers\s*=\s*0/i;

/**
 * `UPDATE <table> SET ...` with no WHERE anywhere in the statement.
 *
 * BY STATEMENT, NOT BY TERMINATOR (F3914, 2026-08-06). The old matcher was
 * `/^\s*UPDATE\s+[^;]*?\bSET\b[^;]*?;/gim` — it REQUIRED a closing `;`, so a
 * file whose LAST statement is an unbounded UPDATE without a trailing
 * semicolon was unseen. A missing terminator is a formatting accident; being
 * invisible to the gate because of one is not a property anybody chose.
 * Splitting on `;` gets the same statements and treats the tail chunk like any
 * other, so the terminator stops mattering.
 *
 * Returns the character OFFSET of each unbounded UPDATE, because the position
 * check below needs to know where the heavy work starts, not just that it
 * exists.
 */
function unboundedUpdateOffsets(sql) {
  const out = [];
  let at = 0;
  for (const chunk of sql.split(';')) {
    if (/^\s*UPDATE\s+[\s\S]*?\bSET\b/i.test(chunk) && !/\bWHERE\b/i.test(chunk)) {
      out.push(at + (/\S/.exec(chunk)?.index ?? 0));
    }
    at += chunk.length + 1;
  }
  return out;
}

/**
 * Offset of the FIRST heavy statement, or -1. The guard has to precede this.
 */
function firstHeavyOffset(sql) {
  const offsets = unboundedUpdateOffsets(sql);
  const rewrite = COLUMN_REWRITE.exec(sql);
  if (rewrite) offsets.push(rewrite.index);
  return offsets.length ? Math.min(...offsets) : -1;
}

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
  if (unboundedUpdateOffsets(sql).length > 0) {
    reasons.push('an UPDATE with no WHERE (corpus-wide by definition)');
  }
  if (reasons.length === 0) continue;
  heavyCount += 1;

  /**
   * POSITION IS PART OF THE GUARD (F3914). `SET max_parallel_* = 0` only
   * protects statements that run AFTER it — a SET at the bottom of the file
   * protects nothing, and the old check accepted the two lines ANYWHERE,
   * including below the rewrite they exist to survive. The law in AUTHORING.md
   * already says "two lines at the TOP of the file"; this makes the gate say
   * the same thing.
   */
  const gather = GUARD_GATHER.exec(sql);
  const maintenance = GUARD_MAINTENANCE.exec(sql);
  const heavyAt = firstHeavyOffset(sql);
  const present = Boolean(gather && maintenance);
  const guarded =
    present && gather.index < heavyAt && maintenance.index < heavyAt;
  if (guarded) continue;
  if (GRANDFATHERED.has(name)) continue;

  if (present) {
    failures.push(
      `${name}/migration.sql: heavy — ${reasons.join('; ')} — and it DOES ` +
        `disable parallel workers, but not before the heavy statement (guard ` +
        `at offset ${Math.max(gather.index, maintenance.index)}, first heavy ` +
        `statement at ${heavyAt}). A SET only applies to what runs after it, ` +
        `so this file is unguarded in practice. Move both lines to the TOP.`,
    );
    continue;
  }

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

// A grandfather entry that no longer matches anything is a stale exemption: it
// silently widens the next time a name is reused — or, the hole F3914 found,
// the next time the FILE is edited under an unchanged name.
for (const [name, pinnedSha] of GRANDFATHERED) {
  if (!dirs.includes(name)) {
    failures.push(
      `${name}: grandfathered here but no such migration exists — stale ` +
        `exemption, delete it.`,
    );
    continue;
  }
  const file = join(MIGRATIONS, name, 'migration.sql');
  if (!existsSync(file)) {
    failures.push(
      `${name}: grandfathered, but its migration.sql is gone — the exemption ` +
        `now covers nothing. Delete the entry.`,
    );
    continue;
  }
  const sha = execFileSync('git', ['hash-object', file], {
    encoding: 'utf8',
  }).trim();
  if (sha !== pinnedSha) {
    failures.push(
      `${name}/migration.sql: EDITED since it was grandfathered (pinned ` +
        `${pinnedSha.slice(0, 12)}, now ${sha.slice(0, 12)}). The exemption ` +
        `was a ruling about a specific file; a different file has not been ` +
        `ruled on, and an edit is exactly how a new unguarded heavy statement ` +
        `would enter under cover of the old name. Read the diff. If the edit ` +
        `is safe, re-pin: git hash-object ${file}`,
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
