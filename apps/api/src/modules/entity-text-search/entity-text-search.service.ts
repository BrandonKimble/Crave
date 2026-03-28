import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

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

export type TextMatchEvidence = 'name' | 'alias' | 'fuzzy' | 'phonetic';

export interface TextSearchMatch {
  entityId: string;
  name: string;
  type: EntityType;
  similarity: number;
  evidence: TextMatchEvidence;
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
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('EntityTextSearchService');
  }

  async searchEntities(
    term: string,
    entityTypes: EntityType[],
    limit: number,
    options: { locationKey?: string | null } = {},
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
    const normalizedLocationKey =
      typeof options.locationKey === 'string'
        ? options.locationKey.trim().toLowerCase()
        : null;

    const resultsByTerm = await this.searchEntitiesForTerms(
      [normalizedTerm],
      entityTypes,
      safeLimit,
      { locationKey: normalizedLocationKey, allowPhonetic: true },
    );
    return resultsByTerm.get(normalizedTerm) ?? [];
  }

  async searchEntitiesForTerms(
    terms: string[],
    entityTypes: EntityType[],
    perTermLimit: number,
    options: { locationKey?: string | null; allowPhonetic?: boolean } = {},
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
    const normalizedLocationKey =
      typeof options.locationKey === 'string'
        ? options.locationKey.trim().toLowerCase()
        : null;
    const allowPhonetic =
      options.allowPhonetic !== undefined ? options.allowPhonetic : true;

    const missingTerms: string[] = [];
    uniqueTerms.forEach((term) => {
      const cached = this.getCachedTermResults({
        term,
        entityTypes,
        locationKey: normalizedLocationKey,
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
          locationKey: normalizedLocationKey,
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
          locationKey: normalizedLocationKey,
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
          locationKey: normalizedLocationKey,
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
          locationKey: normalizedLocationKey,
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

  private normalizeTerm(term: string): string {
    return term.trim().toLowerCase();
  }

  private resolveEvidence(options: {
    row: EntitySearchRow;
    similarityThreshold: number;
  }): TextMatchEvidence {
    const { row, similarityThreshold } = options;
    if (row.phoneticMatch === 1) return 'phonetic';
    if ((row.exactHit ?? 0) === 1) return 'name';
    if (row.prefixHit === 1) return 'name';
    if ((row.nameFtsHit ?? 0) === 1) return 'name';
    const nameSimilarity = Number(row.nameSimilarity ?? 0);
    if (nameSimilarity >= similarityThreshold) return 'fuzzy';
    return 'alias';
  }

  private buildCacheKey(options: {
    term: string;
    entityTypes: EntityType[];
    locationKey?: string | null;
  }): string {
    const normalizedLocationKey =
      typeof options.locationKey === 'string'
        ? options.locationKey.trim().toLowerCase()
        : '';
    const entityTypesKey = [...options.entityTypes].sort().join(',');
    return `${normalizedLocationKey}::${entityTypesKey}::${options.term}`;
  }

  private getCachedTermResults(options: {
    term: string;
    entityTypes: EntityType[];
    locationKey?: string | null;
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
    locationKey?: string | null;
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
    locationKey: string | null;
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
    const locationFilter = options.locationKey
      ? Prisma.sql`AND (e.type != 'restaurant' OR e.location_key = ${options.locationKey})`
      : Prisma.empty;

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
          0 AS "nameSimilarity",
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
          ${locationFilter}
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
    locationKey: string | null;
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
    const locationFilter = options.locationKey
      ? Prisma.sql`AND (e.type != 'restaurant' OR e.location_key = ${options.locationKey})`
      : Prisma.empty;

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
            CASE WHEN lower(e.name) = v.term THEN 1 ELSE 0 END AS "exactHit",
            similarity(lower(e.name), v.term) AS "nameSimilarity",
            similarity(crave_aliases_haystack_lower(e.aliases), v.term) AS "aliasSimilarity",
            ts_rank_cd(
              crave_entity_search_tsv(e.name::text, e.aliases),
              websearch_to_tsquery('simple', v.term)
            ) AS "ftsRank",
            CASE WHEN lower(e.name) LIKE v.prefix_pattern THEN 1 ELSE 0 END AS "prefixHit",
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
            ${locationFilter}
            AND (
              crave_entity_search_tsv(e.name::text, e.aliases) @@
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
    locationKey: string | null;
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
    const locationFilter = options.locationKey
      ? Prisma.sql`AND (e.type != 'restaurant' OR e.location_key = ${options.locationKey})`
      : Prisma.empty;

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
          ${locationFilter}
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
}
