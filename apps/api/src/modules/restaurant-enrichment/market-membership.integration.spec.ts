/**
 * MARKET MEMBERSHIP AT GROUNDING (v17 S4) — against a REAL Postgres+PostGIS.
 *
 * The ruled behavior: a grounded place outside every crediting community's
 * market (engine territory geometry, or within 50 mi of its centroid) is
 * excluded deterministically — `market_excluded_at` set, row NEVER deleted —
 * and a re-grounding that moves it in-market clears the verdict on the same
 * reconcile. Fail-open: no crediting evidence, or no geometry, or no
 * coordinates ⇒ in market.
 *
 * The fixture builds a private community (engine → member place → PostGIS
 * envelope around Austin) and four restaurants credited through ACTIVE
 * events: one inside the polygon, one outside it but within the 50-mile
 * radius (a suburb — the reason the radius exists: territory is the CITY
 * polygon), one in Corpus Christi (~180 mi), and one far away with NO
 * crediting evidence.
 *
 * Run: yarn test:db (DATABASE_URL required; fails loudly, never skips).
 */
import { PrismaClient } from '@prisma/client';
import { MarketMembershipService } from './market-membership.service';
import { writePlaceEvents } from '../content-processing/reddit-collector/extraction-scope.service';

const TAG = 'itest-market-membership';
const prisma = new PrismaClient();

const IN_ID = '88888888-8888-4888-8888-888888880001';
const SUBURB_ID = '88888888-8888-4888-8888-888888880002';
const FAR_ID = '88888888-8888-4888-8888-888888880003';
const NOEVID_ID = '88888888-8888-4888-8888-888888880004';
const FOOD_ID = '88888888-8888-4888-8888-888888880005';
const TERRITORY_PLACE_ID = '88888888-8888-4888-8888-888888880010';
const ENGINE_ID = '88888888-8888-4888-8888-888888880011';
const CREDITED = [IN_ID, SUBURB_ID, FAR_ID];
const ALL = [...CREDITED, NOEVID_ID];

const noopLogger = () => {
  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return logger;
};

let runId: string;
let inputId: string;
// The reconcile marks the rescore dirty on re-inclusion (§12.6: markDirty is
// the only enqueue collection paths may call) — stub it and assert on it.
const markDirty = jest.fn(() => Promise.resolve());
const service = () =>
  new MarketMembershipService(
    prisma as never,
    noopLogger() as never,
    { markDirty } as never,
  );

const excludedAt = async (id: string) =>
  (
    await prisma.entity.findUniqueOrThrow({
      where: { entityId: id },
      select: { marketExcludedAt: true },
    })
  ).marketExcludedAt;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required — this spec must not skip');
  }

  // Territory: engine → member place → PostGIS envelope over central Austin.
  await prisma.place.create({
    data: {
      placeId: TERRITORY_PLACE_ID,
      name: `${TAG}-austin`,
      providerLevelCode: 'Municipality',
      countryCode: 'US',
      providerPlaceId: `${TAG}-tt-austin`,
    },
  });
  await prisma.$executeRaw`
    INSERT INTO place_geometries (place_id, geometry)
    VALUES (${TERRITORY_PLACE_ID}::uuid,
            ST_Multi(ST_SetSRID(ST_MakeEnvelope(-98.0, 30.1, -97.5, 30.5), 4326)))
  `;
  await prisma.engine.create({
    data: {
      engineId: ENGINE_ID,
      name: `${TAG}-engine`,
      memberPlaceIds: [TERRITORY_PLACE_ID],
    },
  });
  await prisma.source.create({
    data: { platform: 'reddit', handle: TAG, engineId: ENGINE_ID },
  });

  const run = await prisma.extractionRun.create({
    data: {
      pipeline: 'test',
      model: 'test',
      systemPromptHash: TAG,
      status: 'completed',
    },
  });
  runId = run.extractionRunId;
  const input = await prisma.extractionInput.create({
    data: { extractionRunId: runId, inputIndex: 0, inputPayload: {} },
  });
  inputId = input.inputId;

  const spots: Array<[string, number, number]> = [
    [IN_ID, 30.2672, -97.7431], // downtown Austin — inside the polygon
    [SUBURB_ID, 30.6, -97.6], // outside the polygon, ~23 mi from centroid
    [FAR_ID, 27.8006, -97.3964], // Corpus Christi — ~180 mi
    [NOEVID_ID, 27.8006, -97.3964], // far too, but nothing credits it
  ];
  for (const [id, lat, lng] of spots) {
    await prisma.entity.create({
      data: { entityId: id, name: `${TAG}-${id.slice(-1)}`, type: 'place' },
    });
    await prisma.placeLocation.create({
      data: {
        placeId: id,
        googlePlaceId: `${TAG}-${id.slice(-4)}`,
        address: '1 Test St',
        latitude: lat,
        longitude: lng,
        isPrimary: true,
      },
    });
  }

  for (const id of CREDITED) {
    const doc = await prisma.sourceDocument.create({
      data: {
        platform: 'reddit',
        community: TAG,
        sourceType: 'post',
        sourceId: `${TAG}-${id.slice(-4)}`,
        sourceCreatedAt: new Date(),
        activeExtractionRunId: runId,
      },
    });
    // through THE door (event-ledger chokepoint): redirects resolve at
    // insert time even in a fixture.
    await writePlaceEvents(prisma, [
      {
        extractionRunId: runId,
        inputId,
        sourceDocumentId: doc.documentId,
        placeId: id,
        mentionKey: `${TAG}-${id.slice(-4)}`,
        evidenceType: 'general_praise',
        mentionedAt: new Date(),
      },
    ]);
  }
});

afterAll(async () => {
  await prisma.placeEvent.deleteMany({ where: { extractionRunId: runId } });
  await prisma.sourceDocument.deleteMany({ where: { community: TAG } });
  await prisma.extractionInput.deleteMany({
    where: { extractionRunId: runId },
  });
  await prisma.extractionRun.deleteMany({ where: { extractionRunId: runId } });
  await prisma.source.deleteMany({ where: { handle: TAG } });
  await prisma.engine.deleteMany({ where: { engineId: ENGINE_ID } });
  await prisma.$executeRaw`DELETE FROM place_geometries WHERE place_id = ${TERRITORY_PLACE_ID}::uuid`;
  await prisma.place.deleteMany({ where: { placeId: TERRITORY_PLACE_ID } });
  await prisma.connection.deleteMany({ where: { placeId: { in: ALL } } });
  await prisma.entity.deleteMany({ where: { entityId: FOOD_ID } });
  // Deleting the run cascades its core_public_entity_scores rows.
  await prisma.craveScoreRun.deleteMany({
    where: { scoreVersion: `${TAG}-v` },
  });
  await prisma.placeLocation.deleteMany({ where: { placeId: { in: ALL } } });
  await prisma.entity.deleteMany({ where: { entityId: { in: ALL } } });
  await prisma.$disconnect();
});

describe('market membership reconciler (v17 S4)', () => {
  it('a place inside the crediting territory stays in market', async () => {
    await service().reconcile(IN_ID);
    expect(await excludedAt(IN_ID)).toBeNull();
  });

  it('a suburb outside the CITY polygon but within 50 mi stays in market (the radius exists for exactly this)', async () => {
    await service().reconcile(SUBURB_ID);
    expect(await excludedAt(SUBURB_ID)).toBeNull();
  });

  it('a genuinely out-of-market grounding (Corpus Christi, ~180 mi) is EXCLUDED — and never deleted', async () => {
    await service().reconcile(FAR_ID);
    expect(await excludedAt(FAR_ID)).not.toBeNull();
    // the law: exclusion is a verdict column, the row survives
    const row = await prisma.entity.findUnique({ where: { entityId: FAR_ID } });
    expect(row).not.toBeNull();
  });

  it('fail-open: a place with NO crediting evidence is never excluded, wherever it sits', async () => {
    await service().reconcile(NOEVID_ID);
    expect(await excludedAt(NOEVID_ID)).toBeNull();
  });

  it('a re-grounding that moves the place in-market CLEARS the verdict on the same reconcile', async () => {
    await service().reconcile(FAR_ID);
    expect(await excludedAt(FAR_ID)).not.toBeNull();
    await prisma.placeLocation.updateMany({
      where: { placeId: FAR_ID },
      data: { latitude: 30.27, longitude: -97.74 },
    });
    await service().reconcile(FAR_ID);
    expect(await excludedAt(FAR_ID)).toBeNull();
    // restore for other tests' determinism
    await prisma.placeLocation.updateMany({
      where: { placeId: FAR_ID },
      data: { latitude: 27.8006, longitude: -97.3964 },
    });
  });
});

describe('verdict → score-pool coupling (red-team L3 F2)', () => {
  const scoreRow = (
    scoreRunId: string,
    subjectType: 'restaurant' | 'connection',
    subjectId: string,
  ) => ({
    subjectType,
    subjectId,
    scoreRunId,
    endorsementRaw: 1,
    percentileRank: 0.5,
    displayScore: 7.5,
    scoreVersion: `${TAG}-v`,
    displayCurveVersion: `${TAG}-v`,
  });

  it('excluding a scored place DELETES its restaurant AND dish score rows in the SAME reconcile — no waiting for the nightly rebuild', async () => {
    // Start FAR in-market so the reconcile produces a fresh EXCLUDED verdict.
    await prisma.placeLocation.updateMany({
      where: { placeId: FAR_ID },
      data: { latitude: 30.27, longitude: -97.74 },
    });
    await service().reconcile(FAR_ID);
    expect(await excludedAt(FAR_ID)).toBeNull();

    // Seed the score pool: FAR's restaurant row, one of FAR's dish
    // (connection) rows, and an untargeted control row for IN.
    await prisma.entity.create({
      data: { entityId: FOOD_ID, name: `${TAG}-food`, type: 'item' },
    });
    const connection = await prisma.connection.create({
      data: { placeId: FAR_ID, itemId: FOOD_ID },
    });
    const run = await prisma.craveScoreRun.create({
      data: {
        scoreVersion: `${TAG}-v`,
        displayCurveVersion: `${TAG}-v`,
        displayMin: 0,
        displayMax: 10,
        recencyReferenceDate: new Date(),
      },
    });
    await prisma.publicEntityScore.createMany({
      data: [
        scoreRow(run.scoreRunId, 'restaurant', FAR_ID),
        scoreRow(run.scoreRunId, 'connection', connection.connectionId),
        scoreRow(run.scoreRunId, 'restaurant', IN_ID),
      ],
    });

    // Move FAR back out of market; the reconcile flips the verdict AND
    // prunes the pool atomically.
    await prisma.placeLocation.updateMany({
      where: { placeId: FAR_ID },
      data: { latitude: 27.8006, longitude: -97.3964 },
    });
    await service().reconcile(FAR_ID);
    expect(await excludedAt(FAR_ID)).not.toBeNull();

    const remaining = await prisma.publicEntityScore.findMany({
      where: { scoreRunId: run.scoreRunId },
      select: { subjectType: true, subjectId: true },
    });
    expect(remaining).toEqual([
      { subjectType: 'restaurant', subjectId: IN_ID },
    ]);
  });

  it('re-inclusion marks the rescore dirty (the §12.6 enqueue) so the pool re-admits the place', async () => {
    expect(await excludedAt(FAR_ID)).not.toBeNull();
    markDirty.mockClear();
    await prisma.placeLocation.updateMany({
      where: { placeId: FAR_ID },
      data: { latitude: 30.27, longitude: -97.74 },
    });
    await service().reconcile(FAR_ID);
    expect(await excludedAt(FAR_ID)).toBeNull();
    expect(markDirty).toHaveBeenCalledTimes(1);
    // restore
    await prisma.placeLocation.updateMany({
      where: { placeId: FAR_ID },
      data: { latitude: 27.8006, longitude: -97.3964 },
    });
    await service().reconcile(FAR_ID);
  });
});
