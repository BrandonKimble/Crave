import {
  GovernanceService,
  SpendBudgetClosedError,
} from './governance.service';
import {
  PoolRegistry,
  type PoolConfig,
  type PoolConsumptionStore,
} from './pool-registry';

/**
 * POISON BEATS FAIL-OPEN — the precedence D149 left untested.
 *
 * D149 (2026-08-07, "scream, never kill") made a durable pool whose window the
 * store cannot CONFIRM ADMIT and page a human, instead of refusing. That is the
 * right product answer for a Postgres hiccup: the store's silence says nothing
 * about the balance, and refusing real work is the more expensive mistake.
 *
 * It is the WRONG answer for a POISONED CREDENTIAL, and the difference is not a
 * matter of degree. An unconfirmable window is US failing to read OUR ledger. A
 * poisoned credential is the VENDOR saying stop — a 429 we already received. To
 * admit there is not generosity, it is a 429 storm against a key Google or
 * Gemini just throttled, and the vendor's next answer is another refusal plus a
 * longer back-off. pool-registry.ts's own header carves poison out for exactly
 * this reason ("the VENDOR said stop. Admitting is not generosity, it is a 429
 * storm").
 *
 * WHY THIS FILE EXISTS. The precedence is real today — `admit()` and `reserve()`
 * both check `poisonedUntil` BEFORE they reach the store-confirmation branch —
 * but it lived only in the ORDER OF TWO IF-STATEMENTS, pinned by nothing. Every
 * existing spec in this territory stays green if those blocks are swapped:
 * pool-registry.spec.ts exercises poison on a CONFIRMED window and fail-open on
 * an UNPOISONED one, so no spec ever puts both conditions on the same pool at
 * the same time; gemini-spend-gate.spec.ts mocks `admit` outright and so cannot
 * see the registry's ordering at all. A reorder would ship green and turn every
 * vendor throttle that coincided with a store blip into a spend storm.
 *
 * THE MUTATION THAT MUST GO RED: move the `storeUnconfirmed` fail-open block in
 * `PoolRegistry.admit()` (or the durable-unconfirmed admit in `reserve()`) ABOVE
 * the poison check. Every 'poisoned AND unconfirmed' case below then admits, and
 * these specs fail. The control specs at the bottom keep the mutation honest in
 * the other direction: they prove the fail-open is genuinely armed here, so a
 * green run cannot be explained by "this pool just refuses everything".
 *
 * ORIGIN. The asks that produced this file said the refusal must hold "even on
 * api-origin". At THIS layer it does, unconditionally — the registry and
 * `assertSpendOpen` know nothing about process role, and both spend gates are
 * covered below with the REAL registry rather than a mocked verdict. The
 * origin-shaped decisions live one level UP and are deliberately different (see
 * google-places.service.ts `gateWorkerSpend` and llm.service.ts
 * `assertSpendBudgetOpen`); this file pins the layer where the precedence is a
 * mechanism rather than a policy.
 */

/** A store that is DOWN — every call rejects, so no window is ever confirmed.
 *  This is the fail-open condition, armed for the whole file. */
class DownConsumptionStore implements PoolConsumptionStore {
  loadCalls = 0;
  addCalls = 0;

  load(): Promise<{ consumed: number; granted: number } | null> {
    this.loadCalls += 1;
    return Promise.reject(new Error('store down'));
  }

  add(): Promise<void> {
    this.addCalls += 1;
    return Promise.reject(new Error('store down'));
  }
}

/** A store that WORKS — the control substrate, for proving poison is what
 *  refuses and an unconfirmed window is what admits. */
class LiveConsumptionStore implements PoolConsumptionStore {
  private readonly rows = new Map<
    string,
    { consumed: number; granted: number }
  >();

  load(poolName: string, windowKey: string) {
    return Promise.resolve(this.rows.get(`${poolName}|${windowKey}`) ?? null);
  }

  add(
    poolName: string,
    windowKey: string,
    delta: { consumed?: number; granted?: number },
  ) {
    const key = `${poolName}|${windowKey}`;
    const row = this.rows.get(key) ?? { consumed: 0, granted: 0 };
    row.consumed += delta.consumed ?? 0;
    row.granted += delta.granted ?? 0;
    this.rows.set(key, row);
    return Promise.resolve();
  }
}

const GEMINI_POOL = 'gemini.monthlySpend';
const PLACES_POOL = 'googlePlaces.monthlySpend';

const spendPool = (name: string, credential: string): PoolConfig => ({
  name,
  credential,
  window: {
    kind: 'perMonth',
    limit: 1_500_000_000,
    denomination: 'billedMicros',
  },
  reservationTtlMs: 60_000,
});

describe('poison beats fail-open (D149 precedence)', () => {
  // The gate under test reads the REAL clock (assertSpendOpen calls
  // pools.admit(poolName) with no timestamp), so t0 must be the real clock
  // too. A literal date here was a time bomb: the poison "expired" against
  // wall time two hours after the literal and the gate test went red with
  // no code change.
  const t0 = new Date();
  const POISON_MS = 2 * 60 * 60_000; // cap-scale: 2h, so the gate also alerts.

  /**
   * Builds the exact state the precedence governs: a durable money pool whose
   * store is DOWN (fail-open armed, `onUnconfirmedAdmit` wired) AND whose
   * credential the vendor has poisoned.
   */
  const buildPoisonedAndUnconfirmed = async (poolName: string) => {
    const store = new DownConsumptionStore();
    const unconfirmedAdmits: string[] = [];
    const flushFailures: string[] = [];
    const pools = new PoolRegistry(
      store,
      (name) => flushFailures.push(name),
      (name) => unconfirmedAdmits.push(name),
    );
    pools.register(spendPool(poolName, 'primary-key'));
    // Prove the fail-open condition is real before poisoning anything: the
    // load fails, so the window can never be confirmed.
    await pools.ensureWindow(poolName, t0);
    expect(pools.poolStatus(poolName, t0).storeConfirmed).toBe(false);
    pools.poisonWindow(poolName, POISON_MS, t0);
    return { pools, store, unconfirmedAdmits, flushFailures };
  };

  describe.each([
    ['gemini', GEMINI_POOL],
    ['places', PLACES_POOL],
  ] as const)('%s path — pool %s', (_vendor, poolName) => {
    it('admit() REFUSES with reason "poisoned" — the vendor outranks our unreadable ledger', async () => {
      const { pools } = await buildPoisonedAndUnconfirmed(poolName);

      const verdict = await pools.admit(poolName, t0);

      expect(verdict.admitted).toBe(false);
      // Narrowed rather than objectContaining: a mutation that returns the
      // fail-open arm produces `{admitted:true, storeUnconfirmed:true}`, and
      // this reads its reason, so the failure names the actual regression.
      expect(verdict).toEqual({
        admitted: false,
        reason: 'poisoned',
        retryAfterMs: POISON_MS,
      });
    });

    it('admit() does NOT fire onUnconfirmedAdmit while poisoned — a refusal is not a blind spend, and must not burn the scream', async () => {
      const { pools, unconfirmedAdmits } =
        await buildPoisonedAndUnconfirmed(poolName);

      await pools.admit(poolName, t0);

      // The scream exists to say "we SPENT against a balance we cannot read".
      // Nothing was spent here. Firing it anyway would both lie and consume
      // the per-pool-per-day dedupe slot that a genuine blind admit needs.
      expect(unconfirmedAdmits).toEqual([]);
    });

    it('reserve() REFUSES with "upstreamRateLimited" — the same precedence on the reservation path', async () => {
      const { pools } = await buildPoisonedAndUnconfirmed(poolName);

      const outcome = pools.reserve(poolName, 1_000, 'test.workClass', t0);

      expect(outcome).toEqual({
        admitted: false,
        reason: 'upstreamRateLimited',
        retryAfterMs: POISON_MS,
      });
    });

    it('reserve() hands out NO reservation while poisoned — nothing outstanding to reconcile', async () => {
      const { pools } = await buildPoisonedAndUnconfirmed(poolName);

      pools.reserve(poolName, 1_000, 'test.workClass', t0);

      expect(pools.poolStatus(poolName, t0).reservedOutstanding).toBe(0);
    });

    it('the SPEND GATE throws SpendBudgetClosedError("poisoned") over the real registry — not a pass-through', async () => {
      const { pools } = await buildPoisonedAndUnconfirmed(poolName);
      const emit = jest.fn();
      // The real PoolRegistry, not a mocked verdict: the whole point is that
      // the gate inherits the registry's precedence rather than restating it.
      // A minimal `this` (the idiom in gemini-spend-gate.spec.ts) — the gate is
      // pure orchestration over pools.admit + opsAlerts.
      const gate = {
        pools,
        opsAlerts: { emit },
      } as unknown as GovernanceService;
      /* eslint-disable @typescript-eslint/no-unsafe-return -- the gate is invoked through the prototype with a minimal `this` (the idiom in gemini-spend-gate.spec.ts); Function.call is typed `any` */
      const run = (): Promise<void> =>
        poolName === GEMINI_POOL
          ? GovernanceService.prototype.assertGeminiSpendOpen.call(gate)
          : GovernanceService.prototype.assertPlacesSpendOpen.call(gate);
      /* eslint-enable @typescript-eslint/no-unsafe-return */

      await expect(run()).rejects.toBeInstanceOf(SpendBudgetClosedError);
      await expect(run()).rejects.toMatchObject({ reason: 'poisoned' });
    });
  });

  it('poison on a SIBLING pool sharing the credential refuses too — the 429 throttles the KEY, not the allowance', async () => {
    const store = new DownConsumptionStore();
    const pools = new PoolRegistry(store, undefined, jest.fn());
    pools.register(spendPool(PLACES_POOL, 'primary-key'));
    pools.register({
      ...spendPool('googlePlaces.details', 'primary-key'),
      window: { kind: 'perDay', limit: 10_000, denomination: 'quantity' },
    });
    await pools.ensureWindow(PLACES_POOL, t0);

    // The 429 arrived on the details pool; the money pool draws the same key.
    pools.poisonWindow('googlePlaces.details', POISON_MS, t0);

    await expect(pools.admit(PLACES_POOL, t0)).resolves.toMatchObject({
      admitted: false,
      reason: 'poisoned',
    });
  });

  it('a DIFFERENT credential is untouched — poison must not leak across keys', async () => {
    const store = new LiveConsumptionStore();
    const pools = new PoolRegistry(store, undefined, jest.fn());
    pools.register(spendPool(PLACES_POOL, 'primary-key'));
    pools.register({
      ...spendPool('googlePlaces.secondary', 'other-key'),
      window: { kind: 'perDay', limit: 10_000, denomination: 'quantity' },
    });
    await pools.ensureWindow(PLACES_POOL, t0);
    await pools.ensureWindow('googlePlaces.secondary', t0);

    pools.poisonWindow(PLACES_POOL, POISON_MS, t0);

    await expect(
      pools.admit('googlePlaces.secondary', t0),
    ).resolves.toMatchObject({ admitted: true });
  });

  // ── CONTROLS ───────────────────────────────────────────────────────────
  // Without these, every spec above is satisfiable by "this pool refuses
  // everything", and the file would pass against a registry with no fail-open
  // at all — i.e. it would not actually be testing a PRECEDENCE.

  it.each([
    ['gemini', GEMINI_POOL],
    ['places', PLACES_POOL],
  ] as const)(
    'CONTROL (%s): unconfirmed but UNPOISONED still admits and screams — the fail-open is genuinely armed',
    async (_vendor, poolName) => {
      const store = new DownConsumptionStore();
      const unconfirmedAdmits: string[] = [];
      const pools = new PoolRegistry(store, undefined, (name) =>
        unconfirmedAdmits.push(name),
      );
      pools.register(spendPool(poolName, 'primary-key'));
      await pools.ensureWindow(poolName, t0);
      expect(pools.poolStatus(poolName, t0).storeConfirmed).toBe(false);

      const verdict = await pools.admit(poolName, t0);

      expect(verdict).toEqual({ admitted: true, storeUnconfirmed: true });
      expect(unconfirmedAdmits).toContain(poolName);
    },
  );

  it('CONTROL: once the poison EXPIRES, the unconfirmed window admits again — the refusal is the vendor cooldown, not a wedge', async () => {
    const { pools, unconfirmedAdmits } =
      await buildPoisonedAndUnconfirmed(PLACES_POOL);
    const afterCooldown = new Date(t0.getTime() + POISON_MS + 1_000);

    const verdict = await pools.admit(PLACES_POOL, afterCooldown);

    expect(verdict).toEqual({ admitted: true, storeUnconfirmed: true });
    expect(unconfirmedAdmits).toContain(PLACES_POOL);
  });

  it('CONTROL: a poisoned pool on a HEALTHY store also refuses — the two conditions are independent, and poison alone is sufficient', async () => {
    const pools = new PoolRegistry(new LiveConsumptionStore());
    pools.register(spendPool(GEMINI_POOL, 'primary-key'));
    await pools.ensureWindow(GEMINI_POOL, t0);
    expect(pools.poolStatus(GEMINI_POOL, t0).storeConfirmed).toBe(true);

    pools.poisonWindow(GEMINI_POOL, POISON_MS, t0);

    await expect(pools.admit(GEMINI_POOL, t0)).resolves.toMatchObject({
      admitted: false,
      reason: 'poisoned',
    });
  });
});
