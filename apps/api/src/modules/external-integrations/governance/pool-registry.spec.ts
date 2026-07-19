import {
  PoolRegistry,
  PoolRegistrationError,
  type PoolConfig,
} from './pool-registry';

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
      registry.reconcile(res.reservationId, 10, t0);
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
    if (res.admitted) registry.reconcile(res.reservationId, 150, t0);
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
    registry.mintGrant('money.llm-archive-austin', 100);
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
    if (res.admitted) registry.reconcile(res.reservationId, 2500, t0);
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
});
