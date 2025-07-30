import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { RedditService } from '../../external-integrations/reddit/reddit.service';
import { ChronologicalCollectionService } from './chronological-collection.service';

/**
 * Dual Collection Strategy Service
 *
 * Implements PRD Section 5.1.2: Dual Collection Strategy
 * Orchestrates both chronological collection cycles and keyword entity search cycles
 * to provide comprehensive Reddit data coverage with gap minimization.
 *
 * Key responsibilities:
 * - Coordinate chronological collection cycles for complete recent coverage
 * - Manage keyword entity search cycles for targeted historical enrichment
 * - Ensure bidirectional enrichment and parallel processing capabilities
 * - Handle overlap detection and merge data based on timestamps
 */
@Injectable()
export class DualCollectionStrategyService {
  private readonly logger: LoggerService;

  constructor(
    private readonly configService: ConfigService,
    private readonly redditService: RedditService,
    private readonly chronologicalCollection: ChronologicalCollectionService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('DualCollectionStrategy');
  }

  /**
   * Initialize both collection strategies to minimize 2024-2025 gap
   * Implements PRD requirement: "Start immediately: Begin both collection strategies"
   */
  initializeCollectionStrategies(): {
    chronologicalInitialized: boolean;
    keywordSearchInitialized: boolean;
    parallelProcessingReady: boolean;
  } {
    this.logger.info('Initializing dual collection strategies', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'initialize_dual_collection',
    });

    try {
      // Start chronological collection immediately
      const chronologicalReady =
        this.chronologicalCollection.initializeChronologicalCollection();

      // Keyword search will be implemented in T09_S02
      const keywordSearchReady = true; // Foundation ready for future implementation

      const result = {
        chronologicalInitialized: chronologicalReady,
        keywordSearchInitialized: keywordSearchReady,
        parallelProcessingReady: chronologicalReady && keywordSearchReady,
      };

      this.logger.info('Dual collection strategy initialization complete', {
        correlationId: CorrelationUtils.getCorrelationId(),
        result,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to initialize dual collection strategies', {
        correlationId: CorrelationUtils.getCorrelationId(),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Execute chronological collection for specified subreddits
   * Implements PRD Section 5.1.2: "Fetch all recent posts chronologically using /r/subreddit/new"
   */
  async executeChronologicalCollection(
    subreddits: string[],
    options?: {
      lastProcessedTimestamp?: number;
      limit?: number;
    },
  ): Promise<{
    results: Record<string, any>;
    totalPostsCollected: number;
    processingTime: number;
  }> {
    return this.chronologicalCollection.executeCollection(subreddits, options);
  }

  /**
   * Get collection status and metrics for monitoring
   */
  getCollectionStatus(): {
    chronological: {
      isActive: boolean;
      lastCollection: Date | null;
      nextScheduled: Date | null;
    };
    keywordSearch: {
      isActive: boolean;
      lastCollection: Date | null;
      nextScheduled: Date | null;
    };
  } {
    const chronologicalStatus =
      this.chronologicalCollection.getCollectionStatus();

    return {
      chronological: chronologicalStatus,
      keywordSearch: {
        isActive: false, // Will be implemented in T09_S02
        lastCollection: null,
        nextScheduled: null,
      },
    };
  }
}
