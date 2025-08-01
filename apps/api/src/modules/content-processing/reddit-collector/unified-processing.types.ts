/**
 * Unified Processing Types
 *
 * Type definitions for unified processing integration between Reddit data collection
 * and existing M02 LLM processing pipeline as specified in PRD sections 5.1.2 and 6.1.
 */

import { DataSourceType, MergedLLMInputDto } from './data-merge.types';

// Re-export types needed by other modules
export { DataSourceType, MergedLLMInputDto };

/**
 * Configuration for unified processing operations
 */
export interface UnifiedProcessingConfig {
  enableQualityScores: boolean;
  enableSourceAttribution: boolean;
  maxRetries: number;
  batchTimeout: number;
}

/**
 * Batch processing structure for unified pipeline
 */
export interface UnifiedProcessingBatch {
  batchId: string;
  sourceBreakdown: Record<DataSourceType, number>;
  totalItems: number;
  processingStartTime: Date;
  estimatedProcessingTime?: number;
}

/**
 * Result of unified processing operation
 */
export interface ProcessingResult {
  batchId: string;
  success: boolean;
  processingTimeMs: number;
  sourceBreakdown: Record<DataSourceType, number>;
  llmResult: {
    mentionsExtracted: number;
    successfulProcessing: boolean;
    errorMessage?: string;
  };
  entityResolution: {
    entitiesProcessed: number;
    newEntitiesCreated: number;
    existingEntitiesMatched: number;
  };
  databaseOperations: {
    entitiesCreated: number;
    connectionsCreated: number;
    mentionsCreated: number;
    affectedEntityIds: string[];
  };
  qualityScoreUpdates: number;
  error?: {
    stage: 'llm' | 'entity_resolution' | 'database' | 'quality_scores';
    message: string;
    retryable: boolean;
  };
}

/**
 * Performance metrics for unified processing
 */
export interface ProcessingPerformanceMetrics {
  batchesProcessed: number;
  totalProcessingTime: number;
  averageProcessingTime: number;
  successfulLLMCalls: number;
  failedLLMCalls: number;
  entitiesResolved: number;
  databaseOperations: number;
  lastReset: Date;
}

/**
 * Monitoring data for unified processing operations
 */
export interface UnifiedProcessingMonitoring {
  activeBatches: number;
  queuedBatches: number;
  recentPerformance: {
    averageProcessingTime: number;
    successRate: number;
    throughputPerHour: number;
  };
  resourceUtilization: {
    memoryUsageMB: number;
    cpuUtilization: number;
    databaseConnections: number;
  };
  integrationHealth: {
    llmServiceHealth: 'healthy' | 'degraded' | 'unhealthy';
    entityResolutionHealth: 'healthy' | 'degraded' | 'unhealthy';
    databaseHealth: 'healthy' | 'degraded' | 'unhealthy';
  };
}

/**
 * Configuration for processing quality and validation
 */
export interface ProcessingQualityConfig {
  minMentionsPerBatch: number;
  maxProcessingTimeMs: number;
  requiredSuccessRate: number;
  enableValidation: boolean;
  validationSampleSize: number;
}

/**
 * Quality validation result for processing batches
 */
export interface ProcessingQualityResult {
  batchId: string;
  qualityScore: number;
  validationChecks: {
    dataIntegrity: boolean;
    entityConsistency: boolean;
    sourceAttribution: boolean;
    performanceTarget: boolean;
  };
  recommendations: string[];
  passedValidation: boolean;
}
