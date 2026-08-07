import { DeletionPurgeService } from './deletion-purge.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { LoggerService } from '../../../shared';
import type { PersonDataEraserService } from './person-data-eraser.service';
import type { AccountDeletionService } from '../account-deletion.service';
import type {
  EmitOpsAlertParams,
  OpsAlertsService,
} from '../../external-integrations/shared/ops-alerts.service';

/**
 * F9311 — a per-account purge failure used to be caught, counted into a
 * `failed` tally nobody reads, and left for tomorrow forever. A permanently
 * stuck, legally-required erasure was invisible. These tests hold the bell.
 */
describe('DeletionPurgeService — purge-failure alerting (F9311)', () => {
  const DAY = 86_400_000;

  function harness(options: { purgeDueAt: Date; purgeThrows?: Error }): {
    service: DeletionPurgeService;
    alerts: EmitOpsAlertParams[];
    updates: unknown[];
  } {
    const alerts: EmitOpsAlertParams[] = [];
    const updates: unknown[] = [];

    const prisma = {
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { userId: 'user_stuck', purgeDueAt: options.purgeDueAt },
          ]),
        update: jest.fn((args: unknown) => {
          updates.push(args);
          return Promise.resolve({});
        }),
      },
    } as unknown as PrismaService;

    const accountDeletion = {
      purgeAccount: jest.fn(() =>
        options.purgeThrows
          ? Promise.reject(options.purgeThrows)
          : Promise.resolve(),
      ),
    } as unknown as AccountDeletionService;

    const eraser = {
      erase: jest.fn().mockResolvedValue(undefined),
      assertShellIsAnonymous: jest.fn().mockResolvedValue(undefined),
    } as unknown as PersonDataEraserService;

    const opsAlerts = {
      emit: (params: EmitOpsAlertParams) => {
        alerts.push(params);
      },
    } as unknown as OpsAlertsService;

    const logger = {
      setContext: () => logger,
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as LoggerService;

    return {
      service: new DeletionPurgeService(
        prisma,
        eraser,
        accountDeletion,
        opsAlerts,
        logger,
      ),
      alerts,
      updates,
    };
  }

  it('fires a critical ops alert carrying the userId and days-overdue when a purge throws', async () => {
    // Deadline stamped 4 days ago and never moved => 4 days overdue.
    const { service, alerts } = harness({
      purgeDueAt: new Date(Date.now() - 4 * DAY - 60_000),
      purgeThrows: new Error('clerk delete 503'),
    });

    const result = await service.purgeDueAccounts();

    expect(result).toEqual({ purged: 0, failed: 1 });
    // MUTATION GUARD: delete the opsAlerts.emit call in the catch block and
    // this expectation goes RED.
    expect(alerts).toHaveLength(1);
    const alert = alerts[0];
    expect(alert.severity).toBe('critical');
    expect(alert.kind).toBe('deletion_purge_failed');
    expect(alert.body).toContain('user_stuck');
    expect(alert.body).toContain('clerk delete 503');
    expect(alert.body).toContain('Days overdue: 4');
    // Per-ACCOUNT dedupeKey: a stuck account is one issue, not one per pass.
    expect(alert.dedupeKey).toBe('deletion_purge_failed:user_stuck');
  });

  it('leaves the deadline set on failure (retry behavior unchanged)', async () => {
    const { service, updates } = harness({
      purgeDueAt: new Date(Date.now() - DAY),
      purgeThrows: new Error('boom'),
    });

    await service.purgeDueAccounts();

    // No update at all => purgeDueAt still stamped => tomorrow retries.
    expect(updates).toHaveLength(0);
  });

  it('fires NO alert on the happy path', async () => {
    const { service, alerts, updates } = harness({
      purgeDueAt: new Date(Date.now() - DAY),
    });

    const result = await service.purgeDueAccounts();

    expect(result).toEqual({ purged: 1, failed: 0 });
    expect(alerts).toEqual([]);
    expect(updates).toEqual([
      { where: { userId: 'user_stuck' }, data: { purgeDueAt: null } },
    ]);
  });
});
