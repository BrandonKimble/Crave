import { Injectable } from '@nestjs/common';
import { User, Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BaseRepository } from './base/base.repository';

/**
 * Repository for User model operations
 * Handles user accounts, authentication, and subscription management
 */
@Injectable()
export class UserRepository extends BaseRepository<
  User,
  Prisma.UserWhereInput,
  Prisma.UserCreateInput,
  Prisma.UserUpdateInput
> {
  constructor(prisma: PrismaService) {
    super(prisma, 'User');
  }

  protected getDelegate() {
    return this.prisma.user;
  }

  protected getPrimaryKeyField(): string {
    return 'userId';
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding user by email`, { email });

      const result = await this.getDelegate().findUnique({
        where: { email },
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find user by email completed`, {
        duration: `${duration}ms`,
        found: !!result,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find user by email`, {
        duration: `${duration}ms`,
        error: error.message,
        email,
      });

      throw this.handlePrismaError(error, 'findByEmail');
    }
  }

  /**
   * Find user by referral code
   */
  async findByReferralCode(referralCode: string): Promise<User | null> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding user by referral code`, { referralCode });

      const result = await this.getDelegate().findUnique({
        where: { referralCode },
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find user by referral code completed`, {
        duration: `${duration}ms`,
        found: !!result,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find user by referral code`, {
        duration: `${duration}ms`,
        error: error.message,
        referralCode,
      });

      throw this.handlePrismaError(error, 'findByReferralCode');
    }
  }

  /**
   * Find users by subscription status
   */
  async findBySubscriptionStatus(
    status: SubscriptionStatus,
    params?: {
      where?: Prisma.UserWhereInput;
      orderBy?: Prisma.UserOrderByWithRelationInput;
      skip?: number;
      take?: number;
      include?: Prisma.UserInclude;
    },
  ): Promise<User[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding users by subscription status`, {
        status,
        params,
      });

      const whereClause: Prisma.UserWhereInput = {
        subscriptionStatus: status,
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
      this.logger.debug(`Find users by subscription status completed`, {
        duration: `${duration}ms`,
        status,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find users by subscription status`, {
        duration: `${duration}ms`,
        error: error.message,
        status,
        params,
      });

      throw this.handlePrismaError(error, 'findBySubscriptionStatus');
    }
  }

  /**
   * Find users with expiring trials
   */
  async findExpiringTrials(
    daysBefore: number = 3,
    params?: {
      skip?: number;
      take?: number;
      include?: Prisma.UserInclude;
    },
  ): Promise<User[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding users with expiring trials`, {
        daysBefore,
        params,
      });

      const expirationDate = new Date(
        Date.now() + daysBefore * 24 * 60 * 60 * 1000,
      );

      const whereClause: Prisma.UserWhereInput = {
        subscriptionStatus: 'trialing',
        trialEndsAt: {
          lte: expirationDate,
          gte: new Date(),
        },
      };

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: { trialEndsAt: 'asc' },
        skip: params?.skip,
        take: params?.take,
        include: params?.include,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find users with expiring trials completed`, {
        duration: `${duration}ms`,
        daysBefore,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find users with expiring trials`, {
        duration: `${duration}ms`,
        error: error.message,
        daysBefore,
        params,
      });

      throw this.handlePrismaError(error, 'findExpiringTrials');
    }
  }

  /**
   * Find referrals for a user
   */
  async findReferrals(
    userId: string,
    params?: {
      skip?: number;
      take?: number;
      include?: Prisma.UserInclude;
    },
  ): Promise<User[]> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Finding referrals for user`, { userId, params });

      const whereClause: Prisma.UserWhereInput = {
        referredBy: userId,
      };

      const result = await this.getDelegate().findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip: params?.skip,
        take: params?.take,
        include: params?.include,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Find referrals for user completed`, {
        duration: `${duration}ms`,
        userId,
        count: result.length,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to find referrals for user`, {
        duration: `${duration}ms`,
        error: error.message,
        userId,
        params,
      });

      throw this.handlePrismaError(error, 'findReferrals');
    }
  }

  /**
   * Update user subscription status
   */
  async updateSubscriptionStatus(
    userId: string,
    status: SubscriptionStatus,
    metadata?: {
      stripeCustomerId?: string;
      trialStartedAt?: Date;
      trialEndsAt?: Date;
    },
  ): Promise<User> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Updating user subscription status`, {
        userId,
        status,
        metadata,
      });

      const updateData: Prisma.UserUpdateInput = {
        subscriptionStatus: status,
        ...metadata,
      };

      const result = await this.getDelegate().update({
        where: { userId },
        data: updateData,
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Updated user subscription status successfully`, {
        duration: `${duration}ms`,
        userId,
        status,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to update user subscription status`, {
        duration: `${duration}ms`,
        error: error.message,
        userId,
        status,
        metadata,
      });

      throw this.handlePrismaError(error, 'updateSubscriptionStatus');
    }
  }

  /**
   * Get user statistics
   */
  async getUserStatistics(): Promise<{
    totalUsers: number;
    activeSubscriptions: number;
    trialingUsers: number;
    cancelledSubscriptions: number;
    expiredSubscriptions: number;
  }> {
    const startTime = Date.now();
    try {
      this.logger.debug(`Getting user statistics`);

      const [totalUsers, statusCounts] = await Promise.all([
        this.count(),
        this.getDelegate().groupBy({
          by: ['subscriptionStatus'],
          _count: { subscriptionStatus: true },
        }),
      ]);

      const statistics = {
        totalUsers,
        activeSubscriptions: 0,
        trialingUsers: 0,
        cancelledSubscriptions: 0,
        expiredSubscriptions: 0,
      };

      statusCounts.forEach((status) => {
        switch (status.subscriptionStatus) {
          case 'active':
            statistics.activeSubscriptions = status._count.subscriptionStatus;
            break;
          case 'trialing':
            statistics.trialingUsers = status._count.subscriptionStatus;
            break;
          case 'cancelled':
            statistics.cancelledSubscriptions =
              status._count.subscriptionStatus;
            break;
          case 'expired':
            statistics.expiredSubscriptions = status._count.subscriptionStatus;
            break;
        }
      });

      const duration = Date.now() - startTime;
      this.logger.debug(`Get user statistics completed`, {
        duration: `${duration}ms`,
        statistics,
      });

      return statistics;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to get user statistics`, {
        duration: `${duration}ms`,
        error: error.message,
      });

      throw this.handlePrismaError(error, 'getUserStatistics');
    }
  }
}
