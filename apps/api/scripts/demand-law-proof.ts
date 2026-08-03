/* Proves the §4 daily-acts law is LIVE in all three readers.
 *
 * The local corpus has no echo-kind rows and only 4 multi-kind groups, so a
 * plain run cannot distinguish "the law is enforced" from "no row exercises
 * it". This inserts fixtures that do exercise it, runs every reader, and rolls
 * back. Pair it with a mutation of act-identity.ts: with the law intact the
 * numbers below hold; remove `a.kind` from the grain or the echo exclusion
 * from the WHERE and each affected reader moves.
 */
import { PrismaClient } from '@prisma/client';
import { DemandMassReader } from '../src/modules/polls/supply/demand-mass.reader';
import { SignalDemandReadService } from '../src/modules/signals/signal-demand-read.service';

const LOG = {
  setContext: () => ({ info() {}, warn() {}, error() {}, debug() {} }),
} as never;

async function main() {
  const prisma = new PrismaClient();
  const now = new Date('2026-08-02T12:00:00Z');
  const day = '2026-08-01';

  try {
    await prisma.$transaction(async (tx) => {
      const [{ place_id: placeId }] = await tx.$queryRaw<
        { place_id: string }[]
      >`SELECT place_id::text AS place_id FROM signal_demand_daily
        WHERE place_id IS NOT NULL LIMIT 1`;
      const [{ entity_id: entityId }] = await tx.$queryRaw<
        { entity_id: string }[]
      >`SELECT entity_id::text AS entity_id FROM core_entities
        WHERE type = 'restaurant' LIMIT 1`;
      const [{ actor_id: actorId }] = await tx.$queryRaw<
        { actor_id: string }[]
      >`SELECT actor_id::text AS actor_id FROM signal_demand_daily LIMIT 1`;

      // One actor, one day, one entity, THREE kinds — two real acts plus an
      // echo. Kind-in-the-grain makes the two real kinds SUM; the echo
      // exclusion drops the third entirely.
      // A subject-less act by the same actor on the same day: it belongs to
      // the TERRITORY (placeMass counts it) but names no entity, so the
      // entity-scoped readers must not see it.
      await tx.$executeRawUnsafe(
        `INSERT INTO signal_demand_daily
           (place_id, actor_id, day, kind, subject_type, subject_id,
            signal_count, last_occurred_at)
         VALUES ($1::uuid, $2::uuid, $3::date, 'search', 'none', NULL, 40,
                 $3::timestamptz)`,
        placeId,
        actorId,
        day,
      );
      for (const [kind, count] of [
        ['search', 5],
        ['entity_view', 7],
        ['autocomplete_selection', 100],
      ] as const) {
        await tx.$executeRawUnsafe(
          `INSERT INTO signal_demand_daily
             (place_id, actor_id, day, kind, subject_type, subject_id,
              signal_count, last_occurred_at)
           VALUES ($1::uuid, $2::uuid, $3::date, $4, 'entity', $5::uuid, $6,
                   $3::timestamptz)
           ON CONFLICT DO NOTHING`,
          placeId,
          actorId,
          day,
          kind,
          entityId,
          count,
        );
      }

      const mass = new DemandMassReader(tx as never);
      const reads = new SignalDemandReadService(tx as never, LOG);

      const placeMass = await mass.placeDemandMass([placeId], now);
      const subjectMass = await mass.subjectDemandMass([placeId], now);
      const territory = await reads.territoryEntityDemand({
        placeIds: [placeId],
        windowDays: 30,
        limit: 50,
        entityTypes: ['restaurant', 'food'],
      });

      const round = (n: number) => Number(n.toFixed(6));
      console.log(
        JSON.stringify(
          {
            placeMass: placeMass.map((r) => round(r.mass)),
            subjectRowCount: subjectMass.length,
            territoryRowCount: territory.length,
            subjectMassForFixture: subjectMass
              .filter((r) => r.subjectId === entityId)
              .map((r) => round(r.mass)),
            territoryForFixture: territory
              .filter((r) => r.entityId === entityId)
              .map((r) => round(r.demandScore)),
          },
          null,
          1,
        ),
      );

      throw new Error('ROLLBACK');
    });
  } catch (error) {
    if ((error as Error).message !== 'ROLLBACK') throw error;
  }
  await prisma.$disconnect();
}

void main();
