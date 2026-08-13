import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * THE HEARING LEDGER — the durable half of the one hearing abstraction
 * (H5, 2026-08-12). It stores decisions; it decides nothing.
 *
 * Every lane writes here BEFORE it touches the corpus (amendment (c)). That
 * ordering is the whole reason this is a table and not a return value: a
 * hearing costs a real LLM call, and a process that dies after the answer
 * arrives but before the rows are written has burned money to learn something
 * it then forgot. Verdict first, effect second, `executedAt` last — so a
 * crash leaves work to FINISH rather than an answer to buy again, and the
 * corpus can never carry a mutation whose stated ground was lost.
 */

/** The verdict as a lane states it. `reason` is not optional anywhere. */
export interface ClaimVerdictInput<TSubject = unknown> {
  lane: string;
  claimKey: string;
  ruleVersion: number;
  outcome: string;
  /** The judge's stated ground. Empty is rejected here AND by a CHECK. */
  reason: string;
  ruleFingerprint?: string | null;
  /** Everything the lane needs to RESUME the effect after a crash. */
  subject: TSubject;
}

export interface PendingVerdict<TSubject = unknown> {
  lane: string;
  claimKey: string;
  ruleVersion: number;
  outcome: string;
  reason: string;
  subject: TSubject;
  decidedAt: Date;
}

/**
 * A verdict with no stated ground is not a verdict. Thrown BEFORE the write,
 * so the caller sees the lane and claim that produced it rather than a
 * constraint violation naming only the table.
 */
export class VerdictReasonMissingError extends Error {
  constructor(lane: string, claimKey: string) {
    super(
      `${lane} tried to record a verdict for "${claimKey}" with no reason. ` +
        `A verdict states the rule that decided it (H5 amendment (d)) — an ` +
        `unauditable ruling may not enter the ledger.`,
    );
    this.name = 'VerdictReasonMissingError';
  }
}

@Injectable()
export class ClaimVerdictLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Commit a decision. Idempotent per (lane, claim, rule version): a re-run
   * that reaches the same case again REPLACES the decision and re-opens its
   * effect (`executed_at` back to NULL), because a decision recorded twice at
   * one rule version is one decision, and the newer one is the one whose
   * effect has not necessarily run.
   */
  async record<TSubject>(
    input: ClaimVerdictInput<TSubject>,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const reason = input.reason?.trim() ?? '';
    if (!reason) {
      throw new VerdictReasonMissingError(input.lane, input.claimKey);
    }
    const client = tx ?? this.prisma;
    await client.$executeRaw`
      INSERT INTO claim_verdicts
        (lane, claim_key, rule_version, outcome, reason, rule_fingerprint,
         subject, decided_at, executed_at)
      VALUES (${input.lane}, ${input.claimKey}, ${input.ruleVersion},
              ${input.outcome}, ${reason}, ${input.ruleFingerprint ?? null},
              ${JSON.stringify(input.subject)}::jsonb, now(), NULL)
      ON CONFLICT (lane, claim_key, rule_version) DO UPDATE
        SET outcome          = EXCLUDED.outcome,
            reason           = EXCLUDED.reason,
            rule_fingerprint = EXCLUDED.rule_fingerprint,
            subject          = EXCLUDED.subject,
            decided_at       = now(),
            executed_at      = NULL`;
  }

  /** The effect ran. Only now is the hearing finished. */
  async markExecuted(
    lane: string,
    claimKey: string,
    ruleVersion: number,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE claim_verdicts SET executed_at = now()
       WHERE lane = ${lane} AND claim_key = ${claimKey}
         AND rule_version = ${ruleVersion}`;
  }

  /**
   * DECIDED BUT NOT EXECUTED — the resume queue. Oldest first: a verdict that
   * has waited longest is the one whose corpus is most out of step with what
   * was actually ruled.
   */
  async pendingExecution<TSubject>(
    lane: string,
    limit = 500,
  ): Promise<Array<PendingVerdict<TSubject>>> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        claim_key: string;
        rule_version: number;
        outcome: string;
        reason: string;
        subject: TSubject;
        decided_at: Date;
      }>
    >`
      SELECT claim_key, rule_version, outcome, reason, subject, decided_at
        FROM claim_verdicts
       WHERE lane = ${lane} AND executed_at IS NULL
       ORDER BY decided_at ASC
       LIMIT ${limit}`;
    return rows.map((row) => ({
      lane,
      claimKey: row.claim_key,
      ruleVersion: row.rule_version,
      outcome: row.outcome,
      reason: row.reason,
      subject: row.subject,
      decidedAt: row.decided_at,
    }));
  }

  /**
   * Which of these claims already have a verdict at this rule version — the
   * due-predicate's negative half.
   *
   * THE COMPARISON IS `=`, NOT `>=` (the divergence H5 names). The label
   * sweep's watermark accepts any version at least as new, which makes a
   * ROLLBACK invisible: revert a rule because it was wrong, and every verdict
   * the wrong rule reached still counts as answered. A hearing is answered by
   * THE RULE IN FORCE, so moving to any other rule — forward or back — leaves
   * the question open again.
   */
  async decidedKeys(
    lane: string,
    ruleVersion: number,
    claimKeys: readonly string[],
  ): Promise<Set<string>> {
    if (!claimKeys.length) return new Set();
    const rows = await this.prisma.$queryRaw<Array<{ claim_key: string }>>`
      SELECT claim_key FROM claim_verdicts
       WHERE lane = ${lane} AND rule_version = ${ruleVersion}
         AND claim_key = ANY(${[...claimKeys]}::text[])`;
    return new Set(rows.map((row) => row.claim_key));
  }

  /** Every verdict this lane has recorded for one claim, newest rule first —
   *  the audit read: what was decided, under which rule, and why. */
  async historyOf(
    lane: string,
    claimKey: string,
  ): Promise<
    Array<{
      ruleVersion: number;
      outcome: string;
      reason: string;
      decidedAt: Date;
      executedAt: Date | null;
    }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{
        rule_version: number;
        outcome: string;
        reason: string;
        decided_at: Date;
        executed_at: Date | null;
      }>
    >`
      SELECT rule_version, outcome, reason, decided_at, executed_at
        FROM claim_verdicts
       WHERE lane = ${lane} AND claim_key = ${claimKey}
       ORDER BY rule_version DESC`;
    return rows.map((row) => ({
      ruleVersion: row.rule_version,
      outcome: row.outcome,
      reason: row.reason,
      decidedAt: row.decided_at,
      executedAt: row.executed_at,
    }));
  }
}
