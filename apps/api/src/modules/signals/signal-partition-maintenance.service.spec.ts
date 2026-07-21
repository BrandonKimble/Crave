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

  it('ensurePartitions executes one idempotent statement per month and never throws on failure', async () => {
    const executeRawUnsafe = jest.fn().mockResolvedValue(0);
    const logger = {
      setContext: jest.fn().mockReturnThis(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const service = new SignalPartitionMaintenanceService(
      { $executeRawUnsafe: executeRawUnsafe } as never,
      logger as never,
    );
    await service.ensurePartitions(new Date('2026-07-20T12:00:00Z'));
    expect(executeRawUnsafe).toHaveBeenCalledTimes(3);
    expect(executeRawUnsafe.mock.calls.map(([sql]) => sql as string)).toEqual(
      expect.arrayContaining([expect.stringContaining('signals_p2026_09')]),
    );

    executeRawUnsafe.mockRejectedValue(new Error('db down'));
    await expect(
      service.ensurePartitions(new Date('2026-07-20T12:00:00Z')),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
