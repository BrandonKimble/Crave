import {
  PoolRegistry,
  PoolRegistrationError,
  type PoolConfig,
  type PoolConsumptionStore,
} from './pool-registry';

/** In-memory PoolConsumptionStore double — shared across registry instances
 *  to simulate the durable substrate surviving a process restart. */
class FakeConsumptionStore implements PoolConsumptionStore {
  readonly rows = new Map<string, { consumed: number; granted: number }>();
  loadCalls = 0;
  addCalls = 0;
  failing = false;

  private key(poolName: string, windowKey: string): string {
    return `${poolName}|${windowKey}`;
  }

  load(poolName: string, windowKey: string) {
    this.loadCalls += 1;
    if (this.failing) {
      return Promise.reject(new Error('store down'));
    }
    return Promise.resolve(
      this.rows.get(this.key(poolName, windowKey)) ?? null,
    );
  }

  add(
    poolName: string,
    windowKey: string,
    delta: { consumed?: number; granted?: number },
  ) {
    this.addCalls += 1;
    if (this.failing) {
      return Promise.reject(new Error('store down'));
    }
    const key = this.key(poolName, windowKey);
    const row = this.rows.get(key) ?? { consumed: 0, granted: 0 };
    row.consumed += delta.consumed ?? 0;
    row.granted += delta.granted ?? 0;
    this.rows.set(key, row);
    return Promise.resolve();
  }
}

const minutePool = (over: Partial<PoolConfig> = {}): PoolConfig => ({
  name: 'reddit.requests',
  credential: 'app-1',
  window: { kind: 'perMinute', limit: 100, denomination: 'quantity' },
  reservationTtlMs: 60_000,
  ...over,
});

describe('PoolRegistry (master plan §14 v2)', () => {
  const t0 = new Date('2026-07-16T12:00:00Z');

  // REWRITTEN (D149, 2026-08-07). This asserted the OLD law: 'HARD-CLOSE
  // EVERYWHERE (single fail semantic): a flush failure refuses the next draw,
  // and only a successful flush re-opens the pool'. The owner reversed it — a
  // store hiccup must not refuse real work — so the same scenario now asserts
  // the opposite outcome plus the scream that replaces the refusal.
  it('SCREAM, NEVER KILL: a flush failure ADMITS the next draw and fires onUnconfirmedAdmit', async () => {
    const store = new FakeConsumptionStore();
    const unconfirmedAdmits: string[] = [];
    const registry = new PoolRegistry(store, undefined, (poolName) =>
      unconfirmedAdmits.push(poolName),
    );
    registry.register(
      minutePool({
        name: 'tomtom.scarcePolygons',
        window: { kind: 'perMonth', limit: 2500, denomination: 'quantity' },
      }),
    );
    await registry.ensureWindow('tomtom.scarcePolygons', t0);
    const res = registry.reserve('tomtom.scarcePolygons', 5, 'us-seed', t0);
    expect(res.admitted).toBe(true);
    store.failing = true;
    if (res.admitted) await registry.reconcile(res.reservationId, 5, t0);
    // MUTATION-PROVABLE: restore the storeFailure denial in reserve() and
    // both of these red.
    const admitted = registry.reserve('tomtom.scarcePolygons', 1, 'probe', t0);
    expect(admitted.admitted).toBe(true);
    expect(unconfirmedAdmits).toEqual(['tomtom.scarcePolygons']);
    // Still admitting while the store stays down — and still screaming.
    await registry.ensureWindow('tomtom.scarcePolygons', t0);
    expect(
      registry.reserve('tomtom.scarcePolygons', 1, 'probe', t0).admitted,
    ).toBe(true);
    expect(unconfirmedAdmits.length).toBeGreaterThan(1);
    // A successful flush stops the screaming (the window is confirmed again).
    store.failing = false;
    await registry.ensureWindow('tomtom.scarcePolygons', t0);
    const quietBefore = unconfirmedAdmits.length;
    expect(
      registry.reserve('tomtom.scarcePolygons', 1, 'probe', t0).admitted,
    ).toBe(true);
    expect(unconfirmedAdmits.length).toBe(quietBefore);
  });

  it('METERED spend on an unconfirmed window SCREAMS too (round-3: the envelope was the one blind spender)', async () => {
    const store = new FakeConsumptionStore();
    const screams: string[] = [];
    const registry = new PoolRegistry(store, undefined, (poolName) =>
      screams.push(poolName),
    );
    registry.register(
      minutePool({
        name: 'campaign.austin-reload',
        window: { kind: 'grant', amount: 500, denomination: 'billedMicros' },
      }),
    );
    // Window never loaded → unconfirmed. Metering through it must page.
    const handle = registry.spendPool('campaign.austin-reload');
    await registry.meterSpend(handle, 5 as never, t0);
    expect(screams).toEqual(['campaign.austin-reload']);
  });

  it('A GRANT POOL STILL REFUSES on an unconfirmable window — an owner envelope is not ours to spend blind', () => {
    const store = new FakeConsumptionStore();
    const registry = new PoolRegistry(store);
    registry.register(
      minutePool({
        name: 'campaign.austin-reload',
        window: { kind: 'grant', amount: 500, denomination: 'billedMicros' },
      }),
    );
    // Never loaded → the grant window is unconfirmed.
    const denied = registry.reserve('campaign.austin-reload', 1, 'probe', t0);
    expect(denied.admitted).toBe(false);
    if (!denied.admitted) expect(denied.reason).toBe('storeFailure');
  });

  it('reserve→reconcile: refunds over-declares, ledgers declared-vs-actual', () => {
    const registry = new PoolRegistry();
    registry.register(minutePool());
    const res = registry.reserve('reddit.requests', 40, 'chronological', t0);
    expect(res.admitted).toBe(true);
    // While reserved, the declared amount blocks capacity...
    const second = registry.reserve('reddit.requests', 70, 'keyword', t0);
    expect(second.admitted).toBe(false);
    // ...and reconciling with a smaller actual refunds the difference.
    if (res.admitted) {
      void registry.reconcile(res.reservationId, 10, t0);
    }
    const third = registry.reserve('reddit.requests', 70, 'keyword', t0);
    expect(third.admitted).toBe(true);
    const ledger = registry.readDrawLedger();
    expect(ledger[0]).toMatchObject({
      declared: 40,
      actual: 10,
      workClass: 'chronological',
    });
    expect(registry.measureDrift('chronological')).toBeCloseTo(0.25);
  });

  describe('vendor-ledger alignment (§14.2 alignToVendor)', () => {
    it('TIGHTENS to the vendor remaining when it is below ours', async () => {
      const registry = new PoolRegistry();
      registry.register(
        minutePool({
          window: { kind: 'perMinute', limit: 100, denomination: 'quantity' },
        }),
      );
      // Vendor says 30 remain; we believe 100 → consume the 70 gap.
      await registry.alignToVendor('reddit.requests', 30, 60_000, t0);
      const status = registry.poolStatus('reddit.requests', t0);
      expect(status.used).toBe(70);
      // Admission now reflects the vendor's reality.
      expect(
        registry.reserve('reddit.requests', 31, 'chronological', t0).admitted,
      ).toBe(false);
      expect(
        registry.reserve('reddit.requests', 30, 'chronological', t0).admitted,
      ).toBe(true);
    });

    it('NEVER loosens: vendor headroom above ours is ignored (owner budget stands)', async () => {
      const registry = new PoolRegistry();
      registry.register(
        minutePool({
          window: { kind: 'perMinute', limit: 10, denomination: 'quantity' },
        }),
      );
      const res = registry.reserve('reddit.requests', 8, 'chronological', t0);
      if (res.admitted) await registry.reconcile(res.reservationId, 8, t0);
      // Vendor claims 600 remain — our 10-limit window keeps only 2 free.
      await registry.alignToVendor('reddit.requests', 600, 60_000, t0);
      expect(
        registry.reserve('reddit.requests', 3, 'keyword', t0).admitted,
      ).toBe(false);
      expect(
        registry.reserve('reddit.requests', 2, 'keyword', t0).admitted,
      ).toBe(true);
    });

    it('vendor ZERO remaining poisons until the vendor reset', async () => {
      const registry = new PoolRegistry();
      registry.register(
        minutePool({
          window: { kind: 'perMinute', limit: 100, denomination: 'quantity' },
        }),
      );
      await registry.alignToVendor('reddit.requests', 0, 45_000, t0);
      const denied = registry.reserve('reddit.requests', 1, 'keyword', t0);
      expect(denied.admitted).toBe(false);
      if (!denied.admitted) {
        expect(denied.reason).toBe('upstreamRateLimited');
        expect(denied.retryAfterMs).toBeGreaterThanOrEqual(44_000);
      }
    });
  });

  it('denials are typed not-now with a retry hint, never throws', () => {
    const registry = new PoolRegistry();
    registry.register(
      minutePool({
        window: { kind: 'perMinute', limit: 5, denomination: 'quantity' },
      }),
    );
    const res = registry.reserve('reddit.requests', 10, 'chronological', t0);
    expect(res.admitted).toBe(false);
    if (!res.admitted) {
      expect(res.reason).toBe('exhausted');
      expect(res.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it('release frees a hold with ZERO consumption and ZERO ledger rows (pacer admission peek)', () => {
    const registry = new PoolRegistry();
    registry.register(minutePool());
    const res = registry.reserve('reddit.requests', 40, 'dispatch-peek', t0);
    expect(res.admitted).toBe(true);
    if (res.admitted) {
      registry.release(res.reservationId);
    }
    // Full capacity is back — nothing was consumed by the peek.
    const after = registry.reserve('reddit.requests', 100, 'keyword', t0);
    expect(after.admitted).toBe(true);
    expect(registry.readDrawLedger()).toHaveLength(0);
  });

  it('an upstream 429 poisons the window: every draw denied until retryAfter elapses (§14.5)', () => {
    const registry = new PoolRegistry();
    registry.register(minutePool());
    registry.poisonWindow('reddit.requests', 30_000, t0);
    const denied = registry.reserve('reddit.requests', 1, 'chronological', t0);
    expect(denied.admitted).toBe(false);
    if (!denied.admitted) {
      expect(denied.reason).toBe('upstreamRateLimited');
      expect(denied.retryAfterMs).toBe(30_000);
    }
    // Poison never shortens: a smaller later retryAfter does not un-poison.
    registry.poisonWindow('reddit.requests', 1_000, t0);
    const still = registry.reserve(
      'reddit.requests',
      1,
      'chronological',
      new Date(t0.getTime() + 20_000),
    );
    expect(still.admitted).toBe(false);
    // After the retry-after elapses the pool admits again.
    const later = registry.reserve(
      'reddit.requests',
      1,
      'chronological',
      new Date(t0.getTime() + 31_000),
    );
    expect(later.admitted).toBe(true);
  });

  describe('a 429 throttles the CREDENTIAL, not the pool that received it', () => {
    // TomTom publishes QPS "for an API key and the products it is using", so
    // the throttle is a fact about the key. Before this, tomtom.geocode and
    // tomtom.scarcePolygons kept drawing against a key the vendor had just
    // 429'd because only tomtom.reverseGeocode was poisoned.
    const tomtom = (resource: string, credential = 'default'): PoolConfig => ({
      name: `tomtom.${resource}`,
      credential,
      window: { kind: 'perMinute', limit: 300, denomination: 'quantity' },
      reservationTtlMs: 60_000,
    });

    it('poisons every SIBLING pool on the same key', () => {
      const registry = new PoolRegistry();
      registry.register(tomtom('reverseGeocode'));
      registry.register(tomtom('geocode'));
      registry.register(tomtom('scarcePolygons'));

      registry.poisonWindow('tomtom.reverseGeocode', 30_000, t0);

      for (const pool of [
        'tomtom.reverseGeocode',
        'tomtom.geocode',
        'tomtom.scarcePolygons',
      ]) {
        const denied = registry.reserve(pool, 1, 'probe', t0);
        expect(denied.admitted).toBe(false);
        if (!denied.admitted) {
          expect(denied.reason).toBe('upstreamRateLimited');
          expect(denied.retryAfterMs).toBe(30_000);
        }
      }
    });

    it('does NOT poison another VENDOR — every pool shares credential "default"', () => {
      const registry = new PoolRegistry();
      registry.register(tomtom('reverseGeocode'));
      // F9610: this fixture used to register 'gemini.tokens', a pool D149
      // deleted — a test can register any name it likes, so the fixture went
      // on "proving" cross-vendor isolation using a pool that no longer
      // exists anywhere. `reddit.requests` is a REAL registered perMinute
      // pool of a different vendor (governance.service.ts), which is what
      // this test was always about.
      registry.register({
        name: 'reddit.requests',
        credential: 'default',
        window: { kind: 'perMinute', limit: 100, denomination: 'quantity' },
        reservationTtlMs: 60_000,
      });

      registry.poisonWindow('tomtom.reverseGeocode', 30_000, t0);

      // Keying on credential ALONE would have taken Reddit down with TomTom:
      // 'default' is the credential string for every vendor in this codebase.
      expect(registry.reserve('reddit.requests', 1, 'x', t0).admitted).toBe(
        true,
      );
    });

    it('does NOT poison a second KEY for the same vendor (§14.1 sharding)', () => {
      const registry = new PoolRegistry();
      registry.register(tomtom('geocode', 'app-1'));
      registry.register(tomtom('scarcePolygons', 'app-2'));

      registry.poisonWindow('tomtom.geocode', 30_000, t0);

      // Two keys are two rate budgets; the vendor throttled one of them.
      expect(
        registry.reserve('tomtom.scarcePolygons', 1, 'x', t0).admitted,
      ).toBe(true);
    });

    it('poolStatus reports the credential cooldown on a sibling pool', () => {
      const registry = new PoolRegistry();
      registry.register(tomtom('reverseGeocode'));
      registry.register(tomtom('geocode'));
      registry.poisonWindow('tomtom.reverseGeocode', 30_000, t0);
      expect(registry.poolStatus('tomtom.geocode', t0).poisonedForMs).toBe(
        30_000,
      );
    });

    it('refuses a pool name with no vendor prefix — the key would be empty', () => {
      const registry = new PoolRegistry();
      expect(() =>
        registry.register({
          name: 'malformed',
          credential: 'default',
          window: { kind: 'perMinute', limit: 1, denomination: 'quantity' },
          reservationTtlMs: 1_000,
        }),
      ).toThrow(PoolRegistrationError);
    });
  });

  it('poolStatus is a read-only snapshot (never admission)', () => {
    const registry = new PoolRegistry();
    registry.register(minutePool());
    const res = registry.reserve('reddit.requests', 2, 'x', t0);
    if (res.admitted) void registry.reconcile(res.reservationId, 2, t0);
    const status = registry.poolStatus('reddit.requests', t0);
    expect(status).toMatchObject({
      limit: 100,
      used: 2,
      reservedOutstanding: 0,
      poisonedForMs: null,
    });
    expect(status.resetMs).toBeGreaterThan(0);
  });

  it('leaked reservations expire by TTL and release capacity', () => {
    const registry = new PoolRegistry();
    registry.register(minutePool({ reservationTtlMs: 1_000 }));
    const res = registry.reserve('reddit.requests', 100, 'archive', t0);
    expect(res.admitted).toBe(true);
    const blocked = registry.reserve('reddit.requests', 1, 'chronological', t0);
    expect(blocked.admitted).toBe(false);
    const later = new Date(t0.getTime() + 2_000);
    const released = registry.reserve(
      'reddit.requests',
      1,
      'chronological',
      later,
    );
    expect(released.admitted).toBe(true);
  });

  it('grants deplete permanently and refill only by minting (money = grants)', () => {
    const registry = new PoolRegistry();
    registry.register(
      minutePool({
        name: 'money.llm-archive-austin',
        window: { kind: 'grant', amount: 200, denomination: 'billedMicros' },
      }),
    );
    const res = registry.reserve(
      'money.llm-archive-austin',
      150,
      'archive-sweep',
      t0,
    );
    expect(res.admitted).toBe(true);
    if (res.admitted) void registry.reconcile(res.reservationId, 150, t0);
    // A month later the grant has NOT refilled (no clock refill).
    const nextMonth = new Date('2026-08-20T12:00:00Z');
    const denied = registry.reserve(
      'money.llm-archive-austin',
      100,
      'archive-sweep',
      nextMonth,
    );
    expect(denied.admitted).toBe(false);
    if (!denied.admitted) expect(denied.retryAfterMs).toBeNull();
    // Owner approval mints capacity.
    void registry.mintGrant('money.llm-archive-austin', 100);
    const afterMint = registry.reserve(
      'money.llm-archive-austin',
      100,
      'archive-sweep',
      nextMonth,
    );
    expect(afterMint.admitted).toBe(true);
  });

  it('monthly windows roll on the calendar month', () => {
    const registry = new PoolRegistry();
    registry.register(
      minutePool({
        name: 'tomtom.scarcePolygons',
        window: { kind: 'perMonth', limit: 2500, denomination: 'quantity' },
      }),
    );
    const res = registry.reserve('tomtom.scarcePolygons', 2500, 'us-seed', t0);
    expect(res.admitted).toBe(true);
    if (res.admitted) void registry.reconcile(res.reservationId, 2500, t0);
    const sameMonth = registry.reserve('tomtom.scarcePolygons', 1, 'probe', t0);
    expect(sameMonth.admitted).toBe(false);
    const nextMonth = registry.reserve(
      'tomtom.scarcePolygons',
      1,
      'probe',
      new Date('2026-08-01T00:00:01Z'),
    );
    expect(nextMonth.admitted).toBe(true);
  });

  describe('durable window store (§14.5 durability leg)', () => {
    const monthPool = (): PoolConfig =>
      minutePool({
        name: 'tomtom.scarcePolygons',
        window: { kind: 'perMonth', limit: 2500, denomination: 'quantity' },
      });

    it('RESTART SURVIVAL: a new registry instance loads the month-to-date consumption a prior instance wrote', async () => {
      const store = new FakeConsumptionStore();
      const first = new PoolRegistry(store);
      first.register(monthPool());
      await first.ensureWindow('tomtom.scarcePolygons', t0);
      const res = first.reserve('tomtom.scarcePolygons', 2400, 'us-seed', t0);
      expect(res.admitted).toBe(true);
      if (res.admitted) await first.reconcile(res.reservationId, 2400, t0);

      // "Restart": a brand-new registry over the same store.
      const second = new PoolRegistry(store);
      second.register(monthPool());
      await second.ensureWindow('tomtom.scarcePolygons', t0);
      expect(second.poolStatus('tomtom.scarcePolygons', t0)).toMatchObject({
        used: 2400,
        storeConfirmed: true,
      });
      // Remaining headroom is the DURABLE remainder, not a reset window.
      const over = second.reserve('tomtom.scarcePolygons', 101, 'probe', t0);
      expect(over.admitted).toBe(false);
      const within = second.reserve('tomtom.scarcePolygons', 100, 'probe', t0);
      expect(within.admitted).toBe(true);
    });

    // REWRITTEN (D149): was 'FAIL CLOSED: a durable pool denies
    // (storeFailure) while the window is unconfirmed'.
    it('FAIL OPEN, LOUDLY: a durable pool ADMITS while the window is unconfirmed — before any load, and after a failed load', async () => {
      const store = new FakeConsumptionStore();
      const screams: string[] = [];
      const registry = new PoolRegistry(store, undefined, (name) =>
        screams.push(name),
      );
      registry.register(monthPool());
      // Never loaded → admit, and say so.
      const beforeLoad = registry.reserve(
        'tomtom.scarcePolygons',
        1,
        'probe',
        t0,
      );
      expect(beforeLoad.admitted).toBe(true);
      // Load fails → still admit, still screaming.
      store.failing = true;
      await registry.ensureWindow('tomtom.scarcePolygons', t0);
      const afterFailedLoad = registry.reserve(
        'tomtom.scarcePolygons',
        1,
        'probe',
        t0,
      );
      expect(afterFailedLoad.admitted).toBe(true);
      expect(screams.length).toBe(2);
      // Store recovers → the window is confirmed and the alerting stops.
      store.failing = false;
      await registry.ensureWindow('tomtom.scarcePolygons', t0);
      expect(
        registry.reserve('tomtom.scarcePolygons', 1, 'probe', t0).admitted,
      ).toBe(true);
      expect(screams.length).toBe(2);
    });

    it('a FAILED write-through keeps admitting; recovery flushes the carried delta so nothing under-counts', async () => {
      const store = new FakeConsumptionStore();
      const registry = new PoolRegistry(store);
      registry.register(monthPool());
      await registry.ensureWindow('tomtom.scarcePolygons', t0);
      const res = registry.reserve('tomtom.scarcePolygons', 5, 'us-seed', t0);
      expect(res.admitted).toBe(true);
      store.failing = true;
      if (res.admitted) await registry.reconcile(res.reservationId, 5, t0);
      // Write-through failed → D149: admit anyway (the alert is the answer).
      const admitted = registry.reserve(
        'tomtom.scarcePolygons',
        1,
        'probe',
        t0,
      );
      expect(admitted.admitted).toBe(true);
      // Recovery: ensureWindow flushes the carried 5 THEN loads — the stored
      // row now includes the consumption admitted during the outage.
      store.failing = false;
      await registry.ensureWindow('tomtom.scarcePolygons', t0);
      expect(store.rows.get('tomtom.scarcePolygons|2026-07')).toMatchObject({
        consumed: 5,
      });
      expect(registry.poolStatus('tomtom.scarcePolygons', t0).used).toBe(5);
    });

    it('a FAILED write-through invokes onDurableFlushFailure (§24 red team finding 9 — the failure must be LOUD)', async () => {
      const store = new FakeConsumptionStore();
      const onDurableFlushFailure = jest.fn();
      const registry = new PoolRegistry(store, onDurableFlushFailure);
      registry.register(monthPool());
      await registry.ensureWindow('tomtom.scarcePolygons', t0);
      const res = registry.reserve('tomtom.scarcePolygons', 5, 'us-seed', t0);
      expect(res.admitted).toBe(true);
      store.failing = true;
      if (res.admitted) await registry.reconcile(res.reservationId, 5, t0);
      expect(onDurableFlushFailure).toHaveBeenCalledTimes(1);
      expect(onDurableFlushFailure).toHaveBeenCalledWith(
        'tomtom.scarcePolygons',
        expect.any(Error),
      );
    });

    it('a SUCCESSFUL write-through never invokes onDurableFlushFailure', async () => {
      const store = new FakeConsumptionStore();
      const onDurableFlushFailure = jest.fn();
      const registry = new PoolRegistry(store, onDurableFlushFailure);
      registry.register(monthPool());
      await registry.ensureWindow('tomtom.scarcePolygons', t0);
      const res = registry.reserve('tomtom.scarcePolygons', 5, 'us-seed', t0);
      if (res.admitted) await registry.reconcile(res.reservationId, 5, t0);
      expect(onDurableFlushFailure).not.toHaveBeenCalled();
    });

    it('perMinute pools NEVER touch the store (§16 split: restart loses ≤1 minute — by design)', async () => {
      const store = new FakeConsumptionStore();
      const registry = new PoolRegistry(store);
      registry.register(minutePool());
      await registry.ensureWindow('reddit.requests', t0);
      const res = registry.reserve('reddit.requests', 10, 'chronological', t0);
      expect(res.admitted).toBe(true);
      if (res.admitted) await registry.reconcile(res.reservationId, 10, t0);
      expect(store.loadCalls).toBe(0);
      expect(store.addCalls).toBe(0);
      expect(registry.poolStatus('reddit.requests', t0).storeConfirmed).toBe(
        null,
      );
    });

    // REWRITTEN (D149): was 'a month roll starts UNCONFIRMED (fail closed)'.
    // A month roll is the most routine unconfirmed window there is — the last
    // thing that should refuse work is the clock ticking over midnight on the
    // 1st.
    it('a month roll starts UNCONFIRMED but ADMITS (screaming) until the new window is loaded', async () => {
      const store = new FakeConsumptionStore();
      const screams: string[] = [];
      const registry = new PoolRegistry(store, undefined, (name) =>
        screams.push(name),
      );
      registry.register(monthPool());
      await registry.ensureWindow('tomtom.scarcePolygons', t0);
      const august = new Date('2026-08-01T00:00:01Z');
      const beforeEnsure = registry.reserve(
        'tomtom.scarcePolygons',
        1,
        'probe',
        august,
      );
      expect(beforeEnsure.admitted).toBe(true);
      expect(screams).toEqual(['tomtom.scarcePolygons']);
      await registry.ensureWindow('tomtom.scarcePolygons', august);
      expect(
        registry.reserve('tomtom.scarcePolygons', 1, 'probe', august).admitted,
      ).toBe(true);
    });

    it('grant mints persist (granted) and a restarted registry sees base + minted capacity minus durable consumption', async () => {
      const store = new FakeConsumptionStore();
      const first = new PoolRegistry(store);
      first.register(
        minutePool({
          name: 'money.llm-archive-austin',
          window: { kind: 'grant', amount: 200, denomination: 'billedMicros' },
        }),
      );
      await first.ensureWindow('money.llm-archive-austin', t0);
      await first.mintGrant('money.llm-archive-austin', 100);
      const res = first.reserve('money.llm-archive-austin', 250, 'sweep', t0);
      expect(res.admitted).toBe(true);
      if (res.admitted) await first.reconcile(res.reservationId, 250, t0);

      const second = new PoolRegistry(store);
      second.register(
        minutePool({
          name: 'money.llm-archive-austin',
          window: { kind: 'grant', amount: 200, denomination: 'billedMicros' },
        }),
      );
      await second.ensureWindow('money.llm-archive-austin', t0);
      const status = second.poolStatus('money.llm-archive-austin', t0);
      expect(status).toMatchObject({ limit: 300, used: 250 });
      expect(
        second.reserve('money.llm-archive-austin', 51, 'sweep', t0).admitted,
      ).toBe(false);
      expect(
        second.reserve('money.llm-archive-austin', 50, 'sweep', t0).admitted,
      ).toBe(true);
    });
  });

  describe('resetLimit (no production caller since D149 — kept as the live-ceiling primitive)', () => {
    it('raises the limit and preserves usage/reservations', () => {
      const registry = new PoolRegistry();
      registry.register({
        name: 'gemini.monthlySpend',
        credential: 'default',
        window: { kind: 'perMonth', limit: 100, denomination: 'billedMicros' },
        reservationTtlMs: 60_000,
      });
      const res = registry.reserve('gemini.monthlySpend', 90, 'llm', t0);
      expect(res.admitted).toBe(true);
      registry.resetLimit('gemini.monthlySpend', 500);
      const status = registry.poolStatus('gemini.monthlySpend', t0);
      expect(status.limit).toBe(500);
      expect(status.reservedOutstanding).toBe(90);
    });

    it('lowers the limit below current usage sanely — new draws are denied, nothing crashes', () => {
      const registry = new PoolRegistry();
      registry.register({
        name: 'gemini.monthlySpend',
        credential: 'default',
        window: { kind: 'perMonth', limit: 1000, denomination: 'billedMicros' },
        reservationTtlMs: 60_000,
      });
      const res = registry.reserve('gemini.monthlySpend', 900, 'llm', t0);
      expect(res.admitted).toBe(true);
      if (res.admitted) {
        void registry.reconcile(res.reservationId, 900, t0);
      }
      // Backstop re-derived DOWN (spend fell) below what's already used.
      registry.resetLimit('gemini.monthlySpend', 500);
      const status = registry.poolStatus('gemini.monthlySpend', t0);
      expect(status.limit).toBe(500);
      expect(status.used).toBe(900);
      // A pool already over its new limit denies the next draw — no crash,
      // no negative-capacity weirdness.
      expect(
        registry.reserve('gemini.monthlySpend', 1, 'llm', t0).admitted,
      ).toBe(false);
    });

    it('rejects an unregistered pool name', () => {
      const registry = new PoolRegistry();
      expect(() => registry.resetLimit('does.not.exist', 100)).toThrow(
        PoolRegistrationError,
      );
    });

    it('rejects grant pools (grants refill only by owner approval)', () => {
      const registry = new PoolRegistry();
      registry.register({
        name: 'money.llm-archive',
        credential: 'default',
        window: { kind: 'grant', amount: 100, denomination: 'billedMicros' },
        reservationTtlMs: 60_000,
      });
      expect(() => registry.resetLimit('money.llm-archive', 500)).toThrow(
        PoolRegistrationError,
      );
    });

    it('rejects a non-positive limit', () => {
      const registry = new PoolRegistry();
      registry.register({
        name: 'gemini.monthlySpend',
        credential: 'default',
        window: { kind: 'perMonth', limit: 1000, denomination: 'billedMicros' },
        reservationTtlMs: 60_000,
      });
      expect(() => registry.resetLimit('gemini.monthlySpend', 0)).toThrow(
        PoolRegistrationError,
      );
      expect(() => registry.resetLimit('gemini.monthlySpend', -5)).toThrow(
        PoolRegistrationError,
      );
    });
  });
});

describe('F119 / D13 — a pool DECLARES its currency and metering is typed by it', () => {
  const spendPoolConfig: PoolConfig<'billedMicros'> = {
    name: 'gemini.monthlySpend',
    credential: 'default',
    window: {
      kind: 'perMonth',
      limit: 300_000_000,
      denomination: 'billedMicros',
    },
    reservationTtlMs: 60_000,
  };
  const quantityPoolConfig: PoolConfig<'quantity'> = {
    name: 'reddit.requests',
    credential: 'default',
    window: { kind: 'perMinute', limit: 100, denomination: 'quantity' },
    reservationTtlMs: 60_000,
  };

  it('THE PROOF: metering a DOLLAR pool through meter() does not compile', () => {
    const registry = new PoolRegistry();
    const spend = registry.register(spendPoolConfig);
    // The F119 defect verbatim — `pools.meter('gemini.monthlySpend', n)`
    // used to compile and drain a dollar ceiling in the wrong currency.
    // If this line ever compiles again, ts-jest fails the suite on the
    // UNUSED @ts-expect-error, so the guard cannot rot silently.
    // @ts-expect-error a billedMicros pool is not a quantity pool
    void registry.meter(spend, 5);
  });

  it('and the mirror: a QUANTITY pool cannot be metered as spend', () => {
    const registry = new PoolRegistry();
    const requests = registry.register(quantityPoolConfig);
    // @ts-expect-error a quantity pool is not a billedMicros pool
    void registry.meterSpend(requests, 5);
  });

  it('the handle re-derived from a registration refuses the wrong currency at runtime too', () => {
    const registry = new PoolRegistry();
    registry.register(spendPoolConfig);
    registry.register(quantityPoolConfig);
    expect(() => registry.quantityPool('gemini.monthlySpend')).toThrow(
      PoolRegistrationError,
    );
    expect(() => registry.spendPool('reddit.requests')).toThrow(
      PoolRegistrationError,
    );
    expect(registry.spendPool('gemini.monthlySpend')).toEqual({
      name: 'gemini.monthlySpend',
      denomination: 'billedMicros',
    });
  });

  it('behavior is byte-identical: metering still consumes the window', async () => {
    const registry = new PoolRegistry();
    const requests = registry.register(quantityPoolConfig);
    await registry.meter(requests, 30);
    expect(registry.poolStatus('reddit.requests').used).toBe(30);
  });
});
