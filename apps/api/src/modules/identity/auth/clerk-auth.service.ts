import { isEnvFlagEnabled } from '../../../shared/config/env-flag';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient, verifyToken } from '@clerk/clerk-sdk-node';

export interface ClerkUserIdentity {
  email?: string;
  displayName?: string;
  avatarUrl?: string;
}

const DEV_PERF_SCENARIO_AUTH_TOKEN = 'crave-dev-perf-scenario';

export interface ClerkJwtClaims {
  sub?: string;
  sid?: string;
  aud?: string | string[];
  email?: string;
  email_address?: string;
  email_addresses?: Array<{ email_address?: string }>;
  // Profile claims (only present if the Clerk JWT template exposes them).
  name?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  given_name?: string;
  family_name?: string;
  username?: string;
  image_url?: string;
  picture?: string;
  [key: string]: unknown;
}

/**
 * CLERK_JWT_AUDIENCE is a comma-separated list. One spelling.
 *
 * This replaced a 77-line recursive parser that accepted arrays, JSON arrays,
 * single- and double-quoted strings, numbers, bigints, booleans and objects.
 * Breadth like that is not robustness — it is a decision about the env var's
 * format deferred forever, and its bulk hid the branch that mattered (an
 * UNSET value silently disabling the check).
 */
export function parseAudienceList(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** RFC 7519: `aud` is a string or an array of strings. Nothing else is a
 *  valid audience claim, so nothing else is accepted. */
export function normalizeAudienceClaim(claim?: unknown): string[] {
  const raw = Array.isArray(claim) ? claim : [claim];
  return raw
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

@Injectable()
export class ClerkAuthService {
  private readonly logger = new Logger(ClerkAuthService.name);
  private readonly secretKey?: string;
  private readonly audience: string[];
  private clerkClient?: ReturnType<typeof createClerkClient>;

  constructor(private readonly configService: ConfigService) {
    this.secretKey =
      this.configService.get<string>('clerk.secretKey') || undefined;
    this.audience = parseAudienceList(
      this.configService.get<string>('clerk.jwtAudience'),
    );

    if (this.audience.length > 0) {
      this.logger.log(
        `Clerk JWT audience: ${JSON.stringify(this.audience)} (validated on every token)`,
      );
      return;
    }

    // ABSENCE OF CONFIGURATION MUST NEVER GRANT ACCESS — the law this same
    // file states for the dev perf token, and used to violate right here.
    //
    // The old shape logged a warning and SKIPPED audience validation
    // entirely. A deployed box that never got CLERK_JWT_AUDIENCE therefore
    // accepted tokens minted for any audience, and the only trace was one
    // startup line nobody reads. An unconfigured check is an UNKNOWN, not a
    // pass.
    //
    // In a deployed environment the fact is known at boot, so we refuse at
    // boot — the loud version of the same truth. Locally we still boot (a
    // script that never verifies a token should not need auth config), but
    // verifyToken() refuses every token, so nothing can quietly authenticate.
    const appEnv = this.configService.get<string>('appEnv');
    if (appEnv && appEnv !== 'dev') {
      throw new Error(
        `CLERK_JWT_AUDIENCE is not configured (APP_ENV=${appEnv}). ` +
          `Without it, audience validation cannot run and a token minted ` +
          `for any other audience would be accepted. Set it — do not ` +
          `delete this check.`,
      );
    }
    this.logger.warn(
      'CLERK_JWT_AUDIENCE is not configured; every token will be REFUSED ' +
        '(absence of configuration must never grant access).',
    );
  }

  extractBearerToken(header?: string): string | undefined {
    if (!header) return undefined;
    const [type, token] = header.split(' ');
    if (type?.toLowerCase() !== 'bearer' || !token) {
      return undefined;
    }
    return token;
  }

  async verifyToken(token?: string): Promise<ClerkJwtClaims> {
    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }
    if (this.isDevPerfScenarioToken(token)) {
      return {
        sub: 'dev_perf_scenario_user',
        email: 'perf-scenario@crave-search.local',
      };
    }
    if (!this.secretKey) {
      throw new UnauthorizedException('Clerk secret key is not configured');
    }
    if (this.audience.length === 0) {
      // Refuse, never skip. See the constructor.
      throw new UnauthorizedException(
        'Clerk JWT audience is not configured — cannot validate this token',
      );
    }

    try {
      const verified = (await verifyToken(token, {
        secretKey: this.secretKey,
      })) as ClerkJwtClaims;

      const tokenAudiences = normalizeAudienceClaim(verified.aud);
      const hasMatch = tokenAudiences.some((claim) =>
        this.audience.includes(claim),
      );
      if (!hasMatch) {
        throw new UnauthorizedException(
          `Invalid Clerk token: audience ${JSON.stringify(
            tokenAudiences,
          )} is not in ${JSON.stringify(this.audience)}`,
        );
      }

      return verified;
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      throw new UnauthorizedException(`Invalid Clerk token: ${reason}`);
    }
  }

  /**
   * Fetch a user's identity from Clerk's authoritative record. Used as a
   * gap-filler when the session JWT doesn't carry usable profile claims (e.g. the
   * dashboard template omits or misconfigures them), so identity sync doesn't
   * silently depend on template configuration. Returns undefined when no secret
   * key is configured or the lookup fails — callers degrade gracefully.
   */
  async fetchUserIdentity(
    authId: string,
  ): Promise<ClerkUserIdentity | undefined> {
    const client = this.getClerkClient();
    if (!client) {
      return undefined;
    }
    try {
      const user = await client.users.getUser(authId);
      const email =
        user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId)
          ?.emailAddress ??
        user.emailAddresses[0]?.emailAddress ??
        undefined;
      const fullName = [user.firstName, user.lastName]
        .filter((part): part is string => Boolean(part))
        .join(' ')
        .trim();
      const displayName = fullName || user.username || undefined;
      const avatarUrl = user.imageUrl || undefined;
      return { email, displayName, avatarUrl };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      this.logger.warn(`Failed to fetch Clerk user ${authId}: ${reason}`);
      return undefined;
    }
  }

  /** Permanently delete the Clerk user (account deletion, Apple 5.1.1(v)).
   *  Throws on failure — the caller must NOT proceed with local anonymization
   *  if the auth identity still exists. A 404 (already deleted) is success. */
  async deleteClerkUser(authId: string): Promise<void> {
    const client = this.getClerkClient();
    if (!client) {
      throw new Error('Clerk is not configured — cannot delete auth user');
    }
    try {
      await client.users.deleteUser(authId);
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 404) {
        this.logger.warn(`Clerk user ${authId} already deleted`);
        return;
      }
      throw error;
    }
  }

  /**
   * Revoke every live session WITHOUT destroying the account.
   *
   * This is what a RECOVERABLE deletion needs: the person is signed out
   * everywhere and stays signed out, but the identity still exists, so signing
   * in during the grace window restores them. Destroying the Clerk user is the
   * purge's job, at the deadline — not the request's.
   *
   * Best-effort per session and overall: being unable to revoke one session
   * must not block a legally-required deletion request. The account is marked
   * deleted locally either way, and every authenticated route refuses a
   * deleted user, so a surviving Clerk session cannot reach anything.
   */
  async revokeAllSessions(authId: string): Promise<{ revoked: number }> {
    const client = this.getClerkClient();
    if (!client) {
      throw new Error('Clerk is not configured — cannot revoke sessions');
    }
    const sessions = await client.sessions.getSessionList({ userId: authId });
    const list = Array.isArray(sessions) ? sessions : (sessions?.data ?? []);
    let revoked = 0;
    for (const session of list) {
      try {
        await client.sessions.revokeSession(session.id);
        revoked += 1;
      } catch (error) {
        this.logger.warn(
          `Failed to revoke Clerk session ${session.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return { revoked };
  }

  private getClerkClient(): ReturnType<typeof createClerkClient> | undefined {
    if (!this.secretKey) {
      return undefined;
    }
    if (!this.clerkClient) {
      this.clerkClient = createClerkClient({ secretKey: this.secretKey });
    }
    return this.clerkClient;
  }

  /**
   * A hard-coded bearer token that authenticates as a real user. Its value is
   * in this repository, so anywhere it is live, ANYONE can call every
   * authenticated endpoint.
   *
   * It is gated on an EXPLICIT OPT-IN (audit 2026-08-01), not merely on "we
   * don't look like prod". The old NODE_ENV/appEnv test failed open: any
   * deployed environment that forgot to set both variables the way this
   * function expects — a staging box, a preview deploy, a container whose
   * NODE_ENV was never set at all — silently accepted a published password.
   * Absence of configuration must never grant access.
   */
  private isDevPerfScenarioToken(token: string): boolean {
    if (token !== DEV_PERF_SCENARIO_AUTH_TOKEN) {
      return false;
    }
    if (!isEnvFlagEnabled(process.env.ENABLE_DEV_PERF_SCENARIO_AUTH)) {
      return false;
    }
    return (
      process.env.NODE_ENV !== 'production' &&
      this.configService.get<string>('appEnv') !== 'prod'
    );
  }
}
