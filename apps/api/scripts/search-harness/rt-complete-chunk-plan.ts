/**
 * @script-class: probe
 * @finding: red-team item 6: completeChunkPlan's two activation-set filters, driven
 * directly with synthetic chunk results. Banked in audit/FINDINGS.md
 * (2026-08-02 red-team pass).
 */
/* RED TEAM item 6: drive ExtractionPipelineService.completeChunkPlan DIRECTLY
   with synthetic chunk results (no Gemini). Tests BOTH activation-set filters:
     (i)  extract_from_post=false  -> the post's doc never enters activateDocumentIds
          (computed UPSTREAM at extraction-pipeline.service.ts:415-431; replicated
          here from the caller's perspective and asserted against the method)
     (ii) failed/quarantined chunk -> its docs are trimmed from activation (:985-1000)
   Real DB rows, real service, deleted afterwards. */
import { bootstrap, requireNonProdDatabase } from './_shared';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ExtractionPipelineService } from '../../src/modules/content-processing/reddit-collector/extraction-pipeline.service';

const TAG = 'RT-CCP';

function post(
  id: string,
  extractFromPost: boolean | undefined,
  commentIds: string[],
) {
  return {
    id,
    title: `${TAG} ${id}`,
    content: 'body',
    subreddit: TAG,
    author: 'a',
    url: `https://example.invalid/${id}`,
    score: 1,
    created_at: new Date().toISOString(),
    ...(extractFromPost === undefined
      ? {}
      : { extract_from_post: extractFromPost }),
    comments: commentIds.map((cid) => ({
      id: cid,
      content: 'c',
      author: 'a',
      score: 1,
      created_at: new Date().toISOString(),
      parent_id: id,
      url: '',
    })),
  } as any;
}

async function main() {
  // Declared OUTSIDE the try so the finally block can delete whatever was
  // created before a throw (F1255).
  let runId: string | undefined;
  let good: { documentId: string; inputId: string } | undefined;
  let bad: { documentId: string; inputId: string } | undefined;
  requireNonProdDatabase(__filename.split('/').pop() as string);
  const app = await bootstrap();
  const prisma = app.get(PrismaService);
  const pipeline: any = app.get(ExtractionPipelineService);

  try {
    // --- real run + two inputs + two documents
    const run = await prisma.$queryRawUnsafe<any[]>(
      `INSERT INTO collection_extraction_runs (extraction_run_id, pipeline, model, system_prompt_hash, status, started_at, metadata)
       VALUES (gen_random_uuid(),'reddit','synthetic','${TAG}','running', now(), $1::jsonb) RETURNING extraction_run_id`,
      JSON.stringify({ tag: TAG }),
    );
    runId = run[0].extraction_run_id;
    const mk = async (i: number) => {
      const inp = await prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO collection_extraction_inputs (input_id, extraction_run_id, input_index, input_payload)
         VALUES (gen_random_uuid(), $1::uuid, $2, '{}'::jsonb) RETURNING input_id`,
        runId,
        i,
      );
      const d = await prisma.$queryRawUnsafe<any[]>(
        `INSERT INTO collection_source_documents (document_id, platform, community, source_type, source_id, title, source_created_at, raw_payload)
         VALUES (gen_random_uuid(),'reddit',$1,'post'::mention_source,$2,$3, now(), '{}'::jsonb) RETURNING document_id`,
        TAG,
        `${TAG}-src-${i}`,
        `${TAG} doc ${i}`,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO collection_extraction_input_documents (input_id, document_id, ordinal) VALUES ($1::uuid,$2::uuid,0)`,
        inp[0].input_id,
        d[0].document_id,
      );
      return { inputId: inp[0].input_id, documentId: d[0].document_id };
    };
    good = await mk(0); // chunk that succeeds
    bad = await mk(1); // chunk that fails

    // --- (i) UPSTREAM RULE, executed: extraction-pipeline.service.ts:415-426
    const sourceDocumentIdBySourceKey = new Map<string, string>([
      ['post:ctxpost', good.documentId], // context-only post
      ['post:realpost', bad.documentId], // normal post
    ]);
    const llmPosts = [
      post('ctxpost', false, []),
      post('realpost', undefined, []),
    ];
    const extractedDocumentIds = new Set<string>();
    for (const p of llmPosts) {
      const postDocId =
        p.extract_from_post === false
          ? undefined
          : sourceDocumentIdBySourceKey.get(`post:${p.id}`);
      if (postDocId) extractedDocumentIds.add(postDocId);
    }
    console.log('\n(i) extract_from_post=false EXCLUSION (upstream :415-426)');
    console.log(
      `  context-only post doc ${good.documentId.slice(0, 8)} in activation set? ${extractedDocumentIds.has(good.documentId)}  (expect false)`,
    );
    console.log(
      `  normal post doc      ${bad.documentId.slice(0, 8)} in activation set? ${extractedDocumentIds.has(bad.documentId)}  (expect true)`,
    );
    console.log(
      '  ',
      !extractedDocumentIds.has(good.documentId) &&
        extractedDocumentIds.has(bad.documentId)
        ? 'PASS'
        : '*** FAIL ***',
    );

    // --- (ii) drive completeChunkPlan directly: chunk "cGood" succeeds, "cBad" fails
    const chunkMeta = (chunkId: string) => ({
      chunkId,
      commentCount: 0,
      rootCommentScore: 0,
      estimatedProcessingTime: 0,
      threadRootId: 'root',
    });
    const args = {
      activateDocumentIds: [good.documentId, bad.documentId],
      baseParams: {
        pipeline: 'reddit',
        community: TAG,
        batchId: `${TAG}-batch`,
        platform: 'reddit',
      },
      llmPosts: [],
      chunkMetadata: [chunkMeta('cGood'), chunkMeta('cBad')],
      chunkDurationMs: 0,
      sourceDocumentIdBySourceKey: new Map(),
      extractionRunId: runId,
      extractionInputIdByChunkId: new Map([
        ['cGood', good.inputId],
        ['cBad', bad.inputId],
      ]),
      chunkResults: [
        {
          success: true,
          result: { mentions: [] },
          chunkId: 'cGood',
          commentCount: 0,
          duration: 0,
          metadata: chunkMeta('cGood'),
          input: { posts: [], source_map: {} },
        },
        {
          success: false,
          result: undefined,
          chunkId: 'cBad',
          commentCount: 0,
          duration: 0,
          metadata: chunkMeta('cBad'),
          input: { posts: [], source_map: {} },
        },
      ],
      processingMetrics: {
        totalDuration: 0,
        chunksProcessed: 2,
        successRate: 0.5,
        topCommentsCount: 0,
        averageChunkTime: 0,
      },
      llmProcessingTimeMs: 0,
    };

    console.log(
      '\n(ii) FAILED-CHUNK ACTIVATION TRIM (completeChunkPlan :985-1000), driven directly',
    );
    // Holder object, not a bare `let`: TypeScript narrows a variable only
    // assigned inside a callback to `never` at the read site (F1255 — the
    // exclusion removal surfaced it).
    const cap: { ids: string[] | null } = { ids: null };
    const origProcess = pipeline.unifiedProcessingService.processLLMOutput.bind(
      pipeline.unifiedProcessingService,
    );
    pipeline.unifiedProcessingService.processLLMOutput = async (
      input: any,
      opts: any,
    ) => {
      cap.ids = input.sourceMetadata.extractionTrace.activateDocumentIds;
      return {
        entitiesCreated: 0,
        connectionsCreated: 0,
        affectedConnectionIds: [],
        affectedPlaceIds: [],
      };
    };
    try {
      await pipeline.completeChunkPlan(args);
    } finally {
      pipeline.unifiedProcessingService.processLLMOutput = origProcess;
    }
    console.log(
      `  requested activation: [${good.documentId.slice(0, 8)} (good chunk), ${bad.documentId.slice(0, 8)} (FAILED chunk)]`,
    );
    console.log(
      `  actual activation   : [${(cap.ids ?? []).map((d: string) => d.slice(0, 8)).join(', ')}]`,
    );
    const ok = cap.ids?.length === 1 && cap.ids[0] === good.documentId;
    console.log(
      '  ',
      ok
        ? 'PASS — failed chunk’s document keeps its prior pointer'
        : '*** FAIL ***',
    );

    const runRow = await prisma.$queryRawUnsafe<any[]>(
      `SELECT status FROM collection_extraction_runs WHERE extraction_run_id=$1::uuid`,
      runId,
    );
    console.log(
      `  run status after a failed chunk: ${runRow[0].status}  (expect failed, not completed)`,
    );
  } finally {
    // ================= CLEANUP (F1255: try/finally, EVERY exit path) ==========
    // Cleanup and the residue proof used to sit on the happy path, so the one
    // run that leaked rows — a mid-run throw — was precisely the run whose
    // residue report never printed. The lifecycle is owned on every exit now,
    // and residue > 0 is a NON-ZERO EXIT, not a line of console output nobody
    // reads.
    await prisma.$executeRawUnsafe(
      `DELETE FROM collection_extraction_input_documents WHERE document_id IN ($1::uuid,$2::uuid)`,
      good!.documentId,
      bad!.documentId,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM collection_extraction_inputs WHERE extraction_run_id=$1::uuid`,
      runId,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM collection_source_documents WHERE document_id IN ($1::uuid,$2::uuid)`,
      good!.documentId,
      bad!.documentId,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM collection_extraction_runs WHERE metadata->>'tag'='${TAG}'`,
    );
    const residue = await prisma.$queryRawUnsafe<any[]>(`
      SELECT 'runs' k, count(*)::int c FROM collection_extraction_runs WHERE metadata->>'tag'='${TAG}'
      UNION ALL SELECT 'docs', count(*)::int FROM collection_source_documents WHERE community='${TAG}'`);
    console.log('\nRESIDUE:', JSON.stringify(residue));
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
