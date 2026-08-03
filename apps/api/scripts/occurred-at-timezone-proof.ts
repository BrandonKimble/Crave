/* Runs the real signals read paths against the live DB under a session
 * timezone chosen by PGOPTIONS, and prints a digest. Run it under several
 * zones and diff: identical output means occurred_at no longer carries a
 * timezone-dependent meaning anywhere a query can reach it.
 *
 * This exercises the SERVICES, not hand-written SQL, so it covers the shapes
 * that actually ship — including the aggregate's day windows, which became
 * the dangerous form the moment the column turned timestamptz.
 */
import { PrismaClient } from '@prisma/client';
import { SignalDemandReadService } from '../src/modules/signals/signal-demand-read.service';
import { utcDayStart } from '../src/modules/signals/occurred-at';

const LOG = {
  setContext: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
} as never;

async function main() {
  const prisma = new PrismaClient();
  const reads = new SignalDemandReadService(prisma as never, LOG);

  const [{ tz }] = await prisma.$queryRaw<{ tz: string }[]>`SHOW TimeZone`;

  const places = await prisma.$queryRaw<{ place_id: string }[]>`
    SELECT DISTINCT place_id::text AS place_id FROM signal_demand_daily
    WHERE place_id IS NOT NULL ORDER BY place_id LIMIT 40
  `;
  const placeIds = places.map((p) => p.place_id);

  // 1. A bound instant (the sybil / recent-search shape).
  const since = new Date('2026-07-01T00:00:00Z');
  const [{ n: boundInstant }] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM signals s WHERE s.occurred_at >= ${since}
  `;

  // 2. A UTC day window (the aggregate's shape).
  const [{ n: dayWindow }] = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM signals s
    WHERE s.occurred_at >= ${utcDayStart('2026-07-15')}
      AND s.occurred_at < ${utcDayStart('2026-07-16')}
  `;

  // 3. The partition router: which partition claims a boundary instant.
  const [{ part }] = await prisma.$queryRaw<{ part: string }[]>`
    SELECT COALESCE(
      (SELECT c.relname FROM signals s
         JOIN pg_class c ON c.oid = s.tableoid
        WHERE s.occurred_at >= ${utcDayStart('2026-08-01')} LIMIT 1),
      'none'
    ) AS part
  `;

  // 4. A real service read end to end.
  const territory = await reads.territoryEntityDemand({
    placeIds,
    windowDays: 30,
    limit: 50,
    entityTypes: ['restaurant', 'food'],
  });

  console.log(
    JSON.stringify({
      boundInstant: Number(boundInstant),
      dayWindow: Number(dayWindow),
      augustPartition: part,
      territoryRows: territory.length,
      territoryScores: territory
        .map((r) => Number(r.demandScore.toFixed(9)))
        .sort(),
    }),
  );
  console.log(`  (session TimeZone was ${tz})`);
  await prisma.$disconnect();
}

void main();
