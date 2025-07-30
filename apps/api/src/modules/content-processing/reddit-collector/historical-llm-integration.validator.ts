import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../shared';
import {
  HistoricalContentBatch,
  CraveRedditSubmission,
  CraveRedditComment,
} from './historical-content-pipeline.types';
import {
  LLMInputStructure,
  LLMOutputStructure,
} from '../../external-integrations/llm/llm.types';
import { LLMService } from '../../external-integrations/llm/llm.service';

/**
 * Historical LLM Integration Validator
 *
 * Validates data structure compatibility between historical archive processing
 * and existing M02 LLM processing pipeline.
 *
 * Implements PRD Section 6.1 validation requirements for seamless integration.
 */
@Injectable()
export class HistoricalLlmIntegrationValidator {
  private readonly logger: LoggerService;

  constructor(
    private readonly llmService: LLMService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('HistoricalLlmIntegrationValidator');
  }

  /**
   * Comprehensive validation of historical batch compatibility
   * Validates data structure, content quality, and LLM pipeline readiness
   *
   * @param batch Historical content batch
   * @returns Validation result with detailed issues if any
   */
  async validateHistoricalBatch(
    batch: HistoricalContentBatch,
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const issues: ValidationIssue[] = [];
    let isValid = true;

    this.logger.debug('Starting historical batch validation', {
      batchId: batch.batchId,
      submissions: batch.submissions.length,
      comments: batch.comments.length,
    });

    try {
      // 1. Validate batch structure
      const structureIssues = this.validateBatchStructure(batch);
      issues.push(...structureIssues);

      // 2. Validate content quality
      const qualityIssues = this.validateContentQuality(batch);
      issues.push(...qualityIssues);

      // 3. Validate individual submissions
      for (const submission of batch.submissions) {
        const submissionIssues = this.validateSubmission(submission);
        issues.push(...submissionIssues);
      }

      // 4. Validate individual comments
      for (const comment of batch.comments) {
        const commentIssues = this.validateComment(comment);
        issues.push(...commentIssues);
      }

      // 5. Validate thread relationships
      const threadIssues = this.validateThreadRelationships(batch);
      issues.push(...threadIssues);

      // Determine overall validity
      const criticalIssues = issues.filter(
        (issue) => issue.severity === 'critical',
      );
      isValid = criticalIssues.length === 0;

      const validationTime = Date.now() - startTime;

      this.logger.info('Historical batch validation completed', {
        batchId: batch.batchId,
        isValid,
        totalIssues: issues.length,
        criticalIssues: criticalIssues.length,
        validationTime,
      });

      return {
        isValid,
        issues,
        summary: {
          totalItems: batch.totalProcessed,
          validSubmissions: batch.submissions.length,
          validComments: batch.comments.length,
          totalIssues: issues.length,
          criticalIssues: criticalIssues.length,
          validationTime,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Historical batch validation failed', {
        batchId: batch.batchId,
        error: errorMessage,
      });

      return {
        isValid: false,
        issues: [
          {
            type: 'validation_error',
            severity: 'critical',
            message: `Validation process failed: ${errorMessage}`,
            location: 'batch_validation',
          },
        ],
        summary: {
          totalItems: batch.totalProcessed,
          validSubmissions: 0,
          validComments: 0,
          totalIssues: 1,
          criticalIssues: 1,
          validationTime: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Validate LLM input structure compatibility
   * Uses existing LLM service validation with additional historical context checks
   */
  async validateLLMInputCompatibility(
    input: LLMInputStructure,
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const issues: ValidationIssue[] = [];

    this.logger.debug('Validating LLM input compatibility', {
      posts: input.posts.length,
      totalComments: input.posts.reduce(
        (sum, post) => sum + post.comments.length,
        0,
      ),
    });

    try {
      // 1. Use existing LLM service validation
      const llmValidationErrors = await this.llmService.validateInput(input);

      // Convert LLM validation errors to our format
      for (const error of llmValidationErrors) {
        issues.push({
          type: 'llm_input_validation',
          severity: 'critical',
          message: error,
          location: 'llm_input_structure',
        });
      }

      // 2. Additional historical context validation
      const historicalIssues = this.validateHistoricalContext(input);
      issues.push(...historicalIssues);

      const validationTime = Date.now() - startTime;
      const isValid =
        issues.filter((issue) => issue.severity === 'critical').length === 0;

      this.logger.info('LLM input compatibility validation completed', {
        isValid,
        totalIssues: issues.length,
        validationTime,
      });

      return {
        isValid,
        issues,
        summary: {
          totalItems: input.posts.length,
          validSubmissions: input.posts.length,
          validComments: input.posts.reduce(
            (sum, post) => sum + post.comments.length,
            0,
          ),
          totalIssues: issues.length,
          criticalIssues: issues.filter(
            (issue) => issue.severity === 'critical',
          ).length,
          validationTime,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        isValid: false,
        issues: [
          {
            type: 'validation_error',
            severity: 'critical',
            message: `LLM input validation failed: ${errorMessage}`,
            location: 'llm_input_validation',
          },
        ],
        summary: {
          totalItems: input.posts.length,
          validSubmissions: 0,
          validComments: 0,
          totalIssues: 1,
          criticalIssues: 1,
          validationTime: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Validate LLM output structure
   * Ensures output meets expected format for entity resolution pipeline
   */
  async validateLLMOutputCompatibility(
    output: LLMOutputStructure,
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const issues: ValidationIssue[] = [];

    this.logger.debug('Validating LLM output compatibility', {
      mentions: output.mentions.length,
    });

    try {
      // Use existing LLM service validation
      const llmValidationErrors = await this.llmService.validateOutput(output);

      // Convert LLM validation errors to our format
      for (const error of llmValidationErrors) {
        issues.push({
          type: 'llm_output_validation',
          severity: 'critical',
          message: error,
          location: 'llm_output_structure',
        });
      }

      // Additional output structure validation
      const outputIssues = this.validateOutputStructure(output);
      issues.push(...outputIssues);

      const validationTime = Date.now() - startTime;
      const isValid =
        issues.filter((issue) => issue.severity === 'critical').length === 0;

      this.logger.info('LLM output compatibility validation completed', {
        isValid,
        totalIssues: issues.length,
        mentionsValidated: output.mentions.length,
        validationTime,
      });

      return {
        isValid,
        issues,
        summary: {
          totalItems: output.mentions.length,
          validSubmissions: 0, // Not applicable for output
          validComments: 0, // Not applicable for output
          totalIssues: issues.length,
          criticalIssues: issues.filter(
            (issue) => issue.severity === 'critical',
          ).length,
          validationTime,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        isValid: false,
        issues: [
          {
            type: 'validation_error',
            severity: 'critical',
            message: `LLM output validation failed: ${errorMessage}`,
            location: 'llm_output_validation',
          },
        ],
        summary: {
          totalItems: output.mentions.length,
          validSubmissions: 0,
          validComments: 0,
          totalIssues: 1,
          criticalIssues: 1,
          validationTime: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Validate batch structure and metadata
   */
  private validateBatchStructure(
    batch: HistoricalContentBatch,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Check required fields
    if (!batch.batchId) {
      issues.push({
        type: 'missing_field',
        severity: 'critical',
        message: 'Batch ID is required',
        location: 'batch.batchId',
      });
    }

    // Check data consistency
    if (batch.totalProcessed !== batch.validItems + batch.invalidItems) {
      issues.push({
        type: 'data_inconsistency',
        severity: 'warning',
        message: `Total processed (${batch.totalProcessed}) does not match valid + invalid items (${batch.validItems + batch.invalidItems})`,
        location: 'batch.totals',
      });
    }

    // Check for empty batch
    if (batch.submissions.length === 0 && batch.comments.length === 0) {
      issues.push({
        type: 'empty_data',
        severity: 'critical',
        message: 'Batch contains no valid content',
        location: 'batch.content',
      });
    }

    return issues;
  }

  /**
   * Validate content quality metrics
   */
  private validateContentQuality(
    batch: HistoricalContentBatch,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Check error rate
    const errorRate = (batch.errors.length / batch.totalProcessed) * 100;
    if (errorRate > 50) {
      issues.push({
        type: 'high_error_rate',
        severity: 'warning',
        message: `High error rate: ${errorRate.toFixed(1)}%`,
        location: 'batch.quality',
      });
    }

    // Check processing time (unusual if too fast or too slow)
    if (batch.processingTime < 10) {
      issues.push({
        type: 'suspicious_timing',
        severity: 'warning',
        message: `Unusually fast processing time: ${batch.processingTime}ms`,
        location: 'batch.timing',
      });
    }

    return issues;
  }

  /**
   * Validate individual submission structure
   */
  private validateSubmission(
    submission: CraveRedditSubmission,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Required fields
    if (!submission.id) {
      issues.push({
        type: 'missing_field',
        severity: 'critical',
        message: 'Submission ID is required',
        location: `submission.${submission.id || 'unknown'}.id`,
      });
    }

    if (!submission.title?.trim()) {
      issues.push({
        type: 'missing_field',
        severity: 'critical',
        message: 'Submission title is required',
        location: `submission.${submission.id}.title`,
      });
    }

    // Validate timestamp
    if (submission.created_utc <= 0) {
      issues.push({
        type: 'invalid_timestamp',
        severity: 'warning',
        message: `Invalid creation timestamp: ${submission.created_utc}`,
        location: `submission.${submission.id}.created_utc`,
      });
    }

    return issues;
  }

  /**
   * Validate individual comment structure
   */
  private validateComment(comment: CraveRedditComment): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Required fields
    if (!comment.id) {
      issues.push({
        type: 'missing_field',
        severity: 'critical',
        message: 'Comment ID is required',
        location: `comment.${comment.id || 'unknown'}.id`,
      });
    }

    if (!comment.body?.trim()) {
      issues.push({
        type: 'missing_field',
        severity: 'critical',
        message: 'Comment body is required',
        location: `comment.${comment.id}.body`,
      });
    }

    // Check for deleted/removed content
    if (comment.body === '[deleted]' || comment.body === '[removed]') {
      issues.push({
        type: 'deleted_content',
        severity: 'warning',
        message: 'Comment contains deleted/removed content',
        location: `comment.${comment.id}.body`,
      });
    }

    return issues;
  }

  /**
   * Validate thread relationships between submissions and comments
   */
  private validateThreadRelationships(
    batch: HistoricalContentBatch,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Create submission ID lookup
    const submissionIds = new Set(batch.submissions.map((s) => s.id));

    // Check comment-submission relationships
    for (const comment of batch.comments) {
      if (comment.link_id) {
        const submissionId = comment.link_id.replace('t3_', '');
        if (!submissionIds.has(submissionId)) {
          issues.push({
            type: 'orphaned_comment',
            severity: 'warning',
            message: `Comment ${comment.id} references unknown submission ${submissionId}`,
            location: `comment.${comment.id}.link_id`,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Validate historical context in LLM input
   */
  private validateHistoricalContext(
    input: LLMInputStructure,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Check for historical timestamp patterns
    for (const post of input.posts) {
      // Validate post timestamp
      const postDate = new Date(post.created_at);
      if (isNaN(postDate.getTime())) {
        issues.push({
          type: 'invalid_timestamp',
          severity: 'warning',
          message: `Invalid post timestamp: ${post.created_at}`,
          location: `post.${post.post_id}.created_at`,
        });
      }

      // Check comments
      for (const comment of post.comments) {
        const commentDate = new Date(comment.created_at);
        if (isNaN(commentDate.getTime())) {
          issues.push({
            type: 'invalid_timestamp',
            severity: 'warning',
            message: `Invalid comment timestamp: ${comment.created_at}`,
            location: `comment.${comment.comment_id}.created_at`,
          });
        }
      }
    }

    return issues;
  }

  /**
   * Validate LLM output structure for entity resolution compatibility
   */
  private validateOutputStructure(
    output: LLMOutputStructure,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // Check mentions structure
    for (const mention of output.mentions) {
      if (!mention.temp_id) {
        issues.push({
          type: 'missing_temp_id',
          severity: 'critical',
          message: 'Mention missing temporary ID',
          location: 'mention.temp_id',
        });
      }

      if (!mention.restaurant) {
        issues.push({
          type: 'missing_restaurant',
          severity: 'critical',
          message: 'Mention missing restaurant entity',
          location: `mention.${mention.temp_id}.restaurant`,
        });
      }
    }

    return issues;
  }
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  summary: ValidationSummary;
}

/**
 * Individual validation issue
 */
export interface ValidationIssue {
  type: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  location: string;
}

/**
 * Validation summary statistics
 */
export interface ValidationSummary {
  totalItems: number;
  validSubmissions: number;
  validComments: number;
  totalIssues: number;
  criticalIssues: number;
  validationTime: number;
}
