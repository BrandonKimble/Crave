/**
 * MUTATION PROOFS for the D5 venue-cuisine evidence lanes, proven against
 * Postgres (run: yarn test:db — needs DATABASE_URL, a dev database).
 *
 *  - NAME LANE writes venue_name evidence for a cuisine-vocab word in the
 *    venue's name; the PROJECTION outvotes the measured homograph pattern:
 *    * "Texas French Bread" (product-counter venue kind) — french must
 *      NOT reach restaurant_attributes while bakery does;
 *    * "French Quarter Grille" (contrary cuisine evidence) — cajun wins;
 *    and admits the honest pattern:
 *    * corroborated ("Aha Indian" + reddit testimony);
 *    * unopposed ungrounded ("Chaba Thai" — the name is the only
 *      knowledge there is).
 *  - MUSEUM GATE: a grounded non-food venue writes no name evidence.
 *  - DISH-SET LANE derives majority-share venue cuisine from the dishes'
 *    knowledge_cuisines, is idempotent, and RECOMBINES: dish-set evidence
 *    corroborates a name claim a product venue would otherwise outvote.
 *
 * Positive directions are asserted everywhere so a vacuously-green spec
 * is unrepresentable.
 */
import { PrismaClient } from '@prisma/client';
import { VenueCuisineEvidenceService } from './venue-cuisine-evidence.service';
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

// Cuisine vocab names are invented single tokens carrying the tag so the
// matcher can only ever bind them to this spec's own places (never to the
// real corpus the dev database holds).
const FRENCH = `${TEST_TAG}french`;
const CAJUN = `${TEST_TAG}cajun`;
const INDIAN = `${TEST_TAG}indian`;
const THAI = `${TEST_TAG}thai`;

let bakeryAttrId: string;
let bakeryAttrCreated = false;

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

async function ensureBakeryAttribute(): Promise<void> {
  // The vote reads the REAL venue-kind vocabulary name ('bakery', from the
  // one-authority type map). Reuse the corpus row when the dev database has
  // one; create (and later remove) it otherwise.
  const existing = await prisma.entity.findFirst({
    where: { type: 'place_attribute', name: 'bakery', status: 'active' },
    select: { entityId: true },
  });
  if (existing) {
    bakeryAttrId = existing.entityId;
    return;
  }
  bakeryAttrId = await seedEntity('bakery', 'place_attribute', {
    facet: 'venue_kind',
    status: 'active',
  });
  bakeryAttrCreated = true;
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
  await ensureBakeryAttribute();
});
afterAll(async () => {
  await cleanup();
  if (bakeryAttrCreated) {
    await prisma.placeAttributeEvidence.deleteMany({
      where: { attributeId: bakeryAttrId },
    });
    await prisma.entity.deleteMany({ where: { entityId: bakeryAttrId } });
  }
  await prisma.$disconnect();
});

jest.setTimeout(120_000);

describe('name lane + projection vote', () => {
  let french: string;
  let cajun: string;
  let indian: string;
  let thai: string;

  beforeAll(async () => {
    french = await seedEntity(FRENCH, 'place_attribute', {
      facet: 'cuisine',
      status: 'active',
    });
    cajun = await seedEntity(CAJUN, 'place_attribute', {
      facet: 'cuisine',
      status: 'active',
    });
    indian = await seedEntity(INDIAN, 'place_attribute', {
      facet: 'cuisine',
      status: 'active',
    });
    thai = await seedEntity(THAI, 'place_attribute', {
      facet: 'cuisine',
      status: 'active',
    });
  });

  it('the Texas French Bread homograph is outvoted by the product venue kind', async () => {
    const place = await seedEntity(
      `${TEST_TAG} texas ${FRENCH} bread`,
      'place',
    );
    await prisma.placeAttributeEvidence.create({
      data: {
        placeId: place,
        attributeId: bakeryAttrId,
        sourceClass: 'places_api',
        observations: 1,
      },
    });

    const report = await service.reconcile({ placeIds: [place] });

    // The lane WRITES the row (the vote lives in the projection, not in a
    // hidden write-time word list)…
    const nameRow = await prisma.placeAttributeEvidence.findUnique({
      where: {
        placeId_attributeId_sourceClass: {
          placeId: place,
          attributeId: french,
          sourceClass: 'venue_name',
        },
      },
    });
    expect(nameRow).not.toBeNull();
    expect(report.nameLane.inserted).toBeGreaterThan(0);

    // …and the projection outvotes it: bakery projects, french does not.
    const attrs = await attributesOf(place);
    expect(attrs).toContain(bakeryAttrId);
    expect(attrs).not.toContain(french);
  });

  it('contrary cuisine evidence outvotes the name claim (French Quarter Grille)', async () => {
    const place = await seedEntity(
      `${TEST_TAG} quarter ${FRENCH} grille`,
      'place',
    );
    await prisma.placeAttributeEvidence.create({
      data: {
        placeId: place,
        attributeId: cajun,
        sourceClass: 'places_api',
        observations: 1,
      },
    });

    await service.reconcile({ placeIds: [place] });

    const attrs = await attributesOf(place);
    expect(attrs).toContain(cajun);
    expect(attrs).not.toContain(french);
  });

  it('ARCHIVED evidence neither corroborates nor opposes — the Bhatti class projects (acceptance fix 2026-08-30)', async () => {
    // Bhatti Indian Grill: the name lane resolves the ACTIVE indian id, while
    // a pre-registry places_api row still points at an ARCHIVED twin of the
    // SAME cuisine. The archived row cannot corroborate (the projection's
    // outer join is active-only), and it must not OPPOSE either — before the
    // status filter on the oppose subquery, this dead id outvoted the very
    // tag it asserted, and the place lost its cuisine entirely.
    const archivedIndianTwin = await seedEntity(
      `${TEST_TAG}indian archived twin`,
      'place_attribute',
      { facet: 'cuisine', status: 'archived' },
    );
    const place = await seedEntity(
      `${TEST_TAG} bhatti ${INDIAN} grill`,
      'place',
    );
    await prisma.placeAttributeEvidence.create({
      data: {
        placeId: place,
        attributeId: archivedIndianTwin,
        sourceClass: 'places_api',
        observations: 1,
      },
    });

    await service.reconcile({ placeIds: [place] });

    const attrs = await attributesOf(place);
    // The name vote stands unopposed; the archived twin never projects.
    expect(attrs).toContain(indian);
    expect(attrs).not.toContain(archivedIndianTwin);
  });

  it('a corroborated name claim projects (Aha Indian + testimony)', async () => {
    const place = await seedEntity(`${TEST_TAG} aha ${INDIAN}`, 'place');
    await prisma.placeAttributeEvidence.create({
      data: {
        placeId: place,
        attributeId: indian,
        sourceClass: 'reddit_evidence',
        observations: 2,
      },
    });

    await service.reconcile({ placeIds: [place] });

    const attrs = await attributesOf(place);
    expect(attrs).toContain(indian);
  });

  it('an unopposed ungrounded place keeps its name cuisine (Chaba Thai)', async () => {
    const place = await seedEntity(`${TEST_TAG} chaba ${THAI}`, 'place');

    await service.reconcile({ placeIds: [place] });

    const attrs = await attributesOf(place);
    expect(attrs).toContain(thai);
  });

  it('a grounded non-food venue writes no name evidence (the museum gate)', async () => {
    const place = await seedEntity(
      `${TEST_TAG} museum of ${THAI} history`,
      'place',
      {
        placeMetadata: {
          googlePlaces: {
            types: ['museum', 'tourist_attraction', 'point_of_interest'],
          },
        },
      },
    );

    const report = await service.reconcile({ placeIds: [place] });

    expect(report.nameLane.skippedNonFoodVenues).toBeGreaterThan(0);
    const rows = await prisma.placeAttributeEvidence.findMany({
      where: { placeId: place, sourceClass: 'venue_name' },
    });
    expect(rows).toHaveLength(0);
    expect(await attributesOf(place)).not.toContain(thai);
  });

  it('a dropped vocabulary match is retracted on the next reconcile (idempotent correction)', async () => {
    const place = await seedEntity(`${TEST_TAG} chaba two ${THAI}`, 'place');
    await service.reconcile({ placeIds: [place] });
    expect(await attributesOf(place)).toContain(thai);

    // The vocabulary changes (the cuisine is archived): the lane's next
    // recompute deletes its row and the projection drops the id.
    await prisma.entity.update({
      where: { entityId: thai },
      data: { status: 'archived' },
    });
    const report = await service.reconcile({ placeIds: [place] });
    expect(report.nameLane.deleted).toBeGreaterThan(0);
    expect(await attributesOf(place)).not.toContain(thai);

    await prisma.entity.update({
      where: { entityId: thai },
      data: { status: 'active' },
    });
  });
});

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

  it('dish-set evidence corroborates a name claim a product venue would outvote (recombination)', async () => {
    const place = await seedEntity(
      `${TEST_TAG} panaderia ${TEST_TAG}dmex bread`,
      'place',
    );
    // Product-counter venue kind: alone, this outvotes the name claim…
    await prisma.placeAttributeEvidence.create({
      data: {
        placeId: place,
        attributeId: bakeryAttrId,
        sourceClass: 'places_api',
        observations: 1,
      },
    });
    // …but the kitchen's own praised dishes agree with the name.
    const dishes = await Promise.all([
      seedDish(`${TEST_TAG} concha`, [mexD]),
      seedDish(`${TEST_TAG} torta`, [mexD]),
    ]);
    for (const dish of dishes) {
      await prisma.connection.create({
        data: { placeId: place, itemId: dish, itemAttributes: [] },
      });
    }

    await service.reconcile({ placeIds: [place] });

    const attrs = await attributesOf(place);
    expect(attrs).toContain(mexD); // corroborated by dish_set -> projected
    expect(attrs).toContain(bakeryAttrId);
  });

  it('dry run computes the diff but writes nothing', async () => {
    const place = await seedEntity(`${TEST_TAG} dry ${TEST_TAG}dthai`, 'place');
    const report = await service.reconcile({
      placeIds: [place],
      dryRun: true,
    });
    expect(report.nameLane.desired).toBeGreaterThan(0);
    const rows = await prisma.placeAttributeEvidence.findMany({
      where: { placeId: place },
    });
    expect(rows).toHaveLength(0);
    expect(await attributesOf(place)).toHaveLength(0);
  });
});
