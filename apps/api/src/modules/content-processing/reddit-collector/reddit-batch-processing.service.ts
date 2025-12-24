import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CoverageSourceType } from '@prisma/client';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { RedditService } from '../../external-integrations/reddit/reddit.service';
import { filterAndTransformToLLM } from '../../external-integrations/reddit/reddit-data-filter';
import {
  LLMChunkingService,
  ChunkMetadata,
} from '../../external-integrations/llm/llm-chunking.service';
import {
  LLMConcurrentProcessingService,
  ProcessingResult as ConcurrentProcessingResult,
} from '../../external-integrations/llm/llm-concurrent-processing.service';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { UnifiedProcessingService } from './unified-processing.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { RankScoreService } from '../rank-score/rank-score.service';
import {
  BatchJob,
  BatchProcessingResult,
} from './batch-processing-queue.types';
import {
  LLMInputStructure,
  LLMPost,
  LLMOutputStructure,
  LLMMention,
} from '../../external-integrations/llm/llm.types';

@Injectable()
export class RedditBatchProcessingService implements OnModuleInit {
  private logger!: LoggerService;
  private readonly coverageKeyCache = new Map<string, string>();
  private keywordGateConfig!: {
    lookbackMs: number;
    commentSampleLimit: number;
    minNewComments: number;
    pipelineScope: string[];
  };

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    @Inject(RedditService) private readonly redditService: RedditService,
    @Inject(LLMChunkingService)
    private readonly llmChunkingService: LLMChunkingService,
    @Inject(LLMConcurrentProcessingService)
    private readonly llmConcurrentService: LLMConcurrentProcessingService,
    @Inject(LLMService) private readonly llmService: LLMService,
    @Inject(UnifiedProcessingService)
    private readonly unifiedProcessingService: UnifiedProcessingService,
    private readonly configService: ConfigService,
    @Inject(PrismaService) private readonly prismaService: PrismaService,
    private readonly rankScoreService: RankScoreService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('RedditBatchProcessingService');
    this.keywordGateConfig = this.buildKeywordGateConfig();
    this.logger.debug('Loaded keyword gate configuration', {
      lookbackMs: this.keywordGateConfig.lookbackMs,
      commentSampleLimit: this.keywordGateConfig.commentSampleLimit,
      minNewComments: this.keywordGateConfig.minNewComments,
      pipelineScope: this.keywordGateConfig.pipelineScope,
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

      const llmInput: LLMInputStructure = { posts: llmPosts };

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

      const llmStartTime = Date.now();

      const chunkStartTime = Date.now();
      const chunkData =
        this.llmChunkingService.createContextualChunks(llmInput);
      const chunkDuration = Date.now() - chunkStartTime;
      const chunkStats = this.summarizeChunkMetadata(chunkData.metadata);
      this.logStage('info', 'chunk', 'Chunking completed', job, correlationId, {
        durationMs: chunkDuration,
        ...chunkStats,
      });

      const processingResult: ConcurrentProcessingResult =
        await this.llmConcurrentService.processConcurrent(
          chunkData,
          this.llmService,
        );

      const flatMentions: LLMMention[] = processingResult.results.flatMap(
        (result) => result.mentions,
      );

      const enrichment = this.buildSourceEnrichmentMaps(llmPosts);

      const llmOutput: LLMOutputStructure = {
        mentions: flatMentions.map((mention) => {
          const metadata = enrichment.metadataById.get(mention.source_id);
          const contentOverride =
            enrichment.contentById.get(mention.source_id) ??
            mention.source_content ??
            '';
          const postContext =
            enrichment.postContextBySource.get(mention.source_id) ?? '';
          const sourceType = metadata?.type ?? mention.source_type;
          const sourceUps = metadata?.ups ?? mention.source_ups ?? 0;
          const sourceUrl = metadata?.url ?? mention.source_url ?? '';
          const createdAt =
            metadata?.created_at ??
            mention.source_created_at ??
            new Date().toISOString();
          const subreddit =
            metadata?.subreddit ?? mention.subreddit ?? 'unknown';

          return {
            ...mention,
            source_content: contentOverride,
            source_type: sourceType,
            source_ups: sourceUps,
            source_url: sourceUrl,
            source_created_at: createdAt,
            subreddit,
            post_context: postContext,
          };
        }),
      };

      this.ensureSurfaceDefaults(llmOutput.mentions);
      this.normalizeRestaurantNames(llmOutput.mentions, enrichment);
      this.dropDuplicateRestaurantMentions(llmOutput.mentions, enrichment);

      const rawMentionsSample = [...llmOutput.mentions];

      const llmProcessingTime = Date.now() - llmStartTime;
      this.logStage(
        'info',
        'llm',
        'LLM processing completed',
        job,
        correlationId,
        {
          durationMs: llmProcessingTime,
          chunksProcessed: processingResult.metrics.chunksProcessed,
          successRate: processingResult.metrics.successRate,
          failures: processingResult.failures.length,
          averageChunkTime: processingResult.metrics.averageChunkTime,
          totalDuration: processingResult.metrics.totalDuration,
          mentionsExtracted: llmOutput.mentions.length,
        },
      );
      const dbStartTime = Date.now();

      const sourceBreakdown = {
        pushshift_archive:
          job.collectionType === 'archive' ? llmPosts.length : 0,
        reddit_api_chronological:
          job.collectionType === 'chronological' ? llmPosts.length : 0,
        reddit_api_keyword_search:
          job.collectionType === 'keyword' ? llmPosts.length : 0,
        reddit_api_on_demand:
          job.collectionType === 'on-demand' ? llmPosts.length : 0,
      };

      const temporalRange = this.computeTemporalRange(llmPosts);

      const dbResult = await this.unifiedProcessingService.processLLMOutput({
        mentions: llmOutput.mentions,
        sourceMetadata: {
          batchId: job.batchId,
          collectionType: job.collectionType,
          subreddit: job.subreddit,
          searchEntity: undefined,
          sourceBreakdown,
          temporalRange,
        },
      });

      const dbProcessingTime = Date.now() - dbStartTime;
      this.logStage(
        'info',
        'persist',
        'Persistence completed',
        job,
        correlationId,
        {
          durationMs: dbProcessingTime,
          entitiesCreated: dbResult.entitiesCreated,
          connectionsCreated: dbResult.connectionsCreated,
        },
      );

      const result: BatchProcessingResult = {
        batchId: job.batchId,
        parentJobId: job.parentJobId,
        collectionType: job.collectionType,
        success: true,
        metrics: {
          postsProcessed: llmPosts.length,
          mentionsExtracted: llmOutput.mentions.length,
          entitiesCreated: dbResult.entitiesCreated,
          connectionsCreated: dbResult.connectionsCreated,
          processingTimeMs: Date.now() - startTime,
          llmProcessingTimeMs: llmProcessingTime,
          dbProcessingTimeMs: dbProcessingTime,
        },
        completedAt: new Date(),
        details: {
          createdEntityIds: dbResult.createdEntityIds || [],
          updatedConnectionIds: dbResult.affectedConnectionIds || [],
          createdEntities: dbResult.createdEntitySummaries || [],
          reusedEntities: dbResult.reusedEntitySummaries || [],
          ...(llmPostSample ? { llmPostSample } : {}),
          keywordGateSummary: {
            totalCandidates,
            processedPosts: llmPosts.length,
            skippedDueToFreshness,
            skippedDueToDeltaThreshold,
          },
        },
        rawMentionsSample,
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
          mentionsExtracted: llmOutput.mentions.length,
          entitiesCreated: dbResult.entitiesCreated,
          connectionsCreated: dbResult.connectionsCreated,
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

    const existingRecords = await this.prismaService.source.findMany({
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

      const existingComments = await this.prismaService.source.findMany({
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

  private buildSourceEnrichmentMaps(llmPosts: LLMPost[]): {
    contentById: Map<string, string>;
    idToPostId: Map<string, string>;
    metadataById: Map<
      string,
      {
        type: 'post' | 'comment';
        ups: number;
        url: string;
        created_at: string;
        subreddit: string;
      }
    >;
    postContextBySource: Map<string, string>;
  } {
    const contentById = new Map<string, string>();
    const idToPostId = new Map<string, string>();
    const metadataById = new Map<
      string,
      {
        type: 'post' | 'comment';
        ups: number;
        url: string;
        created_at: string;
        subreddit: string;
      }
    >();

    for (const post of llmPosts) {
      contentById.set(post.id, post.content);
      idToPostId.set(post.id, post.id);
      metadataById.set(post.id, {
        type: 'post',
        ups: Math.max(0, post.score),
        url: post.url,
        created_at: post.created_at,
        subreddit: post.subreddit || 'unknown',
      });

      for (const comment of post.comments) {
        contentById.set(comment.id, comment.content);
        idToPostId.set(comment.id, post.id);
        metadataById.set(comment.id, {
          type: 'comment',
          ups: Math.max(0, comment.score),
          url: comment.url,
          created_at: comment.created_at,
          subreddit: post.subreddit || 'unknown',
        });
      }
    }

    const postContextBySource = new Map<string, string>();
    for (const post of llmPosts) {
      postContextBySource.set(post.id, post.content);
      for (const comment of post.comments) {
        postContextBySource.set(comment.id, post.content);
      }
    }

    return {
      contentById,
      idToPostId,
      metadataById,
      postContextBySource,
    };
  }

  private ensureSurfaceDefaults(mentions: LLMMention[]): void {
    const alignSurfaces = (
      canonicalValues: unknown,
      surfaceValues: unknown,
    ): (string | null)[] | null => {
      if (!Array.isArray(canonicalValues)) {
        return Array.isArray(surfaceValues)
          ? (surfaceValues as unknown[]).map((value) =>
              typeof value === 'string' && value.length > 0 ? value : null,
            )
          : null;
      }

      const canonicalArray = canonicalValues as unknown[];
      const surfaceArray = Array.isArray(surfaceValues)
        ? (surfaceValues as unknown[])
        : [];

      return canonicalArray.map((value, index) => {
        const surfaceCandidate = surfaceArray[index];
        if (
          typeof surfaceCandidate === 'string' &&
          surfaceCandidate.length > 0
        ) {
          return surfaceCandidate;
        }
        if (typeof value === 'string' && value.length > 0) {
          return value;
        }
        return null;
      });
    };

    for (const mention of mentions) {
      const restaurantName =
        typeof mention?.restaurant === 'string' ? mention.restaurant : null;
      if (
        typeof mention?.restaurant_surface !== 'string' ||
        mention.restaurant_surface.length === 0
      ) {
        mention.restaurant_surface = restaurantName;
      }

      const foodName = typeof mention?.food === 'string' ? mention.food : null;
      if (
        mention.food_surface === undefined ||
        (mention.food_surface === null && foodName)
      ) {
        mention.food_surface = foodName;
      } else if (
        typeof mention.food_surface !== 'string' ||
        mention.food_surface.length === 0
      ) {
        mention.food_surface = foodName;
      }

      mention.food_category_surfaces = alignSurfaces(
        mention.food_categories,
        mention.food_category_surfaces,
      );

      mention.food_attribute_surfaces = alignSurfaces(
        mention.food_attributes,
        mention.food_attribute_surfaces,
      );

      mention.restaurant_attribute_surfaces = alignSurfaces(
        mention.restaurant_attributes,
        mention.restaurant_attribute_surfaces,
      );
    }
  }

  private normalizeRestaurantNames(
    mentions: LLMMention[],
    enrichment: ReturnType<typeof this.buildSourceEnrichmentMaps>,
  ): void {
    const tokenize = (s: string | null | undefined): string[] => {
      if (!s || typeof s !== 'string') return [];
      return s
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .filter(Boolean);
    };

    const keyFromTokens = (tokens: string[]) => tokens.join(' ');
    const isSubset = (small: Set<string>, big: Set<string>) => {
      for (const t of small) if (!big.has(t)) return false;
      return true;
    };

    const postNormalizationStats = new Map<
      string,
      {
        nameCounts: Map<
          string,
          { count: number; upvotes: number; tokens: string[] }
        >;
        dishSets: string[][];
      }
    >();

    const idToPostId = enrichment.idToPostId;

    try {
      const mentionsByPost = new Map<string, LLMMention[]>();
      for (const mention of mentions) {
        const postId = idToPostId.get(mention.source_id);
        if (!postId) continue;
        if (!mentionsByPost.has(postId)) {
          mentionsByPost.set(postId, []);
        }
        mentionsByPost.get(postId)!.push(mention);
      }

      for (const [postId, postMentions] of mentionsByPost.entries()) {
        const nameCounts = new Map<
          string,
          { count: number; upvotes: number; tokens: string[] }
        >();

        for (const mention of postMentions) {
          const tokens = tokenize(mention.restaurant);
          const key = keyFromTokens(tokens);
          if (!key) continue;
          const prev = nameCounts.get(key) || {
            count: 0,
            upvotes: 0,
            tokens,
          };
          nameCounts.set(key, {
            count: prev.count + 1,
            upvotes: prev.upvotes + mention.source_ups,
            tokens,
          });
        }

        const dishSets: string[][] = [];
        const dishKeys = new Set<string>();
        for (const mention of postMentions) {
          const dishTokens = tokenize(mention.food);
          if (dishTokens.length === 0) continue;
          const key = keyFromTokens(dishTokens);
          if (!dishKeys.has(key)) {
            dishKeys.add(key);
            dishSets.push(dishTokens);
          }
        }

        postNormalizationStats.set(postId, {
          nameCounts,
          dishSets,
        });

        for (const mention of postMentions) {
          const restaurantTokens = tokenize(mention.restaurant);
          if (restaurantTokens.length === 0) continue;

          let rewritten = false;
          const foodTokens = tokenize(mention.food);
          if (foodTokens.length > 0) {
            const restaurantSet = new Set(restaurantTokens);
            const foodSet = new Set(foodTokens);
            let overlap = false;
            for (const token of foodSet) {
              if (restaurantSet.has(token)) {
                overlap = true;
                break;
              }
            }

            if (overlap) {
              const remainder = restaurantTokens.filter(
                (token) => !foodSet.has(token),
              );
              if (remainder.length > 0) {
                const remainderSet = new Set(remainder);
                let bestMatch: {
                  key: string;
                  count: number;
                  upvotes: number;
                  tokens: string[];
                } | null = null;

                for (const [key, info] of nameCounts.entries()) {
                  const tokenSet = new Set(info.tokens);
                  if (isSubset(tokenSet, remainderSet)) {
                    if (
                      !bestMatch ||
                      info.count > bestMatch.count ||
                      (info.count === bestMatch.count &&
                        info.upvotes > bestMatch.upvotes) ||
                      (info.count === bestMatch.count &&
                        info.upvotes === bestMatch.upvotes &&
                        info.tokens.length > bestMatch.tokens.length)
                    ) {
                      bestMatch = {
                        key,
                        count: info.count,
                        upvotes: info.upvotes,
                        tokens: info.tokens,
                      };
                    }
                  }
                }

                if (
                  bestMatch &&
                  bestMatch.key !== keyFromTokens(restaurantTokens)
                ) {
                  mention.restaurant = bestMatch.key;
                  rewritten = true;
                }
              }
            }
          }

          if (!rewritten && dishSets.length > 0) {
            const restaurantSet = new Set(restaurantTokens);
            let bestMatch: {
              key: string;
              count: number;
              upvotes: number;
              tokens: string[];
            } | null = null;

            for (const dishTokens of dishSets) {
              const dishSet = new Set(dishTokens);
              if (!isSubset(dishSet, restaurantSet)) continue;

              const remainder = restaurantTokens.filter(
                (token) => !dishSet.has(token),
              );
              if (remainder.length === 0) continue;

              const remainderSet = new Set(remainder);
              for (const [key, info] of nameCounts.entries()) {
                const tokenSet = new Set(info.tokens);
                if (isSubset(tokenSet, remainderSet)) {
                  if (
                    !bestMatch ||
                    info.count > bestMatch.count ||
                    (info.count === bestMatch.count &&
                      info.upvotes > bestMatch.upvotes) ||
                    (info.count === bestMatch.count &&
                      info.upvotes === bestMatch.upvotes &&
                      info.tokens.length > bestMatch.tokens.length)
                  ) {
                    bestMatch = {
                      key,
                      count: info.count,
                      upvotes: info.upvotes,
                      tokens: info.tokens,
                    };
                  }
                }
              }
            }

            if (
              bestMatch &&
              bestMatch.key !== keyFromTokens(restaurantTokens)
            ) {
              mention.restaurant = bestMatch.key;
            }
          }
        }
      }
    } catch (error) {
      this.logger.debug('Post-level normalization skipped due to error', {
        correlationId: CorrelationUtils.getCorrelationId(),
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private dropDuplicateRestaurantMentions(
    mentions: LLMMention[],
    enrichment: ReturnType<typeof this.buildSourceEnrichmentMaps>,
  ): void {
    const tokenize = (s: string | null | undefined): string[] => {
      if (!s || typeof s !== 'string') return [];
      return s
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .filter(Boolean);
    };

    const idToPostId = enrichment.idToPostId;
    const postNormalizationStats = new Map<
      string,
      { nameCounts: Map<string, { tokens: string[] } | undefined> }
    >();

    mentions.forEach((mention) => {
      const postId = idToPostId.get(mention.source_id);
      if (!postId) {
        return;
      }
      if (!postNormalizationStats.has(postId)) {
        postNormalizationStats.set(postId, {
          nameCounts: new Map(),
        });
      }
      const stats = postNormalizationStats.get(postId)!;
      const tokens = tokenize(mention.restaurant);
      if (tokens.length === 0) {
        return;
      }
      const key = tokens.join(' ');
      if (!stats.nameCounts.has(key)) {
        stats.nameCounts.set(key, { tokens });
      }
    });

    const filtered = mentions.filter((mention) => {
      const restaurantTokens = tokenize(mention.restaurant);
      if (restaurantTokens.length === 0) {
        return false;
      }

      const foodTokenSet = new Set(tokenize(mention.food));
      if (Array.isArray(mention.food_categories)) {
        for (const category of mention.food_categories) {
          tokenize(category).forEach((token) => foodTokenSet.add(token));
        }
      }

      if (foodTokenSet.size === 0) {
        return true;
      }

      const restaurantSet = new Set(restaurantTokens);
      if (restaurantSet.size !== foodTokenSet.size) {
        return true;
      }

      for (const token of restaurantSet) {
        if (!foodTokenSet.has(token)) {
          return true;
        }
      }

      const postId = enrichment.idToPostId.get(mention.source_id);
      const stats = postId ? postNormalizationStats.get(postId) : null;
      const hasLongerVariant = stats?.nameCounts
        ? Array.from(stats.nameCounts.values()).some((info) => {
            if (!info?.tokens) return false;
            if (info.tokens.length <= restaurantTokens.length) {
              return false;
            }
            const infoSet = new Set(info.tokens);
            return restaurantTokens.every((token) => infoSet.has(token));
          })
        : false;

      return hasLongerVariant;
    });

    mentions.length = 0;
    mentions.push(...filtered);
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

  private computeTemporalRange(llmPosts: LLMPost[]): {
    earliest: number;
    latest: number;
  } {
    const now = Date.now();

    const timestamps = llmPosts
      .map((post) => {
        try {
          return new Date(post.created_at).getTime();
        } catch {
          return undefined;
        }
      })
      .filter((value): value is number => typeof value === 'number');

    if (!timestamps.length) {
      return {
        earliest: now,
        latest: now,
      };
    }

    return {
      earliest: Math.min(...timestamps),
      latest: Math.max(...timestamps),
    };
  }

  private summarizeChunkMetadata(metadata: ChunkMetadata[]): {
    chunkCount: number;
    totalComments: number;
    avgComments: number;
    minComments: number;
    maxComments: number;
    avgEstimatedTokens: number;
    maxEstimatedTokens: number;
  } {
    if (!metadata.length) {
      return {
        chunkCount: 0,
        totalComments: 0,
        avgComments: 0,
        minComments: 0,
        maxComments: 0,
        avgEstimatedTokens: 0,
        maxEstimatedTokens: 0,
      };
    }

    const commentCounts = metadata.map((m) => m.commentCount || 0);
    const totalComments = commentCounts.reduce((sum, value) => sum + value, 0);
    const minComments = Math.min(...commentCounts);
    const maxComments = Math.max(...commentCounts);
    const avgComments = Math.round(totalComments / metadata.length);

    const tokenEstimates = metadata.map((m) => m.estimatedTokenCount || 0);
    const totalTokens = tokenEstimates.reduce((sum, value) => sum + value, 0);
    const avgEstimatedTokens =
      tokenEstimates.length > 0
        ? Math.round(totalTokens / tokenEstimates.length)
        : 0;
    const maxEstimatedTokens = Math.max(...tokenEstimates);

    return {
      chunkCount: metadata.length,
      totalComments,
      avgComments,
      minComments,
      maxComments,
      avgEstimatedTokens,
      maxEstimatedTokens,
    };
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

  private async resolveCoverageKeyForSubreddit(
    subreddit: string,
  ): Promise<string | null> {
    const normalized = subreddit?.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const cached = this.coverageKeyCache.get(normalized);
    if (cached) {
      return cached;
    }

    const record = (await this.prismaService.coverageArea.findFirst({
      where: {
        name: {
          equals: subreddit,
          mode: 'insensitive',
        },
        sourceType: CoverageSourceType.all,
      },
      select: { coverageKey: true, name: true },
    })) as { coverageKey: string | null; name: string } | null;

    const resolved =
      typeof record?.coverageKey === 'string' && record.coverageKey.trim()
        ? record.coverageKey.trim().toLowerCase()
        : record?.name
        ? record.name.trim().toLowerCase()
        : normalized;

    this.coverageKeyCache.set(normalized, resolved);
    return resolved;
  }

  private async refreshRankScoresIfFinalBatch(
    job: BatchJob,
    correlationId: string,
  ): Promise<void> {
    if (!this.shouldRefreshRankScores(job)) {
      return;
    }

    const coverageKey = await this.resolveCoverageKeyForSubreddit(
      job.subreddit,
    );
    if (!coverageKey) {
      this.logger.warn('Rank refresh skipped (missing coverage key)', {
        correlationId,
        batchId: job.batchId,
        parentJobId: job.parentJobId,
        collectionType: job.collectionType,
        subreddit: job.subreddit,
      });
      return;
    }

    try {
      await this.rankScoreService.refreshRankScoresForLocations([coverageKey]);
      this.logger.info('Rank scores refreshed after collection completion', {
        correlationId,
        parentJobId: job.parentJobId,
        collectionType: job.collectionType,
        coverageKey,
      });
    } catch (error) {
      this.logger.error(
        'Rank score refresh failed after collection completion',
        {
          correlationId,
          parentJobId: job.parentJobId,
          collectionType: job.collectionType,
          coverageKey,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }
}
