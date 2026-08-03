/**
 * §3 monthly partitions — automatic creation ahead of the clock. The lead is
 * §16 K6 definitional: [current .. current+2] must always be present so a
 * missed cron day can never strand an insert without a partition.
 */
import {
  PARTITION_LEAD_MONTHS,
  SignalPartitionMaintenanceService,
  partitionDdl,
  partitionMonths,
} from './signal-partition-maintenance.service';

describe('SignalPartitionMaintenanceService (§3 monthly partitions)', () => {
  it('derives [current .. current+2] UTC months with correct labels and boundaries', () => {
    const months = partitionMonths(new Date('2026-07-20T23:59:59Z'));
    expect(months).toEqual([
      { label: '2026_07', fromIso: '2026-07-01', toIso: '2026-08-01' },
      { label: '2026_08', fromIso: '2026-08-01', toIso: '2026-09-01' },
      { label: '2026_09', fromIso: '2026-09-01', toIso: '2026-10-01' },
    ]);
    expect(PARTITION_LEAD_MONTHS).toBe(2);
  });

  it('rolls the year boundary correctly (Dec → Jan/Feb)', () => {
    const months = partitionMonths(new Date('2026-12-03T00:00:00Z'));
    expect(months.map((m) => m.label)).toEqual([
      '2026_12',
      '2027_01',
      '2027_02',
    ]);
    expect(months[2]).toMatchObject({
      fromIso: '2027-02-01',
      toIso: '2027-03-01',
    });
  });

  it('emits idempotent DDL (CREATE TABLE IF NOT EXISTS ... PARTITION OF signals)', () => {
    const ddl = partitionDdl({
      label: '2026_08',
      fromIso: '2026-08-01',
      toIso: '2026-09-01',
    });
    expect(ddl).toBe(
      'CREATE TABLE IF NOT EXISTS signals_p2026_08 PARTITION OF signals ' +
        "FOR VALUES FROM ('2026-08-01 00:00:00') TO ('2026-09-01 00:00:00')",
    );
  });

  function harness(options: { leadPartitionPresent?: boolean } = {}) {
    const executeRawUnsafe = jest.fn().mockResolvedValue(0);
    const queryRaw = jest
      .fn()
      .mockResolvedValue(
        options.leadPartitionPresent === false
          ? []
          : [{ relname: 'signals_p2026_08' }],
      );
    const logger = {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const opsAlerts = { emit: jest.fn() };
    const service = new SignalPartitionMaintenanceService(
      { $executeRawUnsafe: executeRawUnsafe, $queryRaw: queryRaw } as never,
      opsAlerts as never,
      logger as never,
    );
    return { service, executeRawUnsafe, queryRaw, logger, opsAlerts };
  }

  const NOW = new Date('2026-07-20T12:00:00Z');

  it('ensurePartitions executes one idempotent statement per month and never throws on failure', async () => {
    const { service, executeRawUnsafe } = harness();
    await service.ensurePartitions(NOW);
    expect(executeRawUnsafe).toHaveBeenCalledTimes(3);
    expect(executeRawUnsafe.mock.calls.map(([sql]) => sql as string)).toEqual(
      expect.arrayContaining([expect.stringContaining('signals_p2026_09')]),
    );
  });

  /**
   * F205: not crashing and not telling anyone are different decisions. A dead
   * partition cron eventually means every user act is silently dropped, so
   * this is the one ledger background failure that is CRITICAL.
   */
  it('a DDL failure still swallows, but now rings the CRITICAL bell', async () => {
    const { service, executeRawUnsafe, logger, opsAlerts } = harness();
    executeRawUnsafe.mockRejectedValue(new Error('db down'));

    await expect(service.ensurePartitions(NOW)).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalled();
    expect(opsAlerts.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'critical',
        kind: 'signal_partition_maintenance_failed',
        dedupeKey: 'signal_partition_maintenance_failed:2026-07-20',
      }),
    );
  });

  /**
   * THE ASSERTION A DEAD SCHEDULER CANNOT FOOL. A cron that never runs raises
   * no exception, so the catch above cannot report it. This checks the
   * INVARIANT — a partition covering now+1 month exists — which fails on a
   * dead scheduler as readily as on a broken DDL.
   */
  it('alerts CRITICAL when the now+1-month partition is absent', async () => {
    const { service, opsAlerts } = harness({ leadPartitionPresent: false });

    await expect(service.assertLeadPartitionExists(NOW)).resolves.toBe(false);

    expect(opsAlerts.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'critical',
        kind: 'signal_lead_partition_missing',
        dedupeKey: 'signal_lead_partition_missing:2026-07-20',
      }),
    );
    const firstAlert = (
      opsAlerts.emit.mock.calls as Array<[{ body: string }]>
    )[0][0];
    expect(firstAlert.body).toContain('signals_p2026_08');
  });

  it('stays silent — and reports true — while the lead partition is there', async () => {
    const { service, opsAlerts, queryRaw } = harness();

    await expect(service.assertLeadPartitionExists(NOW)).resolves.toBe(true);

    expect(opsAlerts.emit).not.toHaveBeenCalled();
    // Asks for the NEXT month, not the current one — a check that only ever
    // looked at today's partition would be green until the day it was fatal.
    const firstCallArgs = (queryRaw.mock.calls as unknown[][])[0];
    expect(firstCallArgs.slice(1)).toContain('signals_p2026_08');
  });

  it('a check that could not run says so rather than passing', async () => {
    const { service, opsAlerts, queryRaw } = harness();
    queryRaw.mockRejectedValue(new Error('connection reset'));

    await expect(service.assertLeadPartitionExists(NOW)).resolves.toBe(false);

    expect(opsAlerts.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'warn',
        kind: 'signal_lead_partition_check_failed',
      }),
    );
  });
});
