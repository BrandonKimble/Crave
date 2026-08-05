/**
 * Batch Processing Queue Types
 *
 * Defines the async queue-based architecture for processing Reddit content batches.
 * Supports all collection types: chronological, archive, and keyword search.
 */

import type {
  EnrichedLLMMention,
  LLMPost,
} from '../../external-integrations/llm/llm.types';

export interface BatchJob {
  /** Unique identifier for this batch job */
  batchId: string;

  /** Parent collection job that created this batch */
  parentJobId: string;

  /** Correlation id for a keyword collection cycle (optional) */
  cycleId?: string;

  /** §24.3 Leg C: when this batch's gemini extraction spend belongs to an
   *  owner-approved Tier 1 campaign, its id — threaded through to
   *  gemini-batch resumeContext (extraction-pipeline.service.ts) so
   *  UsageLedgerService can attribute the ACTUAL spend once the batch
   *  completes (gemini-batch.service.ts's pollOne). */
  campaignId?: string;

  /** Type of collection this batch belongs to */
  collectionType: 'chronological' | 'archive' | 'keyword';

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
  postIds?: string[];

  /**
   * Pre-transformed posts ready for LLM processing.
   * Used by archive ingestion where full Reddit API fetch is skipped.
   */
  llmPosts?: LLMPost[];

  /**
   * Additional source metadata for downstream reporting.
   */
  sourceMetadata?: {
    archive?: {
      /** Archive file identifiers included in this batch */
      files: Array<{ subreddit: string; fileType: 'comments' | 'submissions' }>;
      /** Temporal coverage for posts contained in this batch */
      temporalRange?: { earliest?: number; latest?: number };
    };
    chronological?: {
      /** Unix timestamps used for chronological pulls */
      collectedAfter?: number;
    };
  };

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
    /** Detailed entity summaries that were created */
    createdEntities?: {
      entityId: string;
      name: string;
      entityType: string;
      primaryTempId: string;
      tempIds: string[];
    }[];
    /** Resolver reuse summaries for reference */
    reusedEntities?: {
      tempId: string;
      entityId: string;
      entityType: string;
      normalizedName?: string;
      originalText?: string;
      canonicalName?: string;
    }[];
    /** IDs of connections that were updated */
    updatedConnectionIds?: string[];
    /** Any processing warnings */
    warnings?: string[];
    /** Optional sample of LLM-ready posts used in this batch */
    llmPostSample?: Array<{
      id: string;
      title: string;
      subreddit: string;
      author: string;
      score: number;
      created_at: string;
      commentCount: number;
      sampleComments: Array<{
        id: string;
        author: string;
        score: number;
        created_at: string;
        contentSnippet: string;
      }>;
    }>;
    /** Summary of keyword gating decisions for observability */
    refetchGateSummary?: {
      totalCandidates: number;
      processedPosts: number;
      skippedDueToFreshness: number;
      skippedDueToDeltaThreshold: number;
      /** F1850: posts whose fetch/transform FAILED (transient error, 404,
       *  empty raw response, or failed LLM transform) and were dropped from
       *  this batch — distinct from a legitimate freshness/delta skip, which
       *  is a deliberate gate decision, not a failure. */
      skippedDueToFetchFailure: number;
    };
  };

  /** Optional raw mentions sample for debugging (unchanged objects) */
  rawMentionsSample?: EnrichedLLMMention[];
}
