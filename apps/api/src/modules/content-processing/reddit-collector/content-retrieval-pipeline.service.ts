/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { RedditService } from '../../external-integrations/reddit/reddit.service';
import {
  LLMInputDto,
  LLMPostDto,
  LLMCommentDto,
} from '../../external-integrations/llm/dto';
import { AppException } from '../../../shared/exceptions/app-exception.base';
import { HttpStatus } from '@nestjs/common';

/**
 * Content Retrieval Pipeline Exceptions
 */
export class ContentRetrievalException extends AppException {
  readonly errorCode = 'CONTENT_RETRIEVAL_ERROR';
  readonly isOperational = true;

  constructor(message: string, context?: Record<string, any>, cause?: Error) {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR, context, cause);
  }
}

export class ContentValidationException extends AppException {
  readonly errorCode = 'CONTENT_VALIDATION_ERROR';
  readonly isOperational = true;

  constructor(message: string, context?: Record<string, any>, cause?: Error) {
    super(message, HttpStatus.BAD_REQUEST, context, cause);
  }
}

/**
 * Content Retrieval Pipeline Service
 *
 * Implements PRD Section 5.1.2 and 6.1 content retrieval pipeline requirements.
 * Orchestrates Reddit API content retrieval and transforms data into LLM-ready format.
 *
 * Key responsibilities:
 * - Fetch complete posts and comment threads from Reddit API
 * - Transform Reddit data into LLM input format (PRD Section 6.3.1)
 * - Maintain hierarchical comment relationships
 * - Handle error scenarios for incomplete or deleted content
 * - Provide performance monitoring and success rate tracking
 */
@Injectable()
export class ContentRetrievalPipelineService implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    private readonly redditService: RedditService,
    private readonly loggerService: LoggerService,
  
  ) {} 

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('ContentRetrievalPipeline');
  }

  /**
   * Retrieve and structure content for LLM processing
   * Implements PRD Section 6.1 Step 2b - Reddit API Collection
   */
  async retrieveContentForLLM(
    subreddit: string,
    postIds: string[],
    options: {
      limit?: number;
      sort?: 'new' | 'old' | 'top' | 'controversial';
      depth?: number;
      delayBetweenRequests?: number;
    } = {},
  ): Promise<{
    llmInput: LLMInputDto;
    metadata: {
      totalPosts: number;
      totalComments: number;
      successfulRetrievals: number;
      failedRetrievals: number;
      averageThreadDepth: number;
    };
    performance: {
      totalResponseTime: number;
      averageResponseTime: number;
      apiCallsUsed: number;
      rateLimitHits: number;
    };
    attribution: {
      sourceUrls: string[];
      retrievalTimestamp: Date;
    };
  }> {
    this.logger.info('Starting content retrieval for LLM processing', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'retrieve_content_for_llm',
      subreddit,
      postCount: postIds.length,
      options,
    });

    const startTime = Date.now();

    try {
      // Fetch posts and comments using Reddit API
      const batchResult = await this.redditService.fetchPostsBatch(
        subreddit,
        postIds,
        options,
      );

      // Transform Reddit data to LLM format
      const llmPosts: LLMPostDto[] = [];
      const allSourceUrls: string[] = [];
      let totalThreadDepth = 0;
      let validThreads = 0;

      for (const postId of postIds) {
        try {
          const post = batchResult.posts[postId];
          const comments = batchResult.comments[postId];
          const postUrl = batchResult.attribution.postUrls[postId];
          const commentUrls = batchResult.attribution.commentUrls[postId];

          if (!post) {
            this.logger.warn(`Skipping post ${postId} - not retrieved`, {
              correlationId: CorrelationUtils.getCorrelationId(),
              operation: 'retrieve_content_for_llm',
              postId,
            });
            continue;
          }

          // Transform post to LLM format
          const llmPost = this.transformPostToLLMFormat(
            post,

            comments || [],
            postUrl,
            commentUrls || [],
          );

          llmPosts.push(llmPost);
          allSourceUrls.push(postUrl);
          allSourceUrls.push(...(commentUrls || []));

          // Track thread depth for metadata

          const threadDepth = this.calculateThreadDepth(comments || []);
          totalThreadDepth += threadDepth;
          validThreads++;
        } catch (error) {
          this.logger.error(
            `Failed to transform post ${postId} to LLM format`,
            {
              correlationId: CorrelationUtils.getCorrelationId(),
              operation: 'retrieve_content_for_llm',
              postId,
              error: error instanceof Error ? error.message : String(error),
            },
          );
        }
      }

      if (llmPosts.length === 0) {
        throw new ContentRetrievalException(
          'No valid posts retrieved for LLM processing',
          {
            subreddit,
            postIds,
            batchErrors: batchResult.errors,
          },
        );
      }

      const averageThreadDepth =
        validThreads > 0 ? totalThreadDepth / validThreads : 0;

      return {
        llmInput: { posts: llmPosts },
        metadata: {
          totalPosts: postIds.length,
          totalComments: batchResult.metadata.totalComments,
          successfulRetrievals: batchResult.metadata.successfulRetrievals,
          failedRetrievals: batchResult.metadata.failedRetrievals,
          averageThreadDepth,
        },
        performance: {
          totalResponseTime: Date.now() - startTime,
          averageResponseTime: batchResult.performance.averageResponseTime,
          apiCallsUsed: batchResult.performance.apiCallsUsed,
          rateLimitHits: batchResult.performance.rateLimitHits,
        },
        attribution: {
          sourceUrls: allSourceUrls,
          retrievalTimestamp: new Date(),
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Content retrieval failed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'retrieve_content_for_llm',
        error: errorMessage,
        subreddit,
        postIds,
      });

      if (error instanceof ContentRetrievalException) {
        throw error;
      }

      throw new ContentRetrievalException(
        `Content retrieval failed: ${errorMessage}`,
        { subreddit, postIds },
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Transform Reddit post and comments to LLM input format
   * Implements PRD Section 6.3.1 LLM Input Structure
   */

  private transformPostToLLMFormat(
    post: any,
    comments: any[],
    postUrl: string,
    commentUrls: string[],
  ): LLMPostDto {
    try {
      // Transform comments with hierarchical structure
      const llmComments = this.transformCommentsToLLMFormat(
        comments,
        commentUrls,
      );

      // Create LLM post object

      const llmPost: LLMPostDto = {
        id: `t3_${post.id || ''}`, // Add Reddit post prefix

        title: post.title || '',

        content: post.selftext || post.title || '',

        subreddit: post.subreddit || '',
        author: post.author || 'unknown', // Add author field
        url: postUrl,

        score: typeof post.score === 'number' ? Math.max(0, post.score) : 0, // Use score instead of upvotes

        created_at: this.formatTimestamp(post.created_utc),
        comments: llmComments,
      };

      return llmPost;
    } catch (error) {
      throw new ContentValidationException(
        `Failed to transform post to LLM format: ${error instanceof Error ? error.message : 'Unknown error'}`,

        { postId: post?.id },
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Transform Reddit comments to LLM format with hierarchical preservation
   * Maintains parent-child relationships for thread context
   */

  private transformCommentsToLLMFormat(
    comments: any[],
    commentUrls: string[],
  ): LLMCommentDto[] {
    const llmComments: LLMCommentDto[] = [];
    const urlMap = new Map<string, string>();

    // Create URL mapping for quick lookup
    commentUrls.forEach((url) => {
      const match = url.match(/\/comments\/.*?\/_\/(\w+)/);
      if (match) {
        urlMap.set(match[1], url);
      }
    });

    const transformComment = (comment: any): LLMCommentDto | null => {
      if (!comment?.data?.id || !comment?.data?.body) {
        return null;
      }

      const commentData = comment.data;

      // Skip deleted/removed comments

      if (
        commentData.body === '[deleted]' ||
        commentData.body === '[removed]' ||
        commentData.author === '[deleted]'
      ) {
        return null;
      }

      try {
        return {
          id: `t1_${commentData.id}`, // Add Reddit comment prefix

          content: commentData.body,

          author: commentData.author || 'unknown',

          score: // Use score instead of upvotes
            typeof commentData.score === 'number'
              ? Math.max(0, commentData.score)
              : 0,

          created_at: this.formatTimestamp(commentData.created_utc),

          parent_id: this.extractParentId(commentData.parent_id),

          url: urlMap.get(commentData.id) || '',
        };
      } catch (error) {
        this.logger.warn('Failed to transform comment', {
          correlationId: CorrelationUtils.getCorrelationId(),

          commentId: commentData.id,
          error: error instanceof Error ? error.message : String(error),
        } as any);
        return null;
      }
    };

    const processCommentList = (commentList: any[]) => {
      commentList.forEach((comment) => {
        const llmComment = transformComment(comment);
        if (llmComment) {
          llmComments.push(llmComment);
        }

        // Process replies recursively

        if (comment?.data?.replies?.data?.children) {
          processCommentList(comment.data.replies.data.children);
        }
      });
    };

    processCommentList(comments);
    return llmComments;
  }

  /**
   * Calculate maximum thread depth for metadata
   */

  private calculateThreadDepth(comments: any[]): number {
    let maxDepth = 0;

    const calculateDepth = (commentList: any[], currentDepth = 0) => {
      maxDepth = Math.max(maxDepth, currentDepth);

      commentList.forEach((comment) => {
        if (comment?.data?.replies?.data?.children) {
          calculateDepth(comment.data.replies.data.children, currentDepth + 1);
        }
      });
    };

    calculateDepth(comments);
    return maxDepth;
  }

  /**
   * Format Reddit timestamp for LLM processing
   */
  private formatTimestamp(timestamp: number | string): string {
    try {
      const ts =
        typeof timestamp === 'string' ? parseFloat(timestamp) : timestamp;
      if (isNaN(ts)) {
        return new Date().toISOString();
      }
      return new Date(ts * 1000).toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  /**
   * Extract parent comment ID from Reddit format (keep prefixes)
   */
  private extractParentId(parentId?: string): string | null {
    if (!parentId) return null;

    // Reddit parent IDs come in format "t1_commentid" or "t3_postid"
    // Keep the prefixes to denote type (t1_ for comment, t3_ for post)
    if (parentId.startsWith('t1_') || parentId.startsWith('t3_')) {
      return parentId; // Keep the full ID with prefix
    }

    // If it's a top-level comment (parent is post), return null
    return null;
  }

  /**
   * Retrieve single post content for LLM processing
   * Convenience method for single post retrieval
   */
  async retrieveSinglePostForLLM(
    subreddit: string,
    postId: string,
    options: {
      limit?: number;
      sort?: 'new' | 'old' | 'top' | 'controversial';
      depth?: number;
    } = {},
  ): Promise<{
    llmInput: LLMInputDto;
    metadata: {
      totalComments: number;
      threadDepth: number;
    };
    performance: {
      responseTime: number;
      apiCallsUsed: number;
      rateLimitHit: boolean;
    };
    attribution: {
      sourceUrls: string[];
      retrievalTimestamp: Date;
    };
  }> {
    const result = await this.retrieveContentForLLM(
      subreddit,
      [postId],
      options,
    );

    return {
      llmInput: result.llmInput,
      metadata: {
        totalComments: result.metadata.totalComments,
        threadDepth: result.metadata.averageThreadDepth,
      },
      performance: {
        responseTime: result.performance.totalResponseTime,
        apiCallsUsed: result.performance.apiCallsUsed,
        rateLimitHit: result.performance.rateLimitHits > 0,
      },
      attribution: result.attribution,
    };
  }
}
