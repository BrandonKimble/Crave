import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { LoggerService } from '../../../shared';
import { RankScoreRefreshJobData } from './rank-score-refresh.types';

type RankScoreRefreshQueueOptions = {
  source?: string;
  force?: boolean;
};

const DEFAULT_REFRESH_WINDOW_MINUTES = 30;
const WINDOW_KEY_PREFIX = 'rank-score-refresh-window';
const JOB_NAME = 'refresh-rank-scores';

@Injectable()
export class RankScoreRefreshQueueService {
  private readonly logger: LoggerService;
  private readonly refreshWindowMs: number;

  constructor(
    @InjectQueue('rank-score-refresh')
    private readonly refreshQueue: Queue<RankScoreRefreshJobData>,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RankScoreRefreshQueue');
    this.refreshWindowMs = this.resolveWindowMs();
  }

  async queueRefreshForLocations(
    locationKeys: Array<string | null | undefined>,
    options: RankScoreRefreshQueueOptions = {},
  ): Promise<string[]> {
    const normalized = this.normalizeLocationKeys(locationKeys);
    if (!normalized.length) {
      return [];
    }

    const scheduled: string[] = [];
    for (const locationKey of normalized) {
      const shouldSchedule = await this.acquireRefreshWindow(
        locationKey,
        Boolean(options.force),
      );
      if (!shouldSchedule) {
        this.logger.debug('Rank score refresh skipped (debounced)', {
          locationKey,
          source: options.source,
        });
        continue;
      }

      const jobId = this.buildJobId(locationKey);
      try {
        const job = await this.refreshQueue.add(
          JOB_NAME,
          {
            locationKey,
            requestedAt: new Date().toISOString(),
            source: options.source,
          },
          {
            jobId,
            removeOnComplete: true,
            removeOnFail: 50,
            attempts: 3,
          },
        );
        scheduled.push(String(job.id ?? jobId));
      } catch (error) {
        if (this.isDuplicateJobError(error)) {
          this.logger.debug('Rank score refresh already queued', {
            locationKey,
            source: options.source,
          });
          continue;
        }
        throw error;
      }
    }

    return scheduled;
  }

  private normalizeLocationKeys(
    locationKeys: Array<string | null | undefined>,
  ): string[] {
    return Array.from(
      new Set(
        locationKeys
          .filter((key): key is string => typeof key === 'string')
          .map((key) => key.trim().toLowerCase())
          .filter((key) => key.length > 0),
      ),
    );
  }

  private async acquireRefreshWindow(
    locationKey: string,
    force: boolean,
  ): Promise<boolean> {
    if (this.refreshWindowMs <= 0) {
      return true;
    }

    const redisKey = this.refreshQueue.toKey(
      `${WINDOW_KEY_PREFIX}:${locationKey}`,
    );
    const timestamp = Date.now().toString();

    try {
      if (force) {
        await this.refreshQueue.client.set(
          redisKey,
          timestamp,
          'PX',
          this.refreshWindowMs,
        );
        return true;
      }

      const result = await this.refreshQueue.client.set(
        redisKey,
        timestamp,
        'PX',
        this.refreshWindowMs,
        'NX',
      );
      return result === 'OK';
    } catch (error) {
      this.logger.warn('Failed to apply rank refresh debounce window', {
        locationKey,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return true;
    }
  }

  private resolveWindowMs(): number {
    const raw = process.env.RANK_SCORE_REFRESH_WINDOW_MINUTES;
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed * 60 * 1000;
    }
    return DEFAULT_REFRESH_WINDOW_MINUTES * 60 * 1000;
  }

  private buildJobId(locationKey: string): string {
    return `rank-score-refresh:${locationKey}`;
  }

  private isDuplicateJobError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('already exists');
  }
}
