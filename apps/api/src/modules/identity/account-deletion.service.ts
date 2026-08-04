import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { ClerkAuthService } from './auth/clerk-auth.service';
import { EntitlementService } from '../entitlements/entitlement.service';
import { BillingService } from '../billing/billing.service';
import { CloudinaryService } from '../photos/cloudinary.service';
import { PersonDataEraserService } from './person-data/person-data-eraser.service';

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
/**
 * Owner ruling 2026-08-03. Apple explicitly permits a disclosed grace period;
 * the market has converged on one (Discord 15d, Untappd 7d, Letterboxd 30-90d)
 * because immediate hard deletion offers no recovery from a mis-tap or a
 * compromised account, and hands abusers a free ban reset. 30 days is the
 * owner's choice, and it must match what the delete screen tells the user.
 */
const GRACE_PERIOD_DAYS = 30;

@Injectable()
export class AccountDeletionService {
  private readonly logger: LoggerService;

  /**
   * The salt for the ban-evasion hash.
   *
   * Resolved HERE rather than in the constructor: a missing secret must fail
   * the DELETION, not the application boot. Throwing from a constructor makes
   * one feature's misconfiguration a total outage — and it did: the first
   * version threw on `JWT_SECRET`, which does not exist in ANY environment
   * (it was removed as dead when auth moved to Clerk), so the DI graph refused
   * to start. Caught by booting the graph, not by reading the code.
   *
   * SIGNAL_AUDIT_HMAC_KEY is this codebase's existing HMAC key (it already
   * keys the vote-integrity hashes) and is present in every environment.
   */
  private evasionSalt(): string {
    const salt =
      this.configService.get<string>('signals.auditHmacKey') ??
      process.env.SIGNAL_AUDIT_HMAC_KEY ??
      '';
    if (!salt) {
      // An unsalted digest of an email address is reversible by dictionary,
      // so producing one would be worse than refusing.
      throw new Error(
        'Account deletion cannot run: SIGNAL_AUDIT_HMAC_KEY is unset, and an unsalted hash of an email address is trivially reversible.',
      );
    }
    return salt;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly clerkAuth: ClerkAuthService,
    private readonly entitlements: EntitlementService,
    private readonly billing: BillingService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly personDataEraser: PersonDataEraserService,
    private readonly configService: ConfigService,
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
      // USERNAME: BURN THE HANDLE, DROP THE PERSON LINK. This must run
      // BEFORE the eraser, because the eraser deletes username_history (the
      // person<->handle mapping) and the handles have to be reserved first.
      // `username_history` is not a log — it IS the anti-reuse mechanism, so
      // deleting it alone would make a departed user's name claimable by
      // anyone. `reserved_usernames` is keyed by the handle with no person
      // column: it burns the name while retaining nothing about who held it.
      const heldNames = await this.prisma.usernameHistory.findMany({
        where: { userId: user.userId },
        select: { username: true },
      });
      const toBurn = new Set(heldNames.map((row) => row.username));
      if (user.username) toBurn.add(user.username);
      for (const username of toBurn) {
        await this.prisma.reservedUsername.upsert({
          where: { username },
          update: {},
          create: { username, reason: 'account_deleted' },
        });
      }

      // EVERYTHING INSIDE THE DATABASE IS DERIVED, NOT LISTED.
      //
      // This replaced a hand-written sequence of deleteMany/update calls whose
      // defining property was that A NEW TABLE CHANGED NOTHING — no test
      // failed, no build broke, the table was simply never deleted. That is
      // why private saved lists, raw typed search text (residue_text) and
      // device fingerprints all survived deletion while this method looked
      // complete and its specs were green.
      //
      // The eraser walks PERSON_DATA_RULES, so a classified column is handled
      // by construction, and person-data-census.spec.ts fails the build for
      // any person-shaped column nobody classified. The rulings that used to
      // live in comments here now live in the declaration, next to the column
      // they govern: signals keep their acts and lose the person link; the
      // taste profile dies; the recipient keeps their copy of a DM.
      const erasure = await this.personDataEraser.erase(user.userId);
      this.logger.info('Person data erased', {
        userId: user.userId,
        tablesAffected: Object.keys(erasure.applied).length,
      });

      await this.prisma.user.update({
        where: { userId: user.userId },
        data: {
          deletedAt: new Date(),
          // The grace deadline. deletedAt is LOGICAL erasure (already
          // irreversible: sessions revoked, tokens deleted, authorship
          // severed); this is the only thing the purge cron reads.
          purgeDueAt: new Date(Date.now() + GRACE_PERIOD_DAYS * 86_400_000),
          // BAN-EVASION HASH, NOT A REVERSIBLE POINTER (ruling 2026-08-03).
          //
          // This used to write `deleted:${userId}@anonymized.invalid`, which
          // failed the ruling in BOTH directions at once: it retained a
          // permanent, linkable person-key in a column the staging scrub
          // classifies as hard PII, AND it retained no evasion signal at all
          // (the original address was simply discarded).
          //
          // A salted one-way hash of the original address is the opposite on
          // both counts: it cannot be reversed to an identity, and it still
          // matches if the same person returns — so a banned account cannot
          // be reset by deleting and re-registering. The salt is the app
          // secret; without it the digest is useless even to us.
          // A null email is legitimate on some auth paths, and a deletion must
          // never crash on one. Fall back to the surrogate id: still salted,
          // still one-way, still unique — it simply carries no evasion signal
          // because there was no address to match on.
          email: `deleted:${createHmac('sha256', this.evasionSalt())
            .update((user.email ?? user.userId).trim().toLowerCase())
            .digest('hex')}@anonymized.invalid`,
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
