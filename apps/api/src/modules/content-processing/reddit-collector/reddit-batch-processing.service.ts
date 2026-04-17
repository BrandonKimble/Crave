import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../shared';
import { RedditService } from '../../external-integrations/reddit/reddit.service';
import { filterAndTransformToLLM } from '../../external-integrations/reddit/reddit-data-filter';
import { PrismaService } from '../../../prisma/prisma.service';
import { RankScoreRefreshQueueService } from '../rank-score/rank-score-refresh.service';
import {
  BatchJob,
  BatchProcessingResult,
} from './batch-processing-queue.types';
import { LLMPost } from '../../external-integrations/llm/llm.types';
import { MarketRegistryService } from '../../markets/market-registry.service';
import { ExtractionPipelineService } from './extraction-pipeline.service';

const DEFAULT_MARKET_KEY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MARKET_KEY_CACHE_MAX_ENTRIES = 512;

@Injectable()
export class RedditBatchProcessingService implements OnModuleInit {
  private logger!: LoggerService;
  private readonly marketKeyCache = new Map<
    string,
    { value: string; expiresAt: number }
  >();
  private readonly marketKeyCacheTtlMs: number;
  private readonly marketKeyCacheMaxEntries: number;
  private keywordGateConfig!: {
    lookbackMs: number;
    commentSampleLimit: number;
    minNewComments: number;
    pipelineScope: string[];
  };

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    @Inject(RedditService) private readonly redditService: RedditService,
    private readonly configService: ConfigService,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    private readonly marketRegistry: MarketRegistryService,
    private readonly rankScoreRefreshQueue: RankScoreRefreshQueueService,
    private readonly extractionPipelineService: ExtractionPipelineService,
  ) {
    this.marketKeyCacheTtlMs =
      this.parsePositiveInt(process.env.REDDIT_BATCH_COVERAGE_CACHE_TTL_MS) ??
      DEFAULT_MARKET_KEY_CACHE_TTL_MS;
    this.marketKeyCacheMaxEntries =
      this.parsePositiveInt(
        process.env.REDDIT_BATCH_COVERAGE_CACHE_MAX_ENTRIES,
      ) ?? DEFAULT_MARKET_KEY_CACHE_MAX_ENTRIES;
  }

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('RedditBatchProcessingService');
    this.keywordGateConfig = this.buildKeywordGateConfig();
    this.logger.debug('Loaded keyword gate configuration', {
      lookbackMs: this.keywordGateConfig.lookbackMs,
      commentSampleLimit: this.keywordGateConfig.commentSampleLimit,
      minNewComments: this.keywordGateConfig.minNewComments,
      pipelineScope: this.keywordGateConfig.pipelineScope,
      marketKeyCacheTtlMs: this.marketKeyCacheTtlMs,
      marketKeyCacheMaxEntries: this.marketKeyCacheMaxEntries,
    });
  }

  async processBatch(
    job: BatchJob,
    correlationId: string,
  ): Promise<BatchProcessingResult> {
    const startTime = Date.now();
    this.logStage(
      'info',
      'batch',
      'Batch processing started',
      job,
      correlationId,
      {
        candidatePosts: job.postIds?.length ?? job.llmPosts?.length ?? 0,
      },
    );

    try {
      const gatingStart = Date.now();
      const {
        posts: llmPosts,
        skippedDueToFreshness,
        skippedDueToDeltaThreshold,
        totalCandidates,
      } = await this.resolveLlmPosts(job, correlationId);
      const gatingDuration = Date.now() - gatingStart;
      this.logStage(
        'info',
        'gate',
        'Post gating completed',
        job,
        correlationId,
        {
          durationMs: gatingDuration,
          candidates: totalCandidates,
          processedPosts: llmPosts.length,
          skippedDueToFreshness,
          skippedDueToDeltaThreshold,
        },
      );

      if (!llmPosts.length) {
        const processingTimeMs = Date.now() - startTime;

        this.logStage(
          'info',
          'batch',
          'Batch skipped after gating',
          job,
          correlationId,
          {
            durationMs: processingTimeMs,
            totalCandidates,
            skippedDueToFreshness,
            skippedDueToDeltaThreshold,
          },
        );

        return {
          batchId: job.batchId,
          parentJobId: job.parentJobId,
          collectionType: job.collectionType,
          success: true,
          metrics: {
            postsProcessed: 0,
            mentionsExtracted: 0,
            entitiesCreated: 0,
            connectionsCreated: 0,
            processingTimeMs,
            llmProcessingTimeMs: 0,
            dbProcessingTimeMs: 0,
          },
          completedAt: new Date(),
          details: {
            warnings: [
              skippedDueToFreshness + skippedDueToDeltaThreshold > 0
                ? `Skipped batch: ${skippedDueToFreshness} fresh posts, ${skippedDueToDeltaThreshold} without enough new comments`
                : 'Skipped batch: no eligible posts after gating',
            ],
            keywordGateSummary: {
              totalCandidates,
              processedPosts: 0,
              skippedDueToFreshness,
              skippedDueToDeltaThreshold,
            },
          },
        };
      }

      const llmPostSampleCount =
        this.parsePositiveInt(process.env.TEST_LLM_POST_SAMPLE_COUNT) ?? 0;
      const commentSampleLimit =
        this.parsePositiveInt(process.env.TEST_LLM_POST_SAMPLE_COMMENT_COUNT) ??
        2;
      const llmPostSample =
        llmPostSampleCount > 0
          ? this.buildLlmPostSample(
              llmPosts,
              llmPostSampleCount,
              commentSampleLimit,
            )
          : null;

      const pipelineResult = await this.extractionPipelineService.processPosts({
        pipeline: job.collectionType,
        platform: 'reddit',
        community: job.subreddit,
        llmPosts,
        batchId: job.batchId,
        parentJobId: job.parentJobId,
        collectionRunScopeKey: `collection:${job.parentJobId ?? job.batchId}`,
        activateDocumentsBeforeProcessing: true,
        runMetadata: {
          subreddit: job.subreddit,
        },
      });

      this.logStage('info', 'chunk', 'Chunking completed', job, correlationId, {
        durationMs: pipelineResult.chunkDurationMs,
        ...pipelineResult.chunkStats,
      });
      this.logStage(
        'info',
        'llm',
        'LLM processing completed',
        job,
        correlationId,
        {
          durationMs: pipelineResult.llmProcessingTimeMs,
          chunksProcessed: pipelineResult.processingMetrics.chunksProcessed,
          successRate: pipelineResult.processingMetrics.successRate,
          failures:
            pipelineResult.processingMetrics.chunksProcessed -
            Math.round(
              (pipelineResult.processingMetrics.chunksProcessed *
                pipelineResult.processingMetrics.successRate) /
                100,
            ),
          averageChunkTime: pipelineResult.processingMetrics.averageChunkTime,
          totalDuration: pipelineResult.processingMetrics.totalDuration,
          mentionsExtracted: pipelineResult.llmOutput.mentions.length,
        },
      );
      this.logStage(
        'info',
        'persist',
        'Persistence completed',
        job,
        correlationId,
        {
          durationMs: pipelineResult.dbProcessingTimeMs,
          entitiesCreated: pipelineResult.dbResult.entitiesCreated,
          connectionsCreated: pipelineResult.dbResult.connectionsCreated,
        },
      );

      const result: BatchProcessingResult = {
        batchId: job.batchId,
        parentJobId: job.parentJobId,
        collectionType: job.collectionType,
        success: true,
        metrics: {
          postsProcessed: llmPosts.length,
          mentionsExtracted: pipelineResult.llmOutput.mentions.length,
          entitiesCreated: pipelineResult.dbResult.entitiesCreated,
          connectionsCreated: pipelineResult.dbResult.connectionsCreated,
          processingTimeMs: Date.now() - startTime,
          llmProcessingTimeMs: pipelineResult.llmProcessingTimeMs,
          dbProcessingTimeMs: pipelineResult.dbProcessingTimeMs,
        },
        completedAt: new Date(),
        details: {
          createdEntityIds: pipelineResult.dbResult.createdEntityIds || [],
          updatedConnectionIds:
            pipelineResult.dbResult.affectedConnectionIds || [],
          createdEntities: pipelineResult.dbResult.createdEntitySummaries || [],
          reusedEntities: pipelineResult.dbResult.reusedEntitySummaries || [],
          ...(llmPostSample ? { llmPostSample } : {}),
          keywordGateSummary: {
            totalCandidates,
            processedPosts: llmPosts.length,
            skippedDueToFreshness,
            skippedDueToDeltaThreshold,
          },
        },
        rawMentionsSample: pipelineResult.rawMentionsSample,
      };
      this.logStage(
        'info',
        'batch',
        'Batch processing completed',
        job,
        correlationId,
        {
          durationMs: Date.now() - startTime,
          postsProcessed: llmPosts.length,
          mentionsExtracted: pipelineResult.llmOutput.mentions.length,
          entitiesCreated: pipelineResult.dbResult.entitiesCreated,
          connectionsCreated: pipelineResult.dbResult.connectionsCreated,
        },
      );
      await this.refreshRankScoresIfFinalBatch(job, correlationId);
      return result;
    } catch (error) {
      this.logStage(
        'error',
        'batch',
        'Batch processing failed',
        job,
        correlationId,
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );

      throw error;
    }
  }

  private async resolveLlmPosts(
    job: BatchJob,
    correlationId: string,
  ): Promise<{
    posts: LLMPost[];
    skippedDueToFreshness: number;
    skippedDueToDeltaThreshold: number;
    totalCandidates: number;
  }> {
    if (!this.keywordGateConfig) {
      this.keywordGateConfig = this.buildKeywordGateConfig();
    }

    if (job.llmPosts?.length) {
      this.logger.debug('Using pre-transformed LLM posts from job payload', {
        correlationId,
        batchId: job.batchId,
        postCount: job.llmPosts.length,
      });
      return {
        posts: job.llmPosts,
        skippedDueToFreshness: 0,
        skippedDueToDeltaThreshold: 0,
        totalCandidates: job.llmPosts.length,
      };
    }

    if (!job.postIds?.length) {
      throw new Error(
        'Batch job missing postIds or llmPosts for processing pipeline',
      );
    }

    const { fetchPostIds, skippedDueToFreshness, skippedDueToDeltaThreshold } =
      await this.determinePostFetchPlan(
        job.subreddit,
        job.postIds,
        correlationId,
      );

    if (!fetchPostIds.length) {
      return {
        posts: [],
        skippedDueToFreshness,
        skippedDueToDeltaThreshold,
        totalCandidates: job.postIds.length,
      };
    }

    this.logger.debug('Retrieving Reddit content for batch', {
      correlationId,
      postCount: fetchPostIds.length,
      depth: job.options?.depth,
      subreddit: job.subreddit,
      skippedDueToFreshness,
      skippedDueToDeltaThreshold,
      totalCandidates: job.postIds.length,
    });

    const llmPosts: LLMPost[] = [];

    for (const postId of fetchPostIds) {
      try {
        const rawResult = await this.redditService.getCompletePostWithComments(
          job.subreddit,
          postId,
          { depth: job.options?.depth },
        );

        const { rawResponse } = rawResult;
        if (!Array.isArray(rawResponse) || rawResponse.length === 0) {
          this.logger.warn(`Skipping post ${postId} - no raw response`, {
            correlationId,
            postId,
            batchId: job.batchId,
          });
          continue;
        }

        const { post, comments } = filterAndTransformToLLM(
          rawResponse,
          rawResult.attribution.postUrl,
        );

        if (!post) {
          this.logger.warn(`Skipping post ${postId} - transformation failed`, {
            correlationId,
            postId,
            batchId: job.batchId,
          });
          continue;
        }

        post.comments = comments;
        llmPosts.push(post);
      } catch (error) {
        this.logger.error(`Failed to retrieve post ${postId}`, {
          correlationId,
          postId,
          batchId: job.batchId,
          subreddit: job.subreddit,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      posts: llmPosts,
      skippedDueToFreshness,
      skippedDueToDeltaThreshold,
      totalCandidates: job.postIds.length,
    };
  }

  private async determinePostFetchPlan(
    subreddit: string,
    postIds: string[],
    correlationId: string,
  ): Promise<{
    fetchPostIds: string[];
    skippedDueToFreshness: number;
    skippedDueToDeltaThreshold: number;
  }> {
    if (!postIds.length) {
      return {
        fetchPostIds: [],
        skippedDueToFreshness: 0,
        skippedDueToDeltaThreshold: 0,
      };
    }

    const { pipelineScope, lookbackMs } = this.keywordGateConfig;
    if (!pipelineScope.length) {
      return {
        fetchPostIds: [...postIds],
        skippedDueToFreshness: 0,
        skippedDueToDeltaThreshold: 0,
      };
    }

    const postSourceIds = postIds.map((postId) =>
      this.buildPostSourceId(postId),
    );

    const existingRecords = await this.prismaService.processedSource.findMany({
      where: {
        pipeline: { in: pipelineScope },
        sourceId: { in: postSourceIds },
      },
      select: {
        sourceId: true,
        processedAt: true,
      },
    });

    const latestProcessedBySource = new Map<string, Date>();
    for (const record of existingRecords) {
      const prev = latestProcessedBySource.get(record.sourceId);
      if (!prev || record.processedAt > prev) {
        latestProcessedBySource.set(record.sourceId, record.processedAt);
      }
    }

    const cutoff = lookbackMs > 0 ? new Date(Date.now() - lookbackMs) : null;

    const fetchPostIds: string[] = [];
    const requiresDeltaCheck: string[] = [];
    let skippedDueToFreshness = 0;

    for (const postId of postIds) {
      const sourceId = this.buildPostSourceId(postId);
      const lastProcessedAt = latestProcessedBySource.get(sourceId);

      if (!lastProcessedAt) {
        fetchPostIds.push(postId);
        continue;
      }

      if (cutoff && lastProcessedAt >= cutoff) {
        skippedDueToFreshness += 1;
        continue;
      }

      requiresDeltaCheck.push(postId);
    }

    let skippedDueToDeltaThreshold = 0;

    for (const postId of requiresDeltaCheck) {
      const shouldFetch = await this.shouldFetchBasedOnComments(
        subreddit,
        postId,
        correlationId,
      );

      if (shouldFetch) {
        fetchPostIds.push(postId);
      } else {
        skippedDueToDeltaThreshold += 1;
      }
    }

    return {
      fetchPostIds,
      skippedDueToFreshness,
      skippedDueToDeltaThreshold,
    };
  }

  private async shouldFetchBasedOnComments(
    subreddit: string,
    postId: string,
    correlationId: string,
  ): Promise<boolean> {
    const { commentSampleLimit, minNewComments, pipelineScope } =
      this.keywordGateConfig;

    if (
      commentSampleLimit <= 0 ||
      minNewComments <= 0 ||
      !pipelineScope.length
    ) {
      return true;
    }

    if (commentSampleLimit < minNewComments) {
      this.logger.warn(
        'Comment sample limit is smaller than minimum new comment threshold; defaulting to fetch',
        {
          correlationId,
          postId,
          subreddit,
          commentSampleLimit,
          minNewComments,
        },
      );
      return true;
    }

    try {
      const recentCommentIds = await this.redditService.fetchRecentCommentIds(
        subreddit,
        postId,
        commentSampleLimit,
        correlationId,
      );

      if (!recentCommentIds.length) {
        this.logger.debug('Delta probe returned no comments', {
          correlationId,
          postId,
          subreddit,
          commentSampleLimit,
        });
        return false;
      }

      const existingComments =
        await this.prismaService.processedSource.findMany({
          where: {
            pipeline: { in: pipelineScope },
            sourceId: { in: recentCommentIds },
          },
          select: { sourceId: true },
        });

      const existingSet = new Set(existingComments.map((row) => row.sourceId));
      const newCount = recentCommentIds.reduce((count, commentId) => {
        return count + (existingSet.has(commentId) ? 0 : 1);
      }, 0);

      this.logger.debug('Delta probe evaluation', {
        correlationId,
        postId,
        subreddit,
        recentCommentCount: recentCommentIds.length,
        minNewComments,
        newCount,
      });

      return newCount >= minNewComments;
    } catch (error) {
      this.logger.warn('Delta probe failed - defaulting to fetch', {
        correlationId,
        postId,
        subreddit,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });

      return true;
    }
  }

  private buildPostSourceId(postId: string): string {
    return postId.startsWith('t3_') ? postId : `t3_${postId}`;
  }

  private buildKeywordGateConfig(): {
    lookbackMs: number;
    commentSampleLimit: number;
    minNewComments: number;
    pipelineScope: string[];
  } {
    const keywordProcessing =
      (this.configService.get('keywordProcessing') as {
        gateLookbackDays?: number;
        commentSampleLimit?: number;
        minNewComments?: number;
        pipelineScope?: string[];
      }) || {};

    const lookbackDaysRaw = Number(keywordProcessing.gateLookbackDays ?? 21);
    const commentSampleLimitRaw = Number(
      keywordProcessing.commentSampleLimit ?? 5,
    );
    const minNewCommentsRaw = Number(keywordProcessing.minNewComments ?? 3);

    const lookbackDays = Number.isFinite(lookbackDaysRaw)
      ? lookbackDaysRaw
      : 21;
    const commentSampleLimit = Number.isFinite(commentSampleLimitRaw)
      ? commentSampleLimitRaw
      : 5;
    const minNewComments = Number.isFinite(minNewCommentsRaw)
      ? minNewCommentsRaw
      : 3;
    const pipelineScope = Array.isArray(keywordProcessing.pipelineScope)
      ? keywordProcessing.pipelineScope
          .map((value) => value.trim().toLowerCase())
          .filter((value) => value.length > 0)
      : ['chronological', 'archive', 'keyword', 'on-demand'];

    return {
      lookbackMs: Math.max(0, lookbackDays) * 24 * 60 * 60 * 1000,
      commentSampleLimit: Math.max(0, commentSampleLimit),
      minNewComments: Math.max(0, minNewComments),
      pipelineScope,
    };
  }

  private parsePositiveInt(value?: string | null): number | null {
    if (!value) return null;
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) return null;
    return parsed;
  }

  private buildLlmPostSample(
    llmPosts: LLMPost[],
    sampleCount: number,
    commentLimit: number,
  ): Array<{
    id: string;
    title: string;
    subreddit: string;
    author: string;
    score: number;
    created_at: string;
    commentCount: number;
    sampleComments: Array<{
      id: string;
      author: string;
      score: number;
      created_at: string;
      contentSnippet: string;
    }>;
  }> {
    return llmPosts.slice(0, sampleCount).map((post) => {
      const comments = post.comments ?? [];
      return {
        id: post.id,
        title: post.title,
        subreddit: post.subreddit,
        author: post.author,
        score: Math.max(0, post.score),
        created_at: post.created_at,
        commentCount: comments.length,
        sampleComments: comments.slice(0, commentLimit).map((comment) => ({
          id: comment.id,
          author: comment.author,
          score: Math.max(0, comment.score),
          created_at: comment.created_at,
          contentSnippet: comment.content.slice(0, 160),
        })),
      };
    });
  }

  private logStage(
    level: 'debug' | 'info' | 'warn' | 'error',
    stage: 'gate' | 'chunk' | 'llm' | 'persist' | 'batch',
    message: string,
    job: BatchJob,
    correlationId: string,
    metadata: Record<string, unknown> = {},
  ): void {
    this.logger[level](message, {
      correlationId,
      stage,
      batchId: job.batchId,
      parentJobId: job.parentJobId,
      collectionType: job.collectionType,
      subreddit: job.subreddit,
      ...metadata,
    });
  }

  private shouldRefreshRankScores(job: BatchJob): boolean {
    if (!job.totalBatches || job.batchNumber !== job.totalBatches) {
      return false;
    }
    return (
      job.collectionType === 'chronological' ||
      job.collectionType === 'keyword' ||
      job.collectionType === 'archive'
    );
  }

  private async resolveMarketKeyForCommunity(
    communityName: string,
  ): Promise<string | null> {
    const normalized = communityName?.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const cached = this.getCachedMarketKey(normalized);
    if (cached) {
      return cached;
    }

    const resolved =
      await this.marketRegistry.resolveMarketKeyForCommunity(communityName);
    if (!resolved) {
      return null;
    }

    this.setCachedMarketKey(normalized, resolved);
    return resolved;
  }

  private getCachedMarketKey(key: string): string | null {
    if (this.marketKeyCacheTtlMs <= 0 || this.marketKeyCacheMaxEntries <= 0) {
      return null;
    }

    const entry = this.marketKeyCache.get(key);
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.marketKeyCache.delete(key);
      return null;
    }

    // Refresh recency when a hot key is reused.
    this.marketKeyCache.delete(key);
    this.marketKeyCache.set(key, entry);
    return entry.value;
  }

  private setCachedMarketKey(key: string, value: string): void {
    if (this.marketKeyCacheTtlMs <= 0 || this.marketKeyCacheMaxEntries <= 0) {
      return;
    }

    this.marketKeyCache.set(key, {
      value,
      expiresAt: Date.now() + this.marketKeyCacheTtlMs,
    });
    this.pruneMarketKeyCache();
  }

  private pruneMarketKeyCache(): void {
    if (this.marketKeyCacheMaxEntries <= 0) {
      this.marketKeyCache.clear();
      return;
    }

    const now = Date.now();
    for (const [key, entry] of this.marketKeyCache.entries()) {
      if (entry.expiresAt <= now) {
        this.marketKeyCache.delete(key);
      }
    }

    while (this.marketKeyCache.size > this.marketKeyCacheMaxEntries) {
      const oldestKey = this.marketKeyCache.keys().next().value as
        | string
        | undefined;
      if (!oldestKey) {
        break;
      }
      this.marketKeyCache.delete(oldestKey);
    }
  }

  private async refreshRankScoresIfFinalBatch(
    job: BatchJob,
    correlationId: string,
  ): Promise<void> {
    if (!this.shouldRefreshRankScores(job)) {
      return;
    }

    const marketKey = await this.resolveMarketKeyForCommunity(job.subreddit);
    if (!marketKey) {
      this.logger.warn('Rank refresh skipped (missing market key)', {
        correlationId,
        batchId: job.batchId,
        parentJobId: job.parentJobId,
        collectionType: job.collectionType,
        subreddit: job.subreddit,
      });
      return;
    }

    try {
      await this.rankScoreRefreshQueue.queueRefreshForMarkets([marketKey], {
        source: 'collection',
        force: true,
      });
      this.logger.info('Rank scores refreshed after collection completion', {
        correlationId,
        parentJobId: job.parentJobId,
        collectionType: job.collectionType,
        marketKey,
      });
    } catch (error) {
      this.logger.error(
        'Rank score refresh failed after collection completion',
        {
          correlationId,
          parentJobId: job.parentJobId,
          collectionType: job.collectionType,
          marketKey,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }
}
