/**
 * @script-class: operational
 * @runner: operator-run, ONE-SHOT (acceptance red team 2026-08-30, finding
 *   "venue-cuisine oppose defeated by stale ids").
 *
 * REDIRECT-HEAL for core_restaurant_attribute_evidence.
 *
 * The debt: 10,655 evidence rows point at ARCHIVED attribute ids — 9,914
 * with an entity_redirects chain to an active canonical (pre-registry merge
 * debt) and ~741 tombstoned junk with no redirect. An archived id can never
 * project or corroborate (the projection's join is active-only), and until
 * the 2026-08-30 status filter it could still OPPOSE — Bhatti Indian Grill
 * lost its 'indian' tag to a dead row asserting the same cuisine.
 *
 * The heal: follow entity_redirects to the terminal ACTIVE id and repoint
 * each redirected row (folding observations into an existing
 * (place, target, source_class) row when one is already there — the PK).
 * Tombstoned rows (no redirect, or a chain ending on a non-active id) are
 * left in place and reported: the status filter already silences them, and
 * deleting evidence is not this script's call. Afterwards the projection is
 * re-derived for every touched place. The attribute-reference registry
 * prevents NEW debt; this drains the old.
 *
 *   # dry-run (DEFAULT): counts + samples, zero writes
 *   yarn workspace api ts-node scripts/heal-stale-attribute-evidence.ts
 *   # the one-shot heal
 *   yarn workspace api ts-node scripts/heal-stale-attribute-evidence.ts --apply
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { PrismaClient, Prisma } from '@prisma/client';
import { derivePlaceAttributes } from '../src/modules/content-processing/reddit-collector/place-attribute-projection';

const prisma = new PrismaClient();
const out = (msg = '') => process.stdout.write(`${msg}\n`);

/** Every stale evidence row, with its redirect chain's terminal id (if any)
 *  and that terminal's status. Cycle-guarded (depth cap 20). */
const STALE_ROWS_SQL = Prisma.sql`
  WITH RECURSIVE chain AS (
    SELECT r.from_entity_id AS origin, r.to_entity_id AS target, 1 AS depth
    FROM entity_redirects r
    UNION ALL
    SELECT c.origin, r.to_entity_id, c.depth + 1
    FROM chain c
    JOIN entity_redirects r ON r.from_entity_id = c.target
    WHERE c.depth < 20
  ),
  terminal AS (
    SELECT DISTINCT ON (origin) origin, target
    FROM chain ORDER BY origin, depth DESC
  )
  SELECT ev.restaurant_id AS "placeId",
         ev.attribute_id  AS "staleId",
         ev.source_class  AS "sourceClass",
         ev.observations  AS observations,
         ae.name          AS "staleName",
         t.target         AS "targetId",
         te.status::text  AS "targetStatus",
         te.name          AS "targetName"
  FROM core_restaurant_attribute_evidence ev
  JOIN core_entities ae ON ae.entity_id = ev.attribute_id
  LEFT JOIN terminal t ON t.origin = ev.attribute_id
  LEFT JOIN core_entities te ON te.entity_id = t.target
  WHERE ae.status <> 'active'
`;

interface StaleRow {
  placeId: string;
  staleId: string;
  sourceClass: string;
  observations: number;
  staleName: string;
  targetId: string | null;
  targetStatus: string | null;
  targetName: string | null;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const rows = await prisma.$queryRaw<StaleRow[]>(STALE_ROWS_SQL);

  const healable = rows.filter((r) => r.targetStatus === 'active');
  const tombstoned = rows.filter((r) => !r.targetId);
  const deadEnd = rows.filter((r) => r.targetId && r.targetStatus !== 'active');

  out(`stale evidence rows (archived attribute id): ${rows.length}`);
  out(`  healable (redirect chain ends on an ACTIVE id): ${healable.length}`);
  out(`  tombstoned (no redirect — left as-is):          ${tombstoned.length}`);
  out(`  dead-end (redirect to a non-active id, left):   ${deadEnd.length}`);
  out();
  for (const r of healable.slice(0, 15)) {
    out(
      `  heal sample: place ${r.placeId} ${r.sourceClass} ` +
        `"${r.staleName}" (${r.staleId}) -> "${r.targetName}" (${r.targetId})`,
    );
  }

  if (!apply) {
    out();
    out('DRY-RUN (default) — nothing written. Re-run with --apply to heal.');
    return;
  }

  const touchedPlaces = new Set<string>();
  let repointed = 0;
  let folded = 0;
  for (const r of healable) {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.$queryRaw<Array<{ observations: number }>>`
        SELECT observations FROM core_restaurant_attribute_evidence
        WHERE restaurant_id = ${r.placeId}::uuid
          AND attribute_id = ${r.targetId}::uuid
          AND source_class = ${r.sourceClass}`;
      if (existing.length) {
        // Target row already there — fold the stale row's observations in
        // and drop the stale row (the PK forbids a plain repoint).
        await tx.$executeRaw`
          UPDATE core_restaurant_attribute_evidence
          SET observations = observations + ${r.observations}
          WHERE restaurant_id = ${r.placeId}::uuid
            AND attribute_id = ${r.targetId}::uuid
            AND source_class = ${r.sourceClass}`;
        await tx.$executeRaw`
          DELETE FROM core_restaurant_attribute_evidence
          WHERE restaurant_id = ${r.placeId}::uuid
            AND attribute_id = ${r.staleId}::uuid
            AND source_class = ${r.sourceClass}`;
        folded += 1;
      } else {
        await tx.$executeRaw`
          UPDATE core_restaurant_attribute_evidence
          SET attribute_id = ${r.targetId}::uuid
          WHERE restaurant_id = ${r.placeId}::uuid
            AND attribute_id = ${r.staleId}::uuid
            AND source_class = ${r.sourceClass}`;
        repointed += 1;
      }
    });
    touchedPlaces.add(r.placeId);
  }

  out(`repointed: ${repointed}, folded into existing rows: ${folded}`);

  // Re-derive the projection for every touched place so the healed vote
  // lands in restaurant_attributes immediately.
  const placeIds = [...touchedPlaces];
  for (let i = 0; i < placeIds.length; i += 500) {
    await derivePlaceAttributes(prisma, placeIds.slice(i, i + 500));
  }
  out(`projection re-derived for ${placeIds.length} places`);
}

main()
  .catch((e) => {
    process.stderr.write(
      `${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
