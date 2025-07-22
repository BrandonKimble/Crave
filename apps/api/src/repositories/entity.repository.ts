import { Injectable } from '@nestjs/common';
import { Entity, Prisma, EntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BaseRepository } from './base/base.repository';

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
  constructor(prisma: PrismaService) {
    super(prisma, 'Entity');
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
        duration: `${duration}ms`,
        type,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find entities by type`, {
        duration: `${duration}ms`,
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
        duration: `${duration}ms`,
        latitude,
        longitude,
        radiusKm,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find restaurants by location`, {
        duration: `${duration}ms`,
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
        duration: `${duration}ms`,
        searchTerm,
        type,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find entities by name or alias`, {
        duration: `${duration}ms`,
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
        duration: `${duration}ms`,
        attributeIds,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find entities by restaurant attributes`, {
        duration: `${duration}ms`,
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
        duration: `${duration}ms`,
        entityId,
        qualityScore,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to update restaurant quality score`, {
        duration: `${duration}ms`,
        error: error.message,
        entityId,
        qualityScore,
      });

      throw this.handlePrismaError(error, 'updateRestaurantQualityScore');
    }
  }
}
