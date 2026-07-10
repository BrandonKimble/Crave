import {
  SubscriptionProvider,
  SubscriptionStatus,
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
  lastSignInAt?: Date | null;
  activeSubscription?: ActiveSubscriptionDto;
  onboarding: UserOnboardingProfile;
  stats: UserStatsDto;
  /** SERVER-TRUTH access summary (the ledger, via EntitlementService) — the
   *  mobile app renders paywalls/trial countdown from THIS, never local
   *  inference. */
  access: {
    entitlementCode: string;
    active: boolean;
    /** End of ALL coverage (paid + banked days); null = lifetime. */
    expiresAt: Date | null;
    /** End of the live PAID window (renewal/expiry date); null when
     *  lifetime or when only banked-day coverage remains. */
    paidUntil: Date | null;
    /** Equals expiresAt; distinct so UI can say "then banked days". */
    coverageUntil: Date | null;
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
