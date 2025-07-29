/**
 * Batch Processing Types
 *
 * Type definitions for the batch processing system that coordinates
 * memory-efficient large dataset handling as specified in PRD Section 5.1.1 and 6.1.
 */

/**
 * Batch processing configuration
 */
export interface BatchProcessingConfig {
  /** Base batch size for processing - can be adjusted dynamically */
  baseBatchSize: number;

  /** Minimum allowed batch size */
  minBatchSize: number;

  /** Maximum allowed batch size */
  maxBatchSize: number;

  /** Maximum memory usage in MB before taking corrective action */
  maxMemoryUsage: number;

  /** Enable checkpoint system for resumption */
  enableCheckpoints: boolean;

  /** Enable resource monitoring and automatic adjustments */
  enableResourceMonitoring: boolean;

  /** Enable adaptive batch sizing based on memory pressure */
  adaptiveBatchSizing: boolean;

  /** Interval for progress reporting (number of lines) */
  progressReportingInterval: number;

  /** Interval for resource checks (number of lines) */
  resourceCheckInterval: number;

  /** Interval for memory usage checks (number of lines) */
  memoryCheckInterval: number;

  /** Whether to preserve thread structure in processing */
  preserveThreadStructure: boolean;

  /** Whether to validate timestamps during processing */
  validateTimestamps: boolean;

  /** Quality filtering options */
  qualityFilters: {
    minScore?: number;
    excludeDeleted: boolean;
    excludeRemoved: boolean;
  };

  /** Optional timestamp range for filtering */
  timestampRange?: {
    start: number;
    end: number;
  };
}

/**
 * Memory management options
 */
export interface MemoryManagementOptions {
  /** Enable automatic memory management */
  enableAutoManagement: boolean;

  /** Memory warning threshold (percentage of max) */
  memoryWarningThreshold: number;

  /** Memory critical threshold (percentage of max) */
  memoryCriticalThreshold: number;

  /** Enable garbage collection triggers */
  enableGarbageCollection: boolean;

  /** Batch size reduction factor on memory pressure */
  batchSizeReductionFactor: number;
}

/**
 * Processing job context
 */
export interface ProcessingJobContext {
  /** Unique job identifier */
  jobId: string;

  /** File path being processed */
  filePath: string;

  /** Processing configuration */
  config: BatchProcessingConfig;

  /** File statistics and estimates */
  fileStats: {
    sizeBytes: number;
    sizeMB: number;
    estimatedLines: number;
  };

  /** Job start time */
  startTime: number;

  /** Line number to resume from (for checkpoint recovery) */
  resumeFromLine: number;
}

/**
 * Batch processing job record
 */
export interface BatchProcessingJob {
  /** Unique job identifier */
  jobId: string;

  /** File path being processed */
  filePath: string;

  /** Current job status */
  status: BatchProcessingStatus;

  /** Job start time */
  startTime: Date;

  /** Estimated total lines to process */
  estimatedTotalLines: number;

  /** Processing configuration */
  config: BatchProcessingConfig;

  /** Last progress update time */
  lastProgressUpdate?: Date;

  /** Job completion time */
  completedAt?: Date;

  /** Error message if job failed */
  error?: string;
}

/**
 * Batch processing status enumeration
 */
export enum BatchProcessingStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Progress tracking information
 */
export interface BatchProcessingProgress {
  /** Job identifier */
  jobId: string;

  /** Current processing status */
  status: BatchProcessingStatus;

  /** Completion percentage (0-100) */
  completionPercentage: number;

  /** Number of lines processed */
  processedLines: number;

  /** Total estimated lines */
  totalEstimatedLines: number;

  /** Job start time */
  startTime: Date;

  /** Estimated time remaining in seconds */
  estimatedTimeRemaining: number | null;

  /** Current memory usage in bytes */
  memoryUsage: number;

  /** Resource statistics */
  resourceStats?: ResourceUsageStats;

  /** Last update timestamp */
  lastUpdate: Date;
}

/**
 * Resource usage statistics
 */
export interface ResourceUsageStats {
  /** Memory usage in bytes */
  memoryUsage: number;

  /** Memory usage percentage of limit */
  memoryUsagePercentage: number;

  /** CPU usage percentage */
  cpuUsagePercentage?: number;

  /** Active file handles */
  fileHandles?: number;

  /** Processing rate (lines per second) */
  processingRate: number;

  /** Average batch processing time in ms */
  averageBatchTime: number;
}

/**
 * Batch processing result
 */
export interface BatchProcessingResult {
  /** Job identifier */
  jobId: string;

  /** Whether processing was successful */
  success: boolean;

  /** Processing metrics */
  metrics: BatchProcessingMetrics;

  /** Processing errors */
  errors: Array<{
    line: number;
    error: string;
    content?: string;
  }>;

  /** Checkpoint information */
  checkpoints: ProcessingCheckpoint[];
}

/**
 * Comprehensive processing metrics
 */
export interface BatchProcessingMetrics {
  /** Total lines processed */
  totalProcessedLines: number;

  /** Valid items extracted */
  validItems: number;

  /** Total errors encountered */
  errorCount: number;

  /** Total processing duration in ms */
  duration: number;

  /** Processing throughput (lines per second) */
  throughputLinesPerSecond: number;

  /** Memory usage statistics */
  memoryUsage: {
    initial: number;
    peak: number;
    final: number;
  };

  /** Batch processing specific stats */
  batchProcessingStats: {
    totalBatches: number;
    averageBatchSize: number;
    averageBatchProcessingTime: number;
  };
}

/**
 * Processing checkpoint for resumption
 */
export interface ProcessingCheckpoint {
  /** Checkpoint identifier */
  checkpointId: string;

  /** Job identifier */
  jobId: string;

  /** Number of lines processed */
  processedLines: number;

  /** Last file position */
  lastPosition: number;

  /** Completion percentage */
  completionPercentage: number;

  /** Checkpoint creation time */
  timestamp: Date;

  /** Whether this checkpoint represents completion */
  completed: boolean;

  /** Processing configuration at checkpoint */
  config: BatchProcessingConfig;

  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Resource monitoring configuration
 */
export interface ResourceMonitoringConfig {
  /** Memory threshold in bytes */
  memoryThreshold: number;

  /** Check interval in ms */
  checkInterval: number;

  /** Callback for memory warnings */
  onMemoryWarning?: (usage: number) => void | Promise<void>;

  /** Callback for memory exhaustion */
  onMemoryExhaustion?: (usage: number) => void | Promise<void>;

  /** Enable CPU monitoring */
  enableCpuMonitoring?: boolean;

  /** CPU threshold for warnings */
  cpuThreshold?: number;
}

/**
 * Checkpoint service configuration
 */
export interface CheckpointServiceConfig {
  /** Enable persistent checkpoints */
  enablePersistence: boolean;

  /** Storage location for checkpoints */
  storageLocation: string;

  /** Maximum number of checkpoints to keep per job */
  maxCheckpointsPerJob: number;

  /** Checkpoint cleanup interval in ms */
  cleanupInterval: number;

  /** Checkpoint retention period in ms */
  retentionPeriod: number;
}

/**
 * Batch processing exceptions
 */
export interface BatchProcessingError {
  /** Error code */
  code: string;

  /** Error message */
  message: string;

  /** Job context when error occurred */
  context: {
    jobId: string;
    filePath: string;
    currentLine?: number;
    memoryUsage?: number;
  };

  /** Original error if available */
  cause?: Error;
}
