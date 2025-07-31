/**
 * Data Merge Types
 *
 * Defines data structures for temporal merging of historical Pushshift archives
 * and real-time Reddit API data as specified in PRD sections 5.1.2 and 6.1.
 *
 * Implements temporal ordering, source attribution, and gap detection capabilities
 * for seamless integration of different data sources into unified processing pipeline.
 */

import {
  LLMInputDto,
  LLMCommentDto,
} from '../../external-integrations/llm/dto';
import {
  CraveRedditSubmission,
  CraveRedditComment,
} from './historical-content-pipeline.types';

/**
 * Data source types for temporal merge attribution
 * Implements PRD Section 5.1.2 gap minimization strategy
 */
export enum DataSourceType {
  PUSHSHIFT_ARCHIVE = 'pushshift_archive',
  REDDIT_API_CHRONOLOGICAL = 'reddit_api_chronological',
  REDDIT_API_KEYWORD_SEARCH = 'reddit_api_keyword_search',
  REDDIT_API_ON_DEMAND = 'reddit_api_on_demand',
}

/**
 * Source attribution metadata for merged data
 * Tracks origin and processing context for each content item
 */
export interface DataSourceMetadata {
  sourceType: DataSourceType;
  sourcePath?: string; // Archive file path or API endpoint
  collectionTimestamp: Date; // When data was collected/processed
  processingBatch?: string; // Batch identifier for grouped processing
  originalId: string; // Original Reddit ID (post/comment)
  permalink: string; // Reddit URL for attribution
}

/**
 * Unified content item with source attribution
 * Extends existing pipeline data structures with merge metadata
 */
export interface MergedContentItem {
  type: 'submission' | 'comment';
  data: CraveRedditSubmission | CraveRedditComment;
  sourceMetadata: DataSourceMetadata;
  normalizedTimestamp: number; // Unix timestamp normalized for consistent sorting
  isValid: boolean;
  validationIssues?: string[];
}

/**
 * Temporal merge batch result
 * Contains merged data ready for LLM processing pipeline
 */
export interface TemporalMergeBatch {
  mergedItems: MergedContentItem[];
  submissions: CraveRedditSubmission[];
  comments: CraveRedditComment[];
  totalItems: number;
  validItems: number;
  invalidItems: number;
  sourceBreakdown: Record<DataSourceType, number>;
  temporalRange: {
    earliest: number; // Unix timestamp
    latest: number; // Unix timestamp
    spanHours: number;
  };
  processingStats: {
    mergeStartTime: Date;
    mergeEndTime: Date;
    mergeDurationMs: number;
    duplicatesDetected: number;
    gapsDetected: GapAnalysisResult[];
  };
  batchId: string;
}

/**
 * Data gap analysis result
 * Identifies temporal gaps between different data sources
 */
export interface GapAnalysisResult {
  gapType: 'missing_coverage' | 'sparse_data' | 'source_transition';
  startTimestamp: number;
  endTimestamp: number;
  durationHours: number;
  affectedSources: DataSourceType[];
  severity: 'low' | 'medium' | 'high';
  description: string;
  mitigationSuggestions?: string[];
}

/**
 * Temporal ordering configuration
 * Controls merge behavior and validation parameters
 */
export interface TemporalMergeConfig {
  timestampTolerance: number; // Seconds tolerance for duplicate detection
  enableGapDetection: boolean;
  gapDetectionThreshold: number; // Hours threshold for gap identification
  priorityOrder: DataSourceType[]; // Source priority for conflict resolution
  validateTimestamps: boolean;
  preserveSourceAttribution: boolean;
  maxBatchSize?: number;
}

/**
 * Merge validation result
 * Quality assessment of merged data batch
 */
export interface MergeValidationResult {
  isValid: boolean;
  validationPassed: boolean;
  issues: MergeValidationIssue[];
  qualityScore: number; // 0-100 score based on temporal consistency and coverage
  recommendations: string[];
}

/**
 * Merge validation issue
 * Specific problems identified during merge validation
 */
export interface MergeValidationIssue {
  issueType:
    | 'timestamp_inconsistency'
    | 'source_overlap'
    | 'data_gap'
    | 'attribution_missing';
  severity: 'error' | 'warning' | 'info';
  message: string;
  affectedItems: number;
  suggestedFix?: string;
}

/**
 * Enhanced LLM input with merge metadata
 * Extends existing LLM pipeline with source attribution
 */
export interface MergedLLMInputDto extends LLMInputDto {
  comments: LLMCommentDto[]; // Add comments field missing from base LLMInputDto
  sourceMetadata: {
    batchId: string;
    mergeTimestamp: Date;
    sourceBreakdown: Record<DataSourceType, number>;
    temporalRange: {
      earliest: number;
      latest: number;
      spanHours: number;
    };
  };
}
