import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GovernanceService } from '../external-integrations/governance/governance.service';
import { OpsAlertsService } from '../external-integrations/shared/ops-alerts.service';
import { CollectorSourceRegistryService } from '../content-processing/reddit-collector/collector-source-registry.service';
import { geminiCostMicros } from '../external-integrations/shared/gemini-pricing';
import {
  placesCostMicrosPerCall,
  tomtomCostMicrosPerDraw,
} from '../external-integrations/shared/vendor-pricing';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** §16 K3-shaped operational bound: the sparkline's window length — long
 *  enough to see a trend, short enough to stay a glance-able chart. Mirrors
 *  spend-analytics.service.ts's UNIT_COST_WINDOW_DAYS (same 30-day horizon,
 *  independently named here since this module has no dependency on that
 *  service's internal constant). */
const SPARKLINE_DAYS = 30;

export interface OpsSummary {
  spend: {
    monthToDateByService: Record<string, number>;
    last30DailyGeminiMicros: number[];
    expectationProratedMicros: number | null;
    warnThresholdMicros: number | null;
  };
  pools: Array<{
    name: string;
    used: number;
    limit: number;
    resetMs: number | null;
    poisonedForMs: number | null;
  }>;
  campaigns: unknown[];
  lanes: unknown[];
  unitCosts: unknown[];
  alerts: {
    latest: unknown[];
    unacknowledgedCount: number;
  };
  collection: {
    docs24h: number;
    entities24h: number;
    drainPending: number | null;
  };
}

/**
 * §18.4 GET /ops/api/summary assembly. Reads existing tables/services
 * directly (spend_unit_costs, spend_campaigns, ops_alerts, governance pool
 * status, collector heartbeats) — no new derivation logic, only a read-side
 * shape for the dashboard.
 */
@Injectable()
export class OpsSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly opsAlerts: OpsAlertsService,
    private readonly registry: CollectorSourceRegistryService,
    @Optional() private readonly governance?: GovernanceService,
  ) {}

  async summary(now: Date = new Date()): Promise<OpsSummary> {
    const [
      spend,
      pools,
      campaigns,
      lanes,
      unitCosts,
      alerts,
      unacknowledgedCount,
      collection,
    ] = await Promise.all([
      this.spendSummary(now),
      Promise.resolve(this.poolsSummary()),
      this.prisma.spendCampaign.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.registry.collectorHeartbeats(now).catch(() => []),
      this.prisma.spendUnitCost.findMany(),
      this.opsAlerts.list(50),
      this.opsAlerts.unacknowledgedCount(),
      this.collectionPulse(now),
    ]);

    return {
      spend,
      pools,
      campaigns,
      lanes,
      unitCosts,
      alerts: { latest: alerts, unacknowledgedCount },
      collection,
    };
  }

  private poolsSummary(): OpsSummary['pools'] {
    if (!this.governance) {
      return [];
    }
    return this.governance.pools.listRegistered().map((pool) => {
      const status = this.governance!.pools.poolStatus(pool.name);
      return {
        name: pool.name,
        used: status.used,
        limit: status.limit,
        resetMs: status.resetMs,
        poisonedForMs: status.poisonedForMs,
      };
    });
  }

  private async spendSummary(now: Date): Promise<OpsSummary['spend']> {
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const [geminiMtd, placesMtd, tomtomMtd] = await Promise.all([
      this.geminiMicros(monthStart, now),
      this.placesMicros(monthStart, now),
      this.tomtomMicros(monthStart, now),
    ]);

    const dailyTotals: number[] = [];
    for (let i = SPARKLINE_DAYS - 1; i >= 0; i--) {
      const start = new Date(now.getTime() - (i + 1) * MS_PER_DAY);
      const end = new Date(start.getTime() + MS_PER_DAY);
      dailyTotals.push(await this.geminiMicros(start, end));
    }
    const n = dailyTotals.length;
    const mean = n > 0 ? dailyTotals.reduce((a, b) => a + b, 0) / n : 0;
    const variance =
      n > 0 ? dailyTotals.reduce((a, b) => a + (b - mean) ** 2, 0) / n : 0;
    const stddev = Math.sqrt(variance);
    const dayOfMonth = Math.max(
      1,
      Math.floor((now.getTime() - monthStart.getTime()) / MS_PER_DAY) + 1,
    );
    const expectationProratedMicros = mean * dayOfMonth;
    const warnThresholdMicros =
      expectationProratedMicros + 3 * stddev * Math.sqrt(dayOfMonth);

    return {
      monthToDateByService: {
        gemini: geminiMtd,
        google_places: placesMtd,
        tomtom: tomtomMtd,
      },
      last30DailyGeminiMicros: dailyTotals,
      expectationProratedMicros:
        expectationProratedMicros > 0 ? expectationProratedMicros : null,
      warnThresholdMicros:
        expectationProratedMicros > 0 ? warnThresholdMicros : null,
    };
  }

  private async geminiMicros(start: Date, end: Date): Promise<number> {
    const rows = await this.prisma.apiUsageEvent.findMany({
      where: { service: 'gemini', createdAt: { gte: start, lt: end } },
      select: {
        inputTokens: true,
        outputTokens: true,
        cachedTokens: true,
        model: true,
        mode: true,
      },
    });
    let total = 0;
    for (const row of rows) {
      total += geminiCostMicros({
        model: row.model ?? undefined,
        mode: (row.mode as 'interactive' | 'batch' | undefined) ?? undefined,
        inputTokens: row.inputTokens ?? 0,
        outputTokens: row.outputTokens ?? 0,
        cachedTokens: row.cachedTokens ?? 0,
      });
    }
    return total;
  }

  private async placesMicros(start: Date, end: Date): Promise<number> {
    const rows = await this.prisma.apiUsageEvent.findMany({
      where: { service: 'google_places', createdAt: { gte: start, lt: end } },
      select: { skuTier: true, requestCount: true },
    });
    let total = 0;
    for (const row of rows) {
      total +=
        placesCostMicrosPerCall(row.skuTier ?? null) * (row.requestCount ?? 0);
    }
    return total;
  }

  private async tomtomMicros(start: Date, end: Date): Promise<number> {
    const agg = await this.prisma.apiUsageEvent.aggregate({
      where: { service: 'tomtom', createdAt: { gte: start, lt: end } },
      _sum: { requestCount: true },
    });
    return (agg._sum.requestCount ?? 0) * tomtomCostMicrosPerDraw;
  }

  private async collectionPulse(now: Date): Promise<OpsSummary['collection']> {
    const since = new Date(now.getTime() - MS_PER_DAY);
    const [docs24h, entities24h] = await Promise.all([
      this.prisma.sourceDocument
        .count({ where: { collectedAt: { gte: since } } })
        .catch(() => 0),
      this.prisma.restaurantEntityEvent
        .count({ where: { createdAt: { gte: since } } })
        .catch(() => 0),
    ]);
    return { docs24h, entities24h, drainPending: null };
  }
}
