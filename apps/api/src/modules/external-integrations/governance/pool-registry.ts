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
 *
 * DURABILITY (§14.5/§16 split — durability leg, 2026-07-20): window
 * CONSUMPTION for perMonth/perDay/grant pools is written through to a
 * PoolConsumptionStore on every reconcile and loaded at boot/rollover — a
 * process restart can never reset a month ledger (the recorded over-spend
 * gap). perMinute pools stay in-memory by design (restart loses ≤1 minute of
 * window — harmless; no DB I/O on the per-request hot path), and the
 * declared-vs-actual draw ledger stays in-memory too (drift is statistical;
 * a durable ledger is the §18.5 ops-readers leg). Reservations are never
 * stored — seconds-scale, TTL-expiring (§14.2).
 *
 * Store-failure law (§14.5): a durable pool whose window the store cannot
 * CONFIRM (boot load failed, write-through failed, or the window rolled and
 * no load has succeeded yet) fails CLOSED — reserve() denies with the typed
 * 'storeFailure' reason. Durable pools are hardClosed by construction (the
 * constitutional check already forbids emergencyFraction off perMinute).
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
   *  term cooldown, never a fail-open pass-through. 'upstreamRateLimited' =
   *  the window is POISONED by a vendor 429 (§14.5 upstream-429 window
   *  poisoning kept) — retryAfter is honored globally through the pool. */
  reason: 'exhausted' | 'storeFailure' | 'upstreamRateLimited';
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

/**
 * Durable window-consumption store (§14.5): one row per (pool, window).
 * `add` must be an ATOMIC increment (concurrent processes compose); `load`
 * returns null for a window with no row yet. Implementations may only throw —
 * the registry translates every failure into fail-closed window state.
 */
export interface PoolConsumptionStore {
  load(
    poolName: string,
    windowKey: string,
  ): Promise<{ consumed: number; granted: number } | null>;
  add(
    poolName: string,
    windowKey: string,
    delta: { consumed?: number; granted?: number },
  ): Promise<void>;
}

/**
 * Per-durable-pool window state. `confirmed` is set ONLY by a successful
 * store load for the current window ("memory agrees with the store");
 * a failed write-through or a window roll clears it → fail closed until the
 * next successful ensureWindow. `unpersisted` is consumption applied in
 * memory whose write-through hasn't succeeded yet — flushed before the next
 * load so the stored row is monotonically ≥ everything this process admitted.
 */
type DurableWindowState = {
  windowKey: string;
  confirmed: boolean;
  unpersisted: number;
};

export class PoolRegistry {
  private readonly pools = new Map<string, PoolConfig>();
  private readonly usage = new Map<
    string,
    { windowStart: number; used: number }
  >();
  private readonly reservations = new Map<string, ActiveReservation>();
  private readonly drawLedger: DrawRecord[] = [];
  private reservationCounter = 0;
  /** §14.5 upstream-429 window poisoning: pool → poisoned-until instant. */
  private readonly poisonedUntil = new Map<string, number>();
  private readonly durable = new Map<string, DurableWindowState>();
  /** Grant pools: capacity registered at boot; store `granted` adds on top. */
  private readonly grantBase = new Map<string, number>();

  constructor(private readonly store?: PoolConsumptionStore) {}

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
    if (config.window.kind === 'grant') {
      this.grantBase.set(config.name, config.window.amount);
    }
  }

  /** perMonth/perDay/grant + a store present → window consumption is durable. */
  private isDurable(pool: PoolConfig): boolean {
    return this.store !== undefined && pool.window.kind !== 'perMinute';
  }

  /** Canonical UTC window label: 'YYYY-MM' / 'YYYY-MM-DD' / 'grant'. */
  private windowKeyString(pool: PoolConfig, at: Date): string {
    switch (pool.window.kind) {
      case 'perMonth':
        return at.toISOString().slice(0, 7);
      case 'perDay':
        return at.toISOString().slice(0, 10);
      case 'grant':
        return 'grant';
      case 'perMinute':
        throw new PoolRegistrationError(
          `Pool '${pool.name}' is perMinute — never durable`,
        );
    }
  }

  /**
   * Load (and confirm) a durable pool's current window from the store —
   * called at boot and awaited by GovernanceService.draw before reserve (so
   * the first draw after a restart or a month roll sees month-to-date truth).
   * Flushes any unpersisted local consumption FIRST, then loads: the stored
   * row ends monotonically ≥ everything this process admitted. Never throws;
   * failure leaves the window unconfirmed → reserve() fails closed (§14.5).
   * No-op for perMinute pools and for already-confirmed windows.
   */
  async ensureWindow(poolName: string, at: Date = new Date()): Promise<void> {
    const pool = this.requirePool(poolName);
    if (!this.isDurable(pool) || this.store === undefined) {
      return;
    }
    const key = this.windowKeyString(pool, at);
    const state = this.durable.get(pool.name);
    if (
      state &&
      state.windowKey === key &&
      state.confirmed &&
      state.unpersisted === 0
    ) {
      return;
    }
    const carried = state && state.windowKey === key ? state.unpersisted : 0;
    try {
      if (carried > 0) {
        await this.store.add(pool.name, key, { consumed: carried });
      }
      const loaded = await this.store.load(pool.name, key);
      this.usage.set(pool.name, {
        windowStart: this.windowKeyStart(pool, at),
        used: loaded?.consumed ?? 0,
      });
      if (pool.window.kind === 'grant') {
        pool.window = {
          kind: 'grant',
          amount: (this.grantBase.get(pool.name) ?? 0) + (loaded?.granted ?? 0),
        };
      }
      this.durable.set(pool.name, {
        windowKey: key,
        confirmed: true,
        unpersisted: 0,
      });
    } catch {
      this.durable.set(pool.name, {
        windowKey: key,
        confirmed: false,
        unpersisted: carried,
      });
    }
  }

  listRegistered(): PoolConfig[] {
    return Array.from(this.pools.values());
  }

  /**
   * Mint a grant top-up (owner approval → capacity; §14.6). Durable pools
   * persist the mint (a money grant must survive restart); a store failure
   * THROWS — an owner mint that didn't durably land must be retried, never
   * silently in-memory-only.
   */
  async mintGrant(poolName: string, amount: number): Promise<void> {
    const pool = this.requirePool(poolName);
    if (pool.window.kind !== 'grant') {
      throw new PoolRegistrationError(`Pool '${poolName}' is not grant-backed`);
    }
    if (this.isDurable(pool) && this.store !== undefined) {
      await this.store.add(poolName, 'grant', { granted: amount });
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
    const poisoned = this.poisonedUntil.get(poolName);
    if (poisoned !== undefined) {
      if (poisoned > at.getTime()) {
        return {
          admitted: false,
          reason: 'upstreamRateLimited',
          retryAfterMs: poisoned - at.getTime(),
        };
      }
      this.poisonedUntil.delete(poolName);
    }
    // §14.5 store-failure law: a durable pool whose current window the store
    // has not CONFIRMED fails closed. Durable pools are hardClosed by
    // construction; a typed 'not now' — never an error, never fail-open.
    if (this.isDurable(pool)) {
      const key = this.windowKeyString(pool, at);
      const durableState = this.durable.get(pool.name);
      if (
        !durableState ||
        durableState.windowKey !== key ||
        !durableState.confirmed
      ) {
        return {
          admitted: false,
          reason: 'storeFailure',
          retryAfterMs: null,
        };
      }
    }
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

  /**
   * Free a reservation WITHOUT consuming capacity or writing a ledger row —
   * the pacer's dispatch-grain admission peek (§14.3 "whose declared pools
   * all reserve") releases its hold once the dispatch is enqueued; the
   * per-request chokepoint draws (§12.5) do the real window accounting when
   * the requests actually happen, and the dispatch-grain declared-vs-actual
   * pair is ledgered separately via recordActualPair.
   */
  release(reservationId: string): void {
    this.reservations.delete(reservationId);
  }

  /**
   * §14.5 (kept): an upstream 429 poisons the pool's window — every reserve
   * is denied ('upstreamRateLimited') until now + retryAfter, so a vendor
   * retry-after is honored GLOBALLY through the one pool (§12.5), never per
   * caller. Extends, never shortens, an existing poison.
   */
  poisonWindow(
    poolName: string,
    retryAfterMs: number,
    at: Date = new Date(),
  ): void {
    this.requirePool(poolName);
    const until = at.getTime() + Math.max(0, retryAfterMs);
    const existing = this.poisonedUntil.get(poolName);
    if (existing === undefined || until > existing) {
      this.poisonedUntil.set(poolName, until);
    }
  }

  /** Read-only window snapshot (ops/status readers — never admission). */
  poolStatus(
    poolName: string,
    at: Date = new Date(),
  ): {
    limit: number;
    used: number;
    reservedOutstanding: number;
    /** ms until the window rolls (null for grants). */
    resetMs: number | null;
    poisonedForMs: number | null;
    /** Durable pools: is the current window store-confirmed? null = not durable. */
    storeConfirmed: boolean | null;
  } {
    const pool = this.requirePool(poolName);
    this.expireLeaks(at);
    const poisoned = this.poisonedUntil.get(poolName);
    const durableState = this.isDurable(pool)
      ? this.durable.get(pool.name)
      : undefined;
    return {
      limit: this.windowCapacity(pool),
      used: this.windowUsed(pool, at),
      reservedOutstanding: this.reservedOutstanding(poolName),
      resetMs: this.retryHintMs(pool, at),
      poisonedForMs:
        poisoned !== undefined && poisoned > at.getTime()
          ? poisoned - at.getTime()
          : null,
      storeConfirmed: this.isDurable(pool)
        ? (durableState?.confirmed ?? false) &&
          durableState?.windowKey === this.windowKeyString(pool, at)
        : null,
    };
  }

  /**
   * Record actuals + release the reservation (refund/debit falls out).
   * In-memory bookkeeping happens SYNCHRONOUSLY before the returned promise
   * settles; the promise is the durable write-through for perMonth/perDay/
   * grant pools (a synchronous durable increment — they are low-rate money).
   * The write-through never rejects: a store failure marks the window
   * unconfirmed, so the NEXT reserve fails closed (§14.5).
   */
  reconcile(
    reservationId: string,
    actual: number,
    at: Date = new Date(),
  ): Promise<void> {
    const reservation = this.reservations.get(reservationId);
    if (!reservation) {
      // Expired leak — TTL already released it; nothing to consume or ledger
      // (the declared/actual pair died with the leak).
      return Promise.resolve();
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
    return this.flushDurable(reservation.poolName);
  }

  /**
   * Write through this process's unpersisted consumption for a durable pool.
   * Success on an already-confirmed window keeps it confirmed; failure clears
   * confirmation (fail closed). Never throws.
   */
  private async flushDurable(poolName: string): Promise<void> {
    const pool = this.requirePool(poolName);
    if (!this.isDurable(pool) || this.store === undefined) {
      return;
    }
    const state = this.durable.get(poolName);
    if (!state || state.unpersisted <= 0) {
      return;
    }
    const delta = state.unpersisted;
    try {
      await this.store.add(poolName, state.windowKey, { consumed: delta });
      state.unpersisted -= delta;
    } catch {
      state.confirmed = false;
    }
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
    } else {
      entry.used += amount;
      if (pool.window.kind === 'grant') {
        // Grants deplete permanently (windowStart never rolls).
        entry.windowStart = windowStart;
      }
    }
    // Durable pools: track the not-yet-persisted delta for write-through.
    // A reconcile that lands AFTER the window rolled (reservation straddled
    // the boundary) re-keys the state unconfirmed — the new window must be
    // loaded before it can admit again.
    if (this.isDurable(pool)) {
      const key = this.windowKeyString(pool, at);
      const state = this.durable.get(poolName);
      if (state && state.windowKey === key) {
        state.unpersisted += amount;
      } else {
        this.durable.set(poolName, {
          windowKey: key,
          confirmed: false,
          unpersisted: amount,
        });
      }
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
