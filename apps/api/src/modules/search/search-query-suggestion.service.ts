import { Injectable } from '@nestjs/common';
import {
  DemandSignalKind,
  DemandSourceKind,
  Prisma,
  SearchLogEventKind,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  SearchDemandAggregationService,
  SearchDemandSignalSummary,
} from '../analytics/search-demand-aggregation.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_QUERY_SUGGESTION_WINDOW_DAYS = 90;

interface QuerySuggestionRow {
  query: string;
  queryKey: string;
  distinctUsers: number;
  signalCount: number;
  demandScore: number;
  usage: number;
  lastUsed: Date;
}

export type QuerySuggestionSource = 'personal' | 'global';

export interface QuerySuggestion {
  text: string;
  globalCount: number;
  userCount: number;
  source: QuerySuggestionSource;
}

@Injectable()
export class SearchQuerySuggestionService {
  private readonly logger: LoggerService;
  private readonly minPrefixLength = 1;
  private readonly minGlobalDistinctUsers: number;

  constructor(
    private readonly demandAggregation: SearchDemandAggregationService,
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchQuerySuggestionService');
    this.minGlobalDistinctUsers = this.resolveEnvInt(
      'AUTOCOMPLETE_QUERY_SUGGESTION_MIN_GLOBAL_COUNT',
      3,
    );
  }

  async getSuggestions(
    prefix: string,
    limit: number,
    userId?: string,
    marketKey?: string | null,
  ): Promise<QuerySuggestion[]> {
    const trimmed = prefix.trim().toLowerCase();
    if (!trimmed || trimmed.length < this.minPrefixLength) {
      return [];
    }

    const safeLimit = Math.max(1, Math.min(limit, 10));

    try {
      const suggestionTextByKey = new Map<string, string>();
      const suggestionSourceByKey = new Map<string, QuerySuggestionSource>();
      const personalRows = userId
        ? (
            await this.loadFreshPersonalQueryRows(
              userId,
              trimmed,
              Math.max(safeLimit * 20, 100),
            )
          ).sort((left, right) => this.comparePersonalRows(left, right))
        : [];

      const globalLimit = Math.max(safeLimit * 20, 100);
      const scopedGlobalRows = this.toSuggestionRows(
        await this.demandAggregation.listQueryDemand({
          since: this.defaultSince(),
          normalizedTextPrefix: trimmed,
          marketKey,
          scopeMode: marketKey ? 'scoped' : 'global',
          sourceKinds: [DemandSourceKind.search_log],
          signalKinds: [DemandSignalKind.backend],
          limit: globalLimit,
        }),
        'global',
      );
      const eligibleScopedGlobalRows =
        this.filterEligibleGlobalRows(scopedGlobalRows);
      let globalRows = eligibleScopedGlobalRows;
      if (marketKey && eligibleScopedGlobalRows.length < safeLimit) {
        const eligibleScopedKeys = new Set(
          eligibleScopedGlobalRows.map((row) => row.queryKey),
        );
        const fallbackRows = this.filterEligibleGlobalRows(
          this.toSuggestionRows(
            await this.demandAggregation.listQueryDemand({
              since: this.defaultSince(),
              normalizedTextPrefix: trimmed,
              scopeMode: 'global',
              sourceKinds: [DemandSourceKind.search_log],
              signalKinds: [DemandSignalKind.backend],
              limit: globalLimit,
            }),
            'global',
          ),
        ).filter((row) => !eligibleScopedKeys.has(row.queryKey));
        const fallbackKeys = new Set(fallbackRows.map((row) => row.queryKey));
        globalRows = [
          ...eligibleScopedGlobalRows.filter(
            (row) => !fallbackKeys.has(row.queryKey),
          ),
          ...fallbackRows,
        ];
      }

      const sortedGlobalRows = globalRows.sort((left, right) =>
        this.compareGlobalRows(left, right),
      );
      const selectedKeys: string[] = [];
      const selectedKeySet = new Set<string>();
      const personalReservation = userId
        ? Math.min(safeLimit, Math.max(1, Math.ceil(safeLimit * 0.6)))
        : 0;
      const globalReservation = Math.max(0, safeLimit - personalReservation);
      const addSuggestion = (
        row: QuerySuggestionRow,
        source: QuerySuggestionSource,
      ): boolean => {
        const value = row.query?.trim();
        const key = row.queryKey?.trim();
        if (!value || !key || selectedKeySet.has(key)) {
          return false;
        }
        suggestionTextByKey.set(key, value);
        suggestionSourceByKey.set(key, source);
        selectedKeys.push(key);
        selectedKeySet.add(key);
        return true;
      };

      let selectedPersonalCount = 0;
      for (const row of personalRows) {
        if (selectedPersonalCount >= personalReservation) {
          break;
        }
        if (addSuggestion(row, 'personal')) {
          selectedPersonalCount += 1;
        }
      }

      let selectedGlobalCount = 0;
      for (const row of sortedGlobalRows) {
        if (selectedGlobalCount >= globalReservation) {
          break;
        }
        if (addSuggestion(row, 'global')) {
          selectedGlobalCount += 1;
        }
      }

      for (const row of personalRows) {
        if (selectedKeys.length >= safeLimit) {
          break;
        }
        addSuggestion(row, 'personal');
      }
      for (const row of sortedGlobalRows) {
        if (selectedKeys.length >= safeLimit) {
          break;
        }
        addSuggestion(row, 'global');
      }

      return this.hydrateCounts(
        selectedKeys,
        suggestionTextByKey,
        suggestionSourceByKey,
        userId,
        marketKey,
      );
    } catch (error) {
      this.logger.warn('Failed to load query suggestions', {
        prefix,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return [];
    }
  }

  private async hydrateCounts(
    keys: string[],
    suggestionTextByKey: Map<string, string>,
    suggestionSourceByKey: Map<string, QuerySuggestionSource>,
    userId?: string,
    marketKey?: string | null,
  ): Promise<QuerySuggestion[]> {
    if (keys.length === 0) {
      return [];
    }

    const scopedGlobalRows = await this.demandAggregation.listQueryDemand({
      since: this.defaultSince(),
      subjectKeys: keys,
      marketKey,
      scopeMode: marketKey ? 'scoped' : 'global',
      sourceKinds: [DemandSourceKind.search_log],
      signalKinds: [DemandSignalKind.backend],
      limit: Math.max(keys.length * 50, 250),
    });
    let globalRows = scopedGlobalRows;
    if (marketKey) {
      const scopedSuggestionRows = this.toSuggestionRows(
        scopedGlobalRows,
        'global',
      );
      const eligibleScopedKeySet = new Set(
        this.filterEligibleGlobalRows(scopedSuggestionRows).map(
          (row) => row.queryKey,
        ),
      );
      const eligibleScopedRows = scopedGlobalRows.filter((row) =>
        eligibleScopedKeySet.has(row.subjectKey.trim().toLowerCase()),
      );
      const eligibleScopedKeys = new Set(eligibleScopedKeySet);
      const fallbackRows = await this.demandAggregation.listQueryDemand({
        since: this.defaultSince(),
        subjectKeys: keys,
        scopeMode: 'global',
        sourceKinds: [DemandSourceKind.search_log],
        signalKinds: [DemandSignalKind.backend],
        limit: Math.max(keys.length * 50, 250),
      });
      const eligibleFallbackKeys = new Set(
        this.filterEligibleGlobalRows(
          this.toSuggestionRows(fallbackRows, 'global'),
        ).map((row) => row.queryKey),
      );
      const fallbackKeys = new Set(
        fallbackRows
          .map((row) => row.subjectKey.trim().toLowerCase())
          .filter(
            (key) =>
              eligibleFallbackKeys.has(key) && !eligibleScopedKeys.has(key),
          ),
      );
      globalRows = [
        ...eligibleScopedRows.filter(
          (row) => !fallbackKeys.has(row.subjectKey.trim().toLowerCase()),
        ),
        ...fallbackRows.filter((row) =>
          fallbackKeys.has(row.subjectKey.trim().toLowerCase()),
        ),
      ];
    }

    const globalCountByKey = this.sumDistinctUsersByKey(globalRows);

    let userCountByKey = new Map<string, number>();
    if (userId) {
      userCountByKey = await this.loadFreshPersonalQueryCounts(userId, keys);
    }

    return keys
      .map((key) => {
        const text = suggestionTextByKey.get(key) ?? key;
        const globalCount = globalCountByKey.get(key) ?? 0;
        const userCount = userCountByKey.get(key) ?? 0;
        const source: QuerySuggestionSource =
          suggestionSourceByKey.get(key) ??
          (userCount > 0 ? 'personal' : 'global');
        return { text, globalCount, userCount, source };
      })
      .filter((item) => item.text.trim().length > 0);
  }

  private toSuggestionRows(
    rows: SearchDemandSignalSummary[],
    mode: QuerySuggestionSource,
  ): QuerySuggestionRow[] {
    const rowsByKey = new Map<string, QuerySuggestionRow>();
    for (const row of rows) {
      const query = row.normalizedText?.trim() || row.subjectKey.trim();
      const queryKey = row.subjectKey.trim().toLowerCase();
      if (!query || !queryKey) {
        continue;
      }

      const existing = rowsByKey.get(queryKey);
      const usage = mode === 'global' ? row.demandScore : row.signalCount;
      if (!existing) {
        rowsByKey.set(queryKey, {
          query,
          queryKey,
          distinctUsers: row.distinctUsers,
          signalCount: row.signalCount,
          demandScore: row.demandScore,
          usage,
          lastUsed: row.lastSeenAt,
        });
        continue;
      }

      existing.distinctUsers += row.distinctUsers;
      existing.signalCount += row.signalCount;
      existing.demandScore += row.demandScore;
      existing.usage += usage;
      if (row.lastSeenAt > existing.lastUsed) {
        existing.lastUsed = row.lastSeenAt;
        existing.query = query;
      }
    }

    return [...rowsByKey.values()];
  }

  private filterEligibleGlobalRows(
    rows: QuerySuggestionRow[],
  ): QuerySuggestionRow[] {
    return rows.filter(
      (row) => row.distinctUsers >= this.minGlobalDistinctUsers,
    );
  }

  private async loadFreshPersonalQueryRows(
    userId: string,
    prefix: string,
    limit: number,
  ): Promise<QuerySuggestionRow[]> {
    const sinceKey = this.formatTimestampWithoutTimeZoneKey(
      this.defaultSince(),
    );
    const rows = await this.prisma.$queryRaw<
      Array<{
        query: string;
        queryKey: string;
        signalCount: bigint;
        lastUsed: Date;
      }>
    >(Prisma.sql`
      WITH event_rows AS (
        SELECT
          LOWER(TRIM(query_text)) AS query_key,
          COALESCE(search_request_id::text, log_id::text) AS event_key,
          (ARRAY_AGG(TRIM(query_text) ORDER BY logged_at DESC))[1] AS query_text,
          MAX(logged_at) AS logged_at
        FROM user_search_logs
        WHERE user_id = ${userId}::uuid
          AND event_kind IN (${Prisma.join(
            [SearchLogEventKind.backend, SearchLogEventKind.cache].map(
              (kind) => Prisma.sql`${kind}::search_log_event_kind`,
            ),
          )})
          AND logged_at >= ${sinceKey}::timestamp
          AND query_text IS NOT NULL
          AND LOWER(TRIM(query_text)) LIKE ${`${prefix}%`}
        GROUP BY query_key, event_key
      )
      SELECT
        (ARRAY_AGG(query_text ORDER BY logged_at DESC))[1] AS "query",
        query_key AS "queryKey",
        COUNT(*)::bigint AS "signalCount",
        MAX(logged_at) AS "lastUsed"
      FROM event_rows
      GROUP BY query_key
      ORDER BY "lastUsed" DESC, "signalCount" DESC
      LIMIT ${Math.max(limit, 1)}
    `);

    const results: QuerySuggestionRow[] = [];
    for (const row of rows) {
      const query = row.query?.trim();
      const queryKey = row.queryKey?.trim().toLowerCase() ?? '';
      if (!query || !queryKey) {
        continue;
      }
      const signalCount = Number(row.signalCount);
      results.push({
        query,
        queryKey,
        distinctUsers: 1,
        signalCount,
        demandScore: signalCount,
        usage: signalCount,
        lastUsed: row.lastUsed,
      });
    }
    return results;
  }

  private async loadFreshPersonalQueryCounts(
    userId: string,
    keys: string[],
  ): Promise<Map<string, number>> {
    const keySet = new Set(keys.map((key) => key.trim().toLowerCase()));
    if (!keySet.size) {
      return new Map();
    }
    const sinceKey = this.formatTimestampWithoutTimeZoneKey(
      this.defaultSince(),
    );
    const rows = await this.prisma.$queryRaw<
      Array<{ queryKey: string; signalCount: bigint }>
    >(Prisma.sql`
      WITH event_rows AS (
        SELECT
          LOWER(TRIM(query_text)) AS query_key,
          COALESCE(search_request_id::text, log_id::text) AS event_key
        FROM user_search_logs
        WHERE user_id = ${userId}::uuid
          AND event_kind IN (${Prisma.join(
            [SearchLogEventKind.backend, SearchLogEventKind.cache].map(
              (kind) => Prisma.sql`${kind}::search_log_event_kind`,
            ),
          )})
          AND logged_at >= ${sinceKey}::timestamp
          AND query_text IS NOT NULL
          AND LOWER(TRIM(query_text)) IN (${Prisma.join(
            [...keySet].map((key) => Prisma.sql`${key}`),
          )})
        GROUP BY query_key, event_key
      )
      SELECT query_key AS "queryKey", COUNT(*)::bigint AS "signalCount"
      FROM event_rows
      GROUP BY query_key
    `);

    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = row.queryKey?.trim().toLowerCase() ?? '';
      if (!keySet.has(key)) {
        continue;
      }
      counts.set(key, Number(row.signalCount));
    }
    return counts;
  }

  private comparePersonalRows(a: QuerySuggestionRow, b: QuerySuggestionRow) {
    const byTime = b.lastUsed.getTime() - a.lastUsed.getTime();
    return byTime || b.signalCount - a.signalCount || b.usage - a.usage;
  }

  private compareGlobalRows(a: QuerySuggestionRow, b: QuerySuggestionRow) {
    return (
      b.distinctUsers - a.distinctUsers ||
      b.demandScore - a.demandScore ||
      b.lastUsed.getTime() - a.lastUsed.getTime()
    );
  }

  private sumSignalCountsByKey(
    rows: SearchDemandSignalSummary[],
  ): Map<string, number> {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = row.subjectKey.trim().toLowerCase();
      if (!key) {
        continue;
      }
      counts.set(key, (counts.get(key) ?? 0) + row.signalCount);
    }
    return counts;
  }

  private sumDistinctUsersByKey(
    rows: SearchDemandSignalSummary[],
  ): Map<string, number> {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = row.subjectKey.trim().toLowerCase();
      if (!key) {
        continue;
      }
      counts.set(key, (counts.get(key) ?? 0) + row.distinctUsers);
    }
    return counts;
  }

  private defaultSince(): Date {
    const raw = Number(process.env.SEARCH_QUERY_SUGGESTION_WINDOW_DAYS);
    const windowDays =
      Number.isFinite(raw) && raw > 0
        ? Math.min(Math.floor(raw), 365)
        : DEFAULT_QUERY_SUGGESTION_WINDOW_DAYS;
    return new Date(Date.now() - windowDays * MS_PER_DAY);
  }

  private formatTimestampWithoutTimeZoneKey(date: Date): string {
    return date.toISOString().slice(0, 19).replace('T', ' ');
  }

  private resolveEnvInt(key: string, fallback: number): number {
    const raw = process.env[key];
    if (raw === undefined) {
      return fallback;
    }
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return value;
  }
}
