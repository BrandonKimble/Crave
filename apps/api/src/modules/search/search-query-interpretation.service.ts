import { isEnvFlagEnabled } from '../../shared/config/env-flag';
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
import { SurfaceLocaleIndexService } from '../entity-text-search/surface-locale-index.service';
import { LoggerService } from '../../shared';
import { normalizeDetectedLocaleTag } from '../../shared/locale';
import {
  NaturalSearchRequestDto,
  QueryEntityDto,
  QueryEntityGroupDto,
  SearchQueryRequestDto,
  MapBoundsDto,
  toStructuredSearchRequest,
} from './dto/search-query.dto';
import {
  LINK_ELIGIBLE_EVIDENCE,
  denseAdmits,
  linkerAdmits,
} from './evidence-admission';
import {
  analyzeQuery,
  segmentStripUnits,
} from '../entity-text-search/query-analyzer';
import { JudgedVocabularyService } from '../content-processing/entity-resolver/judged-vocabulary.service';
import {
  ROLE_FRAME,
  ROLE_VENUE_CATEGORY,
} from '../content-processing/entity-resolver/word-vocabulary-lanes';
import { surfaceClaimKey } from '../content-processing/entity-resolver/entity-surface.service';
export interface ResidueToken {
  text: string;
  start: number;
  end: number;
  /** How this token re-joins to the previous one (' ' spaced, '' in CJK). */
  separator: string;
}

/** Residue = maximal runs of adjacent tokens no grounded span covers.
 *  Contiguity is decided by COVERAGE ALONE (negation v2 literal ignore):
 *  nothing else may split a run, so "khachapuri no adjika" yields exactly
 *  the shape "khachapuri and adjika" does — one run. */
export function buildResidueRuns(
  tokens: readonly ResidueToken[],
  covered: (t: { start: number; end: number }) => boolean,
): Array<{ text: string; start: number; end: number }> {
  const residueRuns: Array<{ text: string; start: number; end: number }> = [];
  for (const token of tokens) {
    if (covered(token)) continue;
    const last = residueRuns[residueRuns.length - 1];
    // ONE RULE: extend the current run across this token when nothing lies
    // between them. A non-empty gap means a GROUNDED token sits there (an
    // ungrounded one would already have extended the run on its own turn),
    // and that ends the run.
    //
    // ADJACENCY INCLUDES TOUCHING (red-team addendum, executed): the old
    // shape required `last.end < token.start` — a strict gap, which every
    // spaced script has and an unspaced one never does. So each CJK
    // sub-token became its OWN run, and 不要香菜的牛肉面 asked on-demand
    // collection to go learn 不, 要 and 香 — three single characters, none
    // of which is a food concept, seeding discovery with noise and burning
    // three probes where the unknown term is the contiguous RUN. Sub-tokens
    // that re-join with '' are one surface-form unit, here as in ngrams().
    const between = last
      ? tokens.filter((t) => t.start >= last.end && t.end <= token.start)
      : [];
    if (last && token.start >= last.end && between.length === 0) {
      // Join TOKEN texts, never the raw slice — raw punctuation between
      // tokens ("aaa, bbb") would poison exact/alias probes and the
      // staging record (red team ⑪).
      last.text = `${last.text}${token.separator}${token.text}`;
      last.end = token.end;
    } else residueRuns.push({ ...token });
  }
  return residueRuns;
}

import { DietaryConstraintRegistry } from './dietary-constraints';
import { UnsegmentedResidueService } from './unsegmented-residue.service';
import type {
  EntitySpanGroup,
  SpanEntity,
} from '../entity-text-search/entity-text-search.service';
import { foodNameVariants } from '../content-processing/entity-resolver/food-lemma';
import {
  damerauLevenshtein,
  editBudgetForToken,
} from '../entity-text-search/entity-lexicon';
import { canonicalFold } from '../content-processing/entity-resolver/entity-identity';
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
  /** What the analyzer decided, for diagnostics (detected vs requested
   *  locale are recorded SEPARATELY and never collapsed — A10/R5-5). */
  queryAnalysis?: {
    script: string;
    requestLocale: string | null;
    detectedLocale: { tag: string; confidence: number; source: string } | null;
    denseTierUsed: boolean;
    /** Every word of the query read FRAME on the word-role facet (or the
     *  provisional bare-'restaurants' case): nothing is named, so the
     *  answer is the unfiltered ranked serve. */
    browseMode: boolean;
  };
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
    private readonly surfaceLocaleIndex: SurfaceLocaleIndexService,
    private readonly judgedVocabulary: JudgedVocabularyService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchQueryInterpretationService');
    this.includePhaseTimings = isEnvFlagEnabled(
      process.env.SEARCH_INCLUDE_PHASE_TIMINGS,
    );
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
      } catch (error) {
        // Fail-open BY POLICY (F3104, D73: instrumentation only): a coverage
        // outage must not kill search, so the search continues with the
        // gazetteer's restaurant arm UNSCOPED — exactly the multi-city
        // mis-grounding territory scoping (red team ⑧) exists to prevent,
        // now countable instead of silent. Whether this should instead fail
        // the search is escalated with F2601.
        scanEngineId = null;
        this.logger.warn(
          'Viewport coverage resolve failed; territory scoping disabled — gazetteer restaurant arm scanning unscoped (failing open)',
          {
            policy: 'territory-scoping-fail-open',
            error:
              error instanceof Error
                ? { message: error.message }
                : { message: String(error) },
          },
        );
      }
    }
    // THE ANALYZER RUNS ONCE PER QUERY (A5). Everything language-shaped
    // downstream — the gazetteer's fold, the negation gate, the dense
    // tier's gate and its locale prefix — reads THIS object. Detection is
    // never re-run per residue probe (the probe budget is 24; per-probe
    // detection would 24x a cost the plan prices as ~free).
    // THE ORACLE RIDES IN HERE (multilingual spine step 1): the registry's
    // own locale-tagged vocabulary is the primary language signal for the
    // short queries the n-gram detector cannot read. Passing the index's
    // bound oracle is the whole wiring — analyzeQuery stays synchronous.
    const analysis = analyzeQuery(request.query, request.locale ?? null, {
      surfaceLocales: this.surfaceLocaleIndex.oracle,
    });
    const rawGroups = await this.entityTextSearch.scanForKnownEntityGroups(
      request.query,
      GAZETTEER_UNDERSTAND_TYPES,
      { engineId: scanEngineId, analysis },
    );
    // NO WORD LIST (owner ruling 2026-08-02): junk grounding ("best" as a
    // restaurant, "dinner" as a food) is a DATA-QUALITY defect — junk
    // entities exist in the graph. The fix is the extraction-hygiene
    // prompt work + the retroactive junk sweep, not a non-exhaustive
    // stop-list here. TODO(post-cleanup): enable the pinned generic-query
    // cases in search-generic-queries.spec.ts once the graph is clean.
    // THE WORD-ROLE FACET IS CONSULTED BEFORE GROUNDING (browse mode,
    // 2026-08-15, narrowed by owner amendment same day) — and INDEPENDENT
    // OF THE BANK. The corpus is contaminated ('best' is a banked
    // ghost-restaurant surface, 'good taco' a live entity), so what a word
    // DOES in an ask is a verdict about the word, never an inference from
    // what the index happens to hold. The rulings that compose here:
    //   - a FRAME word (best/top/near/me/最好, bare 'food' by owner ruling)
    //     wraps the ask without naming anything. It is excluded from
    //     grounding INPUT: a grounded span made ENTIRELY of frame words is
    //     dropped (the Best-ghost class can no longer answer 'best'), and a
    //     frame token never seeds a residue probe or a demand row ('me' can
    //     never again be collected as an ingredient).
    //   - BROWSE MODE triggers ONLY for frame-word-only queries ('best',
    //     'top', 'near me'): nothing is named, so nothing filters — the
    //     answer is the unfiltered ranked serve.
    //   - a VENUE-CATEGORY word keeps TODAY's behavior by owner amendment
    //     (2026-08-15): it grounds to its restaurant_attribute where one
    //     exists and builds no browse scoping. Venue-taxonomy semantics
    //     (Google-types promotion) land with the owner's taxonomy plan, not
    //     here. The facet's three-way verdict stays certified; this
    //     composition rule is what narrows.
    //   - NAME MATCHING IS NEVER AFFECTED: the scan above already ran over
    //     the full query, so a frame word INSIDE a multiword banked name
    //     ('Best Quality Daughter') still grounds — only spans that are
    //     nothing but frame are dropped, which is the No-Name-Burgers law
    //     applied to this facet.
    // An UNHEARD word blocks none of this conservatively: it reads as
    // particular (today's path) and is queued for tonight's hearing.
    const roleLocale = analysis.detectedLocale?.tag ?? request.locale ?? null;
    const roleOfWord = (word: string): string | null =>
      this.judgedVocabulary.roleOf(word, roleLocale);
    const roleUnits = segmentStripUnits(request.query).map((unit) => ({
      ...unit,
      role: roleOfWord(unit.word),
    }));
    const unitsOf = (span: { start: number; end: number }) =>
      roleUnits.filter((u) => u.start < span.end && u.end > span.start);
    // PROVISIONAL (owner amendment 2026-08-15, pending the venue-taxonomy
    // plan): a BARE 'restaurants' query is treated as frame-only-equivalent
    // — it browses. 'food' needs no entry here because its word-role verdict
    // is already frame by owner ruling. This is a deliberate, flagged
    // stopgap word list, sanctioned as provisional; it dies when category
    // semantics land with the taxonomy plan.
    const bareProvisionalBrowse =
      roleUnits.length === 1 &&
      roleUnits[0].role === ROLE_VENUE_CATEGORY &&
      ['restaurant', 'restaurants'].includes(
        surfaceClaimKey(roleUnits[0].word),
      );
    const isBrowseUnit = (u: { role: string | null }) =>
      u.role === ROLE_FRAME || bareProvisionalBrowse;
    // Drop grounded spans that are NOTHING BUT browse words (frame spans —
    // and, provisionally, the bare-'restaurants' span).
    const roleFilteredGroups = rawGroups.filter((g) => {
      const units = unitsOf(g);
      return !units.length || units.some((u) => !isBrowseUnit(u));
    });
    // BROWSE MODE: every word of the query is a frame word (or the
    // provisional bare venue word above). Nothing names anything, so there
    // is no filter to build.
    const browseMode = roleUnits.length > 0 && roleUnits.every(isBrowseUnit);
    // NEGATION V2 (owner ruling 2026-08-08, plan §12b): LITERAL IGNORE.
    // "tacos no cilantro" grounds cilantro as a positive mention — exactly
    // as if the user listed an ingredient. The old cue-span machinery
    // (negatedGroups / excludedSpans recording) was the crude middle the
    // owner rejected: a cue list cannot tell negation from a word inside a
    // name ("No Name Burgers" lost "name") and taught users nothing. The
    // ONE surviving rule is DENSE-INPUT HYGIENE below: cue tokens are
    // stripped before the semantic fallback embeds a phrase, so the model
    // that CAN understand negation never gets the chance ("sin cerdo"
    // embeds as "cerdo" -> pork, positively; the vegan-ramen inversion
    // stays impossible). Dietary toggles are the only real exclusions.
    // In browse mode every browse-word span was already dropped above, so
    // nothing remains to ground — the structured request carries no entity
    // targets and the executor serves the unfiltered ranked page.
    const groups = roleFilteredGroups;
    const gazetteerMs = performance.now() - gazetteerStart;

    // Residue = token runs no grounded span covers. Same 48-token cap as
    // the scanner (red team R4-P7): text past the cap was never scanned,
    // so treating it as residue would stage and LLM-segment text the
    // gazetteer never looked at.
    // ONE TOKENIZER (A2): the residue lane reads the analyzer's tokens
    // rather than re-implementing the regex — the two copies had already
    // drifted (the analyzer's class carries the curly apostrophe).
    const tokens = analysis.tokens.map((t) => ({
      text: t.raw,
      start: t.start,
      end: t.end,
      // How this token re-joins to the previous one — ' ' for every spaced
      // script, '' inside an unspaced CJK run, so a residue run over
      // 麻辣牛肉面 probes and stages 牛肉面, never "牛 肉 面".
      separator: t.separator,
    }));
    // LITERAL IGNORE (negation v2, plan §12b): a cue token is an ORDINARY
    // word here. It is never marked covered — marking it deleted it from
    // the residue probes, the unresolved report, the on-demand collection
    // ask and LLM staging, so "No Name Burgers" probed "name burgers" and
    // seeded discovery with a mangled name, and a mid-query cue SPLIT one
    // residue run in two ("khachapuri no adjika" must behave exactly like
    // "khachapuri and adjika"). The ONLY place cues are removed is the
    // dense-embed input below.
    const covered = (t: { start: number; end: number }) =>
      groups.some((g) => g.start <= t.start && g.end >= t.end);
    // FRAME TOKENS NEVER SEED THE RESIDUE LANE (word-role, 2026-08-15): a
    // frame word wraps the ask, so it neither probes the linker ('top' can
    // no longer fuzzy-capture beer), nor stages for the splitter, nor
    // records demand ('me' is not an ingredient to go collect). Treating it
    // as covered ends a run exactly the way a grounded span does; in browse
    // mode there is no residue lane at all — every word is already accounted
    // for by the role facet.
    // FRAME EXCLUSION AT SEGMENT-UNIT GRANULARITY (the A4 law again): a
    // token is excluded only when a whole frame-ruled UNIT covers it. The
    // per-token form re-created the character-strip defect in zh — 餐's own
    // frame verdict split the unit 餐厅 and sent the amputated 厅 to the
    // residue lane.
    //
    // ...AND ONLY WHEN SOMETHING ALREADY GROUNDED. A query that grounded
    // nothing is a query whose words we do not yet understand, and a frame
    // verdict under 'und' is a weak prior about a compound we failed to
    // read — excluding a word from it can only split the one residue run
    // that could reach the whole surface (the 'da' inside "cà phe sua da"
    // class). When a span HAS grounded, the ask is known and the frame
    // words around it are safely wrapping ('best birria near me' → birria,
    // no 'me' probe); when nothing grounded, the whole run probes and the
    // demand door still strips the frame from anything it records.
    const frameUnitSpans =
      groups.length > 0 ? roleUnits.filter((u) => u.role === ROLE_FRAME) : [];
    const frameTokenStarts = new Set(
      tokens
        .filter((t) =>
          frameUnitSpans.some((f) => f.start <= t.start && f.end >= t.end),
        )
        .map((t) => t.start),
    );
    const residueRuns = browseMode
      ? []
      : buildResidueRuns(
          tokens,
          (t) => covered(t) || frameTokenStarts.has(t.start),
        );

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
    let denseTierUsed = false;
    for (const run of residueRuns) {
      // R5-3 FAIL CLOSED on residue too: "ramen sin cerdo" grounds ramen
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
      // The compound is joined the way the user TYPED it: a space where the
      // query has one, nothing where the run and its neighbour touch (an
      // unspaced CJK query grounds 牛肉面 and probes 麻辣牛肉面, never
      // "麻辣 牛肉面" — a form no stored surface carries).
      const joiner = (aEnd: number, bStart: number) =>
        aEnd === bStart ? '' : ' ';
      const attempts: Array<{ text: string; consumes?: EntitySpanGroup }> = [
        ...(right
          ? [
              {
                text: `${run.text}${joiner(run.end, right.start)}${right.text}`,
                consumes: right,
              },
            ]
          : []),
        ...(left
          ? [
              {
                text: `${left.text}${joiner(left.end, run.start)}${run.text}`,
                consumes: left,
              },
            ]
          : []),
        { text: run.text },
      ];
      let linked = false;
      let linkedWasWeak = false;
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
          linkedWasWeak = result.resolutionTier === 'fuzzy';
          break;
        }
      }
      // M4 DENSE ADMISSION TIER. Two gates (launch-gate run 1, the 19-red
      // finding): (a) ABSENCE — every sparse attempt failed; or (b) WEAK
      // PRE-EMPTION — the sparse link is a FUZZY substring against a
      // non-English query ("camarones"→"camarones enchilados" blocked
      // shrimp forever). A fuzzy substring match on foreign text is weak
      // evidence, not a link; dense arbitrates and, if admitted, REPLACES
      // it. Exact/alias links still terminate — they are claims.
      // Cue tokens never reach the embedder; a run made ENTIRELY of cues has
      // no positive concept to embed, so the dense tier is skipped outright.
      // NEGATION HYGIENE, FROM VERDICTS (2026-08-13). Words ruled negators
      // are withheld from the embedder — never from lexical matching, where a
      // negator inside a NAME ("No Name Burgers") is a real word of that name.
      // The read is SYNCHRONOUS against the in-memory verdict table because
      // this runs per keystroke-search; a word nobody has heard yet is kept
      // (today's behaviour for anything off the old cue list) and queued for
      // the next hearing, so the miss self-heals once and never again.
      const denseCandidateText = this.judgedVocabulary.strippedForEmbedding(
        run.text,
      );
      if (
        (!linked || (linkedWasWeak && analysis.isNonEnglish)) &&
        probeBudget > 0 &&
        denseCandidateText.length > 0 &&
        (analysis.isNonLatinScript || analysis.isNonEnglish)
      ) {
        probeBudget -= 1;
        denseTierUsed = true;
        // DENSE-INPUT HYGIENE (negation v2, the ONE surviving cue rule):
        // strip cue tokens before the semantic model sees the phrase. Dense
        // is the only component capable of UNDERSTANDING a negation, and it
        // once inverted "sin cerdo" into vegan ramen. Embedding "cerdo"
        // instead yields pork, positively — literal ignore, mechanically.
        const denseText = denseCandidateText;
        const denseResult = await this.linkUnified(
          {
            tempId: `food:${uuid()}`,
            normalizedName: denseText.toLowerCase(),
            originalText: denseText,
            entityType: 'food',
            aliases: [denseText],
            engineId: null,
          },
          {
            denseTier: {
              // R5-7: the REQUEST locale rides into the embedded text —
              // the detected tag is a prior about the query, not a claim
              // about what the user reads.
              locale: request.locale ?? analysis.detectedLocale?.tag ?? null,
            },
          },
        );
        if (denseResult?.entityId) {
          if (linked && linkedWasWeak) {
            // dense admitted over a weak fuzzy pre-emption: replace it.
            residueResults.pop();
          }
          residueResults.push(denseResult);
          linked = true;
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
      // MAXIMAL LINKING: a CONSUMED group (residue-join built a compound
      // over it — "brekfast tacos" → breakfast taco) still places. The
      // compound is the primary reading; the bare span it absorbed is the
      // decomposed one, and discarding it was the consume defect.
      const dietaryEntity = group.entities.find((e) =>
        dietaryIds.has(e.entityId),
      );
      const winner =
        dietaryEntity ??
        [...group.entities].sort(
          (a, b) =>
            SearchQueryInterpretationService.rankIn(
              SearchQueryInterpretationService.CROSS_TYPE_PLACEMENT_ORDER,
              a.type,
            ) -
            SearchQueryInterpretationService.rankIn(
              SearchQueryInterpretationService.CROSS_TYPE_PLACEMENT_ORDER,
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
        // A consumed group was replaced by a residue-join compound
        // ("brekfast tacos" → breakfast taco); its own reading is the
        // decomposed one, sectioned tier 1 downstream.
        decomposed: consumedGroups.has(group) || undefined,
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
      // MAXIMAL LINKING (2026-08-06): the compound's decomposed reading
      // stays ELIGIBLE alongside it — "tacos vegetarianos" admits
      // `vegetarian taco` AND (`taco` + `vegetarian`). Measured before
      // this change: compound-consumes-parts was 17 of 38 missed concepts
      // on the es gate, and the discarded parts carried ~1000x the
      // compound's evidence (taco 2,328 ev vs vegetarian taco 2). Under
      // the ranking invariant this cannot reorder anything: matching
      // decides eligibility, Crave Score decides order.
      // (No negation guard here, by ruling: under LITERAL IGNORE a cue is
      // an ordinary word, so "pizza sin gluten" grounds `gluten free pizza`
      // and its parts positively like any other compound. The guard this
      // comment used to describe was deleted in addb677c0.)
      // COMPOSITIONALITY GUARD (rung-2 concept containment): a part is only
      // a valid decomposition when the compound CONCEPT's own name contains
      // the part concept's name — `vegetarian taco` ⊇ {taco, vegetarian} ✓;
      // `pan dulce` ⊉ {bread, candy} ✗ (a lexicalized name whose fragments
      // were translated out of context — the sn-02 regression). Checked in
      // CONCEPT space (folded entity names), never surface space, so it is
      // the same containment relation the concept-graph ladder already
      // trusts at rung 2.
      const winnerTokens = new Set(
        canonicalFold(winner.name).split(' ').map(singularish),
      );
      const isContainedPart = (e: SpanEntity) =>
        canonicalFold(e.name)
          .split(' ')
          .every((tok) => winnerTokens.has(singularish(tok)));
      for (const sub of group.subGroups ?? []) {
        const contained = sub.entities.filter(isContainedPart);
        if (!contained.length) continue;
        const subDietary = contained.find((e) => dietaryIds.has(e.entityId));
        // MODIFIER-FIRST PLACEMENT (owner ruling 2026-08-06): a PART of a
        // dish name reads as what it does INSIDE the dish — an attribute
        // (soft conjunct in the pooled gate) or an ingredient (hard
        // conjunct), falling back to food membership only when no modifier
        // reading exists. "arroz con pollo" → rice∧chicken via the
        // ingredient lane, ONE score-ranked list — never "any rice dish".
        const subWinner =
          subDietary ??
          [...contained].sort(
            (a, b) =>
              SearchQueryInterpretationService.rankIn(
                SearchQueryInterpretationService.DECOMPOSED_PLACEMENT_ORDER,
                a.type,
              ) -
              SearchQueryInterpretationService.rankIn(
                SearchQueryInterpretationService.DECOMPOSED_PLACEMENT_ORDER,
                b.type,
              ),
          )[0];
        const subTiedIds = contained
          .filter((e) => e.type === subWinner.type)
          .map((e) => e.entityId);
        placedResults.push({
          tempId: `${subWinner.type}:${uuid()}`,
          entityId: subWinner.entityId,
          entityIds: subTiedIds.length > 1 ? subTiedIds : undefined,
          confidence: 1,
          resolutionTier: 'exact',
          decomposed: true,
          matchedName: subWinner.name,
          originalInput: {
            tempId: `${subWinner.type}:${uuid()}`,
            normalizedName: sub.text.toLowerCase(),
            originalText: sub.text,
            entityType: subWinner.type,
            aliases: [sub.text],
            engineId: null,
          },
        });
      }
    }

    const allResults = [...placedResults, ...residueResults];
    if (browseMode) unresolvedResidues.length = 0;
    const groupedEntities = this.groupResolvedEntities(allResults);
    const structuredRequest = this.buildSearchRequest(request, groupedEntities);
    structuredRequest.searchRequestId ??= uuid();
    // THE ONE PLACE THE FUSED LOCALE IS DECIDED, CARRIED FORWARD (F5).
    // analyzeQuery runs once per query by contract (A5), and the two ask
    // lanes below already stamp `analysis.detectedLocale` on what they
    // record. The LOW-RESULT lane records its asks much later, in
    // search.service, with no analysis in scope — so a Vietnamese ask
    // arrived at collection indistinguishable from an English one, and the
    // keyword lane then judged it by an English stop-list. Stamping it on
    // the structured request is how a decision made here reaches a writer
    // three files away without re-running the detector or widening a
    // signature through four call layers.
    // A plain assignment, not `??=`: this is the SERVER's answer about the
    // query it just analyzed, so a client-supplied value is overwritten
    // rather than deferred to — and `undefined` (honestly undecidable) has
    // to be able to overwrite too.
    // ...and it is a REAL TAG or nothing: normalizeDetectedLocaleTag is the
    // BCP-47 round trip every locale-bearing write passes through, so an
    // unparseable tag can never land as free text that the
    // `locale = ANY(chain)` match filter silently never matches.
    structuredRequest.detectedLocale =
      normalizeDetectedLocaleTag(analysis.detectedLocale?.tag) ?? undefined;

    // UNTYPED DEMAND FLOWS DIRECTLY (ideal-abstraction round 5): the
    // collector's unmet lane reads on_demand_ask SIGNALS, not the typed
    // queue — a user asking for a word we lack is a complete collection
    // seed with no type needed. Short residue (≤2 tokens) records its ask
    // immediately; only 3+-token runs stage for the async LLM SPLITTER
    // (multi-entity residue like "khachapuri and adjika" genuinely needs
    // judgment — typing does not). Cap 3/request (red team R4-P6).
    // NO DEMAND FROM BROWSE (owner amendment 2026-08-15, consensus
    // reversal): a browse query records NO demand rows — frame words are
    // not demand, and categories are NOT demand either. Demand recording is
    // unchanged for particulars, which flow through the residue lane below
    // and the search-attribution writer.
    const cappedResidues = (browseMode ? [] : unresolvedResidues).slice(0, 3);
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
      for (const rawResidueText of cappedResidues) {
        // THE WRITE DOOR, AT LAST (A5, 2026-08-15). These two writes are the
        // LARGEST demand ingress in the app — every unknown span of every
        // search — and they were the one ingress that never passed the door.
        // They recorded RAW residue: a Spanish preposition the gazetteer
        // failed to ground became an on_demand_ask, and collection went and
        // spent money looking for `de`.
        //
        // NEVER AWAITED (D2). The door consulted here is the SYNCHRONOUS one:
        // it reads the in-memory verdict table and nothing else, so a search
        // pays microseconds, never an LLM round trip. A term holding an
        // unheard word is HELD and its word queued for tonight's drain — the
        // ask recurs, and by then it is answerable.
        const judged = this.judgedVocabulary.demandTerm(
          rawResidueText,
          analysis.detectedLocale?.tag ?? request.locale ?? null,
        );
        if (!judged.recordable) continue;
        const residueText = judged.text;
        const tokenCount = residueText.split(/\s+/).filter(Boolean).length;
        if (tokenCount <= 2) {
          // Direct untyped ask — geo is the signal's spine (R4-①).
          this.signals.record({
            kind: 'on_demand_ask',
            userId: request.userId ?? null,
            subject: { entityId: null, term: residueText },
            geo: this.signals.bboxFromBounds(request.bounds ?? null),
            occurredAt: now,
            // THE FUSED LOCALE, not the request header. subject_text keys
            // demand on RAW UNTAGGED text (A10), so this column is the only
            // thing that will ever tell collection which language's word it
            // is holding.
            detectedLocale: analysis.detectedLocale?.tag ?? null,
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
            detectedLocale: analysis.detectedLocale?.tag ?? null,
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

    // F8400: `llmMs: 0` was a constant emitted as a measurement — the F7601
    // twin one file over. unsegmented-residue.service.ts:17 records the reason
    // ("per-search LLM cost -> zero; llmMs disappears"): the LLM left this hot
    // path, so the field is not a zero timing, it is a timing that no longer
    // exists. A phase that does not run has no phaseTiming. The consumer
    // (search-orchestration) iterates the object generically, so a 2-key object
    // is handled identically to a 3-key one.
    const phaseTimings = {
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
      queryAnalysis: {
        script: analysis.script,
        requestLocale: analysis.requestLocale,
        detectedLocale: analysis.detectedLocale,
        denseTierUsed,
        browseMode,
      },
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
    // AUDIT H7: ONE budget authority and ONE metric. The inline ternary was
    // the third copy of the budget rule, and plain Levenshtein rejected
    // transpositions the recall lane's Damerau verification accepts — the
    // guard and the lane now speak the same distance.
    return damerauLevenshtein(leftover, residue) <= editBudgetForToken(residue);
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
      /** M4: run the dense lane and let its candidates be SELECTABLE
       *  through the dense admission tier. Absent = today's behavior
       *  exactly (dense off, dense candidates unselectable). */
      denseTier?: { locale: string | null };
    } = {},
  ): Promise<EntityResolutionResult> {
    const term = input.normalizedName.trim().toLowerCase();
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
          // Dense OFF BY DEFAULT: the decider reads only sparseSimilarity,
          // so the dense call was measured pure dead cost on this path.
          // M4 flips it ON only for the admission-tier probe, where a
          // decider that can consume dense evidence now exists.
          opts.denseTier
            ? { denseMode: 'always', denseLocale: opts.denseTier.locale }
            : { denseMode: 'none' },
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
    // ONE definition of the live link decision, imported (F1260) — five
    // harnesses used to replicate this expression by hand.
    // G2 DELETED (audit H3): the short-string special case was a patch on
    // the fake 0.94 prefix score. Prefix now carries honest COVERAGE
    // (typed/name length), so 'sal'→'salsa' scores 0.6 and the calibrated
    // 0.82 prefix floor rejects it on merit — the length guard is the
    // floor's job again.
    const linkable =
      top != null &&
      linkerAdmits({
        topSim,
        runnerSim,
        eligibleCount: eligible.length,
        tier: top?.sparseEvidence ?? null,
      });
    if (!linkable || !top) {
      return opts.denseTier
        ? this.decideDenseLink(input, candidates, dietaryIds)
        : unmatched;
    }
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

  /**
   * THE DENSE TIER'S DECISION (M4 + R5-1 + R5-4). Reached only after every
   * sparse route failed, and only for a query the analyzer flagged. RRF is
   * the fusion authority: `rrfTop` is a RANK fact over the fused list, so
   * no cosine is ever compared to a trigram similarity (R5-1 — the тако
   * 0.821-beats-taco-0.751 hazard is a score comparison, and there are no
   * score comparisons here).
   */
  private decideDenseLink(
    input: EntityResolutionInput,
    candidates: Array<{
      entityId: string;
      name: string;
      type: EntityType;
      rrf: number;
      denseCosine: number | null;
    }>,
    dietaryIds: ReadonlySet<string>,
  ): EntityResolutionResult {
    const unmatched: EntityResolutionResult = {
      tempId: input.tempId,
      entityId: null,
      confidence: 0,
      resolutionTier: 'unmatched',
      originalInput: input,
    };
    const dense = candidates
      .filter((c) => c.denseCosine != null)
      .sort((a, b) => (b.denseCosine ?? 0) - (a.denseCosine ?? 0));
    const best = dense[0];
    if (!best) return unmatched;
    // THE SAME PLACEMENT LAW as every other lane: the food/ingredient twin
    // ("octopus" exists as both) is ONE answer at one cosine, and which
    // row sorts first must not be decided by float ties.
    const tiedTop = dense.filter(
      (c) =>
        (best.denseCosine ?? 0) - (c.denseCosine ?? 0) <= LINKER_TIE_EPSILON,
    );
    const top = this.pickPlacedWinner(tiedTop, dietaryIds);
    const topFolded = canonicalFold(top.name);
    const runner = dense.find((c) => canonicalFold(c.name) !== topFolded);
    // The fused rank is computed over the list DEDUPED BY FOLDED NAME:
    // "octopus" occupies two rows (food + ingredient) and would otherwise
    // push its own concept down a rank purely by existing twice.
    const seenFolded = new Set<string>();
    const fused = [...candidates]
      .sort((a, b) => b.rrf - a.rrf)
      .filter((c) => {
        const key = canonicalFold(c.name);
        if (seenFolded.has(key)) return false;
        seenFolded.add(key);
        return true;
      });
    const rrfRank = fused.findIndex((c) => canonicalFold(c.name) === topFolded);
    // R5-4 span affinity: the ATTRIBUTE reading is available whenever any
    // near-tied dense candidate is attribute-typed. Derived from the data
    // (what the span could name), never guessed from the words.
    const attributeNear = dense.find(
      (c) =>
        (c.type === 'food_attribute' || c.type === 'restaurant_attribute') &&
        (top.denseCosine ?? 0) - (c.denseCosine ?? 0) <= 0.05,
    );
    const admitted = denseAdmits({
      topCosine: top.denseCosine ?? 0,
      runnerCosine: runner?.denseCosine ?? 0,
      rrfRank: rrfRank === -1 ? Number.MAX_SAFE_INTEGER : rrfRank,
      candidateType: top.type,
      spanTypeAffinity: attributeNear ? 'attribute' : null,
      inputType: input.entityType,
    });
    if (!admitted) return unmatched;
    // The tie plurality the law above computed: same-placement candidates
    // within epsilon are one answer, revealed as the OR-group rather than
    // laundered into a silent argmax (EntityResolutionInput's contract).
    const tiedIds = tiedTop
      .filter((c) => c.type === top.type)
      .map((c) => c.entityId);
    return {
      tempId: input.tempId,
      entityId: top.entityId,
      entityIds: tiedIds.length > 1 ? tiedIds : undefined,
      confidence: top.denseCosine ?? 0,
      resolutionTier: 'dense',
      matchedName: top.name,
      originalInput: { ...input, entityType: top.type },
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

  /** AUDIT M9: .indexOf() returns -1 for an unlisted type, silently making
   *  it the HIGHEST priority. rankIn() sends unlisted types to the BACK
   *  instead — a new EntityType degrades safely until deliberately placed. */
  private static rankIn(order: EntityType[], type: EntityType): number {
    const index = order.indexOf(type);
    return index === -1 ? order.length : index;
  }

  private static readonly CROSS_TYPE_PLACEMENT_ORDER: EntityType[] = [
    'food_attribute',
    'food',
    'restaurant_attribute',
    'ingredient',
    'restaurant',
  ] as EntityType[];

  /** Placement order for DECOMPOSED parts only: a fragment of a dish name
   *  reads as a modifier of the dish (attribute/ingredient conjunct), not
   *  as a rival dish. Food is the fallback when no modifier reading
   *  exists (`taco` in "tacos vegetarianos"). */
  private static readonly DECOMPOSED_PLACEMENT_ORDER: EntityType[] = [
    'food_attribute',
    'restaurant_attribute',
    'ingredient',
    'food',
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
        // PRIMARY WINS: if the same entity arrives both as a primary
        // reading and a decomposed one (it names its own span elsewhere in
        // the query), the primary reading owns the entry.
        if (!result.decomposed) {
          delete existing.decomposed;
        }
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
        ...(result.decomposed ? { decomposed: true } : {}),
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

    // Audit C3: destructuring passthrough — a field the client sent can no
    // longer be dropped here (this list previously lost includeSimilar,
    // risingActive, viewportPolygon, userId and the submission context).
    return toStructuredSearchRequest(request, resolvedEntities);
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
