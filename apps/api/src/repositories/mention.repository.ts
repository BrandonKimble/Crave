import { Injectable } from '@nestjs/common';
import { Mention, Prisma, MentionSource } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../shared';
import { BaseRepository } from './base/base.repository';

/**
 * Repository for Mention model operations
 * Handles community evidence from Reddit discussions
 */
@Injectable()
export class MentionRepository extends BaseRepository<
  Mention,
  Prisma.MentionWhereInput,
  Prisma.MentionCreateInput,
  Prisma.MentionUpdateInput
> {
  constructor(prisma: PrismaService, loggerService: LoggerService) {
    super(prisma, loggerService, 'Mention');
  }

  protected getDelegate() {
    return this.prisma.mention;
  }

  protected getPrimaryKeyField(): string {
    return 'mentionId';
  }

  /**
   * Find mentions for a specific connection
   */
  async findByConnection(
    connectionId: string,
    params?: {
      where?: Prisma.MentionWhereInput;
      orderBy?: Prisma.MentionOrderByWithRelationInput;
      skip?: number;
      take?: number;
      include?: Prisma.MentionInclude;
    },
  ): Promise<Mention[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding mentions by connection`, {
        connectionId,
        params,
      });

      const whereClause: Prisma.MentionWhereInput = {
        connectionId,
        ...params?.where,
      };

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: params?.orderBy || { upvotes: 'desc' },
        skip: params?.skip,
        take: params?.take,
        include: params?.include,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find mentions by connection completed`, {
        duration,
        connectionId,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find mentions by connection`, {
        duration,
        error: error.message,
        connectionId,
        params,
      });

      throw this.handlePrismaError(error, 'findByConnection');
    }
  }

  /**
   * Find mentions by subreddit
   */
  async findBySubreddit(
    subreddit: string,
    params?: {
      where?: Prisma.MentionWhereInput;
      orderBy?: Prisma.MentionOrderByWithRelationInput;
      skip?: number;
      take?: number;
      include?: Prisma.MentionInclude;
    },
  ): Promise<Mention[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding mentions by subreddit`, {
        subreddit,
        params,
      });

      const whereClause: Prisma.MentionWhereInput = {
        subreddit,
        ...params?.where,
      };

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: params?.orderBy || { createdAt: 'desc' },
        skip: params?.skip,
        take: params?.take,
        include: params?.include,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find mentions by subreddit completed`, {
        duration,
        subreddit,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find mentions by subreddit`, {
        duration,
        error: error.message,
        subreddit,
        params,
      });

      throw this.handlePrismaError(error, 'findBySubreddit');
    }
  }

  /**
   * Find mentions by source type and source ID
   */
  async findBySource(
    sourceType: MentionSource,
    sourceId: string,
    params?: {
      where?: Prisma.MentionWhereInput;
      orderBy?: Prisma.MentionOrderByWithRelationInput;
      skip?: number;
      take?: number;
      include?: Prisma.MentionInclude;
    },
  ): Promise<Mention[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding mentions by source`, {
        sourceType,
        sourceId,
        params,
      });

      const whereClause: Prisma.MentionWhereInput = {
        sourceType,
        sourceId,
        ...params?.where,
      };

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: params?.orderBy || { createdAt: 'desc' },
        skip: params?.skip,
        take: params?.take,
        include: params?.include,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find mentions by source completed`, {
        duration,
        sourceType,
        sourceId,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find mentions by source`, {
        duration,
        error: error.message,
        sourceType,
        sourceId,
        params,
      });

      throw this.handlePrismaError(error, 'findBySource');
    }
  }

  /**
   * Find top mentions with highest upvotes
   */
  async findTopMentions(params?: {
    connectionId?: string;
    subreddit?: string;
    minUpvotes?: number;
    daysSince?: number;
    skip?: number;
    take?: number;
    include?: Prisma.MentionInclude;
  }): Promise<Mention[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding top mentions`, { params });

      const whereClause: Prisma.MentionWhereInput = {};

      if (params?.connectionId) {
        whereClause.connectionId = params.connectionId;
      }

      if (params?.subreddit) {
        whereClause.subreddit = params.subreddit;
      }

      if (params?.minUpvotes !== undefined) {
        whereClause.upvotes = { gte: params.minUpvotes };
      }

      if (params?.daysSince) {
        const sinceDate = new Date(
          Date.now() - params.daysSince * 24 * 60 * 60 * 1000,
        );
        whereClause.createdAt = { gte: sinceDate };
      }

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: [{ upvotes: 'desc' }, { createdAt: 'desc' }],
        skip: params?.skip,
        take: params?.take || 50,
        include: params?.include,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find top mentions completed`, {
        duration,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find top mentions`, {
        duration,
        error: error.message,
        params,
      });

      throw this.handlePrismaError(error, 'findTopMentions');
    }
  }

  /**
   * Find recent mentions within a time period
   */
  async findRecentMentions(
    daysSince: number = 7,
    params?: {
      connectionId?: string;
      subreddit?: string;
      sourceType?: MentionSource;
      skip?: number;
      take?: number;
      include?: Prisma.MentionInclude;
    },
  ): Promise<Mention[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding recent mentions`, { daysSince, params });

      const sinceDate = new Date(Date.now() - daysSince * 24 * 60 * 60 * 1000);

      const whereClause: Prisma.MentionWhereInput = {
        createdAt: { gte: sinceDate },
      };

      if (params?.connectionId) {
        whereClause.connectionId = params.connectionId;
      }

      if (params?.subreddit) {
        whereClause.subreddit = params.subreddit;
      }

      if (params?.sourceType) {
        whereClause.sourceType = params.sourceType;
      }

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip: params?.skip,
        take: params?.take || 100,
        include: params?.include,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find recent mentions completed`, {
        duration,
        daysSince,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find recent mentions`, {
        duration,
        error: error.message,
        daysSince,
        params,
      });

      throw this.handlePrismaError(error, 'findRecentMentions');
    }
  }

  /**
   * Find mentions by author
   */
  async findByAuthor(
    author: string,
    params?: {
      where?: Prisma.MentionWhereInput;
      orderBy?: Prisma.MentionOrderByWithRelationInput;
      skip?: number;
      take?: number;
      include?: Prisma.MentionInclude;
    },
  ): Promise<Mention[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding mentions by author`, { author, params });

      const whereClause: Prisma.MentionWhereInput = {
        author,
        ...params?.where,
      };

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: params?.orderBy || { createdAt: 'desc' },
        skip: params?.skip,
        take: params?.take,
        include: params?.include,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find mentions by author completed`, {
        duration,
        author,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find mentions by author`, {
        duration,
        error: error.message,
        author,
        params,
      });

      throw this.handlePrismaError(error, 'findByAuthor');
    }
  }

  /**
   * Get mention statistics for a connection
   */
  async getConnectionStatistics(connectionId: string): Promise<{
    totalMentions: number;
    totalUpvotes: number;
    uniqueSubreddits: number;
    averageUpvotes: number;
    recentMentions: number;
  }> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Getting connection statistics`, { connectionId });

      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      const [totalStats, recentCount, subredditStats] = await Promise.all([
        this.getDelegate().aggregate({
          where: { connectionId },
          _count: { mentionId: true },
          _sum: { upvotes: true },
          _avg: { upvotes: true },
        }),
        this.count({
          connectionId,
          createdAt: { gte: sevenDaysAgo },
        }),
        this.getDelegate().groupBy({
          by: ['subreddit'],
          where: { connectionId },
          _count: { subreddit: true },
        }),
      ]);

      const statistics = {
        totalMentions: totalStats._count.mentionId || 0,
        totalUpvotes: totalStats._sum.upvotes || 0,
        uniqueSubreddits: subredditStats.length,
        averageUpvotes: totalStats._avg.upvotes || 0,
        recentMentions: recentCount,
      };

      const duration = Date.now() - startTime;
      this.logger.debug(`Get connection statistics completed`, {
        duration,
        connectionId,
        statistics,
      });

      return statistics;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to get connection statistics`, {
        duration,
        error: error.message,
        connectionId,
      });

      throw this.handlePrismaError(error, 'getConnectionStatistics');
    }
  }
}
