import { BadRequestException, Injectable } from '@nestjs/common';
import { performance } from 'perf_hooks';
import { EntityType, OnDemandReason, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService, TextSanitizerService } from '../../shared';
import { stripGenericTokens } from '../../shared/utils/generic-token-handling';
import {
  EntityScope,
  FoodResultDto,
  QueryEntityDto,
  QueryPlan,
  SearchQueryRequestDto,
  RestaurantResultDto,
  RestaurantProfileDto,
  SearchResponseDto,
  SearchResponseMetadataDto,
  PaginationDto,
  SearchCacheAttributionDto,
  SearchPlanResponseDto,
  MapBoundsDto,
} from './dto/search-query.dto';
import { SearchQueryExecutor } from './search-query.executor';
import { SearchQueryBuilder } from './search-query.builder';
import { SearchEntityExpansionService } from './search-entity-expansion.service';
import {
  SearchSiblingExpansionService,
  type SiblingCutOptions,
} from './search-sibling-expansion.service';
import type { SearchExecutionDirectives } from './search-execution-directives';
import {
  ON_DEMAND_MIN_RESULTS,
  ON_DEMAND_VIEWPORT_MIN_WIDTH_MILES,
} from './on-demand-tuning.constants';
import type { SearchConstraints, RelaxationStage } from './search-constraints';
import { compileQueryPlanFromConstraints } from './search-constraints.compiler';
import {
  OnDemandRequestService,
  OnDemandRequestInput,
} from './on-demand-request.service';
import { EngineCoverageService } from './engine-coverage.service';
import { SearchMetricsService } from './search-metrics.service';
import { SignalsService } from '../signals/signals.service';
import { SignalDemandReadService } from '../signals/signal-demand-read.service';
import { PlacesCatalogService } from '../places/places-catalog.service';
import { PlacesPromotionService } from '../places/places-promotion.service';
import { PlacesReconcilerService } from '../places/places-reconciler.service';
import { resolveHeaderPlace, type GeoBbox } from '@crave-search/shared';
import { RestaurantStatusService } from './restaurant-status.service';
import type { RestaurantStatusPreviewDto } from './dto/restaurant-status-preview.dto';
import {
  resolveSearchDebugMode,
  summarizeEntities,
  summarizeUnresolvedEntities,
  type SearchDebugMode,
} from './utils/search-debug';
import {
  buildOperatingMetadata,
  buildStructuredWeeklyHours,
  evaluateOperatingStatus,
} from './utils/restaurant-status';

type RestaurantDishRow = {
  connection_id: string;
  restaurant_id: string;
  food_id: string;
  categories: string[];
  food_attributes: string[];
  mention_count: number;
  total_upvotes: number;
  last_mentioned_at: Date | null;
  crave_score: unknown;
  rising: unknown;
  restaurant_crave_score: unknown;
  restaurant_name: string;
  restaurant_aliases: string[];
  market_key: string;
  restaurant_price_level: number | null;
  food_name: string;
  food_aliases: string[];
};

const DEFAULT_RESULT_LIMIT = 100;
const DEFAULT_PAGE_SIZE = 25;
const METERS_PER_MILE = 1609.34;
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

/** How dense sibling co-inclusion participates in the food filter.
 *  'off' — never; 'expansion' — only inside the thin-results plan expansion;
 *  'always' — seeded before the FIRST strict probe, so every stage (probe,
 *  re-probe, relaxed, counts) sees the widened set. */
type DenseSiblingsMode = 'off' | 'expansion' | 'always';

interface PlanExpansionState {
  foodIds: string[];
  foodAttributeIds: string[];
  restaurantAttributeIds: string[];
  foodIdsFromPrimaryFoodAttributeText: string[];
  // Dense sibling co-inclusion (precomputed mutual-rank edges — see
  // SearchSiblingExpansionService). Kept as its OWN field, not folded into
  // foodIds: attribution stays clean in metadata/debug, lexical expansion can
  // dedupe against it, and a future relevancy sort needs exact-vs-sibling ids
  // distinguishable.
  denseSiblingFoodIds: string[];
  // Canonical category members of the EXACT query foods (one-hop; see
  // getCategoryMemberFoodIds). Replaces the per-connection `c.categories &&`
  // SQL arm — membership is resolved at plan time from the per-food edge table.
  categoryMemberFoodIds: string[];
  // Graded relatedness of every widened food id to the QUERY entity, on one
  // calibrated scale: siblings carry CEILING-NORMALIZED cosine (cosine ÷ the
  // query dish's closest-sibling cosine — comparable across queries, unlike raw
  // cosine whose family ceilings span ~0.77–0.95), lexical variants carry their
  // match similarity, is-a instances are 1.0. Attached to result rows for the
  // future relevancy treatment; unread by ranking today.
  relevanceByFoodId: Record<string, number>;
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
  planExpansion: PlanExpansionState | null;
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
  private readonly isDevEnvironment: boolean;
  private readonly alwaysIncludeSqlPreview: boolean;
  private readonly onDemandMinResults: number;
  private readonly openNowFetchMultiplier: number;
  private readonly includePhaseTimings: boolean;
  private readonly explainEnabled: boolean;
  private readonly debugMode: SearchDebugMode;
  private readonly expansionStrictCoverageTarget: number;
  private readonly expansionFoodCap: number;
  private readonly expansionAttributeCap: number;
  private readonly expansionMaxTermsPerType: number;
  private readonly denseSiblingsMode: DenseSiblingsMode;
  private readonly denseSiblingsCut: SiblingCutOptions;
  private readonly expansionBudgetMs: number;
  private readonly sectionedRanking: boolean;

  constructor(
    loggerService: LoggerService,
    private readonly queryExecutor: SearchQueryExecutor,
    private readonly queryBuilder: SearchQueryBuilder,
    private readonly entityExpansion: SearchEntityExpansionService,
    private readonly siblingExpansion: SearchSiblingExpansionService,
    private readonly onDemandRequestService: OnDemandRequestService,
    private readonly searchMetrics: SearchMetricsService,
    private readonly textSanitizer: TextSanitizerService,
    private readonly prisma: PrismaService,
    private readonly engineCoverage: EngineCoverageService,
    private readonly restaurantStatusService: RestaurantStatusService,
    private readonly signals: SignalsService,
    private readonly signalDemandRead: SignalDemandReadService,
    private readonly placesCatalog: PlacesCatalogService,
    private readonly placesReconciler: PlacesReconcilerService,
    private readonly placesPromotions: PlacesPromotionService,
  ) {
    this.logger = loggerService.setContext('SearchService');
    this.resultLimit = this.resolveResultLimit();
    this.defaultPageSize = this.resolveDefaultPageSize();
    this.isDevEnvironment = this.resolveIsDevEnvironment();
    this.alwaysIncludeSqlPreview = this.resolveAlwaysIncludeSqlPreview();
    this.onDemandMinResults = this.resolveOnDemandMinResults();
    this.openNowFetchMultiplier = this.resolveOpenNowFetchMultiplier();
    this.includePhaseTimings = this.resolveIncludePhaseTimings();
    this.explainEnabled = this.resolveExplainEnabled();
    this.debugMode = resolveSearchDebugMode();
    this.expansionStrictCoverageTarget =
      this.resolveExpansionStrictCoverageTarget();
    this.expansionFoodCap = this.resolveExpansionFoodCap();
    this.expansionAttributeCap = this.resolveExpansionAttributeCap();
    this.expansionMaxTermsPerType = this.resolveExpansionMaxTermsPerType();
    this.denseSiblingsMode = this.resolveDenseSiblingsMode();
    this.denseSiblingsCut = this.resolveDenseSiblingsCut();
    this.expansionBudgetMs = this.resolveExpansionBudgetMs();
    this.sectionedRanking = this.resolveSectionedRanking();
  }

  buildQueryPlan(request: SearchQueryRequestDto): QueryPlan {
    this.sanitizeEntityGroups(request);
    const priceLevels = this.normalizePriceLevels(request.priceLevels);
    const minimumVotes = this.normalizeMinimumVotes(request.minimumVotes);

    // Always use dual_list format - restaurants and dishes are independent lists
    const format: SearchConstraints['format'] = 'dual_list';
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
    const preview = this.queryBuilder.buildDishQuery({
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
        resultCoverageStatus: 'unresolved',
        primaryFoodTerm: primaryFoodTerm || undefined,
        emptyQueryMessage: options.emptyQueryMessage,
      },
    };
  }

  async runQuery(request: SearchQueryRequestDto): Promise<SearchResponseDto> {
    const start = Date.now();
    const searchRequestId = request.searchRequestId ?? randomUUID();
    request.searchRequestId = searchRequestId;
    const view = this.geoBboxFromBounds(request.bounds ?? null);
    if (view) {
      // §2 growth machine (master plan §22 cut 3): a submitted search's bounds
      // ARE the settled viewport — hand it to the naming reconciler. Sync
      // return, never throws by construction (failures log inside and self-
      // heal on a later settle); unknown ground gets probed on the governed
      // cheap pool, neighborhoods enter the catalog on first attention.
      this.placesReconciler.noteViewport(view);
    }
    if (request.seeLocations) {
      // SEE-LOCATIONS mode: the lean single-restaurant variant answers here —
      // no ranking pipeline, no market/place resolution (a collapse world
      // never renders a header verdict). noteViewport above still fired: the
      // submit is real viewport attention.
      return this.runSeeLocationsQuery(request, searchRequestId, start);
    }
    // ENGINE-COVERAGE re-key (leg 2): coverage = engine territory ground
    // coverage of the viewport (§5 derived-union territory through the §2.6
    // ground law). Raw share + engines present; no market election exists.
    const [engineViewportCoverage, displayPlaceName] = await Promise.all([
      this.engineCoverage.resolveViewportCoverage(request.bounds ?? null),
      this.resolveDisplayPlaceName(view),
    ]);

    let plan: QueryPlan | undefined;
    const phaseTimings: Record<string, number> = {};

    const RELAX_STRICT_THRESHOLD = 10;
    const TOP_DISHES_LIMIT = 3;

    try {
      const pagination = this.resolvePagination(request.pagination);
      const includeSqlPreview = this.shouldIncludeSqlPreview(request);

      if (this.debugMode !== 'off') {
        this.logger.info('Search debug: runQuery start', {
          searchRequestId,
          sourceQuery: request.sourceQuery ?? null,
          submissionSource: request.submissionSource ?? null,
          submissionContext: request.submissionContext ?? null,
          bounds: Boolean(request.bounds),
          openNow: Boolean(request.openNow),
          page: pagination.page,
          pageSize: pagination.pageSize,
          priceLevels: request.priceLevels ?? null,
          minimumVotes: request.minimumVotes ?? null,
          structuredEntities:
            this.debugMode === 'verbose'
              ? summarizeEntities(request.entities, {
                  maxEntities: 10,
                  maxIds: 10,
                })
              : summarizeEntities(request.entities),
          unresolved: summarizeUnresolvedEntities(
            request.submissionContext?.unresolvedEntities,
          ),
          verbose: this.debugMode === 'verbose',
        });
      }

      const relaxation = this.resolveRelaxationCapabilities(request);
      const canRelax = relaxation.canRelax;

      let planExpansion: PlanExpansionState | null = null;
      let expansionAnalysisMetadata: Record<string, unknown> | null = null;

      // Dense sibling co-inclusion, 'always' mode: seed the precomputed sibling
      // set BEFORE the first strict probe so EVERY stage (probe, expansion
      // re-probe, relaxed stages, counts) sees the widened food filter — and the
      // <10 relaxation decision is therefore made AFTER dense widening (siblings
      // that still satisfy the attributes surface before any attribute is
      // dropped). ONE fetch per request; buildSearchConstraints stays sync.
      // Known interactions (accepted): siblings count toward the relaxation
      // trigger, and the widened coverage can suppress the lexical-expansion
      // trigger below.
      {
        const anchorFoodIds = this.collectEntityIds(request.entities.food);
        if (anchorFoodIds.length) {
          const [categoryMemberFoodIds, siblingMatches] = await Promise.all([
            // Category members apply on EVERY search (they replace the old
            // per-connection `c.categories &&` SQL arm) — one-hop: resolved
            // from the exact query foods only.
            this.siblingExpansion.getCategoryMemberFoodIds(anchorFoodIds),
            this.siblingsWanted(request, 'preProbe')
              ? this.siblingExpansion.getSiblingFoodIds(
                  anchorFoodIds,
                  this.denseSiblingsCut,
                )
              : Promise.resolve(
                  [] as { siblingId: string; relevance: number }[],
                ),
          ]);
          const denseSiblingFoodIds = siblingMatches.map((s) => s.siblingId);
          if (categoryMemberFoodIds.length || denseSiblingFoodIds.length) {
            const relevanceByFoodId: Record<string, number> = {};
            for (const id of categoryMemberFoodIds) relevanceByFoodId[id] = 1;
            for (const s of siblingMatches)
              relevanceByFoodId[s.siblingId] = s.relevance;
            planExpansion = {
              foodIds: [],
              foodAttributeIds: [],
              restaurantAttributeIds: [],
              foodIdsFromPrimaryFoodAttributeText: [],
              denseSiblingFoodIds,
              categoryMemberFoodIds,
              relevanceByFoodId,
            };
            if (this.debugMode !== 'off') {
              this.logger.info('Search debug: pre-probe food widening seeded', {
                searchRequestId,
                anchors: anchorFoodIds.length,
                categoryMembers: categoryMemberFoodIds.length,
                siblings: denseSiblingFoodIds.length,
              });
            }
          }
        }
      }

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
      // The probe take is CLAMPED to the relaxation threshold: with a client
      // pageSize below RELAX_STRICT_THRESHOLD the probe would otherwise see fewer
      // rows than the trigger compares against — silently disabling relaxation and
      // leaving the strict exclusion set incomplete (duplicate rows across the
      // strict/relaxed pages). take ≥ threshold guarantees that WHENEVER relaxation
      // can fire (strict count < threshold) the probe holds the COMPLETE strict set.
      const strictProbePagination =
        pagination.page === 1 && pagination.take >= RELAX_STRICT_THRESHOLD
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
      if (this.debugMode !== 'off') {
        this.logger.info('Search debug: strict probe', {
          searchRequestId,
          strictCoverageCount,
          strictCounts: {
            restaurantsOnPage: strictProbe.exec.restaurants.length,
            dishesOnPage: strictProbe.exec.dishes.length,
            totalRestaurants: strictProbe.exec.totalRestaurantCount,
            totalDishes: strictProbe.exec.totalDishCount,
          },
          planMs: Math.round(strictProbe.timings.planMs),
          executeMs: Math.round(strictProbe.timings.executeMs),
          hasUnresolvedTerms,
          expansionStrictCoverageTarget: this.expansionStrictCoverageTarget,
        });
      }
      if (
        this.hasEntityTargets(request) &&
        (strictCoverageCount < this.expansionStrictCoverageTarget ||
          hasUnresolvedTerms)
      ) {
        const expansionStart = performance.now();
        // Expansion is a strictly-ADDITIVE enrichment: a slow or failing expansion
        // must never block or fail the search. Budgeted + fail-open — on timeout or
        // error, proceed with the unexpanded strict results and record the miss.
        const budgetMs = this.expansionBudgetMs;
        const expansionAttempt: Promise<{
          result: PlanExpansionState | null;
          degraded: 'error' | null;
        }> = this.buildPlanExpansionForRequest(request, strictProbe.stagePlan)
          .then((result) => ({ result, degraded: null }))
          .catch((error: unknown) => {
            this.logger.warn('Plan expansion failed (failing open)', {
              searchRequestId,
              error:
                error instanceof Error
                  ? { message: error.message, stack: error.stack }
                  : { message: String(error) },
            });
            return { result: null, degraded: 'error' as const };
          });
        let expansionTimer: NodeJS.Timeout | undefined;
        const raced = await Promise.race([
          expansionAttempt,
          new Promise<{ result: null; degraded: 'timeout' }>((resolve) => {
            expansionTimer = setTimeout(
              () => resolve({ result: null, degraded: 'timeout' }),
              budgetMs,
            );
          }),
        ]).finally(() => clearTimeout(expansionTimer));
        if (raced.degraded) {
          this.logger.warn('Plan expansion degraded', {
            searchRequestId,
            reason: raced.degraded,
            budgetMs,
          });
          expansionAnalysisMetadata = {
            idExpansion: { degraded: raced.degraded, budgetMs },
          };
        }
        const expansionResult = raced.result;
        const expansionMs = Math.round(performance.now() - expansionStart);
        if (expansionResult && this.hasPlanExpansion(expansionResult)) {
          // Preserve an 'always'-mode sibling seed: the expansion object owns the
          // lexical adds; the seeded dense siblings ride along (union, deduped).
          const seededSiblings = planExpansion?.denseSiblingFoodIds ?? [];
          const seededCategoryMembers =
            planExpansion?.categoryMemberFoodIds ?? [];
          planExpansion = {
            ...expansionResult,
            denseSiblingFoodIds: Array.from(
              new Set([
                ...seededSiblings,
                ...expansionResult.denseSiblingFoodIds,
              ]),
            ),
            categoryMemberFoodIds: Array.from(
              new Set([
                ...seededCategoryMembers,
                ...expansionResult.categoryMemberFoodIds,
              ]),
            ),
            relevanceByFoodId: {
              ...(planExpansion?.relevanceByFoodId ?? {}),
              ...expansionResult.relevanceByFoodId,
            },
          };
          expansionAnalysisMetadata = this.buildExpansionMetadata(
            strictCoverageCount,
            planExpansion,
            {
              belowTarget:
                strictCoverageCount < this.expansionStrictCoverageTarget,
              hasUnresolvedTerms,
            },
          );
          if (this.debugMode !== 'off') {
            this.logger.info('Search debug: plan expansion applied', {
              searchRequestId,
              expansionMs,
              strictCoverageCount,
              trigger: {
                belowTarget:
                  strictCoverageCount < this.expansionStrictCoverageTarget,
                hasUnresolvedTerms,
              },
              added: {
                foods: planExpansion.foodIds.length,
                foodAttributes: planExpansion.foodAttributeIds.length,
                restaurantAttributes:
                  planExpansion.restaurantAttributeIds.length,
                foodsFromPrimaryFoodAttributeText:
                  planExpansion.foodIdsFromPrimaryFoodAttributeText.length,
                denseSiblingFoods: planExpansion.denseSiblingFoodIds.length,
              },
              samples:
                this.debugMode === 'verbose'
                  ? {
                      foodIds: planExpansion.foodIds.slice(0, 20),
                      foodAttributeIds: planExpansion.foodAttributeIds.slice(
                        0,
                        20,
                      ),
                      restaurantAttributeIds:
                        planExpansion.restaurantAttributeIds.slice(0, 20),
                      foodIdsFromPrimaryFoodAttributeText:
                        planExpansion.foodIdsFromPrimaryFoodAttributeText.slice(
                          0,
                          20,
                        ),
                    }
                  : undefined,
            });
          }
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

      const strictRestaurantExactCount = strictProbe.exec.restaurants.length;
      const strictDishExactCount = strictProbe.exec.dishes.length;

      const needsRestaurantRelaxation =
        canRelax && strictRestaurantExactCount < RELAX_STRICT_THRESHOLD;
      const needsDishRelaxation =
        canRelax && strictDishExactCount < RELAX_STRICT_THRESHOLD;

      // Strict execution for the requested page. Lazy on purpose: (a) the probe IS
      // the page when page 1 ran with real pagination; (b) when BOTH axes relax,
      // strictPage's rows are never read (the relax path pools from strictProbe),
      // so executing a full strict page there was pure wasted work — alias the
      // probe instead; (c) otherwise (an axis stays strict, or a sub-threshold
      // page-1 take) execute the real page.
      const probeServesAsPage =
        pagination.page === 1 && pagination.take >= RELAX_STRICT_THRESHOLD;
      const strictPage = probeServesAsPage
        ? strictProbe
        : !needsRestaurantRelaxation || !needsDishRelaxation
          ? await executeStage({
              stage: 'strict',
              restaurantPagination: pagination,
              dishPagination: pagination,
              includeSqlPreview,
            })
          : strictProbe;

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

        const viewportEligible = this.isViewportEligibleForOnDemand(
          request.bounds,
        );
        const onDemandEngineContext = {
          engineIds: viewportEligible
            ? engineViewportCoverage.engines.map((engine) => engine.engineId)
            : [],
        };

        const shouldTriggerOnDemand = this.shouldTriggerOnDemand(
          request,
          plan.format,
          totalRestaurantResults,
        );
        const onDemandResult = shouldTriggerOnDemand
          ? await this.recordLowResultOnDemand({
              request,
              planFormat: plan.format,
              restaurantCount: totalRestaurantResults,
              dishCount: totalFoodResults,
              viewportEligible,
              onDemandEngineContext,
              expansionSignals: expansionAnalysisMetadata,
            })
          : { queued: false, etaMs: undefined };
        const onDemandQueued = onDemandResult.queued;
        const onDemandEtaMs = onDemandResult.etaMs;

        const resultCoverageStatus = this.calculateCoverageStatus({
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
          resultCoverageStatus,
          primaryFoodTerm: primaryFoodTerm || undefined,
          // §2 header law (master plan §22 cut 3): the VALUE comes from the
          // Place Catalog (resolveDisplayPlaceName); the FIELD name is the
          // frozen wire contract until the mobile-side cut.
          displayMarketName: displayPlaceName,
          // ENGINE-COVERAGE (leg 2): raw territory-ground share of the
          // viewport + the engines present. Consumers judge per their own
          // law (§16 — no threshold baked here); nothing market-shaped.
          engineCoverageShare: engineViewportCoverage.share,
          engineCoverage:
            engineViewportCoverage.engines.length > 0
              ? engineViewportCoverage.engines
              : undefined,
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
          planExpansion,
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
            this.recordQueryImpressions(request, {
              searchRequestId,
              totalResults,
              totalFoodResults,
              totalRestaurantResults,
              queryExecutionTimeMs: metadata.queryExecutionTimeMs,
              resultCoverageStatus,
            });
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

        if (this.debugMode !== 'off') {
          this.logger.info('Search debug: runQuery end (no relaxation)', {
            searchRequestId,
            queryExecutionTimeMs: metadata.queryExecutionTimeMs,
            resultCoverageStatus: metadata.resultCoverageStatus,
            totals: {
              totalRestaurantResults,
              totalFoodResults,
            },
            onDemandQueued: metadata.onDemandQueued ?? false,
            onDemandEtaMs: metadata.onDemandEtaMs ?? null,
            relaxationApplied: false,
            strictCounts: {
              restaurantsOnPage: strictPage.exec.restaurants.length,
              dishesOnPage: strictPage.exec.dishes.length,
            },
            phaseTimings:
              this.debugMode === 'verbose' && Object.keys(phaseTimings).length
                ? phaseTimings
                : undefined,
            analysisMetadataSearchExplain:
              this.debugMode === 'verbose'
                ? (metadata.analysisMetadata?.searchExplain ?? null)
                : undefined,
          });
        }

        this.searchMetrics.recordSearchExecution({
          format: plan.format,
          openNow: Boolean(request.openNow),
          durationMs: metadata.queryExecutionTimeMs,
          totalFoodResults,
          openNowFilteredOut: strictPage.exec.metadata.openNowFilteredOut ?? 0,
        });

        const response: SearchResponseDto = {
          format: plan.format,
          plan,
          dishes: strictPage.exec.dishes,
          restaurants: strictPage.exec.restaurants,
          sqlPreview: includeSqlPreview
            ? (strictPage.exec.sqlPreview ?? null)
            : null,
          metadata,
        };
        await this.attachSimilarPreview({
          response,
          request,
          planExpansion,
          pagination,
          topDishesLimit: TOP_DISHES_LIMIT,
        });
        return this.applySearchResponseProfile(response, request);
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

      // PURE CRAVE-SCORE RANKING (owner decision): the strict (exact) matches and
      // the relaxed (modifier-dropped) fallback are pooled and ordered by Crave
      // Score ALONE. A genuinely-relevant but low-score match can fall below a
      // higher-score looser match, and we accept that.
      // FUTURE (see product/scoring.md — "relevant top section"): we may pin a
      // small, deliberate section of the top ~3 MOST-RELEVANT results above the
      // main rank, with the main Crave-Score rank excluding those pinned rows.
      // That is a separate presentation layer, not a change to the score itself.
      // Pooled page-1 lists are sliced to the requested take: with the probe take
      // clamped to the relaxation threshold, the strict pool can exceed a
      // sub-threshold pageSize (idempotent when already within the page).
      // Sectioned relevancy holds ACROSS the strict+relaxed pool too: exact-match
      // tier first, pure Crave Score within each tier (rows without a tier sort
      // as exact — sectioning didn't apply to that query).
      const tierOf = (row: { exactMatch?: boolean }) =>
        row.exactMatch === false ? 1 : 0;
      const pooledOrder = (
        a: { exactMatch?: boolean; craveScore: number },
        b: { exactMatch?: boolean; craveScore: number },
      ) => tierOf(a) - tierOf(b) || b.craveScore - a.craveScore;

      const dishes = needsDishRelaxation
        ? pagination.page === 1
          ? [...strictProbe.exec.dishes, ...relaxed.exec.dishes]
              .sort(pooledOrder)
              .slice(0, pagination.take)
          : relaxed.exec.dishes
        : strictPage.exec.dishes;

      const restaurants = needsRestaurantRelaxation
        ? pagination.page === 1
          ? [...strictProbe.exec.restaurants, ...relaxed.exec.restaurants]
              .sort(pooledOrder)
              .slice(0, pagination.take)
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

      const viewportEligible = this.isViewportEligibleForOnDemand(
        request.bounds,
      );
      const onDemandEngineContext = {
        engineIds: viewportEligible
          ? engineViewportCoverage.engines.map((engine) => engine.engineId)
          : [],
      };

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
            onDemandEngineContext,
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

      const resultCoverageStatus = this.calculateCoverageStatus({
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
        resultCoverageStatus,
        primaryFoodTerm: primaryFoodTerm || undefined,
        // §2 header law: catalog-derived value, frozen field name (see the
        // no-relaxation metadata site).
        displayMarketName: displayPlaceName,
        // ENGINE-COVERAGE (leg 2): see the no-relaxation metadata site.
        engineCoverageShare: engineViewportCoverage.share,
        engineCoverage:
          engineViewportCoverage.engines.length > 0
            ? engineViewportCoverage.engines
            : undefined,
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
        planExpansion,
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
          this.recordQueryImpressions(request, {
            searchRequestId,
            totalResults,
            totalFoodResults,
            totalRestaurantResults,
            queryExecutionTimeMs: metadata.queryExecutionTimeMs,
            resultCoverageStatus,
          });
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

      if (this.debugMode !== 'off') {
        this.logger.info('Search debug: runQuery end (relaxation)', {
          searchRequestId,
          queryExecutionTimeMs: metadata.queryExecutionTimeMs,
          resultCoverageStatus: metadata.resultCoverageStatus,
          totals: {
            totalRestaurantResults,
            totalFoodResults,
          },
          onDemandQueued: metadata.onDemandQueued ?? false,
          onDemandEtaMs: metadata.onDemandEtaMs ?? null,
          relaxationApplied: metadata.relaxationApplied ?? false,
          relaxationStage: metadata.relaxationStage ?? null,
          exactCountsOnPage: {
            exactRestaurants: metadata.exactRestaurantCountOnPage ?? null,
            exactDishes: metadata.exactDishCountOnPage ?? null,
          },
          pageCounts: {
            restaurantsOnPage: restaurants.length,
            dishesOnPage: dishes.length,
          },
          phaseTimings:
            this.debugMode === 'verbose' && Object.keys(phaseTimings).length
              ? phaseTimings
              : undefined,
          analysisMetadataSearchExplain:
            this.debugMode === 'verbose'
              ? (metadata.analysisMetadata?.searchExplain ?? null)
              : undefined,
        });
      }

      this.searchMetrics.recordSearchExecution({
        format: plan.format,
        openNow: Boolean(request.openNow),
        durationMs: metadata.queryExecutionTimeMs,
        totalFoodResults,
        openNowFilteredOut: metadata.openNowFilteredOut ?? 0,
      });

      const response: SearchResponseDto = {
        format: plan.format,
        plan,
        dishes,
        restaurants,
        sqlPreview: includeSqlPreview
          ? (relaxed.exec.sqlPreview ?? null)
          : null,
        metadata,
      };
      await this.attachSimilarPreview({
        response,
        request,
        planExpansion,
        pagination,
        topDishesLimit: TOP_DISHES_LIMIT,
      });
      return this.applySearchResponseProfile(response, request);
    } catch (error) {
      this.searchMetrics.recordSearchFailure({
        format: plan?.format ?? 'unknown',
        openNow: Boolean(request.openNow),
        errorName: error instanceof Error ? error.name : 'Error',
      });
      throw error;
    }
  }

  private applySearchResponseProfile(
    response: SearchResponseDto,
    request: SearchQueryRequestDto,
  ): SearchResponseDto {
    if (!request.compactResponse) {
      return response;
    }
    return this.buildCompactSearchResponse(response);
  }

  private buildCompactSearchResponse(
    response: SearchResponseDto,
  ): SearchResponseDto {
    const restaurants = Array.isArray(response.restaurants)
      ? response.restaurants.map((restaurant) =>
          this.compactRestaurantResult(restaurant),
        )
      : [];
    return {
      ...response,
      restaurants,
      metadata: {
        ...response.metadata,
        analysisMetadata: undefined,
      },
    };
  }

  private compactRestaurantResult(
    restaurant: RestaurantResultDto,
  ): RestaurantResultDto {
    const displayLocation = this.compactRestaurantLocation(
      restaurant.displayLocation ?? null,
    );
    const compactLocations = Array.isArray(restaurant.locations)
      ? restaurant.locations
          .map((location) => this.compactRestaurantLocation(location))
          .filter(
            (
              location,
            ): location is NonNullable<
              RestaurantResultDto['displayLocation']
            > => location != null,
          )
      : [];
    const locations =
      compactLocations.length > 0
        ? compactLocations
        : displayLocation
          ? [displayLocation]
          : [];

    return {
      ...restaurant,
      displayLocation,
      locations,
      locationCount:
        typeof restaurant.locationCount === 'number'
          ? restaurant.locationCount
          : locations.length,
      topFood: Array.isArray(restaurant.topFood)
        ? restaurant.topFood.slice(0, 3)
        : [],
    };
  }

  private compactRestaurantLocation(
    location: RestaurantResultDto['displayLocation'] | null | undefined,
  ): NonNullable<RestaurantResultDto['displayLocation']> | null {
    if (!location) {
      return null;
    }
    return {
      locationId: location.locationId,
      googlePlaceId: location.googlePlaceId ?? null,
      latitude: location.latitude ?? null,
      longitude: location.longitude ?? null,
      address: location.address ?? null,
      city: location.city ?? null,
      region: location.region ?? null,
      operatingStatus: location.operatingStatus ?? null,
      isPrimary: Boolean(location.isPrimary),
    };
  }

  async listRestaurantDishes(restaurantId: string): Promise<FoodResultDto[]> {
    const toNumber = (value: unknown): number | null => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      if (value && typeof value === 'object' && 'toNumber' in value) {
        const numeric = (value as { toNumber: () => number }).toNumber();
        return Number.isFinite(numeric) ? numeric : null;
      }
      return null;
    };
    const toRequiredPublicScore = (value: unknown, label: string): number => {
      const parsed = toNumber(value);
      if (parsed === null) {
        throw new Error(`Missing public Crave Score for ${label}`);
      }
      return parsed;
    };

    const startedAt = Date.now();
    const rows = await this.prisma.$queryRaw<RestaurantDishRow[]>(Prisma.sql`
      SELECT
        c.connection_id AS connection_id,
        c.restaurant_id AS restaurant_id,
        c.food_id AS food_id,
        c.categories AS categories,
        c.food_attributes AS food_attributes,
        c.mention_count AS mention_count,
        c.total_upvotes AS total_upvotes,
        c.last_mentioned_at AS last_mentioned_at,
	        pcs.display_score AS crave_score,
	        pcs.rising AS rising,
	        prs.display_score AS restaurant_crave_score,
	        r.name AS restaurant_name,
        r.aliases AS restaurant_aliases,
        r.price_level AS restaurant_price_level,
        f.name AS food_name,
        f.aliases AS food_aliases
      FROM core_restaurant_items c
	      JOIN core_public_entity_scores pcs
	        ON pcs.subject_type = 'connection'
	       AND pcs.subject_id = c.connection_id
	      JOIN core_public_entity_scores prs
	        ON prs.subject_type = 'restaurant'
	       AND prs.subject_id = c.restaurant_id
      JOIN core_entities r
        ON r.entity_id = c.restaurant_id
      JOIN core_entities f
        ON f.entity_id = c.food_id
      WHERE c.restaurant_id = ${restaurantId}::uuid
      ORDER BY
        pcs.display_score DESC,
        c.mention_count DESC,
        c.total_upvotes DESC;
    `);

    this.logger.debug('Loaded restaurant dishes', {
      restaurantId,
      count: rows.length,
      durationMs: Date.now() - startedAt,
    });

    return rows.map((row) => {
      const craveScore = toRequiredPublicScore(
        row.crave_score,
        `connection:${row.connection_id}`,
      );
      return {
        connectionId: row.connection_id,
        foodId: row.food_id,
        foodName: row.food_name,
        foodAliases: Array.isArray(row.food_aliases) ? row.food_aliases : [],
        restaurantId: row.restaurant_id,
        restaurantName: row.restaurant_name,
        restaurantAliases: Array.isArray(row.restaurant_aliases)
          ? row.restaurant_aliases
          : [],
        scoreSubjectType: 'connection',
        scoreSubjectId: row.connection_id,
        craveScore,
        rising: toNumber(row.rising),
        mentionCount: row.mention_count ?? 0,
        totalUpvotes: row.total_upvotes ?? 0,
        lastMentionedAt: row.last_mentioned_at
          ? row.last_mentioned_at.toISOString()
          : null,
        categories: Array.isArray(row.categories) ? row.categories : [],
        foodAttributes: Array.isArray(row.food_attributes)
          ? row.food_attributes
          : [],
        restaurantPriceLevel:
          typeof row.restaurant_price_level === 'number'
            ? row.restaurant_price_level
            : null,
        restaurantPriceSymbol: null,
        restaurantDistanceMiles: null,
        restaurantOperatingStatus: null,
        restaurantCraveScore: toRequiredPublicScore(
          row.restaurant_crave_score,
          `restaurant:${row.restaurant_id}`,
        ),
        restaurantLatitude: null,
        restaurantLongitude: null,
      };
    });
  }

  async getRestaurantProfile(
    restaurantId: string,
  ): Promise<RestaurantProfileDto | null> {
    const startedAt = Date.now();
    const referenceDate = new Date();
    const toOptionalNumber = (value: unknown): number | null => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      if (value && typeof value === 'object' && 'toNumber' in value) {
        const numeric = (value as { toNumber: () => number }).toNumber();
        return Number.isFinite(numeric) ? numeric : null;
      }
      return null;
    };
    const toRequiredPublicScore = (value: unknown, label: string): number => {
      const parsed = toOptionalNumber(value);
      if (parsed === null) {
        throw new Error(`Missing public Crave Score for ${label}`);
      }
      return parsed;
    };
    const describePriceLevel = (
      level: number | null,
    ): { symbol: string | null; text: string | null } => {
      if (level === null || !Number.isFinite(level)) {
        return { symbol: null, text: null };
      }
      const normalized = Math.max(0, Math.min(4, Math.round(level)));
      const symbols = ['Free', '$', '$$', '$$$', '$$$$'] as const;
      const descriptions = [
        'Free',
        'Budget friendly',
        'Moderate',
        'Expensive',
        'Very expensive',
      ] as const;
      return {
        symbol: symbols[normalized] ?? null,
        text: descriptions[normalized] ?? null,
      };
    };
    const asRecord = (value: unknown): Record<string, unknown> | null =>
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

    const restaurant = await this.prisma.entity.findFirst({
      where: {
        entityId: restaurantId,
        type: EntityType.restaurant,
      },
      select: {
        entityId: true,
        name: true,
        aliases: true,
        latitude: true,
        longitude: true,
        address: true,
        city: true,
        region: true,
        country: true,
        postalCode: true,
        restaurantMetadata: true,
        primaryLocationId: true,
        priceLevel: true,
        priceLevelUpdatedAt: true,
        locations: {
          select: {
            locationId: true,
            googlePlaceId: true,
            latitude: true,
            longitude: true,
            address: true,
            city: true,
            region: true,
            country: true,
            postalCode: true,
            phoneNumber: true,
            websiteUrl: true,
            hours: true,
            utcOffsetMinutes: true,
            timeZone: true,
            businessStatus: true,
            isPrimary: true,
            lastPolledAt: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: [
            { isPrimary: 'desc' },
            { lastPolledAt: 'desc' },
            { createdAt: 'asc' },
          ],
        },
        _count: {
          select: {
            locations: true,
          },
        },
      },
    });

    if (!restaurant) {
      return null;
    }

    // A restaurant's locations are a fact about the restaurant, not the
    // caller's market/camera (master plan §7): the profile is ALWAYS global.
    const [publicScore, aggregate, dishes] = await Promise.all([
      this.getPublicRestaurantScore(restaurant.entityId),
      this.prisma.connection.aggregate({
        where: {
          restaurantId: restaurant.entityId,
        },
        _sum: {
          mentionCount: true,
          totalUpvotes: true,
        },
        _count: {
          _all: true,
        },
      }),
      this.listRestaurantDishes(restaurant.entityId),
    ]);

    type RestaurantProfileLocation = NonNullable<
      RestaurantProfileDto['restaurant']['locations']
    >[number];

    const mapLocation = (
      location: (typeof restaurant.locations)[number],
    ): RestaurantProfileLocation => {
      const metadata = buildOperatingMetadata({
        hoursValue: location.hours,
        utcOffsetMinutesValue: location.utcOffsetMinutes,
        timeZoneValue: location.timeZone,
        restaurantMetadataValue: restaurant.restaurantMetadata,
      });
      const operatingStatus = metadata
        ? evaluateOperatingStatus(metadata, referenceDate)
        : null;
      return {
        locationId: location.locationId,
        googlePlaceId: location.googlePlaceId ?? null,
        latitude: toOptionalNumber(location.latitude),
        longitude: toOptionalNumber(location.longitude),
        address: location.address ?? null,
        city: location.city ?? null,
        region: location.region ?? null,
        country: location.country ?? null,
        postalCode: location.postalCode ?? null,
        phoneNumber: location.phoneNumber ?? null,
        websiteUrl: location.websiteUrl ?? null,
        hours: asRecord(location.hours),
        utcOffsetMinutes: toOptionalNumber(location.utcOffsetMinutes),
        timeZone: location.timeZone ?? null,
        operatingStatus,
        structuredHours: buildStructuredWeeklyHours(
          metadata,
          location.businessStatus,
        ),
        isPrimary: Boolean(location.isPrimary),
        lastPolledAt: location.lastPolledAt?.toISOString() ?? null,
        createdAt: location.createdAt?.toISOString() ?? null,
        updatedAt: location.updatedAt?.toISOString() ?? null,
      };
    };

    const locationResults: RestaurantProfileLocation[] =
      restaurant.locations.map(mapLocation);
    const fallbackMetadata = buildOperatingMetadata({
      restaurantMetadataValue: restaurant.restaurantMetadata,
    });
    if (locationResults.length === 0) {
      locationResults.push({
        locationId: restaurant.primaryLocationId ?? restaurant.entityId,
        googlePlaceId: null,
        latitude: toOptionalNumber(restaurant.latitude),
        longitude: toOptionalNumber(restaurant.longitude),
        address: restaurant.address ?? null,
        city: restaurant.city ?? null,
        region: restaurant.region ?? null,
        country: restaurant.country ?? null,
        postalCode: restaurant.postalCode ?? null,
        phoneNumber: null,
        websiteUrl: null,
        hours: asRecord(fallbackMetadata?.hours),
        utcOffsetMinutes: toOptionalNumber(
          fallbackMetadata?.utc_offset_minutes,
        ),
        timeZone:
          typeof fallbackMetadata?.timezone === 'string'
            ? fallbackMetadata.timezone
            : null,
        operatingStatus: fallbackMetadata
          ? evaluateOperatingStatus(fallbackMetadata, referenceDate)
          : null,
        structuredHours: buildStructuredWeeklyHours(fallbackMetadata, null),
        isPrimary: true,
        lastPolledAt: null,
        createdAt: null,
        updatedAt: null,
      });
    }
    const displayLocation =
      locationResults.find((location) => location.isPrimary) ??
      locationResults[0] ??
      null;
    const parsedPriceLevel = toOptionalNumber(restaurant.priceLevel);
    const priceDetails = describePriceLevel(parsedPriceLevel);
    // Profile revamp (Google-parity): the metadata is already selected — surface the REAL
    // Google price range ("$10–20") and primary-type category ("Brunch restaurant") the
    // profile previously dropped.
    const restaurantMeta = asRecord(restaurant.restaurantMetadata);
    const priceRangeMeta = asRecord(restaurantMeta?.priceRange);
    const priceRangeText =
      typeof priceRangeMeta?.formattedText === 'string' &&
      priceRangeMeta.formattedText.trim()
        ? priceRangeMeta.formattedText.trim()
        : null;
    const categoryLabel =
      typeof restaurantMeta?.primaryTypeDisplayName === 'string' &&
      restaurantMeta.primaryTypeDisplayName.trim()
        ? restaurantMeta.primaryTypeDisplayName.trim()
        : null;
    const topFood = dishes.slice(0, 10).map((dish) => ({
      connectionId: dish.connectionId,
      foodId: dish.foodId,
      foodName: dish.foodName,
      scoreSubjectType: 'connection' as const,
      scoreSubjectId: dish.connectionId,
      craveScore: dish.craveScore,
      rising: dish.rising ?? null,
    }));
    const totalDishCount =
      typeof aggregate._count?._all === 'number'
        ? aggregate._count._all
        : dishes.length;
    const profile: RestaurantProfileDto = {
      restaurant: {
        restaurantId: restaurant.entityId,
        restaurantName: restaurant.name,
        restaurantAliases: Array.isArray(restaurant.aliases)
          ? restaurant.aliases
          : [],
        scoreSubjectType: 'restaurant',
        scoreSubjectId: restaurant.entityId,
        craveScore: toRequiredPublicScore(
          publicScore?.craveScore,
          `restaurant:${restaurant.entityId}`,
        ),
        rising: publicScore?.rising ?? null,
        mentionCount: aggregate._sum.mentionCount ?? 0,
        totalUpvotes: aggregate._sum.totalUpvotes ?? 0,
        latitude:
          displayLocation?.latitude ?? toOptionalNumber(restaurant.latitude),
        longitude:
          displayLocation?.longitude ?? toOptionalNumber(restaurant.longitude),
        address: displayLocation?.address ?? restaurant.address ?? null,
        restaurantLocationId: displayLocation?.locationId ?? null,
        priceLevel: parsedPriceLevel ?? null,
        priceSymbol: priceDetails.symbol,
        priceText: priceDetails.text,
        priceRangeText,
        categoryLabel,
        priceLevelUpdatedAt:
          restaurant.priceLevelUpdatedAt?.toISOString() ?? null,
        topFood,
        totalDishCount,
        operatingStatus: displayLocation?.operatingStatus ?? null,
        distanceMiles: null,
        displayLocation: displayLocation ?? undefined,
        locations: locationResults,
        locationCount:
          typeof restaurant._count.locations === 'number'
            ? restaurant._count.locations
            : locationResults.length,
      },
      dishes,
    };

    this.logger.debug('Loaded restaurant profile', {
      restaurantId: restaurant.entityId,
      dishCount: dishes.length,
      durationMs: Date.now() - startedAt,
    });

    return profile;
  }

  private async getPublicRestaurantScore(restaurantId: string): Promise<{
    craveScore: number;
    rising: number | null;
  } | null> {
    const toOptionalNumber = (value: unknown): number | null => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      if (value && typeof value === 'object' && 'toNumber' in value) {
        const numeric = (value as { toNumber: () => number }).toNumber();
        return Number.isFinite(numeric) ? numeric : null;
      }
      return null;
    };
    const toRequiredPublicScore = (value: unknown, label: string): number => {
      const parsed = toOptionalNumber(value);
      if (parsed === null) {
        throw new Error(`Missing public Crave Score for ${label}`);
      }
      return parsed;
    };

    const rows = await this.prisma.$queryRaw<
      Array<{ craveScore: unknown; rising: unknown }>
    >(Prisma.sql`
      SELECT
        display_score AS "craveScore",
        rising AS "rising"
      FROM core_public_entity_scores
      WHERE subject_type = 'restaurant'
        AND subject_id = ${restaurantId}::uuid
      LIMIT 1
    `);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      craveScore: toRequiredPublicScore(
        row.craveScore,
        `restaurant:${restaurantId}`,
      ),
      rising: toOptionalNumber(row.rising),
    };
  }

  private buildExecutionDirectives(
    request: SearchQueryRequestDto,
    constraints: SearchConstraints,
    planExpansion: PlanExpansionState | null,
  ): SearchExecutionDirectives | undefined {
    const textFoodIds =
      planExpansion?.foodIdsFromPrimaryFoodAttributeText ?? [];
    const hasPrimaryFoodAttributeQuery = constraints.primaryFoodAttributeQuery;
    // Sectioned ranking: tier 0 = the resolved query foods PLUS their canonical
    // category MEMBERS (is-a instances — "neapolitan pizza" IS the pizza you
    // asked for); tier 1 = dense siblings + lexical fuzzy adds (similar, not
    // instances). Fires only when the filter actually got widened past tier 0.
    const baseFoodIds = this.sectionedRanking
      ? this.collectEntityIds(request.entities.food)
      : [];
    const exactFoodIds = baseFoodIds.length
      ? Array.from(
          new Set([
            ...baseFoodIds,
            ...(planExpansion?.categoryMemberFoodIds ?? []),
          ]),
        )
      : [];
    const widened =
      exactFoodIds.length > 0 &&
      constraints.ids.foodIds.length > exactFoodIds.length;

    if (!hasPrimaryFoodAttributeQuery && !widened) {
      return undefined;
    }

    return {
      primaryFoodAttributeQuery: hasPrimaryFoodAttributeQuery || undefined,
      primaryFoodAttributeTextFoodIds:
        hasPrimaryFoodAttributeQuery && textFoodIds.length
          ? textFoodIds
          : undefined,
      exactFoodIds: widened ? exactFoodIds : undefined,
      sectionedRanking: widened || undefined,
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
      params.planExpansion,
    );
    const stagePlan = compileQueryPlanFromConstraints(constraints);
    const planMs = performance.now() - planStart;

    const directives = this.buildExecutionDirectives(
      params.request,
      constraints,
      params.planExpansion,
    );

    const executeStart = performance.now();
    const relevanceByFoodId = this.buildRelevanceMap(
      params.request,
      params.planExpansion,
    );
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

    // Attach graded relatedness (see PlanExpansionState.relevanceByFoodId) —
    // one choke point so strict, re-probe, and relaxed rows all carry it.
    if (relevanceByFoodId) {
      for (const dish of exec.dishes) {
        dish.relevance =
          relevanceByFoodId[dish.foodId] ??
          (dish.exactMatch === false ? undefined : 1);
      }
      for (const restaurant of exec.restaurants) {
        const snippetScores = (restaurant.topFood ?? [])
          .map(
            (snippet) =>
              relevanceByFoodId[snippet.foodId] ??
              (restaurant.exactMatch === false ? undefined : 1),
          )
          .filter((value): value is number => typeof value === 'number');
        restaurant.relevance = snippetScores.length
          ? Math.max(...snippetScores)
          : undefined;
      }
    }

    return { stagePlan, exec, timings: { planMs, executeMs } };
  }

  /**
   * Page-1 union prefetch for the "Include similar" toggle: on an EXACT-view
   * page-1 response, also compute the pooled-view page 1 (one extra dual query,
   * only when siblings exist) and attach the rows NOT already shown — tagged
   * exactMatch=false with relevance — plus the similarAvailable count that
   * drives the chip. Pooled top-N minus exact top-N is provably sibling-only
   * (adding rows to a pure-score list can only push exacts DOWN), so the diff
   * needs no tier computation. Fail-open: any error leaves the response as-is.
   */
  private async attachSimilarPreview(params: {
    response: SearchResponseDto;
    request: SearchQueryRequestDto;
    planExpansion: PlanExpansionState | null;
    pagination: PaginationState;
    topDishesLimit: number;
  }): Promise<void> {
    const { response, request, pagination } = params;
    if (pagination.page !== 1) return;
    if (request.includeSimilar === true) return; // already the pooled view
    const anchorFoodIds = this.collectEntityIds(request.entities.food);
    if (!anchorFoodIds.length) return;
    try {
      const siblings = await this.siblingExpansion.getSiblingFoodIds(
        anchorFoodIds,
        this.denseSiblingsCut,
      );
      if (!siblings.length) {
        response.metadata.similarAvailable = 0;
        return;
      }
      const widened: PlanExpansionState = {
        foodIds: params.planExpansion?.foodIds ?? [],
        foodAttributeIds: params.planExpansion?.foodAttributeIds ?? [],
        restaurantAttributeIds:
          params.planExpansion?.restaurantAttributeIds ?? [],
        foodIdsFromPrimaryFoodAttributeText:
          params.planExpansion?.foodIdsFromPrimaryFoodAttributeText ?? [],
        categoryMemberFoodIds:
          params.planExpansion?.categoryMemberFoodIds ?? [],
        denseSiblingFoodIds: siblings.map((s) => s.siblingId),
        relevanceByFoodId: {
          ...(params.planExpansion?.relevanceByFoodId ?? {}),
          ...Object.fromEntries(
            siblings.map((s) => [s.siblingId, s.relevance]),
          ),
        },
      };
      const pageOne = { skip: 0, take: pagination.take };
      const widenedRun = await this.executeSearchStage({
        request,
        stage: 'strict',
        planExpansion: widened,
        pagination,
        restaurantPagination: pageOne,
        dishPagination: pageOne,
        topDishesLimit: params.topDishesLimit,
      });
      const shownConnections = new Set(
        response.dishes.map((d) => d.connectionId),
      );
      response.similarDishes = widenedRun.exec.dishes
        .filter((d) => !shownConnections.has(d.connectionId))
        .map((d) => ({ ...d, exactMatch: false }));
      const shownRestaurants = new Set(
        response.restaurants.map((r) => r.restaurantId),
      );
      response.similarRestaurants = widenedRun.exec.restaurants
        .filter((r) => !shownRestaurants.has(r.restaurantId))
        .map((r) => ({ ...r, exactMatch: false }));
      response.metadata.similarAvailable = Math.max(
        0,
        widenedRun.exec.totalDishCount -
          (response.metadata.totalFoodResults ?? 0),
      );
    } catch (error) {
      this.logger.warn('Similar preview failed (failing open)', {
        error:
          error instanceof Error
            ? { message: error.message }
            : { message: String(error) },
      });
    }
  }

  /** Query-food relatedness per food id: exact + is-a instances = 1.0, widened
   *  ids (siblings/lexical) carry their graded scores from plan expansion.
   *  Null when the query resolved no food (browse/restaurant queries). */
  private buildRelevanceMap(
    request: SearchQueryRequestDto,
    planExpansion: PlanExpansionState | null,
  ): Record<string, number> | null {
    const baseFoodIds = this.collectEntityIds(request.entities.food);
    if (!baseFoodIds.length) return null;
    const map: Record<string, number> = {
      ...(planExpansion?.relevanceByFoodId ?? {}),
    };
    for (const id of baseFoodIds) map[id] = 1;
    for (const id of planExpansion?.categoryMemberFoodIds ?? []) map[id] = 1;
    return map;
  }

  private buildSearchConstraints(
    request: SearchQueryRequestDto,
    stage: RelaxationStage,
    inputs: {
      format: SearchConstraints['format'];
      priceLevels: number[];
      minimumVotes: number | null;
    },
    planExpansion?: PlanExpansionState | null,
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

    const dedupe = (ids: string[]): string[] =>
      Array.from(new Set(ids.filter(Boolean)));
    const mergeIfBase = (base: string[], added: string[]): string[] =>
      base.length ? dedupe([...base, ...(added ?? [])]) : base;

    const baseRestaurantIds = this.collectEntityIds(
      request.entities.restaurants,
    );
    const baseFoodIds = this.collectEntityIds(request.entities.food);

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
        restaurantIds: baseRestaurantIds,
        foodIds: mergeIfBase(baseFoodIds, [
          ...(planExpansion?.foodIds ?? []),
          // Dense siblings + canonical category members — kept distinguishable
          // upstream (own fields) so a future relevancy sort can rank
          // exact-first; merged here on every stage like lexical expansion.
          ...(planExpansion?.denseSiblingFoodIds ?? []),
          ...(planExpansion?.categoryMemberFoodIds ?? []),
        ]),
        foodAttributeIds: mergeIfBase(
          foodAttributeIds,
          planExpansion?.foodAttributeIds ?? [],
        ),
        restaurantAttributeIds: mergeIfBase(
          restaurantAttributeIds,
          planExpansion?.restaurantAttributeIds ?? [],
        ),
        // Ingredient lane: always-on when linked (no relaxation coupling —
        // an ingredient is the query's subject, not a droppable modifier).
        ingredientIds: this.collectEntityIds(request.entities.ingredients),
        // Excluded-ingredient lane: same always-on rule — an allergy/"no X"
        // constraint must never be relaxed away.
        excludedIngredientIds: this.collectEntityIds(
          request.entities.excludedIngredients,
        ),
      },
      filters: {
        bounds: request.bounds,
        viewportPolygon: request.viewportPolygon,
        openNow: Boolean(request.openNow),
        priceLevels: inputs.priceLevels,
        minimumVotes: inputs.minimumVotes,
        rising: Boolean(request.risingActive),
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
      input.planExpansion,
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
    onDemandEngineContext: {
      engineIds: string[];
    };
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
        params.onDemandEngineContext,
      );
      if (!lowResultRequests.length) {
        return { queued: false, etaMs: undefined };
      }

      const context: Record<string, unknown> = {
        source: 'low_result',
        searchRequestId: params.request.searchRequestId,
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

      if (
        typeof params.request.userLocation?.lat === 'number' &&
        typeof params.request.userLocation?.lng === 'number'
      ) {
        context.location = {
          latitude: params.request.userLocation.lat,
          longitude: params.request.userLocation.lng,
        };
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

      if (
        params.viewportEligible &&
        params.onDemandEngineContext.engineIds.length > 0
      ) {
        const recorded = await record();
        return { queued: recorded.length > 0, etaMs: undefined };
      }
      await record();

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
      request.entities.food?.length ||
        request.entities.foodAttributes?.length ||
        request.entities.restaurantAttributes?.length,
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

  /**
   * SEE-LOCATIONS mode (Leg 2 tail): the lean single-restaurant variant.
   * Request = one restaurant entity id + viewport bounds; response = that
   * restaurant's IN-VIEW locations as pin-ready rows on one RestaurantResult
   * (locations ordered nearest-to-viewport-center; [0] = display location),
   * riding the ordinary SearchResponse wire so the world/phase pipeline
   * renders it like any search. The act is a real search in the signals
   * ledger, meta-stamped with the mode + subject restaurant.
   */
  private async runSeeLocationsQuery(
    request: SearchQueryRequestDto,
    searchRequestId: string,
    startedAt: number,
  ): Promise<SearchResponseDto> {
    const restaurantIds = this.collectEntityIds(request.entities?.restaurants);
    if (restaurantIds.length !== 1) {
      throw new BadRequestException(
        'seeLocations requires exactly one restaurant entity id',
      );
    }
    const restaurantId = restaurantIds[0];
    const bounds = request.bounds ?? null;
    const { restaurant, inViewLocationCount } =
      await this.queryExecutor.executeSeeLocations({
        restaurantId,
        bounds,
        userLocation: request.userLocation ?? null,
      });
    const queryExecutionTimeMs = Date.now() - startedAt;
    // Membership law: a restaurant with ZERO in-view locations yields an empty
    // world (the map has nothing of it to pin), not a zero-location row.
    const restaurants =
      restaurant != null && inViewLocationCount > 0 ? [restaurant] : [];

    const plan: QueryPlan = {
      format: 'single_list',
      restaurantFilters: [
        {
          scope: 'restaurant',
          description: 'See locations: in-view locations of one restaurant',
          entityType: 'restaurant',
          entityIds: [restaurantId],
        },
      ],
      connectionFilters: [],
      ranking: { foodOrder: 'none', restaurantOrder: 'none' },
      diagnostics: { missingEntities: [], notes: ['see_locations'] },
    };

    this.recordSearchSignals(
      request,
      {
        searchRequestId,
        totalResults: restaurants.length,
        totalRestaurantResults: restaurants.length,
      },
      [{ entityId: restaurantId, entityType: EntityType.restaurant }],
      { mode: 'see_locations', restaurantId, inViewLocationCount },
    );

    return {
      format: 'single_list',
      plan,
      dishes: [],
      restaurants,
      metadata: {
        totalFoodResults: 0,
        totalRestaurantResults: restaurants.length,
        queryExecutionTimeMs,
        boundsApplied: bounds != null,
        openNowApplied: false,
        openNowSupportedRestaurants: 0,
        openNowUnsupportedRestaurants: 0,
        openNowFilteredOut: 0,
        page: 1,
        pageSize: restaurants.length,
        resultCoverageStatus: 'full',
        sourceQuery: request.sourceQuery,
        searchRequestId,
        analysisMetadata: {
          seeLocations: { restaurantId, inViewLocationCount },
        },
      },
    };
  }

  private recordQueryImpressions(
    request: SearchQueryRequestDto,
    context: {
      searchRequestId: string;
      totalResults: number;
      totalFoodResults: number;
      totalRestaurantResults: number;
      queryExecutionTimeMs: number;
      resultCoverageStatus: 'full' | 'partial' | 'unresolved';
    },
  ): void {
    // Phase C: signals is the ONE write path — the search_events /
    // search_event_entities writers are dead, the tables dropped.
    const targets = this.gatherEntityImpressionTargets(request);
    this.recordSearchSignals(request, context, targets);
  }

  /**
   * §3 signals for a page-1 backend search submit: a 'search' signal whose
   * subject mirrors the old attribution's primary entity target (term =
   * queryText when no entity resolved), plus an 'autocomplete_selection'
   * signal when the submit carried a selected autocomplete entity. Geo is the
   * request viewport bbox; without bounds the signal is skipped (logged once
   * inside SignalsService). Fire-and-forget by construction.
   */
  private recordSearchSignals(
    request: SearchQueryRequestDto,
    context: {
      searchRequestId: string;
      totalResults: number;
      totalRestaurantResults: number;
    },
    targets: { entityId: string; entityType: EntityType }[],
    /** Mode variants (see-locations) stamp their discriminator here. */
    extraMeta?: Record<string, unknown>,
  ): void {
    const geo = this.signals.bboxFromBounds(request.bounds ?? null);
    const primaryEntityId = targets[0]?.entityId ?? null;
    const queryText = request.sourceQuery?.trim() ?? '';
    // meta.searchRequestId: the client-suppliable submit id (the old writer's
    // idempotency key). The ledger is append-only, so a client retry writes a
    // second row — readers dedupe on this id (§3 judge-at-read).
    // Subject carries BOTH halves of the act (§3): the resolved entity (when
    // any) AND the query term — recent-search readers consume the term,
    // entity-demand readers the entity, from the same row.
    this.signals.record({
      kind: 'search',
      userId: request.userId ?? null,
      subject:
        primaryEntityId || queryText.length
          ? {
              entityId: primaryEntityId,
              term: queryText.length ? queryText : null,
            }
          : null,
      geo,
      meta: {
        searchRequestId: context.searchRequestId,
        resultCount: context.totalResults,
        restaurantCount: context.totalRestaurantResults,
        cached: false,
        resolvedEntityId: primaryEntityId ?? undefined,
        ...(extraMeta ?? {}),
      },
    });

    const selectedEntityId =
      request.submissionContext?.selectedEntityId ?? null;
    if (selectedEntityId) {
      this.signals.record({
        kind: 'autocomplete_selection',
        userId: request.userId ?? null,
        subject: { entityId: selectedEntityId },
        geo,
        meta: { searchRequestId: context.searchRequestId },
      });
    }
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

  async recordCacheAttribution(
    dto: SearchCacheAttributionDto,
    userId?: string | null,
  ): Promise<{ inserted: number }> {
    const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
    if (
      !normalizedUserId ||
      dto.originalBackendSearchRequestId === dto.cacheRevealRequestId
    ) {
      return { inserted: 0 };
    }
    const cacheRevealRequestId =
      typeof dto.cacheRevealRequestId === 'string'
        ? dto.cacheRevealRequestId.trim()
        : '';
    if (!cacheRevealRequestId) {
      throw new BadRequestException('cacheRevealRequestId is required');
    }

    // Phase C: the ledger is the ONE record. The original backend search act
    // lives in signals (meta.searchRequestId); the reveal clones ITS subject,
    // geo, and counts — never trusting client-supplied attribution.
    //
    // Idempotent on retry: if this reveal id already has a signal row, the
    // reveal is on record (concurrent duplicates additionally collapse at
    // read on meta.cacheRevealRequestId — §3 judge-at-read).
    // Both probes ride the Signal_dedupeRequestId_occurredAt_idx expression
    // index (COALESCE(meta->>'searchRequestId', meta->>'cacheRevealRequestId')).
    const [revealRows, originalRows] = await Promise.all([
      this.prisma.$queryRaw<{ signal_id: string }[]>`
        SELECT s.signal_id
        FROM signals s
        WHERE COALESCE(s.meta->>'searchRequestId', s.meta->>'cacheRevealRequestId')
              = ${cacheRevealRequestId}
          AND s.meta->>'cacheRevealRequestId' = ${cacheRevealRequestId}
        LIMIT 1
      `,
      this.prisma.$queryRaw<
        {
          subject_id: string | null;
          subject_text: string | null;
          geo_min_lat: number;
          geo_min_lng: number;
          geo_max_lat: number;
          geo_max_lng: number;
          meta: Prisma.JsonValue;
        }[]
      >`
        SELECT s.subject_id, s.subject_text,
               s.geo_min_lat::float8 AS geo_min_lat,
               s.geo_min_lng::float8 AS geo_min_lng,
               s.geo_max_lat::float8 AS geo_max_lat,
               s.geo_max_lng::float8 AS geo_max_lng,
               s.meta
        FROM signals s
        JOIN signal_actors a ON a.actor_id = s.actor_id
        WHERE COALESCE(s.meta->>'searchRequestId', s.meta->>'cacheRevealRequestId')
              = ${dto.originalBackendSearchRequestId}
          AND s.kind = 'search'
          AND s.meta->>'searchRequestId' = ${dto.originalBackendSearchRequestId}
          AND a.user_id = ${normalizedUserId}::uuid
        ORDER BY s.occurred_at DESC
        LIMIT 1
      `,
    ]);
    const original = originalRows[0];
    if (revealRows.length > 0 || !original) {
      return { inserted: 0 };
    }

    // §3: a cache reveal is the same search ACT with meta.cached=true. Geo is
    // the ORIGINAL act's bbox (the reveal request carries no viewport bounds
    // server-side).
    const originalMeta = this.toJsonObject(original.meta);
    this.signals.record({
      kind: 'search',
      userId: normalizedUserId,
      subject:
        original.subject_id || original.subject_text
          ? { entityId: original.subject_id, term: original.subject_text }
          : null,
      geo: {
        minLat: original.geo_min_lat,
        minLng: original.geo_min_lng,
        maxLat: original.geo_max_lat,
        maxLng: original.geo_max_lng,
      },
      meta: {
        cacheRevealRequestId,
        originalBackendSearchRequestId: dto.originalBackendSearchRequestId,
        resultCount:
          typeof originalMeta.resultCount === 'number'
            ? originalMeta.resultCount
            : undefined,
        restaurantCount:
          typeof originalMeta.restaurantCount === 'number'
            ? originalMeta.restaurantCount
            : undefined,
        cached: true,
        resolvedEntityId: original.subject_id ?? undefined,
      },
    });

    return { inserted: 1 };
  }

  private toJsonObject(
    value: Prisma.JsonValue | null | undefined,
  ): Prisma.JsonObject {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return { ...value };
  }

  /**
   * Request viewport bounds → wrap-aware GeoBbox (place-geo R1: minLng >
   * maxLng means the viewport crosses the antimeridian). SW/NE longitudes map
   * DIRECTLY — a min/max reshuffle would destroy the crossing encoding.
   */
  private geoBboxFromBounds(bounds?: MapBoundsDto | null): GeoBbox | null {
    if (!bounds?.northEast || !bounds.southWest) {
      return null;
    }
    const { northEast, southWest } = bounds;
    if (
      ![northEast.lat, northEast.lng, southWest.lat, southWest.lng].every(
        (value) => typeof value === 'number' && Number.isFinite(value),
      )
    ) {
      return null;
    }
    return {
      minLat: Math.min(southWest.lat, northEast.lat),
      maxLat: Math.max(southWest.lat, northEast.lat),
      minLng: southWest.lng,
      maxLng: northEast.lng,
    };
  }

  /**
   * §2 header naming (master plan §22 cut 3): the search header's display
   * name comes from the Place Catalog — every place intersecting the view,
   * judged by the read-time subjecthood law (resolveHeaderPlace). "this
   * area" verdicts (multi-place straddle, unnamed ground) surface as null;
   * the client renders its own fallback for null. Never throws — a naming
   * failure must not affect the search response (reads never wait on
   * naming, §2).
   */
  private async resolveDisplayPlaceName(
    view: GeoBbox | null,
  ): Promise<string | null> {
    if (!view) {
      return null;
    }
    try {
      const placesInView = await this.placesCatalog.placesInView(view);
      const resolution = resolveHeaderPlace(
        view,
        placesInView.map((entry) => ({
          placeId: entry.place.placeId,
          name: entry.place.name,
          bbox: entry.bbox,
          coverageOfView: entry.coverageOfView,
          placeArea: entry.placeArea,
          parentPlaceIds: entry.parentPlaceIds,
        })),
      );
      if (resolution.kind === 'place') {
        // §2(e) tier-2 promotion: answering the header from this place
        // counts toward its "frequent header-answering" earned moment
        // (second answer within the memory TTL joins the queue).
        this.placesPromotions.noteHeaderAnswer(resolution.place.placeId);
        return resolution.place.name;
      }
      return null;
    } catch (error) {
      this.logger.debug('Unable to resolve header place name', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return null;
    }
  }

  /**
   * READER CUT (§22 item 6, red-team 2a): recent searches read the signals
   * LEDGER (kind = 'search'), not the dying search_events tables. Response
   * contract is frozen (SearchHistoryEntry). The old selection judgment is
   * reproduced at read: an EXPLICIT autocomplete selection (companion
   * autocomplete_selection act on the same searchRequestId) always shows;
   * otherwise only a restaurant whose name equals the query text does (the
   * old resolveSelectionFromSearchLogRow rule). CASING: subject_text is
   * normalized (lowercased) at write, so queryText returns lowercased — the
   * raw casing is not in the ledger (consistent with the suggestion lanes).
   */
  async listRecentSearches(
    userId: string,
    limit?: number,
  ): Promise<SearchHistoryEntry[]> {
    if (!userId) {
      return [];
    }
    const take = Math.max(1, Math.min(limit ?? 8, 50));
    const rows = await this.signalDemandRead.recentSearches(userId, take);

    const entries: SearchHistoryEntry[] = rows.map((row) => {
      const entityType =
        row.resolvedEntityType &&
        Object.values(EntityType).includes(row.resolvedEntityType as EntityType)
          ? (row.resolvedEntityType as EntityType)
          : null;
      const nameMatchesQuery =
        (row.resolvedEntityName ?? '').trim().toLowerCase() ===
        row.queryText.trim().toLowerCase();
      const selected =
        row.resolvedEntityId &&
        entityType &&
        (row.explicitSelection ||
          (entityType === EntityType.restaurant && nameMatchesQuery))
          ? { entityId: row.resolvedEntityId, entityType }
          : null;
      return {
        queryText: row.queryText,
        lastSearchedAt: row.lastSearchedAt.toISOString(),
        selectedEntityId: selected?.entityId ?? null,
        selectedEntityType: selected?.entityType ?? null,
      };
    });

    const restaurantIds = Array.from(
      new Set(
        entries
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
      return entries;
    }

    const previews = await this.restaurantStatusService.getStatusPreviews({
      restaurantIds,
    });
    const previewMap = new Map(
      previews.map((preview) => [preview.restaurantId, preview]),
    );

    return entries.map((entry) => {
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

  private buildLowResultRequests(
    request: SearchQueryRequestDto,
    engineContext: {
      engineIds: string[];
    },
  ): OnDemandRequestInput[] {
    const engineIds = Array.from(
      new Set(
        engineContext.engineIds
          .map((engineId) => engineId.trim())
          .filter(Boolean),
      ),
    );

    const results: OnDemandRequestInput[] = [];
    const seen = new Set<string>();
    const reason: OnDemandReason = 'low_result';

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
          engineIds,
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
    // Bounds are the DTO's job (@Min/@Max on PaginationDto) — no service clamps.
    const page = pagination?.page ?? 1;
    const pageSize = pagination?.pageSize ?? this.defaultPageSize;
    const skip = (page - 1) * pageSize;

    return {
      page,
      pageSize,
      skip,
      take: pageSize,
    };
  }

  // Page sizing is a product decision, not an env knob (2026-07-11 fold-in;
  // the old SEARCH_DEFAULT_PAGE_SIZE/SEARCH_MAX_PAGE_SIZE/SEARCH_MAX_RESULTS
  // env lines restated these constants).
  private resolveDefaultPageSize(): number {
    return DEFAULT_PAGE_SIZE;
  }

  private resolveResultLimit(): number {
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
    return ON_DEMAND_MIN_RESULTS;
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

  /** SECTIONED RELEVANCY (owner-approved): exact-match rows form section 1
   *  (pure Crave Score within), widened rows (siblings/categories/lexical)
   *  section 2 — rank integrity holds WITHIN each section, relevance is
   *  expressed as GROUPING, never as score-blending. 'crave' restores the
   *  single pure-score list. */
  private resolveSectionedRanking(): boolean {
    // Default OFF (pure Crave Score — the owner's standing decision). The
    // sectioned shape is one CANDIDATE for the future relevancy treatment
    // (owner is still weighing a relevancy+score blend); rows carry exactMatch
    // provenance either way, which any future shape needs.
    const raw = process.env.SEARCH_RANKING_MODE?.trim().toLowerCase();
    return raw === 'sectioned';
  }

  /** Wall-clock budget for the plan-expansion block (lexical + dense sibling
   *  fetches). Expansion is additive-only, so on budget exhaustion the search
   *  proceeds unexpanded (fail-open) rather than blocking the hot path. */
  private resolveExpansionBudgetMs(): number {
    const raw = Number(process.env.SEARCH_EXPANSION_BUDGET_MS);
    if (Number.isFinite(raw) && raw >= 50) {
      return Math.min(Math.floor(raw), 5_000);
    }
    return 1_500;
  }

  /** The effective "include similar dishes" decision for one request: an
   *  explicit request param (the user's toggle) ALWAYS wins; absent, the env
   *  mode decides ('always' widens up front, 'expansion' widens only in the
   *  thin-results plan expansion, 'off' never). */
  private siblingsWanted(
    request: SearchQueryRequestDto,
    context: 'preProbe' | 'expansion',
  ): boolean {
    if (typeof request.includeSimilar === 'boolean') {
      // Explicit toggle: widen up-front when on; NEVER silently widen when off.
      return context === 'preProbe' && request.includeSimilar;
    }
    return context === 'preProbe'
      ? this.denseSiblingsMode === 'always'
      : this.denseSiblingsMode === 'expansion';
  }

  /** Dense sibling co-inclusion mode — see DenseSiblingsMode. Default
   *  'expansion' (siblings only widen thin searches); 'always' is the
   *  main-search experiment flag, 'off' the kill switch. */
  private resolveDenseSiblingsMode(): DenseSiblingsMode {
    const raw = process.env.SEARCH_DENSE_SIBLINGS_MODE?.trim().toLowerCase();
    if (raw === 'off' || raw === 'expansion' || raw === 'always') {
      return raw;
    }
    if (raw) {
      this.logger.warn('Invalid SEARCH_DENSE_SIBLINGS_MODE; using default', {
        raw,
      });
    }
    return 'expansion';
  }

  /** The production sibling cut, env-tunable without an edge rebuild (the table
   *  stores a superset). K is clamped to the persisted depth (30) and R to the
   *  builder's FETCH_N (60) — beyond those the data cannot answer. */
  private resolveDenseSiblingsCut(): SiblingCutOptions {
    const int = (name: string, dflt: number, min: number, max: number) => {
      const parsed = Number(process.env[name]);
      return Number.isFinite(parsed) && parsed > 0
        ? Math.min(Math.max(min, Math.floor(parsed)), max)
        : dflt;
    };
    const float = (name: string, dflt: number, min: number, max: number) => {
      const parsed = Number(process.env[name]);
      return Number.isFinite(parsed)
        ? Math.min(Math.max(min, parsed), max)
        : dflt;
    };
    return {
      forwardK: int('SEARCH_DENSE_SIBLINGS_FORWARD_K', 25, 1, 30),
      mutualR: int('SEARCH_DENSE_SIBLINGS_MUTUAL_R', 20, 1, 60),
      minCosine: float('SEARCH_DENSE_SIBLINGS_COSINE_FLOOR', 0.75, 0.5, 0.95),
      maxAnchors: int('SEARCH_DENSE_SIBLINGS_MAX_ANCHORS', 3, 1, 8),
    };
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
        expansion.foodIdsFromPrimaryFoodAttributeText.length ||
        expansion.denseSiblingFoodIds.length ||
        expansion.categoryMemberFoodIds.length,
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
        denseSiblingFoodsAdded: expansion.denseSiblingFoodIds.length,
        categoryMemberFoodsAdded: expansion.categoryMemberFoodIds.length,
        denseSiblingsMode: this.denseSiblingsMode,
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

    // Expansion widens the ACTUAL result set, so it must admit only strong
    // lexical evidence. `weak` (levenshtein-only — the ham/rum class) and
    // `phonetic` (dmetaphone) collisions otherwise leak wrong entities into
    // results on equal footing with exact matches; `fuzzy` must clear a
    // similarity floor. (Precision gate; the co-inclusion/dense recall path is
    // separate.)
    // 'contains' is STRONG for expansion: the same-token menu-variant class
    // ("al pastor taco" for "taco") measured 94% wanted. 'edit' needs a floor
    // (≈1 edit on a 4+ letter word) — looser edits are typo junk.
    const EXPANSION_STRONG_EVIDENCE = new Set([
      'exact',
      'prefix',
      'name',
      'alias',
      'contains',
    ]);
    const EXPANSION_FUZZY_FLOOR = 0.5;
    const EXPANSION_EDIT_FLOOR = 0.75;
    const passesExpansionEvidence = (match: {
      evidence: string;
      similarity?: number;
    }): boolean =>
      EXPANSION_STRONG_EVIDENCE.has(match.evidence) ||
      (match.evidence === 'fuzzy' &&
        (match.similarity ?? 0) >= EXPANSION_FUZZY_FLOOR) ||
      (match.evidence === 'edit' &&
        (match.similarity ?? 0) >= EXPANSION_EDIT_FLOOR);

    const foodIds = foods
      .filter(passesExpansionEvidence)
      .map((match) => match.entityId)
      .filter((id) => !existingFoodIds.has(id));
    const foodAttributeIds = foodAttributes
      .filter(passesExpansionEvidence)
      .map((match) => match.entityId)
      .filter((id) => !existingFoodAttributeIds.has(id));
    const restaurantAttributeIds = restaurantAttributes
      .filter(passesExpansionEvidence)
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
        .filter(passesExpansionEvidence)
        .map((match) => match.entityId)
        .filter((id) => !seenFood.has(id));
    }

    // Dense sibling co-inclusion, 'expansion' mode: this method already runs only
    // under the thin/unresolved trigger, so siblings here widen ONLY thin
    // searches. Anchors are the RESOLVED winner ids (unresolved terms have no
    // vector to anchor on — expansion for those stays lexical). Deduped against
    // the winners and every lexical food id already headed into the filter.
    // ('always' mode fetches earlier, before the first strict probe.)
    let denseSiblingFoodIds: string[] = [];
    const relevanceByFoodId: Record<string, number> = {};
    // Lexical variants: graded by their match similarity (honest per-tier
    // scores from the lattice — exact/instance-class matches read as 1.0).
    for (const match of foods) {
      if (match.evidence === 'exact' || match.evidence === 'prefix') {
        relevanceByFoodId[match.entityId] = 1;
      } else if (typeof match.similarity === 'number') {
        relevanceByFoodId[match.entityId] = Math.min(
          1,
          Math.max(0, match.similarity),
        );
      }
    }
    if (this.siblingsWanted(request, 'expansion')) {
      const anchorFoodIds = this.collectEntityIds(request.entities.food);
      if (anchorFoodIds.length) {
        const seen = new Set<string>([
          ...existingFoodIds,
          ...foodIds,
          ...foodIdsFromPrimaryFoodAttributeText,
        ]);
        const siblingMatches = (
          await this.siblingExpansion.getSiblingFoodIds(
            anchorFoodIds,
            this.denseSiblingsCut,
          )
        ).filter((s) => !seen.has(s.siblingId));
        denseSiblingFoodIds = siblingMatches.map((s) => s.siblingId);
        for (const s of siblingMatches)
          relevanceByFoodId[s.siblingId] = s.relevance;
      }
    }

    const expansion: PlanExpansionState = {
      foodIds,
      foodAttributeIds,
      restaurantAttributeIds,
      foodIdsFromPrimaryFoodAttributeText,
      denseSiblingFoodIds,
      // Seeded pre-probe (every search), not here — the union at the caller
      // preserves it across this object.
      categoryMemberFoodIds: [],
      relevanceByFoodId,
    };

    if (this.debugMode !== 'off') {
      const evidenceCounts = (matches: ExpandedMatches) =>
        matches.reduce<Record<string, number>>((acc, match) => {
          acc[match.evidence] = (acc[match.evidence] ?? 0) + 1;
          return acc;
        }, {});
      this.logger.info('Search debug: id expansion details', {
        searchRequestId: request.searchRequestId ?? null,
        terms: {
          food: foodTerms,
          foodAttributes: foodAttributeTerms,
          restaurantAttributes: restaurantAttributeTerms,
        },
        results: {
          foods: {
            count: foods.length,
            evidence: evidenceCounts(foods),
          },
          foodAttributes: {
            count: foodAttributes.length,
            evidence: evidenceCounts(foodAttributes),
          },
          restaurantAttributes: {
            count: restaurantAttributes.length,
            evidence: evidenceCounts(restaurantAttributes),
          },
          foodsFromPrimaryFoodAttributeText: {
            count: foodIdsFromPrimaryFoodAttributeText.length,
          },
        },
        addedAfterPlanDedup: {
          foodIds: foodIds.length,
          foodAttributeIds: foodAttributeIds.length,
          restaurantAttributeIds: restaurantAttributeIds.length,
          denseSiblingFoodIds: denseSiblingFoodIds.length,
        },
        samples:
          this.debugMode === 'verbose'
            ? {
                foods: foods.slice(0, 10),
                foodAttributes: foodAttributes.slice(0, 10),
                restaurantAttributes: restaurantAttributes.slice(0, 10),
              }
            : undefined,
      });
    }

    return this.hasPlanExpansion(expansion) ? expansion : null;
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
