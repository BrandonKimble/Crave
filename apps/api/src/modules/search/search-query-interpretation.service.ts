import { Injectable, Inject } from '@nestjs/common';
import { performance } from 'perf_hooks';
import { EntityType } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { LLMSearchQueryAnalysis } from '../external-integrations/llm/llm.types';
import {
  EntityResolutionInput,
  EntityResolutionResult,
} from '../content-processing/entity-resolver/entity-resolution.types';
import { EntityTextSearchService } from '../entity-text-search/entity-text-search.service';
import { LoggerService } from '../../shared';
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
import { EngineCoverageService } from './engine-coverage.service';
import { SignalsService } from '../signals/signals.service';
import { ON_DEMAND_VIEWPORT_MIN_WIDTH_MILES } from './on-demand-tuning.constants';

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
    private readonly entityTextSearch: EntityTextSearchService,
    private readonly engineCoverage: EngineCoverageService,
    private readonly dietaryConstraints: DietaryConstraintRegistry,
    private readonly unsegmentedResidue: UnsegmentedResidueService,
    private readonly signals: SignalsService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchQueryInterpretationService');
    this.includePhaseTimings =
      (process.env.SEARCH_INCLUDE_PHASE_TIMINGS || '').toLowerCase() === 'true';
  }

  async interpret(
    request: NaturalSearchRequestDto,
  ): Promise<InterpretationResult> {
    // CUTOVER 2026-08-02 (zero-per-search-LLM, spec §1.1): the gazetteer
    // IS the Understand. The sync LLM path is deleted; the LLM's only
    // remaining search job is the async residue segmenter.
    return this.interpretViaGazetteer(request, performance.now());
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
    // NO WORD LIST (owner ruling 2026-08-02): junk grounding ("best" as a
    // restaurant, "dinner" as a food) is a DATA-QUALITY defect — junk
    // entities exist in the graph. The fix is the extraction-hygiene
    // prompt work + the retroactive junk sweep, not a non-exhaustive
    // stop-list here. TODO(post-cleanup): enable the pinned generic-query
    // cases in search-generic-queries.spec.ts once the graph is clean.
    const groups = rawGroups;
    const gazetteerMs = performance.now() - gazetteerStart;

    // Residue = token runs no grounded span covers. Same 48-token cap as
    // the scanner (red team R4-P7): text past the cap was never scanned,
    // so treating it as residue would stage and LLM-segment text the
    // gazetteer never looked at.
    const tokenRe = /[\p{L}\p{N}][\p{L}\p{N}'&.-]*/gu;
    const tokens: { text: string; start: number; end: number }[] = [];
    let tokenMatch: RegExpExecArray | null;
    while ((tokenMatch = tokenRe.exec(request.query)) !== null) {
      tokens.push({
        text: tokenMatch[0],
        start: tokenMatch.index,
        end: tokenMatch.index + tokenMatch[0].length,
      });
      if (tokens.length >= 48) break;
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
    // PROBE BUDGET (red team R4-P2, measured): alternating known/junk
    // tokens produced 283 sequential probes / 13.9s. Real queries carry
    // 1–3 unknown spans; when the budget is spent, remaining runs skip
    // probing and go straight to staging (the async lane still learns).
    let probeBudget = 24;
    for (const run of residueRuns) {
      if (probeBudget <= 0) {
        unresolvedResidues.push(run.text);
        continue;
      }
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
        if (probeBudget <= 0) break;
        probeBudget -= 1;
        // COMPOUND LAW AS ADMISSION (R4-F1, sharpened in R5): for a joined
        // probe, only candidates whose LEFTOVER (name minus the consumed
        // span's words) matches the residue within the lattice's edit
        // budget are selectable — "vgean breakfast tacos" can never link
        // "vegetarian breakfast taco", while a near-tied wrong candidate
        // can no longer sink the whole attempt.
        const consumedSpan = attempt.consumes;
        const result = await this.linkUnified(
          {
            tempId: `food:${uuid()}`,
            normalizedName: attempt.text.toLowerCase(),
            originalText: attempt.text,
            entityType: 'food',
            aliases: [attempt.text],
            engineId: null,
          },
          consumedSpan
            ? {
                candidateGuard: (candidate) =>
                  this.leftoverMatchesResidue(
                    candidate.name,
                    consumedSpan.text,
                    run.text,
                  ),
              }
            : {},
        );
        if (result?.entityId) {
          residueResults.push(result);
          if (attempt.consumes) consumedGroups.add(attempt.consumes);
          linked = true;
          break;
        }
      }
      if (!linked) {
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

    // UNTYPED DEMAND FLOWS DIRECTLY (ideal-abstraction round 5): the
    // collector's unmet lane reads on_demand_ask SIGNALS, not the typed
    // queue — a user asking for a word we lack is a complete collection
    // seed with no type needed. Short residue (≤2 tokens) records its ask
    // immediately; only 3+-token runs stage for the async LLM SPLITTER
    // (multi-entity residue like "khachapuri and adjika" genuinely needs
    // judgment — typing does not). Cap 3/request (red team R4-P6).
    const cappedResidues = unresolvedResidues.slice(0, 3);
    if (cappedResidues.length) {
      const viewportEligible = this.isViewportEligibleForOnDemand(
        request.bounds,
      );
      const engineIds = viewportEligible
        ? (
            await this.engineCoverage.resolveViewportCoverage(request.bounds)
          ).engines.map((engine) => engine.engineId)
        : [];
      const now = new Date();
      for (const residueText of cappedResidues) {
        const tokenCount = residueText.split(/\s+/).filter(Boolean).length;
        if (tokenCount <= 2) {
          // Direct untyped ask — geo is the signal's spine (R4-①).
          this.signals.record({
            kind: 'on_demand_ask',
            userId: request.userId ?? null,
            subject: { entityId: null, term: residueText },
            geo: this.signals.bboxFromBounds(request.bounds ?? null),
            occurredAt: now,
            meta: {
              askSearchRequestId:
                structuredRequest.searchRequestId ?? undefined,
              reason: 'unresolved',
              source: 'gazetteer_residue',
            },
          });
          continue;
        }
        await this.unsegmentedResidue
          .recordResidue({
            residueText,
            searchRequestId: structuredRequest.searchRequestId,
            engineIds,
            userId: request.userId ?? null,
            context: {
              query: request.query,
              source: 'gazetteer_understand',
              ...(request.bounds ? { bounds: request.bounds } : {}),
            },
          })
          .catch((error: unknown) => {
            this.logger.warn('Residue staging write failed (ignored)', {
              error: {
                message: error instanceof Error ? error.message : String(error),
              },
            });
          });
      }
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
      // Unknown residue IS the unresolved report (red team R4-④): the
      // expansion trigger and coverage messaging read this — an empty
      // array silently disabled the widening lane for typo/unknown terms.
      unresolved: unresolvedResidues.length
        ? [{ type: 'food' as EntityType, terms: unresolvedResidues }]
        : [],
      phaseTimings,
    };
  }

  /** R4-F1 consume guard: strip the consumed span's tokens from the
   *  candidate name; what remains must match the residue within the
   *  recall lattice's length-banded edit budget (0 edits ≤2 chars, 1 for
   *  3–5, 2 for 6+ — the SAME rule entity-text-search applies). */
  private leftoverMatchesResidue(
    candidateName: string,
    spanText: string,
    residueText: string,
  ): boolean {
    const tokens = (t: string) =>
      t
        .toLowerCase()
        .split(/[^\p{L}\p{N}']+/u)
        .filter(Boolean);
    const spanSet = new Set(tokens(spanText).map((t) => singularish(t)));
    const leftover = tokens(candidateName)
      .filter((t) => !spanSet.has(singularish(t)))
      .join(' ');
    const residue = tokens(residueText).join(' ');
    // Empty leftover = the candidate IS the span — the residue contributed
    // NOTHING and would be silently swallowed by the consume ("vgean
    // breakfast tacos" linking to plain "breakfast taco" eats the dietary
    // word). Reject; the span stays grounded and the residue stands alone
    // (bare probe, then staging).
    if (!leftover) return false;
    const budget = residue.length <= 2 ? 0 : residue.length <= 5 ? 1 : 2;
    return levenshtein(leftover, residue) <= budget;
  }

  /**
   * UNIFIED LINKER (round-5 ideal, phase 3): ONE retrieval per surface form
   * over ALL types → one candidate pool → one decision → pure placement.
   * The old sequential lane chain (typed probe → lemma variants →
   * cross-type exact → ingredient fallback) encoded evidence precedence as
   * CONTROL FLOW — rounds 3 and 4 each re-found "an exact in an unreached
   * lane lost to a fuzzy in a reached one". Here the laws hold by
   * construction: exact anywhere beats non-exact everywhere; the calibrated
   * floors judge the best non-exact candidate regardless of which
   * vocabulary or surface form produced it; placement (dietary wins, else
   * deterministic order) is a pure function over the winner set.
   * Surface forms = the term + its lemma variants — "empanadas" reaches
   * "empanada" as a true EXACT, never via alias luck or fuzzy floors.
   */
  private async linkViaHybridRecall(
    inputs: EntityResolutionInput[],
  ): Promise<EntityResolutionResult[]> {
    return this.mapLimit(inputs, HYBRID_LINK_CONCURRENCY, (input) =>
      this.linkUnified(input),
    );
  }

  private async linkUnified(
    input: EntityResolutionInput,
    opts: {
      /** Residue-join compound law as ADMISSION (R5 fix): for a joined
       *  probe, only candidates whose leftover matches the residue are
       *  selectable — post-hoc rejection abandoned the whole attempt when
       *  a near-tied wrong candidate happened to sort first. */
      candidateGuard?: (candidate: { name: string }) => boolean;
    } = {},
  ): Promise<EntityResolutionResult> {
    const term = input.normalizedName?.trim().toLowerCase() ?? '';
    const unmatched: EntityResolutionResult = {
      tempId: input.tempId,
      entityId: null,
      confidence: 0,
      resolutionTier: 'unmatched',
      originalInput: input,
    };
    if (!term) return unmatched;

    const surfaceForms = Array.from(
      new Set([term, ...foodNameVariants(term).slice(0, 4)]),
    );
    const candidateLists = await Promise.all(
      surfaceForms.map((form) =>
        this.entityTextSearch.retrieveCandidates(
          form,
          GAZETTEER_UNDERSTAND_TYPES,
          HYBRID_LINK_SHORTLIST_K,
          // Dense OFF: the decider reads only sparseSimilarity — the dense
          // call was measured pure dead cost on this path.
          { denseMode: 'none' },
        ),
      ),
    );
    // Best evidence per entity across all surface forms.
    const byEntity = new Map<string, (typeof candidateLists)[0][0]>();
    for (const list of candidateLists) {
      for (const candidate of list) {
        const existing = byEntity.get(candidate.entityId);
        if (!existing) {
          byEntity.set(candidate.entityId, candidate);
          continue;
        }
        const candidateExact = candidate.sparseEvidence === 'exact';
        const existingExact = existing.sparseEvidence === 'exact';
        const better =
          candidateExact !== existingExact
            ? candidateExact
            : (candidate.sparseSimilarity ?? 0) >
              (existing.sparseSimilarity ?? 0);
        if (better) {
          byEntity.set(candidate.entityId, candidate);
        }
      }
    }
    let candidates = Array.from(byEntity.values());
    if (opts.candidateGuard) {
      candidates = candidates.filter((c) => opts.candidateGuard!(c));
    }
    if (!candidates.length) return unmatched;

    const dietaryIds = await this.dietaryConstraints.getDietaryIds();

    // EXACT ANYWHERE BEATS NON-EXACT EVERYWHERE (the rounds-3/4 law, now
    // structural): if any surface form is an exact somewhere, the winner
    // comes from the exact set — placement decides WHICH bucket.
    const exacts = candidates.filter((c) => c.sparseEvidence === 'exact');
    if (exacts.length) {
      const winner = this.pickPlacedWinner(exacts, dietaryIds);
      const tiedIds = exacts
        .filter((c) => c.type === winner.type)
        .map((c) => c.entityId);
      return {
        tempId: input.tempId,
        entityId: winner.entityId,
        entityIds: tiedIds.length > 1 ? tiedIds : undefined,
        confidence: 1,
        resolutionTier: 'exact',
        matchedName: winner.name,
        // Single-bucket placement rides originalInput.entityType (the
        // grouping key) — same mechanism the gazetteer placement uses.
        originalInput: { ...input, entityType: winner.type },
      };
    }

    // Non-exact: the calibrated decision, unchanged in shape — eligible
    // tiers only, sim-ranked, the TOP candidate judged by its tier's
    // sweep-derived floors (absolute / singleton / margin).
    const eligible = candidates
      .filter(
        (c) =>
          c.sparseEvidence != null &&
          LINK_ELIGIBLE_EVIDENCE.has(c.sparseEvidence) &&
          // RESTAURANT NAMES LINK ON EXACT ONLY for non-restaurant inputs:
          // the floors were swept on type-scoped recall, and a residue
          // fragment fuzzy-capturing a restaurant becomes an AND filter
          // that zeroes the page ("from a" → three tied restaurants →
          // 0 results, found in the round-5 regression sweep). The
          // re-sweep may relax this; exact restaurant links (tacodeli)
          // are untouched.
          (c.type !== 'restaurant' || input.entityType === 'restaurant'),
      )
      .sort((a, b) => (b.sparseSimilarity ?? 0) - (a.sparseSimilarity ?? 0));
    const top = eligible[0];
    const topSim = top?.sparseSimilarity ?? 0;
    const runnerSim = eligible[1]?.sparseSimilarity ?? 0;
    const floors = linkerFloorsForTier(top?.sparseEvidence ?? null);
    const linkable =
      top != null &&
      topSim >= LINKER_MIN_FLOOR &&
      (topSim >= floors.absolute ||
        (eligible.length === 1 && topSim >= floors.singleton) ||
        (runnerSim > 0 && topSim >= LINKER_MARGIN * runnerSim));
    if (!linkable || !top) return unmatched;
    // TIE PLURALITY: same-tier candidates within epsilon are
    // indistinguishable by evidence — reveal ALL of them.
    const tied = eligible.filter(
      (c) =>
        c.sparseEvidence === top.sparseEvidence &&
        topSim - (c.sparseSimilarity ?? 0) <= LINKER_TIE_EPSILON,
    );
    const winner = this.pickPlacedWinner(tied, dietaryIds);
    const tiedIds = tied
      .filter((c) => c.type === winner.type)
      .map((c) => c.entityId);
    return {
      tempId: input.tempId,
      entityId: winner.entityId,
      entityIds: tiedIds.length > 1 ? tiedIds : undefined,
      confidence: tiedIds.length > 1 ? topSim / tiedIds.length : topSim,
      resolutionTier: 'fuzzy',
      matchedName: winner.name,
      originalInput: { ...input, entityType: winner.type },
    };
  }

  /** PURE PLACEMENT (shared law with the gazetteer span placement):
   *  dietary flag WINS by rule; otherwise the deterministic type order —
   *  the ~44-name curated list refines this at the calibration tail. */
  private pickPlacedWinner<
    T extends { entityId: string; type: EntityType; name: string },
  >(candidates: T[], dietaryIds: ReadonlySet<string>): T {
    const dietary = candidates.find((c) => dietaryIds.has(c.entityId));
    if (dietary) return dietary;
    return [...candidates].sort(
      (a, b) =>
        SearchQueryInterpretationService.CROSS_TYPE_PLACEMENT_ORDER.indexOf(
          a.type,
        ) -
        SearchQueryInterpretationService.CROSS_TYPE_PLACEMENT_ORDER.indexOf(
          b.type,
        ),
    )[0];
  }

  private static readonly CROSS_TYPE_PLACEMENT_ORDER: EntityType[] = [
    'food_attribute',
    'food',
    'restaurant_attribute',
    'ingredient',
    'restaurant',
  ] as EntityType[];

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

  private isViewportEligibleForOnDemand(bounds?: MapBoundsDto): boolean {
    const widthMiles = this.calculateBoundsWidthMiles(bounds);
    if (!widthMiles) {
      return false;
    }
    return widthMiles >= ON_DEMAND_VIEWPORT_MIN_WIDTH_MILES;
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
}

/** Plural-insensitive token compare for the consume guard (number never
 *  decides identity — mirrors the lemma-variant law). */
function singularish(token: string): string {
  return token.endsWith('s') && token.length > 3 ? token.slice(0, -1) : token;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}
