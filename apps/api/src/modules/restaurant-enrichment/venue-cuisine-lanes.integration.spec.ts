/**
 * MUTATION PROOFS for the D5 dish-set venue-cuisine evidence lane, proven
 * against Postgres (run: yarn test:db — needs DATABASE_URL, a dev database).
 *
 *  - DISH-SET LANE derives majority-share venue cuisine from the dishes'
 *    knowledge_cuisines, is idempotent, and projects through the plain
 *    active-only union (archived attribute ids never reach the column).
 *  - DRY RUN computes the diff but writes nothing.
 *
 * (The former venue_name lane and its projection vote were deleted
 * 2026-08-30 — the venue name is now an input of the LLM venue-facts
 * judge; the Texas-French-Bread homograph class is pinned in
 * scripts/fixtures/cuisine-gold-cases.json.)
 *
 * Positive directions are asserted everywhere so a vacuously-green spec
 * is unrepresentable.
 */
import { PrismaClient } from '@prisma/client';
import { VenueCuisineEvidenceService } from './venue-cuisine-evidence.service';
import { derivePlaceAttributes } from '../content-processing/reddit-collector/place-attribute-projection';
import { identityInsertData } from '../content-processing/entity-resolver/entity-identity';

const TEST_TAG = 'itestvc';

const prisma = new PrismaClient();

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

const service = new VenueCuisineEvidenceService(prisma as never, logger);

async function seedEntity(
  name: string,
  type: 'place_attribute' | 'item' | 'place',
  extra: Record<string, unknown> = {},
): Promise<string> {
  const created = await prisma.entity.create({
    data: {
      name,
      type,
      ...identityInsertData(name, type),
      ...extra,
    } as never,
    select: { entityId: true },
  });
  return created.entityId;
}

async function cleanup(): Promise<void> {
  const rows = await prisma.entity.findMany({
    where: { name: { startsWith: TEST_TAG } },
    select: { entityId: true },
  });
  const ids = rows.map((row) => row.entityId);
  if (ids.length) {
    await prisma.connection.deleteMany({
      where: { OR: [{ placeId: { in: ids } }, { itemId: { in: ids } }] },
    });
    await prisma.placeAttributeEvidence.deleteMany({
      where: { OR: [{ placeId: { in: ids } }, { attributeId: { in: ids } }] },
    });
    await prisma.entitySurface.deleteMany({
      where: { entityId: { in: ids } },
    });
    await prisma.entity.deleteMany({ where: { entityId: { in: ids } } });
  }
}

async function attributesOf(placeId: string): Promise<string[]> {
  const row = await prisma.entity.findUniqueOrThrow({
    where: { entityId: placeId },
    select: { placeAttributes: true },
  });
  return row.placeAttributes;
}

beforeAll(async () => {
  await cleanup();
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

jest.setTimeout(120_000);

describe('dish-set lane', () => {
  let thaiD: string;
  let mexD: string;

  beforeAll(async () => {
    thaiD = await seedEntity(`${TEST_TAG}dthai`, 'place_attribute', {
      facet: 'cuisine',
      status: 'active',
    });
    mexD = await seedEntity(`${TEST_TAG}dmex`, 'place_attribute', {
      facet: 'cuisine',
      status: 'active',
    });
  });

  async function seedDish(name: string, cuisines: string[]): Promise<string> {
    return seedEntity(name, 'item', {
      knowledgeCuisines: cuisines,
      knowledgeSynthesizedAt: new Date(),
      knowledgePromptVersion: 2,
    });
  }

  it('claims the majority cuisine of the praised dish set and is idempotent', async () => {
    const place = await seedEntity(`${TEST_TAG} dish set place`, 'place');
    const dishes = await Promise.all([
      seedDish(`${TEST_TAG} pad see ew`, [thaiD]),
      seedDish(`${TEST_TAG} khao soi`, [thaiD]),
      seedDish(`${TEST_TAG} larb`, [thaiD]),
      seedDish(`${TEST_TAG} stray taco`, [mexD]),
    ]);
    for (const dish of dishes) {
      await prisma.connection.create({
        data: { placeId: place, itemId: dish, itemAttributes: [] },
      });
    }

    const first = await service.reconcile({ placeIds: [place] });
    expect(first.dishSetLane.inserted).toBe(1);

    const rows = await prisma.placeAttributeEvidence.findMany({
      where: { placeId: place, sourceClass: 'dish_set' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].attributeId).toBe(thaiD);
    expect(rows[0].observations).toBe(3); // support = distinct connections

    const attrs = await attributesOf(place);
    expect(attrs).toContain(thaiD); // majority projects
    expect(attrs).not.toContain(mexD); // 1-of-4 minority never claims

    // Idempotent: a second pass diffs to zero for this lane.
    const second = await service.reconcile({ placeIds: [place] });
    expect(second.dishSetLane.inserted).toBe(0);
    expect(second.dishSetLane.deleted).toBe(0);
    expect(await attributesOf(place)).toContain(thaiD);
  });

  it('an ARCHIVED cuisine attribution never reaches the read column (Bhatti class)', async () => {
    const archived = await seedEntity(
      `${TEST_TAG}darchived`,
      'place_attribute',
      { facet: 'cuisine', status: 'archived' },
    );
    const place = await seedEntity(`${TEST_TAG} archived place`, 'place');
    // A stale evidence row pointing at a dead vocabulary id: the projection's
    // active-only join drops it; the live claim still projects beside it.
    await prisma.placeAttributeEvidence.createMany({
      data: [
        {
          placeId: place,
          attributeId: archived,
          sourceClass: 'places_api',
          observations: 1,
        },
        {
          placeId: place,
          attributeId: mexD,
          sourceClass: 'places_api',
          observations: 1,
        },
      ],
    });

    await derivePlaceAttributes(prisma, [place]);

    const attrs = await attributesOf(place);
    expect(attrs).toContain(mexD);
    expect(attrs).not.toContain(archived);
  });

  it('dry run computes the diff but writes nothing', async () => {
    const place = await seedEntity(`${TEST_TAG} dry run place`, 'place');
    const dishes = await Promise.all([
      seedDish(`${TEST_TAG} dry khao man gai`, [thaiD]),
      seedDish(`${TEST_TAG} dry pad kra pao`, [thaiD]),
    ]);
    for (const dish of dishes) {
      await prisma.connection.create({
        data: { placeId: place, itemId: dish, itemAttributes: [] },
      });
    }

    const report = await service.reconcile({
      placeIds: [place],
      dryRun: true,
    });
    expect(report.dishSetLane.desired).toBeGreaterThan(0);
    const rows = await prisma.placeAttributeEvidence.findMany({
      where: { placeId: place },
    });
    expect(rows).toHaveLength(0);
    expect(await attributesOf(place)).toHaveLength(0);
  });
});
