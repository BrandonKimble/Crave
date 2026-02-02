import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

interface EntitySearchRow {
  entityId: string;
  name: string;
  type: EntityType;
  nameSimilarity: number;
  prefixHit: number;
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
    const normalizedTerm = term.trim().toLowerCase();
    if (
      !normalizedTerm ||
      normalizedTerm.length < this.minPrefixLength ||
      entityTypes.length === 0
    ) {
      return [];
    }

    const safeLimit = Math.max(1, Math.min(limit, 50));
    const containsPattern = `%${normalizedTerm}%`;
    const prefixPattern = `${normalizedTerm}%`;
    const phoneticTerm = normalizedTerm.replace(/[^a-z0-9 ]+/g, ' ');
    const similarityThreshold = this.resolveSimilarityThreshold(normalizedTerm);
    const isShortQuery = normalizedTerm.length <= 2;

    const normalizedLocationKey =
      typeof options.locationKey === 'string'
        ? options.locationKey.trim().toLowerCase()
        : null;

    try {
      const entityTypeArray = Prisma.sql`ARRAY[${Prisma.join(
        entityTypes.map((type) => Prisma.sql`${type}::entity_type`),
      )}]`;
      const locationFilter = normalizedLocationKey
        ? Prisma.sql`AND (e.type != 'restaurant' OR e.location_key = ${normalizedLocationKey})`
        : Prisma.empty;

      const primaryPattern = isShortQuery ? prefixPattern : containsPattern;
      const primaryRows = isShortQuery
        ? await this.prisma.$queryRaw<EntitySearchRow[]>(Prisma.sql`
            SELECT
              e.entity_id AS "entityId",
              e.name AS "name",
              e.type AS "type",
              0 AS "nameSimilarity",
              CASE WHEN lower(e.name) LIKE ${prefixPattern} THEN 1 ELSE 0 END AS "prefixHit",
              0 AS "phoneticMatch",
              e.restaurant_quality_score AS "restaurantQualityScore",
              e.general_praise_upvotes AS "generalPraiseUpvotes"
            FROM core_entities e
            WHERE e.type = ANY(${entityTypeArray})
              ${locationFilter}
              AND lower(e.name) LIKE ${primaryPattern}
            ORDER BY
              CASE WHEN lower(e.name) LIKE ${prefixPattern} THEN 1 ELSE 0 END DESC,
              COALESCE(e.restaurant_quality_score, 0) DESC,
              COALESCE(e.general_praise_upvotes, 0) DESC,
              e.name ASC
            LIMIT ${safeLimit}
          `)
        : await this.prisma.$queryRaw<EntitySearchRow[]>(Prisma.sql`
            SELECT
              e.entity_id AS "entityId",
              e.name AS "name",
              e.type AS "type",
              similarity(lower(e.name), ${normalizedTerm}) AS "nameSimilarity",
              CASE WHEN lower(e.name) LIKE ${prefixPattern} THEN 1 ELSE 0 END AS "prefixHit",
              0 AS "phoneticMatch",
              e.restaurant_quality_score AS "restaurantQualityScore",
              e.general_praise_upvotes AS "generalPraiseUpvotes"
            FROM core_entities e
            WHERE e.type = ANY(${entityTypeArray})
              ${locationFilter}
              AND lower(e.name) LIKE ${primaryPattern}
            ORDER BY
              CASE WHEN lower(e.name) LIKE ${prefixPattern} THEN 1 ELSE 0 END DESC,
              similarity(lower(e.name), ${normalizedTerm}) DESC,
              COALESCE(e.restaurant_quality_score, 0) DESC,
              COALESCE(e.general_praise_upvotes, 0) DESC,
              e.name ASC
            LIMIT ${safeLimit}
          `);

      if (primaryRows.length >= safeLimit || isShortQuery) {
        return primaryRows.map((row) => ({
          entityId: row.entityId,
          name: row.name,
          type: row.type,
          similarity: Number(row.nameSimilarity ?? 0),
          evidence: 'name',
        }));
      }

      const remaining = Math.max(0, safeLimit - primaryRows.length);
      const excludedIds = primaryRows.map(
        (row) => Prisma.sql`${row.entityId}::uuid`,
      );
      const excludeClause = excludedIds.length
        ? Prisma.sql`AND e.entity_id NOT IN (${Prisma.join(excludedIds)})`
        : Prisma.empty;

      // Fallback for aliases/fuzzy/phonetic matches only when needed.
      // Note: use an index-friendly alias expression instead of unnest(aliases) scanning.
      const aliasHaystack = Prisma.sql`crave_aliases_haystack_lower(e.aliases)`;

      const fallbackRows = await this.prisma.$queryRaw<EntitySearchRow[]>(
        Prisma.sql`
          SELECT
            e.entity_id AS "entityId",
            e.name AS "name",
            e.type AS "type",
            similarity(lower(e.name), ${normalizedTerm}) AS "nameSimilarity",
            CASE WHEN lower(e.name) LIKE ${prefixPattern} THEN 1 ELSE 0 END AS "prefixHit",
            CASE
              WHEN dmetaphone(regexp_replace(lower(e.name), '[^a-z0-9 ]', '', 'g')) =
                   dmetaphone(${phoneticTerm}) THEN 1
              ELSE 0
            END AS "phoneticMatch",
            e.restaurant_quality_score AS "restaurantQualityScore",
            e.general_praise_upvotes AS "generalPraiseUpvotes"
          FROM core_entities e
          WHERE e.type = ANY(${entityTypeArray})
            ${locationFilter}
            ${excludeClause}
            AND (
              ${aliasHaystack} LIKE ${containsPattern}
              OR similarity(lower(e.name), ${normalizedTerm}) >= ${similarityThreshold}
              OR dmetaphone(regexp_replace(lower(e.name), '[^a-z0-9 ]', '', 'g')) =
                 dmetaphone(${phoneticTerm})
            )
          ORDER BY
            CASE WHEN lower(e.name) LIKE ${prefixPattern} THEN 1 ELSE 0 END DESC,
            CASE
              WHEN dmetaphone(regexp_replace(lower(e.name), '[^a-z0-9 ]', '', 'g')) =
                   dmetaphone(${phoneticTerm}) THEN 1
              ELSE 0
            END DESC,
            similarity(lower(e.name), ${normalizedTerm}) DESC,
            COALESCE(e.restaurant_quality_score, 0) DESC,
            COALESCE(e.general_praise_upvotes, 0) DESC,
            e.name ASC
          LIMIT ${remaining}
        `,
      );

      const merged: TextSearchMatch[] = primaryRows.map((row) => ({
        entityId: row.entityId,
        name: row.name,
        type: row.type,
        similarity: Number(row.nameSimilarity ?? 0),
        evidence: 'name',
      }));
      const seen = new Set(primaryRows.map((row) => row.entityId));

      fallbackRows.forEach((row) => {
        if (seen.has(row.entityId)) return;
        seen.add(row.entityId);
        const evidence: TextMatchEvidence =
          row.phoneticMatch === 1
            ? 'phonetic'
            : Number(row.nameSimilarity ?? 0) >= similarityThreshold
              ? 'fuzzy'
              : 'alias';
        merged.push({
          entityId: row.entityId,
          name: row.name,
          type: row.type,
          similarity: Number(row.nameSimilarity ?? 0),
          evidence,
        });
      });

      return merged;
    } catch (error) {
      this.logger.warn('Entity text search query failed', {
        term: normalizedTerm,
        entityTypes,
        limit: safeLimit,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return [];
    }
  }

  private resolveSimilarityThreshold(term: string): number {
    if (term.length <= 3) return 0.7;
    if (term.length <= 5) return 0.55;
    if (term.length <= 8) return 0.45;
    return 0.35;
  }
}
