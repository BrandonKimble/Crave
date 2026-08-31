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
  /** The lane adapter's `keyFoldVersion` — which fold SPELLED `claimKey`. */
  foldVersion: number;
  outcome: string;
  /** The judge's stated ground. Empty is rejected here AND by a CHECK. */
  reason: string;
  ruleFingerprint?: string | null;
  /** Everything the lane needs to RESUME the effect after a crash. */
  subject: TSubject;
  /** WHO BOUGHT THE HEARING — see ClaimVerdict.source. Defaults to the
   *  unattended rail, because that is the spend that must be metered; a lane
   *  that forgets to say it is running a bulk drain gets charged, which is the
   *  safe direction to be wrong in. */
  source?: HearingSource;
}

/**
 * The two ways a hearing gets bought, and the ONLY distinction the rolling
 * allowance draws (A3, 2026-08-15).
 *
 * 'steady' is unattended: a maintenance drain nobody is watching, which is
 * exactly what a standing budget exists to bound. 'certification' is an
 * operator running a named drain, already bounded by the approve-by-hash law
 * — charging it against the unattended window meant one bulk run left the
 * trickle refused for as long as the window remembered it, which is how
 * 97,400 hearings came to sit in front of a 200-hearing allowance.
 */
export type HearingSource =
  | 'steady'
  | 'certification'
  // REHEARSAL GENERATION (plans/shadow-sandbox.md door 7): a verdict bought
  // during a non-activated replay. Remembered only by its own run
  // (decidedVerdicts' rehearsal scope); flipped to 'steady' at activation,
  // deleted on rejection — a rehearsal's judgments never steer live
  // resolution.
  | `rehearsal:${string}`;

export interface PendingVerdict<TSubject = unknown> {
  lane: string;
  claimKey: string;
  ruleVersion: number;
  foldVersion: number;
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
   * Commit a decision.
   *
   * A RE-DECISION THAT SAYS THE SAME THING IS NOT AN EVENT (2026-08-13). This
   * clause used to reset `decided_at` and `executed_at` unconditionally, on
   * the reasoning that "the newer decision is the one whose effect has not
   * necessarily run". That is true of a decision that CHANGED, and false —
   * dangerously — of an identical one: re-recording the same verdict marked a
   * finished hearing as unexecuted, and the resume queue then re-ran an effect
   * the corpus had already obeyed. Nothing needed to crash for that to happen;
   * any second pass over an already-decided claim did it (the label sweep's
   * appeal docket, run twice in one night, was the live path).
   *
   * So the write is conditioned on the decision actually differing. An
   * identical re-decision touches NO bytes — same row, same `decided_at`, same
   * `executed_at` — and a genuinely different one supersedes the old verdict
   * and re-opens its effect, which is the case the original clause was for.
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
        (lane, claim_key, rule_version, fold_version, outcome, reason,
         rule_fingerprint, subject, source, decided_at, executed_at)
      VALUES (${input.lane}, ${input.claimKey}, ${input.ruleVersion},
              ${input.foldVersion},
              ${input.outcome}, ${reason}, ${input.ruleFingerprint ?? null},
              ${JSON.stringify(input.subject)}::jsonb,
              ${input.source ?? 'steady'}, now(), NULL)
      ON CONFLICT (lane, claim_key, rule_version, fold_version) DO UPDATE
        SET outcome          = EXCLUDED.outcome,
            reason           = EXCLUDED.reason,
            rule_fingerprint = EXCLUDED.rule_fingerprint,
            subject          = EXCLUDED.subject,
            source           = EXCLUDED.source,
            decided_at       = now(),
            executed_at      = NULL
      WHERE (claim_verdicts.outcome, claim_verdicts.reason,
             claim_verdicts.rule_fingerprint, claim_verdicts.subject)
            IS DISTINCT FROM
            (EXCLUDED.outcome, EXCLUDED.reason,
             EXCLUDED.rule_fingerprint, EXCLUDED.subject)`;
  }

  /** The effect ran. Only now is the hearing finished. */
  async markExecuted(
    lane: string,
    claimKey: string,
    ruleVersion: number,
    foldVersion: number,
  ): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE claim_verdicts SET executed_at = now()
       WHERE lane = ${lane} AND claim_key = ${claimKey}
         AND rule_version = ${ruleVersion}
         AND fold_version = ${foldVersion}
         AND executed_at IS NULL`;
  }

  /**
   * DECIDED BUT NOT EXECUTED — the resume queue. Oldest first: a verdict that
   * has waited longest is the one whose corpus is most out of step with what
   * was actually ruled.
   *
   * ONLY THE RULE IN FORCE GETS ITS ORDERS DELIVERED (audit 2026-08-31).
   * This used to return pending verdicts at ANY rule/fold version — so a
   * doctrine bump left the superseded era's undelivered plans live, and the
   * next nightly executed them under a rule that had already been judged
   * wrong (two v4-era merges from the discredited 08-30 sweep were sitting
   * armed exactly this way). The `=` law the due-predicate states applies
   * here with the same force: a hearing is answered — and an effect owed —
   * by THE RULE IN FORCE. A superseded pending verdict is not work to
   * finish; it is an open question the current-rule drain re-hears. The
   * versions are required (no defaults) so no lane can forget to say which
   * rule it is executing for.
   */
  async pendingExecution<TSubject>(
    lane: string,
    ruleVersion: number,
    foldVersion: number,
    limit = 500,
  ): Promise<Array<PendingVerdict<TSubject>>> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        claim_key: string;
        rule_version: number;
        fold_version: number;
        outcome: string;
        reason: string;
        subject: TSubject;
        decided_at: Date;
      }>
    >`
      SELECT claim_key, rule_version, fold_version, outcome, reason, subject,
             decided_at
        FROM claim_verdicts
       WHERE lane = ${lane} AND executed_at IS NULL
         AND rule_version = ${ruleVersion} AND fold_version = ${foldVersion}
       ORDER BY decided_at ASC
       LIMIT ${limit}`;
    return rows.map((row) => ({
      lane,
      claimKey: row.claim_key,
      ruleVersion: row.rule_version,
      foldVersion: row.fold_version,
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
   *
   * THE FOLD IS MATCHED THE SAME WAY, and for the same reason: a key spelled
   * by a different fold is a different claim identity, so a verdict carrying
   * it does not answer this question either.
   */
  async decidedKeys(
    lane: string,
    ruleVersion: number,
    foldVersion: number,
    claimKeys: readonly string[],
  ): Promise<Set<string>> {
    if (!claimKeys.length) return new Set();
    const rows = await this.prisma.$queryRaw<Array<{ claim_key: string }>>`
      SELECT claim_key FROM claim_verdicts
       WHERE lane = ${lane} AND rule_version = ${ruleVersion}
         AND fold_version = ${foldVersion}
         AND claim_key = ANY(${[...claimKeys]}::text[])`;
    return new Set(rows.map((row) => row.claim_key));
  }

  /**
   * The decided verdicts THEMSELVES for these claims at the rule and fold in
   * force — `decidedKeys` with the outcome attached (2026-08-13, built for
   * the resolution-match and place-grounding lanes).
   *
   * Those lanes cannot act on bare membership: a remembered 'match' resolves
   * the term to its candidate on the spot, while a remembered 'new' merely
   * removes that candidate from the docket — the SAME set-membership answer
   * orders two different behaviours, so the caller has to see what was
   * decided, not only that something was. Same `=` version discipline as
   * `decidedKeys`, for the same rollback reason.
   */
  /** BENCH PROBE READ (plans/iteration-bench.md S2): a random sample of a
   *  lane's OUTDATED verdicts — the population a rule bump made non-
   *  reusable — for compare-only re-asking. Read-only by construction. */
  async sampleOutdated(
    lane: string,
    currentVersion: number,
    limit: number,
  ): Promise<Array<{ claimKey: string; outcome: string; subject: unknown }>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ claim_key: string; outcome: string; subject: unknown }>
    >`
      SELECT claim_key, outcome, subject FROM claim_verdicts
      WHERE lane = ${lane} AND rule_version < ${currentVersion}
      ORDER BY random() LIMIT ${limit}`;
    return rows.map((row) => ({
      claimKey: row.claim_key,
      outcome: row.outcome,
      subject: row.subject,
    }));
  }

  async decidedVerdicts(
    lane: string,
    ruleVersion: number,
    foldVersion: number,
    claimKeys: readonly string[],
    options?: {
      /** Rehearsal self-visibility (plans/shadow-sandbox.md): remember
       *  steady + THIS run's rehearsal verdicts; never another run's. Live
       *  callers omit it and see no rehearsal verdicts at all. */
      rehearsalRunId?: string | null;
    },
  ): Promise<Map<string, { outcome: string; reason: string }>> {
    if (!claimKeys.length) return new Map();
    const rehearsalSource = options?.rehearsalRunId
      ? `rehearsal:${options.rehearsalRunId}`
      : null;
    const rows = await this.prisma.$queryRaw<
      Array<{ claim_key: string; outcome: string; reason: string }>
    >`
      SELECT claim_key, outcome, reason FROM claim_verdicts
       WHERE lane = ${lane} AND rule_version = ${ruleVersion}
         AND fold_version = ${foldVersion}
         AND (source NOT LIKE 'rehearsal:%'
              OR source = ${rehearsalSource ?? ''})
         AND claim_key = ANY(${[...claimKeys]}::text[])`;
    return new Map(
      rows.map((row) => [
        row.claim_key,
        { outcome: row.outcome, reason: row.reason },
      ]),
    );
  }

  /**
   * HEARINGS ACTUALLY BOUGHT in a trailing window — one row is one word
   * judged, counted (A2, 2026-08-15).
   *
   * This replaces "billed LLM calls x the lane's nominal claims-per-call",
   * which was a rate-free number only in appearance: `claimsPerCall` is the
   * batch SIZE, not the batch FILL, so a maintenance drain hearing three new
   * words was metered as forty and the steady trickle over-reported itself
   * 40x. The verdict rows are the exact answer and they cost nothing to count
   * — the table already indexes (lane, source, decided_at) for it.
   */
  async hearingsBoughtSince(
    lane: string,
    source: HearingSource,
    windowHours: number,
  ): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ hearings: bigint }>>`
      SELECT count(*) AS hearings FROM claim_verdicts
       WHERE lane = ${lane} AND source = ${source}
         AND decided_at > now() - make_interval(hours => ${windowHours}::int)`;
    return Number(rows[0]?.hearings ?? 0);
  }

  /**
   * HEARINGS A METER'S SPEND BOUGHT, across lanes and across sources — the
   * RATE's divisor (M2, 2026-08-19), where `hearingsBoughtSince` above is the
   * ALLOWANCE's. The rate is spend ÷ what it bought, and a co-batched call
   * buys verdict rows on several lanes at once; filtering by source here
   * would divide all of the window's spend by only some of its rows and
   * inflate the quote.
   */
  async hearingsRecordedSince(
    lanes: readonly string[],
    windowHours: number,
  ): Promise<number> {
    if (!lanes.length) return 0;
    const rows = await this.prisma.$queryRaw<Array<{ hearings: bigint }>>`
      SELECT count(*) AS hearings FROM claim_verdicts
       WHERE lane = ANY(${[...lanes]}::text[])
         AND decided_at > now() - make_interval(hours => ${windowHours}::int)`;
    return Number(rows[0]?.hearings ?? 0);
  }

  /**
   * The newest decision timestamp across these lanes — the CHEAP VERSION
   * STAMP a read cache polls to notice that another process ruled something
   * (A6, 2026-08-15). Null when the lanes hold no verdicts at all.
   */
  async latestDecidedAt(lanes: readonly string[]): Promise<Date | null> {
    if (!lanes.length) return null;
    const rows = await this.prisma.$queryRaw<Array<{ latest: Date | null }>>`
      SELECT max(decided_at) AS latest
        FROM claim_verdicts
       WHERE lane = ANY(${[...lanes]}::text[])`;
    return rows[0]?.latest ?? null;
  }

  /**
   * WHAT A RULE BUMP ACTUALLY FLIPPED (D4, 2026-08-15) — every claim decided
   * under BOTH versions whose outcome differs, plus the counts on each side.
   *
   * A rule bump is one line in a source file and it re-decides a whole
   * corpus; the v2→v3 negation bump flipped 24 words and nobody ever saw the
   * list. A diff nobody is shown is a review that did not happen, so the
   * certify script prints this as a mandatory artefact.
   */
  async outcomeDiff(
    lane: string,
    fromVersion: number,
    toVersion: number,
    foldVersion: number,
  ): Promise<{
    flipped: Array<{
      claimKey: string;
      from: string;
      to: string;
      reason: string;
    }>;
    comparedClaims: number;
    onlyInTo: number;
  }> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        claim_key: string;
        from_outcome: string | null;
        to_outcome: string;
        reason: string;
      }>
    >`
      SELECT n.claim_key,
             o.outcome AS from_outcome,
             n.outcome AS to_outcome,
             n.reason
        FROM claim_verdicts n
        LEFT JOIN claim_verdicts o
          ON o.lane = n.lane AND o.claim_key = n.claim_key
         AND o.fold_version = n.fold_version
         AND o.rule_version = ${fromVersion}
       WHERE n.lane = ${lane} AND n.rule_version = ${toVersion}
         AND n.fold_version = ${foldVersion}`;
    const flipped: Array<{
      claimKey: string;
      from: string;
      to: string;
      reason: string;
    }> = [];
    let comparedClaims = 0;
    let onlyInTo = 0;
    for (const row of rows) {
      if (row.from_outcome == null) {
        onlyInTo += 1;
        continue;
      }
      comparedClaims += 1;
      if (row.from_outcome === row.to_outcome) continue;
      flipped.push({
        claimKey: row.claim_key,
        from: row.from_outcome,
        to: row.to_outcome,
        reason: row.reason,
      });
    }
    flipped.sort((a, b) => a.claimKey.localeCompare(b.claimKey));
    return { flipped, comparedClaims, onlyInTo };
  }

  /** Every verdict this lane has recorded for one claim, newest rule first —
   *  the audit read: what was decided, under which rule, and why. */
  async historyOf(
    lane: string,
    claimKey: string,
  ): Promise<
    Array<{
      ruleVersion: number;
      foldVersion: number;
      outcome: string;
      reason: string;
      decidedAt: Date;
      executedAt: Date | null;
    }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{
        rule_version: number;
        fold_version: number;
        outcome: string;
        reason: string;
        decided_at: Date;
        executed_at: Date | null;
      }>
    >`
      SELECT rule_version, fold_version, outcome, reason, decided_at,
             executed_at
        FROM claim_verdicts
       WHERE lane = ${lane} AND claim_key = ${claimKey}
       ORDER BY rule_version DESC, fold_version DESC`;
    return rows.map((row) => ({
      ruleVersion: row.rule_version,
      foldVersion: row.fold_version,
      outcome: row.outcome,
      reason: row.reason,
      decidedAt: row.decided_at,
      executedAt: row.executed_at,
    }));
  }
}
