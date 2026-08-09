import { OnModuleInit } from '@nestjs/common';
import { isEnvFlagExplicitlyDisabled } from './config/env-flag';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertsService } from '../modules/external-integrations/shared/ops-alerts.service';
import { LoggerService } from './logging/logger.interface';

/**
 * THE DERIVED-INDEX LAW, as a base class (cron audit 2026-08-09).
 *
 * Six nightly jobs rebuild a derived table that the hot path reads and FAILS
 * OPEN on — so an empty or stale table degrades the product invisibly. The
 * law was learned one outage at a time (containment: rung-2 widening dead in
 * prod; H8: open-now unfiltered) and hand-copied unevenly. This class makes
 * it structural — a rebuild job that extends it CANNOT forget:
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

  async onModuleInit(): Promise<void> {
    if (this.disabled()) return;
    try {
      const [row] = await this.prisma.$queryRawUnsafe<{ empty: boolean }[]>(
        `SELECT NOT EXISTS (SELECT 1 FROM ${this.derivedTable}) AS empty`,
      );
      if (row?.empty) {
        this.logger.info(
          `${this.derivedTable} empty at boot — self-healing rebuild`,
        );
        await this.runGuarded();
      }
    } catch (error) {
      this.logger.error(
        `${this.derivedTable} boot self-heal failed`,
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /** Call this from the subclass @Cron method. */
  protected async runGuarded(): Promise<void> {
    if (this.disabled()) return;
    if (this.inFlight) return;
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
    } catch (error) {
      // .error, not .warn: only .error reaches Sentry, and the hot path
      // reads this table — a rebuild failing every night must be heard.
      this.logger.error(
        `${this.derivedTable} rebuild failed`,
        error instanceof Error ? error : new Error(String(error)),
      );
    } finally {
      this.inFlight = false;
    }
  }
}
