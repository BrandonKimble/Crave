/**
 * RECOVERED EVIDENCE IS THE SHADOW'S EVIDENCE (red team 2026-09-04 T1-2),
 * proven against a real database.
 *
 * Banked-refusal recovery minted a NEW run R for every shadow run S it
 * recovered; activation plans by document ownership (a document must be
 * active on `replayOf` = S for R to own it — never true), so R's events
 * never became active and its mints never left rehearsal. Staging carried
 * 75 such runs, 2,122 dark events. The fold re-keys R's products onto S
 * and drops a recovered event S already holds. RED against the pre-fold
 * service: R's events stayed keyed to R.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  foldRecoveryRunIntoShadow,
  writePlaceEvents,
} from './extraction-scope.service';

const TEST_TAG = 'itest-recovery-fold';
const prisma = new PrismaClient();
const runIds: string[] = [];
const entityIds: string[] = [];
const docIds: string[] = [];

const inputIdByRun = new Map<string, string>();

async function mintRun(metadata: Record<string, unknown>): Promise<string> {
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO collection_extraction_runs
       (extraction_run_id, pipeline, model, status, system_prompt_hash, metadata, started_at)
     VALUES ($1::uuid, 'archive', 'itest-model', 'completed', $2, $3::jsonb, now())`,
    id,
    `${TEST_TAG}-hash`,
    JSON.stringify(metadata),
  );
  runIds.push(id);
  const inputId = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO collection_extraction_inputs (input_id, extraction_run_id, input_index, input_payload)
     VALUES ($1::uuid, $2::uuid, 0, '{}'::jsonb)`,
    inputId,
    id,
  );
  inputIdByRun.set(id, inputId);
  return id;
}

async function mintPlace(label: string, bornRunId: string): Promise<string> {
  const entity = await prisma.entity.create({
    data: {
      name: `${TEST_TAG}-${label}`,
      type: 'place',
      status: 'rehearsal',
      bornExtractionRunId: bornRunId,
    },
    select: { entityId: true },
  });
  entityIds.push(entity.entityId);
  await prisma.$executeRawUnsafe(
    `INSERT INTO entity_surface (entity_id, form, form_folded, locale, role, source, confidence, status, born_extraction_run_id)
     VALUES ($1::uuid, $2, $2, 'und', 'recall', 'extraction', 1, 'active', $3::uuid)`,
    entity.entityId,
    `${TEST_TAG}-${label}`,
    bornRunId,
  );
  return entity.entityId;
}

async function mintDoc(): Promise<string> {
  const id = randomUUID();
  await prisma.$executeRawUnsafe(
    `INSERT INTO collection_source_documents
       (document_id, platform, source_type, source_id, community, source_created_at)
     VALUES ($1::uuid, 'reddit', 'post', $2, 'itestfood', now())`,
    id,
    `${TEST_TAG}-${id.slice(0, 8)}`,
  );
  docIds.push(id);
  return id;
}

async function placeEvent(
  runId: string,
  docId: string,
  placeId: string,
): Promise<void> {
  // Through THE write door (writePlaceEvents) — the ledger has one.
  await prisma.$transaction((tx) =>
    writePlaceEvents(tx, [
      {
        extractionRunId: runId,
        inputId: inputIdByRun.get(runId)!,
        sourceDocumentId: docId,
        placeId,
        mentionKey: `${TEST_TAG}:${docId.slice(0, 8)}:${placeId.slice(0, 8)}`,
        evidenceType: 'general_praise',
        mentionedAt: new Date(),
      },
    ]),
  );
}

afterAll(async () => {
  if (runIds.length) {
    await prisma.placeEvent.deleteMany({
      where: { extractionRunId: { in: runIds } },
    });
    await prisma.$executeRawUnsafe(
      `DELETE FROM claim_verdicts WHERE source = ANY($1::text[])`,
      runIds.map((id) => `rehearsal:${id}`),
    );
  }
  if (entityIds.length) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM entity_surface WHERE entity_id = ANY($1::uuid[])`,
      entityIds,
    );
    await prisma.entity.deleteMany({ where: { entityId: { in: entityIds } } });
  }
  if (docIds.length) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM collection_source_documents WHERE document_id = ANY($1::uuid[])`,
      docIds,
    );
  }
  if (runIds.length) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM collection_extraction_inputs WHERE extraction_run_id = ANY($1::uuid[])`,
      runIds,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM collection_extraction_runs WHERE extraction_run_id = ANY($1::uuid[])`,
      runIds,
    );
  }
  await prisma.$disconnect();
});

describe('foldRecoveryRunIntoShadow (real DB)', () => {
  it('re-keys events, mints, surfaces and rehearsal verdicts onto the shadow, dropping duplicates', async () => {
    const shadow = await mintRun({ rehearsal: true });
    const recovery = await mintRun({
      rehearsal: true,
      replaySource: 'banked_refusals',
      replayOfExtractionRunId: shadow,
    });
    const docA = await mintDoc();
    const docB = await mintDoc();
    const placeKept = await mintPlace('kept', shadow);
    const placeRecovered = await mintPlace('recovered', recovery);

    // S already holds this event; R's copy is a duplicate.
    await placeEvent(shadow, docA, placeKept);
    await placeEvent(recovery, docA, placeKept);
    // R recovered a new event S never had.
    await placeEvent(recovery, docB, placeRecovered);
    // R bought a rehearsal-scoped verdict.
    await prisma.$executeRawUnsafe(
      `INSERT INTO claim_verdicts
         (lane, claim_key, rule_version, fold_version, outcome, reason, rule_fingerprint, subject, source, decided_at)
       VALUES ('entity_match', $1, 1, 1, 'new', 'itest', 'itest', '{}'::jsonb, $2, now())`,
      `${TEST_TAG}|${recovery.slice(0, 8)}`,
      `rehearsal:${recovery}`,
    );

    const counts = await prisma.$transaction((tx) =>
      foldRecoveryRunIntoShadow(tx, shadow, recovery),
    );
    expect(counts).toEqual({
      entityEvents: 0,
      placeEvents: 1,
      duplicatesDropped: 1,
      entities: 1,
      surfaces: 1,
      verdicts: 1,
    });

    const byRun = await prisma.$queryRawUnsafe<
      Array<{ run: string; n: bigint }>
    >(
      `SELECT extraction_run_id::text AS run, count(*) AS n
         FROM core_restaurant_events
        WHERE extraction_run_id = ANY($1::uuid[]) GROUP BY 1`,
      [shadow, recovery],
    );
    expect(byRun.map((r) => [r.run, Number(r.n)])).toEqual([[shadow, 2]]);

    const born = await prisma.entity.findUniqueOrThrow({
      where: { entityId: placeRecovered },
      select: { bornExtractionRunId: true },
    });
    expect(born.bornExtractionRunId).toBe(shadow);

    const folded = await prisma.$queryRawUnsafe<
      Array<{ folded_into: string | null }>
    >(
      `SELECT metadata->>'foldedIntoExtractionRunId' AS folded_into
         FROM collection_extraction_runs WHERE extraction_run_id = $1::uuid`,
      recovery,
    );
    expect(folded[0]?.folded_into).toBe(shadow);
  });
});
