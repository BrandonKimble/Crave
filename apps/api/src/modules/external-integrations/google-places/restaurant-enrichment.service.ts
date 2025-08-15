import { Injectable, OnModuleInit } from '@nestjs/common';
import { Entity, Prisma } from '@prisma/client';
import { GooglePlacesService } from './google-places.service';
import { EntityRepository } from '../../../repositories/entity.repository';
import { LoggerService, CorrelationUtils } from '../../../shared';
import {
  RestaurantEnrichmentInput,
  EnrichedRestaurantData,
} from './google-places.types';

/**
 * Service for enriching restaurant entities with Google Places data
 * Implements PRD Section 9.2.1: Restaurant data enrichment, location services setup
 */
@Injectable()
export class RestaurantEnrichmentService implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    private readonly googlePlacesService: GooglePlacesService,
    private readonly entityRepository: EntityRepository,
    private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('RestaurantEnrichmentService');
  }

  /**
   * Enrich restaurant entity with Google Places data
   * Updates restaurant with location, hours, and metadata from Google Places API
   */
  async enrichRestaurantEntity(
    restaurantEntity: Entity,
    searchOptions?: {
      forceUpdate?: boolean;
      useExistingData?: boolean;
    },
  ): Promise<Entity> {
    this.logger.info('Enriching restaurant entity with Google Places data', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'enrich_restaurant_entity',
      entityId: restaurantEntity.entityId,
      restaurantName: restaurantEntity.name,
      existingPlaceId: restaurantEntity.googlePlaceId,
    });

    const startTime = Date.now();

    try {
      // Skip enrichment if entity already has Google Places data and not forcing update
      if (
        !searchOptions?.forceUpdate &&
        restaurantEntity.googlePlaceId &&
        restaurantEntity.latitude &&
        restaurantEntity.longitude
      ) {
        this.logger.info(
          'Restaurant already has Google Places data, skipping enrichment',
          {
            correlationId: CorrelationUtils.getCorrelationId(),
            operation: 'enrich_restaurant_entity',
            entityId: restaurantEntity.entityId,
            placeId: restaurantEntity.googlePlaceId,
          },
        );
        return restaurantEntity;
      }

      // Prepare enrichment input
      const enrichmentInput: RestaurantEnrichmentInput = {
        name: restaurantEntity.name,
        existingPlaceId: restaurantEntity.googlePlaceId || undefined,
        latitude: restaurantEntity.latitude
          ? Number(restaurantEntity.latitude)
          : undefined,
        longitude: restaurantEntity.longitude
          ? Number(restaurantEntity.longitude)
          : undefined,
        address: restaurantEntity.address || undefined,
      };

      // Get enriched data from Google Places
      const enrichedData =
        await this.googlePlacesService.enrichRestaurant(enrichmentInput);

      // Update restaurant entity with enriched data
      const updatedEntity = await this.updateRestaurantWithEnrichedData(
        restaurantEntity,
        enrichedData,
      );

      const responseTime = Date.now() - startTime;

      this.logger.info('Restaurant entity enrichment completed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'enrich_restaurant_entity',
        entityId: updatedEntity.entityId,
        placeId: enrichedData.placeId,
        dataQuality: enrichedData.metadata.dataQuality,
        responseTime,
      });

      return updatedEntity;
    } catch (error) {
      const responseTime = Date.now() - startTime;

      this.logger.error('Restaurant entity enrichment failed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'enrich_restaurant_entity',
        entityId: restaurantEntity.entityId,
        error: error instanceof Error ? error.message : String(error),
        responseTime,
      });

      // Return original entity if enrichment fails (graceful degradation)
      return restaurantEntity;
    }
  }

  /**
   * Bulk enrich multiple restaurant entities
   */
  async bulkEnrichRestaurants(
    restaurantEntities: Entity[],
    options?: {
      batchSize?: number;
      delayBetweenBatches?: number;
      skipExisting?: boolean;
    },
  ): Promise<{
    enrichedEntities: Entity[];
    metrics: {
      totalProcessed: number;
      successfulEnrichments: number;
      skippedEntities: number;
      failedEnrichments: number;
      totalResponseTime: number;
    };
  }> {
    const {
      batchSize = 10,
      delayBetweenBatches = 1000,
      skipExisting = true,
    } = options || {};

    this.logger.info('Starting bulk restaurant enrichment', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'bulk_enrich_restaurants',
      totalEntities: restaurantEntities.length,
      batchSize,
      skipExisting,
    });

    const startTime = Date.now();
    const enrichedEntities: Entity[] = [];
    let successfulEnrichments = 0;
    let skippedEntities = 0;
    let failedEnrichments = 0;

    // Process restaurants in batches to respect rate limits
    for (let i = 0; i < restaurantEntities.length; i += batchSize) {
      const batch = restaurantEntities.slice(i, i + batchSize);

      this.logger.info('Processing batch', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'bulk_enrich_restaurants',
        batchNumber: Math.floor(i / batchSize) + 1,
        batchSize: batch.length,
      });

      // Process batch sequentially to avoid rate limiting
      for (const restaurant of batch) {
        try {
          const enrichedEntity = await this.enrichRestaurantEntity(restaurant, {
            forceUpdate: !skipExisting,
          });

          enrichedEntities.push(enrichedEntity);

          // Check if enrichment actually occurred
          if (enrichedEntity.lastUpdated !== restaurant.lastUpdated) {
            successfulEnrichments++;
          } else {
            skippedEntities++;
          }
        } catch (error) {
          this.logger.warn('Failed to enrich restaurant in batch', {
            correlationId: CorrelationUtils.getCorrelationId(),
            operation: 'bulk_enrich_restaurants',
            entityId: restaurant.entityId,
            restaurantName: restaurant.name,
            error: {
              message: error instanceof Error ? error.message : String(error),
              name: error instanceof Error ? error.name : 'UnknownError',
            },
          });

          // Add original entity to results
          enrichedEntities.push(restaurant);
          failedEnrichments++;
        }

        // Small delay between requests to be respectful of rate limits
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // Delay between batches if not the last batch
      if (i + batchSize < restaurantEntities.length) {
        this.logger.debug('Waiting between batches', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'bulk_enrich_restaurants',
          delay: delayBetweenBatches,
        });
        await new Promise((resolve) =>
          setTimeout(resolve, delayBetweenBatches),
        );
      }
    }

    const totalResponseTime = Date.now() - startTime;

    const metrics = {
      totalProcessed: restaurantEntities.length,
      successfulEnrichments,
      skippedEntities,
      failedEnrichments,
      totalResponseTime,
    };

    this.logger.info('Bulk restaurant enrichment completed', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'bulk_enrich_restaurants',
      ...metrics,
    });

    return {
      enrichedEntities,
      metrics,
    };
  }

  /**
   * Create a new restaurant entity with Google Places enrichment
   */
  async createEnrichedRestaurant(restaurantData: {
    name: string;
    address?: string;
    latitude?: number;
    longitude?: number;
  }): Promise<Entity> {
    this.logger.info('Creating enriched restaurant entity', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'create_enriched_restaurant',
      restaurantName: restaurantData.name,
    });

    try {
      // Get enriched data from Google Places first
      const enrichedData = await this.googlePlacesService.enrichRestaurant({
        name: restaurantData.name,
        address: restaurantData.address,
        latitude: restaurantData.latitude,
        longitude: restaurantData.longitude,
      });

      // Create restaurant entity with enriched data
      const restaurantEntity = await this.entityRepository.createRestaurant({
        name: enrichedData.name,
        latitude: enrichedData.latitude,
        longitude: enrichedData.longitude,
        address: enrichedData.address,
        googlePlaceId: enrichedData.placeId,
        restaurantMetadata: this.buildRestaurantMetadata(
          enrichedData,
        ) as Record<string, any>,
      });

      this.logger.info('Enriched restaurant entity created', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'create_enriched_restaurant',
        entityId: restaurantEntity.entityId,
        placeId: enrichedData.placeId,
        dataQuality: enrichedData.metadata.dataQuality,
      });

      return restaurantEntity;
    } catch (error) {
      this.logger.error('Failed to create enriched restaurant entity', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'create_enriched_restaurant',
        restaurantName: restaurantData.name,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Update restaurant entity with enriched Google Places data
   */
  private async updateRestaurantWithEnrichedData(
    restaurantEntity: Entity,
    enrichedData: EnrichedRestaurantData,
  ): Promise<Entity> {
    const updateData: Prisma.EntityUpdateInput = {
      latitude: enrichedData.latitude,
      longitude: enrichedData.longitude,
      address: enrichedData.address,
      googlePlaceId: enrichedData.placeId,
      restaurantMetadata: this.buildRestaurantMetadata(
        enrichedData,
      ) as Prisma.InputJsonValue,
      lastUpdated: new Date(),
    };

    return await this.entityRepository.update(
      restaurantEntity.entityId,
      updateData,
    );
  }

  /**
   * Build restaurant metadata from enriched Google Places data
   */
  private buildRestaurantMetadata(
    enrichedData: EnrichedRestaurantData,
  ): Prisma.JsonValue {
    const metadata: Record<string, any> = {
      phone: enrichedData.phone,
      website: enrichedData.website,
      hours: enrichedData.hours,
      priceLevel: enrichedData.priceLevel,
      rating: enrichedData.rating,
      totalRatings: enrichedData.totalRatings,
      lastPlacesUpdate: enrichedData.metadata.lastPlacesUpdate,
      dataQuality: enrichedData.metadata.dataQuality,
      confidence: enrichedData.metadata.confidence,
      apiCallsUsed: enrichedData.metadata.apiCallsUsed,
    };

    // Remove undefined values
    return Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => value !== undefined),
    );
  }
}
