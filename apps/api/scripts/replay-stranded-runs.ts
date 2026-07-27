import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReplayService } from '../src/modules/content-processing/reddit-collector/replay.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

/**
 * Targeted re-extraction of every run still holding STRANDED food_mention
 * evidence, under the proven family-size prompt (13/13 on the localized
 * batch). Run-by-run and resumable: each run activates on success, so a
 * crash leaves completed runs re-pointed and the rest untouched — rerun to
 * continue (already-clean runs are skipped).
 *
 *   yarn workspace api ts-node scripts/replay-stranded-runs.ts [--limit=N]
 */
async function main(): Promise<void> {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  stopCronsForScript(app);
  const out = (m = '') => process.stdout.write(`${m}\n`);
  try {
    const prisma = app.get(PrismaService);
    const replay = app.get(ReplayService);
    const runs = await prisma.$queryRaw<Array<{ runId: string; docs: number }>>`
      SELECT ev.extraction_run_id AS "runId",
             count(DISTINCT ev.source_document_id)::int AS docs
      FROM core_restaurant_entity_events ev
      JOIN collection_source_documents d
        ON d.document_id = ev.source_document_id
       AND d.active_extraction_run_id = ev.extraction_run_id
      WHERE ev.evidence_type = 'food_mention'
      GROUP BY ev.extraction_run_id
      ORDER BY count(DISTINCT ev.source_document_id) DESC
    `;
    const targets = runs.slice(0, limit);
    out(`stranded runs: ${runs.length} (replaying ${targets.length})`);
    let done = 0;
    let failed = 0;
    for (const [i, run] of targets.entries()) {
      try {
        const result = await replay.replayExtractionRun({
          sourceExtractionRunId: run.runId,
          activate: true,
        });
        done += 1;
        out(
          `[${i + 1}/${targets.length}] ${run.runId} docs=${run.docs} -> ${
            (result as { extractionRunId?: string }).extractionRunId ?? 'ok'
          }`,
        );
      } catch (error) {
        failed += 1;
        out(
          `[${i + 1}/${targets.length}] ${run.runId} FAILED: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    out(`\ncomplete: replayed=${done} failed=${failed}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exit(1);
});
