import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ItemDedupeMergeService } from '../content-processing/entity-resolver/food-dedupe-merge.service';
import { DishKnowledgeSynthesisService } from '../content-processing/entity-resolver/dish-knowledge-synthesis.service';
import { RescoreCoordinatorService } from '../content-processing/public-crave-score/rescore-coordinator.service';
import { ProjectionRebuildService } from '../content-processing/reddit-collector/projection-rebuild.service';
import { LoggerService } from '../../shared';
import { PlaceEntityMergeService } from './restaurant-entity-merge.service';
import { PlaceTypeCensusService } from './place-type-census.service';
import { MarketMembershipService } from './market-membership.service';
import { VenueCuisineEvidenceService } from './venue-cuisine-evidence.service';

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
    private readonly placeMerge: PlaceEntityMergeService,
    private readonly itemDedupe: ItemDedupeMergeService,
    private readonly projectionRebuild: ProjectionRebuildService,
    private readonly rescoreCoordinator: RescoreCoordinatorService,
    private readonly placeTypeCensus: PlaceTypeCensusService,
    private readonly marketMembership: MarketMembershipService,
    private readonly dishKnowledge: DishKnowledgeSynthesisService,
    private readonly venueCuisineEvidence: VenueCuisineEvidenceService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('NightlyConvergenceService');
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runNightly(): Promise<void> {
    const startedAt = Date.now();
    const phases: Array<[string, () => Promise<unknown>]> = [
      // identity heal + food dedupe (heal is fail-isolated inside)
      ['food-dedupe', () => this.itemDedupe.runNightly()],
      [
        'restaurant-merge-sweep',
        () => this.placeMerge.sweepSameNameDuplicates({ apply: true }),
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
      // v17 S4: market-membership verdicts re-derived from state after the
      // merges/sweeps above moved evidence — a place credited only by a
      // community whose metro it sits outside is excluded from search and
      // scoring (never deleted).
      ['market-membership', () => this.marketMembership.reconcile()],
      // redteam-l2 K8: the knowledge-cuisine grain bridge is a STATE-derived
      // projection (dish stamp vs connection stamp), not part of the LLM
      // synthesis pass — so it converges nightly regardless of the
      // DISH_KNOWLEDGE_SYNTHESIS_ENABLED flag. Without this, a new
      // connection for an already-synthesized dish (or any environment with
      // the flag unset) left the dish-side cuisine home silently empty and
      // "mexican" degraded to venue-side-only.
      [
        'knowledge-cuisine-projection',
        () => this.dishKnowledge.projectKnowledgeCuisines(),
      ],
      // D5 (2026-08-30): the deterministic dish-set venue-cuisine evidence
      // lane (reads the knowledge cuisines the phase above just converged)
      // — recomputed from state, diffed against its own source class,
      // re-projected. Deterministic and free, so like the grain bridge it
      // runs regardless of any LLM lane's flag. (The venue-NAME signal is
      // NOT here: the name is an input of the LLM venue-facts judge.)
      ['venue-cuisine-evidence', () => this.venueCuisineEvidence.reconcile()],
      // R11 census: a Google place type stored on a grounded restaurant that
      // google-place-type-attributes.ts classifies as neither kind nor noise
      // raises a deduped ops alert (Google shipped a taxonomy change).
      ['place-type-census', () => this.placeTypeCensus.runNightly()],
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
