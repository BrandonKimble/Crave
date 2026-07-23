import * as fs from 'fs';
import { Logger } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrap,
  out,
  DEFAULT_MARKET_KEY,
  FIXTURE_PATH,
  FIXTURE_VERSION,
  type Fixture,
  type FixtureEntity,
} from './_shared';

/**
 * frozen-fixture.ts — dump all `core_entities` (id, type, name, aliases) plus
 * region presence (§13 leg 3: geometric — a restaurant's primary location
 * inside the DEFAULT_MARKET_KEY region's catalog-place bbox, the successor to
 * the dropped `core_entity_market_presence` table) to a versioned JSON
 * fixture so the replay harnesses run hermetically (their corpus can't shift
 * under them mid-sweep). Regenerated ONLY on demand.
 *
 *   yarn workspace api ts-node scripts/search-harness/frozen-fixture.ts
 *
 * The recall/link harnesses still hit the live DB for the actual SQL (they must —
 * the whole point is to measure the REAL recall path), but they enumerate the
 * corpus from this frozen file so the set of queries is stable + versioned.
 */

interface EntityRow {
  entity_id: string;
  name: string;
  type: EntityType;
  aliases: string[] | null;
}
interface PresenceRow {
  entity_id: string;
}

/** DEFAULT_MARKET_KEY → the catalog place whose bbox stands in for that
 *  legacy region (§13 leg 3: the only two keys this harness family has ever
 *  used). Unknown keys fall back to no region filter (presence = false for
 *  everyone) rather than guessing. */
const REGION_PLACE_BY_MARKET_KEY: Record<
  string,
  { name: string; subdivisionCode: string; countryCode: string }
> = {
  'region-us-ny-new-york': {
    name: 'New York',
    subdivisionCode: 'NY',
    countryCode: 'US',
  },
  'region-us-tx-austin': {
    name: 'Austin',
    subdivisionCode: 'TX',
    countryCode: 'US',
  },
};

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const prisma = app.get(PrismaService);

    const entities = await prisma.$queryRawUnsafe<EntityRow[]>(
      `SELECT entity_id, name, type, aliases
         FROM core_entities
        WHERE status = 'active'
        ORDER BY type, name`,
    );

    const regionPlace = REGION_PLACE_BY_MARKET_KEY[DEFAULT_MARKET_KEY];
    const presence = regionPlace
      ? await prisma.$queryRawUnsafe<PresenceRow[]>(
          `WITH region_place AS (
             SELECT bbox_min_lat, bbox_min_lng, bbox_max_lat, bbox_max_lng
               FROM places
              WHERE name = $1 AND subdivision_code = $2 AND country_code = $3
              ORDER BY promoted_at DESC NULLS LAST
              LIMIT 1
           )
           SELECT e.entity_id
             FROM core_entities e
             JOIN core_restaurant_locations l ON l.location_id = e.primary_location_id
             CROSS JOIN region_place rp
            WHERE e.type = 'restaurant'
              AND l.latitude BETWEEN rp.bbox_min_lat AND rp.bbox_max_lat
              AND l.longitude BETWEEN rp.bbox_min_lng AND rp.bbox_max_lng`,
          regionPlace.name,
          regionPlace.subdivisionCode,
          regionPlace.countryCode,
        )
      : [];

    const presentIds = new Set(presence.map((p) => p.entity_id));

    const fixtureEntities: FixtureEntity[] = entities.map((e) => {
      const hasRegionPresence = presentIds.has(e.entity_id);
      return {
        entityId: e.entity_id,
        name: e.name,
        type: e.type,
        aliases: (e.aliases ?? []).filter((a) => a && a.trim().length > 0),
        hasRegionPresence,
        regionKeys: hasRegionPresence ? [DEFAULT_MARKET_KEY] : [],
      };
    });

    const counts: Record<string, number> = { total: fixtureEntities.length };
    for (const e of fixtureEntities) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    counts.aliasesTotal = fixtureEntities.reduce(
      (n, e) => n + e.aliases.length,
      0,
    );
    counts.withRegionPresence = fixtureEntities.filter(
      (e) => e.hasRegionPresence,
    ).length;

    const fixture: Fixture = {
      fixtureVersion: FIXTURE_VERSION,
      generatedAt: new Date().toISOString(),
      sourceDb:
        process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ':***@') ?? 'unknown',
      counts,
      entities: fixtureEntities,
    };

    fs.writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2), 'utf8');

    out(`Frozen fixture written → ${FIXTURE_PATH}`);
    out('');
    out('Counts:');
    for (const [k, v] of Object.entries(counts)) {
      out(`  ${k.padEnd(20)} ${v}`);
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
