/**
 * THE A-1 VISIBILITY GATE (birth-and-linking red team, 2026-08-30) — against
 * a REAL Postgres (integration).
 *
 * The law under test is `servablePlaceConditionsSql` itself — the ONE shared
 * fragment search list + map + dots embed verbatim, so proving the fragment
 * proves every consumer stays agreed. An ungrounded place with <2 mention
 * events is a zero-evidence shell and must not be servable; the
 * median-10-mention ungrounded cohort and every grounded place stay visible.
 *
 * MUTATION-CAPABLE: delete the `placeVisibilityFloorSql` arm from
 * servable-place-scope.ts and the shell/one-mention cases go RED (they
 * appear in the served set).
 *
 * Run: yarn test:db   (needs DATABASE_URL — a dev/mirror database, never prod)
 * It FAILS LOUDLY without one rather than skipping.
 */
import { writePlaceEvents } from '../content-processing/reddit-collector/extraction-scope.service';
import { PrismaClient, Prisma } from '@prisma/client';
import { servablePlaceConditionsSql } from './servable-place-scope';

const TEST_TAG = 'itest-a1-visibility';

const prisma = new PrismaClient();

const seeded: string[] = [];
let runId: string;
const docIds: string[] = [];
let inputId: string;

async function seedPlace(label: string): Promise<string> {
  const entity = await prisma.entity.create({
    data: { name: `${TEST_TAG}-${label}`, type: 'place', status: 'active' },
  });
  seeded.push(entity.entityId);
  return entity.entityId;
}

async function seedMentions(placeId: string, count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    const doc = await prisma.sourceDocument.create({
      data: {
        sourceType: 'post',
        sourceId: `${TEST_TAG}-${placeId}-${i}`,
        sourceCreatedAt: new Date(),
      },
    });
    docIds.push(doc.documentId);
    await prisma.$transaction((tx) =>
      writePlaceEvents(tx, [
        {
          extractionRunId: runId,
          inputId,
          sourceDocumentId: doc.documentId,
          placeId,
          mentionKey: `${TEST_TAG}-${i}`,
          evidenceType: 'mention',
          mentionedAt: new Date(),
        },
      ]),
    );
  }
}

async function servedIds(): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ entityId: string }>>(
    Prisma.sql`
      SELECT e.entity_id AS "entityId"
      FROM core_entities e
      WHERE ${Prisma.raw(servablePlaceConditionsSql('e'))}
        AND e.entity_id = ANY(${seeded}::uuid[])
    `,
  );
  return rows.map((r) => r.entityId);
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is required — this spec proves a SQL predicate and must not be skipped',
    );
  }
  const run = await prisma.extractionRun.create({
    data: {
      pipeline: TEST_TAG,
      model: TEST_TAG,
      systemPromptHash: TEST_TAG,
      status: 'completed',
    },
  });
  runId = run.extractionRunId;
  const input = await prisma.extractionInput.create({
    data: { extractionRunId: runId, inputIndex: 0, inputPayload: {} },
  });
  inputId = input.inputId;
});

afterAll(async () => {
  await prisma.placeEvent.deleteMany({ where: { extractionRunId: runId } });
  await prisma.placeLocation.deleteMany({
    where: { placeId: { in: seeded } },
  });
  await prisma.entity.deleteMany({ where: { entityId: { in: seeded } } });
  await prisma.sourceDocument.deleteMany({
    where: { documentId: { in: docIds } },
  });
  await prisma.extractionInput.deleteMany({ where: { inputId } });
  await prisma.extractionRun.deleteMany({
    where: { extractionRunId: runId },
  });
  await prisma.$disconnect();
});

describe('servable-place A-1 visibility gate', () => {
  it('hides zero/one-mention ungrounded shells; serves the 2-mention cohort and every grounded place', async () => {
    const shell = await seedPlace('shell'); // ungrounded, 0 mentions
    const oneMention = await seedPlace('one-mention'); // ungrounded, 1 mention
    const cohort = await seedPlace('cohort'); // ungrounded, 2 mentions
    const grounded = await seedPlace('grounded'); // grounded, 0 mentions

    await seedMentions(oneMention, 1);
    await seedMentions(cohort, 2);
    await prisma.placeLocation.create({
      data: {
        placeId: grounded,
        googlePlaceId: `${TEST_TAG}-gpid`,
        address: '1 Test Way',
      },
    });

    const served = await servedIds();
    expect(served).not.toContain(shell);
    expect(served).not.toContain(oneMention);
    expect(served).toContain(cohort);
    expect(served).toContain(grounded);
  });
});
