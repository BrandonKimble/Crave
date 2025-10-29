import { Injectable } from '@nestjs/common';
import { EntityType, OnDemandReason } from '@prisma/client';
import { LoggerService } from '../../shared';
import { EntityPriorityMetricsRepository } from '../../repositories/entity-priority-metrics.repository';
import {
  EntityScope,
  FilterClause,
  QueryEntityDto,
  QueryPlan,
  SearchQueryRequestDto,
  SearchResponseDto,
  PaginationDto,
  SearchResultClickDto,
  SearchPlanResponseDto,
} from './dto/search-query.dto';
import { SearchQueryExecutor } from './search-query.executor';
import { SearchQueryBuilder } from './search-query.builder';
import { OnDemandRequestService, OnDemandRequestInput } from './on-demand-request.service';
import { OnDemandProcessingService } from './on-demand-processing.service';
import { SearchMetricsService } from './search-metrics.service';

const DEFAULT_RESULT_LIMIT = 100;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PER_RESTAURANT_LIMIT = 3;

interface PaginationState {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

interface EntityPresenceSummary {
  restaurants: number;
  food: number;
  foodAttributes: number;
  restaurantAttributes: number;
}

@Injectable()
export class SearchService {
  private readonly logger: LoggerService;
  private readonly resultLimit: number;
  private readonly defaultPageSize: number;
  private readonly maxPageSize: number;
  private readonly perRestaurantLimit: number;
  private readonly alwaysIncludeSqlPreview: boolean;
  private readonly onDemandMinResults: number;
  private readonly openNowFetchMultiplier: number;

  constructor(
    loggerService: LoggerService,
    private readonly queryExecutor: SearchQueryExecutor,
    private readonly entityPriorityMetricsRepository: EntityPriorityMetricsRepository,
    private readonly queryBuilder: SearchQueryBuilder,
    private readonly onDemandRequestService: OnDemandRequestService,
    private readonly onDemandProcessingService: OnDemandProcessingService,
    private readonly searchMetrics: SearchMetricsService,
  ) {
    this.logger = loggerService.setContext('SearchService');
    this.resultLimit = this.resolveResultLimit();
    this.defaultPageSize = this.resolveDefaultPageSize();
    this.maxPageSize = this.resolveMaxPageSize();
    this.perRestaurantLimit = this.resolvePerRestaurantLimit();
    this.alwaysIncludeSqlPreview = this.resolveAlwaysIncludeSqlPreview();
    this.onDemandMinResults = this.resolveOnDemandMinResults();
    this.openNowFetchMultiplier = this.resolveOpenNowFetchMultiplier();
  }

  buildQueryPlan(request: SearchQueryRequestDto): QueryPlan {
    const presence = this.getEntityPresenceSummary(request);

    const format: QueryPlan['format'] =
      presence.restaurants > 0 &&
      presence.food === 0 &&
      presence.foodAttributes === 0 &&
      presence.restaurantAttributes === 0
        ? 'single_list'
        : 'dual_list';

    const restaurantFilters = this.buildRestaurantFilters(request);
    const connectionFilters = this.buildConnectionFilters(request);

    const plan: QueryPlan = {
      format,
      restaurantFilters,
      connectionFilters,
      ranking: {
        foodOrder: 'food_quality_score DESC',
        restaurantOrder:
          format === 'single_list'
            ? 'food_quality_score DESC'
            : 'contextual_food_quality DESC',
      },
      diagnostics: {
        missingEntities: this.getMissingScopes(presence),
        notes: this.buildDiagnosticNotes(request, presence),
      },
    };

    this.logger.debug('Generated query plan', {
      format: plan.format,
      restaurantFilterCount: plan.restaurantFilters.length,
      connectionFilterCount: plan.connectionFilters.length,
    });

    return plan;
  }

  buildPlanResponse(request: SearchQueryRequestDto): SearchPlanResponseDto {
    const plan = this.buildQueryPlan(request);
    const includeSqlPreview = this.shouldIncludeSqlPreview(request);
    if (!includeSqlPreview) {
      return { plan, sqlPreview: null };
    }

    const pagination = this.resolvePagination(request.pagination);
    const dbPagination = this.resolveDbPagination(pagination, request);
    const preview = this.queryBuilder.build({
      plan,
      pagination: dbPagination,
    }).preview;

    return { plan, sqlPreview: preview };
  }

  async runQuery(request: SearchQueryRequestDto): Promise<SearchResponseDto> {
    const start = Date.now();
    let plan: QueryPlan | undefined;

    try {
      plan = this.buildQueryPlan(request);
      const pagination = this.resolvePagination(request.pagination);
      const includeSqlPreview = this.shouldIncludeSqlPreview(request);
      const dbPagination = this.resolveDbPagination(pagination, request);
      const perRestaurantLimit =
        plan.format === 'single_list' ? 0 : this.perRestaurantLimit;

      const execution = await this.queryExecutor.execute({
        plan,
        request,
        pagination,
        dbPagination,
        perRestaurantLimit,
        includeSqlPreview,
      });

      const totalRestaurantResults =
        plan.format === 'dual_list'
          ? execution.restaurantResults.length
          : 0;
      const totalFoodResults = execution.totalFoodCount;

      const triggeredOnDemand = this.shouldTriggerOnDemand(
        request,
        execution.restaurantResults.length,
      );

      const coverageStatus = this.calculateCoverageStatus({
        request,
        totalFoodResults,
        totalRestaurantResults,
        triggeredOnDemand,
      });

      const metadata = {
        totalFoodResults: execution.totalFoodCount,
        totalRestaurantResults,
        queryExecutionTimeMs: Date.now() - start,
        boundsApplied: execution.metadata.boundsApplied,
        openNowApplied: execution.metadata.openNowApplied,
        openNowSupportedRestaurants:
          execution.metadata.openNowSupportedRestaurants,
        openNowUnsupportedRestaurants:
          execution.metadata.openNowUnsupportedRestaurants,
        openNowFilteredOut: execution.metadata.openNowFilteredOut,
        page: pagination.page,
        pageSize: pagination.pageSize,
        perRestaurantLimit,
        coverageStatus,
      };

      if (request.openNow && !execution.metadata.openNowApplied) {
        this.logger.warn(
          'Open-now filter requested but insufficient metadata to evaluate',
          {
            unsupportedCount: execution.metadata.openNowUnsupportedRestaurants,
          },
        );
      }

      try {
        await this.recordQueryImpressions(request);
      } catch (error) {
        this.logger.warn('Failed to record search query impressions', {
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        });
      }

      this.logger.debug('Search query executed', {
        foodCount: execution.foodResults.length,
        restaurantCount: execution.restaurantResults.length,
        metadata,
      });

      this.searchMetrics.recordSearchExecution({
        format: plan.format,
        openNow: Boolean(request.openNow),
        durationMs: metadata.queryExecutionTimeMs,
        totalFoodResults: execution.totalFoodCount,
        openNowFilteredOut: execution.metadata.openNowFilteredOut ?? 0,
      });

      if (triggeredOnDemand) {
        try {
          const lowResultRequests = this.buildLowResultRequests(request);
          if (lowResultRequests.length) {
            const recorded = await this.onDemandRequestService.recordRequests(
              lowResultRequests,
              {
                source: 'low_result',
                restaurantCount: execution.restaurantResults.length,
                planFormat: plan.format,
                bounds: request.bounds,
                openNow: request.openNow,
              },
            );

            if (recorded.length) {
              await this.onDemandProcessingService.enqueueRequests(recorded);
            }
          }
        } catch (error) {
          this.logger.warn('Failed to enqueue low-result on-demand requests', {
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }

      return {
        format: plan.format,
        plan,
        food: execution.foodResults,
        restaurants:
          plan.format === 'dual_list' ? execution.restaurantResults : undefined,
        sqlPreview: includeSqlPreview ? (execution.sqlPreview ?? null) : null,
        metadata,
      };
    } catch (error) {
      this.searchMetrics.recordSearchFailure({
        format: plan?.format ?? 'unknown',
        openNow: Boolean(request.openNow),
        errorName: error instanceof Error ? error.name : 'Error',
      });
      throw error;
    }
  }

  private getEntityPresenceSummary(
    request: SearchQueryRequestDto,
  ): EntityPresenceSummary {
    return {
      restaurants: request.entities.restaurants?.length ?? 0,
      food: request.entities.food?.length ?? 0,
      foodAttributes: request.entities.foodAttributes?.length ?? 0,
      restaurantAttributes: request.entities.restaurantAttributes?.length ?? 0,
    };
  }

  private shouldIncludeSqlPreview(request: SearchQueryRequestDto): boolean {
    return this.alwaysIncludeSqlPreview || Boolean(request.includeSqlPreview);
  }

  private shouldTriggerOnDemand(
    request: SearchQueryRequestDto,
    restaurantCount: number,
  ): boolean {
    if (restaurantCount >= this.onDemandMinResults) {
      return false;
    }
    return this.hasEntityTargets(request);
  }

  private buildRestaurantFilters(
    request: SearchQueryRequestDto,
  ): FilterClause[] {
    const filters: FilterClause[] = [];
    const now = new Date();

    if (request.entities.restaurants?.length) {
      filters.push({
        scope: 'restaurant',
        description: 'Match explicit restaurant entities',
        entityType: EntityScope.RESTAURANT,
        entityIds: this.collectEntityIds(request.entities.restaurants),
      });
    }

    if (request.entities.restaurantAttributes?.length) {
      filters.push({
        scope: 'restaurant',
        description: 'Filter by restaurant attributes',
        entityType: EntityScope.RESTAURANT_ATTRIBUTE,
        entityIds: this.collectEntityIds(request.entities.restaurantAttributes),
      });
    }

    if (request.bounds) {
      filters.push({
        scope: 'restaurant',
        description: `Restrict to map bounds (${request.bounds.southWest.lat.toFixed(4)}, ${request.bounds.southWest.lng.toFixed(4)}) ↔ (${request.bounds.northEast.lat.toFixed(4)}, ${request.bounds.northEast.lng.toFixed(4)})`,
        entityType: EntityScope.RESTAURANT,
        entityIds: [],
        payload: { bounds: request.bounds },
      });
    }

    if (request.openNow) {
      filters.push({
        scope: 'restaurant',
        description: `Filter restaurants open at ${now.toISOString()}`,
        entityType: EntityScope.RESTAURANT,
        entityIds: [],
        payload: { openNow: { requestedAt: now.toISOString() } },
      });
    }

    return filters;
  }

  private buildConnectionFilters(
    request: SearchQueryRequestDto,
  ): FilterClause[] {
    const filters: FilterClause[] = [];

    if (request.entities.food?.length) {
      filters.push({
        scope: 'connection',
        description: 'Match food entities',
        entityType: EntityScope.FOOD,
        entityIds: this.collectEntityIds(request.entities.food),
      });
    }

    if (request.entities.foodAttributes?.length) {
      filters.push({
        scope: 'connection',
        description: 'Filter by food attributes',
        entityType: EntityScope.FOOD_ATTRIBUTE,
        entityIds: this.collectEntityIds(request.entities.foodAttributes),
      });
    }

    return filters;
  }

  private collectEntityIds(entities: QueryEntityDto[] = []): string[] {
    if (!entities.length) {
      return [];
    }
    const ids = entities.flatMap((entity) => entity.entityIds).filter(Boolean);
    return Array.from(new Set(ids));
  }

  private getMissingScopes(presence: EntityPresenceSummary): EntityScope[] {
    const missing: EntityScope[] = [];
    if (!presence.restaurants) {
      missing.push(EntityScope.RESTAURANT);
    }
    if (!presence.food) {
      missing.push(EntityScope.FOOD);
    }
    if (!presence.foodAttributes) {
      missing.push(EntityScope.FOOD_ATTRIBUTE);
    }
    if (!presence.restaurantAttributes) {
      missing.push(EntityScope.RESTAURANT_ATTRIBUTE);
    }
    return missing;
  }

  private buildDiagnosticNotes(
    request: SearchQueryRequestDto,
    presence: EntityPresenceSummary,
  ): string[] {
    const notes: string[] = [];

    if (!presence.food && !presence.foodAttributes) {
      notes.push(
        'No food entities provided; results will not include contextual restaurant rankings.',
      );
    }

    if (request.bounds) {
      notes.push(
        'Map bounds supplied; ensure spatial indexes are ready before enabling execution.',
      );
    }

    if (request.openNow) {
      notes.push(
        'Open-now filter requested; requires restaurant hour metadata.',
      );
    }

    return notes;
  }

  private async recordQueryImpressions(
    request: SearchQueryRequestDto,
  ): Promise<void> {
    const targets = this.gatherEntityImpressionTargets(request);
    if (!targets.length) {
      return;
    }

    const now = new Date();

    await Promise.all(
      targets.map(({ entityId, entityType }) =>
        this.entityPriorityMetricsRepository.upsertMetrics(
          { entityId },
          {
            entity: { connect: { entityId } },
            entityType,
            queryImpressions: 1,
            lastQueryAt: now,
          },
          {
            entityType,
            queryImpressions: { increment: 1 },
            lastQueryAt: now,
          },
        ),
      ),
    );
  }

  private gatherEntityImpressionTargets(
    request: SearchQueryRequestDto,
  ): { entityId: string; entityType: EntityType }[] {
    const targets: { entityId: string; entityType: EntityType }[] = [];
    const push = (ids: string[], entityType: EntityType) => {
      for (const id of ids) {
        if (id) {
          targets.push({ entityId: id, entityType });
        }
      }
    };

    push(this.collectEntityIds(request.entities.restaurants), 'restaurant');
    push(this.collectEntityIds(request.entities.food), 'food');
    push(
      this.collectEntityIds(request.entities.foodAttributes),
      'food_attribute',
    );
    push(
      this.collectEntityIds(request.entities.restaurantAttributes),
      'restaurant_attribute',
    );

    const deduped = new Map<string, EntityType>();
    for (const target of targets) {
      if (!deduped.has(target.entityId)) {
        deduped.set(target.entityId, target.entityType);
      }
    }

    return Array.from(deduped.entries()).map(([entityId, entityType]) => ({
      entityId,
      entityType,
    }));
  }

  async recordResultClick(dto: SearchResultClickDto): Promise<void> {
    const now = new Date();
    await this.entityPriorityMetricsRepository.upsertMetrics(
      { entityId: dto.entityId },
      {
        entity: { connect: { entityId: dto.entityId } },
        entityType: dto.entityType,
        queryClicks: 1,
        lastQueryAt: now,
      },
      {
        entityType: dto.entityType,
        queryClicks: { increment: 1 },
        lastQueryAt: now,
      },
    );
  }

  private calculateCoverageStatus(params: {
    request: SearchQueryRequestDto;
    totalFoodResults: number;
    totalRestaurantResults: number;
    triggeredOnDemand: boolean;
  }): 'full' | 'partial' | 'unresolved' {
    const { request, totalFoodResults, totalRestaurantResults, triggeredOnDemand } =
      params;

    const totalResults = totalFoodResults + totalRestaurantResults;
    const hasTargets = this.hasEntityTargets(request);

    if (!hasTargets) {
      return totalResults === 0 ? 'full' : 'full';
    }

    if (totalResults === 0) {
      return 'unresolved';
    }

    if (triggeredOnDemand) {
      return 'partial';
    }

    return 'full';
  }

  private buildLowResultRequests(
    request: SearchQueryRequestDto,
  ): OnDemandRequestInput[] {
    const results: OnDemandRequestInput[] = [];
    const seen = new Set<string>();
    const reason: OnDemandReason = 'low_result';

    const pushEntities = (
      entities: QueryEntityDto[] | undefined,
      entityType: EntityType,
    ) => {
      for (const entity of entities ?? []) {
        const entityId = entity.entityIds?.[0] ?? null;
        const baseTerm = entity.normalizedName || entity.originalText || entityId;
        if (!baseTerm) {
          continue;
        }
        const sanitizedTerm = baseTerm.trim();
        if (!sanitizedTerm.length) {
          continue;
        }
        const dedupeKey = `${entityType}:${(entityId ?? sanitizedTerm).toLowerCase()}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);
        results.push({
          term: sanitizedTerm,
          entityType,
          reason,
          entityId,
          metadata: entity.originalText
            ? { originalText: entity.originalText }
            : undefined,
        });
      }
    };

    pushEntities(request.entities.food, 'food');
    pushEntities(request.entities.foodAttributes, 'food_attribute');
    pushEntities(request.entities.restaurants, 'restaurant');
    pushEntities(request.entities.restaurantAttributes, 'restaurant_attribute');

    return results;
  }

  private resolvePagination(pagination?: PaginationDto): PaginationState {
    const page = pagination?.page && pagination.page > 0 ? pagination.page : 1;
    const rawPageSize =
      pagination?.pageSize && pagination.pageSize > 0
        ? pagination.pageSize
        : this.defaultPageSize;
    const pageSize = Math.min(
      Math.max(rawPageSize, 1),
      this.maxPageSize,
      this.resultLimit,
    );
    const skip = (page - 1) * pageSize;

    return {
      page,
      pageSize,
      skip,
      take: pageSize,
    };
  }

  private resolveDefaultPageSize(): number {
    const raw = process.env.SEARCH_DEFAULT_PAGE_SIZE;
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 1) {
        return Math.min(parsed, MAX_PAGE_SIZE);
      }
    }

    return DEFAULT_PAGE_SIZE;
  }

  private resolveMaxPageSize(): number {
    const raw = process.env.SEARCH_MAX_PAGE_SIZE;
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 1) {
        return Math.min(parsed, MAX_PAGE_SIZE);
      }
    }

    return MAX_PAGE_SIZE;
  }

  private resolvePerRestaurantLimit(): number {
    const raw = process.env.SEARCH_MAX_CONNECTIONS_PER_RESTAURANT;
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return Math.min(parsed, 10);
      }
    }

    return DEFAULT_PER_RESTAURANT_LIMIT;
  }

  private resolveResultLimit(): number {
    const raw = process.env.SEARCH_MAX_RESULTS;
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.min(parsed, 500);
      }
    }

    return DEFAULT_RESULT_LIMIT;
  }

  private resolveAlwaysIncludeSqlPreview(): boolean {
    const raw = process.env.SEARCH_ALWAYS_INCLUDE_SQL_PREVIEW || '';
    return raw.toLowerCase() === 'true';
  }

  private resolveOnDemandMinResults(): number {
    const raw = process.env.SEARCH_ON_DEMAND_MIN_RESULTS;
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return this.defaultPageSize;
  }

  private resolveOpenNowFetchMultiplier(): number {
    const raw = process.env.SEARCH_OPEN_NOW_FETCH_MULTIPLIER;
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 1) {
        return Math.min(parsed, 10);
      }
    }
    return 4;
  }

  private hasEntityTargets(request: SearchQueryRequestDto): boolean {
    return Boolean(
      request.entities.food?.length ||
        request.entities.foodAttributes?.length ||
        request.entities.restaurants?.length ||
        request.entities.restaurantAttributes?.length,
    );
  }

  private resolveDbPagination(
    pagination: PaginationState,
    request: SearchQueryRequestDto,
  ): { skip: number; take: number } {
    if (!request.openNow) {
      return { skip: pagination.skip, take: pagination.take };
    }

    const rawTake =
      pagination.page * pagination.pageSize * this.openNowFetchMultiplier;
    const take = Math.min(
      Math.max(rawTake, pagination.pageSize),
      this.resultLimit,
    );

    return {
      skip: 0,
      take,
    };
  }
}
