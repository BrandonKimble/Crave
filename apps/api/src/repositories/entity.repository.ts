import { Injectable } from '@nestjs/common';
import { Entity, Prisma, EntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../shared';
import { BaseRepository } from './base/base.repository';
import { ValidationException } from './base/repository.exceptions';
import {
  validateEntityTypeData,
  validateEssentialEntityFields,
  isValidEntityType,
} from './utils/entity-type-guards';

/**
 * Repository for Entity model operations
 * Handles unified entity storage for restaurants, dishes, categories, and attributes
 */
@Injectable()
export class EntityRepository extends BaseRepository<
  Entity,
  Prisma.EntityWhereInput,
  Prisma.EntityCreateInput,
  Prisma.EntityUpdateInput
> {
  constructor(prisma: PrismaService, loggerService: LoggerService) {
    super(prisma, loggerService, 'Entity');
  }

  protected getDelegate() {
    return this.prisma.entity;
  }

  protected getPrimaryKeyField(): string {
    return 'entityId';
  }

  /**
   * Find entities by type with optional filtering
   */
  async findByType(
    type: EntityType,
    params?: {
      where?: Prisma.EntityWhereInput;
      orderBy?: Prisma.EntityOrderByWithRelationInput;
      skip?: number;
      take?: number;
      include?: Prisma.EntityInclude;
    },
  ): Promise<Entity[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding entities by type`, { type, params });

      const whereClause: Prisma.EntityWhereInput = {
        type,
        ...params?.where,
      };

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: params?.orderBy,
        skip: params?.skip,
        take: params?.take,
        include: params?.include,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find entities by type completed`, {
        duration,
        type,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find entities by type`, {
        duration,
        error: error.message,
        type,
        params,
      });

      throw this.handlePrismaError(error, 'findByType');
    }
  }

  /**
   * Find restaurants by location within a radius
   */
  async findRestaurantsByLocation(
    latitude: number,
    longitude: number,
    radiusKm: number = 10,
    params?: {
      where?: Prisma.EntityWhereInput;
      orderBy?: Prisma.EntityOrderByWithRelationInput;
      skip?: number;
      take?: number;
    },
  ): Promise<Entity[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding restaurants by location`, {
        latitude,
        longitude,
        radiusKm,
        params,
      });

      // Calculate approximate bounding box for performance
      const latDelta = radiusKm / 111; // Approximate km per degree latitude
      const lonDelta = radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));

      const whereClause: Prisma.EntityWhereInput = {
        type: 'restaurant',
        latitude: {
          gte: latitude - latDelta,
          lte: latitude + latDelta,
        },
        longitude: {
          gte: longitude - lonDelta,
          lte: longitude + lonDelta,
        },
        ...params?.where,
      };

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: params?.orderBy || { restaurantQualityScore: 'desc' },
        skip: params?.skip,
        take: params?.take,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find restaurants by location completed`, {
        duration,
        latitude,
        longitude,
        radiusKm,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find restaurants by location`, {
        duration,
        error: error.message,
        latitude,
        longitude,
        radiusKm,
        params,
      });

      throw this.handlePrismaError(error, 'findRestaurantsByLocation');
    }
  }

  /**
   * Find entities by name or aliases using fuzzy matching
   */
  async findByNameOrAlias(
    searchTerm: string,
    type?: EntityType,
    params?: {
      orderBy?: Prisma.EntityOrderByWithRelationInput;
      skip?: number;
      take?: number;
    },
  ): Promise<Entity[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding entities by name or alias`, {
        searchTerm,
        type,
        params,
      });

      const whereClause: Prisma.EntityWhereInput = {
        ...(type && { type }),
        OR: [
          {
            name: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          },
          {
            aliases: {
              has: searchTerm,
            },
          },
        ],
      };

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: params?.orderBy || [
          { name: 'asc' },
          { restaurantQualityScore: 'desc' },
        ],
        skip: params?.skip,
        take: params?.take,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find entities by name or alias completed`, {
        duration,
        searchTerm,
        type,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find entities by name or alias`, {
        duration,
        error: error.message,
        searchTerm,
        type,
        params,
      });

      throw this.handlePrismaError(error, 'findByNameOrAlias');
    }
  }

  /**
   * Find entities with restaurant attributes
   */
  async findByRestaurantAttributes(
    attributeIds: string[],
    params?: {
      where?: Prisma.EntityWhereInput;
      orderBy?: Prisma.EntityOrderByWithRelationInput;
      skip?: number;
      take?: number;
    },
  ): Promise<Entity[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding entities by restaurant attributes`, {
        attributeIds,
        params,
      });

      const whereClause: Prisma.EntityWhereInput = {
        type: 'restaurant',
        restaurantAttributes: {
          hasEvery: attributeIds,
        },
        ...params?.where,
      };

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: params?.orderBy || { restaurantQualityScore: 'desc' },
        skip: params?.skip,
        take: params?.take,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find entities by restaurant attributes completed`, {
        duration,
        attributeIds,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find entities by restaurant attributes`, {
        duration,
        error: error.message,
        attributeIds,
        params,
      });

      throw this.handlePrismaError(error, 'findByRestaurantAttributes');
    }
  }

  /**
   * Update restaurant quality score
   */
  async updateRestaurantQualityScore(
    entityId: string,
    qualityScore: number,
  ): Promise<Entity> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Updating restaurant quality score`, {
        entityId,
        qualityScore,
      });

      const result = await this.getDelegate().update({
        where: { entityId },
        data: {
          restaurantQualityScore: qualityScore,
          lastUpdated: new Date(),
        },
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Updated restaurant quality score successfully`, {
        duration,
        entityId,
        qualityScore,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to update restaurant quality score`, {
        duration,
        error: error.message,
        entityId,
        qualityScore,
      });

      throw this.handlePrismaError(error, 'updateRestaurantQualityScore');
    }
  }

  /**
   * Create a restaurant entity with validation
   */
  async createRestaurant(data: {
    name: string;
    aliases?: string[];
    latitude?: number;
    longitude?: number;
    address?: string;
    googlePlaceId?: string;
    restaurantAttributes?: string[];
    restaurantMetadata?: Record<string, any>;
  }): Promise<Entity> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Creating restaurant entity`, { name: data.name });

      const createInput: Prisma.EntityCreateInput = {
        name: data.name,
        type: 'restaurant',
        aliases: data.aliases || [],
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address,
        googlePlaceId: data.googlePlaceId,
        restaurantAttributes: data.restaurantAttributes || [],
        restaurantMetadata: data.restaurantMetadata || {},
        restaurantQualityScore: 0,
      };

      // Validate essential fields
      const validation = validateEssentialEntityFields(
        'restaurant',
        createInput,
      );
      if (!validation.isValid) {
        throw new ValidationException('restaurant', validation.missingFields);
      }

      const result = await this.create(createInput);

      const duration = Date.now() - startTime;
      this.logger.debug(`Created restaurant entity successfully`, {
        duration,
        entityId: result.entityId,
        name: data.name,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to create restaurant entity`, {
        duration,
        error: error.message,
        name: data.name,
      });

      throw error instanceof ValidationException
        ? error
        : this.handlePrismaError(error, 'createRestaurant');
    }
  }

  /**
   * Create a dish or category entity with validation
   */
  async createDishOrCategory(data: {
    name: string;
    aliases?: string[];
  }): Promise<Entity> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Creating dish/category entity`, { name: data.name });

      const createInput: Prisma.EntityCreateInput = {
        name: data.name,
        type: 'dish_or_category',
        aliases: data.aliases || [],
      };

      // Validate essential fields
      const validation = validateEssentialEntityFields(
        'dish_or_category',
        createInput,
      );
      if (!validation.isValid) {
        throw new ValidationException(
          'dish_or_category',
          validation.missingFields,
        );
      }

      const result = await this.create(createInput);

      const duration = Date.now() - startTime;
      this.logger.debug(`Created dish/category entity successfully`, {
        duration,
        entityId: result.entityId,
        name: data.name,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to create dish/category entity`, {
        duration,
        error: error.message,
        name: data.name,
      });

      throw error instanceof ValidationException
        ? error
        : this.handlePrismaError(error, 'createDishOrCategory');
    }
  }

  /**
   * Create a dish attribute entity with validation
   */
  async createDishAttribute(data: {
    name: string;
    aliases?: string[];
  }): Promise<Entity> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Creating dish attribute entity`, { name: data.name });

      const createInput: Prisma.EntityCreateInput = {
        name: data.name,
        type: 'dish_attribute',
        aliases: data.aliases || [],
      };

      // Validate essential fields
      const validation = validateEssentialEntityFields(
        'dish_attribute',
        createInput,
      );
      if (!validation.isValid) {
        throw new ValidationException(
          'dish_attribute',
          validation.missingFields,
        );
      }

      const result = await this.create(createInput);

      const duration = Date.now() - startTime;
      this.logger.debug(`Created dish attribute entity successfully`, {
        duration,
        entityId: result.entityId,
        name: data.name,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to create dish attribute entity`, {
        duration,
        error: error.message,
        name: data.name,
      });

      throw error instanceof ValidationException
        ? error
        : this.handlePrismaError(error, 'createDishAttribute');
    }
  }

  /**
   * Create a restaurant attribute entity with validation
   */
  async createRestaurantAttribute(data: {
    name: string;
    aliases?: string[];
  }): Promise<Entity> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Creating restaurant attribute entity`, {
        name: data.name,
      });

      const createInput: Prisma.EntityCreateInput = {
        name: data.name,
        type: 'restaurant_attribute',
        aliases: data.aliases || [],
      };

      // Validate essential fields
      const validation = validateEssentialEntityFields(
        'restaurant_attribute',
        createInput,
      );
      if (!validation.isValid) {
        throw new ValidationException(
          'restaurant_attribute',
          validation.missingFields,
        );
      }

      const result = await this.create(createInput);

      const duration = Date.now() - startTime;
      this.logger.debug(`Created restaurant attribute entity successfully`, {
        duration,
        entityId: result.entityId,
        name: data.name,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to create restaurant attribute entity`, {
        duration,
        error: error.message,
        name: data.name,
      });

      throw error instanceof ValidationException
        ? error
        : this.handlePrismaError(error, 'createRestaurantAttribute');
    }
  }

  /**
   * Update entity with type-specific validation
   */
  async updateWithValidation(
    entityId: string,
    data: Prisma.EntityUpdateInput,
    expectedType?: EntityType,
  ): Promise<Entity> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Updating entity with validation`, {
        entityId,
        expectedType,
      });

      // If type is provided, validate the data against that type
      if (expectedType && !validateEntityTypeData(expectedType, data)) {
        throw new ValidationException(expectedType, [
          `Invalid data for entity type ${expectedType}`,
        ]);
      }

      const updateData = {
        ...data,
        lastUpdated: new Date(),
      };

      const result = await this.update(entityId, updateData);

      const duration = Date.now() - startTime;
      this.logger.debug(`Updated entity with validation successfully`, {
        duration,
        entityId,
        expectedType,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to update entity with validation`, {
        duration,
        error: error.message,
        entityId,
        expectedType,
      });

      throw error instanceof ValidationException
        ? error
        : this.handlePrismaError(error, 'updateWithValidation');
    }
  }

  /**
   * Get health metrics for entity repository
   */
  async getHealthMetrics(): Promise<{
    restaurant: number;
    dish_or_category: number;
    dish_attribute: number;
    restaurant_attribute: number;
    total: number;
  }> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Getting entity health metrics`);

      const [
        restaurantCount,
        dishCategoryCount,
        dishAttributeCount,
        restaurantAttributeCount,
        totalCount,
      ] = await Promise.all([
        this.count({ type: 'restaurant' }),
        this.count({ type: 'dish_or_category' }),
        this.count({ type: 'dish_attribute' }),
        this.count({ type: 'restaurant_attribute' }),
        this.count({}),
      ]);

      const duration = Date.now() - startTime;
      this.logger.debug(`Entity health metrics retrieved successfully`, {
        duration,
        totalCount,
        restaurantCount,
      });

      return {
        restaurant: restaurantCount,
        dish_or_category: dishCategoryCount,
        dish_attribute: dishAttributeCount,
        restaurant_attribute: restaurantAttributeCount,
        total: totalCount,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to get entity health metrics`, {
        duration,
        error: error.message,
      });

      throw this.handlePrismaError(error, 'getHealthMetrics');
    }
  }
}
