import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { descendantPlaceIds } from '../places/place-dag-read';
import { LoggerService } from '../../shared';
import { localeLookupChain } from '../../shared/locale';
import {
  canonicalFold,
  diacriticFold,
} from '../content-processing/entity-resolver/entity-identity';
import { EmbeddingService } from '../external-integrations/llm/embedding.service';

interface EntitySearchRow {
  term?: string;
  entityId: string;
  name: string;
  type: EntityType;
  exactHit?: number;
  nameSimilarity: number;
  aliasSimilarity?: number;
  ftsRank?: number;
  prefixHit: number;
  nameFtsHit?: number;
  aliasTrgmHit?: number;
  containsHit?: number;
  containsCoverage?: number | null;
  editScore?: number | null;
  publicCraveScore: Prisma.Decimal | null;
  generalPraiseUpvotes: number | null;
}

export type TextMatchEvidence =
  | 'exact'
  | 'prefix'
  | 'name'
  | 'alias'
  | 'fuzzy'
  /** Whole-word CONTAINMENT ("omakase" ⊂ "Omakase Room"): its own tier with an
   *  honest coverage score (term/name length ratio) — word_similarity returns a
   *  fake 1.0 for this class, which used to masquerade as a perfect score. */
  | 'contains'
  /** Bounded per-token edit distance ("piza"→"pizza"): its own tier scored
   *  1 − lev/len — previously admitted then thrown away as 'weak'. */
  | 'edit'
  | 'embedding'
  | 'weak';

export interface TextSearchMatch {
  entityId: string;
  name: string;
  type: EntityType;
  similarity: number;
  evidence: TextMatchEvidence;
}

/**
 * THE tier ladder, stated ONCE (F582). The order of evidence tiers — exact
 * beats prefix beats whole-word containment beats FTS name/alias beats
 * fuzzy/edit beats pure embedding — used to live restated in three tables (this
 * union's doc order, autocomplete's EVIDENCE_TIER_STRENGTH ordinal, and
 * entity-search's EVIDENCE_CONFIDENCE magnitudes). The ORDER now has one home:
 * a list of tie-groups, strongest first. Consumers that need an ordinal derive
 * it here (evidenceTierStrength); consumers that need a calibrated magnitude
 * (EVIDENCE_CONFIDENCE) keep their owner-set values but must AGREE with this
 * order. `weak` is deliberately absent — it is dropped from type-ahead, so it
 * has no rank. Each inner array is a deliberate TIE (name≈alias, fuzzy≈edit).
 */
export const EVIDENCE_TIER_LADDER: ReadonlyArray<
  ReadonlyArray<TextMatchEvidence>
> = [
  ['exact'],
  ['prefix'],
  // OWNER-RULED 2026-08-03 (F582): a thing NAMED X outranks a thing that
  // merely mentions X — name/alias sits above whole-phrase containment,
  // matching entity-search's confidence bands. This was the one pair the two
  // tables disagreed on; the agreement spec now tolerates zero exceptions.
  ['name', 'alias'],
  ['contains'],
  ['fuzzy', 'edit'],
  ['embedding'],
];

/**
 * Ordinal strength of an evidence tier, DERIVED from EVIDENCE_TIER_LADDER (the
 * single source of tier order). Strongest group scores highest; tied members
 * share a strength; a tier off the ladder (e.g. 'weak') scores 0. ORDER ONLY —
 * the integers are ladder positions, never magnitudes, so they cannot act as
 * weights (see autocomplete §16).
 */
export function evidenceTierStrength(evidence: string): number {
  const top = EVIDENCE_TIER_LADDER.length + 1;
  const groupIndex = EVIDENCE_TIER_LADDER.findIndex((group) =>
    (group as ReadonlyArray<string>).includes(evidence),
  );
  return groupIndex === -1 ? 0 : top - groupIndex;
}

/**
 * A candidate from the shared recall core, carrying both lanes' raw signals as
 * features for a consumer-specific Stage-2 reranker. `rrf` is the fusion score
 * used only to order the recall shortlist — NOT a relevance score.
 */
export interface RecallCandidate {
  entityId: string;
  name: string;
  type: EntityType;
  rrf: number;
  sparseRank: number | null;
  sparseSimilarity: number | null;
  sparseEvidence: TextMatchEvidence | null;
  denseRank: number | null;
  denseCosine: number | null;
}

import {
  damerauLevenshtein,
  deletionVariants,
  editBudgetForLength,
} from './entity-lexicon';
import {
  admitsAtExactTier,
  groupEntitySpans,
  pickSpanWinner,
  type EntitySpanGroup,
} from './gazetteer-spans';
import {
  analyzeQuery,
  denseQueryInput,
  NGRAM_MAX_PHRASE_WORDS_CEILING,
  type QueryAnalysis,
} from './query-analyzer';

export type { EntitySpanGroup, SpanEntity } from './gazetteer-spans';

/** A known-entity mention found by the gazetteer scan: a character span + its entity. */
export interface EntitySpan {
  start: number;
  end: number;
  text: string;
  entityId: string;
  name: string;
  type: EntityType;
}

@Injectable()
export class EntityTextSearchService {
  private readonly logger: LoggerService;
  private readonly minPrefixLength = 1;
  private readonly maxLimit = 50;
  private readonly cacheTtlMs = 30_000;
  private readonly maxCacheEntries = 2_000;
  private readonly cache = new Map<
    string,
    { expiresAt: number; limit: number; results: TextSearchMatch[] }
  >();
  /** engineId → territory place ids (short TTL; see resolveEngineTerritoryPlaceIds). */
  private readonly territoryCache = new Map<
    string,
    { expiresAt: number; placeIds: string[] }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddingService: EmbeddingService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('EntityTextSearchService');
  }

  /**
   * Semantic recall lane: embed the query and ANN-search `name_embedding`
   * (pgvector, HNSW cosine). Catches different-words-same-meaning that the lexical
   * lanes miss ("bacon egg and cheese" → breakfast sandwiches). Costs one embedding
   * call per query, so callers gate it to batch/latency-tolerant paths (collection
   * resolution, gazetteer) rather than keystroke autocomplete. Returns matches with
   * `evidence: 'embedding'` and `similarity` = cosine (1 − distance).
   */
  async searchByEmbedding(
    term: string,
    entityTypes: EntityType[],
    limit: number,
    options: { engineId?: string | null; locale?: string | null } = {},
  ): Promise<TextSearchMatch[]> {
    const normalizedTerm = term?.trim();
    if (!normalizedTerm || entityTypes.length === 0) return [];

    const queryVec = await this.embeddingService.embedQuery(
      denseQueryInput(normalizedTerm, options.locale ?? null),
    );
    if (!queryVec?.length) return [];

    const safeLimit = Math.max(1, Math.min(limit, this.maxLimit));
    const literal = `[${queryVec.join(',')}]`;
    const typeArray = Prisma.sql`ARRAY[${Prisma.join(
      entityTypes.map((t) => Prisma.sql`${t}::entity_type`),
    )}]`;
    const territoryFilter = await this.buildRestaurantEngineTerritoryFilter(
      'e',
      options.engineId ?? null,
    );

    const rows = await this.prisma.$queryRaw<
      { entityId: string; name: string; type: EntityType; cosine: number }[]
    >(Prisma.sql`
      SELECT e.entity_id AS "entityId", e.name, e.type,
             1 - (e.name_embedding <=> ${literal}::vector) AS cosine
      FROM core_entities e
      WHERE e.type = ANY(${typeArray})
        AND e.status = 'active'::entity_status
        AND e.name_embedding IS NOT NULL
        ${territoryFilter}
      ORDER BY e.name_embedding <=> ${literal}::vector
      LIMIT ${safeLimit}
    `);

    return rows.map((r) => ({
      entityId: r.entityId,
      name: r.name,
      type: r.type,
      similarity: Number(r.cosine),
      evidence: 'embedding' as const,
    }));
  }

  /**
   * LOCALIZED-SURFACE LANE — the ONLY way a locale-tagged surface reaches the
   * recall core, and therefore the only way autocomplete can match a foreign
   * word at all.
   *
   * Since AC-P1a the sparse lane itself reads the locale-chained
   * entity_surface registry, so tagged surfaces reach it too — this lane
   * remains the EXACT/PREFIX/localized-label specialist (label rendering,
   * canonicalFold identity, per-locale ranking) layered over that recall.
   *
   * OPT-IN: it runs only when a caller passes a request locale. Ingestion and
   * poll seeding pass none and are unaffected — no behaviour changes for a
   * consumer that never had a locale.
   */
  async searchLocalizedSurfaces(
    term: string,
    entityTypes: EntityType[],
    limit: number,
    requestLocale: string,
  ): Promise<TextSearchMatch[]> {
    const folded = canonicalFold(term ?? '');
    if (!folded || entityTypes.length === 0) return [];
    const chain = localeLookupChain(requestLocale);
    // 'und' alone means "no locale was asked for" — the sparse lane already
    // covers untagged forms, so there is nothing for this lane to add.
    if (chain.length <= 1) return [];
    const typeArray = Prisma.sql`ARRAY[${Prisma.join(
      entityTypes.map((t) => Prisma.sql`${t}::entity_type`),
    )}]`;
    const rows = await this.prisma.$queryRaw<
      {
        entityId: string;
        name: string;
        type: EntityType;
        exact: boolean;
        sim: number;
        form: string;
      }[]
    >(Prisma.sql`
      -- F3801: DEDUP ORDER AND RELEVANCE ORDER ARE DIFFERENT QUESTIONS.
      -- DISTINCT ON REQUIRES its key to lead the ORDER BY, so the old
      -- single-level shape ordered by entity_id (a UUID) and the LIMIT then
      -- sliced a UUID-sorted set: measured against the local corpus with
      -- term 'taco', chain ['es','und'], the one exact match at 1.0 was
      -- dropped and 20 prefix-extensions at 0.94 came back instead. The
      -- exact DESC key only ever picked the best ALIAS ROW WITHIN an entity.
      -- Now: dedup inner (unbounded), rank outer, LIMIT last. The trailing
      -- entity_id ASC is the unique tiebreak the F1902 determinism law
      -- requires — name is NOT unique (duplicate (lower(name), type) groups
      -- exist in a single-city corpus, and same-name restaurants across
      -- cities are the norm the moment a second city lands).
      SELECT * FROM (
        SELECT DISTINCT ON (e.entity_id)
               e.entity_id AS "entityId", e.name, e.type,
               (ea.form_folded = ${folded}) AS "exact",
               similarity(ea.form_folded, ${folded}) AS "sim",
               -- The MATCHED SURFACE travels with the row: the tier below is
               -- a statement about the form that matched, and it cannot be
               -- recomputed from the entity's name (see the mapper).
               ea.form_folded AS "form"
          FROM entity_surface ea
          JOIN core_entities e ON e.entity_id = ea.entity_id
         WHERE ea.status = 'active'
           -- THE RECALL PREDICATE (surface merge, §11-2). One table now holds
           -- display and recall forms; role='display' is a surface whose
           -- recall claim the collision guard REFUSED, so it must never
           -- ground. Every recall arm carries this filter.
           AND ea.role <> 'display'
           AND LOWER(ea.locale) = ANY(${chain}::text[])
           AND (ea.form_folded = ${folded}
                OR ea.form_folded LIKE ${folded + '%'}
                -- AC-P2c: the TRIGRAM arm — typo tolerance was an
                -- English-only privilege while this lane was exact+prefix.
                -- Same banded threshold as the sparse lane; the GIN trgm
                -- index on form_folded makes it a probe.
                OR (${folded.length >= 4} AND similarity(ea.form_folded, ${folded}) >= ${this.resolveSimilarityThreshold(folded)}))
           AND e.status = 'active'::entity_status
           AND e.type = ANY(${typeArray})
         ORDER BY e.entity_id, (ea.form_folded = ${folded}) DESC, similarity(ea.form_folded, ${folded}) DESC
      ) deduped
       ORDER BY deduped."exact" DESC, deduped."sim" DESC, deduped.name ASC, deduped."entityId" ASC
       LIMIT ${Math.max(1, Math.min(limit, this.maxLimit))}
    `);
    // Tiered exactly like the sparse lane so downstream confidence bands and
    // the link decider treat a localized hit as the same KIND of evidence.
    //
    // THE TIER DESCRIBES THE FORM THAT MATCHED — not the entity's name. Every
    // arm of the WHERE above tests `ea.form_folded`, so the mapper has to ask
    // the same column. It used to classify with `canonicalFold(row.name)`,
    // which is a DIFFERENT STRING on precisely the rows this lane exists for:
    // a Spanish alias hanging off an entity whose name is in another language.
    // A real prefix hit then failed the name test and fell through to 'fuzzy',
    // and the linker judged it by fuzzy floors (~0.95 absolute) instead of the
    // prefix band — so a user typing a prefix in their own language got their
    // best suggestions rejected or ranked below worse ones. Harmless while the
    // lane was exact+prefix and every non-exact row was 'prefix' regardless;
    // the AC-P2c trigram arm made the misread reachable by giving it a third
    // tier to fall into.
    return rows.map((row) => {
      const form = row.form ?? '';
      const isPrefix = !row.exact && form.startsWith(folded);
      return {
        entityId: row.entityId,
        name: row.name,
        type: row.type,
        // exact 1; prefix = honest coverage (how much of the matched surface
        // the user actually typed); fuzzy = the measured trigram sim, WEARING
        // ITS OWN TIER so the linker's fuzzy floors judge it — a trigram row
        // labeled 'prefix' would be judged by the wrong band.
        similarity: row.exact
          ? 1
          : isPrefix
            ? folded.length / Math.max(form.length, 1)
            : Number(row.sim),
        evidence: row.exact
          ? ('exact' as const)
          : isPrefix
            ? ('prefix' as const)
            : ('fuzzy' as const),
      };
    });
  }

  /**
   * Shared recall core (Stage 1). Runs the sparse (lexical) and dense (embedding)
   * lanes in parallel and fuses them by Reciprocal Rank Fusion — `Σ 1/(k+rank)`,
   * k=60. RRF is rank-based, so it is immune to the lexical-score vs cosine scale
   * mismatch and needs NO weights or tuning. This is recall only: it gathers a
   * generous shortlist and orders it roughly; a consumer-specific Stage-2 reranker
   * (autocomplete feature model / resolution + gazetteer LLM-matcher) decides the
   * final order/decision using the per-lane features carried on each candidate.
   */
  /** Postgres levenshtein() rejects arguments over 255 chars — and no real
   *  entity name approaches that. Terms past this bound return no
   *  candidates instead of failing the edit arm per probe (red team R4). */
  private static readonly MAX_PROBE_TERM_LENGTH = 200;

  async retrieveCandidates(
    term: string,
    entityTypes: EntityType[],
    limit: number,
    options: {
      /**
       * §13 territory-as-retrieval-PRIOR (markets extermination leg 3): the
       * COLLECTION ENGINE whose territory geo-scopes restaurant recall — a
       * restaurant qualifies when one of its LOCATIONS falls inside a member
       * place's ground (geometric presence, place_geometries; never the dead
       * core_entity_market_presence rows). null/absent = GLOBAL (identity is
       * global; scope is a bias for corpus-scoped consumers only).
       */
      engineId?: string | null;
      poolSize?: number;
      /**
       * 'always' (default) — run the dense lane every time (batch heads: resolution,
       * gazetteer). 'none' — skip the dense lane entirely. The query-time linker's
       * decider reads only sparseSimilarity, so dense candidates are never selectable
       * there and the dense call is pure dead cost until a decider can consume dense
       * evidence.
       */
      denseMode?: 'always' | 'none';
      /**
       * R5-7 (Uber Eats 2026 ships an explicit search-language field): the
       * request locale is threaded INTO THE DENSE QUERY INPUT, not just used
       * as an alias-arm filter. gemini-embedding-001 is multilingual, so
       * "pan" embedded as `[es] pan` sits nearer bread than nearer cookware.
       * The SPARSE lane never sees the prefix — lexical matching against a
       * bracketed tag would be nonsense.
       */
      denseLocale?: string | null;
      /**
       * BCP 47. OPT-IN: when present, the LOCALIZED-SURFACE lane runs — the
       * only way a locale-tagged `entity_surface` row reaches this core, and
       * therefore the only way autocomplete can match a foreign word. Callers
       * with no locale (ingestion, poll seeding) behave exactly as before.
       */
      requestLocale?: string | null;
    } = {},
  ): Promise<RecallCandidate[]> {
    if (
      term.length > EntityTextSearchService.MAX_PROBE_TERM_LENGTH ||
      !term.trim()
    ) {
      return [];
    }
    const normalizedTerm = term?.trim();
    if (!normalizedTerm || entityTypes.length === 0) return [];

    const pool = Math.max(limit, options.poolSize ?? 50);
    const sparseOpts = {
      engineId: options.engineId,
      requestLocale: options.requestLocale ?? null,
    };
    const denseOpts = { engineId: options.engineId };

    const denseMode = options.denseMode ?? 'always';
    // The localized-surface lane runs whenever a caller supplies a locale.
    const localizedPromise = options.requestLocale
      ? this.searchLocalizedSurfaces(
          normalizedTerm,
          entityTypes,
          pool,
          options.requestLocale,
        )
      : Promise.resolve([] as TextSearchMatch[]);
    let sparse: TextSearchMatch[];
    let dense: TextSearchMatch[];
    if (denseMode === 'none') {
      sparse = await this.searchEntities(
        normalizedTerm,
        entityTypes,
        pool,
        sparseOpts,
      );
      dense = [];
    } else {
      [sparse, dense] = await Promise.all([
        this.searchEntities(normalizedTerm, entityTypes, pool, sparseOpts),
        this.searchByEmbedding(normalizedTerm, entityTypes, pool, {
          ...denseOpts,
          locale: options.denseLocale ?? null,
        }),
      ]);
    }

    const K = 60;
    const byId = new Map<string, RecallCandidate>();
    const ensure = (m: TextSearchMatch): RecallCandidate => {
      let c = byId.get(m.entityId);
      if (!c) {
        c = {
          entityId: m.entityId,
          name: m.name,
          type: m.type,
          rrf: 0,
          sparseRank: null,
          sparseSimilarity: null,
          sparseEvidence: null,
          denseRank: null,
          denseCosine: null,
        };
        byId.set(m.entityId, c);
      }
      return c;
    };

    sparse.forEach((m, rank) => {
      const c = ensure(m);
      c.sparseRank = rank;
      c.sparseSimilarity = m.similarity;
      c.sparseEvidence = m.evidence;
      c.rrf += 1 / (K + rank);
    });
    dense.forEach((m, rank) => {
      const c = ensure(m);
      c.denseRank = rank;
      c.denseCosine = m.similarity;
      c.rrf += 1 / (K + rank);
    });
    // A localized hit is sparse-grade evidence: it matched a real stored
    // surface, in the requester's language. It only ever RAISES a candidate's
    // evidence (a lane cannot demote what another lane matched better).
    (await localizedPromise).forEach((m, rank) => {
      const c = ensure(m);
      if (
        c.sparseSimilarity === null ||
        (m.similarity ?? 0) > c.sparseSimilarity
      ) {
        c.sparseSimilarity = m.similarity;
        c.sparseEvidence = m.evidence;
      }
      c.rrf += 1 / (K + rank);
    });

    return Array.from(byId.values())
      .sort((a, b) => b.rrf - a.rrf)
      .slice(0, limit);
  }

  async searchEntities(
    term: string,
    entityTypes: EntityType[],
    limit: number,
    options: {
      engineId?: string | null;
      requestLocale?: string | null;
    } = {},
  ): Promise<TextSearchMatch[]> {
    const normalizedTerm = this.normalizeTerm(term);
    if (
      !normalizedTerm ||
      normalizedTerm.length < this.minPrefixLength ||
      entityTypes.length === 0
    ) {
      return [];
    }

    const safeLimit = Math.max(1, Math.min(limit, this.maxLimit));

    const resultsByTerm = await this.searchEntitiesForTerms(
      [normalizedTerm],
      entityTypes,
      safeLimit,
      {
        engineId: options.engineId,
        requestLocale: options.requestLocale ?? null,
      },
    );
    return resultsByTerm.get(normalizedTerm) ?? [];
  }

  async searchAttributeAutocompleteEntities(
    term: string,
    entityTypes: EntityType[],
    limit: number,
    options: { engineId?: string | null; requestLocale?: string | null } = {},
  ): Promise<TextSearchMatch[]> {
    const normalizedTerm = this.normalizeTerm(term);
    if (
      !normalizedTerm ||
      normalizedTerm.length < this.minPrefixLength ||
      entityTypes.length === 0
    ) {
      return [];
    }

    const attributeTypes = entityTypes.filter((entityType) =>
      this.isAttributeType(entityType),
    );
    if (attributeTypes.length === 0) {
      return [];
    }

    const safeLimit = Math.max(1, Math.min(limit, this.maxLimit));
    // AC-P0 (autocomplete i18n audit, §13): the attribute lane was the ONE
    // matching lane with no locale — 1,921 es attribute surfaces existed,
    // the chips RENDERED in Spanish, and typing 'picante'/'sin gluten'
    // could never surface them. The locale-chained surface registry runs
    // beside the legacy lane exactly as it does for the entity lane, and a
    // registry hit is the STRONGER evidence (exact/prefix on an adjudicated
    // surface), so it merges in front.
    const [resultsByTerm, localized] = await Promise.all([
      this.searchEntitiesForTerms(
        [normalizedTerm],
        attributeTypes,
        Math.min(safeLimit * 4, this.maxLimit),
        {
          engineId: options.engineId,
          requestLocale: options.requestLocale ?? null,
        },
      ),
      options.requestLocale
        ? this.searchLocalizedSurfaces(
            term,
            attributeTypes,
            safeLimit,
            options.requestLocale,
          )
        : Promise.resolve([]),
    ]);
    const legacy = (resultsByTerm.get(normalizedTerm) ?? []).filter((match) =>
      this.isAttributeAutocompleteTextMatch(normalizedTerm, match),
    );
    const seen = new Set(localized.map((row) => row.entityId));
    return [
      ...localized.map((row) => ({
        entityId: row.entityId,
        name: row.name,
        type: row.type,
        similarity: row.similarity,
        evidence: row.evidence,
      })),
      ...legacy.filter((row) => !seen.has(row.entityId)),
    ].slice(0, safeLimit);
  }

  async searchEntitiesForTerms(
    terms: string[],
    entityTypes: EntityType[],
    perTermLimit: number,
    options: {
      engineId?: string | null;
      requestLocale?: string | null;
    } = {},
  ): Promise<Map<string, TextSearchMatch[]>> {
    const normalizedTerms = terms
      .map((term) => this.normalizeTerm(term))
      .filter((term) => term.length > 0);
    const uniqueTerms: string[] = [];
    const seenTerms = new Set<string>();
    normalizedTerms.forEach((term) => {
      if (seenTerms.has(term)) return;
      seenTerms.add(term);
      uniqueTerms.push(term);
    });

    const resultsByTerm = new Map<string, TextSearchMatch[]>();
    if (
      uniqueTerms.length === 0 ||
      uniqueTerms.some((term) => term.length < this.minPrefixLength) ||
      entityTypes.length === 0
    ) {
      return resultsByTerm;
    }

    const safePerTermLimit = Math.max(1, Math.min(perTermLimit, this.maxLimit));
    const engineId = options.engineId ?? null;

    const missingTerms: string[] = [];
    uniqueTerms.forEach((term) => {
      const cached = this.getCachedTermResults({
        requestLocale: options.requestLocale ?? null,
        term,
        entityTypes,
        engineId,
        limit: safePerTermLimit,
      });
      if (cached) {
        resultsByTerm.set(term, cached);
      } else {
        missingTerms.push(term);
      }
    });

    if (missingTerms.length === 0) {
      return resultsByTerm;
    }

    const thresholdsByTerm = new Map(
      missingTerms.map((term) => [term, this.resolveSimilarityThreshold(term)]),
    );

    const shortTerms = missingTerms.filter((term) => term.length <= 2);
    const longTerms = missingTerms.filter((term) => term.length > 2);

    try {
      const fetchedRowsByTerm = new Map<string, EntitySearchRow[]>();
      if (shortTerms.length > 0) {
        const rows = await this.fetchPrefixRowsForTerms({
          terms: shortTerms,
          entityTypes,
          perTermLimit: safePerTermLimit,
          engineId,
        });
        rows.forEach((row) => {
          const term = row.term ?? '';
          const bucket = fetchedRowsByTerm.get(term) ?? [];
          bucket.push(row);
          fetchedRowsByTerm.set(term, bucket);
        });
      }

      if (longTerms.length > 0) {
        const [rows, lexiconRowsByTerm] = await Promise.all([
          this.fetchFtsTrgmRowsForTerms({
            requestLocale: options.requestLocale ?? null,
            terms: longTerms,
            entityTypes,
            perTermLimit: safePerTermLimit,
            engineId,
            thresholdsByTerm,
          }),
          this.fetchLexiconEditRows({
            terms: longTerms,
            entityTypes,
            engineId: engineId ?? null,
          }),
        ]);
        rows.forEach((row) => {
          const term = row.term ?? '';
          const bucket = fetchedRowsByTerm.get(term) ?? [];
          bucket.push(row);
          fetchedRowsByTerm.set(term, bucket);
        });
        // Delete-dictionary edit lane merges BEHIND the lattice lanes: an
        // entity already admitted by a stronger lane keeps its row; lexicon
        // rows only add entities the trigram/FTS lanes missed (the
        // transposition class).
        for (const [term, lexRows] of lexiconRowsByTerm) {
          const bucket = fetchedRowsByTerm.get(term) ?? [];
          const present = new Set(bucket.map((r) => r.entityId));
          for (const lexRow of lexRows) {
            if (!present.has(lexRow.entityId)) bucket.push(lexRow);
          }
          // AUDIT C2: RE-RANK THE MERGED SET before the per-term cut. The
          // SQL lane already LIMITed to perTermLimit, so appended lexicon
          // rows previously sat past the slice boundary — on any query with
          // a full trigram page (K=5) the ENTIRE edit lane was unreachable
          // ('vgean' could never reach vegan). One merged set, one order,
          // one cut: same keys as the SQL ORDER BY (exact, prefix, best
          // similarity, score) so the merge cannot invert the lane law.
          // editScore is a first-class signal here (C2 follow-up): without
          // it, edit-lane rows ranked at similarity 0 and always sank below
          // trigram noise — 'camarnes' surfaced carnes-substring meats while
          // the distance-1 camarones rows sat past the cut.
          const strength = (row: (typeof bucket)[number]) =>
            Math.max(
              Number(row.nameSimilarity ?? 0),
              Number(row.aliasSimilarity ?? 0),
              Number(row.editScore ?? 0),
            );
          bucket.sort(
            (a, b) =>
              (b.exactHit ?? 0) - (a.exactHit ?? 0) ||
              b.prefixHit - a.prefixHit ||
              strength(b) - strength(a) ||
              Number(b.publicCraveScore ?? 0) - Number(a.publicCraveScore ?? 0),
          );
          fetchedRowsByTerm.set(term, bucket);
        }
      }

      missingTerms.forEach((term) => {
        const threshold = thresholdsByTerm.get(term) ?? 0;
        const rows = fetchedRowsByTerm.get(term) ?? [];
        const matches: TextSearchMatch[] = rows
          .slice(0, safePerTermLimit)
          .map((row) => {
            const nameSimilarity = Number(row.nameSimilarity ?? 0);
            const aliasSimilarity = Number(row.aliasSimilarity ?? 0);
            const evidence = this.resolveEvidence({
              row,
              similarityThreshold: threshold,
            });
            // Honest per-tier scores: containment carries its COVERAGE (the fake
            // word_similarity 1.0 must not survive into consumer decisions) and
            // edit carries 1 − lev/len.
            const similarity =
              evidence === 'contains'
                ? Number(row.containsCoverage ?? 0)
                : evidence === 'edit'
                  ? Number(row.editScore ?? 0)
                  : Math.max(nameSimilarity, aliasSimilarity);
            return {
              entityId: row.entityId,
              name: row.name,
              type: row.type,
              similarity,
              evidence,
            };
          });

        resultsByTerm.set(term, matches);
        this.setCachedTermResults({
          requestLocale: options.requestLocale ?? null,
          term,
          entityTypes,
          engineId,
          limit: safePerTermLimit,
          results: matches,
        });
      });

      return resultsByTerm;
    } catch (error) {
      this.logger.warn('Entity text search query failed', {
        terms: missingTerms,
        entityTypes,
        perTermLimit: safePerTermLimit,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return resultsByTerm;
    }
  }

  private resolveSimilarityThreshold(term: string): number {
    if (term.length <= 3) return 0.7;
    if (term.length <= 5) return 0.55;
    if (term.length <= 8) return 0.45;
    return 0.35;
  }

  private isAttributeAutocompleteTextMatch(
    term: string,
    match: TextSearchMatch,
  ): boolean {
    if (!this.isAttributeType(match.type)) {
      return false;
    }
    if (match.evidence === 'exact') {
      return true;
    }
    if (match.evidence === 'prefix') {
      return match.similarity >= 0.9;
    }
    if (term.length < 4) {
      return false;
    }
    return (
      (match.evidence === 'name' ||
        match.evidence === 'alias' ||
        match.evidence === 'fuzzy') &&
      match.similarity >= 0.82
    );
  }

  private isAttributeType(entityType: EntityType): boolean {
    return (
      entityType === EntityType.food_attribute ||
      entityType === EntityType.restaurant_attribute
    );
  }

  private normalizeTerm(term: string): string {
    return term.trim().toLowerCase();
  }

  private resolveEvidence(options: {
    row: EntitySearchRow;
    similarityThreshold: number;
  }): TextMatchEvidence {
    const { row, similarityThreshold } = options;
    // exactHit already folds in alias-exact (see fetchFtsTrgmRowsForTerms), so an
    // exact alias match is correctly tiered 'exact' here.
    if ((row.exactHit ?? 0) === 1) return 'exact';
    if (row.prefixHit === 1) return 'prefix';
    // Containment BEFORE 'name': a contained term also FTS-matches, and letting
    // it claim the 'name' tier (with word_similarity's fake 1.0) is exactly how
    // "omakase" produced five indistinguishable perfect-score ties.
    if ((row.containsHit ?? 0) === 1) return 'contains';
    if ((row.nameFtsHit ?? 0) === 1) return 'name';
    const nameSimilarity = Number(row.nameSimilarity ?? 0);
    if (nameSimilarity >= similarityThreshold) return 'fuzzy';
    // Genuine alias evidence (matched via an alias, below the name-fuzzy tier).
    const aliasSimilarity = Number(row.aliasSimilarity ?? 0);
    if (
      aliasSimilarity >= similarityThreshold ||
      (row.aliasTrgmHit ?? 0) === 1
    ) {
      return 'alias';
    }
    // Bounded edit-distance admission gets its own honest tier + score (it used
    // to fall through to 'weak' and feed nothing but junk RRF mass).
    if (row.editScore != null) return 'edit';
    // Below every tier: admitted to recall by a loose lane (levenshtein / word-sim)
    // but under the fuzzy-similarity cut. This 'weak' label is NOT dead — do not
    // remove it or fold it into null. It is load-bearing in three places: (1) the
    // exclusion sentinel the linker/expansion evidence-gates drop; (2) the row stays
    // in the sparse lane so it still contributes its 1/(K+rank) term to RRF fusion —
    // the collection LLM-matcher shortlist ranks by RRF with no evidence gate, so
    // dropping the row would silently reshuffle that shortlist; (3) autocomplete keys
    // on the 'weak' label to DROP the row from type-ahead (EVIDENCE_CONFIDENCE has no
    // 'weak' entry). Keep the honest 'weak' rather than a lie that says 'alias'.
    return 'weak';
  }

  private buildCacheKey(options: {
    term: string;
    entityTypes: EntityType[];
    engineId?: string | null;
    requestLocale?: string | null;
  }): string {
    const entityTypesKey = [...options.entityTypes].sort().join(',');
    // Locale is part of RECALL now (the registry arms are chain-filtered),
    // so it must be part of the key — a locale-less key would serve one
    // language's candidates to another (the AC-P2a class, term-cache side).
    return [
      options.engineId ?? '',
      entityTypesKey,
      localeLookupChain(options.requestLocale ?? null).join(','),
      options.term,
    ].join('::');
  }

  private getCachedTermResults(options: {
    term: string;
    entityTypes: EntityType[];
    engineId?: string | null;
    limit: number;
    requestLocale?: string | null;
  }): TextSearchMatch[] | null {
    const key = this.buildCacheKey(options);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    if (options.limit > entry.limit) {
      return null;
    }
    return entry.results.slice(0, options.limit);
  }

  private setCachedTermResults(options: {
    term: string;
    entityTypes: EntityType[];
    engineId?: string | null;
    limit: number;
    requestLocale?: string | null;
    results: TextSearchMatch[];
  }): void {
    const key = this.buildCacheKey(options);
    this.cache.set(key, {
      expiresAt: Date.now() + this.cacheTtlMs,
      limit: options.limit,
      results: options.results.slice(0, options.limit),
    });

    while (this.cache.size > this.maxCacheEntries) {
      const iterator = this.cache.keys();
      const next = iterator.next();
      if (next.done) break;
      this.cache.delete(next.value);
    }
  }

  private async fetchPrefixRowsForTerms(options: {
    terms: string[];
    entityTypes: EntityType[];
    perTermLimit: number;
    engineId: string | null;
  }): Promise<EntitySearchRow[]> {
    const values = Prisma.join(
      options.terms.map((term, idx) => {
        const prefixPattern = `${term}%`;
        return Prisma.sql`(${term}, ${prefixPattern}, ${idx})`;
      }),
    );
    const entityTypeArray = Prisma.sql`ARRAY[${Prisma.join(
      options.entityTypes.map((type) => Prisma.sql`${type}::entity_type`),
    )}]`;
    const territoryFilter = await this.buildRestaurantEngineTerritoryFilter(
      'e',
      options.engineId,
    );

    return this.prisma.$queryRaw<EntitySearchRow[]>(Prisma.sql`
      SELECT
        v.term AS "term",
        r."entityId",
        r."name",
        r."type",
        r."exactHit",
        r."nameSimilarity",
        r."aliasSimilarity",
        r."ftsRank",
        r."prefixHit",
        r."nameFtsHit",
        r."aliasTrgmHit",
        r."containsHit",
        r."containsCoverage",
        r."editScore",
        r."publicCraveScore",
        r."generalPraiseUpvotes"
      FROM (
        VALUES ${values}
      ) AS v(term, prefix_pattern, term_index)
      CROSS JOIN LATERAL (
        SELECT
          scored."entityId",
          scored."name",
          scored."type",
          scored."exactHit",
          scored."nameSimilarity",
          scored."aliasSimilarity",
          scored."ftsRank",
          scored."prefixHit",
          scored."nameFtsHit",
          scored."aliasTrgmHit",
          scored."containsHit",
          scored."containsCoverage",
          scored."editScore",
          scored."publicCraveScore",
          scored."generalPraiseUpvotes"
        FROM (
          SELECT
            e.entity_id AS "entityId",
            e.name AS "name",
            e.type AS "type",
            CASE WHEN lower(e.name) = v.term THEN 1 ELSE 0 END AS "exactHit",
            -- AUDIT H3: the prefix score is COVERAGE (typed/name length),
            -- not a hardcoded 0.94 that sat above every floor and made the
            -- calibrated prefix floor unable to reject anything ('sal' vs
            -- 'salsa' is now 0.6, honestly below the 0.82 floor). Same
            -- honesty fix the contains tier already received.
            CASE
              WHEN lower(e.name) = v.term THEN 1
              ELSE length(v.term)::real / GREATEST(length(e.name), 1)
            END AS "nameSimilarity",
            0 AS "aliasSimilarity",
            0 AS "ftsRank",
            CASE WHEN lower(e.name) LIKE v.prefix_pattern THEN 1 ELSE 0 END AS "prefixHit",
            0 AS "nameFtsHit",
            0 AS "aliasTrgmHit",
            0 AS "containsHit",
            0::real AS "containsCoverage",
            NULL::real AS "editScore",
            (SELECT pes.display_score FROM core_public_entity_scores pes WHERE pes.subject_id = e.entity_id AND pes.subject_type = 'restaurant'::crave_score_subject_type) AS "publicCraveScore",
            e.general_praise_upvotes AS "generalPraiseUpvotes"
          FROM core_entities e
          WHERE e.type = ANY(${entityTypeArray})
            AND e.status = 'active'::entity_status
            ${territoryFilter}
            AND lower(e.name) LIKE v.prefix_pattern
        ) scored
        ORDER BY
          scored."exactHit" DESC,
          scored."prefixHit" DESC,
          COALESCE(scored."publicCraveScore", 0) DESC,
          COALESCE(scored."generalPraiseUpvotes", 0) DESC,
          scored."name" ASC,
          -- F3802/F1902: "name" is NOT unique (same-name entities exist in a
          -- single-city corpus, and same-name restaurants across cities are
          -- the norm), so without this the perTermLimit cut admitted/dropped
          -- fully-tied entities arbitrarily. entityId is already selected.
          scored."entityId" ASC
        LIMIT ${options.perTermLimit}
      ) r
      ORDER BY v.term_index ASC;
    `);
  }

  /** DELETE-DICTIONARY edit lane (round-5 ideal): one btree probe over the
   *  precomputed deletion variants, then Damerau-Levenshtein verification in
   *  JS on the shortlist. Replaces the per-row levenshtein() seq scan; a
   *  transposition ("vgean"→"vegan") honestly costs 1 here. */
  private async fetchLexiconEditRows(options: {
    terms: string[];
    entityTypes: EntityType[];
    engineId: string | null;
  }): Promise<Map<string, EntitySearchRow[]>> {
    const out = new Map<string, EntitySearchRow[]>();
    const probes = options.terms
      .map((term) => ({ term, budget: editBudgetForLength(term.length) }))
      .filter((p) => p.budget > 0 && p.term.length >= 3 && p.term.length <= 64);
    if (!probes.length) return out;

    const allVariants = new Set<string>();
    const variantsByTerm = new Map<string, Set<string>>();
    for (const probe of probes) {
      const variants = new Set(deletionVariants(probe.term, probe.budget));
      variantsByTerm.set(probe.term, variants);
      for (const v of variants) allVariants.add(v);
    }

    const typeArray = Prisma.sql`ARRAY[${Prisma.join(
      options.entityTypes.map((t) => Prisma.sql`${t}::entity_type`),
    )}]`;
    const territoryFilter = await this.buildRestaurantEngineTerritoryFilter(
      'e',
      options.engineId,
    );
    const rows = await this.prisma.$queryRaw<
      {
        deleteKey: string;
        word: string;
        entityId: string;
        name: string;
        type: EntityType;
      }[]
    >(Prisma.sql`
      SELECT DISTINCT d.delete_key AS "deleteKey", d.word, d.entity_id AS "entityId",
             e.name, e.type
      FROM derived_entity_word_deletes d
      JOIN core_entities e ON e.entity_id = d.entity_id
      WHERE d.delete_key = ANY(${Array.from(allVariants)}::text[])
        AND d.entity_type = ANY(${typeArray})
        AND e.status = 'active'::entity_status
        ${territoryFilter}
    `);

    for (const probe of probes) {
      const variants = variantsByTerm.get(probe.term)!;
      const best = new Map<string, EntitySearchRow>();
      for (const row of rows) {
        if (!variants.has(row.deleteKey)) continue;
        const distance = damerauLevenshtein(probe.term, row.word);
        if (distance > probe.budget || distance === 0) continue;
        const editScore =
          1 - distance / Math.max(probe.term.length, row.word.length);
        const existing = best.get(row.entityId);
        if (!existing || (existing.editScore ?? 0) < editScore) {
          best.set(row.entityId, {
            term: probe.term,
            entityId: row.entityId,
            name: row.name,
            type: row.type,
            editScore,
          } as EntitySearchRow);
        }
      }
      if (best.size) out.set(probe.term, Array.from(best.values()));
    }
    return out;
  }

  private async fetchFtsTrgmRowsForTerms(options: {
    terms: string[];
    entityTypes: EntityType[];
    perTermLimit: number;
    engineId: string | null;
    thresholdsByTerm: Map<string, number>;
    requestLocale?: string | null;
  }): Promise<EntitySearchRow[]> {
    // AC-P1a (final arm): the recall SQL reads the LOCALE-CHAINED REGISTRY,
    // never the unlocalized aliases[] projection. No locale => ['und'], the
    // exact set the array projection carried (superset proven, spec-held),
    // so default-path behavior is unchanged while tagged locales finally
    // reach the fuzzy/FTS arms.
    const chain = localeLookupChain(options.requestLocale ?? null);
    const values = Prisma.join(
      options.terms.map((term, idx) => {
        const prefixPattern = `${term}%`;
        const folded = canonicalFold(term);
        const foldedPrefix = `${folded}%`;
        const similarityThreshold = options.thresholdsByTerm.get(term) ?? 0.35;
        return Prisma.sql`(${term}, ${prefixPattern}, ${folded}, ${foldedPrefix}, ${similarityThreshold}, ${idx})`;
      }),
    );
    const entityTypeArray = Prisma.sql`ARRAY[${Prisma.join(
      options.entityTypes.map((type) => Prisma.sql`${type}::entity_type`),
    )}]`;
    const territoryFilter = await this.buildRestaurantEngineTerritoryFilter(
      'e',
      options.engineId,
    );

    return this.prisma.$queryRaw<EntitySearchRow[]>(Prisma.sql`
      SELECT
        v.term AS "term",
        r."entityId",
        r."name",
        r."type",
        r."exactHit",
        r."nameSimilarity",
        r."aliasSimilarity",
        r."ftsRank",
        r."prefixHit",
        r."nameFtsHit",
        r."aliasTrgmHit",
        r."containsHit",
        r."containsCoverage",
        r."editScore",
        r."publicCraveScore",
        r."generalPraiseUpvotes"
      FROM (
        VALUES ${values}
      ) AS v(term, prefix_pattern, folded_term, folded_prefix, similarity_threshold, term_index)
      CROSS JOIN LATERAL (
        SELECT
          scored."entityId",
          scored."name",
          scored."type",
          scored."exactHit",
          scored."nameSimilarity",
          scored."aliasSimilarity",
          scored."ftsRank",
          scored."prefixHit",
          scored."nameFtsHit",
          scored."aliasTrgmHit",
          scored."containsHit",
          scored."containsCoverage",
          scored."editScore",
          scored."publicCraveScore",
          scored."generalPraiseUpvotes"
        FROM (
          SELECT
            e.entity_id AS "entityId",
            e.name AS "name",
            e.type AS "type",
            CASE
              -- N1 fold symmetry: identity_key IS canonicalFold(name), so
              -- 'despana' exact-hits Despaña here the way search does.
              WHEN lower(e.name) = v.term
                OR e.identity_key = v.folded_term
                OR COALESCE(al.a_exact, 0) = 1
                THEN 1
              ELSE 0
            END AS "exactHit",
            CASE
              WHEN lower(e.name) = v.term THEN 1
              WHEN lower(e.name) LIKE v.prefix_pattern THEN 0.94
              -- Step 6: score by the BEST matching word, not the diluted whole
              -- string. word_similarity('frankln','franklin barbecue')=0.75 where
              -- whole-string similarity is far lower — the typo'd/partial-word fix.
              ELSE GREATEST(
                similarity(lower(e.name), v.term),
                word_similarity(v.term, lower(e.name))
              )
            END AS "nameSimilarity",
            CASE
              WHEN COALESCE(al.a_exact, 0) = 1 THEN 1
              WHEN COALESCE(al.a_prefix, 0) = 1
                -- Honest prefix coverage (H3 law), not a constant.
                THEN length(v.folded_term)::real / NULLIF(al.a_prefix_len, 0)
              ELSE COALESCE(al.a_sim, 0)
            END AS "aliasSimilarity",
            -- FTS ranks the NAME; alias multi-word reachability is carried
            -- by the registry arms (exact/prefix on the full form + whole-
            -- word word_similarity per form) — the haystack tsv conflated
            -- every alias into one document and is retired with the array.
            ts_rank_cd(
              to_tsvector('simple', lower(e.name)),
              websearch_to_tsquery('simple', v.term)
            ) AS "ftsRank",
            CASE
              WHEN lower(e.name) LIKE v.prefix_pattern
                OR e.identity_key LIKE v.folded_prefix
                OR COALESCE(al.a_prefix, 0) = 1
                THEN 1
              ELSE 0
            END AS "prefixHit",
            CASE
              WHEN to_tsvector('simple', lower(e.name)) @@
                websearch_to_tsquery('simple', v.term)
                THEN 1
              ELSE 0
            END AS "nameFtsHit",
            COALESCE(al.a_trgm, 0) AS "aliasTrgmHit",
            -- Whole-word containment (word_similarity = 1 exactly when the term
            -- appears as a whole word inside the longer string), excluding true
            -- exacts — those keep the 'exact' tier.
            CASE
              WHEN lower(e.name) <> v.term
                AND COALESCE(al.a_exact, 0) = 0
                AND (
                  word_similarity(v.term, lower(e.name)) = 1
                  OR COALESCE(al.a_ws1, 0) = 1
                )
                THEN 1
              ELSE 0
            END AS "containsHit",
            -- Honest coverage for containment: how much of the containing string
            -- the term accounts for (1.0 would be an exact match).
            GREATEST(
              CASE WHEN word_similarity(v.term, lower(e.name)) = 1
                THEN length(v.term)::real / NULLIF(length(e.name), 0)
                ELSE 0 END,
              CASE WHEN COALESCE(al.a_ws1, 0) = 1
                -- Coverage against the SHORTEST containing form — the honest
                -- per-form number the one-blob haystack could never give.
                THEN length(v.term)::real / NULLIF(al.a_contain_len, 0)
                ELSE 0 END
            ) AS "containsCoverage",
            -- Edit-distance admission moved to the DELETE-DICTIONARY lane
            -- (round-5 ideal): one btree probe + JS Damerau-Levenshtein —
            -- transpositions reachable, constant in corpus size. The old
            -- per-row levenshtein() subquery was the seq-scan cost center.
            NULL::real AS "editScore",
            (SELECT pes.display_score FROM core_public_entity_scores pes WHERE pes.subject_id = e.entity_id AND pes.subject_type = 'restaurant'::crave_score_subject_type) AS "publicCraveScore",
            e.general_praise_upvotes AS "generalPraiseUpvotes"
          FROM core_entities e
          -- THE REGISTRY LATERAL (AC-P1a): one aggregate over the entity's
          -- locale-chained alias rows supplies every alias-evidence signal.
          -- Per-form scoring, per-form locale — the one-blob haystack (which
          -- diluted similarity across ALL aliases and had no language) dies
          -- here.
          LEFT JOIN LATERAL (
            SELECT
              max((a.form_folded = v.folded_term)::int) AS a_exact,
              max((a.form_folded LIKE v.folded_prefix)::int) AS a_prefix,
              min(length(a.form_folded))
                FILTER (WHERE a.form_folded LIKE v.folded_prefix) AS a_prefix_len,
              max(GREATEST(
                similarity(a.form_folded, v.term),
                word_similarity(v.term, a.form_folded)
              )) AS a_sim,
              max((a.form_folded % v.term)::int) AS a_trgm,
              max((word_similarity(v.term, a.form_folded) = 1
                   AND a.form_folded <> v.folded_term)::int) AS a_ws1,
              min(length(a.form_folded))
                FILTER (WHERE word_similarity(v.term, a.form_folded) = 1
                          AND a.form_folded <> v.folded_term) AS a_contain_len
            FROM entity_surface a
            WHERE a.entity_id = e.entity_id
              AND a.status = 'active'
              AND a.role <> 'display'
              AND LOWER(a.locale) = ANY(${chain}::text[])
          ) al ON true
          WHERE e.type = ANY(${entityTypeArray})
            AND e.status = 'active'::entity_status
            ${territoryFilter}
            AND (
              lower(e.name) LIKE v.prefix_pattern
              OR e.identity_key LIKE v.folded_prefix
              OR to_tsvector('simple', lower(e.name)) @@
                websearch_to_tsquery('simple', v.term)
              OR (
                lower(e.name) % v.term
                AND similarity(lower(e.name), v.term) >= v.similarity_threshold
              )
              -- Step 6: word-level fuzzy admission (best matching word, not the
              -- diluted whole string) — recovers typo'd/partial first words.
              OR word_similarity(v.term, lower(e.name)) >= v.similarity_threshold
              -- Registry arms: exact/prefix/trigram/whole-word over the
              -- entity's own locale-chained forms.
              OR COALESCE(al.a_exact, 0) = 1
              OR COALESCE(al.a_prefix, 0) = 1
              OR (COALESCE(al.a_trgm, 0) = 1 AND al.a_sim >= v.similarity_threshold)
              OR COALESCE(al.a_sim, 0) >= v.similarity_threshold
            )
        ) scored
        ORDER BY
          scored."exactHit" DESC,
          scored."prefixHit" DESC,
          COALESCE(scored."ftsRank", 0) DESC,
          GREATEST(
            COALESCE(scored."nameSimilarity", 0),
            COALESCE(scored."aliasSimilarity", 0)
          ) DESC,
          COALESCE(scored."publicCraveScore", 0) DESC,
          COALESCE(scored."generalPraiseUpvotes", 0) DESC,
          scored."name" ASC,
          -- F3802/F1902: "name" is NOT unique (same-name entities exist in a
          -- single-city corpus, and same-name restaurants across cities are
          -- the norm), so without this the perTermLimit cut admitted/dropped
          -- fully-tied entities arbitrarily. entityId is already selected.
          scored."entityId" ASC
        LIMIT ${options.perTermLimit}
      ) r
      ORDER BY v.term_index ASC;
    `);
  }

  /**
   * Gazetteer scan (Phase 5, no LLM): find every KNOWN entity mention in free text
   * and return its character span. This is a closed-set lookup — it finds only
   * entities already in the graph, by exact normalized name/alias — NOT semantic
   * understanding. Mechanism (the always-fresh "candidate-phrase probe"): tokenize,
   * generate 1..N-word candidate phrases with offsets, then ONE indexed query for
   * entities whose normalized name or alias equals a candidate. Overlapping matches
   * resolve by longest-match (so "breakfast sandwich" wins over "breakfast").
   * Restaurants are engine-territory-scoped when an engineId is given (no
   * covering engine ⇒ global match); foods/attributes are always global.
   */
  /** Query-shape guard (round-2 review): candidates = tokens x 4-grams, so
   *  an unbounded query is a self-inflicted DoS on what is now the
   *  unconditional first step of every search (a 5k-token query measured
   *  3.8s pre-cap). 48 tokens comfortably covers any real search while
   *  bounding the candidate array. */
  private static readonly GAZETTEER_MAX_TOKENS = 48;

  /** Memo for the longest banked surface, in words (5-minute TTL — a
   *  vocabulary sweep that banks a longer surface becomes reachable within
   *  one TTL, and a warm process never pays for the aggregate). */
  private bankedPhraseWords: { value: number; expiresAt: number } | null = null;

  /**
   * How many words the exact-alias scan must be able to assemble: the longest
   * ACTIVE recall surface in the registry, clamped by the analyzer's cost
   * ceiling. Read from the data because that is the only number with meaning
   * — the previous literal 4 made 10.3% of the registry unmatchable, and any
   * new literal would rot the same way the moment a sweep banks a longer name.
   */
  private async resolveBankedSurfacePhraseWords(): Promise<number> {
    const now = Date.now();
    if (this.bankedPhraseWords && this.bankedPhraseWords.expiresAt > now) {
      return this.bankedPhraseWords.value;
    }
    const rows = await this.prisma.$queryRaw<{ words: number | null }[]>(
      Prisma.sql`
        SELECT max(array_length(string_to_array(form_folded, ' '), 1))::int
                 AS "words"
          FROM entity_surface
         WHERE status = 'active' AND role <> 'display'`,
    );
    const value = Math.min(
      Math.max(rows[0]?.words ?? 1, 1),
      NGRAM_MAX_PHRASE_WORDS_CEILING,
    );
    this.bankedPhraseWords = { value, expiresAt: now + 5 * 60 * 1000 };
    return value;
  }

  /**
   * Multi-type gazetteer scan (search rebuild phase 1): every known-entity
   * span with EVERY entity that exact span names — the types come from the
   * data, not from any guess. Longest-span-wins applies to SPANS; type
   * policy belongs to consumers (see scanForKnownEntities for the
   * deterministic single-winner wrapper polls use).
   *
   * Lookup is a UNION of two INDEXED arms (name btree + the
   * crave_text_array_lower(aliases) GIN) — the old single query OR'd the
   * arms, which forced a full seq scan of the active catalogue per search.
   */
  async scanForKnownEntityGroups(
    text: string,
    entityTypes: EntityType[],
    options: {
      engineId?: string | null;
      maxPhraseWords?: number;
      /** BCP 47 request locale — a PRIOR for the analyzer, nothing more. */
      requestLocale?: string | null;
      /** A5: the analyzer runs ONCE PER QUERY. A caller that already
       *  analyzed (the interpreter does, for negation + the dense gate)
       *  passes its analysis in rather than paying for a second one. */
      analysis?: QueryAnalysis;
    } = {},
  ): Promise<EntitySpanGroup[]> {
    const raw = text ?? '';
    if (!raw.trim() || entityTypes.length === 0) return [];

    // N1 FOLD SYMMETRY: both sides of the match are canonicalFold'd. The
    // scan used to compare lowercased RAW tokens against lowercased raw
    // names while identity holds FOLDED keys — 1,714 active entities
    // (Despaña, Phở Hoài, Harry’s-with-curly-apostrophe) were unreachable
    // by their obvious typed form. The analyzer owns the tokenizer (curly
    // apostrophe in the char class) and the fold; this method owns the
    // lookup. Offsets are the analyzer's contract, so spans still slice
    // the RAW query.
    const analysis =
      options.analysis ??
      analyzeQuery(raw, options.requestLocale ?? null, {
        maxTokens: EntityTextSearchService.GAZETTEER_MAX_TOKENS,
      });
    if (!analysis.tokens.length) return [];

    // PHRASE LENGTH COMES FROM THE DATA, not a literal. The scan is an
    // EQUALITY probe against banked surfaces, so the only defensible window is
    // "as long as the longest surface anyone banked" — a shorter one does not
    // park the query, it SHREDS it into parts that ground nonsense (see
    // NGRAM_MAX_PHRASE_WORDS_CEILING). Measured once per process (5-minute
    // TTL) and clamped by the ceiling, which is the cost guard.
    const maxPhraseWords =
      options.maxPhraseWords ?? (await this.resolveBankedSurfacePhraseWords());
    const candidateSpans = new Map<
      string,
      { start: number; end: number; diacritic: string }[]
    >();
    for (const ngram of analysis.ngrams(maxPhraseWords)) {
      const span = {
        start: ngram.start,
        end: ngram.end,
        diacritic: ngram.diacritic,
      };
      const arr = candidateSpans.get(ngram.folded);
      if (arr) arr.push(span);
      else candidateSpans.set(ngram.folded, [span]);
    }
    const candidates = Array.from(candidateSpans.keys());
    if (!candidates.length) return [];

    const typeArray = Prisma.sql`ARRAY[${Prisma.join(
      entityTypes.map((t) => Prisma.sql`${t}::entity_type`),
    )}]`;
    const territoryFilter = await this.buildRestaurantEngineTerritoryFilter(
      'e',
      options.engineId ?? null,
    );
    // THREE INDEXED ARMS, unioned (never OR'd — an OR forces a seq scan of
    // the active catalogue per search):
    //   1. identity_key = folded candidate      (N1 name fold symmetry)
    //   2. LOWER(name)  = candidate             (exact typed name)
    //   3. entity_surface.form_folded, locale-chained (N1 alias fold symmetry)
    // The former arm 4 (the display role) is REMOVED — see the claims-registry
    // note below; labels are display-only and the alias store is the one
    // guarded surface registry.
    // The legacy crave_text_array_lower(aliases) GIN arm was REMOVED here
    // (i18n red team, executed): it was the untyped, UNLOCALED shadow of
    // entity_surface — it re-grounded seeded es forms ('americana') for English
    // requests, the F2 class one arm over. entity_surface is a proven complete
    // superset of that array (0 of 19,297 lowered array forms absent from it,
    // measured), so dropping the arm loses no reachability and collapses the
    // two alias surfaces into one, locale-filtered surface.
    // identity_key IS canonicalFold(name) for every type (identityInsertData);
    // identity_key_sorted is the coarse lemma/dedupe key and is deliberately
    // NOT probed here — grounding is an EQUALITY claim, not a dedupe probe.
    // LOCALE MATCHING — one authority, one primitive. THE LOCALE IS
    // `analysis.requestLocale`, NOT `options.requestLocale`: the interpreter
    // (the production caller) passes only `analysis`, so reading the separate
    // option left `requestBaseLang=''` and the whole tagged-alias + labels
    // path DEAD in prod — 'asiatica'/es grounded nothing (i18n red team,
    // executed). The analyzer already resolved the request locale; it is the
    // single source, and `localeLookupChain` turns it into the RFC-4647
    // ordered match set both this SQL and the display path share (so a row
    // can never ground here yet render its English label). 'und' (universal)
    // is always the chain's tail; a null-locale request => ['und'] only, so
    // tagged rows are excluded — the conservative side F2 established.
    const localeChain = localeLookupChain(analysis.requestLocale);
    const aliasLocaleFilter = Prisma.sql`AND LOWER(ea.locale) = ANY(${localeChain}::text[])`;
    const matchedFormsSelect = Prisma.sql`
             LOWER(e.name) AS "normName",
             e.identity_key AS "foldedName",
             -- The entity's UNTAGGED recall forms, lowered. This is the
             -- retired core_entities.aliases[] projection read at its source:
             -- und + active + role<>'display' is precisely the set that array
             -- contained, so the column swap is byte-for-byte behaviour-
             -- preserving here. Deliberately NOT restricted to the candidate
             -- folds like rawAliases below — this set feeds the DIACRITIC
             -- evidence, where a form that folds differently from the matched
             -- phrase (Harry's vs harrys) can still be the accent-bearing
             -- spelling the admission test needs.
             ARRAY(
               SELECT LOWER(ea.form) FROM entity_surface ea
               WHERE ea.entity_id = e.entity_id
                 AND ea.status = 'active'
                 AND ea.locale = 'und'
                 AND ea.role <> 'display'
             ) AS "normAliases",
             ARRAY(
               SELECT ea.form_folded FROM entity_surface ea
               WHERE ea.entity_id = e.entity_id
                 AND ea.status = 'active'
                 AND ea.role <> 'display'
                 ${aliasLocaleFilter}
                 AND ea.form_folded = ANY(${candidates}::text[])
             ) AS "foldedAliases",
             -- The RAW (accent-bearing) spelling of every surface that
             -- matched on the folded key. The folded key cannot answer "did
             -- the user's accents agree?" — only the raw form can, and the
             -- admission rule (admitsAtExactTier) needs that answer. Unpaired
             -- with foldedAliases ON PURPOSE: equality of the accent-
             -- preserving forms implies equality of their folds, so the flat
             -- SET is exactly as discriminating as pairs would be.
             -- NOTE THE MISSING role-not-display filter: this arm is EVIDENCE OF
             -- SPELLING, not a recall claim. In the live registry the recall
             -- row is routinely the de-diacritized spelling ('banh mi') while
             -- the accented one ('bánh mì') is the entity's DISPLAY row — the
             -- same entity, the same word. Excluding display here made typing
             -- the word properly WORSE than typing it lazily. A display row
             -- still cannot ground anything on its own: the recall arms above
             -- are untouched, and this set only decides whether an already-
             -- matched entity survives the accent test.
             ARRAY(
               SELECT ea.form FROM entity_surface ea
               WHERE ea.entity_id = e.entity_id
                 AND ea.status = 'active'
                 ${aliasLocaleFilter}
                 AND ea.form_folded = ANY(${candidates}::text[])
             ) AS "rawAliases"`;
    const rows = await this.prisma.$queryRaw<
      {
        entityId: string;
        name: string;
        type: EntityType;
        normName: string;
        foldedName: string | null;
        normAliases: string[];
        foldedAliases: string[];
        rawAliases: string[];
      }[]
    >(Prisma.sql`
      SELECT e.entity_id AS "entityId", e.name, e.type,
             ${matchedFormsSelect}
      FROM core_entities e
      WHERE e.status = 'active'::entity_status
        AND e.type = ANY(${typeArray})
        AND e.identity_key = ANY(${candidates}::text[])
        ${territoryFilter}
      UNION
      SELECT e.entity_id AS "entityId", e.name, e.type,
             ${matchedFormsSelect}
      FROM core_entities e
      WHERE e.status = 'active'::entity_status
        AND e.type = ANY(${typeArray})
        AND LOWER(e.name) = ANY(${candidates}::text[])
        ${territoryFilter}
      UNION
      SELECT e.entity_id AS "entityId", e.name, e.type,
             ${matchedFormsSelect}
      FROM core_entities e
      WHERE e.status = 'active'::entity_status
        AND e.type = ANY(${typeArray})
        AND EXISTS (
          SELECT 1 FROM entity_surface ea
          WHERE ea.entity_id = e.entity_id
            AND ea.status = 'active'
            AND ea.role <> 'display'
            ${aliasLocaleFilter}
            AND ea.form_folded = ANY(${candidates}::text[])
        )
        ${territoryFilter}
    `);
    // LANE 4 (labels-as-surfaces) REMOVED (claims registry, §9.9, 2026-08-07):
    // labels are DISPLAY-only again. Every label surface worth grounding was
    // reconciled into entity_surface through the collision guard + word-claim
    // adjudicator (scripts/reconcile-surface-claims.ts, 1,543 surfaces), so
    // the alias store is the ONE claims registry — a surface cannot ground
    // without passing the claim law. The junk-label class (`taco` on a dish
    // named "good taco" grounding at confidence 1.0) is structurally gone.

    const candidateSet = new Set(candidates);
    const rawSpans: Array<{
      start: number;
      end: number;
      text: string;
      entityId: string;
      name: string;
      type: EntityType;
    }> = [];
    for (const row of rows) {
      const matchedPhrases = new Set<string>();
      if (candidateSet.has(row.normName)) matchedPhrases.add(row.normName);
      if (row.foldedName && candidateSet.has(row.foldedName)) {
        matchedPhrases.add(row.foldedName);
      }
      for (const alias of row.normAliases) {
        if (candidateSet.has(alias)) matchedPhrases.add(alias);
      }
      for (const alias of row.foldedAliases) {
        if (candidateSet.has(alias)) matchedPhrases.add(alias);
      }
      // Every accent-bearing spelling this entity can be typed as: its own
      // name, its untagged recall forms, and the raw form of every surface
      // that matched. normAliases is LOWER(form) — lowercasing preserves
      // accents, so it is still raw evidence.
      const diacriticForms = new Set<string>([
        diacriticFold(row.name),
        ...row.normAliases.map((a) => diacriticFold(a)),
        ...row.rawAliases.map((a) => diacriticFold(a)),
      ]);
      for (const phrase of matchedPhrases) {
        for (const span of candidateSpans.get(phrase) ?? []) {
          // DIACRITIC EVIDENCE (see admitsAtExactTier): a span the user typed
          // WITH accents is not exact-matched by a surface that disagrees on
          // them. Skipping leaves the span as residue, where the lower-
          // evidence lanes may still reach it — the tier is what is refused,
          // not the candidate.
          if (
            !admitsAtExactTier(
              { folded: phrase, diacritic: span.diacritic },
              diacriticForms,
            )
          ) {
            continue;
          }
          rawSpans.push({
            start: span.start,
            end: span.end,
            text: raw.slice(span.start, span.end),
            entityId: row.entityId,
            name: row.name,
            type: row.type,
          });
        }
      }
    }

    return groupEntitySpans(rawSpans);
  }

  async scanForKnownEntities(
    text: string,
    entityTypes: EntityType[],
    options: { engineId?: string | null; maxPhraseWords?: number } = {},
  ): Promise<EntitySpan[]> {
    // Single-winner consumer policy (polls highlighting): one entity per
    // span, chosen DETERMINISTICALLY by the caller's own type order + id —
    // the old path let JS sort stability over DB row order decide, which is
    // arbitrary across replicas and vacuums.
    const groups = await this.scanForKnownEntityGroups(
      text,
      entityTypes,
      options,
    );
    return groups.map((group) => {
      const winner = pickSpanWinner(group, entityTypes);
      return {
        start: group.start,
        end: group.end,
        text: group.text,
        entityId: winner.entityId,
        name: winner.name,
        type: winner.type,
      };
    });
  }

  /**
   * §13 GEOMETRIC restaurant scope (markets extermination leg 3 — replaces
   * the core_entity_market_presence read): a restaurant is "in scope" when
   * one of its geocoded LOCATIONS is ground-covered by a member place of the
   * engine's territory (member place ids + places-DAG descendants, §5 derived
   * union — resolved here into an id list, then judged against the ONE
   * place_geometries ground per §2.6). No engine / empty territory ⇒ no
   * filter (identity is global; the scope is only a retrieval prior).
   */
  private async buildRestaurantEngineTerritoryFilter(
    entitySurface: string,
    engineId: string | null,
  ): Promise<Prisma.Sql> {
    const territoryPlaceIds =
      await this.resolveEngineTerritoryPlaceIds(engineId);
    if (!territoryPlaceIds.length) {
      return Prisma.empty;
    }

    const entityReference = Prisma.raw(entitySurface);
    return Prisma.sql`
      AND (
        ${entityReference}.type != 'restaurant'
        OR EXISTS (
          SELECT 1
          FROM core_restaurant_locations rl
          JOIN place_geometries pg
            ON pg.place_id = ANY(${territoryPlaceIds}::uuid[])
           AND ST_Covers(
                 pg.geometry,
                 ST_SetSRID(
                   ST_MakePoint(
                     rl.longitude::double precision,
                     rl.latitude::double precision
                   ),
                   4326
                 )
               )
          WHERE rl.restaurant_id = ${entityReference}.entity_id
            AND rl.latitude IS NOT NULL
            AND rl.longitude IS NOT NULL
        )
      )
    `;
  }

  /** Engine territory = member places + places-DAG descendants (§5: derived
   *  union, never stored) — the walk itself is descendantPlaceIds, THE one
   *  statement of the subtree law (end-state audit 2026-08-01: this method
   *  hand-rolled its own CTE with the `= ANY` join form the place-dag-read
   *  GIN lesson had already condemned — 13–17s seq-scans at country scale).
   *  Cached briefly — batch heads scan many terms per engine. Unknown
   *  engine ⇒ empty (global scope). */
  private async resolveEngineTerritoryPlaceIds(
    engineId: string | null,
  ): Promise<string[]> {
    if (!engineId) {
      return [];
    }
    const cached = this.territoryCache.get(engineId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.placeIds;
    }
    const engine = await this.prisma.engine.findUnique({
      where: { engineId },
      select: { memberPlaceIds: true },
    });
    const placeIds = engine?.memberPlaceIds.length
      ? await descendantPlaceIds(this.prisma, engine.memberPlaceIds)
      : [];
    this.territoryCache.set(engineId, {
      placeIds,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
    return placeIds;
  }
}
