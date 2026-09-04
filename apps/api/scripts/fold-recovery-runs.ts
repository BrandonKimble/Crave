/**
 * @script-class: operational
 * @finding: red team 2026-09-04 T1-2 — banked-refusal recovery runs whose
 *   evidence never activated (staging: 75 runs, 2,122 events, 0 active).
 *
 * FOLD STRANDED RECOVERY RUNS INTO THE SHADOWS THEY RECOVERED FOR.
 *
 * `ReplayService.recoverBankedRefusals` now folds each recovery run into
 * its shadow the moment it completes (foldRecoveryRunIntoShadow). This
 * script applies the same fold to the runs minted BEFORE that landed: every
 * completed run with `metadata.replaySource = 'banked_refusals'` and a
 * `replayOfExtractionRunId`, not yet stamped `foldedIntoExtractionRunId`.
 *
 * When the shadow is already ACTIVE for some documents, folding makes the
 * recovered evidence live immediately, so the affected restaurants'
 * projections are rebuilt post-fold (the same rebuild activation runs).
 *
 *   DATABASE_URL=<target> npx ts-node -T scripts/fold-recovery-runs.ts            # dry run
 *   DATABASE_URL=<target> npx ts-node -T scripts/fold-recovery-runs.ts --execute
 */
import 'dotenv/config';
process.env.PROCESS_ROLE ||= 'api';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  ExtractionScopeService,
  foldRecoveryRunIntoShadow,
} from '../src/modules/content-processing/reddit-collector/extraction-scope.service';
import { ProjectionRebuildService } from '../src/modules/content-processing/reddit-collector/projection-rebuild.service';
import { stopCronsForScript } from '../src/shared/utils/stop-crons';

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  stopCronsForScript(app);
  const prisma = app.get(PrismaService);
  const rebuild = app.get(ProjectionRebuildService);
  const scope = app.get(ExtractionScopeService);
  try {
    const stranded = await prisma.$queryRaw<
      Array<{ recovery: string; shadow: string; events: bigint }>
    >`
      SELECT r.extraction_run_id::text AS recovery,
             (r.metadata->>'replayOfExtractionRunId') AS shadow,
             (SELECT count(*) FROM core_restaurant_entity_events e
               WHERE e.extraction_run_id = r.extraction_run_id)
             + (SELECT count(*) FROM core_restaurant_events e
               WHERE e.extraction_run_id = r.extraction_run_id) AS events
        FROM collection_extraction_runs r
       WHERE r.status = 'completed'
         AND r.metadata->>'replaySource' = 'banked_refusals'
         AND r.metadata->>'replayOfExtractionRunId' IS NOT NULL
         AND r.metadata->>'foldedIntoExtractionRunId' IS NULL
       ORDER BY r.started_at`;
    console.log(
      `${stranded.length} stranded recovery run(s); ${stranded.reduce((n, r) => n + Number(r.events), 0)} events; ${execute ? 'EXECUTING' : 'dry run'}`,
    );
    for (const row of stranded) {
      const activeDocs = await scope.activeDocumentCountForRun(row.shadow);
      console.log(
        `  ${row.recovery.slice(0, 8)} → ${row.shadow.slice(0, 8)}  events=${row.events}  shadowActiveDocs=${activeDocs}`,
      );
      if (!execute) continue;
      const affectedDocs = await prisma.$queryRaw<
        Array<{ document_id: string }>
      >`
        SELECT DISTINCT source_document_id AS document_id
          FROM core_restaurant_entity_events WHERE extraction_run_id = ${row.recovery}::uuid
        UNION
        SELECT DISTINCT source_document_id
          FROM core_restaurant_events WHERE extraction_run_id = ${row.recovery}::uuid`;
      const counts = await prisma.$transaction((tx) =>
        foldRecoveryRunIntoShadow(tx, row.shadow, row.recovery),
      );
      console.log(`    folded: ${JSON.stringify(counts)}`);
      if (activeDocs > 0 && affectedDocs.length) {
        const places = await prisma.$queryRaw<Array<{ place_id: string }>>`
          SELECT DISTINCT restaurant_id AS place_id FROM core_restaurant_entity_events
           WHERE source_document_id = ANY(${affectedDocs.map((d) => d.document_id)}::uuid[])
          UNION
          SELECT DISTINCT restaurant_id FROM core_restaurant_events
           WHERE source_document_id = ANY(${affectedDocs.map((d) => d.document_id)}::uuid[])`;
        await rebuild.rebuildForPlaces(places.map((p) => p.place_id));
        console.log(`    rebuilt ${places.length} place projection(s)`);
      }
    }
  } finally {
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
