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
import { EntityTextSearchService } from '../entity-text-search/entity-text-search.service';
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
import { MarketRegistryService } from '../markets/market-registry.service';

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

type SearchInterpretationMarketContext = {
  marketKey: string | null;
  displayMarketName: string | null;
  marketResolutionStatus: 'resolved' | 'multi_market' | 'no_market' | 'error';
  candidateLocalityName: string | null;
  candidateBoundaryProvider: string | null;
  candidateBoundaryId: string | null;
  candidateBoundaryType: string | null;
  attributionMarketKeys: string[];
  collectableMarketKeys: string[];
};

// P1.4 4.D: confident-link thresholds for hybrid-recall linking. No LLM on this
// query-time path, so linking is conservative — a strong LEXICAL signal is
// required (dense recall improves ordering but never drives a link on its own,
// avoiding semantic-neighbour mislinks like "ramen" → "pho"). A miss simply
// stays unresolved and flows to on-demand collection, which is far cheaper than
// a wrong link (wrong search results).
const HYBRID_LINK_SIMILARITY_THRESHOLD = 0.82;
const HYBRID_LINK_SHORTLIST_K = 5;
const HYBRID_LINK_CONCURRENCY = 8;

@Injectable()
export class SearchQueryInterpretationService {
  private readonly logger: LoggerService;
  private readonly includePhaseTimings: boolean;
  private readonly hybridLinkingEnabled: boolean;

  constructor(
    private readonly llmService: LLMService,
    private readonly entityResolutionService: EntityResolutionService,
    private readonly entityTextSearch: EntityTextSearchService,
    private readonly onDemandRequestService: OnDemandRequestService,
    private readonly marketRegistry: MarketRegistryService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchQueryInterpretationService');
    this.includePhaseTimings =
      (process.env.SEARCH_INCLUDE_PHASE_TIMINGS || '').toLowerCase() === 'true';
    // Link extracted query terms via the shared recall core instead of the
    // legacy resolveBatch (Sørensen-Dice). Default off; flip after A/B.
    this.hybridLinkingEnabled =
      (process.env.SEARCH_ENABLE_HYBRID_LINKING || '').toLowerCase() === 'true';
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

    const resolvedMarket = await this.resolveSearchMarketContext(request);
    const resolutionInputs = this.buildResolutionInputs(
      cleanedAnalysis,
      resolvedMarket.marketKey,
    );
    let entityResolutionMs = 0;
    const resolutionStart = performance.now();
    const resolutionResultList: EntityResolutionResult[] =
      !resolutionInputs.length
        ? []
        : this.hybridLinkingEnabled
          ? await this.linkViaHybridRecall(resolutionInputs)
          : (
              await this.entityResolutionService.resolveBatch(
                resolutionInputs,
                {
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
                },
              )
            ).resolutionResults;
    entityResolutionMs = performance.now() - resolutionStart;

    const groupedEntities = this.groupResolvedEntities(resolutionResultList);

    const structuredRequest = this.buildSearchRequest(request, groupedEntities);

    const unresolved = this.collectUnresolvedTerms(
      resolutionResultList,
      request,
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
      const onDemandMarketKey = resolvedMarket.marketKey
        ? resolvedMarket.marketKey.trim().toLowerCase()
        : '';
      const collectableMarketKeys = viewportEligible
        ? resolvedMarket.collectableMarketKeys
        : [];
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
      const unresolvedRequests = onDemandMarketKey
        ? unresolved.flatMap((group) =>
            group.terms.map((term) => ({
              term,
              entityType: group.type,
              reason,
              marketKey: onDemandMarketKey,
              collectableMarketKeys,
              metadata: { source: 'natural_query', unresolvedType: group.type },
            })),
          )
        : [];

      if (unresolvedRequests.length > 0) {
        const recordedRequests =
          await this.onDemandRequestService.recordRequests(
            unresolvedRequests,
            { userId: request.userId ?? null },
            onDemandContext,
          );
        onDemandQueued =
          viewportEligible &&
          collectableMarketKeys.length > 0 &&
          recordedRequests.length > 0;
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
    marketKey: string | null,
  ): EntityResolutionInput[] {
    const inputs: EntityResolutionInput[] = [];

    const normalizedMarketKey =
      typeof marketKey === 'string' ? marketKey.trim().toLowerCase() : null;
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
          marketKey: entityType === 'restaurant' ? normalizedMarketKey : null,
        });
      }
    };

    addEntries(analysis.restaurants, 'restaurant');
    addEntries(analysis.foods, 'food');
    addEntries(analysis.foodAttributes, 'food_attribute');
    addEntries(analysis.restaurantAttributes, 'restaurant_attribute');

    return inputs;
  }

  /**
   * P1.4 4.D: link extracted query terms to existing entities via the shared
   * recall core (the same lexical+dense retrieval autocomplete and ingestion
   * use), replacing the legacy resolveBatch Sørensen-Dice path. This kills the
   * per-service scorer divergence (search used pg_trgm while resolution used
   * Sørensen-Dice on the same strings). No LLM here (query-time), so the link
   * decision is a conservative lexical rule; unconfident terms stay unresolved
   * and flow to on-demand collection.
   */
  private async linkViaHybridRecall(
    inputs: EntityResolutionInput[],
  ): Promise<EntityResolutionResult[]> {
    return this.mapLimit(
      inputs,
      HYBRID_LINK_CONCURRENCY,
      async (input): Promise<EntityResolutionResult> => {
        const term = input.normalizedName?.trim() ?? '';
        const unmatched: EntityResolutionResult = {
          tempId: input.tempId,
          entityId: null,
          confidence: 0,
          resolutionTier: 'unmatched',
          originalInput: input,
        };
        if (!term) return unmatched;

        const candidates = await this.entityTextSearch.retrieveCandidates(
          term,
          [input.entityType],
          HYBRID_LINK_SHORTLIST_K,
          {
            marketKey: input.marketKey,
            // Dense improves ordering; the lexical rule gates the link, so dense
            // only needs to run when lexical under-recalls. Keeps query-time
            // embedding cost off the common case (up to 100 terms per query).
            denseMode: 'fallback',
          },
        );
        if (candidates.length === 0) return unmatched;

        const normalizedTerm = term.toLowerCase();
        const exact = candidates.find(
          (c) => c.name.trim().toLowerCase() === normalizedTerm,
        );
        if (exact) {
          return {
            tempId: input.tempId,
            entityId: exact.entityId,
            confidence: 1,
            resolutionTier: 'exact',
            matchedName: exact.name,
            originalInput: input,
          };
        }

        // Best LEXICAL candidate (dense-only neighbours have no sparse score and
        // are intentionally ineligible to link).
        const best = candidates.reduce((a, b) =>
          (b.sparseSimilarity ?? 0) > (a.sparseSimilarity ?? 0) ? b : a,
        );
        const sim = best.sparseSimilarity ?? 0;
        if (sim >= HYBRID_LINK_SIMILARITY_THRESHOLD) {
          return {
            tempId: input.tempId,
            entityId: best.entityId,
            confidence: sim,
            resolutionTier: 'fuzzy',
            matchedName: best.name,
            originalInput: input,
          };
        }

        return unmatched;
      },
    );
  }

  /** Run `fn` over `items` with at most `concurrency` in flight, preserving order. */
  private async mapLimit<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(items.length);
    let cursor = 0;
    const limit = Math.max(1, Math.min(concurrency, items.length || 1));
    const workers = Array.from({ length: limit }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await fn(items[index]);
      }
    });
    await Promise.all(workers);
    return results;
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
    request: NaturalSearchRequestDto,
  ): Array<{ type: EntityType; terms: string[] }> {
    if (this.hasSelectedAutocompleteEntity(request)) {
      return [];
    }

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

  private hasSelectedAutocompleteEntity(
    request: NaturalSearchRequestDto,
  ): boolean {
    return Boolean(
      request.submissionContext?.matchType === 'entity' &&
        request.submissionContext.selectedEntityId &&
        request.submissionContext.selectedEntityType,
    );
  }

  private async resolveSearchMarketContext(
    request: NaturalSearchRequestDto,
  ): Promise<SearchInterpretationMarketContext> {
    try {
      const resolved = await this.marketRegistry.resolveViewportCoverage({
        bounds: request.bounds ?? null,
        userLocation: request.userLocation ?? null,
        mode: 'search',
        ensureLocalityMarkets: true,
      });

      return {
        marketKey: resolved.market?.marketKey ?? null,
        displayMarketName:
          resolved.market?.marketShortName ??
          resolved.market?.marketName ??
          null,
        marketResolutionStatus: resolved.status,
        candidateLocalityName:
          resolved.resolution.candidateLocalityName ?? null,
        candidateBoundaryProvider:
          resolved.resolution.candidateBoundaryProvider ?? null,
        candidateBoundaryId: resolved.resolution.candidateBoundaryId ?? null,
        candidateBoundaryType:
          resolved.resolution.candidateBoundaryType ?? null,
        attributionMarketKeys: resolved.markets.map(
          (market) => market.marketKey,
        ),
        collectableMarketKeys: resolved.collectableMarketKeys,
      };
    } catch (error) {
      this.logger.debug('Unable to resolve search market context', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return {
        marketKey: null,
        displayMarketName: null,
        marketResolutionStatus: 'error',
        candidateLocalityName: null,
        candidateBoundaryProvider: null,
        candidateBoundaryId: null,
        candidateBoundaryType: null,
        attributionMarketKeys: [],
        collectableMarketKeys: [],
      };
    }
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

    if (
      typeof request.userLocation?.lat === 'number' &&
      typeof request.userLocation?.lng === 'number'
    ) {
      return {
        lat: request.userLocation.lat,
        lng: request.userLocation.lng,
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
    const resolvedEntities = this.applySelectedAutocompleteEntity(request, {
      restaurants: entities.restaurants,
      food: entities.food,
      foodAttributes: entities.foodAttributes,
      restaurantAttributes: entities.restaurantAttributes,
    });

    return {
      entities: resolvedEntities,
      bounds: request.bounds,
      userLocation: request.userLocation,
      openNow: request.openNow,
      pagination: request.pagination,
      includeSqlPreview: request.includeSqlPreview,
      compactResponse: request.compactResponse,
      priceLevels: request.priceLevels,
      minimumVotes: request.minimumVotes,
      sourceQuery: request.query,
    };
  }

  private applySelectedAutocompleteEntity(
    request: NaturalSearchRequestDto,
    entities: QueryEntityGroupDto,
  ): QueryEntityGroupDto {
    const selectedEntityId = request.submissionContext?.selectedEntityId;
    const selectedEntityType = request.submissionContext?.selectedEntityType;
    if (
      request.submissionContext?.matchType !== 'entity' ||
      !selectedEntityId ||
      !selectedEntityType
    ) {
      return entities;
    }

    const selectedEntry: QueryEntityDto = {
      normalizedName: request.query.trim(),
      originalText: request.query.trim(),
      entityIds: [selectedEntityId],
    };

    switch (selectedEntityType) {
      case EntityType.restaurant:
        return {
          restaurants: [selectedEntry],
        };
      case EntityType.food:
        return {
          food: [selectedEntry],
        };
      case EntityType.food_attribute:
        return {
          foodAttributes: [selectedEntry],
        };
      case EntityType.restaurant_attribute:
        return {
          restaurantAttributes: [selectedEntry],
        };
      default:
        return entities;
    }
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
