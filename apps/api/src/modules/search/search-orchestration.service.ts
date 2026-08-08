import { toStructuredSearchRequest } from './dto/search-query.dto';
import { isEnvFlagEnabled } from '../../shared/config/env-flag';
import { Inject, Injectable } from '@nestjs/common';
import { SearchService } from './search.service';
import {
  countQueryEntityGroupEntries,
  NaturalSearchRequestDto,
  QueryEntityDto,
  QueryEntityGroupDto,
  SearchQueryRequestDto,
  SearchResponseDto,
  summarizeQueryEntityGroupCounts,
} from './dto/search-query.dto';
import { SearchQueryInterpretationService } from './search-query-interpretation.service';
import { LoggerService } from '../../shared';
import {
  resolveSearchDebugMode,
  summarizeEntities,
  summarizeUnresolvedEntities,
  type SearchDebugMode,
} from './utils/search-debug';

@Injectable()
export class SearchOrchestrationService {
  private readonly includePhaseTimings: boolean;
  private readonly debugMode: SearchDebugMode;
  private readonly logger: LoggerService;

  constructor(
    private readonly interpretationService: SearchQueryInterpretationService,
    private readonly searchService: SearchService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchOrchestrationService');
    this.includePhaseTimings = isEnvFlagEnabled(
      process.env.SEARCH_INCLUDE_PHASE_TIMINGS,
    );
    this.debugMode = resolveSearchDebugMode();
  }

  async runNaturalQuery(
    request: NaturalSearchRequestDto,
  ): Promise<SearchResponseDto> {
    const originalQuery = request.query;
    // NO WORD LIST (owner ruling 2026-08-02): the raw query goes straight
    // to the gazetteer Understand — junk grounding is a data defect owned
    // by extraction hygiene + the junk sweep, not a stop-list here (see
    // search-generic-queries.spec.ts for the pinned post-cleanup contract).
    const normalizedQuery = { text: originalQuery, isGenericOnly: false };

    if (this.debugMode !== 'off') {
      this.logger.info('Search debug: natural query received', {
        searchRequestId: request.searchRequestId ?? null,
        originalQuery,
        normalizedQuery: normalizedQuery.text,
        isGenericOnly: normalizedQuery.isGenericOnly,
        bounds: Boolean(request.bounds),
        openNow: Boolean(request.openNow),
        page: request.pagination?.page ?? null,
        pageSize: request.pagination?.pageSize ?? null,
        submissionSource: request.submissionSource ?? null,
        submissionContext: request.submissionContext ?? null,
        verbose: this.debugMode === 'verbose',
      });
    }

    const selectedEntityRequest =
      this.buildSelectedEntitySearchRequest(request);
    if (selectedEntityRequest) {
      const response = await this.searchService.runQuery(selectedEntityRequest);

      response.metadata.sourceQuery = originalQuery;
      this.logPhaseTimings(response, originalQuery);

      if (this.debugMode !== 'off') {
        this.logger.info('Search debug: selected entity response', {
          searchRequestId: response.metadata.searchRequestId,
          resultCoverageStatus: response.metadata.resultCoverageStatus,
          totalRestaurantResults: response.metadata.totalRestaurantResults,
          totalFoodResults: response.metadata.totalFoodResults,
          queryExecutionTimeMs: response.metadata.queryExecutionTimeMs,
          onDemandQueued: response.metadata.onDemandQueued ?? false,
        });
      }

      return response;
    }

    const interpretation = await this.interpretationService.interpret({
      ...request,
      query: normalizedQuery.text,
    });
    interpretation.structuredRequest.sourceQuery = normalizedQuery.text;
    // Keep interpretation's minted id unless the CLIENT supplied one — a
    // blind overwrite with undefined broke the ask↔search act correlation
    // (residue staged under an id no later signal ever carries).
    if (request.searchRequestId) {
      interpretation.structuredRequest.searchRequestId =
        request.searchRequestId;
    }
    interpretation.structuredRequest.submissionSource =
      request.submissionSource ?? 'manual';
    interpretation.structuredRequest.submissionContext = {
      ...(request.submissionContext ?? {}),
      unresolvedEntities: interpretation.unresolved.map((group) => ({
        type: group.type,
        terms: group.terms,
      })),
    };
    interpretation.structuredRequest.userId = request.userId;

    const hasInterpretationTargets = this.hasStructuredSearchTargets(
      interpretation.structuredRequest.entities,
    );
    if (!hasInterpretationTargets) {
      const response = this.searchService.buildEmptyResponse(
        interpretation.structuredRequest,
        {
          emptyQueryMessage:
            'Adjust your search. Try adding a dish, restaurant, or attribute (e.g., "ceaser salad", "spicy", "patio seating").',
        },
      );

      response.metadata.unresolvedEntities = interpretation.unresolved.map(
        (group) => ({
          type: group.type,
          terms: group.terms,
        }),
      );
      // F5 (wave-3 red team): the negation constraint and the dense-tier
      // fact were produced and read by NOTHING — the launch gate's
      // non-inversion and parse-preservation thresholds grade THESE fields.
      if (interpretation.excludedSpans?.length) {
        response.metadata.excludedSpans = interpretation.excludedSpans;
      }
      if (interpretation.queryAnalysis) {
        response.metadata.queryAnalysis = interpretation.queryAnalysis;
      }
      response.metadata.sourceQuery = originalQuery;
      if (!request.compactResponse) {
        response.metadata.analysisMetadata = this.mergeAnalysisMetadata(
          response.metadata.analysisMetadata,
          interpretation.analysisMetadata,
          interpretation.phaseTimings,
        );
      }
      this.logPhaseTimings(response, normalizedQuery.text);

      if (this.debugMode !== 'off') {
        this.logger.info('Search debug: no interpretation targets', {
          searchRequestId: response.metadata.searchRequestId,
          originalQuery,
          normalizedQuery: normalizedQuery.text,
          analysis:
            this.debugMode === 'verbose' ? interpretation.analysis : undefined,
          analysisMetadata:
            this.debugMode === 'verbose'
              ? (interpretation.analysisMetadata ?? null)
              : undefined,
          // F3800: derived from the ONE group vocabulary, and read off the
          // STRUCTURED request (what the gate consults) rather than the
          // legacy `analysis` block, whose four arrays are hard-coded empty
          // on the gazetteer path — so this counter reported all-zeros and
          // could not have counted ingredients even if it had an arm.
          interpretationCounts: summarizeQueryEntityGroupCounts(
            interpretation.structuredRequest.entities,
          ),
          unresolved: summarizeUnresolvedEntities(interpretation.unresolved),
          structuredEntities:
            this.debugMode === 'verbose'
              ? summarizeEntities(interpretation.structuredRequest.entities, {
                  maxEntities: 10,
                  maxIds: 10,
                })
              : summarizeEntities(interpretation.structuredRequest.entities),
        });
      }

      return response;
    }

    if (this.debugMode !== 'off') {
      this.logger.info('Search debug: interpretation summary', {
        searchRequestId: interpretation.structuredRequest.searchRequestId,
        originalQuery,
        normalizedQuery: normalizedQuery.text,
        analysis:
          this.debugMode === 'verbose' ? interpretation.analysis : undefined,
        analysisMetadata:
          this.debugMode === 'verbose'
            ? (interpretation.analysisMetadata ?? null)
            : undefined,
        interpretationCounts: {
          restaurants: interpretation.analysis.restaurants.length,
          foods: interpretation.analysis.foods.length,
          foodAttributes: interpretation.analysis.foodAttributes.length,
          restaurantAttributes:
            interpretation.analysis.restaurantAttributes.length,
        },
        unresolved: summarizeUnresolvedEntities(interpretation.unresolved),
        structuredEntities:
          this.debugMode === 'verbose'
            ? summarizeEntities(interpretation.structuredRequest.entities, {
                maxEntities: 10,
                maxIds: 10,
              })
            : summarizeEntities(interpretation.structuredRequest.entities),
      });
    }

    const response = await this.searchService.runQuery(
      interpretation.structuredRequest,
    );

    response.metadata.unresolvedEntities = interpretation.unresolved.map(
      (group) => ({
        type: group.type,
        terms: group.terms,
      }),
    );
    response.metadata.sourceQuery = originalQuery;
    if (!request.compactResponse) {
      response.metadata.analysisMetadata = this.mergeAnalysisMetadata(
        response.metadata.analysisMetadata,
        interpretation.analysisMetadata,
        interpretation.phaseTimings,
      );
    }
    this.logPhaseTimings(response, normalizedQuery.text);
    if (interpretation.onDemandQueued && !response.metadata.onDemandQueued) {
      response.metadata.onDemandQueued = true;
    }
    if (!response.metadata.onDemandEtaMs && interpretation.onDemandEtaMs) {
      response.metadata.onDemandEtaMs = interpretation.onDemandEtaMs;
    }

    if (this.debugMode !== 'off') {
      this.logger.info('Search debug: final response', {
        searchRequestId: response.metadata.searchRequestId,
        resultCoverageStatus: response.metadata.resultCoverageStatus,
        totalRestaurantResults: response.metadata.totalRestaurantResults,
        totalFoodResults: response.metadata.totalFoodResults,
        restaurantsOnPage: response.restaurants?.length ?? 0,
        dishesOnPage: response.dishes?.length ?? 0,
        queryExecutionTimeMs: response.metadata.queryExecutionTimeMs,
        onDemandQueued: response.metadata.onDemandQueued ?? false,
        onDemandEtaMs: response.metadata.onDemandEtaMs ?? null,
      });
    }

    const totalResults =
      (response.dishes?.length ?? 0) + (response.restaurants?.length ?? 0);
    // F3800: same derived vocabulary as the entry gate. The hand-copied
    // four-arm version reported an ingredient-only search that returned
    // nothing as coverage 'full' — an honest gap laundered into "nothing
    // matched".
    const hasQueryTargets = this.hasStructuredSearchTargets(
      interpretation.structuredRequest.entities,
    );

    if (interpretation.unresolved.length) {
      response.metadata.resultCoverageStatus =
        totalResults > 0 ? 'partial' : 'unresolved';
    } else if (!response.metadata.resultCoverageStatus) {
      if (hasQueryTargets && totalResults === 0) {
        response.metadata.resultCoverageStatus = 'unresolved';
      } else {
        // No query targets (or targets with results): the pooled lane resolved
        // everything it was asked for, so coverage is 'full' regardless of the
        // hit count — an empty result set here is an honest "nothing matched",
        // not a coverage gap.
        response.metadata.resultCoverageStatus = 'full';
      }
    }

    return response;
  }

  private logPhaseTimings(response: SearchResponseDto, query: string): void {
    if (!this.includePhaseTimings) {
      return;
    }
    const phaseTimings =
      response.metadata.analysisMetadata?.phaseTimings ?? null;
    if (!phaseTimings || typeof phaseTimings !== 'object') {
      return;
    }

    this.logger.info('Search phase timings', {
      searchRequestId: response.metadata.searchRequestId,
      query,
      phaseTimings,
    });
  }

  /** F3800: derived from QUERY_ENTITY_GROUP_KEYS, never hand-copied — the
   *  hand-copied four-arm version omitted `ingredients` and gated the whole
   *  ingredient lane off the natural path. */
  private hasStructuredSearchTargets(entities: QueryEntityGroupDto): boolean {
    return countQueryEntityGroupEntries(entities) > 0;
  }

  private buildSelectedEntitySearchRequest(
    request: NaturalSearchRequestDto,
  ): SearchQueryRequestDto | null {
    const selectedEntityId = request.submissionContext?.selectedEntityId;
    const selectedEntityType = request.submissionContext?.selectedEntityType;
    if (
      request.submissionContext?.matchType !== 'entity' ||
      !selectedEntityId ||
      !selectedEntityType
    ) {
      return null;
    }

    const selectedEntry: QueryEntityDto = {
      normalizedName: request.query.trim(),
      originalText: request.query.trim(),
      entityIds: [selectedEntityId],
    };
    const entities: QueryEntityGroupDto = {};
    switch (selectedEntityType) {
      case 'restaurant':
        entities.restaurants = [selectedEntry];
        break;
      case 'food':
        entities.food = [selectedEntry];
        break;
      case 'food_attribute':
        entities.foodAttributes = [selectedEntry];
        break;
      case 'restaurant_attribute':
        entities.restaurantAttributes = [selectedEntry];
        break;
      case 'ingredient':
        entities.ingredients = [selectedEntry];
        break;
      default:
        return null;
    }

    // Audit C3: this hand-list previously DROPPED an active dietary wall
    // (plus includeSimilar/risingActive/viewportPolygon) when a user picked
    // an autocomplete entity — destructuring passthrough makes that class
    // unrepresentable.
    return {
      ...toStructuredSearchRequest(request, entities),
      submissionSource: request.submissionSource ?? 'manual',
    };
  }

  private mergeAnalysisMetadata(
    responseMetadata: Record<string, unknown> | undefined,
    interpretationMetadata: Record<string, unknown> | undefined,
    phaseTimings?: Record<string, number>,
  ): Record<string, unknown> | undefined {
    const merged: Record<string, unknown> = {};

    if (responseMetadata && typeof responseMetadata === 'object') {
      Object.assign(merged, responseMetadata);
    }

    if (interpretationMetadata && typeof interpretationMetadata === 'object') {
      Object.assign(merged, interpretationMetadata);
    }

    if (this.includePhaseTimings && phaseTimings) {
      const existingTimings =
        typeof merged.phaseTimings === 'object' && merged.phaseTimings !== null
          ? (merged.phaseTimings as Record<string, number>)
          : {};
      merged.phaseTimings = { ...existingTimings, ...phaseTimings };
    }

    return Object.keys(merged).length > 0 ? merged : undefined;
  }
}
