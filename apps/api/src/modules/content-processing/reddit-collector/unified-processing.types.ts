/**
 * Unified Processing Types
 *
 * Type definitions for unified processing integration between Reddit data collection
 * and existing M02 LLM processing pipeline as specified in PRD sections 5.1.2 and 6.1.
 */

/**
 * Data source types for unified processing
 */
export enum DataSourceType {
  PUSHSHIFT_ARCHIVE = 'pushshift_archive',
  REDDIT_API_CHRONOLOGICAL = 'reddit_api_chronological',
  REDDIT_API_KEYWORD_SEARCH = 'reddit_api_keyword_search',
  REDDIT_API_ON_DEMAND = 'reddit_api_on_demand',
}

/**
 * Configuration for unified processing operations
 */
export interface UnifiedProcessingConfig {
  enableSourceAttribution: boolean;
  maxRetries: number;
  batchTimeout: number;
  batchSize: number;
  skipSourceLedgerDedupe?: boolean;
}

export interface CreatedEntitySummary {
  entityId: string;
  name: string;
  entityType: string;
  primaryTempId: string;
  tempIds: string[];
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
    affectedConnectionIds: string[];
    affectedRestaurantIds?: string[];
    createdEntityIds?: string[];
    createdEntitySummaries?: CreatedEntitySummary[];
    reusedEntitySummaries?: {
      tempId: string;
      entityId: string;
      entityType: string;
      normalizedName?: string;
      originalText?: string;
      canonicalName?: string;
    }[];
  };
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
