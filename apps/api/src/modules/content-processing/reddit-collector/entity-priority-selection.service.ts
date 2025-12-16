import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { LoggerService } from '../../../shared';
import { EntityRepository } from '../../../repositories/entity.repository';
import { ConnectionRepository } from '../../../repositories/connection.repository';
import { EntityPriorityMetricsRepository } from '../../../repositories/entity-priority-metrics.repository';

/**
 * Entity Priority Score interface per PRD 5.1.2
 */
export interface EntityPriorityScore {
  entityId: string;
  entityName: string;
  entityType: EntityType;
  score: number;
  factors: {
    dataRecency: number; // days since last enrichment/update
    dataQuality: number; // mention count, source diversity metrics
    userDemand: number; // query frequency, high-potential entities
  };
  lastEnrichment?: Date;
  isNewEntity: boolean;
}

/**
 * Priority Selection Configuration
 */
export interface PrioritySelectionConfig {
  maxEntities: number; // Top 20-30 entities per PRD
  entityTypes: EntityType[]; // Multi-entity coverage per PRD
  recencyWeight: number; // Weight for data recency factor
  qualityWeight: number; // Weight for data quality factor
  demandWeight: number; // Weight for user demand factor
  newEntityBoost: number; // Boost score for new entities
}

/**
 * Entity Priority Selection Service
 *
 * Implements PRD Section 5.1.2 priority scoring algorithm for keyword entity search cycles.
 * Selects top 20-30 entities monthly based on data recency, quality, and user demand factors.
 */
@Injectable()
export class EntityPrioritySelectionService {
  constructor(
    private readonly entityRepository: EntityRepository,
    private readonly connectionRepository: ConnectionRepository,
    private readonly entityPriorityMetricsRepository: EntityPriorityMetricsRepository,
    private readonly logger: LoggerService,
  ) {
    this.connectionDemandWeight = this.resolveEnvNumber(
      'ENTITY_PRIORITY_DEMAND_CONNECTION_WEIGHT',
      0.6,
    );
    this.appDemandWeight = this.resolveEnvNumber(
      'ENTITY_PRIORITY_DEMAND_APP_WEIGHT',
      0.4,
    );
    this.appWeightQueryImpressions = this.resolveEnvNumber(
      'ENTITY_PRIORITY_APP_WEIGHT_QUERY_IMPRESSIONS',
      0.55,
    );
    this.appWeightAutocompleteSelections = this.resolveEnvNumber(
      'ENTITY_PRIORITY_APP_WEIGHT_AUTOCOMPLETE_SELECTIONS',
      0.15,
    );
    this.appWeightViewImpressions = this.resolveEnvNumber(
      'ENTITY_PRIORITY_APP_WEIGHT_VIEW_IMPRESSIONS',
      0.2,
    );
    this.appWeightFavoriteCount = this.resolveEnvNumber(
      'ENTITY_PRIORITY_APP_WEIGHT_FAVORITE_COUNT',
      0.1,
    );
    this.appQueryImpressionCap = this.resolveEnvNumber(
      'ENTITY_PRIORITY_QUERY_IMPRESSIONS_CAP',
      200,
    );
    this.appAutocompleteSelectionCap = this.resolveEnvNumber(
      'ENTITY_PRIORITY_AUTOCOMPLETE_SELECTIONS_CAP',
      50,
    );
    this.appViewImpressionCap = this.resolveEnvNumber(
      'ENTITY_PRIORITY_VIEW_IMPRESSIONS_CAP',
      100,
    );
    this.appFavoriteCap = this.resolveEnvNumber(
      'ENTITY_PRIORITY_FAVORITE_COUNT_CAP',
      50,
    );
    this.appQueryRecencyDecayDays = this.resolveEnvNumber(
      'ENTITY_PRIORITY_QUERY_RECENCY_DECAY_DAYS',
      30,
    );
    this.appViewRecencyDecayDays = this.resolveEnvNumber(
      'ENTITY_PRIORITY_VIEW_RECENCY_DECAY_DAYS',
      30,
    );
  }

  private readonly connectionDemandWeight: number;
  private readonly appDemandWeight: number;
  private readonly appWeightQueryImpressions: number;
  private readonly appWeightAutocompleteSelections: number;
  private readonly appWeightViewImpressions: number;
  private readonly appWeightFavoriteCount: number;
  private readonly appQueryImpressionCap: number;
  private readonly appAutocompleteSelectionCap: number;
  private readonly appViewImpressionCap: number;
  private readonly appFavoriteCap: number;
  private readonly appQueryRecencyDecayDays: number;
  private readonly appViewRecencyDecayDays: number;

  /**
   * Default configuration per PRD requirements
   */
  private readonly defaultConfig: PrioritySelectionConfig = {
    maxEntities: 25, // Mid-range of 20-30 specified in PRD
    entityTypes: [
      'restaurant',
      'food',
      'food_attribute',
      'restaurant_attribute',
    ],
    recencyWeight: 0.4, // 40% - Data recency is key factor per PRD
    qualityWeight: 0.35, // 35% - Quality metrics important
    demandWeight: 0.25, // 25% - User demand consideration
    newEntityBoost: 0.3, // 30% boost for new entities per PRD
  };

  /**
   * Select top priority entities for keyword search enrichment
   * Implements PRD 5.1.2 priority scoring considering data recency, quality, user demand
   *
   * @param config - Optional configuration override
   * @returns Promise<EntityPriorityScore[]> - Top entities for keyword search
   */
  async selectTopPriorityEntities(
    config: Partial<PrioritySelectionConfig> = {},
  ): Promise<EntityPriorityScore[]> {
    const startTime = Date.now();
    const finalConfig = { ...this.defaultConfig, ...config };

    try {
      this.logger.debug('Starting entity priority selection', {
        maxEntities: finalConfig.maxEntities,
        entityTypes: finalConfig.entityTypes,
        weights: {
          recency: finalConfig.recencyWeight,
          quality: finalConfig.qualityWeight,
          demand: finalConfig.demandWeight,
        },
      });

      const entityScores: EntityPriorityScore[] = [];
      const metricWrites: Promise<unknown>[] = [];

      // Process each entity type for multi-entity coverage per PRD 5.1.2
      for (const entityType of finalConfig.entityTypes) {
        const typeScores = await this.calculateEntityTypeScores(
          entityType,
          finalConfig,
          metricWrites,
        );
        entityScores.push(...typeScores);
      }

      // Sort by priority score and take top entities
      const topEntities = entityScores
        .sort((a, b) => b.score - a.score)
        .slice(0, finalConfig.maxEntities);

      const duration = Date.now() - startTime;

      if (metricWrites.length > 0) {
        const metricResults = await Promise.allSettled(metricWrites);
        const failedWrites = metricResults.filter(
          (result) => result.status === 'rejected',
        ).length;
        if (failedWrites > 0) {
          this.logger.warn('Some priority metric updates failed', {
            failedWrites,
            totalWrites: metricWrites.length,
          });
        }
      }

      await this.updateLastSelectedTimestamps(topEntities);
      this.logger.debug('Entity priority selection completed', {
        duration,
        totalCandidates: entityScores.length,
        selectedEntities: topEntities.length,
        entityTypeBreakdown: this.getEntityTypeBreakdown(topEntities),
        averageScore: this.getAverageScore(topEntities),
      });

      return topEntities;
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to select top priority entities', {
        duration,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        config: finalConfig,
      });
      throw error;
    }
  }

  /**
   * Calculate priority scores for entities of specific type
   *
   * @param entityType - Entity type to process
   * @param config - Priority selection configuration
   * @returns Promise<EntityPriorityScore[]> - Scored entities for this type
   */
  private async calculateEntityTypeScores(
    entityType: EntityType,
    config: PrioritySelectionConfig,
    metricWrites: Promise<unknown>[],
  ): Promise<EntityPriorityScore[]> {
    try {
      this.logger.debug(`Calculating scores for entity type: ${entityType}`);

      // Get all entities of this type with last update info
      const entities = await this.entityRepository.findByType(entityType, {
        orderBy: { lastUpdated: 'desc' },
      });

      if (entities.length === 0) {
        this.logger.debug(`No entities found for type: ${entityType}`);
        return [];
      }

      const entityScores: EntityPriorityScore[] = [];
      const now = new Date();

      for (const entity of entities) {
        try {
          // Calculate individual priority factors per PRD 5.1.2
          const dataRecency = this.calculateDataRecencyScore(
            entity.lastUpdated,
            now,
          );
          const dataQuality = await this.calculateDataQualityScore(
            entity.entityId,
            entityType,
          );
          const userDemand = await this.calculateUserDemandScore(
            entity.entityId,
            entityType,
          );

          // Determine if entity is new (created recently, limited data)
          const isNewEntity = this.isNewEntity(
            entity.createdAt,
            entity.lastUpdated,
          );

          // Calculate weighted composite score per PRD algorithm
          let compositeScore =
            dataRecency * config.recencyWeight +
            dataQuality * config.qualityWeight +
            userDemand * config.demandWeight;

          // Apply new entity boost per PRD requirement
          if (isNewEntity) {
            compositeScore += config.newEntityBoost;
          }

          const normalizedComposite =
            Math.round(compositeScore * 10000) / 10000;

          const priorityScore: EntityPriorityScore = {
            entityId: entity.entityId,
            entityName: entity.name,
            entityType: entity.type,
            score: Math.round(compositeScore * 100) / 100, // Round to 2 decimal places
            factors: {
              dataRecency,
              dataQuality,
              userDemand,
            },
            lastEnrichment: entity.lastUpdated,
            isNewEntity,
          };

          entityScores.push(priorityScore);

          metricWrites.push(
            this.entityPriorityMetricsRepository
              .upsertMetrics(
                { entityId: entity.entityId },
                {
                  entity: { connect: { entityId: entity.entityId } },
                  entityType: entity.type,
                  priorityScore: normalizedComposite,
                  dataRecencyScore: dataRecency,
                  dataQualityScore: dataQuality,
                  userDemandScore: userDemand,
                  isNewEntity,
                  lastCalculatedAt: new Date(),
                },
                {
                  entityType: entity.type,
                  priorityScore: normalizedComposite,
                  dataRecencyScore: dataRecency,
                  dataQualityScore: dataQuality,
                  userDemandScore: userDemand,
                  isNewEntity,
                  lastCalculatedAt: new Date(),
                },
              )
              .catch((writeError: unknown) => {
                this.logger.warn('Failed to record priority metrics', {
                  entityId: entity.entityId,
                  entityName: entity.name,
                  error: {
                    message:
                      writeError instanceof Error
                        ? writeError.message
                        : String(writeError),
                  },
                });
              }),
          );
        } catch (entityError: unknown) {
          this.logger.warn('Failed to calculate score for entity', {
            entityId: entity.entityId,
            entityName: entity.name,
            error: {
              message:
                entityError instanceof Error
                  ? entityError.message
                  : String(entityError),
              stack:
                entityError instanceof Error ? entityError.stack : undefined,
            },
          });
          // Continue processing other entities
        }
      }

      this.logger.debug(`Completed scoring for entity type: ${entityType}`, {
        entitiesProcessed: entities.length,
        entitiesScored: entityScores.length,
        averageScore: this.getAverageScore(entityScores),
      });

      return entityScores;
    } catch (error: unknown) {
      this.logger.error(
        `Failed to calculate scores for entity type: ${entityType}`,
        {
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        },
      );
      throw error;
    }
  }

  private async updateLastSelectedTimestamps(
    selectedEntities: EntityPriorityScore[],
  ): Promise<void> {
    if (selectedEntities.length === 0) {
      return;
    }

    const updates = selectedEntities.map((entity) =>
      this.entityPriorityMetricsRepository
        .upsertMetrics(
          { entityId: entity.entityId },
          {
            entity: { connect: { entityId: entity.entityId } },
            entityType: entity.entityType,
            priorityScore: entity.score,
            dataRecencyScore: entity.factors.dataRecency,
            dataQualityScore: entity.factors.dataQuality,
            userDemandScore: entity.factors.userDemand,
            isNewEntity: entity.isNewEntity,
            lastCalculatedAt: new Date(),
            lastSelectedAt: new Date(),
          },
          {
            entityType: entity.entityType,
            priorityScore: entity.score,
            dataRecencyScore: entity.factors.dataRecency,
            dataQualityScore: entity.factors.dataQuality,
            userDemandScore: entity.factors.userDemand,
            isNewEntity: entity.isNewEntity,
            lastCalculatedAt: new Date(),
            lastSelectedAt: new Date(),
          },
        )
        .catch((error: unknown) => {
          this.logger.warn('Failed to update lastSelectedAt for entity', {
            entityId: entity.entityId,
            error: {
              message: this.formatUnknownError(error),
            },
          });
        }),
    );

    const results = await Promise.allSettled(updates);
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length > 0) {
      this.logger.warn('Some lastSelectedAt updates failed', {
        failedUpdates: failures.length,
        totalUpdates: updates.length,
      });
    }
  }

  private formatUnknownError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  /**
   * Calculate data recency score (0-1 scale, higher = more recent)
   * PRD 5.1.2: "days since last enrichment, new entity status"
   *
   * @param lastUpdated - Last update timestamp
   * @param now - Current timestamp
   * @returns number - Recency score (0-1)
   */
  private calculateDataRecencyScore(lastUpdated: Date, now: Date): number {
    const daysSinceUpdate = Math.max(
      0,
      (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Exponential decay: entities not updated in 30+ days get very low scores
    // Fresh entities (0-7 days) get high scores (0.8-1.0)
    // Recent entities (8-30 days) get medium scores (0.3-0.8)
    // Stale entities (30+ days) get low scores (0.0-0.3)
    if (daysSinceUpdate <= 7) {
      return 0.8 + (0.2 * (7 - daysSinceUpdate)) / 7; // 0.8-1.0
    } else if (daysSinceUpdate <= 30) {
      return 0.3 + (0.5 * (30 - daysSinceUpdate)) / 23; // 0.3-0.8
    } else {
      return Math.max(0.0, 0.3 * Math.exp(-(daysSinceUpdate - 30) / 30)); // 0.0-0.3
    }
  }

  /**
   * Calculate data quality score (0-1 scale, higher = better quality)
   * PRD 5.1.2: "mention count, source diversity"
   *
   * @param entityId - Entity identifier
   * @param entityType - Entity type for context-specific quality metrics
   * @returns Promise<number> - Quality score (0-1)
   */
  private async calculateDataQualityScore(
    entityId: string,
    entityType: EntityType,
  ): Promise<number> {
    try {
      if (entityType === 'restaurant') {
        // For restaurants, use restaurantQualityScore and connection metrics
        const restaurant = await this.entityRepository.findById(entityId);
        const connections = await this.connectionRepository.findMany({
          where: { restaurantId: entityId },
        });

        const restaurantScore = restaurant?.restaurantQualityScore
          ? restaurant.restaurantQualityScore instanceof Prisma.Decimal
            ? restaurant.restaurantQualityScore.toNumber()
            : Number(restaurant.restaurantQualityScore)
          : 0;
        const connectionCount = connections.length;
        const totalMentions = connections.reduce(
          (sum, conn) => sum + (conn.mentionCount || 0),
          0,
        );
        const totalUpvotes = connections.reduce(
          (sum, conn) => sum + (conn.totalUpvotes || 0),
          0,
        );
        // Normalize and combine metrics (0-1 scale)
        const normalizedRestaurantScore = Math.min(1.0, restaurantScore / 100); // Assume max score ~100
        const normalizedConnections = Math.min(1.0, connectionCount / 20); // 20+ connections = high quality
        const normalizedMentions = Math.min(1.0, totalMentions / 50); // 50+ mentions = high quality
        const normalizedUpvotes = Math.min(1.0, totalUpvotes / 100); // 100+ upvotes = high quality
        return (
          normalizedRestaurantScore * 0.3 +
          normalizedConnections * 0.25 +
          normalizedMentions * 0.25 +
          normalizedUpvotes * 0.2
        );
      } else {
        // For food/attributes, use connection-based metrics
        const connections = await this.connectionRepository.findMany({
          where:
            entityType === 'food'
              ? { foodId: entityId }
              : entityType === 'food_attribute'
              ? { foodAttributes: { has: entityId } }
              : { restaurant: { restaurantAttributes: { has: entityId } } },
        });

        if (connections.length === 0) {
          return 0.1; // Minimal score for entities without connections
        }

        const totalMentions = connections.reduce(
          (sum, conn) => sum + (conn.mentionCount || 0),
          0,
        );
        const totalUpvotes = connections.reduce(
          (sum, conn) => sum + (conn.totalUpvotes || 0),
          0,
        );
        const avgQualityScore =
          connections.reduce((sum, conn) => {
            const score = conn.foodQualityScore;
            const numericScore =
              score instanceof Prisma.Decimal
                ? score.toNumber()
                : Number(score || 0);
            return sum + numericScore;
          }, 0) / connections.length;
        // Normalize metrics for food/attribute entities
        const normalizedConnections = Math.min(1.0, connections.length / 10); // 10+ connections = high quality
        const normalizedMentions = Math.min(1.0, totalMentions / 30); // 30+ mentions = high quality
        const normalizedUpvotes = Math.min(1.0, totalUpvotes / 60); // 60+ upvotes = high quality
        const normalizedQualityScore = Math.min(1.0, avgQualityScore / 100); // Assume max score ~100
        return (
          normalizedConnections * 0.3 +
          normalizedMentions * 0.3 +
          normalizedUpvotes * 0.2 +
          normalizedQualityScore * 0.2
        );
      }
    } catch (error: unknown) {
      this.logger.warn('Failed to calculate data quality score', {
        entityId,
        entityType,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      return 0.2; // Default low score for error cases
    }
  }

  /**
   * Calculate user demand score (0-1 scale, higher = more demand)
   * PRD 5.1.2: "query frequency, high-potential entities"
   *
   * Currently simplified implementation - can be enhanced with user analytics
   *
   * @param entityId - Entity identifier
   * @param entityType - Entity type for context
   * @returns Promise<number> - Demand score (0-1)
   */
  private async calculateUserDemandScore(
    entityId: string,
    entityType: EntityType,
  ): Promise<number> {
    try {
      // Connection activity remains the primary cross-entity proxy for demand.
      const connections = await this.connectionRepository.findMany({
        where:
          entityType === 'restaurant'
            ? { restaurantId: entityId }
            : entityType === 'food'
            ? { foodId: entityId }
            : entityType === 'food_attribute'
            ? { foodAttributes: { has: entityId } }
            : { restaurant: { restaurantAttributes: { has: entityId } } },
        orderBy: { lastMentionedAt: 'desc' },
        take: 10, // Look at top 10 connections for this entity
      });

      if (connections.length === 0) {
        // Let app-demand (if present) lift entities with real user behavior even when
        // connection data is sparse (e.g., new entities).
        const appDemand = await this.calculateAppDemandScore(
          entityId,
          entityType,
        );
        return Math.min(
          1,
          this.connectionDemandWeight * 0.1 + this.appDemandWeight * appDemand,
        );
      }

      // Calculate demand indicators
      const recentActivity = connections.filter((conn) => {
        if (!conn.lastMentionedAt) return false;
        const daysSinceActivity =
          (Date.now() - conn.lastMentionedAt.getTime()) / (1000 * 60 * 60 * 24);
        return daysSinceActivity <= 30; // Activity within last 30 days
      }).length;

      const totalRecentMentions = connections.reduce(
        (sum, conn) => sum + (conn.recentMentionCount || 0),
        0,
      );
      const activeConnections = connections.filter(
        (conn) =>
          conn.activityLevel === 'active' || conn.activityLevel === 'trending',
      ).length;

      // Normalize demand indicators
      const normalizedRecentActivity = Math.min(1.0, recentActivity / 5); // 5+ recent connections = high demand
      const normalizedRecentMentions = Math.min(1.0, totalRecentMentions / 20); // 20+ recent mentions = high demand
      const normalizedActiveConnections = Math.min(1.0, activeConnections / 3); // 3+ active connections = high demand

      const connectionDemand =
        normalizedRecentActivity * 0.4 +
        normalizedRecentMentions * 0.4 +
        normalizedActiveConnections * 0.2;

      const appDemand = await this.calculateAppDemandScore(
        entityId,
        entityType,
      );

      return Math.min(
        1,
        connectionDemand * this.connectionDemandWeight +
          appDemand * this.appDemandWeight,
      );
    } catch (error: unknown) {
      this.logger.warn('Failed to calculate user demand score', {
        entityId,
        entityType,
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      return 0.3; // Default moderate score for error cases
    }
  }

  private async calculateAppDemandScore(
    entityId: string,
    entityType: EntityType,
  ): Promise<number> {
    const metrics = await this.entityPriorityMetricsRepository.findById(
      entityId,
    );
    if (!metrics) {
      return 0;
    }

    const queryImpressions = metrics.queryImpressions ?? 0;
    const autocompleteSelections = metrics.autocompleteSelections ?? 0;
    const viewImpressions = metrics.viewImpressions ?? 0;
    const favoriteCount = metrics.favoriteCount ?? 0;

    const querySignal = this.applyRecency(
      this.normalizeLog(queryImpressions, this.appQueryImpressionCap),
      metrics.lastQueryAt ?? null,
      this.appQueryRecencyDecayDays,
    );
    const autocompleteSignal = this.normalizeLog(
      autocompleteSelections,
      this.appAutocompleteSelectionCap,
    );
    const favoriteSignal = this.normalizeLog(
      favoriteCount,
      this.appFavoriteCap,
    );

    const viewSignal =
      entityType === 'restaurant'
        ? this.applyRecency(
            this.normalizeLog(viewImpressions, this.appViewImpressionCap),
            metrics.lastViewAt ?? null,
            this.appViewRecencyDecayDays,
          )
        : 0;

    const appDemand =
      querySignal * this.appWeightQueryImpressions +
      autocompleteSignal * this.appWeightAutocompleteSelections +
      viewSignal * this.appWeightViewImpressions +
      favoriteSignal * this.appWeightFavoriteCount;

    return Math.max(0, Math.min(1, appDemand));
  }

  private normalizeLog(value: number, cap: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }
    const safeCap = Math.max(1, cap);
    return Math.min(Math.log1p(value) / Math.log1p(safeCap), 1);
  }

  private applyRecency(
    signal: number,
    lastAt: Date | null,
    decayDays: number,
  ): number {
    if (!signal) {
      return 0;
    }
    if (!lastAt) {
      return signal;
    }
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysSince = (Date.now() - lastAt.getTime()) / msPerDay;
    const safeDecayDays = Math.max(1, decayDays);
    const recency = Math.exp(-daysSince / safeDecayDays);
    return signal * (0.7 + 0.3 * recency);
  }

  private resolveEnvNumber(key: string, fallback: number): number {
    const raw = process.env[key];
    if (raw === undefined) {
      return fallback;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return value;
  }

  /**
   * Determine if entity is new per PRD 5.1.2 "new entity status"
   *
   * @param createdAt - Entity creation timestamp
   * @param lastUpdated - Last update timestamp
   * @returns boolean - True if entity is considered new
   */
  private isNewEntity(createdAt: Date, lastUpdated: Date): boolean {
    const now = new Date();
    const daysSinceCreation =
      (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const daysSinceUpdate =
      (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);

    // Entity is new if:
    // 1. Created within last 14 days, OR
    // 2. Created within last 30 days and has limited activity (not updated much)
    return (
      daysSinceCreation <= 14 ||
      (daysSinceCreation <= 30 && daysSinceUpdate <= 3)
    );
  }

  /**
   * Get entity type breakdown for logging
   */
  private getEntityTypeBreakdown(
    entities: EntityPriorityScore[],
  ): Record<string, number> {
    const breakdown: Record<string, number> = {};
    for (const entity of entities) {
      breakdown[entity.entityType] = (breakdown[entity.entityType] || 0) + 1;
    }
    return breakdown;
  }

  /**
   * Calculate average score for logging
   */
  private getAverageScore(entities: EntityPriorityScore[]): number {
    if (entities.length === 0) return 0;
    const totalScore = entities.reduce((sum, entity) => sum + entity.score, 0);
    return Math.round((totalScore / entities.length) * 100) / 100;
  }

  /**
   * Get priority selection metrics for monitoring
   */
  async getPrioritySelectionMetrics(): Promise<{
    totalEntities: Record<EntityType, number>;
    recentlyUpdated: Record<EntityType, number>; // Updated within 7 days
    staleEntities: Record<EntityType, number>; // Not updated in 30+ days
    newEntities: Record<EntityType, number>; // Created within 14 days
  }> {
    try {
      this.logger.debug('Getting priority selection metrics');

      const metrics = {
        totalEntities: {} as Record<EntityType, number>,
        recentlyUpdated: {} as Record<EntityType, number>,
        staleEntities: {} as Record<EntityType, number>,
        newEntities: {} as Record<EntityType, number>,
      };

      const entityTypes: EntityType[] = [
        'restaurant',
        'food',
        'food_attribute',
        'restaurant_attribute',
      ];
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const fourteenDaysAgo = new Date(
        now.getTime() - 14 * 24 * 60 * 60 * 1000,
      );

      for (const entityType of entityTypes) {
        const [total, recent, stale, newEntities] = await Promise.all([
          this.entityRepository.count({ type: entityType }),
          this.entityRepository.count({
            type: entityType,
            lastUpdated: { gte: sevenDaysAgo },
          }),
          this.entityRepository.count({
            type: entityType,
            lastUpdated: { lt: thirtyDaysAgo },
          }),
          this.entityRepository.count({
            type: entityType,
            createdAt: { gte: fourteenDaysAgo },
          }),
        ]);

        metrics.totalEntities[entityType] = total;
        metrics.recentlyUpdated[entityType] = recent;
        metrics.staleEntities[entityType] = stale;
        metrics.newEntities[entityType] = newEntities;
      }

      this.logger.debug('Priority selection metrics retrieved', metrics);
      return metrics;
    } catch (error: unknown) {
      this.logger.error('Failed to get priority selection metrics', {
        error: {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
      });
      throw error;
    }
  }
}
