import {
  SubscriptionProvider,
  SubscriptionStatus,
  EntitlementStatus,
  UsernameStatus,
} from '@prisma/client';

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
  stats: UserStatsDto;
  entitlements: UserEntitlementDto[];
}

export interface PublicUserProfileDto {
  userId: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  stats: UserStatsDto;
}
