import { OpsSummaryService } from './ops-summary.service';
import { PoolRegistry } from '../external-integrations/governance/pool-registry';

/**
 * §18.4 GET /ops/api/summary: assembles from mocked services (shape test —
 * every documented top-level key is present, with the right nested shape).
 */

function buildPrisma() {
  return {
    spendCampaign: { findMany: jest.fn(() => Promise.resolve([])) },
    spendUnitCost: { findMany: jest.fn(() => Promise.resolve([])) },
    apiUsageEvent: {
      findMany: jest.fn(() => Promise.resolve([])),
      aggregate: jest.fn(() => Promise.resolve({ _sum: { requestCount: 0 } })),
    },
    sourceDocument: { count: jest.fn(() => Promise.resolve(3)) },
    restaurantEntityEvent: { count: jest.fn(() => Promise.resolve(7)) },
  };
}

function buildOpsAlerts() {
  return {
    list: jest.fn(() => Promise.resolve([{ alertId: 'a1' }])),
    unacknowledgedCount: jest.fn(() => Promise.resolve(1)),
  };
}

function buildRegistry() {
  return {
    collectorHeartbeats: jest.fn(() => Promise.resolve([{ sourceId: 's1' }])),
  };
}

function buildGovernance() {
  const pools = new PoolRegistry();
  pools.register({
    name: 'tomtom.scarcePolygons',
    credential: 'default',
    window: { kind: 'perMonth', limit: 10_000 },
    failPolicy: { kind: 'hardClosed' },
    reservationTtlMs: 60_000,
  });
  return {
    pools,
  } as unknown as import('../external-integrations/governance/governance.service').GovernanceService;
}

describe('OpsSummaryService.summary (shape test)', () => {
  it('assembles every documented top-level key', async () => {
    const service = new OpsSummaryService(
      buildPrisma() as never,
      buildOpsAlerts() as never,
      buildRegistry() as never,
      buildGovernance(),
    );
    const summary = await service.summary(new Date('2026-07-24T00:00:00Z'));

    expect(summary.spend.monthToDateByService).toEqual({
      gemini: 0,
      google_places: 0,
      tomtom: 0,
    });
    expect(Array.isArray(summary.spend.last30DailyGeminiMicros)).toBe(true);
    expect(summary.spend.last30DailyGeminiMicros).toHaveLength(30);
    expect(Array.isArray(summary.pools)).toBe(true);
    expect(summary.pools[0]).toMatchObject({ name: 'tomtom.scarcePolygons' });
    expect(Array.isArray(summary.campaigns)).toBe(true);
    expect(Array.isArray(summary.lanes)).toBe(true);
    expect(summary.lanes).toEqual([{ sourceId: 's1' }]);
    expect(Array.isArray(summary.unitCosts)).toBe(true);
    expect(summary.alerts.latest).toEqual([{ alertId: 'a1' }]);
    expect(summary.alerts.unacknowledgedCount).toBe(1);
    expect(summary.collection).toEqual({
      docs24h: 3,
      entities24h: 7,
      drainPending: null,
    });
  });

  it('runs without a live GovernanceService (slim script graphs) — pools is empty, not thrown', async () => {
    const service = new OpsSummaryService(
      buildPrisma() as never,
      buildOpsAlerts() as never,
      buildRegistry() as never,
    );
    const summary = await service.summary(new Date('2026-07-24T00:00:00Z'));
    expect(summary.pools).toEqual([]);
  });
});
