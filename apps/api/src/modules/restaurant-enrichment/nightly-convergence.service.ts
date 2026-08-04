import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FoodDedupeMergeService } from '../content-processing/entity-resolver/food-dedupe-merge.service';
import { RescoreCoordinatorService } from '../content-processing/public-crave-score/rescore-coordinator.service';
import { ProjectionRebuildService } from '../content-processing/reddit-collector/projection-rebuild.service';
import { LoggerService } from '../../shared';
import { RestaurantEntityMergeService } from './restaurant-entity-merge.service';

/**
 * THE NIGHTLY CONVERGENCE ORDER (round-12 architecture audit): the
 * pipeline has a REQUIRED sequence — identities converge (merges), then
 * evidence re-points (tombstone sweep), then projections reconcile —
 * but it used to be encoded in cron clock-arithmetic across four
 * modules, and two same-minute @Crons didn't even honor registration
 * order (executed: repair fired before the sweep, making the sweep's
 * "runs before the orphan repair" docblock false). One coordinator, one
 * @Cron, phases awaited in declared order; each phase is fail-isolated
 * so one bad night in one phase never silences the rest. The phase
 * services keep their logic and lose their decorators.
 */
@Injectable()
export class NightlyConvergenceService {
  private readonly logger: LoggerService;

  constructor(
    private readonly restaurantMerge: RestaurantEntityMergeService,
    private readonly foodDedupe: FoodDedupeMergeService,
    private readonly projectionRebuild: ProjectionRebuildService,
    private readonly rescoreCoordinator: RescoreCoordinatorService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('NightlyConvergenceService');
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runNightly(): Promise<void> {
    const startedAt = Date.now();
    const phases: Array<[string, () => Promise<unknown>]> = [
      // identity heal + food dedupe (heal is fail-isolated inside)
      ['food-dedupe', () => this.foodDedupe.runNightly()],
      [
        'restaurant-merge-sweep',
        () => this.restaurantMerge.sweepSameNameDuplicates({ apply: true }),
      ],
      // evidence re-points through redirects the merges just wrote
      ['tombstone-sweep', () => this.projectionRebuild.sweepTombstoneEvents()],
      // projections reconcile against the re-pointed ledger
      [
        'projection-reconcile',
        () => this.projectionRebuild.repairOrphanedProjections(),
      ],
      // Night-one finding (2026-08-04): merges prune LOSER scores in-tx
      // but nothing re-scored the WINNERS — the hourly rescore no-ops
      // unless dirty. Convergence changed the corpus; say so.
      [
        'mark-rescore-dirty',
        () => this.rescoreCoordinator.markDirty('nightly-convergence'),
      ],
    ];
    for (const [name, run] of phases) {
      const phaseStart = Date.now();
      try {
        await run();
        this.logger.info('Nightly convergence phase complete', {
          phase: name,
          durationMs: Date.now() - phaseStart,
        });
      } catch (error) {
        // logger.error IS the Sentry seam — loud, but the night goes on.
        this.logger.error('Nightly convergence phase FAILED', error, {
          phase: name,
        });
      }
    }
    this.logger.info('Nightly convergence complete', {
      durationMs: Date.now() - startedAt,
    });
  }
}
