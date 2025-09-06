import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { RedditService } from '../../external-integrations/reddit/reddit.service';

export interface SubredditVolume {
  name: string;
  avgPostsPerDay: number;
  avgPostsPerHour: number;
  lastCalculated: Date;
  sampleDays: number;
  totalPostsSampled: number;
  confidence: number; // 0-1 score based on sample size
  isActive: boolean;
}

/**
 * Subreddit Volume Tracking Service
 *
 * Dynamically tracks and updates posting volumes for subreddits.
 * This is a real system feature that:
 * - Calculates average posting rates from actual data
 * - Updates monthly (or on-demand)
 * - Stores results in database for use by scheduling service
 * - Provides confidence scores based on sample size
 */
@Injectable()
export class SubredditVolumeTrackingService implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedditService) private readonly redditService: RedditService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger = this.loggerService.setContext('SubredditVolumeTracking');
    await this.loadVolumesFromDatabase();
  }

  /**
   * Calculate volumes for all active subreddits
   * This method is designed to be called by Bull queue processor
   */
  async calculateAllActiveVolumes(sampleDays = 7): Promise<SubredditVolume[]> {
    const activeSubreddits = await this.prisma.subreddit.findMany({
      where: { isActive: true },
      select: { name: true },
    });
    const subredditNames = activeSubreddits.map((s) => s.name);
    const results: SubredditVolume[] = [];

    this.logger.info('Calculating volumes for all active subreddits', {
      activeSubreddits: subredditNames,
      sampleDays,
      totalCount: subredditNames.length,
    });

    for (const subreddit of subredditNames) {
      try {
        const volume = await this.calculateVolume(subreddit, sampleDays);
        results.push(volume);

        this.logger.info('Volume calculated successfully', {
          subreddit,
          avgPostsPerDay: volume.avgPostsPerDay,
          confidence: volume.confidence,
        });

        // Add small delay between subreddits to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        this.logger.error('Failed to calculate volume for subreddit', {
          subreddit,
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other subreddits even if one fails
      }
    }

    this.logger.info('Completed volume calculation for all active subreddits', {
      totalProcessed: results.length,
      totalActive: activeSubreddits.length,
    });

    return results;
  }

  /**
   * Calculate posting volume for a subreddit
   * Samples posts from the last 30 days to determine average rate
   */
  async calculateVolume(
    subreddit: string,
    sampleDays = 30,
  ): Promise<SubredditVolume> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.info('Calculating volume for subreddit', {
      correlationId,
      subreddit,
      sampleDays,
    });

    try {
      // Get posts from the specified time range
      const thirtyDaysAgo =
        Math.floor(Date.now() / 1000) - sampleDays * 24 * 60 * 60;
      const result = await this.redditService.getChronologicalPosts(
        subreddit,
        thirtyDaysAgo,
        1000, // Get max posts for better sampling
      );

      const posts = result.data || [];

      if (posts.length === 0) {
        // No posts found, use conservative default
        return this.createVolumeRecord(subreddit, 5, 0, sampleDays, 0, 0);
      }

      // Calculate actual time span from oldest to newest post
      const timestamps = posts
        .map((p: any) => p.created_utc || 0)
        .filter((t: number) => t > 0)
        .sort((a: number, b: number) => a - b);

      if (timestamps.length < 2) {
        // Not enough data, use conservative estimate
        return this.createVolumeRecord(
          subreddit,
          10,
          0,
          sampleDays,
          posts.length,
          0.1,
        );
      }

      const oldestTimestamp = timestamps[0];
      const newestTimestamp = timestamps[timestamps.length - 1];
      const actualSpanSeconds = newestTimestamp - oldestTimestamp;
      const actualSpanDays = actualSpanSeconds / (24 * 60 * 60);
      const actualSpanHours = actualSpanSeconds / 3600;

      // Calculate averages
      const avgPostsPerDay =
        actualSpanDays > 0 ? posts.length / actualSpanDays : posts.length;
      const avgPostsPerHour =
        actualSpanHours > 0 ? posts.length / actualSpanHours : 0;

      // Calculate confidence based on sample size and span
      const confidence = Math.min(
        1,
        (posts.length / 100) * // More posts = higher confidence
          (actualSpanDays / 7), // Longer span = higher confidence
      );

      const volume = this.createVolumeRecord(
        subreddit,
        avgPostsPerDay,
        avgPostsPerHour,
        actualSpanDays,
        posts.length,
        confidence,
      );

      // Store in database
      await this.saveVolumeToDatabase(volume);

      // Volume now stored in database only

      this.logger.info('Volume calculation completed', {
        correlationId,
        subreddit,
        avgPostsPerDay: volume.avgPostsPerDay,
        avgPostsPerHour: volume.avgPostsPerHour,
        totalPosts: posts.length,
        spanDays: actualSpanDays,
        confidence: volume.confidence,
      });

      return volume;
    } catch (error) {
      this.logger.error('Failed to calculate volume', {
        correlationId,
        subreddit,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return conservative default on error
      return this.createVolumeRecord(subreddit, 15, 0.625, sampleDays, 0, 0);
    }
  }

  /**
   * Recalculate volumes for all tracked subreddits
   * TODO: Add @Cron('0 0 1 * *') decorator after installing @nestjs/schedule
   * Will run on first day of each month at midnight
   */
  async recalculateAllVolumes(): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.info('Starting monthly volume recalculation', {
      correlationId,
    });

    // Get list of subreddits to track from config or database
    const subreddits = await this.getTrackedSubreddits();

    for (const subreddit of subreddits) {
      try {
        await this.calculateVolume(subreddit);
        // Add delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        this.logger.error('Failed to recalculate volume for subreddit', {
          correlationId,
          subreddit,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info('Monthly volume recalculation completed', {
      correlationId,
      subredditsProcessed: subreddits.length,
    });
  }

  /**
   * Get list of subreddits to track
   */
  private async getTrackedSubreddits(): Promise<string[]> {
    const activeSubreddits = await this.prisma.subreddit.findMany({
      where: { isActive: true },
      select: { name: true },
    });
    return activeSubreddits.map((s) => s.name);
  }

  /**
   * Load cached volumes from database on startup
   */
  private async loadVolumesFromDatabase(): Promise<void> {
    try {
      const volumes = await this.prisma.subreddit.findMany();

      // Database is now the single source of truth - no caching needed

      if (volumes.length > 0) {
        this.logger.info('Volume cache loaded from database', {
          volumesLoaded: volumes.length,
          subreddits: volumes.map((v) => v.name),
        });
      }
    } catch (error) {
      this.logger.error('Failed to load volumes from database', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Save volume data to database
   */
  private async saveVolumeToDatabase(volume: SubredditVolume): Promise<void> {
    try {
      await this.prisma.subreddit.upsert({
        where: { name: volume.name.toLowerCase() },
        update: {
          avgPostsPerDay: volume.avgPostsPerDay,
          safeIntervalDays: this.calculateSafeIntervalDays(
            volume.avgPostsPerDay,
          ),
          lastCalculated: volume.lastCalculated,
          isActive: volume.isActive,
        },
        create: {
          name: volume.name.toLowerCase(),
          avgPostsPerDay: volume.avgPostsPerDay,
          safeIntervalDays: this.calculateSafeIntervalDays(
            volume.avgPostsPerDay,
          ),
          lastCalculated: volume.lastCalculated,
          lastProcessed: null, // Will be set by collection services
          isActive: volume.isActive,
        },
      });

      this.logger.debug('Volume saved to database', {
        subreddit: volume.name,
        avgPostsPerDay: volume.avgPostsPerDay,
      });
    } catch (error) {
      this.logger.error('Failed to save volume to database', {
        subreddit: volume.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Create a volume record
   */
  private createVolumeRecord(
    subreddit: string,
    avgPostsPerDay: number,
    avgPostsPerHour: number,
    sampleDays: number,
    totalPostsSampled: number,
    confidence: number,
  ): SubredditVolume {
    return {
      name: subreddit.toLowerCase(),
      avgPostsPerDay: Math.round(avgPostsPerDay * 10) / 10, // Round to 1 decimal
      avgPostsPerHour: Math.round(avgPostsPerHour * 100) / 100, // Round to 2 decimals
      lastCalculated: new Date(),
      sampleDays: Math.round(sampleDays),
      totalPostsSampled,
      confidence: Math.round(confidence * 100) / 100,
      isActive: true, // New volumes are active by default
    };
  }

  /**
   * Calculate safe interval days
   * Implements PRD equation: safe_interval = (750_posts / avg_posts_per_day)
   */
  private calculateSafeIntervalDays(
    avgPostsPerDay: number,
    targetPosts = 750,
  ): number {
    const calculated = targetPosts / avgPostsPerDay;
    // Apply PRD constraints (7-60 days)
    return Math.max(7, Math.min(60, calculated));
  }

  /**
   * Store volume estimate directly to database (for manual population)
   */
  async storeVolumeEstimate(volume: SubredditVolume): Promise<void> {
    // Update cache
    // Volume saved to database - no caching needed

    // Save to database
    await this.saveVolumeToDatabase(volume);
  }
}
