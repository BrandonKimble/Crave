/**
 * @script-class: operational
 *
 * PARKED NAMES — census, then bring the janitor's ungroundable archives back
 * (owner-approved rederivation "the court's memory is the ledger",
 * 2026-09-04).
 *
 * WHAT WENT WRONG. The resolver's tombstone sink read `status = 'archived'
 * AND no redirect` as a judge reject, so every archive made for another
 * reason swallowed live mentions: the janitor's UNGROUNDABLE arm archived
 * 134 places on 2026-09-03 (632 of 29,451 place mentions sunk in the v23
 * shadow — "Arlo's" ate every vouch meant for the live "Arlo's Junior"),
 * and 714 items archived 2026-08-20/22 with no verdict anywhere sank 428
 * of 13,080 dish mentions.
 *
 * THE LAW NOW (entity-reject-lane.ts): a sink needs a LEDGERED reject in
 * force or Google's closure. Everything else archived, redirect-free and
 * born to no shadow is a PARKED NAME — revived by its next mention, never
 * by a sweep. So this script mostly REPORTS: how many archived rows are
 * genuine sinks, how many are Google-closed, how many are parked.
 *
 * THE ONE REPAIR IT APPLIES (item 4 shape (a)): the janitor's ungroundable
 * arm is gone, so the places it archived — terminal failure count, no
 * grounded location, no verdict, not closed, identity slot free — return
 * to ACTIVE as ungrounded parked names. They stay off every serving surface
 * by the visibility floor's predicate (servable-place-scope.ts) and cost
 * nothing (the money guard refuses at the same threshold). Every other
 * parked row stays archived until a mention revives it.
 *
 * Dry-run by default. Usage:
 *   DATABASE_URL=... npx ts-node scripts/repair-parked-names.ts [--apply]
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { locationNoMatchAttemptThreshold } from '../src/config/configuration';
import {
  googleClosedSql,
  identitySlotFreeSql,
  ledgeredRejectSql,
  parkedNameSql,
  redirectFreeArchivedSql,
} from '../src/modules/content-processing/entity-resolver/entity-reject-lane';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const threshold = locationNoMatchAttemptThreshold();

  const census = await prisma.$queryRaw<
    Array<{ type: string; fate: string; n: bigint }>
  >(Prisma.sql`
    SELECT e.type::text AS type,
           CASE
             WHEN ${ledgeredRejectSql('e', null)} THEN 'ledgered-reject'
             WHEN ${googleClosedSql('e')} THEN 'google-closed'
             WHEN e.type IN ('place'::entity_type, 'item'::entity_type,
                             'ingredient'::entity_type) THEN 'parked'
             ELSE 'ontology-archive'
           END AS fate,
           count(*) AS n
      FROM core_entities e
     WHERE ${redirectFreeArchivedSql('e')}
     GROUP BY 1, 2
     ORDER BY 1, 2`);
  console.log('Archived, redirect-free, born-null rows by fate:');
  for (const row of census) {
    console.log(`  ${row.type.padEnd(16)} ${row.fate.padEnd(18)} ${row.n}`);
  }

  const ungroundedParkedPlaces = await prisma.$queryRaw<
    Array<{ entity_id: string; name: string; failures: number }>
  >(Prisma.sql`
    SELECT e.entity_id, e.name, e.enrichment_failure_count AS failures
      FROM core_entities e
     WHERE e.type = 'place'::entity_type
       AND ${parkedNameSql('e', null)}
       AND NOT EXISTS (
         SELECT 1 FROM core_restaurant_locations l
          WHERE l.restaurant_id = e.entity_id
            AND l.google_place_id IS NOT NULL
       )
       AND ${identitySlotFreeSql('e')}
     ORDER BY e.enrichment_failure_count DESC, e.name`);
  const terminal = ungroundedParkedPlaces.filter(
    (row) => row.failures >= threshold,
  );
  console.log(
    `\nParked places with no grounded location: ${ungroundedParkedPlaces.length}` +
      ` (of which ${terminal.length} at/over the money guard's threshold ${threshold}` +
      ` — the ungroundable arm's own archives; these return to active)`,
  );
  for (const row of terminal.slice(0, 25)) {
    console.log(`  ${row.entity_id}  ${row.failures}x  ${row.name}`);
  }
  if (terminal.length > 25) console.log(`  ... ${terminal.length - 25} more`);

  if (!apply) {
    console.log('\nDry run — pass --apply to revive the terminal set.');
    return;
  }
  if (!terminal.length) {
    console.log('\nNothing to apply.');
    return;
  }
  const revived = await prisma.$executeRaw(Prisma.sql`
    UPDATE core_entities e
       SET status = 'active'::entity_status, last_updated = now()
     WHERE e.entity_id = ANY(${terminal.map((r) => r.entity_id)}::uuid[])
       AND ${parkedNameSql('e', null)}
       AND ${identitySlotFreeSql('e')}`);
  console.log(`\nRevived ${revived} place(s) to active (ungrounded, parked).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
