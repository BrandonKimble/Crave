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
  phoneticMatch: number;
  restaurantQualityScore: Prisma.Decimal | null;
  generalPraiseUpvotes: number | null;
}

export type TextMatchEvidence =
  | 'exact'
  | 'prefix'
  | 'name'
  | 'alias'
  | 'fuzzy'
  | 'phonetic'
  | 'embedding';

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

@Injectable()
export class EntityTextSearchService {
  private readonly logger: LoggerService;
  private readonly minPrefixLength = 1;
  private readonly maxLimit = 50;
  private readonly cacheTtlMs = 30_000;
  private readonly maxCacheEntries = 2_000;
  private readonly phoneticMinTermLength = 4;
  private readonly phoneticLowResultThreshold = 5;
  private readonly cache = new Map<
    string,
    { expiresAt: number; limit: number; results: TextSearchMatch[] }
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
    options: { marketKey?: string | null } = {},
  ): Promise<TextSearchMatch[]> {
    const normalizedTerm = term?.trim();
    if (!normalizedTerm || entityTypes.length === 0) return [];

    const [queryVec] = await this.embeddingService.embed(
      [normalizedTerm],
      'RETRIEVAL_QUERY',
    );
    if (!queryVec?.length) return [];

    const safeLimit = Math.max(1, Math.min(limit, this.maxLimit));
    const literal = `[${queryVec.join(',')}]`;
    const typeArray = Prisma.sql`ARRAY[${Prisma.join(
      entityTypes.map((t) => Prisma.sql`${t}::entity_type`),
    )}]`;
    const marketKey =
      typeof options.marketKey === 'string'
        ? options.marketKey.trim().toLowerCase()
        : null;
    const marketFilter = this.buildRestaurantMarketFilter('e', marketKey);

    const rows = await this.prisma.$queryRaw<
      { entityId: string; name: string; type: EntityType; cosine: number }[]
    >(Prisma.sql`
      SELECT e.entity_id AS "entityId", e.name, e.type,
             1 - (e.name_embedding <=> ${literal}::vector) AS cosine
      FROM core_entities e
      WHERE e.type = ANY(${typeArray})
        AND e.status = 'active'::entity_status
        AND e.name_embedding IS NOT NULL
        ${marketFilter}
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
      marketKey?: string | null;
      poolSize?: number;
      allowPhonetic?: boolean;
    } = {},
  ): Promise<RecallCandidate[]> {
    const normalizedTerm = term?.trim();
    if (!normalizedTerm || entityTypes.length === 0) return [];

    const pool = Math.max(limit, options.poolSize ?? 50);
    const [sparse, dense] = await Promise.all([
      this.searchEntities(normalizedTerm, entityTypes, pool, {
        marketKey: options.marketKey,
        allowPhonetic: options.allowPhonetic ?? true,
      }),
      this.searchByEmbedding(normalizedTerm, entityTypes, pool, {
        marketKey: options.marketKey,
      }),
    ]);

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
    options: { marketKey?: string | null; allowPhonetic?: boolean } = {},
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
    const normalizedMarketKey =
      typeof options.marketKey === 'string'
        ? options.marketKey.trim().toLowerCase()
        : null;

    const resultsByTerm = await this.searchEntitiesForTerms(
      [normalizedTerm],
      entityTypes,
      safeLimit,
      {
        marketKey: normalizedMarketKey,
        allowPhonetic:
          options.allowPhonetic !== undefined ? options.allowPhonetic : true,
      },
    );
    return resultsByTerm.get(normalizedTerm) ?? [];
  }

  async searchAttributeAutocompleteEntities(
    term: string,
    entityTypes: EntityType[],
    limit: number,
    options: { marketKey?: string | null } = {},
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
    const normalizedMarketKey =
      typeof options.marketKey === 'string'
        ? options.marketKey.trim().toLowerCase()
        : null;
    const resultsByTerm = await this.searchEntitiesForTerms(
      [normalizedTerm],
      attributeTypes,
      Math.min(safeLimit * 4, this.maxLimit),
      { marketKey: normalizedMarketKey, allowPhonetic: false },
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
    options: { marketKey?: string | null; allowPhonetic?: boolean } = {},
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
    const normalizedMarketKey =
      typeof options.marketKey === 'string'
        ? options.marketKey.trim().toLowerCase()
        : null;
    const allowPhonetic =
      options.allowPhonetic !== undefined ? options.allowPhonetic : true;

    const missingTerms: string[] = [];
    uniqueTerms.forEach((term) => {
      const cached = this.getCachedTermResults({
        term,
        entityTypes,
        marketKey: normalizedMarketKey,
        allowPhonetic,
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
          marketKey: normalizedMarketKey,
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
          marketKey: normalizedMarketKey,
          thresholdsByTerm,
        });
        rows.forEach((row) => {
          const term = row.term ?? '';
          const bucket = fetchedRowsByTerm.get(term) ?? [];
          bucket.push(row);
          fetchedRowsByTerm.set(term, bucket);
        });
      }

      const phoneticTerms: {
        term: string;
        phonetic: string;
        excludedIds: string[];
        remaining: number;
      }[] = [];
      if (allowPhonetic) {
        missingTerms.forEach((term) => {
          if (term.length < this.phoneticMinTermLength) return;
          if (term.includes(' ')) return;
          const currentRows = fetchedRowsByTerm.get(term) ?? [];
          if (
            currentRows.length >= safePerTermLimit ||
            currentRows.length >= this.phoneticLowResultThreshold
          ) {
            return;
          }
          const remaining = Math.max(0, safePerTermLimit - currentRows.length);
          if (remaining === 0) return;
          phoneticTerms.push({
            term,
            phonetic: term.replace(/[^a-z0-9 ]+/g, ' '),
            excludedIds: currentRows.map((row) => row.entityId),
            remaining,
          });
        });
      }

      if (phoneticTerms.length > 0) {
        const phoneticRows = await this.fetchPhoneticRowsForTerms({
          terms: phoneticTerms,
          entityTypes,
          marketKey: normalizedMarketKey,
        });
        phoneticRows.forEach((row) => {
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
            const similarity = Math.max(nameSimilarity, aliasSimilarity);
            const evidence = this.resolveEvidence({
              row,
              similarityThreshold: threshold,
            });
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
          marketKey: normalizedMarketKey,
          allowPhonetic,
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
    if (match.evidence === 'phonetic') {
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
    if ((row.exactHit ?? 0) === 1) return 'exact';
    if (row.prefixHit === 1) return 'prefix';
    if ((row.nameFtsHit ?? 0) === 1) return 'name';
    if (row.phoneticMatch === 1) return 'phonetic';
    const nameSimilarity = Number(row.nameSimilarity ?? 0);
    if (nameSimilarity >= similarityThreshold) return 'fuzzy';
    return 'alias';
  }

  private buildCacheKey(options: {
    term: string;
    entityTypes: EntityType[];
    marketKey?: string | null;
    allowPhonetic: boolean;
  }): string {
    const normalizedMarketKey =
      typeof options.marketKey === 'string'
        ? options.marketKey.trim().toLowerCase()
        : '';
    const entityTypesKey = [...options.entityTypes].sort().join(',');
    const phoneticKey = options.allowPhonetic ? 'phonetic:on' : 'phonetic:off';
    return [
      normalizedMarketKey,
      entityTypesKey,
      phoneticKey,
      options.term,
    ].join('::');
  }

  private getCachedTermResults(options: {
    term: string;
    entityTypes: EntityType[];
    marketKey?: string | null;
    allowPhonetic: boolean;
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
    marketKey?: string | null;
    allowPhonetic: boolean;
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
    marketKey: string | null;
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
    const marketFilter = this.buildRestaurantMarketFilter(
      'e',
      options.marketKey,
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
        r."phoneticMatch",
        r."restaurantQualityScore",
        r."generalPraiseUpvotes"
      FROM (
        VALUES ${values}
      ) AS v(term, prefix_pattern, term_index)
      CROSS JOIN LATERAL (
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
          0 AS "phoneticMatch",
          e.restaurant_quality_score AS "restaurantQualityScore",
          e.general_praise_upvotes AS "generalPraiseUpvotes"
        FROM core_entities e
        WHERE e.type = ANY(${entityTypeArray})
          AND e.status = 'active'::entity_status
          ${marketFilter}
          AND lower(e.name) LIKE v.prefix_pattern
        ORDER BY
          CASE WHEN lower(e.name) = v.term THEN 1 ELSE 0 END DESC,
          CASE WHEN lower(e.name) LIKE v.prefix_pattern THEN 1 ELSE 0 END DESC,
          COALESCE(e.restaurant_quality_score, 0) DESC,
          COALESCE(e.general_praise_upvotes, 0) DESC,
          e.name ASC
        LIMIT ${options.perTermLimit}
      ) r
      ORDER BY v.term_index ASC;
    `);
  }

  private async fetchFtsTrgmRowsForTerms(options: {
    terms: string[];
    entityTypes: EntityType[];
    perTermLimit: number;
    marketKey: string | null;
    thresholdsByTerm: Map<string, number>;
  }): Promise<EntitySearchRow[]> {
    const values = Prisma.join(
      options.terms.map((term, idx) => {
        const prefixPattern = `${term}%`;
        const similarityThreshold = options.thresholdsByTerm.get(term) ?? 0.35;
        return Prisma.sql`(${term}, ${prefixPattern}, ${similarityThreshold}, ${idx})`;
      }),
    );
    const entityTypeArray = Prisma.sql`ARRAY[${Prisma.join(
      options.entityTypes.map((type) => Prisma.sql`${type}::entity_type`),
    )}]`;
    const marketFilter = this.buildRestaurantMarketFilter(
      'e',
      options.marketKey,
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
        r."phoneticMatch",
        r."restaurantQualityScore",
        r."generalPraiseUpvotes"
      FROM (
        VALUES ${values}
      ) AS v(term, prefix_pattern, similarity_threshold, term_index)
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
          scored."phoneticMatch",
          scored."restaurantQualityScore",
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
              ELSE similarity(lower(e.name), v.term)
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
              ELSE similarity(crave_aliases_haystack_lower(e.aliases), v.term)
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
            0 AS "phoneticMatch",
            e.restaurant_quality_score AS "restaurantQualityScore",
            e.general_praise_upvotes AS "generalPraiseUpvotes"
          FROM core_entities e
          WHERE e.type = ANY(${entityTypeArray})
            AND e.status = 'active'::entity_status
            ${marketFilter}
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
          COALESCE(scored."restaurantQualityScore", 0) DESC,
          COALESCE(scored."generalPraiseUpvotes", 0) DESC,
          scored."name" ASC
        LIMIT ${options.perTermLimit}
      ) r
      ORDER BY v.term_index ASC;
    `);
  }

  private async fetchPhoneticRowsForTerms(options: {
    terms: {
      term: string;
      phonetic: string;
      excludedIds: string[];
      remaining: number;
    }[];
    entityTypes: EntityType[];
    marketKey: string | null;
  }): Promise<EntitySearchRow[]> {
    const values = Prisma.join(
      options.terms.map((entry, idx) => {
        const excludedIds =
          entry.excludedIds.length > 0
            ? Prisma.sql`ARRAY[${Prisma.join(
                entry.excludedIds.map((id) => Prisma.sql`${id}::uuid`),
              )}]::uuid[]`
            : Prisma.sql`'{}'::uuid[]`;
        return Prisma.sql`(${entry.term}, ${entry.phonetic}, ${excludedIds}, ${entry.remaining}, ${idx})`;
      }),
    );
    const entityTypeArray = Prisma.sql`ARRAY[${Prisma.join(
      options.entityTypes.map((type) => Prisma.sql`${type}::entity_type`),
    )}]`;
    const marketFilter = this.buildRestaurantMarketFilter(
      'e',
      options.marketKey,
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
        r."phoneticMatch",
        r."restaurantQualityScore",
        r."generalPraiseUpvotes"
      FROM (
        VALUES ${values}
      ) AS v(term, phonetic_term, excluded_ids, remaining_limit, term_index)
      CROSS JOIN LATERAL (
        SELECT
          e.entity_id AS "entityId",
          e.name AS "name",
          e.type AS "type",
          CASE WHEN lower(e.name) = v.term THEN 1 ELSE 0 END AS "exactHit",
          similarity(lower(e.name), v.term) AS "nameSimilarity",
          0 AS "aliasSimilarity",
          0 AS "ftsRank",
          0 AS "prefixHit",
          0 AS "nameFtsHit",
          0 AS "aliasTrgmHit",
          1 AS "phoneticMatch",
          e.restaurant_quality_score AS "restaurantQualityScore",
          e.general_praise_upvotes AS "generalPraiseUpvotes"
        FROM core_entities e
        WHERE e.type = ANY(${entityTypeArray})
          AND e.status = 'active'::entity_status
          ${marketFilter}
          AND (array_length(v.excluded_ids, 1) IS NULL OR e.entity_id <> ALL(v.excluded_ids))
          AND dmetaphone(regexp_replace(lower(e.name), '[^a-z0-9 ]', '', 'g')) =
            dmetaphone(v.phonetic_term)
        ORDER BY
          COALESCE(e.restaurant_quality_score, 0) DESC,
          COALESCE(e.general_praise_upvotes, 0) DESC,
          e.name ASC
        LIMIT v.remaining_limit
      ) r
      ORDER BY v.term_index ASC;
    `);
  }

  private buildRestaurantMarketFilter(
    entityAlias: string,
    marketKey: string | null,
  ): Prisma.Sql {
    if (!marketKey) {
      return Prisma.empty;
    }

    const entityReference = Prisma.raw(entityAlias);
    return Prisma.sql`
      AND (
        ${entityReference}.type != 'restaurant'
        OR EXISTS (
          SELECT 1
          FROM core_entity_market_presence emp
          WHERE emp.entity_id = ${entityReference}.entity_id
            AND LOWER(emp.market_key) = LOWER(${marketKey})
        )
      )
    `;
  }
}
