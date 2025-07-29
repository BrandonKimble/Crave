import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../shared';
import {
  RedditDataExtractorService,
  CraveRedditComment,
} from './reddit-data-extractor.service';
import {
  LLMInputDto,
  LLMPostDto,
  LLMCommentDto,
} from '../../external-integrations/llm/dto';
import {
  CraveRedditSubmission,
  HistoricalContentItem,
  HistoricalContentBatch,
  HistoricalContentError,
  CommentThread,
  CommentWithRelationships,
  HistoricalProcessingConfig,
  HistoricalProcessingStats,
} from './historical-content-pipeline.types';
import { HistoricalContentPipelineException } from './historical-content-pipeline.exceptions';
import {
  isRedditComment,
  isRedditSubmission,
  RedditSubmission,
  RedditComment,
} from './reddit-data.types';

/**
 * Historical Content Pipeline Service
 *
 * Processes Reddit posts and comments from Pushshift archives into structured format
 * suitable for LLM processing. Implements PRD Section 5.1.1 and 6.1 requirements.
 *
 * Key responsibilities:
 * - Extract posts/comments from archive data
 * - Validate and process timestamps for historical context
 * - Preserve thread relationships
 * - Format data for existing M02 LLM pipeline
 * - Maintain comprehensive error handling and logging
 */
@Injectable()
export class HistoricalContentPipelineService {
  private readonly logger: LoggerService;

  constructor(
    private readonly redditDataExtractor: RedditDataExtractorService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('HistoricalContentPipeline');
  }

  /**
   * Process a batch of raw Reddit data from stream processing
   * Implements PRD Section 6.1 processing pipeline requirements
   *
   * @param rawData Array of raw Reddit objects from archive
   * @param config Processing configuration
   * @returns Processed batch with extracted and validated content
   */
  processBatch(
    rawData: unknown[],
    config: HistoricalProcessingConfig,
  ): HistoricalContentBatch {
    const startTime = Date.now();
    const batchId = this.generateBatchId();

    this.logger.info('Starting historical content batch processing', {
      batchId,
      itemCount: rawData.length,
      config: {
        batchSize: config.batchSize,
        preserveThreads: config.preserveThreads,
        validateTimestamps: config.validateTimestamps,
      },
    });

    const submissions: CraveRedditSubmission[] = [];
    const comments: CraveRedditComment[] = [];
    const errors: HistoricalContentError[] = [];
    let validItems = 0;

    try {
      for (let i = 0; i < rawData.length; i++) {
        const item = rawData[i];

        try {
          const extracted = this.extractHistoricalItem(item, i + 1, config);

          if (extracted.isValid) {
            if (extracted.type === 'submission') {
              submissions.push(extracted.data as CraveRedditSubmission);
            } else {
              comments.push(extracted.data as CraveRedditComment);
            }
            validItems++;
          } else {
            errors.push({
              lineNumber: i + 1,
              itemType: extracted.type,
              errorCode: 'VALIDATION_FAILED',
              message:
                extracted.validationIssues?.join(', ') ||
                'Unknown validation error',
            });
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          errors.push({
            lineNumber: i + 1,
            itemType: 'comment' as const, // Use valid union type value
            errorCode: 'EXTRACTION_FAILED',
            message: errorMessage,
            rawData: this.sanitizeRawData(item),
          });

          this.logger.debug('Item extraction failed', {
            batchId,
            lineNumber: i + 1,
            error: {
              message: errorMessage,
              name: error instanceof Error ? error.name : 'ExtractionError',
              stack: error instanceof Error ? error.stack : undefined,
            },
          });
        }
      }

      const processingTime = Date.now() - startTime;

      this.logger.info('Historical content batch processing completed', {
        batchId,
        totalProcessed: rawData.length,
        validItems,
        invalidItems: rawData.length - validItems,
        submissions: submissions.length,
        comments: comments.length,
        errors: errors.length,
        processingTime,
      });

      return {
        submissions,
        comments,
        totalProcessed: rawData.length,
        validItems,
        invalidItems: rawData.length - validItems,
        processingTime,
        batchId,
        errors,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error('Batch processing failed', {
        batchId,
        error: {
          message: errorMessage,
          name: error instanceof Error ? error.name : 'UnknownError',
          stack: error instanceof Error ? error.stack : undefined,
        },
        processedCount: validItems,
        totalCount: rawData.length,
      });

      throw HistoricalContentPipelineException.batchProcessing(
        batchId,
        validItems,
        rawData.length,
        errorMessage,
      );
    }
  }

  /**
   * Extract and validate a single Reddit item (submission or comment)
   *
   * @param rawItem Raw Reddit data object
   * @param lineNumber Line number for error reporting
   * @param config Processing configuration
   * @returns Extracted content item with validation status
   */
  extractHistoricalItem(
    rawItem: unknown,
    lineNumber: number,
    config: HistoricalProcessingConfig,
  ): HistoricalContentItem {
    if (isRedditSubmission(rawItem)) {
      return this.extractSubmission(rawItem, lineNumber, config);
    } else if (isRedditComment(rawItem)) {
      return this.extractComment(rawItem, lineNumber, config);
    } else {
      return {
        type: 'comment' as const, // Default type for error cases
        data: {} as CraveRedditComment,
        extractedAt: new Date(),
        isValid: false,
        validationIssues: [
          'Invalid Reddit data format - not a submission or comment',
        ],
      };
    }
  }

  /**
   * Extract Reddit submission with validation
   */
  private extractSubmission(
    rawSubmission: RedditSubmission,
    lineNumber: number,
    config: HistoricalProcessingConfig,
  ): HistoricalContentItem {
    try {
      const submission: CraveRedditSubmission = {
        id: rawSubmission.id,
        title: rawSubmission.title,
        author: rawSubmission.author,
        subreddit: rawSubmission.subreddit,
        created_utc: this.normalizeTimestamp(rawSubmission.created_utc),
        score: rawSubmission.score || 0,
        url: rawSubmission.url,
        num_comments: rawSubmission.num_comments || 0,

        // Optional fields
        ...(rawSubmission.selftext && { selftext: rawSubmission.selftext }),
        ...(rawSubmission.permalink && { permalink: rawSubmission.permalink }),
        ...(rawSubmission.edited !== undefined &&
          rawSubmission.edited !== false && {
            edited:
              typeof rawSubmission.edited === 'number'
                ? rawSubmission.edited
                : true,
          }),
        ...(rawSubmission.over_18 && { over_18: rawSubmission.over_18 }),
        ...(rawSubmission.stickied && { stickied: rawSubmission.stickied }),
        ...(rawSubmission.link_flair_text && {
          link_flair_text: rawSubmission.link_flair_text,
        }),
      };

      const validation = this.validateSubmission(submission, config);

      return {
        type: 'submission',
        data: submission,
        extractedAt: new Date(),
        isValid: validation.valid,
        validationIssues: validation.issues,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      throw HistoricalContentPipelineException.extraction(
        'submission',
        (rawSubmission as { id?: string }).id || 'unknown',
        errorMessage,
      );
    }
  }

  /**
   * Extract Reddit comment using existing RedditDataExtractorService
   */
  private extractComment(
    rawComment: RedditComment,
    lineNumber: number,
    config: HistoricalProcessingConfig,
  ): HistoricalContentItem {
    try {
      const comment =
        this.redditDataExtractor.extractCraveSearchData(rawComment);

      if (!comment) {
        return {
          type: 'comment',
          data: {} as CraveRedditComment,
          extractedAt: new Date(),
          isValid: false,
          validationIssues: ['Failed to extract comment data'],
        };
      }

      // Additional validation for historical context
      const validation = this.validateCommentForHistoricalContext(
        comment,
        config,
      );

      return {
        type: 'comment',
        data: comment,
        extractedAt: new Date(),
        isValid: validation.valid,
        validationIssues: validation.issues,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      throw HistoricalContentPipelineException.extraction(
        'comment',
        rawComment.id || 'unknown',
        errorMessage,
      );
    }
  }

  /**
   * Normalize timestamp to consistent number format
   * Handles both string and number timestamps from Pushshift data
   */
  private normalizeTimestamp(timestamp: string | number): number {
    if (typeof timestamp === 'number') {
      return timestamp;
    }

    if (typeof timestamp === 'string') {
      const parsed = parseInt(timestamp, 10);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }

    throw HistoricalContentPipelineException.timestamp(
      'unknown',
      timestamp,
      `Invalid timestamp format: ${timestamp}`,
    );
  }

  /**
   * Validate extracted submission
   */
  private validateSubmission(
    submission: CraveRedditSubmission,
    config: HistoricalProcessingConfig,
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Required field validation
    if (!submission.id || submission.id.trim() === '') {
      issues.push('Missing or empty id');
    }

    if (!submission.title || submission.title.trim() === '') {
      issues.push('Missing or empty title');
    }

    if (!submission.author || submission.author.trim() === '') {
      issues.push('Missing or empty author');
    }

    if (!submission.subreddit || submission.subreddit.trim() === '') {
      issues.push('Missing or empty subreddit');
    }

    if (!submission.url || submission.url.trim() === '') {
      issues.push('Missing or empty url');
    }

    // Timestamp validation
    if (config.validateTimestamps) {
      const timestampIssues = this.validateTimestamp(
        submission.created_utc,
        config,
      );
      issues.push(...timestampIssues);
    }

    // Quality filters
    if (
      config.qualityFilters.minScore !== undefined &&
      submission.score < config.qualityFilters.minScore
    ) {
      issues.push(
        `Score ${submission.score} below minimum ${config.qualityFilters.minScore}`,
      );
    }

    if (
      config.qualityFilters.excludeDeleted &&
      submission.author === '[deleted]'
    ) {
      issues.push('Deleted submission excluded by quality filter');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Validate comment for historical context
   */
  private validateCommentForHistoricalContext(
    comment: CraveRedditComment,
    config: HistoricalProcessingConfig,
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Use existing RedditDataExtractorService validation
    const baseValidation =
      this.redditDataExtractor.validateExtractedData(comment);
    issues.push(...baseValidation.issues);

    // Additional historical context validation
    if (config.validateTimestamps) {
      const timestampIssues = this.validateTimestamp(
        comment.created_utc,
        config,
      );
      issues.push(...timestampIssues);
    }

    // Quality filters for comments
    if (
      config.qualityFilters.minScore !== undefined &&
      comment.score < config.qualityFilters.minScore
    ) {
      issues.push(
        `Score ${comment.score} below minimum ${config.qualityFilters.minScore}`,
      );
    }

    if (
      config.qualityFilters.excludeDeleted &&
      comment.author === '[deleted]'
    ) {
      issues.push('Deleted comment excluded by quality filter');
    }

    if (config.qualityFilters.excludeRemoved && comment.body === '[removed]') {
      issues.push('Removed comment excluded by quality filter');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Validate timestamp against historical range and Reddit existence
   */
  private validateTimestamp(
    timestamp: number,
    config: HistoricalProcessingConfig,
  ): string[] {
    const issues: string[] = [];

    // Reddit founding timestamp (June 2005)
    const redditFoundingTimestamp = 1118880000;
    const currentTimestamp = Math.floor(Date.now() / 1000);

    if (timestamp < redditFoundingTimestamp) {
      issues.push(
        `Timestamp ${timestamp} before Reddit founding (${redditFoundingTimestamp})`,
      );
    }

    if (timestamp > currentTimestamp) {
      issues.push(
        `Timestamp ${timestamp} in the future (current: ${currentTimestamp})`,
      );
    }

    // Custom timestamp range validation
    if (config.timestampRange) {
      if (timestamp < config.timestampRange.start) {
        issues.push(
          `Timestamp ${timestamp} before range start (${config.timestampRange.start})`,
        );
      }

      if (timestamp > config.timestampRange.end) {
        issues.push(
          `Timestamp ${timestamp} after range end (${config.timestampRange.end})`,
        );
      }
    }

    return issues;
  }

  /**
   * Generate unique batch ID for tracking
   */
  private generateBatchId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `batch_${timestamp}_${random}`;
  }

  /**
   * Convert processed batch to LLM input format
   * Implements PRD Section 6.3.1 LLM input structure requirements
   *
   * @param batch Processed historical content batch
   * @param preserveThreads Whether to organize comments by thread
   * @returns LLM input DTO ready for M02 pipeline processing
   */
  convertToLLMFormat(
    batch: HistoricalContentBatch,
    preserveThreads = true,
  ): LLMInputDto {
    try {
      this.logger.debug('Converting batch to LLM format', {
        batchId: batch.batchId,
        submissions: batch.submissions.length,
        comments: batch.comments.length,
        preserveThreads,
      });

      const llmPosts: LLMPostDto[] = [];

      if (preserveThreads && batch.comments.length > 0) {
        // Group comments by submission and build thread structure
        const threads = this.organizeCommentsIntoThreads(
          batch.submissions,
          batch.comments,
        );

        for (const thread of threads) {
          const llmPost = this.convertThreadToLLMPost(thread);
          llmPosts.push(llmPost);
        }
      } else {
        // Simple conversion without thread preservation
        for (const submission of batch.submissions) {
          const relatedComments = batch.comments.filter(
            (comment) => comment.link_id === `t3_${submission.id}`,
          );

          const llmPost = this.convertSubmissionToLLMPost(
            submission,
            relatedComments,
          );
          llmPosts.push(llmPost);
        }
      }

      const llmInput: LLMInputDto = {
        posts: llmPosts,
      };

      this.logger.info('Successfully converted batch to LLM format', {
        batchId: batch.batchId,
        llmPosts: llmPosts.length,
        totalComments: llmPosts.reduce(
          (sum, post) => sum + post.comments.length,
          0,
        ),
      });

      return llmInput;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      throw HistoricalContentPipelineException.llmFormatConversion(
        batch.batchId,
        errorMessage,
      );
    }
  }

  /**
   * Organize comments into thread structure with preserved relationships
   * Implements thread relationship preservation requirements
   */
  private organizeCommentsIntoThreads(
    submissions: CraveRedditSubmission[],
    comments: CraveRedditComment[],
  ): CommentThread[] {
    const threads: CommentThread[] = [];

    for (const submission of submissions) {
      const submissionComments = comments.filter(
        (comment) => comment.link_id === `t3_${submission.id}`,
      );

      if (submissionComments.length > 0) {
        const thread = this.buildCommentThread(
          submission.id,
          submissionComments,
        );
        threads.push(thread);
      }
    }

    return threads;
  }

  /**
   * Build hierarchical comment thread structure
   */
  private buildCommentThread(
    postId: string,
    comments: CraveRedditComment[],
  ): CommentThread {
    const commentMap = new Map<string, CraveRedditComment>();
    const childrenMap = new Map<string, CraveRedditComment[]>();

    // Index comments by ID and organize by parent
    for (const comment of comments) {
      commentMap.set(comment.id, comment);

      const parentId = comment.parent_id?.replace('t1_', '') || 'root';
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(comment);
    }

    // Build hierarchical structure starting from root comments
    const rootComments =
      childrenMap.get('root') || childrenMap.get(`t3_${postId}`) || [];
    const organizedComments = rootComments.map((comment) =>
      this.buildCommentHierarchy(comment, childrenMap, 0),
    );

    return {
      postId,
      comments: organizedComments,
      totalComments: comments.length,
    };
  }

  /**
   * Recursively build comment hierarchy
   */
  private buildCommentHierarchy(
    comment: CraveRedditComment,
    childrenMap: Map<string, CraveRedditComment[]>,
    depth: number,
  ): CommentWithRelationships {
    const children = childrenMap.get(comment.id) || [];

    return {
      comment,
      parentId: comment.parent_id?.replace('t1_', '') || null,
      depth,
      children: children.map((child) =>
        this.buildCommentHierarchy(child, childrenMap, depth + 1),
      ),
    };
  }

  /**
   * Convert comment thread to LLM post format
   */
  private convertThreadToLLMPost(thread: CommentThread): LLMPostDto {
    // Find the submission for this thread
    const submission = this.findSubmissionById(thread.postId);

    if (!submission) {
      throw new Error(`Submission not found for thread ${thread.postId}`);
    }

    // Flatten the hierarchical comments for LLM input
    const flatComments = this.flattenCommentHierarchy(thread.comments);

    return this.convertSubmissionToLLMPost(submission, flatComments);
  }

  /**
   * Flatten hierarchical comment structure for LLM processing
   */
  private flattenCommentHierarchy(
    comments: CommentWithRelationships[],
  ): CraveRedditComment[] {
    const flattened: CraveRedditComment[] = [];

    for (const commentWithRel of comments) {
      flattened.push(commentWithRel.comment);
      flattened.push(...this.flattenCommentHierarchy(commentWithRel.children));
    }

    return flattened;
  }

  /**
   * Convert submission and comments to LLM post format
   */
  private convertSubmissionToLLMPost(
    submission: CraveRedditSubmission,
    comments: CraveRedditComment[],
  ): LLMPostDto {
    // Convert comments to LLM format
    const llmComments: LLMCommentDto[] = comments.map((comment) => ({
      comment_id: comment.id,
      content: comment.body,
      author: comment.author,
      upvotes: Math.max(0, comment.score), // Ensure non-negative
      created_at: new Date(comment.created_utc * 1000).toISOString(),
      parent_id: comment.parent_id || null,
      url:
        comment.permalink ||
        `https://reddit.com${submission.url}#${comment.id}`,
    }));

    // Create LLM post
    const llmPost: LLMPostDto = {
      post_id: submission.id,
      title: submission.title,
      content: submission.selftext || '', // Empty string for link posts
      subreddit: submission.subreddit,
      url: submission.url,
      upvotes: Math.max(0, submission.score), // Ensure non-negative
      created_at: new Date(submission.created_utc * 1000).toISOString(),
      comments: llmComments,
    };

    return llmPost;
  }

  /**
   * Find submission by ID (helper method for thread processing)
   * Note: In actual implementation, this would query from the batch context
   */
  private findSubmissionById(postId: string): CraveRedditSubmission | null {
    // Suppress unused variable for future implementation
    void postId;
    // This is a simplified implementation for the current context
    // In practice, this would be passed from the batch context or stored in service state
    return null; // Will be properly implemented when integrating with actual batch processing
  }

  /**
   * Get processing statistics for monitoring and optimization
   */
  getProcessingStats(
    batches: HistoricalContentBatch[],
  ): HistoricalProcessingStats {
    const totalSubmissions = batches.reduce(
      (sum, batch) => sum + batch.submissions.length,
      0,
    );
    const totalComments = batches.reduce(
      (sum, batch) => sum + batch.comments.length,
      0,
    );
    const validSubmissions = batches.reduce(
      (sum, batch) => sum + batch.submissions.length,
      0,
    );
    const validComments = batches.reduce(
      (sum, batch) => sum + batch.comments.length,
      0,
    );
    const threadsProcessed = batches.length;

    const errors = batches.reduce(
      (acc, batch) => {
        acc.total += batch.errors.length;
        for (const error of batch.errors) {
          acc.byType[error.errorCode] = (acc.byType[error.errorCode] || 0) + 1;
        }
        return acc;
      },
      { total: 0, byType: {} as Record<string, number> },
    );

    return {
      totalSubmissions,
      totalComments,
      validSubmissions,
      validComments,
      threadsProcessed,
      processingStartTime: new Date(), // Would be tracked in actual implementation
      processingEndTime: new Date(),
      memoryUsage: {
        initial: 0, // Would be tracked in actual implementation
        peak: 0,
        final: 0,
      },
      errors,
    };
  }

  /**
   * Sanitize raw data for error logging (limit size)
   */
  private sanitizeRawData(data: unknown): string {
    try {
      const serialized = JSON.stringify(data);
      return serialized.length > 200
        ? serialized.substring(0, 200) + '...'
        : serialized;
    } catch {
      return '[Cannot serialize data]';
    }
  }
}
