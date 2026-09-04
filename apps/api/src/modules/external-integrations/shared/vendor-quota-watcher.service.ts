import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { LoggerService } from '../../../shared';
import {
  CompletionWorkTimerHandle,
  startCompletionWorkTimer,
} from '../../../shared/completion-work-timer';
import { OpsAlertsService } from './ops-alerts.service';

/**
 * The keys inside Cloudinary's Admin `usage` response we watch, each
 * `{ usage, limit, used_percent }` shaped. `credits` is the plan-wide meter:
 * transformations + storage + bandwidth rolled into one number.
 *
 * `aws_rek_moderation` USED TO BE HERE and was deleted with D149-V
 * (2026-08-07). Safety moderation no longer runs on Cloudinary at all — it is
 * a metered Google Vision SafeSearch call the API makes itself, so the thing
 * to watch is SPEND (expected-monthly-spend.ts's `google_vision` line and the
 * nightly comparator), not a prepaid allowance. Watching a quota nothing
 * consumes would be a permanently-green instrument, which is worse than none.
 */
const WATCHED_KEYS = ['credits'] as const;
type WatchedKey = (typeof WATCHED_KEYS)[number];

/** §16-shaped operational thresholds, stated as the decisions they are: 80%
 *  is "start thinking about it, there is still a month left"; 95% is "act
 *  today or images stop loading". Neither is derived from data — there is no
 *  measured distribution of quota exhaustion to derive from — and both are
 *  the conventional two-stage shape for a consumable. */
const WARN_FRACTION = 0.8;
const CRITICAL_FRACTION = 0.95;

interface CloudinaryUsageBucket {
  usage?: number;
  limit?: number;
  used_percent?: number;
}

/**
 * QUOTA IS NOT SPEND, AND NOTHING WAS WATCHING IT (D149 item 5,
 * owner-approved 2026-08-07).
 *
 * Every other vendor here is metered per call: we count the draws, price
 * them, and the ledger tells the truth. Cloudinary is not — it is a PREPAID
 * ALLOWANCE. Nothing we log gets closer to "how much is left" than the
 * vendor's own counter, and until now nobody read it. The failure that
 * implies is quiet and bad: credits run out, image delivery and
 * transformations stop, and every photo in the app fails to load.
 *
 * So: poll the vendor, hourly, and say so at 80% and 95%.
 *
 * ── WHY NO SNAPSHOT TABLE ────────────────────────────────────────────────
 * A history table would let us chart burn rate, and D149 recorded that as
 * DEFERRED rather than dropped (the schema was concurrent-locked when this
 * was built). It is not needed for the alert: the vendor's own counter is
 * already cumulative-to-date, so the threshold question is answerable from a
 * single read.
 *
 * ── FAILING TO READ IS ITS OWN ALERT ─────────────────────────────────────
 * The one thing this must never do is treat an unreadable quota as 0% used.
 * A watcher that goes quiet when it breaks is worse than no watcher, because
 * it buys false confidence. A read failure warns, with its own dedupe key.
 */
@Injectable()
export class VendorQuotaWatcherService
  implements OnModuleInit, OnModuleDestroy
{
  private watchdogTimer: CompletionWorkTimerHandle | null = null;

  onModuleInit(): void {
    // Watchdogs are completion-truth infrastructure — self-owned timer,
    // never @Cron (red team 2026-09-03 governance #2: dead on staging).
    this.watchdogTimer = startCompletionWorkTimer({
      intervalMs: 60 * 60 * 1000,
      offSwitchEnv: 'VENDOR_QUOTA_WATCHER_ENABLED',
      run: () => this.hourlyCheck(),
      onFailure: (error) =>
        this.logger.error('VendorQuotaWatcher tick failed', {
          error: error instanceof Error ? error.message : String(error),
        }),
    });
  }

  onModuleDestroy(): void {
    this.watchdogTimer?.stop();
    this.watchdogTimer = null;
  }

  private readonly logger: LoggerService;
  private readonly cloudName: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly apiSecret: string | undefined;

  constructor(
    configService: ConfigService,
    loggerService: LoggerService,
    private readonly opsAlerts: OpsAlertsService,
  ) {
    this.logger = loggerService.setContext('VendorQuotaWatcherService');
    // Read the SAME config keys CloudinaryService reads, and pass them
    // per-call below rather than depending on that service. Sharing the
    // module would drag PhotosModule into external-integrations for one
    // admin GET; the SDK's global `cloudinary.config()` is process-wide
    // mutable state we would then be silently relying on having run first.
    this.cloudName = configService.get<string>('cloudinary.cloudName');
    this.apiKey = configService.get<string>('cloudinary.apiKey');
    this.apiSecret = configService.get<string>('cloudinary.apiSecret');
  }

  /**
   * HOURLY, not daily. Credits are consumed per delivery, so a traffic burst
   * can cross both thresholds inside one day and a daily read would learn
   * about it up to 24 hours late. Driven by the self-owned completion-work
   * timer above (never @Cron — a watchdog gated behind the scheduler switch
   * is dead exactly where it matters).
   */
  async hourlyCheck(now: Date = new Date()): Promise<void> {
    try {
      await this.checkCloudinary(now);
    } catch (error) {
      this.logger.error('Vendor quota watcher failed', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  async checkCloudinary(now: Date = new Date()): Promise<void> {
    if (!this.cloudName || !this.apiKey || !this.apiSecret) {
      // Not configured is not a failure to report every hour — photos are
      // simply off in this environment (CloudinaryService already warns once
      // at boot).
      return;
    }
    const monthKey = now.toISOString().slice(0, 7);
    let usage: Record<string, unknown>;
    try {
      usage = (await cloudinary.api.usage({
        cloud_name: this.cloudName,
        api_key: this.apiKey,
        api_secret: this.apiSecret,
      })) as unknown as Record<string, unknown>;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Cloudinary usage read failed — quota is UNKNOWN', {
        error: { message },
      });
      this.opsAlerts.emit({
        severity: 'warn',
        emailOnWarn: true,
        kind: 'vendor_quota_unreadable',
        title: 'Cloudinary quota could not be read',
        body:
          `The hourly quota check could not reach Cloudinary's Admin API, so ` +
          `the remaining credit allowance is UNKNOWN — not zero, not fine. ` +
          `If this persists, credits could run out with no warning and every ` +
          `image in the app would stop loading. Error: ${message}`,
        // Per UTC day: a broken credential shouldn't send 24 emails.
        dedupeKey: `vendor_quota_unreadable:cloudinary:${now
          .toISOString()
          .slice(0, 10)}`,
      });
      return;
    }

    for (const key of WATCHED_KEYS) {
      const bucket = usage[key] as CloudinaryUsageBucket | undefined;
      const fraction = this.usedFraction(bucket);
      if (fraction === null) {
        // The key is absent or has no limit (an unlimited/plan-not-metered
        // add-on). Nothing to compare against; not an error.
        continue;
      }
      const percent = Math.round(fraction * 1000) / 10;
      this.logger.info('Cloudinary quota', { key, percent });
      if (fraction >= CRITICAL_FRACTION) {
        this.opsAlerts.emit({
          severity: 'critical',
          kind: 'vendor_quota',
          title: `Cloudinary ${key} is at ${percent}% of its allowance`,
          body: this.quotaBody(key, percent, true),
          dedupeKey: `vendor_quota:cloudinary:${key}:critical:${monthKey}`,
        });
      } else if (fraction >= WARN_FRACTION) {
        this.opsAlerts.emit({
          severity: 'warn',
          emailOnWarn: true,
          kind: 'vendor_quota',
          title: `Cloudinary ${key} is at ${percent}% of its allowance`,
          body: this.quotaBody(key, percent, false),
          dedupeKey: `vendor_quota:cloudinary:${key}:warn:${monthKey}`,
        });
      }
    }
  }

  /**
   * Prefer the vendor's own `used_percent` when present (it is what their
   * dashboard shows, so our number and theirs agree), and fall back to
   * usage/limit. Returns null when neither is readable — an unmetered key,
   * which must not be silently reported as 0%.
   */
  private usedFraction(
    bucket: CloudinaryUsageBucket | undefined,
  ): number | null {
    if (!bucket) return null;
    if (typeof bucket.used_percent === 'number' && bucket.used_percent >= 0) {
      return bucket.used_percent / 100;
    }
    if (
      typeof bucket.usage === 'number' &&
      typeof bucket.limit === 'number' &&
      bucket.limit > 0
    ) {
      return bucket.usage / bucket.limit;
    }
    return null;
  }

  private quotaBody(key: WatchedKey, percent: number, urgent: boolean): string {
    const consequence =
      `When credits run out, image delivery and transformations stop — ` +
      `photos across the app would fail to load.`;
    return (
      `Cloudinary reports ${key} at ${percent}% of the plan allowance. ` +
      `${consequence} ` +
      (urgent
        ? `This needs a plan top-up today.`
        : `There is still headroom — worth a look at the Cloudinary console ` +
          `to decide whether to raise the plan before month end.`)
    );
  }
}
