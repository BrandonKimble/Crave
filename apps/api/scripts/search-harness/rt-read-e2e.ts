/**
 * @script-class: probe
 * @finding: red-team pass over the user-facing READ surfaces, end to end. Banked in
 * audit/FINDINGS.md (2026-08-02 red-team pass).
 */
/* RED TEAM: user-facing READ surfaces, executed end-to-end. Read-only. */
import { bootstrap } from './_shared';
import { SearchService } from '../../src/modules/search/search.service';
import { PrismaService } from '../../src/prisma/prisma.service';

async function idOf(prisma: any, name: string, type: string) {
  const r: any[] = await prisma.$queryRawUnsafe(
    `SELECT entity_id, name, status FROM core_entities WHERE lower(name)=lower($1) AND type=$2::entity_type ORDER BY (status='active') DESC LIMIT 1`,
    name,
    type,
  );
  return r[0];
}

async function run(search: any, label: string, req: any) {
  const t = Date.now();
  try {
    const res = await search.runQuery(req);
    console.log(
      `\n### ${label}  (${Date.now() - t}ms)\n` +
        `  dishes=${res.dishes?.length ?? 0} restaurants=${res.restaurants?.length ?? 0} ` +
        `totalDishes=${res.metadata?.totalDishes} totalRestaurants=${res.metadata?.totalRestaurants} ` +
        `stage=${res.metadata?.relaxationStage} coverage=${res.metadata?.resultCoverageStatus}`,
    );
    console.log(
      '  top restaurants:',
      (res.restaurants ?? [])
        .slice(0, 5)
        .map((r: any) => r.name)
        .join(' | '),
    );
    console.log(
      '  top dishes:',
      (res.dishes ?? [])
        .slice(0, 5)
        .map((d: any) => `${d.foodName ?? d.name}@${d.restaurantName}`)
        .join(' | '),
    );
    return res;
  } catch (e: any) {
    console.log(`\n### ${label}  *** THREW *** ${e?.message}`);
    return null;
  }
}

async function main() {
  const app = await bootstrap();
  const search = app.get(SearchService);
  const prisma = app.get(PrismaService);

  const tacos = await idOf(prisma, 'breakfast tacos', 'food');
  const mexican = await idOf(prisma, 'mexican', 'restaurant_attribute');
  const patio = await idOf(prisma, 'patio', 'restaurant_attribute');
  const bbqAttr = await idOf(prisma, 'bbq', 'restaurant_attribute');
  console.log('resolved seeds:', { tacos, mexican, patio, bbqAttr });

  const results: any = {};
  results.dish = await run(search, 'DISH: breakfast tacos (strict)', {
    entities: {
      food: [
        { normalizedName: 'breakfast tacos', entityIds: [tacos?.entity_id] },
      ],
    },
    pagination: { page: 1, pageSize: 20 },
  });
  if (mexican)
    results.cuisine = await run(
      search,
      'CUISINE: mexican (restaurant_attribute)',
      {
        entities: {
          restaurantAttributes: [
            { normalizedName: 'mexican', entityIds: [mexican.entity_id] },
          ],
        },
        pagination: { page: 1, pageSize: 20 },
      },
    );
  if (patio)
    results.patio = await run(search, 'ATTRIBUTE: patio', {
      entities: {
        restaurantAttributes: [
          { normalizedName: 'patio', entityIds: [patio.entity_id] },
        ],
      },
      pagination: { page: 1, pageSize: 20 },
    });
  if (tacos && patio)
    results.combo = await run(search, 'COMBO: breakfast tacos + patio', {
      entities: {
        food: [
          { normalizedName: 'breakfast tacos', entityIds: [tacos.entity_id] },
        ],
        restaurantAttributes: [
          { normalizedName: 'patio', entityIds: [patio.entity_id] },
        ],
      },
      pagination: { page: 1, pageSize: 20 },
    });

  // ARCHIVED ATTRIBUTE ARM: bbq restaurant_attribute is ARCHIVED in the mirror.
  if (bbqAttr)
    results.bbqArchived = await run(
      search,
      `ARCHIVED-ATTR: bbq (status=${bbqAttr.status})`,
      {
        entities: {
          restaurantAttributes: [
            { normalizedName: 'bbq', entityIds: [bbqAttr.entity_id] },
          ],
        },
        pagination: { page: 1, pageSize: 20 },
      },
    );

  // HOSTILE: garbage / nonexistent ids
  results.badId = await run(search, 'HOSTILE: non-existent uuid', {
    entities: {
      food: [
        {
          normalizedName: 'zzz',
          entityIds: ['00000000-0000-0000-0000-000000000000'],
        },
      ],
    },
    pagination: { page: 1, pageSize: 20 },
  });
  results.empty = await run(search, 'HOSTILE: empty entities', {
    entities: {},
  });
  results.noIds = await run(search, 'HOSTILE: name only, no ids', {
    entities: { food: [{ normalizedName: 'breakfast tacos', entityIds: [] }] },
  });

  // ARCHIVED RESTAURANT DIRECT: pick an archived restaurant that still has a score row
  const arch = await prisma.$queryRawUnsafe<any[]>(
    `SELECT e.entity_id, e.name FROM core_public_entity_scores s JOIN core_entities e ON e.entity_id=s.subject_id WHERE e.status='archived' AND e.type='restaurant' LIMIT 1`,
  );
  if (arch.length) {
    console.log('\n### archived-but-scored restaurant probe:', arch[0]);
    try {
      const prof = await search.getRestaurantProfile(arch[0].entity_id);
      console.log(
        '  getRestaurantProfile RETURNED:',
        prof ? `name=${(prof as any).name ?? '(shape)'} ` : 'null',
      );
    } catch (e: any) {
      console.log('  getRestaurantProfile threw:', e?.message);
    }
    try {
      // (F1255) This call passed a second argument that the method has not
      // accepted for some time — rot the tsconfig exclusion hid until it was
      // removed 2026-08-03.
      const dishes = await search.listRestaurantDishes(arch[0].entity_id);
      console.log(
        '  listRestaurantDishes RETURNED:',
        JSON.stringify(dishes).slice(0, 200),
      );
    } catch (e: any) {
      console.log('  listRestaurantDishes threw:', e?.message);
    }
  }

  await app.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
