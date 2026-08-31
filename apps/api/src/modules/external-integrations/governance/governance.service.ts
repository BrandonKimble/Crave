import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggerService } from '../../../shared';
import { PoolRegistry, type PoolDenial } from './pool-registry';
import { PrismaPoolConsumptionStore } from './pool-consumption.store';
import { OpsAlertsService } from '../shared/ops-alerts.service';

// campaign.* grant pools are GONE (rederivation 2026-08-31): the campaign
// envelope's one enforcer is the guarded atomic increment on the
// spend_campaigns row (SpendCampaignService.recordSpend). The boot-time
// grant re-registration + spent-to-date re-metering that lived here was a
// second memory of the same fact and compounded stored consumption boot
// over boot (~$1,051/~$1,971 against ~$50 envelopes) while firing false
// "spending blind" alerts. Grant-pool machinery itself remains for
// non-campaign pools.

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
  exhaustedMessage: string;
}

interface SpendGateHost {
  pools: Pick<PoolRegistry, 'admit'>;
  opsAlerts: Pick<OpsAlertsService, 'emit'>;
}

/**
 * THE BUDGET SAID NO — as distinct from THE GATE IS BROKEN.
 *
 * Every spend gate throws, and until 2026-08-04 a caller could not tell which
 * of two very different things had happened: the month's money is spent
 * (routine, expected, alerted here, work stays queued) or the gate itself
 * cannot answer (the pool is unregistered, the store is unreachable —
 * systemic, and requirePool throws with NO ops alert). The TomTom adapter
 * caught the throw and returned its typed `denied` arm for BOTH, so a wiring
 * mistake would have stopped the vendor silently and permanently while the
 * drain politely ended each pass forever.
 *
 * A budget refusal is a named type now. Anything else coming out of a gate is,
 * by construction, not a budget refusal.
 *
 * D149 (2026-08-07) narrowed WHO can ever see one. A budget refusal is now a
 * BACKGROUND-ONLY event: it can reach a queue drain, a cron, a batch
 * submission — never a person waiting on a screen. The gates below still
 * throw; the call sites decide whether to consult them, and the user-facing
 * ones do not (see google-places.service.ts's origin rule).
 */
export class SpendBudgetClosedError extends Error {
  constructor(
    message: string,
    /** 'unconfirmed' is GONE (D149): a window the store cannot confirm now
     *  ADMITS and alerts (pool-registry.admit) instead of refusing, so the
     *  only two ways a budget says no are the vendor saying no ('poisoned')
     *  and a worker-only runaway backstop tripping ('exhausted'). */
    readonly reason: 'poisoned' | 'exhausted',
  ) {
    super(message);
    this.name = 'SpendBudgetClosedError';
  }
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
  if (verdict.reason === 'poisoned') {
    const retryAfterMs = verdict.retryAfterMs ?? 0;
    // A SECONDS-SCALE poison is a rate throttle, not a budget event
    // (round-3 red team): the 429 cooldown is credential-keyed, so a
    // routine 1-second TomTom QPS blip poisons the money pool too — and
    // used to email a critical "vendor cap" alert AND burn the month's
    // dedupe slot, suppressing the alert for a GENUINE month-long cap. The
    // typed denied still throws either way (a poisoned credential must not
    // spend); only the OWNER PAGE is gated on the poison being cap-scale.
    // 10 minutes is the discriminator: every real vendor-cap detector sets
    // hours-to-days, every rate throttle sets seconds.
    const capScale = retryAfterMs > 10 * 60_000;
    const hours = Math.ceil(retryAfterMs / 3_600_000);
    const message = capScale
      ? `${copy.budgetNoun} spend budget poisoned (vendor cap) — reopens in ${hours}h; work stays queued`
      : `${copy.budgetNoun} spend gate closed by a transient vendor throttle — retries in ${Math.ceil(retryAfterMs / 1000)}s`;
    if (capScale) {
      host.opsAlerts.emit({
        severity: 'critical',
        kind: copy.alertKind,
        title: `${copy.titleNoun} spend budget poisoned (vendor cap)`,
        body: `${message}.`,
        dedupeKey: `${copy.alertKind}_poisoned:${monthKey}`,
      });
    }
    throw new SpendBudgetClosedError(message, 'poisoned');
  }
  host.opsAlerts.emit({
    severity: 'critical',
    kind: copy.alertKind,
    title: `${copy.titleNoun} spend budget backstop fired`,
    body: `${copy.exhaustedMessage}.`,
    dedupeKey: `${copy.alertKind}:${monthKey}`,
  });
  throw new SpendBudgetClosedError(copy.exhaustedMessage, 'exhausted');
}

const GEMINI_SPEND_GATE: SpendGateCopy = {
  poolName: 'gemini.monthlySpend',
  alertKind: 'gemini_backstop',
  titleNoun: 'Gemini',
  budgetNoun: 'LLM',
  exhaustedMessage:
    'LLM spend budget exhausted (gemini.monthlySpend runaway backstop, $1,500/mo default) — typed not-now; batch work stays queued until the month window rolls or GEMINI_MONTHLY_SPEND_CAP_USD is raised. At ~10x measured steady-state spend, a trip means a loop, not a busy month',
};

const PLACES_SPEND_GATE: SpendGateCopy = {
  poolName: 'googlePlaces.monthlySpend',
  alertKind: 'places_backstop',
  titleNoun: 'Places',
  budgetNoun: 'Places',
  exhaustedMessage:
    'Places spend budget exhausted (googlePlaces.monthlySpend runaway backstop, $1,000/mo default) — typed not-now; WORKER enrichment stays queued until the month window rolls or the cap is raised. User-originated Places calls are never refused by this budget (D149)',
};

const TOMTOM_SPEND_GATE: SpendGateCopy = {
  poolName: 'tomtom.monthlySpend',
  alertKind: 'tomtom_backstop',
  titleNoun: 'TomTom',
  budgetNoun: 'TomTom',
  exhaustedMessage:
    'TomTom spend budget exhausted (tomtom.monthlySpend catastrophe backstop) — typed not-now; probes and polygon draws stay queued until the month window rolls or the cap is raised',
};

/**
 * GOOGLE VISION — the fourth metered vendor, and the last one with no gate
 * (D4, 2026-08-13). SafeSearch moderation joined MeteredService when photo
 * safety stopped being a Cloudinary prepaid add-on and became a paid call we
 * make ourselves, but unlike Gemini, Places and TomTom it had no dollar gate
 * at all: nothing in the process could notice a runaway upload loop spending
 * against it.
 *
 * THE CAP IS NOT INVENTED. The other three defaults are derivations from a
 * measured month (July's TomTom volume, the Places accident, Gemini's
 * steady state). Vision has NEVER been called — zero rows in
 * api_usage_ledger — so there is no month to multiply, and seeding a
 * plausible-looking number would be exactly the fabricated prior this
 * codebase forbids. So the cap comes from the owner's dial and NOTHING
 * else: with GOOGLE_VISION_MONTHLY_SPEND_CAP_USD unset, the pool is not
 * registered and the gate reports itself UNARMED, loudly, rather than
 * pretending to a ceiling nobody measured. Once a month of real volume
 * exists, the same 3x-a-measured-month derivation the other three used
 * applies here and the default stops being a blank.
 */
const VISION_SPEND_GATE: SpendGateCopy = {
  poolName: 'googleVision.monthlySpend',
  alertKind: 'vision_backstop',
  titleNoun: 'Vision',
  budgetNoun: 'Vision',
  exhaustedMessage:
    'Vision spend budget exhausted (googleVision.monthlySpend backstop, GOOGLE_VISION_MONTHLY_SPEND_CAP_USD) — photo safety moderation is a USER path, so this NEVER refuses a person (D149): the call proceeds and this alert is the signal. If it fires, look for an upload loop',
};

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
  /** True only when the owner set GOOGLE_VISION_MONTHLY_SPEND_CAP_USD — see
   *  VISION_SPEND_GATE for why there is no fabricated default. */
  private visionSpendCapConfigured = false;
  private readonly logger: LoggerService;

  constructor(
    loggerService: LoggerService,
    store: PrismaPoolConsumptionStore,
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
    // SCREAM, NEVER KILL (owner ruling D149, 2026-08-07; replaces the
    // 2026-07-24 hard-close semantic). A failed durable flush no longer
    // refuses draws — it pages. Two callbacks, two facts:
    //   1. the flush itself failed (this delta is at risk of being lost)
    //   2. a window admitted while unconfirmable (we spent against a
    //      balance we could not read)
    // Both are critical, because both mean the money instrumentation is
    // blind — which is exactly when a human should be looking.
    // IN-MEMORY SCREAM SUPPRESSION (round-3 red team). OpsAlertsService
    // dedupes through a unique index in the DATABASE BEING WRITTEN TO — so
    // during the exact outage these callbacks exist for, every admit
    // attempted an INSERT that failed, logged a second error, and collapsed
    // nothing: an alert storm whose off-switch was the thing that was down.
    // The dedupe keys already carry their time bucket, so a bounded seen-set
    // makes suppression survive the outage; the DB unique index remains the
    // cross-process backstop for when the store IS up.
    const screamedKeys = new Set<string>();
    const screamOnce = (key: string, scream: () => void): void => {
      if (screamedKeys.has(key)) return;
      if (screamedKeys.size > 1_000) screamedKeys.clear();
      screamedKeys.add(key);
      scream();
    };
    this.pools = new PoolRegistry(
      store,
      (poolName, error) => {
        const message = error instanceof Error ? error.message : String(error);
        const dedupeKey = `pool_bookkeeping_failure:${poolName}:${new Date()
          .toISOString()
          .slice(0, 13)}`;
        screamOnce(dedupeKey, () => {
          this.logger.error(
            'DURABLE POOL FLUSH FAILED — draws continue (D149 fail-open); a crash before the next successful flush loses this delta',
            { poolName, error: { message } },
          );
          this.opsAlerts.emit({
            severity: 'critical',
            kind: 'pool_bookkeeping_failure',
            title: `Pool bookkeeping failure: ${poolName}`,
            body:
              `Durable window flush failed for pool '${poolName}'. Draws ` +
              `CONTINUE (D149: a store hiccup must not refuse work), so ` +
              `month-to-date consumption for this pool is under-counted until ` +
              `a flush succeeds. Error: ${message}`,
            // Dedupe per pool per UTC hour: 'YYYY-MM-DDTHH' bucket.
            dedupeKey,
          });
        });
      },
      (poolName) => {
        const dedupeKey = `pool_window_unconfirmed:${poolName}:${new Date()
          .toISOString()
          .slice(0, 10)}`;
        screamOnce(dedupeKey, () => {
          this.logger.error(
            'POOL ADMITTED AGAINST AN UNCONFIRMED WINDOW — spending against a balance the store could not read (D149 fail-open)',
            { poolName },
          );
          this.opsAlerts.emit({
            severity: 'critical',
            kind: 'pool_window_unconfirmed',
            title: `Spending blind: ${poolName} window unconfirmed`,
            body:
              `Pool '${poolName}' admitted a draw while its durable window ` +
              `could not be confirmed from the store, so its ceiling is not ` +
              `being enforced right now. This is deliberate (D149: refusing ` +
              `real work over a DB blip is the worse failure) — but it means ` +
              `the backstop is OFF for this pool until the store recovers. ` +
              `Check Postgres and pool_window_consumption.`,
            // Per pool per UTC day: loud, but not a per-draw storm.
            dedupeKey,
          });
        });
      },
    );
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
    // OWNER-CHECKED 2026-08-07: the TomTom dashboard reports "QPS limits
    // not available for this key" — the standard pay-as-you-go tier exposes
    // no per-key ceiling, so the vendor's published Search-API default
    // (~5 QPS, the bottom of their documented 5-50 range) is the honest
    // conservative read. Raising this requires a plan that exposes QPS
    // management, not a code change. (Same fact as VENDOR_QPS_SPACING_MS.)
    const TOMTOM_VENDOR_QPS = 5;
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
    // tomtom.geocode DELETED 2026-08-08 (round-3 red team): the forward
    // geocode was its only writer, and the forward geocode died with the
    // per-rung anchored-lookup rederivation — a pool that can never be
    // drawn is a lie in the ops surface. Historic ledger rows keep their
    // 'geocode' operation and pricing (vendor-pricing.ts, HISTORICAL).
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
    // BACKSTOP #1 OF 2 — the gemini MONTHLY DOLLAR runaway stop (D149,
    // 2026-08-07), in micro-USD, metered from ACTUAL token counts at the
    // usage-ledger chokepoint (gemini-pricing.ts K4 rates).
    //
    // $1,500 is ~10x the MEASURED steady state ($155/mo — see
    // expected-monthly-spend.ts, which is the number the nightly comparator
    // actually watches). At that altitude a trip cannot mean "a busy month";
    // it can only mean a loop calling the vendor forever. That is the whole
    // job now: everyday spend is WATCHED (comparator alerts at 1x and 2x
    // expected), not GATED.
    //
    // What this replaced: a nightly derivation that recomputed the ceiling as
    // 3x trailing measured spend, bounded by a floor env var and a ceiling env
    // var, applied at boot and re-checked daily on the gate's own hot path.
    // Four moving parts and three env vars to express one number, and the
    // failure mode was that the ceiling silently TRACKED a runaway upward.
    // A fixed number an owner can read in one line is strictly better.
    //
    // THE FALSY-ZERO TRAP (red team 2026-08-02). `Number(env || '1500')` makes
    // a DELIBERATE 0 become 1500: an owner setting the cap to zero to halt
    // Gemini spend during an incident would restart into a live budget — the
    // exact opposite of the instruction. readSpendCapUsd is the one parser.
    const capUsd = readSpendCapUsd(
      process.env.GEMINI_MONTHLY_SPEND_CAP_USD,
      1500,
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
    // BACKSTOP #2 OF 2 — GOOGLE PLACES MONTHLY DOLLAR runaway stop, WORKER
    // ONLY (D149, 2026-08-07). $1,000 ≈ 10x the measured $100/mo steady
    // state.
    //
    // It used to be $200 and it used to be consulted on the USER path. That
    // combination produced the live organic 500 this whole rederivation came
    // from: create a poll about a restaurant we haven't seen before, the seed
    // needs one Places lookup, the month's pool says no, and the person gets
    // "something went wrong" — for a budget they cannot see, did not set, and
    // are not responsible for. A person waiting on a screen is never refused
    // by a number; google-places.service.ts consults this pool only when the
    // process is the worker (PROCESS_ROLE=worker), where a refusal just
    // requeues background work.
    //
    // Rate is still not budget: the per-op rate ceilings live in
    // configuration.ts and shape burst, not spend.
    const placesCapUsd = readSpendCapUsd(
      process.env.GOOGLE_PLACES_MONTHLY_SPEND_CAP_USD,
      1000,
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
    // GOOGLE VISION spend pool — registered ONLY when the owner has set a
    // cap. See VISION_SPEND_GATE: there is no measured month to derive a
    // default from, and a fabricated ceiling is worse than an absent one
    // because it looks like governance. `visionSpendCapConfigured` is what
    // the gate consults to tell "open" from "not armed".
    const visionCapRaw = process.env.GOOGLE_VISION_MONTHLY_SPEND_CAP_USD;
    if (visionCapRaw !== undefined && visionCapRaw.trim() !== '') {
      const visionCapUsd = readSpendCapUsd(visionCapRaw, 0);
      this.visionSpendCapConfigured = true;
      this.pools.register({
        name: 'googleVision.monthlySpend',
        credential: 'default',
        window: {
          kind: 'perMonth',
          limit: Math.round(visionCapUsd * 1_000_000),
          denomination: 'billedMicros',
        },
        reservationTtlMs: 60_000,
      });
    }
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
   * leaves the window unconfirmed — which since D149 means the pool ADMITS
   * and `onUnconfirmedAdmit` pages a human (grant pools are the exception and
   * still deny); ensureWindow retries on every draw. Boot itself never
   * fails.
   */
  async onModuleInit(): Promise<void> {
    await Promise.all(
      this.pools.listRegistered().map(async (pool) => {
        await this.pools.ensureWindow(pool.name);
        const status = this.pools.poolStatus(pool.name);
        if (status.storeConfirmed === false) {
          this.logger.warn(
            'Durable pool window not store-confirmed at boot — spending proceeds BLIND and alerts until the store recovers (D149 scream-never-kill; grant pools still deny)',
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
    // No campaign-grant re-registration: campaign envelopes live on the
    // spend_campaigns row (see the header note above) — restart-safe by
    // construction, nothing to rehydrate.
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
   *
   * D149: the limit is now a FIXED $1,500 (GEMINI_MONTHLY_SPEND_CAP_USD). The
   * daily "is the derivation still alive" health check that used to ride this
   * hot path is gone with the derivation it watched — there is nothing left to
   * go stale.
   */
  async assertGeminiSpendOpen(): Promise<void> {
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
   * D149 CALLER CONTRACT — WORKER PROCESSES ONLY. This gate throws, and a
   * throw on a user's request is a 500 for a budget they cannot see. The
   * single call site (google-places.service.ts) consults it only when the
   * process serves no HTTP traffic; see `gateWorkerSpend` there for why the
   * process role is the honest place to draw that line.
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

  /**
   * THE VISION DOLLAR GATE. Structurally the twin of the other three — it
   * lives on the governor and the vendor's one owner (GoogleVisionService)
   * calls it before every annotate request, so no call site can forget it.
   *
   * TWO HONEST DIFFERENCES, both stated rather than papered over:
   *
   *  1. UNARMED IS A REAL ANSWER. With no owner-set cap there is no pool to
   *     admit against, so this returns 'unarmed'. It does not silently
   *     succeed — the caller reports the gap once, so an ungoverned vendor
   *     is visible instead of merely absent.
   *  2. IT NEVER REFUSES A PERSON. Moderation runs on a user's upload, and
   *     D149 says a person is never refused by our own counter. So this
   *     REPORTS 'exhausted' rather than throwing; the caller proceeds and
   *     alerts. The gate's job here is to make a runaway loud, not to make a
   *     user's photo fail.
   */
  async visionSpendVerdict(): Promise<'open' | 'exhausted' | 'unarmed'> {
    if (!this.visionSpendCapConfigured) return 'unarmed';
    try {
      await assertSpendOpen(
        { pools: this.pools, opsAlerts: this.opsAlerts },
        VISION_SPEND_GATE,
      );
      return 'open';
    } catch (error) {
      if (error instanceof SpendBudgetClosedError) return 'exhausted';
      throw error;
    }
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
    // loads a freshly-rolled month). Since D149 the unconfirmed window ADMITS (scream-never-kill); only poison and exhaustion deny.
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
