import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { pricedGeminiRow } from '../../external-integrations/shared/gemini-pricing';

/**
 * THE RE-HEARING IS A QUERY; ITS DRAIN IS A SPEND EVENT (H5 amendment (b),
 * 2026-08-12).
 *
 * "Due = no verdict at the current rule version" is free to ask and cheap to
 * be wrong about. Draining it is neither: every claim in the answer is an LLM
 * call's worth of a batch, and the lever that fills it — a rule-version bump —
 * is one line in a source file. Bump the rule and the ENTIRE judged corpus
 * becomes due at once; without this, the next nightly would quietly start
 * paying to re-decide all of it, and the first person to notice would be
 * whoever reads the bill.
 *
 * So there are two ways to drain, and no third:
 *   - WITHIN THE STANDING ALLOWANCE, automatically. A nightly is allowed to
 *     keep up with the ordinary trickle — new inferred claims, the tail of a
 *     small bump — because a mechanism that needs a human for routine work is
 *     a mechanism that stops running. The allowance is a ROLLING WINDOW
 *     metered from this lane's own billed spend, so ten calls asking for the
 *     allowance ten times get the allowance ONCE.
 *   - BEYOND IT, only against an APPROVED ESTIMATE. The count is scanned (not
 *     sampled), priced from this caller's OWN metered spend, and hashed; the
 *     approver passes the hash back. A stale hash — the population moved, the
 *     rate moved — refuses, exactly as the campaign idiom refuses a stale
 *     manifest, because approving $40 and spending $400 is the failure this
 *     shape exists to prevent.
 *
 * WHY NO SpendCampaign ROW. The campaign machinery prices a unit against a
 * PUBLISHED rate (`spend_unit_cost`); no rate is published for a claim
 * hearing, and inventing one would be a number nobody measured. The rate here
 * is derived from `api_usage_ledger` rows tagged with this lane's own caller —
 * the same campaign-attributable-rate rule the re-extraction estimator was
 * corrected to follow after its first quote came out ~3x. When a hearing rate
 * is published, this becomes a campaign; the approve-by-hash law is already
 * the same.
 */

/**
 * The standing allowance, in HEARINGS — and it is a ROLLING WINDOW, not a
 * per-invocation ceiling (2026-08-13).
 *
 * It used to be checked per CALL: each `authorizeDrain` compared its own
 * batch against 200 and nothing remembered the last one, so a loop of small
 * drains — which is exactly the shape every caller has, batching ten claims
 * per LLM call — passed the gate an unlimited number of times and spent an
 * unlimited amount. The cap was a speed bump on ONE statement, not a budget.
 *
 * What is actually bounded is SPEND OVER TIME, so the gate meters what this
 * lane has ALREADY billed in the trailing window (`api_usage_ledger`, the
 * same chokepoint the rate comes from) and allows only the remainder. A
 * second invocation therefore sees the first one's cost, and a loop stops
 * itself.
 *
 * The number stays 200 hearings per window — the allowance already chosen and
 * shipped, sized to absorb ordinary drift rather than to work through a rule
 * bump. What changed is that it now means what it says.
 */
export const STANDING_REHEARING_CAP = 200;

/** The window the standing allowance is spread over. A day, because the
 *  nightly is the rail this allowance exists to keep running. */
export const STANDING_WINDOW_HOURS = 24;

/** The metered caller every word-claim hearing bills to. */
const JUDGE_CALLER = 'aliases.claim_judge';

/** Claims the adjudicator packs into one LLM call — the divisor that turns a
 *  measured cost-per-CALL into a cost-per-HEARING. */
const CLAIMS_PER_CALL = 10;

/** Days of metered spend the rate is measured over. */
const RATE_WINDOW_DAYS = 30;

export interface DrainEstimate {
  lane: string;
  ruleVersion: number;
  dueCount: number;
  microUsdPerHearing: number;
  estimateMicros: number;
  estimateHash: string;
}

/**
 * The drain was refused because it is larger than the standing cap and nobody
 * approved it. Carries the estimate, so the refusal IS the quote.
 */
export class DrainExceedsStandingCapError extends Error {
  constructor(
    readonly estimate: DrainEstimate,
    readonly cap: number,
    /** What the trailing window has left — the cap minus what this lane has
     *  already spent in it. Zero when the window is used up. */
    readonly remaining: number = cap,
  ) {
    super(
      `${estimate.dueCount} claims are due a hearing at rule v${estimate.ruleVersion}, ` +
        `which is beyond the ${remaining} hearing(s) left of the standing ` +
        `allowance (${cap} per ${STANDING_WINDOW_HOURS}h, rolling). Estimated cost: ` +
        `$${(estimate.estimateMicros / 1_000_000).toFixed(2)} ` +
        `(${estimate.dueCount} hearings x $${(estimate.microUsdPerHearing / 1_000_000).toFixed(4)}). ` +
        `Approve this exact estimate to drain it: --approve-drain ${estimate.estimateHash}`,
    );
    this.name = 'DrainExceedsStandingCapError';
  }
}

/** The approval names an estimate that no longer describes the work. */
export class StaleDrainApprovalError extends Error {
  constructor(
    readonly estimate: DrainEstimate,
    approved: string,
  ) {
    super(
      `The approved estimate ${approved} does not match the work now due ` +
        `(${estimate.estimateHash}: ${estimate.dueCount} hearings, ` +
        `$${(estimate.estimateMicros / 1_000_000).toFixed(2)}). The population or ` +
        `the measured rate moved since the quote — re-quote and approve again.`,
    );
    this.name = 'StaleDrainApprovalError';
  }
}

/**
 * No hearing has ever been metered, so there is no rate to quote with.
 * Deliberately NOT a default: a seeded prior is a number nobody measured, and
 * the cold-start rule here is act-then-measure — run a drain WITHIN the
 * standing cap, which needs no estimate, and it publishes the rate.
 */
export class NoMeasuredHearingRateError extends Error {
  constructor(windowDays: number) {
    super(
      `No '${JUDGE_CALLER}' spend is metered in the last ${windowDays} days, so a ` +
        `hearing has no measured price and a large drain cannot be quoted. Run a ` +
        `drain within the standing cap of ${STANDING_REHEARING_CAP} first — it needs ` +
        `no estimate and it measures the rate.`,
    );
    this.name = 'NoMeasuredHearingRateError';
  }
}

@Injectable()
export class ClaimRehearingBudgetService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * What one hearing costs, from this lane's own metered spend. Micro-USD.
   * Throws rather than guessing when nothing has been metered.
   */
  async microUsdPerHearing(): Promise<number> {
    const { micros, calls } = await this.meteredSpend(RATE_WINDOW_DAYS * 24);
    if (!calls) throw new NoMeasuredHearingRateError(RATE_WINDOW_DAYS);
    return micros / calls / CLAIMS_PER_CALL;
  }

  /** This lane's OWN billed spend over a trailing window, priced from the
   *  metering chokepoint. The one number both the rate and the rolling
   *  allowance are built from, so they can never disagree about what a
   *  hearing costs. */
  private async meteredSpend(
    windowHours: number,
  ): Promise<{ micros: number; calls: number }> {
    const rows = await this.prisma.$queryRaw<
      Array<{
        model: string | null;
        input_tokens: bigint | null;
        output_tokens: bigint | null;
        cached_tokens: bigint | null;
        calls: bigint;
      }>
    >`
      SELECT model,
             sum(input_tokens)  AS input_tokens,
             sum(output_tokens) AS output_tokens,
             sum(cached_tokens) AS cached_tokens,
             count(*)           AS calls
        FROM api_usage_ledger
       WHERE service = 'gemini' AND caller = ${JUDGE_CALLER}
         AND created_at > now() - make_interval(hours => ${windowHours}::int)
       GROUP BY model`;
    let micros = 0;
    let calls = 0;
    for (const row of rows) {
      micros += pricedGeminiRow({
        model: row.model ?? '',
        inputTokens: Number(row.input_tokens ?? 0),
        outputTokens: Number(row.output_tokens ?? 0),
        cachedTokens: Number(row.cached_tokens ?? 0),
      });
      calls += Number(row.calls);
    }
    return { micros, calls };
  }

  /**
   * HEARINGS ALREADY BOUGHT in the rolling window — what makes the allowance
   * a budget instead of a per-call speed bump.
   *
   * COUNTED, not converted. Every metered row is one judge call and a judge
   * call carries `CLAIMS_PER_CALL` hearings, so the window's own rows say how
   * many hearings were bought — exactly, with no rate in the arithmetic.
   * Dividing the window's dollars by a 30-day average rate would have been a
   * worse number in both directions: it needs a rate to exist before the
   * gate can work at all (the cold start has none), and it mis-states any
   * window whose model mix differs from the average's — a day of
   * pricier-model calls reads as more hearings than were actually bought, and
   * the allowance shrinks for a reason nobody chose.
   */
  async hearingsSpentInWindow(): Promise<number> {
    const { calls } = await this.meteredSpend(STANDING_WINDOW_HOURS);
    return calls * CLAIMS_PER_CALL;
  }

  /**
   * WHAT THE HASH PINS, AND THE TOLERANCE IT ADMITS (2026-08-13).
   *
   * The hash pins the QUANTITY exactly — the number of hearings is the thing
   * an approver actually approved, and one more claim is one more LLM call's
   * worth of money. The RATE is pinned only to whole micro-USD per hearing,
   * which is a stated tolerance and not an accident: the rate is a 30-day
   * average of metered spend that moves with every call this lane makes, so
   * ANY hearing billed between the quote and the approval nudges it. Pinning
   * it exactly made every quote self-invalidating — the approver pasted back
   * a hash the machine had already stopped believing.
   *
   * `estimateMicros` was in the digest and is now NOT, because it is a
   * FUNCTION of the two fields above (`round(dueCount x rate)`) computed at
   * full precision: including it re-imported precisely the sensitivity the
   * rounding was there to remove — a 0.00001-micro rate move flipped the
   * product's rounding and refused an approval of work that had not changed.
   *
   * THE TOLERANCE, STATED HONESTLY: an approved quote stays valid while the
   * measured rate stays within the same whole micro-USD per hearing — at
   * today's measured rate (tens of micros per hearing) a drift of under ~2%,
   * and the quoted dollar figure moves by at most that fraction. Anything
   * that changes the POPULATION invalidates it immediately.
   */
  async estimate(
    lane: string,
    ruleVersion: number,
    dueCount: number,
  ): Promise<DrainEstimate> {
    const microUsdPerHearing = await this.microUsdPerHearing();
    const estimateMicros = Math.round(dueCount * microUsdPerHearing);
    const estimateHash = createHash('sha256')
      .update(
        JSON.stringify({
          lane,
          ruleVersion,
          dueCount,
          microUsdPerHearing: Math.round(microUsdPerHearing),
        }),
      )
      .digest('hex')
      .slice(0, 16);
    return {
      lane,
      ruleVersion,
      dueCount,
      microUsdPerHearing,
      estimateMicros,
      estimateHash,
    };
  }

  /**
   * MAY THIS DRAIN RUN — the one gate every drain passes through.
   *
   * Returns how many claims may be heard now. Refuses loudly, with a quote,
   * when the work is beyond what the rolling window has left and no matching
   * approval was presented.
   *
   * THE ALLOWANCE IS WHAT THE WINDOW HAS LEFT, not what this call asks for.
   * Comparing each batch against the cap in isolation is the same gate a loop
   * defeats by construction — and every caller here IS a loop, batching ten
   * claims per LLM call. Metering the trailing window means the second batch
   * sees the first one's bill.
   */
  async authorizeDrain(params: {
    lane: string;
    ruleVersion: number;
    dueCount: number;
    /** The hash an operator approved, if any. */
    approvedHash?: string | null;
    /** A caller-requested ceiling, e.g. a script's --limit. */
    requested?: number;
  }): Promise<{ allowed: number; estimate: DrainEstimate | null }> {
    const requested = params.requested ?? params.dueCount;
    const wanted = Math.min(requested, params.dueCount);
    const remaining = Math.max(
      0,
      STANDING_REHEARING_CAP - Math.round(await this.hearingsSpentInWindow()),
    );
    if (wanted <= remaining && !params.approvedHash) {
      return { allowed: wanted, estimate: null };
    }
    const estimate = await this.estimate(
      params.lane,
      params.ruleVersion,
      wanted,
    );
    if (!params.approvedHash) {
      throw new DrainExceedsStandingCapError(
        estimate,
        STANDING_REHEARING_CAP,
        remaining,
      );
    }
    if (params.approvedHash !== estimate.estimateHash) {
      throw new StaleDrainApprovalError(estimate, params.approvedHash);
    }
    return { allowed: wanted, estimate };
  }
}
