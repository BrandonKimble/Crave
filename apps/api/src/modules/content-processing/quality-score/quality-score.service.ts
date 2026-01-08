import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, Entity, CategoryAggregate, Prisma } from '@prisma/client';
import { LoggerService } from '../../../shared';
import { ConnectionRepository } from '../../../repositories/connection.repository';
import { EntityRepository } from '../../../repositories/entity.repository';
import { CategoryAggregateRepository } from '../../../repositories/category-aggregate.repository';
import {
  QualityScoreService as IQualityScoreService,
  ConnectionStrengthMetrics,
  RestaurantQualityComponents,
  CategoryPerformanceData,
  QualityScoreUpdateResult,
  DEFAULT_QUALITY_SCORE_CONFIG,
  QualityScoreConfig,
} from './quality-score.types';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_CONNECTION_BATCH_SIZE = 50;

/**
 * Quality Score Service
 *
 * Implements PRD Section 5.3 - Quality Score Computation
 *
 * Provides comprehensive quality scoring for:
 * - Food Quality Score (5.3.1): 85-90% connection strength + 10-15% restaurant context
 * - Restaurant Quality Score (5.3.2): 50% top food + 30% consistency + 20% general praise
 * - Category/Attribute Performance (5.3.3): Weighted average of relevant food
 *
 * All calculations use time decay and are optimized for production performance.
 */
@Injectable()
export class QualityScoreService implements IQualityScoreService {
  private logger!: LoggerService;
  private readonly config: QualityScoreConfig;
  private readonly connectionBatchSize: number;

  constructor(
    private readonly connectionRepository: ConnectionRepository,
    private readonly entityRepository: EntityRepository,
    private readonly categoryAggregateRepository: CategoryAggregateRepository,
    private readonly configService: ConfigService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('QualityScoreService');
    this.config = this.loadConfigFromEnv();
    this.connectionBatchSize = this.resolveNumericConfig(
      DEFAULT_CONNECTION_BATCH_SIZE,
      'QUALITY_SCORE_CONNECTION_BATCH_SIZE',
    );
  }

  getConfig(): QualityScoreConfig {
    return this.config;
  }

  private loadConfigFromEnv(): QualityScoreConfig {
    const base = DEFAULT_QUALITY_SCORE_CONFIG;
    const config: QualityScoreConfig = {
      timeDecay: { ...base.timeDecay },
      weights: { ...base.weights },
      normalization: { ...base.normalization },
      defaults: { ...base.defaults },
    };

    // Time decay overrides
    config.timeDecay.mentionCountDecayDays = this.resolveNumericConfig(
      config.timeDecay.mentionCountDecayDays,
      'QUALITY_SCORE_MENTION_DECAY_DAYS',
    );
    config.timeDecay.upvoteDecayDays = this.resolveNumericConfig(
      config.timeDecay.upvoteDecayDays,
      'QUALITY_SCORE_UPVOTE_DECAY_DAYS',
    );
    config.timeDecay.recentMentionThresholdDays = this.resolveNumericConfig(
      config.timeDecay.recentMentionThresholdDays,
      'QUALITY_SCORE_RECENT_THRESHOLD_DAYS',
    );

    // Food weights
    config.weights.foodConnectionStrength = this.resolveNumericConfig(
      config.weights.foodConnectionStrength,
      'QUALITY_SCORE_FOOD_CONNECTION_WEIGHT',
    );
    config.weights.foodRestaurantContext = this.resolveNumericConfig(
      config.weights.foodRestaurantContext,
      'QUALITY_SCORE_FOOD_RESTAURANT_WEIGHT',
    );

    // Restaurant weights
    config.weights.restaurantTopFood = this.resolveNumericConfig(
      config.weights.restaurantTopFood,
      'QUALITY_SCORE_RESTAURANT_TOP_WEIGHT',
    );
    config.weights.restaurantOverallConsistency = this.resolveNumericConfig(
      config.weights.restaurantOverallConsistency,
      'QUALITY_SCORE_RESTAURANT_CONSISTENCY_WEIGHT',
    );
    config.weights.restaurantGeneralPraise = this.resolveNumericConfig(
      config.weights.restaurantGeneralPraise,
      'QUALITY_SCORE_RESTAURANT_PRAISE_WEIGHT',
    );

    // Connection strength component weights
    config.weights.mentionCountWeight = this.resolveNumericConfig(
      config.weights.mentionCountWeight,
      'QUALITY_SCORE_MENTION_COMPONENT_WEIGHT',
    );
    config.weights.upvoteWeight = this.resolveNumericConfig(
      config.weights.upvoteWeight,
      'QUALITY_SCORE_UPVOTE_COMPONENT_WEIGHT',
    );

    // Normalization overrides
    config.normalization.mentionScale = this.resolveNumericConfig(
      config.normalization.mentionScale,
      'QUALITY_SCORE_MENTION_SCALE',
    );
    config.normalization.upvoteScale = this.resolveNumericConfig(
      config.normalization.upvoteScale,
      'QUALITY_SCORE_UPVOTE_SCALE',
    );
    config.normalization.generalPraiseScale = this.resolveNumericConfig(
      config.normalization.generalPraiseScale,
      'QUALITY_SCORE_GENERAL_PRAISE_SCALE',
    );
    config.normalization.signalWeightScale = this.resolveNumericConfig(
      config.normalization.signalWeightScale,
      'QUALITY_SCORE_SIGNAL_WEIGHT_SCALE',
    );
    config.normalization.weightFloor = this.resolveNumericConfig(
      config.normalization.weightFloor,
      'QUALITY_SCORE_WEIGHT_FLOOR',
    );

    // Default score fallbacks
    config.defaults.averageRestaurantScore = this.resolveNumericConfig(
      config.defaults.averageRestaurantScore,
      'QUALITY_SCORE_DEFAULT_AVERAGE_RESTAURANT',
    );
    config.defaults.categoryFallbackScore = this.resolveNumericConfig(
      config.defaults.categoryFallbackScore,
      'QUALITY_SCORE_DEFAULT_CATEGORY_FALLBACK',
    );

    return config;
  }

  private resolveNumericConfig(defaultValue: number, envKey: string): number {
    const raw = this.configService.get<string | number | undefined>(envKey);
    if (raw === undefined || raw === null || raw === '') {
      return defaultValue;
    }

    const parsed = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(parsed)) {
      return parsed;
    }

    this.logger.warn('Invalid numeric override for quality score config', {
      envKey,
      rawValue: raw,
    });
    return defaultValue;
  }

  /**
   * Calculate food quality score (PRD 5.3.1)
   * Primary component (85-90%): Connection strength metrics with time decay
   * Secondary component (10-15%): Restaurant context factor
   */
  async calculateFoodQualityScore(
    connection: Connection,
    restaurantScore?: number,
  ): Promise<number> {
    try {
      const startTime = Date.now();

      // Calculate connection strength metrics
      const strengthMetrics = this.calculateConnectionStrength(connection);

      // Primary component: Connection strength (85-90%)
      const connectionStrengthScore =
        this.calculateConnectionStrengthScore(strengthMetrics);
      const primaryScore =
        connectionStrengthScore * this.config.weights.foodConnectionStrength;

      // Secondary component: Restaurant context factor (10-15%)
      let secondaryScore = 0;
      if (restaurantScore !== undefined) {
        // Use provided restaurant score
        secondaryScore =
          restaurantScore * this.config.weights.foodRestaurantContext;
      } else {
        // Calculate restaurant score if not provided
        const calculatedRestaurantScore =
          await this.calculateRestaurantQualityScore(connection.restaurantId);
        secondaryScore =
          calculatedRestaurantScore * this.config.weights.foodRestaurantContext;
      }

      const finalScore = Math.min(
        100,
        Math.max(0, primaryScore + secondaryScore),
      );

      this.logger.debug('Food quality score calculated', {
        connectionId: connection.connectionId,
        primaryScore,
        secondaryScore,
        finalScore,
        processingTimeMs: Date.now() - startTime,
      });

      return finalScore;
    } catch (error) {
      this.logger.error('Failed to calculate food quality score', {
        connectionId: connection.connectionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Calculate restaurant quality score (PRD 5.3.2)
   * Primary component (50%): Top 3-5 highest-scoring food
   * Secondary component (30%): Overall menu consistency
   * Tertiary component (20%): General praise upvotes
   */
  async calculateRestaurantQualityScore(restaurantId: string): Promise<number> {
    try {
      const startTime = Date.now();

      // Get all food connections for this restaurant
      const connections = await this.connectionRepository.findMany({
        where: { restaurantId },
        orderBy: { foodQualityScore: 'desc' },
      });

      if (connections.length === 0) {
        this.logger.debug('No connections found for restaurant', {
          restaurantId,
        });
        return 0;
      }

      // Calculate quality components
      const qualityComponents = await this.calculateRestaurantQualityComponents(
        connections,
      );

      // Fetch restaurant context for general praise component
      const restaurantEntity = await this.getRestaurantEntity(restaurantId);
      const generalPraiseUpvotes = restaurantEntity?.generalPraiseUpvotes ?? 0;
      const generalPraiseScore =
        this.calculateGeneralPraiseScore(generalPraiseUpvotes);

      // Primary component (80%): Top 3-5 food
      const topFoodScore = this.calculateTopFoodScore(
        qualityComponents.topFoodScores,
      );
      const primaryScore = topFoodScore * this.config.weights.restaurantTopFood;

      // Secondary component: Overall menu consistency
      const consistencyScore = qualityComponents.averageMenuScore;
      const secondaryScore =
        consistencyScore * this.config.weights.restaurantOverallConsistency;

      // Tertiary component: General praise factor
      const tertiaryScore =
        generalPraiseScore * this.config.weights.restaurantGeneralPraise;

      const finalScore = Math.min(
        100,
        Math.max(0, primaryScore + secondaryScore + tertiaryScore),
      );

      this.logger.debug('Restaurant quality score calculated', {
        restaurantId,
        topFoodScore,
        consistencyScore,
        generalPraiseScore,
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
   * Find all restaurant's food in category and calculate weighted average
   */
  async calculateCategoryPerformanceScore(
    restaurantId: string,
    category: string,
  ): Promise<number> {
    try {
      const startTime = Date.now();

      // Find all connections and aggregated signals for this category
      const [categoryConnections, categoryAggregate] = await Promise.all([
        this.connectionRepository.findConnectionsInCategory(
          restaurantId,
          category,
        ),
        this.categoryAggregateRepository.findByRestaurantAndCategory(
          restaurantId,
          category,
        ),
      ]);

      if (categoryConnections.length === 0 && !categoryAggregate) {
        this.logger.debug('No category data available', {
          restaurantId,
          category,
        });
        return 0;
      }

      const restaurantScoreForSignal = categoryAggregate
        ? await this.calculateRestaurantQualityScore(restaurantId)
        : undefined;

      // Calculate performance data including signal fallback
      const performanceData = this.calculateCategoryPerformanceData(
        categoryConnections,
        categoryAggregate ?? undefined,
        restaurantScoreForSignal,
      );
      const finalScore = performanceData.weightedAverage;

      this.logger.debug('Category performance score calculated', {
        restaurantId,
        category,
        finalScore,
        totalConnections: categoryConnections.length,
        hasSignal: Boolean(categoryAggregate),
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
   * Find all restaurant's food with specific attribute and calculate weighted average
   */
  async calculateAttributePerformanceScore(
    restaurantId: string,
    attributeId: string,
  ): Promise<number> {
    try {
      const startTime = Date.now();

      // Find all connections with this attribute
      const attributeConnections =
        await this.connectionRepository.findConnectionsWithAttributes(
          restaurantId,
          [attributeId],
        );

      if (attributeConnections.length === 0) {
        this.logger.debug('No attribute connections found', {
          restaurantId,
          attributeId,
        });
        return 0;
      }

      // Calculate performance data using the same logic as categories
      const performanceData =
        this.calculateCategoryPerformanceData(attributeConnections);
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
    connectionIds: string[],
  ): Promise<QualityScoreUpdateResult> {
    const startTime = Date.now();
    const errors: Array<{
      connectionId?: string;
      restaurantId?: string;
      error: string;
    }> = [];
    const updatedRestaurants = new Set<string>();
    let connectionsUpdated = 0;
    const restaurantScoreCache = new Map<string, number>();

    try {
      this.logger.info('Starting quality score updates', {
        connectionCount: connectionIds.length,
      });

      // Process connections in batches
      const batchSize = this.connectionBatchSize;
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
            let restaurantScore = restaurantScoreCache.get(
              connection.restaurantId,
            );
            if (restaurantScore === undefined) {
              restaurantScore = await this.calculateRestaurantQualityScore(
                connection.restaurantId,
              );
              restaurantScoreCache.set(
                connection.restaurantId,
                restaurantScore,
              );
            }

            const newQualityScore = await this.calculateFoodQualityScore(
              connection,
              restaurantScore,
            );

            // Update the connection with new quality score
            await this.connectionRepository.update(connection.connectionId, {
              foodQualityScore: newQualityScore,
              lastUpdated: new Date(),
            });

            connectionsUpdated++;
            updatedRestaurants.add(connection.restaurantId);
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
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

      for (const restaurantId of updatedRestaurants) {
        try {
          const restaurantScore = await this.calculateRestaurantQualityScore(
            restaurantId,
          );

          await this.entityRepository.update(restaurantId, {
            restaurantQualityScore: restaurantScore,
            lastUpdated: new Date(),
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          errors.push({
            restaurantId,
            error: errorMessage,
          });
          this.logger.warn('Failed to update restaurant quality score', {
            restaurantId,
            errorMessage,
          });
        }
      }

      const processingTime = Date.now() - startTime;
      const avgProcessingTime =
        connectionsUpdated > 0 ? processingTime / connectionsUpdated : 0;

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
  private calculateConnectionStrength(
    connection: Connection,
  ): ConnectionStrengthMetrics {
    const { mentionScore, upvoteScore, lastUpdatedAt, elapsedMs } =
      this.getCurrentDecayedMetrics(connection);

    const averageMentionAge =
      elapsedMs > 0
        ? elapsedMs / MS_PER_DAY
        : this.config.timeDecay.mentionCountDecayDays;

    const totalMentions = Math.max(1, connection.mentionCount);
    const recentMentionRatio = Math.min(
      1,
      Math.max(0, connection.recentMentionCount / totalMentions),
    );

    return {
      decayedMentionScore: mentionScore,
      decayedUpvoteScore: upvoteScore,
      mentionCount: connection.mentionCount,
      totalUpvotes: connection.totalUpvotes,
      decayedScoresUpdatedAt: lastUpdatedAt ?? null,
      averageMentionAge,
      recentMentionRatio,
    };
  }

  /**
   * Calculate connection strength score from metrics
   */
  private calculateConnectionStrengthScore(
    metrics: ConnectionStrengthMetrics,
  ): number {
    const normalizedMentions = Math.min(
      100,
      Math.log1p(Math.max(0, metrics.decayedMentionScore)) *
        this.config.normalization.mentionScale,
    );
    const normalizedUpvotes = Math.min(
      100,
      Math.log1p(Math.max(0, metrics.decayedUpvoteScore)) *
        this.config.normalization.upvoteScale,
    );

    // Weighted combination
    const strengthScore =
      normalizedMentions * this.config.weights.mentionCountWeight +
      normalizedUpvotes * this.config.weights.upvoteWeight;

    return Math.min(100, Math.max(0, strengthScore));
  }

  /**
   * Calculate restaurant quality components
   */
  private async calculateRestaurantQualityComponents(
    connections: Connection[],
  ): Promise<RestaurantQualityComponents> {
    // Calculate food quality scores for all connections if not already calculated
    const foodScores: number[] = [];

    for (const connection of connections) {
      if (
        connection.foodQualityScore !== null &&
        Number(connection.foodQualityScore) > 0
      ) {
        foodScores.push(Number(connection.foodQualityScore));
      } else {
        // Calculate on-demand if not available
        const score = await this.calculateFoodQualityScore(
          connection,
          this.config.defaults.averageRestaurantScore,
        ); // Use configured average restaurant score
        foodScores.push(score);
      }
    }

    // Get top 3-5 scores
    const sortedScores = foodScores.sort((a, b) => b - a);
    const topFoodScores = sortedScores.slice(
      0,
      Math.min(5, sortedScores.length),
    );

    // Calculate average menu score
    const averageMenuScore =
      foodScores.length > 0
        ? foodScores.reduce((sum, score) => sum + score, 0) / foodScores.length
        : 0;

    return {
      topFoodScores,
      averageMenuScore,
      totalFoodConnections: connections.length,
    };
  }

  /**
   * Calculate top food score from individual food scores
   */
  private calculateTopFoodScore(topFoodScores: number[]): number {
    if (topFoodScores.length === 0) return 0;

    // Weight scores with diminishing returns for more food
    let weightedSum = 0;
    let totalWeight = 0;

    topFoodScores.forEach((score, index) => {
      const weight = 1 / (index + 1); // 1.0, 0.5, 0.33, 0.25, 0.2
      weightedSum += score * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  /**
   * Fetch restaurant entity safely for context-driven scoring
   */
  private async getRestaurantEntity(
    restaurantId: string,
  ): Promise<Entity | null> {
    try {
      return await this.entityRepository.findById(restaurantId);
    } catch (error) {
      this.logger.warn('Failed to load restaurant context', {
        restaurantId,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return null;
    }
  }

  /**
   * Normalize general praise upvotes to a 0-100 score
   */
  private calculateGeneralPraiseScore(upvotes: number): number {
    if (!upvotes || upvotes <= 0) {
      return 0;
    }

    return Math.min(
      100,
      Math.log1p(upvotes) * this.config.normalization.generalPraiseScale,
    );
  }

  /**
   * Convert aggregated category signals into a connection-weight equivalent
   */
  private calculateSignalWeight(signal: CategoryAggregate): number {
    const { mentionScore, upvoteScore } =
      this.getCurrentDecayedAggregateMetrics(signal);

    const mentionComponent = Math.max(
      this.config.normalization.weightFloor,
      Math.log1p(Math.max(mentionScore, 0)),
    );
    const upvoteComponent = Math.max(
      this.config.normalization.weightFloor,
      Math.log1p(Math.max(upvoteScore, 0)),
    );

    const baseWeight = Math.sqrt(mentionComponent * upvoteComponent);
    return baseWeight * this.config.normalization.signalWeightScale;
  }

  private getCurrentDecayedMetrics(connection: Connection): {
    mentionScore: number;
    upvoteScore: number;
    lastUpdatedAt: Date | null;
    elapsedMs: number;
  } {
    const decayedMentionScoreRaw = this.toNumberOrNull(
      connection.decayedMentionScore,
    );
    const baseMentionScore =
      decayedMentionScoreRaw ?? Math.max(0, connection.mentionCount);

    const decayedUpvoteScoreRaw = this.toNumberOrNull(
      connection.decayedUpvoteScore,
    );
    const baseUpvoteScore =
      decayedUpvoteScoreRaw ?? Math.max(0, connection.totalUpvotes);

    const lastUpdatedAt =
      this.toDate(connection.decayedScoresUpdatedAt) ??
      this.toDate(connection.lastMentionedAt) ??
      this.toDate(connection.createdAt);

    const now = new Date();
    const elapsedMs =
      lastUpdatedAt !== null
        ? Math.max(0, now.getTime() - lastUpdatedAt.getTime())
        : 0;

    const mentionDecayMs = Math.max(
      1,
      this.config.timeDecay.mentionCountDecayDays * MS_PER_DAY,
    );
    const upvoteDecayMs = Math.max(
      1,
      this.config.timeDecay.upvoteDecayDays * MS_PER_DAY,
    );

    const mentionScore =
      baseMentionScore * Math.exp(-elapsedMs / mentionDecayMs);
    const upvoteScore = baseUpvoteScore * Math.exp(-elapsedMs / upvoteDecayMs);

    return { mentionScore, upvoteScore, lastUpdatedAt, elapsedMs };
  }

  private toNumberOrNull(
    value: Prisma.Decimal | number | string | null | undefined,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }

    if (typeof value === 'number') {
      return Number.isNaN(value) ? null : value;
    }

    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private toDate(value: Date | string | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private getCurrentDecayedAggregateMetrics(signal: CategoryAggregate): {
    mentionScore: number;
    upvoteScore: number;
    lastUpdatedAt: Date | null;
  } {
    const baseMentionScore = Number(signal.decayedMentionScore ?? 0);
    const baseUpvoteScore = Number(signal.decayedUpvoteScore ?? 0);

    const lastUpdatedRaw =
      signal.decayedScoresUpdatedAt ||
      signal.lastMentionedAt ||
      signal.firstMentionedAt ||
      null;

    let lastUpdatedAt: Date | null = null;
    if (lastUpdatedRaw instanceof Date) {
      lastUpdatedAt = lastUpdatedRaw;
    } else if (lastUpdatedRaw) {
      const parsed = new Date(lastUpdatedRaw);
      lastUpdatedAt = Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const now = new Date();
    const elapsedMs =
      lastUpdatedAt !== null
        ? Math.max(0, now.getTime() - lastUpdatedAt.getTime())
        : 0;

    const mentionDecayMs = Math.max(
      1,
      this.config.timeDecay.mentionCountDecayDays * MS_PER_DAY,
    );
    const upvoteDecayMs = Math.max(
      1,
      this.config.timeDecay.upvoteDecayDays * MS_PER_DAY,
    );

    const mentionScore =
      baseMentionScore * Math.exp(-elapsedMs / mentionDecayMs);
    const upvoteScore = baseUpvoteScore * Math.exp(-elapsedMs / upvoteDecayMs);

    return { mentionScore, upvoteScore, lastUpdatedAt };
  }

  /**
   * Calculate category performance data
   */
  private calculateCategoryPerformanceData(
    connections: Connection[],
    categoryAggregate?: CategoryAggregate,
    restaurantScoreForSignal?: number,
  ): CategoryPerformanceData {
    const relevantConnections: CategoryPerformanceData['relevantConnections'] =
      connections.map(
        (
          connection,
        ): CategoryPerformanceData['relevantConnections'][number] => {
          const { mentionScore, upvoteScore } =
            this.getCurrentDecayedMetrics(connection);

          const mentionComponent = Math.max(
            this.config.normalization.weightFloor,
            Math.log1p(mentionScore),
          );
          const upvoteComponent = Math.max(
            this.config.normalization.weightFloor,
            Math.log1p(upvoteScore),
          );

          const weight = Math.sqrt(mentionComponent * upvoteComponent);

          const foodQualityScore = connection.foodQualityScore
            ? Number(connection.foodQualityScore)
            : 0;

          return {
            connectionId: connection.connectionId,
            foodQualityScore,
            weight,
          };
        },
      );

    if (categoryAggregate) {
      const signalWeight = this.calculateSignalWeight(categoryAggregate);
      if (signalWeight > 0) {
        const contextualScore =
          restaurantScoreForSignal && restaurantScoreForSignal > 0
            ? restaurantScoreForSignal
            : this.config.defaults.categoryFallbackScore;
        relevantConnections.push({
          connectionId: `signal:${categoryAggregate.categoryId}`,
          foodQualityScore: contextualScore,
          weight: signalWeight,
          isSignal: true,
        });
      }
    }

    // Calculate weighted average
    const totalWeight = relevantConnections.reduce(
      (sum, conn) => sum + conn.weight,
      0,
    );
    const weightedSum = relevantConnections.reduce(
      (sum, conn) => sum + conn.foodQualityScore * conn.weight,
      0,
    );

    const weightedAverage = totalWeight > 0 ? weightedSum / totalWeight : 0;

    return {
      relevantConnections,
      weightedAverage,
      totalConnections: connections.length,
    };
  }
}
