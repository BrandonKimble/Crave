import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { ProjectionRebuildService } from './projection-rebuild.service';
import { isEnvFlagEnabled } from '../../../shared/config/env-flag';
import { resolveProcessRole } from '../../../shared/utils/process-role';

/**
 * ONE-SHOT full projection rebuild (worker boot, env-gated) — the generic
 * "after data surgery" catch-all. Class ②-④ of the 2026-08 data audit
 * repoint/delete evidence in SQL migrations, which cannot rebuild the
 * derived layer; this rebuilds EVERY restaurant with any evidence, in
 * batches, using the real rebuild path (advisory-locked, projection-
 * idempotent). Arm with RUN_FULL_PROJECTION_REBUILD=1; remove after the
 * DONE log. Also refreshes Crave Scores at the end (the projections feed
 * them).
 */
@Injectable()
export class FullProjectionRebuildRunner implements OnApplicationBootstrap {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectionRebuild: ProjectionRebuildService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('FullProjectionRebuildRunner');
  }

  onApplicationBootstrap(): void {
    // Canonical env-flag dialect (F466/F401). Default OFF, unchanged; '1'
    // still means on, and so now do 'true'/'yes'/'on' — an operator reaching
    // for this one-shot trigger no longer has to guess the spelling.
    if (!isEnvFlagEnabled(process.env.RUN_FULL_PROJECTION_REBUILD)) {
      return;
    }
    // ONE PROCESS-ROLE READER (F9608). This read the env var itself and
    // defaulted to 'api', while the canonical reader defaults to 'all' — two
    // rival answers to "what is this process" that disagree on the unset case
    // that every dev laptop and every script runs under. The rule this wants
    // is unchanged and deliberately STRICT: only the dedicated worker service
    // (PROCESS_ROLE=worker, start:prod:worker) may start a heavy one-shot
    // drain, so 'all' is not good enough here even though it is
    // worker-capable for scheduling.
    if (resolveProcessRole() !== 'worker') {
      this.logger.warn(
        'RUN_FULL_PROJECTION_REBUILD set on a non-worker role — ignoring',
      );
      return;
    }
    void this.run().catch((error: unknown) => {
      this.logger.error('Full projection rebuild CRASHED', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    });
  }

  private async run(): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT DISTINCT restaurant_id AS id FROM (
        SELECT restaurant_id FROM core_restaurant_entity_events
        UNION SELECT restaurant_id FROM core_restaurant_events
        UNION SELECT restaurant_id FROM core_restaurant_items
      ) r
    `;
    const ids = rows.map((row) => row.id);
    this.logger.info('FULL PROJECTION REBUILD starting', {
      restaurants: ids.length,
    });
    const BATCH = 50;
    for (let i = 0; i < ids.length; i += BATCH) {
      await this.projectionRebuild.rebuildForRestaurants(
        ids.slice(i, i + BATCH),
      );
      if ((i / BATCH) % 20 === 0) {
        this.logger.info('FULL PROJECTION REBUILD progress', {
          done: Math.min(i + BATCH, ids.length),
          total: ids.length,
        });
      }
    }
    this.logger.info('FULL PROJECTION REBUILD DONE', {
      restaurants: ids.length,
      note: 'Run scripts/rebuild-crave-scores.ts next; remove RUN_FULL_PROJECTION_REBUILD.',
    });
  }
}
