import { Inject, Injectable } from '@nestjs/common';
import {
  EntityType,
  KeywordAttemptOutcome,
  OnDemandReason,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { normalizeKeywordTerm } from './keyword-term-normalization';
import { stripGenericTokens } from '../../../shared/utils/generic-token-handling';
import { MarketRegistryService } from '../../markets/market-registry.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const MAX_TERMS_PER_CYCLE = 25;

const SLICE_QUOTAS = {
  unmet: 5,
  refresh: 10,
  demand: 8,
  explore: 2,
} as const;

const SLICE_PRIORITY: KeywordSlice[] = [
  'unmet',
  'refresh',
  'demand',
  'explore',
];

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_TREND_WINDOW_DAYS = 7;
const DEFAULT_SAFE_INTERVAL_DAYS = 7;

const FAVORITE_USERS_CAP = 10;
const CARD_ENGAGEMENT_USERS_CAP = 25;
const EXPLICIT_SELECTION_USERS_CAP = 25;
const QUERY_USERS_PRIMARY_CAP = 50;

const DEMAND_WEIGHT_FAVORITES = 0.35;
const DEMAND_WEIGHT_CARD_ENGAGEMENT = 0.2;
const DEMAND_WEIGHT_EXPLICIT_SELECTION = 0.15;
const DEMAND_WEIGHT_QUERY_PRIMARY = 0.3;

const UNMET_DISTINCT_USERS_CAP = 25;
const UNMET_REASON_SEVERITY: Record<OnDemandReason, number> = {
  unresolved: 1,
  low_result: 0.8,
};
const NO_RESULTS_SOFT_SUPPRESSION_MULTIPLIER = 0.3;
const NO_RESULTS_SOFT_SUPPRESSION_WINDOW_DAYS = 60;

const REFRESH_STALENESS_SATURATION_DAYS = 90;

const EXPLORE_RECENT_ATTEMPT_DAYS = 30;

const EXPLORE_SIGNAL_CARD_ENGAGEMENT_FLOOR = 2;
const EXPLORE_SIGNAL_EXPLICIT_SELECTION_FLOOR = 2;
const EXPLORE_SIGNAL_FAVORITE_FLOOR = 1;
const EXPLORE_SIGNAL_UNMET_FLOOR = 2;

const ENTITY_SIGNAL_CANDIDATE_LIMIT = MAX_TERMS_PER_CYCLE * 50;

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

function normalizeLog(value: number, cap: number): number {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const safeCap = Number.isFinite(cap) && cap > 0 ? cap : 1;
  return clamp01(Math.log1p(safeValue) / Math.log1p(safeCap));
}

export type KeywordSlice = 'unmet' | 'refresh' | 'demand' | 'explore';

export interface KeywordTermCandidate {
  term: string;
  normalizedTerm: string;
  slice: KeywordSlice;
  score: number;
  entityType?: EntityType;
  origin?: Record<string, unknown>;
}

export interface KeywordSliceSelectionStats {
  candidatesBySlice: Record<KeywordSlice, number>;
  eligibleBySlice: Record<KeywordSlice, number>;
  selectedBySlice: Record<KeywordSlice, number>;
  underfilledBySlice: Record<KeywordSlice, number>;
  dropped: {
    invalid: number;
    cooldown: number;
    deduped: number;
  };
}

export interface KeywordSliceSelectionResult {
  subreddit: string;
  collectableMarketKey: string;
  safeIntervalDays: number;
  windowDays: number;
  maxTerms: number;
  quotas: Record<KeywordSlice, number>;
  terms: KeywordTermCandidate[];
  stats: KeywordSliceSelectionStats;
}

type CommunityLookup = {
  safeIntervalDays: number | null;
} | null;

@Injectable()
export class KeywordSliceSelectionService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketRegistry: MarketRegistryService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('KeywordSliceSelectionService');
  }

  async selectTermsForSubreddit(
    subreddit: string,
  ): Promise<KeywordSliceSelectionResult> {
    const normalizedSubreddit = subreddit.trim();
    const community = await this.lookupCommunity(normalizedSubreddit);
    const mappedMarketKey =
      await this.marketRegistry.resolveMarketKeyForCommunity(
        normalizedSubreddit,
      );
    if (!mappedMarketKey) {
      throw new Error(
        `No marketKey configured for collection community "${normalizedSubreddit}"`,
      );
    }
    const collectableMarketKey = mappedMarketKey;
    const safeIntervalDays = this.resolveSafeIntervalDays(community);
    const now = new Date();
    const windowDays = this.resolveWindowDays(
      process.env.KEYWORD_DEMAND_WINDOW_DAYS,
      DEFAULT_WINDOW_DAYS,
    );
    const trendWindowDays = this.resolveWindowDays(
      process.env.KEYWORD_TREND_WINDOW_DAYS,
      DEFAULT_TREND_WINDOW_DAYS,
    );
    const since = new Date(now.getTime() - windowDays * MS_PER_DAY);

    const stats: KeywordSliceSelectionStats = {
      candidatesBySlice: { unmet: 0, refresh: 0, demand: 0, explore: 0 },
      eligibleBySlice: { unmet: 0, refresh: 0, demand: 0, explore: 0 },
      selectedBySlice: { unmet: 0, refresh: 0, demand: 0, explore: 0 },
      underfilledBySlice: { unmet: 0, refresh: 0, demand: 0, explore: 0 },
      dropped: { invalid: 0, cooldown: 0, deduped: 0 },
    };

    const candidatesBySlice: Record<KeywordSlice, KeywordTermCandidate[]> = {
      unmet: await this.loadUnmetCandidates(collectableMarketKey, since, now),
      refresh: await this.loadRefreshCandidates(collectableMarketKey, now),
      demand: await this.loadDemandCandidates(collectableMarketKey, since),
      explore: await this.loadExploreCandidates({
        collectableMarketKey,
        since,
        now,
        trendWindowDays,
      }),
    };

    for (const slice of SLICE_PRIORITY) {
      candidatesBySlice[slice] = this.normalizeAndFilterCandidates(
        candidatesBySlice[slice],
        stats,
      );
      candidatesBySlice[slice] = this.dedupeWithinSlice(
        candidatesBySlice[slice],
      );
      candidatesBySlice[slice] = candidatesBySlice[slice].sort(
        (a, b) => b.score - a.score,
      );
      stats.candidatesBySlice[slice] = candidatesBySlice[slice].length;
    }

    const attemptHistoryMap = await this.loadAttemptHistoryByTerm({
      collectableMarketKey,
      normalizedTerms: Array.from(
        new Set(
          SLICE_PRIORITY.flatMap((slice) =>
            candidatesBySlice[slice].map(
              (candidate) => candidate.normalizedTerm,
            ),
          ),
        ),
      ),
    });

    for (const slice of SLICE_PRIORITY) {
      const filtered: KeywordTermCandidate[] = [];
      for (const candidate of candidatesBySlice[slice]) {
        const history = attemptHistoryMap.get(candidate.normalizedTerm);
        if (history?.cooldownUntil && history.cooldownUntil > now) {
          stats.dropped.cooldown += 1;
          continue;
        }

        const adjusted = this.applyAttemptHistoryAdjustments(
          candidate,
          history,
          now,
        );
        filtered.push(adjusted);
      }
      candidatesBySlice[slice] = filtered.sort((a, b) => b.score - a.score);
    }

    const dedupedBySlice: Record<KeywordSlice, KeywordTermCandidate[]> = {
      unmet: [],
      refresh: [],
      demand: [],
      explore: [],
    };
    const seen = new Set<string>();
    for (const slice of SLICE_PRIORITY) {
      for (const candidate of candidatesBySlice[slice]) {
        if (seen.has(candidate.normalizedTerm)) {
          stats.dropped.deduped += 1;
          continue;
        }
        seen.add(candidate.normalizedTerm);
        dedupedBySlice[slice].push(candidate);
      }
      stats.eligibleBySlice[slice] = dedupedBySlice[slice].length;
    }

    const quotas: Record<KeywordSlice, number> = {
      unmet: SLICE_QUOTAS.unmet,
      refresh: SLICE_QUOTAS.refresh,
      demand: SLICE_QUOTAS.demand,
      explore: SLICE_QUOTAS.explore,
    };

    const selectedBySlice: Record<KeywordSlice, KeywordTermCandidate[]> = {
      unmet: dedupedBySlice.unmet.slice(0, quotas.unmet),
      refresh: dedupedBySlice.refresh.slice(0, quotas.refresh),
      demand: dedupedBySlice.demand.slice(0, quotas.demand),
      explore: dedupedBySlice.explore.slice(0, quotas.explore),
    };

    const overflowBySlice: Record<KeywordSlice, KeywordTermCandidate[]> = {
      unmet: dedupedBySlice.unmet.slice(quotas.unmet),
      refresh: dedupedBySlice.refresh.slice(quotas.refresh),
      demand: dedupedBySlice.demand.slice(quotas.demand),
      explore: dedupedBySlice.explore.slice(quotas.explore),
    };

    const primarySelected: KeywordTermCandidate[] = [];
    for (const slice of SLICE_PRIORITY) {
      primarySelected.push(...selectedBySlice[slice]);
      stats.selectedBySlice[slice] = selectedBySlice[slice].length;
      stats.underfilledBySlice[slice] = Math.max(
        0,
        quotas[slice] - selectedBySlice[slice].length,
      );
    }

    const maxTerms = MAX_TERMS_PER_CYCLE;
    let remaining = Math.max(0, maxTerms - primarySelected.length);
    const finalSelection = [...primarySelected];

    for (const slice of SLICE_PRIORITY) {
      if (remaining <= 0) {
        break;
      }
      const overflow = overflowBySlice[slice];
      const take = Math.min(remaining, overflow.length);
      if (take > 0) {
        finalSelection.push(...overflow.slice(0, take));
        remaining -= take;
      }
    }

    this.logger.debug('Selected keyword terms for cycle', {
      subreddit: normalizedSubreddit,
      collectableMarketKey,
      maxTerms,
      quotas,
      stats,
      sample: finalSelection.slice(0, 10).map((term) => ({
        slice: term.slice,
        term: term.term,
        normalizedTerm: term.normalizedTerm,
        score: term.score,
      })),
    });

    return {
      subreddit: normalizedSubreddit,
      collectableMarketKey,
      safeIntervalDays,
      windowDays,
      maxTerms,
      quotas,
      terms: finalSelection,
      stats,
    };
  }

  private normalizeAndFilterCandidates(
    candidates: KeywordTermCandidate[],
    stats: KeywordSliceSelectionStats,
  ): KeywordTermCandidate[] {
    const result: KeywordTermCandidate[] = [];

    for (const candidate of candidates) {
      const stripped = stripGenericTokens(candidate.term);
      const term = stripped.text;
      if (!term.length || stripped.isGenericOnly) {
        stats.dropped.invalid += 1;
        continue;
      }

      const normalizedTerm = normalizeKeywordTerm(term);
      if (!normalizedTerm.length) {
        stats.dropped.invalid += 1;
        continue;
      }

      result.push({
        ...candidate,
        term,
        normalizedTerm,
      });
    }

    return result;
  }

  private dedupeWithinSlice(
    candidates: KeywordTermCandidate[],
  ): KeywordTermCandidate[] {
    const byTerm = new Map<string, KeywordTermCandidate>();

    for (const candidate of candidates) {
      const existing = byTerm.get(candidate.normalizedTerm);
      if (!existing || candidate.score > existing.score) {
        byTerm.set(candidate.normalizedTerm, candidate);
      }
    }

    return Array.from(byTerm.values());
  }

  private resolveWindowDays(raw: string | undefined, fallback: number): number {
    if (!raw) {
      return fallback;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private calculateDemandScore(params: {
    favoriteUsers: number;
    cardEngagementUsers: number;
    explicitSelectionUsers: number;
    queryUsersPrimary: number;
  }): number {
    const favoriteScore = normalizeLog(
      params.favoriteUsers,
      FAVORITE_USERS_CAP,
    );
    const cardEngagementScore = normalizeLog(
      params.cardEngagementUsers,
      CARD_ENGAGEMENT_USERS_CAP,
    );
    const explicitSelectionScore = normalizeLog(
      params.explicitSelectionUsers,
      EXPLICIT_SELECTION_USERS_CAP,
    );
    const queryScore = normalizeLog(
      params.queryUsersPrimary,
      QUERY_USERS_PRIMARY_CAP,
    );

    return (
      DEMAND_WEIGHT_FAVORITES * favoriteScore +
      DEMAND_WEIGHT_CARD_ENGAGEMENT * cardEngagementScore +
      DEMAND_WEIGHT_EXPLICIT_SELECTION * explicitSelectionScore +
      DEMAND_WEIGHT_QUERY_PRIMARY * queryScore
    );
  }

  private calculateUnmetScore(params: {
    distinctUsers: number;
    reason: OnDemandReason;
    lastSeenAt: Date;
    now: Date;
  }): number {
    const severity = UNMET_REASON_SEVERITY[params.reason] ?? 1;
    const demandScore = normalizeLog(
      params.distinctUsers,
      UNMET_DISTINCT_USERS_CAP,
    );
    const daysSinceLastSeen =
      (params.now.getTime() - params.lastSeenAt.getTime()) / MS_PER_DAY;
    const safeDaysSinceLastSeen =
      Number.isFinite(daysSinceLastSeen) && daysSinceLastSeen > 0
        ? daysSinceLastSeen
        : 0;
    const recencyBoost = 0.7 + 0.3 * Math.exp(-safeDaysSinceLastSeen / 7);

    return severity * demandScore * recencyBoost;
  }

  private applyAttemptHistoryAdjustments(
    candidate: KeywordTermCandidate,
    history:
      | {
          cooldownUntil: Date | null;
          lastOutcome: KeywordAttemptOutcome | null;
          lastAttemptAt: Date | null;
        }
      | undefined,
    now: Date,
  ): KeywordTermCandidate {
    if (candidate.slice === 'unmet') {
      if (
        history?.lastOutcome === 'no_results' &&
        history.lastAttemptAt instanceof Date &&
        !Number.isNaN(history.lastAttemptAt.getTime())
      ) {
        const daysSinceAttempt =
          (now.getTime() - history.lastAttemptAt.getTime()) / MS_PER_DAY;
        if (
          Number.isFinite(daysSinceAttempt) &&
          daysSinceAttempt >= 0 &&
          daysSinceAttempt <= NO_RESULTS_SOFT_SUPPRESSION_WINDOW_DAYS
        ) {
          const origin =
            candidate.origin && typeof candidate.origin === 'object'
              ? candidate.origin
              : {};
          return {
            ...candidate,
            score: candidate.score * NO_RESULTS_SOFT_SUPPRESSION_MULTIPLIER,
            origin: {
              ...origin,
              softSuppressed: true,
              suppressionMultiplier: NO_RESULTS_SOFT_SUPPRESSION_MULTIPLIER,
              lastOutcome: history.lastOutcome,
              lastAttemptAt: history.lastAttemptAt.toISOString(),
            },
          };
        }
      }

      return candidate;
    }

    if (candidate.slice === 'explore') {
      const origin =
        candidate.origin && typeof candidate.origin === 'object'
          ? candidate.origin
          : {};
      const queryUsers7d =
        typeof origin.queryUsers7d === 'number' ? origin.queryUsers7d : 0;
      const queryUsersPrev7d =
        typeof origin.queryUsersPrev7d === 'number'
          ? origin.queryUsersPrev7d
          : 0;
      const localQueryUsers =
        typeof origin.localQueryUsers === 'number' ? origin.localQueryUsers : 0;
      const globalQueryUsers =
        typeof origin.globalQueryUsers === 'number'
          ? origin.globalQueryUsers
          : 0;

      const trend = clamp01(
        (queryUsers7d - queryUsersPrev7d) / Math.max(1, queryUsersPrev7d),
      );

      const otherUsers = Math.max(0, globalQueryUsers - localQueryUsers);
      const localSpecialization = clamp01(
        (localQueryUsers + 1) / (otherUsers + 1) / 3,
      );

      const novelty = (() => {
        if (
          history?.lastAttemptAt instanceof Date &&
          !Number.isNaN(history.lastAttemptAt.getTime())
        ) {
          const daysSinceAttempt =
            (now.getTime() - history.lastAttemptAt.getTime()) / MS_PER_DAY;
          const safeDays =
            Number.isFinite(daysSinceAttempt) && daysSinceAttempt > 0
              ? daysSinceAttempt
              : 0;
          return clamp01(safeDays / EXPLORE_RECENT_ATTEMPT_DAYS);
        }
        return 1;
      })();

      return {
        ...candidate,
        score: 0.45 * novelty + 0.35 * localSpecialization + 0.2 * trend,
        origin: {
          ...origin,
          novelty,
          trend,
          localSpecialization,
          lastOutcome: history?.lastOutcome ?? null,
          lastAttemptAt: history?.lastAttemptAt?.toISOString() ?? null,
        },
      };
    }

    return candidate;
  }

  private async loadUnmetCandidates(
    marketKey: string,
    since: Date,
    now: Date,
  ): Promise<KeywordTermCandidate[]> {
    const requests = await this.prisma.onDemandRequest.findMany({
      where: {
        marketKey,
        distinctUserCount: { gt: 0 },
        lastSeenAt: { gte: since },
        reason: { in: ['unresolved', 'low_result'] satisfies OnDemandReason[] },
      },
      orderBy: [{ distinctUserCount: 'desc' }, { lastSeenAt: 'desc' }],
      take: MAX_TERMS_PER_CYCLE * 10,
    });

    return requests.map((request) => ({
      term: request.term,
      normalizedTerm: '',
      slice: 'unmet',
      score: this.calculateUnmetScore({
        distinctUsers: request.distinctUserCount,
        reason: request.reason,
        lastSeenAt: request.lastSeenAt,
        now,
      }),
      entityType: request.entityType,
      origin: {
        requestId: request.requestId,
        reason: request.reason,
        distinctUserCount: request.distinctUserCount,
        lastSeenAt: request.lastSeenAt.toISOString(),
      },
    }));
  }

  private async loadDemandCandidates(
    collectableMarketKey: string,
    since: Date,
  ): Promise<KeywordTermCandidate[]> {
    const rows = await this.loadEntityDemandSignalRows({
      collectableMarketKey,
      since,
      limit: ENTITY_SIGNAL_CANDIDATE_LIMIT,
    });

    return rows.map((row) => {
      const demandScore = this.calculateDemandScore({
        favoriteUsers: row.favoriteUsers,
        cardEngagementUsers: row.viewUsers,
        explicitSelectionUsers: row.autocompleteUsers,
        queryUsersPrimary: row.queryUsersPrimary,
      });

      return {
        term: row.entityName,
        normalizedTerm: '',
        slice: 'demand',
        score: demandScore,
        entityType: row.entityType,
        origin: {
          entityId: row.entityId,
          favoriteUsers: row.favoriteUsers,
          cardEngagementUsers: row.viewUsers,
          explicitSelectionUsers: row.autocompleteUsers,
          queryUsersPrimary: row.queryUsersPrimary,
          viewUsers: row.viewUsers,
          autocompleteUsers: row.autocompleteUsers,
          lastQueryAt: row.lastQueryAt?.toISOString() ?? null,
          lastViewAt: row.lastViewAt?.toISOString() ?? null,
        },
      };
    });
  }

  private async loadExploreCandidates(params: {
    collectableMarketKey: string;
    since: Date;
    now: Date;
    trendWindowDays: number;
  }): Promise<KeywordTermCandidate[]> {
    const rows = await this.loadEntityDemandSignalRows({
      collectableMarketKey: params.collectableMarketKey,
      since: params.since,
      limit: ENTITY_SIGNAL_CANDIDATE_LIMIT,
    });

    if (!rows.length) {
      return [];
    }

    const unmetRequests = await this.prisma.onDemandRequest.findMany({
      where: {
        marketKey: params.collectableMarketKey,
        distinctUserCount: { gt: 0 },
        lastSeenAt: { gte: params.since },
        reason: { in: ['unresolved', 'low_result'] satisfies OnDemandReason[] },
      },
      select: {
        term: true,
        distinctUserCount: true,
        lastSeenAt: true,
      },
      take: ENTITY_SIGNAL_CANDIDATE_LIMIT,
      orderBy: [{ distinctUserCount: 'desc' }, { lastSeenAt: 'desc' }],
    });

    const unmetByNormalizedTerm = new Map<string, number>();
    for (const request of unmetRequests) {
      const stripped = stripGenericTokens(request.term);
      if (!stripped.text.length || stripped.isGenericOnly) {
        continue;
      }
      const normalized = normalizeKeywordTerm(stripped.text);
      if (!normalized.length) {
        continue;
      }
      unmetByNormalizedTerm.set(
        normalized,
        Math.max(
          unmetByNormalizedTerm.get(normalized) ?? 0,
          request.distinctUserCount,
        ),
      );
    }

    const trendSince = new Date(
      params.now.getTime() - params.trendWindowDays * MS_PER_DAY,
    );
    const prevTrendSince = new Date(
      params.now.getTime() - params.trendWindowDays * 2 * MS_PER_DAY,
    );

    const entityIds = Array.from(new Set(rows.map((row) => row.entityId)));
    const trendByEntityId = await this.loadTrendCountsByEntity({
      collectableMarketKey: params.collectableMarketKey,
      entityIds,
      since: prevTrendSince,
      trendSince,
    });

    const termKeys = Array.from(
      new Set(
        rows
          .map((row) => row.entityName.trim().toLowerCase())
          .filter((name) => name.length),
      ),
    );
    const entityTypes = Array.from(new Set(rows.map((row) => row.entityType)));

    const globalQueryUsersByTerm = await this.loadGlobalQueryCountsByTerm({
      since: params.since,
      termKeys,
      entityTypes,
    });

    const candidates: KeywordTermCandidate[] = [];

    for (const row of rows) {
      const stripped = stripGenericTokens(row.entityName);
      const normalized = stripped.text.length
        ? normalizeKeywordTerm(stripped.text)
        : '';
      const unmetDistinctUsers = normalized.length
        ? (unmetByNormalizedTerm.get(normalized) ?? 0)
        : 0;

      const signalFloorMet =
        row.viewUsers >= EXPLORE_SIGNAL_CARD_ENGAGEMENT_FLOOR ||
        row.autocompleteUsers >= EXPLORE_SIGNAL_EXPLICIT_SELECTION_FLOOR ||
        row.favoriteUsers >= EXPLORE_SIGNAL_FAVORITE_FLOOR ||
        unmetDistinctUsers >= EXPLORE_SIGNAL_UNMET_FLOOR;

      if (!signalFloorMet) {
        continue;
      }

      const termKey = row.entityName.trim().toLowerCase();
      const globalQueryUsers =
        globalQueryUsersByTerm.get(`${row.entityType}:${termKey}`) ?? 0;

      const trend = trendByEntityId.get(row.entityId) ?? {
        queryUsers7d: 0,
        queryUsersPrev7d: 0,
      };

      candidates.push({
        term: row.entityName,
        normalizedTerm: '',
        slice: 'explore',
        score: 0,
        entityType: row.entityType,
        origin: {
          entityId: row.entityId,
          favoriteUsers: row.favoriteUsers,
          cardEngagementUsers: row.viewUsers,
          explicitSelectionUsers: row.autocompleteUsers,
          queryUsersPrimary: row.queryUsersPrimary,
          unmetDistinctUsers,
          viewUsers: row.viewUsers,
          autocompleteUsers: row.autocompleteUsers,
          lastQueryAt: row.lastQueryAt?.toISOString() ?? null,
          lastViewAt: row.lastViewAt?.toISOString() ?? null,
          queryUsers7d: trend.queryUsers7d,
          queryUsersPrev7d: trend.queryUsersPrev7d,
          localQueryUsers: row.queryUsersPrimary,
          globalQueryUsers,
        },
      });
    }

    return candidates;
  }

  private async loadEntityDemandSignalRows(params: {
    collectableMarketKey: string;
    since: Date;
    limit: number;
  }): Promise<
    Array<{
      entityId: string;
      entityType: EntityType;
      entityName: string;
      favoriteUsers: number;
      viewUsers: number;
      autocompleteUsers: number;
      queryUsersPrimary: number;
      lastQueryAt: Date | null;
      lastViewAt: Date | null;
    }>
  > {
    const limit =
      Number.isFinite(params.limit) && params.limit > 0
        ? Math.floor(params.limit)
        : ENTITY_SIGNAL_CANDIDATE_LIMIT;

    if (!params.collectableMarketKey.trim()) {
      return [];
    }

    return await this.prisma.$queryRaw<
      Array<{
        entityId: string;
        entityType: EntityType;
        entityName: string;
        favoriteUsers: number;
        viewUsers: number;
        autocompleteUsers: number;
        queryUsersPrimary: number;
        lastQueryAt: Date | null;
        lastViewAt: Date | null;
      }>
    >(Prisma.sql`
      WITH market_restaurants AS (
        SELECT DISTINCT rl.restaurant_id
        FROM core_restaurant_locations rl
        JOIN core_markets m
          ON m.market_key = ${params.collectableMarketKey}
         AND m.geometry IS NOT NULL
         AND m.is_active = true
        WHERE rl.latitude IS NOT NULL
          AND rl.longitude IS NOT NULL
          AND ST_Contains(
            m.geometry,
            ST_SetSRID(
              ST_MakePoint(
                rl.longitude::double precision,
                rl.latitude::double precision
              ),
              4326
            )
          )
      ),
      local_query AS (
        SELECT
          entity_id,
          entity_type,
          COUNT(DISTINCT user_id)::int AS query_users_primary,
          MAX(logged_at) AS last_query_at
        FROM user_search_logs
        WHERE logged_at >= ${params.since}
          AND source = 'search'
          AND user_id IS NOT NULL
          AND entity_id IS NOT NULL
          AND entity_type IS NOT NULL
          AND collectable_market_key IS NOT NULL
          AND LOWER(collectable_market_key) = LOWER(${params.collectableMarketKey})
        GROUP BY entity_id, entity_type
        ORDER BY query_users_primary DESC, last_query_at DESC
        LIMIT ${limit}
      ),
      local_autocomplete AS (
        SELECT
          entity_id,
          entity_type,
          COUNT(DISTINCT user_id)::int AS autocomplete_users
        FROM user_search_logs
        WHERE logged_at >= ${params.since}
          AND source = 'search'
          AND user_id IS NOT NULL
          AND entity_id IS NOT NULL
          AND entity_type IS NOT NULL
          AND collectable_market_key IS NOT NULL
          AND LOWER(collectable_market_key) = LOWER(${params.collectableMarketKey})
          AND metadata->>'submissionSource' = 'autocomplete'
          AND metadata->'submissionContext'->>'selectedEntityId' IS NOT NULL
          AND metadata->'submissionContext'->>'selectedEntityType' IS NOT NULL
          AND (metadata->'submissionContext'->>'selectedEntityId')::uuid = entity_id
          AND metadata->'submissionContext'->>'selectedEntityType' = entity_type::text
        GROUP BY entity_id, entity_type
        ORDER BY autocomplete_users DESC
        LIMIT ${limit}
      ),
      restaurant_views AS (
        SELECT
          rv.restaurant_id AS entity_id,
          'restaurant'::entity_type AS entity_type,
          COUNT(*)::int AS view_users,
          MAX(rv.last_viewed_at) AS last_view_at
        FROM user_restaurant_views rv
        WHERE rv.last_viewed_at >= ${params.since}
          AND rv.restaurant_id IN (
            SELECT restaurant_id FROM market_restaurants
          )
        GROUP BY rv.restaurant_id
        ORDER BY view_users DESC, last_view_at DESC
        LIMIT ${limit}
      ),
	      food_views AS (
	        SELECT
	          fv.food_id AS entity_id,
	          'food'::entity_type AS entity_type,
	          COUNT(DISTINCT fv.user_id)::int AS view_users,
	          MAX(fv.last_viewed_at) AS last_view_at
	        FROM user_food_views fv
	        JOIN core_restaurant_items c ON c.connection_id = fv.connection_id
	        WHERE fv.last_viewed_at >= ${params.since}
	          AND c.restaurant_id IN (
	            SELECT restaurant_id FROM market_restaurants
	          )
	        GROUP BY fv.food_id
	        ORDER BY view_users DESC, last_view_at DESC
	        LIMIT ${limit}
	      ),
      favorite_counts AS (
        SELECT
          entity_id,
          entity_type,
          COUNT(*)::int AS favorite_users
        FROM user_favorites
        GROUP BY entity_id, entity_type
      ),
      favorite_candidates AS (
        SELECT
          f.entity_id,
          f.entity_type
        FROM favorite_counts f
        JOIN core_entities e ON e.entity_id = f.entity_id
        WHERE e.type IN ('restaurant', 'food', 'food_attribute', 'restaurant_attribute')
          AND (
            e.type <> 'restaurant'
            OR e.entity_id IN (SELECT restaurant_id FROM market_restaurants)
          )
          AND f.favorite_users > 0
        ORDER BY f.favorite_users DESC
        LIMIT ${limit}
      ),
      candidate_ids AS (
        SELECT entity_id, entity_type FROM local_query
        UNION
        SELECT entity_id, entity_type FROM local_autocomplete
        UNION
        SELECT entity_id, entity_type FROM restaurant_views
        UNION
        SELECT entity_id, entity_type FROM food_views
        UNION
        SELECT entity_id, entity_type FROM favorite_candidates
      )
      SELECT
        e.entity_id AS "entityId",
        e.type AS "entityType",
        e.name AS "entityName",
        COALESCE(fc.favorite_users, 0)::int AS "favoriteUsers",
        (COALESCE(rv.view_users, 0) + COALESCE(fv.view_users, 0))::int AS "viewUsers",
        NULLIF(
          GREATEST(
            COALESCE(rv.last_view_at, 'epoch'::timestamp),
            COALESCE(fv.last_view_at, 'epoch'::timestamp)
          ),
          'epoch'::timestamp
        ) AS "lastViewAt",
        COALESCE(la.autocomplete_users, 0)::int AS "autocompleteUsers",
        COALESCE(lq.query_users_primary, 0)::int AS "queryUsersPrimary",
        lq.last_query_at AS "lastQueryAt"
      FROM candidate_ids c
      JOIN core_entities e ON e.entity_id = c.entity_id
      LEFT JOIN favorite_counts fc
        ON fc.entity_id = c.entity_id AND fc.entity_type = c.entity_type
      LEFT JOIN restaurant_views rv ON rv.entity_id = c.entity_id
      LEFT JOIN food_views fv ON fv.entity_id = c.entity_id
      LEFT JOIN local_autocomplete la
        ON la.entity_id = c.entity_id AND la.entity_type = c.entity_type
      LEFT JOIN local_query lq
        ON lq.entity_id = c.entity_id AND lq.entity_type = c.entity_type
      WHERE e.type IN ('restaurant', 'food', 'food_attribute', 'restaurant_attribute')
        AND (
          e.type <> 'restaurant'
          OR e.entity_id IN (SELECT restaurant_id FROM market_restaurants)
        )
      ORDER BY
        (
          COALESCE(fc.favorite_users, 0) * 3
          + (COALESCE(rv.view_users, 0) + COALESCE(fv.view_users, 0)) * 2
          + COALESCE(la.autocomplete_users, 0) * 2
          + COALESCE(lq.query_users_primary, 0)
        ) DESC,
        GREATEST(
          COALESCE(lq.last_query_at, 'epoch'::timestamp),
          COALESCE(rv.last_view_at, 'epoch'::timestamp),
          COALESCE(fv.last_view_at, 'epoch'::timestamp)
        ) DESC
      LIMIT ${limit}
    `);
  }

  private async loadTrendCountsByEntity(params: {
    collectableMarketKey: string;
    entityIds: string[];
    since: Date;
    trendSince: Date;
  }): Promise<Map<string, { queryUsers7d: number; queryUsersPrev7d: number }>> {
    if (!params.entityIds.length) {
      return new Map();
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        entityId: string;
        queryUsers7d: number;
        queryUsersPrev7d: number;
      }>
    >(Prisma.sql`
      SELECT
        entity_id AS "entityId",
        COUNT(DISTINCT user_id) FILTER (WHERE logged_at >= ${
          params.trendSince
        })::int AS "queryUsers7d",
        COUNT(DISTINCT user_id) FILTER (
          WHERE logged_at >= ${params.since} AND logged_at < ${
            params.trendSince
          }
        )::int AS "queryUsersPrev7d"
      FROM user_search_logs
      WHERE logged_at >= ${params.since}
        AND source = 'search'
        AND user_id IS NOT NULL
        AND collectable_market_key IS NOT NULL
        AND LOWER(collectable_market_key) = LOWER(${
          params.collectableMarketKey
        })
        AND entity_id IN (${Prisma.join(params.entityIds)})
      GROUP BY entity_id
    `);

    return new Map(
      rows.map((row) => [
        row.entityId,
        {
          queryUsers7d: row.queryUsers7d,
          queryUsersPrev7d: row.queryUsersPrev7d,
        },
      ]),
    );
  }

  private async loadGlobalQueryCountsByTerm(params: {
    since: Date;
    termKeys: string[];
    entityTypes: EntityType[];
  }): Promise<Map<string, number>> {
    if (!params.termKeys.length || !params.entityTypes.length) {
      return new Map();
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        entityType: EntityType;
        termKey: string;
        globalQueryUsers: number;
      }>
    >(Prisma.sql`
      SELECT
        e.type AS "entityType",
        LOWER(e.name) AS "termKey",
        COUNT(DISTINCT l.user_id)::int AS "globalQueryUsers"
      FROM user_search_logs l
      JOIN core_entities e ON e.entity_id = l.entity_id
      WHERE l.logged_at >= ${params.since}
        AND l.source = 'search'
        AND l.user_id IS NOT NULL
        AND LOWER(e.name) IN (${Prisma.join(params.termKeys)})
        AND e.type IN (${Prisma.join(params.entityTypes)})
      GROUP BY e.type, LOWER(e.name)
    `);

    return new Map(
      rows.map((row) => [
        `${row.entityType}:${row.termKey}`,
        row.globalQueryUsers,
      ]),
    );
  }

  private async loadRefreshCandidates(
    collectableMarketKey: string,
    now: Date,
  ): Promise<KeywordTermCandidate[]> {
    const rows = await this.prisma.keywordAttemptHistory.findMany({
      where: { collectableMarketKey },
      orderBy: [{ lastSuccessAt: 'asc' }, { lastAttemptAt: 'asc' }],
      take: MAX_TERMS_PER_CYCLE * 10,
    });

    return rows.map((row) => {
      const stalenessDays = this.calculateStalenessDays(
        row.lastSuccessAt,
        row.lastAttemptAt,
        now,
      );
      const stalenessScore = clamp01(
        stalenessDays / REFRESH_STALENESS_SATURATION_DAYS,
      );

      return {
        term: row.normalizedTerm,
        normalizedTerm: row.normalizedTerm,
        slice: 'refresh',
        score: stalenessScore,
        origin: {
          stalenessDays,
          lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
          lastAttemptAt: row.lastAttemptAt?.toISOString() ?? null,
          lastOutcome: row.lastOutcome ?? null,
          cooldownUntil: row.cooldownUntil?.toISOString() ?? null,
        },
      };
    });
  }

  private calculateStalenessDays(
    lastSuccessAt: Date | null,
    lastAttemptAt: Date | null,
    now: Date,
  ): number {
    const anchor = lastSuccessAt ?? lastAttemptAt;
    if (!anchor) {
      return 365;
    }
    const days = (now.getTime() - anchor.getTime()) / MS_PER_DAY;
    if (!Number.isFinite(days) || days <= 0) {
      return 0;
    }
    return Math.min(365, days);
  }

  private async loadAttemptHistoryByTerm(params: {
    collectableMarketKey: string;
    normalizedTerms: string[];
  }): Promise<
    Map<
      string,
      {
        cooldownUntil: Date | null;
        lastOutcome: KeywordAttemptOutcome | null;
        lastAttemptAt: Date | null;
      }
    >
  > {
    if (!params.normalizedTerms.length) {
      return new Map();
    }

    const rows = await this.prisma.keywordAttemptHistory.findMany({
      where: {
        collectableMarketKey: params.collectableMarketKey,
        normalizedTerm: { in: params.normalizedTerms },
      },
      select: {
        normalizedTerm: true,
        cooldownUntil: true,
        lastOutcome: true,
        lastAttemptAt: true,
      },
    });

    return new Map(
      rows.map((row) => [
        row.normalizedTerm,
        {
          cooldownUntil: row.cooldownUntil,
          lastOutcome: row.lastOutcome,
          lastAttemptAt: row.lastAttemptAt,
        },
      ]),
    );
  }

  private async lookupCommunity(subreddit: string): Promise<CommunityLookup> {
    if (!subreddit.length) {
      return null;
    }

    return (await this.prisma.collectionCommunity.findFirst({
      where: {
        communityName: { equals: subreddit, mode: 'insensitive' },
      },
      select: { safeIntervalDays: true },
    })) as CommunityLookup;
  }

  private resolveSafeIntervalDays(community: CommunityLookup): number {
    const raw =
      typeof community?.safeIntervalDays === 'number'
        ? community.safeIntervalDays
        : null;
    if (raw && Number.isFinite(raw) && raw > 0) {
      return raw;
    }
    return DEFAULT_SAFE_INTERVAL_DAYS;
  }
}
