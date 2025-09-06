import { Injectable } from '@nestjs/common';
import { Entity, Prisma, EntityType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../shared';
import { BaseRepository } from './base/base.repository';

/**
 * Entity Repository
 * 
 * Provides data access for the unified Entity model that stores:
 * - Restaurants, food items, and attributes in a single table
 * - Core CRUD operations via BaseRepository inheritance
 * - Type-specific queries for entity resolution and priority selection
 * 
 * ARCHITECTURE DECISION: Simplified Repository Pattern
 * - Most entity creation/updates happen via EntityResolutionService
 * - This repository focuses on queries needed by existing services
 * - Manual CRUD methods removed - use BaseRepository methods directly
 * 
 * CURRENT USAGE:
 * - EntityResolutionService: Uses findById() and count() from BaseRepository
 * - EntityPrioritySelectionService: Uses findByType(), findById(), and count()
 * - Future search/discovery features: Will use findByType() with filtering
 * 
 * FUTURE PURPOSE:
 * - Query interface for search and discovery features
 * - Performance-optimized entity lookups
 * - Support for complex filtering and sorting requirements
 * - Maintain separation between entity resolution (creation) and querying (read)
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
   * 
   * Used by:
   * - EntityPrioritySelectionService: Finding entities for keyword search priority
   * - Future search/discovery features: Type-specific entity queries
   * 
   * @param type EntityType to filter by
   * @param params Optional query parameters (where, orderBy, pagination, includes)
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
}
