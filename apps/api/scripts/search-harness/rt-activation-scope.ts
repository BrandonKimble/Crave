/**
 * @script-class: probe
 * @finding: red-team item: re-extract activation cannot flip poll documents (control arm
 * shows RED). Banked in audit/FINDINGS.md (2026-08-02 red-team pass).
 */
/* NON-VACUOUS test of the claim "re-extract activation cannot flip poll docs".
   Builds a SHADOW run that genuinely REPLAYS a poll_surface document
   (metadata.replayOfExtractionRunId = the ballot run), so documentsOwnedByRun
   WOULD return it but for the platform exclusion. Control arm must show RED. */
import { bootstrap, requireNonProdDatabase } from './_shared';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ExtractionScopeService } from '../../src/modules/content-processing/reddit-collector/extraction-scope.service';

const TAG = 'RT-ACTSCOPE';

async function main() {
  // Declared OUTSIDE the try so the finally block can delete whatever was
  // created before a throw (F1255).
  let ballotRunId: string | undefined;
  let docId: string | undefined;
  let shadowRunId: string | undefined;
  requireNonProdDatabase(__filename.split('/').pop() as string);
  const app = await bootstrap();
  const prisma = app.get(PrismaService);
  const scope = app.get(ExtractionScopeService);

  try {
    // 1. a poll_surface source + document, owned by a "ballot" run
    const ballotRun = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO collection_extraction_runs (extraction_run_id, pipeline, model, system_prompt_hash, status, started_at, completed_at, metadata)
       VALUES (gen_random_uuid(),'poll-ballot','none','ballot-k6-v1','completed', now(), now(), $1::jsonb) RETURNING extraction_run_id`,
      JSON.stringify({ tag: TAG }),
    );
    ballotRunId = ballotRun[0].extraction_run_id;
    const doc = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO collection_source_documents (document_id, platform, community, source_type, source_id, title, source_created_at, raw_payload, active_extraction_run_id)
       VALUES (gen_random_uuid(),'poll_surface',$1,'post'::mention_source,$2,$3, now(), '{}'::jsonb, $4::uuid) RETURNING document_id`,
      `${TAG}:community`,
      `${TAG}-doc`,
      `${TAG} ballot`,
      ballotRunId,
    );
    docId = doc[0].document_id;

    // 2. a SHADOW run that REPLAYS the ballot run and includes that document
    const shadowRun = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO collection_extraction_runs (extraction_run_id, pipeline, model, system_prompt_hash, status, started_at, completed_at, metadata)
       VALUES (gen_random_uuid(),'reddit-shadow','gemini','hash-v2','completed', now(), now(), $1::jsonb) RETURNING extraction_run_id`,
      JSON.stringify({ tag: TAG, replayOfExtractionRunId: ballotRunId }),
    );
    shadowRunId = shadowRun[0].extraction_run_id;
    const inp = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO collection_extraction_inputs (input_id, extraction_run_id, input_index, input_payload)
       VALUES (gen_random_uuid(), $1::uuid, 0, '{}'::jsonb) RETURNING input_id`,
      shadowRunId,
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO collection_extraction_input_documents (input_id, document_id, ordinal) VALUES ($1::uuid,$2::uuid,0)`,
      inp[0].input_id,
      docId,
    );

    // 3. THE TEST
    const guarded = await scope.documentsOwnedByRun(shadowRunId!);
    const control = await scope.documentsOwnedByRun(shadowRunId!, {
      excludePlatform: '__no_such_platform__',
    });
    console.log(
      `\nCONTROL (exclusion disabled): ${control.length} document(s)  -> must be 1, else vacuous`,
    );
    console.log(
      `GUARDED (default poll_surface exclusion): ${guarded.length} document(s)`,
    );
    console.log(
      control.length === 1 && guarded.length === 0
        ? '\nRESULT: PASS — the guard is load-bearing and the test can show RED.'
        : `\nRESULT: *** INCONCLUSIVE/FAIL *** control=${control.length} guarded=${guarded.length}`,
    );
  } finally {
    // ================= CLEANUP (F1255: try/finally, EVERY exit path) ==========
    // Cleanup and the residue proof used to sit on the happy path, so the one
    // run that leaked rows — a mid-run throw — was precisely the run whose
    // residue report never printed. The lifecycle is owned on every exit now,
    // and residue > 0 is a NON-ZERO EXIT, not a line of console output nobody
    // reads.
    await prisma.$executeRawUnsafe(
      `DELETE FROM collection_extraction_input_documents WHERE document_id=$1::uuid`,
      docId,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM collection_extraction_inputs WHERE extraction_run_id=$1::uuid`,
      shadowRunId,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM collection_source_documents WHERE document_id=$1::uuid`,
      docId,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM collection_extraction_runs WHERE extraction_run_id IN ($1::uuid,$2::uuid)`,
      shadowRunId,
      ballotRunId,
    );

    const residue = await prisma.$queryRawUnsafe<any[]>(`
      SELECT 'docs' k, count(*)::int c FROM collection_source_documents WHERE platform='poll_surface'
      UNION ALL SELECT 'sources', count(*)::int FROM sources WHERE platform='poll_surface'
      UNION ALL SELECT 'runs', count(*)::int FROM collection_extraction_runs WHERE metadata->>'tag'='${TAG}'`);
    console.log('RESIDUE:', JSON.stringify(residue));
    const leaked = residue.reduce((n: number, r: any) => n + Number(r.c), 0);
    await app.close();
    if (leaked > 0) {
      console.error(`RESIDUE LEAK: ${leaked} synthetic rows survived cleanup.`);
      process.exit(2);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
