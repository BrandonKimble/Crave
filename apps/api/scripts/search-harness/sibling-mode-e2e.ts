import { Logger } from '@nestjs/common';
import { bootstrap, out } from './_shared';
import { SearchService } from '../../src/modules/search/search.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { SearchQueryRequestDto } from '../../src/modules/search/dto/search-query.dto';

/**
 * sibling-mode-e2e.ts — end-to-end check of the SEARCH_DENSE_SIBLINGS_MODE flag.
 * Runs real SearchService.runQuery for a FAT query (ramen — plenty of strict
 * results) and a THIN query (bun bo hue) and prints dish counts + expansion
 * metadata. Run once per mode; expectations:
 *   off       — baseline counts, denseSiblingFoodsAdded absent/0
 *   expansion — FAT unchanged vs off; THIN widens (siblings in expansion metadata)
 *   always    — FAT widens too (siblings seeded before the first strict probe)
 *
 *   SEARCH_DENSE_SIBLINGS_MODE=off       yarn ts-node scripts/search-harness/sibling-mode-e2e.ts
 *   SEARCH_DENSE_SIBLINGS_MODE=expansion yarn ts-node scripts/search-harness/sibling-mode-e2e.ts
 *   SEARCH_DENSE_SIBLINGS_MODE=always    yarn ts-node scripts/search-harness/sibling-mode-e2e.ts
 */
const QUERIES = (process.env.QUERIES ?? 'ramen,bun bo hue')
  .split(',')
  .map((q) => q.trim())
  .filter(Boolean);

async function main(): Promise<void> {
  const app = await bootstrap();
  try {
    const search = app.get(SearchService);
    const prisma = app.get(PrismaService);
    out(
      `=== SIBLING MODE E2E  (SEARCH_DENSE_SIBLINGS_MODE=${process.env.SEARCH_DENSE_SIBLINGS_MODE ?? '(default)'}) ===`,
    );

    for (const name of QUERIES) {
      const rows = await prisma.$queryRawUnsafe<{ entity_id: string }[]>(
        `SELECT entity_id FROM core_entities
         WHERE lower(name)=lower($1) AND type='food' AND status='active' LIMIT 1`,
        name,
      );
      const id = rows[0]?.entity_id;
      if (!id) {
        out(`"${name}" — NOT FOUND`);
        continue;
      }
      const request = {
        entities: {
          food: [{ normalizedName: name, entityIds: [id] }],
        },
      } as unknown as SearchQueryRequestDto;

      const res = await search.runQuery(request);
      const meta = res.metadata as unknown as Record<string, unknown>;
      const analysis = (meta?.analysis ?? {}) as Record<string, unknown>;
      const idExpansion = (analysis?.idExpansion ??
        (analysis as { idExpansion?: unknown })) as Record<string, unknown>;
      out('');
      out(`--- "${name}" ---`);
      out(`  dishes on page : ${res.dishes?.length ?? 0}`);
      out(`  restaurants    : ${res.restaurants?.length ?? 0}`);
      const totalDishes = Number(meta?.totalFoodResults ?? NaN);
      const totalRestaurants = Number(meta?.totalRestaurantResults ?? NaN);
      out(
        `  totals         : dishes=${Number.isFinite(totalDishes) ? totalDishes : '?'} restaurants=${Number.isFinite(totalRestaurants) ? totalRestaurants : '?'}`,
      );
      out(`  expansion meta : ${JSON.stringify(idExpansion ?? null)}`);
      const dishRows = (res.dishes ?? []).map(
        (d) =>
          d as unknown as {
            foodName?: string;
            exactMatch?: boolean;
            craveScore?: number;
          },
      );
      out(
        `  rows           : ${dishRows
          .slice(0, 12)
          .map(
            (r) =>
              `${r.exactMatch === false ? '~' : r.exactMatch === true ? '=' : ' '}${r.foodName}`,
          )
          .join(', ')}`,
      );
      const firstWidened = dishRows.findIndex((r) => r.exactMatch === false);
      const lateExact = dishRows.findIndex(
        (r, i) =>
          r.exactMatch === true && firstWidened >= 0 && i > firstWidened,
      );
      out(
        `  sectioning     : firstWidenedAt=${firstWidened} exactAfterWidened=${lateExact >= 0 ? 'VIOLATION@' + lateExact : 'none'}`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  Logger.error(e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
