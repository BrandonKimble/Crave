import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggerService } from '../../../shared';
import { PoolRegistry, type PoolDenial } from './pool-registry';
import { PrismaPoolConsumptionStore } from './pool-consumption.store';

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

  constructor(loggerService: LoggerService, store: PrismaPoolConsumptionStore) {
    this.logger = loggerService;
    // §14.5 durable window store: month/grant window consumption is written
    // through to Postgres and loaded at boot — a restart can never reset the
    // TomTom month ledgers. perMinute pools stay memory-only (see the
    // registry header for the §16-classified split).
    this.pools = new PoolRegistry(store);
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
      // SEED MONTH (owner-ratified 2026-07-22, off the free tier): raised to
      // cover the one-time US polygon seed's ~22.7k geometry-id lookups on
      // top of normal probe traffic. RETURN to 20_000 once the promotion
      // backlog reads 0 (follow-up commit; K1 re-ratify).
      window: { kind: 'perMonth', limit: 45_000 },
      failPolicy: { kind: 'hardClosed' },
      reservationTtlMs: 60_000,
    });
    // §16 K1 (owner price-tag): the scarce polygon pool is a PAID monthly
    // budget, not a free-tier fact — ratified 2026-07-22 "off the free tier"
    // (master plan §2.5(a)). 10,000/mo ≈ a ~$25/mo ceiling at ~$2.5/1k
    // Search-API polygon draws; the pool stays hardClosed + durably stored,
    // so the ceiling is structural. Adjusting the number = owner re-ratify.
    this.pools.register({
      name: 'tomtom.scarcePolygons',
      credential: 'default',
      // SEED MONTH (owner-ratified 2026-07-22): one-time raise to drain the
      // ~22.7k-row US polygon seed backlog THIS month. RETURN to 10_000
      // (the standing ~\$25/mo price-tag) once the backlog reads 0.
      window: { kind: 'perMonth', limit: 25_000 },
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
