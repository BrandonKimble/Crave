import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  DemandSignalKind,
  DemandSourceKind,
  EntityType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_CURRENT_CYCLE_DAYS = 7;
const DEFAULT_HALF_LIFE_DAYS = 14;

type DemandAggregateWriter = Pick<
  Prisma.TransactionClient,
  '$executeRaw' | '$queryRaw'
>;

export interface SearchDemandRebuildResult {
  startDate: string;
  endDateExclusive: string;
  deletedRows: number;
  insertedRows: number;
}

export interface SearchDemandSignalSummary {
  subjectKey: string;
  entityId: string | null;
  entityType: EntityType | null;
  normalizedText: string | null;
  marketKey: string | null;
  collectableMarketKey: string | null;
  distinctUsers: number;
  signalCount: number;
  weightedSignalCount: number;
  demandScore: number;
  lastSeenAt: Date;
}

export interface SearchDemandMarketSummary {
  marketKey: string;
  distinctUsers: number;
  signalCount: number;
  weightedSignalCount: number;
  demandScore: number;
  lastSeenAt: Date;
}

export interface SearchDemandListParams {
  since: Date;
  until?: Date;
  userId?: string | null;
  scopeMode?: 'scoped' | 'global';
  marketKey?: string | null;
  collectableMarketKey?: string | null;
  entityTypes?: EntityType[];
  entityIds?: string[];
  subjectKeys?: string[];
  normalizedTextPrefix?: string | null;
  sourceKinds?: DemandSourceKind[];
  signalKinds?: DemandSignalKind[];
  limit?: number;
  cacheWeight?: number;
  currentCycleDays?: number;
  halfLifeDays?: number;
}

export interface SearchDemandMarketListParams {
  since: Date;
  until?: Date;
  minSignalCount?: number;
  minDemandScore?: number;
  sourceKinds?: DemandSourceKind[];
  signalKinds?: DemandSignalKind[];
  limit?: number;
  cacheWeight?: number;
  currentCycleDays?: number;
  halfLifeDays?: number;
}

@Injectable()
export class SearchDemandAggregationService {
  private readonly logger: LoggerService;
  private refreshInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchDemandAggregationService');
  }

  @Cron('*/15 * * * *')
  async refreshRecentDemandAggregate(): Promise<void> {
    if (process.env.SEARCH_DEMAND_AGGREGATE_REFRESH_ENABLED === 'false') {
      return;
    }
    if (this.refreshInFlight) {
      this.logger.warn('Search demand aggregate refresh already running');
      return;
    }

    this.refreshInFlight = true;
    const rawDays = Number(process.env.SEARCH_DEMAND_AGGREGATE_REFRESH_DAYS);
    const days =
      Number.isFinite(rawDays) && rawDays > 0
        ? Math.min(Math.floor(rawDays), 90)
        : 30;

    try {
      await this.prisma.$transaction(async (tx) => {
        const [lock] = await this.tryAcquireRebuildLock(tx);
        if (lock?.acquired !== true) {
          this.logger.warn('Search demand aggregate refresh lock unavailable');
          return;
        }
        await this.rebuildRecentDaysWithClient(tx, days);
      });
    } catch (error) {
      this.logger.error('Failed to refresh search demand aggregate', {
        days,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    } finally {
      this.refreshInFlight = false;
    }
  }

  async rebuildRecentDays(days = 30): Promise<SearchDemandRebuildResult> {
    const safeDays = Math.max(1, Math.min(Math.floor(days), 365));
    const endDateExclusive = this.startOfUtcDay(
      new Date(Date.now() + MS_PER_DAY),
    );
    const startDate = new Date(
      endDateExclusive.getTime() - safeDays * MS_PER_DAY,
    );
    return this.rebuildDateRange({ startDate, endDateExclusive });
  }

  async rebuildDateRange(params: {
    startDate: Date;
    endDateExclusive: Date;
  }): Promise<SearchDemandRebuildResult> {
    return this.prisma.$transaction(async (tx) => {
      await this.acquireRebuildLock(tx);
      return this.rebuildDateRangeWithClient(tx, params);
    });
  }

  private async rebuildRecentDaysWithClient(
    client: DemandAggregateWriter,
    days: number,
  ): Promise<SearchDemandRebuildResult> {
    const safeDays = Math.max(1, Math.min(Math.floor(days), 365));
    const endDateExclusive = this.startOfUtcDay(
      new Date(Date.now() + MS_PER_DAY),
    );
    const startDate = new Date(
      endDateExclusive.getTime() - safeDays * MS_PER_DAY,
    );
    return this.rebuildDateRangeWithClient(client, {
      startDate,
      endDateExclusive,
    });
  }

  private async rebuildDateRangeWithClient(
    client: DemandAggregateWriter,
    params: {
      startDate: Date;
      endDateExclusive: Date;
    },
  ): Promise<SearchDemandRebuildResult> {
    const startDate = this.startOfUtcDay(params.startDate);
    const endDateExclusive = this.startOfUtcDay(params.endDateExclusive);
    if (endDateExclusive <= startDate) {
      throw new Error('endDateExclusive must be after startDate');
    }
    const startDateKey = this.formatDate(startDate);
    const endDateExclusiveKey = this.formatDate(endDateExclusive);

    const deletedRows = await client.$executeRaw`
          DELETE FROM user_search_demand_daily
          WHERE demand_date >= ${startDateKey}::date
            AND demand_date < ${endDateExclusiveKey}::date
        `;
    const insertedCounts = [
      await this.insertSearchLogEntityCollectableSignals(
        client,
        startDateKey,
        endDateExclusiveKey,
      ),
      await this.insertSearchLogEntityUiMarketSignals(
        client,
        startDateKey,
        endDateExclusiveKey,
      ),
      await this.insertSearchLogEntityGlobalSignals(
        client,
        startDateKey,
        endDateExclusiveKey,
      ),
      await this.insertSearchLogQueryCollectableSignals(
        client,
        startDateKey,
        endDateExclusiveKey,
      ),
      await this.insertSearchLogQueryUiMarketSignals(
        client,
        startDateKey,
        endDateExclusiveKey,
      ),
      await this.insertSearchLogQueryGlobalSignals(
        client,
        startDateKey,
        endDateExclusiveKey,
      ),
      await this.insertAutocompleteSelectionCollectableSignals(
        client,
        startDateKey,
        endDateExclusiveKey,
      ),
      await this.insertAutocompleteSelectionUiMarketSignals(
        client,
        startDateKey,
        endDateExclusiveKey,
      ),
      await this.insertAutocompleteSelectionGlobalSignals(
        client,
        startDateKey,
        endDateExclusiveKey,
      ),
      await this.insertOnDemandAskCollectableSignals(
        client,
        startDateKey,
        endDateExclusiveKey,
      ),
      await this.insertOnDemandAskUiMarketSignals(
        client,
        startDateKey,
        endDateExclusiveKey,
      ),
      await this.insertOnDemandAskGlobalSignals(
        client,
        startDateKey,
        endDateExclusiveKey,
      ),
      await this.insertRestaurantViewGlobalSignals(
        client,
        startDateKey,
        endDateExclusiveKey,
      ),
      await this.insertFoodViewGlobalSignals(
        client,
        startDateKey,
        endDateExclusiveKey,
      ),
      await this.insertFavoriteGlobalSignals(
        client,
        startDateKey,
        endDateExclusiveKey,
      ),
    ];

    const insertedRows = insertedCounts.reduce((sum, count) => sum + count, 0);
    this.logger.info('Rebuilt search demand daily aggregate', {
      startDate: startDateKey,
      endDateExclusive: endDateExclusiveKey,
      deletedRows,
      insertedRows,
    });

    return {
      startDate: startDateKey,
      endDateExclusive: endDateExclusiveKey,
      deletedRows,
      insertedRows,
    };
  }

  async listEntityDemand(
    params: SearchDemandListParams,
  ): Promise<SearchDemandSignalSummary[]> {
    return this.listDemand('entity', params);
  }

  async listQueryDemand(
    params: SearchDemandListParams,
  ): Promise<SearchDemandSignalSummary[]> {
    return this.listDemand('query', params);
  }

  async listTermDemand(
    params: SearchDemandListParams,
  ): Promise<SearchDemandSignalSummary[]> {
    return this.listDemand('term', params);
  }

  async listActiveMarkets(
    params: SearchDemandMarketListParams,
  ): Promise<SearchDemandMarketSummary[]> {
    const since = this.startOfUtcDay(params.since);
    const untilExclusive = params.until
      ? this.startOfUtcDay(params.until)
      : this.startOfUtcDay(new Date(Date.now() + MS_PER_DAY));
    const recencyReferenceDate = new Date(
      untilExclusive.getTime() - MS_PER_DAY,
    );
    const sinceKey = this.formatDate(since);
    const untilExclusiveKey = this.formatDate(untilExclusive);
    const recencyReferenceDateKey = this.formatDate(recencyReferenceDate);
    const limit = Math.max(1, Math.min(params.limit ?? 100, 1000));
    const minSignalCount = Math.max(0, Math.floor(params.minSignalCount ?? 0));
    const minDemandScore = Math.max(0, params.minDemandScore ?? 0);
    const cacheWeight = this.normalizeWeight(params.cacheWeight, 0.35);
    const currentCycleDays = this.normalizePositiveNumber(
      params.currentCycleDays,
      DEFAULT_CURRENT_CYCLE_DAYS,
    );
    const halfLifeDays = this.normalizePositiveNumber(
      params.halfLifeDays,
      DEFAULT_HALF_LIFE_DAYS,
    );

    const filters: Prisma.Sql[] = [
      Prisma.sql`demand_date >= ${sinceKey}::date`,
      Prisma.sql`demand_date < ${untilExclusiveKey}::date`,
      Prisma.sql`subject_kind = 'entity'::demand_subject_kind`,
      Prisma.sql`market_key IS NOT NULL`,
      Prisma.sql`collectable_market_key IS NULL`,
    ];

    if (params.sourceKinds?.length) {
      filters.push(
        Prisma.sql`source_kind IN (${Prisma.join(
          params.sourceKinds.map(
            (kind) => Prisma.sql`${kind}::demand_source_kind`,
          ),
        )})`,
      );
    }

    if (params.signalKinds?.length) {
      filters.push(
        Prisma.sql`signal_kind IN (${Prisma.join(
          params.signalKinds.map(
            (kind) => Prisma.sql`${kind}::demand_signal_kind`,
          ),
        )})`,
      );
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        marketKey: string;
        distinctUsers: bigint;
        signalCount: bigint;
        weightedSignalCount: number;
        demandScore: number;
        lastSeenAt: Date;
      }>
    >(Prisma.sql`
      WITH weighted_daily AS (
        SELECT
          LOWER(TRIM(market_key)) AS market_key,
          user_id,
          signal_count,
          last_seen_at,
          CASE
            WHEN signal_kind = 'cache' THEN ${cacheWeight}
            WHEN signal_kind = 'autocomplete_selection' THEN 1.5
            WHEN signal_kind IN ('restaurant_view', 'food_view') THEN 0.6
            WHEN signal_kind = 'favorite' THEN 1.5
            ELSE 1.0
          END AS signal_weight,
          CASE
            WHEN GREATEST(0, (${recencyReferenceDateKey}::date - demand_date)) <= ${currentCycleDays}
              THEN 1.0
            ELSE POWER(2.0, -((GREATEST(0, (${recencyReferenceDateKey}::date - demand_date)) - ${currentCycleDays})::double precision / ${halfLifeDays}))
          END AS recency_weight
        FROM user_search_demand_daily
        WHERE ${Prisma.join(filters, ' AND ')}
      ),
      weighted_by_user AS (
        SELECT
          market_key,
          user_id,
          SUM(signal_count * signal_weight * recency_weight)::double precision AS weighted_count,
          SUM(signal_count)::bigint AS signal_count,
          MAX(last_seen_at) AS last_seen_at
        FROM weighted_daily
        GROUP BY market_key, user_id
      )
      SELECT
        market_key AS "marketKey",
        COUNT(DISTINCT user_id)::bigint AS "distinctUsers",
        SUM(signal_count)::bigint AS "signalCount",
        SUM(weighted_count)::double precision AS "weightedSignalCount",
        SUM(LN(1 + weighted_count) / LN(2))::double precision AS "demandScore",
        MAX(last_seen_at) AS "lastSeenAt"
      FROM weighted_by_user
      GROUP BY market_key
      HAVING SUM(signal_count) >= ${minSignalCount}
        AND SUM(LN(1 + weighted_count) / LN(2)) >= ${minDemandScore}
      ORDER BY "demandScore" DESC, "lastSeenAt" DESC
      LIMIT ${limit}
    `);

    return rows
      .filter((row) => row.marketKey.trim().length > 0)
      .map((row) => ({
        marketKey: row.marketKey.trim().toLowerCase(),
        distinctUsers: Number(row.distinctUsers),
        signalCount: Number(row.signalCount),
        weightedSignalCount: Number(row.weightedSignalCount ?? 0),
        demandScore: Number(row.demandScore ?? 0),
        lastSeenAt: row.lastSeenAt,
      }));
  }

  private async listDemand(
    subjectKind: 'entity' | 'query' | 'term',
    params: SearchDemandListParams,
  ): Promise<SearchDemandSignalSummary[]> {
    const since = this.startOfUtcDay(params.since);
    const untilExclusive = params.until
      ? this.startOfUtcDay(params.until)
      : this.startOfUtcDay(new Date(Date.now() + MS_PER_DAY));
    const recencyReferenceDate = new Date(
      untilExclusive.getTime() - MS_PER_DAY,
    );
    const sinceKey = this.formatDate(since);
    const untilExclusiveKey = this.formatDate(untilExclusive);
    const recencyReferenceDateKey = this.formatDate(recencyReferenceDate);
    const limit = Math.max(1, Math.min(params.limit ?? 100, 1000));
    const cacheWeight = this.normalizeWeight(params.cacheWeight, 0.35);
    const currentCycleDays = this.normalizePositiveNumber(
      params.currentCycleDays,
      DEFAULT_CURRENT_CYCLE_DAYS,
    );
    const halfLifeDays = this.normalizePositiveNumber(
      params.halfLifeDays,
      DEFAULT_HALF_LIFE_DAYS,
    );

    const filters: Prisma.Sql[] = [
      Prisma.sql`demand_date >= ${sinceKey}::date`,
      Prisma.sql`demand_date < ${untilExclusiveKey}::date`,
      Prisma.sql`subject_kind = ${subjectKind}::demand_subject_kind`,
    ];

    const userId = this.normalizeUuid(params.userId);
    if (userId) {
      filters.push(Prisma.sql`user_id = ${userId}::uuid`);
    }

    const marketKey = this.normalizeScopeKey(params.marketKey);
    if (marketKey) {
      filters.push(Prisma.sql`LOWER(market_key) = LOWER(${marketKey})`);
    }

    const collectableMarketKey = this.normalizeScopeKey(
      params.collectableMarketKey,
    );
    if (collectableMarketKey) {
      filters.push(
        Prisma.sql`LOWER(collectable_market_key) = LOWER(${collectableMarketKey})`,
      );
      filters.push(Prisma.sql`market_key IS NULL`);
    } else if (marketKey && params.scopeMode !== 'global') {
      filters.push(Prisma.sql`collectable_market_key IS NULL`);
    }
    if (params.scopeMode === 'global' && !marketKey && !collectableMarketKey) {
      filters.push(
        Prisma.sql`market_key IS NULL AND collectable_market_key IS NULL`,
      );
    }
    const collapseScope =
      params.scopeMode === 'global' && !marketKey && !collectableMarketKey;
    const marketScopeSql = collapseScope
      ? Prisma.sql`NULL::varchar`
      : Prisma.sql`market_key`;
    const collectableScopeSql = collapseScope
      ? Prisma.sql`NULL::varchar`
      : Prisma.sql`collectable_market_key`;
    const normalizedTextScopeSql =
      subjectKind === 'entity'
        ? Prisma.sql`NULL::varchar`
        : Prisma.sql`normalized_text`;

    if (params.entityTypes?.length) {
      filters.push(
        Prisma.sql`entity_type IN (${Prisma.join(
          params.entityTypes.map(
            (type) => Prisma.sql`${type}::entity_type`,
          ),
        )})`,
      );
    }

    const entityIds = (params.entityIds ?? [])
      .map((id) => this.normalizeUuid(id))
      .filter((id): id is string => id !== null);
    if (entityIds.length) {
      filters.push(
        Prisma.sql`entity_id IN (${Prisma.join(
          entityIds.map((id) => Prisma.sql`${id}::uuid`),
        )})`,
      );
    }

    const subjectKeys = (params.subjectKeys ?? [])
      .map((key) => key.trim().toLowerCase())
      .filter((key) => key.length > 0);
    if (subjectKeys.length) {
      filters.push(
        Prisma.sql`LOWER(subject_key) IN (${Prisma.join(
          subjectKeys.map((key) => Prisma.sql`${key}`),
        )})`,
      );
    }

    const normalizedTextPrefix = this.normalizeScopeKey(
      params.normalizedTextPrefix,
    );
    if (normalizedTextPrefix) {
      filters.push(
        Prisma.sql`LOWER(normalized_text) LIKE ${`${normalizedTextPrefix}%`}`,
      );
    }

    if (params.sourceKinds?.length) {
      filters.push(
        Prisma.sql`source_kind IN (${Prisma.join(
          params.sourceKinds.map(
            (kind) => Prisma.sql`${kind}::demand_source_kind`,
          ),
        )})`,
      );
    }

    if (params.signalKinds?.length) {
      filters.push(
        Prisma.sql`signal_kind IN (${Prisma.join(
          params.signalKinds.map(
            (kind) => Prisma.sql`${kind}::demand_signal_kind`,
          ),
        )})`,
      );
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        subjectKey: string;
        entityId: string | null;
        entityType: EntityType | null;
        normalizedText: string | null;
        marketKey: string | null;
        collectableMarketKey: string | null;
        distinctUsers: bigint;
        signalCount: bigint;
        weightedSignalCount: number;
        demandScore: number;
        lastSeenAt: Date;
      }>
    >(Prisma.sql`
      WITH weighted_daily AS (
        SELECT
          subject_key,
          entity_id,
          entity_type,
          ${normalizedTextScopeSql} AS normalized_text,
          ${marketScopeSql} AS market_key,
          ${collectableScopeSql} AS collectable_market_key,
          user_id,
          signal_count,
          last_seen_at,
          CASE
            WHEN signal_kind = 'cache' THEN ${cacheWeight}
            WHEN signal_kind = 'autocomplete_selection' THEN 1.5
            WHEN signal_kind IN ('restaurant_view', 'food_view') THEN 0.6
            WHEN signal_kind = 'favorite' THEN 1.5
            ELSE 1.0
          END AS signal_weight,
          CASE
            WHEN GREATEST(0, (${recencyReferenceDateKey}::date - demand_date)) <= ${currentCycleDays}
              THEN 1.0
            ELSE POWER(2.0, -((GREATEST(0, (${recencyReferenceDateKey}::date - demand_date)) - ${currentCycleDays})::double precision / ${halfLifeDays}))
          END AS recency_weight
        FROM user_search_demand_daily
        WHERE ${Prisma.join(filters, ' AND ')}
      ),
      weighted_by_user AS (
        SELECT
          subject_key,
          entity_id,
          entity_type,
          normalized_text,
          market_key,
          collectable_market_key,
          user_id,
          SUM(signal_count * signal_weight * recency_weight)::double precision AS weighted_count,
          SUM(signal_count)::bigint AS signal_count,
          MAX(last_seen_at) AS last_seen_at
        FROM weighted_daily
        GROUP BY
          subject_key,
          entity_id,
          entity_type,
          normalized_text,
          market_key,
          collectable_market_key,
          user_id
      )
      SELECT
        subject_key AS "subjectKey",
        entity_id AS "entityId",
        entity_type AS "entityType",
        normalized_text AS "normalizedText",
        market_key AS "marketKey",
        collectable_market_key AS "collectableMarketKey",
        COUNT(DISTINCT user_id)::bigint AS "distinctUsers",
        SUM(signal_count)::bigint AS "signalCount",
        SUM(weighted_count)::double precision AS "weightedSignalCount",
        SUM(LN(1 + weighted_count) / LN(2))::double precision AS "demandScore",
        MAX(last_seen_at) AS "lastSeenAt"
      FROM weighted_by_user
      GROUP BY
        subject_key,
        entity_id,
        entity_type,
        normalized_text,
        market_key,
        collectable_market_key
      ORDER BY "demandScore" DESC, "lastSeenAt" DESC
      LIMIT ${limit}
    `);

    return rows.map((row) => ({
      subjectKey: row.subjectKey,
      entityId: row.entityId,
      entityType: row.entityType,
      normalizedText: row.normalizedText,
      marketKey: row.marketKey,
      collectableMarketKey: row.collectableMarketKey,
      distinctUsers: Number(row.distinctUsers),
      signalCount: Number(row.signalCount),
      weightedSignalCount: Number(row.weightedSignalCount ?? 0),
      demandScore: Number(row.demandScore ?? 0),
      lastSeenAt: row.lastSeenAt,
    }));
  }

  private insertSearchLogEntityCollectableSignals(
    client: DemandAggregateWriter,
    startDateKey: string,
    endDateExclusiveKey: string,
  ) {
    return client.$executeRaw`
      INSERT INTO user_search_demand_daily (
        demand_date,
        user_id,
        market_key,
        collectable_market_key,
        subject_kind,
        subject_key,
        entity_id,
        entity_type,
        normalized_text,
        source_kind,
        signal_kind,
        reason,
        signal_count,
        first_seen_at,
        last_seen_at,
        metadata
      )
      SELECT
        logged_at::date AS demand_date,
        user_id,
        NULL,
        collectable_market_key,
        'entity'::demand_subject_kind,
        entity_id::text,
        entity_id,
        entity_type,
        MIN(NULLIF(LOWER(TRIM(query_text)), '')),
        'search_log'::demand_source_kind,
        event_kind::text::demand_signal_kind,
        NULL,
        COUNT(DISTINCT COALESCE(search_request_id::text, log_id::text))::int,
        MIN(logged_at),
        MAX(logged_at),
        jsonb_build_object('rawSource', 'user_search_logs', 'scope', 'collectable_market')
      FROM user_search_logs
      WHERE logged_at >= ${startDateKey}::date
        AND logged_at < ${endDateExclusiveKey}::date
        AND collectable_market_key IS NOT NULL
      GROUP BY
        logged_at::date,
        user_id,
        collectable_market_key,
        entity_id,
        entity_type,
        event_kind
    `;
  }

  private insertSearchLogEntityGlobalSignals(
    client: DemandAggregateWriter,
    startDateKey: string,
    endDateExclusiveKey: string,
  ) {
    return client.$executeRaw`
      INSERT INTO user_search_demand_daily (
        demand_date,
        user_id,
        market_key,
        collectable_market_key,
        subject_kind,
        subject_key,
        entity_id,
        entity_type,
        normalized_text,
        source_kind,
        signal_kind,
        reason,
        signal_count,
        first_seen_at,
        last_seen_at,
        metadata
      )
      SELECT
        logged_at::date AS demand_date,
        user_id,
        NULL,
        NULL,
        'entity'::demand_subject_kind,
        entity_id::text,
        entity_id,
        entity_type,
        MIN(NULLIF(LOWER(TRIM(query_text)), '')),
        'search_log'::demand_source_kind,
        event_kind::text::demand_signal_kind,
        NULL,
        COUNT(DISTINCT COALESCE(search_request_id::text, log_id::text))::int,
        MIN(logged_at),
        MAX(logged_at),
        jsonb_build_object('rawSource', 'user_search_logs', 'scope', 'global')
      FROM user_search_logs
      WHERE logged_at >= ${startDateKey}::date
        AND logged_at < ${endDateExclusiveKey}::date
      GROUP BY
        logged_at::date,
        user_id,
        entity_id,
        entity_type,
        event_kind
    `;
  }

  private insertSearchLogEntityUiMarketSignals(
    client: DemandAggregateWriter,
    startDateKey: string,
    endDateExclusiveKey: string,
  ) {
    return client.$executeRaw`
      INSERT INTO user_search_demand_daily (
        demand_date,
        user_id,
        market_key,
        collectable_market_key,
        subject_kind,
        subject_key,
        entity_id,
        entity_type,
        normalized_text,
        source_kind,
        signal_kind,
        reason,
        signal_count,
        first_seen_at,
        last_seen_at,
        metadata
      )
      SELECT
        logged_at::date AS demand_date,
        user_id,
        market_key,
        NULL,
        'entity'::demand_subject_kind,
        entity_id::text,
        entity_id,
        entity_type,
        MIN(NULLIF(LOWER(TRIM(query_text)), '')),
        'search_log'::demand_source_kind,
        event_kind::text::demand_signal_kind,
        NULL,
        COUNT(DISTINCT COALESCE(search_request_id::text, log_id::text))::int,
        MIN(logged_at),
        MAX(logged_at),
        jsonb_build_object('rawSource', 'user_search_logs', 'scope', 'ui_market')
      FROM user_search_logs
      WHERE logged_at >= ${startDateKey}::date
        AND logged_at < ${endDateExclusiveKey}::date
        AND market_key IS NOT NULL
      GROUP BY
        logged_at::date,
        user_id,
        market_key,
        entity_id,
        entity_type,
        event_kind
    `;
  }

  private insertSearchLogQueryCollectableSignals(
    client: DemandAggregateWriter,
    startDateKey: string,
    endDateExclusiveKey: string,
  ) {
    return client.$executeRaw`
      INSERT INTO user_search_demand_daily (
        demand_date,
        user_id,
        market_key,
        collectable_market_key,
        subject_kind,
        subject_key,
        entity_id,
        entity_type,
        normalized_text,
        source_kind,
        signal_kind,
        reason,
        signal_count,
        first_seen_at,
        last_seen_at,
        metadata
      )
      WITH query_events AS (
        SELECT DISTINCT
          logged_at::date AS demand_date,
          user_id,
          collectable_market_key,
          NULLIF(LOWER(TRIM(query_text)), '') AS normalized_text,
          event_kind,
          COALESCE(search_request_id::text, log_id::text) AS event_key,
          logged_at
        FROM user_search_logs
        WHERE logged_at >= ${startDateKey}::date
          AND logged_at < ${endDateExclusiveKey}::date
          AND collectable_market_key IS NOT NULL
          AND query_text IS NOT NULL
          AND NULLIF(LOWER(TRIM(query_text)), '') IS NOT NULL
      )
      SELECT
        demand_date,
        user_id,
        NULL,
        collectable_market_key,
        'query'::demand_subject_kind,
        normalized_text,
        NULL,
        NULL,
        normalized_text,
        'search_log'::demand_source_kind,
        event_kind::text::demand_signal_kind,
        NULL,
        COUNT(DISTINCT event_key)::int,
        MIN(logged_at),
        MAX(logged_at),
        jsonb_build_object('rawSource', 'user_search_logs', 'scope', 'collectable_market')
      FROM query_events
      GROUP BY
        demand_date,
        user_id,
        collectable_market_key,
        normalized_text,
        event_kind
    `;
  }

  private insertSearchLogQueryUiMarketSignals(
    client: DemandAggregateWriter,
    startDateKey: string,
    endDateExclusiveKey: string,
  ) {
    return client.$executeRaw`
      INSERT INTO user_search_demand_daily (
        demand_date,
        user_id,
        market_key,
        collectable_market_key,
        subject_kind,
        subject_key,
        entity_id,
        entity_type,
        normalized_text,
        source_kind,
        signal_kind,
        reason,
        signal_count,
        first_seen_at,
        last_seen_at,
        metadata
      )
      WITH query_events AS (
        SELECT DISTINCT
          logged_at::date AS demand_date,
          user_id,
          market_key,
          NULLIF(LOWER(TRIM(query_text)), '') AS normalized_text,
          event_kind,
          COALESCE(search_request_id::text, log_id::text) AS event_key,
          logged_at
        FROM user_search_logs
        WHERE logged_at >= ${startDateKey}::date
          AND logged_at < ${endDateExclusiveKey}::date
          AND market_key IS NOT NULL
          AND query_text IS NOT NULL
          AND NULLIF(LOWER(TRIM(query_text)), '') IS NOT NULL
      )
      SELECT
        demand_date,
        user_id,
        market_key,
        NULL,
        'query'::demand_subject_kind,
        normalized_text,
        NULL,
        NULL,
        normalized_text,
        'search_log'::demand_source_kind,
        event_kind::text::demand_signal_kind,
        NULL,
        COUNT(DISTINCT event_key)::int,
        MIN(logged_at),
        MAX(logged_at),
        jsonb_build_object('rawSource', 'user_search_logs', 'scope', 'ui_market')
      FROM query_events
      GROUP BY
        demand_date,
        user_id,
        market_key,
        normalized_text,
        event_kind
    `;
  }

  private insertSearchLogQueryGlobalSignals(
    client: DemandAggregateWriter,
    startDateKey: string,
    endDateExclusiveKey: string,
  ) {
    return client.$executeRaw`
      INSERT INTO user_search_demand_daily (
        demand_date,
        user_id,
        market_key,
        collectable_market_key,
        subject_kind,
        subject_key,
        entity_id,
        entity_type,
        normalized_text,
        source_kind,
        signal_kind,
        reason,
        signal_count,
        first_seen_at,
        last_seen_at,
        metadata
      )
      WITH query_events AS (
        SELECT DISTINCT
          logged_at::date AS demand_date,
          user_id,
          NULLIF(LOWER(TRIM(query_text)), '') AS normalized_text,
          event_kind,
          COALESCE(search_request_id::text, log_id::text) AS event_key,
          logged_at
        FROM user_search_logs
        WHERE logged_at >= ${startDateKey}::date
          AND logged_at < ${endDateExclusiveKey}::date
          AND query_text IS NOT NULL
          AND NULLIF(LOWER(TRIM(query_text)), '') IS NOT NULL
      )
      SELECT
        demand_date,
        user_id,
        NULL,
        NULL,
        'query'::demand_subject_kind,
        normalized_text,
        NULL,
        NULL,
        normalized_text,
        'search_log'::demand_source_kind,
        event_kind::text::demand_signal_kind,
        NULL,
        COUNT(DISTINCT event_key)::int,
        MIN(logged_at),
        MAX(logged_at),
        jsonb_build_object('rawSource', 'user_search_logs', 'scope', 'global')
      FROM query_events
      GROUP BY
        demand_date,
        user_id,
        normalized_text,
        event_kind
    `;
  }

  private insertAutocompleteSelectionCollectableSignals(
    client: DemandAggregateWriter,
    startDateKey: string,
    endDateExclusiveKey: string,
  ) {
    return client.$executeRaw`
      INSERT INTO user_search_demand_daily (
        demand_date,
        user_id,
        market_key,
        collectable_market_key,
        subject_kind,
        subject_key,
        entity_id,
        entity_type,
        normalized_text,
        source_kind,
        signal_kind,
        reason,
        signal_count,
        first_seen_at,
        last_seen_at,
        metadata
      )
      SELECT
        logged_at::date AS demand_date,
        user_id,
        NULL,
        collectable_market_key,
        'entity'::demand_subject_kind,
        entity_id::text,
        entity_id,
        entity_type,
        MIN(NULLIF(LOWER(TRIM(query_text)), '')),
        'search_log'::demand_source_kind,
        'autocomplete_selection'::demand_signal_kind,
        NULL,
        COUNT(DISTINCT COALESCE(search_request_id::text, log_id::text))::int,
        MIN(logged_at),
        MAX(logged_at),
        jsonb_build_object(
          'rawSource',
          'user_search_logs',
          'submissionSource',
          'autocomplete',
          'scope',
          'collectable_market',
          'cacheSelectionPolicy',
          'full_intent',
          'sourceEventKindCounts',
          jsonb_build_object(
            'backend',
            COUNT(DISTINCT CASE
              WHEN event_kind = 'backend'
                THEN COALESCE(search_request_id::text, log_id::text)
              END),
            'cache',
            COUNT(DISTINCT CASE
              WHEN event_kind = 'cache'
                THEN COALESCE(search_request_id::text, log_id::text)
              END)
          )
        )
      FROM user_search_logs
      WHERE logged_at >= ${startDateKey}::date
        AND logged_at < ${endDateExclusiveKey}::date
        AND collectable_market_key IS NOT NULL
        AND event_kind IN ('backend', 'cache')
        AND metadata->>'submissionSource' = 'autocomplete'
        AND metadata#>>'{submissionContext,matchType}' = 'entity'
        AND metadata#>>'{submissionContext,selectedEntityId}' = entity_id::text
        AND metadata#>>'{submissionContext,selectedEntityType}' = entity_type::text
      GROUP BY
        logged_at::date,
        user_id,
        collectable_market_key,
        entity_id,
        entity_type
    `;
  }

  private insertAutocompleteSelectionUiMarketSignals(
    client: DemandAggregateWriter,
    startDateKey: string,
    endDateExclusiveKey: string,
  ) {
    return client.$executeRaw`
      INSERT INTO user_search_demand_daily (
        demand_date,
        user_id,
        market_key,
        collectable_market_key,
        subject_kind,
        subject_key,
        entity_id,
        entity_type,
        normalized_text,
        source_kind,
        signal_kind,
        reason,
        signal_count,
        first_seen_at,
        last_seen_at,
        metadata
      )
      SELECT
        logged_at::date AS demand_date,
        user_id,
        market_key,
        NULL,
        'entity'::demand_subject_kind,
        entity_id::text,
        entity_id,
        entity_type,
        MIN(NULLIF(LOWER(TRIM(query_text)), '')),
        'search_log'::demand_source_kind,
        'autocomplete_selection'::demand_signal_kind,
        NULL,
        COUNT(DISTINCT COALESCE(search_request_id::text, log_id::text))::int,
        MIN(logged_at),
        MAX(logged_at),
        jsonb_build_object(
          'rawSource',
          'user_search_logs',
          'submissionSource',
          'autocomplete',
          'scope',
          'ui_market',
          'cacheSelectionPolicy',
          'full_intent',
          'sourceEventKindCounts',
          jsonb_build_object(
            'backend',
            COUNT(DISTINCT CASE
              WHEN event_kind = 'backend'
                THEN COALESCE(search_request_id::text, log_id::text)
              END),
            'cache',
            COUNT(DISTINCT CASE
              WHEN event_kind = 'cache'
                THEN COALESCE(search_request_id::text, log_id::text)
              END)
          )
        )
      FROM user_search_logs
      WHERE logged_at >= ${startDateKey}::date
        AND logged_at < ${endDateExclusiveKey}::date
        AND market_key IS NOT NULL
        AND event_kind IN ('backend', 'cache')
        AND metadata->>'submissionSource' = 'autocomplete'
        AND metadata#>>'{submissionContext,matchType}' = 'entity'
        AND metadata#>>'{submissionContext,selectedEntityId}' = entity_id::text
        AND metadata#>>'{submissionContext,selectedEntityType}' = entity_type::text
      GROUP BY
        logged_at::date,
        user_id,
        market_key,
        entity_id,
        entity_type
    `;
  }

  private insertAutocompleteSelectionGlobalSignals(
    client: DemandAggregateWriter,
    startDateKey: string,
    endDateExclusiveKey: string,
  ) {
    return client.$executeRaw`
      INSERT INTO user_search_demand_daily (
        demand_date,
        user_id,
        market_key,
        collectable_market_key,
        subject_kind,
        subject_key,
        entity_id,
        entity_type,
        normalized_text,
        source_kind,
        signal_kind,
        reason,
        signal_count,
        first_seen_at,
        last_seen_at,
        metadata
      )
      SELECT
        logged_at::date AS demand_date,
        user_id,
        NULL,
        NULL,
        'entity'::demand_subject_kind,
        entity_id::text,
        entity_id,
        entity_type,
        MIN(NULLIF(LOWER(TRIM(query_text)), '')),
        'search_log'::demand_source_kind,
        'autocomplete_selection'::demand_signal_kind,
        NULL,
        COUNT(DISTINCT COALESCE(search_request_id::text, log_id::text))::int,
        MIN(logged_at),
        MAX(logged_at),
        jsonb_build_object(
          'rawSource',
          'user_search_logs',
          'submissionSource',
          'autocomplete',
          'scope',
          'global',
          'cacheSelectionPolicy',
          'full_intent',
          'sourceEventKindCounts',
          jsonb_build_object(
            'backend',
            COUNT(DISTINCT CASE
              WHEN event_kind = 'backend'
                THEN COALESCE(search_request_id::text, log_id::text)
              END),
            'cache',
            COUNT(DISTINCT CASE
              WHEN event_kind = 'cache'
                THEN COALESCE(search_request_id::text, log_id::text)
              END)
          )
        )
      FROM user_search_logs
      WHERE logged_at >= ${startDateKey}::date
        AND logged_at < ${endDateExclusiveKey}::date
        AND event_kind IN ('backend', 'cache')
        AND metadata->>'submissionSource' = 'autocomplete'
        AND metadata#>>'{submissionContext,matchType}' = 'entity'
        AND metadata#>>'{submissionContext,selectedEntityId}' = entity_id::text
        AND metadata#>>'{submissionContext,selectedEntityType}' = entity_type::text
      GROUP BY
        logged_at::date,
        user_id,
        entity_id,
        entity_type
    `;
  }

  private insertOnDemandAskCollectableSignals(
    client: DemandAggregateWriter,
    startDateKey: string,
    endDateExclusiveKey: string,
  ) {
    return client.$executeRaw`
      INSERT INTO user_search_demand_daily (
        demand_date,
        user_id,
        market_key,
        collectable_market_key,
        subject_kind,
        subject_key,
        entity_id,
        entity_type,
        normalized_text,
        source_kind,
        signal_kind,
        reason,
        signal_count,
        first_seen_at,
        last_seen_at,
        metadata
      )
      SELECT
        (e.asked_at AT TIME ZONE 'UTC')::date AS demand_date,
        e.user_id,
        NULL,
        LOWER(TRIM(e.collectable_market_key)),
        'term'::demand_subject_kind,
        LOWER(TRIM(e.term)),
        e.entity_id,
        e.entity_type,
        LOWER(TRIM(e.term)),
        'on_demand'::demand_source_kind,
        CASE
          WHEN e.reason = 'unresolved' THEN 'unresolved_query'::demand_signal_kind
          ELSE 'low_result'::demand_signal_kind
        END,
        e.reason::text,
        COUNT(*)::int,
        MIN(e.asked_at),
        MAX(e.asked_at),
        jsonb_build_object('rawSource', 'collection_on_demand_ask_events', 'scope', 'collectable_market')
      FROM collection_on_demand_ask_events e
      WHERE e.asked_at >= (${startDateKey}::date::timestamp AT TIME ZONE 'UTC')
        AND e.asked_at < (${endDateExclusiveKey}::date::timestamp AT TIME ZONE 'UTC')
        AND e.collectable_market_key IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM collection_communities cc
          JOIN core_markets m
            ON LOWER(TRIM(m.market_key)) = LOWER(TRIM(cc.market_key))
          WHERE cc.is_active = true
            AND cc.market_key IS NOT NULL
            AND m.is_active = true
            AND m.is_collectable = true
            AND LOWER(TRIM(cc.market_key)) = LOWER(TRIM(e.collectable_market_key))
        )
        AND NULLIF(LOWER(TRIM(e.term)), '') IS NOT NULL
      GROUP BY
        (e.asked_at AT TIME ZONE 'UTC')::date,
        e.user_id,
        e.collectable_market_key,
        LOWER(TRIM(e.collectable_market_key)),
        LOWER(TRIM(e.term)),
        e.entity_id,
        e.entity_type,
        e.reason
    `;
  }

  private insertOnDemandAskUiMarketSignals(
    client: DemandAggregateWriter,
    startDateKey: string,
    endDateExclusiveKey: string,
  ) {
    return client.$executeRaw`
      INSERT INTO user_search_demand_daily (
        demand_date,
        user_id,
        market_key,
        collectable_market_key,
        subject_kind,
        subject_key,
        entity_id,
        entity_type,
        normalized_text,
        source_kind,
        signal_kind,
        reason,
        signal_count,
        first_seen_at,
        last_seen_at,
        metadata
      )
      SELECT
        (e.asked_at AT TIME ZONE 'UTC')::date AS demand_date,
        e.user_id,
        LOWER(TRIM(e.market_key)),
        NULL,
        'term'::demand_subject_kind,
        LOWER(TRIM(e.term)),
        e.entity_id,
        e.entity_type,
        LOWER(TRIM(e.term)),
        'on_demand'::demand_source_kind,
        CASE
          WHEN e.reason = 'unresolved' THEN 'unresolved_query'::demand_signal_kind
          ELSE 'low_result'::demand_signal_kind
        END,
        e.reason::text,
        COUNT(DISTINCT CONCAT_WS(
          '|',
          COALESCE(e.user_id::text, 'anonymous'),
          e.asked_at::text,
          LOWER(TRIM(e.market_key)),
          LOWER(TRIM(e.term)),
          e.entity_type::text,
          COALESCE(e.entity_id::text, ''),
          e.reason::text
        ))::int,
        MIN(e.asked_at),
        MAX(e.asked_at),
        jsonb_build_object('rawSource', 'collection_on_demand_ask_events', 'scope', 'ui_market')
      FROM collection_on_demand_ask_events e
      WHERE e.asked_at >= (${startDateKey}::date::timestamp AT TIME ZONE 'UTC')
        AND e.asked_at < (${endDateExclusiveKey}::date::timestamp AT TIME ZONE 'UTC')
        AND NULLIF(LOWER(TRIM(e.market_key)), '') IS NOT NULL
        AND NULLIF(LOWER(TRIM(e.term)), '') IS NOT NULL
      GROUP BY
        (e.asked_at AT TIME ZONE 'UTC')::date,
        e.user_id,
        LOWER(TRIM(e.market_key)),
        LOWER(TRIM(e.term)),
        e.entity_id,
        e.entity_type,
        e.reason
    `;
  }

  private insertOnDemandAskGlobalSignals(
    client: DemandAggregateWriter,
    startDateKey: string,
    endDateExclusiveKey: string,
  ) {
    return client.$executeRaw`
      INSERT INTO user_search_demand_daily (
        demand_date,
        user_id,
        market_key,
        collectable_market_key,
        subject_kind,
        subject_key,
        entity_id,
        entity_type,
        normalized_text,
        source_kind,
        signal_kind,
        reason,
        signal_count,
        first_seen_at,
        last_seen_at,
        metadata
      )
      SELECT
        (e.asked_at AT TIME ZONE 'UTC')::date AS demand_date,
        e.user_id,
        NULL,
        NULL,
        'term'::demand_subject_kind,
        LOWER(TRIM(e.term)),
        e.entity_id,
        e.entity_type,
        LOWER(TRIM(e.term)),
        'on_demand'::demand_source_kind,
        CASE
          WHEN e.reason = 'unresolved' THEN 'unresolved_query'::demand_signal_kind
          ELSE 'low_result'::demand_signal_kind
        END,
        e.reason::text,
        COUNT(DISTINCT CONCAT_WS(
          '|',
          COALESCE(e.user_id::text, 'anonymous'),
          e.asked_at::text,
          LOWER(TRIM(e.market_key)),
          LOWER(TRIM(e.term)),
          e.entity_type::text,
          COALESCE(e.entity_id::text, ''),
          e.reason::text
        ))::int,
        MIN(e.asked_at),
        MAX(e.asked_at),
        jsonb_build_object('rawSource', 'collection_on_demand_ask_events', 'scope', 'global')
      FROM collection_on_demand_ask_events e
      WHERE e.asked_at >= (${startDateKey}::date::timestamp AT TIME ZONE 'UTC')
        AND e.asked_at < (${endDateExclusiveKey}::date::timestamp AT TIME ZONE 'UTC')
        AND NULLIF(LOWER(TRIM(e.term)), '') IS NOT NULL
      GROUP BY
        (e.asked_at AT TIME ZONE 'UTC')::date,
        e.user_id,
        LOWER(TRIM(e.term)),
        e.entity_id,
        e.entity_type,
        e.reason
    `;
  }

  private insertRestaurantViewGlobalSignals(
    client: DemandAggregateWriter,
    startDateKey: string,
    endDateExclusiveKey: string,
  ) {
    return client.$executeRaw`
      INSERT INTO user_search_demand_daily (
        demand_date,
        user_id,
        market_key,
        collectable_market_key,
        subject_kind,
        subject_key,
        entity_id,
        entity_type,
        normalized_text,
        source_kind,
        signal_kind,
        reason,
        signal_count,
        first_seen_at,
        last_seen_at,
        metadata
      )
      SELECT
        (ev.viewed_at AT TIME ZONE 'UTC')::date AS demand_date,
        ev.user_id,
        NULL,
        NULL,
        'entity'::demand_subject_kind,
        ev.entity_id::text,
        ev.entity_id,
        'restaurant'::entity_type,
        NULL,
        'restaurant_view'::demand_source_kind,
        'restaurant_view'::demand_signal_kind,
        NULL,
        SUM(ev.event_count)::int,
        MIN(ev.viewed_at),
        MAX(ev.viewed_at),
        jsonb_build_object('rawSource', 'user_entity_view_events', 'scope', 'global')
      FROM user_entity_view_events ev
      WHERE ev.entity_type = 'restaurant'::entity_type
        AND ev.viewed_at >= (${startDateKey}::date::timestamp AT TIME ZONE 'UTC')
        AND ev.viewed_at < (${endDateExclusiveKey}::date::timestamp AT TIME ZONE 'UTC')
      GROUP BY (ev.viewed_at AT TIME ZONE 'UTC')::date, ev.user_id, ev.entity_id
    `;
  }

  private insertFoodViewGlobalSignals(
    client: DemandAggregateWriter,
    startDateKey: string,
    endDateExclusiveKey: string,
  ) {
    return client.$executeRaw`
      INSERT INTO user_search_demand_daily (
        demand_date,
        user_id,
        market_key,
        collectable_market_key,
        subject_kind,
        subject_key,
        entity_id,
        entity_type,
        normalized_text,
        source_kind,
        signal_kind,
        reason,
        signal_count,
        first_seen_at,
        last_seen_at,
        metadata
      )
      SELECT
        (ev.viewed_at AT TIME ZONE 'UTC')::date AS demand_date,
        ev.user_id,
        NULL,
        NULL,
        'entity'::demand_subject_kind,
        ev.entity_id::text,
        ev.entity_id,
        'food'::entity_type,
        NULL,
        'food_view'::demand_source_kind,
        'food_view'::demand_signal_kind,
        NULL,
        SUM(ev.event_count)::int,
        MIN(ev.viewed_at),
        MAX(ev.viewed_at),
        jsonb_build_object('rawSource', 'user_entity_view_events', 'scope', 'global')
      FROM user_entity_view_events ev
      WHERE ev.entity_type = 'food'::entity_type
        AND ev.viewed_at >= (${startDateKey}::date::timestamp AT TIME ZONE 'UTC')
        AND ev.viewed_at < (${endDateExclusiveKey}::date::timestamp AT TIME ZONE 'UTC')
      GROUP BY (ev.viewed_at AT TIME ZONE 'UTC')::date, ev.user_id, ev.entity_id
    `;
  }

  private insertFavoriteGlobalSignals(
    client: DemandAggregateWriter,
    startDateKey: string,
    endDateExclusiveKey: string,
  ) {
    return client.$executeRaw`
      INSERT INTO user_search_demand_daily (
        demand_date,
        user_id,
        market_key,
        collectable_market_key,
        subject_kind,
        subject_key,
        entity_id,
        entity_type,
        normalized_text,
        source_kind,
        signal_kind,
        reason,
        signal_count,
        first_seen_at,
        last_seen_at,
        metadata
      )
      SELECT
        (fav.occurred_at AT TIME ZONE 'UTC')::date AS demand_date,
        fav.user_id,
        NULL,
        NULL,
        'entity'::demand_subject_kind,
        fav.entity_id::text,
        fav.entity_id,
        fav.entity_type,
        NULL,
        'favorite'::demand_source_kind,
        'favorite'::demand_signal_kind,
        NULL,
        COUNT(*)::int,
        MIN(fav.occurred_at),
        MAX(fav.occurred_at),
        jsonb_build_object('rawSource', 'user_favorite_events', 'scope', 'global')
      FROM user_favorite_events fav
      WHERE fav.event_kind = 'added'::favorite_event_kind
        AND fav.occurred_at >= (${startDateKey}::date::timestamp AT TIME ZONE 'UTC')
        AND fav.occurred_at < (${endDateExclusiveKey}::date::timestamp AT TIME ZONE 'UTC')
      GROUP BY
        (fav.occurred_at AT TIME ZONE 'UTC')::date,
        fav.user_id,
        fav.entity_id,
        fav.entity_type
    `;
  }

  private normalizeScopeKey(value?: string | null): string | null {
    const normalized =
      typeof value === 'string' ? value.trim().toLowerCase() : '';
    return normalized.length ? normalized : null;
  }

  private async tryAcquireRebuildLock(
    client: DemandAggregateWriter,
  ): Promise<Array<{ acquired: boolean }>> {
    return client.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtext('search_demand_aggregate_refresh')) AS acquired
    `;
  }

  private async acquireRebuildLock(
    client: DemandAggregateWriter,
  ): Promise<void> {
    await client.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext('search_demand_aggregate_refresh'))
    `;
  }

  private normalizeUuid(value?: string | null): string | null {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      normalized,
    )
      ? normalized
      : null;
  }

  private normalizePositiveNumber(
    value: number | undefined,
    fallback: number,
  ): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
      ? value
      : fallback;
  }

  private normalizeWeight(value: number | undefined, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : fallback;
  }

  private startOfUtcDay(value: Date): Date {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new Error('Invalid date');
    }
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private formatDate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }
}
