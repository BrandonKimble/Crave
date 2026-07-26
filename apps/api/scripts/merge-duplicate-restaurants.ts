import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RestaurantEntityMergeService } from '../src/modules/restaurant-enrichment/restaurant-entity-merge.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/**
 * Duplicate-restaurant sweep (2026-07-26). Same-name active restaurant
 * entities are identity errors when they denote the same business/brand —
 * the model is ONE brand entity + N restaurant_locations. This script:
 *
 *   REPORT (default): lists every same-name active pair with the evidence a
 *   merge decision needs (place ids per location, cities, mention counts,
 *   created order). Writes nothing.
 *
 *   --apply: merges pairs that pass the SAFE rule — same normalized name AND
 *   (shared google_place_id on any location OR every location within the
 *   same city). Canonical = the entity with more mention evidence (ties →
 *   older). Uses the real merge machinery (events rehomed, locations merged,
 *   aliases banked, redirect written) — never raw SQL.
 *
 *   yarn workspace api ts-node scripts/merge-duplicate-restaurants.ts [--apply]
 */
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);

  try {
    const prisma = app.get(PrismaService);
    const merge = app.get(RestaurantEntityMergeService);

    const pairs = await prisma.$queryRaw<
      Array<{
        name: string;
        entity_ids: string[];
      }>
    >`
      SELECT lower(name) AS name, array_agg(entity_id ORDER BY created_at) AS entity_ids
      FROM core_entities
      WHERE type = 'restaurant' AND status = 'active'
      GROUP BY lower(name)
      HAVING count(*) > 1
      ORDER BY lower(name)
    `;
    out(
      `same-name active restaurant groups: ${pairs.length} (mode=${apply ? 'APPLY' : 'report'})`,
    );

    for (const group of pairs) {
      const details = await prisma.$queryRaw<
        Array<{
          entity_id: string;
          name: string;
          created_at: Date;
          mention_count: number;
          locations: number;
          place_ids: string[];
          cities: string[];
        }>
      >`
        SELECT e.entity_id, e.name, e.created_at,
               COALESCE((SELECT count(*) FROM core_restaurant_entity_events ev WHERE ev.restaurant_id = e.entity_id), 0)::int AS mention_count,
               COALESCE((SELECT count(*) FROM core_restaurant_locations l WHERE l.restaurant_id = e.entity_id), 0)::int AS locations,
               COALESCE((SELECT array_agg(DISTINCT l.google_place_id) FILTER (WHERE l.google_place_id IS NOT NULL) FROM core_restaurant_locations l WHERE l.restaurant_id = e.entity_id), '{}') AS place_ids,
               COALESCE((SELECT array_agg(DISTINCT l.city) FILTER (WHERE l.city IS NOT NULL) FROM core_restaurant_locations l WHERE l.restaurant_id = e.entity_id), '{}') AS cities
        FROM core_entities e
        WHERE e.entity_id = ANY(${group.entity_ids}::uuid[])
        ORDER BY e.created_at
      `;
      out(`\n== ${group.name}`);
      for (const d of details) {
        out(
          `   ${d.entity_id} mentions=${d.mention_count} locations=${d.locations} cities=[${d.cities.join(',')}] placeIds=[${d.place_ids.join(',')}] created=${d.created_at.toISOString().slice(0, 10)}`,
        );
      }
      if (details.length !== 2) {
        out('   SKIP: group size != 2 — review by hand');
        continue;
      }

      const [a, b] = details;
      // SAFE RULE (2026-07-26 root cause: check-then-act race + a places
      // path that never consults the reddit-created entity): HOLD only when
      // BOTH sides are place-grounded with disjoint place ids — genuinely
      // two physical businesses needing a human/brand decision. Any
      // ungrounded side is a pre-enrichment duplicate of the same corpus
      // stream. Canonical = the grounded side when exactly one is grounded
      // (it carries the enrichment), else the more-evidenced side.
      const sharedPlaceId = a.place_ids.some((p) => b.place_ids.includes(p));
      const bothGroundedDisjoint =
        a.place_ids.length > 0 && b.place_ids.length > 0 && !sharedPlaceId;
      const safe = !bothGroundedDisjoint;
      const aGrounded = a.place_ids.length > 0;
      const bGrounded = b.place_ids.length > 0;
      const [canonical, duplicate] =
        aGrounded !== bGrounded
          ? aGrounded
            ? [a, b]
            : [b, a]
          : b.mention_count > a.mention_count
            ? [b, a]
            : [a, b];
      out(
        `   verdict: ${safe ? 'MERGEABLE' : 'HOLD (both grounded, disjoint places — distinct businesses or a brand needing location-merge review)'} ` +
          (safe
            ? `canonical=${canonical.entity_id} (${canonical.mention_count} mentions)`
            : ''),
      );

      if (apply && safe) {
        const canonicalRow = await prisma.entity.findUniqueOrThrow({
          where: { entityId: canonical.entity_id },
        });
        const duplicateRow = await prisma.entity.findUniqueOrThrow({
          where: { entityId: duplicate.entity_id },
        });
        await merge.mergeDuplicateRestaurant({
          canonical: canonicalRow,
          duplicate: duplicateRow,
          canonicalUpdate: {},
        });
        out(`   MERGED ${duplicate.entity_id} -> ${canonical.entity_id}`);
      }
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
