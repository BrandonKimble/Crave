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
 *   - WITHIN THE STANDING CAP, automatically. A nightly is allowed to keep up
 *     with the ordinary trickle — new inferred claims, the tail of a small
 *     bump — because a mechanism that needs a human for routine work is a
 *     mechanism that stops running.
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
 * The nightly's standing allowance, in HEARINGS. Deliberately small: it is
 * sized to absorb ordinary drift, not to work through a bump. A drain that
 * needs more than this is a decision someone should make on purpose.
 */
export const STANDING_REHEARING_CAP = 200;

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
  ) {
    super(
      `${estimate.dueCount} claims are due a hearing at rule v${estimate.ruleVersion}, ` +
        `which is beyond the standing cap of ${cap}. Estimated cost: ` +
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
         AND created_at > now() - make_interval(days => ${RATE_WINDOW_DAYS}::int)
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
    if (!calls) throw new NoMeasuredHearingRateError(RATE_WINDOW_DAYS);
    return micros / calls / CLAIMS_PER_CALL;
  }

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
          // Rounded so a sub-cent rate wobble between the quote and the
          // approval does not invalidate a quote that is still true.
          microUsdPerHearing: Math.round(microUsdPerHearing),
          estimateMicros,
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
   * when the population is beyond the standing cap and no matching approval
   * was presented.
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
    if (wanted <= STANDING_REHEARING_CAP && !params.approvedHash) {
      return { allowed: wanted, estimate: null };
    }
    const estimate = await this.estimate(
      params.lane,
      params.ruleVersion,
      wanted,
    );
    if (!params.approvedHash) {
      throw new DrainExceedsStandingCapError(estimate, STANDING_REHEARING_CAP);
    }
    if (params.approvedHash !== estimate.estimateHash) {
      throw new StaleDrainApprovalError(estimate, params.approvedHash);
    }
    return { allowed: wanted, estimate };
  }
}
