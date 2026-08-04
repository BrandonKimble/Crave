import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { PERSON_DATA_RULES, type PersonDataRule } from './person-data-class';

export interface ErasureReport {
  userId: string;
  /** table.column -> rows affected, for the completion record. */
  applied: Record<string, number>;
  skipped: string[];
}

/**
 * DELETION AS A DERIVATION, NOT A PROCEDURE.
 *
 * The predecessor was a hand-ordered list of `deleteMany`/`update` calls. Its
 * defining property: when a table was added, NOTHING happened. No test failed,
 * no build broke — the table was simply never deleted, forever, silently. That
 * is not hypothetical here. It is why private saved lists, raw typed search
 * text (`residue_text`), and device fingerprints all survived deletion while
 * the service looked complete and its specs were green.
 *
 * This walks `PERSON_DATA_RULES` instead. A new person-shaped column fails the
 * census build until it is classified; once classified, erasure handles it BY
 * CONSTRUCTION. Nobody has to remember to add a call.
 *
 * WHAT STAYS HAND-WRITTEN, deliberately: the cross-system side effects
 * (Stripe cancellation, the Clerk user delete, the Cloudinary avatar destroy).
 * Their ORDERING is load-bearing and reasoned — Stripe first because a billing
 * hiccup must not block a legally-required deletion; Clerk before any local
 * mutation so a failure is a clean retry. Deriving those would trade real
 * safety for uniformity. The rule is: derive everything INSIDE the database,
 * hand-write everything outside it.
 */
@Injectable()
export class PersonDataEraserService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PersonDataEraser');
  }

  /**
   * THE INVARIANT `anonymized_by_shell` RELIES ON.
   *
   * Columns classified `anonymized_by_shell` (photos, poll comments,
   * endorsements, DMs, reports) keep pointing at the departing person's own
   * `users` row. That is only anonymous if the shell really was stripped. If
   * the anonymize step ever regressed, those columns would quietly become
   * identified again — so this asserts it rather than assuming it.
   */
  async assertShellIsAnonymous(userId: string): Promise<void> {
    const shell = await this.prisma.user.findUnique({
      where: { userId },
      select: {
        username: true,
        displayName: true,
        avatarUrl: true,
        authProviderUserId: true,
      },
    });
    if (!shell) return; // hard-deleted entirely; nothing points at identity
    const leaks = Object.entries(shell)
      .filter(([, value]) => value != null)
      .map(([key]) => key);
    if (leaks.length > 0) {
      throw new Error(
        `PERSON DATA: shell for ${userId} still carries identity (${leaks.join(', ')}) — ` +
          'every `anonymized_by_shell` column is relying on it being empty.',
      );
    }
  }

  /**
   * Erase one person's data according to the declaration. Idempotent: every
   * statement is keyed on the person, so a replay after a partial failure is
   * safe (and is the documented recovery path).
   */
  async erase(userId: string): Promise<ErasureReport> {
    const applied: Record<string, number> = {};
    const skipped: string[] = [];

    // ORDER IS LOAD-BEARING and derived from the data, not from taste:
    //  1. delete_row  — removing a row makes its column rules moot, and doing
    //     it later would update rows we are about to destroy.
    //  2. null_column — MUST precede sever. `signals.subject_text` reaches its
    //     person only through `signal_actors.user_id`; sever nulls exactly
    //     that mapping, so severing first would orphan the raw text forever
    //     with no way left to find it.
    //  3. sever       — last, once nothing else needs the person link.
    const ordered = [
      ...PERSON_DATA_RULES.filter((r) => r.disposition === 'delete_row'),
      ...PERSON_DATA_RULES.filter((r) => r.disposition === 'null_column'),
      ...PERSON_DATA_RULES.filter((r) => r.disposition === 'sever'),
    ];

    for (const rule of ordered) {
      const key = `${rule.table}.${rule.column}`;
      try {
        const count = await this.applyRule(rule, userId);
        if (count > 0) applied[key] = (applied[key] ?? 0) + count;
      } catch (error) {
        // Fail LOUD per rule rather than aborting the sweep: a single
        // unexpected constraint must not leave the remaining 30 rules
        // unapplied. The throw at the end makes the failure non-silent.
        this.logger.error('PERSON DATA: rule failed', {
          userId,
          rule: key,
          disposition: rule.disposition,
          error: error instanceof Error ? error.message : String(error),
        });
        skipped.push(key);
      }
    }

    if (skipped.length > 0) {
      throw new Error(
        `PERSON DATA: erasure incomplete for ${userId}; unapplied: ${skipped.join(', ')}`,
      );
    }
    return { userId, applied, skipped };
  }

  private async applyRule(
    rule: PersonDataRule,
    userId: string,
  ): Promise<number> {
    const table = Prisma.raw(`"${rule.table}"`);
    const column = Prisma.raw(`"${rule.column}"`);
    const predicate = rule.rowPredicate
      ? Prisma.raw(` AND (${rule.rowPredicate})`)
      : Prisma.empty;

    switch (rule.disposition) {
      // NOTE the `::text` on BOTH sides. The person key is not one physical
      // type across this schema — `poll_creation_attempts.user_id` is `text`,
      // `notification_devices.user_id` is `varchar(255)`, everything else is
      // `uuid`. A hardcoded `$1::uuid` crashes with "operator does not exist:
      // text = uuid" on exactly the two tables holding a device fingerprint
      // and a raw attempt log. Found by the live erasure proof, not by review.
      case 'delete_row':
        return this.prisma.$executeRaw`
          DELETE FROM ${table} WHERE ${column}::text = ${userId} ${predicate}`;

      case 'sever':
        // The census proves this column is nullable, so the UPDATE is valid.
        return this.prisma.$executeRaw`
          UPDATE ${table} SET ${column} = NULL
          WHERE ${column}::text = ${userId} ${predicate}`;

      case 'null_column': {
        // The value to destroy is NOT the person key, so we need a way to
        // locate the person's rows. Either the table declares the join
        // (personScopeSql) or a sibling column names the person directly.
        if (rule.personScopeSql) {
          // $1 in the declared SQL is bound positionally to the user id.
          return this.prisma.$executeRawUnsafe(
            `UPDATE "${rule.table}" SET "${rule.column}" = NULL WHERE ${rule.personScopeSql}` +
              (rule.rowPredicate ? ` AND (${rule.rowPredicate})` : ''),
            userId,
          );
        }
        const personRule = PERSON_DATA_RULES.find(
          (r) =>
            r.table === rule.table &&
            r.column !== rule.column &&
            (r.disposition === 'sever' || r.disposition === 'delete_row'),
        );
        if (!personRule) {
          throw new Error(
            `null_column on ${rule.table}.${rule.column} has no personScopeSql and no sibling person column to scope by`,
          );
        }
        const scopeColumn = Prisma.raw(`"${personRule.column}"`);
        return this.prisma.$executeRaw`
          UPDATE ${table} SET ${column} = NULL
          WHERE ${scopeColumn}::text = ${userId} ${predicate}`;
      }

      case 'retain':
      case 'not_person':
      case 'anonymized_by_shell':
        return 0;
    }
  }
}
