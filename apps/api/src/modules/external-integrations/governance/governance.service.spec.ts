import { GovernanceService } from './governance.service';

/**
 * Governor boot + gate behavior. (The campaign grant re-registration this
 * spec used to cover is GONE — rederivation 2026-08-31: campaign envelopes
 * live on the spend_campaigns row, one enforcer, nothing to rehydrate.)
 */

function stubLogger() {
  return {
    setContext: jest.fn().mockReturnThis(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function buildService() {
  const consumptionStore = {
    load: jest.fn().mockResolvedValue(null),
    add: jest.fn().mockResolvedValue(undefined),
  };
  const logger = stubLogger();
  const opsAlerts = {
    emit: jest.fn<
      void,
      [
        {
          severity: string;
          kind: string;
          title: string;
          body: string;
          dedupeKey?: string;
        },
      ]
    >(),
  };
  const service = new GovernanceService(
    logger as never,
    consumptionStore as never,
    opsAlerts as never,
  );
  return { service, logger, opsAlerts, consumptionStore };
}

describe('GovernanceService durable-flush failure (D149: scream, never kill)', () => {
  // REWRITTEN (D149, 2026-08-07): the tail of this test asserted the
  // hard-close ('the next draw refuses'). The owner reversed that law — the
  // alert IS the response now, and the work keeps flowing.
  it('a failed durable flush logs at error, emits a critical pool_bookkeeping_failure ops alert (deduped per pool per hour), and KEEPS ADMITTING while screaming pool_window_unconfirmed', async () => {
    const { service, logger, opsAlerts, consumptionStore } = buildService();
    await service.onModuleInit(); // healthy load → windows confirmed

    // The store starts failing writes; the next reconcile's flush fails.
    // Docket #2: the TomTom pools became perMinute (in-memory by design), so
    // the durable-flush law is exercised on a pool that IS durable — the
    // gemini month pool.
    consumptionStore.add.mockRejectedValue(new Error('store down'));
    const res = service.pools.reserve('gemini.monthlySpend', 1, 'probe');
    expect(res.admitted).toBe(true);
    if (res.admitted) {
      await service.pools.reconcile(res.reservationId, 1);
    }

    expect(logger.error).toHaveBeenCalled();
    // Assert on THE alert under test, not on the total: boot legitimately
    // emits others (e.g. "backstop is not derived" when no measured row
    // exists, which is true in this fixture). A bare count coupled this spec
    // to every unrelated alert in the system.
    const bookkeeping = opsAlerts.emit.mock.calls
      .map((call: unknown[]) => call[0] as { kind: string })
      .filter((alert) => alert.kind === 'pool_bookkeeping_failure');
    expect(bookkeeping).toHaveLength(1);
    const emitted = bookkeeping[0] as unknown as {
      severity: string;
      kind: string;
      dedupeKey: string;
    };
    expect(emitted.severity).toBe('critical');
    expect(emitted.kind).toBe('pool_bookkeeping_failure');
    expect(emitted.dedupeKey).toMatch(
      /^pool_bookkeeping_failure:gemini\.monthlySpend:\d{4}-\d{2}-\d{2}T\d{2}$/,
    );

    // MUTATION-PROVABLE: restore the storeFailure denial in
    // PoolRegistry.reserve and this reds.
    const stillAdmitted = service.pools.reserve(
      'gemini.monthlySpend',
      1,
      'probe',
    );
    expect(stillAdmitted.admitted).toBe(true);

    // ...and the blind admission is CRITICAL and named, deduped per pool per
    // UTC day. Removing the onUnconfirmedAdmit wiring reds this.
    const blind = opsAlerts.emit.mock.calls
      .map((call: unknown[]) => call[0] as { kind: string; severity: string })
      .filter((alert) => alert.kind === 'pool_window_unconfirmed');
    expect(blind).toHaveLength(1);
    expect(blind[0].severity).toBe('critical');
    expect((blind[0] as unknown as { dedupeKey: string }).dedupeKey).toMatch(
      /^pool_window_unconfirmed:gemini\.monthlySpend:\d{4}-\d{2}-\d{2}$/,
    );

    // Store recovers → ensureWindow flushes successfully → the pool is
    // confirmed again and the screaming stops.
    consumptionStore.add.mockResolvedValue(undefined);
    await service.pools.ensureWindow('gemini.monthlySpend');
    expect(
      service.pools.reserve('gemini.monthlySpend', 1, 'probe').admitted,
    ).toBe(true);
    expect(
      opsAlerts.emit.mock.calls
        .map((call: unknown[]) => call[0] as { kind: string })
        .filter((alert) => alert.kind === 'pool_window_unconfirmed'),
    ).toHaveLength(1);
  });
});

/**
 * F350 — ONE DRAW, ONE ANNOUNCEMENT. `onDrawConsumed` is the single place a
 * vendor draw is declared to have happened; the api_usage_ledger row and the
 * campaign envelope both hang off it. The load-bearing case is the THROW: the
 * pool debits an admitted draw whose act died in transport, and before this
 * the ledger and the envelope saw nothing at all, so cost-reconcile was blind
 * to that spend. Each assertion below can show RED by deleting the matching
 * announceDrawConsumed call.
 */
describe('GovernanceService.drawWithOutcome — the per-draw meter (F350)', () => {
  it('announces the draw on the SUCCESS path', async () => {
    const { service } = buildService();
    await service.onModuleInit();
    const meter = jest.fn();
    const outcome = await service.drawWithOutcome(
      'gemini.monthlySpend',
      'probe',
      () => Promise.resolve('ok'),
      { onDrawConsumed: meter },
    );
    expect(outcome.admitted).toBe(true);
    expect(meter).toHaveBeenCalledTimes(1);
  });

  it('announces the draw on the THROW path too — the gap that made errored spend invisible', async () => {
    const { service } = buildService();
    await service.onModuleInit();
    const meter = jest.fn();
    await expect(
      service.drawWithOutcome(
        'gemini.monthlySpend',
        'probe',
        () => Promise.reject(new Error('ECONNRESET')),
        { onDrawConsumed: meter },
      ),
    ).rejects.toThrow('ECONNRESET');
    expect(meter).toHaveBeenCalledTimes(1);
  });

  it('does NOT announce a draw that was DENIED — a denial never reached the vendor', async () => {
    const { service } = buildService();
    await service.onModuleInit();
    // Shrink the pool to a single unit and spend it, so the draw under test
    // is refused at admission.
    service.pools.resetLimit('gemini.monthlySpend', 1);
    await service.drawWithOutcome('gemini.monthlySpend', 'probe', () =>
      Promise.resolve('ok'),
    );
    const meter = jest.fn();
    const act = jest.fn();
    const outcome = await service.drawWithOutcome(
      'gemini.monthlySpend',
      'probe',
      act,
      { onDrawConsumed: meter },
    );
    expect(outcome.admitted).toBe(false);
    expect(act).not.toHaveBeenCalled();
    expect(meter).not.toHaveBeenCalled();
  });

  it('a meter that throws cannot fail the draw it meters', async () => {
    const { service } = buildService();
    await service.onModuleInit();
    const outcome = await service.drawWithOutcome(
      'gemini.monthlySpend',
      'probe',
      () => Promise.resolve('ok'),
      {
        onDrawConsumed: () => {
          throw new Error('ledger down');
        },
      },
    );
    expect(outcome.admitted).toBe(true);
  });
});
