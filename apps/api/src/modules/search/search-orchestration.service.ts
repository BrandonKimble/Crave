import { Inject, Injectable } from '@nestjs/common';
import { SearchService } from './search.service';
import {
  NaturalSearchRequestDto,
  SearchResponseDto,
} from './dto/search-query.dto';
import { SearchQueryInterpretationService } from './search-query-interpretation.service';
import { LoggerService } from '../../shared';
import { stripGenericTokens } from '../../shared/utils/generic-token-handling';
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
    this.includePhaseTimings =
      (process.env.SEARCH_INCLUDE_PHASE_TIMINGS || '').toLowerCase() === 'true';
    this.debugMode = resolveSearchDebugMode();
  }

  async runNaturalQuery(
    request: NaturalSearchRequestDto,
  ): Promise<SearchResponseDto> {
    const originalQuery = request.query;
    const normalizedQuery = stripGenericTokens(originalQuery);

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

    if (normalizedQuery.isGenericOnly) {
      const response = await this.searchService.runQuery({
        entities: {},
        bounds: request.bounds,
        userLocation: request.userLocation,
        openNow: request.openNow,
        pagination: request.pagination,
        includeSqlPreview: request.includeSqlPreview,
        compactResponse: request.compactResponse,
        priceLevels: request.priceLevels,
        minimumVotes: request.minimumVotes,
        userId: request.userId,
        searchRequestId: request.searchRequestId,
        submissionSource: 'shortcut',
        submissionContext: request.submissionContext,
      });

      response.metadata.sourceQuery = originalQuery;
      this.logPhaseTimings(response, originalQuery);

      if (this.debugMode !== 'off') {
        this.logger.info('Search debug: generic-only response', {
          searchRequestId: response.metadata.searchRequestId,
          marketStatus: response.metadata.marketStatus,
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
    interpretation.structuredRequest.searchRequestId = request.searchRequestId;
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

    const hasInterpretationTargets =
      interpretation.analysis.restaurants.length +
        interpretation.analysis.foods.length +
        interpretation.analysis.foodAttributes.length +
        interpretation.analysis.restaurantAttributes.length >
      0;
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
        marketStatus: response.metadata.marketStatus,
        totalRestaurantResults: response.metadata.totalRestaurantResults,
        totalFoodResults: response.metadata.totalFoodResults,
        restaurantsOnPage: response.restaurants?.length ?? 0,
        dishesOnPage: response.dishes?.length ?? 0,
        relaxationApplied: response.metadata.relaxationApplied ?? false,
        relaxationStage: response.metadata.relaxationStage ?? null,
        queryExecutionTimeMs: response.metadata.queryExecutionTimeMs,
        onDemandQueued: response.metadata.onDemandQueued ?? false,
        onDemandEtaMs: response.metadata.onDemandEtaMs ?? null,
      });
    }

    const totalResults =
      (response.dishes?.length ?? 0) + (response.restaurants?.length ?? 0);
    const hasQueryTargets = Boolean(
      interpretation.structuredRequest.entities.food?.length ||
        interpretation.structuredRequest.entities.foodAttributes?.length ||
        interpretation.structuredRequest.entities.restaurants?.length ||
        interpretation.structuredRequest.entities.restaurantAttributes?.length,
    );

    if (interpretation.unresolved.length) {
      response.metadata.marketStatus =
        totalResults > 0 ? 'partial' : 'unresolved';
    } else if (!response.metadata.marketStatus) {
      if (hasQueryTargets && totalResults === 0) {
        response.metadata.marketStatus = 'unresolved';
      } else {
        response.metadata.marketStatus = totalResults > 0 ? 'full' : 'full';
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
