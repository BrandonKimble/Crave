/**
 * REDIRECT RESOLUTION AT EVENT-WRITE TIME — against a REAL Postgres.
 *
 * The invariant under test (2026-08-11 convergence audit, change #1): "no
 * new event references a merged-away entity" is owned by the write
 * chokepoints (writeRestaurantEvents / writeRestaurantEntityEvents), and the
 * nightly tombstone sweep is only the crash-window BACKSTOP.
 *
 * MUTATION PROOFS (each direction can go RED):
 *  - strip the activeWinnerRedirectMap lookup from either chokepoint →
 *    the "lands on the winner" assertions fail (rows stay on the loser);
 *  - drop skipDuplicates → the collision test throws P2002;
 *  - break the sweep's restaurant-dimension repoint → the backstop test
 *    fails (the synthetically-stranded event stays on the tombstone).
 *
 * Run: yarn test:db (needs DATABASE_URL — a dev database, never prod).
 */
import { PrismaClient } from '@prisma/client';
import {
  activeWinnerRedirectMap,
  writePlaceEntityEvents,
  writePlaceEvents,
} from './extraction-scope.service';
import { ProjectionRebuildService } from './projection-rebuild.service';

const TEST_TAG = 'itest-redirect-write';

const prisma = new PrismaClient();

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

const ids = {
  loserPlace: '',
  winnerPlace: '',
  loserItem: '',
  winnerItem: '',
  runId: '',
  inputId: '',
  documentId: '',
};

async function seedEntity(
  label: string,
  type: 'place' | 'item',
  status: 'active' | 'archived',
): Promise<string> {
  const row = await prisma.entity.create({
    data: { name: `${TEST_TAG}:${label}`, type, status },
    select: { entityId: true },
  });
  return row.entityId;
}

async function cleanup(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DELETE FROM core_restaurant_item_mentions m
    USING core_restaurant_items i, core_entities e
    WHERE m.connection_id = i.connection_id
      AND i.restaurant_id = e.entity_id
      AND e.name LIKE '${TEST_TAG}:%'`);
  for (const table of [
    'core_restaurant_items',
    'core_restaurant_entity_signals',
  ]) {
    await prisma.$executeRawUnsafe(`
      DELETE FROM ${table} t
      USING core_entities e
      WHERE t.restaurant_id = e.entity_id AND e.name LIKE '${TEST_TAG}:%'`);
  }
  await prisma.$executeRawUnsafe(`
    DELETE FROM core_public_entity_scores s
    USING core_entities e
    WHERE s.subject_id = e.entity_id AND e.name LIKE '${TEST_TAG}:%'`);
  await prisma.$executeRawUnsafe(`
    DELETE FROM entity_redirects r
    USING core_entities e
    WHERE r.from_entity_id = e.entity_id AND e.name LIKE '${TEST_TAG}:%'`);
  // Run delete cascades inputs + events; document is separate (SetNull).
  await prisma.$executeRawUnsafe(
    `DELETE FROM collection_extraction_runs WHERE pipeline = 'itest' AND metadata->>'tag' = '${TEST_TAG}'`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM collection_source_documents WHERE source_id LIKE '${TEST_TAG}%'`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM entity_surface s USING core_entities e
     WHERE s.entity_id = e.entity_id AND e.name LIKE '${TEST_TAG}:%'`,
  );
  await prisma.$executeRawUnsafe(
    `DELETE FROM core_entities WHERE name LIKE '${TEST_TAG}:%'`,
  );
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'redirect-aware-event-write.integration.spec requires DATABASE_URL (a dev database)',
    );
  }
  await cleanup();

  ids.loserPlace = await seedEntity('loser-rest', 'place', 'archived');
  ids.winnerPlace = await seedEntity('winner-rest', 'place', 'active');
  ids.loserItem = await seedEntity('loser-food', 'item', 'archived');
  ids.winnerItem = await seedEntity('winner-food', 'item', 'active');
  await prisma.entityRedirect.createMany({
    data: [
      { fromEntityId: ids.loserPlace, toEntityId: ids.winnerPlace },
      { fromEntityId: ids.loserItem, toEntityId: ids.winnerItem },
    ],
  });

  const run = await prisma.extractionRun.create({
    data: {
      pipeline: 'itest',
      model: 'none',
      systemPromptHash: 'itest-redirect-write',
      status: 'completed',
      metadata: { tag: TEST_TAG },
    },
    select: { extractionRunId: true },
  });
  ids.runId = run.extractionRunId;
  const input = await prisma.extractionInput.create({
    data: {
      extractionRunId: ids.runId,
      inputIndex: 0,
      inputPayload: { tag: TEST_TAG },
    },
    select: { inputId: true },
  });
  ids.inputId = input.inputId;
  const document = await prisma.sourceDocument.create({
    data: {
      platform: 'reddit',
      sourceType: 'post',
      sourceId: `${TEST_TAG}-doc`,
      sourceCreatedAt: new Date(),
      // No activation pointer: the chokepoint and the sweep's restaurant-
      // dimension lane are both independent of the active-run join, and the
      // pointer has one owner (ExtractionScopeService — lockdown lint).
    },
    select: { documentId: true },
  });
  ids.documentId = document.documentId;
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

function entityEventRow(overrides: Record<string, unknown> = {}) {
  return {
    extractionRunId: ids.runId,
    inputId: ids.inputId,
    sourceDocumentId: ids.documentId,
    placeId: ids.loserPlace,
    mentionKey: `${TEST_TAG}:mention`,
    entityId: ids.loserItem,
    entityType: 'item' as const,
    evidenceType: 'food_mention',
    isMenuItem: null,
    mentionedAt: new Date(),
    sourceUpvotes: 1,
    metadata: {},
    ...overrides,
  };
}

describe('the write chokepoint owns the invariant (inline resolution)', () => {
  it('maps only archived→active redirect pairs', async () => {
    const map = await prisma.$transaction((tx) =>
      activeWinnerRedirectMap(tx, [
        ids.loserPlace,
        ids.winnerPlace, // active, no redirect FROM it → absent
        ids.loserItem,
        null,
        undefined,
      ]),
    );
    expect(map.get(ids.loserPlace)).toBe(ids.winnerPlace);
    expect(map.get(ids.loserItem)).toBe(ids.winnerItem);
    expect(map.has(ids.winnerPlace)).toBe(false);
  });

  it('an entity event aimed at a merged-away loser lands on the winner, in BOTH dimensions', async () => {
    await prisma.$transaction((tx) =>
      writePlaceEntityEvents(tx, [entityEventRow()]),
    );
    const rows = await prisma.placeEntityEvent.findMany({
      where: { extractionRunId: ids.runId, evidenceType: 'food_mention' },
      select: { placeId: true, entityId: true },
    });
    expect(rows).toEqual([
      { placeId: ids.winnerPlace, entityId: ids.winnerItem },
    ]);
  });

  it('a restaurant (praise) event aimed at the loser lands on the winner', async () => {
    await prisma.$transaction((tx) =>
      writePlaceEvents(tx, [
        {
          extractionRunId: ids.runId,
          inputId: ids.inputId,
          sourceDocumentId: ids.documentId,
          placeId: ids.loserPlace,
          mentionKey: `${TEST_TAG}:praise`,
          evidenceType: 'general_praise',
          mentionedAt: new Date(),
          sourceUpvotes: 1,
          metadata: {},
        },
      ]),
    );
    const rows = await prisma.placeEvent.findMany({
      where: { extractionRunId: ids.runId },
      select: { placeId: true },
    });
    expect(rows).toEqual([{ placeId: ids.winnerPlace }]);
  });

  it('a re-pointed claim the winner already heard is dropped, not doubled and not thrown', async () => {
    // The winner already holds (run, doc, winner, winnerFood, food_mention)
    // from the first test; writing the LOSER-keyed twin again must no-op.
    await prisma.$transaction((tx) =>
      writePlaceEntityEvents(tx, [
        entityEventRow({ mentionKey: `${TEST_TAG}:dup` }),
      ]),
    );
    const count = await prisma.placeEntityEvent.count({
      where: { extractionRunId: ids.runId, evidenceType: 'food_mention' },
    });
    expect(count).toBe(1);
  });
});

describe('the tombstone sweep remains the crash-window backstop', () => {
  it('repairs a synthetically-stranded event that bypassed the chokepoint', async () => {
    // Simulate the residual race: a writer committed an event onto the loser
    // AFTER its redirect-map read (here: a raw insert that bypasses the
    // chokepoint entirely).
    const [stranded] = await prisma.$queryRawUnsafe<
      Array<{ event_id: string }>
    >(
      `INSERT INTO core_restaurant_entity_events
         (extraction_run_id, input_id, source_document_id, restaurant_id,
          mention_key, entity_id, entity_type, evidence_type, mentioned_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, 'item',
               'menu_item_food', now())
       RETURNING event_id`,
      ids.runId,
      ids.inputId,
      ids.documentId,
      ids.loserPlace,
      `${TEST_TAG}:stranded`,
      ids.winnerItem,
    );

    const rebuild = new ProjectionRebuildService(prisma as never, logger);
    rebuild.onModuleInit();
    await rebuild.sweepTombstoneEvents();

    const healed = await prisma.placeEntityEvent.findUnique({
      where: { eventId: stranded.event_id },
      select: { placeId: true },
    });
    expect(healed?.placeId).toBe(ids.winnerPlace);
  });
});
