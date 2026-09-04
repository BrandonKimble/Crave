/**
 * MUTATION PROOFS for redteam-l2 K1 + K2, proven against Postgres.
 *
 *  - K2 (adjudication reaches every reference site): merge a cuisine id via
 *    applyPlan → `knowledge_cuisines` is repointed and the evidence ledger
 *    collapses onto the canonical; run the grain bridge → the merged
 *    (archived) id must NOT resurrect into food_attributes.
 *  - K1 (the column is a projection of evidence): delete an evidence row,
 *    reconcile via derivePlaceAttributes → restaurant_attributes loses the
 *    id in the same pass.
 *
 * Each proof also asserts the POSITIVE direction (the active id projects /
 * the column gains the id) so a vacuously-green spec is unrepresentable.
 *
 * Run: yarn test:db (needs DATABASE_URL — a dev database, never prod).
 */
import { PrismaClient } from '@prisma/client';
import { AttributeDedupeMergeService } from '../../attribute-ontology/attribute-dedupe-merge.service';
import { EntityAnchorRehomeService } from './entity-anchor-rehome.service';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';
import { AttributeOntologyService } from '../../attribute-ontology/attribute-ontology.service';
import { DishKnowledgeSynthesisService } from './dish-knowledge-synthesis.service';
import { derivePlaceAttributes } from '../reddit-collector/place-attribute-projection';
import { identityInsertData } from './entity-identity';

const TEST_TAG = 'itest-k1k2-cuisine';

const prisma = new PrismaClient();

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

const ontology = new AttributeOntologyService(
  prisma as never,
  // applyPlan never calls the LLM or embeddings; throwing stubs prove it.
  {
    placeAttributesBatch: () => {
      throw new Error('applyPlan must never call the LLM');
    },
  } as never,
  {} as never,
  logger,
  // THE merge door (red team 2026-09-04 ID-3): applyPlan's merges are
  // ledgered and executed here — a real one, against the same database.
  new AttributeDedupeMergeService(
    prisma as never,
    {
      judgeAttributeMergesBatch: () => {
        throw new Error('a decided merge is never re-judged');
      },
    } as never,
    {} as never,
    new EntityAnchorRehomeService(logger),
    new ClaimVerdictLedgerService(prisma as never),
    logger,
  ),
);

const dishKnowledge = new DishKnowledgeSynthesisService(
  prisma as never,
  {} as never,
  {} as never,
  logger,
);

async function seedEntity(
  name: string,
  type: 'place_attribute' | 'item' | 'place',
  extra: Record<string, unknown> = {},
): Promise<string> {
  const created = await prisma.entity.create({
    data: {
      name: `${TEST_TAG}-${name}`,
      type,
      ...identityInsertData(`${TEST_TAG}-${name}`, type),
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
  if (!ids.length) return;
  await prisma.connection.deleteMany({
    where: { OR: [{ placeId: { in: ids } }, { itemId: { in: ids } }] },
  });
  await prisma.placeAttributeEvidence.deleteMany({
    where: {
      OR: [{ placeId: { in: ids } }, { attributeId: { in: ids } }],
    },
  });
  await prisma.entitySurface.deleteMany({ where: { entityId: { in: ids } } });
  await prisma.entity.deleteMany({ where: { entityId: { in: ids } } });
}

beforeAll(cleanup);
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

jest.setTimeout(60_000);

describe('K2: adjudication reaches knowledge_cuisines + evidence; the grain bridge cannot resurrect a merged id', () => {
  it('merge repoints every reference site and the bridge projects only the canonical', async () => {
    const canonical = await seedEntity('texmex', 'place_attribute', {
      facet: 'cuisine',
      status: 'active',
    });
    const merged = await seedEntity('tex-mex-dup', 'place_attribute', {
      facet: 'cuisine',
      status: 'active',
    });
    const place = await seedEntity('taqueria', 'place');
    const dish = await seedEntity('birria-taco', 'item', {
      knowledgeCuisines: [merged],
      knowledgeSynthesizedAt: new Date(),
      knowledgePromptVersion: 7,
    });
    const connection = await prisma.connection.create({
      data: { placeId: place, itemId: dish, itemAttributes: [] },
      select: { connectionId: true },
    });
    await prisma.placeAttributeEvidence.create({
      data: {
        placeId: place,
        attributeId: merged,
        sourceClass: 'cuisine_llm',
        observations: 2,
      },
    });
    // A canonical twin row on the same (place, class): the merge must
    // COLLAPSE onto it (observations summed), not violate the composite PK.
    await prisma.placeAttributeEvidence.create({
      data: {
        placeId: place,
        attributeId: canonical,
        sourceClass: 'cuisine_llm',
        observations: 3,
      },
    });

    await ontology.applyPlan(
      {
        type: 'place_attribute',
        scope: 'pending',
        candidateCount: 1,
        promotions: [],
        merges: [
          {
            canonicalEntityId: canonical,
            canonicalName: 'texmex',
            mergedEntityId: merged,
            mergedName: 'tex-mex-dup',
            reason: 'itest: same concept',
          },
        ],
        rejections: [],
        renames: [],
      },
      { apply: true },
    );

    // knowledge_cuisines repointed to the canonical.
    const dishRow = await prisma.entity.findUniqueOrThrow({
      where: { entityId: dish },
      select: { knowledgeCuisines: true },
    });
    expect(dishRow.knowledgeCuisines).toEqual([canonical]);

    // Evidence collapsed: no merged-id row survives; observations folded.
    const evidence = await prisma.placeAttributeEvidence.findMany({
      where: { placeId: place },
    });
    expect(evidence).toHaveLength(1);
    expect(evidence[0].attributeId).toBe(canonical);
    expect(evidence[0].observations).toBe(5);

    // The grain bridge projects the CANONICAL id, never the archived one.
    await dishKnowledge.projectKnowledgeCuisines();
    const conn = await prisma.connection.findUniqueOrThrow({
      where: { connectionId: connection.connectionId },
      select: { itemAttributes: true },
    });
    expect(conn.itemAttributes).toContain(canonical);
    expect(conn.itemAttributes).not.toContain(merged);
  });

  it('an archived id lingering in knowledge_cuisines does not resurrect on a version bump', async () => {
    const archived = await seedEntity('ghost-cuisine', 'place_attribute', {
      facet: 'cuisine',
      status: 'archived',
    });
    const active = await seedEntity('live-cuisine', 'place_attribute', {
      facet: 'cuisine',
      status: 'active',
    });
    const place = await seedEntity('resurrect-place', 'place');
    const dish = await seedEntity('resurrect-dish', 'item', {
      // Simulates the pre-K2 corpus: an archived id nothing repointed.
      knowledgeCuisines: [archived, active],
      knowledgeSynthesizedAt: new Date(),
      knowledgePromptVersion: 9,
    });
    const connection = await prisma.connection.create({
      data: { placeId: place, itemId: dish, itemAttributes: [] },
      select: { connectionId: true },
    });

    await dishKnowledge.projectKnowledgeCuisines();
    const conn = await prisma.connection.findUniqueOrThrow({
      where: { connectionId: connection.connectionId },
      select: { itemAttributes: true, cuisineProjectionVersion: true },
    });
    // Positive direction: the active id lands (the projection RAN).
    expect(conn.itemAttributes).toContain(active);
    expect(conn.cuisineProjectionVersion).toBe(9);
    // The archived id must NOT resurrect.
    expect(conn.itemAttributes).not.toContain(archived);
  });
});

describe('K1: restaurant_attributes is a projection of evidence', () => {
  it('deleting an evidence row removes the id from the column in the same reconcile', async () => {
    const attribute = await seedEntity('patio', 'place_attribute', {
      status: 'active',
    });
    const place = await seedEntity('patio-place', 'place');
    await prisma.placeAttributeEvidence.create({
      data: {
        placeId: place,
        attributeId: attribute,
        sourceClass: 'editorial_llm',
        observations: 1,
      },
    });

    // Positive direction: evidence projects into the column.
    await derivePlaceAttributes(prisma, [place]);
    let row = await prisma.entity.findUniqueOrThrow({
      where: { entityId: place },
      select: { placeAttributes: true },
    });
    expect(row.placeAttributes).toContain(attribute);

    // The lane rerun drops its claim; the reconcile drops the id.
    await prisma.placeAttributeEvidence.deleteMany({
      where: { placeId: place, sourceClass: 'editorial_llm' },
    });
    await derivePlaceAttributes(prisma, [place]);
    row = await prisma.entity.findUniqueOrThrow({
      where: { entityId: place },
      select: { placeAttributes: true },
    });
    expect(row.placeAttributes).not.toContain(attribute);
  });
});
