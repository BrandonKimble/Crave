import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, JobCounts } from 'bull';
import { LoggerService, CorrelationUtils } from '../../../shared';
import {
  RedditService,
  KeywordSearchResponse,
  BatchKeywordSearchResponse,
} from '../../external-integrations/reddit/reddit.service';
import {
  KeywordSearchSchedulerService,
  KeywordSearchSchedule,
} from './keyword-search-scheduler.service';
import { EntityPriorityScore } from './entity-priority-selection.service';
import { BatchJob } from './batch-processing-queue.types';
import { ConfigService } from '@nestjs/config';
import { KeywordSearchMetricsService } from './keyword-search-metrics.service';

/**
 * Keyword Search Orchestrator Service
 *
 * Implements PRD Section 5.1.2 keyword entity search cycles orchestration.
 * Coordinates entity selection, Reddit API searches, and processing pipeline integration.
 */
@Injectable()
export class KeywordSearchOrchestratorService
  implements OnModuleInit, OnModuleDestroy
{
  // Legacy field retained to avoid compile errors in deprecated methods retained below
  private unifiedProcessing: any = null;
  private autoIntervalMs = 60 * 60 * 1000;
  private autoExecutionTimer?: NodeJS.Timeout;
  constructor(
    private readonly redditService: RedditService,
    private readonly keywordScheduler: KeywordSearchSchedulerService,
    @Inject(LoggerService) private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    @InjectQueue('keyword-batch-processing-queue')
    private readonly keywordQueue: Queue,
    @InjectQueue('keyword-search-execution')
    private readonly keywordSearchQueue: Queue,
    private readonly keywordSearchMetrics: KeywordSearchMetricsService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.autoIntervalMs = this.resolveAutoInterval();
    if (this.keywordSchedulerConfigEnabled()) {
      await this.keywordScheduler.initializeScheduling();
      this.startAutoExecution();
    }
  }

  onModuleDestroy(): void {
    this.stopAutoExecution();
  }

  /**
   * Execute keyword entity search for specific subreddit
   * Implements PRD 5.1.2 complete keyword search cycle
   *
   * @param subreddit - Target subreddit for searches
   * @param entities - Priority entities to search for
   * @returns Promise<KeywordSearchExecutionResult> - Execution results with processing metrics
   */
  async executeKeywordSearchCycle(
    subreddit: string,
    entities: EntityPriorityScore[],
  ): Promise<KeywordSearchExecutionResult> {
    const startTime = Date.now();
    const correlationId = CorrelationUtils.getCorrelationId();

    this.logger.info('Starting keyword search cycle execution', {
      correlationId,
      operation: 'execute_keyword_search_cycle',
      subreddit,
      entityCount: entities.length,
      topEntities: entities.slice(0, 5).map((e) => ({
        name: e.entityName,
        type: e.entityType,
        score: e.score,
      })),
    });

    const results: KeywordSearchExecutionResult = {
      subreddit,
      entities,
      searchResults: {},
      processingResults: {},
      metadata: {
        totalEntities: entities.length,
        successfulSearches: 0,
        failedSearches: 0,
        processedEntities: 0,
        processingErrors: 0,
        executionStartTime: new Date(startTime),
        executionEndTime: new Date(), // Will be updated
      },
      performance: {
        searchDuration: 0,
        processingDuration: 0,
        totalDuration: 0,
        totalApiCalls: 0,
        averageEntityProcessingTime: 0,
      },
    };

    try {
      // Extract entity names for batch search
      const entityNames = entities.map((entity) => entity.entityName);

      this.logger.debug('Executing batch keyword search', {
        correlationId,
        subreddit,
        entityNames: entityNames.slice(0, 10), // Log first 10 entities
        totalCount: entityNames.length,
      });

      // Execute batch keyword search per PRD 5.1.2
      const searchStartTime = Date.now();
      const batchSearchResult =
        await this.redditService.batchEntityKeywordSearch(
          subreddit,
          entityNames,
          {
            sort: 'relevance', // PRD specification
            limit: 1000, // PRD limit
            batchDelay: 1200, // 1.2 seconds between searches for rate limiting
          },
        );

      const searchDuration = Date.now() - searchStartTime;
      results.performance.searchDuration = searchDuration;
      results.performance.totalApiCalls =
        batchSearchResult.performance.totalApiCalls;
      results.metadata.successfulSearches =
        batchSearchResult.metadata.successfulSearches;
      results.metadata.failedSearches =
        batchSearchResult.metadata.failedSearches;
      results.searchResults = batchSearchResult.results;

      this.logger.info('Batch keyword search completed', {
        correlationId,
        subreddit,
        searchDuration,
        successfulSearches: batchSearchResult.metadata.successfulSearches,
        failedSearches: batchSearchResult.metadata.failedSearches,
        totalPosts: batchSearchResult.metadata.totalPosts,
        totalComments: batchSearchResult.metadata.totalComments,
      });

      // Enqueue keyword search results as batches to async worker (mirrors chronological flow)
      await this.enqueueKeywordBatches(
        subreddit,
        results.searchResults,
        correlationId || 'keyword-search',
      );

      const totalDuration = Date.now() - startTime;
      results.performance.totalDuration = totalDuration;
      results.performance.averageEntityProcessingTime =
        results.metadata.processedEntities > 0
          ? results.performance.processingDuration /
            results.metadata.processedEntities
          : 0;
      results.metadata.executionEndTime = new Date();

      this.logger.info('Keyword search cycle execution completed', {
        correlationId,
        subreddit,
        totalDuration,
        searchDuration,
        processingDuration: results.performance.processingDuration,
        entitiesProcessed: results.metadata.processedEntities,
        successRate:
          results.metadata.totalEntities > 0
            ? (results.metadata.processedEntities /
                results.metadata.totalEntities) *
              100
            : 0,
      });

      return results;
    } catch (error: unknown) {
      const totalDuration = Date.now() - startTime;
      results.performance.totalDuration = totalDuration;
      results.metadata.executionEndTime = new Date();

      this.logger.error('Keyword search cycle execution failed', {
        correlationId,
        subreddit,
        totalDuration,
        error: error instanceof Error ? error.message : String(error),
        entityCount: entities.length,
      });

      throw error;
    }
  }

  /**
   * Enqueue keyword search post IDs in batches for async processing.
   */
  private async enqueueKeywordBatches(
    subreddit: string,
    searchResults: Record<string, KeywordSearchResponse>,
    correlationId: string,
  ): Promise<void> {
    const BATCH_SIZE = 25;
    const postIdSet = new Set<string>();
    for (const [, result] of Object.entries(searchResults)) {
      for (const p of result.posts) postIdSet.add(p.id);
      for (const c of result.comments) {
        if (c.parentId && c.parentId.startsWith('t3_')) {
          postIdSet.add(c.parentId.replace('t3_', ''));
        }
      }
    }
    const postIds = Array.from(postIdSet);
    const batches: string[][] = [];
    for (let i = 0; i < postIds.length; i += BATCH_SIZE) {
      batches.push(postIds.slice(i, i + BATCH_SIZE));
    }

    this.logger.info('Enqueuing keyword batches', {
      correlationId,
      subreddit,
      totalPosts: postIds.length,
      batches: batches.length,
    });

    const jobGroupId = `${subreddit}-keyword-${Date.now()}`;
    const enqueuePromises: Promise<any>[] = [];
    batches.forEach((ids, idx) => {
      const job: BatchJob = {
        batchId: `${jobGroupId}-${idx + 1}`,
        parentJobId: jobGroupId,
        collectionType: 'keyword',
        subreddit,
        postIds: ids,
        batchNumber: idx + 1,
        totalBatches: batches.length,
        createdAt: new Date(),
        priority: 1,
        options: { depth: 50 },
      };
      enqueuePromises.push(
        this.keywordQueue.add('process-keyword-batch', job, {
          priority: 1,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          delay: idx * 250,
        }),
      );
    });

    await Promise.all(enqueuePromises);

    await this.safeUpdateQueueMetrics();
  }

  /**
   * Process search results through unified processing pipeline
   * Routes Reddit search results to LLM processing and database updates
   *
   * @param results - Execution results object to populate
   * @param correlationId - Correlation ID for logging
   */
  private async processSearchResults(
    results: KeywordSearchExecutionResult,
    correlationId: string,
  ): Promise<void> {
    const processingStartTime = Date.now();

    this.logger.debug('Starting search results processing', {
      correlationId,
      operation: 'process_search_results',
      searchResultCount: Object.keys(results.searchResults).length,
    });

    for (const [entityName, searchResult] of Object.entries(
      results.searchResults,
    )) {
      try {
        this.logger.debug(
          `Processing search results for entity: ${entityName}`,
          {
            correlationId,
            entityName,
            postsFound: searchResult.posts.length,
            commentsFound: searchResult.comments.length,
          },
        );

        // Convert search results to unified processing format
        const processingData = this.convertSearchResultToProcessingFormat(
          entityName,
          searchResult,
        );

        // Route through unified processing pipeline per PRD 5.1.2
        const processingResult =
          await this.unifiedProcessing.processUnifiedBatch(processingData);

        results.processingResults[entityName] = {
          success: true,
          entitiesProcessed:
            processingResult.entityResolution?.entitiesProcessed || 0,
          connectionsCreated:
            processingResult.databaseOperations?.connectionsCreated || 0,
          processingTime:
            processingResult.performance?.totalProcessingTime || 0,
        };

        results.metadata.processedEntities++;

        this.logger.debug(`Successfully processed entity: ${entityName}`, {
          correlationId,
          entityName,
          entitiesResolved:
            processingResult.entityResolution?.entitiesProcessed || 0,
          connectionsCreated:
            processingResult.databaseOperations?.connectionsCreated || 0,
        });
      } catch (entityError: unknown) {
        const errorMessage =
          entityError instanceof Error
            ? entityError.message
            : String(entityError);

        results.processingResults[entityName] = {
          success: false,
          error: errorMessage,
          processingTime: 0,
          entitiesProcessed: 0,
          connectionsCreated: 0,
        };

        results.metadata.processingErrors++;

        this.logger.warn(`Failed to process entity: ${entityName}`, {
          correlationId,
          entityName,
          error: {
            message: errorMessage,
            stack: entityError instanceof Error ? entityError.stack : undefined,
          },
        });
      }
    }

    const processingDuration = Date.now() - processingStartTime;
    results.performance.processingDuration = processingDuration;

    this.logger.info('Search results processing completed', {
      correlationId,
      processingDuration,
      processedEntities: results.metadata.processedEntities,
      processingErrors: results.metadata.processingErrors,
      totalSearchResults: Object.keys(results.searchResults).length,
    });
  }

  /**
   * Convert Reddit search results to unified processing format
   *
   * @param entityName - Entity name that was searched
   * @param searchResult - Reddit search results
   * @returns Unified processing input format
   */
  private convertSearchResultToProcessingFormat(
    entityName: string,
    searchResult: KeywordSearchResponse,
  ): any {
    // Convert Reddit posts and comments to format expected by unified processing service
    // This matches the format used by other data collection services
    const posts = searchResult.posts.map((post) => ({
      id: post.id,
      title: post.title,
      selftext: post.content,
      author: post.author,
      created_utc: Math.floor(post.createdAt.getTime() / 1000),
      ups: post.upvotes,
      num_comments: post.commentCount,
      subreddit: post.subreddit,
      permalink: post.url.replace('https://reddit.com', ''),
      url: post.url,
    }));

    const comments = searchResult.comments.map((comment) => ({
      id: comment.id,
      body: comment.content,
      author: comment.author,
      created_utc: Math.floor(comment.createdAt.getTime() / 1000),
      ups: comment.upvotes,
      parent_id: comment.parentId,
      permalink: comment.url.replace('https://reddit.com', ''),
    }));

    return {
      source: 'keyword_search',
      subreddit: searchResult.metadata.subreddit,
      searchEntity: entityName,
      timestamp: searchResult.metadata.searchTimestamp,
      posts,
      comments,
      metadata: {
        searchQuery: searchResult.metadata.searchQuery,
        totalItems: posts.length + comments.length,
        searchOptions: searchResult.metadata.searchOptions,
      },
    };
  }

  /**
   * Execute due keyword searches based on scheduler
   * Implements PRD 5.1.2 monthly scheduling with automated execution
   *
   * @returns Promise<KeywordSearchBatchResult> - Results from all due searches
   */
  async executeDueKeywordSearches(): Promise<KeywordSearchBatchResult> {
    const startTime = Date.now();
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.info('Checking for due keyword searches', {
      correlationId,
      operation: 'execute_due_keyword_searches',
    });

    try {
      // Check scheduler for due searches
      const dueSchedules = await this.keywordScheduler.checkDueSearches();

      if (dueSchedules.length === 0) {
        this.logger.debug('No keyword searches are currently due', {
          correlationId,
        });

        return {
          executedSearches: [],
          enqueuedJobs: [],
          totalSchedules: 0,
          successfulExecutions: 0,
          failedExecutions: 0,
          totalDuration: Date.now() - startTime,
        };
      }

      this.logger.info('Found due keyword searches, executing', {
        correlationId,
        dueCount: dueSchedules.length,
        subreddits: dueSchedules.map((s) => s.subreddit),
      });

      const enqueuedJobs: Array<{ subreddit: string; entityCount: number }> =
        [];

      for (const schedule of dueSchedules) {
        await this.enqueueKeywordSearchJob({
          subreddit: schedule.subreddit,
          entities: schedule.entities,
          source: 'scheduled',
          trackCompletion: true,
        });
        enqueuedJobs.push({
          subreddit: schedule.subreddit,
          entityCount: schedule.entities.length,
        });
      }

      const totalDuration = Date.now() - startTime;

      this.logger.info('Enqueued due keyword searches', {
        correlationId,
        totalDuration,
        totalSchedules: dueSchedules.length,
        subreddits: enqueuedJobs.map((entry) => entry.subreddit),
      });

      this.keywordSearchMetrics.recordScheduledEnqueue(enqueuedJobs);

      return {
        executedSearches: [],
        enqueuedJobs,
        totalSchedules: dueSchedules.length,
        totalDuration,
        successfulExecutions: 0,
        failedExecutions: 0,
      };
    } catch (error: unknown) {
      const totalDuration = Date.now() - startTime;
      this.logger.error('Failed to execute due keyword searches', {
        correlationId,
        totalDuration,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Get keyword search execution metrics
   */
  async getKeywordSearchMetrics(): Promise<KeywordSearchMetrics> {
    try {
      const schedules = this.keywordScheduler.getAllSchedules();
      const now = new Date();

      const metrics: KeywordSearchMetrics = {
        totalSchedules: schedules.length,
        activeSchedules: schedules.filter(
          (s) => s.status === 'pending' || s.status === 'scheduled',
        ).length,
        completedSchedules: schedules.filter((s) => s.status === 'completed')
          .length,
        failedSchedules: schedules.filter((s) => s.status === 'failed').length,
        nextDueSearch: schedules
          .filter((s) => s.status === 'pending')
          .sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime())[0]
          ?.nextRun,
        totalEntitiesScheduled: schedules.reduce(
          (sum, s) => sum + s.entities.length,
          0,
        ),
        averageEntitiesPerSchedule:
          schedules.length > 0
            ? schedules.reduce((sum, s) => sum + s.entities.length, 0) /
              schedules.length
            : 0,
        schedulesBySubreddit: schedules.reduce(
          (acc, s) => {
            acc[s.subreddit] = {
              status: s.status,
              nextRun: s.nextRun,
              lastRun: s.lastRun,
              entityCount: s.entities.length,
            };
            return acc;
          },
          {} as Record<string, any>,
        ),
      };

      return metrics;
    } catch (error: unknown) {
      this.logger.error('Failed to get keyword search metrics', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async enqueueKeywordSearchJob(data: KeywordSearchJobData): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    await this.keywordSearchQueue.add('run-keyword-search', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      removeOnFail: false,
      jobId: data.jobId || `${data.source}-${data.subreddit}-${Date.now()}`,
    });

    this.logger.debug('Queued keyword search job', {
      correlationId,
      subreddit: data.subreddit,
      source: data.source,
      entityCount: data.entities.length,
    });

    await this.safeUpdateQueueMetrics();
  }

  private async safeUpdateQueueMetrics(): Promise<void> {
    try {
      await Promise.all([
        this.captureQueueMetrics(
          this.keywordSearchQueue,
          'keyword_search_execution',
        ),
        this.captureQueueMetrics(this.keywordQueue, 'keyword_batch_processing'),
      ]);
    } catch (error) {
      this.logger.warn('Failed to record keyword queue metrics', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private async captureQueueMetrics(queue: Queue, name: string): Promise<void> {
    const counts: JobCounts = await queue.getJobCounts();
    this.keywordSearchMetrics.recordQueueSnapshot(name, counts);
  }

  private keywordSchedulerConfigEnabled(): boolean {
    return this.keywordScheduler.isEnabled();
  }

  private resolveAutoInterval(): number {
    const raw = this.configService.get<string>(
      'KEYWORD_SEARCH_POLL_INTERVAL_MS',
    );
    const parsed = raw ? Number(raw) : Number.NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    return 60 * 60 * 1000; // default 1 hour
  }

  private startAutoExecution(): void {
    if (this.autoExecutionTimer) {
      return;
    }
    this.autoExecutionTimer = setInterval(() => {
      this.executeDueKeywordSearches().catch((error) => {
        this.logger.error('Auto keyword execution failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }, this.autoIntervalMs);
  }

  private stopAutoExecution(): void {
    if (this.autoExecutionTimer) {
      clearInterval(this.autoExecutionTimer);
      this.autoExecutionTimer = undefined;
    }
  }

  async getQueueDepth(): Promise<KeywordQueueDepth> {
    const [execution, processing] = await Promise.all([
      this.keywordSearchQueue.getJobCounts(),
      this.keywordQueue.getJobCounts(),
    ]);
    return { execution, processing };
  }
}

/**
 * Keyword Search Execution Result
 */
export interface KeywordSearchExecutionResult {
  subreddit: string;
  entities: EntityPriorityScore[];
  searchResults: Record<string, KeywordSearchResponse>;
  processingResults: Record<string, EntityProcessingResult>;
  metadata: {
    totalEntities: number;
    successfulSearches: number;
    failedSearches: number;
    processedEntities: number;
    processingErrors: number;
    executionStartTime: Date;
    executionEndTime: Date;
  };
  performance: {
    searchDuration: number;
    processingDuration: number;
    totalDuration: number;
    totalApiCalls: number;
    averageEntityProcessingTime: number;
  };
}

/**
 * Entity Processing Result
 */
export interface EntityProcessingResult {
  success: boolean;
  error?: string;
  processingTime: number;
  entitiesProcessed: number;
  connectionsCreated: number;
}

/**
 * Keyword Search Batch Result
 */
export interface KeywordSearchBatchResult {
  executedSearches: KeywordSearchExecutionResult[];
  enqueuedJobs: Array<{ subreddit: string; entityCount: number }>;
  totalSchedules: number;
  successfulExecutions: number;
  failedExecutions: number;
  totalDuration: number;
}

/**
 * Keyword Search Metrics
 */
export interface KeywordSearchMetrics {
  totalSchedules: number;
  activeSchedules: number;
  completedSchedules: number;
  failedSchedules: number;
  nextDueSearch?: Date;
  totalEntitiesScheduled: number;
  averageEntitiesPerSchedule: number;
  schedulesBySubreddit: Record<string, any>;
}

export interface KeywordSearchJobData {
  jobId?: string;
  subreddit: string;
  entities: EntityPriorityScore[];
  source: 'scheduled' | 'on_demand';
  trackCompletion: boolean;
}

export interface KeywordQueueDepth {
  execution: JobCounts;
  processing: JobCounts;
}
