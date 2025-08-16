/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { LoggerService, CorrelationUtils } from '../../../shared';
import { RedditService } from '../../external-integrations/reddit/reddit.service';
import {
  LLMInputDto,
  LLMPostDto,
  LLMCommentDto,
} from '../../external-integrations/llm/dto';
import { AppException } from '../../../shared/exceptions/app-exception.base';
import { HttpStatus } from '@nestjs/common';
import { filterAndTransformToLLM } from '../../external-integrations/reddit/reddit-data-filter';

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
    @Inject(LoggerService) private readonly loggerService: LoggerService,
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

      // Transform Reddit data to LLM format
      const llmPosts: LLMPostDto[] = [];
      const allSourceUrls: string[] = [];
      let totalThreadDepth = 0;
      let validThreads = 0;

      for (const postId of postIds) {
        try {
          // Use single-pass processing for optimal performance
          const rawResult = await this.redditService.getCompletePostWithComments(
            subreddit,
            postId,
            options,
          );

          if (!rawResult.rawResponse || rawResult.rawResponse.length === 0) {
            this.logger.warn(`Skipping post ${postId} - no raw response`, {
              correlationId: CorrelationUtils.getCorrelationId(),
              operation: 'retrieve_content_for_llm',
              postId,
            });
            continue;
          }

          // Single-pass transformation using filterAndTransformToLLM
          const llmPost = this.transformResponseToLLMFormat(
            rawResult.rawResponse,
            rawResult.attribution.postUrl,
          );

          if (!llmPost) {
            this.logger.warn(`Skipping post ${postId} - transformation failed`, {
              correlationId: CorrelationUtils.getCorrelationId(),
              operation: 'retrieve_content_for_llm',
              postId,
            });
            continue;
          }

          llmPosts.push(llmPost);
          allSourceUrls.push(rawResult.attribution.postUrl);
          
          // Extract comment URLs from the transformed comments
          const commentUrls = llmPost.comments.map((comment: any) => comment.url).filter(Boolean);
          allSourceUrls.push(...commentUrls);

          // Track thread depth for metadata
          const threadDepth = this.calculateThreadDepthFromLLMComments(llmPost.comments);
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
          },
        );
      }

      const averageThreadDepth =
        validThreads > 0 ? totalThreadDepth / validThreads : 0;
      
      const totalComments = llmPosts.reduce((sum, post) => sum + post.comments.length, 0);
      const successfulRetrievals = llmPosts.length;
      const failedRetrievals = postIds.length - successfulRetrievals;

      return {
        llmInput: { posts: llmPosts },
        metadata: {
          totalPosts: postIds.length,
          totalComments,
          successfulRetrievals,
          failedRetrievals,
          averageThreadDepth,
        },
        performance: {
          totalResponseTime: Date.now() - startTime,
          averageResponseTime: (Date.now() - startTime) / postIds.length,
          apiCallsUsed: postIds.length, // One call per post
          rateLimitHits: 0, // We'd track this if needed
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
   * Single-pass transform from Reddit API response to LLM format
   * Combines filtering and transformation to eliminate double processing
   */
  private transformResponseToLLMFormat(
    redditResponse: any[],
    postUrl: string,
  ): LLMPostDto | null {
    try {
      const { post, comments } = filterAndTransformToLLM(redditResponse, postUrl);
      
      if (!post) {
        return null;
      }

      // Set comments on the post
      post.comments = comments;
      return post as LLMPostDto;
    } catch (error) {
      throw new ContentValidationException(
        `Failed to transform Reddit response to LLM format: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { postUrl },
        error instanceof Error ? error : undefined,
      );
    }
  }


  /**
   * Calculate maximum thread depth from LLM comment structure
   */
  private calculateThreadDepthFromLLMComments(comments: any[]): number {
    if (!comments || comments.length === 0) return 0;
    
    // Build parent-child mapping
    const commentMap = new Map();
    comments.forEach(comment => {
      commentMap.set(comment.id, comment);
    });
    
    // Calculate depth for each comment
    let maxDepth = 0;
    
    const getDepth = (commentId: string, visited = new Set()): number => {
      if (visited.has(commentId)) return 0; // Prevent cycles
      visited.add(commentId);
      
      const comment = commentMap.get(commentId);
      if (!comment || !comment.parent_id) return 0;
      
      const parentComment = commentMap.get(comment.parent_id);
      if (!parentComment) return 0; // Top-level comment or parent is post
      
      return 1 + getDepth(comment.parent_id, visited);
    };
    
    comments.forEach(comment => {
      const depth = getDepth(comment.id);
      maxDepth = Math.max(maxDepth, depth);
    });
    
    return maxDepth;
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
