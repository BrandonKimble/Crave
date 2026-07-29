import { GovernanceService } from './governance.service';

/**
 * §24 red team finding 4 ("restart-safe campaigns"): a process restart used
 * to forget every live campaign's pool grant entirely (grants are only
 * registered at approve()-time, in-memory) — the FIRST recordSpend after a
 * restart would throw PoolRegistrationError instead of metering. onModuleInit
 * must re-register a grant pool (sized like approve() sizes it) for every
 * 'approved'/'running' campaign and immediately meter its spent-to-date, so
 * remaining capacity is honest, not a fresh zero.
 */

function stubLogger() {
  return {
    setContext: jest.fn().mockReturnThis(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function buildService(campaignRows: unknown[], findManyError?: Error) {
  const consumptionStore = {
    load: jest.fn().mockResolvedValue(null),
    add: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    spendUnitCost: { findUnique: jest.fn().mockResolvedValue(null) },
    spendCampaign: {
      findMany: findManyError
        ? jest.fn().mockRejectedValue(findManyError)
        : jest.fn().mockResolvedValue(campaignRows),
    },
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
    prisma as never,
    opsAlerts as never,
  );
  return { service, prisma, logger, opsAlerts, consumptionStore };
}

describe('GovernanceService.onModuleInit reRegisterCampaignGrants (§24 red team finding 4)', () => {
  it('re-registers a grant pool for an approved/running campaign, sized like approve(), and meters spent-to-date', async () => {
    const { service, prisma } = buildService([
      {
        campaignId: 'camp-1',
        estimateMicros: 1_000_000n,
        toleranceFraction: 0.25,
        spentMicros: 200_000n,
      },
    ]);

    await service.onModuleInit();

    expect(prisma.spendCampaign.findMany).toHaveBeenCalledWith({
      where: { state: { in: ['approved', 'running'] } },
      select: {
        campaignId: true,
        estimateMicros: true,
        toleranceFraction: true,
        spentMicros: true,
      },
    });
    const status = service.pools.poolStatus('campaign.camp-1');
    // envelope = 1_000_000 * 1.25 = 1_250_000
    expect(status.limit).toBe(1_250_000);
    // spentMicros=200_000 was immediately metered, so used reflects it.
    expect(status.used).toBe(200_000);
  });

  it('skips pilot campaigns (estimateMicros null — nothing to register)', async () => {
    const { service } = buildService([
      {
        campaignId: 'pilot-1',
        estimateMicros: null,
        toleranceFraction: null,
        spentMicros: 50_000n,
      },
    ]);

    await service.onModuleInit();

    expect(() => service.pools.poolStatus('campaign.pilot-1')).toThrow();
  });

  it('a bad row does not kill boot — other campaigns still register (non-fatal per-row)', async () => {
    // Two rows sharing a campaignId: the second's register() call throws
    // PoolRegistrationError ('already registered') — proves one bad row
    // can't take down the rest of the loop.
    const { service, logger } = buildService([
      {
        campaignId: 'dup-1',
        estimateMicros: 500_000n,
        toleranceFraction: 0.25,
        spentMicros: 0n,
      },
      {
        campaignId: 'dup-1',
        estimateMicros: 500_000n,
        toleranceFraction: 0.25,
        spentMicros: 0n,
      },
      {
        campaignId: 'good-1',
        estimateMicros: 500_000n,
        toleranceFraction: 0.25,
        spentMicros: 0n,
      },
    ]);

    await expect(service.onModuleInit()).resolves.not.toThrow();
    expect(service.pools.poolStatus('campaign.good-1').limit).toBe(625_000);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('a failed findMany read is non-fatal (boot must never fail on this)', async () => {
    const { service } = buildService([], new Error('db down'));
    await expect(service.onModuleInit()).resolves.not.toThrow();
  });
});

describe('GovernanceService durable-flush failure (single fail semantic: hard-close, loudly)', () => {
  it('a failed durable flush logs at error, emits a critical pool_bookkeeping_failure ops alert (deduped per pool per hour), and hard-closes the pool: the next draw refuses', async () => {
    const { service, logger, opsAlerts, consumptionStore } = buildService([]);
    await service.onModuleInit(); // healthy load → windows confirmed

    // The store starts failing writes; the next reconcile's flush fails.
    consumptionStore.add.mockRejectedValue(new Error('store down'));
    const res = service.pools.reserve('tomtom.reverseGeocode', 1, 'probe');
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
      /^pool_bookkeeping_failure:tomtom\.reverseGeocode:\d{4}-\d{2}-\d{2}T\d{2}$/,
    );

    // RED-provable hard-close: flush failure → the draw attempt refuses.
    const denied = service.pools.reserve('tomtom.reverseGeocode', 1, 'probe');
    expect(denied.admitted).toBe(false);
    if (!denied.admitted) {
      expect(denied.reason).toBe('storeFailure');
    }

    // Store recovers → ensureWindow flushes successfully → draws admit again.
    consumptionStore.add.mockResolvedValue(undefined);
    await service.pools.ensureWindow('tomtom.reverseGeocode');
    expect(
      service.pools.reserve('tomtom.reverseGeocode', 1, 'probe').admitted,
    ).toBe(true);
  });
});
