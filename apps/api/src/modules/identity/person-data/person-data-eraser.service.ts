import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { PERSON_DATA_RULES, type PersonDataRule } from './person-data-class';
import { ruleWhere, subjectRows } from './person-data-scope';

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

  /**
   * ONE STATEMENT PER RULE, scoped by the compiler.
   *
   * This method used to derive its own scope, differently per disposition —
   * `delete_row` and `sever` by their own column, `null_column` by
   * personScopeSql-or-a-sibling. Three derivations, three chances to drift
   * from the declaration, and every erasure defect found lived in one of them.
   * The scope is now `ruleWhere`'s answer — itself a thin reading of the
   * table's person scope — shared with the exporter and the proofs, so a
   * disagreement is impossible rather than merely unlikely.
   */
  private async applyRule(
    rule: PersonDataRule,
    userId: string,
  ): Promise<number> {
    const where = ruleWhere(rule);

    switch (rule.disposition) {
      case 'delete_row':
        // null = classify-only column on a table whose key is declared
        // elsewhere. Nothing to do — NEVER "no filter".
        if (!where) return 0;
        return this.prisma.$executeRawUnsafe(
          `DELETE FROM "${rule.table}" WHERE ${where}`,
          userId,
        );

      case 'sever':
        // The census proves this column is nullable, so the UPDATE is valid.
        if (!where) return 0;
        return this.prisma.$executeRawUnsafe(
          `UPDATE "${rule.table}" SET "${rule.column}" = NULL WHERE ${where}`,
          userId,
        );

      case 'null_column': {
        // The value to destroy is NOT the person key, so the person is reached
        // either by the rule's own declared scope or by the table's key.
        const scope =
          rule.personScopeSql ??
          subjectRows(rule.table, { includeRetained: false });
        if (!scope) {
          throw new Error(
            `null_column on ${rule.table}.${rule.column} has no personScopeSql ` +
              `and the table declares no person key to scope by`,
          );
        }
        const predicate = rule.rowPredicate
          ? ` AND (${rule.rowPredicate})`
          : '';
        return this.prisma.$executeRawUnsafe(
          `UPDATE "${rule.table}" SET "${rule.column}" = NULL WHERE (${scope})${predicate}`,
          userId,
        );
      }

      case 'retain':
      case 'not_person':
      case 'anonymized_by_shell':
        return 0;
    }
  }
}
