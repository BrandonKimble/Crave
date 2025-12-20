import { Injectable } from '@nestjs/common';
import { EntityType, OnDemandReason } from '@prisma/client';
import { LoggerService, TextSanitizerService } from '../../shared';
import { EntityResolutionService } from '../content-processing/entity-resolver/entity-resolution.service';
import {
  AutocompleteRequestDto,
  AutocompleteResponseDto,
  AutocompleteMatchDto,
} from './dto/autocomplete.dto';
import { OnDemandRequestService } from '../search/on-demand-request.service';
import { EntitySearchService } from './entity-search.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SearchQuerySuggestionService,
  type QuerySuggestion,
} from '../search/search-query-suggestion.service';
import type { User } from '@prisma/client';
import { SearchPopularityService } from '../search/search-popularity.service';
import { SearchSubredditResolverService } from '../search/search-subreddit-resolver.service';
import { MapBoundsDto } from '../search/dto/search-query.dto';

const DEFAULT_LIMIT = 8;
const MIN_QUERY_LENGTH = 2;
const ON_DEMAND_MIN_VIEWPORT_WIDTH_MILES = 2;
const ON_DEMAND_VIEWPORT_TOLERANCE = 0.85;
const ON_DEMAND_VIEWPORT_MIN_WIDTH_MILES =
  ON_DEMAND_MIN_VIEWPORT_WIDTH_MILES * ON_DEMAND_VIEWPORT_TOLERANCE;

@Injectable()
export class AutocompleteService {
  private readonly logger: LoggerService;
  private readonly cacheTtlMs = 4000;
  private readonly sessionCache = new Map<string, CacheEntry>();
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

  constructor(
    loggerService: LoggerService,
    private readonly entityResolutionService: EntityResolutionService,
    private readonly onDemandRequestService: OnDemandRequestService,
    private readonly textSanitizer: TextSanitizerService,
    private readonly entitySearchService: EntitySearchService,
    private readonly prisma: PrismaService,
    private readonly searchQuerySuggestionService: SearchQuerySuggestionService,
    private readonly searchPopularityService: SearchPopularityService,
    private readonly subredditResolver: SearchSubredditResolverService,
  ) {
    this.logger = loggerService.setContext('AutocompleteService');
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
  }

  async autocompleteEntities(
    dto: AutocompleteRequestDto,
    user?: User,
  ): Promise<AutocompleteResponseDto> {
    const normalizedQuery = this.textSanitizer.sanitizeOrThrow(dto.query, {
      maxLength: 140,
    });
    const limit = dto.limit ?? DEFAULT_LIMIT;
    const entityTypes = this.resolveEntityTypes(dto);
    const primaryEntityType = entityTypes[0] ?? EntityType.food;
    const locationKey = await this.resolveLocationKey(dto);

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
      locationKey,
    );
    const cached = this.getFromCache(cacheKey, normalizedQuery);
    if (cached) {
      return cached;
    }

    const searchResults = await this.entitySearchService.searchEntities(
      normalizedQuery,
      entityTypes,
      Math.min(limit * entityTypes.length, limit * 3),
      { locationKey },
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

    if (matches.length === 0) {
      matches = await this.resolveViaEntityResolver(
        dto,
        normalizedQuery,
        primaryEntityType,
        limit,
        locationKey,
      );
    }

    const hadEntityMatches = matches.length > 0;

    const injected = user
      ? await this.fetchInjectedUserMatches(normalizedQuery, entityTypes, user)
      : { favorites: [], viewed: [] };

    const candidateMatches = this.mergeEntityMatches(matches, [
      ...injected.favorites,
      ...injected.viewed,
    ]);

    const querySuggestions =
      await this.searchQuerySuggestionService.getSuggestions(
        normalizedQuery,
        Math.min(10, Math.max(this.querySuggestionMax * 2, 6)),
        user?.userId,
      );

    const ranked = await this.rankCandidates({
      entityMatches: candidateMatches,
      querySuggestions,
      user,
      limit,
    });

    let onDemandQueued = false;
    if (dto.enableOnDemand && !hadEntityMatches) {
      const viewportEligible = this.isViewportEligibleForOnDemand(dto.bounds);
      const onDemandLocationKey = dto.bounds ? locationKey : null;
      const requests = [
        {
          term: normalizedQuery,
          entityType: primaryEntityType,
          reason: OnDemandReason.unresolved,
          locationKey: onDemandLocationKey ?? 'global',
          metadata: { source: 'autocomplete' },
        },
      ];

      if (viewportEligible && onDemandLocationKey) {
        await this.onDemandRequestService.recordRequests(requests, {
          source: 'autocomplete',
        });
        onDemandQueued = true;
      } else if (!onDemandLocationKey) {
        await this.onDemandRequestService.recordRequests(requests, {
          source: 'autocomplete',
        });
        onDemandQueued = true;
      }

      if (onDemandQueued) {
        this.logger.debug('Queued on-demand request from autocomplete', {
          normalizedQuery,
          entityType: primaryEntityType,
          locationKey: onDemandLocationKey ?? 'global',
        });
      }
    }

    const response: AutocompleteResponseDto = {
      matches: ranked.matches,
      query: dto.query,
      normalizedQuery,
      onDemandQueued,
      onDemandReason: onDemandQueued ? OnDemandReason.unresolved : undefined,
      querySuggestions: ranked.querySuggestionTexts,
    };

    this.sessionCache.set(cacheKey, {
      normalizedQuery,
      response,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
    if (this.sessionCache.size > 500) {
      const iterator = this.sessionCache.keys().next();
      if (!iterator.done && iterator.value) {
        this.sessionCache.delete(iterator.value);
      }
    }

    return response;
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
    const queryMatchIds = new Set<string>();
    for (const match of scored) {
      if (match.matchType === 'query') {
        queryMatchIds.add(match.entityId);
      }
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

  private async resolveLocationKey(
    dto: AutocompleteRequestDto,
  ): Promise<string | null> {
    try {
      const fallbackLocation = this.resolveFallbackLocation(dto);
      const match = await this.subredditResolver.resolvePrimary({
        bounds: dto.bounds ?? null,
        fallbackLocation: fallbackLocation ?? null,
        referenceLocations: fallbackLocation ? [fallbackLocation] : undefined,
      });

      return match ? match.toLowerCase() : null;
    } catch (error) {
      this.logger.debug('Unable to resolve autocomplete location key', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return null;
    }
  }

  private resolveFallbackLocation(
    dto: AutocompleteRequestDto,
  ): { latitude: number; longitude: number } | undefined {
    if (
      typeof dto.userLocation?.lat === 'number' &&
      typeof dto.userLocation?.lng === 'number'
    ) {
      return {
        latitude: dto.userLocation.lat,
        longitude: dto.userLocation.lng,
      };
    }

    const bounds = dto.bounds;
    if (!bounds) {
      return undefined;
    }

    const { northEast, southWest } = bounds;
    if (
      typeof northEast?.lat !== 'number' ||
      typeof northEast?.lng !== 'number' ||
      typeof southWest?.lat !== 'number' ||
      typeof southWest?.lng !== 'number'
    ) {
      return undefined;
    }

    return {
      latitude: (northEast.lat + southWest.lat) / 2,
      longitude: (northEast.lng + southWest.lng) / 2,
    };
  }

  private isViewportEligibleForOnDemand(bounds?: MapBoundsDto): boolean {
    const widthMiles = this.calculateBoundsWidthMiles(bounds);
    if (!widthMiles) {
      return false;
    }
    return widthMiles >= ON_DEMAND_VIEWPORT_MIN_WIDTH_MILES;
  }

  private resolveBoundsCenter(
    bounds?: MapBoundsDto,
  ): { lat: number; lng: number } | null {
    if (!bounds) {
      return null;
    }
    const { northEast, southWest } = bounds;
    if (
      typeof northEast?.lat !== 'number' ||
      typeof northEast?.lng !== 'number' ||
      typeof southWest?.lat !== 'number' ||
      typeof southWest?.lng !== 'number'
    ) {
      return null;
    }

    return {
      lat: (northEast.lat + southWest.lat) / 2,
      lng: (northEast.lng + southWest.lng) / 2,
    };
  }

  private calculateBoundsWidthMiles(bounds?: MapBoundsDto): number | null {
    if (!bounds) {
      return null;
    }
    const center = this.resolveBoundsCenter(bounds);
    if (!center) {
      return null;
    }
    const { northEast, southWest } = bounds;
    return this.haversineDistanceMiles(
      center.lat,
      southWest.lng,
      center.lat,
      northEast.lng,
    );
  }

  private haversineDistanceMiles(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const earthRadiusMiles = 3958.8;
    return earthRadiusMiles * c;
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

  private async applyPopularityRanking(
    matches: AutocompleteMatchDto[],
    user?: User,
  ): Promise<AutocompleteMatchDto[]> {
    if (!matches.length) {
      return matches;
    }

    const uniqueIds = Array.from(
      new Set(matches.map((match) => match.entityId)),
    );
    const [globalScores, affinityScores, favorites] = await Promise.all([
      this.searchPopularityService.getEntityPopularityScores(uniqueIds),
      user?.userId
        ? this.searchPopularityService.getUserEntityAffinity(
            user.userId,
            uniqueIds,
          )
        : Promise.resolve(new Map<string, number>()),
      user?.userId
        ? this.prisma.userFavorite.findMany({
            where: { userId: user.userId, entityId: { in: uniqueIds } },
            select: { entityId: true },
          })
        : Promise.resolve([] as { entityId: string }[]),
    ]);

    const favoriteSet = new Set(favorites.map((fav) => fav.entityId));

    return matches
      .map((match) => {
        const popularity = globalScores.get(match.entityId) ?? 0;
        const affinity = affinityScores.get(match.entityId) ?? 0;
        const favoriteBoost = favoriteSet.has(match.entityId) ? 0.05 : 0;
        const score =
          match.confidence * 0.5 +
          this.normalizePopularity(popularity) * 0.35 +
          this.normalizePopularity(affinity) * 0.1 +
          favoriteBoost;
        return { match, score };
      })
      .sort((a, b) => b.score - a.score)
      .map(({ match }) => match);
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

  private buildCacheKey(
    userId: string | null,
    entityTypes: EntityType[],
    normalizedQuery: string,
    locationKey: string | null,
  ): string {
    const scopeKey = entityTypes.slice().sort().join(',');
    return `${userId ?? 'anon'}|${scopeKey}|${normalizedQuery}|${
      locationKey ?? 'global'
    }`;
  }

  private getFromCache(
    cacheKey: string,
    normalizedQuery: string,
  ): AutocompleteResponseDto | null {
    const entry = this.sessionCache.get(cacheKey);
    if (!entry) {
      return null;
    }
    if (entry.expiresAt < Date.now()) {
      this.sessionCache.delete(cacheKey);
      return null;
    }

    if (entry.normalizedQuery === normalizedQuery) {
      return entry.response;
    }

    if (
      normalizedQuery.length > entry.normalizedQuery.length &&
      normalizedQuery.startsWith(entry.normalizedQuery)
    ) {
      const filteredMatches = entry.response.matches.filter((match) =>
        match.name.toLowerCase().includes(normalizedQuery),
      );
      const filteredSuggestions =
        entry.response.querySuggestions?.filter((text) =>
          text.toLowerCase().startsWith(normalizedQuery),
        ) ?? [];
      if (filteredMatches.length || filteredSuggestions.length) {
        return {
          ...entry.response,
          matches: filteredMatches,
          querySuggestions: filteredSuggestions,
        };
      }
    }

    return null;
  }
}

interface CacheEntry {
  normalizedQuery: string;
  response: AutocompleteResponseDto;
  expiresAt: number;
}
