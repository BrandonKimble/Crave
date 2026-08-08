import {
  isEnvFlagEnabled,
  isEnvFlagExplicitlyDisabled,
} from '../../shared/config/env-flag';
import { BadRequestException, Injectable } from '@nestjs/common';
import { performance } from 'perf_hooks';
import {
  EntityType,
  OnDemandReason,
  Prisma,
  EntityStatus,
} from '@prisma/client';
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
import { DietaryConstraintRegistry } from './dietary-constraints';
import type { SearchExecutionDirectives } from './search-execution-directives';
import {
  ON_DEMAND_MIN_RESULTS,
  ON_DEMAND_VIEWPORT_MIN_WIDTH_MILES,
} from './on-demand-tuning.constants';
import { admitsForExpansion } from './evidence-admission';
import type { FoodGrounding, SearchConstraints } from './search-constraints';
import { compileQueryPlanFromConstraints } from './search-constraints.compiler';
import {
  OnDemandRequestService,
  OnDemandRequestInput,
} from './on-demand-request.service';
import { EngineCoverageService } from './engine-coverage.service';
import { SignalsService } from '../signals/signals.service';
import { SignalDemandReadService } from '../signals/signal-demand-read.service';
import { PlacesCatalogService } from '../places/places-catalog.service';
import { PlacesPromotionService } from '../places/places-promotion.service';
import { PlacesReconcilerService } from '../places/places-reconciler.service';
import { type GeoBbox } from '@crave-search/shared';
import { RestaurantStatusService } from './restaurant-status.service';
import type { RestaurantStatusPreviewDto } from './dto/restaurant-status-preview.dto';
import { isProdEnv, resolveAppEnv } from '../../shared/config/app-env';
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
  food_attributes: string[];
  mention_count: number;
  total_upvotes: number;
  last_mentioned_at: Date | null;
  crave_score: unknown;
  rising: unknown;
  restaurant_crave_score: unknown;
  restaurant_name: string;
  restaurant_aliases: string[];
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
  /** Same-named ingredient entities of the query foods (twin union — the
   *  builder ORs their containment into the food clause). */
  twinIngredientIds: string[];
  // Graded relatedness of every widened food id to the QUERY entity, on one
  // calibrated scale: siblings carry CEILING-NORMALIZED cosine (cosine ÷ the
  // query dish's closest-sibling cosine — comparable across queries, unlike raw
  // cosine whose family ceilings span ~0.77–0.95), lexical variants carry their
  // match similarity, is-a instances are 1.0. Attached to result rows for the
  // future relevancy treatment; unread by ranking today.
  relevanceByFoodId: Record<string, number>;
}

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
  pooledCoverageCount: number;
  hasUnresolvedTerms: boolean;
  planExpansion: PlanExpansionState | null;
  pooledCounts: {
    restaurantsOnPage: number;
    dishesOnPage: number;
    totalRestaurants: number;
    totalDishes: number;
  };
  // CUTOVER 2026-08-02: relaxation is gone (one pooled execution). Only the
  // pooled coverage threshold survives as explain context — there is no
  // 'applied' flag or stage to report.
  pooledCoverage: {
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

/** Merge two relevance maps keeping the STRONGER signal per food id. */
function mergeRelevanceMax(
  base: Record<string, number>,
  incoming: Record<string, number>,
): Record<string, number> {
  const merged: Record<string, number> = { ...base };
  for (const [id, value] of Object.entries(incoming)) {
    merged[id] = Math.max(merged[id] ?? 0, value);
  }
  return merged;
}

/**
 * A judged `cousin` is a DIFFERENT craving, so it must sort below every
 * measured dense sibling. Siblings carry a ceiling-normalized cosine (their
 * cosine divided by the anchor's closest sibling), which is ≤ 1 and in
 * practice well above this; a cousin handed 1 would outrank all of them.
 * Deliberately low rather than tuned — this is a floor, not a calibration.
 */
const COUSIN_RELEVANCE = 0.1;

@Injectable()
export class SearchService {
  private readonly logger: LoggerService;
  private readonly resultLimit: number;
  private readonly defaultPageSize: number;
  private readonly isDevEnvironment: boolean;
  private readonly alwaysIncludeSqlPreview: boolean;
  private readonly onDemandMinResults: number;
  private readonly includePhaseTimings: boolean;
  private readonly explainEnabled: boolean;
  private readonly debugMode: SearchDebugMode;
  /** Coverage floor below which id-expansion is attempted. (The docstring
   *  that used to sit here described a step-3 rollout flag deleted with the
   *  ladder — CUTOVER 2026-08-02; there is one pooled execution now.) */
  private readonly expansionStrictCoverageTarget: number;
  private readonly expansionFoodCap: number;
  private readonly expansionAttributeCap: number;
  private readonly expansionMaxTermsPerType: number;
  private readonly denseSiblingsCut: SiblingCutOptions;
  private readonly expansionBudgetMs: number;
  private readonly sectionedRanking: boolean;

  constructor(
    loggerService: LoggerService,
    private readonly queryExecutor: SearchQueryExecutor,
    private readonly queryBuilder: SearchQueryBuilder,
    private readonly entityExpansion: SearchEntityExpansionService,
    private readonly siblingExpansion: SearchSiblingExpansionService,
    private readonly dietaryConstraints: DietaryConstraintRegistry,
    private readonly onDemandRequestService: OnDemandRequestService,
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
    this.includePhaseTimings = this.resolveIncludePhaseTimings();
    this.explainEnabled = this.resolveExplainEnabled();
    this.debugMode = resolveSearchDebugMode();
    this.expansionStrictCoverageTarget =
      this.resolveExpansionStrictCoverageTarget();
    this.expansionFoodCap = this.resolveExpansionFoodCap();
    this.expansionAttributeCap = this.resolveExpansionAttributeCap();
    this.expansionMaxTermsPerType = this.resolveExpansionMaxTermsPerType();
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
    const constraints = this.buildSearchConstraints(request, {
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

    // Mirrors the real execution path (runQuery's `pooledPagination =
    // pagination`, F1901): open-now filtering is a SQL membership predicate
    // now (`buildOpenNowPredicateSql`), not a two-phase overfetch-then-trim,
    // so the preview's pagination is the page's own pagination — same as
    // what actually runs.
    const pagination = this.resolvePagination(request.pagination);
    const preview = this.queryBuilder.buildDishQuery({
      plan,
      pagination,
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
    // VIEWPORT REQUIRED (red team R4-P1, measured): a bounds-less pooled
    // request runs the fame-pin ST_Covers over EVERY location — 22–43s of
    // DB time vs ~0.4s bounded, behind a 1200/min rate tier. Search is a
    // map product; every legitimate client sends a viewport.
    if (!request.bounds && !request.viewportPolygon) {
      throw new BadRequestException(
        'bounds (or viewportPolygon) is required for search',
      );
    }
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
    // ONE NAMING AUTHORITY (round-3, 2026-08-08): displayPlaceName is gone
    // from the response — the client's subject store names the viewport
    // with the same shared law, and the on-demand notice already preferred
    // it. resolveDisplayPlaceName died with its only consumer.
    const engineViewportCoverage =
      await this.engineCoverage.resolveViewportCoverage(request.bounds ?? null);

    const phaseTimings: Record<string, number> = {};

    // OWNER-CHOSEN 2026-08-01 (was an inherited bare 10, flagged by the
    // from-scratch derivation's no-fake-estimates check): "scarce" means
    // less than ONE FULL PAGE (DEFAULT_PAGE_SIZE). This same value becomes
    // the richness gate's scarcity line in the step-3 pooled query;
    // re-measure against the post-re-extract graph in the calibration tail.
    const POOLED_COVERAGE_THRESHOLD = DEFAULT_PAGE_SIZE;
    const TOP_DISHES_LIMIT = 3;

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
        const [
          edgeMemberFoodIds,
          nameVariantFoodIds,
          twinIngredientIds,
          siblingMatches,
          judgedRelations,
        ] = await Promise.all([
          // Category members apply on EVERY search (they replace the old
          // per-connection `c.categories &&` SQL arm) — one-hop: resolved
          // from the exact query foods only.
          this.siblingExpansion.getCategoryMemberFoodIds(anchorFoodIds),
          // Name-containment failsafe (owner ruling 2026-07-25): 57% of
          // name-evident variants lacked a category edge — a dish literally
          // SAYING the word is instance evidence, same tier as edges.
          this.siblingExpansion.getNameContainmentVariantFoodIds(anchorFoodIds),
          // Twin-ingredient union: "burrata" the food also means dishes
          // CONTAINING burrata (the builder ORs containment in).
          this.siblingExpansion.getSameNamedIngredientIds(anchorFoodIds),
          this.siblingsWanted(request, 'preProbe')
            ? this.siblingExpansion.getSiblingFoodIds(
                anchorFoodIds,
                this.denseSiblingsCut,
              )
            : Promise.resolve([] as { siblingId: string; relevance: number }[]),
          // LLM-judged substitutability (concept-graph rung 4) — the residual
          // that grammar and the category graph could not decide. `satisfies`
          // is a tier-0 claim, `cousin` rides the tier-1 widened set.
          this.siblingExpansion.getSatisfiesFoodIds(anchorFoodIds),
        ]);
        // Head-final name variants ARE the thing (tier 0 with verified
        // category members); terms that merely mention the query food
        // ("pizza sauce") are related, so they ride the tier-1 widened set.
        const categoryMemberFoodIds = Array.from(
          new Set([
            ...edgeMemberFoodIds,
            ...nameVariantFoodIds.isVariantOf,
            // A judged `satisfies` is the same class of claim as a verified
            // category member or a head-final variant: it IS what was asked
            // for, so it belongs in the front section.
            ...judgedRelations.satisfies,
          ]),
        );
        const denseSiblingFoodIds = Array.from(
          new Set([
            ...siblingMatches.map((s) => s.siblingId),
            ...nameVariantFoodIds.mentionsIt,
            // COUSINS RIDE THE SAME GATE AS DENSE SIBLINGS. A cousin is by
            // definition a DIFFERENT craving, which is exactly the class
            // `siblingsWanted` exists to suppress — admitting them
            // unconditionally would route around the one control the user has
            // over "show me adjacent things".
            ...(this.siblingsWanted(request, 'preProbe')
              ? judgedRelations.cousin
              : []),
          ]),
        );
        if (
          categoryMemberFoodIds.length ||
          denseSiblingFoodIds.length ||
          twinIngredientIds.length
        ) {
          const relevanceByFoodId: Record<string, number> = {};
          for (const id of categoryMemberFoodIds) relevanceByFoodId[id] = 1;
          for (const s of siblingMatches)
            relevanceByFoodId[s.siblingId] = s.relevance;
          for (const id of nameVariantFoodIds.mentionsIt)
            relevanceByFoodId[id] = relevanceByFoodId[id] ?? 1;
          // A `satisfies` IS the thing asked for, so it carries the same 1
          // as a verified category member. A cousin is NOT, and must not be
          // handed the same value as an exact match — measured siblings carry
          // a ceiling-normalized cosine below 1, so a cousin at 1 would
          // outrank every real sibling.
          for (const id of judgedRelations.satisfies)
            relevanceByFoodId[id] = relevanceByFoodId[id] ?? 1;
          for (const id of judgedRelations.cousin)
            relevanceByFoodId[id] = relevanceByFoodId[id] ?? COUSIN_RELEVANCE;
          planExpansion = {
            foodIds: [],
            foodAttributeIds: [],
            restaurantAttributeIds: [],
            foodIdsFromPrimaryFoodAttributeText: [],
            denseSiblingFoodIds,
            categoryMemberFoodIds,
            twinIngredientIds,
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
      restaurantPagination: { skip: number; take: number };
      dishPagination: { skip: number; take: number };
      includeSqlPreview?: boolean;
    }): Promise<StageExecutionResult> => {
      // CUTOVER 2026-08-02: the pooled gate IS the execution — one gated
      // query per projection replaced the relaxation ladder entirely.
      return this.executePooledStage({
        request,
        planExpansion,
        pagination,
        restaurantPagination: params.restaurantPagination,
        dishPagination: params.dishPagination,
        topDishesLimit: TOP_DISHES_LIMIT,
        threshold: POOLED_COVERAGE_THRESHOLD,
        includeSqlPreview: params.includeSqlPreview,
      });
    };

    // THE PROBE IS THE PAGE. There used to be a pre-page "strict probe" whose
    // take was clamped up to the relaxation threshold so the ladder's exclusion
    // set was complete. Relaxation is gone (CUTOVER 2026-08-02), nothing
    // consumes a pre-page probe, and clamping would only run the SAME pooled
    // query twice on page ≥2 (red team C6) — so the page's own pagination is
    // used directly.
    const pooledPagination = pagination;

    let pooledPage = await executeStage({
      restaurantPagination: pooledPagination,
      dishPagination: pooledPagination,
      includeSqlPreview: false,
    });

    // Coverage for the expansion trigger: in pooled mode the admitted-set
    // totals are inflated (soft words left the membership), so the honest
    // strict-equivalent is the TIER-0 (all-words) count (red team C4) —
    // otherwise thin queries never expand, exactly the ring they need.
    const pooledCoverageCount = pooledPage.exec.pooledFullCounts
      ? pooledPage.exec.pooledFullCounts.restaurants +
        pooledPage.exec.pooledFullCounts.dishes
      : pooledPage.exec.totalRestaurantCount + pooledPage.exec.totalDishCount;
    const unresolvedGroups =
      request.submissionContext?.unresolvedEntities ?? [];
    const hasUnresolvedTerms = unresolvedGroups.some(
      (group) => group.terms?.length,
    );
    if (this.debugMode !== 'off') {
      this.logger.info('Search debug: strict probe', {
        searchRequestId,
        pooledCoverageCount,
        pooledCounts: {
          restaurantsOnPage: pooledPage.exec.restaurants.length,
          dishesOnPage: pooledPage.exec.dishes.length,
          totalRestaurants: pooledPage.exec.totalRestaurantCount,
          totalDishes: pooledPage.exec.totalDishCount,
        },
        planMs: Math.round(pooledPage.timings.planMs),
        executeMs: Math.round(pooledPage.timings.executeMs),
        hasUnresolvedTerms,
        expansionStrictCoverageTarget: this.expansionStrictCoverageTarget,
      });
    }
    if (
      this.hasEntityTargets(request) &&
      (pooledCoverageCount < this.expansionStrictCoverageTarget ||
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
      }> = this.buildPlanExpansionForRequest(request, pooledPage.stagePlan)
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
          // Twins are seeded pre-probe only — the lexical expansionResult
          // carries [], so preserve the seeded set.
          twinIngredientIds: planExpansion?.twinIngredientIds ?? [],
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
          // MAX-merge, never overwrite: a tier-0 category member that ALSO
          // returns as a weak lexical match must keep its stronger
          // relevance (a blind spread let 0.5 clobber 1.0 — display-only,
          // but the number the client shows should be the best evidence).
          relevanceByFoodId: mergeRelevanceMax(
            planExpansion?.relevanceByFoodId ?? {},
            expansionResult.relevanceByFoodId,
          ),
        };
        expansionAnalysisMetadata = this.buildExpansionMetadata(
          pooledCoverageCount,
          planExpansion,
          {
            belowTarget:
              pooledCoverageCount < this.expansionStrictCoverageTarget,
            hasUnresolvedTerms,
          },
        );
        if (this.debugMode !== 'off') {
          this.logger.info('Search debug: plan expansion applied', {
            searchRequestId,
            expansionMs,
            pooledCoverageCount,
            trigger: {
              belowTarget:
                pooledCoverageCount < this.expansionStrictCoverageTarget,
              hasUnresolvedTerms,
            },
            added: {
              foods: planExpansion.foodIds.length,
              foodAttributes: planExpansion.foodAttributeIds.length,
              restaurantAttributes: planExpansion.restaurantAttributeIds.length,
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
        pooledPage = await executeStage({
          restaurantPagination: pooledPagination,
          dishPagination: pooledPagination,
          includeSqlPreview: false,
        });
      }
    }

    const plan = pooledPage.stagePlan;
    phaseTimings.queryPlanMs = Math.round(pooledPage.timings.planMs);

    // The probe ran with the request's real pagination — it IS the page.
    const pooledResult = pooledPage;

    const primaryFoodTermRaw =
      request.entities.food?.[0]?.originalText ??
      request.entities.food?.[0]?.normalizedName ??
      null;
    const primaryFoodTerm = primaryFoodTermRaw
      ? primaryFoodTermRaw.trim()
      : null;

    {
      phaseTimings.queryExecuteMs = Math.round(pooledResult.timings.executeMs);
      if (pooledResult.exec.timings) {
        Object.assign(phaseTimings, pooledResult.exec.timings);
      }

      const totalRestaurantResults = pooledResult.exec.totalRestaurantCount;
      const totalFoodResults = pooledResult.exec.totalDishCount;
      const totalResults = totalFoodResults + totalRestaurantResults;

      const viewportEligible = this.isViewportEligibleForOnDemand(
        request.bounds,
      );
      const onDemandEngineContext = {
        engineIds: viewportEligible
          ? engineViewportCoverage.engines.map((engine) => engine.engineId)
          : [],
      };

      // STARVED WORDS ARE THEIR OWN TRIGGER (spec §1.6; red team C2): the
      // gate admitting partial rows makes the page LOOK full — precisely
      // then, a zero-coverage word must still fire its demand signal.
      let starved = this.computeStarvedSoftWords(
        request,
        pooledResult.exec.pooledSoftWordCounts,
      );
      // HARD WORDS STARVE TOO (spec §6, red team R4-F5): a dietary wall is
      // never soft-counted, but ZERO results with a dietary constraint IS
      // the "vegan failed in this viewport" signal — name the word.
      if (totalResults === 0) {
        const hardStarved = await this.collectDietaryTerms(request);
        for (const name of request.dietary ?? []) {
          if (!hardStarved.terms.includes(name)) hardStarved.terms.push(name);
        }
        if (hardStarved.terms.length) {
          starved = {
            attributeIds: [
              ...(starved?.attributeIds ?? []),
              ...hardStarved.attributeIds,
            ],
            terms: [...(starved?.terms ?? []), ...hardStarved.terms],
          };
        }
      }
      const shouldTriggerOnDemand =
        this.shouldTriggerOnDemand(
          request,
          plan.format,
          totalRestaurantResults,
        ) || Boolean(starved);
      const onDemandResult = shouldTriggerOnDemand
        ? await this.recordLowResultOnDemand({
            request,
            planFormat: plan.format,
            restaurantCount: totalRestaurantResults,
            dishCount: totalFoodResults,
            viewportEligible,
            onDemandEngineContext,
            expansionSignals: expansionAnalysisMetadata,
            starved,
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
        boundsApplied: pooledResult.exec.metadata.boundsApplied,
        openNowApplied: pooledResult.exec.metadata.openNowApplied,
        priceFilterApplied: pooledResult.exec.metadata.priceFilterApplied,
        minimumVotesApplied: pooledResult.exec.metadata.minimumVotesApplied,
        page: pagination.page,
        pageSize: pagination.pageSize,
        resultCoverageStatus,
        primaryFoodTerm: primaryFoodTerm || undefined,
        // §2 header law (master plan §22 cut 3): the VALUE comes from the
        // Place Catalog (resolveDisplayPlaceName); the FIELD name is the
        // frozen wire contract until the mobile-side cut.
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
        pooledCoverageCount,
        hasUnresolvedTerms,
        planExpansion,
        pooledCounts: {
          restaurantsOnPage: pooledResult.exec.restaurants.length,
          dishesOnPage: pooledResult.exec.dishes.length,
          totalRestaurants: pooledResult.exec.totalRestaurantCount,
          totalDishes: pooledResult.exec.totalDishCount,
        },
        pooledCoverage: { threshold: POOLED_COVERAGE_THRESHOLD },
        onDemand: {
          triggered: shouldTriggerOnDemand,
          queued: onDemandQueued,
        },
      });

      if (request.openNow && !pooledResult.exec.metadata.openNowApplied) {
        this.logger.warn(
          'Open-now filter requested but insufficient metadata to evaluate',
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
        dishCount: pooledResult.exec.dishes.length,
        restaurantCount: pooledResult.exec.restaurants.length,
        metadata,
      });

      if (this.debugMode !== 'off') {
        this.logger.info('Search debug: runQuery end', {
          searchRequestId,
          queryExecutionTimeMs: metadata.queryExecutionTimeMs,
          resultCoverageStatus: metadata.resultCoverageStatus,
          totals: {
            totalRestaurantResults,
            totalFoodResults,
          },
          onDemandQueued: metadata.onDemandQueued ?? false,
          onDemandEtaMs: metadata.onDemandEtaMs ?? null,
          pooledCounts: {
            restaurantsOnPage: pooledResult.exec.restaurants.length,
            dishesOnPage: pooledResult.exec.dishes.length,
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

      const response: SearchResponseDto = {
        format: plan.format,
        plan,
        dishes: pooledResult.exec.dishes,
        restaurants: pooledResult.exec.restaurants,
        sqlPreview: includeSqlPreview
          ? (pooledResult.exec.sqlPreview ?? null)
          : null,
        metadata,
      };
      // similarAvailable is a MEASURED window count from the one execution
      // (tier-2 ring rows in the same scan) — no second pipeline run.
      response.metadata.similarAvailable =
        pooledResult.exec.similarAvailable ?? 0;
      return this.applySearchResponseProfile(response, request);
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
    // Same redirect-hop + archived guard as getRestaurantProfile (HIGH-3).
    const redirect = await this.prisma.entityRedirect.findUnique({
      where: { fromEntityId: restaurantId },
      select: { toEntityId: true },
    });
    const resolvedId = redirect?.toEntityId ?? restaurantId;
    const host = await this.prisma.entity.findFirst({
      where: {
        entityId: resolvedId,
        type: EntityType.restaurant,
        status: { not: EntityStatus.archived },
      },
      select: { entityId: true },
    });
    if (!host) {
      return [];
    }
    restaurantId = host.entityId;
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
        -- Rollup rows (is_category_item) exist ONLY as parents of more
        -- specific dishes at this restaurant (projection-rebuild mints them
        -- from child connections) — serving them as dish rows duplicates
        -- their children. They stay scored for rollup semantics; they are
        -- never a dish row.
        AND NOT c.is_category_item
      ORDER BY
        pcs.display_score DESC,
        c.mention_count DESC,
        c.total_upvotes DESC,
        -- Determinism key, not a quality signal (F1902): every other
        -- dish/restaurant ORDER BY in this module terminates in an id
        -- anchor (see resolveDishOrderSql / resolveTopDishRankOrderSql in
        -- search-query.builder.ts). Without it, dishes tied on all three
        -- ranking keys above resolve by physical row order, which Postgres
        -- does not guarantee stable across requests/replans — the dish list
        -- (and topFood) could shuffle between identical requests.
        c.connection_id ASC;
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

    // MERGED-AWAY IDS LIVE ON in shares/lists/notifications: resolve one
    // redirect hop, and never serve an archived husk (final-final red
    // team HIGH-3 — executed: an archived merge loser rendered a full
    // profile).
    const redirect = await this.prisma.entityRedirect.findUnique({
      where: { fromEntityId: restaurantId },
      select: { toEntityId: true },
    });
    const resolvedRestaurantId = redirect?.toEntityId ?? restaurantId;
    const restaurant = await this.prisma.entity.findFirst({
      where: {
        entityId: resolvedRestaurantId,
        type: EntityType.restaurant,
        status: { not: EntityStatus.archived },
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
          // Match listRestaurantDishes: rollup rows are not dishes, so the
          // profile's dish count must not count them either.
          isCategoryItem: false,
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
    // Sectioned ranking (STEP-4: read from the STRUCTURE): tier 0 =
    // anchors + family (is-a instances — "neapolitan pizza" IS the pizza
    // you asked for); tier 1 = the similar set. Fires only when similar
    // actually widened the membership past tier 0.
    const grounding = constraints.grounding.food;
    const exactFoodIds =
      this.sectionedRanking && grounding.anchors.length
        ? Array.from(new Set([...grounding.anchors, ...grounding.family]))
        : [];
    const widened =
      exactFoodIds.length > 0 &&
      constraints.ids.foodIds.length > exactFoodIds.length;

    const twinIngredientIds = grounding.twinIngredientIds;
    if (
      !hasPrimaryFoodAttributeQuery &&
      !widened &&
      !twinIngredientIds.length
    ) {
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
      twinIngredientIds: twinIngredientIds.length
        ? twinIngredientIds
        : undefined,
    };
  }

  /**
   * STEP-3 POOLED EXECUTION (spec §1.4; owner rulings 2026-08-01): ONE
   * query per projection. Membership = hard constraints only (subject +
   * family + dietary + structural); every SOFT (non-dietary) attribute id
   * becomes per-row provenance, and the in-query gate admits partial rows
   * only when all-word rows cannot fill a page. Replaces the probe →
   * relax → exclusion-list → stitch ladder with a single execution whose
   * pagination is plain OFFSET/LIMIT over one deterministic order.
   */
  private async executePooledStage(params: {
    request: SearchQueryRequestDto;
    planExpansion: PlanExpansionState | null;
    pagination: PaginationState;
    restaurantPagination: { skip: number; take: number };
    dishPagination: { skip: number; take: number };
    topDishesLimit: number;
    threshold: number;
    includeSqlPreview?: boolean;
  }): Promise<StageExecutionResult> {
    const planStart = performance.now();
    const priceLevels = this.normalizePriceLevels(params.request.priceLevels);
    const minimumVotes = this.normalizeMinimumVotes(
      params.request.minimumVotes,
    );
    const dietaryIds = await this.dietaryConstraints.getDietaryIds();
    const constraints = this.buildSearchConstraints(
      params.request,
      {
        format: 'dual_list',
        priceLevels,
        minimumVotes,
      },
      params.planExpansion,
    );
    const dietary = new Set(dietaryIds);
    // SUBJECT IS SACRED (spec §1.4.1; red team C1): softening applies to
    // MODIFIERS of a subject. When the attributes ARE the subject (no
    // food/restaurant/ingredient grounding), stripping them would leave
    // membership = the whole viewport — the ladder refuses this drop
    // (canDropFoodAttributes requires primary entities) and so do we:
    // the query runs as a plain strict single query, attributes as walls.
    const hasPrimarySubject =
      constraints.ids.foodIds.length > 0 ||
      constraints.ids.restaurantIds.length > 0 ||
      constraints.ids.ingredientIds.length > 0;
    // DoS bound (red team R4-P5): each soft id adds a full re-scan arm to
    // the count query (+~85ms each, attacker-controlled by attribute word
    // count). 8 covers every real query shape; beyond it the extra words
    // still filter via provenance of the first 8.
    const SOFT_ID_CAP = 8;
    const softFoodAttributeIds = hasPrimarySubject
      ? constraints.ids.foodAttributeIds
          .filter((id) => !dietary.has(id))
          .slice(0, SOFT_ID_CAP)
      : [];
    const softRestaurantAttributeIds = hasPrimarySubject
      ? constraints.ids.restaurantAttributeIds
          .filter((id) => !dietary.has(id))
          .slice(0, SOFT_ID_CAP)
      : [];
    // DIETARY WALLS (owner semantics 2026-08-04): a dietary requirement is
    // per-projection — dish shows only with the DISH-side attribute; a
    // restaurant shows with the VENUE-side attribute OR any dish carrying
    // the dish-side one. So dietary ids leave the plain membership filters
    // entirely and become structured walls; activation comes from BOTH the
    // toggle strip (request.dietary names) and query-text grounding (one
    // grounded side activates the whole pair).
    const dietaryPairs = await this.dietaryConstraints.getDietaryPairs();
    const wallNames = new Set<string>(
      (params.request.dietary ?? [])
        .map((name) => name.trim().toLowerCase())
        .filter((name) => dietaryPairs.has(name)),
    );
    for (const [name, pair] of dietaryPairs) {
      const grounded =
        (pair.foodAttributeId &&
          constraints.ids.foodAttributeIds.includes(pair.foodAttributeId)) ||
        (pair.restaurantAttributeId &&
          constraints.ids.restaurantAttributeIds.includes(
            pair.restaurantAttributeId,
          ));
      if (grounded) wallNames.add(name);
    }
    const dietaryWalls = Array.from(wallNames).map((name) => ({
      name,
      ...dietaryPairs.get(name)!,
    }));

    // Membership: soft ids move to provenance; dietary ids move to WALLS.
    // Presence bookkeeping is untouched — it describes the QUERY the user
    // asked, not the WHERE we execute.
    const softSet = new Set([
      ...softFoodAttributeIds,
      ...softRestaurantAttributeIds,
    ]);
    const pooledConstraints: SearchConstraints = {
      ...constraints,
      ids: {
        ...constraints.ids,
        foodAttributeIds: constraints.ids.foodAttributeIds.filter(
          (id) => !softSet.has(id) && !dietary.has(id),
        ),
        restaurantAttributeIds: constraints.ids.restaurantAttributeIds.filter(
          (id) => !softSet.has(id) && !dietary.has(id),
        ),
      },
    };
    const stagePlan = compileQueryPlanFromConstraints(pooledConstraints);
    const planMs = performance.now() - planStart;

    // TIER-2 SIMILAR RING (round-5, spec §7.2 dissolved): the sibling ring
    // rides the SAME dish scan as provenance tier 2 — counted, never
    // served. The Include-similar chip re-queries with the ring as tier-1
    // MEMBERS (the siblingsWanted path), so no second execution exists.
    let similarFoodIds: string[] = [];
    if (params.request.includeSimilar !== true) {
      const anchorIds = this.collectEntityIds(params.request.entities.food);
      if (anchorIds.length) {
        const memberIds = new Set(constraints.ids.foodIds);
        const [siblings, judged] = await Promise.all([
          this.siblingExpansion.getSiblingFoodIds(
            anchorIds,
            this.denseSiblingsCut,
          ),
          // Judged cousins (rung 4) belong in the ring alongside dense
          // siblings — they are the BETTER-vetted half of "adjacent things",
          // and the ring is what the auto-fill gate and the chip both read.
          this.siblingExpansion.getSatisfiesFoodIds(anchorIds),
        ]);
        similarFoodIds = Array.from(
          new Set([
            ...siblings.map((sibling) => sibling.siblingId),
            ...judged.cousin,
          ]),
        ).filter((id) => !memberIds.has(id));
      }
    }

    // No soft words AND no ring ⇒ no gate to run: the pooled query
    // degenerates to the plain strict single query (an empty soft-id list
    // must not reach the builder — Prisma.join([]) throws).
    const hasSoftIds =
      softFoodAttributeIds.length > 0 || softRestaurantAttributeIds.length > 0;
    const directives = {
      ...this.buildExecutionDirectives(
        params.request,
        constraints,
        params.planExpansion,
      ),
      ...(dietaryWalls.length ? { dietaryWalls } : {}),
      ...(hasSoftIds || similarFoodIds.length
        ? {
            pooledGate: {
              softFoodAttributeIds,
              softRestaurantAttributeIds,
              // One page = what the CLIENT asked for (red team A3): a
              // pageSize above the default must not come back short
              // because the gate closed at 25.
              threshold: Math.max(
                params.threshold,
                params.dishPagination.take,
                params.restaurantPagination.take,
              ),
              ...(similarFoodIds.length ? { similarFoodIds } : {}),
            },
          }
        : {}),
    };

    const executeStart = performance.now();
    const relevanceByFoodId = this.relevanceFromGrounding(
      constraints.grounding.food,
    );
    const exec = await this.queryExecutor.executeDual({
      plan: stagePlan,
      request: params.request,
      pagination: params.pagination,
      restaurantPagination: params.restaurantPagination,
      dishPagination: params.dishPagination,
      topDishesLimit: params.topDishesLimit,
      includeSqlPreview: params.includeSqlPreview,
      directives,
    });
    const executeMs = performance.now() - executeStart;

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

  /** Query-food relatedness per food id: exact + is-a instances = 1.0, widened
   *  ids (siblings/lexical) carry their graded scores from plan expansion.
   *  Null when the query resolved no food (browse/restaurant queries). */
  /** STEP-4: graded relatedness is a VIEW of the grounding structure —
   *  anchors and family are the thing itself (1); similar carries its
   *  calibrated relevance. No side-map reconstruction. */
  private relevanceFromGrounding(
    grounding: FoodGrounding,
  ): Record<string, number> | null {
    if (!grounding.anchors.length) return null;
    const map: Record<string, number> = { ...grounding.similar };
    for (const id of grounding.anchors) map[id] = 1;
    for (const id of grounding.family) map[id] = 1;
    return map;
  }

  private buildSearchConstraints(
    request: SearchQueryRequestDto,
    inputs: {
      format: SearchConstraints['format'];
      priceLevels: number[];
      minimumVotes: number | null;
    },
    planExpansion?: PlanExpansionState | null,
  ): SearchConstraints {
    // CUTOVER: relaxation stages are gone — dietary hardness lives in the
    // pooled hard/soft split (executePooledStage), not in staged drops. There
    // is one presence summary (no per-stage copy).
    const inputPresence = this.getEntityPresenceSummary(request);
    const staged = {
      foodAttributeIds: this.collectEntityIds(request.entities.foodAttributes),
      restaurantAttributeIds: this.collectEntityIds(
        request.entities.restaurantAttributes,
      ),
    };

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
      inputPresence.foodAttributes > 0 ? staged.foodAttributeIds : [];
    const restaurantAttributeIds =
      inputPresence.restaurantAttributes > 0
        ? staged.restaurantAttributeIds
        : [];

    const dedupe = (ids: string[]): string[] =>
      Array.from(new Set(ids.filter(Boolean)));
    const mergeIfBase = (base: string[], added: string[]): string[] =>
      base.length ? dedupe([...base, ...(added ?? [])]) : base;

    const baseRestaurantIds = this.collectEntityIds(
      request.entities.restaurants,
    );
    const baseFoodIds = this.collectEntityIds(request.entities.food);

    // STEP-4 STRUCTURED GROUNDING (spec §1.2): build the structure ONCE;
    // the flat foodIds array below is a derived view of it (anchors ∪
    // family ∪ similar, only when anchors exist — widening never invents
    // a subject). Downstream consumers (exact tier, relevance attach,
    // widened detection) read the structure, not reconstructions.
    const similar: Record<string, number> = {};
    if (baseFoodIds.length && planExpansion) {
      const relevance = planExpansion.relevanceByFoodId;
      for (const id of [
        ...planExpansion.foodIds,
        ...planExpansion.denseSiblingFoodIds,
      ]) {
        if (id) similar[id] = relevance[id] ?? 1;
      }
    }
    const foodGrounding: FoodGrounding = {
      anchors: baseFoodIds,
      family: baseFoodIds.length
        ? dedupe(planExpansion?.categoryMemberFoodIds ?? [])
        : [],
      similar,
      twinIngredientIds: baseFoodIds.length
        ? dedupe(planExpansion?.twinIngredientIds ?? [])
        : [],
    };

    return {
      format: inputs.format,
      inputPresence,
      hadFoodGroup,
      hadRestaurantGroup,
      hadFoodAttributeGroup,
      hadRestaurantAttributeGroup,
      primaryFoodAttributeQuery,
      grounding: { food: foodGrounding },
      ids: {
        restaurantIds: baseRestaurantIds,
        // DERIVED VIEW of the structure — the membership the builder needs,
        // with exactness/relevance living in `grounding`, not rebuilt later.
        foodIds: mergeIfBase(foodGrounding.anchors, [
          ...Object.keys(foodGrounding.similar),
          ...foodGrounding.family,
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

    const priceLevels = this.normalizePriceLevels(input.request.priceLevels);
    const minimumVotes = this.normalizeMinimumVotes(input.request.minimumVotes);
    const constraints = this.buildSearchConstraints(
      input.request,
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
        inputPresence: constraints.inputPresence,
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
      // One pooled execution — there is no 'strict' stage to report against.
      pooled: {
        coverageCount: input.pooledCoverageCount,
        counts: input.pooledCounts,
      },
      expansion: {
        strictCoverageTarget: this.expansionStrictCoverageTarget,
        hasUnresolvedTerms: input.hasUnresolvedTerms,
      },
      pooledCoverage: {
        ...input.pooledCoverage,
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
    /** STEP-5: pooled mode's per-word starvation verdict. When present, the
     *  attribute-typed demand requests narrow to the starved words only. */
    starved?: { attributeIds: string[]; terms: string[] };
  }): Promise<{ queued: boolean; etaMs?: number }> {
    try {
      const lowResultRequests = this.buildLowResultRequests(
        params.request,
        params.onDemandEngineContext,
        params.starved?.attributeIds,
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
        ...(params.starved ? { starvedWords: params.starved.terms } : {}),
      };

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
          place_id: string | null;
          geo_min_lat: number;
          geo_min_lng: number;
          geo_max_lat: number;
          geo_max_lng: number;
          meta: Prisma.JsonValue;
        }[]
      >`
        SELECT s.subject_id, s.subject_text, s.place_id,
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
      // P5b: a copy carries the ORIGINAL's anchor. Today this path is filtered
      // to kind='search', which is never anchored, so this is defensive — but
      // the copy hand-lists columns, so any anchored kind reaching it would
      // silently lose its WHERE and fall back to the geo point. Carrying the
      // anchor costs nothing and closes the class.
      placeId: original.place_id,
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
      return 'full';
    }

    // A NAMED term that resolved to ZERO ids is unresolved — not a
    // generic browse wearing full coverage (final-final red team
    // MEDIUM-2: {normalizedName:'unicorn meat', entityIds:[]} returned
    // the same top-25 as an empty request and called it full).
    const lanes = [
      ...(request.entities.food ?? []),
      ...(request.entities.foodAttributes ?? []),
      ...(request.entities.restaurants ?? []),
      ...(request.entities.restaurantAttributes ?? []),
    ];
    const hasNamedUnresolvedLane = lanes.some(
      (lane) =>
        (lane.normalizedName ?? '').trim().length > 0 &&
        (lane.entityIds ?? []).filter(Boolean).length === 0,
    );
    if (hasNamedUnresolvedLane) {
      return 'unresolved';
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

  /**
   * STEP-5 per-word starvation (spec §1.6): a soft attribute id is STARVED
   * when its in-pool coverage count is zero on every projection that could
   * carry it — the word found NOTHING here, so the demand signal names it
   * precisely instead of re-mining every query term. Terms resolve through
   * the request's attribute entities (originalText preferred — the user's
   * word, not the canonical name).
   */
  /** Dietary-flagged attribute entities present on the request, with the
   *  user's words — the hard-constraint half of the starvation signal. */
  private async collectDietaryTerms(
    request: SearchQueryRequestDto,
  ): Promise<{ attributeIds: string[]; terms: string[] }> {
    const dietaryIds = await this.dietaryConstraints.getDietaryIds();
    const attributeIds: string[] = [];
    const terms: string[] = [];
    const collect = (entities: QueryEntityDto[] | undefined) => {
      for (const entity of entities ?? []) {
        const hard = (entity.entityIds ?? []).filter((id) =>
          dietaryIds.has(id),
        );
        if (hard.length) {
          attributeIds.push(...hard);
          const term = entity.originalText || entity.normalizedName;
          if (term) terms.push(term);
        }
      }
    };
    collect(request.entities.foodAttributes);
    collect(request.entities.restaurantAttributes);
    return { attributeIds, terms };
  }

  private computeStarvedSoftWords(
    request: SearchQueryRequestDto,
    pooledSoftWordCounts:
      | {
          dish: Record<string, number> | null;
          restaurant: Record<string, number> | null;
        }
      | undefined,
  ): { attributeIds: string[]; terms: string[] } | undefined {
    if (!pooledSoftWordCounts) {
      return undefined;
    }
    const dish = pooledSoftWordCounts.dish ?? {};
    const restaurant = pooledSoftWordCounts.restaurant ?? {};
    const ids = new Set<string>([
      ...Object.keys(dish),
      ...Object.keys(restaurant),
    ]);
    const starvedIds = Array.from(ids).filter(
      (id) => (dish[id] ?? 0) === 0 && (restaurant[id] ?? 0) === 0,
    );
    if (!starvedIds.length) {
      return undefined;
    }
    const starvedSet = new Set(starvedIds);
    const measured = ids;
    const ids_in_scope = (id: string) => measured.has(id);
    const terms: string[] = [];
    const collect = (entities: QueryEntityDto[] | undefined) => {
      for (const entity of entities ?? []) {
        const ids = (entity.entityIds ?? []).filter((id) => ids_in_scope(id));
        if (ids.length && ids.every((id) => starvedSet.has(id))) {
          const term = entity.originalText || entity.normalizedName;
          if (term) {
            terms.push(term);
          }
        }
      }
    };
    collect(request.entities.foodAttributes);
    collect(request.entities.restaurantAttributes);
    return { attributeIds: starvedIds, terms };
  }

  private buildLowResultRequests(
    request: SearchQueryRequestDto,
    engineContext: {
      engineIds: string[];
    },
    starvedAttributeIds?: string[],
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

    // STEP-5 narrowing: when pooled mode proved WHICH words starved, only
    // those attribute entities become demand requests — a word with in-pool
    // coverage isn't the reason results ran low.
    const starvedSet = starvedAttributeIds?.length
      ? new Set(starvedAttributeIds)
      : null;
    const onlyStarved = (entities: QueryEntityDto[] | undefined) =>
      starvedSet
        ? (entities ?? []).filter((entity) =>
            (entity.entityIds ?? []).some((id) => starvedSet.has(id)),
          )
        : entities;

    pushEntities(request.entities.food, 'food');
    pushEntities(
      onlyStarved(request.entities.foodAttributes),
      'food_attribute',
    );
    pushEntities(request.entities.restaurants, 'restaurant');
    pushEntities(
      onlyStarved(request.entities.restaurantAttributes),
      'restaurant_attribute',
    );

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
    // ONE resolver (red team 2026-08-02) — five services hand-rolled this.
    const isProd = isProdEnv(resolveAppEnv());
    return !isProd;
  }

  private resolveAlwaysIncludeSqlPreview(): boolean {
    if (!this.isDevEnvironment) {
      return false;
    }
    // Opt-DOWN: on in dev unless explicitly turned off.
    return !isEnvFlagExplicitlyDisabled(
      process.env.SEARCH_ALWAYS_INCLUDE_SQL_PREVIEW,
    );
  }

  private resolveIncludePhaseTimings(): boolean {
    return isEnvFlagEnabled(process.env.SEARCH_INCLUDE_PHASE_TIMINGS);
  }

  private resolveExplainEnabled(): boolean {
    // Defaults to the dev answer; an explicit value in either direction wins.
    return isEnvFlagEnabled(
      process.env.SEARCH_EXPLAIN_ENABLED,
      this.isDevEnvironment,
    );
  }

  private resolveOnDemandMinResults(): number {
    return ON_DEMAND_MIN_RESULTS;
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

  /** The "include similar dishes" decision (SETTLED, pre-launch.md): the
   *  client always sends the explicit toggle; the old env mode
   *  (SEARCH_DENSE_SIBLINGS_MODE) was dead weight for real traffic and is
   *  DELETED. Chip ON widens membership up front; chip OFF (or absent)
   *  never silently widens — the tier-2 ring counts what the chip would
   *  add, and thinness speaks through the demand signal, not through
   *  serving rows the user opted out of. */
  private siblingsWanted(
    request: SearchQueryRequestDto,
    context: 'preProbe' | 'expansion',
  ): boolean {
    return context === 'preProbe' && request.includeSimilar === true;
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
    pooledCoverageCount: number,
    expansion: PlanExpansionState,
    trigger: { belowTarget: boolean; hasUnresolvedTerms: boolean },
  ): Record<string, unknown> {
    return {
      idExpansion: {
        pooledCoverageCount,
        strictCoverageTarget: this.expansionStrictCoverageTarget,
        trigger,
        foodsAdded: expansion.foodIds.length,
        foodAttributesAdded: expansion.foodAttributeIds.length,
        restaurantAttributesAdded: expansion.restaurantAttributeIds.length,
        foodsFromPrimaryFoodAttributeTextAdded:
          expansion.foodIdsFromPrimaryFoodAttributeText.length,
        denseSiblingFoodsAdded: expansion.denseSiblingFoodIds.length,
        categoryMemberFoodsAdded: expansion.categoryMemberFoodIds.length,
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

    // ONE evidence engine, per-consumer floors (step 4): the admission
    // question lives in evidence-admission.ts alongside the linker's —
    // different floors (an expansion admit is absorbed by provenance +
    // score ranking; a link asserts identity), one authority.
    const passesExpansionEvidence = admitsForExpansion;

    // DIETARY EXCLUSION (spec §7.1; red team C7): dietary attributes are
    // hard walls and explicitly OUT of lexical expansion — a fuzzy-admitted
    // dietary id would otherwise become a non-relaxable constraint the
    // user never asked for.
    const expansionDietaryIds = await this.dietaryConstraints.getDietaryIds();
    const foodIds = foods
      .filter(passesExpansionEvidence)
      .map((match) => match.entityId)
      .filter((id) => !existingFoodIds.has(id));
    const foodAttributeIds = foodAttributes
      .filter(passesExpansionEvidence)
      .map((match) => match.entityId)
      .filter(
        (id) =>
          !existingFoodAttributeIds.has(id) && !expansionDietaryIds.has(id),
      );
    const restaurantAttributeIds = restaurantAttributes
      .filter(passesExpansionEvidence)
      .map((match) => match.entityId)
      .filter(
        (id) =>
          !existingRestaurantAttributeIds.has(id) &&
          !expansionDietaryIds.has(id),
      );

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
      twinIngredientIds: [],
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
