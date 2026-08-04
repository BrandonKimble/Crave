import { billedMicrosFromStore } from '../shared/spend-currency';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggerService } from '../../../shared';
import { PoolRegistry, type PoolDenial } from './pool-registry';
import { PrismaPoolConsumptionStore } from './pool-consumption.store';
import { PrismaService } from '../../../prisma/prisma.service';
import { OpsAlertsService } from '../shared/ops-alerts.service';

/** '<vendor>.<resource>'-shaped pool name for a campaign's §14.6 grant —
 *  mirrors spend-campaign.service.ts's private campaignPoolName (kept
 *  local rather than exported/imported to avoid a governance <-> shared
 *  circular import; it's a one-line naming convention, not logic). */
function campaignPoolName(campaignId: string): string {
  return `campaign.${campaignId}`;
}

/**
 * F120 / D14 — ONE DOLLAR GATE, PARAMETERISED BY WHICH BUDGET.
 *
 * The Gemini and Places gates were the same 40-line body twice. This file's
 * own header records why that is the defect and not merely duplication: when
 * the interactive Gemini gate was hardened, its copy silently kept the old
 * fail-OPEN semantics. Two gates for one budget class is the bug; the third
 * dollar pool would have copied it a third time. Everything that genuinely
 * differs between the two is DATA below, so a hardening lands on all of them.
 *
 * A module function rather than a private method on purpose: the gate is pure
 * orchestration over `pools.admit` + `opsAlerts.emit`, and the existing gate
 * specs invoke the public method through the prototype with a minimal `this`.
 */
interface SpendGateCopy {
  poolName: string;
  /** ops-alert `kind` — distinct per vendor so alerts route separately. */
  alertKind: string;
  /** Leads every alert title: '<titleNoun> spend budget …'. */
  titleNoun: string;
  /** Leads every thrown message: '<budgetNoun> spend budget …'. */
  budgetNoun: string;
  unconfirmedBody: string;
  exhaustedMessage: string;
}

interface SpendGateHost {
  pools: Pick<PoolRegistry, 'admit'>;
  opsAlerts: Pick<OpsAlertsService, 'emit'>;
}

async function assertSpendOpen(
  host: SpendGateHost,
  copy: SpendGateCopy,
): Promise<void> {
  const monthKey = new Date().toISOString().slice(0, 7);
  const verdict = await host.pools.admit(copy.poolName);
  if (verdict.admitted) {
    return;
  }
  if (verdict.reason === 'unconfirmed') {
    host.opsAlerts.emit({
      severity: 'critical',
      kind: copy.alertKind,
      title: `${copy.titleNoun} spend budget cannot be confirmed`,
      body: copy.unconfirmedBody,
      dedupeKey: `${copy.alertKind}_unconfirmed:${monthKey}`,
    });
    throw new Error(
      `${copy.budgetNoun} spend budget unconfirmed (durable window failed to load) — refusing to spend against an unknown balance`,
    );
  }
  if (verdict.reason === 'poisoned') {
    const hours = Math.ceil((verdict.retryAfterMs ?? 0) / 3_600_000);
    const message = `${copy.budgetNoun} spend budget poisoned (vendor cap) — reopens in ${hours}h; work stays queued`;
    host.opsAlerts.emit({
      severity: 'critical',
      kind: copy.alertKind,
      title: `${copy.titleNoun} spend budget poisoned (vendor cap)`,
      body: `${message}.`,
      dedupeKey: `${copy.alertKind}_poisoned:${monthKey}`,
    });
    throw new Error(message);
  }
  host.opsAlerts.emit({
    severity: 'critical',
    kind: copy.alertKind,
    title: `${copy.titleNoun} spend budget backstop fired`,
    body: `${copy.exhaustedMessage}.`,
    dedupeKey: `${copy.alertKind}:${monthKey}`,
  });
  throw new Error(copy.exhaustedMessage);
}

const GEMINI_SPEND_GATE: SpendGateCopy = {
  poolName: 'gemini.monthlySpend',
  alertKind: 'gemini_backstop',
  titleNoun: 'Gemini',
  budgetNoun: 'LLM',
  unconfirmedBody:
    'The durable spend window failed to load, so month-to-date spend is unknown. Refusing LLM spend rather than admitting against a window that reads zero.',
  exhaustedMessage:
    'LLM spend budget exhausted (gemini.monthlySpend Tier-3 backstop) — typed not-now; work stays queued until the month window rolls or the backstop is re-derived',
};

const PLACES_SPEND_GATE: SpendGateCopy = {
  poolName: 'googlePlaces.monthlySpend',
  alertKind: 'places_backstop',
  titleNoun: 'Places',
  budgetNoun: 'Places',
  unconfirmedBody:
    'The durable spend window failed to load, so month-to-date Places spend is unknown. Refusing vendor spend rather than admitting against a window that reads zero.',
  exhaustedMessage:
    'Places spend budget exhausted (googlePlaces.monthlySpend) — typed not-now; enrichment stays queued until the month window rolls or the cap is raised',
};

const TOMTOM_SPEND_GATE: SpendGateCopy = {
  poolName: 'tomtom.monthlySpend',
  alertKind: 'tomtom_backstop',
  titleNoun: 'TomTom',
  budgetNoun: 'TomTom',
  unconfirmedBody:
    'The durable spend window failed to load, so month-to-date TomTom spend is unknown. Refusing vendor spend rather than admitting against a window that reads zero.',
  exhaustedMessage:
    'TomTom spend budget exhausted (tomtom.monthlySpend catastrophe backstop) — typed not-now; probes and polygon draws stay queued until the month window rolls or the cap is raised',
};

/** §24.4 item 4 / §24.6 K1: the work_class the nightly backstop derivation
 *  writes to spend_unit_costs (SpendAnalyticsService.refreshBackstop). Read
 *  here at boot only — see the gemini.monthlySpend registration comment. */
const GEMINI_BACKSTOP_WORK_CLASS = 'backstop.gemini';

/**
 * The Resource Governor's runtime seam (master plan §14 v2, Phase-A minimum):
 * one process-local PoolRegistry with the vendor pools registered at boot.
 * TomTom is governed FIRST (§22 — the one previously ungoverned money);
 * further vendors register here as their adapters migrate (race rule #4:
 * one pool, one ledger, at every instant — a vendor moves atomically).
 *
 * Denials are typed 'not now' (§14.7): callers requeue/skip; a denial NEVER
 * becomes an error outcome, never brands a cooldown, never trips a fail-open
 * judgment layer.
 */
/**
 * Read a monthly spend cap in USD from the environment.
 *
 * ZERO IS A VALID, MEANINGFUL VALUE — it is how an owner says "stop spending".
 * `Number(env || fallback)` silently converts it to the fallback, which turns
 * a halt instruction into a live budget. Only an ABSENT or unparseable value
 * falls back.
 */
export function readSpendCapUsd(
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Per-draw metering hook (F350). See `drawWithOutcome` for the contract:
 * `onDrawConsumed` fires exactly once per ADMITTED draw — success or throw,
 * never on a denial — and is where the api_usage_ledger row and the campaign
 * envelope debit belong, so neither has to re-derive "did a draw happen"
 * from a response it can only see on the happy path.
 */
export interface DrawOptions {
  onDrawConsumed?: () => void;
}

@Injectable()
export class GovernanceService implements OnModuleInit {
  readonly pools: PoolRegistry;
  private readonly logger: LoggerService;

  constructor(
    loggerService: LoggerService,
    store: PrismaPoolConsumptionStore,
    private readonly prisma: PrismaService,
    // Provided by the @Global SharedServicesModule (no module import needed;
    // OpsAlertsService depends only on Prisma + logger, so no provider cycle).
    private readonly opsAlerts: OpsAlertsService,
  ) {
    this.logger = loggerService;
    // §14.5 durable window store: month/grant window consumption is written
    // through to Postgres and loaded at boot — a restart can never reset the
    // TomTom month ledgers. perMinute pools stay memory-only (see the
    // registry header for the §16-classified split).
    //
    // Single fail semantic (owner decision 2026-07-24): a failed durable
    // flush HARD-CLOSES the pool's window (reserve() refuses with the typed
    // 'storeFailure' denial) until a flush succeeds again — and it is LOUD:
    // error log + critical ops alert, deduped per pool per hour.
    this.pools = new PoolRegistry(store, (poolName, error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'DURABLE POOL FLUSH FAILED — window hard-closed (draws refuse) until a flush succeeds; a crash before then loses this delta',
        { poolName, error: { message } },
      );
      this.opsAlerts.emit({
        severity: 'critical',
        kind: 'pool_bookkeeping_failure',
        title: `Pool bookkeeping failure: ${poolName}`,
        body:
          `Durable window flush failed for pool '${poolName}' — the window ` +
          `is hard-closed (all draws refuse with 'storeFailure') until a ` +
          `flush succeeds. Error: ${message}`,
        // Dedupe per pool per UTC hour: 'YYYY-MM-DDTHH' bucket.
        dedupeKey: `pool_bookkeeping_failure:${poolName}:${new Date()
          .toISOString()
          .slice(0, 13)}`,
      });
    });
    // ── TomTom pools (RESHAPED 2026-07-27, owner directive) ────────────────
    //
    // Owner 2026-07-27: "price for TomTom I don't care — the scarce limits
    // were context for what's free vs not, not anything that needs stopping
    // for." So these are no longer BUDGET throttles. A ceiling that halts
    // legitimate work to save single-digit dollars is a bug; we hit exactly
    // that (the whole US straggler backlog sat blocked behind a $32 tag).
    //
    // 1. ONE POOL PER REAL RESOURCE. TomTom's free allowances are PER API
    //    FAMILY: geocode and reverseGeocode get 20,000/month EACH
    //    (vendor-verified, vendor-pricing.ts). The old single
    //    `tomtom.cheapGeocode` merged two independent allowances into one
    //    bucket and self-blocked at 20k combined while the vendor still had
    //    free capacity on both. A pool that models nothing real is the bad
    //    abstraction; these three model three actual vendor resources.
    //
    // 2. THE NUMBERS ARE AN OWNER CHOICE, LABELLED AS ONE (§16 permits
    //    facts, derivations, OR owner choices — what it forbids is dressing
    //    a choice up as a derivation, which an earlier pass of this comment
    //    did). These are CATASTROPHE backstops, not budgets. Sizing input,
    //    stated so the owner can re-ratify with real information:
    //      - legitimate work is catalog-bounded: a polygon is fetched ONCE
    //        per place and cached forever, so the largest honest month is
    //        one polygon per place. Catalog today: 22,778. The July seed
    //        month actually drew 22,658 — i.e. the observed ceiling of real
    //        work is ~1× catalog.
    //      - 100,000 is ~4.4× that, leaving years of catalog growth.
    //      - WORST-CASE EXPOSURE at the verified rates: polygons €3.00/1k →
    //        ~$324/mo; geocode/reverseGeocode €1.00/1k beyond their free
    //        20k → ~$86/mo each. Total ~$496/mo if all three ran flat out
    //        for a month, which only a runaway could do.
    //
    // DOCKET #2 (abstraction audit, 2026-07-30) — the KNOWN BETTER SHAPE,
    // done: the admission window is the VENDOR'S OWN GRAIN. §16 K4 vendor
    // fact: ~5 QPS on the Search/polygon endpoints → 300/minute per pool. A
    // runaway now stops within ONE MINUTE instead of burning a month's
    // backstop in ~5.5 hours and then blocking all legitimate work for ~25
    // days; the hourly drain's paced ~2/sec never touches the ceiling. The
    // month window is retired as an admission gate — spend visibility stays
    // with the ledger + cost-reconcile, which read actual draws, not pools.
    // (perMinute pools are in-memory by design: a restart forgets ≤1 minute
    // of window, which cannot overspend at this grain.)
    //
    // §16 on reservationTtlMs: K3-shaped operational bounds — "how long a
    // leaked reservation may hold capacity before expiry reclaims it".
    // 60s ≈ one synchronous call; 120s ≈ a paged/batched dispatch.
    const TOMTOM_VENDOR_QPS = 5; // K4 vendor fact (same fact as VENDOR_QPS_SPACING_MS)
    const TOMTOM_PER_MINUTE = TOMTOM_VENDOR_QPS * 60;
    this.pools.register({
      name: 'tomtom.reverseGeocode',
      credential: 'default',
      window: {
        kind: 'perMinute',
        limit: TOMTOM_PER_MINUTE,
        denomination: 'quantity',
      },
      reservationTtlMs: 60_000,
    });
    this.pools.register({
      name: 'tomtom.geocode',
      credential: 'default',
      window: {
        kind: 'perMinute',
        limit: TOMTOM_PER_MINUTE,
        denomination: 'quantity',
      },
      reservationTtlMs: 60_000,
    });
    this.pools.register({
      name: 'tomtom.scarcePolygons',
      credential: 'default',
      window: {
        kind: 'perMinute',
        limit: TOMTOM_PER_MINUTE,
        denomination: 'quantity',
      },
      reservationTtlMs: 120_000,
    });
    // Gemini pool #1 (§22 Phase-A minimum; §14.2 "absorbing the existing TPM
    // reservation engine as the gemini pool's implementation"): the Redis
    // CentralizedRateLimiter REMAINS the multi-process admission authority;
    // this registry entry is the pool's LEDGER — SmartLLMProcessor mirrors
    // every live draw's declared-vs-actual token pair here (the §14.2
    // estimator-drift instrument). Limit = the same per-project vendor fact
    // the limiter reads (AI Studio shows the live limits; published Tier-2
    // floor 4M TPM is safe for this Tier-3 account, env-overridable — never
    // guessed).
    const envMaxTpm = parseInt(process.env.LLM_MAX_TPM || '', 10);
    this.pools.register({
      name: 'gemini.tokens',
      credential: 'default',
      window: {
        kind: 'perMinute',
        limit:
          Number.isFinite(envMaxTpm) && envMaxTpm > 0 ? envMaxTpm : 4_000_000,
        denomination: 'quantity',
      },
      reservationTtlMs: 60_000,
    });
    // §24.1 Tier 3 CATASTROPHE BACKSTOP (demoted 2026-07-24, §24.4 items
    // 2+4): the gemini MONTHLY DOLLAR budget, in micro-USD, metered from
    // ACTUAL token counts at the usage-ledger chokepoint (gemini-pricing.ts
    // K4 rates). No longer "the" work governor — Tier 1 campaigns stop via
    // their envelope, Tier 2 lanes via cost baselines; this pool is the
    // last-resort backstop so the system self-stops with a typed not-now
    // BEFORE the vendor's wall (whose 429s the batch retrier would
    // otherwise storm against), expected to NEVER fire in healthy
    // operation. Its LIMIT is fixed at boot from GEMINI_MONTHLY_SPEND_CAP_USD
    // (see that env var's comment below — it is ONLY the pre-first-
    // derivation boot value now) and then RE-DERIVED nightly by
    // SpendAnalyticsService.refreshBackstop as BACKSTOP_MULTIPLE (K1 = 3;
    // "a bug may cost at most two extra months", §24.1 Tier 3) × the
    // trailing 30d measured gemini spend, via PoolRegistry.resetLimit — the
    // visible, measured backstop number replaces the env guess once one
    // refresh has run. hardClosed + durable: a restart can never forget
    // spend.
    //
    // GEMINI_MONTHLY_SPEND_CAP_USD: the boot-only seed. Once
    // SpendAnalyticsService's nightly refresh has written a
    // 'backstop.gemini' spend_unit_costs row, this env var is DEAD for every
    // subsequent boot (governance reads the derived row instead) — it only
    // matters for the very first boot before any derivation has run.
    // THE FALSY-ZERO TRAP (red team 2026-08-02). `Number(env || '300')` makes
    // a DELIBERATE 0 become 300: an owner setting the cap to zero to halt
    // Gemini spend during an incident would restart into a $300 ceiling —
    // the exact opposite of the instruction. spend-analytics.service.ts had
    // already written a paragraph about this trap and parsed the same
    // variable correctly; the file that sets the actual boot limit never got
    // the fix. One variable, one parser now.
    const capUsd = readSpendCapUsd(
      process.env.GEMINI_MONTHLY_SPEND_CAP_USD,
      300,
    );
    this.pools.register({
      name: 'gemini.monthlySpend',
      credential: 'default',
      window: {
        kind: 'perMonth',
        limit: Math.round(capUsd * 1_000_000),
        denomination: 'billedMicros',
      },
      reservationTtlMs: 60_000,
    });
    // GOOGLE PLACES MONTHLY SPEND — the catastrophe backstop (owner-priced
    // 2026-08-01: $200/month, the same shape as gemini.monthlySpend's cap).
    //
    // Places had RATE limits (150k/day, 12k/min, Redis-backed and global)
    // but no DOLLAR ceiling — and at the metered rates those limits permit
    // roughly $2.5k/day. Rate is not budget. Unlike TomTom, this spend does
    // NOT converge: TomTom cost is per PLACE and a place is outlined once,
    // so it asymptotes as your geography fills in, while Places is driven by
    // user TEXT, which is infinite.
    //
    // This is the LAST line, not the everyday control. What keeps us off it
    // is asking our own catalog first (poll-entity-seed.matchKnownRestaurant)
    // and remembering misses (vendor_lookup_misses).
    // Same parser as Gemini above. It used parseFloat, which additionally
    // accepts trailing junk ("200usd" -> 200) — two spellings of one concept
    // in one file.
    const placesCapUsd = readSpendCapUsd(
      process.env.GOOGLE_PLACES_MONTHLY_SPEND_CAP_USD,
      200,
    );
    this.pools.register({
      name: 'googlePlaces.monthlySpend',
      credential: 'default',
      window: {
        kind: 'perMonth',
        limit: Math.round(placesCapUsd * 1_000_000),
        denomination: 'billedMicros',
      },
      reservationTtlMs: 60_000,
    });
    // TOMTOM MONTHLY BACKSTOP (red team 2026-08-04). TomTom had per-minute
    // pools ONLY: 300/min permits ~$1,400/day of scarce draws indefinitely,
    // and the vendor is PREPAID with no balance API — so "the bill will warn
    // us" is not even available as a bad plan. The 2026-07-27 removal of the
    // old monthly ceiling was a legitimate owner choice (a $32 tag blocked
    // the US backlog), but it was implemented as "delete the money concept"
    // instead of "raise the money ceiling": Gemini and Places both kept a
    // catastrophe dial the owner can turn, TomTom kept nothing.
    //
    // The default is a DERIVATION, not an invention (§16): July's measured
    // volume was 23,384 scarce draws (pool_window_consumption) ≈ $76 at the
    // vendor-verified rate, and the ratified catastrophe posture is
    // BACKSTOP_MULTIPLE(3)× a measured month ≈ $230, rounded to one digit.
    // The env var is the owner's dial, same shape as the other two vendors.
    const tomtomCapUsd = readSpendCapUsd(
      process.env.TOMTOM_MONTHLY_SPEND_CAP_USD,
      250,
    );
    this.pools.register({
      name: 'tomtom.monthlySpend',
      credential: 'default',
      window: {
        kind: 'perMonth',
        limit: Math.round(tomtomCapUsd * 1_000_000),
        denomination: 'billedMicros',
      },
      reservationTtlMs: 60_000,
    });
    // Reddit pool (§12.5 client rewrite executed): vendor fact K4 is
    // 1000-per-10-minutes / 100-per-minute; the per-minute window is the
    // binding constraint. This pool is THE one reddit window and ledger
    // (§14.8: the RateLimitCoordinator's reddit window moved here atomically
    // — the coordinator has ZERO reddit admission authority). Admission is
    // per-REQUEST at the client's single makeRequest chokepoint
    // (governance.draw); the pacer's dispatch-grain reserve is an ordering/
    // backpressure peek of declared demand (reserve → release), and the
    // declared-vs-actual dispatch pair remains the §14.2 drift instrument.
    this.pools.register({
      name: 'reddit.requests',
      credential: 'default',
      // §16 K4 (vendor fact): Reddit 100/min.
      window: {
        kind: 'perMinute',
        limit: 100,
        denomination: 'quantity',
      },
      reservationTtlMs: 120_000,
    });
  }

  /**
   * Boot hydration (§14.5): load each durable pool's current window from the
   * store so month-to-date consumption survives the restart. A failed load
   * leaves the window unconfirmed — hardClosed pools deny until the store
   * recovers (ensureWindow retries on every draw). Boot itself never fails.
   */
  async onModuleInit(): Promise<void> {
    await Promise.all(
      this.pools.listRegistered().map(async (pool) => {
        await this.pools.ensureWindow(pool.name);
        const status = this.pools.poolStatus(pool.name);
        if (status.storeConfirmed === false) {
          this.logger.warn(
            'Durable pool window not store-confirmed at boot (fail-closed until the store recovers)',
            { poolName: pool.name },
          );
        } else if (status.storeConfirmed === true) {
          this.logger.info('Durable pool window hydrated from store', {
            poolName: pool.name,
            used: status.used,
            limit: status.limit,
          });
        }
      }),
    );
    await this.applyDerivedGeminiBackstop();
    await this.reRegisterCampaignGrants();
  }

  /**
   * §24 red team finding 4 ("restart-safe campaigns"): pool grants (§14.6)
   * are registered ONLY at approve()-time, in-memory — a process restart
   * forgets every live campaign's grant pool entirely, so the FIRST
   * recordSpend after a restart throws PoolRegistrationError (pool not
   * registered) instead of metering. Re-register a grant pool for every
   * campaign still in a dispatchable state ('approved'/'running') at boot,
   * sized the same way approve() sizes it (estimateMicros x
   * (1 + toleranceFraction)), then immediately meter() the campaign's
   * spentMicros-to-date so the pool's remaining capacity reflects reality,
   * not a fresh zero. Pilots (estimateMicros null — §24.2) have no envelope
   * to re-register, same as approve() never minting one for them. Non-fatal
   * per-row (mirrors applyDerivedGeminiBackstop): a bad row must not fail
   * boot, only skip that one campaign's grant.
   */
  private async reRegisterCampaignGrants(): Promise<void> {
    let rows: Array<{
      campaignId: string;
      estimateMicros: bigint | null;
      toleranceFraction: number | null;
      spentMicros: bigint;
    }>;
    try {
      rows = await this.prisma.spendCampaign.findMany({
        where: { state: { in: ['approved', 'running'] } },
        select: {
          campaignId: true,
          estimateMicros: true,
          toleranceFraction: true,
          spentMicros: true,
        },
      });
    } catch (error) {
      this.logger.warn(
        'Campaign grant re-registration read failed at boot (non-fatal)',
        {
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
      return;
    }
    for (const row of rows) {
      if (row.estimateMicros === null || row.toleranceFraction === null) {
        continue; // Pilot campaign — no envelope, nothing to re-register.
      }
      try {
        const envelopeMicros = Math.round(
          Number(row.estimateMicros) * (1 + row.toleranceFraction),
        );
        const poolName = campaignPoolName(row.campaignId);
        this.pools.register({
          name: poolName,
          credential: 'campaign',
          window: {
            kind: 'grant',
            amount: envelopeMicros,
            denomination: 'billedMicros',
          },
          reservationTtlMs: 60_000,
        });
        const spentMicros = Number(row.spentMicros);
        if (spentMicros > 0) {
          await this.pools.meterSpend(
            this.pools.spendPool(poolName),
            billedMicrosFromStore(spentMicros),
          );
        }
        this.logger.info('Campaign grant re-registered at boot', {
          campaignId: row.campaignId,
          envelopeMicros,
          spentMicros,
        });
      } catch (error) {
        this.logger.warn(
          'Campaign grant re-registration failed for one campaign (skipped, boot continues)',
          {
            campaignId: row.campaignId,
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          },
        );
      }
    }
  }

  /**
   * §24.4 item 4 / §24.1 Tier 3: at boot, prefer the MEASURED backstop over
   * the env-seeded guess — read the latest 'backstop.gemini' row
   * SpendAnalyticsService's nightly refresh wrote to spend_unit_costs
   * (micro_usd_per_unit = the derived monthly limit in micro-USD, unit=
   * 'month') and, when present, resetLimit the gemini.monthlySpend pool to
   * it. §14 discipline: a pool's limit changes only at boot or by this
   * re-derivation — never mid-window by arbitrary write. Absent a row yet
   * (fresh install, before the first nightly refresh), the constructor's
   * GEMINI_MONTHLY_SPEND_CAP_USD boot value stands unchanged — that env var
   * is ONLY the pre-first-derivation seed. A read failure is non-fatal
   * (boot must never fail on this); it just leaves the env-seeded limit.
   */
  private async applyDerivedGeminiBackstop(): Promise<void> {
    try {
      const row = await this.prisma.spendUnitCost.findUnique({
        where: {
          workClass_unit: {
            workClass: GEMINI_BACKSTOP_WORK_CLASS,
            unit: 'month',
          },
        },
      });
      if (!row) {
        // SILENCE HERE IS THE FAILURE MODE. The Tier-3 story is "3x trailing
        // MEASURED spend", but with no derived row the live limit is the
        // env seed — an owner guess wearing a derivation's clothes, which
        // §16 exists to forbid. Absence looked identical to "nothing to
        // derive", so a nightly that silently stopped producing rows was
        // invisible. Say so.
        this.opsAlerts.emit({
          severity: 'warn',
          kind: 'gemini_backstop',
          title: 'Gemini backstop is NOT derived — running on the env seed',
          body: `No ${GEMINI_BACKSTOP_WORK_CLASS}/month row exists, so the spend cap is the GEMINI_MONTHLY_SPEND_CAP_USD seed rather than a measurement. Check that the nightly spend-analytics refresh is running.`,
          // Bucketed by day (R1): ops-alerts persists dedupe keys forever,
          // so a constant key means the alert fires once EVER — a dead
          // detector wearing an alert's clothes.
          dedupeKey: `gemini_backstop_underived:${new Date().toISOString().slice(0, 10)}`,
        });
        return;
      }
      const ageMs = Date.now() - row.refreshedAt.getTime();
      if (ageMs > 48 * 60 * 60 * 1000) {
        this.opsAlerts.emit({
          severity: 'warn',
          kind: 'gemini_backstop',
          title: 'Gemini backstop derivation is stale',
          body: `The derived cap was last refreshed ${Math.round(ageMs / 3_600_000)}h ago. A stale derivation silently governs today's spend with last week's measurement.`,
          dedupeKey: `gemini_backstop_stale:${new Date().toISOString().slice(0, 10)}`,
        });
      }
      const before = this.pools.poolStatus('gemini.monthlySpend').limit;
      const after = Math.round(row.microUsdPerUnit);
      if (after <= 0) {
        // A derived row exists but is garbage — the env seed silently
        // governs, which is exactly what the underived alert exists to
        // prevent. Same severity, distinct key.
        this.opsAlerts.emit({
          severity: 'warn',
          kind: 'gemini_backstop',
          title: 'Gemini backstop derivation row is corrupt',
          body: `backstop.gemini/month exists but microUsdPerUnit=${row.microUsdPerUnit}; the env seed is governing.`,
          dedupeKey: `gemini_backstop_corrupt:${new Date().toISOString().slice(0, 10)}`,
        });
        return;
      }
      if (after === before) {
        return;
      }
      this.pools.resetLimit('gemini.monthlySpend', after);
      this.logger.info(
        'gemini.monthlySpend backstop re-derived from measured spend at boot',
        {
          beforeUsd: Math.round(before / 10_000) / 100,
          afterUsd: Math.round(after / 10_000) / 100,
        },
      );
    } catch (error) {
      this.logger.warn(
        'Backstop re-derivation read failed at boot (env-seeded limit stands)',
        {
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
    }
  }

  /**
   * Ledger-only mirror for a pool whose ADMISSION lives elsewhere (Phase-A
   * gemini absorption): records a declared-vs-actual draw pair without ever
   * gating the caller. A mirror "denial" is pure divergence telemetry — the
   * external authority admitted what this process-local window would not —
   * and is logged, never surfaced.
   */
  mirrorDraw(
    poolName: string,
    workClass: string,
    declared: number,
    actual: number,
  ): void {
    try {
      const reservation = this.pools.reserve(poolName, declared, workClass);
      if (!reservation.admitted) {
        this.logger.warn(
          'Ledger mirror divergence (external authority admitted; local window would deny)',
          { poolName, workClass, declared, reason: reservation.reason },
        );
        return;
      }
      // Mirror pools are perMinute (memory-only) — the reconcile promise is a
      // no-op write-through and never rejects.
      void this.pools.reconcile(reservation.reservationId, actual);
    } catch (error) {
      this.logger.warn(
        'Ledger mirror failed (telemetry only, caller unaffected)',
        {
          poolName,
          workClass,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
    }
  }

  /**
   * Reserve-act-reconcile wrapper for a single vendor call. Returns null on
   * denial (typed not-now — the caller degrades gracefully, e.g. header says
   * "this area" and the mint retries next month).
   */
  /**
   * THE gemini spend gate — one implementation, both callers.
   *
   * There were two: the interactive path (LlmService) and batch submission
   * (GeminiBatchService), each comparing a poolStatus() snapshot by hand.
   * When the interactive one was hardened, the batch one silently kept the
   * OLD semantics — no window refresh, and fail-OPEN on an unconfirmed store
   * (windowUsed returns 0, which reads as "nothing spent this month" and
   * admits). That mattered more than it looks: batch is 46.9% of all
   * measured spend AND is now the default extraction path, so the riskiest
   * gate guarded the biggest spender. Two gates for one budget is the defect;
   * this is the fix.
   */
  /** Last derived-backstop health check (R2: boot-only checking meant a
   *  long-lived process never noticed the nightly dying). */
  private lastBackstopHealthCheckMs = 0;

  async assertGeminiSpendOpen(): Promise<void> {
    // Re-evaluate derivation health at most daily, riding the gate every
    // caller already passes through — no new scheduler.
    if (Date.now() - this.lastBackstopHealthCheckMs > 24 * 3_600_000) {
      this.lastBackstopHealthCheckMs = Date.now();
      void this.applyDerivedGeminiBackstop();
    }
    await assertSpendOpen(
      { pools: this.pools, opsAlerts: this.opsAlerts },
      GEMINI_SPEND_GATE,
    );
  }

  /**
   * THE PLACES DOLLAR GATE (capacity re-derivation, 2026-08-02).
   *
   * `googlePlaces.monthlySpend` was REGISTERED as "the catastrophe backstop"
   * but nothing ever admitted against it — a decorative budget. Measured
   * from the ledger: the rate limits alone permit ~$2,825/day ($84.7k/mo)
   * while the July accident that prompted all this governance was $323 in
   * one morning. Rate is not budget; this is the budget.
   *
   * Fail-closed exactly like the Gemini gate: an unconfirmable window
   * refuses rather than admitting against an unknown balance.
   */
  async assertPlacesSpendOpen(): Promise<void> {
    await assertSpendOpen(
      { pools: this.pools, opsAlerts: this.opsAlerts },
      PLACES_SPEND_GATE,
    );
  }

  /** TomTom money gate — every governed TomTom draw passes here (the
   *  adapter calls it inside probe() and fetchPolygon(), so no call site
   *  can forget it — the GatedGeminiClient property). */
  async assertTomtomSpendOpen(): Promise<void> {
    await assertSpendOpen(
      { pools: this.pools, opsAlerts: this.opsAlerts },
      TOMTOM_SPEND_GATE,
    );
  }

  async draw<T>(
    poolName: string,
    workClass: string,
    act: () => Promise<T>,
    options?: DrawOptions,
  ): Promise<T | null> {
    const outcome = await this.drawWithOutcome(
      poolName,
      workClass,
      act,
      options,
    );
    return outcome.admitted ? outcome.value : null;
  }

  /**
   * Same draw primitive, but a denial returns its typed details (retryAfter)
   * instead of a bare null — the §12.5 per-request chokepoint needs them to
   * retry THROUGH the governor (each retry is a NEW draw) and to surface a
   * typed not-now when attempts exhaust.
   *
   * ── THE TWO DRAW WORDS (D29a, 2026-08-03). ────────────────────────────
   * "A consumed draw" was being used for two different facts by three
   * different meters, and they disagree on exactly one path. The words are
   * fixed here, in the only place that knows both:
   *
   *   ADMITTED draw — a reservation this method admitted and reconciled.
   *     Counted by the POOL, and counted on a THROW too: the request likely
   *     reached the vendor, and over-counting a connect-refused is the
   *     conservative direction a rate/money pool deliberately chose.
   *
   *   ANSWERED draw — the vendor returned a response. Counted by the
   *     api_usage_ledger (adapter recordDraw) and by campaign envelopes,
   *     both of which hang off a non-null response at the call site.
   *
   * ── THE GAP IS CLOSED (F350, 2026-08-03). ─────────────────────────────
   * D29a made the three meters STATE which word they counted; they still
   * disagreed on one path. A transport error is admitted and not answered,
   * so the pool debited while the ledger and the campaign envelope saw
   * nothing — cost-reconcile could not see that draw AT ALL, which is the
   * "summed the wrong column" class one level down.
   *
   * A vendor draw is ONE event, and who is charged is a property of the
   * draw, not of the caller that happened to notice it. This method is the
   * only place that knows whether a reservation was admitted, so it is the
   * only place allowed to say a draw happened: `onDrawConsumed` fires
   * EXACTLY ONCE per ADMITTED draw — on the success path and on the throw
   * path, never on a denial — and the ledger write and the campaign meter
   * hang off it instead of each re-deriving the fact from a response they
   * can see. Under-metering is now unrepresentable: a caller cannot forget
   * the error path, because it is not the caller's path to remember.
   *
   * ACCEPTED COST (the red team's own note): a request that genuinely never
   * left this process — a connect-refused — is now metered as a draw. That
   * is OVER-metering in the conservative direction the pool already chose
   * deliberately, and it is the correct direction for money: an invisible
   * spend is far worse than a slightly pessimistic one.
   *
   * `onDrawConsumed` MUST NOT throw and MUST NOT be awaited-on for
   * correctness — it is fire-and-forget metering. A throw from it is
   * swallowed and logged, because a meter must never fail the act it meters.
   */
  async drawWithOutcome<T>(
    poolName: string,
    workClass: string,
    act: () => Promise<T>,
    options?: DrawOptions,
  ): Promise<
    { admitted: true; value: T } | { admitted: false; denial: PoolDenial }
  > {
    // Durable pools: confirm the current window against the store before
    // admission (no-op for perMinute; heals a boot-time load failure and
    // loads a freshly-rolled month). Fail-closed denial follows in reserve().
    await this.pools.ensureWindow(poolName);
    const reservation = this.pools.reserve(poolName, 1, workClass);
    if (!reservation.admitted) {
      this.logDenial(poolName, workClass, reservation);
      return { admitted: false, denial: reservation };
    }
    try {
      const result = await act();
      // Synchronous durable increment for month/grant pools (§14.5 —
      // correctness first; they are low-rate money draws).
      await this.pools.reconcile(reservation.reservationId, 1);
      this.announceDrawConsumed(poolName, workClass, options);
      return { admitted: true, value: result };
    } catch (error) {
      // ADMITTED. The pool debits 1 conservatively (the request likely
      // reached the vendor) — and so, now, do the ledger and the campaign
      // envelope, through the same single announcement the success path
      // uses. All three meters count the same event on both paths.
      await this.pools.reconcile(reservation.reservationId, 1);
      this.announceDrawConsumed(poolName, workClass, options);
      throw error;
    }
  }

  /** One admitted draw, announced once. Never throws: a meter that can fail
   *  the act it meters is worse than no meter. */
  private announceDrawConsumed(
    poolName: string,
    workClass: string,
    options?: DrawOptions,
  ): void {
    if (!options?.onDrawConsumed) return;
    try {
      options.onDrawConsumed();
    } catch (error) {
      this.logger.warn('Draw meter threw (draw itself is unaffected)', {
        poolName,
        workClass,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private logDenial(
    poolName: string,
    workClass: string,
    denial: PoolDenial,
  ): void {
    this.logger.warn('Pool draw denied (typed not-now; caller degrades)', {
      poolName,
      workClass,
      reason: denial.reason,
      retryAfterMs: denial.retryAfterMs,
    });
  }
}
