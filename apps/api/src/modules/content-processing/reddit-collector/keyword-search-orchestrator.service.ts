import { Injectable, Inject } from '@nestjs/common';
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
import { EntityType, KeywordAttemptOutcome } from '@prisma/client';
import { KeywordSearchSchedulerService } from './keyword-search-scheduler.service';
import { BatchJob } from './batch-processing-queue.types';
import { ConfigService } from '@nestjs/config';
import { KeywordSearchMetricsService } from './keyword-search-metrics.service';
import { normalizeKeywordTerm } from './keyword-term-normalization';
import { stripGenericTokens } from '../../../shared/utils/generic-token-handling';
import { KeywordAttemptHistoryService } from './keyword-attempt-history.service';

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

export interface KeywordSearchTerm {
  term: string;
  normalizedTerm?: string;
  slice?: string;
  score?: number;
  entityType?: EntityType;
  origin?: Record<string, unknown>;
}

/**
 * Keyword Search Orchestrator Service
 *
 * Implements PRD Section 5.1.2 keyword entity search cycles orchestration.
 * Coordinates entity selection, Reddit API searches, and processing pipeline integration.
 */
@Injectable()
export class KeywordSearchOrchestratorService {
  private readonly keywordSearchLimit: number;
  private readonly keywordSearchSorts: KeywordSearchSort[];
  constructor(
    private readonly redditService: RedditService,
    private readonly keywordScheduler: KeywordSearchSchedulerService,
    @Inject(LoggerService) private readonly logger: LoggerService,
    private readonly configService: ConfigService,
    private readonly keywordAttemptHistory: KeywordAttemptHistoryService,
    @InjectQueue('keyword-batch-processing-queue')
    private readonly keywordQueue: Queue<BatchJob>,
    @InjectQueue('keyword-search-execution')
    private readonly keywordSearchQueue: Queue<KeywordSearchJobData>,
    private readonly keywordSearchMetrics: KeywordSearchMetricsService,
  ) {
    this.keywordSearchLimit = this.resolveKeywordSearchLimit();
    this.keywordSearchSorts = this.resolveKeywordSearchSorts();
  }

  // Planning lives in CollectionSchedulerService (collection_schedules rows
  // drive cadence) — this orchestrator only executes/enqueues keyword work.

  /**
   * Execute keyword entity search for specific subreddit
   * Implements PRD 5.1.2 complete keyword search cycle
   *
   * @param subreddit - Target subreddit for searches
   * @param terms - Keyword terms to search for
   * @returns Promise<KeywordSearchExecutionResult> - Execution results with processing metrics
   */
  async executeKeywordSearchCycle(
    subreddit: string,
    terms: KeywordSearchTerm[],
    options: {
      sortPlan?: KeywordSearchSortPlan[];
      source?: KeywordSearchJobData['source'] | 'manual';
      collectableMarketKey?: string;
      safeIntervalDays?: number;
    } = {},
  ): Promise<KeywordSearchExecutionResult> {
    const existingCorrelationId = CorrelationUtils.getCorrelationId();
    const cycleId =
      existingCorrelationId ?? CorrelationUtils.generateCorrelationId();

    const runCycle = async (): Promise<KeywordSearchExecutionResult> => {
      const startTime = Date.now();
      const source = options.source ?? 'manual';
      const dryRun = this.keywordCollectionDryRunEnabled();
      const collectableMarketKey =
        options.collectableMarketKey ?? subreddit.trim().toLowerCase();
      const safeIntervalDays =
        typeof options.safeIntervalDays === 'number' &&
        Number.isFinite(options.safeIntervalDays) &&
        options.safeIntervalDays > 0
          ? options.safeIntervalDays
          : 7;
      const selection = this.dedupeTermsForKeywordSearch(terms);
      const selectedTerms = selection.selectedTerms;
      const termNames = selectedTerms.map((term) => term.term);

      this.logger.info('Starting keyword search cycle execution', {
        cycleId,
        correlationId: cycleId,
        operation: 'execute_keyword_search_cycle',
        subreddit,
        source,
        dryRun,
        collectableMarketKey,
        safeIntervalDays,
        requestedTermCount: terms.length,
        selectedTermCount: termNames.length,
        dedupedCount: selection.dedupedCount,
        skippedInvalidCount: selection.skippedInvalidCount,
        topTerms: selectedTerms.slice(0, 5).map((entry) => ({
          term: entry.term,
          normalizedTerm: entry.normalizedTerm,
          slice: entry.input.slice ?? null,
          score: entry.input.score ?? null,
          entityType: entry.input.entityType ?? null,
        })),
      });

      const results: KeywordSearchExecutionResult = {
        subreddit,
        terms: selectedTerms.map((entry) => ({
          ...entry.input,
          term: entry.term,
          normalizedTerm: entry.normalizedTerm,
        })),
        searchResults: {},
        processingResults: {},
        metadata: {
          totalTerms: termNames.length,
          successfulSearches: 0,
          failedSearches: 0,
          processedTerms: 0,
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
          averageTermProcessingTime: 0,
        },
      };

      try {
        const configuredSorts =
          this.keywordSearchSorts.length > 0
            ? this.keywordSearchSorts
            : (['relevance'] as KeywordSearchSort[]);
        const sortPlanEntries: KeywordSearchSortPlan[] =
          options.sortPlan && options.sortPlan.length
            ? options.sortPlan
            : configuredSorts.map((sort) => ({ sort }));
        const sortsToExecute = sortPlanEntries.map((entry) => entry.sort);
        results.metadata.sortsAttempted = sortsToExecute;

        if (dryRun) {
          const totalDuration = Date.now() - startTime;
          results.performance.totalDuration = totalDuration;
          results.metadata.executionEndTime = new Date();

          this.logger.info('keyword_cycle_summary', {
            event: 'keyword_cycle_summary',
            cycleId,
            source,
            subreddit,
            startedAt: results.metadata.executionStartTime,
            finishedAt: results.metadata.executionEndTime,
            durationMs: totalDuration,
            dryRun,
            selection: {
              requestedTerms: terms.length,
              selectedTerms: termNames.length,
              dedupedTerms: selection.dedupedCount,
              skippedInvalid: selection.skippedInvalidCount,
              dedupeSample: selection.duplicatesSample,
            },
            execution: {
              redditApiCalls: 0,
              sortsAttemptedTotal: sortsToExecute.length,
              sortsAttempted: sortsToExecute,
            },
            results: {
              postsFound: 0,
              commentsFound: 0,
              connectionsCreated: 0,
              entitiesCreatedOrEnriched: 0,
            },
            failures: {
              termsErrored: 0,
              termsNoResults: 0,
              errorKindsTop: [],
            },
          });

          selectedTerms.forEach((entry, index) => {
            this.logger.info('keyword_term_summary', {
              event: 'keyword_term_summary',
              cycleId,
              source,
              subreddit,
              term: entry.term,
              normalizedTerm: entry.normalizedTerm,
              slice: entry.input.slice ?? undefined,
              origin: {
                entityType: entry.input.entityType ?? null,
                ...(entry.input.origin ?? {}),
              },
              scores: { selectionScore: entry.input.score ?? null },
              rankOverall: index + 1,
              execution: { sortsAttempted: sortsToExecute, apiCalls: 0 },
              results: { posts: 0, comments: 0, connectionsCreated: 0 },
              outcome: 'skipped',
              reason: 'dry_run',
            });
          });

          return results;
        }

        this.logger.debug('Executing batch keyword searches', {
          cycleId,
          correlationId: cycleId,
          subreddit,
          source,
          terms: termNames.slice(0, 10),
          totalCount: termNames.length,
          sorts: sortsToExecute,
        });

        const aggregateResults = new Map<string, AggregatedKeywordEntity>();
        const sortSummaries: SortSummary[] = [];
        const termErrors = new Map<string, string[]>();
        let cumulativeSuccessfulSearches = 0;
        let cumulativeFailedSearches = 0;
        let cumulativeApiCalls = 0;

        const searchStartTime = Date.now();

        for (const planEntry of sortPlanEntries) {
          const {
            sort,
            timeFilter,
            fallbackTimeFilter,
            minResultsForFallback,
          } = planEntry;
          const resolvedTimeFilter = this.normalizeTimeFilter(timeFilter);
          const resolvedFallbackTimeFilter =
            this.normalizeTimeFilter(fallbackTimeFilter);
          const batchSearchResult =
            await this.redditService.batchEntityKeywordSearch(
              subreddit,
              termNames,
              {
                sort,
                timeFilter: resolvedTimeFilter,
                limit: this.keywordSearchLimit,
                batchDelay: 1200,
              },
            );

          Object.entries(batchSearchResult.errors).forEach(
            ([entityName, message]) => {
              const existing = termErrors.get(entityName);
              if (existing) {
                existing.push(message);
              } else {
                termErrors.set(entityName, [message]);
              }
            },
          );

          cumulativeSuccessfulSearches +=
            batchSearchResult.metadata.successfulSearches;
          cumulativeFailedSearches += batchSearchResult.metadata.failedSearches;
          cumulativeApiCalls += batchSearchResult.performance.totalApiCalls;

          sortSummaries.push({
            sort,
            timeFilter: resolvedTimeFilter,
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
            resolvedFallbackTimeFilter &&
            typeof minResultsForFallback === 'number' &&
            totalItems < minResultsForFallback
          ) {
            const fallbackResult =
              await this.redditService.batchEntityKeywordSearch(
                subreddit,
                termNames,
                {
                  sort,
                  timeFilter: resolvedFallbackTimeFilter,
                  limit: this.keywordSearchLimit,
                  batchDelay: 1200,
                },
              );

            Object.entries(fallbackResult.errors).forEach(
              ([entityName, message]) => {
                const existing = termErrors.get(entityName);
                if (existing) {
                  existing.push(message);
                } else {
                  termErrors.set(entityName, [message]);
                }
              },
            );

            cumulativeSuccessfulSearches +=
              fallbackResult.metadata.successfulSearches;
            cumulativeFailedSearches += fallbackResult.metadata.failedSearches;
            cumulativeApiCalls += fallbackResult.performance.totalApiCalls;

            sortSummaries.push({
              sort,
              timeFilter: resolvedFallbackTimeFilter,
              fallbackUsed: true,
              totalPosts: fallbackResult.metadata.totalPosts,
              totalComments: fallbackResult.metadata.totalComments,
              successfulSearches: fallbackResult.metadata.successfulSearches,
              failedSearches: fallbackResult.metadata.failedSearches,
              apiCalls: fallbackResult.performance.totalApiCalls,
              durationMs: fallbackResult.performance.batchDuration,
            });

            this.mergeBatchKeywordResults(
              aggregateResults,
              fallbackResult,
              sort,
            );
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
        results.metadata.sortSummaries = sortSummaries;
        results.metadata.totalPosts = totalPosts;
        results.metadata.totalComments = totalComments;
        results.metadata.totalItems = totalPosts + totalComments;
        results.searchResults = aggregatedResults;

        this.logger.info('Batch keyword searches completed', {
          cycleId,
          correlationId: cycleId,
          subreddit,
          source,
          sorts: sortsToExecute,
          searchDuration,
          successfulSearches: cumulativeSuccessfulSearches,
          failedSearches: cumulativeFailedSearches,
          uniquePosts: totalPosts,
          uniqueComments: totalComments,
          apiCalls: cumulativeApiCalls,
        });

        await this.enqueueKeywordBatches(
          subreddit,
          results.searchResults,
          cycleId,
        );

        const totalDuration = Date.now() - startTime;
        results.performance.totalDuration = totalDuration;
        results.performance.averageTermProcessingTime =
          results.metadata.processedTerms > 0
            ? results.performance.processingDuration /
              results.metadata.processedTerms
            : 0;
        results.metadata.executionEndTime = new Date();

        let termsNoResults = 0;
        let termsErrored = 0;

        for (const [index, entry] of selectedTerms.entries()) {
          const termResult = results.searchResults[entry.term];
          const termErrorMessages = termErrors.get(entry.term) ?? [];
          const posts = termResult?.posts.length ?? 0;
          const comments = termResult?.comments.length ?? 0;
          const hasResults = posts + comments > 0;

          const outcome = (() => {
            if (termResult) {
              return hasResults ? 'success' : 'no_results';
            }
            if (termErrorMessages.length > 0) {
              return 'error';
            }
            return 'skipped';
          })();

          if (outcome === 'no_results') {
            termsNoResults += 1;
          }
          if (outcome === 'error') {
            termsErrored += 1;
          }

          this.logger.info('keyword_term_summary', {
            event: 'keyword_term_summary',
            cycleId,
            source,
            subreddit,
            term: entry.term,
            normalizedTerm: entry.normalizedTerm,
            slice: entry.input.slice ?? undefined,
            origin: {
              entityType: entry.input.entityType ?? null,
              ...(entry.input.origin ?? {}),
            },
            scores: { selectionScore: entry.input.score ?? null },
            rankOverall: index + 1,
            execution: {
              sortsAttempted:
                termResult?.metadata.collectedSorts ?? sortsToExecute,
              apiCalls: termResult?.performance.apiCallsUsed ?? 0,
            },
            results: { posts, comments, connectionsCreated: 0 },
            outcome,
            errorMessages:
              termErrorMessages.length > 0
                ? termErrorMessages.slice(0, 3)
                : undefined,
          });

          const attemptOutcome: KeywordAttemptOutcome =
            outcome === 'success'
              ? 'success'
              : outcome === 'no_results'
                ? 'no_results'
                : outcome === 'error'
                  ? 'error'
                  : 'deferred';

          await this.keywordAttemptHistory.recordAttempt({
            collectableMarketKey,
            normalizedTerm: entry.normalizedTerm,
            outcome: attemptOutcome,
            safeIntervalDays,
          });
        }

        this.logger.info('keyword_cycle_summary', {
          event: 'keyword_cycle_summary',
          cycleId,
          source,
          subreddit,
          startedAt: results.metadata.executionStartTime,
          finishedAt: results.metadata.executionEndTime,
          durationMs: totalDuration,
          dryRun: false,
          selection: {
            requestedTerms: terms.length,
            selectedTerms: termNames.length,
            dedupedTerms: selection.dedupedCount,
            skippedInvalid: selection.skippedInvalidCount,
            dedupeSample: selection.duplicatesSample,
          },
          execution: {
            redditApiCalls: cumulativeApiCalls,
            sortsAttemptedTotal: sortSummaries.length,
            sortsAttempted: sortsToExecute,
          },
          results: {
            postsFound: totalPosts,
            commentsFound: totalComments,
            connectionsCreated: 0,
            entitiesCreatedOrEnriched: 0,
          },
          failures: {
            termsErrored,
            termsNoResults,
            errorKindsTop: [],
          },
        });

        this.logger.info('Keyword search cycle execution completed', {
          cycleId,
          correlationId: cycleId,
          subreddit,
          source,
          totalDuration,
          searchDuration,
          processingDuration: results.performance.processingDuration,
          termsProcessed: results.metadata.processedTerms,
          successRate:
            results.metadata.totalTerms > 0
              ? (results.metadata.processedTerms /
                  results.metadata.totalTerms) *
                100
              : 0,
        });

        return results;
      } catch (error: unknown) {
        const totalDuration = Date.now() - startTime;
        results.performance.totalDuration = totalDuration;
        results.metadata.executionEndTime = new Date();

        this.logger.info('keyword_cycle_summary', {
          event: 'keyword_cycle_summary',
          cycleId,
          source,
          subreddit,
          startedAt: results.metadata.executionStartTime,
          finishedAt: results.metadata.executionEndTime,
          durationMs: totalDuration,
          dryRun,
          selection: {
            requestedTerms: terms.length,
            selectedTerms: termNames.length,
            dedupedTerms: selection.dedupedCount,
            skippedInvalid: selection.skippedInvalidCount,
            dedupeSample: selection.duplicatesSample,
          },
          execution: {
            redditApiCalls: results.performance.totalApiCalls,
            sortsAttemptedTotal: results.metadata.sortsAttempted.length,
            sortsAttempted: results.metadata.sortsAttempted,
          },
          results: {
            postsFound: results.metadata.totalPosts,
            commentsFound: results.metadata.totalComments,
            connectionsCreated: 0,
            entitiesCreatedOrEnriched: 0,
          },
          failures: {
            termsErrored: 0,
            termsNoResults: 0,
            errorKindsTop: [
              error instanceof Error ? error.name : 'UnknownError',
            ],
          },
          error:
            error instanceof Error
              ? { message: error.message, name: error.name, stack: error.stack }
              : { message: String(error) },
        });

        this.logger.error('Keyword search cycle execution failed', {
          cycleId,
          correlationId: cycleId,
          subreddit,
          source,
          totalDuration,
          error:
            error instanceof Error
              ? { message: error.message, name: error.name, stack: error.stack }
              : { message: String(error) },
          termCount: terms.length,
        });

        throw error;
      }
    };

    if (existingCorrelationId) {
      return runCycle();
    }

    return CorrelationUtils.runWithContext(
      { correlationId: cycleId, startTime: Date.now() },
      runCycle,
    );
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

  private normalizeTimeFilter(
    value: unknown,
  ): KeywordSearchSortPlan['timeFilter'] | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim().toLowerCase();
    const allowed: KeywordSearchSortPlan['timeFilter'][] = [
      'hour',
      'day',
      'week',
      'month',
      'year',
      'all',
    ];

    return allowed.includes(normalized as KeywordSearchSortPlan['timeFilter'])
      ? (normalized as KeywordSearchSortPlan['timeFilter'])
      : undefined;
  }

  private keywordCollectionDryRunEnabled(): boolean {
    const raw =
      this.configService.get<string>('KEYWORD_COLLECTION_DRY_RUN') ??
      process.env.KEYWORD_COLLECTION_DRY_RUN;

    if (typeof raw !== 'string') {
      return false;
    }

    return raw.trim().toLowerCase() === 'true';
  }

  private dedupeTermsForKeywordSearch(terms: KeywordSearchTerm[]): {
    selectedTerms: Array<{
      term: string;
      normalizedTerm: string;
      input: KeywordSearchTerm;
    }>;
    dedupedCount: number;
    skippedInvalidCount: number;
    duplicatesSample: Array<{
      normalizedTerm: string;
      keptTerm: string;
      keptSlice: string | null;
      droppedTerm: string;
      droppedSlice: string | null;
    }>;
  } {
    const selectedTerms: Array<{
      term: string;
      normalizedTerm: string;
      input: KeywordSearchTerm;
    }> = [];
    const seen = new Map<
      string,
      { term: string; normalizedTerm: string; input: KeywordSearchTerm }
    >();

    let dedupedCount = 0;
    let skippedInvalidCount = 0;
    const duplicatesSample: Array<{
      normalizedTerm: string;
      keptTerm: string;
      keptSlice: string | null;
      droppedTerm: string;
      droppedSlice: string | null;
    }> = [];

    for (const input of terms) {
      const stripped = stripGenericTokens(input.term);
      const term = stripped.text;
      const normalizedTerm = normalizeKeywordTerm(term);
      if (!normalizedTerm || stripped.isGenericOnly) {
        skippedInvalidCount += 1;
        continue;
      }

      const existing = seen.get(normalizedTerm);
      if (existing) {
        dedupedCount += 1;
        if (duplicatesSample.length < 10) {
          duplicatesSample.push({
            normalizedTerm,
            keptTerm: existing.term,
            keptSlice: existing.input.slice ?? null,
            droppedTerm: term,
            droppedSlice: input.slice ?? null,
          });
        }
        continue;
      }

      const entry = { term, normalizedTerm, input };
      selectedTerms.push(entry);
      seen.set(normalizedTerm, entry);
    }

    return {
      selectedTerms,
      dedupedCount,
      skippedInvalidCount,
      duplicatesSample,
    };
  }

  /**
   * Enqueue keyword search post IDs in batches for async processing.
   */
  private async enqueueKeywordBatches(
    subreddit: string,
    searchResults: Record<string, KeywordSearchResponse>,
    cycleId: string,
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
      cycleId,
      correlationId: cycleId,
      subreddit,
      totalPosts: postIds.length,
      batches: batches.length,
    });

    const jobGroupId = `${subreddit}-keyword-${cycleId}-${Date.now()}`;
    const enqueuePromises: Array<Promise<Job<BatchJob>>> = [];
    batches.forEach((ids, idx) => {
      const job: BatchJob = {
        batchId: `${jobGroupId}-${idx + 1}`,
        parentJobId: jobGroupId,
        cycleId,
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

  /** PROVIDER for the consolidated CollectionScheduler: score + enqueue
   *  hot-spike on-demand jobs. Returns the number enqueued. */
  async enqueueHotSpikeJobs(): Promise<number> {
    const candidates = await this.keywordScheduler.findHotSpikeCandidates();
    for (const candidate of candidates) {
      const jobId =
        `hot_spike-${candidate.collectableMarketKey}:${candidate.normalizedTerm}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 180);
      await this.enqueueKeywordSearchJob({
        jobId,
        cycleId: CorrelationUtils.generateCorrelationId(),
        subreddit: candidate.subreddit,
        collectableMarketKey: candidate.collectableMarketKey,
        safeIntervalDays: candidate.safeIntervalDays,
        sortPlan: candidate.sortPlan,
        terms: [
          {
            term: candidate.term,
            normalizedTerm: candidate.normalizedTerm,
            slice: 'hot_spike',
            score: candidate.priorityScore,
            origin: {
              trigger: candidate.trigger,
              distinctUsersLast24h: candidate.distinctUsersLast24h,
              distinctUsersPrev24h: candidate.distinctUsersPrev24h,
              trendBoost: candidate.trendBoost,
              attemptAvailability: candidate.attemptAvailability,
              lastSeenAt: candidate.lastSeenAt.toISOString(),
            },
          },
        ],
        source: 'hot_spike',
      });
    }
    return candidates.length;
  }

  async enqueueKeywordSearchJob(data: KeywordSearchJobData): Promise<void> {
    const cycleId = data.cycleId ?? CorrelationUtils.generateCorrelationId();
    const payload: KeywordSearchJobData = { ...data, cycleId };

    await this.keywordSearchQueue.add('run-keyword-search', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: true,
      // Failed jobs must not squat on stable jobIds (hot-spike slugs are
      // deterministic) — Bull silently no-ops an add() whose jobId is still
      // in the failed set, permanently blocking that market::term. The
      // worker's error log is the durable failure signal.
      removeOnFail: true,
      jobId: data.jobId || `${data.source}-${data.subreddit}-${cycleId}`,
    });

    this.logger.debug('Queued keyword search job', {
      cycleId,
      correlationId: cycleId,
      subreddit: data.subreddit,
      collectableMarketKey: data.collectableMarketKey ?? null,
      source: data.source,
      termCount: data.terms.length,
      sortsPlanned: data.sortPlan?.map((entry) => entry.sort) ?? undefined,
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
  terms: KeywordSearchTerm[];
  searchResults: Record<string, KeywordSearchResponse>;
  processingResults: Record<string, TermProcessingResult>;
  metadata: {
    totalTerms: number;
    successfulSearches: number;
    failedSearches: number;
    processedTerms: number;
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
    averageTermProcessingTime: number;
  };
}

/**
 * Entity Processing Result
 */
export interface TermProcessingResult {
  success: boolean;
  error?: string;
  processingTime: number;
  entitiesProcessed: number;
  connectionsCreated: number;
}

export interface KeywordSearchJobData {
  jobId?: string;
  cycleId?: string;
  subreddit: string;
  collectableMarketKey?: string;
  safeIntervalDays?: number;
  sortPlan?: KeywordSearchSortPlan[];
  terms: KeywordSearchTerm[];
  source: 'scheduled' | 'hot_spike';
}

export interface KeywordQueueDepth {
  execution: JobCounts;
  processing: JobCounts;
}
