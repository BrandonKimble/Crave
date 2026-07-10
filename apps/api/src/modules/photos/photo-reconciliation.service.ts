import { Injectable, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../shared';
import { PhotosService } from './photos.service';

/**
 * Webhook delivery is at-most-4-attempts (0/3/6/9min) — this cron is the
 * guaranteed-settlement backstop: any photo still pending past the grace
 * window gets its truth read from the Cloudinary Admin API (one batched
 * sweep; free-tier Admin API is 500 req/hr — never per-photo polling).
 */
@Injectable()
export class PhotoReconciliationService {
  private readonly logger: LoggerService;
  private readonly enabled: boolean;

  constructor(
    private readonly photos: PhotosService,
    @Optional() private readonly configService: ConfigService | null,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PhotoReconciliationService');
    this.enabled = Boolean(
      this.configService?.get<string>('cloudinary.cloudName'),
    );
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweep(): Promise<void> {
    if (!this.enabled) return;
    try {
      await this.photos.reconcilePending();
    } catch (error) {
      this.logger.error('Photo reconciliation sweep failed', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
