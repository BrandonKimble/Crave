import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { RedditService } from '../../external-integrations/reddit/reddit.service';
import { filterAndTransformToLLM } from '../../external-integrations/reddit/reddit-data-filter';
import { LLMChunkingService } from '../../external-integrations/llm/llm-chunking.service';
import { LLMConcurrentProcessingService } from '../../external-integrations/llm/llm-concurrent-processing.service';
import { LLMService } from '../../external-integrations/llm/llm.service';
import { UnifiedProcessingService } from './unified-processing.service';
import {
  BatchJob,
  BatchProcessingResult,
} from './batch-processing-queue.types';

@Injectable()
export class RedditBatchProcessingService implements OnModuleInit {
  private logger!: LoggerService;

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
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('RedditBatchProcessingService');
  }

  async processBatch(
    job: BatchJob,
    correlationId: string,
  ): Promise<BatchProcessingResult> {
    const startTime = Date.now();

    try {
      const llmPosts = await this.resolveLlmPosts(job, correlationId);

      if (!llmPosts.length) {
        throw new Error('No valid posts retrieved for LLM processing');
      }

      const llmInput = { posts: llmPosts };

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

      const chunkData =
        this.llmChunkingService.createContextualChunks(llmInput);
      const processingResult =
        await this.llmConcurrentService.processConcurrent(
          chunkData,
          this.llmService,
        );

      const flatMentions = processingResult.results.flatMap((r) => r.mentions);

      const enrichment = this.buildSourceEnrichmentMaps(llmPosts);

      const llmOutput = {
        mentions: flatMentions.map((mention: any) => ({
          ...mention,
          source_content:
            enrichment.contentById.get(mention?.source_id) ||
            mention?.source_content ||
            '',
          source_type:
            enrichment.metadataById.get(mention?.source_id)?.type ??
            mention?.source_type,
          source_ups:
            enrichment.metadataById.get(mention?.source_id)?.ups ??
            mention?.source_ups ??
            0,
          source_url:
            enrichment.metadataById.get(mention?.source_id)?.url ??
            mention?.source_url ??
            '',
          source_created_at:
            enrichment.metadataById.get(mention?.source_id)?.created_at ??
            mention?.source_created_at ??
            new Date().toISOString(),
          subreddit:
            enrichment.metadataById.get(mention?.source_id)?.subreddit ??
            mention?.subreddit ??
            'unknown',
          post_context:
            enrichment.postContextBySource.get(mention?.source_id) || '',
        })),
      };

      this.ensureSurfaceDefaults(llmOutput.mentions);
      this.normalizeRestaurantNames(llmOutput.mentions, enrichment);
      this.dropDuplicateRestaurantMentions(llmOutput.mentions, enrichment);

      const rawMentionsSample = [...llmOutput.mentions];

      const llmProcessingTime = Date.now() - llmStartTime;
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

      return {
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
        },
        rawMentionsSample,
      };
    } catch (error) {
      this.logger.error('Batch processing failed', {
        correlationId,
        batchId: job.batchId,
        subreddit: job.subreddit,
        collectionType: job.collectionType,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  private async resolveLlmPosts(
    job: BatchJob,
    correlationId: string,
  ): Promise<any[]> {
    if (job.llmPosts?.length) {
      this.logger.debug('Using pre-transformed LLM posts from job payload', {
        correlationId,
        batchId: job.batchId,
        postCount: job.llmPosts.length,
      });
      return job.llmPosts;
    }

    if (!job.postIds?.length) {
      throw new Error(
        'Batch job missing postIds or llmPosts for processing pipeline',
      );
    }

    this.logger.debug('Retrieving Reddit content for batch', {
      correlationId,
      postCount: job.postIds.length,
      depth: job.options?.depth,
      subreddit: job.subreddit,
    });

    const llmPosts: any[] = [];

    for (const postId of job.postIds) {
      try {
        const rawResult = await this.redditService.getCompletePostWithComments(
          job.subreddit,
          postId,
          { depth: job.options?.depth },
        );

        if (!rawResult.rawResponse || rawResult.rawResponse.length === 0) {
          this.logger.warn(`Skipping post ${postId} - no raw response`, {
            correlationId,
            postId,
            batchId: job.batchId,
          });
          continue;
        }

        const { post, comments } = filterAndTransformToLLM(
          rawResult.rawResponse,
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

    return llmPosts;
  }

  private buildSourceEnrichmentMaps(llmPosts: any[]) {
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
      if (post?.id && typeof post.content === 'string') {
        contentById.set(post.id, post.content);
        idToPostId.set(post.id, post.id);
        metadataById.set(post.id, {
          type: 'post',
          ups: typeof post.score === 'number' ? post.score : 0,
          url: typeof post.url === 'string' ? post.url : '',
          created_at:
            typeof post.created_at === 'string'
              ? post.created_at
              : new Date().toISOString(),
          subreddit:
            typeof post.subreddit === 'string' ? post.subreddit : 'unknown',
        });
      }

      const comments = Array.isArray(post?.comments) ? post.comments : [];
      for (const comment of comments) {
        if (comment?.id && typeof comment.content === 'string') {
          contentById.set(comment.id, comment.content);
          idToPostId.set(comment.id, post.id);
          metadataById.set(comment.id, {
            type: 'comment',
            ups: typeof comment.score === 'number' ? comment.score : 0,
            url: typeof comment.url === 'string' ? comment.url : '',
            created_at:
              typeof comment.created_at === 'string'
                ? comment.created_at
                : new Date().toISOString(),
            subreddit:
              typeof post.subreddit === 'string' ? post.subreddit : 'unknown',
          });
        }
      }
    }

    const postContextBySource = new Map<string, string>();
    for (const post of llmPosts) {
      postContextBySource.set(post.id, post.content || '');
      const comments = Array.isArray(post?.comments) ? post.comments : [];
      for (const comment of comments) {
        postContextBySource.set(comment.id, post.content || '');
      }
    }

    return {
      contentById,
      idToPostId,
      metadataById,
      postContextBySource,
    };
  }

  private ensureSurfaceDefaults(mentions: any[]): void {
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
    mentions: any[],
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
      const mentionsByPost = new Map<string, any[]>();
      for (const mention of mentions) {
        const postId = idToPostId.get(mention?.source_id);
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
            upvotes:
              prev.upvotes +
              (typeof mention.source_ups === 'number' ? mention.source_ups : 0),
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
    mentions: any[],
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
      const postId = idToPostId.get(mention?.source_id);
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

      const postId = enrichment.idToPostId.get(mention?.source_id);
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
    llmPosts: any[],
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
    return llmPosts.slice(0, sampleCount).map((post: any) => {
      const comments = Array.isArray(post?.comments) ? post.comments : [];
      return {
        id: post?.id ?? '',
        title: post?.title ?? '',
        subreddit: post?.subreddit ?? '',
        author: post?.author ?? 'unknown',
        score: typeof post?.score === 'number' ? post.score : 0,
        created_at:
          typeof post?.created_at === 'string'
            ? post.created_at
            : new Date().toISOString(),
        commentCount: comments.length,
        sampleComments: comments.slice(0, commentLimit).map((comment: any) => ({
          id: comment?.id ?? '',
          author: comment?.author ?? 'unknown',
          score: typeof comment?.score === 'number' ? comment.score : 0,
          created_at:
            typeof comment?.created_at === 'string'
              ? comment.created_at
              : new Date().toISOString(),
          contentSnippet:
            typeof comment?.content === 'string'
              ? comment.content.slice(0, 160)
              : '',
        })),
      };
    });
  }

  private computeTemporalRange(llmPosts: any[]): {
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
}
