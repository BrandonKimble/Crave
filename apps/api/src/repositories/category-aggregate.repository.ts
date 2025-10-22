import { Injectable } from '@nestjs/common';
import { Prisma, CategoryAggregate } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../shared';

/**
 * Repository for category_aggregates fallback table.
 *
 * Provides lightweight accessors so scoring logic can factor in
 * category-only conversation signal without coupling directly to Prisma.
 */
@Injectable()
export class CategoryAggregateRepository {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('CategoryAggregateRepository');
  }

  /**
   * Fetch an aggregated signal for a restaurant/category pair.
   */
  async findByRestaurantAndCategory(
    restaurantId: string,
    categoryId: string,
  ): Promise<CategoryAggregate | null> {
    try {
      return await this.prisma.categoryAggregate.findUnique({
        where: {
          restaurantId_categoryId: { restaurantId, categoryId },
        },
      });
    } catch (error) {
      this.logger.error('Failed to load restaurant category signal', {
        restaurantId,
        categoryId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Retrieve all category signals for a restaurant (used for diagnostics).
   */
  async findByRestaurant(
    restaurantId: string,
    params?: {
      where?: Prisma.CategoryAggregateWhereInput;
      orderBy?: Prisma.CategoryAggregateOrderByWithRelationInput;
      skip?: number;
      take?: number;
    },
  ): Promise<CategoryAggregate[]> {
    try {
      return await this.prisma.categoryAggregate.findMany({
        where: { restaurantId, ...params?.where },
        orderBy: params?.orderBy,
        skip: params?.skip,
        take: params?.take,
      });
    } catch (error) {
      this.logger.error('Failed to list restaurant category signals', {
        restaurantId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
