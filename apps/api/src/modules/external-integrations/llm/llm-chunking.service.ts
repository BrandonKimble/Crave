import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { LLMInputDto } from './dto/llm-input.dto';
import { LLMCommentDto } from './dto/llm-input.dto';

const DEFAULT_MAX_CHUNK_COMMENTS = 80;
const DEFAULT_MAX_CHUNK_CHAR_LENGTH = 12000;
const DEFAULT_MAX_CHUNK_TOKEN_ESTIMATE = 35000;

/**
 * Chunk metadata for tracking processing information
 */
export interface ChunkMetadata {
  chunkId: string;
  commentCount: number;
  rootCommentScore: number;
  estimatedProcessingTime: number;
  threadRootId: string;
  rootCommentIds?: string[];
  rootCommentScores?: number[];
  postId?: string;
  postChunkIndex?: number;
  estimatedTokenCount?: number;
}

/**
 * Result structure for chunking operation
 */
export interface ChunkResult {
  chunks: LLMInputDto[];
  metadata: ChunkMetadata[];
}

/**
 * LLM Chunking Service
 *
 * Implements context-aware chunking strategy for Reddit post data:
 * - Each chunk = 1 top-level comment + all its replies + post context
 * - Maintains "top" sorting order (most valuable content first)
 * - Preserves referential context completely
 * - Handles variable chunk sizes gracefully (1 to 50+ comments per chunk)
 */
@Injectable()
export class LLMChunkingService implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit() {
    this.logger = this.loggerService.setContext('LlmChunking');
  }

  private getChunkingLimits(): {
    maxCommentsPerChunk: number;
    maxCharsPerChunk: number;
    maxTokensPerChunk: number;
  } {
    const parsePositiveInt = (value: string | undefined, fallback: number) => {
      const parsed = Number.parseInt(value ?? '', 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };

    return {
      maxCommentsPerChunk: parsePositiveInt(
        process.env.LLM_MAX_CHUNK_COMMENTS,
        DEFAULT_MAX_CHUNK_COMMENTS,
      ),
      maxCharsPerChunk: parsePositiveInt(
        process.env.LLM_MAX_CHUNK_CHARS,
        DEFAULT_MAX_CHUNK_CHAR_LENGTH,
      ),
      maxTokensPerChunk: parsePositiveInt(
        process.env.LLM_CHUNK_TARGET_TOKENS,
        DEFAULT_MAX_CHUNK_TOKEN_ESTIMATE,
      ),
    };
  }

  private estimateTokensFromChars(charCount: number): number {
    if (!Number.isFinite(charCount) || charCount <= 0) {
      return 0;
    }
    return Math.max(1, Math.floor(charCount / 4));
  }

  /**
   * Create context-preserving chunks from Reddit post data
   * Maintains "top" sorting order to process most valuable content first
   *
   * OPTIMIZATION: Uses lightweight post objects in chunks 2+ to save ~1,000 tokens per batch.
   * First chunk includes full post for extraction, subsequent chunks exclude unnecessary metadata.
   *
   * @param llmInput - Multiple posts with all comments (processes all posts)
   * @returns ChunkResult with chunks and metadata
   */
  createContextualChunks(llmInput: LLMInputDto): ChunkResult {
    const chunks: LLMInputDto[] = [];
    const chunkMetadata: ChunkMetadata[] = [];

    if (!llmInput.posts || llmInput.posts.length === 0) {
      this.logger.warn('No posts provided for chunking', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'create_contextual_chunks',
      });
      return { chunks: [], metadata: [] };
    }

    this.logger.debug('Creating chunks from multiple posts', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'create_contextual_chunks',
      totalPosts: llmInput.posts.length,
      postIds: llmInput.posts.map((p) => p.id),
      totalComments: llmInput.posts.reduce(
        (sum, p) => sum + (p.comments?.length || 0),
        0,
      ),
    });

    // Process each post individually
    for (let postIndex = 0; postIndex < llmInput.posts.length; postIndex++) {
      const post = llmInput.posts[postIndex];

      this.logger.debug(
        `Processing post ${postIndex + 1}/${llmInput.posts.length}`,
        {
          correlationId: CorrelationUtils.getCorrelationId(),
          postId: post.id,
          postTitle: post.title,
          commentCount: post.comments?.length || 0,
        },
      );

      if (!post.comments || post.comments.length === 0) {
        const postContextCharLength =
          (post.title?.length || 0) + (post.content?.length || 0);
        const postTokens = this.estimateTokensFromChars(postContextCharLength);
        this.logger.debug(
          'No comments to chunk, adding single chunk with post only',
          {
            correlationId: CorrelationUtils.getCorrelationId(),
            postId: post.id,
          },
        );

        chunks.push({
          posts: [
            {
              id: post.id,
              extract_from_post: true, // Always extract from posts that have no comments
              title: post.title,
              content: post.content,
              subreddit: post.subreddit,
              author: post.author,
              url: post.url,
              score: post.score,
              created_at: post.created_at,
              comments: [],
            },
          ],
        });

        chunkMetadata.push({
          chunkId: `chunk_post_${post.id}`,
          commentCount: 0,
          rootCommentScore: 0,
          estimatedProcessingTime: 5, // Base processing time for post only
          threadRootId: post.id,
          postId: post.id,
          postChunkIndex: 0,
          estimatedTokenCount: postTokens,
        });

        continue; // Continue to next post instead of returning
      }

      // Get top-level comments (parent_id is null or points to post)
      // Comments should already be sorted by "top" from Reddit API
      const topLevelComments = post.comments
        .filter(
          (c) =>
            c.parent_id === null ||
            c.parent_id === post.id ||
            c.parent_id === post.id.replace('t3_', ''),
        )
        .sort((a, b) => b.score - a.score); // Ensure top-scored first

      this.logger.debug('Creating chunks from top comments', {
        correlationId: CorrelationUtils.getCorrelationId(),
        postId: post.id,
        totalTopLevel: topLevelComments.length,
        totalComments: post.comments.length,
        topScores: topLevelComments.slice(0, 5).map((c) => c.score),
      });

      const postChunkStartIndex = chunks.length;
      const postMetadataStartIndex = chunkMetadata.length;
      const { maxCommentsPerChunk, maxCharsPerChunk, maxTokensPerChunk } =
        this.getChunkingLimits();
      const softTokenThreshold = Math.max(
        1000,
        Math.floor(maxTokensPerChunk * 0.8),
      );
      const postContextCharLength =
        (post.title?.length || 0) + (post.content?.length || 0);

      type ThreadInfo = {
        topComment: LLMCommentDto;
        threadComments: LLMCommentDto[];
        commentCount: number;
        charLength: number;
        rootScore: number;
      };

      const threadInfos: ThreadInfo[] = topLevelComments.map((topComment) => {
        const threadComments = this.getFullThread(topComment, post.comments);
        const charLength = threadComments.reduce((sum, comment) => {
          return sum + (comment.content?.length || 0);
        }, 0);

        return {
          topComment,
          threadComments,
          commentCount: threadComments.length,
          charLength,
          rootScore: topComment.score,
        };
      });

      type ThreadGroup = {
        threads: ThreadInfo[];
        commentCount: number;
        charLength: number;
      };

      const groupedThreads: ThreadGroup[] = [];
      let currentGroup: ThreadGroup | null = null;
      let chunkSequenceForPost = 0;

      for (const thread of threadInfos) {
        if (!currentGroup) {
          currentGroup = {
            threads: [thread],
            commentCount: thread.commentCount,
            charLength: postContextCharLength + thread.charLength,
          };
          continue;
        }

        const proposedCommentCount =
          currentGroup.commentCount + thread.commentCount;
        const proposedCharLength = currentGroup.charLength + thread.charLength;
        const proposedTokenEstimate =
          this.estimateTokensFromChars(proposedCharLength);

        const exceedsLimits =
          proposedCharLength > maxCharsPerChunk ||
          proposedTokenEstimate > maxTokensPerChunk ||
          (proposedCommentCount > maxCommentsPerChunk &&
            proposedTokenEstimate >= softTokenThreshold);

        if (exceedsLimits) {
          groupedThreads.push(currentGroup);
          currentGroup = {
            threads: [thread],
            commentCount: thread.commentCount,
            charLength: postContextCharLength + thread.charLength,
          };
        } else {
          currentGroup.threads.push(thread);
          currentGroup.commentCount = proposedCommentCount;
          currentGroup.charLength = proposedCharLength;
        }
      }

      if (currentGroup) {
        groupedThreads.push(currentGroup);
      }

      groupedThreads.forEach((group, groupIndex) => {
        const shouldExtractFromPost = groupIndex === 0;
        const chunkPost = shouldExtractFromPost
          ? {
              id: post.id,
              extract_from_post: true,
              title: post.title,
              content: post.content,
              subreddit: post.subreddit,
              author: post.author,
              url: post.url,
              score: post.score,
              created_at: post.created_at,
              comments: [],
            }
          : {
              id: post.id,
              extract_from_post: false,
              title: post.title,
              content: post.content,
              subreddit: post.subreddit,
              author: post.author,
              url: post.url,
              score: post.score,
              created_at: post.created_at,
              comments: [],
            };

        const combinedComments = group.threads.flatMap(
          (thread) => thread.threadComments,
        );
        const rootCommentIds = group.threads.map(
          (thread) => thread.topComment.id,
        );
        const rootCommentScores = group.threads.map(
          (thread) => thread.rootScore,
        );
        const commentCount = combinedComments.length;
        const chunkId =
          group.threads.length === 1
            ? `chunk_${rootCommentIds[0]}`
            : `chunk_${post.id}_group_${groupIndex + 1}`;
        const tokenEstimate = this.estimateTokensFromChars(group.charLength);

        chunks.push({
          posts: [
            {
              ...chunkPost,
              comments: combinedComments,
            },
          ],
        });

        chunkMetadata.push({
          chunkId,
          commentCount,
          rootCommentScore: Math.max(...rootCommentScores),
          estimatedProcessingTime: commentCount * 6.4,
          threadRootId:
            group.threads.length === 1
              ? rootCommentIds[0]
              : `group:${rootCommentIds.join(',')}`,
          rootCommentIds,
          rootCommentScores,
          postId: post.id,
          postChunkIndex: chunkSequenceForPost++,
          estimatedTokenCount: tokenEstimate,
        });
      });

      // Handle orphaned comments for this post (defensive programming)
      const thisPostChunks = chunks.slice(postChunkStartIndex);

      const processedCommentIds = new Set<string>();
      thisPostChunks.forEach((chunk) => {
        chunk.posts[0].comments.forEach((comment) => {
          processedCommentIds.add(comment.id);
        });
      });

      const orphanedComments = post.comments.filter(
        (c) => !processedCommentIds.has(c.id),
      );
      if (orphanedComments.length > 0) {
        const orphanCharLength =
          postContextCharLength +
          orphanedComments.reduce(
            (sum, comment) => sum + (comment.content?.length || 0),
            0,
          );
        const orphanTokens = this.estimateTokensFromChars(orphanCharLength);

        this.logger.debug('Found orphaned comments, adding as separate chunk', {
          correlationId: CorrelationUtils.getCorrelationId(),
          postId: post.id,
          orphanedCount: orphanedComments.length,
          orphanedIds: orphanedComments.slice(0, 5).map((c) => c.id),
        });

        // Orphaned comments get lightweight post context
        chunks.push({
          posts: [
            {
              // Lightweight post object for orphaned chunk
              id: post.id,
              extract_from_post: false, // PROMINENT: Never extract from post in orphaned chunk
              title: post.title,
              content: post.content, // Keep for context
              subreddit: post.subreddit, // Keep for references
              author: post.author, // Keep author field
              url: post.url,
              score: post.score,
              created_at: post.created_at,
              comments: orphanedComments,
            },
          ],
        });

        chunkMetadata.push({
          chunkId: `chunk_orphaned_${post.id}`,
          commentCount: orphanedComments.length,
          rootCommentScore: Math.max(
            ...orphanedComments.map((c) => c.score || 0),
          ),
          estimatedProcessingTime: orphanedComments.length * 6.4,
          threadRootId: 'orphaned',
          postId: post.id,
          postChunkIndex: chunkSequenceForPost++,
          estimatedTokenCount: orphanTokens,
        });
      }

      // Log chunk distribution analysis for this post
      const postChunkMetadata = chunkMetadata.slice(postMetadataStartIndex);
      const chunkSizes = postChunkMetadata.map((m) => m.commentCount);
      const totalChunkComments = chunkSizes.reduce(
        (sum, size) => sum + size,
        0,
      );
      const aggregatedRootScores = postChunkMetadata.flatMap((meta) =>
        Array.isArray(meta.rootCommentScores) &&
        meta.rootCommentScores.length > 0
          ? meta.rootCommentScores
          : [meta.rootCommentScore],
      );

      if (postChunkMetadata.length > 0) {
        this.logger.debug('Chunk distribution analysis for post', {
          correlationId: CorrelationUtils.getCorrelationId(),
          postId: post.id,
          postIndex: postIndex + 1,
          totalPostChunks: postChunkMetadata.length,
          chunkSizes,
          averageChunkSize: totalChunkComments / postChunkMetadata.length || 0,
          largestChunk: Math.max(...chunkSizes),
          smallestChunk: Math.min(...chunkSizes),
          topRootScores: aggregatedRootScores.slice(0, 10),
          estimatedTotalTime: Math.max(
            ...postChunkMetadata.map((m) => m.estimatedProcessingTime),
          ),
        });
      }
    } // End of post processing loop

    // Final summary logging for all posts
    const totalChunkSizes = chunkMetadata.map((m) => m.commentCount);
    const totalComments = totalChunkSizes.reduce((sum, size) => sum + size, 0);
    const allRootScores = chunkMetadata.flatMap((meta) =>
      Array.isArray(meta.rootCommentScores) && meta.rootCommentScores.length > 0
        ? meta.rootCommentScores
        : [meta.rootCommentScore],
    );

    this.logger.debug('Final chunk distribution analysis - all posts', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'create_contextual_chunks',
      totalPosts: llmInput.posts.length,
      totalChunks: chunks.length,
      totalComments,
      chunkSizes: totalChunkSizes,
      averageChunkSize: chunks.length > 0 ? totalComments / chunks.length : 0,
      largestChunk:
        totalChunkSizes.length > 0 ? Math.max(...totalChunkSizes) : 0,
      smallestChunk:
        totalChunkSizes.length > 0 ? Math.min(...totalChunkSizes) : 0,
      topRootScores: allRootScores.slice(0, 10),
      estimatedTotalTime:
        chunkMetadata.length > 0
          ? Math.max(...chunkMetadata.map((m) => m.estimatedProcessingTime))
          : 0,
    });

    return { chunks, metadata: chunkMetadata };
  }

  /**
   * Recursively get all comments in a thread starting from a root comment
   *
   * @param root - Root comment of the thread
   * @param allComments - All comments from the post
   * @returns Array of all comments in the thread (including root)
   */
  private getFullThread(
    root: LLMCommentDto,
    allComments: LLMCommentDto[],
  ): LLMCommentDto[] {
    const thread = [root];

    // Find all direct replies to this comment
    const replies = allComments.filter((c) => c.parent_id === root.id);

    // Recursively get full threads for each reply
    for (const reply of replies) {
      thread.push(...this.getFullThread(reply, allComments));
    }

    return thread;
  }

  /**
   * Validate chunk result for debugging and monitoring
   *
   * @param original - Original LLM input
   * @param result - Chunking result
   * @returns Validation summary
   */
  validateChunking(
    original: LLMInputDto,
    result: ChunkResult,
  ): {
    isValid: boolean;
    issues: string[];
    summary: {
      originalComments: number;
      chunkedComments: number;
      chunkCount: number;
    };
  } {
    const issues: string[] = [];
    const originalComments = original.posts[0]?.comments?.length || 0;
    const chunkedComments = result.chunks.reduce(
      (sum, chunk) => sum + (chunk.posts[0]?.comments?.length || 0),
      0,
    );

    // Check comment count preservation
    if (originalComments !== chunkedComments) {
      issues.push(
        `Comment count mismatch: original ${originalComments}, chunked ${chunkedComments}`,
      );
    }

    // Check chunk metadata consistency
    const metadataComments = result.metadata.reduce(
      (sum, meta) => sum + meta.commentCount,
      0,
    );
    if (chunkedComments !== metadataComments) {
      issues.push(
        `Metadata count mismatch: chunks ${chunkedComments}, metadata ${metadataComments}`,
      );
    }

    // Check for empty chunks
    const emptyChunks = result.chunks.filter(
      (chunk) =>
        !chunk.posts[0]?.comments || chunk.posts[0].comments.length === 0,
    );
    if (emptyChunks.length > 1) {
      // Allow one empty chunk for post-only
      issues.push(
        `Found ${emptyChunks.length} empty chunks (should be max 1 for post-only)`,
      );
    }

    return {
      isValid: issues.length === 0,
      issues,
      summary: {
        originalComments,
        chunkedComments,
        chunkCount: result.chunks.length,
      },
    };
  }
}
