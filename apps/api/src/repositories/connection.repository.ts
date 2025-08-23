/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable } from '@nestjs/common';
import { Connection, Prisma, ActivityLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../shared';
import { BaseRepository } from './base/base.repository';
import { EntityRepository } from './entity.repository';
import { ValidationException } from './base/repository.exceptions';

/**
 * Repository for Connection model operations
 * Handles entity relationships with quality scores and community evidence
 * Provides validation for restaurant-dish connections with proper entity type checking
 */
@Injectable()
export class ConnectionRepository extends BaseRepository<
  Connection,
  Prisma.ConnectionWhereInput,
  Prisma.ConnectionCreateInput,
  Prisma.ConnectionUpdateInput
> {
  constructor(
    prisma: PrismaService,
    loggerService: LoggerService,
    private readonly entityRepository: EntityRepository,
  ) {
    super(prisma, loggerService, 'Connection');
  }

  protected getDelegate() {
    return this.prisma.connection;
  }

  protected getPrimaryKeyField(): string {
    return 'connectionId';
  }

  /**
   * Create a new connection with comprehensive validation
   * Validates entity existence, types, and relationship constraints
   *
   * @param data - Connection creation data
   * @returns Promise<Connection> - The created connection
   * @throws ValidationException - When entity validation fails
   * @throws ForeignKeyConstraintException - When referenced entities don't exist
   */
  async createWithValidation(data: {
    restaurantId: string;
    dishOrCategoryId: string;
    categories?: string[];
    dishAttributes?: string[];
    isMenuItem?: boolean;
  }): Promise<Connection> {
    const startTime = Date.now();
    try {
      this.logger.debug('Creating connection with validation', {
        restaurantId: data.restaurantId,
        dishOrCategoryId: data.dishOrCategoryId,
        categories: data.categories?.length || 0,
        dishAttributes: data.dishAttributes?.length || 0,
      });

      // Step 1: Validate restaurant entity exists and is correct type
      await this.validateRestaurantEntity(data.restaurantId);

      // Step 2: Validate dish entity exists and is correct type
      await this.validateDishEntity(data.dishOrCategoryId);

      // Step 3: Validate categories if provided
      if (data.categories && data.categories.length > 0) {
        await this.validateCategoryEntities(data.categories);
      }

      // Step 4: Validate dish attributes if provided
      if (data.dishAttributes && data.dishAttributes.length > 0) {
        await this.validateDishAttributeEntities(data.dishAttributes);
      }

      // Step 5: Create the connection
      const createInput: Prisma.ConnectionCreateInput = {
        restaurant: {
          connect: { entityId: data.restaurantId },
        },
        dish: {
          connect: { entityId: data.dishOrCategoryId },
        },
        categories: data.categories || [],
        dishAttributes: data.dishAttributes || [],
        isMenuItem: data.isMenuItem ?? true,
        mentionCount: 0,
        totalUpvotes: 0,
        sourceDiversity: 0,
        recentMentionCount: 0,
        dishQualityScore: 0,
        activityLevel: 'normal',
      };

      const result = await this.create(createInput);

      const duration = Date.now() - startTime;
      this.logger.debug('Connection created with validation successfully', {
        duration,
        connectionId: result.connectionId,
        restaurantId: data.restaurantId,
        dishOrCategoryId: data.dishOrCategoryId,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to create connection with validation', {
        duration,
        error: error.message,
        restaurantId: data.restaurantId,
        dishOrCategoryId: data.dishOrCategoryId,
      });

      throw error;
    }
  }

  /**
   * Validate that a restaurant entity exists and has the correct type
   *
   * @param restaurantId - The restaurant entity ID to validate
   * @throws ValidationException - When entity doesn't exist or has wrong type
   */
  private async validateRestaurantEntity(restaurantId: string): Promise<void> {
    const restaurant = await this.entityRepository.findById(restaurantId);

    if (!restaurant) {
      throw new ValidationException('Connection', [
        `Restaurant entity with ID ${restaurantId} does not exist`,
      ]);
    }

    if (restaurant.type !== 'restaurant') {
      throw new ValidationException('Connection', [
        `Entity ${restaurantId} is type '${restaurant.type}', expected 'restaurant'`,
      ]);
    }
  }

  /**
   * Validate that a dish entity exists and has the correct type
   *
   * @param dishOrCategoryId - The dish/category entity ID to validate
   * @throws ValidationException - When entity doesn't exist or has wrong type
   */
  private async validateDishEntity(dishOrCategoryId: string): Promise<void> {
    const dish = await this.entityRepository.findById(dishOrCategoryId);

    if (!dish) {
      throw new ValidationException('Connection', [
        `Dish/category entity with ID ${dishOrCategoryId} does not exist`,
      ]);
    }

    if (dish.type !== 'dish_or_category') {
      throw new ValidationException('Connection', [
        `Entity ${dishOrCategoryId} is type '${dish.type}', expected 'dish_or_category'`,
      ]);
    }
  }

  /**
   * Validate that category entities exist and have the correct type
   *
   * @param categoryIds - Array of category entity IDs to validate
   * @throws ValidationException - When any category entity doesn't exist or has wrong type
   */
  private async validateCategoryEntities(categoryIds: string[]): Promise<void> {
    for (const categoryId of categoryIds) {
      const category = await this.entityRepository.findById(categoryId);

      if (!category) {
        throw new ValidationException('Connection', [
          `Category entity with ID ${categoryId} does not exist`,
        ]);
      }

      if (category.type !== 'dish_or_category') {
        throw new ValidationException('Connection', [
          `Category entity ${categoryId} is type '${category.type}', expected 'dish_or_category'`,
        ]);
      }
    }
  }

  /**
   * Validate that dish attribute entities exist and have the correct type
   *
   * @param attributeIds - Array of dish attribute entity IDs to validate
   * @throws ValidationException - When any attribute entity doesn't exist or has wrong type
   */
  private async validateDishAttributeEntities(
    attributeIds: string[],
  ): Promise<void> {
    for (const attributeId of attributeIds) {
      const attribute = await this.entityRepository.findById(attributeId);

      if (!attribute) {
        throw new ValidationException('Connection', [
          `Dish attribute entity with ID ${attributeId} does not exist`,
        ]);
      }

      if (attribute.type !== 'dish_attribute') {
        throw new ValidationException('Connection', [
          `Attribute entity ${attributeId} is type '${attribute.type}', expected 'dish_attribute'`,
        ]);
      }
    }
  }

  /**
   * Override the base create method to use validation by default
   *
   * @param data - Connection creation data
   * @returns Promise<Connection> - The created connection
   */
  async create(data: Prisma.ConnectionCreateInput): Promise<Connection> {
    // If this is basic Prisma data, use the base implementation
    return super.create(data);
  }

  /**
   * Find connections for a specific restaurant
   */
  async findByRestaurant(
    restaurantId: string,
    params?: {
      where?: Prisma.ConnectionWhereInput;
      orderBy?: Prisma.ConnectionOrderByWithRelationInput;
      skip?: number;
      take?: number;
      include?: Prisma.ConnectionInclude;
    },
  ): Promise<Connection[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding connections by restaurant`, {
        restaurantId,
        params,
      });

      const whereClause: Prisma.ConnectionWhereInput = {
        restaurantId,
        ...params?.where,
      };

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: params?.orderBy || { dishQualityScore: 'desc' },
        skip: params?.skip,
        take: params?.take,
        include: params?.include,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find connections by restaurant completed`, {
        duration,
        restaurantId,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find connections by restaurant`, {
        duration,
        error: error.message,
        restaurantId,
        params,
      });

      throw this.handlePrismaError(error, 'findByRestaurant');
    }
  }

  /**
   * Find connections for a specific dish across all restaurants
   */
  async findByDish(
    dishOrCategoryId: string,
    params?: {
      where?: Prisma.ConnectionWhereInput;
      orderBy?: Prisma.ConnectionOrderByWithRelationInput;
      skip?: number;
      take?: number;
      include?: Prisma.ConnectionInclude;
    },
  ): Promise<Connection[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding connections by dish`, {
        dishOrCategoryId,
        params,
      });

      const whereClause: Prisma.ConnectionWhereInput = {
        dishOrCategoryId,
        ...params?.where,
      };

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: params?.orderBy || { dishQualityScore: 'desc' },
        skip: params?.skip,
        take: params?.take,
        include: params?.include,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find connections by dish completed`, {
        duration,
        dishOrCategoryId,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find connections by dish`, {
        duration,
        error: error.message,
        dishOrCategoryId,
        params,
      });

      throw this.handlePrismaError(error, 'findByDish');
    }
  }

  /**
   * Find connections by categories
   */
  async findByCategories(
    categoryIds: string[],
    params?: {
      where?: Prisma.ConnectionWhereInput;
      orderBy?: Prisma.ConnectionOrderByWithRelationInput;
      skip?: number;
      take?: number;
      include?: Prisma.ConnectionInclude;
    },
  ): Promise<Connection[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding connections by categories`, {
        categoryIds,
        params,
      });

      const whereClause: Prisma.ConnectionWhereInput = {
        categories: {
          hasSome: categoryIds,
        },
        ...params?.where,
      };

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: params?.orderBy || { dishQualityScore: 'desc' },
        skip: params?.skip,
        take: params?.take,
        include: params?.include,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find connections by categories completed`, {
        duration,
        categoryIds,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find connections by categories`, {
        duration,
        error: error.message,
        categoryIds,
        params,
      });

      throw this.handlePrismaError(error, 'findByCategories');
    }
  }

  /**
   * Find connections by dish attributes
   */
  async findByDishAttributes(
    attributeIds: string[],
    params?: {
      where?: Prisma.ConnectionWhereInput;
      orderBy?: Prisma.ConnectionOrderByWithRelationInput;
      skip?: number;
      take?: number;
      include?: Prisma.ConnectionInclude;
    },
  ): Promise<Connection[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding connections by dish attributes`, {
        attributeIds,
        params,
      });

      const whereClause: Prisma.ConnectionWhereInput = {
        dishAttributes: {
          hasSome: attributeIds,
        },
        ...params?.where,
      };

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: params?.orderBy || { dishQualityScore: 'desc' },
        skip: params?.skip,
        take: params?.take,
        include: params?.include,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find connections by dish attributes completed`, {
        duration,
        attributeIds,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find connections by dish attributes`, {
        duration,
        error: error.message,
        attributeIds,
        params,
      });

      throw this.handlePrismaError(error, 'findByDishAttributes');
    }
  }

  /**
   * Find trending connections based on recent activity
   */
  async findTrending(params?: {
    activityLevel?: Prisma.EnumActivityLevelFilter;
    daysSince?: number;
    skip?: number;
    take?: number;
    include?: Prisma.ConnectionInclude;
  }): Promise<Connection[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding trending connections`, { params });

      const sinceDate = params?.daysSince
        ? new Date(Date.now() - params.daysSince * 24 * 60 * 60 * 1000)
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default 7 days

      const whereClause: Prisma.ConnectionWhereInput = {
        activityLevel: params?.activityLevel || 'trending',
        lastMentionedAt: {
          gte: sinceDate,
        },
      };

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: [{ recentMentionCount: 'desc' }, { dishQualityScore: 'desc' }],
        skip: params?.skip,
        take: params?.take || 50,
        include: params?.include,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find trending connections completed`, {
        duration,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find trending connections`, {
        duration,
        error: error.message,
        params,
      });

      throw this.handlePrismaError(error, 'findTrending');
    }
  }

  /**
   * Update connection quality metrics
   */
  async updateQualityMetrics(
    connectionId: string,
    metrics: {
      mentionCount?: number;
      totalUpvotes?: number;
      sourceDiversity?: number;
      recentMentionCount?: number;
      dishQualityScore?: number;
      activityLevel?: ActivityLevel;
      lastMentionedAt?: Date;
    },
  ): Promise<Connection> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Updating connection quality metrics`, {
        connectionId,
        metrics,
      });

      const updateData: Prisma.ConnectionUpdateInput = {
        ...metrics,
        lastUpdated: new Date(),
      };

      const result = await this.getDelegate().update({
        where: { connectionId },
        data: updateData,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Updated connection quality metrics successfully`, {
        duration,
        connectionId,
        metrics,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to update connection quality metrics`, {
        duration,
        error: error.message,
        connectionId,
        metrics,
      });

      throw this.handlePrismaError(error, 'updateQualityMetrics');
    }
  }

  /**
   * Find the best restaurants for a specific dish
   */
  async findTopRestaurantsForDish(
    dishOrCategoryId: string,
    params?: {
      location?: { latitude: number; longitude: number; radiusKm?: number };
      skip?: number;
      take?: number;
      include?: Prisma.ConnectionInclude;
    },
  ): Promise<Connection[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding top restaurants for dish`, {
        dishOrCategoryId,
        params,
      });

      const whereClause: Prisma.ConnectionWhereInput = {
        dishOrCategoryId,
      };

      // Add location filtering if provided
      if (params?.location) {
        const { latitude, longitude, radiusKm = 10 } = params.location;
        const latDelta = radiusKm / 111;
        const lonDelta =
          radiusKm / (111 * Math.cos((latitude * Math.PI) / 180));

        whereClause.restaurant = {
          latitude: {
            gte: latitude - latDelta,
            lte: latitude + latDelta,
          },
          longitude: {
            gte: longitude - lonDelta,
            lte: longitude + lonDelta,
          },
        };
      }

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: [
          { dishQualityScore: 'desc' },
          { mentionCount: 'desc' },
          { totalUpvotes: 'desc' },
        ],
        skip: params?.skip,
        take: params?.take || 20,
        include: params?.include,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find top restaurants for dish completed`, {
        duration,
        dishOrCategoryId,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find top restaurants for dish`, {
        duration,
        error: error.message,
        dishOrCategoryId,
        params,
      });

      throw this.handlePrismaError(error, 'findTopRestaurantsForDish');
    }
  }

  /**
   * Find connections with selective attributes (OR logic for component processors)
   * Used by SpecificDishProcessor and AttributeOnlyProcessor
   */
  async findConnectionsWithSelectiveAttributes(
    restaurantId: string,
    dishOrCategoryId: string,
    selectiveAttributeIds: string[]
  ): Promise<Array<{ connectionId: string; matchedAttributes: string[] }>> {
    const startTime = Date.now();
    try {
      this.logger.debug('Finding connections with selective attributes', {
        restaurantId,
        dishOrCategoryId,
        selectiveAttributeIds,
      });

      const connections = await this.getDelegate().findMany({
        where: {
          restaurantId,
          dishOrCategoryId,
          isMenuItem: true,
          dishAttributes: {
            hasSome: selectiveAttributeIds,
          },
        },
        select: {
          connectionId: true,
          dishAttributes: true,
        },
      });

      const results = connections.map(conn => ({
        connectionId: conn.connectionId,
        matchedAttributes: conn.dishAttributes.filter(attr => 
          selectiveAttributeIds.includes(attr)
        ),
      }));

      const duration = Date.now() - startTime;
      this.logger.debug('Found connections with selective attributes', {
        duration,
        restaurantId,
        dishOrCategoryId,
        selectiveAttributeIds,
        matchingConnections: results.length,
      });

      return results;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to find connections with selective attributes', {
        duration,
        error: error instanceof Error ? error.message : String(error),
        restaurantId,
        dishOrCategoryId,
        selectiveAttributeIds,
      });

      throw this.handlePrismaError(error, 'findConnectionsWithSelectiveAttributes');
    }
  }

  /**
   * Find all dish connections for a restaurant-dish pair
   * Used by SpecificDishProcessor for descriptive attribute processing
   */
  async findAllDishConnections(
    restaurantId: string,
    dishOrCategoryId: string
  ): Promise<Array<{ connectionId: string; dishAttributes: string[] }>> {
    const startTime = Date.now();
    try {
      this.logger.debug('Finding all dish connections', {
        restaurantId,
        dishOrCategoryId,
      });

      const connections = await this.getDelegate().findMany({
        where: {
          restaurantId,
          dishOrCategoryId,
          isMenuItem: true,
        },
        select: {
          connectionId: true,
          dishAttributes: true,
        },
      });

      const duration = Date.now() - startTime;
      this.logger.debug('Found all dish connections', {
        duration,
        restaurantId,
        dishOrCategoryId,
        connectionCount: connections.length,
      });

      return connections;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to find all dish connections', {
        duration,
        error: error instanceof Error ? error.message : String(error),
        restaurantId,
        dishOrCategoryId,
      });

      throw this.handlePrismaError(error, 'findAllDishConnections');
    }
  }

  /**
   * Find connections with a specific category
   * Used by CategoryProcessor
   */
  async findConnectionsWithCategory(
    restaurantId: string,
    categoryEntityId: string
  ): Promise<Array<{ connectionId: string; dishOrCategoryId: string; dishAttributes: string[] }>> {
    const startTime = Date.now();
    try {
      this.logger.debug('Finding connections with category', {
        restaurantId,
        categoryEntityId,
      });

      const connections = await this.getDelegate().findMany({
        where: {
          restaurantId,
          categories: {
            has: categoryEntityId,
          },
        },
        select: {
          connectionId: true,
          dishOrCategoryId: true,
          dishAttributes: true,
        },
      });

      const duration = Date.now() - startTime;
      this.logger.debug('Found connections with category', {
        duration,
        restaurantId,
        categoryEntityId,
        connectionCount: connections.length,
      });

      return connections;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to find connections with category', {
        duration,
        error: error instanceof Error ? error.message : String(error),
        restaurantId,
        categoryEntityId,
      });

      throw this.handlePrismaError(error, 'findConnectionsWithCategory');
    }
  }

  /**
   * Find connections by restaurant with ANY of the specified attributes
   * Used by AttributeOnlyProcessor
   */
  async findConnectionsWithAnyAttributes(
    restaurantId: string,
    attributeIds: string[]
  ): Promise<Array<{ connectionId: string; dishOrCategoryId: string; matchedAttributes: string[] }>> {
    const startTime = Date.now();
    try {
      this.logger.debug('Finding connections with any attributes', {
        restaurantId,
        attributeIds,
      });

      const connections = await this.getDelegate().findMany({
        where: {
          restaurantId,
          dishAttributes: {
            hasSome: attributeIds,
          },
        },
        select: {
          connectionId: true,
          dishOrCategoryId: true,
          dishAttributes: true,
        },
      });

      const results = connections.map(conn => ({
        connectionId: conn.connectionId,
        dishOrCategoryId: conn.dishOrCategoryId,
        matchedAttributes: conn.dishAttributes.filter(attr => 
          attributeIds.includes(attr)
        ),
      }));

      const duration = Date.now() - startTime;
      this.logger.debug('Found connections with any attributes', {
        duration,
        restaurantId,
        attributeIds,
        matchingConnections: results.length,
      });

      return results;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to find connections with any attributes', {
        duration,
        error: error instanceof Error ? error.message : String(error),
        restaurantId,
        attributeIds,
      });

      throw this.handlePrismaError(error, 'findConnectionsWithAnyAttributes');
    }
  }

  /**
   * Find existing basic dish connection (without attribute filtering)
   * Used by SpecificDishProcessor for simple dish mentions
   */
  async findBasicDishConnection(
    restaurantId: string,
    dishOrCategoryId: string
  ): Promise<{ connectionId: string } | null> {
    const startTime = Date.now();
    try {
      this.logger.debug('Finding basic dish connection', {
        restaurantId,
        dishOrCategoryId,
      });

      const connection = await this.getDelegate().findFirst({
        where: {
          restaurantId,
          dishOrCategoryId,
          isMenuItem: true,
        },
        select: {
          connectionId: true,
        },
      });

      const duration = Date.now() - startTime;
      this.logger.debug('Basic dish connection search completed', {
        duration,
        restaurantId,
        dishOrCategoryId,
        found: !!connection,
      });

      return connection;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to find basic dish connection', {
        duration,
        error: error instanceof Error ? error.message : String(error),
        restaurantId,
        dishOrCategoryId,
      });

      throw this.handlePrismaError(error, 'findBasicDishConnection');
    }
  }

  /**
   * Find all existing dish connections for a restaurant
   * Used by GeneralPraiseProcessor to boost all connections
   */
  async findExistingDishConnections(
    restaurantId: string
  ): Promise<Array<{ connectionId: string; dishOrCategoryId: string; isMenuItem: boolean; mentionCount: number }>> {
    const startTime = Date.now();
    try {
      this.logger.debug('Finding existing dish connections for restaurant', {
        restaurantId,
      });

      const connections = await this.getDelegate().findMany({
        where: {
          restaurantId,
        },
        select: {
          connectionId: true,
          dishOrCategoryId: true,
          isMenuItem: true,
          mentionCount: true,
        },
      });

      const duration = Date.now() - startTime;
      this.logger.debug('Found existing dish connections', {
        duration,
        restaurantId,
        connectionCount: connections.length,
        menuItems: connections.filter(c => c.isMenuItem).length,
        categories: connections.filter(c => !c.isMenuItem).length,
      });

      return connections;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to find existing dish connections', {
        duration,
        error: error instanceof Error ? error.message : String(error),
        restaurantId,
      });

      throw this.handlePrismaError(error, 'findExistingDishConnections');
    }
  }

  /**
   * Find connections for dishes in a specific category
   * Used for category performance score calculation (PRD 5.3.3)
   */
  async findConnectionsInCategory(
    restaurantId: string,
    category: string,
    params?: {
      where?: Prisma.ConnectionWhereInput;
      orderBy?: Prisma.ConnectionOrderByWithRelationInput;
      skip?: number;
      take?: number;
      include?: Prisma.ConnectionInclude;
    },
  ): Promise<Connection[]> {
    const startTime = Date.now();
    try {
      this.logger.debug('Finding connections in category', {
        restaurantId,
        category,
      });

      const whereClause: Prisma.ConnectionWhereInput = {
        restaurantId,
        categories: {
          has: category,
        },
        ...params?.where,
      };

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: params?.orderBy || { connectionQualityScore: 'desc' },
        skip: params?.skip,
        take: params?.take,
        include: params?.include,
      });

      const duration = Date.now() - startTime;
      this.logger.debug('Find connections in category completed', {
        duration,
        restaurantId,
        category,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to find connections in category', {
        duration,
        error: error instanceof Error ? error.message : String(error),
        restaurantId,
        category,
      });

      throw this.handlePrismaError(error, 'findConnectionsInCategory');
    }
  }

  /**
   * Find connections that have ANY of the specified attributes
   * Used for attribute performance score calculation (PRD 5.3.3)
   */
  async findConnectionsWithAttributes(
    restaurantId: string,
    attributeIds: string[],
    params?: {
      where?: Prisma.ConnectionWhereInput;
      orderBy?: Prisma.ConnectionOrderByWithRelationInput;
      skip?: number;
      take?: number;
      include?: Prisma.ConnectionInclude;
    },
  ): Promise<Connection[]> {
    const startTime = Date.now();
    try {
      this.logger.debug('Finding connections with attributes', {
        restaurantId,
        attributeIds,
      });

      const whereClause: Prisma.ConnectionWhereInput = {
        restaurantId,
        dishAttributes: {
          hasSome: attributeIds,
        },
        ...params?.where,
      };

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: params?.orderBy || { connectionQualityScore: 'desc' },
        skip: params?.skip,
        take: params?.take,
        include: params?.include,
      });

      const duration = Date.now() - startTime;
      this.logger.debug('Find connections with attributes completed', {
        duration,
        restaurantId,
        attributeIds,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Failed to find connections with attributes', {
        duration,
        error: error instanceof Error ? error.message : String(error),
        restaurantId,
        attributeIds,
      });

      throw this.handlePrismaError(error, 'findConnectionsWithAttributes');
    }
  }
}
