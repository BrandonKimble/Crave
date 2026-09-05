/**
 * ONE COMMENT IS ONE RESTAURANT VOTE (owner ruling 2026-09-04) — against a
 * REAL Postgres (integration).
 *
 * `restaurant_vote_totals` (search-query.builder.ts, buildPlaceVoteTotalsCte)
 * feeds the restaurant lane's `total_mentions` / `total_upvotes`: the
 * minimum-votes gate, the crave-order tiebreak, and the "Based on N mentions
 * · M votes" receipt on the restaurant panel. Before this ruling it summed the
 * mention LEDGER row by row, so a comment naming five dishes at one
 * restaurant lifted that restaurant five times and its upvotes counted five
 * times — while the public crave score already counted that same comment
 * once per restaurant (praise_dedup / replacePlacePraise). Measured on
 * staging: 1,448 (restaurant, document) pairs carried 2–8 direct mentions.
 *
 * Fixture (one restaurant):
 *   doc A (7 upvotes): three direct dish mentions AND a general_praise carrier
 *   doc B (3 upvotes): one direct dish mention
 * Expected: total_mentions = 2, total_upvotes = 7 + 3 = 10.
 * The old CTE returned 4 mentions / 24 upvotes (A's 7 counted three times; the
 * carrier counted zero — carriers are event rows, not mention rows).
 *
 * Then doc C (5 upvotes): a carrier ONLY, no dish mentions. A praise-only
 * comment is still one endorsement, so the totals become 3 / 15. The old CTE
 * never saw it at all.
 *
 * Why a DB spec: the collapse is a GROUP BY over two ledgers with different
 * document keys. Only a real planner executing the real CTE against real rows
 * proves the arithmetic; a string assertion on the SQL could pass on a shape
 * that still double-counts.
 *
 * MUTATION-CAPABLE (verified RED on the previous CTE body — see the report):
 * restore the row-wise SUM/COUNT and this spec fails on both numbers.
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 * It FAILS LOUDLY without one rather than skipping.
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { writePlaceEvents } from '../content-processing/reddit-collector/extraction-scope.service';
import { SearchQueryBuilder } from './search-query.builder';

const TEST_TAG = 'itest-rvt-per-document';

const prisma = new PrismaClient();

const DOC_A_UPVOTES = 7;
const DOC_B_UPVOTES = 3;
const DOC_C_UPVOTES = 5;

let placeId: string;
let runId: string;
let inputId: string;
let docA: string;
let docB: string;
let docC: string;
const entityIds: string[] = [];
const connectionIds: string[] = [];
const docIds: string[] = [];

async function mintDoc(): Promise<string> {
  const doc = await prisma.sourceDocument.create({
    data: {
      platform: 'reddit',
      community: 'itestfood',
      sourceType: 'comment',
      sourceId: `${TEST_TAG}-${randomUUID().slice(0, 12)}`,
      sourceCreatedAt: new Date(),
      // The carrier lane reads ACTIVE-run events only (same scope as the
      // praise lane), so the document must point at the run that wrote them.
      activeExtractionRunId: runId,
    },
    select: { documentId: true },
  });
  docIds.push(doc.documentId);
  return doc.documentId;
}

async function mintDish(label: string): Promise<string> {
  const food = await prisma.entity.create({
    data: { name: `${TEST_TAG}-${label}`, type: 'item' },
    select: { entityId: true },
  });
  entityIds.push(food.entityId);
  const connection = await prisma.connection.create({
    data: { placeId, itemId: food.entityId, mentionCount: 1, totalUpvotes: 1 },
    select: { connectionId: true },
  });
  connectionIds.push(connection.connectionId);
  return connection.connectionId;
}

async function directMention(
  connectionId: string,
  sourceDocumentId: string,
  sourceUpvotes: number,
): Promise<void> {
  await prisma.placeItemMention.create({
    data: {
      connectionId,
      kind: 'direct',
      mentionedAt: new Date(),
      sourceUpvotes,
      sourceDocumentId,
    },
  });
}

async function carrier(
  sourceDocumentId: string,
  sourceUpvotes: number,
): Promise<void> {
  // Through THE write door (writePlaceEvents) — the ledger has one.
  await writePlaceEvents(prisma, [
    {
      extractionRunId: runId,
      inputId,
      sourceDocumentId,
      placeId,
      mentionKey: `${TEST_TAG}:${sourceDocumentId.slice(0, 8)}`,
      evidenceType: 'general_praise',
      mentionedAt: new Date(),
      sourceUpvotes,
    },
  ]);
}

async function voteTotals(): Promise<{
  total_mentions: number;
  total_upvotes: number;
} | null> {
  // The REAL CTE, exactly as the restaurant lane composes it, over a
  // filtered_restaurants that holds only the fixture restaurant.
  const cte = (
    new SearchQueryBuilder() as unknown as {
      buildPlaceVoteTotalsCte(): { sql: Prisma.Sql };
    }
  ).buildPlaceVoteTotalsCte().sql;
  const rows = await prisma.$queryRaw<
    { total_mentions: bigint | number; total_upvotes: bigint | number }[]
  >(Prisma.sql`
    WITH filtered_restaurants AS (
      SELECT entity_id FROM core_entities WHERE entity_id = ${placeId}::uuid
    ),
    ${cte}
    SELECT total_mentions, total_upvotes FROM restaurant_vote_totals
  `);
  if (!rows.length) return null;
  return {
    total_mentions: Number(rows[0].total_mentions),
    total_upvotes: Number(rows[0].total_upvotes),
  };
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves a SQL rollup and must not be skipped',
    );
  }
  const run = await prisma.extractionRun.create({
    data: {
      pipeline: 'itest',
      model: 'none',
      systemPromptHash: TEST_TAG,
      status: 'completed',
    },
    select: { extractionRunId: true },
  });
  runId = run.extractionRunId;
  const input = await prisma.extractionInput.create({
    data: { extractionRunId: runId, inputIndex: 0, inputPayload: {} },
    select: { inputId: true },
  });
  inputId = input.inputId;

  const place = await prisma.entity.create({
    data: { name: `${TEST_TAG}-restaurant`, type: 'place' },
    select: { entityId: true },
  });
  placeId = place.entityId;
  entityIds.push(placeId);

  docA = await mintDoc();
  docB = await mintDoc();
  docC = await mintDoc();

  // Doc A names three distinct dishes and praises the place.
  for (const label of ['taco', 'mole', 'flan']) {
    await directMention(await mintDish(label), docA, DOC_A_UPVOTES);
  }
  await carrier(docA, DOC_A_UPVOTES);
  // Doc B names one dish.
  await directMention(await mintDish('tamale'), docB, DOC_B_UPVOTES);
});

afterAll(async () => {
  await prisma.placeEvent.deleteMany({ where: { extractionRunId: runId } });
  await prisma.connection.deleteMany({
    where: { connectionId: { in: connectionIds } },
  });
  await prisma.sourceDocument.deleteMany({
    where: { documentId: { in: docIds } },
  });
  await prisma.entity.deleteMany({ where: { entityId: { in: entityIds } } });
  await prisma.extractionRun.deleteMany({ where: { extractionRunId: runId } });
  await prisma.$disconnect();
});

describe('restaurant_vote_totals: one source document is one restaurant vote', () => {
  it('counts doc A once (three dishes + carrier) and doc B once: 2 mentions, upvotes summed once each', async () => {
    expect(await voteTotals()).toEqual({
      total_mentions: 2,
      total_upvotes: DOC_A_UPVOTES + DOC_B_UPVOTES,
    });
  });

  it('a praise-only comment (carrier, no dish mentions) is one more vote', async () => {
    await carrier(docC, DOC_C_UPVOTES);
    expect(await voteTotals()).toEqual({
      total_mentions: 3,
      total_upvotes: DOC_A_UPVOTES + DOC_B_UPVOTES + DOC_C_UPVOTES,
    });
  });

  it('a carrier from a run the document no longer points at is not a vote (active scope, same as the praise lane)', async () => {
    const superseded = await prisma.extractionRun.create({
      data: {
        pipeline: 'itest',
        model: 'none',
        systemPromptHash: `${TEST_TAG}-superseded`,
        status: 'completed',
      },
      select: { extractionRunId: true },
    });
    const staleInput = await prisma.extractionInput.create({
      data: {
        extractionRunId: superseded.extractionRunId,
        inputIndex: 0,
        inputPayload: {},
      },
      select: { inputId: true },
    });
    try {
      await writePlaceEvents(prisma, [
        {
          extractionRunId: superseded.extractionRunId,
          inputId: staleInput.inputId,
          sourceDocumentId: docB,
          placeId,
          mentionKey: `${TEST_TAG}:stale`,
          evidenceType: 'general_praise',
          mentionedAt: new Date(),
          sourceUpvotes: 100,
        },
      ]);
      expect(await voteTotals()).toEqual({
        total_mentions: 3,
        total_upvotes: DOC_A_UPVOTES + DOC_B_UPVOTES + DOC_C_UPVOTES,
      });
    } finally {
      await prisma.extractionRun.delete({
        where: { extractionRunId: superseded.extractionRunId },
      });
    }
  });
});
