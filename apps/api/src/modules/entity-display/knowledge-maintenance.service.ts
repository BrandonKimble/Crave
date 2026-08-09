import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
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
 *   2. SATISFIES — rung 4 over the residual candidate pairs.
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

  constructor(
    private readonly labelSweep: LabelSweepService,
    private readonly vocabulary: VocabularyGenerator,
    private readonly satisfies: ConceptSatisfiesService,
    private readonly prisma: PrismaService,
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
    // CROSS-PROCESS single runner. The loser skips this pass entirely; every
    // pass in the rail is watermark-driven, so the next tick simply picks up
    // whatever the winner did not reach — there is nothing to queue.
    const lock = await this.prisma.$queryRaw<Array<{ locked: boolean }>>(
      Prisma.sql`SELECT pg_try_advisory_lock(${KNOWLEDGE_MAINTENANCE_ADVISORY_LOCK_KEY}) AS locked`,
    );
    if (!lock[0]?.locked) {
      this.logger.log(
        `knowledge maintenance skipped trigger=${trigger} (another process holds the rail)`,
      );
      return;
    }
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
      // Best-effort release; a pooled connection MAY not be the acquiring
      // session (same caveat as the promotion drain). An unreleased lock
      // self-heals when the connection closes; log so a stuck rail is
      // attributable rather than mysterious.
      const released = await this.prisma
        .$queryRaw<
          Array<{ unlocked: boolean }>
        >(Prisma.sql`SELECT pg_advisory_unlock(${KNOWLEDGE_MAINTENANCE_ADVISORY_LOCK_KEY}) AS unlocked`)
        .catch(() => [{ unlocked: false }]);
      if (!released[0]?.unlocked) {
        this.logger.warn(
          'knowledge maintenance advisory lock not released by this session',
        );
      }
    }
  }
}
