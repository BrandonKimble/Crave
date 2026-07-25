import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';

export type OpsAlertSeverity = 'info' | 'warn' | 'critical';

export interface EmitOpsAlertParams {
  severity: OpsAlertSeverity;
  kind: string;
  title: string;
  body: string;
  /** Alert-storm collapse key — repeats with the SAME key are no-ops
   *  (createMany + skipDuplicates against the ops_alerts.dedupe_key unique
   *  column). Omit only for genuinely one-off alerts. */
  dedupeKey?: string;
}

export interface OpsAlertRow {
  alertId: string;
  severity: string;
  kind: string;
  title: string;
  body: string;
  dedupeKey: string | null;
  createdAt: Date;
  acknowledgedAt: Date | null;
}

/**
 * §18.4/§24.3 OWNER OPS DASHBOARD + ALERT INFRASTRUCTURE. Fire-and-forget
 * emit() at the codebase's owner-relevant chokepoints (campaign breach,
 * lane pause/escalation, vendor caps, spend telemetry, TomTom credit
 * proxies, collector heartbeat REDs) — mirrors UsageLedgerService's
 * pending-set shutdown pattern so short-lived scripts/deploys can't drop
 * an alert mid-flight, and NEVER throws (an alert failing to write must
 * never break the caller's real work).
 */
@Injectable()
export class OpsAlertsService implements OnModuleDestroy {
  private readonly pending = new Set<Promise<unknown>>();
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('OpsAlertsService');
    if (!process.env.RESEND_API_KEY) {
      this.logger.info('email transport unconfigured');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(Array.from(this.pending));
  }

  /** Fire-and-forget: persist (dedupe-collapsed) then, for a CRITICAL alert
   *  with RESEND_API_KEY configured, best-effort email. Never throws. */
  emit(params: EmitOpsAlertParams): void {
    const write = this.prisma.opsAlert
      .createMany({
        data: [
          {
            severity: params.severity,
            kind: params.kind,
            title: params.title,
            body: params.body,
            dedupeKey: params.dedupeKey ?? null,
          },
        ],
        skipDuplicates: true,
      })
      .then((result) => {
        // Only email on an actual new insert — a collapsed duplicate must
        // not re-page the owner every tick.
        if (result.count > 0 && params.severity === 'critical') {
          this.sendEmail(params).catch(() => {
            // sendEmail already logs; this catch only guards the fire-and-
            // forget chain itself.
          });
        }
      })
      .catch((error: unknown) => {
        this.logger.warn('Ops alert write failed', {
          kind: params.kind,
          error:
            error instanceof Error
              ? { message: error.message }
              : { message: String(error) },
        });
      });
    this.pending.add(write);
    void write.finally(() => this.pending.delete(write));
  }

  async list(limit = 50): Promise<OpsAlertRow[]> {
    return this.prisma.opsAlert.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async unacknowledgedCount(): Promise<number> {
    return this.prisma.opsAlert.count({ where: { acknowledgedAt: null } });
  }

  async acknowledge(alertId: string): Promise<void> {
    await this.prisma.opsAlert.update({
      where: { alertId },
      data: { acknowledgedAt: new Date() },
    });
  }

  /**
   * PLUGGABLE EMAIL TRANSPORT (off until a key exists): plain fetch to
   * Resend, no new deps. Absent RESEND_API_KEY or OPS_ALERT_EMAIL, this
   * silently no-ops (already logged once at boot). Never throws — a
   * failure only warns.
   */
  private async sendEmail(params: EmitOpsAlertParams): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.OPS_ALERT_EMAIL;
    if (!apiKey || !to) {
      return;
    }
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // OPS_ALERT_FROM lets the owner switch to a verified-domain sender;
          // the resend.dev onboarding sender works without domain
          // verification, so alerts flow out of the box.
          from:
            process.env.OPS_ALERT_FROM ?? 'Crave Ops <onboarding@resend.dev>',
          to: [to],
          subject: `[CRITICAL] ${params.title}`,
          text: params.body,
        }),
      });
      if (!response.ok) {
        this.logger.warn('Ops alert email send failed (non-2xx)', {
          kind: params.kind,
          status: response.status,
        });
      }
    } catch (error) {
      this.logger.warn('Ops alert email send failed', {
        kind: params.kind,
        error:
          error instanceof Error
            ? { message: error.message }
            : { message: String(error) },
      });
    }
  }
}
