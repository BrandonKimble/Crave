import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { ReplayService } from './replay.service';

/**
 * ONE-SHOT Austin full reload (charter §6 step 4), executed PROD-NATIVELY.
 *
 * Why a boot runner: the reload must run with prod env inside the prod
 * network, and the standing law forbids pointing laptop-run app code at the
 * prod DB. The worker is the natural host — it owns collection and is idle
 * while the scheduler is paused. Armed by RUN_AUSTIN_FULL_RELOAD=1; after
 * the DONE log the operator removes the flag. A crash-restart mid-run
 * re-replays from the top (replay is projection-idempotent; the cost risk
 * is duplicate batch submission, accepted for a supervised one-shot and
 * bounded by the spend gate every submission passes through).
 *
 * The wipe is NOT here — it ran first as reviewed SQL
 * (scripts/reload/wipe-austin-derived.sql), preserving every user-anchored
 * entity/connection per §2c. This runner only re-extracts: every Austin
 * document's active extraction run is replayed under the FINAL prompt;
 * extraction defers to Gemini BATCH (the default), so submissions land
 * fast and ingestion + projection rebuilds flow through the existing
 * worker batch machinery over the following hours.
 */
@Injectable()
export class FullReloadRunner implements OnApplicationBootstrap {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly replay: ReplayService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('FullReloadRunner');
  }

  onApplicationBootstrap(): void {
    if (process.env.RUN_AUSTIN_FULL_RELOAD !== '1') {
      return;
    }
    if ((process.env.PROCESS_ROLE || 'api') !== 'worker') {
      this.logger.warn(
        'RUN_AUSTIN_FULL_RELOAD set on a non-worker role — ignoring',
      );
      return;
    }
    // Fire-and-forget on purpose: boot must complete so the batch ingest
    // pollers this run depends on are alive alongside it.
    void this.run().catch((error: unknown) => {
      this.logger.error('Austin full reload CRASHED', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    });
  }

  private async run(): Promise<void> {
    const runs = await this.prisma.$queryRaw<
      Array<{ runId: string; docs: number }>
    >`
      SELECT d.active_extraction_run_id AS "runId",
             count(*)::int AS docs
      FROM collection_source_documents d
      WHERE d.community = 'austinfood'
        AND d.active_extraction_run_id IS NOT NULL
      GROUP BY 1
      ORDER BY min(d.collected_at)
    `;
    const totalDocs = runs.reduce((acc, run) => acc + run.docs, 0);
    this.logger.info('AUSTIN FULL RELOAD starting', {
      runs: runs.length,
      totalDocs,
    });

    let ok = 0;
    let failed = 0;
    let docsDone = 0;
    for (const [index, run] of runs.entries()) {
      try {
        await this.replay.replayExtractionRun({
          sourceExtractionRunId: run.runId,
          activate: true,
        });
        ok += 1;
      } catch (error) {
        failed += 1;
        this.logger.error('Reload run failed (continuing)', {
          runId: run.runId,
          error:
            error instanceof Error
              ? { message: error.message }
              : { message: String(error) },
        });
      }
      docsDone += run.docs;
      if ((index + 1) % 10 === 0 || index === runs.length - 1) {
        this.logger.info('AUSTIN FULL RELOAD progress', {
          runsDone: index + 1,
          runsTotal: runs.length,
          docsDone,
          totalDocs,
          failed,
        });
      }
    }

    this.logger.info('AUSTIN FULL RELOAD DONE (submission phase)', {
      ok,
      failed,
      totalDocs,
      note: 'Batch ingestion + projection rebuilds continue asynchronously; remove RUN_AUSTIN_FULL_RELOAD and re-enable COLLECTION_SCHEDULER_ENABLED once the batch queue drains.',
    });
  }
}
