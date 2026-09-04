import { NON_TERMINAL_BATCH_STATUSES } from '../llm/batch-job-status';
import type { MeteredService } from './spend-currency';
import {
  scaleBilled,
  unreconciledBilled,
  type BilledMicros,
  type LedgerMicros,
} from './spend-currency';
import {
  Injectable,
  Optional,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import {
  CompletionWorkTimerHandle,
  startCompletionWorkTimer,
} from '../../../shared/completion-work-timer';
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
  expectedNewPlaces?: number;
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

/** Typed 'not now' (mirrors PoolDenial, §14.7): a breached campaign refuses
 *  NEW work at the dispatch gates (assertDispatchable; the batch ingest
 *  hold) until the owner re-approves via resumeAfterBreach. It no longer
 *  comes out of recordSpend — post-breach spend ACCUMULATES (accumulation
 *  and permission are split, 2026-08-31). Classified TRANSIENT BY TYPE in
 *  gemini-batch's failure classifier: a breach is a governance hold, never
 *  a deterministic failure that may burn a bounded attempt. */
export class CampaignBreachedError extends Error {
  constructor(public readonly campaignId: string) {
    super(
      `Campaign ${campaignId} is breached — refusing further spend until ` +
        `resumeAfterBreach re-approves a refined estimate`,
    );
    this.name = 'CampaignBreachedError';
  }
}

/** complete() refused: paid batch work for this campaign is still open —
 *  let it drain (or reap it) first, or its output is discarded. */
export class CampaignHasOpenWorkError extends Error {
  constructor(
    public readonly campaignId: string,
    public readonly openJobs: number,
  ) {
    super(
      `Campaign ${campaignId} still has ${openJobs} non-terminal batch job(s) ` +
        `carrying its id — completing now would make their paid output ` +
        `undispatchable and discard it. Let the queue drain first.`,
    );
    this.name = 'CampaignHasOpenWorkError';
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

/** Prepare-time refusal: one live campaign per name. A second quote while an
 *  approved/running/breached campaign of the same name is in flight would
 *  split the spend trail across two envelopes; the live one must complete
 *  (or resume and complete) first. Unapproved quotes are not "live" — they
 *  are superseded by the fresh quote instead. */
export class DuplicateLiveCampaignError extends Error {
  constructor(
    public readonly name: string,
    public readonly campaignId: string,
    public readonly state: string,
  ) {
    super(
      `Campaign name "${name}" already has a LIVE campaign ${campaignId} ` +
        `(state '${state}') — complete or resume it before quoting a new one`,
    );
    this.name = 'DuplicateLiveCampaignError';
  }
}

/**
 * THE TRANSITION TABLE (campaign lifecycle chokepoint, 2026-08-12): every
 * state write in this file flows through transition(), whose WHERE clause is
 * DERIVED from this table — an edge not declared here is unrepresentable, not
 * merely unreviewed. The table is the documentation and the enforcement:
 *
 *   awaiting_approval -> approved (owner hash-approves) | superseded (fresh quote)
 *   approved          -> running (first spend) | breached | completed
 *   running           -> running (further spend) | breached | completed
 *   breached          -> approved (resumeAfterBreach, refined estimate)
 *   completed / superseded -> terminal
 *
 * 'draft' is the schema default and a documented pre-state; nothing writes
 * it today and nothing may leave it except a future prepare step.
 * 're_awaiting' remains documented in §24.3 but has never been written —
 * kept out of the table on purpose so writing it fails loudly.
 */
export const CAMPAIGN_STATE_TRANSITIONS: Readonly<
  Record<string, readonly string[]>
> = {
  approved: ['awaiting_approval', 'breached'],
  superseded: ['awaiting_approval'],
  running: ['approved', 'running'],
  breached: ['approved', 'running'],
  completed: ['approved', 'running'],
};

/** The states allowed to become `to` — the derived WHERE for transition(). */
export function statesThatMayBecome(to: string): readonly string[] {
  const from = CAMPAIGN_STATE_TRANSITIONS[to];
  if (!from) {
    throw new Error(
      `campaign state '${to}' has no declared inbound transitions — ` +
        `an undeclared edge is a bug, not a default`,
    );
  }
  return from;
}

/**
 * ONE ENFORCER, ONE MEMORY (rederivation 2026-08-31). Campaigns used to
 * mirror their envelope into a `campaign.<id>` grant pool (registered at
 * approve/boot/resume, drained via meterSpend alongside the row's own
 * atomic increment). The mirror was a SECOND memory of the same fact, and
 * it produced exactly the defects a second memory produces: boot
 * re-hydration compounded stored consumption (~$1,051 and ~$1,971 recorded
 * against ~$50 envelopes), every boot fired a false "spending blind" alarm,
 * and reconciling the two memories grew its own reconcile logic. The
 * guarded atomic increment in recordSpend is THE enforcer; the campaign.*
 * pools are gone. (Grant-pool machinery itself stays — non-campaign pools
 * use it.) Any historical campaign.* rows in pool_window_consumption are
 * dead data: see scripts/cleanup-campaign-pool-rows.sql.
 */

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
export class SpendCampaignService implements OnModuleInit, OnModuleDestroy {
  private readonly logger: LoggerService;
  private watchdogTimer: CompletionWorkTimerHandle | null = null;

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

  onModuleInit(): void {
    // A DETECTOR gated on the switch it detects around is no detector
    // (red team 2026-09-03 governance #2): this watchdog lived behind
    // @Cron, so on scheduler-off environments — staging, the active one —
    // the stale-running and breached-still-spending arms simply never ran
    // while the runner's comments deferred to them. Watchdogs are
    // completion-truth infrastructure, not discretionary work: self-owned
    // timer, own off-switch, alive wherever the worker runs.
    this.watchdogTimer = startCompletionWorkTimer({
      intervalMs: 6 * 60 * 60 * 1000,
      offSwitchEnv: 'SPEND_CAMPAIGN_WATCHDOG_ENABLED',
      run: () => this.alertStaleRunningCampaigns(),
      onFailure: (error) =>
        this.logger.error('SpendCampaignService watchdog tick failed', {
          error: error instanceof Error ? error.message : String(error),
        }),
    });
  }

  onModuleDestroy(): void {
    this.watchdogTimer?.stop();
    this.watchdogTimer = null;
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

  /**
   * THE ONE STATE-WRITE CHOKEPOINT: every campaign state change goes through
   * here (or through the raw atomic increment in recordSpend, whose guard
   * list is derived from the same table). The guarded updateMany means a
   * concurrent writer that already moved the row simply matches zero rows —
   * the caller decides whether zero is an error.
   */
  private async transition(
    to: string,
    where: {
      campaignId?: string;
      name?: string;
      spentMicros?: bigint | number;
    },
    data: Record<string, unknown> = {},
  ): Promise<number> {
    const result = await this.prisma.spendCampaign.updateMany({
      where: {
        ...(where.campaignId ? { campaignId: where.campaignId } : {}),
        ...(where.name ? { name: where.name } : {}),
        ...(where.spentMicros !== undefined
          ? { spentMicros: where.spentMicros }
          : {}),
        state: { in: [...statesThatMayBecome(to)] },
      },
      data: { state: to, ...data },
    });
    return result.count;
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
  /**
   * A fresh quote for a campaign NAME supersedes any prior unapproved quote
   * for the same name (owner ruling 2026-08-10): re-running an estimate is
   * the normal way to correct a quote, and the stale awaiting_approval rows
   * it used to strand made "which quote is live?" ambiguous. Only unapproved,
   * unspent rows are eligible — anything approved or metered is history, not
   * a stray. Marked 'superseded' (not deleted) so the quote trail survives.
   */
  private async supersedeUnapprovedQuotes(name: string): Promise<void> {
    await this.transition('superseded', { name, spentMicros: 0 });
  }

  /** ONE LIVE CAMPAIGN PER NAME (prepare-time guard, 2026-08-12): quoting a
   *  name whose campaign is approved/running/breached is refused — the fresh
   *  quote would fork the spend trail. Runs BEFORE superseding unapproved
   *  quotes so a refused prepare leaves the existing quotes untouched. */
  private async refuseDuplicateLiveCampaign(name: string): Promise<void> {
    const live = await this.prisma.spendCampaign.findFirst({
      where: { name, state: { in: ['approved', 'running', 'breached'] } },
      select: { campaignId: true, state: true },
      orderBy: { createdAt: 'desc' },
    });
    if (live) {
      throw new DuplicateLiveCampaignError(name, live.campaignId, live.state);
    }
  }

  async prepareEstimate(
    params: PrepareEstimateParams,
  ): Promise<PreparedEstimate> {
    await this.refuseDuplicateLiveCampaign(params.name);
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
    await this.supersedeUnapprovedQuotes(params.name);
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
    await this.refuseDuplicateLiveCampaign(params.name);
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
      params.expectedNewPlaces !== undefined
        ? Math.round(params.expectedNewPlaces)
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
    await this.supersedeUnapprovedQuotes(params.name);
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
    // No grant pool is minted (one enforcer, one memory — see the header
    // note): the envelope is enforced by recordSpend's guarded atomic
    // increment against THIS row, which survives restarts for free.
    const moved = await this.transition(
      'approved',
      { campaignId },
      { approvedAt: new Date() },
    );
    if (!moved) {
      throw new CampaignStateError(
        campaignId,
        'state moved during approval — re-read and retry',
      );
    }
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
   * THE dispatch gate as one recorded refusal (2026-08-12): every chokepoint
   * that dispatches campaign work — GeminiBatchService.submit, the sync
   * callLLMApi — calls THIS instead of hand-writing `if (!isDispatchable)`
   * with its own message. A breached campaign throws the typed
   * CampaignBreachedError (requeue-and-wait); any other non-dispatchable
   * state (missing row included) throws CampaignStateError (terminal —
   * do not requeue).
   */
  async assertDispatchable(campaignId: string): Promise<void> {
    const row = await this.prisma.spendCampaign.findUnique({
      where: { campaignId },
      select: { state: true },
    });
    if (row?.state === 'approved' || row?.state === 'running') return;
    if (row?.state === 'breached') {
      throw new CampaignBreachedError(campaignId);
    }
    throw new CampaignStateError(
      campaignId,
      `not dispatchable from state '${row?.state ?? 'missing'}' — work must ` +
        `not be submitted for this campaign`,
    );
  }

  /** Narrow state read for holders that must distinguish "breached — hold
   *  the work, no attempt burned" from every other state (a COMPLETED
   *  campaign's straggler job should still ingest its paid output; only a
   *  breach means 'not now'). */
  async isBreached(campaignId: string): Promise<boolean> {
    const row = await this.prisma.spendCampaign.findUnique({
      where: { campaignId },
      select: { state: true },
    });
    return row?.state === 'breached';
  }

  /** BREACH FINISHES WHAT IT STARTED (rederivation 2026-08-31): stopping
   *  NEW work (assertDispatchable) is not the same as stopping the work
   *  already running at the vendor — a breached campaign's open batch jobs
   *  kept billing until they finished on their own. The batch rail
   *  registers this reaper (a callback because the rail's module sits above
   *  this one — same shape as GeminiBatchService.registerIngestor); the
   *  breach flip invokes it fire-and-forget: reaping is accounting and
   *  cleanup, never a reason to fail the spend record. */
  private breachReaper?: (campaignId: string) => Promise<void>;

  registerBreachReaper(reaper: (campaignId: string) => Promise<void>): void {
    this.breachReaper = reaper;
  }

  /**
   * §24.1(e): accumulate actual spend into the campaign row. A pilot
   * campaign (no estimate/envelope) just accumulates spentMicros — there is
   * nothing to breach against yet. A priced campaign crossing its envelope
   * flips 'breached' with a LOUD alert carrying actual vs projected, and the
   * breach reaper cancels its in-flight batch jobs. Further recordSpend
   * calls for a breached campaign STILL ACCUMULATE (the row stays truthful
   * about what was spent) — refusing NEW work is the dispatch gates' job
   * (assertDispatchable + the batch ingest hold), not this record's.
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
    // ACCUMULATION AND PERMISSION ARE DIFFERENT QUESTIONS (rederivation
    // 2026-08-31). A breached campaign refuses NEW work at the dispatch
    // gates (assertDispatchable, and the ingest hold in gemini-batch) — but
    // the money for work already in flight when the breach fired STILL
    // ARRIVES, and a row that stops counting it lies about what the
    // campaign actually cost. So 'breached' accumulates below (staying
    // breached); only genuinely terminal states refuse the record.
    if (
      row.state !== 'approved' &&
      row.state !== 'running' &&
      row.state !== 'breached'
    ) {
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
      await this.transition(
        'running',
        { campaignId },
        { spentMicros: { increment: roundedMicros } },
      );
      return;
    }

    // BREACH VERDICT FROM THE INCREMENT'S OWN RESULT (step 5, H7 + red
    // team F6): increment first (guarded, atomic), decide from the value
    // the increment RETURNS. Deciding from a pre-read row was the same
    // lost-update this file's docstring says was fixed — two concurrent
    // recorders each read S and each conclude S+delta is under the
    // envelope while S+2·delta breaches. This guarded increment is THE ONE
    // envelope enforcer (the campaign.* grant-pool mirror is deleted —
    // see the header note).
    const envelopeMicros = Math.round(
      Number(row.estimateMicros) *
        (1 + (row.toleranceFraction ?? ENVELOPE_BOOTSTRAP_TOLERANCE)),
    );
    // 'breached' accumulates but stays breached (the CASE): accumulation is
    // truth-keeping, permission is the dispatch gates' job.
    const accumulatingStates = [...statesThatMayBecome('running'), 'breached'];
    const incremented = await this.prisma.$queryRaw<
      Array<{ spent_micros: bigint; state: string }>
    >`
      UPDATE spend_campaigns
      SET spent_micros = spent_micros + ${roundedMicros},
          state = CASE WHEN state = 'breached' THEN 'breached' ELSE 'running' END
      WHERE campaign_id = ${campaignId}::uuid
        AND state = ANY(${accumulatingStates}::text[])
      RETURNING spent_micros, state
    `;
    if (!incremented.length) {
      // State moved to a terminal state under us — the guarded WHERE
      // refused (breached no longer refuses; it accumulates above).
      const now = await this.prisma.spendCampaign.findUnique({
        where: { campaignId },
        select: { state: true },
      });
      throw new CampaignStateError(
        campaignId,
        `cannot record spend in state '${now?.state ?? 'missing'}'`,
      );
    }
    const durableSpent = Number(incremented[0].spent_micros);
    if (incremented[0].state === 'breached') {
      // Post-breach tail spend: recorded (the row stays truthful), no new
      // breach flip, no throw — the breach alert already fired and the
      // dispatch gates already refuse new work. The watchdog's
      // breached-still-spending arm is what escalates a tail that never
      // stops.
      this.logger.warn('Post-breach campaign spend accumulated', {
        campaignId,
        deltaMicros: roundedMicros,
        spentMicros: durableSpent,
        envelopeMicros,
      });
      return;
    }
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
      await this.transition('breached', { campaignId }, { breachNote });
      // BREACH FINISHES WHAT IT STARTED: reap the campaign's open batch
      // jobs at the vendor (cancel remote, meter partial output) so a
      // wedged-but-alive job cannot keep billing a stopped campaign.
      // Fire-and-forget — reaping must never fail the spend record.
      if (this.breachReaper) {
        void this.breachReaper(campaignId).catch((error: unknown) => {
          this.logger.error('Breach reaper failed (jobs may still be live)', {
            campaignId,
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          });
        });
      }
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
    // No pool to register or top up (one enforcer, one memory): the refined
    // estimate lands on the row below, and recordSpend's guarded increment
    // enforces the new envelope from the row itself — restart-proof for
    // free, in any process.

    const resumed = await this.transition(
      'approved',
      { campaignId },
      {
        microUsdPerUnit: rate.microUsdPerUnit,
        estimateMicros,
        toleranceFraction,
        estimateHash,
        breachNote: null,
      },
    );
    if (!resumed) {
      throw new CampaignStateError(
        campaignId,
        'state moved during resume — re-read and retry',
      );
    }
    this.logger.info('Spend campaign resumed after breach', {
      campaignId,
      name: row.name,
      workClass: row.workClass,
      newEnvelopeMicros,
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
   * STALE-'running' WATCHDOG (2026-08-12): a campaign is moved to
   * 'completed' only by an explicit call (scripts/complete-campaign.ts), so
   * a finished job whose operator forgot the step sits 'running' forever —
   * prod's v7 replay did exactly that at $30.44 spent. A 'running' campaign
   * whose ledger has been silent for 24h is either done (complete it) or
   * wedged (investigate); both deserve an ops alert, neither deserves
   * silence. Warn-level, day-bucketed dedupe — the same comparator pattern
   * as spend-expectation-monitor. Inert outside the scheduler runtime
   * (main.ts stops crons on non-worker processes).
   */
  async alertStaleRunningCampaigns(): Promise<void> {
    try {
      const stale = await this.prisma.$queryRaw<
        Array<{ campaign_id: string; name: string; spent_micros: bigint }>
      >`
        SELECT c.campaign_id, c.name, c.spent_micros
        FROM spend_campaigns c
        WHERE c.state = 'running'
          AND COALESCE(c.approved_at, c.created_at) < now() - interval '24 hours'
          AND NOT EXISTS (
            SELECT 1 FROM api_usage_ledger l
            WHERE l.campaign_id = c.campaign_id
              AND l.created_at > now() - interval '24 hours'
          )`;
      const dayKey = new Date().toISOString().slice(0, 10);
      for (const row of stale) {
        const spentUsd = Math.round(Number(row.spent_micros) / 10_000) / 100;
        this.opsAlerts.emit({
          severity: 'warn',
          kind: 'campaign_stale_running',
          title: `Campaign "${row.name}" is 'running' with a silent ledger`,
          body:
            `Campaign ${row.campaign_id} has recorded no ledger rows for 24h ` +
            `at $${spentUsd} spent. If the job finished, run ` +
            `scripts/complete-campaign.ts ${row.campaign_id}; if not, the ` +
            `job is wedged.`,
          dedupeKey: `campaign_stale_running:${row.campaign_id}:${dayKey}`,
        });
      }
      // BREACHED-WITH-ARRIVING-SPEND (rederivation 2026-08-31): a breach is
      // supposed to stop new work AND reap the work in flight; spend still
      // arriving a day later means something is dispatching for a stopped
      // campaign (a gate is bypassed, or the reaper missed a job). The old
      // watchdog only saw running+silent, so this exact failure was
      // invisible — the tail spend accumulated (truthfully, per the
      // accumulation/permission split) with nobody looking.
      const breachedSpending = await this.prisma.$queryRaw<
        Array<{ campaign_id: string; name: string; spent_micros: bigint }>
      >`
        SELECT c.campaign_id, c.name, c.spent_micros
        FROM spend_campaigns c
        WHERE c.state = 'breached'
          AND EXISTS (
            SELECT 1 FROM api_usage_ledger l
            WHERE l.campaign_id = c.campaign_id
              AND l.created_at > now() - interval '24 hours'
          )`;
      for (const row of breachedSpending) {
        const spentUsd = Math.round(Number(row.spent_micros) / 10_000) / 100;
        this.opsAlerts.emit({
          severity: 'warn',
          kind: 'campaign_breached_still_spending',
          title: `Breached campaign "${row.name}" is still accruing spend`,
          body:
            `Campaign ${row.campaign_id} is 'breached' but recorded ledger ` +
            `rows in the last 24h ($${spentUsd} spent to date). A breach ` +
            `should stop new work and reap in-flight jobs — something is ` +
            `still dispatching for it. Check llm_batch_jobs for open jobs ` +
            `carrying this campaignId, then resumeAfterBreach or finish the ` +
            `reap.`,
          dedupeKey: `campaign_breached_still_spending:${row.campaign_id}:${dayKey}`,
        });
      }
    } catch (error) {
      this.logger.warn('Stale-running campaign watchdog failed', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
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
    // A CAMPAIGN WITH PAID WORK STILL OPEN CANNOT COMPLETE (red team
    // 2026-09-04 G-3). 'completed' is not dispatchable, so a straggler
    // batch job's ingest tail hit CampaignStateError — not transient —
    // burned its three attempts and DISCARDED paid output, while
    // recordSpend logged "FAILED TO RECORD". The runner waits for the
    // queue; the script did not. Now nothing can: the mirror of
    // refuseDuplicateLiveCampaign, at the other end of the lifecycle.
    const openJobs = await this.prisma.llmBatchJob.count({
      where: {
        status: { in: [...NON_TERMINAL_BATCH_STATUSES] },
        resumeContext: { path: ['campaignId'], equals: campaignId },
      },
    });
    if (openJobs > 0) {
      throw new CampaignHasOpenWorkError(campaignId, openJobs);
    }
    const done = await this.transition(
      'completed',
      { campaignId },
      { completedAt: new Date() },
    );
    if (!done) {
      throw new CampaignStateError(
        campaignId,
        'state moved during completion — re-read and retry',
      );
    }
    // The declared-vs-actual pair the drift instrument needs IS the
    // completed row itself: deriveTolerance reads (estimateMicros,
    // spentMicros) from completed spend_campaigns rows — durable across
    // processes, which the old in-memory recordActualPair feed (tied to the
    // deleted campaign.* pool mirror) never was.
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
