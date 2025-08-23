import { Injectable, Inject } from '@nestjs/common';
import { Connection } from '@prisma/client';
import { LoggerService } from '../../../shared';
import { ConnectionRepository } from '../../../repositories/connection.repository';
import { EntityRepository } from '../../../repositories/entity.repository';
import {
  QualityScoreService as IQualityScoreService,
  ConnectionStrengthMetrics,
  RestaurantQualityComponents,
  CategoryPerformanceData,
  QualityScoreUpdateResult,
  QualityScoreWeights,
  TimeDecayConfig,
  DEFAULT_QUALITY_SCORE_CONFIG,
} from './quality-score.types';

/**
 * Quality Score Service
 * 
 * Implements PRD Section 5.3 - Quality Score Computation
 * 
 * Provides comprehensive quality scoring for:
 * - Dish Quality Score (5.3.1): 85-90% connection strength + 10-15% restaurant context
 * - Restaurant Quality Score (5.3.2): 80% top dishes + 20% overall consistency
 * - Category/Attribute Performance (5.3.3): Weighted average of relevant dishes
 * 
 * All calculations use time decay and are optimized for production performance.
 */
@Injectable()
export class QualityScoreService implements IQualityScoreService {
  private logger!: LoggerService;
  private readonly config = DEFAULT_QUALITY_SCORE_CONFIG;

  constructor(
    private readonly connectionRepository: ConnectionRepository,
    private readonly entityRepository: EntityRepository,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('QualityScoreService');
  }

  /**
   * Calculate dish quality score (PRD 5.3.1)
   * Primary component (85-90%): Connection strength metrics with time decay
   * Secondary component (10-15%): Restaurant context factor
   */
  async calculateDishQualityScore(
    connection: Connection,
    restaurantScore?: number
  ): Promise<number> {
    try {
      const startTime = Date.now();

      // Calculate connection strength metrics
      const strengthMetrics = this.calculateConnectionStrength(connection);
      
      // Primary component: Connection strength (85-90%)
      const connectionStrengthScore = this.calculateConnectionStrengthScore(strengthMetrics);
      const primaryScore = connectionStrengthScore * this.config.weights.dishConnectionStrength;

      // Secondary component: Restaurant context factor (10-15%)
      let secondaryScore = 0;
      if (restaurantScore !== undefined) {
        // Use provided restaurant score
        secondaryScore = restaurantScore * this.config.weights.dishRestaurantContext;
      } else {
        // Calculate restaurant score if not provided
        const calculatedRestaurantScore = await this.calculateRestaurantQualityScore(connection.restaurantId);
        secondaryScore = calculatedRestaurantScore * this.config.weights.dishRestaurantContext;
      }

      const finalScore = Math.min(100, Math.max(0, primaryScore + secondaryScore));

      this.logger.debug('Dish quality score calculated', {
        connectionId: connection.connectionId,
        primaryScore,
        secondaryScore,
        finalScore,
        processingTimeMs: Date.now() - startTime,
      });

      return finalScore;
    } catch (error) {
      this.logger.error('Failed to calculate dish quality score', {
        connectionId: connection.connectionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Calculate restaurant quality score (PRD 5.3.2)
   * Primary component (80%): Top 3-5 highest-scoring dishes
   * Secondary component (20%): Overall menu consistency
   */
  async calculateRestaurantQualityScore(restaurantId: string): Promise<number> {
    try {
      const startTime = Date.now();

      // Get all dish connections for this restaurant
      const connections = await this.connectionRepository.findMany({
        where: { restaurantId },
        orderBy: { dishQualityScore: 'desc' },
      });

      if (connections.length === 0) {
        this.logger.debug('No connections found for restaurant', { restaurantId });
        return 0;
      }

      // Calculate quality components
      const qualityComponents = await this.calculateRestaurantQualityComponents(connections);

      // Primary component (80%): Top 3-5 dishes
      const topDishesScore = this.calculateTopDishesScore(qualityComponents.topDishScores);
      const primaryScore = topDishesScore * this.config.weights.restaurantTopDishes;

      // Secondary component (20%): Overall menu consistency
      const consistencyScore = qualityComponents.averageMenuScore;
      const secondaryScore = consistencyScore * this.config.weights.restaurantOverallConsistency;

      const finalScore = Math.min(100, Math.max(0, primaryScore + secondaryScore));

      this.logger.debug('Restaurant quality score calculated', {
        restaurantId,
        topDishesScore,
        consistencyScore,
        finalScore,
        totalConnections: connections.length,
        processingTimeMs: Date.now() - startTime,
      });

      return finalScore;
    } catch (error) {
      this.logger.error('Failed to calculate restaurant quality score', {
        restaurantId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Calculate category performance score (PRD 5.3.3)
   * Find all restaurant's dishes in category and calculate weighted average
   */
  async calculateCategoryPerformanceScore(
    restaurantId: string,
    category: string
  ): Promise<number> {
    try {
      const startTime = Date.now();

      // Find all connections for dishes in this category
      const categoryConnections = await this.connectionRepository.findConnectionsInCategory(
        restaurantId,
        category
      );

      if (categoryConnections.length === 0) {
        this.logger.debug('No category connections found', { restaurantId, category });
        return 0;
      }

      // Calculate performance data
      const performanceData = this.calculateCategoryPerformanceData(categoryConnections);
      const finalScore = performanceData.weightedAverage;

      this.logger.debug('Category performance score calculated', {
        restaurantId,
        category,
        finalScore,
        totalConnections: categoryConnections.length,
        processingTimeMs: Date.now() - startTime,
      });

      return finalScore;
    } catch (error) {
      this.logger.error('Failed to calculate category performance score', {
        restaurantId,
        category,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Calculate attribute performance score (PRD 5.3.3)
   * Find all restaurant's dishes with specific attribute and calculate weighted average
   */
  async calculateAttributePerformanceScore(
    restaurantId: string,
    attributeId: string
  ): Promise<number> {
    try {
      const startTime = Date.now();

      // Find all connections with this attribute
      const attributeConnections = await this.connectionRepository.findConnectionsWithAttributes(
        restaurantId,
        [attributeId]
      );

      if (attributeConnections.length === 0) {
        this.logger.debug('No attribute connections found', { restaurantId, attributeId });
        return 0;
      }

      // Calculate performance data using the same logic as categories
      const performanceData = this.calculateCategoryPerformanceData(attributeConnections);
      const finalScore = performanceData.weightedAverage;

      this.logger.debug('Attribute performance score calculated', {
        restaurantId,
        attributeId,
        finalScore,
        totalConnections: attributeConnections.length,
        processingTimeMs: Date.now() - startTime,
      });

      return finalScore;
    } catch (error) {
      this.logger.error('Failed to calculate attribute performance score', {
        restaurantId,
        attributeId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update quality scores for multiple connections
   * Used during component processing to update affected connections
   */
  async updateQualityScoresForConnections(
    connectionIds: string[]
  ): Promise<QualityScoreUpdateResult> {
    const startTime = Date.now();
    const errors: Array<{ connectionId: string; error: string }> = [];
    const updatedRestaurants = new Set<string>();
    let connectionsUpdated = 0;

    try {
      this.logger.info('Starting quality score updates', {
        connectionCount: connectionIds.length,
      });

      // Process connections in batches
      const batchSize = 50;
      for (let i = 0; i < connectionIds.length; i += batchSize) {
        const batch = connectionIds.slice(i, i + batchSize);
        
        // Get connections for this batch
        const connections = await this.connectionRepository.findMany({
          where: {
            connectionId: { in: batch },
          },
        });

        // Update quality scores for each connection
        for (const connection of connections) {
          try {
            const newQualityScore = await this.calculateDishQualityScore(connection);
            
            // Update the connection with new quality score
            await this.connectionRepository.update(connection.connectionId, {
              dishQualityScore: newQualityScore,
              lastUpdated: new Date(),
            });

            connectionsUpdated++;
            updatedRestaurants.add(connection.restaurantId);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            errors.push({
              connectionId: connection.connectionId,
              error: errorMessage,
            });
            this.logger.warn('Failed to update connection quality score', {
              connectionId: connection.connectionId,
              errorMessage,
            });
          }
        }
      }

      const processingTime = Date.now() - startTime;
      const avgProcessingTime = processingTime / connectionsUpdated;

      this.logger.info('Quality score updates completed', {
        connectionsUpdated,
        restaurantsAffected: updatedRestaurants.size,
        errors: errors.length,
        totalProcessingTimeMs: processingTime,
        averagePerConnectionMs: avgProcessingTime,
      });

      return {
        connectionsUpdated,
        restaurantsUpdated: updatedRestaurants.size,
        averageProcessingTimeMs: avgProcessingTime,
        errors,
      };
    } catch (error) {
      this.logger.error('Quality score batch update failed', {
        error: error instanceof Error ? error.message : String(error),
        connectionIds: connectionIds.length,
        connectionsUpdated,
      });
      throw error;
    }
  }

  /**
   * Calculate connection strength metrics with time decay
   */
  private calculateConnectionStrength(connection: Connection): ConnectionStrengthMetrics {
    const now = new Date();
    const lastMentionedAt = connection.lastMentionedAt || connection.createdAt;
    const daysSinceLastMention = (now.getTime() - lastMentionedAt.getTime()) / (1000 * 60 * 60 * 24);

    // Calculate average mention age (approximate based on total mentions and last mentioned)
    const averageMentionAge = daysSinceLastMention / 2; // Simplified assumption

    // Calculate recent mention ratio
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentMentionRatio = connection.recentMentionCount / Math.max(1, connection.mentionCount);

    return {
      mentionCount: connection.mentionCount,
      totalUpvotes: connection.totalUpvotes,
      sourceDiversity: connection.sourceDiversity,
      lastMentionedAt,
      averageMentionAge,
      recentMentionRatio,
    };
  }

  /**
   * Calculate connection strength score from metrics
   */
  private calculateConnectionStrengthScore(metrics: ConnectionStrengthMetrics): number {
    // Apply time decay to mention count and upvotes
    const mentionDecayFactor = Math.exp(-metrics.averageMentionAge / this.config.timeDecay.mentionCountDecayDays);
    const upvoteDecayFactor = Math.exp(-metrics.averageMentionAge / this.config.timeDecay.upvoteDecayDays);

    // Calculate decayed mention count (with recent boost)
    const decayedMentionCount = metrics.mentionCount * mentionDecayFactor * (1 + metrics.recentMentionRatio);
    
    // Calculate decayed upvote score
    const decayedUpvotes = metrics.totalUpvotes * upvoteDecayFactor;

    // Normalize components (these would need tuning based on actual data distribution)
    const normalizedMentions = Math.min(100, decayedMentionCount * 2); // Scale mentions
    const normalizedUpvotes = Math.min(100, decayedUpvotes / 10); // Scale upvotes
    const normalizedDiversity = Math.min(100, metrics.sourceDiversity * 10); // Scale diversity

    // Weighted combination
    const strengthScore = 
      (normalizedMentions * this.config.weights.mentionCountWeight) +
      (normalizedUpvotes * this.config.weights.upvoteWeight) +
      (normalizedDiversity * this.config.weights.sourceDiversityWeight);

    return Math.min(100, Math.max(0, strengthScore));
  }

  /**
   * Calculate restaurant quality components
   */
  private async calculateRestaurantQualityComponents(
    connections: Connection[]
  ): Promise<RestaurantQualityComponents> {
    // Calculate dish quality scores for all connections if not already calculated
    const dishScores: number[] = [];
    
    for (const connection of connections) {
      if (connection.dishQualityScore !== null && Number(connection.dishQualityScore) > 0) {
        dishScores.push(Number(connection.dishQualityScore));
      } else {
        // Calculate on-demand if not available
        const score = await this.calculateDishQualityScore(connection, 50); // Use average restaurant score
        dishScores.push(score);
      }
    }

    // Get top 3-5 scores
    const sortedScores = dishScores.sort((a, b) => b - a);
    const topDishScores = sortedScores.slice(0, Math.min(5, sortedScores.length));

    // Calculate average menu score
    const averageMenuScore = dishScores.length > 0 
      ? dishScores.reduce((sum, score) => sum + score, 0) / dishScores.length
      : 0;

    return {
      topDishScores,
      averageMenuScore,
      totalDishConnections: connections.length,
    };
  }

  /**
   * Calculate top dishes score from individual dish scores
   */
  private calculateTopDishesScore(topDishScores: number[]): number {
    if (topDishScores.length === 0) return 0;

    // Weight scores with diminishing returns for more dishes
    let weightedSum = 0;
    let totalWeight = 0;

    topDishScores.forEach((score, index) => {
      const weight = 1 / (index + 1); // 1.0, 0.5, 0.33, 0.25, 0.2
      weightedSum += score * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Calculate category performance data
   */
  private calculateCategoryPerformanceData(connections: Connection[]): CategoryPerformanceData {
    const relevantConnections = connections.map(connection => {
      // Weight based on mention count and upvotes
      const weight = Math.sqrt(connection.mentionCount * Math.log(connection.totalUpvotes + 1));
      
      const dishQualityScore = connection.dishQualityScore ? Number(connection.dishQualityScore) : 0;

      return {
        connectionId: connection.connectionId,
        dishQualityScore,
        weight,
      };
    });

    // Calculate weighted average
    const totalWeight = relevantConnections.reduce((sum, conn) => sum + conn.weight, 0);
    const weightedSum = relevantConnections.reduce((sum, conn) => sum + (conn.dishQualityScore * conn.weight), 0);
    
    const weightedAverage = totalWeight > 0 ? weightedSum / totalWeight : 0;

    return {
      relevantConnections,
      weightedAverage,
      totalConnections: connections.length,
    };
  }
}