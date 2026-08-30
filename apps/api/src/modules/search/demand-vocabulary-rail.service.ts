import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { isEnvFlagEnabled } from '../../shared/config/env-flag';
import { isSchedulerRuntime } from '../../shared/utils/process-role';
import { DemandVocabularyService } from './demand-vocabulary.service';

/**
 * THE DEMAND-VOCABULARY RAIL — the standing caller the sweep never had
 * (flywheel arming, owner-ordered 2026-08-30).
 *
 * The sweep itself (demand-vocabulary.service.ts) was audited "in excellent
 * shape" and ran only when a human typed
 * `scripts/run-demand-vocabulary.ts` — a learner that silently stops
 * learning the day nobody remembers the command. This rail is the cron it
 * lacked; the sweep is unchanged.
 *
 * WHY THIS LIVES IN THE SEARCH MODULE AND NOT ON THE VOCABULARY-MAINTENANCE
 * RAIL'S OWN SERVICE (the rail-choice ruling this wiring had to make): the
 * sweep is the vocabulary family by cadence, but by DEPENDENCY it is a
 * search-layer job — it reads the signals ask ledger and drives
 * EntityTextSearchService, and its module (search) already imports the
 * entity-resolver module that hosts vocabulary-maintenance. Registering the
 * sweep on that lower rail would invert the layering (entity-resolver
 * importing search) into a module cycle. So the CADENCE joins the family —
 * 4:30AM, right after the 4AM word-hearing drain — while the code stays
 * where its dependencies point.
 *
 * SPEND POSTURE, same as every standing pass: the sweep's own per-run cap
 * (100 distinct terms) bounds one night at ~100 identity-judge calls worst
 * case; a night with no unmet asks costs $0 (the ledger query returns
 * nothing). Idempotency needs no watermark: learned terms leave the docket
 * by BECOMING KNOWN (the known-set filter), unlearnable ones stay demand by
 * design, and the write path (addSurfaces) is idempotent — the ledger is
 * re-read whole every night on purpose, because yesterday's "left as
 * demand" can become learnable the day collection mints the concept.
 *
 * CROSS-PROCESS single-runner lives INSIDE the sweep (its own advisory
 * lock, key 'demv' — distinct from the vocabulary-maintenance rail's 'vocb'
 * after the 2026-08-30 collision fix), so this rail adds only the schedule,
 * the global kill-switch, and the flag.
 *
 * DEFAULT OFF (iteration-phase ruling 2026-08-09): the input is user
 * demand and there is none before launch — a cron would run empty forever.
 * `DEMAND_VOCABULARY_SWEEP_ENABLED=true` arms it; it is on the launch
 * flip-list (plans/launch-flip-list.md).
 */
@Injectable()
export class DemandVocabularyRailService {
  private readonly logger = new Logger(DemandVocabularyRailService.name);

  constructor(private readonly demandVocabulary: DemandVocabularyService) {}

  private get enabled(): boolean {
    // Global kill-switch first (CRONS_ENABLED / PROCESS_ROLE), then this
    // rail's own flag — DEFAULT OFF, the launch flip-list arms it.
    return (
      isSchedulerRuntime() &&
      isEnvFlagEnabled(process.env.DEMAND_VOCABULARY_SWEEP_ENABLED, false)
    );
  }

  /** 4:30AM — the vocabulary family's window, offset from the 4AM
   *  word-hearing drain so the two never contend for a nightly slot. */
  @Cron('30 4 * * *')
  async nightly(): Promise<void> {
    if (!this.enabled) return;
    await this.runOnce('cron');
  }

  async runOnce(trigger: 'cron' | 'manual'): Promise<void> {
    try {
      const summary = await this.demandVocabulary.run();
      this.logger.log(
        `demand vocabulary trigger=${trigger} considered=${summary.termsConsidered} ` +
          `judged=${summary.judged} learned=${summary.learned} ` +
          `refused=${summary.refused} leftAsDemand=${summary.leftAsDemand}`,
      );
    } catch (error) {
      // logger.error, never warn: an unlearned word degrades every future
      // search that types it, silently.
      this.logger.error(
        `demand vocabulary sweep FAILED trigger=${trigger}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
