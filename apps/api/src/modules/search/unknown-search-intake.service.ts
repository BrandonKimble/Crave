import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { isEnvFlagEnabled } from '../../shared/config/env-flag';
import { normalizeDetectedLocaleTag } from '../../shared/locale';
import { LLMService } from '../external-integrations/llm/llm.service';
import { SignalsService } from '../signals/signals.service';
import { OnDemandRequestService } from './on-demand-request.service';
import {
  DemandVocabularyService,
  VocabularyMatcher,
} from './demand-vocabulary.service';
import {
  QUERY_ENTITY_GROUP_KEYS,
  QueryEntityGroupKey,
} from './dto/search-query.dto';

/**
 * Group → entity type, pinned exhaustive against THE search-group vocabulary
 * (F3800/D79 idiom). The drain used to hand-copy four arms and drop the
 * prompt's fifth output array (`ingredients`) on the floor — the exact
 * forgot-a-group defect one system downstream of here (entity-type coverage
 * audit F-3: zero ingredient on-demand rows ever recorded). Deriving the
 * arms from QUERY_ENTITY_GROUP_KEYS makes a sixth group a tsc error here,
 * not a silently-discarded LLM answer.
 */
const RESIDUE_GROUP_ENTITY_TYPE = {
  places: EntityType.place,
  items: EntityType.item,
  itemAttributes: EntityType.item_attribute,
  placeAttributes: EntityType.place_attribute,
  ingredients: EntityType.ingredient,
} as const satisfies Record<QueryEntityGroupKey, EntityType>;

/**
 * Judge-spend ceiling for ONE drain pass — the same per-run prior as the
 * demand-vocabulary sweep's 100-distinct-terms cap (one budget discipline
 * across the two doors that were merged). A pass with more novel pieces than
 * this leaves the excess as demand; the ask recurs and the next pass, or the
 * nightly sweep, gets another chance. Not a product number — what changes it:
 * re-ratifying the sweep's own cap, never tuning.
 */
const MAX_JUDGE_CALLS_PER_DRAIN = 100;

interface StagedRow {
  residueId: string;
  engineIds: string[];
  userId: string | null;
  searchRequestId: string | null;
  detectedLocale: string | null;
  context: unknown;
}

interface ResiduePiece {
  term: string;
  /** null = untyped (a single unknown word — the direct-ask lane). */
  entityType: EntityType | null;
}

/**
 * THE ONE UNKNOWN-SEARCH INTAKE (owner-ordered merge, 2026-08-30).
 *
 * ZERO-PER-SEARCH-LLM STAGING ZONE (search-from-scratch spec §1.1): under
 * the gazetteer-first Understand, unknown residue never passes through a
 * sync LLM. EVERY recordable residue — one word or many — lands in
 * collection_on_demand_unsegmented_residue, and this cron drains it off the
 * hot path (unchanged 10-minute cadence).
 *
 * What the drain does per distinct residue text (the merge of the old
 * Phrase Splitter and the Word Learner's per-term move):
 *
 *   1. SEGMENT if multi-word — the splitter's LLM (residue-prompt.md),
 *      emitting typed pieces across all five search groups. A single
 *      unknown word needs no judgment about where it splits: it IS the
 *      piece, untyped.
 *   2. Per piece, ALIAS-MATCH before collection spends anything:
 *      a. fold-known in the piece's own locale chain → the concept already
 *         exists — the piece is a NO-OP (the old splitter recorded demand
 *         for 'taco' out of 'birria tacos' even when we held taco).
 *      b. genuinely novel → the Same-Thing Judge with the D2 alias-evidence
 *         standard (DemandVocabularyService.createMatcher — the Learner's
 *         exact move: dense retrieval only retrieves, the judge decides,
 *         fails closed, banks a locale-tagged `query_banking` alias under
 *         the collision guard). A learned piece becomes VOCABULARY, not
 *         demand — the next search that types it gets a lexical hit.
 *      c. only unmatched pieces become demand: typed pieces → typed
 *         on-demand requests (the splitter's move, unchanged); the untyped
 *         single word → a direct `on_demand_ask` signal (the unmet lane
 *         reads untyped demand by territory).
 *
 *   Mixed queries fall out naturally: known parts no-op or alias-bank,
 *   unknown parts collect.
 *
 * PRIVACY: the judge call here carries ONE asker's own typed piece plus our
 * own candidate names — own-actor scoped, the same outbound shape as the
 * segmentation call this drain has always made. The k-anonymity floor
 * (signal_emittable_terms) governs CROSS-person emission and still guards
 * every ledger read (the sweep, the unmet lane) exactly as before.
 *
 * SPEND: segmentation is deduped per DISTINCT text (as always); the judge
 * step is additionally gated by UNKNOWN_INTAKE_ALIAS_MATCH_ENABLED
 * (DEFAULT OFF — launch flip-list) and capped per pass. Flag off = the old
 * splitter routing exactly, minus demand rows for already-known pieces
 * (the fold check costs no LLM and a known concept is never demand).
 */
@Injectable()
export class UnknownSearchIntakeService {
  private readonly logger: LoggerService;
  private drainInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmService: LLMService,
    private readonly onDemandRequestService: OnDemandRequestService,
    private readonly demandVocabulary: DemandVocabularyService,
    private readonly signals: SignalsService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('UnknownSearchIntakeService');
  }

  private get aliasMatchEnabled(): boolean {
    // DEFAULT OFF (iteration-phase ruling 2026-08-09); the launch flip-list
    // arms it. Gates only the JUDGE/BANK step — segmentation and the free
    // fold-known filter always run.
    return isEnvFlagEnabled(
      process.env.UNKNOWN_INTAKE_ALIAS_MATCH_ENABLED,
      false,
    );
  }

  async recordResidue(input: {
    residueText: string;
    searchRequestId?: string | null;
    engineIds?: string[];
    userId?: string | null;
    /** The language the residue was typed in (spine step 2). Captured HERE
     *  because it can only be captured here: the drain runs minutes later
     *  with no request, no locale header and no analyzer in scope. */
    detectedLocale?: string | null;
    context?: Record<string, unknown>;
  }): Promise<void> {
    const text = input.residueText.trim().slice(0, 500);
    if (!text) return;
    // EVERY ask is recorded (red team R4-②): deduping rows collapsed 300
    // users' interest into distinctUserCount=1 — demand ranking off by
    // orders of magnitude. What must be deduped is the LLM CALL, and the
    // drain does that by segmenting once per DISTINCT text.
    await this.prisma.onDemandUnsegmentedResidue.create({
      data: {
        residueText: text,
        searchRequestId: input.searchRequestId ?? null,
        engineIds: input.engineIds ?? [],
        userId: input.userId ?? null,
        // BCP-47 round trip, shared with every other locale-bearing write:
        // an unparseable tag is stored as NULL rather than as free text the
        // locale match filter can never match (A0 R2).
        detectedLocale: normalizeDetectedLocaleTag(input.detectedLocale),
        context: (input.context ?? {}) as never,
      },
    });
  }

  @Cron('*/10 * * * *')
  async drainBatch(): Promise<void> {
    // CUTOVER: the gazetteer Understand is the only producer and is always
    // on — the drain runs unconditionally (idles at one indexed SELECT
    // when the staging zone is empty).
    if (this.drainInFlight) return;
    this.drainInFlight = true;
    try {
      const pending = await this.prisma.onDemandUnsegmentedResidue.findMany({
        where: { status: 'pending', attempts: { lt: 3 } },
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
      if (pending.length) {
        // ONE LLM call per DISTINCT residue text; one demand write per ROW
        // (every ask keeps its user/engine/geo attribution).
        // Grouped by TEXT alone, still: the LLM call is what is being
        // deduped, and identical text segments into identical terms whatever
        // language the asker was in. The locale rides per-ROW into the
        // demand writes below, so grouping never collapses two languages
        // into one.
        const byText = new Map<string, typeof pending>();
        for (const row of pending) {
          const bucket = byText.get(row.residueText) ?? [];
          bucket.push(row);
          byText.set(row.residueText, bucket);
        }
        // ONE matcher per pass: the known-set loads once, and the judge
        // budget is shared across every group of this pass.
        const matcher = await this.demandVocabulary.createMatcher();
        const budget = { judgeCalls: MAX_JUDGE_CALLS_PER_DRAIN };
        for (const [text, rows] of byText) {
          await this.processGroup(text, rows, matcher, budget);
        }
      }
      // Retention (red team R4-P6): processed rows are audit crumbs, not
      // records — the typed queue + signals are the durable record. 30
      // days is plenty for debugging the segmenter.
      await this.prisma.onDemandUnsegmentedResidue.deleteMany({
        where: {
          status: { in: ['segmented', 'discarded', 'failed'] },
          processedAt: { lt: new Date(Date.now() - 30 * 24 * 3600 * 1000) },
        },
      });
    } catch (error) {
      this.logger.warn('Residue drain pass failed', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    } finally {
      this.drainInFlight = false;
    }
  }

  private async processGroup(
    residueText: string,
    rows: StagedRow[],
    matcher: VocabularyMatcher,
    budget: { judgeCalls: number },
  ): Promise<void> {
    const ids = rows.map((r) => r.residueId);
    try {
      const pieces = await this.segmentPieces(residueText);
      // The GROUP's language, for the vocabulary questions: the newest
      // decided answer among the staged rows — the same "locale is an
      // attribute of a demand, silence never erases a decided answer"
      // convention the ledger reads use. Each row still carries its OWN
      // locale into its demand write below.
      const groupLocale =
        [...rows]
          .reverse()
          .map((row) => row.detectedLocale)
          .find((tag) => !!tag) ?? null;

      const demandPieces: ResiduePiece[] = [];
      for (const piece of pieces) {
        // (a) THE FOLD-KNOWN FILTER — free, always on. A piece whose fold
        // already lives in its own locale chain names a concept we HOLD;
        // recording demand for it sends the collector after something the
        // corpus already has (the old splitter did exactly that).
        if (await matcher.isKnown(piece.term, groupLocale)) {
          continue;
        }
        // (b) THE ALIAS MATCH — the Learner's move, at arrival. Flag-gated
        // spend, budget-capped per pass; anything the budget or flag skips
        // simply stays demand, which is the old behavior.
        if (this.aliasMatchEnabled && budget.judgeCalls > 0) {
          budget.judgeCalls -= 1;
          const result = await matcher.match(piece.term, groupLocale);
          if (result.outcome === 'learned') {
            this.logger.info('Residue piece learned as vocabulary', {
              term: piece.term,
              locale: groupLocale ?? 'und',
              entity: result.entityName,
              residueText,
            });
            continue;
          }
          if (result.outcome === 'known') {
            continue;
          }
          // 'refused' (collision) and 'left_as_demand' both fall through:
          // the judge could not make the piece vocabulary, so it is demand.
        }
        demandPieces.push(piece);
      }

      const typed = demandPieces.filter(
        (piece): piece is ResiduePiece & { entityType: EntityType } =>
          piece.entityType !== null,
      );
      const untyped = demandPieces.filter((piece) => piece.entityType === null);

      for (const row of rows) {
        const rowContext =
          row.context && typeof row.context === 'object'
            ? (row.context as Record<string, unknown>)
            : {};
        if (typed.length) {
          // One recordRequests per staged ROW: each searcher's ask keeps its
          // own user, engines, searchRequestId, and — critically — its
          // BOUNDS (the signals layer drops geo-less asks).
          await this.onDemandRequestService.recordRequests(
            typed.map((entry) => ({
              term: entry.term.trim(),
              entityType: entry.entityType,
              reason: 'unresolved',
              engineIds: row.engineIds,
              // The SEGMENT inherits the language of the text it came out of.
              // A segmenter that split 'bún đậu mắm tôm nhà hàng' cannot
              // re-detect per fragment — and would not need to: one person
              // typed one string in one language.
              detectedLocale: row.detectedLocale,
              metadata: {
                source: 'residue_segmenter',
                residueText,
                searchRequestId: row.searchRequestId ?? undefined,
              },
            })),
            { userId: row.userId },
            {
              source: 'residue_segmenter',
              searchRequestId: row.searchRequestId,
              ...(rowContext.bounds ? { bounds: rowContext.bounds } : {}),
            },
          );
        }
        for (const piece of untyped) {
          // UNTYPED DEMAND FLOWS DIRECTLY (ideal-abstraction round 5): a
          // single unknown word is a complete collection seed with no type
          // needed — the unmet lane reads on_demand_ask signals by
          // territory. This write moved here from the hot path when the
          // one-intake merge routed ALL residue through staging; the signal
          // shape is unchanged (geo = the searcher's viewport, the fused
          // locale, askSearchRequestId for read-side dedupe).
          this.signals.record({
            kind: 'on_demand_ask',
            userId: row.userId,
            subject: { entityId: null, term: piece.term },
            geo: this.signals.bboxFromBounds(
              this.extractBounds(rowContext.bounds) ?? null,
            ),
            occurredAt: new Date(),
            detectedLocale: row.detectedLocale,
            meta: {
              askSearchRequestId: row.searchRequestId ?? undefined,
              reason: 'unresolved',
              source: 'gazetteer_residue',
            },
          });
        }
      }
      // Junk needs no judgment: a residue that segments to nothing is
      // discarded — it failed to name anything collectible. A residue whose
      // every piece was already vocabulary (or just became it) DID name
      // things; it is 'segmented' with nothing left to collect.
      await this.prisma.onDemandUnsegmentedResidue.updateMany({
        where: { residueId: { in: ids } },
        data: {
          status: pieces.length ? 'segmented' : 'discarded',
          processedAt: new Date(),
          attempts: { increment: 1 },
        },
      });
    } catch (error) {
      // Terminal state: the third failure moves the rows to 'failed' —
      // visible, countable, and out of the drain's way.
      await this.prisma.onDemandUnsegmentedResidue.updateMany({
        where: { residueId: { in: ids } },
        data: { attempts: { increment: 1 } },
      });
      await this.prisma.onDemandUnsegmentedResidue.updateMany({
        where: { residueId: { in: ids }, attempts: { gte: 3 } },
        data: { status: 'failed', processedAt: new Date() },
      });
      this.logger.warn('Residue intake failed (will retry)', {
        residueText,
        rows: ids.length,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /**
   * SEGMENT IF MULTI-WORD. One token IS the piece (untyped — the splitter
   * has nothing to split and the unmet lane does not consult the type);
   * two or more tokens go to the splitter's LLM, whose typed answer across
   * all five groups is the pieces.
   */
  private async segmentPieces(residueText: string): Promise<ResiduePiece[]> {
    const tokens = residueText.split(/\s+/).filter(Boolean);
    if (tokens.length <= 1) {
      return [{ term: residueText.trim(), entityType: null }];
    }
    const analysis = await this.llmService.interpretResidue(residueText);
    return QUERY_ENTITY_GROUP_KEYS.flatMap((group) =>
      (analysis[group] ?? []).map((term) => ({
        term: term.trim(),
        entityType: RESIDUE_GROUP_ENTITY_TYPE[group] as EntityType,
      })),
    ).filter((entry) => entry.term.length > 0);
  }

  /** The staged context carries the search viewport as context.bounds —
   *  the on_demand_ask signal's geo (same shape recordRequests reads). */
  private extractBounds(value: unknown): {
    northEast: { lat: number; lng: number };
    southWest: { lat: number; lng: number };
  } | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const bounds = value as {
      northEast?: { lat?: unknown; lng?: unknown };
      southWest?: { lat?: unknown; lng?: unknown };
    };
    const ne = bounds.northEast;
    const sw = bounds.southWest;
    if (
      typeof ne?.lat !== 'number' ||
      typeof ne.lng !== 'number' ||
      typeof sw?.lat !== 'number' ||
      typeof sw.lng !== 'number'
    ) {
      return null;
    }
    return {
      northEast: { lat: ne.lat, lng: ne.lng },
      southWest: { lat: sw.lat, lng: sw.lng },
    };
  }
}
