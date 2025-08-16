/**
 * Historical Content Pipeline Types
 *
 * Defines data extraction schemas and types for processing Reddit posts and comments
 * from Pushshift archives into structured format for LLM processing.
 *
 * Implements PRD Section 5.1.1 and 6.1 requirements for historical data processing.
 */

/**
 * Extracted Reddit submission data optimized for Crave Search
 * Contains only essential fields needed for food discovery LLM processing
 */
export interface CraveRedditSubmission {
  // Required fields from Pushshift archives
  id: string;
  name?: string; // Full Reddit ID with t3_ prefix
  title: string;
  author: string;
  subreddit: string;
  created_utc: number;
  score: number;
  url: string;
  num_comments: number;

  // Optional content fields
  selftext?: string;
  permalink?: string;

  // Optional metadata
  edited?: boolean | number;
  over_18?: boolean;
  stickied?: boolean;
  link_flair_text?: string;
}

/**
 * Historical content extraction result for a single item
 */
export interface HistoricalContentItem {
  type: 'submission' | 'comment';
  data: CraveRedditSubmission | CraveRedditComment;
  extractedAt: Date;
  isValid: boolean;
  validationIssues?: string[];
}

/**
 * Batch processing result for historical content extraction
 */
export interface HistoricalContentBatch {
  submissions: CraveRedditSubmission[];
  comments: CraveRedditComment[];
  totalProcessed: number;
  validItems: number;
  invalidItems: number;
  processingTime: number;
  batchId: string;
  errors: HistoricalContentError[];
}

/**
 * Error information for content extraction failures
 */
export interface HistoricalContentError {
  lineNumber: number;
  itemType: 'submission' | 'comment';
  errorCode: string;
  message: string;
  rawData?: string;
}

/**
 * Thread relationship structure for comment organization
 */
export interface CommentThread {
  postId: string;
  comments: CommentWithRelationships[];
  totalComments: number;
}

/**
 * Comment with preserved thread relationships
 */
export interface CommentWithRelationships {
  comment: CraveRedditComment;
  parentId: string | null;
  depth: number;
  children: CommentWithRelationships[];
}

/**
 * Historical processing configuration
 */
export interface HistoricalProcessingConfig {
  batchSize: number;
  preserveThreads: boolean;
  validateTimestamps: boolean;
  timestampRange?: {
    start: number; // Unix timestamp
    end: number; // Unix timestamp
  };
  qualityFilters: {
    minScore?: number;
    excludeDeleted?: boolean;
    excludeRemoved?: boolean;
  };
}

/**
 * Processing statistics for historical content pipeline
 */
export interface HistoricalProcessingStats {
  totalSubmissions: number;
  totalComments: number;
  validSubmissions: number;
  validComments: number;
  threadsProcessed: number;
  processingStartTime: Date;
  processingEndTime: Date;
  memoryUsage: {
    initial: number;
    peak: number;
    final: number;
  };
  errors: {
    total: number;
    byType: Record<string, number>;
  };
}

/**
 * Re-export from existing types for convenience
 * Import CraveRedditComment interface from reddit-data-extractor.service
 */
import { CraveRedditComment } from './reddit-data-extractor.service';
export { CraveRedditComment };
