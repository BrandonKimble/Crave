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

  /**
   * D149 — WARN EMAILS ARE OPT-IN, PER KIND.
   *
   * Before this, a `warn` was a dashboard row and nothing else, which made
   * every spend-anomaly signal invisible in practice. Emailing ALL warns
   * would be the opposite failure (an inbox nobody reads), so the emitter
   * chooses. Each assertion names its mutation.
   */
  describe('email routing', () => {
    const buildEmailing = () => {
      process.env.RESEND_API_KEY = 'test-key';
      process.env.OPS_ALERT_EMAIL = 'owner@example.com';
      const sent: Array<{ subject: string }> = [];
      const fetchMock = jest
        .fn()
        .mockImplementation((_url: string, init: { body: string }) => {
          sent.push(JSON.parse(init.body) as { subject: string });
          return Promise.resolve({ ok: true, status: 200 });
        });
      (globalThis as { fetch: unknown }).fetch = fetchMock;
      const service = new OpsAlertsService(
        buildPrisma() as never,
        stubLogger() as never,
      );
      return { service, sent };
    };
    const priorFetch = globalThis.fetch;
    const priorTo = process.env.OPS_ALERT_EMAIL;
    afterEach(() => {
      (globalThis as { fetch: unknown }).fetch = priorFetch;
      if (priorTo === undefined) delete process.env.OPS_ALERT_EMAIL;
      else process.env.OPS_ALERT_EMAIL = priorTo;
    });

    it('a plain warn does NOT email (the default is still a dashboard row)', async () => {
      const { service, sent } = buildEmailing();
      service.emit({
        severity: 'warn',
        kind: 'ambient',
        title: 'ambient',
        body: 'b',
        dedupeKey: 'ambient:1',
      });
      await service.onModuleDestroy();
      expect(sent).toHaveLength(0);
    });

    it('a warn with emailOnWarn DOES email, subject-tagged [WARN]', async () => {
      // MUTATION: drop the emailOnWarn arm in emit() and this reds — the
      // exact "spend anomalies were dashboard-only" defect D149 names.
      const { service, sent } = buildEmailing();
      service.emit({
        severity: 'warn',
        emailOnWarn: true,
        kind: 'spend_vs_expectation',
        title: 'google_places spend is running hot this month',
        body: 'b',
        dedupeKey: 'spend_vs_expectation_warn:google_places:2026-08',
      });
      await service.onModuleDestroy();
      expect(sent).toHaveLength(1);
      expect(sent[0].subject).toBe(
        '[WARN] google_places spend is running hot this month',
      );
    });

    it('critical still emails without opting in, and keeps its [CRITICAL] tag', async () => {
      const { service, sent } = buildEmailing();
      service.emit({
        severity: 'critical',
        kind: 'vendor_quota',
        title: 'Cloudinary aws_rek_moderation is at 96% of its allowance',
        body: 'b',
        dedupeKey:
          'vendor_quota:cloudinary:aws_rek_moderation:critical:2026-08',
      });
      await service.onModuleDestroy();
      expect(sent).toHaveLength(1);
      expect(sent[0].subject).toContain('[CRITICAL]');
    });
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
