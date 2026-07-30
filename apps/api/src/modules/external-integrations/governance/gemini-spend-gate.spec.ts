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
      | { admitted: true }
      | {
          admitted: false;
          reason: 'poisoned' | 'exhausted' | 'unconfirmed';
          retryAfterMs: number | null;
        },
  ) => {
    const emit = jest.fn();
    const self = {
      // Health re-check TTL: pretend it just ran so the spec exercises the
      // verdict branches, not the daily refresh.
      lastBackstopHealthCheckMs: Date.now(),
      applyDerivedGeminiBackstop: jest.fn().mockResolvedValue(undefined),
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
    const { run, emit } = build({ admitted: true });
    await expect(run()).resolves.toBeUndefined();
    expect(emit).not.toHaveBeenCalled();
  });

  it('FAILS CLOSED on an unconfirmed store — a budget that cannot prove its balance must not admit', async () => {
    const { run, emit } = build({
      admitted: false,
      reason: 'unconfirmed',
      retryAfterMs: null,
    });
    await expect(run()).rejects.toThrow(/unconfirmed/);
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'critical',
        dedupeKey: expect.stringContaining('gemini_backstop_unconfirmed:'),
      }),
    );
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

  it('re-runs the derived-backstop health check when the daily TTL has lapsed', async () => {
    const { run, self } = build({ admitted: true });
    (self as { lastBackstopHealthCheckMs: number }).lastBackstopHealthCheckMs =
      Date.now() - 25 * 3_600_000;
    await run();
    expect(self.applyDerivedGeminiBackstop).toHaveBeenCalledTimes(1);
    // And the TTL was stamped BEFORE the async call, so concurrent gates
    // cannot double-fire it.
    await run();
    expect(self.applyDerivedGeminiBackstop).toHaveBeenCalledTimes(1);
  });
});
