import { EntityType, ActivityLevel, MentionSource } from '@prisma/client';

/**
 * Type definitions for bulk operations service
 *
 * Implements PRD Section 6.6.2 specifications for bulk database operations
 * with transaction management and performance monitoring.
 */

/**
 * Configuration for bulk operations
 * Implements PRD 6.6.4 - Performance monitoring and optimization
 */
export interface BulkOperationConfig {
  /** Batch size for processing (PRD: 100-500 entities per batch) */
  batchSize: number;

  /** Enable transaction wrapping for atomic operations */
  enableTransactions: boolean;

  /** Enable performance metrics collection */
  enableMetrics: boolean;

  /** Maximum retry attempts for failed operations */
  maxRetries: number;

  /** Delay between retry attempts (milliseconds) */
  retryDelay: number;
}

/**
 * Performance metrics for bulk operations
 * Implements PRD 6.6.4 - Key Performance Metrics
 */
export interface BulkOperationMetrics {
  /** Total items processed in operation */
  totalItems: number;

  /** Number of successfully processed items */
  successCount: number;

  /** Number of failed items */
  failureCount: number;

  /** Total operation duration in milliseconds */
  duration: number;

  /** Processing throughput (items per second) */
  throughput: number;

  /** Number of batches processed */
  batchCount: number;
}

/**
 * Result from bulk operation execution
 */
export interface BulkOperationResult {
  /** Number of successfully processed items */
  successCount: number;

  /** Number of failed items */
  failureCount: number;

  /** Error messages from failed operations */
  errors: string[];

  /** Performance metrics for the operation */
  metrics: BulkOperationMetrics;
}

/**
 * Input for bulk entity creation
 * Based on Prisma EntityCreateInput but simplified for bulk operations
 */
export interface BulkEntityInput {
  name: string;
  type: EntityType;
  aliases?: string[];
  restaurantAttributes?: string[];
  restaurantQualityScore?: number;
  latitude?: number;
  longitude?: number;
  address?: string;
  googlePlaceId?: string;
  restaurantMetadata?: Record<string, any>;
}

/**
 * Input for bulk connection creation
 * Implements PRD 6.6.2 - Connection updates with metrics and attributes
 */
export interface BulkConnectionInput {
  restaurantId: string;
  dishOrCategoryId: string;
  categories?: string[];
  dishAttributes?: string[];
  isMenuItem?: boolean;
  mentionCount?: number;
  totalUpvotes?: number;
  sourceDiversity?: number;
  recentMentionCount?: number;
  lastMentionedAt?: Date;
  activityLevel?: ActivityLevel;
  topMentions?: any[];
  dishQualityScore?: number;
}

/**
 * Input for bulk mention creation
 * Implements PRD 6.6.2 - Top mention updates with ranked mentions
 */
export interface BulkMentionInput {
  connectionId: string;
  sourceType: MentionSource;
  sourceId: string;
  sourceUrl: string;
  subreddit: string;
  contentExcerpt: string;
  author?: string;
  upvotes?: number;
  createdAt: Date;
}

/**
 * Transaction executor type for Prisma transactions
 * Represents either PrismaService or Prisma transaction client
 */
export type TransactionExecutor = {
  entity: {
    createMany: (args: any) => Promise<{ count: number }>;
    upsert: (args: any) => Promise<any>;
  };
  connection: {
    createMany: (args: any) => Promise<{ count: number }>;
  };
  mention: {
    createMany: (args: any) => Promise<{ count: number }>;
  };
};

/**
 * Batch processing context for tracking progress
 */
export interface BatchProcessingContext {
  totalBatches: number;
  currentBatch: number;
  startTime: number;
  processedItems: number;
  failedItems: number;
}

/**
 * Error information for failed bulk operations
 */
export interface BulkOperationError {
  batchIndex: number;
  itemIndex: number;
  error: string;
  item: any;
}

/**
 * Performance monitoring data for optimization
 * Implements PRD 6.6.4 - Performance monitoring and optimization
 */
export interface BulkPerformanceData {
  /** Entity resolution timing by type and batch size */
  resolutionTiming: {
    entityType: EntityType;
    batchSize: number;
    duration: number;
  }[];

  /** Database operation timing across operation types */
  operationTiming: {
    operation: 'insert' | 'update' | 'upsert';
    entityType: string;
    duration: number;
    itemCount: number;
  }[];

  /** Batch processing efficiency metrics */
  batchEfficiency: {
    batchSize: number;
    processingTime: number;
    throughput: number;
  }[];

  /** Memory usage tracking during bulk operations */
  memoryUsage: {
    beforeOperation: number;
    afterOperation: number;
    peakUsage: number;
  };
}

/**
 * Configuration for entity resolution integration
 * Links with existing EntityResolutionService
 */
export interface EntityResolutionBulkConfig {
  /** Enable entity resolution before bulk operations */
  enableResolution: boolean;

  /** Resolution batch size (may differ from bulk operation batch size) */
  resolutionBatchSize: number;

  /** Enable fuzzy matching during resolution */
  enableFuzzyMatching: boolean;

  /** Confidence threshold for entity matching */
  confidenceThreshold: number;
}

/**
 * Pipeline execution context for full entity processing
 * Implements PRD 5.2.1 - Batched Processing Pipeline
 */
export interface BulkProcessingPipeline {
  /** Phase 1: Entity resolution and ID mapping */
  entityResolution: {
    enabled: boolean;
    config: EntityResolutionBulkConfig;
  };

  /** Phase 2: Bulk database operations */
  bulkOperations: {
    config: BulkOperationConfig;
    sequence: ('entities' | 'connections' | 'mentions')[];
  };

  /** Phase 3: Metrics aggregation and quality score updates */
  postProcessing: {
    enableMetricAggregation: boolean;
    enableQualityScoreUpdate: boolean;
  };
}
