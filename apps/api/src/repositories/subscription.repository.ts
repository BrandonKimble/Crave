import { Injectable } from '@nestjs/common';
import { Subscription, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BaseRepository } from './base/base.repository';

/**
 * Repository for Subscription model operations
 * Handles user subscription lifecycle and billing management
 */
@Injectable()
export class SubscriptionRepository extends BaseRepository<
  Subscription,
  Prisma.SubscriptionWhereInput,
  Prisma.SubscriptionCreateInput,
  Prisma.SubscriptionUpdateInput
> {
  constructor(prisma: PrismaService) {
    super(prisma, 'Subscription');
  }

  protected getDelegate() {
    return this.prisma.subscription;
  }

  protected getPrimaryKeyField(): string {
    return 'subscriptionId';
  }

  /**
   * Find subscriptions by user
   */
  async findByUser(
    userId: string,
    params?: {
      where?: Prisma.SubscriptionWhereInput;
      orderBy?: Prisma.SubscriptionOrderByWithRelationInput;
      skip?: number;
      take?: number;
      include?: Prisma.SubscriptionInclude;
    },
  ): Promise<Subscription[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding subscriptions by user`, { userId, params });

      const whereClause: Prisma.SubscriptionWhereInput = {
        userId,
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
      this.logger.debug(`Find subscriptions by user completed`, {
        duration: `${duration}ms`,
        userId,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find subscriptions by user`, {
        duration: `${duration}ms`,
        error: error.message,
        userId,
        params,
      });

      throw this.handlePrismaError(error, 'findByUser');
    }
  }

  /**
   * Find active subscription for user
   */
  async findActiveByUser(userId: string): Promise<Subscription | null> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding active subscription by user`, { userId });

      const result = await this.getDelegate().findFirst({
        where: {
          userId,
          status: 'active',
        },
        orderBy: { createdAt: 'desc' },
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find active subscription by user completed`, {
        duration: `${duration}ms`,
        userId,
        found: !!result,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find active subscription by user`, {
        duration: `${duration}ms`,
        error: error.message,
        userId,
      });

      throw this.handlePrismaError(error, 'findActiveByUser');
    }
  }

  /**
   * Find subscription by Stripe subscription ID
   */
  async findByStripeId(
    stripeSubscriptionId: string,
  ): Promise<Subscription | null> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding subscription by Stripe ID`, {
        stripeSubscriptionId,
      });

      const result = await this.getDelegate().findUnique({
        where: { stripeSubscriptionId },
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find subscription by Stripe ID completed`, {
        duration: `${duration}ms`,
        found: !!result,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find subscription by Stripe ID`, {
        duration: `${duration}ms`,
        error: error.message,
        stripeSubscriptionId,
      });

      throw this.handlePrismaError(error, 'findByStripeId');
    }
  }

  /**
   * Find expiring subscriptions
   */
  async findExpiring(
    daysBefore: number = 3,
    params?: {
      skip?: number;
      take?: number;
      include?: Prisma.SubscriptionInclude;
    },
  ): Promise<Subscription[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding expiring subscriptions`, {
        daysBefore,
        params,
      });

      const expirationDate = new Date(
        Date.now() + daysBefore * 24 * 60 * 60 * 1000,
      );

      const whereClause: Prisma.SubscriptionWhereInput = {
        status: 'active',
        currentPeriodEnd: {
          lte: expirationDate,
          gte: new Date(),
        },
        cancelAtPeriodEnd: true,
      };

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: { currentPeriodEnd: 'asc' },
        skip: params?.skip,
        take: params?.take,
        include: params?.include,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find expiring subscriptions completed`, {
        duration: `${duration}ms`,
        daysBefore,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find expiring subscriptions`, {
        duration: `${duration}ms`,
        error: error.message,
        daysBefore,
        params,
      });

      throw this.handlePrismaError(error, 'findExpiring');
    }
  }
}
