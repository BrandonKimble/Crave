/**
 * The Resource Governor's pool registry (master plan §14/§27 v2): every scarce
 * resource — vendor windows (reddit requests/min, gemini tokens/min, TomTom
 * monthly pools), INTERNAL capacity (db.ingest, host.cpu), and money grants —
 * is an adapter-registered pool row. No enum: adding a vendor is writing an
 * adapter, touching zero governor code.
 *
 * THE draw primitive is reserve → act → reconcile (§14.2): admission is a
 * TTL-bounded reservation of declared demand; the chokepoint records actuals;
 * reconcile refunds over-declares / debits under-declares; leaked reservations
 * expire by TTL. Declared-vs-actual pairs are the estimator-drift instrument.
 *
 * Fail policy is a PER-POOL declaration (§14.5), never an env switch:
 * minute-window pools may declare a bounded per-replica emergency fraction;
 * day/month/dollar/enqueued pools are hard-closed on store failure (an
 * in-memory counter cannot know month-to-date).
 */

export type PoolWindow =
  | { kind: 'perMinute'; limit: number }
  | { kind: 'perDay'; limit: number }
  | { kind: 'perMonth'; limit: number }
  /** Money grants: a bounded pool INSTANCE minted by an owner approval
   *  (§14.6) — refills only by a new grant, never by the clock. */
  | { kind: 'grant'; amount: number };

export type PoolFailPolicy =
  /** Store failure → bounded per-replica emergency window (fraction of the
   *  minute limit), duration-capped, journaled for post-recovery replay. */
  | { kind: 'emergencyFraction'; fraction: number }
  /** Store failure → the pool is closed. Denials are typed 'not now' — they
   *  never brand cooldowns and never trip fail-open judgment layers. */
  | { kind: 'hardClosed' };

export type PoolConfig = {
  /** '<vendor>.<resource>' e.g. 'tomtom.scarcePolygons'; internal pools use
   *  'internal.<resource>'. */
  name: string;
  /** (vendor, credential) keying (§14.1): multi-app sharding composes. */
  credential: string;
  window: PoolWindow;
  failPolicy: PoolFailPolicy;
  /** Reservation TTL — a leaked (never-reconciled) reservation expires. */
  reservationTtlMs: number;
};

export type PoolDenial = {
  admitted: false;
  /** Typed 'not now' (§14.7/§12.3): requeue; NEVER an error outcome, never a
   *  term cooldown, never a fail-open pass-through. */
  reason: 'exhausted' | 'storeFailure';
  retryAfterMs: number | null;
};

export type PoolReservation = {
  admitted: true;
  reservationId: string;
  poolName: string;
  declared: number;
};

export type DrawRecord = {
  poolName: string;
  credential: string;
  declared: number;
  actual: number | null;
  reservedAt: Date;
  reconciledAt: Date | null;
  /** Work-class dimension for per-class drift measurement + preflight pricing
   *  (draw ledger absorbs quota/usage/request ledgers — §21.4). */
  workClass: string;
};

type ActiveReservation = {
  id: string;
  poolName: string;
  declared: number;
  reservedAt: Date;
  expiresAt: Date;
  workClass: string;
};

export class PoolRegistrationError extends Error {}

export class PoolRegistry {
  private readonly pools = new Map<string, PoolConfig>();
  private readonly usage = new Map<
    string,
    { windowStart: number; used: number }
  >();
  private readonly reservations = new Map<string, ActiveReservation>();
  private readonly drawLedger: DrawRecord[] = [];
  private reservationCounter = 0;

  register(config: PoolConfig): void {
    if (this.pools.has(config.name)) {
      throw new PoolRegistrationError(
        `Pool '${config.name}' already registered`,
      );
    }
    // Constitutional check (§14.5): only minute-window pools may declare an
    // emergency fraction — longer windows cannot be locally approximated.
    if (
      config.failPolicy.kind === 'emergencyFraction' &&
      config.window.kind !== 'perMinute'
    ) {
      throw new PoolRegistrationError(
        `Pool '${config.name}': emergencyFraction is only legal on perMinute ` +
          `windows (an in-memory counter cannot know ${config.window.kind} usage)`,
      );
    }
    this.pools.set(config.name, config);
  }

  listRegistered(): PoolConfig[] {
    return Array.from(this.pools.values());
  }

  /** Mint a grant top-up (owner approval → capacity; §14.6). */
  mintGrant(poolName: string, amount: number): void {
    const pool = this.requirePool(poolName);
    if (pool.window.kind !== 'grant') {
      throw new PoolRegistrationError(`Pool '${poolName}' is not grant-backed`);
    }
    pool.window = { kind: 'grant', amount: pool.window.amount + amount };
  }

  reserve(
    poolName: string,
    declared: number,
    workClass: string,
    at: Date = new Date(),
  ): PoolReservation | PoolDenial {
    const pool = this.requirePool(poolName);
    this.expireLeaks(at);
    const capacity = this.windowCapacity(pool);
    const used = this.windowUsed(pool, at) + this.reservedOutstanding(poolName);
    if (used + declared > capacity) {
      return {
        admitted: false,
        reason: 'exhausted',
        retryAfterMs: this.retryHintMs(pool, at),
      };
    }
    this.reservationCounter += 1;
    const id = `res-${this.reservationCounter}`;
    this.reservations.set(id, {
      id,
      poolName,
      declared,
      reservedAt: at,
      expiresAt: new Date(at.getTime() + pool.reservationTtlMs),
      workClass,
    });
    return { admitted: true, reservationId: id, poolName, declared };
  }

  /** Record actuals + release the reservation (refund/debit falls out). */
  reconcile(
    reservationId: string,
    actual: number,
    at: Date = new Date(),
  ): void {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      return; // Expired leak — TTL already released it; actuals still ledger below.
    }
    this.reservations.delete(reservationId);
    this.consume(reservation.poolName, actual, at);
    this.drawLedger.push({
      poolName: reservation.poolName,
      credential: this.requirePool(reservation.poolName).credential,
      declared: reservation.declared,
      actual,
      reservedAt: reservation.reservedAt,
      reconciledAt: at,
      workClass: reservation.workClass,
    });
  }

  /** The persisted declared-vs-actual stream — the drift instrument (§14.7). */
  readDrawLedger(): readonly DrawRecord[] {
    return this.drawLedger;
  }

  /**
   * Ledger-only declared-vs-actual pair for a draw whose WINDOW was already
   * consumed elsewhere (dispatch-level admission consumed the estimate;
   * actuals arrive at async completion). Never consumes capacity — it feeds
   * the §14.2 drift instrument only.
   */
  recordActualPair(
    poolName: string,
    workClass: string,
    declared: number,
    actual: number,
    at: Date = new Date(),
  ): void {
    const pool = this.requirePool(poolName);
    this.drawLedger.push({
      poolName,
      credential: pool.credential,
      declared,
      actual,
      reservedAt: at,
      reconciledAt: at,
      workClass,
    });
  }

  /** Measured drift per work class: actual ÷ declared (1 = perfect). */
  measureDrift(workClass: string): number | null {
    const rows = this.drawLedger.filter(
      (row) => row.workClass === workClass && row.actual != null,
    );
    if (!rows.length) {
      return null;
    }
    const declared = rows.reduce((sum, row) => sum + row.declared, 0);
    const actual = rows.reduce((sum, row) => sum + (row.actual ?? 0), 0);
    return declared > 0 ? actual / declared : null;
  }

  private requirePool(name: string): PoolConfig {
    const pool = this.pools.get(name);
    if (!pool) {
      throw new PoolRegistrationError(`Pool '${name}' is not registered`);
    }
    return pool;
  }

  private windowCapacity(pool: PoolConfig): number {
    switch (pool.window.kind) {
      case 'perMinute':
      case 'perDay':
      case 'perMonth':
        return pool.window.limit;
      case 'grant':
        return pool.window.amount;
    }
  }

  private windowKeyStart(pool: PoolConfig, at: Date): number {
    switch (pool.window.kind) {
      case 'perMinute':
        return Math.floor(at.getTime() / 60_000);
      case 'perDay':
        return Math.floor(at.getTime() / 86_400_000);
      case 'perMonth':
        return at.getUTCFullYear() * 100 + at.getUTCMonth();
      case 'grant':
        return 0; // Grants never refill by the clock.
    }
  }

  private windowUsed(pool: PoolConfig, at: Date): number {
    const entry = this.usage.get(pool.name);
    const windowStart = this.windowKeyStart(pool, at);
    if (!entry || entry.windowStart !== windowStart) {
      return 0;
    }
    return entry.used;
  }

  private consume(poolName: string, amount: number, at: Date): void {
    const pool = this.requirePool(poolName);
    const windowStart = this.windowKeyStart(pool, at);
    const entry = this.usage.get(poolName);
    if (!entry || entry.windowStart !== windowStart) {
      this.usage.set(poolName, { windowStart, used: amount });
      return;
    }
    entry.used += amount;
    if (pool.window.kind === 'grant') {
      // Grants deplete permanently (windowStart never rolls).
      entry.windowStart = windowStart;
    }
  }

  private reservedOutstanding(poolName: string): number {
    let total = 0;
    for (const reservation of this.reservations.values()) {
      if (reservation.poolName === poolName) {
        total += reservation.declared;
      }
    }
    return total;
  }

  private expireLeaks(at: Date): void {
    for (const [id, reservation] of this.reservations) {
      if (reservation.expiresAt.getTime() <= at.getTime()) {
        this.reservations.delete(id);
      }
    }
  }

  private retryHintMs(pool: PoolConfig, at: Date): number | null {
    switch (pool.window.kind) {
      case 'perMinute':
        return 60_000 - (at.getTime() % 60_000);
      case 'perDay':
        return 86_400_000 - (at.getTime() % 86_400_000);
      case 'perMonth': {
        const next = new Date(
          Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1),
        );
        return next.getTime() - at.getTime();
      }
      case 'grant':
        return null; // Refills only by owner approval.
    }
  }
}
