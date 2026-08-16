import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { pricedGeminiRow } from '../../external-integrations/shared/gemini-pricing';
import { ClaimVerdictLedgerService } from './claim-verdict-ledger.service';

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
 * WHAT THE NUMBER HAS TO CLEAR, AND WHAT IT HAS TO REFUSE (re-derived
 * 2026-08-15, A2/A3). It was 200, and 200 was not a budget for the trickle it
 * was written for — it was smaller than one ordinary day of new words, so the
 * only reason it never refused anything is that nothing ever drained.
 *
 *   - IT MUST ADMIT THE TRICKLE: new words arriving from real asks, which the
 *     owner sizes at a few hundred a day. A cap under that turns the
 *     self-healing door into a door that never heals.
 *   - IT MUST REFUSE A MASS RE-HEAR: the population a rule-version bump
 *     re-opens, MEASURED today at 32,379 words on the negation lane and
 *     32,379 on genericness. That is the runaway, and it is the only one.
 *
 * 2,000 sits between them with room on both sides — roughly 4x the stated
 * trickle ceiling, and 16x below the smallest measured bump population, so a
 * bump still stops at the gate and prints its quote. It is not a measurement
 * of demand (there is none yet: this corpus has zero recorded asks), and it
 * is not defended as one; when demand exists, meter it and re-derive.
 */
export const STANDING_REHEARING_CAP = 2_000;

/** The window the standing allowance is spread over. A day, because the
 *  nightly is the rail this allowance exists to keep running. */
export const STANDING_WINDOW_HOURS = 24;

/**
 * WHAT A HEARING COSTS IS A PROPERTY OF THE LANE, NOT OF THIS SERVICE.
 *
 * The rate and the rolling allowance are both metered from `api_usage_ledger`
 * rows tagged with the CALLER that pays for the hearing, and divided by how
 * many claims that lane packs into one LLM call. Those two numbers were module
 * constants while exactly one lane existed; the judged-vocabulary lanes
 * (2026-08-13) made them per-lane, and a plausible default would have been the
 * worst possible answer — a vocabulary drain metered against the word-judge's
 * caller reads its spend as someone else's and prices itself off a rate no
 * hearing of its own ever produced.
 *
 * So every lane STATES its meter here, once, and `authorizeDrain` looks it up
 * by the lane it was given. A lane with no entry cannot be quoted: that is a
 * lane whose spend nobody attributed, and guessing is the failure this whole
 * file exists to prevent.
 */
export interface HearingMeter {
  /** The `api_usage_ledger.caller` this lane's hearings bill to. */
  caller: string;
  /** Claims packed into one LLM call — the divisor that turns a measured
   *  cost-per-CALL into a cost-per-HEARING. */
  claimsPerCall: number;
}

const HEARING_METERS: ReadonlyMap<string, HearingMeter> = new Map([
  ['word_claim', { caller: 'aliases.claim_judge', claimsPerCall: 10 }],
  [
    'word-genericness',
    { caller: 'vocabulary.genericness_judge', claimsPerCall: 40 },
  ],
  ['word-negation', { caller: 'vocabulary.negation_judge', claimsPerCall: 40 }],
  ['word-role', { caller: 'vocabulary.word_role_judge', claimsPerCall: 40 }],
  ['restaurant_name', { caller: 'aliases.place_name_judge', claimsPerCall: 8 }],
]);

/** The lane this service was born for, and the meter every legacy call site
 *  that names no lane still means. */
const WORD_CLAIM_METER = HEARING_METERS.get('word_claim') as HearingMeter;

export class UnmeteredHearingLaneError extends Error {
  constructor(lane: string) {
    super(
      `Lane '${lane}' has no entry in HEARING_METERS, so its hearings bill to ` +
        `a caller nobody declared and cannot be priced. Add one in ` +
        `claim-rehearing-budget.service.ts naming the caller its judge passes ` +
        `to the LLM gateway and how many claims it packs per call.`,
    );
    this.name = 'UnmeteredHearingLaneError';
  }
}

export function hearingMeterFor(lane: string): HearingMeter {
  const meter = HEARING_METERS.get(lane);
  if (!meter) throw new UnmeteredHearingLaneError(lane);
  return meter;
}

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
  constructor(windowDays: number, meter: HearingMeter) {
    super(
      `No '${meter.caller}' spend is metered in the last ${windowDays} days, so a ` +
        `hearing has no measured price and a large drain cannot be quoted. Run a ` +
        `drain within the standing cap of ${STANDING_REHEARING_CAP} first — it needs ` +
        `no estimate and it measures the rate.`,
    );
    this.name = 'NoMeasuredHearingRateError';
  }
}

@Injectable()
export class ClaimRehearingBudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: ClaimVerdictLedgerService,
  ) {}

  /**
   * What one hearing costs, from this lane's own metered spend. Micro-USD.
   * Throws rather than guessing when nothing has been metered.
   */
  async microUsdPerHearing(
    meter: HearingMeter = WORD_CLAIM_METER,
  ): Promise<number> {
    const { micros, calls } = await this.meteredSpend(
      RATE_WINDOW_DAYS * 24,
      meter,
    );
    if (!calls) throw new NoMeasuredHearingRateError(RATE_WINDOW_DAYS, meter);
    return micros / calls / meter.claimsPerCall;
  }

  /** This lane's OWN billed spend over a trailing window, priced from the
   *  metering chokepoint. The one number both the rate and the rolling
   *  allowance are built from, so they can never disagree about what a
   *  hearing costs. */
  private async meteredSpend(
    windowHours: number,
    meter: HearingMeter,
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
       WHERE service = 'gemini' AND caller = ${meter.caller}
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
   * COUNTED FROM THE VERDICTS THEMSELVES, and only the UNATTENDED ones (A2 +
   * A3, 2026-08-15). Both halves of that sentence were wrong before and each
   * broke the gate on its own:
   *
   *   - A2, THE 40x OVER-METER. It counted billed LLM calls and multiplied by
   *     the lane's `claimsPerCall` — the batch's SIZE, not its FILL. A drain
   *     hearing three new words is one call and reads as forty hearings, so
   *     the steady trickle exhausted its own allowance thirteen times over
   *     before buying anything. One verdict row is one word judged; counting
   *     rows is the exact answer and needs no rate at all.
   *   - A3, THE POISONED WINDOW. It could not tell a one-time operator
   *     certification from the nightly trickle, so the 2026-08-13 bulk run
   *     stood in front of the allowance and every subsequent hearing was
   *     refused — 97,400 counted against a cap of 200. A certification is
   *     ALREADY bounded, by the approve-by-hash law one method down; charging
   *     it twice buys nothing and costs the rail its whole reason to exist.
   *
   * (The dollars-divided-by-a-rate shape this replaced the first time stays
   * rejected for its original reason: it needs a rate to exist before the
   * gate can work, and the cold start has none.)
   */
  async hearingsSpentInWindow(lane: string): Promise<number> {
    return this.ledger.hearingsBoughtSince(
      lane,
      'steady',
      STANDING_WINDOW_HOURS,
    );
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
    const microUsdPerHearing = await this.microUsdPerHearing(
      hearingMeterFor(lane),
    );
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
    // The lane must be METERED even when the allowance answers on its own —
    // an unmetered lane is a lane whose spend nobody attributed, and that is
    // a refusal, not a free pass.
    hearingMeterFor(params.lane);
    const remaining = Math.max(
      0,
      STANDING_REHEARING_CAP - (await this.hearingsSpentInWindow(params.lane)),
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
