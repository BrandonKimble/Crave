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
  LINK_ELIGIBLE_EVIDENCE,
  linkerFloorsForTier,
} from './evidence-admission';
import { DietaryConstraintRegistry } from './dietary-constraints';
import { UnsegmentedResidueService } from './unsegmented-residue.service';
import type { EntitySpanGroup } from '../entity-text-search/entity-text-search.service';
import { foodNameVariants } from '../content-processing/entity-resolver/food-lemma';
import {
  LINKER_MARGIN,
  LINKER_MIN_FLOOR,
} from './linker-calibration.generated';
import { OnDemandRequestService } from './on-demand-request.service';
import { EngineCoverageService } from './engine-coverage.service';
import { ON_DEMAND_VIEWPORT_MIN_WIDTH_MILES } from './on-demand-tuning.constants';

const METERS_PER_MILE = 1609.34;
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
// Tiers absent from the table use the conservative fallback in
// evidence-admission.ts — the ONE floors authority (step 4).
// Ties within this sim-epsilon of the top ARE the decision: reveal ALL of them
// (cardinality is the answer — "joes" → Joe's Pizza + Trader Joe's) instead of
// silently argmax-picking whichever row came back first.
const LINKER_TIE_EPSILON = 0.001;
// Only genuine lexical evidence is link-eligible — never a weak/dense-only
// collision (the ham/rum class); those must not nominate a link.

const GAZETTEER_UNDERSTAND_TYPES: EntityType[] = [
  'food',
  'ingredient',
  'food_attribute',
  'restaurant_attribute',
  'restaurant',
] as EntityType[];
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
    private readonly engineCoverage: EngineCoverageService,
    private readonly dietaryConstraints: DietaryConstraintRegistry,
    private readonly unsegmentedResidue: UnsegmentedResidueService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchQueryInterpretationService');
    this.includePhaseTimings =
      (process.env.SEARCH_INCLUDE_PHASE_TIMINGS || '').toLowerCase() === 'true';
  }

  /** GAZETTEER-FIRST UNDERSTAND rollout mode (calibration instrument —
   *  BUILD, don't flip; spec §4.0 sequencing):
   *  'off' — sync LLM Understand (today's behavior);
   *  'shadow' — LLM serves; the gazetteer segmentation runs alongside and
   *    logs a compact diff (GAZETTEER SHADOW DIFF) so cutover quality is
   *    MEASURED on real queries before any flip;
   *  'on' — zero-per-search-LLM: gazetteer grounds known spans (single-
   *    bucket placement, dietary wins), the linker probes residue JOINED
   *    with adjacent grounded spans (the residue-join rule — "brekfast
   *    tacos" must probe the COMPOUND, not fragments), and still-unknown
   *    residue lands in the unsegmented staging zone for the async batch
   *    segmenter. */
  private gazetteerMode(): 'off' | 'shadow' | 'on' {
    const raw = (process.env.SEARCH_GAZETTEER_UNDERSTAND ?? 'off')
      .trim()
      .toLowerCase();
    return raw === 'on' || raw === 'shadow' ? raw : 'off';
  }

  async interpret(
    request: NaturalSearchRequestDto,
  ): Promise<InterpretationResult> {
    const interpretationStart = performance.now();
    const gazetteerMode = this.gazetteerMode();
    if (gazetteerMode === 'on') {
      return this.interpretViaGazetteer(request, interpretationStart);
    }
    if (gazetteerMode === 'shadow') {
      this.fireGazetteerShadow(request);
    }
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

    const { inputs: resolutionInputs } =
      this.buildResolutionInputs(cleanedAnalysis);
    let entityResolutionMs = 0;
    const resolutionStart = performance.now();
    const resolutionResultList: EntityResolutionResult[] =
      resolutionInputs.length
        ? await this.linkViaHybridRecall(resolutionInputs)
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
      // ENGINE re-key (§10/§11): queue targets are the engines whose
      // territory covers the ask's viewport. No covering engine → no queue
      // row, but the on_demand_ask signal (viewport geo) still records —
      // the ledger's territory read serves the uncovered-ask lane.
      const engineIds = viewportEligible
        ? (
            await this.engineCoverage.resolveViewportCoverage(request.bounds)
          ).engines.map((engine) => engine.engineId)
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
      const unresolvedRequests = unresolved.flatMap((group) =>
        group.terms.map((term) => ({
          term,
          entityType: group.type,
          reason,
          engineIds,
          metadata: { source: 'natural_query', unresolvedType: group.type },
        })),
      );

      if (unresolvedRequests.length > 0) {
        const recordedRequests =
          await this.onDemandRequestService.recordRequests(
            unresolvedRequests,
            { userId: request.userId ?? null },
            onDemandContext,
          );
        onDemandQueued =
          viewportEligible &&
          engineIds.length > 0 &&
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

  /** SHADOW: measure gazetteer segmentation against the serving LLM path.
   *  Never blocks or fails the request. */
  private fireGazetteerShadow(request: NaturalSearchRequestDto): void {
    const started = performance.now();
    void this.entityTextSearch
      .scanForKnownEntityGroups(request.query, GAZETTEER_UNDERSTAND_TYPES)
      .then((groups) => {
        this.logger.info('GAZETTEER SHADOW DIFF', {
          query: request.query,
          gazetteerMs: Math.round(performance.now() - started),
          spans: groups.map((group) => ({
            text: group.text,
            types: Array.from(new Set(group.entities.map((e) => e.type))),
          })),
        });
      })
      .catch((error: unknown) => {
        this.logger.warn('Gazetteer shadow failed (ignored)', {
          error: {
            message: error instanceof Error ? error.message : String(error),
          },
        });
      });
  }

  /** 'on' mode: zero-per-search-LLM Understand. Gazetteer grounds known
   *  spans; the linker probes residue JOINED with adjacent grounded spans
   *  (residue-join rule); unknown residue lands in the staging zone. */
  private async interpretViaGazetteer(
    request: NaturalSearchRequestDto,
    interpretationStart: number,
  ): Promise<InterpretationResult> {
    const gazetteerStart = performance.now();
    // Territory scoping (red team ⑧): restaurant spans must not ground
    // globally across a multi-city corpus — resolve the viewport's covering
    // engine and scope the scan's restaurant arm to its territory.
    let scanEngineId: string | null = null;
    if (request.bounds) {
      try {
        const coverage = await this.engineCoverage.resolveViewportCoverage(
          request.bounds,
        );
        scanEngineId = coverage.engines[0]?.engineId ?? null;
      } catch {
        scanEngineId = null;
      }
    }
    const rawGroups = await this.entityTextSearch.scanForKnownEntityGroups(
      request.query,
      GAZETTEER_UNDERSTAND_TYPES,
      { engineId: scanEngineId },
    );
    // Generic-token guard (red team ①): rank/location generics ("best",
    // "top", "near") exist as junk ENTITY NAMES today, so a closed-set
    // scan grounds them — "best tacos" must not become restaurant:Best.
    // The LLM path strips these per term; the gazetteer strips per span.
    const groups = rawGroups.filter(
      (g) => !stripGenericTokens(g.text).isGenericOnly,
    );
    const gazetteerMs = performance.now() - gazetteerStart;

    // Residue = token runs no grounded span covers.
    const tokenRe = /[\p{L}\p{N}][\p{L}\p{N}'&.-]*/gu;
    const tokens: { text: string; start: number; end: number }[] = [];
    let tokenMatch: RegExpExecArray | null;
    while ((tokenMatch = tokenRe.exec(request.query)) !== null) {
      tokens.push({
        text: tokenMatch[0],
        start: tokenMatch.index,
        end: tokenMatch.index + tokenMatch[0].length,
      });
    }
    const covered = (t: { start: number; end: number }) =>
      groups.some((g) => g.start <= t.start && g.end >= t.end);
    const residueRuns: { text: string; start: number; end: number }[] = [];
    for (const token of tokens) {
      if (covered(token)) continue;
      const last = residueRuns[residueRuns.length - 1];
      if (last && tokens.some((t) => t.start > last.end && t.end < token.start))
        residueRuns.push({ ...token });
      else if (last && last.end < token.start && !covered(token)) {
        // extend the current run only across directly adjacent residue
        const between = tokens.filter(
          (t) => t.start >= last.end && t.end <= token.start,
        );
        if (between.every((t) => !covered(t))) {
          // Join TOKEN texts, never the raw slice — raw punctuation between
          // tokens ("aaa, bbb") would poison exact/alias probes and the
          // staging record (red team ⑪).
          last.text = `${last.text} ${token.text}`;
          last.end = token.end;
        } else residueRuns.push({ ...token });
      } else residueRuns.push({ ...token });
    }

    // RESIDUE-JOIN RULE: probe each run joined with its adjacent grounded
    // spans FIRST — "brekfast tacos" must reach the COMPOUND "breakfast
    // taco"; a lone "brekfast" probe fragments the span. A joined link
    // CONSUMES the adjacent group (the compound replaces the bare span).
    const consumedGroups = new Set<EntitySpanGroup>();
    const residueResults: EntityResolutionResult[] = [];
    const unresolvedResidues: string[] = [];
    const dietaryIds = await this.dietaryConstraints.getDietaryIds();
    const isDietaryGroup = (g: EntitySpanGroup) =>
      g.entities.some((e) => dietaryIds.has(e.entityId));
    // STRICT adjacency (red team ⑤): a joinable neighbour must ABUT the
    // run — no tokens between them. "Nearest non-consumed" silently
    // skipped intervening text and built compounds that never appeared
    // in the query. DIETARY spans are never join candidates (red team ④):
    // a hard constraint must not be consumable into a fuzzy compound.
    const abuts = (aEnd: number, bStart: number) =>
      aEnd <= bStart && !tokens.some((t) => t.start >= aEnd && t.end <= bStart);
    for (const run of residueRuns) {
      const left = groups.find(
        (g) =>
          !consumedGroups.has(g) &&
          !isDietaryGroup(g) &&
          abuts(g.end, run.start),
      );
      const right = groups.find(
        (g) =>
          !consumedGroups.has(g) &&
          !isDietaryGroup(g) &&
          abuts(run.end, g.start),
      );
      const attempts: Array<{ text: string; consumes?: EntitySpanGroup }> = [
        ...(right
          ? [{ text: `${run.text} ${right.text}`, consumes: right }]
          : []),
        ...(left ? [{ text: `${left.text} ${run.text}`, consumes: left }] : []),
        { text: run.text },
      ];
      let linked = false;
      for (const attempt of attempts) {
        // Generic-only residue ("best", "near me") is junk by rule — it
        // neither probes nor stages.
        if (stripGenericTokens(attempt.text).isGenericOnly) continue;
        const [result] = await this.linkViaHybridRecall([
          {
            tempId: `food:${uuid()}`,
            normalizedName: attempt.text.toLowerCase(),
            originalText: attempt.text,
            entityType: 'food',
            aliases: [attempt.text],
            engineId: null,
          },
        ]);
        if (result?.entityId) {
          // A joined link consumes its ABUTTING non-dietary neighbour —
          // fuzzy included: the residue-join exists precisely for typo
          // compounds ("brekfast tacos" → "breakfast taco"), which are
          // fuzzy by definition. The dangerous consumptions (dietary
          // spans, skip-text compounds) are blocked upstream by the
          // never-join-dietary and strict-abutment guards.
          residueResults.push(result);
          if (attempt.consumes) consumedGroups.add(attempt.consumes);
          linked = true;
          break;
        }
      }
      if (!linked && !stripGenericTokens(run.text).isGenericOnly) {
        unresolvedResidues.push(run.text);
      }
    }

    // SINGLE-BUCKET PLACEMENT for grounded spans: dietary flag wins by
    // rule; else the span follows its only type; multi-type ties resolve
    // by the deterministic order (curated list = calibration tail).
    const placedResults: EntityResolutionResult[] = [];
    for (const group of groups) {
      if (consumedGroups.has(group)) continue;
      const dietaryEntity = group.entities.find((e) =>
        dietaryIds.has(e.entityId),
      );
      const winner =
        dietaryEntity ??
        [...group.entities].sort(
          (a, b) =>
            SearchQueryInterpretationService.CROSS_TYPE_PLACEMENT_ORDER.indexOf(
              a.type,
            ) -
            SearchQueryInterpretationService.CROSS_TYPE_PLACEMENT_ORDER.indexOf(
              b.type,
            ),
        )[0];
      const tiedIds = group.entities
        .filter((e) => e.type === winner.type)
        .map((e) => e.entityId);
      placedResults.push({
        tempId: `${winner.type}:${uuid()}`,
        entityId: winner.entityId,
        entityIds: tiedIds.length > 1 ? tiedIds : undefined,
        confidence: 1,
        resolutionTier: 'exact',
        matchedName: winner.name,
        originalInput: {
          tempId: `${winner.type}:${uuid()}`,
          normalizedName: group.text.toLowerCase(),
          originalText: group.text,
          entityType: winner.type,
          aliases: [group.text],
          engineId: null,
        },
      });
    }

    const allResults = [...placedResults, ...residueResults];
    const groupedEntities = this.groupResolvedEntities(allResults);
    const structuredRequest = this.buildSearchRequest(request, groupedEntities);
    structuredRequest.searchRequestId ??= uuid();

    // Unknown residue → the staging zone (typed queue rows are minted by
    // the async batch segmenter, never from raw residue).
    if (unresolvedResidues.length) {
      const viewportEligible = this.isViewportEligibleForOnDemand(
        request.bounds,
      );
      const engineIds = viewportEligible
        ? (
            await this.engineCoverage.resolveViewportCoverage(request.bounds)
          ).engines.map((engine) => engine.engineId)
        : [];
      await Promise.all(
        unresolvedResidues.map((residueText) =>
          this.unsegmentedResidue
            .recordResidue({
              residueText,
              searchRequestId: structuredRequest.searchRequestId,
              engineIds,
              userId: request.userId ?? null,
              context: { query: request.query, source: 'gazetteer_understand' },
            })
            .catch((error: unknown) => {
              this.logger.warn('Residue staging write failed (ignored)', {
                error: {
                  message:
                    error instanceof Error ? error.message : String(error),
                },
              });
            }),
        ),
      );
    }

    const phaseTimings = {
      llmMs: 0,
      gazetteerMs: Math.round(gazetteerMs),
      interpretationMs: Math.round(performance.now() - interpretationStart),
    };
    return {
      structuredRequest,
      analysis: {
        restaurants: [],
        foods: [],
        foodAttributes: [],
        restaurantAttributes: [],
      },
      unresolved: [],
      phaseTimings,
    };
  }

  private buildResolutionInputs(analysis: LLMSearchQueryAnalysis): {
    inputs: EntityResolutionInput[];
  } {
    const inputs: EntityResolutionInput[] = [];

    const addEntries = (names: string[], entityType: EntityType): string[] => {
      const seen = new Set<string>();
      const tempIds: string[] = [];
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
        const tempId = `${entityType}:${uuid()}`;
        tempIds.push(tempId);
        inputs.push({
          tempId,
          normalizedName: normalized,
          originalText: normalized,
          entityType,
          aliases: [normalized],
          engineId: null,
        });
      }
      return tempIds;
    };

    addEntries(analysis.restaurants, 'restaurant');
    addEntries(analysis.foods, 'food');
    addEntries(analysis.foodAttributes, 'food_attribute');
    addEntries(analysis.restaurantAttributes, 'restaurant_attribute');
    addEntries(analysis.ingredients ?? [], 'ingredient');

    return { inputs };
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
        const live = await this.linkOneInput(input);
        if (live.entityId && live.resolutionTier === 'exact') {
          return live;
        }
        if (input.entityType === 'food' || input.entityType === 'ingredient') {
          // STEP-2 LEMMA VARIANT PROBE (spec §4.2): exact grounding is
          // alias-dependent and 1,003 of 1,085 single-word foods carry no
          // plural alias — "empanadas" must ground via its number-variant
          // family, never via alias luck or FUZZY floors. Runs BEFORE a
          // non-exact typed link is accepted (empirical red team 2026-08-01:
          // "empanadas" was fuzzy-linking to "birria empanada" while the
          // variant EXACT "empanada" existed — the variant is the same
          // word; a fuzzy neighbour is not).
          const variantLink = await this.linkViaLemmaVariants(input);
          if (variantLink?.entityId) return variantLink;
        }
        // CROSS-TYPE EXACT beats typed FUZZY (red team ③, same law as the
        // lemma fix): exact evidence in another vocabulary is the same
        // word; a fuzzy neighbour in the guessed one is not. Probe the
        // other vocabularies BEFORE accepting a non-exact typed link.
        const crossTypeEarly = await this.linkExactAcrossTypes(input);
        if (crossTypeEarly?.entityId) {
          return crossTypeEarly;
        }
        if (live.entityId) {
          return live;
        }
        if (input.entityType === 'food') {
          // INGREDIENT FALLBACK LANE: a food-classified term with no dish
          // link may name an ingredient ("burrata", "miso"). Retry the SAME
          // conservative link against the ingredient vocabulary; dish links
          // always win (fallback only).
          const ingredientLink = await this.linkOneInput({
            ...input,
            entityType: 'ingredient',
          });
          if (ingredientLink.entityId) return ingredientLink;
        }
        return live;
      },
    );
  }

  private async linkViaLemmaVariants(
    input: EntityResolutionInput,
  ): Promise<EntityResolutionResult | null> {
    const term = input.normalizedName?.trim().toLowerCase() ?? '';
    if (!term) return null;
    const variants = foodNameVariants(term).filter((v) => v !== term);
    for (const variant of variants.slice(0, 4)) {
      const candidates = await this.entityTextSearch.retrieveCandidates(
        variant,
        [input.entityType],
        HYBRID_LINK_SHORTLIST_K,
        { denseMode: 'none' },
      );
      const exact = candidates.find((c) => c.sparseEvidence === 'exact');
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
    }
    return null;
  }

  private static readonly CROSS_TYPE_PLACEMENT_ORDER: EntityType[] = [
    'food_attribute',
    'food',
    'restaurant_attribute',
    'ingredient',
    'restaurant',
  ] as EntityType[];

  private async linkExactAcrossTypes(
    input: EntityResolutionInput,
  ): Promise<EntityResolutionResult | null> {
    const term = input.normalizedName?.trim() ?? '';
    if (!term) return null;
    const otherTypes =
      SearchQueryInterpretationService.CROSS_TYPE_PLACEMENT_ORDER.filter(
        (t) => t !== input.entityType,
      );
    const candidates = await this.entityTextSearch.retrieveCandidates(
      term,
      otherTypes,
      HYBRID_LINK_SHORTLIST_K,
      { denseMode: 'none' },
    );
    const exacts = candidates.filter((c) => c.sparseEvidence === 'exact');
    if (!exacts.length) return null;
    // SINGLE-BUCKET PLACEMENT: dietary flag WINS by rule (spec §4.1 coupling
    // — "vegan" is multi-type and must land where hardness applies) …
    const dietaryIds = await this.dietaryConstraints.getDietaryIds();
    const dietaryExact = exacts.find((c) => dietaryIds.has(c.entityId));
    const winner =
      dietaryExact ??
      // … otherwise the term follows its only type, and a genuine
      // multi-type tie resolves by the deterministic placement order
      // (curated-list refinement lands with the calibration tail).
      [...exacts].sort(
        (a, b) =>
          SearchQueryInterpretationService.CROSS_TYPE_PLACEMENT_ORDER.indexOf(
            a.type,
          ) -
          SearchQueryInterpretationService.CROSS_TYPE_PLACEMENT_ORDER.indexOf(
            b.type,
          ),
      )[0];
    return {
      tempId: input.tempId,
      entityId: winner.entityId,
      confidence: 1,
      resolutionTier: 'exact',
      matchedName: winner.name,
      // Re-bucket: grouping keys off originalInput.entityType (the same
      // mechanism the ingredient fallback lane uses).
      originalInput: { ...input, entityType: winner.type },
    };
  }

  private async linkOneInput(
    input: EntityResolutionInput,
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
        // Market scoping DIED with the election (leg 2): recall is global —
        // the conservative exact/0.82 lexical rule plus viewport-filtered
        // results bound the damage of a distant-city restaurant link, and
        // territory-as-retrieval-prior is the §13 replacement.
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
      const floors = linkerFloorsForTier(top?.sparseEvidence ?? null);
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
      case EntityType.ingredient:
        // Ingredient rows joined autocomplete 2026-07-25 (owner ruling): the
        // tap submits the ingredient-scoped skip-LLM search, whose include
        // clause unions contained-in (evidence/canon) with dishes NAMED the
        // ingredient — the "octopus" discovery surface.
        return {
          ingredients: [selectedEntry],
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
