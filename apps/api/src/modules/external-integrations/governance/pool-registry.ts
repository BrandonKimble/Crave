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
 * Fail policy (single semantic, owner decision 2026-07-24): every pool fails
 * HARD. There are no per-pool carve-outs and no emergency fractions — on any
 * durable-flush failure the affected window is closed (draws refuse) until a
 * flush succeeds again, loudly (error log + critical ops alert).
 *
 * DURABILITY (§14.5/§16 split — durability leg, 2026-07-20): window
 * CONSUMPTION for perMonth/perDay/grant pools is written through to a
 * PoolConsumptionStore on every reconcile and loaded at boot/rollover — a
 * process restart can never reset a month ledger (the recorded over-spend
 * gap). perMinute pools stay in-memory by design (restart loses ≤1 minute of
 * window — harmless; no DB I/O on the per-request hot path), and the
 * declared-vs-actual draw ledger stays IN-MEMORY BY DESIGN (drift is
 * statistical; a restart just restarts the sample). Durable persistence of
 * the draw ledger is trigger-deferred — the trigger being an actual need
 * for drift samples to survive restarts (§18.5 closed without it).
 * Reservations are never stored — seconds-scale, TTL-expiring (§14.2).
 *
 * Store-failure law (§14.5): a durable pool whose window the store cannot
 * CONFIRM (boot load failed, write-through failed, or the window rolled and
 * no load has succeeded yet) fails CLOSED — reserve() denies with the typed
 * 'storeFailure' reason. This is the one and only failure semantic: hard.
 */

export type PoolWindow =
  | { kind: 'perMinute'; limit: number }
  | { kind: 'perDay'; limit: number }
  | { kind: 'perMonth'; limit: number }
  /** Money grants: a bounded pool INSTANCE minted by an owner approval
   *  (§14.6) — refills only by a new grant, never by the clock. */
  | { kind: 'grant'; amount: number };

export type PoolConfig = {
  /** '<vendor>.<resource>' e.g. 'tomtom.scarcePolygons'; internal pools use
   *  'internal.<resource>'. */
  name: string;
  /** (vendor, credential) keying (§14.1): multi-app sharding composes. */
  credential: string;
  window: PoolWindow;
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

  constructor(
    private readonly store?: PoolConsumptionStore,
    /** §24 red team finding 9 ("loud durable-flush failure"): flushDurable
     *  used to swallow a store write failure into `confirmed = false`
     *  silently — correct for the NEXT reserve() (fails closed, §14.5), but
     *  a crash before the next successful flush loses the unpersisted
     *  delta with no signal anyone ever saw. Optional so callers that don't
     *  care (most tests) pay nothing; governance.service.ts wires a
     *  logger.error + critical ops-alert callback. */
    private readonly onDurableFlushFailure?: (
      poolName: string,
      error: unknown,
    ) => void,
  ) {}

  register(config: PoolConfig): void {
    if (this.pools.has(config.name)) {
      throw new PoolRegistrationError(
        `Pool '${config.name}' already registered`,
      );
    }
    this.pools.set(config.name, config);
    if (config.window.kind === 'grant') {
      this.grantBase.set(config.name, config.window.amount);
    }
  }

  /**
   * §24.4/§24.1 Tier-3: a durable pool's LIMIT changes only at boot
   * (env-seeded) or here, by the backstop re-derivation job — never
   * mid-window by arbitrary write. Callers: SpendAnalyticsService's nightly
   * refresh, after computing BACKSTOP_MULTIPLE × trailing measured monthly
   * spend (plans/geo-demand-foundation-rebuild.md §24.4 item 4). Rejects a
   * pool with no registered window (typo/never-registered) and rejects a
   * grant pool (grants refill only by owner approval, never a derived
   * limit). Does not touch usage/reservations — only the window's capacity;
   * the caller logs old -> new for the audit trail.
   */
  resetLimit(poolName: string, limit: number): void {
    const pool = this.requirePool(poolName);
    if (pool.window.kind === 'grant') {
      throw new PoolRegistrationError(
        `Pool '${poolName}': resetLimit is not legal on a grant pool ` +
          `(grants refill only by owner approval, §14.6)`,
      );
    }
    if (!Number.isFinite(limit) || limit <= 0) {
      throw new PoolRegistrationError(
        `Pool '${poolName}': resetLimit requires a finite positive limit ` +
          `(got ${limit})`,
      );
    }
    this.pools.set(poolName, {
      ...pool,
      window: { ...pool.window, limit },
    });
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
  /** Last time admit() re-read a pool's durable window (TTL bookkeeping). */
  private readonly lastAdmitRefreshAt = new Map<string, number>();

  /** SINGLE-FLIGHT per pool (async-integrity step 5, H6): flushDurable and
   *  ensureWindow both read-modify-write `unpersisted` around awaits — two
   *  overlapping calls double-persisted one delta and then suppressed
   *  subsequent flushes (negative unpersisted), and ensureWindow's
   *  unconditional `unpersisted: 0` discarded consumes that landed during
   *  its awaits. Every durable write now runs on a per-pool chain. */
  private readonly durableWriteChains = new Map<string, Promise<void>>();

  private serializeDurable(
    poolName: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    const prev = this.durableWriteChains.get(poolName);
    const next = prev ? prev.then(fn, fn) : fn();
    this.durableWriteChains.set(poolName, next);
    return next;
  }

  async ensureWindow(poolName: string, at: Date = new Date()): Promise<void> {
    return this.serializeDurable(poolName, async () => {
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
        // A consume() may have landed during the awaits above — subtract
        // what was actually flushed instead of zeroing, so nothing metered
        // is discarded (step 5, H6 lost-update).
        const current = this.durable.get(pool.name);
        const residual =
          current && current.windowKey === key
            ? current.unpersisted - carried
            : 0;
        this.usage.set(pool.name, {
          windowStart: this.windowKeyStart(pool, at),
          used: (loaded?.consumed ?? 0) + Math.max(0, residual),
        });
        if (pool.window.kind === 'grant') {
          pool.window = {
            kind: 'grant',
            amount:
              (this.grantBase.get(pool.name) ?? 0) + (loaded?.granted ?? 0),
          };
        }
        this.durable.set(pool.name, {
          windowKey: key,
          confirmed: true,
          unpersisted: Math.max(0, residual),
        });
      } catch {
        this.durable.set(pool.name, {
          windowKey: key,
          confirmed: false,
          unpersisted: carried,
        });
      }
    });
  }

  /**
   * ADMISSION for meter-only durable pools (the dollar backstops).
   *
   * Why this exists: `ensureWindow` deliberately returns early once a window
   * is confirmed and fully persisted, so after boot a process NEVER re-reads
   * the store. That is correct for a pool this process draws from — its own
   * in-memory tally is authoritative. It is WRONG for a pool that SIBLING
   * PROCESSES also spend against: api and worker each deploy separately
   * (scripts/rig/deploy.sh ships both), so each held its own view of
   * month-to-date spend and a $475 cap was really ~$475 PER PROCESS.
   *
   * So admission re-reads the durable window on a short TTL — a monthly
   * dollar window does not need per-call freshness, but it must not be
   * frozen at boot for a month.
   *
   * It also fails CLOSED on an unconfirmed store. `ensureWindow`'s catch
   * leaves `confirmed:false` WITHOUT populating usage, so `windowUsed`
   * reads 0 — a store hiccup silently reset the month to zero spend. A
   * budget that cannot prove what it has spent must not admit.
   */
  async admit(
    poolName: string,
    at: Date = new Date(),
    ttlMs = 30_000,
  ): Promise<
    | { admitted: true }
    | {
        admitted: false;
        reason: 'poisoned' | 'exhausted' | 'unconfirmed';
        retryAfterMs: number | null;
      }
  > {
    const lastAt = this.lastAdmitRefreshAt.get(poolName) ?? 0;
    if (at.getTime() - lastAt >= ttlMs) {
      const pool = this.requirePool(poolName);
      // Force a store read: drop the confirmed flag so ensureWindow cannot
      // take its early return, then restore state through the normal path.
      const state = this.durable.get(pool.name);
      if (state) {
        this.durable.set(pool.name, { ...state, confirmed: false });
      }
      await this.ensureWindow(poolName, at);
      this.lastAdmitRefreshAt.set(poolName, at.getTime());
    }

    const status = this.poolStatus(poolName, at);
    if (status.poisonedForMs !== null && status.poisonedForMs > 0) {
      return {
        admitted: false,
        reason: 'poisoned',
        retryAfterMs: status.poisonedForMs,
      };
    }
    if (status.storeConfirmed === false) {
      return { admitted: false, reason: 'unconfirmed', retryAfterMs: null };
    }
    if (status.used >= status.limit) {
      return {
        admitted: false,
        reason: 'exhausted',
        retryAfterMs: status.resetMs,
      };
    }
    return { admitted: true };
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
    // §14.5 store-failure law (single semantic — every pool fails HARD): a
    // durable pool whose current window the store has not CONFIRMED fails
    // closed; a typed 'not now' — never an error, never fail-open.
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
   * METERED ACTUALS (2026-07-24, the gemini spend pool): some pools track a
   * quantity only known AFTER the act (dollars from actual token counts) —
   * no reservation makes sense, the act already happened. meter() consumes
   * directly; admission control comes from the SAME window (a gate checks
   * poolStatus before dispatching new work). Fire-and-forget durable flush.
   */
  meter(
    poolName: string,
    amount: number,
    at: Date = new Date(),
  ): Promise<void> {
    const pool = this.requirePool(poolName);
    if (!Number.isFinite(amount) || amount <= 0) {
      return Promise.resolve();
    }
    this.consume(poolName, amount, at);
    return this.isDurable(pool) && this.store !== undefined
      ? this.flushDurable(poolName)
      : Promise.resolve();
  }

  /**
   * VENDOR-LEDGER ALIGNMENT (§14.2 taken to its logical end, 2026-07-24):
   * vendors that return live rate-limit headers (reddit:
   * x-ratelimit-remaining/reset) publish THEIR window ledger on every
   * response — and theirs is truth, ours is the estimate. The cooperative
   * pattern is to align after every response instead of discovering
   * divergence at a 429: when the vendor says fewer draws remain than our
   * window believes (their window is shared with token mints, other
   * processes, clock skew), consume the gap so admission reflects reality;
   * when the vendor says zero remain, poison until their reset. Alignment
   * only ever TIGHTENS — a vendor reporting MORE headroom than our ledger
   * never loosens ours (our limit may be deliberately below the vendor's,
   * and a pool must never exceed its owner-priced budget).
   */
  alignToVendor(
    poolName: string,
    vendorRemaining: number,
    vendorResetMs: number | null,
    at: Date = new Date(),
  ): Promise<void> {
    const pool = this.requirePool(poolName);
    this.expireLeaks(at);
    if (!Number.isFinite(vendorRemaining)) {
      return Promise.resolve();
    }
    if (vendorRemaining <= 0 && vendorResetMs !== null && vendorResetMs > 0) {
      this.poisonWindow(poolName, vendorResetMs, at);
    }
    const status = this.poolStatus(poolName, at);
    const ourRemaining = Math.max(
      0,
      status.limit - status.used - status.reservedOutstanding,
    );
    const gap = ourRemaining - Math.max(0, Math.floor(vendorRemaining));
    if (gap <= 0) {
      return Promise.resolve();
    }
    this.consume(poolName, gap, at);
    return this.isDurable(pool) && this.store !== undefined
      ? this.flushDurable(poolName)
      : Promise.resolve();
  }

  /**
   * Write through this process's unpersisted consumption for a durable pool.
   * Success on an already-confirmed window keeps it confirmed; failure clears
   * confirmation (fail closed). Never throws.
   */
  private async flushDurable(poolName: string): Promise<void> {
    return this.serializeDurable(poolName, async () => {
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
      } catch (error) {
        state.confirmed = false;
        this.onDurableFlushFailure?.(poolName, error);
      }
    });
  }

  /** The IN-MEMORY declared-vs-actual stream — the drift instrument (§14.7).
   *  Not persisted; see the header's durability note (trigger-deferred). */
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
