import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { RedditService } from '../../external-integrations/reddit/reddit.service';
import { CollectionSchedulingService } from './collection-scheduling.service';

// Reddit API data structures
interface RedditPostData {
  id: string;
  title: string;
  created_utc: number;
  subreddit: string;
  author?: string;
  score?: number;
  num_comments?: number;
  permalink?: string;
  selftext?: string;
  url?: string;
}

interface RedditPost {
  kind: string;
  data: RedditPostData;
}

export interface ChronologicalCollectionResult {
  subreddit: string;
  postsCollected: number;
  commentsCollected: number;
  timeRange: {
    earliest: number;
    latest: number;
  };
  processingTime: number;
  rateLimitStatus: {
    requestsUsed: number;
    remainingQuota: number;
  };
}

export interface ChronologicalCollectionOptions {
  lastProcessedTimestamp?: number;
  limit?: number;
  includeComments?: boolean;
}

/**
 * Chronological Collection Service
 *
 * Implements PRD Section 5.1.2: Chronological Collection Cycles
 * Handles fetching all recent posts chronologically using /r/subreddit/new
 * with dynamic scheduling based on posting volume and safety buffer calculations.
 *
 * Key responsibilities:
 * - Execute chronological collection using /r/subreddit/new endpoint
 * - Track last_processed_timestamp for collection continuity
 * - Integrate with dynamic scheduling service for frequency calculation
 * - Handle error scenarios with retry logic
 * - Provide complete recent coverage ensuring no content gaps
 */
@Injectable()
export class ChronologicalCollectionService implements OnModuleInit {
  private logger!: LoggerService;
  private lastProcessedTimestamps = new Map<string, number>();
  private isCollectionActive = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly redditService: RedditService,
    private readonly schedulingService: CollectionSchedulingService,
    private readonly loggerService: LoggerService,
  
  ) {} 

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('ChronologicalCollection');
  }

  /**
   * Initialize chronological collection for configured subreddits
   * Implements PRD requirement: "Start immediately: Begin both collection strategies"
   */
  initializeChronologicalCollection(): boolean {
    this.logger.info('Initializing chronological collection', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'initialize_chronological',
    });

    try {
      // Get configured subreddits from config
      const targetSubreddits = this.getTargetSubreddits();

      // Initialize scheduling for each subreddit
      for (const subreddit of targetSubreddits) {
        this.schedulingService.initializeSubredditScheduling(subreddit);

        // Set initial timestamp to current time for new collections
        if (!this.lastProcessedTimestamps.has(subreddit)) {
          this.lastProcessedTimestamps.set(subreddit, Date.now() / 1000);
        }
      }

      this.logger.info('Chronological collection initialization complete', {
        correlationId: CorrelationUtils.getCorrelationId(),
        subreddits: targetSubreddits,
        timestamps: Object.fromEntries(this.lastProcessedTimestamps),
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to initialize chronological collection', {
        correlationId: CorrelationUtils.getCorrelationId(),
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Execute chronological collection for specified subreddits
   * Implements PRD Section 5.1.2: "Fetch all recent posts chronologically using /r/subreddit/new"
   */
  async executeCollection(
    subreddits: string[],
    options: ChronologicalCollectionOptions = {},
  ): Promise<{
    results: Record<string, ChronologicalCollectionResult>;
    totalPostsCollected: number;
    processingTime: number;
  }> {
    const startTime = Date.now();
    this.isCollectionActive = true;

    this.logger.info('Starting chronological collection execution', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'execute_chronological_collection',
      subreddits,
      options,
    });

    const results: Record<string, ChronologicalCollectionResult> = {};
    let totalPostsCollected = 0;

    try {
      // Process each subreddit sequentially to manage rate limits
      for (const subreddit of subreddits) {
        const subredditResult = await this.collectFromSubreddit(
          subreddit,
          options,
        );
        results[subreddit] = subredditResult;
        totalPostsCollected += subredditResult.postsCollected;

        // Update last processed timestamp for continuity
        if (subredditResult.timeRange.latest > 0) {
          this.lastProcessedTimestamps.set(
            subreddit,
            subredditResult.timeRange.latest,
          );
        }
      }

      const processingTime = Date.now() - startTime;

      this.logger.info('Chronological collection execution completed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        totalPostsCollected,
        processingTime,
        subredditsProcessed: subreddits.length,
      });

      return {
        results,
        totalPostsCollected,
        processingTime,
      };
    } catch (error) {
      this.logger.error('Chronological collection execution failed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        error: error instanceof Error ? error.message : String(error),
        subreddits,
      });
      throw error;
    } finally {
      this.isCollectionActive = false;
    }
  }

  /**
   * Collect posts from a single subreddit using chronological method
   * Implements PRD requirement: Dynamic scheduling with safety buffer equation
   */
  private async collectFromSubreddit(
    subreddit: string,
    options: ChronologicalCollectionOptions,
  ): Promise<ChronologicalCollectionResult> {
    const startTime = Date.now();
    const lastProcessed =
      options.lastProcessedTimestamp ||
      this.lastProcessedTimestamps.get(subreddit) ||
      Math.floor(Date.now() / 1000);

    this.logger.info('Collecting from subreddit chronologically', {
      correlationId: CorrelationUtils.getCorrelationId(),
      subreddit,
      lastProcessed,
      limit: options.limit,
    });

    try {
      // Use existing RedditService chronological collection method
      const collectionResult = await this.redditService.getChronologicalPosts(
        subreddit,
        lastProcessed,
        options.limit || 100,
      );

      // Extract metrics from Reddit API response
      const postsCollected = collectionResult.data?.length || 0;
      const commentsCollected = 0; // Comments will be processed separately

      // Calculate time range from posts
      let earliest = 0;
      let latest = 0;

      if (collectionResult.data && collectionResult.data.length > 0) {
        const timestamps = (collectionResult.data as RedditPost[])
          .map((post) => post.data?.created_utc || 0)
          .filter((timestamp: number) => timestamp > 0);

        if (timestamps.length > 0) {
          earliest = Math.min(...timestamps);
          latest = Math.max(...timestamps);
        }
      }

      const processingTime = Date.now() - startTime;

      const result: ChronologicalCollectionResult = {
        subreddit,
        postsCollected,
        commentsCollected,
        timeRange: { earliest, latest },
        processingTime,
        rateLimitStatus: {
          requestsUsed: collectionResult.performance?.apiCallsUsed || 1,
          remainingQuota: 100, // Placeholder - will be enhanced with actual rate limit data
        },
      };

      this.logger.info('Subreddit collection completed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        result,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to collect from subreddit', {
        correlationId: CorrelationUtils.getCorrelationId(),
        subreddit,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return empty result on error to allow other subreddits to continue
      return {
        subreddit,
        postsCollected: 0,
        commentsCollected: 0,
        timeRange: { earliest: 0, latest: 0 },
        processingTime: Date.now() - startTime,
        rateLimitStatus: {
          requestsUsed: 0,
          remainingQuota: 100,
        },
      };
    }
  }

  /**
   * Get collection status for monitoring
   */
  getCollectionStatus(): {
    isActive: boolean;
    lastCollection: Date | null;
    nextScheduled: Date | null;
  } {
    // This will be enhanced with actual scheduling data
    return {
      isActive: this.isCollectionActive,
      lastCollection: null, // Will be implemented with persistent storage
      nextScheduled: null, // Will be implemented with Bull queue integration
    };
  }

  /**
   * Get target subreddits from configuration
   * Implements PRD Section 5.1.1: "Target Subreddits: r/austinfood (primary), r/FoodNYC"
   */
  private getTargetSubreddits(): string[] {
    return this.configService.get<string[]>('reddit.targetSubreddits', [
      'austinfood',
      'FoodNYC',
    ]);
  }

  /**
   * Get last processed timestamp for a subreddit
   */
  getLastProcessedTimestamp(subreddit: string): number | undefined {
    return this.lastProcessedTimestamps.get(subreddit);
  }

  /**
   * Update last processed timestamp for a subreddit
   * Used for tracking collection continuity
   */
  updateLastProcessedTimestamp(subreddit: string, timestamp: number): void {
    this.lastProcessedTimestamps.set(subreddit, timestamp);

    this.logger.debug('Updated last processed timestamp', {
      correlationId: CorrelationUtils.getCorrelationId(),
      subreddit,
      timestamp,
      date: new Date(timestamp * 1000).toISOString(),
    });
  }
}
