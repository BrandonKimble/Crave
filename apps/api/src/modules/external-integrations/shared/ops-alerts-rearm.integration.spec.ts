/**
 * AN ACKNOWLEDGED ALERT RE-ARMS ITS KEY (red team 2026-09-04 G-6), proven
 * against a real database.
 *
 * The table-wide unique on ops_alerts.dedupe_key made every static key a
 * permanent silencer: the source-table collapse alarm fired ONCE per table
 * for the life of the database, and acknowledging did nothing — while its
 * own body text promised "fires once until acknowledged". Uniqueness now
 * holds only among OPEN alerts (partial index), so: same key twice while
 * open → one row; ack, then same key → a second row. RED against the old
 * index: the second emit was skipped as a duplicate forever.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { OpsAlertsService } from './ops-alerts.service';

const prisma = new PrismaClient();
const KEY = `itest-rearm:${randomUUID().slice(0, 8)}`;

afterAll(async () => {
  await prisma.opsAlert.deleteMany({ where: { dedupeKey: KEY } });
  await prisma.$disconnect();
});

describe('ops-alert dedupe re-arms on acknowledgement (real DB)', () => {
  it('collapses duplicates while open, and admits the key again once acknowledged', async () => {
    const logger = {
      setContext: jest.fn().mockReturnThis(),
      warn: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
    };
    const service = new OpsAlertsService(prisma as never, logger as never);
    const emit = () =>
      service.emit({
        severity: 'warn',
        kind: 'itest-rearm',
        title: 'itest',
        body: 'itest',
        dedupeKey: KEY,
      });

    emit();
    emit();
    await service.onModuleDestroy();
    const open = await prisma.opsAlert.findMany({
      where: { dedupeKey: KEY },
    });
    expect(open).toHaveLength(1);

    await service.acknowledge(open[0].alertId);
    emit();
    await service.onModuleDestroy();
    const after = await prisma.opsAlert.findMany({
      where: { dedupeKey: KEY },
      orderBy: { createdAt: 'asc' },
    });
    expect(after).toHaveLength(2);
    expect(after[0].acknowledgedAt).not.toBeNull();
    expect(after[1].acknowledgedAt).toBeNull();
  });
});
