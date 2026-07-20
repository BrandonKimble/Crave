import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { Counter, Histogram } from 'prom-client';
import type { Redis } from 'ioredis';
import { RedisService } from '@liaoliaots/nestjs-redis';
import { LoggerService, TextSanitizerService } from '../../shared';
import { EntityResolutionService } from '../content-processing/entity-resolver/entity-resolution.service';
import {
  AutocompleteRequestDto,
  AutocompleteResponseDto,
  AutocompleteMatchDto,
} from './dto/autocomplete.dto';
import { EntitySearchService } from './entity-search.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SearchQuerySuggestionService,
  type QuerySuggestion,
} from '../search/search-query-suggestion.service';
import type { User } from '@prisma/client';
import { SearchPopularityService } from '../search/search-popularity.service';
import { RestaurantStatusService } from '../search/restaurant-status.service';
import { MetricsService } from '../metrics/metrics.service';
import { MarketRegistryService } from '../markets/market-registry.service';
import {
  SignalDemandReadService,
  type RestaurantViewStatsRow,
  type ViewedRestaurantNameMatch,
} from '../signals/signal-demand-read.service';
import type { SignalKind } from '../signals/signals.service';

const DEFAULT_LIMIT = 8;
const MIN_QUERY_LENGTH = 1;
const PERSONAL_QUERY_RESERVED_SLOTS = 2;
const GLOBAL_QUERY_RESERVED_SLOTS = 1;
const ATTRIBUTE_RESERVED_SLOTS = 1;
const ATTRIBUTE_SUPPORT_WINDOW_DAYS = 90;
const ATTRIBUTE_TYPED_SEARCH_WEIGHT = 0.6;
const ATTRIBUTE_SELECTION_WEIGHT = 0.3;
const ATTRIBUTE_CORPUS_WEIGHT = 0.1;
const ATTRIBUTE_LANE_RUNTIME_READY = true;
// Poll lane (§8.1): polls compete in the OVERFLOW pool — zero reserved slots, so
// they surface only when they out-score leftover entity/query candidates. Gated to
// longer queries + a min question match so they don't flood food searches.
const POLL_LANE_MIN_QUERY_LENGTH = 3;
// User lane (person rows, owner-scoped 2026-07-10: persons only — lists deliberately out):
// username/displayName prefix or word-similarity; taps push the userProfile page.
const USER_LANE_MIN_QUERY_LENGTH = 2;
const USER_LANE_MIN_SIMILARITY = 0.4;
const USER_LANE_MAX_CANDIDATES = 3;
const POLL_LANE_MIN_SIMILARITY = 0.4;
const POLL_LANE_MAX_CANDIDATES = 3;
const REQUEST_DURATION_BUCKETS = [0.01, 0.025, 0.05, 0.1, 0.2, 0.4, 0.8, 1.5];
const REQUEST_DB_DURATION_BUCKETS = [
  0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.4, 0.8,
];
type CacheResult = 'hit' | 'miss' | 'skipped';

type AttributeSupportScore = {
  typedSearchSupport: number;
  autocompleteSelectionSupport: number;
  corpusUsefulness: number;
  rankSupport: number;
  corpusConnectionCount: number;
  corpusSelectivity: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
}

@Injectable()
export class AutocompleteService {
  private readonly logger: LoggerService;
  private readonly redis: Redis;
  private readonly cacheTtlSeconds: number;
  private readonly cacheRedisKeyPrefix: string;
  private readonly weightConfidence: number;
  private readonly weightGlobalPopularity: number;
  private readonly weightUserAffinity: number;
  private readonly favoriteBoost: number;
  private readonly viewAffinityWeight: number;
  private readonly viewRecencyDecayDays: number;
  private readonly viewFrequencyCap: number;
  private readonly querySuggestionMax: number;
  private readonly querySuggestionPersonalBoost: number;
  private readonly querySuggestionMinGlobalCount: number;
  private readonly querySuggestionMinUserCount: number;
  private readonly attributeLaneEnabled: boolean;
  private readonly pollLaneEnabled: boolean;
  private readonly pollLaneWeight: number;
  private readonly userLaneEnabled: boolean;
  private readonly userLaneWeight: number;
  private readonly requestDurationHistogram: Histogram<string>;
  private readonly requestDbDurationHistogram: Histogram<string>;
  private readonly cacheLookupsCounter: Counter<string>;

  constructor(
    loggerService: LoggerService,
    redisService: RedisService,
    private readonly entityResolutionService: EntityResolutionService,
    private readonly textSanitizer: TextSanitizerService,
    private readonly entitySearchService: EntitySearchService,
    private readonly prisma: PrismaService,
    private readonly searchQuerySuggestionService: SearchQuerySuggestionService,
    private readonly searchPopularityService: SearchPopularityService,
    private readonly restaurantStatusService: RestaurantStatusService,
    private readonly marketRegistry: MarketRegistryService,
    private readonly signalDemandRead: SignalDemandReadService,
    metricsService: MetricsService,
  ) {
    this.logger = loggerService.setContext('AutocompleteService');
    this.redis = redisService.getOrThrow();
    this.cacheTtlSeconds = this.resolveEnvInt(
      'AUTOCOMPLETE_CACHE_TTL_SECONDS',
      60,
    );
    this.cacheRedisKeyPrefix = this.resolveEnvString(
      'AUTOCOMPLETE_CACHE_REDIS_PREFIX',
      'autocomplete:v2',
    );
    // Ranking weights tuned once during the autocomplete red-team; they are
    // product tuning, not env config (2026-07-11 fold-in: formerly
    // AUTOCOMPLETE_* env knobs whose .env lines restated these values).
    this.weightConfidence = 0.5;
    this.weightGlobalPopularity = 0.35;
    this.weightUserAffinity = 0.1;
    this.favoriteBoost = 0.05;
    this.viewAffinityWeight = 0.08;
    this.viewRecencyDecayDays = 30;
    this.viewFrequencyCap = 10;
    this.querySuggestionMax = 3;
    this.querySuggestionPersonalBoost = 0.05;
    this.querySuggestionMinGlobalCount = 3;
    this.querySuggestionMinUserCount = 1;
    this.attributeLaneEnabled =
      ATTRIBUTE_LANE_RUNTIME_READY &&
      this.resolveEnvBoolean('AUTOCOMPLETE_ENABLE_ATTRIBUTE_LANE', true);
    this.pollLaneEnabled = this.resolveEnvBoolean(
      'AUTOCOMPLETE_ENABLE_POLL_LANE',
      true,
    );
    this.pollLaneWeight = this.resolveEnvNumber(
      'AUTOCOMPLETE_WEIGHT_POLL_LANE',
      0.9,
    );
    this.userLaneEnabled = this.resolveEnvBoolean(
      'AUTOCOMPLETE_ENABLE_USER_LANE',
      true,
    );
    this.userLaneWeight = this.resolveEnvNumber(
      'AUTOCOMPLETE_WEIGHT_USER_LANE',
      0.9,
    );
    this.requestDurationHistogram = metricsService.getHistogram({
      name: 'autocomplete_request_duration_seconds',
      help: 'Autocomplete endpoint total duration in seconds',
      labelNames: ['cache_result'],
      buckets: REQUEST_DURATION_BUCKETS,
    });
    this.requestDbDurationHistogram = metricsService.getHistogram({
      name: 'autocomplete_request_db_duration_seconds',
      help: 'Autocomplete endpoint measured DB duration in seconds',
      labelNames: ['cache_result'],
      buckets: REQUEST_DB_DURATION_BUCKETS,
    });
    this.cacheLookupsCounter = metricsService.getCounter({
      name: 'autocomplete_cache_lookups_total',
      help: 'Autocomplete cache lookups by result',
      labelNames: ['result'],
    });
  }

  async autocompleteEntities(
    dto: AutocompleteRequestDto,
    user?: User,
  ): Promise<AutocompleteResponseDto> {
    const requestStart = process.hrtime.bigint();
    let cacheResult: CacheResult = 'skipped';
    let totalDbDurationSeconds = 0;

    try {
      const normalizedQuery = this.textSanitizer.sanitizeOrThrow(dto.query, {
        maxLength: 140,
      });
      const limit = dto.limit ?? DEFAULT_LIMIT;
      const entityTypes = this.resolveEntityTypes(dto);
      const attributeEntityTypes = this.resolveAttributeEntityTypes(dto);
      const cacheEntityTypes = [...entityTypes, ...attributeEntityTypes];
      const primaryEntityType = entityTypes[0] ?? EntityType.food;
      const marketScope = await this.resolveAutocompleteMarketScope(dto);
      const marketKey = marketScope.marketKey;

      if (normalizedQuery.length < MIN_QUERY_LENGTH) {
        return {
          matches: [],
          query: dto.query,
          normalizedQuery,
          onDemandQueued: false,
          querySuggestions: [],
        };
      }

      const cacheKey = this.buildCacheKey(
        user?.userId ?? null,
        cacheEntityTypes,
        normalizedQuery,
        marketScope.cacheScopeKey,
        this.attributeLaneEnabled,
      );
      const cacheLookup = await this.getFromCache(cacheKey);
      cacheResult = cacheLookup.result;
      this.cacheLookupsCounter.inc({ result: cacheLookup.result });
      if (cacheLookup.response) {
        return cacheLookup.response;
      }

      const injectedPromise =
        user && entityTypes.length > 0
          ? this.measureDbDuration(
              () =>
                this.fetchInjectedUserMatches(
                  normalizedQuery,
                  entityTypes,
                  user,
                ),
              (seconds) => {
                totalDbDurationSeconds += seconds;
              },
            )
          : Promise.resolve({ favorites: [], viewed: [] });
      const querySuggestionPromise = this.measureDbDuration(
        () =>
          this.searchQuerySuggestionService.getSuggestions(
            normalizedQuery,
            Math.min(10, Math.max(this.querySuggestionMax * 2, 6)),
            user?.userId,
          ),
        (seconds) => {
          totalDbDurationSeconds += seconds;
        },
      );

      const [searchResults, attributeResults] = await Promise.all([
        entityTypes.length
          ? this.measureDbDuration(
              () =>
                this.entitySearchService.searchEntitiesHybrid(
                  normalizedQuery,
                  entityTypes,
                  Math.min(limit * entityTypes.length, limit * 3),
                  { marketKey },
                ),
              (seconds) => {
                totalDbDurationSeconds += seconds;
              },
            )
          : Promise.resolve([]),
        attributeEntityTypes.length
          ? this.measureDbDuration(
              () =>
                this.entitySearchService.searchAttributeAutocompleteEntities(
                  normalizedQuery,
                  attributeEntityTypes,
                  Math.max(limit, ATTRIBUTE_RESERVED_SLOTS * 6),
                  { marketKey },
                ),
              (seconds) => {
                totalDbDurationSeconds += seconds;
              },
            )
          : Promise.resolve([]),
      ]);

      let matches: AutocompleteMatchDto[] = searchResults
        .slice(0, limit)
        .map((result) => ({
          entityId: result.entityId,
          entityType: result.type,
          name: result.name,
          confidence: Number(result.similarity.toFixed(2)),
          aliases: [],
          matchType: 'entity',
          evidenceTier: result.evidence,
        }));

      if (
        entityTypes.length > 0 &&
        matches.length === 0 &&
        normalizedQuery.length >= 3
      ) {
        matches = await this.measureDbDuration(
          () =>
            this.resolveViaEntityResolver(
              dto,
              normalizedQuery,
              primaryEntityType,
              limit,
              marketKey,
            ),
          (seconds) => {
            totalDbDurationSeconds += seconds;
          },
        );
      }

      const attributeMatches: AutocompleteMatchDto[] = attributeResults.map(
        (result) => ({
          entityId: result.entityId,
          entityType: result.type,
          name: result.name,
          confidence: Number(result.similarity.toFixed(2)),
          aliases: [],
          matchType: 'entity',
          evidenceTier: result.evidence,
        }),
      );

      const injected = await injectedPromise;

      const candidateMatches = this.mergeEntityMatches(
        [...matches, ...attributeMatches],
        [...injected.favorites, ...injected.viewed],
      );

      const querySuggestions = await querySuggestionPromise;

      const ranked = await this.measureDbDuration(
        () =>
          this.rankCandidates({
            entityMatches: candidateMatches,
            querySuggestions,
            user,
            marketKey,
            normalizedQuery,
            limit,
          }),
        (seconds) => {
          totalDbDurationSeconds += seconds;
        },
      );

      // See-locations cut: the old per-request location-count query is DEAD —
      // the multi-location fact rides statusPreview.locationCount (one shared
      // status-preview read), which the "See locations" chip derives from.
      const matchesWithStatus = await this.measureDbDuration(
        () => this.attachStatusPreviews(ranked.matches),
        (seconds) => {
          totalDbDurationSeconds += seconds;
        },
      );
      const response: AutocompleteResponseDto = {
        matches: matchesWithStatus,
        query: dto.query,
        normalizedQuery,
        onDemandQueued: false,
        onDemandReason: undefined,
        querySuggestions: ranked.querySuggestionTexts,
      };

      await this.setInCache(cacheKey, response);

      return response;
    } finally {
      this.requestDurationHistogram.observe(
        { cache_result: cacheResult },
        this.elapsedSeconds(requestStart),
      );
      this.requestDbDurationHistogram.observe(
        { cache_result: cacheResult },
        totalDbDurationSeconds,
      );
    }
  }

  private mergeEntityMatches(
    base: AutocompleteMatchDto[],
    injected: AutocompleteMatchDto[],
  ): AutocompleteMatchDto[] {
    const results: AutocompleteMatchDto[] = [];
    const seen = new Set<string>();

    for (const match of [...base, ...injected]) {
      if (!match.entityId || seen.has(match.entityId)) {
        continue;
      }
      seen.add(match.entityId);
      results.push(match);
    }

    return results;
  }

  private async attachStatusPreviews(
    matches: AutocompleteMatchDto[],
  ): Promise<AutocompleteMatchDto[]> {
    const restaurantIds = Array.from(
      new Set(
        matches
          .filter((match) => match.entityType === EntityType.restaurant)
          .map((match) => match.entityId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (restaurantIds.length === 0) {
      return matches;
    }

    const previews = await this.restaurantStatusService.getStatusPreviews({
      restaurantIds,
    });
    const previewMap = new Map(
      previews.map((preview) => [preview.restaurantId, preview]),
    );

    return matches.map((match) => {
      if (match.entityType !== EntityType.restaurant) {
        return match;
      }
      const preview = previewMap.get(match.entityId);
      if (!preview) {
        return match;
      }
      return {
        ...match,
        statusPreview: preview,
      };
    });
  }

  private async fetchInjectedUserMatches(
    normalizedQuery: string,
    entityTypes: EntityType[],
    user: User,
  ): Promise<{
    favorites: AutocompleteMatchDto[];
    viewed: AutocompleteMatchDto[];
  }> {
    const tasks: Array<Promise<unknown>> = [];

    const favoritesTask = this.prisma.userFavorite.findMany({
      where: {
        userId: user.userId,
        entityType: { in: entityTypes },
        entity: {
          is: {
            name: { startsWith: normalizedQuery, mode: 'insensitive' },
          },
        },
      },
      select: {
        entityId: true,
        entityType: true,
        entity: { select: { name: true, aliases: true } },
      },
      take: 20,
    });
    tasks.push(favoritesTask);

    const includeRestaurants = entityTypes.includes(EntityType.restaurant);
    // READER CUT (§22 item 6): "viewed" suggestions read the signals ledger
    // (kind = entity_view), not the dying user_restaurant_views table.
    const viewedTask = includeRestaurants
      ? this.signalDemandRead.viewedRestaurantNameMatches(
          user.userId,
          normalizedQuery,
          20,
        )
      : Promise.resolve([] as ViewedRestaurantNameMatch[]);
    tasks.push(viewedTask);

    const [favoriteRows, viewedRows] = (await Promise.all(tasks)) as [
      Array<{
        entityId: string;
        entityType: EntityType;
        entity: { name: string; aliases: string[] };
      }>,
      ViewedRestaurantNameMatch[],
    ];

    const favorites: AutocompleteMatchDto[] = favoriteRows.map((row) => ({
      entityId: row.entityId,
      entityType: row.entityType,
      name: row.entity.name,
      confidence: 0.65,
      aliases: row.entity.aliases ?? [],
      matchType: 'entity',
      badges: { favorite: true },
    }));

    const viewed: AutocompleteMatchDto[] = viewedRows.map((row) => ({
      entityId: row.restaurantId,
      entityType: EntityType.restaurant,
      name: row.name,
      confidence: 0.65,
      aliases: row.aliases ?? [],
      matchType: 'entity',
      badges: { viewed: true },
    }));

    return { favorites, viewed };
  }

  private async rankCandidates(params: {
    entityMatches: AutocompleteMatchDto[];
    querySuggestions: QuerySuggestion[];
    user?: User;
    marketKey?: string | null;
    normalizedQuery: string;
    limit: number;
  }): Promise<{
    matches: AutocompleteMatchDto[];
    querySuggestionTexts: string[];
  }> {
    const { entityMatches, querySuggestions, user, limit, normalizedQuery } =
      params;

    // Poll lane runs in parallel with the entity/popularity DB work; it joins the
    // overflow pool below (zero reserved slots, §8.1).
    const pollCandidatesPromise = this.fetchPollMatches(
      normalizedQuery,
      params.marketKey ?? null,
      limit,
    );
    const userCandidatesPromise = this.fetchUserMatches(normalizedQuery, limit);

    const entityIds = Array.from(
      new Set(entityMatches.map((match) => match.entityId)),
    );

    const restaurantIds = entityMatches
      .filter((match) => match.entityType === EntityType.restaurant)
      .map((match) => match.entityId);

    // READER CUT (§22 item 6): popularity/affinity read the signals substrate
    // and the view-affinity stats read the ledger (kind = entity_view) — the
    // user_restaurant_views read is dead.
    const [globalScores, affinityScores, favorites, views] = await Promise.all([
      entityIds.length
        ? this.searchPopularityService.getEntityPopularityScores(entityIds)
        : Promise.resolve(new Map<string, number>()),
      user?.userId && entityIds.length
        ? this.searchPopularityService.getUserEntityAffinity(
            user.userId,
            entityIds,
          )
        : Promise.resolve(new Map<string, number>()),
      user?.userId && entityIds.length
        ? this.prisma.userFavorite.findMany({
            where: { userId: user.userId, entityId: { in: entityIds } },
            select: { entityId: true },
          })
        : Promise.resolve([] as { entityId: string }[]),
      user?.userId && restaurantIds.length
        ? this.signalDemandRead.restaurantViewStats(user.userId, restaurantIds)
        : Promise.resolve([] as RestaurantViewStatsRow[]),
    ]);

    const favoriteSet = new Set(favorites.map((fav) => fav.entityId));
    const viewByRestaurantId = new Map(
      views.map((row) => [
        row.restaurantId,
        { lastViewedAt: row.lastViewedAt, viewCount: row.viewCount },
      ]),
    );

    const attributeSupport = await this.loadAttributeSupport(
      entityMatches,
      params.marketKey ?? null,
    );

    const scoredEntities = entityMatches.flatMap((match) => {
      const attributeSupportScore = this.isAttributeType(match.entityType)
        ? (attributeSupport.get(match.entityId) ?? this.emptyAttributeSupport())
        : null;
      const popularity = globalScores.get(match.entityId) ?? 0;
      const affinity = affinityScores.get(match.entityId) ?? 0;
      const isFavorite = favoriteSet.has(match.entityId);
      const view = viewByRestaurantId.get(match.entityId) ?? null;
      const isViewed = Boolean(view);
      const viewAffinity = view
        ? this.calculateViewAffinity(view.lastViewedAt, view.viewCount)
        : 0;
      const popularityBoost =
        this.normalizePopularity(popularity) * this.weightGlobalPopularity;
      const affinityBoost =
        this.normalizePopularity(affinity) * this.weightUserAffinity;
      const favoriteBoost = isFavorite ? this.favoriteBoost : 0;
      const viewedBoost = isViewed ? this.viewAffinityWeight * viewAffinity : 0;

      if (
        this.isAttributeType(match.entityType) &&
        !this.isStrongAttributeCandidate({
          match,
          normalizedQuery,
        })
      ) {
        return [];
      }

      const score =
        attributeSupportScore !== null
          ? this.calculateAttributeScore({
              confidence: match.confidence,
              support: attributeSupportScore,
            })
          : this.calculateLexicalFirstEntityScore({
              confidence: match.confidence,
              boost:
                popularityBoost + affinityBoost + favoriteBoost + viewedBoost,
            });

      return [
        {
          match: {
            ...match,
            badges: {
              ...match.badges,
              favorite: isFavorite || match.badges?.favorite,
              viewed: isViewed || match.badges?.viewed,
            },
          },
          score,
        },
      ];
    });

    const existingNames = new Set(
      scoredEntities.map(({ match }) => match.name.toLowerCase()),
    );

    const acceptedQueryCandidates = querySuggestions
      .flatMap((suggestion, laneRank) => {
        const text = suggestion.text.trim();
        if (!text) return [];
        if (existingNames.has(text.toLowerCase())) return [];
        if (suggestion.userCount >= this.querySuggestionMinUserCount)
          return [{ suggestion, laneRank, text }];
        return suggestion.globalCount >= this.querySuggestionMinGlobalCount
          ? [{ suggestion, laneRank, text }]
          : [];
      })
      .map(({ suggestion, laneRank, text }) => {
        const score =
          this.weightConfidence +
          this.normalizePopularity(suggestion.globalCount) *
            this.weightGlobalPopularity +
          this.normalizePopularity(suggestion.userCount) *
            this.weightUserAffinity +
          (suggestion.source === 'personal'
            ? this.querySuggestionPersonalBoost
            : 0);

        const match: AutocompleteMatchDto = {
          entityId: `query:${text.toLowerCase()}`,
          entityType: 'query',
          name: text,
          aliases: [],
          confidence: 1,
          matchType: 'query',
          querySuggestionSource: suggestion.source,
          badges:
            suggestion.source === 'personal'
              ? { recentQuery: true }
              : undefined,
        };

        return { match, score, laneRank };
      });

    const compareQueryLaneOrder = (
      a: { score: number; laneRank: number },
      b: { score: number; laneRank: number },
    ) => a.laneRank - b.laneRank || b.score - a.score;
    const personalQueryCandidates = acceptedQueryCandidates
      .filter(({ match }) => match.querySuggestionSource === 'personal')
      .sort(compareQueryLaneOrder);
    const globalQueryCandidates = acceptedQueryCandidates
      .filter(({ match }) => match.querySuggestionSource === 'global')
      .sort(compareQueryLaneOrder);
    // The query-suggestion STRIP (a separate UI surface from the main list) is the
    // ONLY consumer of the reserved-slot ordering: seat the user's own recent
    // queries first, then popular global ones, capped at querySuggestionMax. This
    // shaping stays local to the strip — the main-list blend below receives the
    // FULL, unshaped query lane (personal/globalQueryCandidates) so every suggestion
    // competes purely on score, never truncated by the strip's presentation cap.
    const querySuggestionStrip = [
      ...personalQueryCandidates.slice(
        0,
        Math.max(1, PERSONAL_QUERY_RESERVED_SLOTS),
      ),
      ...globalQueryCandidates.slice(
        0,
        Math.max(1, GLOBAL_QUERY_RESERVED_SLOTS),
      ),
      ...personalQueryCandidates.slice(
        Math.max(1, PERSONAL_QUERY_RESERVED_SLOTS),
      ),
      ...globalQueryCandidates.slice(Math.max(1, GLOBAL_QUERY_RESERVED_SLOTS)),
    ].slice(0, Math.max(1, this.querySuggestionMax));

    const pollCandidates = await pollCandidatesPromise;
    const userCandidates = await userCandidatesPromise;

    const finalMatches = this.mergeAutocompleteLanes({
      entityCandidates: scoredEntities
        .filter(({ match }) => !this.isAttributeType(match.entityType))
        .sort((a, b) => b.score - a.score),
      attributeCandidates: scoredEntities
        .filter(({ match }) => this.isAttributeType(match.entityType))
        .sort((a, b) => b.score - a.score),
      personalQueryCandidates,
      globalQueryCandidates,
      pollCandidates,
      userCandidates,
      limit,
    });

    const querySuggestionTexts = querySuggestionStrip.map(
      (candidate) => candidate.match.name,
    );

    return { matches: finalMatches, querySuggestionTexts };
  }

  private mergeAutocompleteLanes(params: {
    entityCandidates: Array<{ match: AutocompleteMatchDto; score: number }>;
    attributeCandidates: Array<{ match: AutocompleteMatchDto; score: number }>;
    personalQueryCandidates: Array<{
      match: AutocompleteMatchDto;
      score: number;
    }>;
    globalQueryCandidates: Array<{
      match: AutocompleteMatchDto;
      score: number;
    }>;
    pollCandidates: Array<{ match: AutocompleteMatchDto; score: number }>;
    userCandidates: Array<{ match: AutocompleteMatchDto; score: number }>;
    limit: number;
  }): AutocompleteMatchDto[] {
    // FLOOR, NOT MANDATE (owner directive): every lane's candidates compete in ONE
    // global score sort. A lane's suggestion appears only if it out-scores the
    // others — we never seat a weak lane-top ahead of a stronger candidate from
    // another lane, and never force a slot just to fill a bucket.
    // Every lane — including the FULL query lane (not the strip-truncated subset) —
    // enters this sort unshaped; the reserved-slot constants shape only the separate
    // query-suggestion strip upstream, never this cross-lane blend.
    const finalMatches: AutocompleteMatchDto[] = [];
    const seen = new Set<string>();
    const ranked = [
      ...params.entityCandidates,
      ...params.attributeCandidates,
      ...params.personalQueryCandidates,
      ...params.globalQueryCandidates,
      ...params.pollCandidates,
      ...params.userCandidates,
    ].sort((a, b) => b.score - a.score);
    for (const candidate of ranked) {
      if (finalMatches.length >= params.limit) {
        break;
      }
      const key = `${candidate.match.entityType}:${candidate.match.entityId}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      finalMatches.push(candidate.match);
    }
    return finalMatches;
  }

  /**
   * Poll lane (§8.1): active polls in the current market whose question matches
   * the query. Zero reserved slots — these join the overflow pool and surface only
   * when they out-score leftover entity/query candidates. v1 ranks on question
   * text match (word-similarity + substring); entity-in-poll match and recency
   * weighting are future refinements.
   */
  private async fetchPollMatches(
    normalizedQuery: string,
    marketKey: string | null,
    limit: number,
  ): Promise<Array<{ match: AutocompleteMatchDto; score: number }>> {
    if (
      !this.pollLaneEnabled ||
      !marketKey ||
      normalizedQuery.trim().length < POLL_LANE_MIN_QUERY_LENGTH
    ) {
      return [];
    }
    const take = Math.max(1, Math.min(limit, POLL_LANE_MAX_CANDIDATES));
    const likePattern = `%${normalizedQuery}%`;
    const rows = await this.prisma.$queryRaw<
      Array<{ poll_id: string; question: string; sim: number }>
    >(Prisma.sql`
      SELECT poll_id, question,
             word_similarity(${normalizedQuery}, question) AS sim
      FROM polls
      WHERE state::text = 'active'
        AND market_key = ${marketKey}
        AND (
          question ILIKE ${likePattern}
          OR word_similarity(${normalizedQuery}, question) >= ${POLL_LANE_MIN_SIMILARITY}
        )
      ORDER BY sim DESC, launched_at DESC NULLS LAST
      LIMIT ${take}
    `);
    return rows.map((row) => {
      const sim = clamp01(Number(row.sim) || 0);
      const match: AutocompleteMatchDto = {
        entityId: row.poll_id,
        entityType: 'poll',
        name: row.question,
        aliases: [],
        confidence: Number(sim.toFixed(2)),
        matchType: 'poll',
      };
      return { match, score: sim * this.pollLaneWeight };
    });
  }

  /**
   * User lane (person rows): people by username/displayName prefix or word
   * similarity. Same floor-not-mandate contract as every lane — user rows
   * compete in the one global score sort, never seated ahead of stronger
   * candidates. A tap pushes the userProfile page (client routes matchType
   * 'user' through the pushScene arm).
   */
  private async fetchUserMatches(
    normalizedQuery: string,
    limit: number,
  ): Promise<Array<{ match: AutocompleteMatchDto; score: number }>> {
    if (
      !this.userLaneEnabled ||
      normalizedQuery.trim().length < USER_LANE_MIN_QUERY_LENGTH
    ) {
      return [];
    }
    const take = Math.max(1, Math.min(limit, USER_LANE_MAX_CANDIDATES));
    const prefixPattern = `${normalizedQuery}%`;
    const rows = await this.prisma.$queryRaw<
      Array<{
        user_id: string;
        username: string | null;
        display_name: string | null;
        sim: number;
        is_prefix: boolean;
      }>
    >(Prisma.sql`
      SELECT user_id, username, display_name, sim, is_prefix
      FROM (
        SELECT user_id, username, display_name,
               GREATEST(
                 word_similarity(${normalizedQuery}, COALESCE(username::text, '')),
                 word_similarity(${normalizedQuery}, COALESCE(display_name, ''))
               ) AS sim,
               (COALESCE(username::text ILIKE ${prefixPattern}, false)
                 OR COALESCE(display_name ILIKE ${prefixPattern}, false)) AS is_prefix
        FROM users
        WHERE username IS NOT NULL OR display_name IS NOT NULL
      ) candidates
      WHERE is_prefix OR sim >= ${USER_LANE_MIN_SIMILARITY}
      ORDER BY is_prefix DESC, sim DESC
      LIMIT ${take}
    `);
    return rows.map((row) => {
      const sim = clamp01(Number(row.sim) || 0);
      // Prefix hits rank at the prefix band (0.9) like entity prefixes; pure
      // similarity hits carry their similarity — evidence-first, mirroring polls.
      const confidence = row.is_prefix ? Math.max(0.9, sim) : sim;
      const match: AutocompleteMatchDto = {
        entityId: row.user_id,
        entityType: 'user',
        name: row.display_name?.trim() || row.username || 'Crave member',
        aliases: row.username ? [row.username] : [],
        confidence: Number(confidence.toFixed(2)),
        matchType: 'user',
        username: row.username,
      };
      return { match, score: confidence * this.userLaneWeight };
    });
  }

  private calculateLexicalFirstEntityScore(params: {
    confidence: number;
    boost: number;
  }): number {
    const confidence = clamp01(params.confidence);
    const boost = Number.isFinite(params.boost) ? Math.max(0, params.boost) : 0;
    const boosted = confidence * (1 + Math.min(boost, 0.35));
    // STRUCTURAL tier invariant: popularity/affinity boosts rank WITHIN an
    // evidence band, never across one — the boosted score is clamped just below
    // the next band's floor (pre-clamp, prefix 0.9 × 1.35 = 1.215 could outrank
    // an exact 1.0, silently violating evidence-first ranking whenever an
    // operator widened a boost weight env var). Bands mirror the entity-search
    // EVIDENCE_CONFIDENCE table; cross-lane blend calibration is untouched.
    const bands = [0.35, 0.4, 0.55, 0.6, 0.9, 1.0];
    const nextBand = bands.find((b) => b > confidence + 1e-9);
    return nextBand !== undefined
      ? Math.min(boosted, nextBand - 0.001)
      : boosted;
  }

  private isStrongAttributeCandidate(params: {
    match: AutocompleteMatchDto;
    normalizedQuery: string;
  }): boolean {
    if (!this.isAttributeType(params.match.entityType)) {
      return true;
    }
    // Structural show/hide rule (replaces the dead confidence×support matrix,
    // whose rankSupport capped at 0.096 against 0.22/0.42/0.65 floors — so a user
    // typing "vegan" verbatim got NOTHING). Now: exact or prefix evidence ⇒ always
    // show (you essentially typed it); fuzzier evidence needs a query of ≥4 chars
    // so a 1-3 char fragment doesn't surface loosely-matched attributes. Demand/
    // corpus support is a RANKING signal only (calculateAttributeScore) — it never
    // decides whether an attribute appears.
    const evidence = params.match.evidenceTier;
    if (evidence === 'exact' || evidence === 'prefix') {
      return true;
    }
    return params.normalizedQuery.trim().length >= 4;
  }

  private calculateAttributeScore(params: {
    confidence: number;
    support: AttributeSupportScore;
  }): number {
    return clamp01(params.confidence) * params.support.rankSupport * 1.35;
  }

  private emptyAttributeSupport(): AttributeSupportScore {
    return {
      typedSearchSupport: 0,
      autocompleteSelectionSupport: 0,
      corpusUsefulness: 0,
      rankSupport: 0,
      corpusConnectionCount: 0,
      corpusSelectivity: 0,
    };
  }

  private async loadAttributeSupport(
    matches: AutocompleteMatchDto[],
    marketKey: string | null,
  ): Promise<Map<string, AttributeSupportScore>> {
    const attributeIds = Array.from(
      new Set(
        matches
          .filter((match) => this.isAttributeType(match.entityType))
          .map((match) => match.entityId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (!attributeIds.length) {
      return new Map();
    }

    // READER CUT (§22 item 6): attribute demand support reads the signals
    // substrate — typed-search support = 'search' acts on the attribute,
    // selection support = 'autocomplete_selection' acts. Demand is global
    // (market scoping died with the market model; the old scoped-plus-
    // backstop split collapses away). The corpus lane below is unchanged.
    const [typedRows, selectedRows, corpusRows] = await Promise.all([
      this.loadAttributeDemandSupport(attributeIds, ['search']),
      this.loadAttributeDemandSupport(attributeIds, ['autocomplete_selection']),
      this.prisma.$queryRaw<
        Array<{
          attributeId: string;
          corpusConnectionCount: number;
          totalRestaurantCount: number;
        }>
      >(Prisma.sql`
      WITH scoped_restaurants AS (
        SELECT DISTINCT r.entity_id AS restaurant_id
        FROM core_entities r
        WHERE r.type = 'restaurant'
          AND (
            ${marketKey}::text IS NULL
            OR EXISTS (
              SELECT 1
              FROM core_restaurant_locations rl
              JOIN core_markets m
                ON LOWER(m.market_key) = LOWER(${marketKey}::text)
               AND m.is_active = true
               AND m.geometry IS NOT NULL
              WHERE rl.restaurant_id = r.entity_id
                AND rl.latitude IS NOT NULL
                AND rl.longitude IS NOT NULL
                AND ST_Covers(
                  m.geometry,
                  ST_SetSRID(
                    ST_MakePoint(
                      rl.longitude::double precision,
                      rl.latitude::double precision
                    ),
                    4326
                  )
                )
            )
          )
      ),
      attribute_refs AS (
        SELECT UNNEST(r.restaurant_attributes) AS attribute_id, r.entity_id AS restaurant_id
        FROM core_entities r
        JOIN scoped_restaurants sr ON sr.restaurant_id = r.entity_id
        UNION ALL
        SELECT UNNEST(c.food_attributes) AS attribute_id, c.restaurant_id
        FROM core_restaurant_items c
        JOIN scoped_restaurants sr ON sr.restaurant_id = c.restaurant_id
      ),
      totals AS (
        SELECT COUNT(*)::int AS total_restaurant_count
        FROM scoped_restaurants
      )
      SELECT
        attribute_id AS "attributeId",
        COUNT(DISTINCT restaurant_id)::int AS "corpusConnectionCount",
        (SELECT total_restaurant_count FROM totals) AS "totalRestaurantCount"
      FROM attribute_refs
      WHERE attribute_id = ANY(ARRAY[${Prisma.join(attributeIds)}]::uuid[])
      GROUP BY attribute_id
    `),
    ]);

    const corpusById = new Map(
      corpusRows.map((row) => [
        row.attributeId,
        {
          connectionCount: Number(row.corpusConnectionCount ?? 0),
          totalRestaurantCount: Number(row.totalRestaurantCount ?? 0),
        },
      ]),
    );
    const supportById = new Map<string, AttributeSupportScore>();

    for (const attributeId of attributeIds) {
      const typedDemand = typedRows.get(attributeId) ?? 0;
      const selectedDemand = selectedRows.get(attributeId) ?? 0;
      const corpus = corpusById.get(attributeId) ?? {
        connectionCount: 0,
        totalRestaurantCount: 0,
      };
      const typedSearchSupport =
        this.normalizeAttributeDemandSupport(typedDemand);
      const autocompleteSelectionSupport =
        this.normalizeAttributeDemandSupport(selectedDemand);
      const corpusUsefulness = this.normalizeAttributeCorpusUsefulness(corpus);
      const rankSupport =
        ATTRIBUTE_TYPED_SEARCH_WEIGHT * typedSearchSupport +
        ATTRIBUTE_SELECTION_WEIGHT * autocompleteSelectionSupport +
        ATTRIBUTE_CORPUS_WEIGHT * corpusUsefulness;

      supportById.set(attributeId, {
        typedSearchSupport,
        autocompleteSelectionSupport,
        corpusUsefulness,
        rankSupport,
        corpusConnectionCount: corpus.connectionCount,
        corpusSelectivity:
          corpus.totalRestaurantCount > 0
            ? corpus.connectionCount / corpus.totalRestaurantCount
            : 0,
      });
    }

    return supportById;
  }

  private async loadAttributeDemandSupport(
    attributeIds: string[],
    kinds: SignalKind[],
  ): Promise<Map<string, number>> {
    return this.signalDemandRead.entityDemandScores({
      entityIds: attributeIds,
      kinds,
      windowDays: ATTRIBUTE_SUPPORT_WINDOW_DAYS,
    });
  }

  private normalizeAttributeDemandSupport(score: number): number {
    if (!Number.isFinite(score) || score <= 0) {
      return 0;
    }
    return clamp01(score / 4);
  }

  private normalizeAttributeCorpusUsefulness(params: {
    connectionCount: number;
    totalRestaurantCount: number;
  }): number {
    if (params.connectionCount <= 0 || params.totalRestaurantCount <= 0) {
      return 0;
    }
    const breadth = clamp01(Math.log2(1 + params.connectionCount) / 6);
    const selectivity = clamp01(
      params.connectionCount / params.totalRestaurantCount,
    );
    const selectivityPenalty = Math.max(0.12, Math.pow(1 - selectivity, 0.8));
    return breadth * selectivityPenalty;
  }

  private isAttributeType(
    entityType: EntityType | 'query' | 'poll' | 'user',
  ): entityType is EntityType {
    return (
      entityType === EntityType.food_attribute ||
      entityType === EntityType.restaurant_attribute
    );
  }

  private calculateViewAffinity(lastViewedAt: Date, viewCount: number): number {
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysSince = (Date.now() - lastViewedAt.getTime()) / msPerDay;
    const decayDays = Math.max(1, this.viewRecencyDecayDays);
    const viewRecency = Math.exp(-daysSince / decayDays);
    const cap = Math.max(1, this.viewFrequencyCap);
    const viewFrequency = Math.min(Math.log1p(viewCount) / Math.log1p(cap), 1);
    return viewRecency * 0.7 + viewFrequency * 0.3;
  }

  private resolveEntityTypes(dto: AutocompleteRequestDto): EntityType[] {
    const hasExplicitTypes =
      Boolean(dto.entityType) || Boolean(dto.entityTypes?.length);
    const requested =
      dto.entityTypes && dto.entityTypes.length > 0
        ? dto.entityTypes
        : dto.entityType
          ? [dto.entityType]
          : [EntityType.food, EntityType.restaurant];
    const filtered = requested.filter(
      (entityType) => !this.isAttributeType(entityType),
    );
    if (filtered.length > 0) {
      return filtered;
    }
    return hasExplicitTypes ? [] : [EntityType.food, EntityType.restaurant];
  }

  private resolveAttributeEntityTypes(
    dto: AutocompleteRequestDto,
  ): EntityType[] {
    if (!this.attributeLaneEnabled) {
      return [];
    }
    const hasExplicitTypes =
      Boolean(dto.entityType) || Boolean(dto.entityTypes?.length);
    const requested =
      dto.entityTypes && dto.entityTypes.length > 0
        ? dto.entityTypes
        : dto.entityType
          ? [dto.entityType]
          : [];
    if (!hasExplicitTypes) {
      return [EntityType.food_attribute, EntityType.restaurant_attribute];
    }
    return requested.filter((entityType) => this.isAttributeType(entityType));
  }

  private async resolveViaEntityResolver(
    dto: AutocompleteRequestDto,
    normalizedQuery: string,
    entityType: EntityType,
    limit: number,
    marketKey: string | null,
  ): Promise<AutocompleteMatchDto[]> {
    const resolution = await this.entityResolutionService.resolveBatch(
      [
        {
          tempId: 'autocomplete',
          normalizedName: normalizedQuery,
          originalText: dto.query,
          entityType,
          marketKey: entityType === 'restaurant' ? marketKey : null,
        },
      ],
      {
        enableFuzzyMatching: true,
        batchSize: 1,
        allowEntityCreation: false,
      },
    );

    const resolvedIds = resolution.resolutionResults
      .filter((result) => result.entityId)
      .map((result) => result.entityId!);
    const entityNameMap =
      resolvedIds.length > 0
        ? new Map(
            (
              await this.prisma.entity.findMany({
                where: { entityId: { in: resolvedIds } },
                select: { entityId: true, name: true },
              })
            ).map((entity) => [entity.entityId, entity.name]),
          )
        : new Map<string, string>();

    const matches: AutocompleteMatchDto[] = [];
    for (const result of resolution.resolutionResults) {
      if (!result.entityId || (result.confidence ?? 0) < 0.5) {
        continue;
      }
      const canonicalName =
        entityNameMap.get(result.entityId) ?? result.matchedName ?? null;
      if (!canonicalName || !canonicalName.trim().length) {
        continue;
      }
      matches.push({
        entityId: result.entityId,
        entityType: result.entityType ?? entityType,
        name: canonicalName,
        aliases: result.originalInput.aliases ?? [],
        confidence: Number(Math.round((result.confidence ?? 0) * 100) / 100),
        matchType: 'entity',
      });
      if (matches.length >= limit) {
        break;
      }
    }
    return matches;
  }

  private normalizePopularity(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }
    return Math.min(value, 50) / 50;
  }

  private resolveEnvNumber(key: string, fallback: number): number {
    const raw = process.env[key];
    if (raw === undefined) {
      return fallback;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return value;
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

  private resolveEnvString(key: string, fallback: string): string {
    const raw = process.env[key];
    if (typeof raw !== 'string') {
      return fallback;
    }
    const normalized = raw.trim();
    return normalized.length > 0 ? normalized : fallback;
  }

  private resolveEnvBoolean(key: string, fallback: boolean): boolean {
    const raw = process.env[key];
    if (typeof raw !== 'string') {
      return fallback;
    }
    const normalized = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalized)) {
      return false;
    }
    return fallback;
  }

  private buildCacheKey(
    userId: string | null,
    entityTypes: EntityType[],
    normalizedQuery: string,
    marketScopeKey: string,
    attributeLaneEnabled: boolean,
  ): string {
    const scopeKey = entityTypes.slice().sort().join(',');
    const queryToken = encodeURIComponent(normalizedQuery);
    return `${this.cacheRedisKeyPrefix}:${
      userId ?? 'anon'
    }:${scopeKey}:${marketScopeKey}:attrs-${
      attributeLaneEnabled ? 'on' : 'off'
    }:${queryToken}`;
  }

  private async resolveAutocompleteMarketScope(
    dto: AutocompleteRequestDto,
  ): Promise<{ marketKey: string | null; cacheScopeKey: string }> {
    if (!dto.bounds && !dto.userLocation) {
      return { marketKey: null, cacheScopeKey: 'global' };
    }

    try {
      const resolved = await this.marketRegistry.resolveViewportCoverage({
        bounds: dto.bounds ?? null,
        userLocation: dto.userLocation ?? null,
        mode: 'search',
        ensureLocalityMarkets: false,
      });
      const marketKey =
        typeof resolved.market?.marketKey === 'string'
          ? resolved.market.marketKey.trim().toLowerCase()
          : '';
      return {
        marketKey: marketKey || null,
        cacheScopeKey: marketKey ? `market:${marketKey}` : 'global',
      };
    } catch (error) {
      this.logger.warn('Failed to resolve autocomplete market scope', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return { marketKey: null, cacheScopeKey: 'global' };
    }
  }

  private elapsedSeconds(start: bigint): number {
    return Number(process.hrtime.bigint() - start) / 1_000_000_000;
  }

  private async measureDbDuration<T>(
    run: () => Promise<T>,
    observe: (seconds: number) => void,
  ): Promise<T> {
    const start = process.hrtime.bigint();
    try {
      return await run();
    } finally {
      observe(this.elapsedSeconds(start));
    }
  }

  private async getFromCache(cacheKey: string): Promise<{
    response: AutocompleteResponseDto | null;
    result: CacheResult;
  }> {
    if (this.cacheTtlSeconds <= 0) {
      return { response: null, result: 'skipped' };
    }

    try {
      const raw = await this.redis.get(cacheKey);
      if (!raw) {
        return { response: null, result: 'miss' };
      }
      const parsed = JSON.parse(raw) as AutocompleteResponseDto;
      if (
        !parsed ||
        !Array.isArray(parsed.matches) ||
        typeof parsed.query !== 'string' ||
        typeof parsed.normalizedQuery !== 'string'
      ) {
        await this.redis.del(cacheKey);
        return { response: null, result: 'miss' };
      }
      return { response: parsed, result: 'hit' };
    } catch (error) {
      this.logger.warn('Autocomplete cache lookup failed', {
        operation: 'autocomplete_cache_get',
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return { response: null, result: 'skipped' };
    }
  }

  private async setInCache(
    cacheKey: string,
    response: AutocompleteResponseDto,
  ): Promise<void> {
    if (this.cacheTtlSeconds <= 0) {
      return;
    }
    try {
      await this.redis.set(
        cacheKey,
        JSON.stringify(response),
        'EX',
        Math.max(1, this.cacheTtlSeconds),
      );
    } catch (error) {
      this.logger.warn('Autocomplete cache write failed', {
        operation: 'autocomplete_cache_set',
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
