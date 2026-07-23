import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
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
    options: { engineId?: string | null } = {},
  ): Promise<TextSearchMatch[]> {
    const normalizedTerm = term?.trim();
    if (!normalizedTerm || entityTypes.length === 0) return [];

    const queryVec = await this.embeddingService.embedQuery(normalizedTerm);
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
   * Shared recall core (Stage 1). Runs the sparse (lexical) and dense (embedding)
   * lanes in parallel and fuses them by Reciprocal Rank Fusion — `Σ 1/(k+rank)`,
   * k=60. RRF is rank-based, so it is immune to the lexical-score vs cosine scale
   * mismatch and needs NO weights or tuning. This is recall only: it gathers a
   * generous shortlist and orders it roughly; a consumer-specific Stage-2 reranker
   * (autocomplete feature model / resolution + gazetteer LLM-matcher) decides the
   * final order/decision using the per-lane features carried on each candidate.
   */
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
       * gazetteer). 'fallback' — run dense only when the lexical lane under-recalls
       * (< `denseFallbackBelow` hits), so latency-critical autocomplete pays the
       * per-query embedding cost ONLY for the semantic-gap queries that need it.
       * 'none' — skip the dense lane entirely. The query-time linker's decider reads
       * only sparseSimilarity, so dense candidates are never selectable there and the
       * dense call is pure dead cost until a decider can consume dense evidence.
       */
      denseMode?: 'always' | 'fallback' | 'none';
      denseFallbackBelow?: number;
    } = {},
  ): Promise<RecallCandidate[]> {
    const normalizedTerm = term?.trim();
    if (!normalizedTerm || entityTypes.length === 0) return [];

    const pool = Math.max(limit, options.poolSize ?? 50);
    const sparseOpts = { engineId: options.engineId };
    const denseOpts = { engineId: options.engineId };

    const denseMode = options.denseMode ?? 'always';
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
    } else if (denseMode === 'fallback') {
      sparse = await this.searchEntities(
        normalizedTerm,
        entityTypes,
        pool,
        sparseOpts,
      );
      const enough = sparse.length >= (options.denseFallbackBelow ?? limit);
      dense = enough
        ? []
        : await this.searchByEmbedding(
            normalizedTerm,
            entityTypes,
            pool,
            denseOpts,
          );
    } else {
      [sparse, dense] = await Promise.all([
        this.searchEntities(normalizedTerm, entityTypes, pool, sparseOpts),
        this.searchByEmbedding(normalizedTerm, entityTypes, pool, denseOpts),
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
      { engineId: options.engineId },
    );
    return resultsByTerm.get(normalizedTerm) ?? [];
  }

  async searchAttributeAutocompleteEntities(
    term: string,
    entityTypes: EntityType[],
    limit: number,
    options: { engineId?: string | null } = {},
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
    const resultsByTerm = await this.searchEntitiesForTerms(
      [normalizedTerm],
      attributeTypes,
      Math.min(safeLimit * 4, this.maxLimit),
      { engineId: options.engineId },
    );

    return (resultsByTerm.get(normalizedTerm) ?? [])
      .filter((match) =>
        this.isAttributeAutocompleteTextMatch(normalizedTerm, match),
      )
      .slice(0, safeLimit);
  }

  async searchEntitiesForTerms(
    terms: string[],
    entityTypes: EntityType[],
    perTermLimit: number,
    options: {
      engineId?: string | null;
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
        const rows = await this.fetchFtsTrgmRowsForTerms({
          terms: longTerms,
          entityTypes,
          perTermLimit: safePerTermLimit,
          engineId,
          thresholdsByTerm,
        });
        rows.forEach((row) => {
          const term = row.term ?? '';
          const bucket = fetchedRowsByTerm.get(term) ?? [];
          bucket.push(row);
          fetchedRowsByTerm.set(term, bucket);
        });
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
  }): string {
    const entityTypesKey = [...options.entityTypes].sort().join(',');
    return [options.engineId ?? '', entityTypesKey, options.term].join('::');
  }

  private getCachedTermResults(options: {
    term: string;
    entityTypes: EntityType[];
    engineId?: string | null;
    limit: number;
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
            CASE
              WHEN lower(e.name) = v.term THEN 1
              WHEN length(v.term) <= 2 THEN 0.9
              ELSE 0.94
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
          scored."name" ASC
        LIMIT ${options.perTermLimit}
      ) r
      ORDER BY v.term_index ASC;
    `);
  }

  private async fetchFtsTrgmRowsForTerms(options: {
    terms: string[];
    entityTypes: EntityType[];
    perTermLimit: number;
    engineId: string | null;
    thresholdsByTerm: Map<string, number>;
  }): Promise<EntitySearchRow[]> {
    const values = Prisma.join(
      options.terms.map((term, idx) => {
        const prefixPattern = `${term}%`;
        const similarityThreshold = options.thresholdsByTerm.get(term) ?? 0.35;
        // Step 6: length-banded edit budget (ES-AUTO(3,6) seed; swept later) —
        // 0 edits for very short terms, 1 for mid, 2 for long.
        const editBudget = term.length <= 2 ? 0 : term.length <= 5 ? 1 : 2;
        return Prisma.sql`(${term}, ${prefixPattern}, ${similarityThreshold}, ${editBudget}, ${idx})`;
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
      ) AS v(term, prefix_pattern, similarity_threshold, edit_budget, term_index)
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
              WHEN lower(e.name) = v.term
                OR EXISTS (
                  SELECT 1
                  FROM unnest(e.aliases) AS alias_value
                  WHERE lower(alias_value) = v.term
                )
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
              WHEN EXISTS (
                SELECT 1
                FROM unnest(e.aliases) AS alias_value
                WHERE lower(alias_value) = v.term
              )
                THEN 1
              WHEN EXISTS (
                SELECT 1
                FROM unnest(e.aliases) AS alias_value
                WHERE lower(alias_value) LIKE v.prefix_pattern
              )
                THEN 0.94
              ELSE GREATEST(
                similarity(crave_aliases_haystack_lower(e.aliases), v.term),
                word_similarity(v.term, crave_aliases_haystack_lower(e.aliases))
              )
            END AS "aliasSimilarity",
            ts_rank_cd(
              crave_entity_search_tsv(e.name::text, e.aliases),
              websearch_to_tsquery('simple', v.term)
            ) AS "ftsRank",
            CASE
              WHEN lower(e.name) LIKE v.prefix_pattern
                OR EXISTS (
                  SELECT 1
                  FROM unnest(e.aliases) AS alias_value
                  WHERE lower(alias_value) LIKE v.prefix_pattern
                )
                THEN 1
              ELSE 0
            END AS "prefixHit",
            CASE
              WHEN to_tsvector('simple', lower(e.name)) @@
                websearch_to_tsquery('simple', v.term)
                THEN 1
              ELSE 0
            END AS "nameFtsHit",
            CASE WHEN crave_aliases_haystack_lower(e.aliases) % v.term THEN 1 ELSE 0 END AS "aliasTrgmHit",
            -- Whole-word containment (word_similarity = 1 exactly when the term
            -- appears as a whole word inside the longer string), excluding true
            -- exacts — those keep the 'exact' tier.
            CASE
              WHEN lower(e.name) <> v.term
                AND NOT EXISTS (
                  SELECT 1 FROM unnest(e.aliases) AS alias_value
                  WHERE lower(alias_value) = v.term
                )
                AND (
                  word_similarity(v.term, lower(e.name)) = 1
                  OR word_similarity(v.term, crave_aliases_haystack_lower(e.aliases)) = 1
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
              CASE WHEN word_similarity(v.term, crave_aliases_haystack_lower(e.aliases)) = 1
                THEN length(v.term)::real / NULLIF(length(crave_aliases_haystack_lower(e.aliases)), 0)
                ELSE 0 END
            ) AS "containsCoverage",
            -- Best per-word edit score within budget ("piza"→"pizza" = 0.8);
            -- NULL when no word qualifies.
            (
              SELECT MAX(1.0 - levenshtein(w, v.term)::real / GREATEST(length(w), length(v.term)))
              FROM unnest(string_to_array(lower(e.name), ' ')) AS w
              WHERE length(w) > 0
                AND abs(length(w) - length(v.term)) <= v.edit_budget
                AND levenshtein(w, v.term) <= v.edit_budget
            ) AS "editScore",
            (SELECT pes.display_score FROM core_public_entity_scores pes WHERE pes.subject_id = e.entity_id AND pes.subject_type = 'restaurant'::crave_score_subject_type) AS "publicCraveScore",
            e.general_praise_upvotes AS "generalPraiseUpvotes"
          FROM core_entities e
          WHERE e.type = ANY(${entityTypeArray})
            AND e.status = 'active'::entity_status
            ${territoryFilter}
            AND (
              lower(e.name) LIKE v.prefix_pattern
              OR EXISTS (
                SELECT 1
                FROM unnest(e.aliases) AS alias_value
                WHERE lower(alias_value) LIKE v.prefix_pattern
              )
              OR crave_entity_search_tsv(e.name::text, e.aliases) @@
                websearch_to_tsquery('simple', v.term)
              OR (
                lower(e.name) % v.term
                AND similarity(lower(e.name), v.term) >= v.similarity_threshold
              )
              OR (
                crave_aliases_haystack_lower(e.aliases) % v.term
                AND similarity(crave_aliases_haystack_lower(e.aliases), v.term) >= v.similarity_threshold
              )
              -- Step 6: word-level fuzzy admission (best matching word, not the
              -- diluted whole string) — recovers typo'd/partial first words.
              OR word_similarity(v.term, lower(e.name)) >= v.similarity_threshold
              OR word_similarity(v.term, crave_aliases_haystack_lower(e.aliases)) >= v.similarity_threshold
              -- Step 6: bounded per-token edit distance — the short-typo class
              -- trigram misses ("frankln"→"franklin"). Length-windowed so a word
              -- too different in length can't match; budget is length-banded.
              OR EXISTS (
                SELECT 1
                FROM unnest(string_to_array(lower(e.name), ' ')) AS w
                WHERE length(w) > 0
                  AND abs(length(w) - length(v.term)) <= v.edit_budget
                  AND levenshtein(w, v.term) <= v.edit_budget
              )
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
          scored."name" ASC
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
  async scanForKnownEntities(
    text: string,
    entityTypes: EntityType[],
    options: { engineId?: string | null; maxPhraseWords?: number } = {},
  ): Promise<EntitySpan[]> {
    const raw = text ?? '';
    if (!raw.trim() || entityTypes.length === 0) return [];

    const tokens: { text: string; start: number; end: number }[] = [];
    const tokenRe = /[\p{L}\p{N}][\p{L}\p{N}'&.-]*/gu;
    let match: RegExpExecArray | null;
    while ((match = tokenRe.exec(raw)) !== null) {
      tokens.push({
        text: match[0],
        start: match.index,
        end: match.index + match[0].length,
      });
    }
    if (!tokens.length) return [];

    const maxN = Math.max(1, Math.min(options.maxPhraseWords ?? 4, 5));
    const candidateSpans = new Map<string, { start: number; end: number }[]>();
    for (let i = 0; i < tokens.length; i++) {
      for (let n = 1; n <= maxN && i + n <= tokens.length; n++) {
        const slice = tokens.slice(i, i + n);
        const norm = slice.map((t) => t.text.toLowerCase()).join(' ');
        const span = { start: slice[0].start, end: slice[n - 1].end };
        const arr = candidateSpans.get(norm);
        if (arr) arr.push(span);
        else candidateSpans.set(norm, [span]);
      }
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
    const rows = await this.prisma.$queryRaw<
      {
        entityId: string;
        name: string;
        type: EntityType;
        normName: string;
        normAliases: string[];
      }[]
    >(Prisma.sql`
      SELECT e.entity_id AS "entityId", e.name, e.type,
             LOWER(e.name) AS "normName",
             ARRAY(SELECT LOWER(a) FROM unnest(e.aliases) a) AS "normAliases"
      FROM core_entities e
      WHERE e.status = 'active'::entity_status
        AND e.type = ANY(${typeArray})
        AND (
          LOWER(e.name) = ANY(${candidates}::text[])
          OR EXISTS (
            SELECT 1 FROM unnest(e.aliases) a
            WHERE LOWER(a) = ANY(${candidates}::text[])
          )
        )
        ${territoryFilter}
    `);

    const candidateSet = new Set(candidates);
    const rawSpans: EntitySpan[] = [];
    for (const row of rows) {
      const matchedPhrases = new Set<string>();
      if (candidateSet.has(row.normName)) matchedPhrases.add(row.normName);
      for (const alias of row.normAliases) {
        if (candidateSet.has(alias)) matchedPhrases.add(alias);
      }
      for (const phrase of matchedPhrases) {
        for (const span of candidateSpans.get(phrase) ?? []) {
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

    // Longest-match, non-overlapping greedy (drops sub-phrases + same-span dupes).
    rawSpans.sort(
      (a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start,
    );
    const accepted: EntitySpan[] = [];
    for (const span of rawSpans) {
      const overlaps = accepted.some(
        (a) => span.start < a.end && span.end > a.start,
      );
      if (!overlaps) accepted.push(span);
    }
    accepted.sort((a, b) => a.start - b.start);
    return accepted;
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
    entityAlias: string,
    engineId: string | null,
  ): Promise<Prisma.Sql> {
    const territoryPlaceIds =
      await this.resolveEngineTerritoryPlaceIds(engineId);
    if (!territoryPlaceIds.length) {
      return Prisma.empty;
    }

    const entityReference = Prisma.raw(entityAlias);
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
   *  union, never stored). Cached briefly — batch heads scan many terms per
   *  engine. Unknown engine ⇒ empty (global scope). */
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
    const rows = await this.prisma.$queryRaw<Array<{ place_id: string }>>`
      WITH RECURSIVE territory AS (
        SELECT unnest(e.member_place_ids) AS place_id
        FROM engines e
        WHERE e.engine_id = ${engineId}::uuid
        UNION
        SELECT p.place_id FROM places p
        JOIN territory t ON t.place_id = ANY(p.parent_place_ids)
      )
      SELECT place_id FROM territory
    `;
    const placeIds = rows.map((row) => row.place_id);
    this.territoryCache.set(engineId, {
      placeIds,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
    return placeIds;
  }
}
