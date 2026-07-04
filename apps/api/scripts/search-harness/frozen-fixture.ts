import * as fs from 'fs';
import { Logger } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import {
  bootstrap,
  out,
  FIXTURE_PATH,
  FIXTURE_VERSION,
  type Fixture,
  type FixtureEntity,
} from './_shared';

/**
 * frozen-fixture.ts — dump all `core_entities` (id, type, name, aliases) plus
 * market presence to a versioned JSON fixture so the replay harnesses run
 * hermetically (their corpus can't shift under them mid-sweep). Regenerated ONLY
 * on demand.
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
  market_key: string;
}

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
    const presence = await prisma.$queryRawUnsafe<PresenceRow[]>(
      `SELECT entity_id, market_key FROM core_entity_market_presence`,
    );

    const marketsById = new Map<string, string[]>();
    for (const p of presence) {
      const arr = marketsById.get(p.entity_id) ?? [];
      arr.push(p.market_key);
      marketsById.set(p.entity_id, arr);
    }

    const fixtureEntities: FixtureEntity[] = entities.map((e) => {
      const marketKeys = marketsById.get(e.entity_id) ?? [];
      return {
        entityId: e.entity_id,
        name: e.name,
        type: e.type,
        aliases: (e.aliases ?? []).filter((a) => a && a.trim().length > 0),
        hasMarketPresence: marketKeys.length > 0,
        marketKeys,
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
    counts.withMarketPresence = fixtureEntities.filter(
      (e) => e.hasMarketPresence,
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
