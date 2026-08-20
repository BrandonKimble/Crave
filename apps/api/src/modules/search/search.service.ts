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
import { JudgedVocabularyService } from '../content-processing/entity-resolver/judged-vocabulary.service';
import {
  EntityScope,
  ItemResultDto,
  QueryEntityDto,
  QueryPlan,
  QUERY_ENTITY_GROUP_KEYS,
  countQueryEntityGroupEntries,
  SearchQueryRequestDto,
  PlaceResultDto,
  PlaceProfileDto,
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
  type SiblingExpansionReader,
} from './search-sibling-expansion.service';
import { DietaryConstraintRegistry } from './dietary-constraints';
import type { SearchExecutionDirectives } from './search-execution-directives';
import {
  ON_DEMAND_MIN_RESULTS,
  ON_DEMAND_VIEWPORT_MIN_WIDTH_MILES,
} from './on-demand-tuning.constants';
import { admitsForExpansion } from './evidence-admission';
import type { ItemGrounding, SearchConstraints } from './search-constraints';
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
import { PlaceStatusService } from './restaurant-status.service';
import type { PlaceStatusPreviewDto } from './dto/restaurant-status-preview.dto';
import { renderInlinedSql } from './sql-preview';
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

type PlaceDishRow = {
  connection_id: string;
  place_id: string;
  item_id: string;
  item_attributes: string[];
  mention_count: number;
  total_upvotes: number;
  last_mentioned_at: Date | null;
  crave_score: unknown;
  rising: unknown;
  place_crave_score: unknown;
  place_name: string;
  place_price_level: number | null;
  item_name: string;
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
  places: number;
  items: number;
  itemAttributes: number;
  placeAttributes: number;
}

interface PlanExpansionState {
  itemIds: string[];
  itemAttributeIds: string[];
  placeAttributeIds: string[];
  itemIdsFromPrimaryItemAttributeText: string[];
  // Dense sibling co-inclusion (precomputed mutual-rank edges — see
  // SearchSiblingExpansionService). Kept as its OWN field, not folded into
  // foodIds: attribution stays clean in metadata/debug, lexical expansion can
  // dedupe against it, and a future relevancy sort needs exact-vs-sibling ids
  // distinguishable.
  denseSiblingItemIds: string[];
  // Canonical category members of the EXACT query foods (one-hop; see
  // getCategoryMemberItemIds). Replaces the per-connection `c.categories &&`
  // SQL arm — membership is resolved at plan time from the per-food edge table.
  categoryMemberItemIds: string[];
  /** Same-named ingredient entities of the query foods (twin union — the
   *  builder ORs their containment into the food clause). */
  twinIngredientIds: string[];
  // Graded relatedness of every widened food id to the QUERY entity, on one
  // calibrated scale: siblings carry CEILING-NORMALIZED cosine (cosine ÷ the
  // query dish's closest-sibling cosine — comparable across queries, unlike raw
  // cosine whose family ceilings span ~0.77–0.95), lexical variants carry their
  // match similarity, is-a instances are 1.0. Attached to result rows for the
  // future relevancy treatment; unread by ranking today.
  relevanceByItemId: Record<string, number>;
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
    totalPlaces: number;
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
  statusPreview?: PlaceStatusPreviewDto | null;
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
  private readonly expansionItemCap: number;
  private readonly expansionAttributeCap: number;
  private readonly expansionMaxTermsPerType: number;
  private readonly denseSiblingsCut: SiblingCutOptions;
  private readonly expansionBudgetMs: number;

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
    private readonly placeStatusService: PlaceStatusService,
    private readonly signals: SignalsService,
    private readonly signalDemandRead: SignalDemandReadService,
    private readonly placesCatalog: PlacesCatalogService,
    private readonly placesReconciler: PlacesReconcilerService,
    private readonly placesPromotions: PlacesPromotionService,
    private readonly judgedVocabulary: JudgedVocabularyService,
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
    this.expansionItemCap = this.resolveExpansionItemCap();
    this.expansionAttributeCap = this.resolveExpansionAttributeCap();
    this.expansionMaxTermsPerType = this.resolveExpansionMaxTermsPerType();
    this.denseSiblingsCut = this.resolveDenseSiblingsCut();
    this.expansionBudgetMs = this.resolveExpansionBudgetMs();
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
      placeFilterCount: plan.placeFilters.length,
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
    const { dataSql } = this.queryBuilder.buildDishQuery({
      plan,
      pagination,
    });

    return { plan, sqlPreview: renderInlinedSql(dataSql) };
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

    const primaryItemTermRaw =
      request.entities.items?.[0]?.originalText ??
      request.entities.items?.[0]?.normalizedName ??
      null;
    const primaryItemTerm = primaryItemTermRaw
      ? primaryItemTermRaw.trim()
      : null;

    return {
      format: plan.format,
      plan,
      dishes: [],
      places: [],
      sqlPreview,
      metadata: {
        totalItemResults: 0,
        totalPlaceResults: 0,
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
        primaryItemTerm: primaryItemTerm || undefined,
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
    // H6: ONE widening resolution per request — every sibling/satisfies read
    // below (pre-probe seed, pooled-stage similar ring, lexical expansion)
    // goes through this memoized reader.
    const widening = this.siblingExpansion.forRequest();
    {
      const anchorItemIds = this.collectEntityIds(request.entities.items);
      if (anchorItemIds.length) {
        const [
          edgeMemberItemIds,
          nameVariantItemIds,
          twinIngredientIds,
          siblingMatches,
          judgedRelations,
        ] = await Promise.all([
          // Category members apply on EVERY search (they replace the old
          // per-connection `c.categories &&` SQL arm) — one-hop: resolved
          // from the exact query foods only.
          widening.getCategoryMemberItemIds(anchorItemIds),
          // Name-containment failsafe (owner ruling 2026-07-25): 57% of
          // name-evident variants lacked a category edge — a dish literally
          // SAYING the word is instance evidence, same tier as edges.
          widening.getNameContainmentVariantItemIds(anchorItemIds),
          // Twin-ingredient union: "burrata" the food also means dishes
          // CONTAINING burrata (the builder ORs containment in).
          widening.getSameNamedIngredientIds(anchorItemIds),
          this.siblingsWanted(request, 'preProbe')
            ? widening.getSiblingItemIds(anchorItemIds, this.denseSiblingsCut)
            : Promise.resolve([] as { siblingId: string; relevance: number }[]),
          // LLM-judged substitutability (concept-graph rung 4) — the residual
          // that grammar and the category graph could not decide. `satisfies`
          // is a tier-0 claim, `cousin` rides the tier-1 widened set.
          widening.getSatisfiesItemIds(anchorItemIds),
        ]);
        // Head-final name variants ARE the thing (tier 0 with verified
        // category members); terms that merely mention the query food
        // ("pizza sauce") are related, so they ride the tier-1 widened set.
        const categoryMemberItemIds = Array.from(
          new Set([
            ...edgeMemberItemIds,
            ...nameVariantItemIds.isVariantOf,
            // A judged `satisfies` is the same class of claim as a verified
            // category member or a head-final variant: it IS what was asked
            // for, so it belongs in the front section.
            ...judgedRelations.satisfies,
          ]),
        );
        const denseSiblingItemIds = Array.from(
          new Set([
            ...siblingMatches.map((s) => s.siblingId),
            ...nameVariantItemIds.mentionsIt,
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
          categoryMemberItemIds.length ||
          denseSiblingItemIds.length ||
          twinIngredientIds.length
        ) {
          const relevanceByItemId: Record<string, number> = {};
          for (const id of categoryMemberItemIds) relevanceByItemId[id] = 1;
          for (const s of siblingMatches)
            relevanceByItemId[s.siblingId] = s.relevance;
          for (const id of nameVariantItemIds.mentionsIt)
            relevanceByItemId[id] = relevanceByItemId[id] ?? 1;
          // A `satisfies` IS the thing asked for, so it carries the same 1
          // as a verified category member. A cousin is NOT, and must not be
          // handed the same value as an exact match — measured siblings carry
          // a ceiling-normalized cosine below 1, so a cousin at 1 would
          // outrank every real sibling.
          for (const id of judgedRelations.satisfies)
            relevanceByItemId[id] = relevanceByItemId[id] ?? 1;
          for (const id of judgedRelations.cousin)
            relevanceByItemId[id] = relevanceByItemId[id] ?? COUSIN_RELEVANCE;
          planExpansion = {
            itemIds: [],
            itemAttributeIds: [],
            placeAttributeIds: [],
            itemIdsFromPrimaryItemAttributeText: [],
            denseSiblingItemIds,
            categoryMemberItemIds,
            twinIngredientIds,
            relevanceByItemId,
          };
          if (this.debugMode !== 'off') {
            this.logger.info('Search debug: pre-probe food widening seeded', {
              searchRequestId,
              anchors: anchorItemIds.length,
              categoryMembers: categoryMemberItemIds.length,
              siblings: denseSiblingItemIds.length,
            });
          }
        }
      }
    }

    const executeStage = async (params: {
      placePagination: { skip: number; take: number };
      dishPagination: { skip: number; take: number };
      includeSqlPreview?: boolean;
    }): Promise<StageExecutionResult> => {
      // CUTOVER 2026-08-02: the pooled gate IS the execution — one gated
      // query per projection replaced the relaxation ladder entirely.
      return this.executePooledStage({
        request,
        planExpansion,
        widening,
        pagination,
        placePagination: params.placePagination,
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
      placePagination: pooledPagination,
      dishPagination: pooledPagination,
      // Red team 2026-08-09 (#6): this was hardcoded false since 2026-07-24,
      // so /search/run could NEVER emit the preview its own gate approved —
      // the debug field the preview derivation serves was dead on the one
      // endpoint debug readers use. The gate (dev-env + flag) decides.
      includeSqlPreview,
    });

    // Coverage for the expansion trigger: in pooled mode the admitted-set
    // totals are inflated (soft words left the membership), so the honest
    // strict-equivalent is the TIER-0 (all-words) count (red team C4) —
    // otherwise thin queries never expand, exactly the ring they need.
    const pooledCoverageCount = pooledPage.exec.pooledFullCounts
      ? pooledPage.exec.pooledFullCounts.places +
        pooledPage.exec.pooledFullCounts.dishes
      : pooledPage.exec.totalPlaceCount + pooledPage.exec.totalDishCount;
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
          restaurantsOnPage: pooledPage.exec.places.length,
          dishesOnPage: pooledPage.exec.dishes.length,
          totalPlaces: pooledPage.exec.totalPlaceCount,
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
      }> = this.buildPlanExpansionForRequest(
        request,
        pooledPage.stagePlan,
        widening,
      )
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
        const seededSiblings = planExpansion?.denseSiblingItemIds ?? [];
        const seededCategoryMembers =
          planExpansion?.categoryMemberItemIds ?? [];
        planExpansion = {
          ...expansionResult,
          // Twins are seeded pre-probe only — the lexical expansionResult
          // carries [], so preserve the seeded set.
          twinIngredientIds: planExpansion?.twinIngredientIds ?? [],
          denseSiblingItemIds: Array.from(
            new Set([
              ...seededSiblings,
              ...expansionResult.denseSiblingItemIds,
            ]),
          ),
          categoryMemberItemIds: Array.from(
            new Set([
              ...seededCategoryMembers,
              ...expansionResult.categoryMemberItemIds,
            ]),
          ),
          // MAX-merge, never overwrite: a tier-0 category member that ALSO
          // returns as a weak lexical match must keep its stronger
          // relevance (a blind spread let 0.5 clobber 1.0 — display-only,
          // but the number the client shows should be the best evidence).
          relevanceByItemId: mergeRelevanceMax(
            planExpansion?.relevanceByItemId ?? {},
            expansionResult.relevanceByItemId,
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
              items: planExpansion.itemIds.length,
              itemAttributes: planExpansion.itemAttributeIds.length,
              placeAttributes: planExpansion.placeAttributeIds.length,
              foodsFromPrimaryItemAttributeText:
                planExpansion.itemIdsFromPrimaryItemAttributeText.length,
              denseSiblingItems: planExpansion.denseSiblingItemIds.length,
            },
            samples:
              this.debugMode === 'verbose'
                ? {
                    itemIds: planExpansion.itemIds.slice(0, 20),
                    itemAttributeIds: planExpansion.itemAttributeIds.slice(
                      0,
                      20,
                    ),
                    placeAttributeIds: planExpansion.placeAttributeIds.slice(
                      0,
                      20,
                    ),
                    itemIdsFromPrimaryItemAttributeText:
                      planExpansion.itemIdsFromPrimaryItemAttributeText.slice(
                        0,
                        20,
                      ),
                  }
                : undefined,
          });
        }
        pooledPage = await executeStage({
          placePagination: pooledPagination,
          dishPagination: pooledPagination,
          includeSqlPreview,
        });
      }
    }

    const plan = pooledPage.stagePlan;
    phaseTimings.queryPlanMs = Math.round(pooledPage.timings.planMs);

    // The probe ran with the request's real pagination — it IS the page.
    const pooledResult = pooledPage;

    const primaryItemTermRaw =
      request.entities.items?.[0]?.originalText ??
      request.entities.items?.[0]?.normalizedName ??
      null;
    const primaryItemTerm = primaryItemTermRaw
      ? primaryItemTermRaw.trim()
      : null;

    {
      phaseTimings.queryExecuteMs = Math.round(pooledResult.timings.executeMs);
      if (pooledResult.exec.timings) {
        Object.assign(phaseTimings, pooledResult.exec.timings);
      }

      const totalPlaceResults = pooledResult.exec.totalPlaceCount;
      const totalItemResults = pooledResult.exec.totalDishCount;
      const totalResults = totalItemResults + totalPlaceResults;

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
        this.shouldTriggerOnDemand(request, plan.format, totalPlaceResults) ||
        Boolean(starved);
      const onDemandResult = shouldTriggerOnDemand
        ? await this.recordLowResultOnDemand({
            request,
            planFormat: plan.format,
            placeCount: totalPlaceResults,
            dishCount: totalItemResults,
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
        totalItemResults,
        totalPlaceResults,
        triggeredOnDemand: onDemandQueued,
        hasUnresolvedTerms,
      });

      // OUT-OF-VIEWPORT HONESTY (R15 defect 3, 2026-08-16): a query that
      // GROUNDED a specific restaurant ('the alcove' exact-names an NYC
      // venue) but returns zero results from another city's viewport used to
      // say NOTHING — the one case where we know exactly what the user meant
      // and exactly why the page is empty. State it: found, but not near you.
      const outOfViewportMessage =
        totalItemResults + totalPlaceResults === 0
          ? await this.buildOutOfViewportMessage(request)
          : null;

      const metadata: SearchResponseMetadataDto = {
        totalItemResults,
        totalPlaceResults,
        queryExecutionTimeMs: Date.now() - start,
        searchRequestId,
        boundsApplied: pooledResult.exec.metadata.boundsApplied,
        openNowApplied: pooledResult.exec.metadata.openNowApplied,
        priceFilterApplied: pooledResult.exec.metadata.priceFilterApplied,
        minimumVotesApplied: pooledResult.exec.metadata.minimumVotesApplied,
        page: pagination.page,
        pageSize: pagination.pageSize,
        resultCoverageStatus,
        primaryItemTerm: primaryItemTerm || undefined,
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
        emptyQueryMessage: outOfViewportMessage ?? undefined,
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
          restaurantsOnPage: pooledResult.exec.places.length,
          dishesOnPage: pooledResult.exec.dishes.length,
          totalPlaces: pooledResult.exec.totalPlaceCount,
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
            totalItemResults,
            totalPlaceResults,
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
        placeCount: pooledResult.exec.places.length,
        metadata,
      });

      if (this.debugMode !== 'off') {
        this.logger.info('Search debug: runQuery end', {
          searchRequestId,
          queryExecutionTimeMs: metadata.queryExecutionTimeMs,
          resultCoverageStatus: metadata.resultCoverageStatus,
          totals: {
            totalPlaceResults,
            totalItemResults,
          },
          onDemandQueued: metadata.onDemandQueued ?? false,
          onDemandEtaMs: metadata.onDemandEtaMs ?? null,
          pooledCounts: {
            restaurantsOnPage: pooledResult.exec.places.length,
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
        places: pooledResult.exec.places,
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
    const places = Array.isArray(response.places)
      ? response.places.map((place) => this.compactPlaceResult(place))
      : [];
    return {
      ...response,
      places,
      metadata: {
        ...response.metadata,
        analysisMetadata: undefined,
      },
    };
  }

  private compactPlaceResult(place: PlaceResultDto): PlaceResultDto {
    const displayLocation = this.compactPlaceLocation(
      place.displayLocation ?? null,
    );
    const compactLocations = Array.isArray(place.locations)
      ? place.locations
          .map((location) => this.compactPlaceLocation(location))
          .filter(
            (
              location,
            ): location is NonNullable<PlaceResultDto['displayLocation']> =>
              location != null,
          )
      : [];
    const locations =
      compactLocations.length > 0
        ? compactLocations
        : displayLocation
          ? [displayLocation]
          : [];

    return {
      ...place,
      displayLocation,
      locations,
      locationCount:
        typeof place.locationCount === 'number'
          ? place.locationCount
          : locations.length,
      topItem: Array.isArray(place.topItem) ? place.topItem.slice(0, 3) : [],
    };
  }

  private compactPlaceLocation(
    location: PlaceResultDto['displayLocation'] | null | undefined,
  ): NonNullable<PlaceResultDto['displayLocation']> | null {
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

  async listPlaceDishes(placeId: string): Promise<ItemResultDto[]> {
    // Same redirect-hop + archived guard as getRestaurantProfile (HIGH-3).
    const redirect = await this.prisma.entityRedirect.findUnique({
      where: { fromEntityId: placeId },
      select: { toEntityId: true },
    });
    const resolvedId = redirect?.toEntityId ?? placeId;
    const host = await this.prisma.entity.findFirst({
      where: {
        entityId: resolvedId,
        type: EntityType.place,
        status: { not: EntityStatus.archived },
      },
      select: { entityId: true },
    });
    if (!host) {
      return [];
    }
    placeId = host.entityId;
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
    const rows = await this.prisma.$queryRaw<PlaceDishRow[]>(Prisma.sql`
      SELECT
        c.connection_id AS connection_id,
        c.restaurant_id AS place_id,
        c.food_id AS item_id,
        c.food_attributes AS item_attributes,
        c.mention_count AS mention_count,
        c.total_upvotes AS total_upvotes,
        c.last_mentioned_at AS last_mentioned_at,
	        pcs.display_score AS crave_score,
	        pcs.rising AS rising,
	        prs.display_score AS place_crave_score,
	        r.name AS place_name,
        r.price_level AS place_price_level,
        f.name AS item_name
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
      WHERE c.restaurant_id = ${placeId}::uuid
        -- Rollup rows (is_category_item) exist ONLY as parents of more
        -- specific dishes at this restaurant (projection-rebuild mints them
        -- from child connections) — serving them as dish rows duplicates
        -- their children. They stay scored for rollup semantics; they are
        -- never a dish row.
        AND NOT c.is_category_item
      ORDER BY
        -- EXACT SCORE ORDERS (2026-08-08 ruling, completed): percentile_rank
        -- (Decimal(6,5)) is the key, in the same chain as the dish axis
        -- (resolveDishOrderSql) and the card's top-N. display_score is that
        -- key rounded to Decimal(4,2) — ordering by it made this list
        -- contradict the card/pin about which dish is #1.
        pcs.percentile_rank DESC,
        c.total_upvotes DESC,
        c.mention_count DESC,
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
      placeId,
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
        itemId: row.item_id,
        itemName: row.item_name,
        placeId: row.place_id,
        placeName: row.place_name,
        scoreSubjectType: 'connection',
        scoreSubjectId: row.connection_id,
        craveScore,
        rising: toNumber(row.rising),
        mentionCount: row.mention_count ?? 0,
        totalUpvotes: row.total_upvotes ?? 0,
        lastMentionedAt: row.last_mentioned_at
          ? row.last_mentioned_at.toISOString()
          : null,
        itemAttributes: Array.isArray(row.item_attributes)
          ? row.item_attributes
          : [],
        placePriceLevel:
          typeof row.place_price_level === 'number'
            ? row.place_price_level
            : null,
        placePriceSymbol: null,
        placeDistanceMiles: null,
        placeOperatingStatus: null,
        placeCraveScore: toRequiredPublicScore(
          row.place_crave_score,
          `restaurant:${row.place_id}`,
        ),
        placeLatitude: null,
        placeLongitude: null,
      };
    });
  }

  async getPlaceProfile(placeId: string): Promise<PlaceProfileDto | null> {
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
      where: { fromEntityId: placeId },
      select: { toEntityId: true },
    });
    const resolvedPlaceId = redirect?.toEntityId ?? placeId;
    const place = await this.prisma.entity.findFirst({
      where: {
        entityId: resolvedPlaceId,
        type: EntityType.place,
        status: { not: EntityStatus.archived },
      },
      select: {
        entityId: true,
        name: true,
        latitude: true,
        longitude: true,
        address: true,
        city: true,
        region: true,
        country: true,
        postalCode: true,
        placeMetadata: true,
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

    if (!place) {
      return null;
    }

    // A restaurant's locations are a fact about the restaurant, not the
    // caller's market/camera (master plan §7): the profile is ALWAYS global.
    const [publicScore, aggregate, dishes] = await Promise.all([
      this.getPublicPlaceScore(place.entityId),
      this.prisma.connection.aggregate({
        where: {
          placeId: place.entityId,
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
      this.listPlaceDishes(place.entityId),
    ]);

    type PlaceProfileLocation = NonNullable<
      PlaceProfileDto['place']['locations']
    >[number];

    const mapLocation = (
      location: (typeof place.locations)[number],
    ): PlaceProfileLocation => {
      const metadata = buildOperatingMetadata({
        hoursValue: location.hours,
        utcOffsetMinutesValue: location.utcOffsetMinutes,
        timeZoneValue: location.timeZone,
        placeMetadataValue: place.placeMetadata,
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

    const locationResults: PlaceProfileLocation[] =
      place.locations.map(mapLocation);
    const fallbackMetadata = buildOperatingMetadata({
      placeMetadataValue: place.placeMetadata,
    });
    if (locationResults.length === 0) {
      locationResults.push({
        locationId: place.primaryLocationId ?? place.entityId,
        googlePlaceId: null,
        latitude: toOptionalNumber(place.latitude),
        longitude: toOptionalNumber(place.longitude),
        address: place.address ?? null,
        city: place.city ?? null,
        region: place.region ?? null,
        country: place.country ?? null,
        postalCode: place.postalCode ?? null,
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
    const parsedPriceLevel = toOptionalNumber(place.priceLevel);
    const priceDetails = describePriceLevel(parsedPriceLevel);
    // Profile revamp (Google-parity): the metadata is already selected — surface the REAL
    // Google price range ("$10–20") and primary-type category ("Brunch restaurant") the
    // profile previously dropped.
    const placeMeta = asRecord(place.placeMetadata);
    const priceRangeMeta = asRecord(placeMeta?.priceRange);
    const priceRangeText =
      typeof priceRangeMeta?.formattedText === 'string' &&
      priceRangeMeta.formattedText.trim()
        ? priceRangeMeta.formattedText.trim()
        : null;
    const categoryLabel =
      typeof placeMeta?.primaryTypeDisplayName === 'string' &&
      placeMeta.primaryTypeDisplayName.trim()
        ? placeMeta.primaryTypeDisplayName.trim()
        : null;
    const topItem = dishes.slice(0, 10).map((dish) => ({
      connectionId: dish.connectionId,
      itemId: dish.itemId,
      itemName: dish.itemName,
      scoreSubjectType: 'connection' as const,
      scoreSubjectId: dish.connectionId,
      craveScore: dish.craveScore,
      rising: dish.rising ?? null,
    }));
    const totalDishCount =
      typeof aggregate._count?._all === 'number'
        ? aggregate._count._all
        : dishes.length;
    const profile: PlaceProfileDto = {
      place: {
        placeId: place.entityId,
        placeName: place.name,
        scoreSubjectType: 'restaurant',
        scoreSubjectId: place.entityId,
        craveScore: toRequiredPublicScore(
          publicScore?.craveScore,
          `restaurant:${place.entityId}`,
        ),
        rising: publicScore?.rising ?? null,
        mentionCount: aggregate._sum.mentionCount ?? 0,
        totalUpvotes: aggregate._sum.totalUpvotes ?? 0,
        latitude: displayLocation?.latitude ?? toOptionalNumber(place.latitude),
        longitude:
          displayLocation?.longitude ?? toOptionalNumber(place.longitude),
        address: displayLocation?.address ?? place.address ?? null,
        placeLocationId: displayLocation?.locationId ?? null,
        priceLevel: parsedPriceLevel ?? null,
        priceSymbol: priceDetails.symbol,
        priceText: priceDetails.text,
        priceRangeText,
        categoryLabel,
        priceLevelUpdatedAt: place.priceLevelUpdatedAt?.toISOString() ?? null,
        topItem,
        totalDishCount,
        operatingStatus: displayLocation?.operatingStatus ?? null,
        distanceMiles: null,
        displayLocation: displayLocation ?? undefined,
        locations: locationResults,
        locationCount:
          typeof place._count.locations === 'number'
            ? place._count.locations
            : locationResults.length,
      },
      dishes,
    };

    this.logger.debug('Loaded restaurant profile', {
      placeId: place.entityId,
      dishCount: dishes.length,
      durationMs: Date.now() - startedAt,
    });

    return profile;
  }

  private async getPublicPlaceScore(placeId: string): Promise<{
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
        AND subject_id = ${placeId}::uuid
      LIMIT 1
    `);

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      craveScore: toRequiredPublicScore(
        row.craveScore,
        `restaurant:${placeId}`,
      ),
      rising: toOptionalNumber(row.rising),
    };
  }

  private buildExecutionDirectives(
    request: SearchQueryRequestDto,
    constraints: SearchConstraints,
    planExpansion: PlanExpansionState | null,
  ): SearchExecutionDirectives | undefined {
    const textItemIds =
      planExpansion?.itemIdsFromPrimaryItemAttributeText ?? [];
    const hasPrimaryItemAttributeQuery = constraints.primaryItemAttributeQuery;
    const twinIngredientIds = constraints.grounding.item.twinIngredientIds;
    if (!hasPrimaryItemAttributeQuery && !twinIngredientIds.length) {
      return undefined;
    }

    return {
      primaryItemAttributeQuery: hasPrimaryItemAttributeQuery || undefined,
      primaryItemAttributeTextItemIds:
        hasPrimaryItemAttributeQuery && textItemIds.length
          ? textItemIds
          : undefined,
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
    widening: SiblingExpansionReader;
    pagination: PaginationState;
    placePagination: { skip: number; take: number };
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
      constraints.ids.itemIds.length > 0 ||
      constraints.ids.placeIds.length > 0 ||
      constraints.ids.ingredientIds.length > 0;
    // DoS bound (red team R4-P5): each soft id adds a full re-scan arm to
    // the count query (+~85ms each, attacker-controlled by attribute word
    // count). 8 covers every real query shape; beyond it the extra words
    // still filter via provenance of the first 8.
    const SOFT_ID_CAP = 8;
    const softItemAttributeIds = hasPrimarySubject
      ? constraints.ids.itemAttributeIds
          .filter((id) => !dietary.has(id))
          .slice(0, SOFT_ID_CAP)
      : [];
    const softPlaceAttributeIds = hasPrimarySubject
      ? constraints.ids.placeAttributeIds
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
    // ONE wall derivation, shared with map coverage and the saved-list
    // assembler. Both the toggle strip AND query-text grounding raise walls;
    // coverage used to read only the strip, so "vegan tacos" walled the cards
    // beside an unwalled map.
    const dietaryWalls = await this.dietaryConstraints.resolveDietaryWalls({
      dietary: params.request.dietary,
      itemAttributeIds: constraints.ids.itemAttributeIds,
      placeAttributeIds: constraints.ids.placeAttributeIds,
    });

    // Membership: soft ids move to provenance; dietary ids move to WALLS.
    // Presence bookkeeping is untouched — it describes the QUERY the user
    // asked, not the WHERE we execute.
    const softSet = new Set([
      ...softItemAttributeIds,
      ...softPlaceAttributeIds,
    ]);
    const pooledConstraints: SearchConstraints = {
      ...constraints,
      ids: {
        ...constraints.ids,
        itemAttributeIds: constraints.ids.itemAttributeIds.filter(
          (id) => !softSet.has(id) && !dietary.has(id),
        ),
        placeAttributeIds: constraints.ids.placeAttributeIds.filter(
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
    let similarItemIds: string[] = [];
    if (params.request.includeSimilar !== true) {
      const anchorIds = this.collectEntityIds(params.request.entities.items);
      if (anchorIds.length) {
        const memberIds = new Set(constraints.ids.itemIds);
        const [siblings, judged] = await Promise.all([
          params.widening.getSiblingItemIds(anchorIds, this.denseSiblingsCut),
          // Judged cousins (rung 4) belong in the ring alongside dense
          // siblings — they are the BETTER-vetted half of "adjacent things",
          // and the ring is what the auto-fill gate and the chip both read.
          params.widening.getSatisfiesItemIds(anchorIds),
        ]);
        similarItemIds = Array.from(
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
      softItemAttributeIds.length > 0 || softPlaceAttributeIds.length > 0;
    const directives = {
      ...this.buildExecutionDirectives(
        params.request,
        constraints,
        params.planExpansion,
      ),
      ...(dietaryWalls.length ? { dietaryWalls } : {}),
      ...(hasSoftIds || similarItemIds.length
        ? {
            pooledGate: {
              softItemAttributeIds,
              softPlaceAttributeIds,
              // One page = what the CLIENT asked for (red team A3): a
              // pageSize above the default must not come back short
              // because the gate closed at 25.
              threshold: Math.max(
                params.threshold,
                params.dishPagination.take,
                params.placePagination.take,
              ),
              ...(similarItemIds.length ? { similarItemIds } : {}),
            },
          }
        : {}),
    };

    const executeStart = performance.now();
    const relevanceByItemId = this.relevanceFromGrounding(
      constraints.grounding.item,
    );
    const exec = await this.queryExecutor.executeDual({
      plan: stagePlan,
      request: params.request,
      pagination: params.pagination,
      placePagination: params.placePagination,
      dishPagination: params.dishPagination,
      topDishesLimit: params.topDishesLimit,
      includeSqlPreview: params.includeSqlPreview,
      directives,
    });
    const executeMs = performance.now() - executeStart;

    if (relevanceByItemId) {
      // AUDIT H5, second site: a NON-exact row with no measured relevance must
      // never default to 1 — that is the exact-match value. The pooled-stage
      // cousin ring reaches here through the pooled tier (not always through
      // the pre-probe grounding map, which already carries COUSIN_RELEVANCE),
      // so the fallback is the same cousin floor, not "unknown".
      for (const dish of exec.dishes) {
        dish.relevance =
          relevanceByItemId[dish.itemId] ??
          (dish.exactMatch === false ? COUSIN_RELEVANCE : 1);
      }
      for (const place of exec.places) {
        const snippetScores = (place.topItem ?? [])
          .map(
            (snippet) =>
              relevanceByItemId[snippet.itemId] ??
              (place.exactMatch === false ? COUSIN_RELEVANCE : 1),
          )
          .filter((value): value is number => typeof value === 'number');
        place.relevance = snippetScores.length
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
    grounding: ItemGrounding,
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
      itemAttributeIds: this.collectEntityIds(request.entities.itemAttributes),
      placeAttributeIds: this.collectEntityIds(
        request.entities.placeAttributes,
      ),
    };

    const hadItemGroup = Boolean(request.entities.items?.length);
    const hadPlaceGroup = Boolean(request.entities.places?.length);
    const hadItemAttributeGroup = Boolean(
      request.entities.itemAttributes?.length,
    );
    const hadPlaceAttributeGroup = Boolean(
      request.entities.placeAttributes?.length,
    );

    const primaryItemAttributeQuery =
      !hadItemGroup && !hadPlaceGroup && hadItemAttributeGroup;

    const itemAttributeIds =
      inputPresence.itemAttributes > 0 ? staged.itemAttributeIds : [];
    const placeAttributeIds =
      inputPresence.placeAttributes > 0 ? staged.placeAttributeIds : [];

    const dedupe = (ids: string[]): string[] =>
      Array.from(new Set(ids.filter(Boolean)));
    const mergeIfBase = (base: string[], added: string[]): string[] =>
      base.length ? dedupe([...base, ...(added ?? [])]) : base;

    const basePlaceIds = this.collectEntityIds(request.entities.places);
    const baseItemIds = this.collectEntityIds(request.entities.items);

    // STEP-4 STRUCTURED GROUNDING (spec §1.2): build the structure ONCE;
    // the flat foodIds array below is a derived view of it (anchors ∪
    // family ∪ similar, only when anchors exist — widening never invents
    // a subject). Downstream consumers (exact tier, relevance attach,
    // widened detection) read the structure, not reconstructions.
    const similar: Record<string, number> = {};
    if (baseItemIds.length && planExpansion) {
      const relevance = planExpansion.relevanceByItemId;
      for (const id of [
        ...planExpansion.itemIds,
        ...planExpansion.denseSiblingItemIds,
      ]) {
        // AUDIT H5: an unmeasured widened id must NEVER default to 1 —
        // that is the exact-match value, and it let a relevance-less
        // sibling outrank calibrated cousins. The conservative default is
        // the cousin floor; producers that measured a relevance still win.
        if (id) similar[id] = relevance[id] ?? COUSIN_RELEVANCE;
      }
    }
    const itemGrounding: ItemGrounding = {
      anchors: baseItemIds,
      family: baseItemIds.length
        ? dedupe(planExpansion?.categoryMemberItemIds ?? [])
        : [],
      similar,
      twinIngredientIds: baseItemIds.length
        ? dedupe(planExpansion?.twinIngredientIds ?? [])
        : [],
    };

    return {
      format: inputs.format,
      inputPresence,
      hadItemGroup,
      hadPlaceGroup,
      hadItemAttributeGroup,
      hadPlaceAttributeGroup,
      primaryItemAttributeQuery,
      grounding: { item: itemGrounding },
      ids: {
        placeIds: basePlaceIds,
        // DERIVED VIEW of the structure — the membership the builder needs,
        // with exactness/relevance living in `grounding`, not rebuilt later.
        itemIds: mergeIfBase(itemGrounding.anchors, [
          ...Object.keys(itemGrounding.similar),
          ...itemGrounding.family,
        ]),
        itemAttributeIds: mergeIfBase(
          itemAttributeIds,
          planExpansion?.itemAttributeIds ?? [],
        ),
        placeAttributeIds: mergeIfBase(
          placeAttributeIds,
          planExpansion?.placeAttributeIds ?? [],
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
          places: constraints.ids.placeIds.length,
          items: constraints.ids.itemIds.length,
          itemAttributes: constraints.ids.itemAttributeIds.length,
          placeAttributes: constraints.ids.placeAttributeIds.length,
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
    placeCount: number;
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
        placeCount: params.placeCount,
        itemCount: params.dishCount,
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
      places: request.entities.places?.length ?? 0,
      items: request.entities.items?.length ?? 0,
      itemAttributes: request.entities.itemAttributes?.length ?? 0,
      placeAttributes: request.entities.placeAttributes?.length ?? 0,
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
    placeCount: number,
  ): boolean {
    // Trigger on-demand primarily when restaurant coverage is low for food-driven queries.
    // (Dish coverage can be high even when restaurant list is under-covered.)
    if (placeCount >= this.onDemandMinResults) {
      return false;
    }
    // Food-driven lanes = the group vocabulary minus the restaurants lane —
    // derived from QUERY_ENTITY_GROUP_KEYS, never hand-listed (the hand list
    // forgot `ingredients`; see hasEntityTargets).
    return QUERY_ENTITY_GROUP_KEYS.some(
      (key) => key !== 'places' && Boolean(request.entities[key]?.length),
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
    const placeIds = this.collectEntityIds(request.entities?.places);
    if (placeIds.length !== 1) {
      throw new BadRequestException(
        'seeLocations requires exactly one restaurant entity id',
      );
    }
    const placeId = placeIds[0];
    const bounds = request.bounds ?? null;
    const { place, inViewLocationCount } =
      await this.queryExecutor.executeSeeLocations({
        placeId,
        bounds,
        userLocation: request.userLocation ?? null,
      });
    const queryExecutionTimeMs = Date.now() - startedAt;
    // Membership law: a restaurant with ZERO in-view locations yields an empty
    // world (the map has nothing of it to pin), not a zero-location row.
    const places = place != null && inViewLocationCount > 0 ? [place] : [];

    const plan: QueryPlan = {
      format: 'single_list',
      placeFilters: [
        {
          scope: 'place',
          description: 'See locations: in-view locations of one restaurant',
          entityType: 'place',
          entityIds: [placeId],
        },
      ],
      connectionFilters: [],
      ranking: { itemOrder: 'none', placeOrder: 'none' },
      diagnostics: { missingEntities: [], notes: ['see_locations'] },
    };

    this.recordSearchSignals(
      request,
      {
        searchRequestId,
        totalResults: places.length,
        totalPlaceResults: places.length,
      },
      [{ entityId: placeId, entityType: EntityType.place }],
      { mode: 'see_locations', placeId, inViewLocationCount },
    );

    return {
      format: 'single_list',
      plan,
      dishes: [],
      places,
      metadata: {
        totalItemResults: 0,
        totalPlaceResults: places.length,
        queryExecutionTimeMs,
        boundsApplied: bounds != null,
        openNowApplied: false,
        page: 1,
        pageSize: places.length,
        resultCoverageStatus: 'full',
        sourceQuery: request.sourceQuery,
        searchRequestId,
        analysisMetadata: {
          seeLocations: { placeId, inViewLocationCount },
        },
      },
    };
  }

  /** SYNCHRONOUS since D2 (2026-08-15): signals is a fire-and-forget writer,
   *  and the vocabulary hearing was the last thing here that ever awaited. */
  private recordQueryImpressions(
    request: SearchQueryRequestDto,
    context: {
      searchRequestId: string;
      totalResults: number;
      totalItemResults: number;
      totalPlaceResults: number;
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
      totalPlaceResults: number;
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
        placeCount: context.totalPlaceResults,
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

  /** SYNCHRONOUS since D2 (2026-08-15): the only thing this ever awaited was
   *  a vocabulary hearing, which no longer happens on the request path. */
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

    // SYNCHRONOUS, and that is the D2 fix visible in the signature: this used
    // to await one LLM hearing per grounded entity on the request path.
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
        // THE WRITE DOOR (2026-08-13). This term becomes a DEMAND SIGNAL — a
        // durable record that steers what the app collects and spends on next
        // — so it may not be recorded about a word nobody has judged. The
        // hearing happens HERE, before the write, in the ask's own language;
        // `detectedLocale` is server-derived (the DTO refuses a client
        // value), and an undetermined ask is heard under 'und', which is a
        // real locale with real verdicts rather than a silent fallback to
        // English.
        //
        // AND NEVER ON THE USER'S CLOCK (D2, 2026-08-15). This used to be
        // `await judgeThenStrip`, one blocking LLM hearing per grounded
        // entity, inside the request a user is watching — the first search
        // of a new word paid seconds for a chore. `demandTerm` applies the
        // identical law against the in-memory table: microseconds, no
        // network. A held term's word is queued for the maintenance drain,
        // and the next identical search records normally.
        const judged = this.judgedVocabulary.demandTerm(
          rawTerm,
          request.detectedLocale ?? null,
        );
        if (!judged.recordable) {
          // HELD: a word in this term has no verdict yet. A demand signal
          // steers future spend, so it waits for the answer rather than being
          // recorded on a guess.
          continue;
        }
        // The ask-SHAPE strip now happens INSIDE demandTerm, from word-role
        // verdicts — per-language, where the retired generic-token list was
        // English-only.
        const term = judged.text.trim();
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

    pushMostSpecific(request.entities.items, 'item');
    pushMostSpecific(request.entities.places, 'place');
    pushMostSpecific(request.entities.itemAttributes, 'item_attribute');
    pushMostSpecific(request.entities.placeAttributes, 'place_attribute');

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
        placeCount:
          typeof originalMeta.placeCount === 'number'
            ? originalMeta.placeCount
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
          (entityType === EntityType.place && nameMatchesQuery))
          ? { entityId: row.resolvedEntityId, entityType }
          : null;
      return {
        queryText: row.queryText,
        lastSearchedAt: row.lastSearchedAt.toISOString(),
        selectedEntityId: selected?.entityId ?? null,
        selectedEntityType: selected?.entityType ?? null,
      };
    });

    const placeIds = Array.from(
      new Set(
        entries
          .filter(
            (entry) =>
              entry.selectedEntityType === EntityType.place &&
              Boolean(entry.selectedEntityId),
          )
          .map((entry) => entry.selectedEntityId!)
          .filter(Boolean),
      ),
    );

    if (placeIds.length === 0) {
      return entries;
    }

    const previews = await this.placeStatusService.getStatusPreviews({
      placeIds,
    });
    const previewMap = new Map(
      previews.map((preview) => [preview.placeId, preview]),
    );

    return entries.map((entry) => {
      if (
        entry.selectedEntityType !== EntityType.place ||
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
    totalItemResults: number;
    totalPlaceResults: number;
    triggeredOnDemand: boolean;
    hasUnresolvedTerms: boolean;
  }): 'full' | 'partial' | 'unresolved' {
    const {
      request,
      totalItemResults,
      totalPlaceResults,
      triggeredOnDemand,
      hasUnresolvedTerms,
    } = params;

    const totalResults = totalItemResults + totalPlaceResults;
    const hasTargets = this.hasEntityTargets(request);

    if (!hasTargets) {
      // PARTIAL-HONESTY (C4e): even a no-targets serve is not 'full' when
      // the query carried terms nothing resolved — the page answers less
      // than what was asked.
      return hasUnresolvedTerms ? 'partial' : 'full';
    }

    // A NAMED term that resolved to ZERO ids is unresolved — not a
    // generic browse wearing full coverage (final-final red team
    // MEDIUM-2: {normalizedName:'unicorn meat', entityIds:[]} returned
    // the same top-25 as an empty request and called it full).
    // Lane list DERIVED from the one group vocabulary (F3800/D79) — the
    // hand-copied four-lane list here forgot `ingredients`.
    const lanes = QUERY_ENTITY_GROUP_KEYS.flatMap(
      (key) => request.entities[key] ?? [],
    );
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

    // PARTIAL-HONESTY (C4e, 2026-08-19): an unresolved term beside grounded
    // ones used to serve with coverage 'full' — only
    // metadata.unresolvedEntities flagged it. 'zorblatt pudding' serves the
    // pudding page, but the page is PARTIAL: part of what the user asked
    // for is not represented. Serving semantics unchanged (honesty-only fix;
    // any serving change needs an owner ruling).
    if (triggeredOnDemand || hasUnresolvedTerms) {
      return 'partial';
    }

    return 'full';
  }

  /**
   * OUT-OF-VIEWPORT HONESTY (R15 defect 3): when the restaurants lane
   * GROUNDED to specific entity ids, the search is viewport-bounded, and
   * nothing came back, the empty page has a knowable cause — the place
   * exists, just not here. Verified against the corpus (the grounded entity
   * must hold a geocoded location somewhere) so the message is a fact, not a
   * guess: an id with no location record stays silent rather than claiming a
   * position we do not hold. Tone matches the honest-empty scold
   * (buildEmptyResponse): tell the user what happened and what to do next.
   */
  private async buildOutOfViewportMessage(
    request: SearchQueryRequestDto,
  ): Promise<string | null> {
    if (!request.bounds && !request.viewportPolygon) return null;
    const groundedPlaceIds = (request.entities.places ?? [])
      .flatMap((lane) => lane.entityIds ?? [])
      .filter(Boolean);
    if (!groundedPlaceIds.length) return null;
    try {
      const rows = await this.prisma.$queryRaw<Array<{ name: string }>>`
        SELECT e.name FROM core_entities e
         WHERE e.entity_id = ANY(${groundedPlaceIds}::uuid[])
           AND e.status = 'active'::entity_status
           AND EXISTS (
             SELECT 1 FROM core_restaurant_locations rl
              WHERE rl.restaurant_id = e.entity_id
                AND rl.latitude IS NOT NULL AND rl.longitude IS NOT NULL
           )
         ORDER BY e.name ASC
         LIMIT 1`;
      const name = rows[0]?.name?.trim();
      if (!name) return null;
      return `Found ${name}, but it's outside this map area. Move or zoom the map to see it.`;
    } catch (error) {
      this.logger.warn('Out-of-viewport message lookup failed', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      return null;
    }
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
    collect(request.entities.itemAttributes);
    collect(request.entities.placeAttributes);
    return { attributeIds, terms };
  }

  private computeStarvedSoftWords(
    request: SearchQueryRequestDto,
    pooledSoftWordCounts:
      | {
          dish: Record<string, number> | null;
          place: Record<string, number> | null;
        }
      | undefined,
  ): { attributeIds: string[]; terms: string[] } | undefined {
    if (!pooledSoftWordCounts) {
      return undefined;
    }
    const dish = pooledSoftWordCounts.dish ?? {};
    const place = pooledSoftWordCounts.place ?? {};
    const ids = new Set<string>([...Object.keys(dish), ...Object.keys(place)]);
    const starvedIds = Array.from(ids).filter(
      (id) => (dish[id] ?? 0) === 0 && (place[id] ?? 0) === 0,
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
    collect(request.entities.itemAttributes);
    collect(request.entities.placeAttributes);
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
          // THE LANGUAGE THE ASK WAS MADE IN (F5). The other two ask lanes
          // have carried this since adf03754c; this one was scoped out of
          // that commit as "a contested file" and has been writing NULL
          // ever since. It is not cosmetic — `detectedLocale` is what
          // decides whether the keyword lane strips this term's tokens
          // against an English stop-list, and 'top' is an English filler
          // word and a real Vietnamese one. A NULL here is read as "und",
          // which resolves to English, so the omission was silently an
          // ENGLISH ASSERTION about every foreign ask that ran low.
          detectedLocale: request.detectedLocale ?? null,
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

    pushEntities(request.entities.items, 'item');
    pushEntities(
      onlyStarved(request.entities.itemAttributes),
      'item_attribute',
    );
    pushEntities(request.entities.places, 'place');
    pushEntities(
      onlyStarved(request.entities.placeAttributes),
      'place_attribute',
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

  private resolveExpansionItemCap(): number {
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

  /** The "include similar dishes" decision (RE-RULED 2026-08-06, shipped
   *  290d5f244 — supersedes the pre-launch.md "never silently widens"
   *  wording): chip ON widens MEMBERSHIP up front (intent door, kept
   *  forever); chip OFF, the judged tier-2 ring still AUTO-FILLS a page
   *  that exact+decomposed+partial cannot fill — admission-gated in the
   *  builder (pooled_tier=2 arm, pooled_eligible_count < threshold), one
   *  Crave-Score list. Thinness serves judged cousins AND speaks through
   *  the demand signal; the two are not exclusive. */
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

  /** THE ENTITY-LANE ENUMERATION IS DERIVED, NEVER HAND-LISTED (F3800/D79,
   *  re-hit 2026-08-19): this predicate and its two lane-enumerating
   *  siblings (shouldTriggerOnDemand, calculateCoverageStatus) each carried
   *  a hand-copied four-lane list and all three forgot `ingredients` — an
   *  ingredient-only search ('camarones') reported coverage 'full' on zero
   *  results, never became expansion-eligible, and never triggered
   *  on-demand. All three now read QUERY_ENTITY_GROUP_KEYS (the one
   *  exhaustive group vocabulary), so a sixth group is counted here by
   *  construction. */
  private hasEntityTargets(request: SearchQueryRequestDto): boolean {
    return countQueryEntityGroupEntries(request.entities) > 0;
  }

  private isPrimaryItemAttributeQuery(request: SearchQueryRequestDto): boolean {
    const hasItem = Boolean(request.entities.items?.length);
    const hasPlace = Boolean(request.entities.places?.length);
    return (
      !hasItem && !hasPlace && Boolean(request.entities.itemAttributes?.length)
    );
  }

  private hasPlanExpansion(expansion: PlanExpansionState): boolean {
    return Boolean(
      expansion.itemIds.length ||
        expansion.itemAttributeIds.length ||
        expansion.placeAttributeIds.length ||
        expansion.itemIdsFromPrimaryItemAttributeText.length ||
        expansion.denseSiblingItemIds.length ||
        expansion.categoryMemberItemIds.length,
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
        foodsAdded: expansion.itemIds.length,
        itemAttributesAdded: expansion.itemAttributeIds.length,
        placeAttributesAdded: expansion.placeAttributeIds.length,
        foodsFromPrimaryItemAttributeTextAdded:
          expansion.itemIdsFromPrimaryItemAttributeText.length,
        denseSiblingItemsAdded: expansion.denseSiblingItemIds.length,
        categoryMemberItemsAdded: expansion.categoryMemberItemIds.length,
      },
    };
  }

  private async buildPlanExpansionForRequest(
    request: SearchQueryRequestDto,
    plan: QueryPlan,
    widening: SiblingExpansionReader,
  ): Promise<PlanExpansionState | null> {
    const existingItemIds = new Set<string>();
    const existingItemAttributeIds = new Set<string>();
    const existingPlaceAttributeIds = new Set<string>();

    for (const clause of plan.connectionFilters ?? []) {
      if (clause.entityType === EntityScope.ITEM) {
        for (const id of clause.entityIds ?? []) {
          existingItemIds.add(id);
        }
      }
      if (clause.entityType === EntityScope.ITEM_ATTRIBUTE) {
        for (const id of clause.entityIds ?? []) {
          existingItemAttributeIds.add(id);
        }
      }
    }

    for (const clause of plan.placeFilters ?? []) {
      if (clause.entityType === EntityScope.PLACE_ATTRIBUTE) {
        for (const id of clause.entityIds ?? []) {
          existingPlaceAttributeIds.add(id);
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

    const itemTerms = mergeTerms(
      takeTerms(request.entities.items),
      takeUnresolvedTerms(EntityType.item),
    );
    const itemAttributeTerms = mergeTerms(
      takeTerms(request.entities.itemAttributes),
      takeUnresolvedTerms(EntityType.item_attribute),
    );
    const placeAttributeTerms = mergeTerms(
      takeTerms(request.entities.placeAttributes),
      takeUnresolvedTerms(EntityType.place_attribute),
    );

    type ExpandedMatches = Awaited<
      ReturnType<SearchEntityExpansionService['expandEntitiesByText']>
    >;
    const emptyMatches: ExpandedMatches = [];

    const [items, itemAttributes, placeAttributes] = await Promise.all([
      itemTerms.length
        ? this.entityExpansion.expandEntitiesByText({
            terms: itemTerms,
            entityTypes: ['item' as EntityType],
            limit: this.expansionItemCap,
          })
        : Promise.resolve(emptyMatches),
      itemAttributeTerms.length
        ? this.entityExpansion.expandEntitiesByText({
            terms: itemAttributeTerms,
            entityTypes: ['item_attribute' as EntityType],
            limit: this.expansionAttributeCap,
          })
        : Promise.resolve(emptyMatches),
      placeAttributeTerms.length
        ? this.entityExpansion.expandEntitiesByText({
            terms: placeAttributeTerms,
            entityTypes: ['place_attribute' as EntityType],
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
    const itemIds = items
      .filter(passesExpansionEvidence)
      .map((match) => match.entityId)
      .filter((id) => !existingItemIds.has(id));
    const itemAttributeIds = itemAttributes
      .filter(passesExpansionEvidence)
      .map((match) => match.entityId)
      .filter(
        (id) =>
          !existingItemAttributeIds.has(id) && !expansionDietaryIds.has(id),
      );
    const placeAttributeIds = placeAttributes
      .filter(passesExpansionEvidence)
      .map((match) => match.entityId)
      .filter(
        (id) =>
          !existingPlaceAttributeIds.has(id) && !expansionDietaryIds.has(id),
      );

    let itemIdsFromPrimaryItemAttributeText: string[] = [];
    if (
      this.isPrimaryItemAttributeQuery(request) &&
      itemAttributeTerms.length
    ) {
      const attrItemMatches = await this.entityExpansion.expandEntitiesByText({
        terms: itemAttributeTerms,
        entityTypes: ['item' as EntityType],
        limit: this.expansionItemCap,
      });
      const seenItem = new Set([...existingItemIds, ...itemIds]);
      itemIdsFromPrimaryItemAttributeText = attrItemMatches
        .filter(passesExpansionEvidence)
        .map((match) => match.entityId)
        .filter((id) => !seenItem.has(id));
    }

    // Dense sibling co-inclusion, 'expansion' mode: this method already runs only
    // under the thin/unresolved trigger, so siblings here widen ONLY thin
    // searches. Anchors are the RESOLVED winner ids (unresolved terms have no
    // vector to anchor on — expansion for those stays lexical). Deduped against
    // the winners and every lexical food id already headed into the filter.
    // ('always' mode fetches earlier, before the first strict probe.)
    let denseSiblingItemIds: string[] = [];
    const relevanceByItemId: Record<string, number> = {};
    // Lexical variants: graded by their match similarity (honest per-tier
    // scores from the lattice — exact/instance-class matches read as 1.0).
    for (const match of items) {
      if (match.evidence === 'exact' || match.evidence === 'prefix') {
        relevanceByItemId[match.entityId] = 1;
      } else if (typeof match.similarity === 'number') {
        relevanceByItemId[match.entityId] = Math.min(
          1,
          Math.max(0, match.similarity),
        );
      }
    }
    if (this.siblingsWanted(request, 'expansion')) {
      const anchorItemIds = this.collectEntityIds(request.entities.items);
      if (anchorItemIds.length) {
        const seen = new Set<string>([
          ...existingItemIds,
          ...itemIds,
          ...itemIdsFromPrimaryItemAttributeText,
        ]);
        const siblingMatches = (
          await widening.getSiblingItemIds(anchorItemIds, this.denseSiblingsCut)
        ).filter((s) => !seen.has(s.siblingId));
        denseSiblingItemIds = siblingMatches.map((s) => s.siblingId);
        for (const s of siblingMatches)
          relevanceByItemId[s.siblingId] = s.relevance;
      }
    }

    const expansion: PlanExpansionState = {
      twinIngredientIds: [],
      itemIds,
      itemAttributeIds,
      placeAttributeIds,
      itemIdsFromPrimaryItemAttributeText,
      denseSiblingItemIds,
      // Seeded pre-probe (every search), not here — the union at the caller
      // preserves it across this object.
      categoryMemberItemIds: [],
      relevanceByItemId,
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
          item: itemTerms,
          itemAttributes: itemAttributeTerms,
          placeAttributes: placeAttributeTerms,
        },
        results: {
          items: {
            count: items.length,
            evidence: evidenceCounts(items),
          },
          itemAttributes: {
            count: itemAttributes.length,
            evidence: evidenceCounts(itemAttributes),
          },
          placeAttributes: {
            count: placeAttributes.length,
            evidence: evidenceCounts(placeAttributes),
          },
          foodsFromPrimaryItemAttributeText: {
            count: itemIdsFromPrimaryItemAttributeText.length,
          },
        },
        addedAfterPlanDedup: {
          itemIds: itemIds.length,
          itemAttributeIds: itemAttributeIds.length,
          placeAttributeIds: placeAttributeIds.length,
          denseSiblingItemIds: denseSiblingItemIds.length,
        },
        samples:
          this.debugMode === 'verbose'
            ? {
                items: items.slice(0, 10),
                itemAttributes: itemAttributes.slice(0, 10),
                placeAttributes: placeAttributes.slice(0, 10),
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

    // Lanes DERIVED from the one group vocabulary (F3800/D79, re-hit here
    // 2026-08-19): the hand-copied four-lane list skipped `ingredients`, so
    // ingredient-lane text was the one lane that never passed the sanitizer.
    for (const key of QUERY_ENTITY_GROUP_KEYS) {
      sanitizeList(request.entities[key]);
    }
  }
}
