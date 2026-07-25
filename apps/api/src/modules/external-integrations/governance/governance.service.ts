import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggerService } from '../../../shared';
import { PoolRegistry, type PoolDenial } from './pool-registry';
import { PrismaPoolConsumptionStore } from './pool-consumption.store';
import { PrismaService } from '../../../prisma/prisma.service';

/** '<vendor>.<resource>'-shaped pool name for a campaign's §14.6 grant —
 *  mirrors spend-campaign.service.ts's private campaignPoolName (kept
 *  local rather than exported/imported to avoid a governance <-> shared
 *  circular import; it's a one-line naming convention, not logic). */
function campaignPoolName(campaignId: string): string {
  return `campaign.${campaignId}`;
}

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
@Injectable()
export class GovernanceService implements OnModuleInit {
  readonly pools: PoolRegistry;
  private readonly logger: LoggerService;

  constructor(
    loggerService: LoggerService,
    store: PrismaPoolConsumptionStore,
    private readonly prisma: PrismaService,
  ) {
    this.logger = loggerService;
    // §14.5 durable window store: month/grant window consumption is written
    // through to Postgres and loaded at boot — a restart can never reset the
    // TomTom month ledgers. perMinute pools stay memory-only (see the
    // registry header for the §16-classified split).
    this.pools = new PoolRegistry(store, (poolName, error) => {
      this.logger.error(
        'DURABLE POOL FLUSH FAILED — a crash before the next successful flush loses this delta',
        {
          poolName,
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        },
      );
    });
    // TomTom pool facts: geocode + reverse geocode 20,000/month each — the
    // cheap pool (free-tier vendor fact, K4). Month windows are hard-closed
    // on store failure by law (§14.5).
    // §16 on reservationTtlMs (all pools below): K3-shaped operational
    // bounds, not product numbers — a TTL is "how long a leaked reservation
    // may hold capacity before expiry reclaims it" (§14.2 leaks expire).
    // Sized to the slowest honest act per pool (60s ≈ one synchronous call;
    // 120s ≈ a paged/batched dispatch); pacer-derived refinement replaces
    // them when the estimator-refresher lands (§22 deferred reader).
    this.pools.register({
      name: 'tomtom.cheapGeocode',
      credential: 'default',
      // REVERTED post-seed (2026-07-24): the one-time US polygon seed is
      // 98.5% drained (22,424/22,758); the 334 stragglers are month-window
      // vendor misses that retry trivially inside this standing limit.
      window: { kind: 'perMonth', limit: 20_000 },
      failPolicy: { kind: 'hardClosed' },
      reservationTtlMs: 60_000,
    });
    // §24.1 Tier 3 backstop (demoted 2026-07-24, §24.4 item 3 — NO
    // functional change this leg): tomtom.cheapGeocode / scarcePolygons stay
    // owner PRICE-TAGS, not re-derived backstops like gemini's, because no
    // in-repo $-per-draw price table exists for TomTom yet (§24.2 —
    // inventing one here would violate §16's no-fake-estimates law; that
    // gap is tracked, not invented around). The drain's spend becomes a
    // Tier-2 lane with its own cost baseline once that table lands; the
    // month window here survives ONLY as the attempt-backoff clock for the
    // 334 stragglers, unchanged — spend itself stays owner-governed until
    // §24.2's TomTom price table exists.
    //
    // §16 K1 (owner price-tag): the scarce polygon pool is a PAID monthly
    // budget, not a free-tier fact — ratified 2026-07-22 "off the free tier"
    // (master plan §2.5(a)). 10,000/mo ≈ a ~$25/mo ceiling at ~$2.5/1k
    // Search-API polygon draws; the pool stays hardClosed + durably stored,
    // so the ceiling is structural. Adjusting the number = owner re-ratify.
    this.pools.register({
      name: 'tomtom.scarcePolygons',
      credential: 'default',
      // REVERTED post-seed (2026-07-24) to the standing ~$25/mo price-tag;
      // the seed-month 25k raise served its one purpose.
      window: { kind: 'perMonth', limit: 10_000 },
      failPolicy: { kind: 'hardClosed' },
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
    // guessed). emergencyFraction mirrors the limiter's 0.95 quota headroom.
    const envMaxTpm = parseInt(process.env.LLM_MAX_TPM || '', 10);
    this.pools.register({
      name: 'gemini.tokens',
      credential: 'default',
      window: {
        kind: 'perMinute',
        limit:
          Number.isFinite(envMaxTpm) && envMaxTpm > 0 ? envMaxTpm : 4_000_000,
      },
      failPolicy: { kind: 'emergencyFraction', fraction: 0.95 },
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
    const capUsd = Number(process.env.GEMINI_MONTHLY_SPEND_CAP_USD || '300');
    this.pools.register({
      name: 'gemini.monthlySpend',
      credential: 'default',
      window: {
        kind: 'perMonth',
        limit: Math.round(
          (Number.isFinite(capUsd) && capUsd > 0 ? capUsd : 300) * 1_000_000,
        ),
      },
      failPolicy: { kind: 'hardClosed' },
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
      window: { kind: 'perMinute', limit: 100 },
      // §16: 0.1 is §14.5's "bounded per-replica emergency fraction (derived
      // share of the window)" for minute-window pools — 10 req/min of
      // emergency headroom when the governance store is down; part of the
      // §18.2 per-pool fail-policy TABLE awaiting owner ratification.
      failPolicy: { kind: 'emergencyFraction', fraction: 0.1 },
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
          window: { kind: 'grant', amount: envelopeMicros },
          failPolicy: { kind: 'hardClosed' },
          reservationTtlMs: 60_000,
        });
        const spentMicros = Number(row.spentMicros);
        if (spentMicros > 0) {
          await this.pools.meter(poolName, spentMicros);
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
        return;
      }
      const before = this.pools.poolStatus('gemini.monthlySpend').limit;
      const after = Math.round(row.microUsdPerUnit);
      if (after <= 0 || after === before) {
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
  async draw<T>(
    poolName: string,
    workClass: string,
    act: () => Promise<T>,
  ): Promise<T | null> {
    const outcome = await this.drawWithOutcome(poolName, workClass, act);
    return outcome.admitted ? outcome.value : null;
  }

  /**
   * Same draw primitive, but a denial returns its typed details (retryAfter)
   * instead of a bare null — the §12.5 per-request chokepoint needs them to
   * retry THROUGH the governor (each retry is a NEW draw) and to surface a
   * typed not-now when attempts exhaust.
   */
  async drawWithOutcome<T>(
    poolName: string,
    workClass: string,
    act: () => Promise<T>,
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
      return { admitted: true, value: result };
    } catch (error) {
      // The call failed — no vendor budget was necessarily consumed, but we
      // conservatively debit 1 (the request likely reached the vendor).
      await this.pools.reconcile(reservation.reservationId, 1);
      throw error;
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
