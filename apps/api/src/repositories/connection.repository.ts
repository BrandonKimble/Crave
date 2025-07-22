import { Injectable } from '@nestjs/common';
import { Connection, Prisma, ActivityLevel } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BaseRepository } from './base/base.repository';

/**
 * Repository for Connection model operations
 * Handles entity relationships with quality scores and community evidence
 */
@Injectable()
export class ConnectionRepository extends BaseRepository<
  Connection,
  Prisma.ConnectionWhereInput,
  Prisma.ConnectionCreateInput,
  Prisma.ConnectionUpdateInput
> {
  constructor(prisma: PrismaService) {
    super(prisma, 'Connection');
  }

  protected getDelegate() {
    return this.prisma.connection;
  }

  protected getPrimaryKeyField(): string {
    return 'connectionId';
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
        duration: `${duration}ms`,
        restaurantId,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find connections by restaurant`, {
        duration: `${duration}ms`,
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
        duration: `${duration}ms`,
        dishOrCategoryId,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find connections by dish`, {
        duration: `${duration}ms`,
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
        duration: `${duration}ms`,
        categoryIds,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find connections by categories`, {
        duration: `${duration}ms`,
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
        duration: `${duration}ms`,
        attributeIds,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find connections by dish attributes`, {
        duration: `${duration}ms`,
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
        duration: `${duration}ms`,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find trending connections`, {
        duration: `${duration}ms`,
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
        duration: `${duration}ms`,
        connectionId,
        metrics,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to update connection quality metrics`, {
        duration: `${duration}ms`,
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
        duration: `${duration}ms`,
        dishOrCategoryId,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find top restaurants for dish`, {
        duration: `${duration}ms`,
        error: error.message,
        dishOrCategoryId,
        params,
      });

      throw this.handlePrismaError(error, 'findTopRestaurantsForDish');
    }
  }
}
