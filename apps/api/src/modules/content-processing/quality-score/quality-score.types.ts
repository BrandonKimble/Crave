import { Connection } from '@prisma/client';

/**
 * Quality Score Types
 *
 * Implements PRD Section 5.3 - Quality Score Computation
 * Defines interfaces for all three quality score types:
 * - Food Quality Score (85-90% connection + 10-15% restaurant context)
 * - Restaurant Quality Score (80% top food + 20% overall average)
 * - Category/Attribute Performance Score (weighted average of relevant food)
 */

// Core quality score computation interfaces
export interface QualityScoreService {
  /**
   * Calculate food quality score (PRD 5.3.1)
   * 85-90% connection strength + 10-15% restaurant context factor
   */
  calculateFoodQualityScore(
    connection: Connection,
    restaurantScore?: number,
  ): Promise<number>;

  /**
   * Calculate restaurant quality score (PRD 5.3.2)
   * 80% top 3-5 food + 20% overall menu consistency
   */
  calculateRestaurantQualityScore(restaurantId: string): Promise<number>;

  /**
   * Calculate category/attribute performance score (PRD 5.3.3)
   * Weighted average of relevant food quality scores
   */
  calculateCategoryPerformanceScore(
    restaurantId: string,
    category: string,
  ): Promise<number>;

  /**
   * Calculate attribute performance score (PRD 5.3.3)
   * Weighted average of food with specific attribute
   */
  calculateAttributePerformanceScore(
    restaurantId: string,
    attributeId: string,
  ): Promise<number>;

  /**
   * Update all quality scores for connections affected by new mentions
   * Called during component processing pipeline
   */
  updateQualityScoresForConnections(
    connectionIds: string[],
  ): Promise<QualityScoreUpdateResult>;
}

// Connection strength metrics for food quality calculation
export interface ConnectionStrengthMetrics {
  mentionCount: number;
  totalUpvotes: number;
  lastMentionedAt: Date;
  averageMentionAge: number; // in days
  recentMentionRatio: number; // mentions within 30 days / total mentions
}

// Restaurant quality components
export interface RestaurantQualityComponents {
  topFoodScores: number[]; // 3-5 highest scoring food
  averageMenuScore: number; // average across all food
  totalFoodConnections: number;
}

// Category/Attribute performance data
export interface CategoryPerformanceData {
  relevantConnections: Array<{
    connectionId: string;
    foodQualityScore: number;
    weight: number; // based on mention count, upvotes, etc.
  }>;
  weightedAverage: number;
  totalConnections: number;
}

// Quality score update results
export interface QualityScoreUpdateResult {
  connectionsUpdated: number;
  restaurantsUpdated: number;
  averageProcessingTimeMs: number;
  errors: Array<{
    connectionId: string;
    error: string;
  }>;
}

// Time decay configuration
export interface TimeDecayConfig {
  mentionCountDecayDays: number; // Default: 180 days
  upvoteDecayDays: number; // Default: 120 days
  recentMentionThresholdDays: number; // Default: 30 days
}

// Quality score weights (configurable)
export interface QualityScoreWeights {
  // Food quality score weights (PRD 5.3.1)
  foodConnectionStrength: number; // 0.85-0.90
  foodRestaurantContext: number; // 0.10-0.15

  // Restaurant quality score weights (PRD 5.3.2)
  restaurantTopFood: number; // 0.80
  restaurantOverallConsistency: number; // 0.20

  // Connection strength component weights
  mentionCountWeight: number; // e.g., 0.60
  upvoteWeight: number; // e.g., 0.40
}

// Default configuration values
export const DEFAULT_QUALITY_SCORE_CONFIG = {
  timeDecay: {
    mentionCountDecayDays: 180,
    upvoteDecayDays: 120,
    recentMentionThresholdDays: 30,
  } as TimeDecayConfig,

  weights: {
    // PRD 5.3.1 - Food quality (85-90% connection + 10-15% restaurant)
    foodConnectionStrength: 0.87,
    foodRestaurantContext: 0.13,

    // PRD 5.3.2 - Restaurant quality (80% top food + 20% consistency)
    restaurantTopFood: 0.8,
    restaurantOverallConsistency: 0.2,

    // Connection strength components (source diversity removed)
    mentionCountWeight: 0.6,
    upvoteWeight: 0.4,
  } as QualityScoreWeights,
};

// Batch processing configuration
export interface QualityScoreBatchConfig {
  maxConcurrentCalculations: number; // Default: 10
  batchSize: number; // Default: 50 connections at a time
  enableParallelProcessing: boolean; // Default: true
  timeoutMs: number; // Default: 30000 (30 seconds)
}
