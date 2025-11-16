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
import { SearchQuerySuggestionService } from '../search/search-query-suggestion.service';
import type { User } from '@prisma/client';
import { SearchPopularityService } from '../search/search-popularity.service';

const DEFAULT_LIMIT = 8;
const MIN_QUERY_LENGTH = 2;

@Injectable()
export class AutocompleteService {
  private readonly logger: LoggerService;
  private readonly cacheTtlMs = 4000;
  private readonly sessionCache = new Map<string, CacheEntry>();

  constructor(
    loggerService: LoggerService,
    private readonly entityResolutionService: EntityResolutionService,
    private readonly onDemandRequestService: OnDemandRequestService,
    private readonly textSanitizer: TextSanitizerService,
    private readonly entitySearchService: EntitySearchService,
    private readonly prisma: PrismaService,
    private readonly searchQuerySuggestionService: SearchQuerySuggestionService,
    private readonly searchPopularityService: SearchPopularityService,
  ) {
    this.logger = loggerService.setContext('AutocompleteService');
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
    const cached = this.getFromCache(cacheKey, normalizedQuery);
    if (cached) {
      return cached;
    }

    const searchResults = await this.entitySearchService.searchEntities(
      normalizedQuery,
      entityTypes,
      Math.min(limit * entityTypes.length, limit * 3),
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
      );
    }

    const hadEntityMatches = matches.length > 0;

    if (matches.length) {
      matches = await this.applyPopularityRanking(matches, user);
    }

    const suggestionTexts =
      (await this.searchQuerySuggestionService.getSuggestions(
        normalizedQuery,
        Math.max(3, limit - matches.length),
        user?.userId,
      )) ?? [];

    const existingNames = new Set(
      matches.map((match) => match.name.toLowerCase()),
    );
    const querySuggestionMatches: AutocompleteMatchDto[] = [];
    for (const suggestion of suggestionTexts) {
      const trimmed = suggestion.trim();
      if (!trimmed) {
        continue;
      }
      if (existingNames.has(trimmed.toLowerCase())) {
        continue;
      }
      querySuggestionMatches.push({
        entityId: `query:${trimmed.toLowerCase()}`,
        entityType: 'query',
        name: trimmed,
        aliases: [],
        confidence: 1,
        matchType: 'query',
      });
    }

    const limitedMatches = [...matches, ...querySuggestionMatches].slice(
      0,
      limit,
    );

    let onDemandQueued = false;
    if (dto.enableOnDemand && !hadEntityMatches) {
      await this.onDemandRequestService.recordRequests(
        [
          {
            term: normalizedQuery,
            entityType: primaryEntityType,
            reason: OnDemandReason.unresolved,
            metadata: { source: 'autocomplete' },
          },
        ],
        { source: 'autocomplete' },
      );
      onDemandQueued = true;
      this.logger.debug('Queued on-demand request from autocomplete', {
        normalizedQuery,
        entityType: primaryEntityType,
      });
    }

    const response: AutocompleteResponseDto = {
      matches: limitedMatches,
      query: dto.query,
      normalizedQuery,
      onDemandQueued,
      onDemandReason: onDemandQueued ? OnDemandReason.unresolved : undefined,
      querySuggestions: suggestionTexts,
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
  ): Promise<AutocompleteMatchDto[]> {
    const resolution = await this.entityResolutionService.resolveBatch(
      [
        {
          tempId: 'autocomplete',
          normalizedName: normalizedQuery,
          originalText: dto.query,
          entityType,
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

  private buildCacheKey(
    userId: string | null,
    entityTypes: EntityType[],
    normalizedQuery: string,
  ): string {
    const scopeKey = entityTypes.slice().sort().join(',');
    return `${userId ?? 'anon'}|${scopeKey}|${normalizedQuery}`;
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
