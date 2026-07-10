import { Injectable } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { ClerkAuthService } from './auth/clerk-auth.service';
import { EntitlementService } from '../entitlements/entitlement.service';
import { BillingService } from '../billing/billing.service';

/**
 * In-app account deletion (Apple 5.1.1(v) — required for App Store review).
 *
 * Semantics: SOFT-delete + anonymize, not a row cascade. Community content
 * (polls, comments, endorsements) survives as an anonymous author — hard
 * deletion would tear holes in other users' threads. Billing rows are
 * retained for financial audit. PII is scrubbed; the auth identity is
 * destroyed at Clerk so the account can never be signed into again.
 *
 * Ordering (each step idempotent, fail-loud):
 * 1. Stop web billing (Stripe cancel_at_period_end) — best-effort: a billing
 *    hiccup must not block a legally-required deletion. App Store
 *    subscriptions CANNOT be cancelled server-side; the client warns the
 *    user to cancel in Settings (billing continues otherwise — Apple's
 *    rule, not ours).
 * 2. Delete the Clerk user. Nothing local has changed yet, so a failure
 *    here is a clean 5xx and the client can simply retry.
 * 3. Revoke all live access grants + anonymize the row. Failures after the
 *    Clerk delete are logged CRITICAL with the userId for manual replay
 *    (the account is already un-signable-into, so no access risk).
 */
@Injectable()
export class AccountDeletionService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly clerkAuth: ClerkAuthService,
    private readonly entitlements: EntitlementService,
    private readonly billing: BillingService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('AccountDeletionService');
  }

  async deleteAccount(user: User): Promise<{ deleted: true }> {
    // 1. Stop future web billing.
    try {
      await this.billing.cancelSubscription(user);
      this.logger.info('Stripe subscription set to cancel at period end', {
        userId: user.userId,
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        // No Stripe subscription (or it's an App Store one) — nothing to do.
      } else {
        this.logger.error(
          'Stripe cancellation failed during account deletion — proceeding',
          {
            userId: user.userId,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    // 2. Destroy the auth identity. Throws -> 5xx -> client retries; local
    // state is untouched so the retry authenticates normally.
    if (user.authProviderUserId) {
      await this.clerkAuth.deleteClerkUser(user.authProviderUserId);
    }

    // 3. Local scrub. The Clerk user is gone; any failure below is logged
    // CRITICAL and replayable by an admin (no auth path back in exists).
    try {
      await this.entitlements.revokeAllForUser(user.userId, 'account_deleted');
      await this.prisma.user.update({
        where: { userId: user.userId },
        data: {
          deletedAt: new Date(),
          email: `deleted:${user.userId}@anonymized.invalid`,
          username: null,
          displayName: null,
          avatarUrl: null,
          authProviderUserId: null,
          revenueCatAppUserId: null,
          onboardingResponses: Prisma.DbNull,
          // stripeCustomerId retained: financial records must stay auditable.
        },
      });
    } catch (error) {
      this.logger.error(
        'CRITICAL: account deletion partially applied — Clerk user deleted ' +
          'but local anonymization failed; replay manually',
        {
          userId: user.userId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      throw error;
    }

    this.logger.info('Account deleted', { userId: user.userId });
    return { deleted: true };
  }
}
