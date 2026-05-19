import { Injectable } from '@nestjs/common';
import {
  DemandSignalKind,
  DemandSourceKind,
  Prisma,
  SearchLogEventKind,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { SearchDemandAggregationService } from '../analytics/search-demand-aggregation.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_POPULARITY_WINDOW_DAYS = 30;

@Injectable()
export class SearchPopularityService {
  private readonly logger: LoggerService;

  constructor(
    private readonly demandAggregation: SearchDemandAggregationService,
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchPopularityService');
  }

  async getEntityPopularityScores(
    entityIds: string[],
    marketKey?: string | null,
  ): Promise<Map<string, number>> {
    if (!entityIds.length) {
      return new Map();
    }

    try {
      const rows = await this.demandAggregation.listEntityDemand({
        since: this.defaultSince(),
        until: this.startOfUtcDay(new Date()),
        entityIds,
        marketKey,
        scopeMode: marketKey ? 'scoped' : 'global',
        sourceKinds: [
          DemandSourceKind.search_log,
          DemandSourceKind.restaurant_view,
          DemandSourceKind.food_view,
          DemandSourceKind.favorite,
        ],
        signalKinds: [
          DemandSignalKind.backend,
          DemandSignalKind.cache,
          DemandSignalKind.autocomplete_selection,
          DemandSignalKind.restaurant_view,
          DemandSignalKind.food_view,
          DemandSignalKind.favorite,
        ],
        limit: Math.max(entityIds.length * 20, 1000),
      });
      const scores = this.mergeDemandScoresByEntity(rows);
      const freshScores = await this.loadFreshSearchLogPopularity(entityIds, {
        marketKey,
        cacheWeight: 0.35,
      });
      for (const [entityId, score] of freshScores) {
        scores.set(entityId, (scores.get(entityId) ?? 0) + score);
      }
      return scores;
    } catch (error) {
      this.logger.warn('Failed to load entity popularity scores', {
        entityCount: entityIds.length,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return new Map();
    }
  }

  private async loadFreshSearchLogPopularity(
    entityIds: string[],
    options?:
      | string
      | null
      | { marketKey?: string | null; userId?: string; cacheWeight?: number },
  ): Promise<Map<string, number>> {
    const marketKey =
      typeof options === 'string' || options === null
        ? options
        : options?.marketKey;
    const normalizedMarketKey =
      typeof marketKey === 'string' ? marketKey.trim().toLowerCase() : '';
    const userId =
      typeof options === 'object' && options !== null ? options.userId : null;
    const cacheWeight =
      typeof options === 'object' &&
      options !== null &&
      Number.isFinite(options.cacheWeight)
        ? Math.max(0, Number(options.cacheWeight))
        : 0.35;
    const todayKey = this.formatDateKey(this.startOfUtcDay(new Date()));
    const filters: Prisma.Sql[] = [
      Prisma.sql`entity_id IN (${Prisma.join(
        entityIds.map((id) => Prisma.sql`${id}::uuid`),
      )})`,
      Prisma.sql`event_kind IN (${Prisma.join(
        [SearchLogEventKind.backend, SearchLogEventKind.cache].map(
          (kind) => Prisma.sql`${kind}::search_log_event_kind`,
        ),
      )})`,
      Prisma.sql`logged_at >= ${todayKey}::date`,
    ];

    if (userId) {
      filters.push(Prisma.sql`user_id = ${userId}::uuid`);
    }

    if (normalizedMarketKey) {
      filters.push(Prisma.sql`LOWER(market_key) = ${normalizedMarketKey}`);
    }

    const rows = await this.prisma.$queryRaw<
      Array<{ entityId: string; demandScore: number }>
    >(Prisma.sql`
      WITH event_rows AS (
        SELECT DISTINCT
          entity_id::text AS "entityId",
          user_id::text AS "userId",
          COALESCE(search_request_id::text, log_id::text) AS "eventKey",
          event_kind AS "eventKind",
          (
            metadata->>'submissionSource' = 'autocomplete'
            AND metadata#>>'{submissionContext,matchType}' = 'entity'
            AND metadata#>>'{submissionContext,selectedEntityId}' = entity_id::text
            AND metadata#>>'{submissionContext,selectedEntityType}' = entity_type::text
          ) AS "isAutocompleteSelection"
        FROM user_search_logs
        WHERE ${Prisma.join(filters, ' AND ')}
      ),
      weighted_by_user AS (
        SELECT
          "entityId",
          "userId",
          SUM(
            CASE
              WHEN "isAutocompleteSelection" THEN 1.5
              WHEN "eventKind" = 'cache'::search_log_event_kind THEN ${cacheWeight}
              ELSE 1.0
            END
          )::double precision AS "weightedEventCount"
        FROM event_rows
        GROUP BY "entityId", "userId"
      )
      SELECT
        "entityId",
        SUM(LN(1 + "weightedEventCount") / LN(2))::double precision AS "demandScore"
      FROM weighted_by_user
      GROUP BY "entityId"
    `);

    const scores = new Map<string, number>();
    for (const row of rows) {
      scores.set(row.entityId, Number(row.demandScore));
    }
    return scores;
  }

  async getUserEntityAffinity(
    userId: string,
    entityIds: string[],
  ): Promise<Map<string, number>> {
    if (!userId || !entityIds.length) {
      return new Map();
    }

    try {
      const rows = await this.demandAggregation.listEntityDemand({
        since: this.defaultSince(),
        until: this.startOfUtcDay(new Date()),
        userId,
        entityIds,
        scopeMode: 'global',
        sourceKinds: [
          DemandSourceKind.search_log,
          DemandSourceKind.restaurant_view,
          DemandSourceKind.food_view,
          DemandSourceKind.favorite,
        ],
        signalKinds: [
          DemandSignalKind.backend,
          DemandSignalKind.cache,
          DemandSignalKind.autocomplete_selection,
          DemandSignalKind.restaurant_view,
          DemandSignalKind.food_view,
          DemandSignalKind.favorite,
        ],
        cacheWeight: 1,
        limit: Math.max(entityIds.length * 20, 1000),
      });
      const scores = this.mergeDemandScoresByEntity(rows);
      const freshScores = await this.loadFreshSearchLogPopularity(entityIds, {
        userId,
        cacheWeight: 1,
      });
      for (const [entityId, score] of freshScores) {
        scores.set(entityId, (scores.get(entityId) ?? 0) + score);
      }
      return scores;
    } catch (error) {
      this.logger.warn('Failed to load user affinity scores', {
        userId,
        entityCount: entityIds.length,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return new Map();
    }
  }

  private defaultSince(): Date {
    const raw = Number(process.env.SEARCH_POPULARITY_WINDOW_DAYS);
    const windowDays =
      Number.isFinite(raw) && raw > 0
        ? Math.min(Math.floor(raw), 365)
        : DEFAULT_POPULARITY_WINDOW_DAYS;
    return new Date(Date.now() - windowDays * MS_PER_DAY);
  }

  private mergeDemandScoresByEntity(
    rows: Array<{ entityId: string | null; demandScore: number }>,
  ): Map<string, number> {
    const scores = new Map<string, number>();
    for (const row of rows) {
      if (!row.entityId) {
        continue;
      }
      scores.set(
        row.entityId,
        (scores.get(row.entityId) ?? 0) + row.demandScore,
      );
    }
    return scores;
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private formatDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
