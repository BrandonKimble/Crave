/**
 * Batch Processing Queue Types
 *
 * Defines the async queue-based architecture for processing Reddit content batches.
 * Supports all collection types: chronological, archive, and keyword search.
 */

export interface BatchJob {
  /** Unique identifier for this batch job */
  batchId: string;

  /** Parent collection job that created this batch */
  parentJobId: string;

  /** Type of collection this batch belongs to */
  collectionType: 'chronological' | 'archive' | 'keyword' | 'on-demand';

  /** Subreddit being processed */
  subreddit: string;

  /** Batch number within the collection (for progress tracking) */
  batchNumber: number;

  /** Total number of batches in the collection */
  totalBatches: number;

  /** Timestamp when this batch was created */
  createdAt: Date;

  /** Priority for queue processing (higher = more urgent) */
  priority?: number;

  /** Reddit post IDs to process */
  postIds: string[];

  /** Collection configuration */
  options: {
    /** Comment depth for content retrieval */
    depth: number;
    /** Rate limiting delay between requests */
    delayBetweenRequests?: number;
  };
}

/**
 * Batch Processing Result
 * Returned by workers after processing a batch
 */
export interface BatchProcessingResult {
  /** The job that was processed */
  batchId: string;
  parentJobId: string;
  collectionType: BatchJob['collectionType'];

  /** Processing status */
  success: boolean;
  error?: string;

  /** Processing metrics */
  metrics: {
    /** Number of posts processed */
    postsProcessed: number;
    /** Number of mentions extracted by LLM */
    mentionsExtracted: number;
    /** Number of entities created in database */
    entitiesCreated: number;
    /** Number of connections created in database */
    connectionsCreated: number;
    /** Processing duration in milliseconds */
    processingTimeMs: number;
    /** LLM processing time */
    llmProcessingTimeMs: number;
    /** Database processing time */
    dbProcessingTimeMs: number;
  };

  /** Batch completion timestamp */
  completedAt: Date;

  /** Additional processing details */
  details?: {
    /** IDs of entities that were created */
    createdEntityIds?: string[];
    /** IDs of connections that were updated */
    updatedConnectionIds?: string[];
    /** Any processing warnings */
    warnings?: string[];
  };
}

/**
 * Chronological Batch Processing Configuration
 */
export interface ChronologicalBatchProcessingConfig {
  /** Maximum number of concurrent batch workers */
  maxConcurrentBatches: number;

  /** Retry configuration */
  retries: {
    maxAttempts: number;
    backoffMultiplier: number;
    initialDelayMs: number;
  };

  /** Timeout settings */
  timeouts: {
    /** Maximum time for a single batch to process */
    batchTimeoutMs: number;
    /** Maximum time to wait in queue */
    queueTimeoutMs: number;
  };

  /** Monitoring settings */
  monitoring: {
    /** Enable detailed metrics collection */
    enableMetrics: boolean;
    /** Log progress every N batches */
    progressLogInterval: number;
  };
}

/**
 * Chronological Queue Status Information
 */
export interface ChronologicalQueueStatus {
  /** Current queue depth */
  queueDepth: {
    total: number;
    pending: number;
    processing: number;
  };

  /** Active processing statistics */
  processing: {
    activeBatches: number;
    availableWorkers: number;
    averageProcessingTimeMs: number;
  };

  /** Recent performance metrics */
  performance: {
    batchesCompletedLastHour: number;
    errorRateLastHour: number;
    throughputPerMinute: number;
  };

  /** Timestamp of status */
  timestamp: Date;
}

/**
 * Chronological Collection Progress Tracking
 */
export interface ChronologicalCollectionProgress {
  /** Parent collection job ID */
  collectionJobId: string;

  /** Collection type */
  collectionType: 'chronological';

  /** Progress metrics */
  progress: {
    batchesQueued: number;
    batchesCompleted: number;
    batchesFailed: number;
    totalBatches: number;
    percentComplete: number;
  };

  /** Aggregate processing metrics */
  totals: {
    postsProcessed: number;
    mentionsExtracted: number;
    entitiesCreated: number;
    connectionsCreated: number;
  };

  /** Timeline information */
  timeline: {
    startedAt: Date;
    estimatedCompletionAt?: Date;
    actualCompletionAt?: Date;
  };

  /** Current status */
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
}
