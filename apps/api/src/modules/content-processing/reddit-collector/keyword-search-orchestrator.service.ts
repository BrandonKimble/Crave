import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, JobCounts, Job } from 'bull';
import { LoggerService, CorrelationUtils } from '../../../shared';
import {
  RedditService,
  KeywordSearchResponse,
  BatchKeywordSearchResponse,
  RedditPost,
  RedditComment,
} from '../../external-integrations/reddit/reddit.service';
import { RateLimitResponse } from '../../external-integrations/shared/external-integrations.types';
import { KeywordSearchSchedulerService } from './keyword-search-scheduler.service';
import { EntityPriorityScore } from './entity-priority-selection.service';
import { BatchJob } from './batch-processing-queue.types';
import { ConfigService } from '@nestjs/config';
import { KeywordSearchMetricsService } from './keyword-search-metrics.service';
import { ProcessingResult } from './unified-processing.types';

export type KeywordSearchSort =
  | 'relevance'
  | 'new'
  | 'hot'
  | 'top'
  | 'comments';

export interface KeywordSearchSortPlan {
  sort: KeywordSearchSort;
  timeFilter?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  fallbackTimeFilter?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  minResultsForFallback?: number;
}

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
  private unifiedProcessing: UnifiedProcessingAdapter | null = null;
  private autoIntervalMs = 60 * 60 * 1000;
  private autoExecutionTimer?: NodeJS.Timeout;
  private readonly keywordSearchLimit: number;
  private readonly keywordSearchSorts: KeywordSearchSort[];
  constructor(
    private readonly redditService: RedditService,
    private readonly keywordScheduler: KeywordSearchSchedulerService,
    @Inject(LoggerService) private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    @InjectQueue('keyword-batch-processing-queue')
    private readonly keywordQueue: Queue<BatchJob>,
    @InjectQueue('keyword-search-execution')
    private readonly keywordSearchQueue: Queue<KeywordSearchJobData>,
    private readonly keywordSearchMetrics: KeywordSearchMetricsService,
  ) {
    this.keywordSearchLimit = this.resolveKeywordSearchLimit();
    this.keywordSearchSorts = this.resolveKeywordSearchSorts();
  }

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
    options: { sortPlan?: KeywordSearchSortPlan[] } = {},
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
        totalPosts: 0,
        totalComments: 0,
        totalItems: 0,
        sortsAttempted: [],
        sortSummaries: [],
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
      const configuredSorts =
        this.keywordSearchSorts.length > 0
          ? this.keywordSearchSorts
          : (['relevance'] as KeywordSearchSort[]);
      const sortPlanEntries: KeywordSearchSortPlan[] =
        options.sortPlan && options.sortPlan.length
          ? options.sortPlan
          : configuredSorts.map((sort) => ({ sort }));
      const sortsToExecute = sortPlanEntries.map((entry) => entry.sort);

      this.logger.debug('Executing batch keyword searches', {
        correlationId,
        subreddit,
        entityNames: entityNames.slice(0, 10), // Log first 10 entities
        totalCount: entityNames.length,
        sorts: sortsToExecute,
      });

      const aggregateResults = new Map<string, AggregatedKeywordEntity>();
      const sortSummaries: SortSummary[] = [];
      let cumulativeSuccessfulSearches = 0;
      let cumulativeFailedSearches = 0;
      let cumulativeApiCalls = 0;

      const searchStartTime = Date.now();

      for (const planEntry of sortPlanEntries) {
        const { sort, timeFilter, fallbackTimeFilter, minResultsForFallback } =
          planEntry;
        const batchSearchResult =
          await this.redditService.batchEntityKeywordSearch(
            subreddit,
            entityNames,
            {
              sort,
              timeFilter,
              limit: this.keywordSearchLimit,
              batchDelay: 1200, // 1.2 seconds between searches for rate limiting
            },
          );

        cumulativeSuccessfulSearches +=
          batchSearchResult.metadata.successfulSearches;
        cumulativeFailedSearches += batchSearchResult.metadata.failedSearches;
        cumulativeApiCalls += batchSearchResult.performance.totalApiCalls;

        sortSummaries.push({
          sort,
          timeFilter,
          totalPosts: batchSearchResult.metadata.totalPosts,
          totalComments: batchSearchResult.metadata.totalComments,
          successfulSearches: batchSearchResult.metadata.successfulSearches,
          failedSearches: batchSearchResult.metadata.failedSearches,
          apiCalls: batchSearchResult.performance.totalApiCalls,
          durationMs: batchSearchResult.performance.batchDuration,
        });

        this.mergeBatchKeywordResults(
          aggregateResults,
          batchSearchResult,
          sort,
        );

        const totalItems =
          batchSearchResult.metadata.totalPosts +
          batchSearchResult.metadata.totalComments;
        if (
          fallbackTimeFilter &&
          typeof minResultsForFallback === 'number' &&
          totalItems < minResultsForFallback
        ) {
          const fallbackResult =
            await this.redditService.batchEntityKeywordSearch(
              subreddit,
              entityNames,
              {
                sort,
                timeFilter: fallbackTimeFilter,
                limit: this.keywordSearchLimit,
                batchDelay: 1200,
              },
            );

          cumulativeSuccessfulSearches +=
            fallbackResult.metadata.successfulSearches;
          cumulativeFailedSearches += fallbackResult.metadata.failedSearches;
          cumulativeApiCalls += fallbackResult.performance.totalApiCalls;

          sortSummaries.push({
            sort,
            timeFilter: fallbackTimeFilter,
            fallbackUsed: true,
            totalPosts: fallbackResult.metadata.totalPosts,
            totalComments: fallbackResult.metadata.totalComments,
            successfulSearches: fallbackResult.metadata.successfulSearches,
            failedSearches: fallbackResult.metadata.failedSearches,
            apiCalls: fallbackResult.performance.totalApiCalls,
            durationMs: fallbackResult.performance.batchDuration,
          });

          this.mergeBatchKeywordResults(aggregateResults, fallbackResult, sort);
        }
      }

      const {
        results: aggregatedResults,
        totalPosts,
        totalComments,
      } = this.finalizeAggregatedResults(aggregateResults, sortsToExecute);

      const searchDuration = Date.now() - searchStartTime;
      results.performance.searchDuration = searchDuration;
      results.performance.totalApiCalls = cumulativeApiCalls;
      results.metadata.successfulSearches = cumulativeSuccessfulSearches;
      results.metadata.failedSearches = cumulativeFailedSearches;
      results.metadata.sortsAttempted = sortsToExecute;
      results.metadata.sortSummaries = sortSummaries;
      results.metadata.totalPosts = totalPosts;
      results.metadata.totalComments = totalComments;
      results.metadata.totalItems = totalPosts + totalComments;
      results.searchResults = aggregatedResults;

      this.logger.info('Batch keyword searches completed', {
        correlationId,
        subreddit,
        sorts: sortsToExecute,
        searchDuration,
        successfulSearches: cumulativeSuccessfulSearches,
        failedSearches: cumulativeFailedSearches,
        uniquePosts: totalPosts,
        uniqueComments: totalComments,
        apiCalls: cumulativeApiCalls,
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

  private mergeBatchKeywordResults(
    aggregate: Map<string, AggregatedKeywordEntity>,
    batchResult: BatchKeywordSearchResponse,
    sort: KeywordSearchSort,
  ): void {
    for (const entityName of Object.keys(batchResult.results)) {
      const rawResponse = batchResult.results[entityName];
      if (!rawResponse) {
        this.logger.warn('Skipping missing keyword search response', {
          entityName,
        });
        continue;
      }

      const response = this.normalizeKeywordSearchResponse(rawResponse);
      const rateLimitStatus: RateLimitResponse = this.cloneRateLimitStatus(
        response.performance.rateLimitStatus,
      );
      const existing = aggregate.get(entityName);
      const baseMetadata: KeywordSearchResponse['metadata'] =
        existing?.baseMetadata ?? {
          ...response.metadata,
          searchOptions: { ...(response.metadata.searchOptions ?? {}) },
        };

      if (!existing) {
        const initialEntry: AggregatedKeywordEntity = {
          baseMetadata,
          posts: new Map<
            string,
            { data: RedditPost; sorts: Set<KeywordSearchSort> }
          >(),
          comments: new Map<
            string,
            { data: RedditComment; sorts: Set<KeywordSearchSort> }
          >(),
          collectedSorts: new Set<KeywordSearchSort>(),
          postUrls: new Set<string>(),
          commentUrls: new Set<string>(),
          totalSearchDuration: 0,
          totalApiCalls: 0,
          lastRateLimitStatus: rateLimitStatus,
        };
        aggregate.set(entityName, initialEntry);
      }

      const accumulator = aggregate.get(entityName)!;
      accumulator.collectedSorts.add(sort);
      const baseSorts = accumulator.baseMetadata.collectedSorts ?? [];
      if (!baseSorts.includes(sort)) {
        accumulator.baseMetadata.collectedSorts = [...baseSorts, sort];
      }
      accumulator.totalSearchDuration += response.performance.searchDuration;
      accumulator.totalApiCalls += response.performance.apiCallsUsed;
      accumulator.lastRateLimitStatus = rateLimitStatus;

      if (
        response.metadata.searchTimestamp >
        accumulator.baseMetadata.searchTimestamp
      ) {
        accumulator.baseMetadata.searchTimestamp =
          response.metadata.searchTimestamp;
      }

      if (response.metadata.searchOptions) {
        accumulator.baseMetadata.searchOptions = {
          ...(accumulator.baseMetadata.searchOptions ?? {}),
          ...response.metadata.searchOptions,
        };
      }

      for (const post of response.posts) {
        const existingPost = accumulator.posts.get(post.id);
        if (!existingPost) {
          accumulator.posts.set(post.id, {
            data: post,
            sorts: new Set<KeywordSearchSort>([sort]),
          });
        } else {
          existingPost.sorts.add(sort);
        }
        if (post.url) {
          accumulator.postUrls.add(post.url);
        }
      }

      for (const comment of response.comments) {
        const existingComment = accumulator.comments.get(comment.id);
        if (!existingComment) {
          accumulator.comments.set(comment.id, {
            data: comment,
            sorts: new Set<KeywordSearchSort>([sort]),
          });
        } else {
          existingComment.sorts.add(sort);
        }
        if (comment.url) {
          accumulator.commentUrls.add(comment.url);
        }
      }

      for (const url of response.attribution.postUrls) {
        if (url) {
          accumulator.postUrls.add(url);
        }
      }

      for (const url of response.attribution.commentUrls) {
        if (url) {
          accumulator.commentUrls.add(url);
        }
      }
    }
  }

  private isValidSort(value: unknown): value is KeywordSearchSort {
    return (
      value === 'relevance' ||
      value === 'new' ||
      value === 'hot' ||
      value === 'top' ||
      value === 'comments'
    );
  }

  private normalizeKeywordSearchResponse(
    response: KeywordSearchResponse,
  ): KeywordSearchResponse {
    const posts: RedditPost[] = response.posts
      .map((post) => {
        const createdAt =
          post.createdAt instanceof Date
            ? post.createdAt
            : new Date(post.createdAt);
        const safeCreatedAt = Number.isNaN(createdAt.getTime())
          ? new Date()
          : createdAt;

        return {
          id: typeof post.id === 'string' ? post.id : '',
          title: typeof post.title === 'string' ? post.title : '',
          content: typeof post.content === 'string' ? post.content : '',
          author: typeof post.author === 'string' ? post.author : '[unknown]',
          subreddit:
            typeof post.subreddit === 'string' ? post.subreddit : 'unknown',
          url: typeof post.url === 'string' ? post.url : '',
          upvotes: typeof post.upvotes === 'number' ? post.upvotes : 0,
          createdAt: safeCreatedAt,
          commentCount:
            typeof post.commentCount === 'number' ? post.commentCount : 0,
          sourceType: 'post' as const,
        };
      })
      .filter((post) => post.id.length > 0);

    const comments: RedditComment[] = response.comments
      .map((comment) => {
        const createdAt =
          comment.createdAt instanceof Date
            ? comment.createdAt
            : new Date(comment.createdAt);
        const safeCreatedAt = Number.isNaN(createdAt.getTime())
          ? new Date()
          : createdAt;

        return {
          id: typeof comment.id === 'string' ? comment.id : '',
          content: typeof comment.content === 'string' ? comment.content : '',
          author:
            typeof comment.author === 'string' ? comment.author : '[unknown]',
          subreddit:
            typeof comment.subreddit === 'string'
              ? comment.subreddit
              : 'unknown',
          url: typeof comment.url === 'string' ? comment.url : '',
          upvotes: typeof comment.upvotes === 'number' ? comment.upvotes : 0,
          createdAt: safeCreatedAt,
          parentId:
            typeof comment.parentId === 'string' ? comment.parentId : undefined,
          sourceType: 'comment' as const,
        };
      })
      .filter((comment) => comment.id.length > 0);

    const metadata = response.metadata;
    const searchTimestamp =
      metadata.searchTimestamp instanceof Date
        ? metadata.searchTimestamp
        : new Date(metadata.searchTimestamp);
    const normalizedTimestamp = Number.isNaN(searchTimestamp.getTime())
      ? new Date()
      : searchTimestamp;

    const collectedSorts = Array.isArray(metadata.collectedSorts)
      ? metadata.collectedSorts.filter((value): value is KeywordSearchSort =>
          this.isValidSort(value),
        )
      : [];

    const normalizedMetadata: KeywordSearchResponse['metadata'] = {
      ...metadata,
      searchOptions: { ...(metadata.searchOptions ?? {}) },
      searchTimestamp: normalizedTimestamp,
      totalPosts: posts.length,
      totalComments: comments.length,
      totalItems: posts.length + comments.length,
      collectedSorts,
    };

    const performance: KeywordSearchResponse['performance'] = {
      searchDuration:
        typeof response.performance.searchDuration === 'number'
          ? response.performance.searchDuration
          : 0,
      apiCallsUsed:
        typeof response.performance.apiCallsUsed === 'number'
          ? response.performance.apiCallsUsed
          : 0,
      rateLimitStatus: this.cloneRateLimitStatus(
        response.performance.rateLimitStatus,
      ),
    };

    const attribution = response.attribution ?? {
      postUrls: [],
      commentUrls: [],
    };
    const normalizedPostUrls = Array.isArray(attribution.postUrls)
      ? attribution.postUrls.filter(
          (url): url is string => typeof url === 'string',
        )
      : [];
    const normalizedCommentUrls = Array.isArray(attribution.commentUrls)
      ? attribution.commentUrls.filter(
          (url): url is string => typeof url === 'string',
        )
      : [];

    return {
      posts,
      comments,
      metadata: normalizedMetadata,
      performance,
      attribution: {
        postUrls: normalizedPostUrls,
        commentUrls: normalizedCommentUrls,
      },
    };
  }

  private cloneRateLimitStatus(
    status: RateLimitResponse | null | undefined,
  ): RateLimitResponse {
    if (status) {
      const resetTime =
        status.resetTime instanceof Date
          ? status.resetTime
          : new Date(status.resetTime);

      return {
        allowed: Boolean(status.allowed),
        retryAfter:
          typeof status.retryAfter === 'number' ? status.retryAfter : undefined,
        currentUsage:
          typeof status.currentUsage === 'number' ? status.currentUsage : 0,
        limit: typeof status.limit === 'number' ? status.limit : 0,
        resetTime: Number.isNaN(resetTime.getTime()) ? new Date() : resetTime,
      };
    }

    return {
      allowed: false,
      currentUsage: 0,
      limit: 0,
      resetTime: new Date(),
    };
  }

  private finalizeAggregatedResults(
    aggregate: Map<string, AggregatedKeywordEntity>,
    defaultSorts: KeywordSearchSort[] = ['relevance'],
  ): {
    results: Record<string, KeywordSearchResponse>;
    totalPosts: number;
    totalComments: number;
  } {
    const aggregatedResults: Record<string, KeywordSearchResponse> = {};
    let totalPosts = 0;
    let totalComments = 0;

    for (const [entityName, accumulator] of aggregate.entries()) {
      const posts = Array.from(accumulator.posts.values()).map(
        (entry) => entry.data,
      );
      const comments = Array.from(accumulator.comments.values()).map(
        (entry) => entry.data,
      );
      const collectedSorts = Array.from(accumulator.collectedSorts);
      const primarySort = collectedSorts[0] ?? defaultSorts[0] ?? 'relevance';

      totalPosts += posts.length;
      totalComments += comments.length;

      const metadata: KeywordSearchResponse['metadata'] = {
        ...accumulator.baseMetadata,
        searchOptions: {
          ...(accumulator.baseMetadata.searchOptions ?? {}),
          sort: primarySort,
        },
        totalPosts: posts.length,
        totalComments: comments.length,
        totalItems: posts.length + comments.length,
        collectedSorts,
      };

      const rateLimitStatus: RateLimitResponse = this.cloneRateLimitStatus(
        accumulator.lastRateLimitStatus,
      );
      const performance: KeywordSearchResponse['performance'] = {
        searchDuration: accumulator.totalSearchDuration,
        apiCallsUsed: accumulator.totalApiCalls,
        rateLimitStatus,
      };

      const attribution = {
        postUrls: Array.from(accumulator.postUrls),
        commentUrls: Array.from(accumulator.commentUrls),
      };

      aggregatedResults[entityName] = {
        posts,
        comments,
        metadata,
        performance,
        attribution,
      };
    }

    return {
      results: aggregatedResults,
      totalPosts,
      totalComments,
    };
  }

  private resolveKeywordSearchSorts(): KeywordSearchSort[] {
    const raw = this.configService.get<string>('KEYWORD_SEARCH_SORTS');
    const defaultSorts: KeywordSearchSort[] = ['relevance', 'top', 'new'];

    if (!raw) {
      return defaultSorts;
    }

    const allowed: KeywordSearchSort[] = [
      'relevance',
      'new',
      'hot',
      'top',
      'comments',
    ];
    const parsed = raw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value): value is KeywordSearchSort =>
        (allowed as string[]).includes(value),
      );

    const unique = Array.from(new Set(parsed));

    return unique.length > 0 ? unique : defaultSorts;
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
    const enqueuePromises: Array<Promise<Job<BatchJob>>> = [];
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
        const adapter = this.unifiedProcessing;
        if (!adapter) {
          this.logger.warn('Unified processing adapter not configured', {
            correlationId,
            entityName,
            subreddit: searchResult.metadata.subreddit,
          });

          results.processingResults[entityName] = {
            success: false,
            error: 'Unified processing adapter not configured',
            processingTime: 0,
            entitiesProcessed: 0,
            connectionsCreated: 0,
          };

          continue;
        }

        const processingResult: ProcessingResult =
          await adapter.processUnifiedBatch(processingData);

        results.processingResults[entityName] = {
          success: true,
          entitiesProcessed:
            processingResult.entityResolution?.entitiesProcessed || 0,
          connectionsCreated:
            processingResult.databaseOperations?.connectionsCreated || 0,
          processingTime: processingResult.processingTimeMs,
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
  ): UnifiedProcessingPayload {
    // Convert Reddit posts and comments to format expected by unified processing service
    // This matches the format used by other data collection services
    const posts = searchResult.posts.map((post) => ({
      id: post.id,
      title: post.title,
      selftext: post.content ?? '',
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
      parent_id: comment.parentId ?? undefined,
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
      const dueSchedules = this.keywordScheduler.checkDueSearches();

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
  getKeywordSearchMetrics(): KeywordSearchMetrics {
    try {
      const schedules = this.keywordScheduler.getAllSchedules();

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
        schedulesBySubreddit: schedules.reduce((acc, s) => {
          acc[s.subreddit] = {
            status: s.status,
            nextRun: s.nextRun,
            lastRun: s.lastRun,
            entityCount: s.entities.length,
          };
          return acc;
        }, {} as Record<string, any>),
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

  private async captureQueueMetrics<T>(
    queue: Queue<T>,
    name: string,
  ): Promise<void> {
    const counts: JobCounts = await queue.getJobCounts();
    this.keywordSearchMetrics.recordQueueSnapshot(name, counts);
  }

  private keywordSchedulerConfigEnabled(): boolean {
    return this.keywordScheduler.isEnabled() && this.backgroundJobsEnabled();
  }

  private backgroundJobsEnabled(): boolean {
    const raw =
      this.configService.get<string>('TEST_COLLECTION_JOBS_ENABLED') ??
      process.env.TEST_COLLECTION_JOBS_ENABLED;
    if (typeof raw !== 'string') {
      return true;
    }
    return raw.toLowerCase() === 'true';
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

  private resolveKeywordSearchLimit(): number {
    const raw = this.configService.get<string>('KEYWORD_SEARCH_LIMIT');
    const parsed = raw ? Number(raw) : Number.NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 1000;
    }
    return Math.min(Math.floor(parsed), 1000);
  }

  getConfiguredSorts(): KeywordSearchSort[] {
    if (this.keywordSearchSorts.length > 0) {
      return [...this.keywordSearchSorts];
    }
    return ['relevance'];
  }

  async getQueueDepth(): Promise<KeywordQueueDepth> {
    const [execution, processing] = await Promise.all([
      this.keywordSearchQueue.getJobCounts(),
      this.keywordQueue.getJobCounts(),
    ]);
    return { execution, processing };
  }
}

interface UnifiedProcessingAdapter {
  processUnifiedBatch(
    payload: UnifiedProcessingPayload,
  ): Promise<ProcessingResult>;
}

interface UnifiedProcessingPayload {
  source: 'keyword_search';
  subreddit: string;
  searchEntity: string;
  timestamp: Date;
  posts: Array<{
    id: string;
    title: string;
    selftext: string;
    author: string;
    created_utc: number;
    ups: number;
    num_comments: number;
    subreddit: string;
    permalink: string;
    url: string;
  }>;
  comments: Array<{
    id: string;
    body: string;
    author: string;
    created_utc: number;
    ups: number;
    parent_id?: string;
    permalink: string;
  }>;
  metadata: {
    searchQuery: string;
    totalItems: number;
    searchOptions: KeywordSearchResponse['metadata']['searchOptions'];
  };
}

interface AggregatedKeywordEntity {
  baseMetadata: KeywordSearchResponse['metadata'];
  posts: Map<string, { data: RedditPost; sorts: Set<KeywordSearchSort> }>;
  comments: Map<string, { data: RedditComment; sorts: Set<KeywordSearchSort> }>;
  collectedSorts: Set<KeywordSearchSort>;
  postUrls: Set<string>;
  commentUrls: Set<string>;
  totalSearchDuration: number;
  totalApiCalls: number;
  lastRateLimitStatus: RateLimitResponse;
}

interface SortSummary {
  sort: KeywordSearchSort;
  timeFilter?: KeywordSearchSortPlan['timeFilter'];
  fallbackUsed?: boolean;
  totalPosts: number;
  totalComments: number;
  successfulSearches: number;
  failedSearches: number;
  apiCalls: number;
  durationMs: number;
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
    totalPosts: number;
    totalComments: number;
    totalItems: number;
    sortsAttempted: KeywordSearchSort[];
    sortSummaries: SortSummary[];
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
