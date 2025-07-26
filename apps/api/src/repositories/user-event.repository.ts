import { Injectable } from '@nestjs/common';
import { UserEvent, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoggerService } from '../shared';
import { BaseRepository } from './base/base.repository';

/**
 * Repository for UserEvent model operations
 * Handles user activity tracking and analytics
 */
@Injectable()
export class UserEventRepository extends BaseRepository<
  UserEvent,
  Prisma.UserEventWhereInput,
  Prisma.UserEventCreateInput,
  Prisma.UserEventUpdateInput
> {
  constructor(prisma: PrismaService, loggerService: LoggerService) {
    super(prisma, loggerService, 'UserEvent');
  }

  protected getDelegate() {
    return this.prisma.userEvent;
  }

  protected getPrimaryKeyField(): string {
    return 'eventId';
  }

  /**
   * Find events by user
   */
  async findByUser(
    userId: string,
    params?: {
      eventType?: string;
      since?: Date;
      until?: Date;
      orderBy?: Prisma.UserEventOrderByWithRelationInput;
      skip?: number;
      take?: number;
    },
  ): Promise<UserEvent[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding events by user`, { userId, params });

      const whereClause: Prisma.UserEventWhereInput = { userId };

      if (params?.eventType) {
        whereClause.eventType = params.eventType;
      }

      if (params?.since || params?.until) {
        whereClause.createdAt = {};
        if (params.since) whereClause.createdAt.gte = params.since;
        if (params.until) whereClause.createdAt.lte = params.until;
      }

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: params?.orderBy || { createdAt: 'desc' },
        skip: params?.skip,
        take: params?.take,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find events by user completed`, {
        duration,
        userId,
        count: result.length,
      });

      return result;
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find events by user`, {
        duration,
        error: error instanceof Error ? error.message : String(error),
        userId,
        params,
      });

      throw this.handlePrismaError(error, 'findByUser');
    }
  }

  /**
   * Find events by type
   */
  async findByEventType(
    eventType: string,
    params?: {
      since?: Date;
      until?: Date;
      skip?: number;
      take?: number;
    },
  ): Promise<UserEvent[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding events by type`, { eventType, params });

      const whereClause: Prisma.UserEventWhereInput = { eventType };

      if (params?.since || params?.until) {
        whereClause.createdAt = {};
        if (params.since) whereClause.createdAt.gte = params.since;
        if (params.until) whereClause.createdAt.lte = params.until;
      }

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip: params?.skip,
        take: params?.take,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find events by type completed`, {
        duration,
        eventType,
        count: result.length,
      });

      return result;
    } catch (error: unknown) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find events by type`, {
        duration,
        error: error instanceof Error ? error.message : String(error),
        eventType,
        params,
      });

      throw this.handlePrismaError(error, 'findByEventType');
    }
  }
}
