import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { isEnvFlagEnabled } from '../../shared/config/env-flag';
import { LabelSweepService } from './label-sweep.service';
import { VocabularyGenerator } from './vocabulary-generator';
import { ConceptSatisfiesService } from '../content-processing/entity-resolver/concept-satisfies.service';

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
 *   1. VOCABULARY SWEEP (per locale) — labels + surfaces for concepts below
 *      the current prompt version. Blocked surfaces auto-route to the
 *      word-claim adjudicator inside the sweep itself.
 *   2. LABEL RECONCILIATION — any label surface still absent from the alias
 *      registry is offered through the guard + judge ("labels display,
 *      aliases ground" stays true by standing enforcement, not one-time
 *      migration).
 *   3. SATISFIES — rung 4 over the residual candidate pairs.
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
@Injectable()
export class KnowledgeMaintenanceService {
  private readonly logger = new Logger(KnowledgeMaintenanceService.name);
  private inFlight = false;

  /** Sweep cap per locale per run — bounds one night's spend. */
  private static readonly SWEEP_LIMIT = 2000;
  private static readonly SATISFIES_LIMIT = 200;

  constructor(
    private readonly labelSweep: LabelSweepService,
    private readonly vocabulary: VocabularyGenerator,
    private readonly satisfies: ConceptSatisfiesService,
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
    if (this.inFlight) return;
    this.inFlight = true;
    const startedAt = Date.now();
    try {
      for (const locale of this.labelSweep.sweepLocales()) {
        const sweep = await this.labelSweep.sweep(locale, {
          limit: KnowledgeMaintenanceService.SWEEP_LIMIT,
          generator: this.vocabulary,
        });
        this.logger.log(
          `maintenance sweep locale=${locale} due=${sweep.due} written=${sweep.written} banked=${sweep.surfacesBanked} blocked=${sweep.surfacesBlocked}`,
        );
      }
      const judged = await this.satisfies.run({
        limit: KnowledgeMaintenanceService.SATISFIES_LIMIT,
      });
      this.logger.log(
        `maintenance satisfies ${JSON.stringify(judged).slice(0, 200)}`,
      );
      this.logger.log(
        `knowledge maintenance complete trigger=${trigger} ms=${Date.now() - startedAt}`,
      );
    } catch (error) {
      this.logger.error(
        `knowledge maintenance failed trigger=${trigger}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.inFlight = false;
    }
  }
}
