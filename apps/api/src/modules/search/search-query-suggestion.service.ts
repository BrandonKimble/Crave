import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../shared';
import {
  QueryDemandRow,
  SignalDemandReadService,
} from '../signals/signal-demand-read.service';

const DEFAULT_QUERY_SUGGESTION_WINDOW_DAYS = 90;

interface QuerySuggestionRow {
  query: string;
  queryKey: string;
  distinctUsers: number;
  signalCount: number;
  demandScore: number;
  lastUsed: Date;
}

export type QuerySuggestionSource = 'personal' | 'global';

export interface QuerySuggestion {
  text: string;
  globalCount: number;
  userCount: number;
  source: QuerySuggestionSource;
}

/**
 * READER CUT (§22 item 6): query suggestions read the signals substrate —
 * the personal lane is the user's own 'search' acts fresh from the ledger
 * (recent searches), the global lane is term demand from the
 * signal_demand_daily aggregate (+ fresh today). The old search_events /
 * user_search_demand_daily reads are dead here, and market scoping died with
 * the market model (suggestions are global; the old scoped-then-global
 * fallback collapses away).
 *
 * Display note: the ledger normalizes subjectText to lowercase at write, so
 * suggestion text is lowercase (the old reader preserved the latest raw
 * casing).
 */
@Injectable()
export class SearchQuerySuggestionService {
  private readonly logger: LoggerService;
  private readonly minPrefixLength = 1;
  private readonly minGlobalDistinctUsers: number;

  constructor(
    private readonly signalDemandRead: SignalDemandReadService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchQuerySuggestionService');
    // Mirrors AutocompleteService.querySuggestionMinGlobalCount (2026-07-11
    // fold-in: formerly env AUTOCOMPLETE_QUERY_SUGGESTION_MIN_GLOBAL_COUNT).
    this.minGlobalDistinctUsers = 3;
  }

  async getSuggestions(
    prefix: string,
    limit: number,
    userId?: string,
  ): Promise<QuerySuggestion[]> {
    const trimmed = prefix.trim().toLowerCase();
    if (!trimmed || trimmed.length < this.minPrefixLength) {
      return [];
    }

    const safeLimit = Math.max(1, Math.min(limit, 10));

    try {
      const suggestionTextByKey = new Map<string, string>();
      const suggestionSourceByKey = new Map<string, QuerySuggestionSource>();

      const [personalRows, globalDemandRows] = await Promise.all([
        userId
          ? this.loadPersonalQueryRows(
              userId,
              trimmed,
              Math.max(safeLimit * 20, 100),
            )
          : Promise.resolve([] as QuerySuggestionRow[]),
        this.signalDemandRead.queryDemand({
          prefix: trimmed,
          windowDays: this.windowDays(),
          limit: Math.max(safeLimit * 20, 100),
        }),
      ]);

      const sortedPersonalRows = personalRows.sort((left, right) =>
        this.comparePersonalRows(left, right),
      );
      const sortedGlobalRows = this.filterEligibleGlobalRows(
        globalDemandRows.map((row) => this.toSuggestionRow(row)),
      ).sort((left, right) => this.compareGlobalRows(left, right));

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
      for (const row of sortedPersonalRows) {
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

      for (const row of sortedPersonalRows) {
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
  ): Promise<QuerySuggestion[]> {
    if (keys.length === 0) {
      return [];
    }

    const [globalRows, userCountByKey] = await Promise.all([
      this.signalDemandRead.queryDemand({
        keys,
        windowDays: this.windowDays(),
        limit: Math.max(keys.length * 5, 50),
      }),
      userId
        ? this.signalDemandRead.personalQueryCounts(
            userId,
            keys,
            this.windowDays(),
          )
        : Promise.resolve(new Map<string, number>()),
    ]);

    const globalCountByKey = new Map<string, number>();
    for (const row of globalRows) {
      const key = row.queryKey.trim().toLowerCase();
      if (!key) {
        continue;
      }
      globalCountByKey.set(
        key,
        (globalCountByKey.get(key) ?? 0) + row.distinctActors,
      );
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

  private toSuggestionRow(row: QueryDemandRow): QuerySuggestionRow {
    return {
      query: row.queryKey,
      queryKey: row.queryKey,
      distinctUsers: row.distinctActors,
      signalCount: row.signalCount,
      demandScore: row.demandScore,
      lastUsed: row.lastUsed,
    };
  }

  private filterEligibleGlobalRows(
    rows: QuerySuggestionRow[],
  ): QuerySuggestionRow[] {
    return rows.filter(
      (row) => row.distinctUsers >= this.minGlobalDistinctUsers,
    );
  }

  private async loadPersonalQueryRows(
    userId: string,
    prefix: string,
    limit: number,
  ): Promise<QuerySuggestionRow[]> {
    const rows = await this.signalDemandRead.personalQueryRows(userId, {
      prefix,
      windowDays: this.windowDays(),
      limit,
    });
    return rows.map((row) => ({
      query: row.queryKey,
      queryKey: row.queryKey,
      distinctUsers: 1,
      signalCount: row.signalCount,
      demandScore: row.signalCount,
      lastUsed: row.lastUsed,
    }));
  }

  private comparePersonalRows(a: QuerySuggestionRow, b: QuerySuggestionRow) {
    const byTime = b.lastUsed.getTime() - a.lastUsed.getTime();
    return byTime || b.signalCount - a.signalCount;
  }

  private compareGlobalRows(a: QuerySuggestionRow, b: QuerySuggestionRow) {
    return (
      b.distinctUsers - a.distinctUsers ||
      b.demandScore - a.demandScore ||
      b.lastUsed.getTime() - a.lastUsed.getTime()
    );
  }

  private windowDays(): number {
    const raw = Number(process.env.SEARCH_QUERY_SUGGESTION_WINDOW_DAYS);
    return Number.isFinite(raw) && raw > 0
      ? Math.min(Math.floor(raw), 365)
      : DEFAULT_QUERY_SUGGESTION_WINDOW_DAYS;
  }
}
