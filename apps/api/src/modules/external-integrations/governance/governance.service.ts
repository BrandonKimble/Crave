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
