import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../shared';
import { PoolRegistry, type PoolDenial } from './pool-registry';

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
export class GovernanceService {
  readonly pools = new PoolRegistry();
  private readonly logger: LoggerService;

  constructor(loggerService: LoggerService) {
    this.logger = loggerService;
    // TomTom pool facts (owner dashboard, master plan §26.6/Leg-5 record):
    // Search API (polygons) 2,500/month — the scarce pool; geocode +
    // reverse geocode 20,000/month each — the cheap pool. Month windows are
    // hard-closed on store failure by law (§14.5).
    this.pools.register({
      name: 'tomtom.cheapGeocode',
      credential: 'default',
      window: { kind: 'perMonth', limit: 20_000 },
      failPolicy: { kind: 'hardClosed' },
      reservationTtlMs: 60_000,
    });
    this.pools.register({
      name: 'tomtom.scarcePolygons',
      credential: 'default',
      window: { kind: 'perMonth', limit: 2_500 },
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
      this.pools.reconcile(reservation.reservationId, actual);
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
    const reservation = this.pools.reserve(poolName, 1, workClass);
    if (!reservation.admitted) {
      this.logDenial(poolName, workClass, reservation);
      return null;
    }
    try {
      const result = await act();
      this.pools.reconcile(reservation.reservationId, 1);
      return result;
    } catch (error) {
      // The call failed — no vendor budget was necessarily consumed, but we
      // conservatively debit 1 (the request likely reached the vendor).
      this.pools.reconcile(reservation.reservationId, 1);
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
