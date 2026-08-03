import { Injectable } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { ClerkAuthService } from './auth/clerk-auth.service';
import { EntitlementService } from '../entitlements/entitlement.service';
import { BillingService } from '../billing/billing.service';
import { CloudinaryService } from '../photos/cloudinary.service';

/**
 * In-app account deletion (Apple 5.1.1(v) — required for App Store review).
 *
 * Semantics: SOFT-delete + anonymize, not a row cascade. Community content
 * (polls, comments, endorsements) survives as an anonymous author — hard
 * deletion would tear holes in other users' threads. Billing rows are
 * retained for financial audit. PII is scrubbed; the auth identity is
 * destroyed at Clerk so the account can never be signed into again.
 *
 * Behavioral data (D40 owner ruling, 2026-08-03): deletion is ANONYMITY, not
 * data destruction, wherever the data is anonymous demand evidence. The
 * signals ledger keeps its rows and `signal_actors` keeps its actor — only
 * the mapping to the person is severed. Data that is ABOUT the person
 * (their onboarding answers, their inferred taste profile) is deleted
 * outright.
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
    private readonly cloudinaryService: CloudinaryService,
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
      // The avatar is pure PII with zero community value — destroy the
      // Cloudinary asset (UGC photos survive as anonymous community
      // content per the doc comment; a GDPR Art.17 bulk-destroy sweep is a
      // documented follow-up, not built speculatively).
      if (this.cloudinaryService.isConfigured) {
        try {
          await this.cloudinaryService.destroyAsset(
            this.cloudinaryService.avatarPublicIdFor(user.userId),
          );
        } catch {
          // asset may not exist; deletion proceeds either way
        }
      }
      await this.entitlements.revokeAllForUser(user.userId, 'account_deleted');
      // HARD-CONTACT PII MUST ACTUALLY BE DELETED (red-team 2026-08-02).
      // This is a SOFT delete (the users row is anonymized so content
      // attribution and financial records survive), and these tables carry
      // NO FK to users — so nothing cascaded and the deleted account kept a
      // live push token, device fingerprints, and a permanent username
      // linkage. These are exactly the columns the staging PII scrub
      // (scripts/rig/scrub-staging-user-data.sql) defines as hard-contact
      // PII; deletion and the scrub now agree on what "user data" means.
      await this.prisma.notificationDevice.deleteMany({
        where: { userId: user.userId },
      });
      await this.prisma.userDevice.deleteMany({
        where: { userId: user.userId },
      });
      await this.prisma.usernameHistory.deleteMany({
        where: { userId: user.userId },
      });
      // D40 owner rulings #1 + #2 (2026-08-03) — SEVERANCE, not destruction.
      //
      // #1 SIGNALS: signals.service.ts has always documented the story —
      // "the deletion story severs the pseudonymous actor mapping
      // (signal_actors), never signal rows" — and nothing implemented it.
      // The ledger is append-only by law, and the acts are anonymous demand
      // evidence the corpus is built on; what must go is the LINK to the
      // person. So the actor row survives (the signals keep pointing at it)
      // with user_id severed. device_key is severed with it: it is the same
      // hard-contact fingerprint the staging scrub classifies as PII, and
      // leaving it would let the next sign-in on that device re-adopt the
      // actor and re-attach a real person to acts we just anonymized.
      //
      // #2 THE TWO D40 TABLES DIE WITH THE ACCOUNT: user_onboarding_responses
      // is the person's own answers (deletion already nulled the
      // users.onboarding_responses projection — the record now follows), and
      // user_taste_profile is an inferred-preference record (dietary, spice,
      // budget). The profile is keyed by actor_id, so it is read off the
      // actor BEFORE the mapping is severed — after severance there is no
      // path from the user back to those rows, by design.
      const actor = await this.prisma.signalActor.findUnique({
        where: { userId: user.userId },
        select: { actorId: true },
      });
      if (actor) {
        await this.prisma.userTasteProfile.deleteMany({
          where: { actorId: actor.actorId },
        });
        await this.prisma.signalActor.update({
          where: { actorId: actor.actorId },
          data: { userId: null, deviceKey: null },
        });
      }
      await this.prisma.userOnboardingResponse.deleteMany({
        where: { userId: user.userId },
      });
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
