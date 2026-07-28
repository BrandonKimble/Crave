import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReplayService } from '../src/modules/content-processing/reddit-collector/replay.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/**
 * MEASURED replay pilot: re-extract a bounded document set under the current
 * prompt and report the ACTUAL all-in LLM cost from the usage ledger — every
 * caller, not just extraction (re-extraction also drives entity-resolution
 * matching, attribute adjudication and embeddings, which a per-document
 * extraction price silently omits). Extrapolate from this, never from a
 * model: the whole point is that the number is observed.
 *
 *   yarn workspace api ts-node scripts/replay-pilot.ts [--docs=500]
 */
async function main(): Promise<void> {
  const arg = process.argv.find((a) => a.startsWith('--docs='));
  const targetDocs = arg ? parseInt(arg.split('=')[1], 10) : 500;
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);
  try {
    const prisma = app.get(PrismaService);
    const replay = app.get(ReplayService);

    const runs = await prisma.$queryRaw<Array<{ runId: string; docs: number }>>`
      SELECT d.active_extraction_run_id AS "runId",
             count(DISTINCT d.document_id)::int AS docs
      FROM collection_source_documents d
      WHERE d.active_extraction_run_id IS NOT NULL
        AND d.community = 'austinfood'
      GROUP BY d.active_extraction_run_id
      HAVING count(DISTINCT d.document_id) BETWEEN 20 AND 200
      ORDER BY random()
      LIMIT 20
    `;
    const picked: typeof runs = [];
    let docs = 0;
    for (const r of runs) {
      if (docs >= targetDocs) break;
      picked.push(r);
      docs += r.docs;
    }
    out(`pilot: ${picked.length} runs / ${docs} docs (austinfood)`);

    const before = await prisma.$queryRaw<
      Array<{ caller: string; inTok: bigint; outTok: bigint; calls: bigint }>
    >`SELECT caller, COALESCE(sum(input_tokens),0) AS "inTok",
             COALESCE(sum(output_tokens),0) AS "outTok", count(*) AS calls
      FROM api_usage_ledger GROUP BY caller`;
    const baseline = new Map(
      before.map((r) => [r.caller, { inTok: Number(r.inTok), outTok: Number(r.outTok), calls: Number(r.calls) }]),
    );

    const started = Date.now();
    let ok = 0;
    for (const [i, run] of picked.entries()) {
      try {
        await replay.replayExtractionRun({ sourceExtractionRunId: run.runId, activate: true });
        ok += 1;
        out(`[${i + 1}/${picked.length}] ${run.runId} (${run.docs} docs) ok`);
      } catch (e) {
        out(`[${i + 1}/${picked.length}] ${run.runId} FAILED: ${e instanceof Error ? e.message : e}`);
      }
    }

    const after = await prisma.$queryRaw<
      Array<{ caller: string; inTok: bigint; outTok: bigint; calls: bigint }>
    >`SELECT caller, COALESCE(sum(input_tokens),0) AS "inTok",
             COALESCE(sum(output_tokens),0) AS "outTok", count(*) AS calls
      FROM api_usage_ledger GROUP BY caller`;

    out(`\n=== PILOT SPEND DELTA (${docs} docs, ${ok}/${picked.length} runs, ${Math.round((Date.now()-started)/1000)}s)`);
    for (const row of after) {
      const b = baseline.get(row.caller) ?? { inTok: 0, outTok: 0, calls: 0 };
      const dIn = Number(row.inTok) - b.inTok;
      const dOut = Number(row.outTok) - b.outTok;
      const dCalls = Number(row.calls) - b.calls;
      if (dCalls > 0) out(`  ${row.caller}: calls=${dCalls} in=${dIn} out=${dOut}`);
    }
    out(`\nDOCS_REPLAYED=${docs}`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.stack : e}\n`);
  process.exit(1);
});
