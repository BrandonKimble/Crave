import { bootstrap, out } from './_shared';
import { SearchService } from '../../src/modules/search/search.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import type { SearchQueryRequestDto } from '../../src/modules/search/dto/search-query.dto';
async function main() {
  const app = await bootstrap();
  try {
    const search = app.get(SearchService);
    const prisma = app.get(PrismaService);
    const rows = await prisma.$queryRawUnsafe<{ entity_id: string }[]>(
      `SELECT entity_id FROM core_entities WHERE lower(name)='dessert' AND type='food' AND status='active' LIMIT 1`,
    );
    const id = rows[0]?.entity_id;
    for (const page of [1, 2, 3]) {
      const res = await search.runQuery({
        entities: { food: [{ normalizedName: 'dessert', entityIds: [id] }] },
        pagination: { page, pageSize: 20 },
      } as unknown as SearchQueryRequestDto);
      const meta = res.metadata as unknown as Record<string, unknown>;
      out(
        `page ${page}: dishes=${res.dishes?.length} restaurants=${res.restaurants?.length} totals=${String(meta?.totalFoodResults)}/${String(meta?.totalRestaurantResults)} metaPage=${(meta as any)?.page} pageSize=${(meta as any)?.pageSize}`,
      );
    }
  } finally {
    await app.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
