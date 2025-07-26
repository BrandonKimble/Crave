import { Injectable } from '@nestjs/common';
import { Entity, Prisma, EntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../shared';
import { BaseRepository } from './base/base.repository';
import { ValidationException } from './base/repository.exceptions';
import {
  validateEntityTypeData,
  validateEssentialEntityFields,
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
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find entities by type`, {
        duration,
        error: error instanceof Error ? error.message : String(error),
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
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find restaurants by location`, {
        duration,
        error: error instanceof Error ? error.message : String(error),
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
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find entities by name or alias`, {
        duration,
        error: error instanceof Error ? error.message : String(error),
        searchTerm,
        type,
        params,
      });

      throw this.handlePrismaError(error, 'findByNameOrAlias');
    }
  }

  /**
   * Find entities with restaurant attributes
   * @param attributeIds - Array of restaurant attribute entity IDs
   * @param matchType - 'any' to match restaurants with ANY of the attributes (default), 'all' to match restaurants with ALL attributes
   * @param params - Additional query parameters
   */
  async findByRestaurantAttributes(
    attributeIds: string[],
    matchType: 'any' | 'all' = 'any',
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
        matchType,
        params,
      });

      const whereClause: Prisma.EntityWhereInput = {
        type: 'restaurant',
        restaurantAttributes:
          matchType === 'all'
            ? { hasEvery: attributeIds }
            : { hasSome: attributeIds },
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
        matchType,
        count: result.length,
      });

      return result;
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find entities by restaurant attributes`, {
        duration,
        error: error instanceof Error ? error.message : String(error),
        attributeIds,
        matchType,
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
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to update restaurant quality score`, {
        duration,
        error: error instanceof Error ? error.message : String(error),
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
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to create restaurant entity`, {
        duration,
        error: error instanceof Error ? error.message : String(error),
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
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to create dish/category entity`, {
        duration,
        error: error instanceof Error ? error.message : String(error),
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
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to create dish attribute entity`, {
        duration,
        error: error instanceof Error ? error.message : String(error),
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
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to create restaurant attribute entity`, {
        duration,
        error: error instanceof Error ? error.message : String(error),
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
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to update entity with validation`, {
        duration,
        error: error instanceof Error ? error.message : String(error),
        entityId,
        expectedType,
      });

      throw error instanceof ValidationException
        ? error
        : this.handlePrismaError(error, 'updateWithValidation');
    }
  }

  /**
   * Validate restaurant attributes consistency
   * Ensures all restaurant_attributes references point to valid restaurant_attribute entities
   *
   * @param restaurantId - Restaurant entity ID to validate
   * @throws ValidationException - When restaurant attributes are invalid
   */
  async validateRestaurantAttributesConsistency(
    restaurantId: string,
  ): Promise<void> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Validating restaurant attributes consistency`, {
        restaurantId,
      });

      const restaurant = await this.findById(restaurantId);

      if (!restaurant) {
        throw new ValidationException('Restaurant', [
          `Restaurant entity with ID ${restaurantId} does not exist`,
        ]);
      }

      if (restaurant.type !== 'restaurant') {
        throw new ValidationException('Restaurant', [
          `Entity ${restaurantId} is type '${restaurant.type}', expected 'restaurant'`,
        ]);
      }

      // Validate each restaurant attribute reference
      if (
        restaurant.restaurantAttributes &&
        restaurant.restaurantAttributes.length > 0
      ) {
        for (const attributeId of restaurant.restaurantAttributes) {
          const attribute = await this.findById(attributeId);

          if (!attribute) {
            throw new ValidationException('Restaurant', [
              `Restaurant attribute entity with ID ${attributeId} does not exist`,
            ]);
          }

          if (attribute.type !== 'restaurant_attribute') {
            throw new ValidationException('Restaurant', [
              `Attribute entity ${attributeId} is type '${attribute.type}', expected 'restaurant_attribute'`,
            ]);
          }
        }
      }

      const duration = Date.now() - startTime;
      this.logger.debug(
        `Restaurant attributes consistency validated successfully`,
        {
          duration,
          restaurantId,
          attributeCount: restaurant.restaurantAttributes?.length || 0,
        },
      );
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error(
        `Failed to validate restaurant attributes consistency`,
        {
          duration,
          error: error instanceof Error ? error.message : String(error),
          restaurantId,
        },
      );

      throw error;
    }
  }

  /**
   * Add restaurant attributes to a restaurant entity with validation
   * Ensures only restaurant_attribute entities are added to restaurant entities
   *
   * @param restaurantId - Restaurant entity ID
   * @param attributeIds - Array of restaurant attribute entity IDs to add
   * @throws ValidationException - When attributes are invalid
   */
  async addRestaurantAttributes(
    restaurantId: string,
    attributeIds: string[],
  ): Promise<Entity> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Adding restaurant attributes`, {
        restaurantId,
        attributeIds,
      });

      // Validate restaurant exists and is correct type
      const restaurant = await this.findById(restaurantId);

      if (!restaurant) {
        throw new ValidationException('Restaurant', [
          `Restaurant entity with ID ${restaurantId} does not exist`,
        ]);
      }

      if (restaurant.type !== 'restaurant') {
        throw new ValidationException('Restaurant', [
          `Entity ${restaurantId} is type '${restaurant.type}', expected 'restaurant'`,
        ]);
      }

      // Validate each attribute exists and is correct type
      for (const attributeId of attributeIds) {
        const attribute = await this.findById(attributeId);

        if (!attribute) {
          throw new ValidationException('Restaurant', [
            `Restaurant attribute entity with ID ${attributeId} does not exist`,
          ]);
        }

        if (attribute.type !== 'restaurant_attribute') {
          throw new ValidationException('Restaurant', [
            `Attribute entity ${attributeId} is type '${attribute.type}', expected 'restaurant_attribute'`,
          ]);
        }
      }

      // Merge with existing attributes (avoid duplicates)
      const existingAttributes = restaurant.restaurantAttributes || [];
      const newAttributes = [
        ...new Set([...existingAttributes, ...attributeIds]),
      ];

      const result = await this.update(restaurantId, {
        restaurantAttributes: newAttributes,
        lastUpdated: new Date(),
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Restaurant attributes added successfully`, {
        duration,
        restaurantId,
        attributeIds,
        totalAttributes: newAttributes.length,
      });

      return result;
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to add restaurant attributes`, {
        duration,
        error: error instanceof Error ? error.message : String(error),
        restaurantId,
        attributeIds,
      });

      throw error instanceof ValidationException
        ? error
        : this.handlePrismaError(error, 'addRestaurantAttributes');
    }
  }

  /**
   * Find dish_or_category entities by their usage context
   * Supports PRD 4.3.1 - entities that serve dual purposes as menu items AND categories
   *
   * @param usageType - Filter by how the entity is used: 'menu_item', 'category', or 'both'
   * @param restaurantId - Optional filter for menu item context
   */
  async findDishEntitiesByUsage(
    usageType: 'menu_item' | 'category' | 'both',
    restaurantId?: string,
  ): Promise<Entity[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding dish entities by usage type`, {
        usageType,
        restaurantId,
      });

      // First get all dish_or_category entities
      const dishEntities = await this.findByType('dish_or_category');

      if (usageType === 'menu_item' && restaurantId) {
        // Find entities used as menu items in specific restaurant
        const menuConnections = await this.prisma.connection.findMany({
          where: {
            restaurantId,
            isMenuItem: true,
          },
          select: {
            dishOrCategoryId: true,
          },
        });

        const menuItemIds = new Set(
          menuConnections.map((c) => c.dishOrCategoryId),
        );
        return dishEntities.filter((entity) =>
          menuItemIds.has(entity.entityId),
        );
      }

      if (usageType === 'category') {
        // Find entities used as categories (in categories arrays)
        const categoryConnections = await this.prisma.connection.findMany({
          where: {
            categories: {
              isEmpty: false,
            },
          },
          select: {
            categories: true,
          },
        });

        const categoryIds = new Set(
          categoryConnections.flatMap((c) => c.categories),
        );
        return dishEntities.filter((entity) =>
          categoryIds.has(entity.entityId),
        );
      }

      if (usageType === 'both') {
        // Find entities used in both contexts (dual-purpose)
        const results: Entity[] = [];

        for (const entity of dishEntities) {
          const [menuUsage, categoryUsage] = await Promise.all([
            this.prisma.connection.count({
              where: {
                dishOrCategoryId: entity.entityId,
                isMenuItem: true,
              },
            }),
            this.prisma.connection.count({
              where: {
                categories: {
                  has: entity.entityId,
                },
              },
            }),
          ]);

          if (menuUsage > 0 && categoryUsage > 0) {
            results.push(entity);
          }
        }

        return results;
      }

      const duration = Date.now() - startTime;
      this.logger.debug(`Find dish entities by usage completed`, {
        duration,
        usageType,
        restaurantId,
        count: dishEntities.length,
      });

      return dishEntities;
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find dish entities by usage`, {
        duration,
        error: error instanceof Error ? error.message : String(error),
        usageType,
        restaurantId,
      });

      throw this.handlePrismaError(error, 'findDishEntitiesByUsage');
    }
  }

  /**
   * Find entities by name across multiple types with context awareness
   * Supports PRD 4.3.2 - context-dependent attributes that exist in multiple scopes
   *
   * @param searchTerm - Name to search for
   * @param entityTypes - Types to search in (supports context-dependent resolution)
   */
  async findByNameAcrossTypes(
    searchTerm: string,
    entityTypes: EntityType[] = ['dish_attribute', 'restaurant_attribute'],
    params?: {
      orderBy?: Prisma.EntityOrderByWithRelationInput;
      skip?: number;
      take?: number;
    },
  ): Promise<{
    [key in EntityType]?: Entity[];
  }> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding entities by name across types`, {
        searchTerm,
        entityTypes,
        params,
      });

      const results: { [key in EntityType]?: Entity[] } = {};

      // Search each entity type separately to maintain context awareness
      for (const entityType of entityTypes) {
        const entities = await this.getDelegate().findMany({
          where: {
            type: entityType,
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
          },
          orderBy: params?.orderBy || [{ name: 'asc' }],
          skip: params?.skip,
          take: params?.take,
        });

        if (entities.length > 0) {
          results[entityType] = entities;
        }
      }

      const duration = Date.now() - startTime;
      const totalCount = Object.values(results).reduce(
        (sum, entities) => sum + (entities?.length || 0),
        0,
      );

      this.logger.debug(`Find entities by name across types completed`, {
        duration,
        searchTerm,
        entityTypes,
        totalCount,
        typeBreakdown: Object.fromEntries(
          Object.entries(results).map(([type, entities]) => [
            type,
            entities?.length || 0,
          ]),
        ),
      });

      return results;
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find entities by name across types`, {
        duration,
        error: error instanceof Error ? error.message : String(error),
        searchTerm,
        entityTypes,
        params,
      });

      throw this.handlePrismaError(error, 'findByNameAcrossTypes');
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
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to get entity health metrics`, {
        duration,
        error: error instanceof Error ? error.message : String(error),
      });

      throw this.handlePrismaError(error, 'getHealthMetrics');
    }
  }
}
