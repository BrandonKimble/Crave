import { Injectable, Inject } from '@nestjs/common';
import { EntityType, OnDemandReason } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { LLMService } from '../external-integrations/llm/llm.service';
import { LLMSearchQueryAnalysis } from '../external-integrations/llm/llm.types';
import { EntityResolutionService } from '../content-processing/entity-resolver/entity-resolution.service';
import {
  EntityResolutionInput,
  EntityResolutionResult,
} from '../content-processing/entity-resolver/entity-resolution.types';
import { LoggerService } from '../../shared';
import {
  NaturalSearchRequestDto,
  QueryEntityDto,
  QueryEntityGroupDto,
  SearchQueryRequestDto,
} from './dto/search-query.dto';
import { OnDemandRequestService } from './on-demand-request.service';
import { OnDemandProcessingService } from './on-demand-processing.service';

interface InterpretationResult {
  structuredRequest: SearchQueryRequestDto;
  analysis: LLMSearchQueryAnalysis;
  unresolved: Array<{
    type: EntityType;
    terms: string[];
  }>;
  analysisMetadata?: Record<string, unknown>;
}

@Injectable()
export class SearchQueryInterpretationService {
  private readonly logger: LoggerService;

  constructor(
    private readonly llmService: LLMService,
    private readonly entityResolutionService: EntityResolutionService,
    private readonly onDemandRequestService: OnDemandRequestService,
    private readonly onDemandProcessingService: OnDemandProcessingService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchQueryInterpretationService');
  }

  async interpret(
    request: NaturalSearchRequestDto,
  ): Promise<InterpretationResult> {
    const analysis = await this.llmService.analyzeSearchQuery(request.query);

    const analysisCounts = this.getAnalysisEntityCounts(analysis);
    this.logger.info('Search query LLM analysis summary', {
      query: request.query,
      analysisCounts,
      sampleRestaurants: analysis.restaurants.slice(0, 3),
      sampleFoods: analysis.foods.slice(0, 3),
      sampleFoodAttributes: analysis.foodAttributes.slice(0, 3),
      sampleRestaurantAttributes: analysis.restaurantAttributes.slice(0, 3),
    });

    this.logger.debug('Query interpretation foods breakdown', {
      query: request.query,
      foods: analysis.foods,
    });

    const resolutionInputs = this.buildResolutionInputs(analysis);
    const resolutionResults = resolutionInputs.length
      ? await this.entityResolutionService.resolveBatch(resolutionInputs, {
          enableFuzzyMatching: true,
          fuzzyMatchThreshold: 0.75,
          maxEditDistance: 3,
          batchSize: 100,
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

    if (unresolved.length) {
      const onDemandContext: Record<string, unknown> = {
        query: request.query,
      };
      if (request.bounds) {
        onDemandContext.bounds = request.bounds;
      }

      const reason: OnDemandReason = 'unresolved';
      const unresolvedRequests = unresolved.flatMap((group) =>
        group.terms.map((term) => ({
          term,
          entityType: group.type,
          reason,
          metadata: { source: 'natural_query', unresolvedType: group.type },
        })),
      );

      const recordedRequests = await this.onDemandRequestService.recordRequests(
        unresolvedRequests,
        onDemandContext,
      );

      void this.onDemandProcessingService
        .enqueueRequests(recordedRequests)
        .catch((error) => {
          this.logger.error('Failed to enqueue recorded on-demand requests', {
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }

    return {
      structuredRequest,
      analysis,
      unresolved,
      analysisMetadata: analysis.metadata,
    };
  }

  private buildResolutionInputs(
    analysis: LLMSearchQueryAnalysis,
  ): EntityResolutionInput[] {
    const inputs: EntityResolutionInput[] = [];

    const addEntries = (names: string[], entityType: EntityType) => {
      const seen = new Set<string>();
      for (const name of names) {
        const normalized = name.trim();
        if (!normalized.length) {
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
        });
      }
    };

    addEntries(analysis.restaurants, 'restaurant');
    addEntries(analysis.foods, 'food');
    addEntries(analysis.foodAttributes, 'food_attribute');
    addEntries(analysis.restaurantAttributes, 'restaurant_attribute');

    return inputs;
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
      openNow: request.openNow,
      pagination: request.pagination,
      includeSqlPreview: request.includeSqlPreview,
      priceLevels: request.priceLevels,
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
