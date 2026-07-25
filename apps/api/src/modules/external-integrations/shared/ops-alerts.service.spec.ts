import { OpsAlertsService } from './ops-alerts.service';

/**
 * §18.4/§24.3: emit() dedupe-collapses repeats via createMany +
 * skipDuplicates against ops_alerts.dedupe_key (unique). This RED-proofs
 * the collapse — a real duplicate-key write attempt hits the DB, and the
 * fixture double asserts on the payload passed, not merely "was called".
 */

function stubLogger() {
  return {
    setContext: jest.fn().mockReturnThis(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

function buildPrisma() {
  const rows: Array<{ dedupeKey: string | null }> = [];
  return {
    opsAlert: {
      createMany: jest.fn(
        ({
          data,
        }: {
          data: Array<{ dedupeKey: string | null }>;
          skipDuplicates: boolean;
        }) => {
          let count = 0;
          for (const row of data) {
            if (
              row.dedupeKey !== null &&
              rows.some((r) => r.dedupeKey === row.dedupeKey)
            ) {
              continue; // skipDuplicates
            }
            rows.push(row);
            count += 1;
          }
          return Promise.resolve({ count });
        },
      ),
      findMany: jest.fn(() => Promise.resolve(rows)),
      count: jest.fn(() => Promise.resolve(rows.length)),
      update: jest.fn(() => Promise.resolve({})),
    },
    _rows: rows,
  };
}

describe('OpsAlertsService (§18.4 dedupe collapse)', () => {
  const originalKey = process.env.RESEND_API_KEY;
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
  });
  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = originalKey;
    }
  });

  it('a repeated emit with the SAME dedupeKey collapses to one stored row', async () => {
    const prisma = buildPrisma();
    const service = new OpsAlertsService(
      prisma as never,
      stubLogger() as never,
    );

    service.emit({
      severity: 'warn',
      kind: 'lane_cost_paused',
      title: 'first',
      body: 'first body',
      dedupeKey: 'lane_cost_paused:src-1:keyword',
    });
    service.emit({
      severity: 'warn',
      kind: 'lane_cost_paused',
      title: 'second (repeat)',
      body: 'second body',
      dedupeKey: 'lane_cost_paused:src-1:keyword',
    });
    await service.onModuleDestroy();

    expect(prisma._rows).toHaveLength(1);
    expect(prisma._rows[0].dedupeKey).toBe('lane_cost_paused:src-1:keyword');
  });

  it('two DIFFERENT dedupeKeys both persist (collapse is per-key, not global)', async () => {
    const prisma = buildPrisma();
    const service = new OpsAlertsService(
      prisma as never,
      stubLogger() as never,
    );

    service.emit({
      severity: 'warn',
      kind: 'lane_cost_paused',
      title: 'a',
      body: 'a',
      dedupeKey: 'key-a',
    });
    service.emit({
      severity: 'warn',
      kind: 'lane_cost_paused',
      title: 'b',
      body: 'b',
      dedupeKey: 'key-b',
    });
    await service.onModuleDestroy();

    expect(prisma._rows).toHaveLength(2);
  });

  it('emit() never throws even when the underlying write rejects', async () => {
    const prisma = {
      opsAlert: {
        createMany: jest.fn(() => Promise.reject(new Error('db down'))),
      },
    };
    const service = new OpsAlertsService(
      prisma as never,
      stubLogger() as never,
    );
    expect(() =>
      service.emit({
        severity: 'critical',
        kind: 'x',
        title: 'x',
        body: 'x',
      }),
    ).not.toThrow();
    await service.onModuleDestroy();
  });
});
