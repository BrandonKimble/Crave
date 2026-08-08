/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment -- the origin rule is exercised through the prototype with a minimal `this`, so the doubles are untyped by nature (same pattern as gemini-spend-gate.spec.ts) */
import { SpendBudgetClosedError } from '../governance/governance.service';

/**
 * D149 HEADLINE BEHAVIOR — A PERSON IS NEVER REFUSED BY OUR OWN NUMBERS.
 *
 * The live defect this rederivation came from: someone creates a poll about a
 * restaurant we've never seen, the seed needs one Places lookup, the month's
 * $200 pool says no, and they get a 500. Two rules replaced it, and both are
 * pinned here because both are one deleted `if` away from coming back:
 *
 *   1. the DOLLAR gate is consulted only in a worker process
 *   2. a per-operation RATE ceiling alerts-and-proceeds on a user path, and
 *      still refuses on a worker path
 *
 * MUTATION PROOF for each assertion is named inline. What is under test is the
 * three-line origin decision, not axios.
 *
 * `resolveProcessRole()` caches its answer per module instance, so each role
 * gets a fresh module registry via jest.isolateModulesAsync.
 */
describe('GooglePlacesService — the D149 origin rule', () => {
  const priorRole = process.env.PROCESS_ROLE;

  type Proto = {
    gateWorkerSpend: (this: unknown) => Promise<void>;
    handleRateCeiling: (this: unknown, op: string, msg: string) => void;
  };

  const withRole = async (
    role: string,
    fn: (proto: Proto) => Promise<void>,
  ): Promise<void> => {
    process.env.PROCESS_ROLE = role;
    await jest.isolateModulesAsync(async () => {
      const mod = await import('./google-places.service');
      await fn(mod.GooglePlacesService.prototype as unknown as Proto);
    });
  };

  afterEach(() => {
    if (priorRole === undefined) delete process.env.PROCESS_ROLE;
    else process.env.PROCESS_ROLE = priorRole;
  });

  const exhausted = () =>
    Promise.reject(
      new SpendBudgetClosedError('Places spend budget exhausted', 'exhausted'),
    );

  const spendHost = (assertPlacesSpendOpen: () => Promise<void>) => ({
    governance: { assertPlacesSpendOpen },
  });

  const ceilingHost = (emit: jest.Mock) => ({
    logger: { error: jest.fn() },
    opsAlerts: { emit },
    buildTooManyRequestsError: (m: string) => new Error(m),
  });

  it('USER ORIGIN + EXHAUSTED POOL → the call is NOT refused (the live 500, killed)', async () => {
    // MUTATION: delete the `if (isApiRuntime()) return;` in gateWorkerSpend
    // and this rejects with SpendBudgetClosedError — the exact 500 D149 was
    // called to remove.
    await withRole('api', async (proto) => {
      await expect(
        proto.gateWorkerSpend.call(spendHost(exhausted)),
      ).resolves.toBeUndefined();
    });
  });

  it("the local-dev combined role ('all') is a user-serving process too", async () => {
    await withRole('all', async (proto) => {
      await expect(
        proto.gateWorkerSpend.call(spendHost(exhausted)),
      ).resolves.toBeUndefined();
    });
  });

  it('WORKER ORIGIN + EXHAUSTED POOL → still refused (the runaway backstop survives)', async () => {
    // MUTATION: make gateWorkerSpend return unconditionally and this reds —
    // proving the fail-open above is scoped, not a blanket removal.
    await withRole('worker', async (proto) => {
      await expect(
        proto.gateWorkerSpend.call(spendHost(exhausted)),
      ).rejects.toBeInstanceOf(SpendBudgetClosedError);
    });
  });

  it('WORKER ORIGIN + OPEN POOL → the gate is consulted and admits', async () => {
    const assertPlacesSpendOpen = jest.fn().mockResolvedValue(undefined);
    await withRole('worker', async (proto) => {
      await proto.gateWorkerSpend.call(spendHost(assertPlacesSpendOpen));
    });
    expect(assertPlacesSpendOpen).toHaveBeenCalledTimes(1);
  });

  it('a USER-path rate-ceiling trip ALERTS (warn, emailed) and does not throw', async () => {
    // MUTATION: restore `throw this.buildTooManyRequestsError(...)` in
    // handleRateCeiling's user arm and this reds — that throw was a 429 on a
    // person's search.
    const emit = jest.fn();
    await withRole('api', (proto) => {
      expect(() =>
        proto.handleRateCeiling.call(ceilingHost(emit), 'textSearch', 'slow'),
      ).not.toThrow();
      return Promise.resolve();
    });
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'warn',
        emailOnWarn: true,
        kind: 'places_rate_ceiling',
        dedupeKey: expect.stringContaining('places_rate_ceiling:textSearch:'),
      }),
    );
  });

  it('a WORKER-path rate-ceiling trip still refuses (background work requeues)', async () => {
    const emit = jest.fn();
    await withRole('worker', (proto) => {
      expect(() =>
        proto.handleRateCeiling.call(ceilingHost(emit), 'textSearch', 'slow'),
      ).toThrow('slow');
      return Promise.resolve();
    });
    expect(emit).not.toHaveBeenCalled();
  });
});
