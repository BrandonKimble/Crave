import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AdvisoryLockService } from '../../../shared/advisory-lock/advisory-lock.service';
import { isEnvFlagEnabled } from '../../../shared/config/env-flag';
import { isSchedulerRuntime } from '../../../shared/utils/process-role';
import { JudgedVocabularyService } from './judged-vocabulary.service';

/**
 * THE VOCABULARY MAINTENANCE RAIL — the caller `drainPending` never had (A1 +
 * A6, 2026-08-15).
 *
 * THE FINDING THIS EXISTS FOR, stated plainly: the judged-vocabulary door
 * promised, in prose, that a word met unjudged is "queued for the next
 * hearing" and that "the miss self-heals, once, per word". Nothing drained the
 * queue. `drainPending()` had no caller anywhere in the repo, the queue was an
 * in-memory Map that died on every deploy, and the read cache was loaded once
 * at boot and never again — so an operator's certification run was invisible
 * to the running API until someone restarted it. Three promises, one missing
 * rail; this is the rail.
 *
 * TWO CADENCES, because they answer two different questions:
 *
 *   - THE DRAIN IS NIGHTLY. Hearing a word costs an LLM call, so it belongs
 *     with the other watermark-driven passes at a time nobody is searching.
 *     The budget gate inside the judge bounds what one night may buy, and
 *     whatever it refuses stays queued for the next one — the drain never
 *     drops a question because the allowance ran out.
 *   - THE CACHE REFRESH IS MINUTES. It buys no hearings; it is one indexed
 *     max(decided_at) and, when that moved, a reload of a table of short
 *     strings. Making a freshly certified vocabulary wait until 4am to
 *     become visible would reproduce exactly the staleness this fixes.
 *
 * THIS IS NOT A DerivedIndexJob, and the omission is a decision. That base
 * class is for a `derived_*` table whose EMPTINESS means derivation did not
 * happen, and it self-heals by full replace with a zero-output scream. Neither
 * applies: the queue is empty on a healthy day (that is success, not
 * degradation), and there is nothing to rebuild — verdicts are bought, not
 * derived. What that law contributes here is its cron discipline, and this
 * takes all of it: the global CRONS_ENABLED kill-switch via `isSchedulerRuntime`,
 * its own disable flag, a cross-process single-runner lock, and errors that go
 * to logger.error rather than warn.
 */
/** 'vocb' — same convention as the other advisory-lock keys in this repo. */
const VOCABULARY_MAINTENANCE_LOCK_KEY = 0x766f6362;

/** How often a process checks whether another one ruled something. */
const CACHE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class VocabularyMaintenanceService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(VocabularyMaintenanceService.name);

  /**
   * THE REFRESH POLL IS A PLAIN setInterval, NOT AN @Interval — and the
   * difference is the whole finding (foundation red team #1, 2026-08-15).
   * ScheduleModule.forRoot() is registered only under `isSchedulerRuntime()`
   * (app.module.ts), so an @Interval here was dead on EXACTLY the process
   * whose cache goes stale: the api serves the door, the worker buys the
   * verdicts, and the api's @Interval never ticked. The poll must run on
   * every long-lived runtime, so it starts itself in onModuleInit, honours
   * only this rail's own flag (never the scheduler gate), and unref()s so a
   * script that boots the full graph still exits.
   */
  private refreshTimer: NodeJS.Timeout | null = null;

  onModuleInit(): void {
    if (!isEnvFlagEnabled(process.env.VOCABULARY_MAINTENANCE_ENABLED, true)) {
      return;
    }
    this.refreshTimer = setInterval(
      () => void this.refreshCache(),
      CACHE_REFRESH_INTERVAL_MS,
    );
    this.refreshTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /** Per-process in-flight guard. The advisory lock is the CROSS-process one;
   *  this stops a slow drain from being re-entered by its own next tick. */
  private draining = false;
  private refreshing = false;

  constructor(
    private readonly vocabulary: JudgedVocabularyService,
    private readonly advisoryLock: AdvisoryLockService,
  ) {}

  private get enabled(): boolean {
    // The global kill-switch first (CRONS_ENABLED / PROCESS_ROLE), then this
    // rail's own flag — a rail that ignores the global switch is the defect
    // the cron audit was written to exterminate.
    return (
      isSchedulerRuntime() &&
      isEnvFlagEnabled(process.env.VOCABULARY_MAINTENANCE_ENABLED, true)
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async nightlyDrain(): Promise<void> {
    if (!this.enabled) return;
    await this.runDrain('cron');
  }

  /**
   * DRAIN THE DURABLE BACKLOG. Cross-process single runner: the loser skips,
   * because the queue is a table and the winner is already emptying it — there
   * is nothing to queue behind.
   */
  async runDrain(trigger: 'cron' | 'manual'): Promise<void> {
    if (this.draining) {
      this.logger.log(
        `vocabulary drain skipped trigger=${trigger} (in flight)`,
      );
      return;
    }
    this.draining = true;
    try {
      const outcome = await this.advisoryLock.withAdvisoryLock(
        VOCABULARY_MAINTENANCE_LOCK_KEY,
        async () => this.vocabulary.drainPending(),
      );
      if (!outcome.acquired) {
        this.logger.log(
          `vocabulary drain skipped trigger=${trigger} (another process holds the rail)`,
        );
        return;
      }
      const result = outcome.result;
      this.logger.log(
        `vocabulary drain trigger=${trigger} queued=${result?.queued ?? 0} ` +
          `heard=${result?.heard ?? 0} remaining=${result?.remaining ?? 0}`,
      );
    } catch (error) {
      // logger.error, never warn: an undrained backlog degrades every search
      // that meets an unheard word, silently and forever.
      this.logger.error(
        `vocabulary drain FAILED trigger=${trigger}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.draining = false;
    }
  }

  /**
   * POLL FOR VERDICTS THIS PROCESS DID NOT REACH. No lock: every process
   * needs its OWN cache refreshed, so this is the one piece of the rail that
   * must NOT be single-runner — and it costs one indexed aggregate.
   *
   * It is also not gated on `isSchedulerRuntime`: the api process runs no
   * crons and is precisely the process whose cache goes stale. That is why
   * the tick comes from the explicit setInterval in onModuleInit and NOT
   * from an @Interval — the schedule registry does not exist on the api.
   */
  async refreshCache(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      const reloaded = await this.vocabulary.refreshIfChanged();
      if (reloaded) {
        this.logger.log('judged vocabulary reloaded (new verdicts elsewhere)');
      }
    } catch (error) {
      this.logger.error(
        `judged vocabulary refresh FAILED: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.refreshing = false;
    }
  }
}
