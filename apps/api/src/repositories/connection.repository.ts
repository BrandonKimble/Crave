import { Injectable } from '@nestjs/common';
import { Connection, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../shared';

/**
 * Minimal ConnectionRepository for Quality Score Service
 * Only includes methods actually used by the Bull jobs + LLM processing pipeline
 */
@Injectable()
export class ConnectionRepository {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('ConnectionRepository');
  }

  /**
   * Find many connections with optional filtering, sorting, and pagination
   * Used by QualityScoreService.calculateRestaurantQualityScore()
   */
  async findMany(params: {
    where?: Prisma.ConnectionWhereInput;
    orderBy?: Prisma.ConnectionOrderByWithRelationInput;
    skip?: number;
    take?: number;
    include?: Prisma.ConnectionInclude;
  }): Promise<Connection[]> {
    try {
      return await this.prisma.connection.findMany(params);
    } catch (error) {
      this.logger.error('Failed to find connections', {
        params,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Find connections for food in a specific category at a restaurant
   * Used by QualityScoreService.calculateCategoryPerformanceScore()
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

      return await this.prisma.connection.findMany({
        where: whereClause,
        orderBy: params?.orderBy || { foodQualityScore: 'desc' },
        skip: params?.skip,
        take: params?.take,
        include: params?.include,
      });
    } catch (error) {
      this.logger.error('Failed to find connections in category', {
        restaurantId,
        category,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Find connections with specific attributes at a restaurant
   * Used by QualityScoreService.calculateAttributePerformanceScore()
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
    try {
      this.logger.debug('Finding connections with attributes', {
        restaurantId,
        attributeIds,
      });

      const whereClause: Prisma.ConnectionWhereInput = {
        restaurantId,
        foodAttributes: {
          hasSome: attributeIds,
        },
        ...params?.where,
      };

      return await this.prisma.connection.findMany({
        where: whereClause,
        orderBy: params?.orderBy || { foodQualityScore: 'desc' },
        skip: params?.skip,
        take: params?.take,
        include: params?.include,
      });
    } catch (error) {
      this.logger.error('Failed to find connections with attributes', {
        restaurantId,
        attributeIds,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update a connection by ID
   * Used by QualityScoreService.updateQualityScoresForConnections()
   */
  async update(
    connectionId: string,
    data: Prisma.ConnectionUpdateInput,
  ): Promise<Connection> {
    try {
      return await this.prisma.connection.update({
        where: { connectionId },
        data,
      });
    } catch (error) {
      this.logger.error('Failed to update connection', {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
