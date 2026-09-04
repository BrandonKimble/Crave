/**
 * @script-class: invariant-check
 *
 * UNMAPPED-TYPES CENSUS (R11, 2026-08-16): every DISTINCT Google place type
 * stored on a grounded restaurant (core_entities.restaurant_metadata->
 * googlePlaces->types) must be classified by google-place-type-attributes.ts
 * as either a KIND (attribute map) or NOISE (ignore set). A type in neither
 * means Google shipped a taxonomy change under us: exit 1, print the types.
 *
 * Wired as invariant `taxonomy.every-stored-place-type-is-classified` — the
 * registry deletes a mapped, corpus-present type from the map and requires
 * THIS check to fail. The runtime twin is PlaceTypeCensusService, which runs
 * the same census as a nightly-convergence phase and raises ops alerts.
 *
 *   yarn workspace api ts-node -T scripts/check-place-type-classification.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ensurePlaceTypeCensusFixture } from './lib/census-fixture';
import { isClassifiedGooglePlaceType } from '../src/modules/restaurant-enrichment/google-place-type-attributes';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await ensurePlaceTypeCensusFixture(prisma);
    const rows = await prisma.$queryRawUnsafe<
      Array<{ type: string; places: number }>
    >(
      `SELECT t.value AS type, count(DISTINCT e.entity_id)::int AS places
         FROM core_entities e
        CROSS JOIN LATERAL jsonb_array_elements_text(
          e.restaurant_metadata->'googlePlaces'->'types'
        ) t
        WHERE e.type = 'place'
          AND jsonb_typeof(e.restaurant_metadata->'googlePlaces'->'types') = 'array'
        GROUP BY t.value
        ORDER BY t.value`,
    );
    const unknown = rows.filter((r) => !isClassifiedGooglePlaceType(r.type));
    console.log(
      `place-type census: ${rows.length} distinct stored types, ` +
        `${unknown.length} unclassified`,
    );
    if (unknown.length) {
      for (const row of unknown) {
        console.log(`  UNCLASSIFIED: ${row.type} (${row.places} rows)`);
      }
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
