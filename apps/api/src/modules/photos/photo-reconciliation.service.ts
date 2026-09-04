import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { LoggerService } from '../../shared';
import {
  CompletionWorkTimerHandle,
  startCompletionWorkTimer,
} from '../../shared/completion-work-timer';
import { PhotosService } from './photos.service';
import { CloudinaryService } from './cloudinary.service';

/** Cadence — unchanged from the retired @Cron(EVERY_10_MINUTES). */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Webhook delivery is at-most-4-attempts (0/3/6/9min) — this sweep is the
 * guaranteed-settlement backstop: any photo still pending past the grace
 * window gets its truth read from the Cloudinary Admin API (one batched
 * sweep; free-tier Admin API is 500 req/hr — never per-photo polling).
 */
@Injectable()
export class PhotoReconciliationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger: LoggerService;
  private readonly enabled: boolean;

  /**
   * A SELF-OWNED setInterval, NOT AN @Cron (2026-08-31).
   *
   * THE LAW: CRONS_ENABLED means "do not START new discretionary work
   * unattended" — the switch exists to prevent unattended SPEND. This sweep
   * spends nothing: it reads `cloudinary.api.resource` (the Admin API),
   * which is rate-limited (500 req/hr on the free tier) but not billed per
   * call, and the batch is 25 photos per 10 minutes = 150/hr worst case.
   *
   * What it IS, is the settlement half for an image the USER ALREADY
   * UPLOADED. When a webhook is missed, this is the only thing that ever
   * moves that photo out of `pending` — so under @Cron (registered only when
   * isSchedulerRuntime(), false whenever CRONS_ENABLED is off) a user's photo
   * stays invisible forever with nothing reporting it. Completing work
   * already done and paid for is not discretionary.
   *
   * Worker runtime, its own explicit off-switch (PHOTO_RECONCILE_ENABLED=
   * false) on top of the existing `enabled` (Cloudinary configured at all),
   * unref()'d, cleared on shutdown.
   */
  private sweepTimer: CompletionWorkTimerHandle | null = null;
  private sweepInFlight = false;

  constructor(
    private readonly photos: PhotosService,
    private readonly cloudinary: CloudinaryService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PhotoReconciliationService');
    // ONE notion of configured — CloudinaryService owns it.
    this.enabled = this.cloudinary.isConfigured;
  }

  onModuleInit(): void {
    if (!this.enabled) return;
    this.sweepTimer = startCompletionWorkTimer({
      intervalMs: SWEEP_INTERVAL_MS,
      offSwitchEnv: 'PHOTO_RECONCILE_ENABLED',
      run: () => this.sweep(),
      onFailure: (error) =>
        this.logger.error('Photo reconciliation tick failed', {
          error: error instanceof Error ? error.message : String(error),
        }),
    });
  }

  onModuleDestroy(): void {
    this.sweepTimer?.stop();
    this.sweepTimer = null;
  }

  async sweep(): Promise<void> {
    if (!this.enabled) return;
    if (this.sweepInFlight) return;
    this.sweepInFlight = true;
    try {
      await this.photos.reconcilePending();
    } catch (error) {
      this.logger.error('Photo reconciliation sweep failed', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      this.sweepInFlight = false;
    }
  }
}
