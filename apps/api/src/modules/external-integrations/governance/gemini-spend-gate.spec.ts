/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment -- jest mock doubles: alert payloads and prototype-call returns are untyped by nature */
import { GovernanceService } from './governance.service';

/**
 * THE gemini spend gate had zero direct coverage (flagged by three
 * consecutive red teams): the fail-closed branches guarding every dollar of
 * LLM spend were pinned by nothing. Each spec here is RED-able — flip any
 * verdict branch to admit and one fails.
 *
 * Exercised through the prototype with a minimal `this`: the gate's logic
 * is pure orchestration over pools.admit + opsAlerts, and wiring the full
 * Nest graph would test the framework, not the gate.
 */
describe('GovernanceService.assertGeminiSpendOpen', () => {
  const build = (
    verdict:
      | { admitted: true; storeUnconfirmed: boolean }
      | {
          admitted: false;
          reason: 'poisoned' | 'exhausted';
          retryAfterMs: number | null;
        },
  ) => {
    const emit = jest.fn();
    const self = {
      pools: {
        admit: jest.fn().mockResolvedValue(verdict),
        poolStatus: jest.fn().mockReturnValue({ used: 0, limit: 1 }),
      },
      opsAlerts: { emit },
    };
    const run = () =>
      GovernanceService.prototype.assertGeminiSpendOpen.call(
        self as unknown as GovernanceService,
      );
    return { run, emit, self };
  };

  it('admits silently when the pool admits', async () => {
    const { run, emit } = build({ admitted: true, storeUnconfirmed: false });
    await expect(run()).resolves.toBeUndefined();
    expect(emit).not.toHaveBeenCalled();
  });

  /**
   * WHICH POOL — the argument IS the thing under test (F2180).
   * The verdict mock above answers ANY pool name identically, so every branch
   * spec here stays green if the gate is repointed at a pool that is not the
   * LLM budget (or at one that is not registered at all). Naming the pool is
   * the only assertion that can go red on that mutation.
   */
  it('admits against gemini.monthlySpend — not some other budget', async () => {
    const { run, self } = build({ admitted: true, storeUnconfirmed: false });
    await run();
    expect(self.pools.admit).toHaveBeenCalledWith('gemini.monthlySpend');
  });

  it.each([
    ['assertPlacesSpendOpen', 'googlePlaces.monthlySpend'],
    ['assertTomtomSpendOpen', 'tomtom.monthlySpend'],
  ] as const)('%s admits against %s', async (method, poolName) => {
    const admit = jest
      .fn()
      .mockResolvedValue({ admitted: true, storeUnconfirmed: false });
    const self = { pools: { admit }, opsAlerts: { emit: jest.fn() } };
    await GovernanceService.prototype[method].call(
      self as unknown as GovernanceService,
    );
    expect(admit).toHaveBeenCalledWith(poolName);
  });

  // REWRITTEN (D149, 2026-08-07). This used to be 'FAILS CLOSED on an
  // unconfirmed store — a budget that cannot prove its balance must not
  // admit'. The owner reversed it: an unconfirmable window ADMITS and the
  // registry screams (pool-registry.spec.ts covers the scream), so the gate
  // never sees an 'unconfirmed' verdict at all — the arm is deleted, not
  // merely bypassed. This asserts the gate stays silent on the admit it now
  // receives instead.
  it('an admit carrying storeUnconfirmed passes through silently — the scream belongs to the registry, not a second alert here', async () => {
    const { run, emit } = build({ admitted: true, storeUnconfirmed: true });
    await expect(run()).resolves.toBeUndefined();
    expect(emit).not.toHaveBeenCalled();
  });

  it('refuses while vendor-poisoned, with its OWN dedupe key (must not suppress the exhausted alert)', async () => {
    const { run, emit } = build({
      admitted: false,
      reason: 'poisoned',
      retryAfterMs: 7_200_000,
    });
    await expect(run()).rejects.toThrow(/poisoned/);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        dedupeKey: expect.stringContaining('gemini_backstop_poisoned:'),
      }),
    );
  });

  it('refuses when exhausted (Tier-3 backstop fired)', async () => {
    const { run, emit } = build({
      admitted: false,
      reason: 'exhausted',
      retryAfterMs: null,
    });
    await expect(run()).rejects.toThrow(/exhausted/);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'critical',
        dedupeKey: expect.stringContaining('gemini_backstop:'),
      }),
    );
  });

  // DELETED (D149): 're-runs the derived-backstop health check when the
  // daily TTL has lapsed'. The gemini ceiling is a fixed env-seeded number
  // now; the nightly derivation it watched, and the TTL that rode this hot
  // path to watch it, are both gone.
});
