import { Injectable, Inject } from '@nestjs/common';
import { performance } from 'perf_hooks';
import { EntityType, OnDemandReason } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { LLMService } from '../external-integrations/llm/llm.service';
import { LLMSearchQueryAnalysis } from '../external-integrations/llm/llm.types';
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
import {
  LINKER_TIER_FLOORS,
  LINKER_MARGIN,
  LINKER_MIN_FLOOR,
} from './linker-calibration.generated';
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

// Confident-link thresholds for the shared-recall linking. No LLM on this
// query-time path, so linking is conservative — a strong LEXICAL signal is
// required (dense recall improves ordering but never drives a link on its own,
// avoiding semantic-neighbour mislinks like "ramen" → "pho"). A miss simply
// stays unresolved and flows to on-demand collection, which is far cheaper than
// a wrong link (wrong search results).
// PER-TIER floors, SWEEP-DERIVED (see linker-calibration.generated.ts + the
// sweep script's provenance header). The old hand-set 0.82 was a category error
// twice over: one float for every evidence tier, and "validated" on a corpus
// where 1176/1178 pairs never reached it. The margin decider (dominance over the
// runner-up; self-normalizing; on sparseSimilarity, NEVER rrf — rrf's rank gap
// is a fixed constant) and the singleton branch (an absent runner-up = infinite
// margin, gated by the tier's higher singleton floor) both read the table.
// Tiers absent from the table use this conservative fallback:
const LINKER_FALLBACK_FLOORS = { absolute: 0.82, singleton: 0.65 };
// Ties within this sim-epsilon of the top ARE the decision: reveal ALL of them
// (cardinality is the answer — "joes" → Joe's Pizza + Trader Joe's) instead of
// silently argmax-picking whichever row came back first.
const LINKER_TIE_EPSILON = 0.001;
// Only genuine lexical evidence is link-eligible — never a weak/phonetic/dense-only
// collision (the ham/rum class); those must not nominate a link.
const LINK_ELIGIBLE_EVIDENCE = new Set<string>([
  'exact',
  'prefix',
  'name',
  'alias',
  'fuzzy',
  // Honest-score tiers (P2): containment carries COVERAGE (term/name ratio, no
  // more fake word_similarity 1.0 ties) and edit carries 1 − lev/len — both flow
  // through the same floors/margins as genuine graded evidence.
  'contains',
  'edit',
]);
const HYBRID_LINK_SHORTLIST_K = 5;
const HYBRID_LINK_CONCURRENCY = 8;

@Injectable()
export class SearchQueryInterpretationService {
  private readonly logger: LoggerService;
  private readonly includePhaseTimings: boolean;

  constructor(
    private readonly llmService: LLMService,
    private readonly entityTextSearch: EntityTextSearchService,
    private readonly onDemandRequestService: OnDemandRequestService,
    private readonly marketRegistry: MarketRegistryService,
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

      // LLM outage must DEGRADE search, not kill it: fall back to a browse — an
      // empty analysis means no entity filters, so downstream returns all results
      // ranked by Crave Score instead of throwing. A dead LLM should never take
      // search down.
      analysis = {
        restaurants: [],
        foods: [],
        foodAttributes: [],
        restaurantAttributes: [],
      };
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
      resolutionInputs.length
        ? await this.linkViaHybridRecall(
            resolutionInputs,
            resolvedMarket.collectableMarketKeys,
          )
        : [];
    entityResolutionMs = performance.now() - resolutionStart;

    const groupedEntities = this.groupResolvedEntities(resolutionResultList);

    const structuredRequest = this.buildSearchRequest(request, groupedEntities);
    // Mint the searchRequestId HERE (runQuery reuses a present id) so the two
    // on-demand signal sites — interpretation-time 'unresolved' below and
    // search-time 'low_result' inside runQuery — share one id and their ask
    // events dedupe per request instead of double-counting.
    structuredRequest.searchRequestId ??= uuid();

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
        searchRequestId: structuredRequest.searchRequestId,
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
    addEntries(analysis.ingredients ?? [], 'ingredient');

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
    collectableMarketKeys: string[] = [],
  ): Promise<EntityResolutionResult[]> {
    return this.mapLimit(
      inputs,
      HYBRID_LINK_CONCURRENCY,
      async (input): Promise<EntityResolutionResult> => {
        const live = await this.linkOneInput(input, collectableMarketKeys);
        if (live.entityId || input.entityType !== 'food') {
          return live;
        }
        // INGREDIENT FALLBACK LANE: a food-classified term with no dish link
        // may name an ingredient ("burrata", "miso"). Retry the SAME
        // conservative link against the ingredient vocabulary; dish links
        // always win (fallback only). When BOTH fail, return the original
        // food-typed miss so unresolved routing / on-demand collection sees
        // the term as the food the query model classified it as.
        const ingredientLink = await this.linkOneInput(
          { ...input, entityType: 'ingredient' },
          collectableMarketKeys,
        );
        return ingredientLink.entityId ? ingredientLink : live;
      },
    );
  }

  private async linkOneInput(
    input: EntityResolutionInput,
    collectableMarketKeys: string[],
  ): Promise<EntityResolutionResult> {
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
        // Step 9: recall spans the viewport-overlapping markets (falls back to
        // the single market when the set is empty) so a restaurant across a
        // market line is still linkable.
        marketKeys: collectableMarketKeys.length
          ? collectableMarketKeys
          : undefined,
        // Dense OFF: the link decider reads only sparseSimilarity, so dense
        // candidates are never selectable here — the dense call was measured
        // pure dead cost. Re-enable when a decider can consume dense evidence.
        denseMode: 'none',
      },
    );
    if (candidates.length === 0) return unmatched;

    // LIVE decision (the current exact-name + 0.82 rule — behavior unchanged).
    let live: EntityResolutionResult;
    // Exact by EVIDENCE CLASS, not raw name-string equality: the matcher's
    // 'exact' tier already folds in normalized-name and alias exacts, so an
    // apostrophe/alias case ("joes pizza" → canonical "joe's pizza") links as
    // a true exact instead of being mislabeled 'fuzzy' by a literal compare.
    const exact = candidates.find((c) => c.sparseEvidence === 'exact');
    if (exact) {
      live = {
        tempId: input.tempId,
        entityId: exact.entityId,
        confidence: 1,
        resolutionTier: 'exact',
        matchedName: exact.name,
        originalInput: input,
      };
    } else {
      // Link-eligible lexical candidates only (drop weak/dense-only), ranked
      // by sparseSimilarity — every tier now carries an HONEST score
      // (containment=coverage, edit=1−lev/len), so one sort is meaningful.
      const eligible = candidates
        .filter(
          (c) =>
            c.sparseEvidence != null &&
            LINK_ELIGIBLE_EVIDENCE.has(c.sparseEvidence),
        )
        .sort((a, b) => (b.sparseSimilarity ?? 0) - (a.sparseSimilarity ?? 0));
      const top = eligible[0];
      const topSim = top?.sparseSimilarity ?? 0;
      const runnerSim = eligible[1]?.sparseSimilarity ?? 0;
      const floors =
        (top?.sparseEvidence && LINKER_TIER_FLOORS[top.sparseEvidence]) ||
        LINKER_FALLBACK_FLOORS;
      // Link when the winner clears its TIER's absolute floor, OR is an
      // uncontested singleton above the tier's singleton floor, OR is
      // dominant over the runner-up by the margin. Below the min floor,
      // never link.
      const linkable =
        top != null &&
        topSim >= LINKER_MIN_FLOOR &&
        (topSim >= floors.absolute ||
          (eligible.length === 1 && topSim >= floors.singleton) ||
          (runnerSim > 0 && topSim >= LINKER_MARGIN * runnerSim));
      if (linkable && top) {
        // TIE PLURALITY: same-tier candidates within epsilon of the top are
        // indistinguishable by evidence — reveal ALL of them (the ids array
        // feeds one OR-filter group; results show every plausible read)
        // instead of stamping a coin flip with confidence.
        const tiedIds = eligible
          .filter(
            (c) =>
              c.sparseEvidence === top.sparseEvidence &&
              topSim - (c.sparseSimilarity ?? 0) <= LINKER_TIE_EPSILON,
          )
          .map((c) => c.entityId);
        live = {
          tempId: input.tempId,
          entityId: top.entityId,
          entityIds: tiedIds.length > 1 ? tiedIds : undefined,
          confidence: tiedIds.length > 1 ? topSim / tiedIds.length : topSim,
          resolutionTier: 'fuzzy',
          matchedName: top.name,
          originalInput: input,
        };
      } else {
        live = unmatched;
      }
    }

    return live;
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
      ingredients: this.stripGenericTokensFromTerms(analysis.ingredients ?? []),
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
    const ingredientEntities: QueryEntityDto[] = [];

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
        // Tie plurality: an ambiguous link carries ALL indistinguishable ids —
        // one OR-filter group, results reveal every plausible read.
        entityIds: result.entityIds?.length
          ? result.entityIds
          : [result.entityId],
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
        case 'ingredient':
          pushEntity(ingredientEntities, result);
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
      ingredients: ingredientEntities.length ? ingredientEntities : undefined,
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
      ingredients: entities.ingredients,
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
      ingredients: analysis.ingredients?.length ?? 0,
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
