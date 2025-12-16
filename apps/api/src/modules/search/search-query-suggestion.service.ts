import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

interface QuerySuggestionRow {
  query: string;
  queryKey: string;
  usage: number;
  lastUsed: Date;
}

export type QuerySuggestionSource = 'personal' | 'global';

export interface QuerySuggestion {
  text: string;
  globalCount: number;
  userCount: number;
  source: QuerySuggestionSource;
}

@Injectable()
export class SearchQuerySuggestionService {
  private readonly logger: LoggerService;
  private readonly minPrefixLength = 2;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchQuerySuggestionService');
  }

  async getSuggestions(
    prefix: string,
    limit: number,
    userId?: string,
  ): Promise<QuerySuggestion[]> {
    const trimmed = prefix.trim().toLowerCase();
    if (!trimmed || trimmed.length < this.minPrefixLength) {
      return [];
    }

    const safeLimit = Math.max(1, Math.min(limit, 10));
    const likePattern = `${trimmed}%`;
    const dedupedKeys: string[] = [];
    const suggestionTextByKey = new Map<string, string>();

    try {
      if (userId) {
        const userUuid = Prisma.sql`${userId}::uuid`;
        const personalRows = await this.prisma.$queryRaw<QuerySuggestionRow[]>(
          Prisma.sql`
            SELECT
              (ARRAY_AGG(query_text ORDER BY logged_at DESC))[1] AS "query",
              LOWER(query_text) AS "queryKey",
              COUNT(DISTINCT COALESCE(search_request_id, log_id))::int AS "usage",
              MAX(logged_at) AS "lastUsed"
            FROM search_log
            WHERE user_id = ${userUuid}
              AND source = 'search'
              AND query_text IS NOT NULL
              AND LOWER(query_text) LIKE ${likePattern}
            GROUP BY LOWER(query_text)
            ORDER BY MAX(logged_at) DESC, COUNT(DISTINCT COALESCE(search_request_id, log_id)) DESC
            LIMIT ${safeLimit}
          `,
        );
        for (const row of personalRows) {
          const value = row.query?.trim();
          const key = row.queryKey?.trim();
          if (!value || !key) continue;
          if (suggestionTextByKey.has(key)) continue;
          suggestionTextByKey.set(key, value);
          dedupedKeys.push(key);
          if (dedupedKeys.length >= safeLimit) {
            break;
          }
        }
      }

      const remaining = safeLimit - dedupedKeys.length;
      if (remaining <= 0) {
        return await this.hydrateCounts(
          dedupedKeys,
          suggestionTextByKey,
          userId,
        );
      }

      const globalRows = await this.prisma.$queryRaw<QuerySuggestionRow[]>(
        Prisma.sql`
          SELECT
            (ARRAY_AGG(query_text ORDER BY logged_at DESC))[1] AS "query",
            LOWER(query_text) AS "queryKey",
            COUNT(DISTINCT COALESCE(search_request_id, log_id))::int AS "usage",
            MAX(logged_at) AS "lastUsed"
          FROM search_log
          WHERE source = 'search'
            AND query_text IS NOT NULL
            AND LOWER(query_text) LIKE ${likePattern}
          GROUP BY LOWER(query_text)
          ORDER BY COUNT(DISTINCT COALESCE(search_request_id, log_id)) DESC, MAX(logged_at) DESC
          LIMIT ${remaining * 2}
        `,
      );

      for (const row of globalRows) {
        const value = row.query?.trim();
        const key = row.queryKey?.trim();
        if (!value || !key) continue;
        if (suggestionTextByKey.has(key)) continue;
        suggestionTextByKey.set(key, value);
        dedupedKeys.push(key);
        if (dedupedKeys.length >= safeLimit) break;
      }

      return await this.hydrateCounts(
        dedupedKeys.slice(0, safeLimit),
        suggestionTextByKey,
        userId,
      );
    } catch (error) {
      this.logger.warn('Failed to load query suggestions', {
        prefix,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return [];
    }
  }

  private async hydrateCounts(
    keys: string[],
    suggestionTextByKey: Map<string, string>,
    userId?: string,
  ): Promise<QuerySuggestion[]> {
    if (keys.length === 0) {
      return [];
    }

    const keySql = Prisma.join(keys.map((key) => Prisma.sql`${key}`));

    const globalRows = await this.prisma.$queryRaw<
      Array<{ queryKey: string; usage: number }>
    >(
      Prisma.sql`
        SELECT LOWER(query_text) AS "queryKey",
               COUNT(DISTINCT COALESCE(search_request_id, log_id))::int AS "usage"
        FROM search_log
        WHERE source = 'search'
          AND query_text IS NOT NULL
          AND LOWER(query_text) IN (${keySql})
        GROUP BY LOWER(query_text)
      `,
    );

    const globalCountByKey = new Map(
      globalRows.map((row) => [row.queryKey, row.usage]),
    );

    let userCountByKey = new Map<string, number>();
    if (userId) {
      const userUuid = Prisma.sql`${userId}::uuid`;
      const userRows = await this.prisma.$queryRaw<
        Array<{ queryKey: string; usage: number }>
      >(
        Prisma.sql`
          SELECT LOWER(query_text) AS "queryKey",
                 COUNT(DISTINCT COALESCE(search_request_id, log_id))::int AS "usage"
          FROM search_log
          WHERE source = 'search'
            AND user_id = ${userUuid}
            AND query_text IS NOT NULL
            AND LOWER(query_text) IN (${keySql})
          GROUP BY LOWER(query_text)
        `,
      );
      userCountByKey = new Map(
        userRows.map((row) => [row.queryKey, row.usage]),
      );
    }

    return keys
      .map((key) => {
        const text = suggestionTextByKey.get(key) ?? key;
        const globalCount = globalCountByKey.get(key) ?? 0;
        const userCount = userCountByKey.get(key) ?? 0;
        const source: QuerySuggestionSource =
          userCount > 0 ? 'personal' : 'global';
        return { text, globalCount, userCount, source };
      })
      .filter((item) => item.text.trim().length > 0);
  }
}
