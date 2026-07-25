import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { GovernanceService } from '../governance/governance.service';
import { OpsAlertsService } from './ops-alerts.service';

/**
 * §24.3 the campaign surface (Leg C, plans/geo-demand-foundation-rebuild.md
 * §24). A campaign is a finite, named, spend-bearing job (archive load,
 * source onboarding, polygon seed, re-judge sweep, backfill) — Tier 1 of
 * the §24.1 three-tier law: owner-approved, envelope-governed, ungated
 * once approved.
 *
 * §16 K2-shaped bootstrap WITH AN EXPLICIT ERASURE NOTE: the intended
 * envelope tolerance is always DERIVED from measureDrift (§14.2's
 * declared-vs-actual drift instrument, per work class). Until a work class
 * has completed at least one campaign (so a drift sample exists),
 * 0.25 stands in BOTH as the outright fallback (no drift data at all) AND
 * as the floor beneath a thin/lucky measured drift (so a work class that
 * happens to have measured near-zero drift on a tiny sample doesn't get an
 * unrealistically tight envelope). What changes this: measureDrift
 * returning a non-null value for the work class — the FIRST campaign of any
 * work class always bootstraps at this floor; every one after the first
 * measures its own history. Erased the moment a work class's measured
 * |drift| naturally exceeds it — there is no code path that special-cases
 * "first campaign" beyond measureDrift legitimately returning null.
 */
const ENVELOPE_BOOTSTRAP_TOLERANCE = 0.25;

export type SpendCampaignState =
  | 'draft'
  | 'awaiting_approval'
  | 'approved'
  | 'running'
  | 'completed'
  | 'breached'
  | 're_awaiting';

export interface PrepareEstimateParams {
  name: string;
  workClass: string;
  unit: string;
  unitCount: number;
}

export interface PreparedEstimate {
  campaignId: string;
  name: string;
  workClass: string;
  unit: string;
  unitCount: number;
  microUsdPerUnit: number;
  estimateMicros: number;
  toleranceFraction: number;
  estimateHash: string;
  envelopeMicros: number;
}

/** §24.2 cold-start law: a work class with no published unit-cost row must
 *  run a bounded pilot first — inventing a rate would violate §16. */
export class NoPublishedRateError extends Error {
  constructor(
    public readonly workClass: string,
    public readonly unit: string,
  ) {
    super(
      `No published unit-cost rate for (${workClass}, ${unit}) — run a ` +
        `bounded pilot (SpendCampaignService.preparePilot) first (§24.2 ` +
        `cold-start law: no invented rates)`,
    );
    this.name = 'NoPublishedRateError';
  }
}

/** §24.3: approve() only ever approves THIS exact estimate, never "whatever
 *  it turns out to be" — a hash mismatch means the estimate moved (or the
 *  caller is re-approving a stale printout) and must be refused. */
export class StaleEstimateHashError extends Error {
  constructor(public readonly campaignId: string) {
    super(
      `Estimate hash mismatch for campaign ${campaignId} — the estimate ` +
        `has changed since this hash was printed; re-run the estimate step`,
    );
    this.name = 'StaleEstimateHashError';
  }
}

export class CampaignNotFoundError extends Error {
  constructor(public readonly campaignId: string) {
    super(`Spend campaign ${campaignId} not found`);
    this.name = 'CampaignNotFoundError';
  }
}

/** Typed 'not now' (mirrors PoolDenial, §14.7): a breached campaign's work
 *  refuses further spend until the owner re-approves via resumeAfterBreach.
 *  Callers requeue the work; never treat as a hard error outcome. */
export class CampaignBreachedError extends Error {
  constructor(public readonly campaignId: string) {
    super(
      `Campaign ${campaignId} is breached — refusing further spend until ` +
        `resumeAfterBreach re-approves a refined estimate`,
    );
    this.name = 'CampaignBreachedError';
  }
}

export class CampaignStateError extends Error {
  constructor(
    public readonly campaignId: string,
    message: string,
  ) {
    super(`Campaign ${campaignId}: ${message}`);
    this.name = 'CampaignStateError';
  }
}

/** '<vendor>.<resource>'-shaped pool name for a campaign's §14.6 grant. */
function campaignPoolName(campaignId: string): string {
  return `campaign.${campaignId}`;
}

/**
 * Canonical estimate payload hash (§24.3): sha256 over a FIXED-ORDER ARRAY,
 * JSON-serialized — never a raw '|'.join(...) string (§24 red team finding
 * 8: a '|'-joined string is structurally AMBIGUOUS — e.g. workClass
 * "a|1" + unit "b" hashes identically to workClass "a" + unit "1|b"; a JSON
 * array of the SAME fixed field order is unambiguous because JSON escapes
 * its own delimiters). NOTE: this changes hashes for any campaign still
 * 'awaiting_approval' under the old '|'-join scheme — re-run prepareEstimate
 * for those (the spend_campaigns table is empty-ish in practice; no data
 * migration was written for this).
 */
function hashEstimate(payload: {
  workClass: string;
  unit: string;
  unitCount: number;
  microUsdPerUnit: number;
  estimateMicros: number;
  toleranceFraction: number;
}): string {
  const canonical = JSON.stringify([
    payload.workClass,
    payload.unit,
    payload.unitCount,
    payload.microUsdPerUnit,
    payload.estimateMicros,
    payload.toleranceFraction,
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}

@Injectable()
export class SpendCampaignService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly opsAlerts: OpsAlertsService,
    @Optional() private readonly governance?: GovernanceService,
  ) {
    this.logger = loggerService.setContext('SpendCampaignService');
  }

  private requireGovernance(): GovernanceService {
    if (!this.governance) {
      throw new Error(
        'SpendCampaignService: governance module not wired in this process ' +
          '(slim script graphs may omit it — the campaign envelope needs it)',
      );
    }
    return this.governance;
  }

  /** DERIVED envelope tolerance for a work class (§24.1(d), §24.6): the
   *  measured declared-vs-actual drift when one exists, floored at the K2
   *  bootstrap; the bootstrap outright when no drift sample exists yet. */
  private deriveTolerance(workClass: string): number {
    const drift = this.requireGovernance().pools.measureDrift(workClass);
    if (drift === null) {
      return ENVELOPE_BOOTSTRAP_TOLERANCE;
    }
    return Math.max(Math.abs(drift - 1), ENVELOPE_BOOTSTRAP_TOLERANCE);
  }

  /**
   * §24.1(a)/(b): compute the estimate at the caller's point of maximum
   * context (unit counts are facts, priced ONLY from the measured
   * unit-cost table) and persist it 'awaiting_approval'. Refuses (typed)
   * when the work class has no published rate — the caller must run
   * preparePilot first (§24.2).
   */
  async prepareEstimate(
    params: PrepareEstimateParams,
  ): Promise<PreparedEstimate> {
    const rate = await this.prisma.spendUnitCost.findUnique({
      where: {
        workClass_unit: { workClass: params.workClass, unit: params.unit },
      },
    });
    if (!rate) {
      throw new NoPublishedRateError(params.workClass, params.unit);
    }
    const estimateMicros = Math.round(params.unitCount * rate.microUsdPerUnit);
    const toleranceFraction = this.deriveTolerance(params.workClass);
    const estimateHash = hashEstimate({
      workClass: params.workClass,
      unit: params.unit,
      unitCount: params.unitCount,
      microUsdPerUnit: rate.microUsdPerUnit,
      estimateMicros,
      toleranceFraction,
    });
    const row = await this.prisma.spendCampaign.create({
      data: {
        name: params.name,
        workClass: params.workClass,
        unit: params.unit,
        unitCount: params.unitCount,
        microUsdPerUnit: rate.microUsdPerUnit,
        estimateMicros,
        toleranceFraction,
        estimateHash,
        state: 'awaiting_approval',
      },
    });
    const envelopeMicros = Math.round(estimateMicros * (1 + toleranceFraction));
    return {
      campaignId: row.campaignId,
      name: params.name,
      workClass: params.workClass,
      unit: params.unit,
      unitCount: params.unitCount,
      microUsdPerUnit: rate.microUsdPerUnit,
      estimateMicros,
      toleranceFraction,
      estimateHash,
      envelopeMicros,
    };
  }

  /**
   * §24.2 cold-start law: the smallest unit batch that yields a measurable
   * sample, run as an automatic micro-campaign with NO dollar estimate —
   * its budget is its unit COUNT (the caller bounds unitCount, e.g. a
   * script's --max-posts), priced post-hoc once its actuals publish a rate.
   * Created directly 'approved' (no hash-approval step: there is no
   * estimate to approve, only a bounded unit count the caller already
   * chose). No grant pool is minted — recordSpend for a pilot accumulates
   * spentMicros with no envelope to breach against (nothing to compare it
   * to yet).
   *
   * §24 red team finding 11 (pilot ceiling honesty): unitCount here is a
   * DECLARED bound this service RECORDS, not one it ENFORCES — recordSpend
   * only ever sees micro-USD deltas, never a unit count, so it structurally
   * cannot stop a pilot after N units. Enforcement of the unit bound lives
   * in the CALLING script's own loop (e.g. seed-archive --max-posts stops
   * dispatching once it has seen max-posts documents) — a documented
   * deferral pending a unit-aware recordSpend, not a silent gap.
   */
  async preparePilot(
    params: PrepareEstimateParams,
  ): Promise<{ campaignId: string }> {
    const row = await this.prisma.spendCampaign.create({
      data: {
        name: params.name,
        workClass: params.workClass,
        unit: params.unit,
        unitCount: params.unitCount,
        state: 'approved',
        approvedAt: new Date(),
      },
    });
    return { campaignId: row.campaignId };
  }

  /**
   * §24.1(c): the owner approves THIS estimate (hash must match exactly),
   * which mints the §14.6 grant — grant amount = estimateMicros x
   * (1 + toleranceFraction), the projection envelope's upper bound.
   * Reaching the grant's amount (pool exhaustion) IS the envelope breach
   * stop (§24.1(e)) — 'stop on envelope breach' and 'grant exhaustion' are
   * the SAME event by construction, not two mechanisms kept in sync.
   */
  async approve(
    campaignId: string,
    estimateHash: string,
  ): Promise<{ campaignId: string; envelopeMicros: number }> {
    const row = await this.prisma.spendCampaign.findUnique({
      where: { campaignId },
    });
    if (!row) {
      throw new CampaignNotFoundError(campaignId);
    }
    if (row.state !== 'awaiting_approval') {
      throw new CampaignStateError(
        campaignId,
        `cannot approve from state '${row.state}' (expected 'awaiting_approval')`,
      );
    }
    if (
      row.estimateMicros === null ||
      row.toleranceFraction === null ||
      row.estimateHash === null
    ) {
      throw new CampaignStateError(
        campaignId,
        'awaiting_approval row missing its estimate — data corruption',
      );
    }
    if (row.estimateHash !== estimateHash) {
      throw new StaleEstimateHashError(campaignId);
    }
    const envelopeMicros = Math.round(
      Number(row.estimateMicros) * (1 + row.toleranceFraction),
    );
    this.requireGovernance().pools.register({
      name: campaignPoolName(campaignId),
      credential: 'campaign',
      window: { kind: 'grant', amount: envelopeMicros },
      failPolicy: { kind: 'hardClosed' },
      // §16 K3-shaped operational bound (mirrors the other governed pools'
      // reservationTtlMs): campaign spend is metered post-hoc (meter(), not
      // reserve/reconcile — see recordSpend), so no reservation is ever
      // actually held; the field is unused but required by PoolConfig.
      reservationTtlMs: 60_000,
    });
    await this.prisma.spendCampaign.update({
      where: { campaignId },
      data: { state: 'approved', approvedAt: new Date() },
    });
    this.logger.info('Spend campaign approved', {
      campaignId,
      name: row.name,
      workClass: row.workClass,
      envelopeMicros,
    });
    return { campaignId, envelopeMicros };
  }

  /**
   * §24 red team finding 1 ("a breach must stop work"): a single findUnique
   * state check so callers that dispatch NEW work for a campaign (e.g.
   * GeminiBatchService.submit) can refuse BEFORE any vendor call, instead of
   * only stopping spend after the fact via recordSpend. Dispatchable =
   * 'approved' or 'running' — the same two states recordSpend accepts;
   * 'breached'/'draft'/'awaiting_approval'/'completed'/'re_awaiting' all
   * refuse. A missing campaign row is also non-dispatchable (fail closed,
   * never fail open on a typo'd id).
   */
  async isDispatchable(campaignId: string): Promise<boolean> {
    const row = await this.prisma.spendCampaign.findUnique({
      where: { campaignId },
      select: { state: true },
    });
    return row?.state === 'approved' || row?.state === 'running';
  }

  /**
   * §24.1(e): meter actual spend into the campaign's grant. A pilot
   * campaign (no estimate/envelope) just accumulates spentMicros — there is
   * nothing to breach against yet. A priced campaign whose grant denies
   * (exhausted) flips 'breached' with a LOUD error carrying actual vs
   * projected, and further recordSpend calls for a breached campaign are
   * typed-refused (CampaignBreachedError) — callers re-queue the work.
   *
   * §24 red team finding 5 ("recordSpend race"): the old read-modify-write
   * (findUnique -> compute newSpentMicros in JS -> update) let two
   * concurrent recordSpend calls both read the same spentMicros and each
   * write back their own read+delta, silently dropping one delta (classic
   * lost update). The increment is now an ATOMIC `{ increment }` — Postgres
   * serializes it, so concurrent writers compose correctly. The breach
   * state flip is additionally GUARDED via updateMany's WHERE
   * (state IN ('approved','running')): a stale writer that read the row
   * before another writer breached it can no longer resurrect 'running'
   * over 'breached' — its update simply matches zero rows. The in-memory
   * pool meter (governance.pools) stays the LIVE breach detector, unchanged
   * — this guard only protects the DB row's bookkeeping from clobbering.
   */
  async recordSpend(campaignId: string, micros: number): Promise<void> {
    if (!Number.isFinite(micros) || micros <= 0) {
      return;
    }
    const row = await this.prisma.spendCampaign.findUnique({
      where: { campaignId },
    });
    if (!row) {
      throw new CampaignNotFoundError(campaignId);
    }
    if (row.state === 'breached') {
      throw new CampaignBreachedError(campaignId);
    }
    if (row.state !== 'approved' && row.state !== 'running') {
      throw new CampaignStateError(
        campaignId,
        `cannot record spend in state '${row.state}'`,
      );
    }
    const roundedMicros = Math.round(micros);

    // Pilot campaign (no estimate/envelope): atomic accumulate only. This
    // service never sees the pilot's unit count here, only a micro-USD
    // delta — enforcing the caller-declared unit bound (§24 red team
    // finding 11) is the calling SCRIPT's job (e.g. --max-posts stops its
    // own dispatch loop), a documented deferral, not an oversight.
    if (row.estimateMicros === null) {
      await this.prisma.spendCampaign.updateMany({
        where: { campaignId, state: { in: ['approved', 'running'] } },
        data: { spentMicros: { increment: roundedMicros }, state: 'running' },
      });
      return;
    }

    const governance = this.requireGovernance();
    const poolName = campaignPoolName(campaignId);
    await governance.pools.meter(poolName, roundedMicros);
    const status = governance.pools.poolStatus(poolName);
    const breached = status.used >= status.limit;

    if (breached) {
      const breachNote =
        `envelope breach: actual ${status.used} micro-USD >= projected ` +
        `envelope ${status.limit} micro-USD (unit_count ${row.unitCount}, ` +
        `work_class ${row.workClass})`;
      this.logger.error('SPEND CAMPAIGN ENVELOPE BREACHED — campaign stopped', {
        campaignId,
        name: row.name,
        workClass: row.workClass,
        actualMicros: status.used,
        projectedEnvelopeMicros: status.limit,
        unitCount: row.unitCount,
      });
      const actualUsd = Math.round(status.used / 10_000) / 100;
      const projectedUsd = Math.round(status.limit / 10_000) / 100;
      this.opsAlerts.emit({
        severity: 'critical',
        kind: 'campaign_breached',
        title: `Campaign "${row.name}" breached its envelope`,
        body: `Campaign ${campaignId} (${row.workClass}) spent $${actualUsd} vs. a projected envelope of $${projectedUsd} (unit_count ${row.unitCount}). Re-approve via resumeAfterBreach with a refined estimate.`,
        // One alert per campaign-breach per campaign (dedupe collapses a
        // fast-retrying caller that hits recordSpend again before the
        // campaign's state flip is visible everywhere).
        dedupeKey: `campaign_breached:${campaignId}`,
      });
      await this.prisma.spendCampaign.updateMany({
        where: { campaignId, state: { in: ['approved', 'running'] } },
        data: {
          spentMicros: { increment: roundedMicros },
          state: 'breached',
          breachNote,
        },
      });
      return;
    }

    await this.prisma.spendCampaign.updateMany({
      where: { campaignId, state: { in: ['approved', 'running'] } },
      data: { spentMicros: { increment: roundedMicros }, state: 'running' },
    });
  }

  /**
   * §24.1(e): resumable after owner re-approval WITH the refined estimate.
   * The interim (script-gated) surface has no separate print-then-approve
   * round trip for resume — this call recomputes the estimate the same way
   * prepareEstimate does (same rate lookup, same drift-derived tolerance)
   * and requires the CALLER's newEstimateHash to match that freshly
   * recomputed hash (never a stale one), then tops up the campaign grant
   * to the refined envelope and reopens the campaign. Owner intent is
   * expressed by the caller choosing to invoke this at all (mirrors the
   * operator-script gate's "explicit flag carrying the estimate's hash").
   */
  async resumeAfterBreach(
    campaignId: string,
    newEstimateHash: string,
  ): Promise<PreparedEstimate> {
    const row = await this.prisma.spendCampaign.findUnique({
      where: { campaignId },
    });
    if (!row) {
      throw new CampaignNotFoundError(campaignId);
    }
    if (row.state !== 'breached') {
      throw new CampaignStateError(
        campaignId,
        `cannot resume from state '${row.state}' (expected 'breached')`,
      );
    }
    const rate = await this.prisma.spendUnitCost.findUnique({
      where: { workClass_unit: { workClass: row.workClass, unit: row.unit } },
    });
    if (!rate) {
      throw new NoPublishedRateError(row.workClass, row.unit);
    }
    const estimateMicros = Math.round(row.unitCount * rate.microUsdPerUnit);
    const toleranceFraction = this.deriveTolerance(row.workClass);
    const estimateHash = hashEstimate({
      workClass: row.workClass,
      unit: row.unit,
      unitCount: row.unitCount,
      microUsdPerUnit: rate.microUsdPerUnit,
      estimateMicros,
      toleranceFraction,
    });
    if (estimateHash !== newEstimateHash) {
      throw new StaleEstimateHashError(campaignId);
    }

    const newEnvelopeMicros = Math.round(
      estimateMicros * (1 + toleranceFraction),
    );
    const governance = this.requireGovernance();
    const poolName = campaignPoolName(campaignId);
    const status = governance.pools.poolStatus(poolName);
    const topUp = Math.max(0, newEnvelopeMicros - status.limit);
    if (topUp > 0) {
      await governance.pools.mintGrant(poolName, topUp);
    }

    await this.prisma.spendCampaign.update({
      where: { campaignId },
      data: {
        microUsdPerUnit: rate.microUsdPerUnit,
        estimateMicros,
        toleranceFraction,
        estimateHash,
        state: 'approved',
        breachNote: null,
      },
    });
    this.logger.info('Spend campaign resumed after breach', {
      campaignId,
      name: row.name,
      workClass: row.workClass,
      newEnvelopeMicros,
      toppedUpMicros: topUp,
    });
    return {
      campaignId,
      name: row.name,
      workClass: row.workClass,
      unit: row.unit,
      unitCount: row.unitCount,
      microUsdPerUnit: rate.microUsdPerUnit,
      estimateMicros,
      toleranceFraction,
      estimateHash,
      envelopeMicros: newEnvelopeMicros,
    };
  }

  /**
   * §24.1: mark the campaign done and feed the realized (declared vs
   * actual) pair back into measureDrift for the work class — so the NEXT
   * campaign of this work class derives its tolerance from real history
   * instead of the §16 K2 bootstrap.
   */
  async complete(campaignId: string): Promise<void> {
    const row = await this.prisma.spendCampaign.findUnique({
      where: { campaignId },
    });
    if (!row) {
      throw new CampaignNotFoundError(campaignId);
    }
    if (row.state !== 'approved' && row.state !== 'running') {
      throw new CampaignStateError(
        campaignId,
        `cannot complete from state '${row.state}'`,
      );
    }
    await this.prisma.spendCampaign.update({
      where: { campaignId },
      data: { state: 'completed', completedAt: new Date() },
    });
    if (row.estimateMicros !== null) {
      this.requireGovernance().pools.recordActualPair(
        campaignPoolName(campaignId),
        row.workClass,
        Number(row.estimateMicros),
        Number(row.spentMicros),
      );
    }
    this.logger.info('Spend campaign completed', {
      campaignId,
      name: row.name,
      workClass: row.workClass,
      estimateMicros:
        row.estimateMicros === null ? null : Number(row.estimateMicros),
      spentMicros: Number(row.spentMicros),
    });
  }
}
