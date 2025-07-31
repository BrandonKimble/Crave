/**
 * Data Merge Service
 *
 * Main orchestrator for temporal merging of historical Pushshift archives
 * and real-time Reddit API data as specified in PRD sections 5.1.2 and 6.1.
 *
 * Implements unified processing pipeline that combines archive data with API data
 * based on timestamps, maintaining source attribution and minimizing data gaps.
 */

import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../shared';
import {
  DataSourceType,
  DataSourceMetadata,
  MergedContentItem,
  TemporalMergeBatch,
  TemporalMergeConfig,
  MergeValidationResult,
  GapAnalysisResult,
  MergedLLMInputDto,
} from './data-merge.types';
import {
  DataMergeException,
  MergeValidationException,
  GapAnalysisException,
  DataMergeExceptionFactory,
} from './data-merge.exceptions';
import {
  CraveRedditSubmission,
  CraveRedditComment,
  HistoricalContentBatch,
} from './historical-content-pipeline.types';
import { LLMPostDto, LLMCommentDto } from '../../external-integrations/llm/dto';
import { v4 as uuidv4 } from 'uuid';

/**
 * API data batch structure for content retrieval pipeline integration
 * Matches expected input from ContentRetrievalPipelineService
 */
export interface ApiContentBatch {
  posts: Array<{
    id: string;
    title: string;
    author: string;
    subreddit: string;
    created_utc: number;
    score: number;
    url: string;
    selftext?: string;
    permalink: string;
  }>;
  comments: Array<{
    id: string;
    body: string;
    author: string;
    created_utc: number;
    score: number;
    subreddit: string;
    link_id: string;
    parent_id?: string;
    permalink: string;
  }>;
  sourceType: DataSourceType;
  collectionTimestamp: Date;
  batchId?: string;
}

@Injectable()
export class DataMergeService {
  private readonly logger: LoggerService;
  private readonly defaultConfig: TemporalMergeConfig;

  constructor(loggerService: LoggerService) {
    this.logger = loggerService.setContext('DataMerge');
    this.defaultConfig = this.getDefaultMergeConfig();
  }

  /**
   * Merge historical archive data with API data by timestamp
   * Implements PRD Section 5.1.2 temporal merging requirement
   *
   * @param archiveData Processed historical content from Pushshift archives
   * @param apiData Real-time content from Reddit API collection
   * @param config Optional merge configuration overrides
   * @returns Merged batch ready for LLM processing pipeline
   */
  mergeTemporalData(
    archiveData: HistoricalContentBatch,
    apiData: ApiContentBatch,
    config?: Partial<TemporalMergeConfig>,
  ): TemporalMergeBatch {
    const mergeConfig = { ...this.defaultConfig, ...config };
    const batchId = uuidv4();
    const mergeStartTime = new Date();

    this.logger.info('Starting temporal data merge', {
      batchId,
      archiveItems:
        archiveData.submissions.length + archiveData.comments.length,
      apiItems: apiData.posts.length + apiData.comments.length,
      mergeConfig,
    });

    try {
      // Step 1: Create merged content items with source attribution
      const archiveItems = this.createMergedItemsFromArchive(
        archiveData,
        mergeConfig,
      );
      const apiItems = this.createMergedItemsFromApi(apiData, mergeConfig);

      this.logger.debug('Created merged items', {
        batchId,
        archiveItems: archiveItems.length,
        apiItems: apiItems.length,
      });

      // Step 2: Combine and apply temporal ordering
      const allItems = [...archiveItems, ...apiItems];
      const orderedItems = this.applyTemporalOrdering(allItems, mergeConfig);

      this.logger.debug('Applied temporal ordering', {
        batchId,
        totalItems: orderedItems.length,
        timeSpan: this.calculateTimeSpan(orderedItems),
      });

      // Step 3: Detect and analyze data gaps
      const gapAnalysis = this.analyzeTemporalGaps(orderedItems, mergeConfig);

      // Step 4: Separate submissions and comments for LLM pipeline compatibility
      const submissions = orderedItems
        .filter((item) => item.type === 'submission')
        .map((item) => item.data as CraveRedditSubmission);

      const comments = orderedItems
        .filter((item) => item.type === 'comment')
        .map((item) => item.data as CraveRedditComment);

      // Step 5: Create merge batch result
      const mergeEndTime = new Date();
      const sourceBreakdown = this.calculateSourceBreakdown(orderedItems);
      const temporalRange = this.calculateTemporalRange(orderedItems);

      const mergeBatch: TemporalMergeBatch = {
        mergedItems: orderedItems,
        submissions,
        comments,
        totalItems: orderedItems.length,
        validItems: orderedItems.filter((item) => item.isValid).length,
        invalidItems: orderedItems.filter((item) => !item.isValid).length,
        sourceBreakdown,
        temporalRange,
        processingStats: {
          mergeStartTime,
          mergeEndTime,
          mergeDurationMs: mergeEndTime.getTime() - mergeStartTime.getTime(),
          duplicatesDetected: this.detectDuplicates(orderedItems, mergeConfig),
          gapsDetected: gapAnalysis,
        },
        batchId,
      };

      // Step 6: Validate merge quality
      if (mergeConfig.validateTimestamps) {
        const validation = this.validateMergeBatch(mergeBatch, mergeConfig);
        if (!validation.isValid) {
          throw DataMergeExceptionFactory.mergeValidationFailed(
            validation.issues.map((i) => i.message),
            validation.qualityScore,
          );
        }
      }

      this.logger.info('Temporal data merge completed successfully', {
        batchId,
        totalItems: mergeBatch.totalItems,
        validItems: mergeBatch.validItems,
        processingTimeMs: mergeBatch.processingStats.mergeDurationMs,
        temporalRangeHours: mergeBatch.temporalRange.spanHours,
        gapsDetected: gapAnalysis.length,
      });

      return mergeBatch;
    } catch (error) {
      this.logger.error('Temporal data merge failed', {
        batchId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (
        error instanceof DataMergeException ||
        error instanceof MergeValidationException ||
        error instanceof GapAnalysisException
      ) {
        throw error;
      }

      throw new DataMergeException(
        'Temporal data merge operation failed',
        { batchId, phase: 'merge_execution' },
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * Convert merged batch to LLM input format
   * Maintains compatibility with existing M02 LLM processing pipeline
   *
   * @param mergeBatch Temporal merge batch result
   * @returns LLM input with source metadata
   */
  convertToLLMInput(mergeBatch: TemporalMergeBatch): MergedLLMInputDto {
    const posts: LLMPostDto[] = mergeBatch.submissions.map((submission) => ({
      post_id: submission.id,
      title: submission.title,
      content: submission.selftext || '',
      subreddit: submission.subreddit,
      created_at: new Date(submission.created_utc * 1000).toISOString(),
      upvotes: submission.score,
      url: submission.url,
      comments: [], // Comments are handled separately in MergedLLMInputDto
    }));

    const comments: LLMCommentDto[] = mergeBatch.comments.map((comment) => ({
      comment_id: comment.id,
      content: comment.body,
      author: comment.author,
      upvotes: comment.score,
      created_at: new Date(comment.created_utc * 1000).toISOString(),
      parent_id: comment.parent_id || null,
      url:
        comment.permalink ||
        `https://reddit.com/r/${comment.subreddit}/comments/${comment.link_id?.replace('t3_', '')}/_/${comment.id}`,
    }));

    return {
      posts,
      comments,
      sourceMetadata: {
        batchId: mergeBatch.batchId,
        mergeTimestamp: mergeBatch.processingStats.mergeStartTime,
        sourceBreakdown: mergeBatch.sourceBreakdown,
        temporalRange: mergeBatch.temporalRange,
      },
    };
  }

  /**
   * Create merged content items from historical archive data
   * Adds source attribution and normalizes timestamps
   */
  private createMergedItemsFromArchive(
    archiveData: HistoricalContentBatch,
    _config: TemporalMergeConfig,
  ): MergedContentItem[] {
    const items: MergedContentItem[] = [];

    // Process submissions
    for (const submission of archiveData.submissions) {
      try {
        const sourceMetadata: DataSourceMetadata = {
          sourceType: DataSourceType.PUSHSHIFT_ARCHIVE,
          sourcePath: `batch:${archiveData.batchId}`,
          collectionTimestamp: new Date(),
          processingBatch: archiveData.batchId,
          originalId: submission.id,
          permalink:
            submission.permalink ||
            `https://reddit.com/r/${submission.subreddit}/comments/${submission.id}`,
        };

        const normalizedTimestamp = this.normalizeTimestamp(
          submission.created_utc,
          DataSourceType.PUSHSHIFT_ARCHIVE,
          submission.id,
        );

        items.push({
          type: 'submission',
          data: submission,
          sourceMetadata,
          normalizedTimestamp,
          isValid: true,
          validationIssues: [],
        });
      } catch (error) {
        this.logger.warn('Failed to process archive submission', {
          submissionId: submission.id,
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : { message: 'Unknown error' },
        });
      }
    }

    // Process comments
    for (const comment of archiveData.comments) {
      try {
        const sourceMetadata: DataSourceMetadata = {
          sourceType: DataSourceType.PUSHSHIFT_ARCHIVE,
          sourcePath: `batch:${archiveData.batchId}`,
          collectionTimestamp: new Date(),
          processingBatch: archiveData.batchId,
          originalId: comment.id,
          permalink:
            comment.permalink ||
            `https://reddit.com/r/${comment.subreddit}/comments/${comment.link_id?.replace('t3_', '')}/_/${comment.id}`,
        };

        const normalizedTimestamp = this.normalizeTimestamp(
          comment.created_utc,
          DataSourceType.PUSHSHIFT_ARCHIVE,
          comment.id,
        );

        items.push({
          type: 'comment',
          data: comment,
          sourceMetadata,
          normalizedTimestamp,
          isValid: true,
          validationIssues: [],
        });
      } catch (error) {
        this.logger.warn('Failed to process archive comment', {
          commentId: comment.id,
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : { message: 'Unknown error' },
        });
      }
    }

    return items;
  }

  /**
   * Create merged content items from API data
   * Adds source attribution and normalizes timestamps
   */
  private createMergedItemsFromApi(
    apiData: ApiContentBatch,
    _config: TemporalMergeConfig,
  ): MergedContentItem[] {
    const items: MergedContentItem[] = [];

    // Process posts
    for (const post of apiData.posts) {
      try {
        const sourceMetadata: DataSourceMetadata = {
          sourceType: apiData.sourceType,
          collectionTimestamp: apiData.collectionTimestamp,
          processingBatch: apiData.batchId,
          originalId: post.id,
          permalink: post.permalink,
        };

        const normalizedTimestamp = this.normalizeTimestamp(
          post.created_utc,
          apiData.sourceType,
          post.id,
        );

        // Convert API post to archive format for consistency
        const archiveSubmission: CraveRedditSubmission = {
          id: post.id,
          title: post.title,
          author: post.author,
          subreddit: post.subreddit,
          created_utc: normalizedTimestamp,
          score: post.score,
          url: post.url,
          num_comments: 0, // Will be populated by comment processing
          selftext: post.selftext,
          permalink: post.permalink,
        };

        items.push({
          type: 'submission',
          data: archiveSubmission,
          sourceMetadata,
          normalizedTimestamp,
          isValid: true,
          validationIssues: [],
        });
      } catch (error) {
        this.logger.warn('Failed to process API post', {
          postId: post.id,
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : { message: 'Unknown error' },
        });
      }
    }

    // Process comments
    for (const comment of apiData.comments) {
      try {
        const sourceMetadata: DataSourceMetadata = {
          sourceType: apiData.sourceType,
          collectionTimestamp: apiData.collectionTimestamp,
          processingBatch: apiData.batchId,
          originalId: comment.id,
          permalink: comment.permalink,
        };

        const normalizedTimestamp = this.normalizeTimestamp(
          comment.created_utc,
          apiData.sourceType,
          comment.id,
        );

        // Convert API comment to archive format for consistency
        const archiveComment: CraveRedditComment = {
          id: comment.id,
          body: comment.body,
          author: comment.author,
          created_utc: normalizedTimestamp,
          score: comment.score,
          subreddit: comment.subreddit,
          link_id: comment.link_id,
          parent_id: comment.parent_id,
          permalink: comment.permalink,
        };

        items.push({
          type: 'comment',
          data: archiveComment,
          sourceMetadata,
          normalizedTimestamp,
          isValid: true,
          validationIssues: [],
        });
      } catch (error) {
        this.logger.warn('Failed to process API comment', {
          commentId: comment.id,
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack }
              : { message: 'Unknown error' },
        });
      }
    }

    return items;
  }

  /**
   * Apply temporal ordering to merged items
   * Sorts by normalized timestamp with conflict resolution
   */
  private applyTemporalOrdering(
    items: MergedContentItem[],
    config: TemporalMergeConfig,
  ): MergedContentItem[] {
    try {
      return items.sort((a, b) => {
        // Primary sort: timestamp ascending (oldest first)
        const timeDiff = a.normalizedTimestamp - b.normalizedTimestamp;
        if (Math.abs(timeDiff) > config.timestampTolerance) {
          return timeDiff;
        }

        // Secondary sort: source priority for near-simultaneous items
        const aPriority = config.priorityOrder.indexOf(
          a.sourceMetadata.sourceType,
        );
        const bPriority = config.priorityOrder.indexOf(
          b.sourceMetadata.sourceType,
        );
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }

        // Tertiary sort: item type (submissions before comments)
        if (a.type !== b.type) {
          return a.type === 'submission' ? -1 : 1;
        }

        // Final sort: ID for consistent ordering
        return a.sourceMetadata.originalId.localeCompare(
          b.sourceMetadata.originalId,
        );
      });
    } catch (error) {
      throw DataMergeExceptionFactory.temporalOrderingFailed(
        items.length,
        error instanceof Error ? error.message : 'Unknown ordering error',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Normalize timestamp to consistent Unix timestamp format
   * Reuses pattern from HistoricalContentPipelineService.normalizeTimestamp()
   */
  private normalizeTimestamp(
    timestamp: string | number,
    sourceType: DataSourceType,
    itemId: string,
  ): number {
    try {
      if (typeof timestamp === 'number') {
        return timestamp;
      }

      if (typeof timestamp === 'string') {
        const parsed = parseInt(timestamp, 10);
        if (!isNaN(parsed) && parsed > 0) {
          return parsed;
        }
      }

      throw DataMergeException.timestampNormalization(
        timestamp,
        sourceType,
        itemId,
      );
    } catch (error) {
      throw DataMergeExceptionFactory.timestampNormalizationFailed(
        timestamp,
        sourceType,
        itemId,
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Analyze temporal gaps between data sources
   * Implements PRD Section 5.1.2 gap minimization strategy
   */
  private analyzeTemporalGaps(
    items: MergedContentItem[],
    config: TemporalMergeConfig,
  ): GapAnalysisResult[] {
    if (!config.enableGapDetection || items.length < 2) {
      return [];
    }

    const gaps: GapAnalysisResult[] = [];
    const gapThresholdSeconds = config.gapDetectionThreshold * 3600; // Convert hours to seconds

    for (let i = 1; i < items.length; i++) {
      const prevItem = items[i - 1];
      const currentItem = items[i];
      const timeDiff =
        currentItem.normalizedTimestamp - prevItem.normalizedTimestamp;

      if (timeDiff > gapThresholdSeconds) {
        const durationHours = timeDiff / 3600;
        const affectedSources = [
          prevItem.sourceMetadata.sourceType,
          currentItem.sourceMetadata.sourceType,
        ];

        gaps.push({
          gapType: 'missing_coverage',
          startTimestamp: prevItem.normalizedTimestamp,
          endTimestamp: currentItem.normalizedTimestamp,
          durationHours,
          affectedSources,
          severity:
            durationHours > 24 ? 'high' : durationHours > 6 ? 'medium' : 'low',
          description: `${durationHours.toFixed(1)}h gap between ${prevItem.sourceMetadata.sourceType} and ${currentItem.sourceMetadata.sourceType}`,
          mitigationSuggestions: [
            'Consider expanding collection time range',
            'Review collection frequency for affected sources',
          ],
        });
      }
    }

    return gaps;
  }

  /**
   * Detect duplicate items based on timestamp tolerance
   */
  private detectDuplicates(
    items: MergedContentItem[],
    config: TemporalMergeConfig,
  ): number {
    let duplicates = 0;
    const seenItems = new Map<string, MergedContentItem>();

    for (const item of items) {
      const key = `${item.sourceMetadata.originalId}-${item.type}`;
      const existing = seenItems.get(key);

      if (existing) {
        const timeDiff = Math.abs(
          item.normalizedTimestamp - existing.normalizedTimestamp,
        );
        if (timeDiff <= config.timestampTolerance) {
          duplicates++;
          this.logger.debug('Potential duplicate detected', {
            itemId: item.sourceMetadata.originalId,
            type: item.type,
            timeDiff,
            sources: [
              existing.sourceMetadata.sourceType,
              item.sourceMetadata.sourceType,
            ],
          });
        }
      } else {
        seenItems.set(key, item);
      }
    }

    return duplicates;
  }

  /**
   * Calculate source breakdown statistics
   */
  private calculateSourceBreakdown(
    items: MergedContentItem[],
  ): Record<DataSourceType, number> {
    const breakdown: Record<DataSourceType, number> = {
      [DataSourceType.PUSHSHIFT_ARCHIVE]: 0,
      [DataSourceType.REDDIT_API_CHRONOLOGICAL]: 0,
      [DataSourceType.REDDIT_API_KEYWORD_SEARCH]: 0,
      [DataSourceType.REDDIT_API_ON_DEMAND]: 0,
    };

    for (const item of items) {
      breakdown[item.sourceMetadata.sourceType]++;
    }

    return breakdown;
  }

  /**
   * Calculate temporal range statistics
   */
  private calculateTemporalRange(items: MergedContentItem[]): {
    earliest: number;
    latest: number;
    spanHours: number;
  } {
    if (items.length === 0) {
      return { earliest: 0, latest: 0, spanHours: 0 };
    }

    const timestamps = items.map((item) => item.normalizedTimestamp);
    const earliest = Math.min(...timestamps);
    const latest = Math.max(...timestamps);
    const spanHours = (latest - earliest) / 3600; // Convert seconds to hours

    return { earliest, latest, spanHours };
  }

  /**
   * Calculate time span for logging purposes
   */
  private calculateTimeSpan(items: MergedContentItem[]): string {
    const range = this.calculateTemporalRange(items);
    if (range.spanHours < 1) {
      return `${Math.round(range.spanHours * 60)}m`;
    } else if (range.spanHours < 24) {
      return `${range.spanHours.toFixed(1)}h`;
    } else {
      return `${(range.spanHours / 24).toFixed(1)}d`;
    }
  }

  /**
   * Validate merge batch quality
   * Implements comprehensive quality checks for merged data
   */
  private validateMergeBatch(
    batch: TemporalMergeBatch,
    _config: TemporalMergeConfig,
  ): MergeValidationResult {
    const issues: Array<{
      issueType:
        | 'timestamp_inconsistency'
        | 'source_overlap'
        | 'data_gap'
        | 'attribution_missing';
      severity: 'error' | 'warning' | 'info';
      message: string;
      affectedItems: number;
      suggestedFix?: string;
    }> = [];

    // Check temporal consistency
    let temporalInconsistencies = 0;
    for (let i = 1; i < batch.mergedItems.length; i++) {
      const prev = batch.mergedItems[i - 1];
      const current = batch.mergedItems[i];
      if (current.normalizedTimestamp < prev.normalizedTimestamp) {
        temporalInconsistencies++;
      }
    }

    if (temporalInconsistencies > 0) {
      issues.push({
        issueType: 'timestamp_inconsistency',
        severity: 'error',
        message: `Temporal ordering inconsistencies detected`,
        affectedItems: temporalInconsistencies,
        suggestedFix:
          'Re-apply temporal sorting with stricter timestamp validation',
      });
    }

    // Check source attribution completeness
    const missingAttribution = batch.mergedItems.filter(
      (item) =>
        !item.sourceMetadata.originalId || !item.sourceMetadata.sourceType,
    ).length;

    if (missingAttribution > 0) {
      issues.push({
        issueType: 'attribution_missing',
        severity: 'error',
        message: `Items missing source attribution`,
        affectedItems: missingAttribution,
        suggestedFix: 'Verify source metadata creation during merge process',
      });
    }

    // Check for significant data gaps
    const highSeverityGaps = batch.processingStats.gapsDetected.filter(
      (gap) => gap.severity === 'high',
    ).length;

    if (highSeverityGaps > 0) {
      issues.push({
        issueType: 'data_gap',
        severity: 'warning',
        message: `High-severity temporal gaps detected`,
        affectedItems: highSeverityGaps,
        suggestedFix: 'Consider expanding collection time range or frequency',
      });
    }

    // Calculate quality score (0-100)
    let qualityScore = 100;
    qualityScore -= Math.min(temporalInconsistencies * 10, 50); // Max -50 for temporal issues
    qualityScore -= Math.min(missingAttribution * 5, 30); // Max -30 for attribution issues
    qualityScore -= Math.min(highSeverityGaps * 3, 20); // Max -20 for gap issues

    const isValid = issues.filter((i) => i.severity === 'error').length === 0;
    const validationPassed = qualityScore >= 70; // Minimum quality threshold

    return {
      isValid,
      validationPassed,
      issues,
      qualityScore: Math.max(0, qualityScore),
      recommendations: this.generateValidationRecommendations(issues),
    };
  }

  /**
   * Generate validation recommendations based on issues
   */
  private generateValidationRecommendations(
    issues: Array<{
      issueType: string;
      severity: string;
      suggestedFix?: string;
    }>,
  ): string[] {
    const recommendations = new Set<string>();

    for (const issue of issues) {
      if (issue.suggestedFix) {
        recommendations.add(issue.suggestedFix);
      }
    }

    // Add general recommendations
    if (issues.length > 0) {
      recommendations.add('Review merge configuration parameters');
      recommendations.add('Verify data source integrity before merge');
    }

    return Array.from(recommendations);
  }

  /**
   * Get default merge configuration
   */
  private getDefaultMergeConfig(): TemporalMergeConfig {
    return {
      timestampTolerance: 60, // 1 minute tolerance for duplicate detection
      enableGapDetection: true,
      gapDetectionThreshold: 4, // 4 hours threshold for gap identification
      priorityOrder: [
        DataSourceType.PUSHSHIFT_ARCHIVE, // Prioritize historical data
        DataSourceType.REDDIT_API_CHRONOLOGICAL,
        DataSourceType.REDDIT_API_KEYWORD_SEARCH,
        DataSourceType.REDDIT_API_ON_DEMAND,
      ],
      validateTimestamps: true,
      preserveSourceAttribution: true,
      maxBatchSize: 10000,
    };
  }
}
