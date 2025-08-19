import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { LLMInputDto } from './dto/llm-input.dto';
import { LLMCommentDto } from './dto/llm-input.dto';

/**
 * Chunk metadata for tracking processing information
 */
export interface ChunkMetadata {
  chunkId: string;
  commentCount: number;
  rootCommentScore: number;
  estimatedProcessingTime: number;
  threadRootId: string;
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

    this.logger.info('Creating chunks from multiple posts', {
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

      this.logger.info(
        `Processing post ${postIndex + 1}/${llmInput.posts.length}`,
        {
          correlationId: CorrelationUtils.getCorrelationId(),
          postId: post.id,
          postTitle: post.title,
          commentCount: post.comments?.length || 0,
        },
      );

      if (!post.comments || post.comments.length === 0) {
        this.logger.info(
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

      this.logger.info('Creating chunks from top comments', {
        correlationId: CorrelationUtils.getCorrelationId(),
        postId: post.id,
        totalTopLevel: topLevelComments.length,
        totalComments: post.comments.length,
        topScores: topLevelComments.slice(0, 5).map((c) => c.score),
      });

      // Create one chunk per top-level comment thread

      for (let i = 0; i < topLevelComments.length; i++) {
        const topComment = topLevelComments[i];
        const threadComments = this.getFullThread(topComment, post.comments);

        // Create chunk with post context + this thread
        // Set extract_from_post flag: true only for first chunk of EACH post
        // Use lightweight post object for chunks after the first one (token savings)
        const isFirstChunkOfThisPost = i === 0;
        const shouldExtractFromPost = isFirstChunkOfThisPost; // Extract from first chunk of EACH post

        const chunkPost = shouldExtractFromPost
          ? {
              id: post.id,
              extract_from_post: true, // PROMINENT: Extract from post in first chunk only
              title: post.title,
              content: post.content,
              subreddit: post.subreddit,
              author: post.author,
              url: post.url,
              score: post.score,
              created_at: post.created_at,
              comments: [], // Will be set below
            }
          : {
              // Lightweight post object - exclude unnecessary metadata for token savings
              id: post.id,
              extract_from_post: false, // PROMINENT: Don't extract from post in subsequent chunks
              title: post.title,
              content: post.content, // Keep for context
              subreddit: post.subreddit, // Keep for references
              author: post.author,
              url: post.url,
              score: post.score,
              created_at: post.created_at,
              comments: [], // Will be set below
              // Exclude: author, permalink, score, created_utc (~23 tokens saved per chunk)
            };

        chunks.push({
          posts: [
            {
              ...chunkPost,
              comments: threadComments,
            },
          ],
        });

        chunkMetadata.push({
          chunkId: `chunk_${topComment.id}`,
          commentCount: threadComments.length,
          rootCommentScore: topComment.score,
          estimatedProcessingTime: threadComments.length * 6.4, // 6.4 seconds per comment
          threadRootId: topComment.id,
        });
      }

      // Handle orphaned comments for this post (defensive programming)
      const postChunksStartIndex = chunks.length - topLevelComments.length;
      const thisPostChunks = chunks.slice(postChunksStartIndex);

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
        this.logger.warn('Found orphaned comments, adding as separate chunk', {
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
        });
      }

      // Log chunk distribution analysis for this post
      const postChunkMetadata = chunkMetadata.slice(postChunksStartIndex);
      const chunkSizes = postChunkMetadata.map((m) => m.commentCount);
      const totalChunkComments = chunkSizes.reduce(
        (sum, size) => sum + size,
        0,
      );

      this.logger.info('Chunk distribution analysis for post', {
        correlationId: CorrelationUtils.getCorrelationId(),
        postId: post.id,
        postIndex: postIndex + 1,
        totalPostChunks: postChunkMetadata.length,
        chunkSizes,
        averageChunkSize: totalChunkComments / postChunkMetadata.length,
        largestChunk: Math.max(...chunkSizes),
        smallestChunk: Math.min(...chunkSizes),
        topRootScores: postChunkMetadata
          .slice(0, 10)
          .map((m) => m.rootCommentScore),
        estimatedTotalTime: Math.max(
          ...postChunkMetadata.map((m) => m.estimatedProcessingTime),
        ),
      });
    } // End of post processing loop

    // Final summary logging for all posts
    const totalChunkSizes = chunkMetadata.map((m) => m.commentCount);
    const totalComments = totalChunkSizes.reduce((sum, size) => sum + size, 0);

    this.logger.info('Final chunk distribution analysis - all posts', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'create_contextual_chunks',
      totalPosts: llmInput.posts.length,
      totalChunks: chunks.length,
      totalComments,
      chunkSizes: totalChunkSizes,
      averageChunkSize: totalComments / chunks.length,
      largestChunk: Math.max(...totalChunkSizes),
      smallestChunk: Math.min(...totalChunkSizes),
      estimatedTotalTime: Math.max(
        ...chunkMetadata.map((m) => m.estimatedProcessingTime),
      ),
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
