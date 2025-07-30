import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, CorrelationUtils } from '../../../shared';

export interface SubredditSchedulingConfig {
  subreddit: string;
  averagePostsPerDay: number;
  safeInterval: number; // in days
  lastCalculated: Date;
  nextCollectionDue: Date;
}

export interface SafetyBufferCalculation {
  subreddit: string;
  averagePostsPerDay: number;
  calculatedInterval: number; // raw calculation in days
  constrainedInterval: number; // after applying 7-60 day constraints
  nextCollectionTimestamp: number;
  reasoning: string;
}

/**
 * Collection Scheduling Service
 *
 * Implements PRD Section 5.1.2: Dynamic Scheduling with Safety Buffer Equation
 * Calculates collection frequency per subreddit based on posting volume using:
 * safe_interval = (750_posts / avg_posts_per_day)
 * with constraints of minimum 7 days, maximum 60 days between cycles.
 *
 * Key responsibilities:
 * - Calculate safety buffer intervals using PRD equation
 * - Apply minimum/maximum constraints (7-60 days)
 * - Track posting volume patterns for each subreddit
 * - Provide dynamic scheduling recommendations
 * - Handle different subreddit posting volumes
 */
@Injectable()
export class CollectionSchedulingService {
  private readonly logger: LoggerService;
  private subredditConfigs = new Map<string, SubredditSchedulingConfig>();

  // PRD constants from Section 5.1.2
  private readonly SAFETY_BUFFER_POSTS = 750;
  private readonly MIN_INTERVAL_DAYS = 7;
  private readonly MAX_INTERVAL_DAYS = 60;

  // Default posting volumes from PRD examples
  private readonly DEFAULT_POSTING_VOLUMES: Record<string, number> = {
    austinfood: 15, // ~15 posts/day per PRD example
    FoodNYC: 40, // ~40 posts/day per PRD example
  };

  constructor(
    private readonly configService: ConfigService, // Reserved for future configuration needs
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('CollectionScheduling');
  }

  /**
   * Initialize scheduling configuration for a subreddit
   * Uses PRD examples or calculates based on observed patterns
   */
  initializeSubredditScheduling(subreddit: string): SubredditSchedulingConfig {
    this.logger.info('Initializing subreddit scheduling', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'initialize_scheduling',
      subreddit,
    });

    // Get initial posting volume estimate
    const averagePostsPerDay = this.DEFAULT_POSTING_VOLUMES[subreddit] || 20; // Default fallback

    // Calculate safety buffer using PRD equation
    const safetyBufferResult = this.calculateSafetyBuffer(
      subreddit,
      averagePostsPerDay,
    );

    const config: SubredditSchedulingConfig = {
      subreddit,
      averagePostsPerDay,
      safeInterval: safetyBufferResult.constrainedInterval,
      lastCalculated: new Date(),
      nextCollectionDue: new Date(safetyBufferResult.nextCollectionTimestamp),
    };

    this.subredditConfigs.set(subreddit, config);

    this.logger.info('Subreddit scheduling initialized', {
      correlationId: CorrelationUtils.getCorrelationId(),
      config,
      calculation: safetyBufferResult,
    });

    return config;
  }

  /**
   * Calculate safety buffer interval using PRD equation
   * Implements: safe_interval = (750_posts / avg_posts_per_day)
   * with constraints: minimum 7 days, maximum 60 days between cycles
   */
  calculateSafetyBuffer(
    subreddit: string,
    averagePostsPerDay: number,
  ): SafetyBufferCalculation {
    this.logger.debug('Calculating safety buffer for subreddit', {
      correlationId: CorrelationUtils.getCorrelationId(),
      subreddit,
      averagePostsPerDay,
    });

    // Validate input - handle NaN, zero, negative, and infinite values
    if (!Number.isFinite(averagePostsPerDay) || averagePostsPerDay <= 0) {
      this.logger.warn('Invalid averagePostsPerDay input, using default', {
        correlationId: CorrelationUtils.getCorrelationId(),
        subreddit,
        invalidValue: averagePostsPerDay,
        defaultValue: this.DEFAULT_POSTING_VOLUMES[subreddit] || 20,
      });

      // Use default value for this subreddit or fallback
      averagePostsPerDay = this.DEFAULT_POSTING_VOLUMES[subreddit] || 20;
    }

    // Apply PRD safety buffer equation
    const rawInterval = this.SAFETY_BUFFER_POSTS / averagePostsPerDay;

    // Apply PRD constraints: minimum 7 days, maximum 60 days
    let constrainedInterval = rawInterval;
    let reasoning = 'Standard calculation within constraints';

    if (rawInterval < this.MIN_INTERVAL_DAYS) {
      constrainedInterval = this.MIN_INTERVAL_DAYS;
      reasoning = `Interval ${rawInterval.toFixed(1)} days below minimum, constrained to ${this.MIN_INTERVAL_DAYS} days`;
    } else if (rawInterval > this.MAX_INTERVAL_DAYS) {
      constrainedInterval = this.MAX_INTERVAL_DAYS;
      reasoning = `Interval ${rawInterval.toFixed(1)} days above maximum, constrained to ${this.MAX_INTERVAL_DAYS} days`;
    }

    // Calculate next collection timestamp
    const nextCollectionTimestamp =
      Date.now() + constrainedInterval * 24 * 60 * 60 * 1000;

    const result: SafetyBufferCalculation = {
      subreddit,
      averagePostsPerDay,
      calculatedInterval: rawInterval,
      constrainedInterval,
      nextCollectionTimestamp,
      reasoning,
    };

    this.logger.info('Safety buffer calculation completed', {
      correlationId: CorrelationUtils.getCorrelationId(),
      result,
    });

    return result;
  }

  /**
   * Update posting volume for a subreddit based on observed data
   * Recalculates safety buffer with new data
   */
  updatePostingVolume(
    subreddit: string,
    observedPostsPerDay: number,
  ): SubredditSchedulingConfig {
    this.logger.info('Updating posting volume for subreddit', {
      correlationId: CorrelationUtils.getCorrelationId(),
      subreddit,
      observedPostsPerDay,
    });

    const existingConfig = this.subredditConfigs.get(subreddit);
    if (!existingConfig) {
      return this.initializeSubredditScheduling(subreddit);
    }

    // Use weighted average to smooth out daily variations
    const smoothingFactor = 0.3; // 30% weight to new observation, 70% to existing
    const updatedAverage =
      existingConfig.averagePostsPerDay * (1 - smoothingFactor) +
      observedPostsPerDay * smoothingFactor;

    // Recalculate safety buffer with updated average
    const safetyBufferResult = this.calculateSafetyBuffer(
      subreddit,
      updatedAverage,
    );

    const updatedConfig: SubredditSchedulingConfig = {
      ...existingConfig,
      averagePostsPerDay: updatedAverage,
      safeInterval: safetyBufferResult.constrainedInterval,
      lastCalculated: new Date(),
      nextCollectionDue: new Date(safetyBufferResult.nextCollectionTimestamp),
    };

    this.subredditConfigs.set(subreddit, updatedConfig);

    this.logger.info('Posting volume updated', {
      correlationId: CorrelationUtils.getCorrelationId(),
      subreddit,
      previousAverage: existingConfig.averagePostsPerDay,
      newAverage: updatedAverage,
      newInterval: safetyBufferResult.constrainedInterval,
    });

    return updatedConfig;
  }

  /**
   * Get current scheduling configuration for a subreddit
   */
  getSchedulingConfig(
    subreddit: string,
  ): SubredditSchedulingConfig | undefined {
    return this.subredditConfigs.get(subreddit);
  }

  /**
   * Get all configured subreddit scheduling information
   */
  getAllSchedulingConfigs(): SubredditSchedulingConfig[] {
    return Array.from(this.subredditConfigs.values());
  }

  /**
   * Check if collection is due for a subreddit
   */
  isCollectionDue(subreddit: string): boolean {
    const config = this.subredditConfigs.get(subreddit);
    if (!config) {
      return true; // If no config exists, collection is due to initialize
    }

    const now = new Date();
    return now >= config.nextCollectionDue;
  }

  /**
   * Get subreddits that are due for collection
   */
  getSubredditsDueForCollection(): string[] {
    return Array.from(this.subredditConfigs.entries())
      .filter(([, config]) => new Date() >= config.nextCollectionDue)
      .map(([subreddit]) => subreddit);
  }

  /**
   * Calculate time until next collection for a subreddit
   */
  getTimeUntilNextCollection(subreddit: string): number | null {
    const config = this.subredditConfigs.get(subreddit);
    if (!config) {
      return null;
    }

    const now = Date.now();
    const timeUntil = config.nextCollectionDue.getTime() - now;
    return Math.max(0, timeUntil); // Return 0 if overdue
  }

  /**
   * Get scheduling statistics for monitoring
   */
  getSchedulingStatistics(): {
    totalSubreddits: number;
    duForCollection: number;
    averageInterval: number;
    nextCollectionTime: Date | null;
  } {
    const configs = Array.from(this.subredditConfigs.values());
    const dueSubreddits = this.getSubredditsDueForCollection();

    const averageInterval =
      configs.length > 0
        ? configs.reduce((sum, config) => sum + config.safeInterval, 0) /
          configs.length
        : 0;

    const nextDueTimes = configs
      .map((config) => config.nextCollectionDue.getTime())
      .sort((a, b) => a - b);

    const nextCollectionTime =
      nextDueTimes.length > 0 ? new Date(nextDueTimes[0]) : null;

    return {
      totalSubreddits: configs.length,
      duForCollection: dueSubreddits.length,
      averageInterval,
      nextCollectionTime,
    };
  }
}
