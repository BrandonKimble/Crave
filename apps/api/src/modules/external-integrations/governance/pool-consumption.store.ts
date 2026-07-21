import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { PoolConsumptionStore } from './pool-registry';

/**
 * §14.5 durable window store, Prisma/Postgres implementation: one row per
 * (pool, window), atomically incremented on write-through (ON CONFLICT DO
 * UPDATE — concurrent processes compose; no read-modify-write race). Errors
 * propagate to the registry, which translates them into fail-closed window
 * state — this class never swallows.
 */
@Injectable()
export class PrismaPoolConsumptionStore implements PoolConsumptionStore {
  constructor(private readonly prisma: PrismaService) {}

  async load(
    poolName: string,
    windowKey: string,
  ): Promise<{ consumed: number; granted: number } | null> {
    const row = await this.prisma.poolWindowConsumption.findUnique({
      where: { poolName_windowKey: { poolName, windowKey } },
      select: { consumed: true, granted: true },
    });
    return row
      ? { consumed: Number(row.consumed), granted: Number(row.granted) }
      : null;
  }

  async add(
    poolName: string,
    windowKey: string,
    delta: { consumed?: number; granted?: number },
  ): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO pool_window_consumption (pool_name, window_key, consumed, granted, updated_at)
      VALUES (${poolName}, ${windowKey}, ${delta.consumed ?? 0}::double precision, ${delta.granted ?? 0}::double precision, now())
      ON CONFLICT (pool_name, window_key) DO UPDATE
      SET consumed = pool_window_consumption.consumed + EXCLUDED.consumed,
          granted = pool_window_consumption.granted + EXCLUDED.granted,
          updated_at = now()
    `;
  }
}
