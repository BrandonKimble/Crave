import {
  SubscriptionProvider,
  SubscriptionStatus,
  EntitlementStatus,
  UsernameStatus,
} from '@prisma/client';
import type { UserOnboardingProfile } from '@crave-search/shared';

export interface ActiveSubscriptionDto {
  provider: SubscriptionProvider;
  status: SubscriptionStatus;
  planName?: string;
  priceId?: string;
  productId?: string;
  currentPeriodEnd?: Date | null;
}

export interface UserEntitlementDto {
  entitlementCode: string;
  source: SubscriptionProvider;
  status: EntitlementStatus;
  expiresAt?: Date | null;
  isGracePeriod: boolean;
}

export interface UserStatsDto {
  pollsCreatedCount: number;
  pollsContributedCount: number;
  followersCount: number;
  followingCount: number;
  favoriteListsCount: number;
  favoritesTotalCount: number;
}

export interface UserProfileDto {
  userId: string;
  email: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  usernameStatus?: UsernameStatus | null;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt?: Date | null;
  stripeCustomerId?: string;
  lastSignInAt?: Date | null;
  activeSubscription?: ActiveSubscriptionDto;
  onboarding: UserOnboardingProfile;
  stats: UserStatsDto;
  entitlements: UserEntitlementDto[];
  /** SERVER-TRUTH access summary (the ledger, via EntitlementService) — the
   *  mobile app renders paywalls/trial countdown from THIS, never local
   *  inference. */
  access: {
    entitlementCode: string;
    active: boolean;
    /** null = lifetime while active; ignore when inactive. */
    expiresAt: Date | null;
    source: string | null;
  };
}

export interface PublicUserProfileDto {
  userId: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  stats: UserStatsDto;
}
