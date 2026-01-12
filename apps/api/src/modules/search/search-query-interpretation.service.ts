import { Injectable, Inject } from '@nestjs/common';
import { performance } from 'perf_hooks';
import { EntityType, OnDemandReason } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { LLMService } from '../external-integrations/llm/llm.service';
import { LLMSearchQueryAnalysis } from '../external-integrations/llm/llm.types';
import { LLMUnavailableError } from '../external-integrations/llm/llm.exceptions';
import { EntityResolutionService } from '../content-processing/entity-resolver/entity-resolution.service';
import {
  EntityResolutionInput,
  EntityResolutionResult,
} from '../content-processing/entity-resolver/entity-resolution.types';
import { LoggerService } from '../../shared';
import { stripGenericTokens } from '../../shared/utils/generic-token-handling';
import {
  NaturalSearchRequestDto,
  QueryEntityDto,
  QueryEntityGroupDto,
  SearchQueryRequestDto,
  MapBoundsDto,
} from './dto/search-query.dto';
import { OnDemandRequestService } from './on-demand-request.service';
import { SearchSubredditResolverService } from './search-subreddit-resolver.service';

const METERS_PER_MILE = 1609.34;
const ON_DEMAND_MIN_VIEWPORT_WIDTH_MILES = 2;
const ON_DEMAND_VIEWPORT_TOLERANCE = 0.85;
const ON_DEMAND_VIEWPORT_MIN_WIDTH_MILES =
  ON_DEMAND_MIN_VIEWPORT_WIDTH_MILES * ON_DEMAND_VIEWPORT_TOLERANCE;
interface InterpretationResult {
  structuredRequest: SearchQueryRequestDto;
  analysis: LLMSearchQueryAnalysis;
  unresolved: Array<{
    type: EntityType;
    terms: string[];
  }>;
  analysisMetadata?: Record<string, unknown>;
  onDemandQueued?: boolean;
  onDemandEtaMs?: number;
  phaseTimings?: Record<string, number>;
}

@Injectable()
export class SearchQueryInterpretationService {
  private readonly logger: LoggerService;
  private readonly includePhaseTimings: boolean;

  constructor(
    private readonly llmService: LLMService,
    private readonly entityResolutionService: EntityResolutionService,
    private readonly onDemandRequestService: OnDemandRequestService,
    private readonly subredditResolver: SearchSubredditResolverService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchQueryInterpretationService');
    this.includePhaseTimings =
      (process.env.SEARCH_INCLUDE_PHASE_TIMINGS || '').toLowerCase() === 'true';
  }

  async interpret(
    request: NaturalSearchRequestDto,
  ): Promise<InterpretationResult> {
    const interpretationStart = performance.now();
    let analysis: LLMSearchQueryAnalysis;
    let llmMs = 0;
    const llmStart = performance.now();
    try {
      analysis = await this.llmService.analyzeSearchQuery(request.query);
    } catch (error) {
      llmMs = performance.now() - llmStart;
      const originalMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.warn('Search query interpretation failed', {
        query: request.query,
        error: {
          message: originalMessage,
          stack: error instanceof Error ? error.stack : undefined,
          name: error instanceof Error ? error.name : undefined,
        },
      });

      throw new LLMUnavailableError(
        'Search is temporarily unavailable. Please try again.',
        originalMessage,
      );
    }
    llmMs = performance.now() - llmStart;

    const cleanedAnalysis = this.stripGenericTokensFromAnalysis(analysis);
    const analysisCounts = this.getAnalysisEntityCounts(cleanedAnalysis);
    this.logger.info('Search query LLM analysis summary', {
      query: request.query,
      analysisCounts,
      sampleRestaurants: cleanedAnalysis.restaurants.slice(0, 3),
      sampleFoods: cleanedAnalysis.foods.slice(0, 3),
      sampleFoodAttributes: cleanedAnalysis.foodAttributes.slice(0, 3),
      sampleRestaurantAttributes: cleanedAnalysis.restaurantAttributes.slice(
        0,
        3,
      ),
    });

    this.logger.debug('Query interpretation foods breakdown', {
      query: request.query,
      foods: cleanedAnalysis.foods,
    });

    const uiCoverageKey = await this.resolveLocationKey(request);
    const collectionCoverageKey =
      await this.resolveCollectionCoverageKey(request);
    const resolutionInputs = this.buildResolutionInputs(
      cleanedAnalysis,
      uiCoverageKey,
    );
    let entityResolutionMs = 0;
    const resolutionStart = performance.now();
    const resolutionResults = resolutionInputs.length
      ? await this.entityResolutionService.resolveBatch(resolutionInputs, {
          enableFuzzyMatching: true,
          fuzzyMatchThreshold: 0.75,
          maxEditDistance: 3,
          batchSize: 100,
          allowEntityCreation: false,
          confidenceThresholds: {
            high: 0.85,
            medium: 0.7,
            low: 0.7,
          },
        })
      : {
          resolutionResults: [],
          tempIdToEntityIdMap: new Map<string, string>(),
          newEntitiesCreated: 0,
          performanceMetrics: {
            totalProcessed: 0,
            exactMatches: 0,
            aliasMatches: 0,
            fuzzyMatches: 0,
            newEntitiesCreated: 0,
            processingTimeMs: 0,
            averageConfidence: 0,
          },
          entityDetails: new Map<string, any>(),
        };
    entityResolutionMs = performance.now() - resolutionStart;

    const groupedEntities = this.groupResolvedEntities(
      resolutionResults.resolutionResults,
    );

    const structuredRequest = this.buildSearchRequest(request, groupedEntities);

    const unresolved = this.collectUnresolvedTerms(
      resolutionResults.resolutionResults,
    );

    const structuredEntityCounts = this.getEntityGroupCounts(
      structuredRequest.entities,
    );
    this.logger.info('Entity resolution summary for natural query', {
      query: request.query,
      resolutionInputs: resolutionInputs.length,
      resolvedCounts: structuredEntityCounts,
      unresolved,
    });

    let onDemandQueued = false;
    let onDemandEtaMs: number | undefined;
    let onDemandMs = 0;
    if (unresolved.length) {
      const onDemandStart = performance.now();
      const viewportEligible = this.isViewportEligibleForOnDemand(
        request.bounds,
      );
      const onDemandLocationKey = request.bounds ? collectionCoverageKey : null;
      const onDemandContext: Record<string, unknown> = {
        query: request.query,
      };
      if (request.bounds) {
        onDemandContext.bounds = request.bounds;
      }
      const locationBias = this.buildLocationBias(request);
      if (locationBias) {
        onDemandContext.locationBias = locationBias;
      }

      const reason: OnDemandReason = 'unresolved';
      const unresolvedRequests = unresolved.flatMap((group) =>
        group.terms.map((term) => ({
          term,
          entityType: group.type,
          reason,
          locationKey: onDemandLocationKey ?? 'global',
          metadata: { source: 'natural_query', unresolvedType: group.type },
        })),
      );

      if (viewportEligible && onDemandLocationKey) {
        const recordedRequests =
          await this.onDemandRequestService.recordRequests(
            unresolvedRequests,
            { userId: request.userId ?? null },
            onDemandContext,
          );
        onDemandQueued = recordedRequests.length > 0;
      } else if (!onDemandLocationKey) {
        const recordedRequests =
          await this.onDemandRequestService.recordRequests(
            unresolvedRequests,
            { userId: request.userId ?? null },
            onDemandContext,
          );
        onDemandQueued = recordedRequests.length > 0;
      }
      onDemandMs = performance.now() - onDemandStart;
    }

    const phaseTimings = {
      llmMs: Math.round(llmMs),
      entityResolutionMs: Math.round(entityResolutionMs),
      onDemandMs: Math.round(onDemandMs),
      interpretationMs: Math.round(performance.now() - interpretationStart),
    };
    if (this.includePhaseTimings) {
      this.logger.debug('Search interpretation timings', { phaseTimings });
    }

    return {
      structuredRequest,
      analysis: cleanedAnalysis,
      unresolved,
      analysisMetadata: cleanedAnalysis.metadata,
      onDemandQueued: onDemandQueued || undefined,
      onDemandEtaMs,
      phaseTimings,
    };
  }

  private buildResolutionInputs(
    analysis: LLMSearchQueryAnalysis,
    locationKey: string | null,
  ): EntityResolutionInput[] {
    const inputs: EntityResolutionInput[] = [];

    const normalizedLocationKey =
      typeof locationKey === 'string' ? locationKey.trim().toLowerCase() : null;
    const addEntries = (names: string[], entityType: EntityType) => {
      const seen = new Set<string>();
      for (const name of names) {
        const stripped = stripGenericTokens(name);
        const normalized = stripped.text.trim();
        if (!normalized.length || stripped.isGenericOnly) {
          continue;
        }
        const key = `${entityType}:${normalized.toLowerCase()}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        inputs.push({
          tempId: `${entityType}:${uuid()}`,
          normalizedName: normalized,
          originalText: normalized,
          entityType,
          aliases: [normalized],
          locationKey:
            entityType === 'restaurant' ? normalizedLocationKey : null,
        });
      }
    };

    addEntries(analysis.restaurants, 'restaurant');
    addEntries(analysis.foods, 'food');
    addEntries(analysis.foodAttributes, 'food_attribute');
    addEntries(analysis.restaurantAttributes, 'restaurant_attribute');

    return inputs;
  }

  private stripGenericTokensFromAnalysis(
    analysis: LLMSearchQueryAnalysis,
  ): LLMSearchQueryAnalysis {
    return {
      ...analysis,
      restaurants: this.stripGenericTokensFromTerms(analysis.restaurants),
      foods: this.stripGenericTokensFromTerms(analysis.foods),
      foodAttributes: this.stripGenericTokensFromTerms(analysis.foodAttributes),
      restaurantAttributes: this.stripGenericTokensFromTerms(
        analysis.restaurantAttributes,
      ),
    };
  }

  private stripGenericTokensFromTerms(terms: string[]): string[] {
    const result: string[] = [];
    const seen = new Set<string>();

    for (const term of terms) {
      const stripped = stripGenericTokens(term);
      const normalized = stripped.text.trim();
      if (!normalized.length || stripped.isGenericOnly) {
        continue;
      }
      const key = normalized.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(normalized);
    }

    return result;
  }

  private groupResolvedEntities(
    results: EntityResolutionResult[],
  ): QueryEntityGroupDto {
    const restaurantEntities: QueryEntityDto[] = [];
    const foodEntities: QueryEntityDto[] = [];
    const foodAttributeEntities: QueryEntityDto[] = [];
    const restaurantAttributeEntities: QueryEntityDto[] = [];

    const pushEntity = (
      collection: QueryEntityDto[],
      result: EntityResolutionResult,
    ) => {
      if (!result.entityId) {
        return;
      }

      const existing = collection.find((entry) =>
        entry.entityIds.includes(result.entityId!),
      );
      if (existing) {
        return;
      }

      collection.push({
        normalizedName: result.originalInput.normalizedName,
        entityIds: [result.entityId],
        originalText: result.originalInput.originalText,
      });
    };

    for (const result of results) {
      if (!result.entityId) {
        continue;
      }

      switch (result.originalInput.entityType) {
        case 'restaurant':
          pushEntity(restaurantEntities, result);
          break;
        case 'food':
          pushEntity(foodEntities, result);
          break;
        case 'food_attribute':
          pushEntity(foodAttributeEntities, result);
          break;
        case 'restaurant_attribute':
          pushEntity(restaurantAttributeEntities, result);
          break;
        default:
          break;
      }
    }

    return {
      restaurants: restaurantEntities.length ? restaurantEntities : undefined,
      food: foodEntities.length ? foodEntities : undefined,
      foodAttributes: foodAttributeEntities.length
        ? foodAttributeEntities
        : undefined,
      restaurantAttributes: restaurantAttributeEntities.length
        ? restaurantAttributeEntities
        : undefined,
    };
  }

  private collectUnresolvedTerms(
    results: EntityResolutionResult[],
  ): Array<{ type: EntityType; terms: string[] }> {
    const unresolvedMap = new Map<EntityType, Set<string>>();

    for (const result of results) {
      if (result.entityId) {
        continue;
      }
      const scope = result.originalInput.entityType;
      if (!unresolvedMap.has(scope)) {
        unresolvedMap.set(scope, new Set<string>());
      }
      const term = result.originalInput.originalText.trim();
      if (term.length) {
        unresolvedMap.get(scope)!.add(term);
      }
    }

    return Array.from(unresolvedMap.entries()).map(([type, terms]) => ({
      type,
      terms: Array.from(terms.values()),
    }));
  }

  private async resolveLocationKey(
    request: NaturalSearchRequestDto,
  ): Promise<string | null> {
    try {
      const fallbackLocation = this.resolveFallbackLocation(request);
      const match = await this.subredditResolver.resolvePrimary({
        bounds: request.bounds ?? null,
        fallbackLocation: fallbackLocation ?? null,
        referenceLocations: fallbackLocation ? [fallbackLocation] : undefined,
      });
      return match ? match.toLowerCase() : null;
    } catch (error) {
      this.logger.debug('Unable to resolve search location key', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return null;
    }
  }

  private async resolveCollectionCoverageKey(
    request: NaturalSearchRequestDto,
  ): Promise<string | null> {
    try {
      const fallbackLocation = this.resolveFallbackLocation(request);
      const match = await this.subredditResolver.resolvePrimaryCollectable({
        bounds: request.bounds ?? null,
        fallbackLocation: fallbackLocation ?? null,
        referenceLocations: fallbackLocation ? [fallbackLocation] : undefined,
      });
      return match ? match.toLowerCase() : null;
    } catch (error) {
      this.logger.debug('Unable to resolve search collection coverage key', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return null;
    }
  }

  private resolveFallbackLocation(
    request: NaturalSearchRequestDto,
  ): { latitude: number; longitude: number } | undefined {
    if (
      typeof request.userLocation?.lat === 'number' &&
      typeof request.userLocation?.lng === 'number'
    ) {
      return {
        latitude: request.userLocation.lat,
        longitude: request.userLocation.lng,
      };
    }

    const bounds = request.bounds;
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

  private buildLocationBias(request: NaturalSearchRequestDto):
    | {
        lat: number;
        lng: number;
        radiusMeters?: number;
      }
    | undefined {
    const bounds = request.bounds;
    const center = this.resolveBoundsCenter(bounds);
    if (center) {
      const widthMiles = this.calculateBoundsWidthMiles(bounds);
      const heightMiles = this.calculateBoundsHeightMiles(bounds);
      const maxMiles = Math.max(widthMiles ?? 0, heightMiles ?? 0);
      const radiusMeters =
        Number.isFinite(maxMiles) && maxMiles > 0
          ? (maxMiles / 2) * METERS_PER_MILE
          : undefined;
      return {
        lat: center.lat,
        lng: center.lng,
        radiusMeters,
      };
    }

    const fallbackLocation = this.resolveFallbackLocation(request);
    if (fallbackLocation) {
      return {
        lat: fallbackLocation.latitude,
        lng: fallbackLocation.longitude,
      };
    }

    return undefined;
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

  private calculateBoundsHeightMiles(bounds?: MapBoundsDto): number | null {
    if (!bounds) {
      return null;
    }
    const center = this.resolveBoundsCenter(bounds);
    if (!center) {
      return null;
    }
    const { northEast, southWest } = bounds;
    return this.haversineDistanceMiles(
      southWest.lat,
      center.lng,
      northEast.lat,
      center.lng,
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

  private buildSearchRequest(
    request: NaturalSearchRequestDto,
    entities: QueryEntityGroupDto,
  ): SearchQueryRequestDto {
    const resolvedEntities: QueryEntityGroupDto = {
      restaurants: entities.restaurants,
      food: entities.food,
      foodAttributes: entities.foodAttributes,
      restaurantAttributes: entities.restaurantAttributes,
    };

    return {
      entities: resolvedEntities,
      bounds: request.bounds,
      userLocation: request.userLocation,
      openNow: request.openNow,
      pagination: request.pagination,
      includeSqlPreview: request.includeSqlPreview,
      priceLevels: request.priceLevels,
      minimumVotes: request.minimumVotes,
      sourceQuery: request.query,
    };
  }

  private getAnalysisEntityCounts(
    analysis: LLMSearchQueryAnalysis,
  ): Record<string, number> {
    return {
      restaurants: analysis.restaurants.length,
      foods: analysis.foods.length,
      foodAttributes: analysis.foodAttributes.length,
      restaurantAttributes: analysis.restaurantAttributes.length,
    };
  }

  private getEntityGroupCounts(
    group: QueryEntityGroupDto,
  ): Record<string, number> {
    return {
      restaurants: group.restaurants?.length ?? 0,
      food: group.food?.length ?? 0,
      foodAttributes: group.foodAttributes?.length ?? 0,
      restaurantAttributes: group.restaurantAttributes?.length ?? 0,
    };
  }
}
