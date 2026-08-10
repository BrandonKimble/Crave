import type { MeteredService } from './spend-currency';
import {
  billedMicrosFromStore,
  scaleBilled,
  unreconciledBilled,
  type BilledMicros,
  type LedgerMicros,
} from './spend-currency';
import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { GovernanceService } from '../governance/governance.service';
import { ReconciliationMultiplierService } from './reconciliation-multiplier.service';
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
export const ENVELOPE_BOOTSTRAP_TOLERANCE = 0.25;

export interface PrepareEstimateParams {
  name: string;
  workClass: string;
  unit: string;
  unitCount: number;
}

/** One line of an all-in manifest estimate (§24.3 v2, 2026-07-25). */
export interface ManifestEstimateLine {
  workClass: string;
  unit: string;
  unitCount: number;
  microUsdPerUnit: number;
  estimateMicros: number;
}

export interface PrepareManifestEstimateParams {
  name: string;
  /** Documents the campaign will collect/process — the single driver every
   *  manifest line derives from. */
  docCount: number;
  /** CAMPAIGN-ATTRIBUTABLE per-doc rate overrides, in LEDGER micro-USD per
   *  document, keyed by workClass (owner ruling 2026-08-10, estimator ideal
   *  shape). The published default rates are trailing-window UMBRELLAS — the
   *  interactive one inherits every untagged or foreign interactive call in
   *  the window, which inflated the first re-extraction quote ~3x with dead
   *  pre-taxonomy traffic and other lanes' crons. A campaign type that KNOWS
   *  its call plan (which callers fire per doc) passes the caller-scoped
   *  rates it measured; lines without an override keep the published rate.
   *  Overrides are still billed-dollar grossed and still hashed — the owner
   *  approves the same manifest shape either way. */
  perDocRateOverrides?: Partial<Record<string, number>>;
  /** Optional curve-derived override for the Places line's expected NEW
   *  restaurants. The default (docCount × measured entities_per_kilodoc)
   *  blanket-applies an early-lifecycle ratio and badly overestimates large
   *  loads — discovery follows a measured Heaps-style curve (β≈0.72 in both
   *  seeded cities, 2026-07-25 analysis). Pass the extrapolated NEW-restaurant
   *  count from that curve; the printout labels which method priced the line. */
  expectedNewRestaurants?: number;
}

export interface PreparedManifestEstimate {
  campaignId: string;
  name: string;
  docCount: number;
  /** Expected NEW restaurant entities, derived from the measured
   *  pipeline.entities_per_kilodoc ratio (never invented). */
  expectedEntities: number;
  lines: ManifestEstimateLine[];
  totalEstimateMicros: number;
  toleranceFraction: number;
  /** ONE hash over the whole manifest (fixed field order). */
  estimateHash: string;
  envelopeMicros: number;
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
 *  NOTE (round-3 red team C6): today's callers log-and-continue rather than
 *  requeue — the breached/terminal distinction below exists so a FUTURE
 *  requeue-on-breach caller cannot spin forever against a completed
 *  campaign, not because one exists yet. */
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
export function hashEstimate(payload: {
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

/**
 * §24.3 v2 manifest hash: ONE sha256 over the WHOLE manifest — a fixed-order
 * JSON array of per-line fixed-order tuples followed by the all-in total and
 * tolerance. Same anti-ambiguity rationale as hashEstimate (JSON escapes its
 * own delimiters); approving the hash approves EVERY line and the total at
 * once, so a single re-measured rate anywhere invalidates the printout.
 */
function hashManifest(payload: {
  lines: ManifestEstimateLine[];
  totalEstimateMicros: number;
  toleranceFraction: number;
}): string {
  const canonical = JSON.stringify([
    payload.lines.map((line) => [
      line.workClass,
      line.unit,
      line.unitCount,
      line.microUsdPerUnit,
      line.estimateMicros,
    ]),
    payload.totalEstimateMicros,
    payload.toleranceFraction,
  ]);
  return createHash('sha256').update(canonical).digest('hex');
}

/** The manifest's four paid classes, in fixed line order (§24.3 v2 — the
 *  owner's "everything that costs us money from Google" directive). The
 *  entities_per_kilodoc ratio row is the doc→entity converter, not a line. */
const MANIFEST_EXTRACTION = {
  workClass: 'gemini.reddit_extraction',
  unit: 'document',
} as const;
const MANIFEST_INTERACTIVE = {
  workClass: 'gemini.interactive_pipeline',
  unit: 'document',
} as const;
const MANIFEST_EMBEDDING = {
  workClass: 'gemini.embedding',
  unit: 'document',
} as const;
const MANIFEST_PLACES = {
  workClass: 'google_places.enrichment',
  unit: 'restaurant',
} as const;
const MANIFEST_GATE = {
  workClass: 'gemini.relevance_gate',
  unit: 'document',
} as const;
const MANIFEST_ENTITY_RATIO = {
  workClass: 'pipeline.entities_per_kilodoc',
  unit: 'ratio',
} as const;

@Injectable()
export class SpendCampaignService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly opsAlerts: OpsAlertsService,
    @Optional() private readonly governance?: GovernanceService,
    @Optional()
    private readonly reconciliation?: ReconciliationMultiplierService,
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
   *  bootstrap; the bootstrap outright when no drift sample exists yet.
   *
   *  DURABLE (round-six cost #5): the in-memory drawLedger dies at process
   *  exit, and every estimate runs in a FRESH script process — so the
   *  tolerance was structurally stuck at the 0.25 bootstrap forever. The
   *  declared-vs-actual pairs were already durable all along: completed
   *  spend_campaigns rows carry (estimateMicros, spentMicros). Read THEM.
   *  The in-memory measureDrift stays as a same-process supplement for
   *  pool-level draws, but campaign tolerance derives from the table. */
  private async deriveTolerance(workClass: string): Promise<number> {
    const completed = await this.prisma.spendCampaign.findMany({
      where: {
        workClass,
        state: 'completed',
        estimateMicros: { not: null },
      },
      select: { estimateMicros: true, spentMicros: true },
    });
    let declared = 0;
    let actual = 0;
    for (const row of completed) {
      declared += Number(row.estimateMicros ?? 0);
      actual += Number(row.spentMicros ?? 0);
    }
    if (declared > 0) {
      return Math.max(
        Math.abs(actual / declared - 1),
        ENVELOPE_BOOTSTRAP_TOLERANCE,
      );
    }
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
    const toleranceFraction = await this.deriveTolerance(params.workClass);
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
   * §24.3 v2 ALL-IN MANIFEST estimate (2026-07-25, owner directive:
   * "everything that costs us money from Google should be known and
   * accounted for"): for a doc-count input, the estimate the owner approves
   * is the SUM of every paid class the docs will trigger —
   *   1. extraction        docs × gemini.reddit_extraction rate
   *   2. interactive       docs × gemini.interactive_pipeline rate (gate +
   *                        entity resolution + categorization/alias/
   *                        attribute prompts umbrella)
   *   3. embeddings        docs × gemini.embedding rate
   *   4. places enrichment (docs × entities_per_kilodoc ÷ 1000) entities
   *                        × google_places.enrichment rate
   * ONE hash covers the whole manifest; envelope = all-in total ×
   * (1 + tolerance). A MISSING measured rate for ANY line is a typed
   * refusal naming the missing class (NoPublishedRateError) — a line is
   * never silently skipped, because a silently-thinner estimate is exactly
   * the ±20-30% miss this replaces.
   *
   * ENFORCEMENT NOTE: metering/breach attribution stays as-is for now
   * (extraction batch spend + places enrichment drain the campaign grant);
   * per-class enforcement attribution arrives as the Job-1 tagged ledger
   * data accumulates — the manifest changes what the owner APPROVES, not
   * yet how each class's actuals are drained.
   *
   * Persisted row compatibility: the spend_campaigns row stores the
   * manifest as (workClass = extraction's, unit 'document', unitCount =
   * docCount, microUsdPerUnit = all-in total ÷ docCount, estimateMicros =
   * all-in total, estimateHash = MANIFEST hash) so approve()/recordSpend()/
   * resumeAfterBreach()/complete() keep working unchanged.
   */
  async prepareManifestEstimate(
    params: PrepareManifestEstimateParams,
  ): Promise<PreparedManifestEstimate> {
    const requireRate = async (spec: { workClass: string; unit: string }) => {
      const rate = await this.prisma.spendUnitCost.findUnique({
        where: {
          workClass_unit: { workClass: spec.workClass, unit: spec.unit },
        },
      });
      if (!rate) {
        throw new NoPublishedRateError(spec.workClass, spec.unit);
      }
      return rate.microUsdPerUnit;
    };

    const extractionRate = await requireRate(MANIFEST_EXTRACTION);
    const interactiveRate = await requireRate(MANIFEST_INTERACTIVE);
    const embeddingRate = await requireRate(MANIFEST_EMBEDDING);
    const placesRate = await requireRate(MANIFEST_PLACES);
    // Round-six cost red team #4: this rate was measured, published, and
    // deliberately EXCLUDED from the interactive umbrella — and then the
    // manifest silently skipped it, violating this file's own "a line is
    // never silently skipped" invariant (~$26 per 100k docs).
    const gateRate = await requireRate(MANIFEST_GATE);
    // Entities-per-kilodoc: NOT currency — restaurants per 1,000 docs (see
    // spend-analytics refreshPipelineClassRates's encoding note).
    const entitiesPerKilodoc = await requireRate(MANIFEST_ENTITY_RATIO);

    const docCount = params.docCount;
    const expectedEntities =
      params.expectedNewRestaurants !== undefined
        ? Math.round(params.expectedNewRestaurants)
        : Math.round((docCount * entitiesPerKilodoc) / 1000);

    // BILLED-DOLLAR GROSSING (round-six ideal shape, the BigQuery feedback
    // edge): every rate above is LEDGER-priced, and the ledger's honesty is
    // measured against the BigQuery billing export by cost-reconcile.sh
    // --publish, which writes the billed÷ledger multiplier per service into
    // spend_unit_costs ('reconciliation.<service>' / 'multiplier' — the
    // value is a RATIO, not currency, same encoding rule as
    // entities_per_kilodoc). When present, each line is grossed so the
    // manifest the owner approves is in BILLED dollars; absent (never
    // reconciled), the multiplier is 1 and the estimate is honestly labeled
    // ledger-priced. Never invented — only cost-reconcile writes it.
    // ONE READER (red team 2026-08-02). This used to be a private copy of the
    // lookup, so the estimate side read the DB fresh while the meter side read
    // a cache that returns 1.0 when cold — mint at 1.7x, drain at 1.0x, which
    // is the currency split the shared service exists to prevent. Same
    // service, awaited variant, one cache.
    const geminiMultiplier =
      (await this.reconciliation?.multiplierForFresh('gemini')) ?? 1;
    const placesMultiplier =
      (await this.reconciliation?.multiplierForFresh('google_places')) ?? 1;
    const multiplierFor = (workClass: string): number =>
      workClass.startsWith('gemini.')
        ? geminiMultiplier
        : workClass.startsWith('google_places.')
          ? placesMultiplier
          : 1;
    const makeLine = (
      spec: { workClass: string; unit: string },
      unitCount: number,
      microUsdPerUnit: number,
    ): ManifestEstimateLine => ({
      workClass: spec.workClass,
      unit: spec.unit,
      unitCount,
      microUsdPerUnit,
      estimateMicros: Math.round(
        unitCount * microUsdPerUnit * multiplierFor(spec.workClass),
      ),
    });
    const overridden = (
      spec: { workClass: string; unit: string },
      published: number,
    ): number => params.perDocRateOverrides?.[spec.workClass] ?? published;
    const lines: ManifestEstimateLine[] = [
      makeLine(
        MANIFEST_EXTRACTION,
        docCount,
        overridden(MANIFEST_EXTRACTION, extractionRate),
      ),
      makeLine(MANIFEST_GATE, docCount, overridden(MANIFEST_GATE, gateRate)),
      makeLine(
        MANIFEST_INTERACTIVE,
        docCount,
        overridden(MANIFEST_INTERACTIVE, interactiveRate),
      ),
      makeLine(
        MANIFEST_EMBEDDING,
        docCount,
        overridden(MANIFEST_EMBEDDING, embeddingRate),
      ),
      // The Places line is ALWAYS present, even at zero — the $118 lesson is
      // that a missing line reads as a counted line (owner item 2,
      // 2026-08-10). expectedNewRestaurants: 0 prices it explicitly.
      makeLine(MANIFEST_PLACES, expectedEntities, placesRate),
    ];
    const totalEstimateMicros = lines.reduce(
      (sum, line) => sum + line.estimateMicros,
      0,
    );
    const toleranceFraction = await this.deriveTolerance(
      MANIFEST_EXTRACTION.workClass,
    );
    const estimateHash = hashManifest({
      lines,
      totalEstimateMicros,
      toleranceFraction,
    });
    const row = await this.prisma.spendCampaign.create({
      data: {
        name: params.name,
        workClass: MANIFEST_EXTRACTION.workClass,
        unit: MANIFEST_EXTRACTION.unit,
        unitCount: docCount,
        microUsdPerUnit: docCount > 0 ? totalEstimateMicros / docCount : 0,
        estimateMicros: totalEstimateMicros,
        toleranceFraction,
        estimateHash,
        state: 'awaiting_approval',
      },
    });
    const envelopeMicros = Math.round(
      totalEstimateMicros * (1 + toleranceFraction),
    );
    return {
      campaignId: row.campaignId,
      name: params.name,
      docCount,
      expectedEntities,
      lines,
      totalEstimateMicros,
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
      window: {
        kind: 'grant',
        amount: envelopeMicros,
        denomination: 'billedMicros',
      },
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
  async recordSpend(
    campaignId: string,
    /** Which vendor's ratio applies — the exchange happens HERE, not at the
     *  call site. Three callers each grossing by hand is three chances to
     *  forget, and the third one (TomTom draws, places-promotion) had in fact
     *  never been grossed at all. */
    service: MeteredService,
    ledger: LedgerMicros,
  ): Promise<void> {
    if (!Number.isFinite(ledger) || ledger <= 0) {
      return;
    }
    // THE envelope is MINTED in billed dollars (prepareManifestEstimate
    // grosses every line for owner approval), so it must be DRAINED in billed
    // dollars. Minting in one currency and draining in another is the whole
    // defect: at the measured ~1.7x Gemini under-metering, an $82 envelope
    // spent ~$139 billed before it registered as breached.
    const micros: BilledMicros =
      this.reconciliation?.gross(service, ledger) ?? unreconciledBilled(ledger);
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
    // scaleBilled(x, 1) IS Math.round(x), and it keeps the brand: this is
    // the same billed figure, rounded to whole micros for the integer column.
    const roundedMicros = scaleBilled(micros, 1);

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
    await governance.pools.meterSpend(
      governance.pools.spendPool(poolName),
      roundedMicros,
    );
    // BREACH VERDICT FROM THE INCREMENT'S OWN RESULT (step 5, H7 + red
    // team F6): increment first (guarded, atomic), decide from the value
    // the increment RETURNS. Deciding from a pre-read row was the same
    // lost-update this file's docstring says was fixed — two concurrent
    // recorders each read S and each conclude S+delta is under the
    // envelope while S+2·delta breaches.
    const envelopeMicros = Math.round(
      Number(row.estimateMicros) *
        (1 + (row.toleranceFraction ?? ENVELOPE_BOOTSTRAP_TOLERANCE)),
    );
    const incremented = await this.prisma.$queryRaw<
      Array<{ spent_micros: bigint }>
    >`
      UPDATE spend_campaigns
      SET spent_micros = spent_micros + ${roundedMicros},
          state = 'running'
      WHERE campaign_id = ${campaignId}::uuid
        AND state IN ('approved', 'running')
      RETURNING spent_micros
    `;
    if (!incremented.length) {
      // State moved under us — the guarded WHERE refused. Distinguish the
      // requeue-and-wait case (breached) from terminal states (completed/
      // cancelled), or callers would requeue against a done campaign
      // forever (round 2 ④).
      const now = await this.prisma.spendCampaign.findUnique({
        where: { campaignId },
        select: { state: true },
      });
      if (now?.state === 'breached') {
        throw new CampaignBreachedError(campaignId);
      }
      throw new CampaignStateError(
        campaignId,
        `cannot record spend in state '${now?.state ?? 'missing'}'`,
      );
    }
    const durableSpent = Number(incremented[0].spent_micros);
    const breached = durableSpent >= envelopeMicros;

    if (breached) {
      const breachNote =
        `envelope breach: actual ${durableSpent} micro-USD >= projected ` +
        `envelope ${envelopeMicros} micro-USD (unit_count ${row.unitCount}, ` +
        `work_class ${row.workClass})`;
      this.logger.error('SPEND CAMPAIGN ENVELOPE BREACHED — campaign stopped', {
        campaignId,
        name: row.name,
        workClass: row.workClass,
        actualMicros: durableSpent,
        projectedEnvelopeMicros: envelopeMicros,
        unitCount: row.unitCount,
      });
      const actualUsd = Math.round(durableSpent / 10_000) / 100;
      const projectedUsd = Math.round(envelopeMicros / 10_000) / 100;
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
      // Spend already recorded by the increment above — this flip is
      // state-only (a second increment here would double-count).
      await this.prisma.spendCampaign.updateMany({
        where: { campaignId, state: { in: ['approved', 'running'] } },
        data: {
          state: 'breached',
          breachNote,
        },
      });
      return;
    }
    // Non-breach: nothing left to do — the guarded increment above already
    // recorded the spend and flipped state to 'running'.
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
    const toleranceFraction = await this.deriveTolerance(row.workClass);
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
    // A BREACHED campaign's grant pool is NOT boot-rehydrated (rehydration
    // filters to approved/running), so in a fresh process — which is exactly
    // where the ops resume script runs — the pool doesn't exist yet.
    // Register it first, mirroring reRegisterCampaignGrants' shape (old
    // envelope + spent-to-date), then top up to the refined envelope below.
    let status: ReturnType<typeof governance.pools.poolStatus>;
    try {
      status = governance.pools.poolStatus(poolName);
    } catch {
      const oldEnvelopeMicros = Math.round(
        Number(row.estimateMicros ?? estimateMicros) *
          (1 + (row.toleranceFraction ?? toleranceFraction)),
      );
      governance.pools.register({
        name: poolName,
        credential: 'campaign',
        window: {
          kind: 'grant',
          amount: oldEnvelopeMicros,
          denomination: 'billedMicros',
        },
        reservationTtlMs: 60_000,
      });
      const spentMicros = Number(row.spentMicros);
      if (spentMicros > 0) {
        await governance.pools.meterSpend(
          governance.pools.spendPool(poolName),
          billedMicrosFromStore(spentMicros),
        );
      }
      status = governance.pools.poolStatus(poolName);
    }
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
