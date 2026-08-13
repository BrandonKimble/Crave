import { OnModuleInit } from '@nestjs/common';
import { isEnvFlagExplicitlyDisabled } from './config/env-flag';
import { isSchedulerRuntime } from './utils/process-role';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertsService } from '../modules/external-integrations/shared/ops-alerts.service';
import { LoggerService } from './logging/logger.interface';

/**
 * THE DERIVED-INDEX LAW, as a base class (cron audit 2026-08-09).
 *
 * A nightly job rebuilds a derived table that the hot path reads and FAILS
 * OPEN on — so an empty or stale table degrades the product invisibly. The
 * law was learned one outage at a time (containment: rung-2 widening dead in
 * prod; H8: open-now unfiltered) and hand-copied unevenly. This class makes
 * it structural — a rebuild job that extends it CANNOT forget:
 *
 * WHO MUST EXTEND THIS, and how that is enforced. Every `derived_*` table in
 * schema.prisma. That is not a convention: derived-index-job.spec.ts reads the
 * schema, enumerates those tables, and requires each to name a registered job
 * that declares it. The count used to be a hand-written `toHaveLength(4)` —
 * a claim about the world checked against a copy of itself — and it agreed
 * happily while `derived_food_category_edges` sat there as a fifth derived
 * hot-path table with four fail-open readers and no rebuild job at all (D3).
 * A new derived table now fails that spec by EXISTING.
 *
 * THE ACKNOWLEDGED NON-MEMBER. EntityEmbeddingReconciler heals
 * `core_entity_embeddings` with its own bespoke boot routine and is
 * deliberately not one of these. This law is EMPTINESS-driven — no rows means
 * derivation did not happen, so replace everything. The embedding table's
 * interesting failure is not emptiness but STALENESS: rows that exist for
 * entities whose text has since changed, repaired per-row against a paid
 * embedding API. A full replace is the wrong repair and the zero-output
 * scream could never fire. It is named here so the omission is a decision
 * with a reason rather than a silence.
 *
 *   1. BOOT SELF-HEAL: an empty derived table is un-derived derivation, not
 *      a config state. onModuleInit detects and rebuilds. Full-replace
 *      rebuilds are transactional, so racing replicas duplicate seconds of
 *      work, never corruption.
 *   2. ZERO-OUTPUT SCREAM: a rebuild that produces nothing from real input
 *      is the invisible-degradation mode — critical ops alert, deduped.
 *   3. GUARDED CRON: per-process in-flight skip + error → logger.error
 *      (Sentry), never warn.
 *
 * Subclasses keep their own @Cron schedule (cadence is per-job — the
 * staggering spreads DB load deliberately) and their own disable flag;
 * they implement only what is genuinely theirs: the rebuild.
 *
 * THE LAW IS UNBYPASSABLE (F-infra, 2026-08-11). Two subclasses used to expose
 * a PUBLIC `rebuildAll()`, and two scripts called it directly — running the
 * work with none of the law: no disable-flag check, no in-flight guard, and
 * (the expensive one) no zero-output alert, so an operator rebuild that
 * emptied a hot-path table reported success. A subclass's rebuild entry point
 * is `protected` now; the ONE public driver is `runNow()` on this base, which
 * routes through `runGuarded`. Scripts get the law for free.
 *
 * KNOWN GAP, stated rather than faked: the zero-output scream fires only on
 * output === 0. A rebuild that produces 1 row from 17k inputs — a partial
 * collapse — is just as invisible to users' searches and passes this guard.
 * Catching it needs an expectation of NORMAL size (a banked prior or the
 * previous run's row count), which nothing here has yet; inventing a ratio
 * threshold would manufacture a number nobody measured, so this class does
 * not. Until that expectation exists, partial degradation is unalerted.
 */
export abstract class DerivedIndexJob implements OnModuleInit {
  protected abstract readonly logger: LoggerService;
  /** The derived table whose emptiness means "self-heal now". */
  protected abstract readonly derivedTable: string;
  /** Env flag name that explicitly disables this job ('' = never disabled). */
  protected abstract readonly disableFlagEnv: string;
  /** Alert identity when the rebuild yields zero output from real input. */
  protected abstract readonly alert: {
    kind: string;
    title: string;
    /** What dies for users while the table is empty, in plain words. */
    consequence: string;
  };

  private inFlight = false;

  constructor(
    protected readonly prisma: PrismaService,
    protected readonly opsAlerts: OpsAlertsService,
  ) {}

  /** The job's actual work. Returns input seen and rows produced. */
  protected abstract rebuild(): Promise<{ input: number; output: number }>;

  private disabled(): boolean {
    return (
      this.disableFlagEnv !== '' &&
      isEnvFlagExplicitlyDisabled(process.env[this.disableFlagEnv])
    );
  }

  /**
   * The ONE public driver — for scripts and operators. Routes through the
   * guard, so a manual rebuild obeys the disable flag, cannot stack on an
   * in-flight run, and SCREAMS on zero output exactly like the cron does.
   * Returns the run's counts, or null when the guard declined to run.
   */
  async runNow(): Promise<{ input: number; output: number } | null> {
    return this.runGuarded();
  }

  async onModuleInit(): Promise<void> {
    if (this.disabled()) return;
    try {
      const [row] = await this.prisma.$queryRawUnsafe<{ empty: boolean }[]>(
        `SELECT NOT EXISTS (SELECT 1 FROM ${this.derivedTable}) AS empty`,
      );
      if (!row?.empty) return;

      // THE KILL-SWITCH IS HONEST (F-infra, 2026-08-11). This self-heal used
      // to ignore the scheduler gate entirely: an operator who set
      // CRONS_ENABLED=false — promising total cron inertness, the whole point
      // of the switch in an environment that must not spend unattended — still
      // got a full rebuild on every boot with an empty table. Repair is
      // forbidden when the gate is off. VISIBILITY IS NOT: silence about a
      // dead hot-path table was the original disease, so the critical alert
      // fires either way, and it says the repair was skipped so nobody waits
      // for a heal that is never coming.
      if (!isSchedulerRuntime()) {
        this.logger.warn(
          `${this.derivedTable} is EMPTY at boot but crons are disabled — no self-heal`,
        );
        this.opsAlerts.emit({
          severity: 'critical',
          kind: this.alert.kind,
          title: this.alert.title,
          body: [
            `${this.derivedTable} is EMPTY and this process has crons disabled (CRONS_ENABLED / PROCESS_ROLE), so the boot self-heal did NOT run.`,
            `${this.alert.consequence} The reader fails open, so nothing else will report this.`,
            'Run the rebuild deliberately, or enable crons on a runtime that can.',
          ].join('\n\n'),
          dedupeKey: this.alert.kind,
        });
        return;
      }

      this.logger.info(
        `${this.derivedTable} empty at boot — self-healing rebuild`,
      );
      await this.runGuarded();
    } catch (error) {
      this.logger.error(
        `${this.derivedTable} boot self-heal failed`,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /** Call this from the subclass @Cron method. */
  protected async runGuarded(): Promise<{
    input: number;
    output: number;
  } | null> {
    if (this.disabled()) return null;
    if (this.inFlight) return null;
    this.inFlight = true;
    try {
      const { input, output } = await this.rebuild();
      if (output === 0 && input > 0) {
        this.opsAlerts.emit({
          severity: 'critical',
          kind: this.alert.kind,
          title: this.alert.title,
          body: [
            `The ${this.derivedTable} rebuild produced ZERO rows from ${input} input row(s).`,
            `${this.alert.consequence} The reader fails open, so nothing else will report this.`,
            "Check this job's last error, then re-run it.",
          ].join('\n\n'),
          dedupeKey: this.alert.kind,
        });
      }
      return { input, output };
    } catch (error) {
      // .error, not .warn: only .error reaches Sentry, and the hot path
      // reads this table — a rebuild failing every night must be heard.
      this.logger.error(
        `${this.derivedTable} rebuild failed`,
        error instanceof Error ? error : new Error(String(error)),
      );
      return null;
    } finally {
      this.inFlight = false;
    }
  }
}
