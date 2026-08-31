import type { BilledMicros } from '../shared/spend-currency';
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
 * Fail policy — SCREAM, NEVER KILL (owner ruling D149, 2026-08-07; replaces
 * the 2026-07-24 "every pool fails HARD" semantic).
 *
 * The old law said: a durable window the store cannot CONFIRM refuses every
 * draw until a flush succeeds. That is correct arithmetic and wrong product.
 * A Postgres hiccup is not evidence of overspending — it is evidence of a
 * hiccup — and under the old rule a five-second store blip refused real work,
 * including work a person was waiting on. The failure we were protecting
 * against (spending against an unknown balance) costs dollars; the failure we
 * caused (refusing the user) costs the product.
 *
 * So an unconfirmable window now ADMITS, and screams: critical ops alert,
 * deduped per pool per day, plus the error log that was already there. Two
 * carve-outs KEEP refusing, because for them a refusal is the honest answer:
 *   - GRANT pools (campaign envelopes, §14.6) — the ceiling is an OWNER
 *     DECISION about a specific spend, not a safety rail we invented. Handing
 *     out capacity we cannot prove exists spends someone's approved envelope
 *     twice.
 *   - POISONED credentials — the VENDOR said stop. Admitting is not
 *     generosity, it is a 429 storm.
 * Rate pacers (perMinute windows) are unaffected: they were never durable.
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
 * Store-failure law (§14.5, rederived by D149): a durable pool whose window
 * the store cannot CONFIRM (boot load failed, write-through failed, or the
 * window rolled and no load has succeeded yet) fails OPEN and LOUD —
 * reserve()/admit() admit, and `onUnconfirmedAdmit` fires so the caller can
 * page a human. Grant pools are the exception and still deny with the typed
 * 'storeFailure' reason.
 */

/**
 * WHAT A POOL'S CEILING COUNTS (F119 / D13).
 *
 * 'quantity'    — requests, tokens, items: things you can COUNT.
 * 'billedMicros'— micro-USD the VENDOR charges, as branded by
 *                 spend-currency.ts. A dollar ceiling metered in ledger
 *                 dollars is looser than it reads by exactly our metering
 *                 error (measured ~1.7x on Gemini).
 *
 * spend-currency.ts made the amount's currency unrepresentable-if-wrong one
 * level up; its own header records that guarding this with a call-site scan
 * "is the wrong level". This is the missing half: the POOL declares its
 * currency, so `meter()` (quantity) and `meterSpend()` (billed micros)
 * accept only pools denominated in what they carry, and metering a ceiling
 * in the wrong currency does not COMPILE.
 */
export type Denomination = 'quantity' | 'billedMicros';

export type PoolWindow =
  | { kind: 'perMinute'; limit: number; denomination: Denomination }
  | { kind: 'perDay'; limit: number; denomination: Denomination }
  | { kind: 'perMonth'; limit: number; denomination: Denomination }
  /** Money grants: a bounded pool INSTANCE minted by an owner approval
   *  (§14.6) — refills only by a new grant, never by the clock. */
  | { kind: 'grant'; amount: number; denomination: Denomination };

/**
 * A registered pool, carrying its denomination in the TYPE. The phantom `D`
 * is what makes the metering split real: there is no way to obtain a
 * PoolHandle<'quantity'> for a dollar pool — `register` returns the handle
 * the config declared, and `spendPool`/`quantityPool` re-derive it from the
 * registration and THROW on a mismatch. No cast, no caller-must-remember.
 */
export type PoolHandle<D extends Denomination = Denomination> = {
  readonly name: string;
  readonly denomination: D;
};

export type PoolConfig<D extends Denomination = Denomination> = {
  /** '<vendor>.<resource>' e.g. 'tomtom.scarcePolygons'; internal pools use
   *  'internal.<resource>'. */
  name: string;
  /** (vendor, credential) keying (§14.1): multi-app sharding composes. */
  credential: string;
  window: PoolWindow & { denomination: D };
  /** Reservation TTL — a leaked (never-reconciled) reservation expires. */
  reservationTtlMs: number;
};

export type PoolDenial = {
  admitted: false;
  /** Typed 'not now' (§14.7/§12.3): requeue; NEVER an error outcome, never a
   *  term cooldown, never a fail-open pass-through. 'upstreamRateLimited' =
   *  a vendor 429 has POISONED the CREDENTIAL this pool draws on (§14.5), so
   *  the retry-after is honored across every pool sharing that key — not
   *  just the pool whose request happened to receive the 429. */
  /** 'storeFailure' now reaches GRANT POOLS ONLY (D149): every other durable
   *  pool admits on an unconfirmable window and screams instead. */
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
 * the registry translates every failure into UNCONFIRMED window state, which
 * since D149 means admit-and-scream (grant pools excepted), not refuse.
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
 * a failed write-through or a window roll clears it → the window is
 * UNCONFIRMED until the next successful ensureWindow, which since D149 admits
 * and pages a human rather than refusing (grant pools still deny). `unpersisted` is consumption applied in
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
  /**
   * §14.5 upstream-429 cooldown: (vendor, credential) → poisoned-until.
   *
   * KEYED BY CREDENTIAL, NOT BY POOL, and that is the whole point. A 429 is
   * the vendor throttling an API KEY — TomTom's published QPS is scoped "for
   * an API key and the products it is using", so every pool drawing on that
   * key is throttled by one 429, not just the pool that happened to receive
   * it.
   *
   * This used to be keyed by pool, and the old comment on poisonWindow
   * explained why that was safe: the retry-after was "honored GLOBALLY
   * through the one pool". That was TRUE when a vendor had one pool. The
   * 2026-07-30 split into tomtom.reverseGeocode / tomtom.geocode /
   * tomtom.scarcePolygons was correct for the reason it was made — TomTom's
   * FREE ALLOWANCES are per API family (20,000/month EACH), so one bucket
   * self-blocked while the vendor still had capacity — but it silently broke
   * this invariant, and the word "one" survived as a fossil.
   *
   * The lesson is the modeling one: a POOL models a vendor ALLOWANCE, a
   * CREDENTIAL models a vendor KEY. Those are different resources. Budget is
   * per-allowance; rate is per-key. Splitting on the first without moving
   * what belongs to the second left two of TomTom's three pools drawing
   * against a key the vendor had just told us to back off from.
   */
  private readonly poisonedUntil = new Map<string, number>();
  private readonly durable = new Map<string, DurableWindowState>();
  /** Grant pools: capacity registered at boot; store `granted` adds on top. */
  private readonly grantBase = new Map<string, number>();

  constructor(
    private readonly store?: PoolConsumptionStore,
    /** §24 red team finding 9 ("loud durable-flush failure"): flushDurable
     *  used to swallow a store write failure into `confirmed = false`
     *  silently — which since D149 means the next reserve() ADMITS blind
     *  (§14.5, scream-never-kill), and a crash before the next successful
     *  flush loses the unpersisted
     *  delta with no signal anyone ever saw. Optional so callers that don't
     *  care (most tests) pay nothing; governance.service.ts wires a
     *  logger.error + critical ops-alert callback. */
    private readonly onDurableFlushFailure?: (
      poolName: string,
      error: unknown,
    ) => void,
    /** D149 "scream, never kill": fires when a durable non-grant window
     *  ADMITS while the store could not confirm it. The registry does not
     *  know how to page a human; governance.service.ts wires the critical
     *  ops alert (deduped per pool per day). Optional — most tests pass
     *  nothing and pay nothing. MUST NOT throw. */
    private readonly onUnconfirmedAdmit?: (poolName: string) => void,
  ) {}

  register<D extends Denomination>(config: PoolConfig<D>): PoolHandle<D> {
    if (this.pools.has(config.name)) {
      throw new PoolRegistrationError(
        `Pool '${config.name}' already registered`,
      );
    }
    // THE NAME SHAPE DECIDES ADMISSION, SO IT IS CHECKED.
    //
    // PoolConfig has always documented '<vendor>.<resource>', and until the
    // 429 cooldown moved onto the credential that was purely cosmetic — a
    // malformed name cost nothing. It is now load-bearing: credentialKeyOf
    // derives the vendor from the prefix, and a name with no '.' would yield
    // an EMPTY vendor, silently sharing one cooldown with every other
    // malformed pool across unrelated vendors. A convention that decides
    // whether a vendor's back-off reaches the right pools cannot stay a
    // comment.
    const dot = config.name.indexOf('.');
    if (dot <= 0 || dot === config.name.length - 1) {
      throw new PoolRegistrationError(
        `Pool name '${config.name}' is not '<vendor>.<resource>'. The vendor ` +
          `prefix keys the upstream-429 cooldown, which is shared by every ` +
          `pool drawing on the same credential — a name without a non-empty ` +
          `vendor and resource cannot be keyed correctly.`,
      );
    }
    this.pools.set(config.name, config);
    if (config.window.kind === 'grant') {
      this.grantBase.set(config.name, config.window.amount);
    }
    return { name: config.name, denomination: config.window.denomination };
  }

  /**
   * Typed handle for an ALREADY-registered pool, for the metering sites that
   * do not own the registration (usage-ledger meters pools governance.service
   * registered at boot). Not a cast: the denomination is read back off the
   * registration, and asking for the wrong currency throws here rather than
   * silently draining a dollar ceiling in the wrong units.
   */
  spendPool(name: string): PoolHandle<'billedMicros'> {
    return this.handle(name, 'billedMicros');
  }

  quantityPool(name: string): PoolHandle<'quantity'> {
    return this.handle(name, 'quantity');
  }

  private handle<D extends Denomination>(name: string, want: D): PoolHandle<D> {
    const pool = this.requirePool(name);
    if (pool.window.denomination !== want) {
      throw new PoolRegistrationError(
        `Pool '${name}' is denominated in ${pool.window.denomination}, not ${want}`,
      );
    }
    return { name, denomination: want };
  }

  /**
   * A durable pool's LIMIT changes only at boot (env-seeded) or here — never
   * mid-window by arbitrary write.
   *
   * NO PRODUCTION CALLER SINCE D149 (2026-08-07). Its one caller was the
   * nightly backstop re-derivation, which the owner ruled out of existence:
   * ceilings are fixed env-seeded numbers now, so nothing re-derives one at
   * runtime. Kept rather than deleted because it is the only honest way to
   * change a live ceiling without a restart — the shape an ops action would
   * need — and because the governance specs use it to drive a pool to
   * exhaustion. If that ops action never arrives, this is a legitimate
   * deletion candidate. Rejects a
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
   * row ends monotonically ≥ everything this process admitted.
   * No-op for perMinute pools and for already-confirmed windows.
   * Never throws; failure leaves the window unconfirmed → reserve() admits
   * and fires `onUnconfirmedAdmit` (D149; grant pools still deny).
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
      const initialKey = state?.windowKey;
      // WINDOW-ROLL TAIL (round 2 ⑤, drift class): consumption metered
      // against the PREVIOUS window but never flushed used to be silently
      // dropped on roll — a plausible contributor to the ~5% Gemini
      // reconcile drift. Flush it to ITS OWN window key first, best-effort.
      if (
        state &&
        initialKey !== undefined &&
        initialKey !== key &&
        state.unpersisted > 0
      ) {
        try {
          await this.store.add(pool.name, initialKey, {
            consumed: state.unpersisted,
          });
          state.unpersisted = 0;
        } catch (error) {
          // Round-3 C4: continuing here used to CLOBBER the tail at the
          // bottom of this function (residualNow() sees the old window and
          // returns 0). Bail instead: the window stays unconfirmed and the
          // next ensureWindow retries the tail flush. ALERT on the way out:
          // since D149 an unconfirmed window ADMITS (scream, never kill), so
          // a persistent store failure means we are spending against a
          // balance we cannot read — louder, not quieter, than the old
          // wedged-into-denial behavior this alert was written for.
          this.onDurableFlushFailure?.(pool.name, error);
          return;
        }
      }
      const carried = state && state.windowKey === key ? state.unpersisted : 0;
      let addSucceeded = false;
      // Residual = consumption that landed DURING the awaits and is not yet
      // persisted (step 5, H6 lost-update): if the in-memory state is
      // already on THIS window, everything above `carried` is residual; if
      // it's still on the pre-call window, this is a roll and the old
      // window's tail follows the original semantics; a THIRD window means
      // someone else rolled mid-call — leave their state alone (F7a).
      const residualNow = (): number | null => {
        const current = this.durable.get(pool.name);
        if (!current) return 0;
        if (current.windowKey === key) {
          return current.unpersisted - carried;
        }
        if (current.windowKey === initialKey) {
          // Consumption landed on the PRE-ROLL window mid-call — bail so
          // the overwrite below can't discard it (round-3 C4 secondary).
          return current.unpersisted > 0 ? null : 0;
        }
        return null;
      };
      try {
        if (carried > 0) {
          await this.store.add(pool.name, key, { consumed: carried });
        }
        addSucceeded = true;
        const loaded = await this.store.load(pool.name, key);
        const residualValue = residualNow();
        if (residualValue === null) {
          return;
        }
        const residual = residualValue;
        this.usage.set(pool.name, {
          windowStart: this.windowKeyStart(pool, at),
          used: (loaded?.consumed ?? 0) + Math.max(0, residual),
        });
        if (pool.window.kind === 'grant') {
          pool.window = {
            ...pool.window,
            amount:
              (this.grantBase.get(pool.name) ?? 0) + (loaded?.granted ?? 0),
          };
        }
        this.durable.set(pool.name, {
          windowKey: key,
          confirmed: true,
          unpersisted: Math.max(0, residual),
        });
      } catch (error) {
        // If the add committed and only the load failed, the carried delta
        // is already persisted — re-marking it unpersisted would flush it
        // twice (red team F7b). Preserve any residual consumed mid-call.
        // REPORT THE CAUSE (audit 2026-08-31): this catch used to swallow
        // the error entirely, so every "spending blind" alert read
        // "Unknown error" and the outage was undiagnosable from the alert
        // that exists to diagnose it. Same channel as the tail-flush report.
        this.onDurableFlushFailure?.(pool.name, error);
        const residualValue = residualNow();
        if (residualValue === null) {
          return;
        }
        this.durable.set(pool.name, {
          windowKey: key,
          confirmed: false,
          unpersisted:
            (addSucceeded ? 0 : carried) + Math.max(0, residualValue),
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
   * IT FAILS OPEN AND SCREAMS on an unconfirmed store (D149). `ensureWindow`'s
   * catch leaves `confirmed:false` WITHOUT populating usage, so `windowUsed`
   * reads 0 — a store hiccup used to look like "the month reset to zero", and
   * the old rule refused every draw rather than trust that zero. Both readings
   * are wrong for the same reason: the store's silence says nothing about the
   * balance. Refusing is the expensive wrong answer (it stops real work,
   * including a person's), so admission proceeds and `onUnconfirmedAdmit`
   * pages a human instead. Grant pools keep the refusal — see reserve().
   */
  async admit(
    poolName: string,
    at: Date = new Date(),
    ttlMs = 30_000,
  ): Promise<
    | { admitted: true; storeUnconfirmed: boolean }
    | {
        admitted: false;
        reason: 'poisoned' | 'exhausted';
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
    const storeUnconfirmed = status.storeConfirmed === false;
    if (storeUnconfirmed) {
      // Admit — but a window we cannot read is also a window whose `used`
      // reads 0, so the exhaustion check below is meaningless here. Say so
      // out loud and let the work through.
      this.onUnconfirmedAdmit?.(poolName);
      return { admitted: true, storeUnconfirmed: true };
    }
    if (status.used >= status.limit) {
      return {
        admitted: false,
        reason: 'exhausted',
        retryAfterMs: status.resetMs,
      };
    }
    return { admitted: true, storeUnconfirmed: false };
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
    pool.window = { ...pool.window, amount: pool.window.amount + amount };
  }

  reserve(
    poolName: string,
    declared: number,
    workClass: string,
    at: Date = new Date(),
  ): PoolReservation | PoolDenial {
    const pool = this.requirePool(poolName);
    this.expireLeaks(at);
    const credentialKey = this.credentialKeyOf(pool);
    const poisoned = this.poisonedUntil.get(credentialKey);
    if (poisoned !== undefined) {
      if (poisoned > at.getTime()) {
        return {
          admitted: false,
          reason: 'upstreamRateLimited',
          retryAfterMs: poisoned - at.getTime(),
        };
      }
      this.poisonedUntil.delete(credentialKey);
    }
    // §14.5 store-failure law, rederived by D149 — SCREAM, NEVER KILL.
    //
    // A durable window the store has not CONFIRMED means we cannot prove
    // month-to-date consumption. For a GRANT pool that is disqualifying: the
    // envelope is an owner's decision about a specific spend, and handing out
    // capacity we cannot account for spends it twice. For every other durable
    // pool the ceiling is a runaway backstop we invented, and refusing real
    // work because Postgres blinked is the more expensive mistake — so admit,
    // and page a human on the way through.
    if (this.isDurable(pool)) {
      const key = this.windowKeyString(pool, at);
      const durableState = this.durable.get(pool.name);
      if (
        !durableState ||
        durableState.windowKey !== key ||
        !durableState.confirmed
      ) {
        if (pool.window.kind === 'grant') {
          return {
            admitted: false,
            reason: 'storeFailure',
            retryAfterMs: null,
          };
        }
        this.onUnconfirmedAdmit?.(poolName);
        this.reservationCounter += 1;
        const unconfirmedId = `res-${this.reservationCounter}`;
        this.reservations.set(unconfirmedId, {
          id: unconfirmedId,
          poolName,
          declared,
          reservedAt: at,
          expiresAt: new Date(at.getTime() + pool.reservationTtlMs),
          workClass,
        });
        return {
          admitted: true,
          reservationId: unconfirmedId,
          poolName,
          declared,
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
   * §14.5: an upstream 429 poisons the CREDENTIAL the pool draws on — every
   * reserve against any pool sharing that (vendor, credential) is denied
   * ('upstreamRateLimited') until now + retryAfter. Extends, never shortens.
   *
   * The caller still names a POOL, because a 429 arrives on a request and a
   * request is made against a pool. Resolving pool → credential here is what
   * keeps that convenience from becoming the scope error; see poisonedUntil.
   */
  poisonWindow(
    poolName: string,
    retryAfterMs: number,
    at: Date = new Date(),
  ): void {
    const key = this.credentialKeyOf(this.requirePool(poolName));
    const until = at.getTime() + Math.max(0, retryAfterMs);
    const existing = this.poisonedUntil.get(key);
    if (existing === undefined || until > existing) {
      this.poisonedUntil.set(key, until);
    }
  }

  /**
   * The vendor key a pool draws against.
   *
   * Vendor comes from the pool NAME, whose '<vendor>.<resource>' shape
   * PoolConfig has always documented and register() now refuses to accept a
   * violation of — a convention that decides admission has to be checked,
   * not merely described. The credential dimension keeps multi-app sharding
   * composing (§14.1): two keys for the same vendor are two rate budgets and
   * must not poison each other. NUL-joined because neither part may contain
   * it, so the key cannot be forged by a name that embeds the separator.
   */
  private credentialKeyOf(pool: PoolConfig): string {
    return `${pool.name.slice(0, pool.name.indexOf('.'))}\u0000${pool.credential}`;
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
    const poisoned = this.poisonedUntil.get(this.credentialKeyOf(pool));
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
   * unconfirmed, so the NEXT reserve admits blind and pages (D149).
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
  meterSpend(
    pool: PoolHandle<'billedMicros'>,
    billed: BilledMicros,
    at: Date = new Date(),
  ): Promise<void> {
    return this.consumeMetered(pool.name, billed, at);
  }

  /**
   * Quantity pools only (requests, tokens, items). A dollar pool cannot be
   * passed here — its handle is PoolHandle<'billedMicros'> and this signature
   * accepts only 'quantity', so the F119 mistake
   * (`meter('gemini.monthlySpend', someLedgerNumber)`) no longer compiles.
   */
  meter(
    pool: PoolHandle<'quantity'>,
    amount: number,
    at: Date = new Date(),
  ): Promise<void> {
    return this.consumeMetered(pool.name, amount, at);
  }

  private consumeMetered(
    poolName: string,
    amount: number,
    at: Date,
  ): Promise<void> {
    const pool = this.requirePool(poolName);
    if (!Number.isFinite(amount) || amount <= 0) {
      return Promise.resolve();
    }
    // THE METERED PATH SCREAMS TOO (round-3 red team). D149's fail-open
    // scream fired only on reserve()/admit() — but campaign/grant pools are
    // consumed exclusively through THIS path, so the one pool family whose
    // ceiling is an owner's approved envelope was the one family spending
    // blind with NO scream while its window was unconfirmed. Same callback,
    // same suppression, same meaning: bookkeeping is blind, a human should
    // know. (The envelope's real ENFORCEMENT is elsewhere and unaffected —
    // the atomic spend_campaigns UPDATE; this pool is its ledger mirror.)
    if (this.isDurable(pool)) {
      const state = this.durable.get(pool.name);
      if (
        (!state ||
          !state.confirmed ||
          state.windowKey !== this.windowKeyString(pool, at)) &&
        this.onUnconfirmedAdmit
      ) {
        this.onUnconfirmedAdmit(pool.name);
      }
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
   * confirmation — which since D149 means the next admission goes through
   * blind and loud, not refused. Never throws.
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
