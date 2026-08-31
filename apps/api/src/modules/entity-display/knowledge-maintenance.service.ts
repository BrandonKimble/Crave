import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AdvisoryLockService } from '../../shared/advisory-lock/advisory-lock.service';
import { isEnvFlagEnabled } from '../../shared/config/env-flag';
import { LabelSweepService } from './label-sweep.service';
import { OrthographicVariantSweepService } from './orthographic-variant-sweep.service';
import { VocabularyGenerator } from './vocabulary-generator';
import { ConceptSatisfiesService } from '../content-processing/entity-resolver/concept-satisfies.service';
import { RestaurantNameCensusService } from '../content-processing/entity-resolver/restaurant-name-census.service';

/**
 * THE KNOWLEDGE MAINTENANCE RAIL (concept-graph §9, owner-ruled 2026-08-08:
 * "do it all") — ONE standing loop for every watermark-driven LLM pass, in
 * dependency order, running WHERE THE DATA LIVES.
 *
 * WHY IT EXISTS. Until now every pass was a hand-run laptop script — and the
 * never-point-local-at-prod guard (correctly) refuses them against prod, so
 * production sat at 73 es aliases while local held 20,000. A live app also
 * accretes: extraction mints concepts daily, and each is unlabeled,
 * unreconciled and unjudged until someone remembers three scripts. The
 * watermarks already make every pass idempotent, incremental and re-entrant;
 * this service just runs them in the one order that matters:
 *
 *   0. ORTHOGRAPHIC CENSUS (mechanical, free, 2026-08-30) — the closed
 *      &↔"and" retypings minted as recall surfaces; watermark is the variant
 *      row itself, so a quiet corpus does zero work and a new mint is
 *      covered the next night. No LLM, no ledger, no flag of its own.
 *   1. VOCABULARY SWEEP (per locale) — labels + surfaces for concepts below
 *      the current prompt version. Blocked surfaces auto-route to the
 *      word-claim adjudicator inside the sweep itself.
 *   2. SATISFIES — rung 4 over the residual candidate pairs.
 *   3. RESTAURANT-NAME CENSUS (flywheel arming 2026-08-30) — the
 *      generic-word census feeds the restaurant-name court its docket
 *      (single-word recall surfaces on place entities, riskiest first). Last
 *      because nothing on this rail depends on its output and its input —
 *      place surfaces — is minted by extraction, not by steps 1–2. It has
 *      its OWN flag under this rail's flag (RESTAURANT_NAME_CENSUS_ENABLED,
 *      default OFF, on the launch flip-list): the census must not arm just
 *      because label sweeps do, and note the coupling — flipping the census
 *      on requires this rail's flag on too. The court's verdict ledger is
 *      its watermark; the rehearing allowance is its governed spend, and a
 *      budget refusal is reported, never fatal to the rail.
 *
 * (There is no reconciliation step. This header listed one until 2026-08-09;
 * it described `reconcileLabelSurfaces`, which the surface merge DELETED —
 * display and recall are two roles of one row, so there are no longer two
 * stores for a standing pass to reconcile.)
 *
 * ONE RUNNER ACROSS PROCESSES. The re-entrancy guard is a Postgres advisory
 * lock, not a field: a per-process boolean stops the worker re-entering
 * itself and stops nothing else, so two replicas — or a replica and a
 * hand-run script — would each run the full rail and each pay the LLM bill.
 * Same idiom as the promotion drain and the rescore coordinator.
 *
 * SPEND POSTURE: every pass is watermark-bounded (a quiet corpus costs ~$0;
 * a prompt bump re-pays once), the sweep is limit-capped per night, and the
 * whole rail sits behind its own flag UNDER the global CRONS_ENABLED
 * kill-switch. The nightly expected-spend comparator (D149) is the scream
 * layer above it.
 *
 * PROD ONE-SHOT: crons are off in prod today, so
 * RUN_KNOWLEDGE_MAINTENANCE_ON_BOOT=1 runs one full pass at worker boot —
 * set the var, redeploy, unset. That is the sanctioned prod execution rail
 * the never-point-local-at-prod law demands.
 */
/** 'know' — same convention as RESCORE_ADVISORY_LOCK_KEY (0x63726176 'crav')
 *  and PROMOTION_DRAIN_ADVISORY_LOCK_KEY (0x706f6c79 'poly'). */
const KNOWLEDGE_MAINTENANCE_ADVISORY_LOCK_KEY = 0x6b6e6f77;

@Injectable()
export class KnowledgeMaintenanceService {
  private readonly logger = new Logger(KnowledgeMaintenanceService.name);

  /** Sweep cap per locale per run — bounds one night's spend. */
  private static readonly SWEEP_LIMIT = 2000;
  private static readonly SATISFIES_LIMIT = 200;
  /**
   * THE RAIL'S WAITING CONTRACT: a pass never outlives the period that
   * scheduled it. The cron above runs daily, so one day IS the budget —
   * every locale sweep receives deadlineAt = start + this period, the
   * generator turns it into the pooled batch runner's cancelling wait, and
   * whatever goes unanswered stays due for the next tick. Locale sweeps are
   * independent (per-locale ledger pass, per-locale surface rows, the
   * collision guard's partial uniques arbitrate simultaneous writes), so
   * they run CONCURRENTLY and share this wall-clock budget instead of
   * queueing behind each other — one slow language can no longer starve the
   * others out of their night.
   */
  private static readonly RAIL_PERIOD_MS = 24 * 60 * 60 * 1000;

  constructor(
    private readonly labelSweep: LabelSweepService,
    private readonly vocabulary: VocabularyGenerator,
    private readonly satisfies: ConceptSatisfiesService,
    private readonly advisoryLock: AdvisoryLockService,
    private readonly nameCensus: RestaurantNameCensusService,
    private readonly orthographic: OrthographicVariantSweepService,
  ) {}

  onModuleInit(): void {
    if (isEnvFlagEnabled(process.env.RUN_KNOWLEDGE_MAINTENANCE_ON_BOOT)) {
      // Fire-and-forget: boot must not block on an LLM pass; failures land
      // in the run's own logging and the watermark re-offers next run.
      void this.runOnce('boot');
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async nightly(): Promise<void> {
    if (!isEnvFlagEnabled(process.env.KNOWLEDGE_MAINTENANCE_ENABLED)) return;
    await this.runOnce('cron');
  }

  async runOnce(trigger: 'cron' | 'boot' | 'manual'): Promise<void> {
    // CROSS-PROCESS single runner, on a DEDICATED session. The loser skips
    // this pass entirely; every pass in the rail is watermark-driven, so the
    // next tick simply picks up whatever the winner did not reach — there is
    // nothing to queue. (The lock used to be taken and released through the
    // shared connection POOL, which released nothing and stranded the rail.)
    const outcome = await this.advisoryLock.withAdvisoryLock(
      KNOWLEDGE_MAINTENANCE_ADVISORY_LOCK_KEY,
      () => this.runPass(trigger),
    );
    if (!outcome.acquired) {
      this.logger.log(
        `knowledge maintenance skipped trigger=${trigger} (another process holds the rail)`,
      );
    }
  }

  private async runPass(trigger: 'cron' | 'boot' | 'manual'): Promise<void> {
    const startedAt = Date.now();
    const deadlineAt = startedAt + KnowledgeMaintenanceService.RAIL_PERIOD_MS;
    // CONCURRENT, ISOLATED, DEADLINED (see RAIL_PERIOD_MS). allSettled, not
    // a loop: one locale's failure is that locale's news, never a reason
    // the languages after it — or the satisfies pass — go unserved.
    // STEP 0 — THE ORTHOGRAPHIC CENSUS, first and free. Mechanical (&↔"and"
    // retypings, no LLM, no ledger, watermark = the variant row itself), so
    // it runs unconditionally under the rail's own flag: a pass that costs
    // nothing needs no spend gate, and running it BEFORE the label sweeps
    // means a name minted yesterday is reachable by tonight. Isolated like
    // every step: its failure is its own news.
    try {
      const ortho = await this.orthographic.run();
      this.logger.log(
        `maintenance orthographic scanned=${ortho.scanned} touched=${ortho.entitiesTouched} ` +
          `banked=${ortho.variantsBanked} blocked=${ortho.variantsBlocked}`,
      );
    } catch (error) {
      this.logger.error(
        `maintenance orthographic failed trigger=${trigger}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    const locales = this.labelSweep.sweepLocales();
    const settled = await Promise.allSettled(
      locales.map((locale) =>
        this.labelSweep.sweep(locale, {
          limit: KnowledgeMaintenanceService.SWEEP_LIMIT,
          generator: this.vocabulary,
          deadlineAt,
        }),
      ),
    );
    settled.forEach((result, index) => {
      const locale = locales[index];
      if (result.status === 'fulfilled') {
        const sweep = result.value;
        this.logger.log(
          `maintenance sweep locale=${locale} due=${sweep.due} written=${sweep.written} banked=${sweep.surfacesBanked} wonOnAppeal=${sweep.surfacesWonOnAppeal} blocked=${sweep.surfacesBlocked} unanswered=${sweep.unanswered}`,
        );
      } else {
        this.logger.error(
          `maintenance sweep failed locale=${locale}: ${
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason)
          }`,
        );
      }
    });
    try {
      const judged = await this.satisfies.run({
        limit: KnowledgeMaintenanceService.SATISFIES_LIMIT,
      });
      this.logger.log(
        `maintenance satisfies ${JSON.stringify(judged).slice(0, 200)}`,
      );
    } catch (error) {
      this.logger.error(
        `maintenance satisfies failed trigger=${trigger}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    // STEP 3 — restaurant-name census, behind its OWN default-off flag (see
    // header). Isolated like satisfies: its failure is its own news.
    if (isEnvFlagEnabled(process.env.RESTAURANT_NAME_CENSUS_ENABLED, false)) {
      try {
        const census = await this.nameCensus.run({ dryRun: false });
        this.logger.log(
          `maintenance name-census scanned=${census.scanned} decided=${census.alreadyDecided} ` +
            `docket=${census.docket} refusedByBudget=${census.refusedByBudget} ` +
            `upheld=${census.hearing?.namesUpheld ?? 0} denied=${census.hearing?.namesDenied ?? 0} ` +
            `unjudged=${census.hearing?.unjudged ?? 0}`,
        );
      } catch (error) {
        this.logger.error(
          `maintenance name-census failed trigger=${trigger}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    this.logger.log(
      `knowledge maintenance complete trigger=${trigger} ms=${Date.now() - startedAt}`,
    );
  }
}
