import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ONBOARDING_VERSION,
  type UserOnboardingProfile,
} from '@crave-search/shared';
import { ConfigService } from '@nestjs/config';
import {
  AuthProvider,
  EntitlementStatus,
  Prisma,
  SubscriptionPlatform,
  SubscriptionProvider,
  SubscriptionStatus,
  type User,
} from '@prisma/client';
import type Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import type { ClerkJwtClaims } from './auth/clerk-auth.service';
import { UserProfileDto, UserEntitlementDto } from './dto/user-profile.dto';
import { UserStatsService } from './user-stats.service';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UpdateUserOnboardingDto } from './dto/update-user-onboarding.dto';

type OnboardingProfileRow = {
  onboardingStatus: UserOnboardingProfile['status'] | null;
  onboardingCompletedAt: Date | string | null;
  onboardingVersion: number | null;
  onboardingSelectedCity: string | null;
  onboardingPreviewCity: string | null;
};

const DEFAULT_ONBOARDING_PROFILE_ROW: OnboardingProfileRow = {
  onboardingStatus: null,
  onboardingCompletedAt: null,
  onboardingVersion: null,
  onboardingSelectedCity: null,
  onboardingPreviewCity: null,
};

@Injectable()
export class UserService {
  private readonly defaultEntitlement: string;
  private readonly trialDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly userStats: UserStatsService,
  ) {
    this.defaultEntitlement =
      this.configService.get<string>('billing.defaultEntitlement') || 'premium';
    this.trialDays = this.configService.get<number>('billing.trialDays') || 0;
  }

  async syncFromClerkClaims(claims: ClerkJwtClaims): Promise<User> {
    const authId = this.resolveAuthIdentifier(claims);
    if (!authId) {
      throw new UnauthorizedException(
        'Unable to determine Clerk user identifier',
      );
    }

    const email =
      this.resolveEmail(claims) || `${authId}@placeholder.crave-search.local`;
    const now = new Date();
    const trialEndsAt =
      this.trialDays > 0 ? this.addDays(now, this.trialDays) : null;

    let user: User;
    try {
      user = await this.prisma.user.upsert({
        where: { authProviderUserId: authId },
        update: {
          email,
          lastSignInAt: now,
          deletedAt: null,
        },
        create: {
          email,
          authProvider: AuthProvider.clerk,
          authProviderUserId: authId,
          revenueCatAppUserId: authId,
          lastSignInAt: now,
          trialStartedAt: this.trialDays > 0 ? now : null,
          trialEndsAt,
          subscriptionStatus: SubscriptionStatus.trialing,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.user.findUnique({
          where: { email },
        });
        if (!existing) {
          throw error;
        }
        user = await this.prisma.user.update({
          where: { userId: existing.userId },
          data: {
            authProvider: AuthProvider.clerk,
            authProviderUserId: authId,
            revenueCatAppUserId: existing.revenueCatAppUserId ?? authId,
            email,
            lastSignInAt: now,
            deletedAt: null,
          },
        });
      } else {
        throw error;
      }
    }

    this.logger.debug('Synced Clerk identity', {
      userId: user.userId,
      authProviderUserId: authId,
    });

    await this.userStats.ensure(user.userId);

    return user;
  }

  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        entitlements: true,
        stats: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const onboardingRow = await this.getOnboardingProfileRow(userId);
    const activeSubscription = user.subscriptions[0];
    const stats = user.stats ?? (await this.userStats.ensure(userId));
    return {
      userId: user.userId,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      usernameStatus: user.usernameStatus,
      subscriptionStatus: user.subscriptionStatus,
      trialEndsAt: user.trialEndsAt ?? undefined,
      stripeCustomerId: user.stripeCustomerId ?? undefined,
      lastSignInAt: user.lastSignInAt ?? undefined,
      activeSubscription: activeSubscription
        ? {
            provider: activeSubscription.provider,
            status: activeSubscription.status,
            planName: activeSubscription.planName ?? undefined,
            priceId: activeSubscription.priceId ?? undefined,
            productId: activeSubscription.productId ?? undefined,
            currentPeriodEnd: activeSubscription.currentPeriodEnd ?? undefined,
          }
        : undefined,
      onboarding: this.buildOnboardingProfile(onboardingRow),
      stats: {
        pollsCreatedCount: stats.pollsCreatedCount,
        pollsContributedCount: stats.pollsContributedCount,
        followersCount: stats.followersCount,
        followingCount: stats.followingCount,
        favoriteListsCount: stats.favoriteListsCount,
        favoritesTotalCount: stats.favoritesTotalCount,
      },
      entitlements: user.entitlements.map((entitlement) => ({
        entitlementCode: entitlement.entitlementCode,
        source: entitlement.source,
        status: entitlement.status,
        expiresAt: entitlement.expiresAt ?? undefined,
        isGracePeriod: entitlement.isGracePeriod,
      })),
    };
  }

  async updateOnboarding(
    userId: string,
    dto: UpdateUserOnboardingDto,
  ): Promise<UserProfileDto> {
    const selectedCity = this.normalizeNullable(dto.selectedCity);
    const previewCity = this.normalizeNullable(dto.previewCity);
    const responses =
      dto.answers == null
        ? null
        : JSON.stringify(dto.answers as Prisma.InputJsonValue);

    try {
      await this.prisma.$executeRaw`
        UPDATE "users"
        SET
          "onboarding_status" = 'completed'::"onboarding_status",
          "onboarding_completed_at" = NOW(),
          "onboarding_version" = ${dto.onboardingVersion},
          "onboarding_selected_city" = ${selectedCity},
          "onboarding_preview_city" = ${previewCity},
          "onboarding_responses" = ${responses}::jsonb
        WHERE "user_id" = ${userId}::uuid
      `;

      return this.getProfile(userId);
    } catch (error) {
      if (!this.isMissingOnboardingSchemaError(error)) {
        throw error;
      }

      this.logger.warn(
        'Onboarding schema columns missing; returning development fallback onboarding profile',
        { userId },
      );

      const profile = await this.getProfile(userId);
      return {
        ...profile,
        onboarding: {
          status: 'completed',
          completedAt: new Date().toISOString(),
          onboardingVersion: dto.onboardingVersion,
          selectedCity,
          previewCity,
        },
      };
    }
  }

  async getPublicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        userId: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        stats: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const stats = user.stats ?? (await this.userStats.ensure(userId));
    return {
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      stats: {
        pollsCreatedCount: stats.pollsCreatedCount,
        pollsContributedCount: stats.pollsContributedCount,
        followersCount: stats.followersCount,
        followingCount: stats.followingCount,
        favoriteListsCount: stats.favoriteListsCount,
        favoritesTotalCount: stats.favoritesTotalCount,
      },
    };
  }

  async updateProfile(userId: string, dto: UpdateUserProfileDto) {
    const displayName = this.normalizeNullable(dto.displayName);
    const avatarUrl = this.normalizeNullable(dto.avatarUrl);

    return this.prisma.user.update({
      where: { userId },
      data: {
        displayName,
        avatarUrl,
      },
      select: {
        userId: true,
        username: true,
        displayName: true,
        avatarUrl: true,
      },
    });
  }

  async listEntitlements(userId: string): Promise<UserEntitlementDto[]> {
    const entitlements = await this.prisma.userEntitlement.findMany({
      where: { userId },
    });

    return entitlements.map((entitlement) => ({
      entitlementCode: entitlement.entitlementCode,
      source: entitlement.source,
      status: entitlement.status,
      expiresAt: entitlement.expiresAt ?? undefined,
      isGracePeriod: entitlement.isGracePeriod,
    }));
  }

  async ensureStripeCustomer(user: User, stripe: Stripe): Promise<string> {
    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        user_id: user.authProviderUserId ?? user.userId,
      },
    });

    await this.prisma.user.update({
      where: { userId: user.userId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  async upsertEntitlement(params: {
    userId: string;
    entitlementCode?: string | null;
    source: SubscriptionProvider;
    platform?: SubscriptionPlatform | null;
    status: EntitlementStatus;
    expiresAt?: Date | null;
    gracePeriodEndsAt?: Date | null;
    isGracePeriod?: boolean;
    metadata?: Prisma.InputJsonValue | null;
  }): Promise<void> {
    const entitlementCode = params.entitlementCode || this.defaultEntitlement;
    await this.prisma.userEntitlement.upsert({
      where: {
        userId_entitlementCode: {
          userId: params.userId,
          entitlementCode,
        },
      },
      update: {
        status: params.status,
        expiresAt: params.expiresAt ?? null,
        gracePeriodEndsAt: params.gracePeriodEndsAt ?? null,
        isGracePeriod: params.isGracePeriod ?? false,
        platform: params.platform ?? null,
        lastSyncedAt: new Date(),
        metadata: params.metadata ?? Prisma.JsonNull,
      },
      create: {
        userId: params.userId,
        entitlementCode,
        source: params.source,
        platform: params.platform ?? null,
        status: params.status,
        expiresAt: params.expiresAt ?? null,
        gracePeriodEndsAt: params.gracePeriodEndsAt ?? null,
        isGracePeriod: params.isGracePeriod ?? false,
        metadata: params.metadata ?? Prisma.JsonNull,
      },
    });
  }

  private async getOnboardingProfileRow(
    userId: string,
  ): Promise<OnboardingProfileRow> {
    try {
      const rows = await this.prisma.$queryRaw<OnboardingProfileRow[]>`
        SELECT
          "onboarding_status" AS "onboardingStatus",
          "onboarding_completed_at" AS "onboardingCompletedAt",
          "onboarding_version" AS "onboardingVersion",
          "onboarding_selected_city" AS "onboardingSelectedCity",
          "onboarding_preview_city" AS "onboardingPreviewCity"
        FROM "users"
        WHERE "user_id" = ${userId}::uuid
        LIMIT 1
      `;

      return rows[0] ?? DEFAULT_ONBOARDING_PROFILE_ROW;
    } catch (error) {
      if (!this.isMissingOnboardingSchemaError(error)) {
        throw error;
      }

      this.logger.warn(
        'Onboarding schema columns missing; falling back to default onboarding profile',
        { userId },
      );
      return DEFAULT_ONBOARDING_PROFILE_ROW;
    }
  }

  private resolveAuthIdentifier(claims: ClerkJwtClaims): string | undefined {
    return (
      claims.sub || claims.sid || (claims['user_id'] as string | undefined)
    );
  }

  private resolveEmail(claims: ClerkJwtClaims): string | undefined {
    if (typeof claims.email === 'string') {
      return claims.email;
    }
    if (typeof claims.email_address === 'string') {
      return claims.email_address;
    }
    const first = claims.email_addresses?.find(
      (record) => typeof record.email_address === 'string',
    );
    return first?.email_address;
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private normalizeNullable(value?: string | null): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private isMissingOnboardingSchemaError(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    const message = typeof error.message === 'string' ? error.message : '';
    return (
      message.includes('onboarding_status') ||
      message.includes('onboarding_responses') ||
      message.includes('"onboarding_status" does not exist') ||
      message.includes('type "onboarding_status" does not exist') ||
      message.includes('onboarding_completed_at') ||
      message.includes('onboarding_version') ||
      message.includes('onboarding_selected_city') ||
      message.includes('onboarding_preview_city')
    );
  }

  private buildOnboardingProfile(
    user: OnboardingProfileRow,
  ): UserOnboardingProfile {
    const onboardingVersion =
      typeof user.onboardingVersion === 'number' &&
      Number.isFinite(user.onboardingVersion)
        ? user.onboardingVersion
        : ONBOARDING_VERSION;
    const completedAtValue =
      user.onboardingCompletedAt instanceof Date
        ? user.onboardingCompletedAt.toISOString()
        : typeof user.onboardingCompletedAt === 'string'
        ? user.onboardingCompletedAt
        : null;
    return {
      status: user.onboardingStatus ?? 'not_started',
      completedAt: completedAtValue,
      onboardingVersion,
      selectedCity: user.onboardingSelectedCity ?? null,
      previewCity: user.onboardingPreviewCity ?? null,
    };
  }
}
