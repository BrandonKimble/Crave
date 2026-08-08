import { Injectable } from '@nestjs/common';
import { createHmac } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { ClerkAuthService } from './auth/clerk-auth.service';
import { EntitlementService } from '../entitlements/entitlement.service';
import { BillingService } from '../billing/billing.service';
import { CloudinaryService } from '../photos/cloudinary.service';
import { PersonDataEraserService } from './person-data/person-data-eraser.service';
import { reservedUsernameHash } from './reserved-username-hash';

/**
 * In-app account deletion (Apple 5.1.1(v) — required for App Store review).
 *
 * TWO PHASES, AND THE SPLIT IS THE WHOLE DESIGN.
 *
 *   deleteAccount()  the REQUEST. Reversible. Signs the person out everywhere
 *                    and marks the account deleted. Destroys nothing.
 *   purgeAccount()   the DEADLINE, 30 days later. Irreversible. Destroys the
 *                    auth identity, burns the handle, erases the person.
 *
 * WHY (owner ruling 2026-08-03, corrected). Both documents already promised a
 * recoverable window — the privacy policy in as many words: "a 30-day window,
 * which exists so that an accidental or coerced deletion can be caught before
 * it becomes irreversible." The code did the opposite: it deleted the Clerk
 * user, burned the username, hashed the email and ran the full eraser inside
 * the request, so nothing could ever be caught. A published retention promise
 * with no mechanism is worse than no promise — it is a commitment you are
 * provably not keeping. The app's own confirm dialog said "cannot be undone",
 * contradicting the policy. This is what makes the policy true.
 *
 * That window is also the market norm (Discord 15d, Untappd 7d, Letterboxd
 * 30-90d) for a reason immediate deletion cannot serve: a mis-tap, and a
 * coerced or compromised account, both need a way back.
 *
 * WHAT SURVIVES THE PURGE, and why it is not a loophole:
 *   - Community content (polls, comments, endorsements, photos) survives as
 *     anonymous authorship. Hard deletion would tear holes in other people's
 *     threads. The ToS content licence expressly survives termination, which
 *     is the right that makes this lawful rather than merely convenient.
 *   - Demand evidence survives with the PERSON severed, not the act deleted:
 *     deletion is ANONYMITY where the data is anonymous evidence.
 *   - Billing rows are retained for financial audit (GDPR 17(3)(b)).
 *   - Data ABOUT the person (onboarding answers, inferred taste profile) is
 *     deleted outright.
 * All of that is declared per-column in person-data-class.ts and executed by
 * the eraser — never listed by hand here, because a hand-written list is how
 * a new table silently stopped being deleted.
 *
 * RESTORE is an EXPLICIT act (`restoreAccount`, behind POST
 * /users/me/restore). It used to be a side effect of `syncFromClerkClaims`,
 * which the auth guard calls on every authenticated request — so any stray
 * call un-deleted the account: a background refresh, a retry, a request
 * already in flight when the person confirmed. A window you can fall back
 * through by accident is not a decision anybody made.
 */
export const GRACE_PERIOD_DAYS = 30;

/** The three columns the deletion stash carries — the whole visible identity. */
type DeletedIdentityStash = {
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

/**
 * Read the stash back, defensively.
 *
 * JSONB is an open shape by construction, so this cannot assume it holds what
 * this file wrote — a row stashed by an older build, or hand-edited, must not
 * make the ONE route a panicking person reaches throw a type error. An
 * unreadable or absent stash restores the account with the columns left null:
 * the person gets their account and their content back and can set a name
 * again, which is strictly better than refusing the restore.
 */
function readDeletedIdentity(
  value: Prisma.JsonValue | null,
): DeletedIdentityStash {
  const str = (v: unknown): string | null =>
    typeof v === 'string' && v.length > 0 ? v : null;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { username: null, displayName: null, avatarUrl: null };
  }
  const record = value as Record<string, Prisma.JsonValue | undefined>;
  return {
    username: str(record.username),
    displayName: str(record.displayName),
    avatarUrl: str(record.avatarUrl),
  };
}

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

  /**
   * THE REQUEST. Reversible by design — this destroys nothing.
   *
   * Order matters only in that billing stops first: the person asked to leave,
   * so stopping a renewal is the one thing that must not wait for the
   * deadline. Everything else is a mark and a sign-out.
   */
  async deleteAccount(user: User): Promise<{ deleted: true }> {
    // 1. Stop future web billing. Best-effort: a billing hiccup must not block
    //    a legally-required deletion. App Store subscriptions CANNOT be
    //    cancelled server-side; the client warns the user to cancel in
    //    Settings (Apple's rule, not ours).
    try {
      await this.billing.cancelSubscription(user);
      this.logger.info('Stripe subscription set to cancel at period end', {
        userId: user.userId,
      });
    } catch (error) {
      if (!(error instanceof BadRequestException)) {
        this.logger.error(
          'Stripe cancellation failed during account deletion — proceeding',
          {
            userId: user.userId,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    // 2. Sign out everywhere — WITHOUT destroying the Clerk identity. That
    //    identity is the ONLY way back in during the window, so deleting it
    //    here is precisely what made the promised grace period impossible.
    //    Best-effort: every authenticated route already refuses a user whose
    //    deletedAt is set, so a surviving session reaches nothing.
    if (user.authProviderUserId) {
      try {
        const { revoked } = await this.clerkAuth.revokeAllSessions(
          user.authProviderUserId,
        );
        this.logger.info('Clerk sessions revoked', {
          userId: user.userId,
          revoked,
        });
      } catch (error) {
        this.logger.error('Clerk session revocation failed — proceeding', {
          userId: user.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // NO ENTITLEMENT REVOCATION HERE — it moved to the purge.
    //
    // Revoking at request time destroyed something the window is supposed to
    // protect: a paying person who mis-tapped and restored on day 2 came back
    // with their grants revoked and no way to get them back. Access is already
    // denied by the guard (a deleted account is refused everywhere), so
    // revoking now bought nothing and cost the recovery it was meant to allow.

    // 4. Mark, AND GO ANONYMOUS IMMEDIATELY (D148, owner-approved 2026-08-07).
    //
    //    `deletedAt` hides the account everywhere; `purgeDueAt` is the deadline
    //    the purge cron reads. Both are cleared together on restore.
    //
    //    THE IDENTITY MOVES IN THE SAME STATEMENT. It used to sit in the
    //    visible columns for the whole 30-day window, and every reader that
    //    forgot `publicAuthorIdentity` rendered the departed person's real name
    //    — a leak that a text scanner could only ever spot-check. Nulling the
    //    columns at the REQUEST makes forgetting the resolver COSMETIC (a blank
    //    byline) instead of a disclosure, which is the whole point: the data is
    //    gone from the place a careless read looks.
    //
    //    NULL IS UNIQUE-SAFE. `username` is a nullable citext, so any number of
    //    nulled shells coexist; no tombstone value is needed and none is
    //    invented. The originals are not lost — they are stashed in
    //    `deletedIdentity` and swapped back by `restoreAccount`, which is what
    //    keeps the grace window a real undo rather than a partial one.
    //
    //    ONE STATEMENT, deliberately: stash-and-null must be atomic, or a crash
    //    between two writes leaves either a visible name on a deleted account
    //    or an identity nobody can restore.
    await this.prisma.user.update({
      where: { userId: user.userId },
      data: {
        deletedAt: new Date(),
        purgeDueAt: new Date(Date.now() + GRACE_PERIOD_DAYS * 86_400_000),
        deletedIdentity: {
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
        },
        username: null,
        displayName: null,
        avatarUrl: null,
      },
    });

    this.logger.info('Account deletion requested (recoverable)', {
      userId: user.userId,
      graceDays: GRACE_PERIOD_DAYS,
    });
    return { deleted: true };
  }

  /**
   * THE UNDO. The only thing that clears the tombstone.
   *
   * Reachable while deleted (@AllowDeletedAccount) — it is the one route that
   * must be, since every other one refuses a closed account.
   *
   * BOTH FIELDS, TOGETHER. `purgeDueAt` is what the cron reads; clearing
   * `deletedAt` alone would leave a restored account scheduled for destruction
   * at its original deadline — a silent, dated bomb.
   *
   * Past the deadline this cannot be reached at all: the purge nulls
   * `authProviderUserId`, so the Clerk identity no longer resolves to this row
   * and a returning person is simply a new account.
   */
  async restoreAccount(user: User): Promise<{ restored: true }> {
    if (!user.deletedAt) {
      // Idempotent: restoring a live account is a no-op, not an error. A
      // double-tap must not 500.
      return { restored: true };
    }
    // THE IDENTITY COMES BACK WITH THE ACCOUNT (D148). `deleteAccount` nulled
    // the visible columns and stashed the originals; restoring the tombstone
    // without restoring the name would hand the person back a blank profile,
    // which is not an undo.
    const stash = readDeletedIdentity(user.deletedIdentity);
    try {
      await this.prisma.user.update({
        where: { userId: user.userId },
        data: {
          deletedAt: null,
          purgeDueAt: null,
          deletedIdentity: Prisma.DbNull,
          ...stash,
        },
      });
    } catch (error) {
      // BELT, NOT BRACES. `username_history` already blocks squatting — a
      // handle held by a deleted account cannot be claimed by anyone else
      // while the window is open — so this collision is not supposed to be
      // reachable. It is caught anyway because the alternative to a clean 409
      // is a 500 on the one route a person reaches while panicking about
      // having deleted their account, and "your handle is taken" is at least
      // an answer they can act on.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.error('Restore blocked: the stashed handle is taken', {
          userId: user.userId,
        });
        throw new ConflictException(
          'That username is no longer available, so the account cannot be restored under it. Contact support.',
        );
      }
      throw error;
    }
    this.logger.info('Account restored within grace window', {
      userId: user.userId,
    });
    return { restored: true };
  }

  /**
   * THE DEADLINE. Irreversible. Called only by DeletionPurgeService, only for
   * accounts whose window has expired.
   *
   * Idempotent throughout, because it WILL be retried: the purge leaves
   * `purgeDueAt` set on failure rather than clearing a deadline it did not
   * meet.
   *
   * ORDER IS LOAD-BEARING. The username must be reserved BEFORE the eraser
   * runs, because the eraser deletes `username_history` — which is not a log,
   * it IS the anti-reuse mechanism. Deleting it first would make a departed
   * person's handle claimable by anyone.
   */
  async purgeAccount(user: User): Promise<void> {
    // IDEMPOTENCE IS NOT OPTIONAL — this WILL be re-run. A purge that fails
    // partway leaves `purgeDueAt` set (deliberately, so it retries), and the
    // cron re-reads the row fresh. Without this guard the retry would hash an
    // ALREADY-HASHED email, producing a different digest and destroying the
    // ban-evasion signal the first pass correctly recorded — the one thing in
    // here that can be silently lost rather than loudly re-done.
    const alreadyAnonymized =
      user.email?.startsWith('deleted:') && user.authProviderUserId === null;
    if (alreadyAnonymized) {
      this.logger.info(
        'Purge re-run on an already-anonymized shell — ' +
          'sweeping late rows only',
        { userId: user.userId },
      );
      await this.personDataEraser.erase(user.userId);
      return;
    }
    // The avatar is pure PII with zero community value — destroy the asset.
    // UGC photos survive as anonymous community content (ToS content licence
    // survives termination).
    if (this.cloudinaryService.isConfigured) {
      try {
        await this.cloudinaryService.destroyAsset(
          this.cloudinaryService.avatarPublicIdFor(user.userId),
        );
      } catch {
        // asset may not exist; the purge proceeds either way
      }
    }

    // PROCESSOR PROPAGATION (GDPR 17(2), CCPA 1798.105(c)): the duty reaches
    // processors, and a single API call is neither impossible nor
    // disproportionate. This used to null `revenueCatAppUserId` locally, which
    // severed OUR pointer while leaving the subscriber live at RevenueCat —
    // the link deleted from the side not holding the data.
    //
    // The other processors, for the record:
    //   Clerk      — the user is destroyed below. Because native Apple sign-in
    //                is BROKERED BY CLERK (native-apple-auth.service talks to
    //                clerk.apiUrl) and we store no Apple refresh token
    //                anywhere, that delete IS our Sign-in-with-Apple
    //                revocation — we cannot revoke a token we never held.
    //   Cloudinary — the avatar asset is destroyed above.
    //   Expo       — holds nothing but the push token, which the eraser
    //                deletes; there is no remote record to propagate to.
    // Grants die with the account, at the deadline — not at the request.
    await this.entitlements.revokeAllForUser(user.userId, 'account_deleted');

    if (user.revenueCatAppUserId) {
      try {
        await this.billing.deleteRevenueCatSubscriber(user.revenueCatAppUserId);
      } catch (error) {
        this.logger.error('RevenueCat subscriber delete failed during purge', {
          userId: user.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Destroy the auth identity. After this there is no path back in, which is
    // exactly why it belongs at the deadline and not in the request.
    if (user.authProviderUserId) {
      await this.clerkAuth.deleteClerkUser(user.authProviderUserId);
    }

    // BURN THE HANDLE, DROP THE PERSON LINK — before the eraser (see the doc).
    // `reserved_usernames` is keyed by the handle with no person column: it
    // burns the name while retaining nothing about who held it.
    //
    // AND THE HANDLE ITSELF IS HASHED (owner ruling 2026-08-07). "No person
    // column" is not the same as "no person": a table of every handle ever
    // abandoned is a roster of who used to be here, since a handle is often a
    // real name. The reservation only ever asks an EQUALITY question, so a
    // keyed HMAC answers it exactly — see reserved-username-hash.ts, which
    // both this writer and UsernameService's lookup go through so they cannot
    // drift apart.
    const heldNames = await this.prisma.usernameHistory.findMany({
      where: { userId: user.userId },
      select: { username: true },
    });
    const toBurn = new Set(heldNames.map((row) => row.username));
    if (user.username) toBurn.add(user.username);
    for (const username of toBurn) {
      const hashed = reservedUsernameHash(username);
      await this.prisma.reservedUsername.upsert({
        where: { username: hashed },
        update: {},
        create: { username: hashed, reason: 'account_deleted' },
      });
    }

    // EVERYTHING INSIDE THE DATABASE IS DERIVED, NOT LISTED.
    //
    // This replaced a hand-written sequence of deleteMany/update calls whose
    // defining property was that A NEW TABLE CHANGED NOTHING — no test failed,
    // no build broke, the table was simply never deleted. That is why private
    // saved lists, raw typed search text (residue_text) and device
    // fingerprints all survived deletion while the method looked complete and
    // its specs were green.
    //
    // The eraser walks PERSON_DATA_RULES, so a classified column is handled by
    // construction, and person-data-census.spec.ts fails the build for any
    // person-shaped column nobody classified.
    const erasure = await this.personDataEraser.erase(user.userId);
    this.logger.info('Person data erased', {
      userId: user.userId,
      tablesAffected: Object.keys(erasure.applied).length,
    });

    await this.prisma.user.update({
      where: { userId: user.userId },
      data: {
        // BAN-EVASION HASH, NOT A REVERSIBLE POINTER.
        //
        // This used to write `deleted:${userId}@anonymized.invalid`, which
        // failed in BOTH directions at once: it retained a permanent, linkable
        // person-key in a column the staging scrub classifies as hard PII, AND
        // it retained no evasion signal at all (the original address was
        // simply discarded).
        //
        // A salted one-way hash is the opposite on both counts: it cannot be
        // reversed to an identity, and it still matches if the same person
        // returns — so a banned account cannot be reset by deleting and
        // re-registering. A null email is legitimate on some auth paths and a
        // purge must never crash on one; the surrogate id is the fallback,
        // still salted and unique, carrying no evasion signal because there
        // was no address to match on.
        email: `deleted:${createHmac('sha256', this.evasionSalt())
          .update((user.email ?? user.userId).trim().toLowerCase())
          .digest('hex')}@anonymized.invalid`,
        // These three are ALREADY null on every account that went through
        // `deleteAccount` (D148 nulls them at the request), so this is now an
        // idempotent restatement rather than the moment anonymity begins. It
        // stays because the purge must be correct for any row it is handed,
        // including one whose deletion predates the stash.
        username: null,
        displayName: null,
        avatarUrl: null,
        // AND THE STASH DIES WITH THE WINDOW. It exists only to make restore
        // possible; past the deadline there is nothing to restore, so keeping
        // the real name in JSONB would be retaining exactly the identity this
        // method exists to destroy.
        deletedIdentity: Prisma.DbNull,
        authProviderUserId: null,
        revenueCatAppUserId: null,
        onboardingResponses: Prisma.DbNull,
        // stripeCustomerId retained — and the ruling now lives in
        // PERSON_DATA_RULES (`retain`, horizon 2555, GDPR 17(3)(b)) rather
        // than in this comment. It stayed here for months as a real decision
        // written where nothing could enforce it: no basis the census checks,
        // no horizon anybody was ever asked for, so "auditable forever" was
        // the silent default. Declared 2026-08-07 (owner ruling).
      },
    });

    this.logger.info('Account purged', { userId: user.userId });
  }
}
