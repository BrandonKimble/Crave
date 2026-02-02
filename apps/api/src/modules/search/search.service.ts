import { Injectable } from '@nestjs/common';
import { performance } from 'perf_hooks';
import { EntityType, OnDemandReason, SearchLogSource } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService, TextSanitizerService } from '../../shared';
import { stripGenericTokens } from '../../shared/utils/generic-token-handling';
import {
  EntityScope,
  QueryEntityDto,
  QueryPlan,
  SearchQueryRequestDto,
  SearchResponseDto,
  SearchResponseMetadataDto,
  PaginationDto,
  SearchResultClickDto,
  SearchPlanResponseDto,
  MapBoundsDto,
} from './dto/search-query.dto';
import { SearchQueryExecutor } from './search-query.executor';
import { SearchQueryBuilder } from './search-query.builder';
import { SearchEntityExpansionService } from './search-entity-expansion.service';
import type { SearchExecutionDirectives } from './search-execution-directives';
import type { SearchConstraints, RelaxationStage } from './search-constraints';
import { compileQueryPlanFromConstraints } from './search-constraints.compiler';
import {
  OnDemandRequestService,
  OnDemandRequestInput,
} from './on-demand-request.service';
import { SearchMetricsService } from './search-metrics.service';
import { SearchSubredditResolverService } from './search-subreddit-resolver.service';
import { CoverageRegistryService } from '../coverage-key/coverage-registry.service';
import { RestaurantStatusService } from './restaurant-status.service';
import type { RestaurantStatusPreviewDto } from './dto/restaurant-status-preview.dto';

const DEFAULT_RESULT_LIMIT = 100;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const METERS_PER_MILE = 1609.34;
const ON_DEMAND_MIN_VIEWPORT_WIDTH_MILES = 2;
const ON_DEMAND_VIEWPORT_TOLERANCE = 0.85;
const ON_DEMAND_VIEWPORT_MIN_WIDTH_MILES =
  ON_DEMAND_MIN_VIEWPORT_WIDTH_MILES * ON_DEMAND_VIEWPORT_TOLERANCE;
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

interface PlanExpansionState {
  foodIds: string[];
  foodAttributeIds: string[];
  restaurantAttributeIds: string[];
  foodIdsFromPrimaryFoodAttributeText: string[];
}

type RelaxationCapabilities = {
  hasFoodAttributes: boolean;
  hasRestaurantAttributes: boolean;
  hasPrimaryEntities: boolean;
  canDropFoodAttributes: boolean;
  canDropRestaurantAttributes: boolean;
  canDropAllModifiers: boolean;
  canRelax: boolean;
};

type DualExecutionResult = Awaited<
  ReturnType<SearchQueryExecutor['executeDual']>
>;

interface StageExecutionResult {
  stagePlan: QueryPlan;
  exec: DualExecutionResult;
  timings: { planMs: number; executeMs: number };
}

type SearchExplainInput = {
  request: SearchQueryRequestDto;
  pagination: PaginationState;
  relaxationCapabilities: RelaxationCapabilities;
  strictCoverageCount: number;
  hasUnresolvedTerms: boolean;
  strictCounts: {
    restaurantsOnPage: number;
    dishesOnPage: number;
    totalRestaurants: number;
    totalDishes: number;
  };
  relaxation: {
    applied: boolean;
    stage?: RelaxationStage;
    threshold: number;
  };
  onDemand: {
    triggered: boolean;
    queued: boolean;
  };
};

export type SearchHistoryEntry = {
  queryText: string;
  lastSearchedAt: string;
  selectedEntityId: string | null;
  selectedEntityType: EntityType | null;
  statusPreview?: RestaurantStatusPreviewDto | null;
};

@Injectable()
export class SearchService {
  private readonly logger: LoggerService;
  private readonly resultLimit: number;
  private readonly defaultPageSize: number;
  private readonly maxPageSize: number;
  private readonly perRestaurantLimit: number;
  private readonly isDevEnvironment: boolean;
  private readonly alwaysIncludeSqlPreview: boolean;
  private readonly onDemandMinResults: number;
  private readonly openNowFetchMultiplier: number;
  private readonly searchLogEnabled: boolean;
  private readonly includePhaseTimings: boolean;
  private readonly explainEnabled: boolean;
  private readonly expansionStrictCoverageTarget: number;
  private readonly expansionFoodCap: number;
  private readonly expansionAttributeCap: number;
  private readonly expansionMaxTermsPerType: number;

  constructor(
    loggerService: LoggerService,
    private readonly queryExecutor: SearchQueryExecutor,
    private readonly queryBuilder: SearchQueryBuilder,
    private readonly entityExpansion: SearchEntityExpansionService,
    private readonly onDemandRequestService: OnDemandRequestService,
    private readonly searchMetrics: SearchMetricsService,
    private readonly textSanitizer: TextSanitizerService,
    private readonly prisma: PrismaService,
    private readonly subredditResolver: SearchSubredditResolverService,
    private readonly coverageRegistry: CoverageRegistryService,
    private readonly restaurantStatusService: RestaurantStatusService,
  ) {
    this.logger = loggerService.setContext('SearchService');
    this.resultLimit = this.resolveResultLimit();
    this.defaultPageSize = this.resolveDefaultPageSize();
    this.maxPageSize = this.resolveMaxPageSize();
    this.perRestaurantLimit = this.resolvePerRestaurantLimit();
    this.isDevEnvironment = this.resolveIsDevEnvironment();
    this.alwaysIncludeSqlPreview = this.resolveAlwaysIncludeSqlPreview();
    this.onDemandMinResults = this.resolveOnDemandMinResults();
    this.openNowFetchMultiplier = this.resolveOpenNowFetchMultiplier();
    this.searchLogEnabled = this.resolveSearchLogEnabled();
    this.includePhaseTimings = this.resolveIncludePhaseTimings();
    this.explainEnabled = this.resolveExplainEnabled();
    this.expansionStrictCoverageTarget =
      this.resolveExpansionStrictCoverageTarget();
    this.expansionFoodCap = this.resolveExpansionFoodCap();
    this.expansionAttributeCap = this.resolveExpansionAttributeCap();
    this.expansionMaxTermsPerType = this.resolveExpansionMaxTermsPerType();
  }

  buildQueryPlan(request: SearchQueryRequestDto): QueryPlan {
    this.sanitizeEntityGroups(request);
    const priceLevels = this.normalizePriceLevels(request.priceLevels);
    const minimumVotes = this.normalizeMinimumVotes(request.minimumVotes);

    // Always use dual_list format - restaurants and dishes are independent lists
    const format: QueryPlan['format'] = 'dual_list';
    const constraints = this.buildSearchConstraints(request, 'strict', {
      format,
      priceLevels,
      minimumVotes,
    });
    const plan: QueryPlan = compileQueryPlanFromConstraints(constraints);

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

  buildEmptyResponse(
    request: SearchQueryRequestDto,
    options: { emptyQueryMessage?: string } = {},
  ): SearchResponseDto {
    const start = Date.now();
    const searchRequestId = request.searchRequestId ?? randomUUID();
    request.searchRequestId = searchRequestId;

    const { plan, sqlPreview } = this.buildPlanResponse(request);
    const pagination = this.resolvePagination(request.pagination);
    const perRestaurantLimit = this.perRestaurantLimit;

    const primaryFoodTermRaw =
      request.entities.food?.[0]?.originalText ??
      request.entities.food?.[0]?.normalizedName ??
      null;
    const primaryFoodTerm = primaryFoodTermRaw
      ? primaryFoodTermRaw.trim()
      : null;

    return {
      format: plan.format,
      plan,
      dishes: [],
      restaurants: [],
      sqlPreview,
      metadata: {
        totalFoodResults: 0,
        totalRestaurantResults: 0,
        queryExecutionTimeMs: Date.now() - start,
        searchRequestId,
        boundsApplied: false,
        openNowApplied: false,
        openNowSupportedRestaurants: 0,
        openNowUnsupportedRestaurants: 0,
        openNowFilteredOut: 0,
        priceFilterApplied: Boolean(request.priceLevels?.length),
        minimumVotesApplied:
          typeof request.minimumVotes === 'number' && request.minimumVotes > 0,
        page: pagination.page,
        pageSize: pagination.pageSize,
        perRestaurantLimit,
        coverageStatus: 'unresolved',
        primaryFoodTerm: primaryFoodTerm || undefined,
        emptyQueryMessage: options.emptyQueryMessage,
      },
    };
  }

  async runQuery(request: SearchQueryRequestDto): Promise<SearchResponseDto> {
    const start = Date.now();
    const searchRequestId = request.searchRequestId ?? randomUUID();
    request.searchRequestId = searchRequestId;

    let plan: QueryPlan | undefined;
    const phaseTimings: Record<string, number> = {};

    const RELAX_STRICT_THRESHOLD = 10;
    const TOP_DISHES_LIMIT = 3;

    try {
      const pagination = this.resolvePagination(request.pagination);
      const includeSqlPreview = this.shouldIncludeSqlPreview(request);
      const perRestaurantLimit = this.perRestaurantLimit;

      const relaxation = this.resolveRelaxationCapabilities(request);
      const canRelax = relaxation.canRelax;

      let planExpansion: PlanExpansionState | null = null;
      let expansionAnalysisMetadata: Record<string, unknown> | null = null;

      const executeStage = async (params: {
        stage: RelaxationStage;
        restaurantPagination: { skip: number; take: number };
        dishPagination: { skip: number; take: number };
        excludeRestaurantIds?: string[];
        excludeConnectionIds?: string[];
        includeSqlPreview?: boolean;
      }): Promise<StageExecutionResult> => {
        return this.executeSearchStage({
          request,
          stage: params.stage,
          planExpansion,
          pagination,
          restaurantPagination: params.restaurantPagination,
          dishPagination: params.dishPagination,
          topDishesLimit: TOP_DISHES_LIMIT,
          includeSqlPreview: params.includeSqlPreview,
          excludeRestaurantIds: params.excludeRestaurantIds,
          excludeConnectionIds: params.excludeConnectionIds,
        });
      };

      // Strict probe (page 1 uses full pagination; later pages probe first).
      const strictProbePagination =
        pagination.page === 1
          ? pagination
          : { skip: 0, take: Math.max(RELAX_STRICT_THRESHOLD, 10) };

      let strictProbe = await executeStage({
        stage: 'strict',
        restaurantPagination: strictProbePagination,
        dishPagination: strictProbePagination,
        includeSqlPreview: false,
      });

      const strictCoverageCount =
        strictProbe.exec.totalRestaurantCount + strictProbe.exec.totalDishCount;
      const unresolvedGroups =
        request.submissionContext?.unresolvedEntities ?? [];
      const hasUnresolvedTerms = unresolvedGroups.some(
        (group) => group.terms?.length,
      );
      if (
        this.hasEntityTargets(request) &&
        (strictCoverageCount < this.expansionStrictCoverageTarget ||
          hasUnresolvedTerms)
      ) {
        const expansion = await this.buildPlanExpansionForRequest(
          request,
          strictProbe.stagePlan,
        );
        if (expansion && this.hasPlanExpansion(expansion)) {
          planExpansion = expansion;
          expansionAnalysisMetadata = this.buildExpansionMetadata(
            strictCoverageCount,
            planExpansion,
            {
              belowTarget:
                strictCoverageCount < this.expansionStrictCoverageTarget,
              hasUnresolvedTerms,
            },
          );
          strictProbe = await executeStage({
            stage: 'strict',
            restaurantPagination: strictProbePagination,
            dishPagination: strictProbePagination,
            includeSqlPreview: false,
          });
        }
      }

      plan = strictProbe.stagePlan;
      phaseTimings.queryPlanMs = Math.round(strictProbe.timings.planMs);

      // Strict execution for the requested page (needed for lists that do not relax).
      const strictPage =
        pagination.page === 1
          ? strictProbe
          : await executeStage({
              stage: 'strict',
              restaurantPagination: pagination,
              dishPagination: pagination,
              includeSqlPreview,
            });

      const strictRestaurantExactCount = strictProbe.exec.restaurants.length;
      const strictDishExactCount = strictProbe.exec.dishes.length;

      const needsRestaurantRelaxation =
        canRelax && strictRestaurantExactCount < RELAX_STRICT_THRESHOLD;
      const needsDishRelaxation =
        canRelax && strictDishExactCount < RELAX_STRICT_THRESHOLD;

      const primaryFoodTermRaw =
        request.entities.food?.[0]?.originalText ??
        request.entities.food?.[0]?.normalizedName ??
        null;
      const primaryFoodTerm = primaryFoodTermRaw
        ? primaryFoodTermRaw.trim()
        : null;

      // No relaxation: existing behavior.
      if (!needsRestaurantRelaxation && !needsDishRelaxation) {
        phaseTimings.queryExecuteMs = Math.round(strictPage.timings.executeMs);
        if (strictPage.exec.timings) {
          Object.assign(phaseTimings, strictPage.exec.timings);
        }

        const totalRestaurantResults = strictPage.exec.totalRestaurantCount;
        const totalFoodResults = strictPage.exec.totalDishCount;
        const totalResults = totalFoodResults + totalRestaurantResults;

        const [uiCoverageKey, collectionCoverageKey] = await Promise.all([
          this.resolveLocationKey(request),
          this.resolveCollectionCoverageKey(request),
        ]);
        const onDemandLocationKey = request.bounds
          ? collectionCoverageKey
          : null;
        const viewportEligible = this.isViewportEligibleForOnDemand(
          request.bounds,
        );

        const shouldTriggerOnDemand = this.shouldTriggerOnDemand(
          request,
          plan.format,
          strictPage.exec.restaurants.length,
        );
        const onDemandResult = shouldTriggerOnDemand
          ? await this.recordLowResultOnDemand({
              request,
              planFormat: plan.format,
              restaurantCount: strictPage.exec.restaurants.length,
              dishCount: strictPage.exec.dishes.length,
              viewportEligible,
              onDemandLocationKey,
              expansionSignals: expansionAnalysisMetadata,
            })
          : { queued: false, etaMs: undefined };
        const onDemandQueued = onDemandResult.queued;
        const onDemandEtaMs = onDemandResult.etaMs;

        const coverageStatus = this.calculateCoverageStatus({
          request,
          totalFoodResults,
          totalRestaurantResults,
          triggeredOnDemand: onDemandQueued,
        });

        const metadata: SearchResponseMetadataDto = {
          totalFoodResults,
          totalRestaurantResults,
          queryExecutionTimeMs: Date.now() - start,
          searchRequestId,
          boundsApplied: strictPage.exec.metadata.boundsApplied,
          openNowApplied: strictPage.exec.metadata.openNowApplied,
          openNowSupportedRestaurants:
            strictPage.exec.metadata.openNowSupportedRestaurants,
          openNowUnsupportedRestaurants:
            strictPage.exec.metadata.openNowUnsupportedRestaurants,
          openNowUnsupportedRestaurantIds:
            strictPage.exec.metadata.openNowUnsupportedRestaurantIds,
          openNowFilteredOut: strictPage.exec.metadata.openNowFilteredOut,
          priceFilterApplied: strictPage.exec.metadata.priceFilterApplied,
          minimumVotesApplied: strictPage.exec.metadata.minimumVotesApplied,
          page: pagination.page,
          pageSize: pagination.pageSize,
          perRestaurantLimit,
          coverageStatus,
          primaryFoodTerm: primaryFoodTerm || undefined,
          coverageKey: uiCoverageKey ?? null,
          onDemandQueued: onDemandQueued || undefined,
          onDemandEtaMs,
        };

        this.attachPhaseTimings(metadata, phaseTimings);
        this.mergeAnalysisMetadata(metadata, expansionAnalysisMetadata);
        this.attachSearchExplain(metadata, {
          request,
          pagination,
          relaxationCapabilities: relaxation,
          strictCoverageCount,
          hasUnresolvedTerms,
          strictCounts: {
            restaurantsOnPage: strictPage.exec.restaurants.length,
            dishesOnPage: strictPage.exec.dishes.length,
            totalRestaurants: strictPage.exec.totalRestaurantCount,
            totalDishes: strictPage.exec.totalDishCount,
          },
          relaxation: { applied: false, threshold: RELAX_STRICT_THRESHOLD },
          onDemand: {
            triggered: shouldTriggerOnDemand,
            queued: onDemandQueued,
          },
        });

        if (request.openNow && !strictPage.exec.metadata.openNowApplied) {
          this.logger.warn(
            'Open-now filter requested but insufficient metadata to evaluate',
            {
              unsupportedCount:
                strictPage.exec.metadata.openNowUnsupportedRestaurants,
            },
          );
        }

        if (pagination.page === 1) {
          try {
            await this.recordQueryImpressions(
              request,
              {
                searchRequestId,
                totalResults,
                totalFoodResults,
                totalRestaurantResults,
                queryExecutionTimeMs: metadata.queryExecutionTimeMs,
                coverageStatus,
              },
              {
                uiCoverageKey: metadata.coverageKey ?? null,
                collectionCoverageKey,
              },
            );
          } catch (error) {
            this.logger.warn('Failed to record search query impressions', {
              error: {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              },
            });
          }
        }

        this.logger.debug('Search query executed', {
          dishCount: strictPage.exec.dishes.length,
          restaurantCount: strictPage.exec.restaurants.length,
          metadata,
        });

        this.searchMetrics.recordSearchExecution({
          format: plan.format,
          openNow: Boolean(request.openNow),
          durationMs: metadata.queryExecutionTimeMs,
          totalFoodResults,
          openNowFilteredOut: strictPage.exec.metadata.openNowFilteredOut ?? 0,
        });

        return {
          format: plan.format,
          plan,
          dishes: strictPage.exec.dishes,
          restaurants: strictPage.exec.restaurants,
          sqlPreview: includeSqlPreview
            ? (strictPage.exec.sqlPreview ?? null)
            : null,
          metadata,
        };
      }

      // Relaxation path (per-list; still score-ranked). Use strict IDs to exclude duplicates.
      const candidateStages: RelaxationStage[] = [];
      if (relaxation.canDropRestaurantAttributes)
        candidateStages.push('relaxed_restaurant_attributes');
      if (relaxation.canDropFoodAttributes)
        candidateStages.push('relaxed_food_attributes');

      const selectedStage = await this.selectRelaxationStage({
        candidateStages,
        threshold: RELAX_STRICT_THRESHOLD,
        canDropAllModifiers: relaxation.canDropAllModifiers,
        needsRestaurantRelaxation,
        needsDishRelaxation,
        probe: async (stage) => {
          const probeResult = await executeStage({
            stage,
            restaurantPagination: { skip: 0, take: RELAX_STRICT_THRESHOLD },
            dishPagination: { skip: 0, take: RELAX_STRICT_THRESHOLD },
            includeSqlPreview: false,
          });
          return {
            restaurants: probeResult.exec.restaurants,
            dishes: probeResult.exec.dishes,
          };
        },
      });

      const strictRestaurantIds = strictProbe.exec.restaurants
        .map((row) => row.restaurantId)
        .filter((value): value is string => typeof value === 'string');
      const strictConnectionIds = strictProbe.exec.dishes
        .map((row) => row.connectionId)
        .filter((value): value is string => typeof value === 'string');

      const relaxedRestaurantPagination = needsRestaurantRelaxation
        ? (() => {
            const exactCount = strictRestaurantExactCount;
            const relaxedSkip = Math.max(
              0,
              (pagination.page - 1) * pagination.pageSize - exactCount,
            );
            const relaxedTake =
              pagination.page === 1
                ? Math.max(0, pagination.pageSize - exactCount)
                : pagination.pageSize;
            return { skip: relaxedSkip, take: relaxedTake };
          })()
        : pagination;

      const relaxedDishPagination = needsDishRelaxation
        ? (() => {
            const exactCount = strictDishExactCount;
            const relaxedSkip = Math.max(
              0,
              (pagination.page - 1) * pagination.pageSize - exactCount,
            );
            const relaxedTake =
              pagination.page === 1
                ? Math.max(0, pagination.pageSize - exactCount)
                : pagination.pageSize;
            return { skip: relaxedSkip, take: relaxedTake };
          })()
        : pagination;

      const relaxed = await executeStage({
        stage: selectedStage,
        restaurantPagination: relaxedRestaurantPagination,
        dishPagination: relaxedDishPagination,
        excludeRestaurantIds: needsRestaurantRelaxation
          ? strictRestaurantIds
          : undefined,
        excludeConnectionIds: needsDishRelaxation
          ? strictConnectionIds
          : undefined,
        includeSqlPreview,
      });

      phaseTimings.queryExecuteMs = Math.round(relaxed.timings.executeMs);
      if (relaxed.exec.timings) {
        Object.assign(phaseTimings, relaxed.exec.timings);
      }

      const dishes = needsDishRelaxation
        ? pagination.page === 1
          ? [...strictProbe.exec.dishes, ...relaxed.exec.dishes]
          : relaxed.exec.dishes
        : strictPage.exec.dishes;

      const restaurants = needsRestaurantRelaxation
        ? pagination.page === 1
          ? [...strictProbe.exec.restaurants, ...relaxed.exec.restaurants]
          : relaxed.exec.restaurants
        : strictPage.exec.restaurants;

      const totalFoodResults = needsDishRelaxation
        ? strictProbe.exec.totalDishCount + relaxed.exec.totalDishCount
        : strictPage.exec.totalDishCount;
      const totalRestaurantResults = needsRestaurantRelaxation
        ? strictProbe.exec.totalRestaurantCount +
          relaxed.exec.totalRestaurantCount
        : strictPage.exec.totalRestaurantCount;
      const totalResults = totalFoodResults + totalRestaurantResults;

      const [uiCoverageKey, collectionCoverageKey] = await Promise.all([
        this.resolveLocationKey(request),
        this.resolveCollectionCoverageKey(request),
      ]);
      const onDemandLocationKey = request.bounds ? collectionCoverageKey : null;
      const viewportEligible = this.isViewportEligibleForOnDemand(
        request.bounds,
      );

      const shouldTriggerOnDemand = this.shouldTriggerOnDemand(
        request,
        plan.format,
        strictRestaurantExactCount,
      );
      const onDemandResult = shouldTriggerOnDemand
        ? await this.recordLowResultOnDemand({
            request,
            planFormat: plan.format,
            restaurantCount: strictRestaurantExactCount,
            dishCount: strictDishExactCount,
            viewportEligible,
            onDemandLocationKey,
            expansionSignals: expansionAnalysisMetadata,
            relaxation: {
              stage: selectedStage,
              threshold: RELAX_STRICT_THRESHOLD,
              dropped: {
                foodAttributes:
                  selectedStage === 'relaxed_food_attributes' ||
                  selectedStage === 'relaxed_modifiers',
                restaurantAttributes:
                  selectedStage === 'relaxed_restaurant_attributes' ||
                  selectedStage === 'relaxed_modifiers',
              },
            },
          })
        : { queued: false, etaMs: undefined };
      const onDemandQueued = onDemandResult.queued;

      const coverageStatus = this.calculateCoverageStatus({
        request,
        totalFoodResults,
        totalRestaurantResults,
        triggeredOnDemand: onDemandQueued,
      });

      const metadata: SearchResponseMetadataDto = {
        totalFoodResults,
        totalRestaurantResults,
        queryExecutionTimeMs: Date.now() - start,
        searchRequestId,
        boundsApplied:
          strictPage.exec.metadata.boundsApplied ||
          relaxed.exec.metadata.boundsApplied,
        openNowApplied:
          strictPage.exec.metadata.openNowApplied ||
          relaxed.exec.metadata.openNowApplied,
        openNowSupportedRestaurants:
          (strictPage.exec.metadata.openNowSupportedRestaurants ?? 0) +
          (relaxed.exec.metadata.openNowSupportedRestaurants ?? 0),
        openNowUnsupportedRestaurants:
          (strictPage.exec.metadata.openNowUnsupportedRestaurants ?? 0) +
          (relaxed.exec.metadata.openNowUnsupportedRestaurants ?? 0),
        openNowUnsupportedRestaurantIds: Array.from(
          new Set([
            ...(strictPage.exec.metadata.openNowUnsupportedRestaurantIds ?? []),
            ...(relaxed.exec.metadata.openNowUnsupportedRestaurantIds ?? []),
          ]),
        ),
        openNowFilteredOut:
          (strictPage.exec.metadata.openNowFilteredOut ?? 0) +
          (relaxed.exec.metadata.openNowFilteredOut ?? 0),
        priceFilterApplied:
          strictPage.exec.metadata.priceFilterApplied ||
          relaxed.exec.metadata.priceFilterApplied,
        minimumVotesApplied:
          strictPage.exec.metadata.minimumVotesApplied ||
          relaxed.exec.metadata.minimumVotesApplied,
        page: pagination.page,
        pageSize: pagination.pageSize,
        perRestaurantLimit,
        coverageStatus,
        primaryFoodTerm: primaryFoodTerm || undefined,
        coverageKey: uiCoverageKey ?? null,
        onDemandQueued: onDemandQueued || undefined,
        onDemandEtaMs: undefined,
        exactDishCountOnPage:
          needsDishRelaxation && pagination.page === 1
            ? strictDishExactCount
            : undefined,
        exactRestaurantCountOnPage:
          needsRestaurantRelaxation && pagination.page === 1
            ? strictRestaurantExactCount
            : undefined,
        relaxationApplied:
          (needsRestaurantRelaxation || needsDishRelaxation) &&
          pagination.page === 1
            ? true
            : undefined,
        relaxationStage: selectedStage,
      };

      this.attachPhaseTimings(metadata, phaseTimings);
      this.mergeAnalysisMetadata(metadata, expansionAnalysisMetadata);
      this.attachSearchExplain(metadata, {
        request,
        pagination,
        relaxationCapabilities: relaxation,
        strictCoverageCount,
        hasUnresolvedTerms,
        strictCounts: {
          restaurantsOnPage: strictRestaurantExactCount,
          dishesOnPage: strictDishExactCount,
          totalRestaurants: strictProbe.exec.totalRestaurantCount,
          totalDishes: strictProbe.exec.totalDishCount,
        },
        relaxation: {
          applied: true,
          stage: selectedStage,
          threshold: RELAX_STRICT_THRESHOLD,
        },
        onDemand: {
          triggered: shouldTriggerOnDemand,
          queued: onDemandQueued,
        },
      });

      if (
        request.openNow &&
        !strictPage.exec.metadata.openNowApplied &&
        !relaxed.exec.metadata.openNowApplied
      ) {
        this.logger.warn(
          'Open-now filter requested but insufficient metadata to evaluate',
          { unsupportedCount: metadata.openNowUnsupportedRestaurants },
        );
      }

      if (pagination.page === 1) {
        try {
          await this.recordQueryImpressions(
            request,
            {
              searchRequestId,
              totalResults,
              totalFoodResults,
              totalRestaurantResults,
              queryExecutionTimeMs: metadata.queryExecutionTimeMs,
              coverageStatus,
            },
            { uiCoverageKey, collectionCoverageKey },
          );
        } catch (error) {
          this.logger.warn('Failed to record search query impressions', {
            error: {
              message: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined,
            },
          });
        }
      }

      this.logger.debug('Search query executed', {
        dishCount: dishes.length,
        restaurantCount: restaurants.length,
        metadata,
      });

      this.searchMetrics.recordSearchExecution({
        format: plan.format,
        openNow: Boolean(request.openNow),
        durationMs: metadata.queryExecutionTimeMs,
        totalFoodResults,
        openNowFilteredOut: metadata.openNowFilteredOut ?? 0,
      });

      return {
        format: plan.format,
        plan,
        dishes,
        restaurants,
        sqlPreview: includeSqlPreview
          ? (relaxed.exec.sqlPreview ?? null)
          : null,
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

  private buildExecutionDirectives(
    constraints: SearchConstraints,
    planExpansion: PlanExpansionState | null,
  ): SearchExecutionDirectives | undefined {
    if (!constraints.primaryFoodAttributeQuery) {
      return undefined;
    }

    const textFoodIds =
      planExpansion?.foodIdsFromPrimaryFoodAttributeText ?? [];
    return {
      primaryFoodAttributeQuery: true,
      primaryFoodAttributeTextFoodIds: textFoodIds.length
        ? textFoodIds
        : undefined,
    };
  }

  private async executeSearchStage(params: {
    request: SearchQueryRequestDto;
    stage: RelaxationStage;
    planExpansion: PlanExpansionState | null;
    pagination: PaginationState;
    restaurantPagination: { skip: number; take: number };
    dishPagination: { skip: number; take: number };
    topDishesLimit: number;
    includeSqlPreview?: boolean;
    excludeRestaurantIds?: string[];
    excludeConnectionIds?: string[];
  }): Promise<StageExecutionResult> {
    const planStart = performance.now();
    const priceLevels = this.normalizePriceLevels(params.request.priceLevels);
    const minimumVotes = this.normalizeMinimumVotes(
      params.request.minimumVotes,
    );
    const constraints = this.buildSearchConstraints(
      params.request,
      params.stage,
      {
        format: 'dual_list',
        priceLevels,
        minimumVotes,
      },
    );
    const basePlan = compileQueryPlanFromConstraints(constraints);
    const stagePlan = params.planExpansion
      ? this.applyPlanExpansion(basePlan, params.planExpansion)
      : basePlan;
    const planMs = performance.now() - planStart;

    const directives = this.buildExecutionDirectives(
      constraints,
      params.planExpansion,
    );

    const executeStart = performance.now();
    const exec = await this.queryExecutor.executeDual({
      plan: stagePlan,
      request: params.request,
      pagination: params.pagination,
      restaurantPagination: params.restaurantPagination,
      dishPagination: params.dishPagination,
      topDishesLimit: params.topDishesLimit,
      includeSqlPreview: params.includeSqlPreview,
      excludeRestaurantIds: params.excludeRestaurantIds,
      excludeConnectionIds: params.excludeConnectionIds,
      directives,
    });
    const executeMs = performance.now() - executeStart;

    return { stagePlan, exec, timings: { planMs, executeMs } };
  }

  private buildSearchConstraints(
    request: SearchQueryRequestDto,
    stage: RelaxationStage,
    inputs: {
      format: QueryPlan['format'];
      priceLevels: number[];
      minimumVotes: number | null;
    },
  ): SearchConstraints {
    const inputPresence = this.getEntityPresenceSummary(request);
    const stagePresence = { ...inputPresence };

    if (stage === 'relaxed_food_attributes' || stage === 'relaxed_modifiers') {
      stagePresence.foodAttributes = 0;
    }
    if (
      stage === 'relaxed_restaurant_attributes' ||
      stage === 'relaxed_modifiers'
    ) {
      stagePresence.restaurantAttributes = 0;
    }

    const hadFoodGroup = Boolean(request.entities.food?.length);
    const hadRestaurantGroup = Boolean(request.entities.restaurants?.length);
    const hadFoodAttributeGroup = Boolean(
      request.entities.foodAttributes?.length,
    );
    const hadRestaurantAttributeGroup = Boolean(
      request.entities.restaurantAttributes?.length,
    );

    const primaryFoodAttributeQuery =
      !hadFoodGroup && !hadRestaurantGroup && hadFoodAttributeGroup;

    const foodAttributeIds =
      stagePresence.foodAttributes > 0
        ? this.collectEntityIds(request.entities.foodAttributes)
        : [];
    const restaurantAttributeIds =
      stagePresence.restaurantAttributes > 0
        ? this.collectEntityIds(request.entities.restaurantAttributes)
        : [];

    return {
      stage,
      format: inputs.format,
      inputPresence,
      stagePresence,
      hadFoodGroup,
      hadRestaurantGroup,
      hadFoodAttributeGroup,
      hadRestaurantAttributeGroup,
      primaryFoodAttributeQuery,
      ids: {
        restaurantIds: this.collectEntityIds(request.entities.restaurants),
        foodIds: this.collectEntityIds(request.entities.food),
        foodAttributeIds,
        restaurantAttributeIds,
      },
      filters: {
        bounds: request.bounds,
        openNow: Boolean(request.openNow),
        priceLevels: inputs.priceLevels,
        minimumVotes: inputs.minimumVotes,
      },
      unresolved: {
        groups: request.submissionContext?.unresolvedEntities ?? [],
      },
    };
  }

  private resolveRelaxationCapabilities(
    request: SearchQueryRequestDto,
  ): RelaxationCapabilities {
    const hasFoodAttributes = Boolean(request.entities.foodAttributes?.length);
    const hasRestaurantAttributes = Boolean(
      request.entities.restaurantAttributes?.length,
    );
    const hasPrimaryEntities = Boolean(
      request.entities.food?.length || request.entities.restaurants?.length,
    );

    const canDropFoodAttributes = hasFoodAttributes
      ? hasPrimaryEntities || hasRestaurantAttributes
      : false;
    const canDropRestaurantAttributes = hasRestaurantAttributes
      ? hasPrimaryEntities || hasFoodAttributes
      : false;
    const canDropAllModifiers = hasPrimaryEntities;
    const canRelax = canDropFoodAttributes || canDropRestaurantAttributes;

    return {
      hasFoodAttributes,
      hasRestaurantAttributes,
      hasPrimaryEntities,
      canDropFoodAttributes,
      canDropRestaurantAttributes,
      canDropAllModifiers,
      canRelax,
    };
  }

  private async selectRelaxationStage(params: {
    candidateStages: RelaxationStage[];
    threshold: number;
    canDropAllModifiers: boolean;
    needsRestaurantRelaxation: boolean;
    needsDishRelaxation: boolean;
    probe: (
      stage: RelaxationStage,
    ) => Promise<{ restaurants: unknown[]; dishes: unknown[] }>;
  }): Promise<RelaxationStage> {
    const {
      candidateStages,
      threshold,
      canDropAllModifiers,
      needsRestaurantRelaxation,
      needsDishRelaxation,
      probe,
    } = params;

    const scoreCounts = (counts: { restaurants: number; dishes: number }) => {
      if (needsRestaurantRelaxation && needsDishRelaxation) {
        return Math.min(counts.restaurants, counts.dishes);
      }
      if (needsRestaurantRelaxation) {
        return counts.restaurants;
      }
      return counts.dishes;
    };

    const cache = new Map<
      RelaxationStage,
      { restaurants: number; dishes: number }
    >();
    const probeCounts = async (stage: RelaxationStage) => {
      const cached = cache.get(stage);
      if (cached) {
        return cached;
      }
      const result = await probe(stage);
      const counts = {
        restaurants: result.restaurants.length,
        dishes: result.dishes.length,
      };
      cache.set(stage, counts);
      return counts;
    };

    let selectedStage: RelaxationStage = canDropAllModifiers
      ? 'relaxed_modifiers'
      : (candidateStages[0] ?? 'strict');

    if (candidateStages.length === 1) {
      selectedStage = candidateStages[0];
    } else if (candidateStages.length === 2) {
      const [a, b] = candidateStages;
      const aCounts = await probeCounts(a);
      const bCounts = await probeCounts(b);
      selectedStage = scoreCounts(aCounts) >= scoreCounts(bCounts) ? a : b;
    }

    if (canDropAllModifiers && selectedStage !== 'relaxed_modifiers') {
      const selectedCounts = await probeCounts(selectedStage);
      if (scoreCounts(selectedCounts) < threshold) {
        selectedStage = 'relaxed_modifiers';
      }
    }

    return selectedStage;
  }

  private attachPhaseTimings(
    metadata: SearchResponseMetadataDto,
    phaseTimings: Record<string, number>,
  ): void {
    if (!this.includePhaseTimings || Object.keys(phaseTimings).length === 0) {
      return;
    }
    const existing =
      metadata.analysisMetadata && typeof metadata.analysisMetadata === 'object'
        ? metadata.analysisMetadata
        : {};
    const existingPhaseTimings =
      typeof existing.phaseTimings === 'object' &&
      existing.phaseTimings !== null
        ? (existing.phaseTimings as Record<string, number>)
        : {};
    metadata.analysisMetadata = {
      ...existing,
      phaseTimings: { ...existingPhaseTimings, ...phaseTimings },
    };
  }

  private mergeAnalysisMetadata(
    metadata: SearchResponseMetadataDto,
    patch: Record<string, unknown> | null,
  ): void {
    if (!patch || Object.keys(patch).length === 0) {
      return;
    }
    const existing =
      metadata.analysisMetadata && typeof metadata.analysisMetadata === 'object'
        ? metadata.analysisMetadata
        : {};
    metadata.analysisMetadata = { ...existing, ...patch };
  }

  private attachSearchExplain(
    metadata: SearchResponseMetadataDto,
    input: SearchExplainInput,
  ): void {
    if (!this.explainEnabled) {
      return;
    }
    const explain = this.buildSearchExplain(input);
    const existing =
      metadata.analysisMetadata && typeof metadata.analysisMetadata === 'object'
        ? metadata.analysisMetadata
        : {};
    metadata.analysisMetadata = { ...existing, searchExplain: explain };
  }

  private buildSearchExplain(
    input: SearchExplainInput,
  ): Record<string, unknown> {
    const presence = this.getEntityPresenceSummary(input.request);
    const unresolvedGroups =
      input.request.submissionContext?.unresolvedEntities ?? [];
    const unresolvedGroupCount = unresolvedGroups.length;
    const unresolvedTermCount = unresolvedGroups.reduce(
      (acc, group) => acc + (group.terms?.length ?? 0),
      0,
    );

    const explainStage: RelaxationStage = input.relaxation.stage ?? 'strict';
    const priceLevels = this.normalizePriceLevels(input.request.priceLevels);
    const minimumVotes = this.normalizeMinimumVotes(input.request.minimumVotes);
    const constraints = this.buildSearchConstraints(
      input.request,
      explainStage,
      {
        format: 'dual_list',
        priceLevels,
        minimumVotes,
      },
    );

    return {
      pagination: {
        page: input.pagination.page,
        pageSize: input.pagination.pageSize,
      },
      presence,
      constraints: {
        stage: constraints.stage,
        stagePresence: constraints.stagePresence,
        ids: {
          restaurants: constraints.ids.restaurantIds.length,
          foods: constraints.ids.foodIds.length,
          foodAttributes: constraints.ids.foodAttributeIds.length,
          restaurantAttributes: constraints.ids.restaurantAttributeIds.length,
        },
        filters: {
          bounds: Boolean(constraints.filters.bounds),
          openNow: Boolean(constraints.filters.openNow),
          priceLevels: constraints.filters.priceLevels.length,
          minimumVotes: constraints.filters.minimumVotes,
        },
      },
      submission: {
        source: input.request.submissionSource ?? null,
        matchType: input.request.submissionContext?.matchType ?? null,
        typedPrefixLength:
          input.request.submissionContext?.typedPrefix?.length ?? 0,
        selectedEntityType:
          input.request.submissionContext?.selectedEntityType ?? null,
        unresolvedGroupCount,
        unresolvedTermCount,
      },
      strict: {
        coverageCount: input.strictCoverageCount,
        counts: input.strictCounts,
      },
      expansion: {
        strictCoverageTarget: this.expansionStrictCoverageTarget,
        hasUnresolvedTerms: input.hasUnresolvedTerms,
      },
      relaxation: {
        ...input.relaxation,
        capabilities: input.relaxationCapabilities,
      },
      onDemand: input.onDemand,
    };
  }

  private async recordLowResultOnDemand(params: {
    request: SearchQueryRequestDto;
    planFormat: QueryPlan['format'];
    restaurantCount: number;
    dishCount: number;
    viewportEligible: boolean;
    onDemandLocationKey: string | null;
    expansionSignals?: Record<string, unknown> | null;
    relaxation?: {
      stage: RelaxationStage;
      threshold: number;
      dropped: { foodAttributes: boolean; restaurantAttributes: boolean };
    };
  }): Promise<{ queued: boolean; etaMs?: number }> {
    try {
      const lowResultRequests = this.buildLowResultRequests(
        params.request,
        params.onDemandLocationKey,
      );
      if (!lowResultRequests.length) {
        return { queued: false, etaMs: undefined };
      }

      const context: Record<string, unknown> = {
        source: 'low_result',
        restaurantCount: params.restaurantCount,
        foodCount: params.dishCount,
        planFormat: params.planFormat,
        bounds: params.request.bounds,
        openNow: params.request.openNow,
        ...(params.expansionSignals
          ? { signals: params.expansionSignals }
          : {}),
      };

      if (params.relaxation) {
        context.counts = {
          stage: 'strict',
          page: {
            restaurants: params.restaurantCount,
            dishes: params.dishCount,
          },
        };
        context.relaxation = {
          ran: true,
          toStage: params.relaxation.stage,
          threshold: params.relaxation.threshold,
          dropped: params.relaxation.dropped,
        };
      }

      const fallbackLocation = this.resolveFallbackLocation(params.request);
      if (fallbackLocation) {
        context.location = fallbackLocation;
      }
      const locationBias = this.buildLocationBias(params.request);
      if (locationBias) {
        context.locationBias = locationBias;
      }

      const record = async () =>
        this.onDemandRequestService.recordRequests(
          lowResultRequests,
          { userId: params.request.userId ?? null },
          context,
        );

      if (params.viewportEligible && params.onDemandLocationKey) {
        const recorded = await record();
        return { queued: recorded.length > 0, etaMs: undefined };
      }
      if (!params.onDemandLocationKey) {
        const recorded = await record();
        return { queued: recorded.length > 0, etaMs: undefined };
      }

      return { queued: false, etaMs: undefined };
    } catch (error) {
      this.logger.warn('Failed to handle low-result on-demand requests', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return { queued: false, etaMs: undefined };
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
    if (!this.isDevEnvironment) {
      return false;
    }
    if (this.alwaysIncludeSqlPreview) {
      return true;
    }
    if (request.includeSqlPreview === true) {
      return true;
    }
    if (request.includeSqlPreview === false) {
      return false;
    }
    return false;
  }

  private shouldTriggerOnDemand(
    request: SearchQueryRequestDto,
    _format: QueryPlan['format'],
    restaurantCount: number,
  ): boolean {
    // Trigger on-demand primarily when restaurant coverage is low for food-driven queries.
    // (Dish coverage can be high even when restaurant list is under-covered.)
    if (restaurantCount >= this.onDemandMinResults) {
      return false;
    }
    return Boolean(
      request.entities.food?.length || request.entities.foodAttributes?.length,
    );
  }

  private normalizeMinimumVotes(value?: number | null): number | null {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return null;
    }
    const normalized = Math.max(0, Math.floor(value));
    return normalized > 0 ? normalized : null;
  }

  private collectEntityIds(entities: QueryEntityDto[] = []): string[] {
    if (!entities.length) {
      return [];
    }
    const ids = entities.flatMap((entity) => entity.entityIds).filter(Boolean);
    return Array.from(new Set(ids));
  }

  private async recordQueryImpressions(
    request: SearchQueryRequestDto,
    context: {
      searchRequestId: string;
      totalResults: number;
      totalFoodResults: number;
      totalRestaurantResults: number;
      queryExecutionTimeMs: number;
      coverageStatus: 'full' | 'partial' | 'unresolved';
    },
    coverageKeys?: {
      uiCoverageKey: string | null;
      collectionCoverageKey: string | null;
    },
  ): Promise<void> {
    const targets = this.gatherEntityImpressionTargets(request);
    if (!targets.length) {
      return;
    }

    const now = new Date();
    const resolvedCoverageKeys = coverageKeys ?? {
      uiCoverageKey: await this.resolveLocationKey(request),
      collectionCoverageKey: await this.resolveCollectionCoverageKey(request),
    };

    await this.recordSearchLogEntries(
      request,
      targets,
      now,
      request.userId,
      context,
      resolvedCoverageKeys,
    );
  }

  private normalizePriceLevels(levels?: number[]): number[] {
    if (!Array.isArray(levels)) {
      return [];
    }
    const normalized = levels
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 4);
    return Array.from(new Set(normalized)).sort((a, b) => a - b);
  }

  private gatherEntityImpressionTargets(
    request: SearchQueryRequestDto,
  ): { entityId: string; entityType: EntityType }[] {
    const selectedEntityId =
      request.submissionContext?.selectedEntityId ?? null;
    const selectedEntityType =
      request.submissionContext?.selectedEntityType ?? null;

    if (selectedEntityId && selectedEntityType) {
      return [{ entityId: selectedEntityId, entityType: selectedEntityType }];
    }

    const candidates: Array<{
      entityId: string;
      entityType: EntityType;
      specificity: number;
      term: string;
    }> = [];

    const pushMostSpecific = (
      entities: QueryEntityDto[] | undefined,
      entityType: EntityType,
    ) => {
      for (const entity of entities ?? []) {
        const entityId = entity.entityIds?.[0] ?? null;
        if (!entityId) {
          continue;
        }

        const rawTerm = entity.originalText ?? entity.normalizedName ?? '';
        const stripped = stripGenericTokens(rawTerm);
        if (stripped.isGenericOnly) {
          continue;
        }

        const term = stripped.text.trim();
        if (!term.length) {
          continue;
        }

        candidates.push({
          entityId,
          entityType,
          specificity: term.length,
          term,
        });
      }
    };

    pushMostSpecific(request.entities.food, 'food');
    pushMostSpecific(request.entities.restaurants, 'restaurant');
    pushMostSpecific(request.entities.foodAttributes, 'food_attribute');
    pushMostSpecific(
      request.entities.restaurantAttributes,
      'restaurant_attribute',
    );

    if (!candidates.length) {
      return [];
    }

    candidates.sort((a, b) => b.specificity - a.specificity);
    const primary = candidates[0];
    if (!primary) {
      return [];
    }

    this.logger.debug('Selected primary search attribution target', {
      entityId: primary.entityId,
      entityType: primary.entityType,
      term: primary.term,
    });

    return [{ entityId: primary.entityId, entityType: primary.entityType }];
  }

  private async recordSearchLogEntries(
    request: SearchQueryRequestDto,
    targets: { entityId: string; entityType: EntityType }[],
    loggedAt: Date,
    userId?: string,
    context?: {
      searchRequestId: string;
      totalResults: number;
      totalFoodResults: number;
      totalRestaurantResults: number;
      queryExecutionTimeMs: number;
      coverageStatus: 'full' | 'partial' | 'unresolved';
    },
    coverageKeys?: {
      uiCoverageKey: string | null;
      collectionCoverageKey: string | null;
    },
  ): Promise<void> {
    if (
      !this.searchLogEnabled ||
      !targets.length ||
      !context?.searchRequestId
    ) {
      return;
    }

    try {
      const locationKey = coverageKeys?.uiCoverageKey ?? null;
      const collectionCoverageKey = coverageKeys?.collectionCoverageKey ?? null;
      const filtersApplied = {
        openNow: Boolean(request.openNow),
        priceLevels: this.normalizePriceLevels(request.priceLevels),
        minimumVotes:
          typeof request.minimumVotes === 'number'
            ? request.minimumVotes
            : null,
      };
      const submissionContext = request.submissionContext
        ? {
            typedPrefix: request.submissionContext.typedPrefix ?? null,
            matchType: request.submissionContext.matchType ?? null,
            selectedEntityId:
              request.submissionContext.selectedEntityId ?? null,
            selectedEntityType:
              request.submissionContext.selectedEntityType ?? null,
          }
        : null;
      const metadata = {
        filtersApplied,
        submissionSource: request.submissionSource ?? null,
        submissionContext,
      };
      const rows = targets.map(({ entityId, entityType }) => ({
        entityId,
        entityType,
        locationKey,
        collectionCoverageKey,
        queryText: request.sourceQuery ?? null,
        searchRequestId: context.searchRequestId,
        totalResults: context.totalResults,
        totalFoodResults: context.totalFoodResults,
        totalRestaurantResults: context.totalRestaurantResults,
        queryExecutionTimeMs: context.queryExecutionTimeMs,
        coverageStatus: context.coverageStatus,
        source: SearchLogSource.search,
        metadata,
        loggedAt,
        userId: userId ?? null,
      }));

      await this.prisma.searchLog.createMany({
        data: rows,
        skipDuplicates: true,
      });
    } catch (error) {
      this.logger.warn('Failed to log search impressions', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    }
  }

  private async resolveLocationKey(
    request: SearchQueryRequestDto,
  ): Promise<string | null> {
    try {
      const fallbackLocation = this.resolveFallbackLocation(request);
      const match = await this.subredditResolver.resolvePrimary({
        bounds: request.bounds ?? null,
        fallbackLocation: fallbackLocation ?? null,
        referenceLocations: fallbackLocation ? [fallbackLocation] : undefined,
      });

      if (match) {
        return match.toLowerCase();
      }

      if (request.bounds) {
        const created = await this.coverageRegistry.resolveOrCreateCoverage({
          bounds: request.bounds,
          fallbackLocation: fallbackLocation ?? null,
        });
        return created.coverageKey ?? null;
      }

      return null;
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
    request: SearchQueryRequestDto,
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

  recordResultClick(dto: SearchResultClickDto): void {
    this.logger.debug('Search result click recorded', {
      entityId: dto.entityId,
      entityType: dto.entityType,
    });
  }

  async listRecentSearches(
    userId: string,
    limit?: number,
  ): Promise<SearchHistoryEntry[]> {
    if (!userId) {
      return [];
    }
    const take = Math.max(1, Math.min(limit ?? 8, 50));
    const fetchLimit = Math.min(take * 5, 250);
    const rows = await this.prisma.searchLog.findMany({
      where: {
        userId,
        source: SearchLogSource.search,
        queryText: { not: null },
      },
      orderBy: {
        loggedAt: 'desc',
      },
      take: fetchLimit,
      select: {
        queryText: true,
        loggedAt: true,
        metadata: true,
        entityId: true,
        entityType: true,
        entity: {
          select: {
            name: true,
          },
        },
      },
    });

    const fallbackTimestamp = new Date().toISOString();
    const entries: SearchHistoryEntry[] = [];
    const entriesByQuery = new Map<string, SearchHistoryEntry>();

    for (const row of rows) {
      const queryText =
        typeof row.queryText === 'string' ? row.queryText.trim() : '';
      if (!queryText) {
        continue;
      }
      const normalizedQuery = queryText.toLowerCase();
      const selection =
        this.extractSelectedEntity(row.metadata) ??
        this.resolveSelectionFromSearchLogRow({
          queryText,
          entityId: row.entityId,
          entityType: row.entityType,
          entityName: row.entity?.name ?? null,
        });

      const existing = entriesByQuery.get(normalizedQuery);
      if (!existing) {
        const entry: SearchHistoryEntry = {
          queryText,
          lastSearchedAt: row.loggedAt?.toISOString() ?? fallbackTimestamp,
          selectedEntityId: selection?.entityId ?? null,
          selectedEntityType: selection?.entityType ?? null,
        };
        entriesByQuery.set(normalizedQuery, entry);
        entries.push(entry);
      } else if (!existing.selectedEntityId && selection) {
        existing.selectedEntityId = selection.entityId;
        existing.selectedEntityType = selection.entityType;
      }
    }

    const trimmedEntries = entries.slice(0, take);
    const restaurantIds = Array.from(
      new Set(
        trimmedEntries
          .filter(
            (entry) =>
              entry.selectedEntityType === EntityType.restaurant &&
              Boolean(entry.selectedEntityId),
          )
          .map((entry) => entry.selectedEntityId!)
          .filter(Boolean),
      ),
    );

    if (restaurantIds.length === 0) {
      return trimmedEntries;
    }

    const previews = await this.restaurantStatusService.getStatusPreviews({
      restaurantIds,
    });
    const previewMap = new Map(
      previews.map((preview) => [preview.restaurantId, preview]),
    );

    return trimmedEntries.map((entry) => {
      if (
        entry.selectedEntityType !== EntityType.restaurant ||
        !entry.selectedEntityId
      ) {
        return entry;
      }
      return {
        ...entry,
        statusPreview: previewMap.get(entry.selectedEntityId) ?? null,
      };
    });
  }

  private extractSelectedEntity(
    metadataValue: unknown,
  ): { entityId: string; entityType: EntityType } | null {
    if (
      !metadataValue ||
      typeof metadataValue !== 'object' ||
      Array.isArray(metadataValue)
    ) {
      return null;
    }
    const metadata = metadataValue as Record<string, unknown>;
    const submissionContextValue = metadata.submissionContext;
    if (
      !submissionContextValue ||
      typeof submissionContextValue !== 'object' ||
      Array.isArray(submissionContextValue)
    ) {
      return null;
    }
    const submissionContext = submissionContextValue as Record<string, unknown>;
    const selectedEntityId =
      typeof submissionContext.selectedEntityId === 'string'
        ? submissionContext.selectedEntityId
        : null;
    const selectedEntityType =
      typeof submissionContext.selectedEntityType === 'string'
        ? submissionContext.selectedEntityType
        : null;
    if (!selectedEntityId || !selectedEntityType) {
      return null;
    }
    const entityType = Object.values(EntityType).includes(
      selectedEntityType as EntityType,
    )
      ? (selectedEntityType as EntityType)
      : null;
    if (!entityType) {
      return null;
    }
    return { entityId: selectedEntityId, entityType };
  }

  private resolveSelectionFromSearchLogRow(params: {
    queryText: string;
    entityId: string;
    entityType: EntityType;
    entityName?: string | null;
  }): { entityId: string; entityType: EntityType } | null {
    if (params.entityType !== EntityType.restaurant) {
      return null;
    }
    const queryText = params.queryText.trim().toLowerCase();
    const entityName =
      typeof params.entityName === 'string'
        ? params.entityName.trim().toLowerCase()
        : '';
    if (!queryText || !entityName || queryText !== entityName) {
      return null;
    }
    return { entityId: params.entityId, entityType: EntityType.restaurant };
  }

  private calculateCoverageStatus(params: {
    request: SearchQueryRequestDto;
    totalFoodResults: number;
    totalRestaurantResults: number;
    triggeredOnDemand: boolean;
  }): 'full' | 'partial' | 'unresolved' {
    const {
      request,
      totalFoodResults,
      totalRestaurantResults,
      triggeredOnDemand,
    } = params;

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

  private resolveFallbackLocation(
    request: SearchQueryRequestDto,
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

  private buildLocationBias(request: SearchQueryRequestDto):
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

  private buildLowResultRequests(
    request: SearchQueryRequestDto,
    locationKey: string | null,
  ): OnDemandRequestInput[] {
    const results: OnDemandRequestInput[] = [];
    const seen = new Set<string>();
    const reason: OnDemandReason = 'low_result';
    const resolvedLocationKey = locationKey ?? 'global';

    const pushEntities = (
      entities: QueryEntityDto[] | undefined,
      entityType: EntityType,
    ) => {
      for (const entity of entities ?? []) {
        const entityId = entity.entityIds?.[0] ?? null;
        const baseTerm =
          entity.normalizedName || entity.originalText || entityId;
        if (!baseTerm) {
          continue;
        }
        const sanitizedTerm = baseTerm.trim();
        if (!sanitizedTerm.length) {
          continue;
        }
        const dedupeKey = `${entityType}:${(
          entityId ?? sanitizedTerm
        ).toLowerCase()}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);
        results.push({
          term: sanitizedTerm,
          entityType,
          reason,
          entityId,
          locationKey: resolvedLocationKey,
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
    return 0;
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

  private resolveIsDevEnvironment(): boolean {
    const appEnv = (process.env.APP_ENV || process.env.CRAVE_ENV || '').trim();
    const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
    const isProd = appEnv.toLowerCase() === 'prod' || nodeEnv === 'production';
    return !isProd;
  }

  private resolveAlwaysIncludeSqlPreview(): boolean {
    if (!this.isDevEnvironment) {
      return false;
    }
    const raw = process.env.SEARCH_ALWAYS_INCLUDE_SQL_PREVIEW || '';
    if (raw) {
      return raw.toLowerCase() === 'true';
    }
    return true;
  }

  private resolveSearchLogEnabled(): boolean {
    const raw = process.env.SEARCH_LOG_ENABLED;
    if (typeof raw === 'string' && raw.length > 0) {
      return raw.toLowerCase() === 'true';
    }
    return true;
  }

  private resolveIncludePhaseTimings(): boolean {
    const raw = process.env.SEARCH_INCLUDE_PHASE_TIMINGS;
    if (typeof raw === 'string' && raw.length > 0) {
      return raw.toLowerCase() === 'true';
    }
    return false;
  }

  private resolveExplainEnabled(): boolean {
    const raw = process.env.SEARCH_EXPLAIN_ENABLED;
    if (typeof raw === 'string' && raw.length > 0) {
      return raw.toLowerCase() === 'true';
    }
    return this.isDevEnvironment;
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

  private resolveExpansionStrictCoverageTarget(): number {
    const raw = process.env.SEARCH_EXPANSION_STRICT_COVERAGE_TARGET;
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return Math.min(Math.max(0, Math.floor(parsed)), 200);
      }
    }
    return 25;
  }

  private resolveExpansionFoodCap(): number {
    const raw = process.env.SEARCH_EXPANSION_FOOD_CAP;
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.min(Math.max(1, Math.floor(parsed)), 50);
      }
    }
    return 25;
  }

  private resolveExpansionAttributeCap(): number {
    const raw = process.env.SEARCH_EXPANSION_ATTRIBUTE_CAP;
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.min(Math.max(1, Math.floor(parsed)), 50);
      }
    }
    return 15;
  }

  private resolveExpansionMaxTermsPerType(): number {
    const raw = process.env.SEARCH_EXPANSION_MAX_TERMS_PER_TYPE;
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.min(Math.max(1, Math.floor(parsed)), 5);
      }
    }
    return 3;
  }

  private hasEntityTargets(request: SearchQueryRequestDto): boolean {
    return Boolean(
      request.entities.food?.length ||
        request.entities.foodAttributes?.length ||
        request.entities.restaurants?.length ||
        request.entities.restaurantAttributes?.length,
    );
  }

  private isPrimaryFoodAttributeQuery(request: SearchQueryRequestDto): boolean {
    const hasFood = Boolean(request.entities.food?.length);
    const hasRestaurant = Boolean(request.entities.restaurants?.length);
    return (
      !hasFood &&
      !hasRestaurant &&
      Boolean(request.entities.foodAttributes?.length)
    );
  }

  private hasPlanExpansion(expansion: PlanExpansionState): boolean {
    return Boolean(
      expansion.foodIds.length ||
        expansion.foodAttributeIds.length ||
        expansion.restaurantAttributeIds.length ||
        expansion.foodIdsFromPrimaryFoodAttributeText.length,
    );
  }

  private buildExpansionMetadata(
    strictCoverageCount: number,
    expansion: PlanExpansionState,
    trigger: { belowTarget: boolean; hasUnresolvedTerms: boolean },
  ): Record<string, unknown> {
    return {
      idExpansion: {
        strictCoverageCount,
        strictCoverageTarget: this.expansionStrictCoverageTarget,
        trigger,
        foodsAdded: expansion.foodIds.length,
        foodAttributesAdded: expansion.foodAttributeIds.length,
        restaurantAttributesAdded: expansion.restaurantAttributeIds.length,
        foodsFromPrimaryFoodAttributeTextAdded:
          expansion.foodIdsFromPrimaryFoodAttributeText.length,
      },
    };
  }

  private async buildPlanExpansionForRequest(
    request: SearchQueryRequestDto,
    plan: QueryPlan,
  ): Promise<PlanExpansionState | null> {
    const existingFoodIds = new Set<string>();
    const existingFoodAttributeIds = new Set<string>();
    const existingRestaurantAttributeIds = new Set<string>();

    for (const clause of plan.connectionFilters ?? []) {
      if (clause.entityType === EntityScope.FOOD) {
        for (const id of clause.entityIds ?? []) {
          existingFoodIds.add(id);
        }
      }
      if (clause.entityType === EntityScope.FOOD_ATTRIBUTE) {
        for (const id of clause.entityIds ?? []) {
          existingFoodAttributeIds.add(id);
        }
      }
    }

    for (const clause of plan.restaurantFilters ?? []) {
      if (clause.entityType === EntityScope.RESTAURANT_ATTRIBUTE) {
        for (const id of clause.entityIds ?? []) {
          existingRestaurantAttributeIds.add(id);
        }
      }
    }

    const takeTerms = (entities: QueryEntityDto[] | undefined): string[] => {
      if (!entities?.length) {
        return [];
      }
      const deduped: string[] = [];
      const seen = new Set<string>();
      for (const entity of entities) {
        const raw = (entity.originalText ?? entity.normalizedName ?? '').trim();
        const normalized = raw.toLowerCase();
        if (!normalized) continue;
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        deduped.push(raw);
        if (deduped.length >= this.expansionMaxTermsPerType) {
          break;
        }
      }
      return deduped;
    };

    const takeUnresolvedTerms = (type: EntityType): string[] => {
      const groups = request.submissionContext?.unresolvedEntities ?? [];
      const terms: string[] = [];
      const seen = new Set<string>();
      for (const group of groups) {
        if (group.type !== type) continue;
        for (const raw of group.terms ?? []) {
          const sanitized = typeof raw === 'string' ? raw.trim() : '';
          const normalized = sanitized.toLowerCase();
          if (!normalized) continue;
          if (seen.has(normalized)) continue;
          seen.add(normalized);
          terms.push(sanitized);
          if (terms.length >= this.expansionMaxTermsPerType) {
            return terms;
          }
        }
      }
      return terms;
    };

    const mergeTerms = (a: string[], b: string[]): string[] => {
      const merged: string[] = [];
      const seen = new Set<string>();
      for (const list of [a, b]) {
        for (const raw of list) {
          const normalized = raw.trim().toLowerCase();
          if (!normalized) continue;
          if (seen.has(normalized)) continue;
          seen.add(normalized);
          merged.push(raw);
          if (merged.length >= this.expansionMaxTermsPerType) {
            return merged;
          }
        }
      }
      return merged;
    };

    const foodTerms = mergeTerms(
      takeTerms(request.entities.food),
      takeUnresolvedTerms(EntityType.food),
    );
    const foodAttributeTerms = mergeTerms(
      takeTerms(request.entities.foodAttributes),
      takeUnresolvedTerms(EntityType.food_attribute),
    );
    const restaurantAttributeTerms = mergeTerms(
      takeTerms(request.entities.restaurantAttributes),
      takeUnresolvedTerms(EntityType.restaurant_attribute),
    );

    type ExpandedMatches = Awaited<
      ReturnType<SearchEntityExpansionService['expandEntitiesByText']>
    >;
    const emptyMatches: ExpandedMatches = [];

    const [foods, foodAttributes, restaurantAttributes] = await Promise.all([
      foodTerms.length
        ? this.entityExpansion.expandEntitiesByText({
            terms: foodTerms,
            entityTypes: ['food' as EntityType],
            limit: this.expansionFoodCap,
          })
        : Promise.resolve(emptyMatches),
      foodAttributeTerms.length
        ? this.entityExpansion.expandEntitiesByText({
            terms: foodAttributeTerms,
            entityTypes: ['food_attribute' as EntityType],
            limit: this.expansionAttributeCap,
          })
        : Promise.resolve(emptyMatches),
      restaurantAttributeTerms.length
        ? this.entityExpansion.expandEntitiesByText({
            terms: restaurantAttributeTerms,
            entityTypes: ['restaurant_attribute' as EntityType],
            limit: this.expansionAttributeCap,
          })
        : Promise.resolve(emptyMatches),
    ]);

    const foodIds = foods
      .map((match) => match.entityId)
      .filter((id) => !existingFoodIds.has(id));
    const foodAttributeIds = foodAttributes
      .map((match) => match.entityId)
      .filter((id) => !existingFoodAttributeIds.has(id));
    const restaurantAttributeIds = restaurantAttributes
      .map((match) => match.entityId)
      .filter((id) => !existingRestaurantAttributeIds.has(id));

    let foodIdsFromPrimaryFoodAttributeText: string[] = [];
    if (
      this.isPrimaryFoodAttributeQuery(request) &&
      foodAttributeTerms.length
    ) {
      const attrFoodMatches = await this.entityExpansion.expandEntitiesByText({
        terms: foodAttributeTerms,
        entityTypes: ['food' as EntityType],
        limit: this.expansionFoodCap,
      });
      const seenFood = new Set([...existingFoodIds, ...foodIds]);
      foodIdsFromPrimaryFoodAttributeText = attrFoodMatches
        .map((match) => match.entityId)
        .filter((id) => !seenFood.has(id));
    }

    const expansion: PlanExpansionState = {
      foodIds,
      foodAttributeIds,
      restaurantAttributeIds,
      foodIdsFromPrimaryFoodAttributeText,
    };

    return this.hasPlanExpansion(expansion) ? expansion : null;
  }

  private applyPlanExpansion(
    plan: QueryPlan,
    expansion: PlanExpansionState,
  ): QueryPlan {
    if (!this.hasPlanExpansion(expansion)) {
      return plan;
    }

    const dedupe = (ids: string[]): string[] =>
      Array.from(new Set(ids.filter(Boolean)));
    const mergeIds = (base: string[], added: string[]) =>
      dedupe([...base, ...(added ?? [])]);

    let connectionFiltersUpdated = false;
    const connectionFilters = (plan.connectionFilters ?? []).map((clause) => {
      if (clause.entityType === EntityScope.FOOD && clause.entityIds?.length) {
        const merged = mergeIds(clause.entityIds, expansion.foodIds);
        if (merged.length !== clause.entityIds.length) {
          connectionFiltersUpdated = true;
          return { ...clause, entityIds: merged };
        }
      }
      if (
        clause.entityType === EntityScope.FOOD_ATTRIBUTE &&
        clause.entityIds?.length
      ) {
        const merged = mergeIds(clause.entityIds, expansion.foodAttributeIds);
        if (merged.length !== clause.entityIds.length) {
          connectionFiltersUpdated = true;
          return { ...clause, entityIds: merged };
        }
      }
      return clause;
    });

    // Attribute-only OR fallback is now driven by SearchExecutionDirectives at execution time,
    // rather than baking a special tagged filter into the QueryPlan.

    let restaurantFiltersUpdated = false;
    const restaurantFilters = (plan.restaurantFilters ?? []).map((clause) => {
      if (
        clause.entityType === EntityScope.RESTAURANT_ATTRIBUTE &&
        clause.entityIds?.length
      ) {
        const merged = mergeIds(
          clause.entityIds,
          expansion.restaurantAttributeIds,
        );
        if (merged.length !== clause.entityIds.length) {
          restaurantFiltersUpdated = true;
          return { ...clause, entityIds: merged };
        }
      }
      return clause;
    });

    if (!connectionFiltersUpdated && !restaurantFiltersUpdated) {
      return plan;
    }

    return {
      ...plan,
      connectionFilters,
      restaurantFilters,
    };
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

  private sanitizeEntityGroups(request: SearchQueryRequestDto): void {
    const sanitizeList = (entities?: QueryEntityDto[]) => {
      if (!Array.isArray(entities)) {
        return;
      }
      for (const entity of entities) {
        entity.normalizedName = this.textSanitizer.sanitizeOrThrow(
          entity.normalizedName,
          { maxLength: 140 },
        );
        if (entity.originalText) {
          const result = this.textSanitizer.sanitize(entity.originalText, {
            maxLength: 200,
            allowEmpty: true,
          });
          entity.originalText = result.rejected ? undefined : result.text;
        }
      }
    };

    sanitizeList(request.entities.restaurants);
    sanitizeList(request.entities.food);
    sanitizeList(request.entities.foodAttributes);
    sanitizeList(request.entities.restaurantAttributes);
  }
}
