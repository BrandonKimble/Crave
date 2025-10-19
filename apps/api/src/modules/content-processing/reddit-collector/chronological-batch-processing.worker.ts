import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { createHash } from 'crypto';
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

/**
 * Chronological Batch Processing Worker
 *
 * Processes batches of Reddit chronological collection content asynchronously using Bull queues.
 * Takes the existing chronological collection logic and moves it to async workers.
 *
 * Architecture:
 * - ChronologicalCollectionWorker queues batch jobs (just post IDs)
 * - Workers pick up jobs and process them independently
 * - Full content retrieval → LLM processing → database operations
 * - Results tracked and aggregated per collection
 *
 * TODO: REFACTOR OPPORTUNITY - Common LLM Processing Pipeline
 * Once all collection type workers are implemented, steps 2-5 (filter/transform,
 * chunk, LLM processing, UnifiedProcessingService) will likely be identical across
 * all workers. Consider extracting shared processing method to reduce duplication:
 * - ChronologicalBatchProcessingWorker: postIds → Reddit API → common pipeline
 * - ArchiveBatchProcessingWorker: postData → skip API → common pipeline
 * - KeywordBatchProcessingWorker: keywords → search API → common pipeline
 * - OnDemandBatchProcessingWorker: requests → various APIs → common pipeline
 */
@Processor('chronological-batch-processing-queue')
@Injectable()
export class ChronologicalBatchProcessingWorker implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    @Inject(RedditService)
    private readonly redditService: RedditService,
    @Inject(LLMChunkingService)
    private readonly llmChunkingService: LLMChunkingService,
    @Inject(LLMConcurrentProcessingService)
    private readonly llmConcurrentService: LLMConcurrentProcessingService,
    @Inject(LLMService) private readonly llmService: LLMService,
    @Inject(UnifiedProcessingService)
    private readonly unifiedProcessingService: UnifiedProcessingService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext(
      'ChronologicalBatchProcessingWorker',
    );
  }

  /**
   * Process chronological collection batch
   * Currently only handles chronological batches - extensible for other types later
   */
  @Process({ name: 'process-chronological-batch', concurrency: 1 })
  async processChronologicalBatch(
    job: Job<BatchJob>,
  ): Promise<BatchProcessingResult> {
    const startTime = Date.now();
    const correlationId = CorrelationUtils.generateCorrelationId();
    const {
      batchId,
      parentJobId,
      collectionType,
      subreddit,
      postIds,
      options,
      batchNumber,
      totalBatches,
    } = job.data;

    // Validate this is a chronological batch
    if (collectionType !== 'chronological') {
      throw new Error(
        `This worker only handles chronological batches, got: ${collectionType}`,
      );
    }

    this.logger.info('Starting chronological batch processing', {
      correlationId,
      batchId,
      parentJobId,
      subreddit,
      postCount: postIds.length,
      progress: `${batchNumber}/${totalBatches}`,
    });

    try {
      const result = await this.processChronologicalBatchInternal(
        {
          batchId,
          parentJobId,
          collectionType,
          subreddit,
          postIds,
          options,
          batchNumber,
          totalBatches,
        },
        correlationId,
        startTime,
      );

      // Update job progress
      await job.progress(100);

      const processingTime = Date.now() - startTime;
      this.logger.info(
        'Chronological batch processing completed successfully',
        {
          correlationId,
          batchId,
          parentJobId,
          subreddit,
          processingTimeMs: processingTime,
          mentionsExtracted: result.metrics.mentionsExtracted,
          entitiesCreated: result.metrics.entitiesCreated,
          connectionsCreated: result.metrics.connectionsCreated,
        },
      );

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Chronological batch processing failed', {
        correlationId,
        batchId,
        parentJobId,
        subreddit,
        processingTimeMs: processingTime,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Return error result instead of throwing (for proper job completion)
      return {
        batchId,
        parentJobId,
        collectionType: 'chronological',
        success: false,
        error: errorMessage,
        metrics: {
          postsProcessed: 0,
          mentionsExtracted: 0,
          entitiesCreated: 0,
          connectionsCreated: 0,
          processingTimeMs: processingTime,
          llmProcessingTimeMs: 0,
          dbProcessingTimeMs: 0,
        },
        completedAt: new Date(),
      };
    }
  }

  /**
   * Internal chronological batch processing logic
   * Moved from ChronologicalCollectionWorker nearly as-is for consistency
   */
  private async processChronologicalBatchInternal(
    batchJob: {
      batchId: string;
      parentJobId: string;
      collectionType: string;
      subreddit: string;
      postIds: string[];
      options: any;
      batchNumber: number;
      totalBatches: number;
    },
    correlationId: string,
    startTime: number,
  ): Promise<BatchProcessingResult> {
    const { batchId, parentJobId, subreddit, postIds, options } = batchJob;
    const llmStartTime = Date.now();

    this.logger.debug('Processing chronological batch', {
      correlationId,
      batchId,
      subreddit,
      postCount: postIds.length,
      depth: options.depth,
    });

    try {
      // Step 1: Get full content for this batch (same as original - 25 API calls)
      this.logger.debug('Retrieving Reddit content for batch', {
        correlationId,
        postCount: postIds.length,
        depth: options.depth,
      });

      const llmPosts: any[] = [];
      for (const postId of postIds) {
        try {
          const rawResult =
            await this.redditService.getCompletePostWithComments(
              subreddit,
              postId,
              { depth: options.depth },
            );

          if (!rawResult.rawResponse || rawResult.rawResponse.length === 0) {
            this.logger.warn(`Skipping post ${postId} - no raw response`, {
              correlationId,
              postId,
            });
            continue;
          }

          const { post, comments } = filterAndTransformToLLM(
            rawResult.rawResponse,
            rawResult.attribution.postUrl,
          );

          if (!post) {
            this.logger.warn(
              `Skipping post ${postId} - transformation failed`,
              {
                correlationId,
                postId,
              },
            );
            continue;
          }

          post.comments = comments;
          llmPosts.push(post);
        } catch (error) {
          this.logger.error(`Failed to retrieve post ${postId}`, {
            correlationId,
            postId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (llmPosts.length === 0) {
        throw new Error('No valid posts retrieved for LLM processing');
      }

      const llmInput = { posts: llmPosts };

      // Step 2: LLM processing (same as original - ~82 seconds, provides natural rate limiting)
      const chunkData =
        this.llmChunkingService.createContextualChunks(llmInput);
      const processingResult =
        await this.llmConcurrentService.processConcurrent(
          chunkData,
          this.llmService,
        );

      // Step 3: Consolidate results
      const flatMentions = processingResult.results.flatMap((r) => r.mentions);

      // Prevent large outputs at the source by not asking LLM for source_content.
      // Enrich mentions with source_content from our own inputs using source_id mapping.
      const contentById = new Map<string, string>();
      // Map each source (post/comment) id to its parent post id for sampling
      const idToPostId = new Map<string, string>();
      // Map each source id to metadata for server-side enrichment
      const idToMeta = new Map<
        string,
        {
          type: 'post' | 'comment';
          ups: number;
          url: string;
          created_at: string;
          subreddit: string;
        }
      >();
      for (const p of llmPosts) {
        if (p?.id && typeof p.content === 'string') {
          contentById.set(p.id, p.content);
          idToPostId.set(p.id, p.id);
          idToMeta.set(p.id, {
            type: 'post',
            ups: typeof p.score === 'number' ? p.score : 0,
            url: typeof p.url === 'string' ? p.url : '',
            created_at:
              typeof p.created_at === 'string'
                ? p.created_at
                : new Date().toISOString(),
            subreddit:
              typeof p.subreddit === 'string' ? p.subreddit : 'unknown',
          });
        }
        const comments = Array.isArray(p?.comments) ? p.comments : [];
        for (const c of comments) {
          if (c?.id && typeof c.content === 'string') {
            contentById.set(c.id, c.content);
            idToPostId.set(c.id, p.id);
            idToMeta.set(c.id, {
              type: 'comment',
              ups: typeof c.score === 'number' ? c.score : 0,
              url: typeof c.url === 'string' ? c.url : '',
              created_at:
                typeof c.created_at === 'string'
                  ? c.created_at
                  : new Date().toISOString(),
              subreddit:
                typeof p.subreddit === 'string' ? p.subreddit : 'unknown',
            });
          }
        }
      }

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

      const llmOutput = {
        mentions: flatMentions.map((m: any) => {
          const meta = idToMeta.get(m?.source_id);
          const text = contentById.get(m?.source_id);
          const parentPostId = idToPostId.get(m?.source_id);
          const postContext = parentPostId
            ? contentById.get(parentPostId)
            : undefined;
          return {
            ...m,
            // Injected source metadata
            source_content: text || m?.source_content || '',
            source_type: meta?.type ?? m?.source_type,
            source_ups:
              typeof meta?.ups === 'number' ? meta?.ups : (m?.source_ups ?? 0),
            source_url: meta?.url ?? m?.source_url ?? '',
            source_created_at: meta?.created_at ?? m?.source_created_at ?? '',
            subreddit: meta?.subreddit ?? m?.subreddit ?? 'unknown',
            // TEMP: Debug-only field to aid LLM QA — remove after debugging
            post_context: postContext || '',
          };
        }),
      };

      // Post-level normalization: if restaurant_name shares tokens with its own food_name,
      // strip food tokens and harmonize to a brand form already observed in this post.
      try {
        const byPost = new Map<string, any[]>();
        for (const m of llmOutput.mentions) {
          const pid = idToPostId.get(m?.source_id);
          if (!pid) continue;
          if (!byPost.has(pid)) byPost.set(pid, []);
          byPost.get(pid)!.push(m);
        }

        for (const [postId, mentions] of byPost.entries()) {
          const nameCounts = new Map<
            string,
            { count: number; upvotes: number; tokens: string[] }
          >();
          for (const m of mentions) {
            const tokens = tokenize(m.restaurant_name);
            const k = keyFromTokens(tokens);
            if (!k) continue;
            const prev = nameCounts.get(k) || { count: 0, upvotes: 0, tokens };
            nameCounts.set(k, {
              count: prev.count + 1,
              upvotes:
                prev.upvotes +
                (typeof m.source_ups === 'number' ? m.source_ups : 0),
              tokens,
            });
          }

          // Collect unique dish token sets observed in this post (for cross-mention overlap)
          const dishSets: string[][] = [];
          const dishKeys = new Set<string>();
          for (const m of mentions) {
            const d = tokenize(m.food_name);
            if (d.length === 0) continue;
            const dk = keyFromTokens(d);
            if (!dishKeys.has(dk)) {
              dishKeys.add(dk);
              dishSets.push(d);
            }
          }

          postNormalizationStats.set(postId, {
            nameCounts,
            dishSets,
          });

          for (const m of mentions) {
            const rTokens = tokenize(m.restaurant_name);
            if (rTokens.length === 0) continue;
            let rewritten = false;

            // Case A: Same-mention dish overlap
            const fTokens = tokenize(m.food_name);
            if (fTokens.length > 0) {
              const rSetA = new Set(rTokens);
              const fSetA = new Set(fTokens);
              let overlapA = false;
              for (const t of fSetA) {
                if (rSetA.has(t)) {
                  overlapA = true;
                  break;
                }
              }
              if (overlapA) {
                const remainderA = rTokens.filter((t) => !fSetA.has(t));
                if (remainderA.length > 0) {
                  const remSetA = new Set(remainderA);
                  let bestA: {
                    key: string;
                    count: number;
                    upvotes: number;
                    tokens: string[];
                  } | null = null;
                  for (const [k, info] of nameCounts.entries()) {
                    const kSet = new Set(info.tokens);
                    if (isSubset(kSet, remSetA)) {
                      if (
                        !bestA ||
                        info.count > bestA.count ||
                        (info.count === bestA.count &&
                          info.upvotes > bestA.upvotes) ||
                        (info.count === bestA.count &&
                          info.upvotes === bestA.upvotes &&
                          info.tokens.length > bestA.tokens.length)
                      ) {
                        bestA = {
                          key: k,
                          count: info.count,
                          upvotes: info.upvotes,
                          tokens: info.tokens,
                        };
                      }
                    }
                  }
                  if (bestA && bestA.key !== keyFromTokens(rTokens)) {
                    const oldName = m.restaurant_name;
                    m.restaurant_name = bestA.key; // normalized lowercase
                    this.logger.debug(
                      'Post-level normalization (same-mention): restaurant_name rewritten',
                      {
                        correlationId: CorrelationUtils.getCorrelationId(),
                        postId,
                        sourceId: m.source_id,
                        from: oldName,
                        to: m.restaurant_name,
                      },
                    );
                    rewritten = true;
                  }
                }
              }
            }

            // Case B: Cross-mention dish overlap (if not rewritten and some dishes exist)
            if (!rewritten && dishSets.length > 0) {
              const rSetB = new Set(rTokens);
              let bestB: {
                key: string;
                count: number;
                upvotes: number;
                tokens: string[];
              } | null = null;
              for (const dTokens of dishSets) {
                const dSet = new Set(dTokens);
                if (!isSubset(dSet, rSetB)) continue;
                const remainderB = rTokens.filter((t) => !dSet.has(t));
                if (remainderB.length === 0) continue;

                const remSetB = new Set(remainderB);
                for (const [k, info] of nameCounts.entries()) {
                  const kSet = new Set(info.tokens);
                  if (isSubset(kSet, remSetB)) {
                    if (
                      !bestB ||
                      info.count > bestB.count ||
                      (info.count === bestB.count &&
                        info.upvotes > bestB.upvotes) ||
                      (info.count === bestB.count &&
                        info.upvotes === bestB.upvotes &&
                        info.tokens.length > bestB.tokens.length)
                    ) {
                      bestB = {
                        key: k,
                        count: info.count,
                        upvotes: info.upvotes,
                        tokens: info.tokens,
                      };
                    }
                  }
                }
              }
              if (bestB && bestB.key !== keyFromTokens(rTokens)) {
                const oldName = m.restaurant_name;
                m.restaurant_name = bestB.key;
                this.logger.debug(
                  'Post-level normalization (cross-mention): restaurant_name rewritten',
                  {
                    correlationId: CorrelationUtils.getCorrelationId(),
                    postId,
                    sourceId: m.source_id,
                    from: oldName,
                    to: m.restaurant_name,
                  },
                );
              }
            }
          }

        }
      } catch (e) {
        this.logger.debug('Post-level normalization skipped due to error', {
          correlationId: CorrelationUtils.getCorrelationId(),
          error: { message: e instanceof Error ? e.message : String(e) },
        });
      }

      // Drop mentions whose restaurant_name collapses to the same tokens as the food/category
      llmOutput.mentions = llmOutput.mentions.filter((mention) => {
        const restaurantTokens = tokenize(mention.restaurant_name);
        if (restaurantTokens.length === 0) {
          this.logger.debug(
            'Dropping mention with empty restaurant name tokens',
            {
              correlationId: CorrelationUtils.getCorrelationId(),
              sourceId: mention?.source_id,
              originalRestaurantName: mention?.restaurant_name,
            },
          );
          return false;
        }

        const foodTokenSet = new Set<string>();
        for (const token of tokenize(mention.food_name)) {
          foodTokenSet.add(token);
        }
        if (Array.isArray(mention.food_categories)) {
          for (const cat of mention.food_categories) {
            tokenize(cat).forEach((token) => foodTokenSet.add(token));
          }
        }

        if (foodTokenSet.size === 0) {
          return true;
        }

        const restSet = new Set(restaurantTokens);
        if (restSet.size !== foodTokenSet.size) {
          return true;
        }
        for (const t of restSet) {
          if (!foodTokenSet.has(t)) {
            return true;
          }
        }

        const postId = idToPostId.get(mention?.source_id);
        const stats = postId ? postNormalizationStats.get(postId) : null;
        const hasLongerVariant = stats?.nameCounts
          ? Array.from(stats.nameCounts.values()).some((info) => {
              if (info.tokens.length <= restaurantTokens.length) {
                return false;
              }
              const infoSet = new Set(info.tokens);
              return restaurantTokens.every((token) => infoSet.has(token));
            })
          : false;

        if (hasLongerVariant) {
          return true;
        }

        this.logger.debug(
          'Dropping mention with restaurant name identical to food/category tokens',
          {
            correlationId: CorrelationUtils.getCorrelationId(),
            sourceId: mention?.source_id,
            restaurantName: mention.restaurant_name,
            foodName: mention.food_name,
            foodCategories: mention.food_categories,
          },
        );
        return false;
      });

      // Provide the full mention set for downstream analysis
      const rawMentionsSample = [...llmOutput.mentions];

      const llmProcessingTime = Date.now() - llmStartTime;
      const dbStartTime = Date.now();

      // Step 4: Use clean interface - pass LLM output directly to database service
      const dbResult = await this.unifiedProcessingService.processLLMOutput({
        mentions: llmOutput.mentions,
        sourceMetadata: {
          batchId,
          collectionType: 'chronological',
          subreddit,
          sourceBreakdown: {
            pushshift_archive: 0,
            reddit_api_chronological: llmPosts.length,
            reddit_api_keyword_search: 0,
            reddit_api_on_demand: 0,
          },
          temporalRange: {
            earliest: Math.min(
              ...llmPosts.map((p: any) => new Date(p.created_at).getTime()),
            ),
            latest: Math.max(
              ...llmPosts.map((p: any) => new Date(p.created_at).getTime()),
            ),
          },
        },
      });

      const dbProcessingTime = Date.now() - dbStartTime;

      // NOTE: Temporary QA instrumentation below to sample raw LLM mentions for analysis.
      // Temporary until LLM extraction is fully optimized.
      return {
        batchId,
        parentJobId,
        collectionType: 'chronological',
        success: true,
        metrics: {
          postsProcessed: postIds.length,
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
        },
        rawMentionsSample, // unchanged mention objects, limited subset for analysis
      };
    } catch (error) {
      const processingTime = Date.now() - llmStartTime;

      this.logger.error('Chronological batch processing failed', {
        correlationId,
        batchId,
        subreddit,
        postCount: postIds.length,
        processingTimeMs: processingTime,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error; // Let Bull handle retries
    }
  }
}
