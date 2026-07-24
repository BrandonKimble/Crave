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
  window: { kind: 'perMinute', limit: 100 },
  failPolicy: { kind: 'emergencyFraction', fraction: 0.1 },
  reservationTtlMs: 60_000,
  ...over,
});

describe('PoolRegistry (master plan §14 v2)', () => {
  const t0 = new Date('2026-07-16T12:00:00Z');

  it('rejects emergency fractions on non-minute windows (per-pool fail table)', () => {
    const registry = new PoolRegistry();
    expect(() =>
      registry.register(
        minutePool({
          name: 'tomtom.scarcePolygons',
          window: { kind: 'perMonth', limit: 2500 },
          failPolicy: { kind: 'emergencyFraction', fraction: 0.1 },
        }),
      ),
    ).toThrow(PoolRegistrationError);
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
        minutePool({ window: { kind: 'perMinute', limit: 100 } }),
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
        minutePool({ window: { kind: 'perMinute', limit: 10 } }),
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
        minutePool({ window: { kind: 'perMinute', limit: 100 } }),
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
    registry.register(minutePool({ window: { kind: 'perMinute', limit: 5 } }));
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
        window: { kind: 'grant', amount: 200 },
        failPolicy: { kind: 'hardClosed' },
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
        window: { kind: 'perMonth', limit: 2500 },
        failPolicy: { kind: 'hardClosed' },
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
        window: { kind: 'perMonth', limit: 2500 },
        failPolicy: { kind: 'hardClosed' },
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

    it('FAIL CLOSED: a hardClosed durable pool denies (storeFailure) while the window is unconfirmed — before any load, and after a failed load', async () => {
      const store = new FakeConsumptionStore();
      const registry = new PoolRegistry(store);
      registry.register(monthPool());
      // Never loaded → deny.
      const beforeLoad = registry.reserve(
        'tomtom.scarcePolygons',
        1,
        'probe',
        t0,
      );
      expect(beforeLoad.admitted).toBe(false);
      if (!beforeLoad.admitted) expect(beforeLoad.reason).toBe('storeFailure');
      // Load fails → still deny.
      store.failing = true;
      await registry.ensureWindow('tomtom.scarcePolygons', t0);
      const afterFailedLoad = registry.reserve(
        'tomtom.scarcePolygons',
        1,
        'probe',
        t0,
      );
      expect(afterFailedLoad.admitted).toBe(false);
      if (!afterFailedLoad.admitted) {
        expect(afterFailedLoad.reason).toBe('storeFailure');
      }
      // Store recovers → ensureWindow heals and the pool admits again.
      store.failing = false;
      await registry.ensureWindow('tomtom.scarcePolygons', t0);
      expect(
        registry.reserve('tomtom.scarcePolygons', 1, 'probe', t0).admitted,
      ).toBe(true);
    });

    it('a FAILED write-through fails the window closed; recovery flushes the carried delta so nothing under-counts', async () => {
      const store = new FakeConsumptionStore();
      const registry = new PoolRegistry(store);
      registry.register(monthPool());
      await registry.ensureWindow('tomtom.scarcePolygons', t0);
      const res = registry.reserve('tomtom.scarcePolygons', 5, 'us-seed', t0);
      expect(res.admitted).toBe(true);
      store.failing = true;
      if (res.admitted) await registry.reconcile(res.reservationId, 5, t0);
      // Write-through failed → fail closed.
      const denied = registry.reserve('tomtom.scarcePolygons', 1, 'probe', t0);
      expect(denied.admitted).toBe(false);
      if (!denied.admitted) expect(denied.reason).toBe('storeFailure');
      // Recovery: ensureWindow flushes the carried 5 THEN loads — the stored
      // row now includes the consumption admitted during the outage.
      store.failing = false;
      await registry.ensureWindow('tomtom.scarcePolygons', t0);
      expect(store.rows.get('tomtom.scarcePolygons|2026-07')).toMatchObject({
        consumed: 5,
      });
      expect(registry.poolStatus('tomtom.scarcePolygons', t0).used).toBe(5);
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

    it('a month roll starts UNCONFIRMED (fail closed) until the new window is loaded', async () => {
      const store = new FakeConsumptionStore();
      const registry = new PoolRegistry(store);
      registry.register(monthPool());
      await registry.ensureWindow('tomtom.scarcePolygons', t0);
      const august = new Date('2026-08-01T00:00:01Z');
      const beforeEnsure = registry.reserve(
        'tomtom.scarcePolygons',
        1,
        'probe',
        august,
      );
      expect(beforeEnsure.admitted).toBe(false);
      if (!beforeEnsure.admitted) {
        expect(beforeEnsure.reason).toBe('storeFailure');
      }
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
          window: { kind: 'grant', amount: 200 },
          failPolicy: { kind: 'hardClosed' },
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
          window: { kind: 'grant', amount: 200 },
          failPolicy: { kind: 'hardClosed' },
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
});
