/**
 * Duplicate Detection Types
 *
 * Comprehensive type definitions for duplicate detection between Pushshift archives
 * and Reddit API sources as specified in PRD sections 5.1.2 and 6.1.
 *
 * Focuses on exact ID matching for posts and comments to prevent duplicate processing
 * while maintaining performance efficiency for large datasets.
 */

import { DataSourceType } from './data-merge.types';

/**
 * Unique identifier for a Reddit item across data sources
 * Combines item ID with type for precise duplicate detection
 */
export interface ContentIdentifier {
  /** Reddit item ID (e.g., t3_abc123 for posts, t1_def456 for comments) */
  id: string;
  /** Type of content (post/comment) */
  type: 'post' | 'comment';
  /** Normalized identifier for efficient lookups */
  normalizedKey: string;
}

/**
 * Source attribution for duplicate detection
 * Tracks where each item was first seen for overlap analysis
 */
export interface DuplicateSourceInfo {
  /** Data source where item was first encountered */
  sourceType: DataSourceType;
  /** Timestamp when item was first processed */
  firstSeen: Date;
  /** Processing batch identifier */
  batchId?: string;
  /** Source-specific metadata */
  sourceMetadata?: Record<string, any>;
}

/**
 * Duplicate detection result for a single item
 * Provides comprehensive information about duplicate status
 */
export interface DuplicateDetectionResult {
  /** Content identifier */
  identifier: ContentIdentifier;
  /** Whether this item is a duplicate */
  isDuplicate: boolean;
  /** Information about first occurrence if duplicate */
  originalSource?: DuplicateSourceInfo;
  /** Current source information */
  currentSource: DuplicateSourceInfo;
  /** Time difference between occurrences (if duplicate) */
  timeDiffSeconds?: number;
  /** Additional detection metadata */
  metadata?: Record<string, any>;
}

/**
 * Batch duplicate detection results
 * Comprehensive analysis of duplicate patterns in a batch
 */
export interface BatchDuplicateAnalysis {
  /** Individual item detection results */
  detectionResults: DuplicateDetectionResult[];
  /** Total items processed */
  totalItems: number;
  /** Number of duplicates found */
  duplicatesFound: number;
  /** Number of unique items */
  uniqueItems: number;
  /** Duplicate rate as percentage */
  duplicateRate: number;
  /** Source overlap analysis */
  sourceOverlapAnalysis: SourceOverlapAnalysis;
  /** Performance metrics */
  performanceMetrics: DuplicateDetectionPerformance;
}

/**
 * Analysis of overlap patterns between data sources
 * Provides insights into data source coverage and gaps
 */
export interface SourceOverlapAnalysis {
  /** Breakdown by source type */
  sourceBreakdown: Record<DataSourceType, number>;
  /** Cross-source duplicate patterns */
  overlapMatrix: Record<string, number>;
  /** Most common duplicate source combinations */
  commonOverlapPatterns: Array<{
    sources: DataSourceType[];
    count: number;
    percentage: number;
  }>;
  /** Time-based overlap analysis */
  temporalOverlapAnalysis: {
    /** Average time difference between duplicate occurrences */
    avgTimeDiffHours: number;
    /** Maximum time difference observed */
    maxTimeDiffHours: number;
    /** Distribution of time differences */
    timeDiffDistribution: Array<{
      rangeHours: string;
      count: number;
    }>;
  };
}

/**
 * Performance metrics for duplicate detection operations
 * Enables optimization and monitoring of detection efficiency
 */
export interface DuplicateDetectionPerformance {
  /** Processing start timestamp */
  startTime: Date;
  /** Processing end timestamp */
  endTime: Date;
  /** Total processing duration in milliseconds */
  durationMs: number;
  /** Items processed per second */
  throughputPerSecond: number;
  /** Memory usage statistics */
  memoryUsage: {
    /** Peak memory usage during processing */
    peakMemoryMB: number;
    /** Memory usage per item */
    memoryPerItemKB: number;
  };
  /** Lookup performance metrics */
  lookupPerformance: {
    /** Average lookup time per item */
    avgLookupTimeMs: number;
    /** Cache hit rate (if caching enabled) */
    cacheHitRate?: number;
  };
}

/**
 * Configuration for duplicate detection operations
 * Allows tuning for different performance and accuracy requirements
 */
export interface DuplicateDetectionConfig {
  /** Enable performance tracking */
  enablePerformanceTracking: boolean;
  /** Enable detailed source overlap analysis */
  enableSourceOverlapAnalysis: boolean;
  /** Maximum time difference to consider as potential duplicate (seconds) */
  maxTimeDifferenceSeconds: number;
  /** Enable memory usage monitoring */
  enableMemoryMonitoring: boolean;
  /** Maximum items to process in a single batch */
  maxBatchSize: number;
  /** Enable cache for frequent lookups */
  enableLookupCache: boolean;
  /** Cache size limit (number of items) */
  cacheSize?: number;
}

/**
 * Duplicate tracking entry for internal state management
 * Maintains seen items with minimal memory footprint
 */
export interface DuplicateTrackingEntry {
  /** Content identifier */
  identifier: ContentIdentifier;
  /** Source information */
  sourceInfo: DuplicateSourceInfo;
  /** Timestamp for cache expiration */
  lastAccessed?: Date;
}

/**
 * Statistics for duplicate detection tracking
 * Provides runtime insights into detection patterns
 */
export interface DuplicateDetectionStats {
  /** Total items processed since startup */
  totalItemsProcessed: number;
  /** Total duplicates detected since startup */
  totalDuplicatesDetected: number;
  /** Overall duplicate rate */
  overallDuplicateRate: number;
  /** Processing sessions completed */
  sessionsCompleted: number;
  /** Average session size */
  avgSessionSize: number;
  /** Most recent session metrics */
  lastSessionMetrics?: BatchDuplicateAnalysis;
}

/**
 * Edge case handling configuration
 * Defines behavior for unusual duplicate detection scenarios
 */
export interface EdgeCaseHandling {
  /** How to handle items with missing IDs */
  missingIdStrategy: 'skip' | 'generate' | 'error';
  /** How to handle items with malformed timestamps */
  malformedTimestampStrategy: 'skip' | 'use_current' | 'error';
  /** How to handle items with conflicting source information */
  conflictingSourceStrategy: 'first_wins' | 'last_wins' | 'error';
  /** Maximum retries for transient errors */
  maxRetries: number;
}
