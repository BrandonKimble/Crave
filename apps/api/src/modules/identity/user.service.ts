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
import { AuthProvider, Prisma, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  ClerkAuthService,
  type ClerkJwtClaims,
  type ClerkUserIdentity,
} from './auth/clerk-auth.service';
import { EntitlementService } from '../entitlements/entitlement.service';
import { UserProfileDto } from './dto/user-profile.dto';
import { UserStatsService } from './user-stats.service';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UpdateUserOnboardingDto } from './dto/update-user-onboarding.dto';
import { FavoriteListProvisioningService } from '../favorites/favorite-list-provisioning.service';

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
    private readonly clerkAuth: ClerkAuthService,
    private readonly entitlements: EntitlementService,
    private readonly favoriteListProvisioning: FavoriteListProvisioningService,
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

    const existing = await this.prisma.user.findUnique({
      where: { authProviderUserId: authId },
      select: { email: true, displayName: true, avatarUrl: true },
    });

    // Resolve identity from the JWT claims, falling back to Clerk's authoritative
    // record only for fields still unknown (claims empty AND not already stored).
    // Seeded name/avatar are applied on create / as a gap-backfill — never to
    // clobber values the user later customizes via updateMe.
    const identity = await this.resolveIdentity(authId, claims, existing);
    const email = identity.email || `${authId}@placeholder.crave-search.local`;
    const displayName = identity.displayName;
    const avatarUrl = identity.avatarUrl;
    const now = new Date();

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
          displayName: displayName ?? null,
          avatarUrl: avatarUrl ?? null,
          authProvider: AuthProvider.clerk,
          authProviderUserId: authId,
          revenueCatAppUserId: authId,
          lastSignInAt: now,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const emailOwner = await this.prisma.user.findUnique({
          where: { email },
        });
        if (!emailOwner) {
          throw error;
        }
        user = await this.prisma.user.update({
          where: { userId: emailOwner.userId },
          data: {
            authProvider: AuthProvider.clerk,
            authProviderUserId: authId,
            revenueCatAppUserId: emailOwner.revenueCatAppUserId ?? authId,
            email,
            lastSignInAt: now,
            deletedAt: null,
          },
        });
      } else {
        throw error;
      }
    }

    // Backfill profile fields for accounts that predate a now-resolvable Clerk
    // claim (e.g. created before the JWT template exposed name/avatar). Only fills
    // gaps — never overwrites a value the user customized via updateMe.
    const backfill: Prisma.UserUpdateInput = {};
    if (displayName && !user.displayName) backfill.displayName = displayName;
    if (avatarUrl && !user.avatarUrl) backfill.avatarUrl = avatarUrl;
    if (Object.keys(backfill).length > 0) {
      user = await this.prisma.user.update({
        where: { userId: user.userId },
        data: backfill,
      });
    }

    this.logger.debug('Synced Clerk identity', {
      userId: user.userId,
      authProviderUserId: authId,
    });

    await this.userStats.ensure(user.userId);

    // Auto-created default lists (page-registry §8.7): same self-healing
    // seam as userStats.ensure — idempotent per sync, so existing users are
    // backfilled on their next sign-in with no separate script.
    await this.favoriteListProvisioning.ensureDefaultLists(user.userId);

    // Reverse trial (app-owned, NOT a store trial — store trials can't be
    // extended, and photo/invite rewards must be able to extend this):
    // exactly one trial_base grant per user, written on first sight. No-op
    // while BILLING_TRIAL_DAYS=0.
    if (this.trialDays > 0) {
      const existingTrial = await this.prisma.accessGrant.findFirst({
        where: { userId: user.userId, source: 'trial_base' },
        select: { grantId: true },
      });
      if (!existingTrial) {
        // sourceRef makes the (userId, source, sourceRef) unique index the
        // once-ever contract — concurrent first-launch requests can't stack
        // multiple trials (grant() treats the violation as a no-op).
        await this.entitlements.grant({
          userId: user.userId,
          source: 'trial_base',
          days: this.trialDays,
          sourceRef: 'signup',
        });
      }
    }

    return user;
  }

  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { deletedAt: null, userId },
      include: {
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        stats: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const onboardingRow = await this.getOnboardingProfileRow(userId);
    const activeSubscription = user.subscriptions[0];
    const stats = user.stats ?? (await this.userStats.ensure(userId));
    const summary = await this.entitlements.summarize(userId);
    const gatingMode = process.env.ENTITLEMENT_GATING?.trim().toLowerCase();
    return {
      // enforced tells the client whether the app-wide wall is LIVE — the
      // paywall routing axis keys off this, so the rollout stays a single
      // server-side switch.
      access: { ...summary, enforced: gatingMode === 'enforce' },
      userId: user.userId,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      usernameStatus: user.usernameStatus,
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
      stats: await this.buildProfileStats(userId, stats.pollsContributedCount),
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

  /** W4 fix: the "Polls" stat MUST agree with the profile Polls section
   *  (GET /polls/users/:userId?activity=created). That list's predicate is
   *  `createdByUserId` with NO state/market filter, so the stat is a LIVE
   *  count over the same rows — not the drifting `user_stats` counter (which
   *  had no reconciliation and disagreed with reality in dev data). */
  private countCreatedPolls(userId: string): Promise<number> {
    return this.prisma.poll.count({ where: { createdByUserId: userId } });
  }

  /** Stats-drift disease fix (the pollsCreatedCount pattern, extended):
   *  followers / following / lists / favorites were increment counters
   *  applied OUTSIDE the edge-write tx — a crash between writes drifted them
   *  forever. Each stat is now a LIVE indexed count over the SAME rows its
   *  profile section lists, so stat == section by construction:
   *  - followers  → user_follows.followingUserId (idx_user_follows_following)
   *  - following  → user_follows.followerUserId  (idx_user_follows_follower)
   *  - lists      → favorite_lists.ownerUserId   (idx_favorite_lists_owner)
   *  - favorites  → favorite_list_items via owned lists (idx_favorite_lists_owner
   *                 + idx_favorite_list_items_list)
   *  Five extra indexed counts per profile read — fine at launch scale.
   *  pollsContributedCount is the one remaining user_stats read. */
  private async buildProfileStats(
    userId: string,
    pollsContributedCount: number,
  ) {
    const [
      pollsCreatedCount,
      followersCount,
      followingCount,
      favoriteListsCount,
      favoritesTotalCount,
    ] = await Promise.all([
      this.countCreatedPolls(userId),
      this.prisma.userFollow.count({ where: { followingUserId: userId } }),
      this.prisma.userFollow.count({ where: { followerUserId: userId } }),
      this.prisma.favoriteList.count({ where: { ownerUserId: userId } }),
      this.prisma.favoriteListItem.count({
        where: { list: { ownerUserId: userId } },
      }),
    ]);
    return {
      pollsCreatedCount,
      pollsContributedCount,
      followersCount,
      followingCount,
      favoriteListsCount,
      favoritesTotalCount,
    };
  }

  async getPublicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { deletedAt: null, userId },
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
      stats: await this.buildProfileStats(userId, stats.pollsContributedCount),
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

  // Real authenticated Clerk accounts carry a `user_…` subject; dev/perf/test
  // identities (e.g. the perf-scenario token) don't — never hit the admin API for
  // those.
  private isRealClerkUser(authId: string): boolean {
    return authId.startsWith('user_');
  }

  /**
   * Resolve email/displayName/avatarUrl from the session JWT, then gap-fill from
   * Clerk's authoritative record for any field still unknown (claims empty AND not
   * already stored). This keeps identity sync correct regardless of how the JWT
   * template is configured, while bounding admin-API calls to "we genuinely lack
   * the data" — once stored, no further calls are made. Never downgrades a usable
   * stored email.
   */
  private async resolveIdentity(
    authId: string,
    claims: ClerkJwtClaims,
    existing: {
      email: string;
      displayName: string | null;
      avatarUrl: string | null;
    } | null,
  ): Promise<ClerkUserIdentity> {
    let email = this.resolveEmail(claims);
    let displayName = this.resolveDisplayName(claims);
    let avatarUrl = this.resolveAvatarUrl(claims);

    const storedEmailUsable =
      existing != null &&
      this.isResolvedClaim(existing.email) &&
      existing.email.includes('@') &&
      !existing.email.endsWith('@placeholder.crave-search.local');

    const needEmail = !email && !storedEmailUsable;
    const needName = !displayName && !existing?.displayName;
    const needAvatar = !avatarUrl && !existing?.avatarUrl;

    if (this.isRealClerkUser(authId) && (needEmail || needName || needAvatar)) {
      const fetched = await this.clerkAuth.fetchUserIdentity(authId);
      if (fetched) {
        email = email ?? fetched.email;
        displayName = displayName ?? fetched.displayName;
        avatarUrl = avatarUrl ?? fetched.avatarUrl;
      }
    }

    // Preserve a usable stored email when nothing better was resolved (the upsert
    // update path writes email unconditionally).
    if (!email && storedEmailUsable) {
      email = existing.email;
    }

    return { email, displayName, avatarUrl };
  }

  // An unresolved Clerk JWT template (e.g. "{{user.primary_email_address...}}")
  // arrives literally when the dashboard template claim is misconfigured — never
  // persist that. A claim is usable only if it's non-empty and not a template.
  private isResolvedClaim(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    return (
      trimmed.length > 0 && !trimmed.includes('{{') && !trimmed.includes('}}')
    );
  }

  private resolveEmail(claims: ClerkJwtClaims): string | undefined {
    const candidates = [
      claims.email,
      claims.email_address,
      claims.email_addresses?.find((record) =>
        this.isResolvedClaim(record.email_address),
      )?.email_address,
    ];
    return candidates.find(
      (value) => this.isResolvedClaim(value) && value.includes('@'),
    );
  }

  private resolveDisplayName(claims: ClerkJwtClaims): string | undefined {
    const composed = [
      claims.first_name ?? claims.given_name,
      claims.last_name ?? claims.family_name,
    ]
      .filter((part): part is string => this.isResolvedClaim(part))
      .join(' ')
      .trim();
    const candidates = [
      claims.name,
      claims.full_name,
      composed.length > 0 ? composed : undefined,
      claims.username,
    ];
    const resolved = candidates.find((value) => this.isResolvedClaim(value));
    return resolved ? resolved.trim() : undefined;
  }

  private resolveAvatarUrl(claims: ClerkJwtClaims): string | undefined {
    const candidates = [claims.image_url, claims.picture];
    return candidates.find(
      (value) => this.isResolvedClaim(value) && value.startsWith('http'),
    );
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
