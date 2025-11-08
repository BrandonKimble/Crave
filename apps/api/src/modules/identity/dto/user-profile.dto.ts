import {
  SubscriptionProvider,
  SubscriptionStatus,
  EntitlementStatus,
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

export interface UserProfileDto {
  userId: string;
  email: string;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt?: Date | null;
  stripeCustomerId?: string;
  lastSignInAt?: Date | null;
  activeSubscription?: ActiveSubscriptionDto;
  entitlements: UserEntitlementDto[];
}
