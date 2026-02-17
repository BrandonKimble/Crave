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

const DEFAULT_LIMIT = 8;
const MIN_QUERY_LENGTH = 1;
const REQUEST_DURATION_BUCKETS = [0.01, 0.025, 0.05, 0.1, 0.2, 0.4, 0.8, 1.5];
const REQUEST_DB_DURATION_BUCKETS = [
  0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.4, 0.8,
];
type CacheResult = 'hit' | 'miss' | 'skipped';

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
      'autocomplete:v1',
    );
    this.weightConfidence = this.resolveEnvNumber(
      'AUTOCOMPLETE_WEIGHT_TEXT_CONFIDENCE',
      0.5,
    );
    this.weightGlobalPopularity = this.resolveEnvNumber(
      'AUTOCOMPLETE_WEIGHT_GLOBAL_POPULARITY',
      0.35,
    );
    this.weightUserAffinity = this.resolveEnvNumber(
      'AUTOCOMPLETE_WEIGHT_USER_AFFINITY',
      0.1,
    );
    this.favoriteBoost = this.resolveEnvNumber(
      'AUTOCOMPLETE_BOOST_FAVORITE',
      0.05,
    );
    this.viewAffinityWeight = this.resolveEnvNumber(
      'AUTOCOMPLETE_WEIGHT_VIEW_AFFINITY',
      0.08,
    );
    this.viewRecencyDecayDays = this.resolveEnvNumber(
      'AUTOCOMPLETE_VIEW_RECENCY_DECAY_DAYS',
      30,
    );
    this.viewFrequencyCap = this.resolveEnvNumber(
      'AUTOCOMPLETE_VIEW_FREQUENCY_CAP',
      10,
    );
    this.querySuggestionMax = this.resolveEnvInt(
      'AUTOCOMPLETE_QUERY_SUGGESTION_MAX',
      3,
    );
    this.querySuggestionPersonalBoost = this.resolveEnvNumber(
      'AUTOCOMPLETE_QUERY_SUGGESTION_PERSONAL_BOOST',
      0.05,
    );
    this.querySuggestionMinGlobalCount = this.resolveEnvInt(
      'AUTOCOMPLETE_QUERY_SUGGESTION_MIN_GLOBAL_COUNT',
      3,
    );
    this.querySuggestionMinUserCount = this.resolveEnvInt(
      'AUTOCOMPLETE_QUERY_SUGGESTION_MIN_USER_COUNT',
      1,
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
      const primaryEntityType = entityTypes[0] ?? EntityType.food;
      // Contract: autocomplete is intentionally global/unscoped.
      const locationKey: string | null = null;

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
        entityTypes,
        normalizedQuery,
      );
      const cacheLookup = await this.getFromCache(cacheKey);
      cacheResult = cacheLookup.result;
      this.cacheLookupsCounter.inc({ result: cacheLookup.result });
      if (cacheLookup.response) {
        return cacheLookup.response;
      }

      const injectedPromise = user
        ? this.measureDbDuration(
            () =>
              this.fetchInjectedUserMatches(normalizedQuery, entityTypes, user),
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

      const searchResults = await this.measureDbDuration(
        () =>
          this.entitySearchService.searchEntities(
            normalizedQuery,
            entityTypes,
            Math.min(limit * entityTypes.length, limit * 3),
            { locationKey },
          ),
        (seconds) => {
          totalDbDurationSeconds += seconds;
        },
      );

      let matches: AutocompleteMatchDto[] = searchResults
        .slice(0, limit)
        .map((result) => ({
          entityId: result.entityId,
          entityType: result.type,
          name: result.name,
          confidence: Number(result.similarity.toFixed(2)),
          aliases: [],
          matchType: 'entity',
        }));

      if (matches.length === 0 && normalizedQuery.length >= 3) {
        matches = await this.measureDbDuration(
          () =>
            this.resolveViaEntityResolver(
              dto,
              normalizedQuery,
              primaryEntityType,
              limit,
              locationKey,
            ),
          (seconds) => {
            totalDbDurationSeconds += seconds;
          },
        );
      }

      const injected = await injectedPromise;

      const candidateMatches = this.mergeEntityMatches(matches, [
        ...injected.favorites,
        ...injected.viewed,
      ]);

      const querySuggestions = await querySuggestionPromise;

      const ranked = await this.measureDbDuration(
        () =>
          this.rankCandidates({
            entityMatches: candidateMatches,
            querySuggestions,
            user,
            limit,
          }),
        (seconds) => {
          totalDbDurationSeconds += seconds;
        },
      );

      const matchesWithCounts = await this.measureDbDuration(
        () => this.attachLocationCounts(ranked.matches),
        (seconds) => {
          totalDbDurationSeconds += seconds;
        },
      );
      const matchesWithStatus = await this.measureDbDuration(
        () => this.attachStatusPreviews(matchesWithCounts),
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

  private async attachLocationCounts(
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

    const rows = await this.prisma.$queryRaw<
      Array<{ restaurant_id: string; location_count: number }>
    >(Prisma.sql`
      SELECT
        restaurant_id,
        COUNT(*)::int AS location_count
      FROM core_restaurant_locations
      WHERE restaurant_id = ANY(ARRAY[${Prisma.join(restaurantIds)}]::uuid[])
        AND google_place_id IS NOT NULL
        AND address IS NOT NULL
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
      GROUP BY restaurant_id
    `);

    const counts = new Map(
      rows.map((row) => [row.restaurant_id, Number(row.location_count)]),
    );

    return matches.map((match) => {
      if (match.entityType !== EntityType.restaurant) {
        return match;
      }
      const locationCount = counts.get(match.entityId) ?? 0;
      return { ...match, locationCount };
    });
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
    const viewedTask = includeRestaurants
      ? this.prisma.restaurantView.findMany({
          where: {
            userId: user.userId,
            restaurant: {
              is: {
                name: { startsWith: normalizedQuery, mode: 'insensitive' },
              },
            },
          },
          select: {
            restaurantId: true,
            restaurant: { select: { name: true, aliases: true } },
          },
          orderBy: { lastViewedAt: 'desc' },
          take: 20,
        })
      : Promise.resolve(
          [] as Array<{
            restaurantId: string;
            restaurant: { name: string; aliases: string[] };
          }>,
        );
    tasks.push(viewedTask);

    const [favoriteRows, viewedRows] = (await Promise.all(tasks)) as [
      Array<{
        entityId: string;
        entityType: EntityType;
        entity: { name: string; aliases: string[] };
      }>,
      Array<{
        restaurantId: string;
        restaurant: { name: string; aliases: string[] };
      }>,
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
      name: row.restaurant.name,
      confidence: 0.65,
      aliases: row.restaurant.aliases ?? [],
      matchType: 'entity',
      badges: { viewed: true },
    }));

    return { favorites, viewed };
  }

  private async rankCandidates(params: {
    entityMatches: AutocompleteMatchDto[];
    querySuggestions: QuerySuggestion[];
    user?: User;
    limit: number;
  }): Promise<{
    matches: AutocompleteMatchDto[];
    querySuggestionTexts: string[];
  }> {
    const { entityMatches, querySuggestions, user, limit } = params;

    const entityIds = Array.from(
      new Set(entityMatches.map((match) => match.entityId)),
    );

    const restaurantIds = entityMatches
      .filter((match) => match.entityType === EntityType.restaurant)
      .map((match) => match.entityId);

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
        ? this.prisma.restaurantView.findMany({
            where: {
              userId: user.userId,
              restaurantId: { in: restaurantIds },
            },
            select: { restaurantId: true, lastViewedAt: true, viewCount: true },
          })
        : Promise.resolve(
            [] as Array<{
              restaurantId: string;
              lastViewedAt: Date;
              viewCount: number;
            }>,
          ),
    ]);

    const favoriteSet = new Set(favorites.map((fav) => fav.entityId));
    const viewByRestaurantId = new Map(
      views.map((row) => [
        row.restaurantId,
        { lastViewedAt: row.lastViewedAt, viewCount: row.viewCount },
      ]),
    );

    const scoredEntities = entityMatches.map((match) => {
      const popularity = globalScores.get(match.entityId) ?? 0;
      const affinity = affinityScores.get(match.entityId) ?? 0;
      const isFavorite = favoriteSet.has(match.entityId);
      const view = viewByRestaurantId.get(match.entityId) ?? null;
      const isViewed = Boolean(view);
      const viewAffinity = view
        ? this.calculateViewAffinity(view.lastViewedAt, view.viewCount)
        : 0;
      const score =
        match.confidence * this.weightConfidence +
        this.normalizePopularity(popularity) * this.weightGlobalPopularity +
        this.normalizePopularity(affinity) * this.weightUserAffinity +
        (isFavorite ? this.favoriteBoost : 0) +
        (isViewed ? this.viewAffinityWeight * viewAffinity : 0);

      return {
        match: {
          ...match,
          badges: {
            ...match.badges,
            favorite: isFavorite || match.badges?.favorite,
            viewed: isViewed || match.badges?.viewed,
          },
        },
        score,
      };
    });

    const existingNames = new Set(
      scoredEntities.map(({ match }) => match.name.toLowerCase()),
    );

    const queryCandidates = querySuggestions
      .filter((suggestion) => {
        const text = suggestion.text.trim();
        if (!text) return false;
        if (existingNames.has(text.toLowerCase())) return false;
        if (suggestion.userCount >= this.querySuggestionMinUserCount)
          return true;
        return suggestion.globalCount >= this.querySuggestionMinGlobalCount;
      })
      .slice(0, Math.max(1, this.querySuggestionMax))
      .map((suggestion) => {
        const score =
          this.weightConfidence +
          this.normalizePopularity(suggestion.globalCount) *
            this.weightGlobalPopularity +
          this.normalizePopularity(suggestion.userCount) *
            this.weightUserAffinity +
          (suggestion.source === 'personal'
            ? this.querySuggestionPersonalBoost
            : 0);

        const text = suggestion.text.trim();
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

        return { match, score };
      });

    const scored = [...scoredEntities, ...queryCandidates]
      .sort((a, b) => b.score - a.score)
      .map(({ match }) => match);

    const finalMatches: AutocompleteMatchDto[] = [];
    for (const match of scored) {
      finalMatches.push(match);
      if (finalMatches.length >= limit) break;
    }

    const querySuggestionTexts = queryCandidates.map(
      (candidate) => candidate.match.name,
    );

    return { matches: finalMatches, querySuggestionTexts };
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
    if (dto.entityTypes && dto.entityTypes.length > 0) {
      return dto.entityTypes;
    }
    if (dto.entityType) {
      return [dto.entityType];
    }
    return [EntityType.food, EntityType.restaurant];
  }

  private async resolveViaEntityResolver(
    dto: AutocompleteRequestDto,
    normalizedQuery: string,
    entityType: EntityType,
    limit: number,
    locationKey: string | null,
  ): Promise<AutocompleteMatchDto[]> {
    const resolution = await this.entityResolutionService.resolveBatch(
      [
        {
          tempId: 'autocomplete',
          normalizedName: normalizedQuery,
          originalText: dto.query,
          entityType,
          locationKey: entityType === 'restaurant' ? locationKey : null,
        },
      ],
      {
        enableFuzzyMatching: true,
        fuzzyMatchThreshold: 0.6,
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

  private buildCacheKey(
    userId: string | null,
    entityTypes: EntityType[],
    normalizedQuery: string,
  ): string {
    const scopeKey = entityTypes.slice().sort().join(',');
    const queryToken = encodeURIComponent(normalizedQuery);
    return `${this.cacheRedisKeyPrefix}:${userId ?? 'anon'}:${scopeKey}:global:${queryToken}`;
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
