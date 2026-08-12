import { Injectable, Optional, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import {
  pinConnectionLimit,
  pinSessionTimeZoneUtc,
} from '../../prisma/datasource-url';
import { LoggerService } from '../logging/logger.interface';

/**
 * THE ONE WAY TO HOLD A pg ADVISORY LOCK IN THIS CODEBASE.
 *
 * WHY THIS EXISTS (red-team A0 R1, 2026-08-11 — BLOCKING, measured).
 * `pg_try_advisory_lock` is SESSION-scoped: the lock belongs to the exact
 * Postgres backend that took it, and only that backend can release it. Four
 * services took theirs through the shared, POOLED PrismaService — so the
 * acquire landed on connection A and the release, one pool checkout later,
 * ran on connection B and released NOTHING. Under 8-way pool traffic the
 * measured failure rate was 25 of 25 round-trips.
 *
 * The consequence was not a slow lane, it was a DEAD one: the pool holds its
 * connections open forever (Prisma never shrinks; every server-side idle
 * timeout is 0 — see the 73-connection incident in prisma.service.ts), so the
 * stranded lock never "self-heals when the connection closes" the way each
 * site's comment promised. It strands for the life of the process, every
 * subsequent pass loses the try-lock, and `run()` returns its EMPTY_SUMMARY
 * zeros — a lane reporting "nothing to learn" forever while its ledger grows.
 *
 * THE FIX IS STRUCTURAL, NOT CAREFUL: a DEDICATED single-connection client,
 * held open for exactly the lock's lifetime. `connection_limit=1` means the
 * pool has one connection, so acquire and release are the same session BY
 * CONSTRUCTION — there is no pooling decision left for a caller to get wrong.
 * `$disconnect()` in the outermost finally closes that backend, which is
 * Postgres's own guarantee that the lock is gone even if the process is dying
 * mid-flight and the explicit unlock never runs.
 *
 * WHY NOT `pg_advisory_xact_lock` (the other strand-proof shape). A
 * transactional lock releases at COMMIT/ROLLBACK and cannot be stranded at
 * all, which is strictly better — WHEN the guarded work can live inside the
 * transaction. It cannot at any of the four call sites: every one of them
 * guards MINUTES-TO-HOURS of outbound work (LLM judge calls in the demand
 * sweep and the knowledge rail, governed TomTom draws in the promotion drain,
 * a full global rescore) whose whole purpose is to be interruptible and to
 * commit incrementally. Wrapping that in one transaction would hold an idle
 * transaction open across every network call, pin the oldest xmin against
 * autovacuum for the duration, and make a mid-pass crash roll back work that
 * is deliberately durable per item. So: dedicated session, not transaction —
 * and the dedicated session buys back the strand-proofing that the
 * transaction would have given for free.
 *
 * COST: one extra Postgres connection for the duration of a locked pass. All
 * four call sites are hourly-or-nightly single-runner jobs, so this is at
 * most a handful of connections, and only while a pass is actually running.
 */

/** The outcome of an attempted locked pass — `acquired` is explicit so a
 *  caller can never mistake "another process owns this" for "it ran". */
export type AdvisoryLockOutcome<T> =
  | { acquired: true; result: T }
  | { acquired: false };

@Injectable()
export class AdvisoryLockService {
  constructor(
    @Optional() @Inject(ConfigService) private readonly config?: ConfigService,
    @Optional() @Inject(LoggerService) private readonly logger?: LoggerService,
  ) {}

  /**
   * Run `fn` while holding the session advisory lock `key`, or report that
   * another process holds it. Never throws for lock reasons; `fn`'s own
   * errors propagate (after the lock is released).
   */
  async withAdvisoryLock<T>(
    key: number,
    fn: () => Promise<T>,
  ): Promise<AdvisoryLockOutcome<T>> {
    const client = this.createDedicatedClient();
    try {
      await client.$connect();
      const lock = await client.$queryRawUnsafe<Array<{ locked: boolean }>>(
        `SELECT pg_try_advisory_lock(${toLockKeyLiteral(key)}) AS locked`,
      );
      if (!lock[0]?.locked) {
        return { acquired: false };
      }
      try {
        return { acquired: true, result: await fn() };
      } finally {
        // Same session as the acquire — guaranteed, not hoped for. The
        // $disconnect below is the backstop for a crash between here and
        // there; a failure to unlock on a live session is a real anomaly and
        // is logged rather than swallowed.
        await client
          .$queryRawUnsafe(
            `SELECT pg_advisory_unlock(${toLockKeyLiteral(key)}) AS unlocked`,
          )
          .catch((error: unknown) => {
            this.logger?.warn?.(
              'Advisory unlock query failed; the dedicated session is closing, which releases it',
              {
                lockKey: key,
                error: {
                  message:
                    error instanceof Error ? error.message : String(error),
                },
              },
            );
          });
      }
    } finally {
      // Closing the backend releases every session lock it holds. This is why
      // a stranded lock is not reachable from this helper.
      await client.$disconnect().catch(() => undefined);
    }
  }

  /**
   * A client whose pool is exactly one connection, built from the same
   * datasource URL (and the same session pins) as the app's pooled client.
   */
  private createDedicatedClient(): PrismaClient {
    const url = pinConnectionLimit(
      pinSessionTimeZoneUtc(
        this.config?.get<string>('database.url') ||
          process.env.DATABASE_URL ||
          '',
      ),
      1,
    );
    return new PrismaClient({ datasources: { db: { url } } });
  }
}

/**
 * Advisory-lock keys are compile-time constants in this codebase (the four
 * 32-bit spellings 'crav'/'poly'/'vocb'/'know'), and `pg_try_advisory_lock`
 * has bigint and (int,int) overloads that a bound parameter cannot
 * disambiguate — Prisma binds a JS number as a value Postgres reads as
 * numeric, which resolves to neither. Inlining the literal is what the four
 * original call sites did too; this guard keeps that safe by refusing
 * anything that is not a plain integer, so the string can never carry a
 * caller's text into SQL.
 */
function toLockKeyLiteral(key: number): string {
  if (!Number.isSafeInteger(key)) {
    throw new Error(
      `Advisory lock key must be a safe integer (got ${String(key)})`,
    );
  }
  return `${key}`;
}
