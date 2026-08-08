/* eslint-disable @typescript-eslint/no-unsafe-assignment -- the origin rule is exercised through the prototype with a minimal `this`, so the doubles are untyped by nature (same pattern as places-origin-rule.spec.ts) */
import type { SpendBudgetClosedError as SpendBudgetClosedErrorType } from '../governance/governance.service';

type ClosedErrorCtor = new (
  message: string,
  reason: 'poisoned' | 'exhausted',
) => SpendBudgetClosedErrorType;

/**
 * D149 REACHES GEMINI (F9600) — A PERSON IS NEVER REFUSED BY OUR OWN NUMBERS.
 *
 * The origin rule shipped for Places and stopped there, while the gate injected
 * into GatedGeminiClient still asserted the budget on every paid surface — and
 * poll creation awaits one (`inferPollSubject`) on the request path. An
 * exhausted pool, or a vendor-poisoned one (poison lasts until the month
 * resets), made "create a poll" a 500 for weeks.
 *
 * MUTATION PROOF is named inline on each assertion. `resolveProcessRole()`
 * caches per module instance, so each role gets a fresh registry via
 * jest.isolateModulesAsync.
 */
describe('LLMService — the D149 origin rule on the Gemini gate', () => {
  const priorRole = process.env.PROCESS_ROLE;

  type Proto = {
    assertSpendBudgetOpen: (this: unknown) => Promise<void>;
  };

  /**
   * THE ERROR CLASS MUST COME FROM THE SAME REGISTRY. The gate discriminates a
   * budget refusal with `instanceof`, and `jest.isolateModulesAsync` gives the
   * service a FRESH copy of governance.service — an error built from the outer
   * copy is not an instance of the inner class, so the spec would have proven
   * the re-throw arm on every case and silently lost the whole rule. The
   * doubles are built inside the isolated registry for that reason.
   */
  const withRole = async (
    role: string,
    fn: (proto: Proto, ClosedError: ClosedErrorCtor) => Promise<void>,
  ): Promise<void> => {
    process.env.PROCESS_ROLE = role;
    await jest.isolateModulesAsync(async () => {
      const gov = await import('../governance/governance.service');
      const mod = await import('./llm.service');
      await fn(
        mod.LLMService.prototype as unknown as Proto,
        gov.SpendBudgetClosedError as unknown as ClosedErrorCtor,
      );
    });
  };

  afterEach(() => {
    if (priorRole === undefined) delete process.env.PROCESS_ROLE;
    else process.env.PROCESS_ROLE = priorRole;
  });

  const closed =
    (ClosedError: ClosedErrorCtor, reason: 'exhausted' | 'poisoned') => () =>
      Promise.reject(new ClosedError(`LLM budget ${reason}`, reason));

  const host = (
    assertGeminiSpendOpen: () => Promise<void>,
    emit: jest.Mock = jest.fn(),
  ) => ({
    governance: { assertGeminiSpendOpen },
    logger: { error: jest.fn() },
    opsAlerts: { emit },
  });

  it('USER ORIGIN + EXHAUSTED POOL → the call proceeds (poll creation stops 500ing)', async () => {
    // MUTATION: delete the `isApiRuntime()` branch in assertSpendBudgetOpen
    // (assert unconditionally) and this rejects — the live 500.
    const emit = jest.fn();
    await withRole('api', async (proto, ClosedError) => {
      await expect(
        proto.assertSpendBudgetOpen.call(
          host(closed(ClosedError, 'exhausted'), emit),
        ),
      ).resolves.toBeUndefined();
    });
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'warn',
        emailOnWarn: true,
        kind: 'gemini_origin_bypass',
        dedupeKey: expect.stringContaining(
          'gemini_origin_bypass:gemini.monthlySpend:',
        ),
      }),
    );
  });

  it('a POISONED pool does not refuse the user either (the vendor is the wall)', async () => {
    await withRole('api', async (proto, ClosedError) => {
      await expect(
        proto.assertSpendBudgetOpen.call(host(closed(ClosedError, 'poisoned'))),
      ).resolves.toBeUndefined();
    });
  });

  it("the local-dev combined role ('all') is a user-serving process too", async () => {
    await withRole('all', async (proto, ClosedError) => {
      await expect(
        proto.assertSpendBudgetOpen.call(
          host(closed(ClosedError, 'exhausted')),
        ),
      ).resolves.toBeUndefined();
    });
  });

  it('A BROKEN GATE STILL THROWS — only a BUDGET refusal is overridden', async () => {
    // MUTATION: swallow every error instead of re-throwing non-budget ones and
    // this reds. An unregistered pool or an unreachable store is the money
    // instrumentation being broken, which must not read as "permission granted".
    const boom = () => Promise.reject(new Error('pool not registered'));
    await withRole('api', async (proto) => {
      await expect(
        proto.assertSpendBudgetOpen.call(host(boom)),
      ).rejects.toThrow('pool not registered');
    });
  });

  it('WORKER ORIGIN + EXHAUSTED POOL → still refused (the runaway backstop survives)', async () => {
    // MUTATION: make the method return unconditionally and this reds — proving
    // the fail-open above is scoped to user-serving processes, not a blanket
    // removal of the $1,500 ceiling.
    await withRole('worker', async (proto, ClosedError) => {
      await expect(
        proto.assertSpendBudgetOpen.call(
          host(closed(ClosedError, 'exhausted')),
        ),
      ).rejects.toBeInstanceOf(ClosedError);
    });
  });

  it('WORKER ORIGIN + OPEN POOL → the gate is consulted and admits', async () => {
    const assertGeminiSpendOpen = jest.fn().mockResolvedValue(undefined);
    await withRole('worker', async (proto) => {
      await proto.assertSpendBudgetOpen.call(host(assertGeminiSpendOpen));
    });
    expect(assertGeminiSpendOpen).toHaveBeenCalledTimes(1);
  });
});
