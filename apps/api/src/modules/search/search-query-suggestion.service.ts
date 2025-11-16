import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

interface QuerySuggestionRow {
  query: string;
  usage: number;
  lastUsed: Date;
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
  ): Promise<string[]> {
    const trimmed = prefix.trim().toLowerCase();
    if (!trimmed || trimmed.length < this.minPrefixLength) {
      return [];
    }

    const safeLimit = Math.max(1, Math.min(limit, 10));
    const likePattern = `${trimmed}%`;
    const deduped = new Set<string>();

    try {
      if (userId) {
        const personalRows = await this.prisma.$queryRaw<QuerySuggestionRow[]>(
          Prisma.sql`
            SELECT query_text AS "query",
                   COUNT(*)::int AS "usage",
                   MAX(logged_at) AS "lastUsed"
            FROM search_log
            WHERE user_id = ${userId}
              AND query_text IS NOT NULL
              AND LOWER(query_text) LIKE ${likePattern}
            GROUP BY query_text
            ORDER BY MAX(logged_at) DESC, COUNT(*) DESC
            LIMIT ${safeLimit}
          `,
        );
        for (const row of personalRows) {
          const value = row.query?.trim();
          if (value) {
            deduped.add(value);
            if (deduped.size >= safeLimit) {
              return Array.from(deduped.values());
            }
          }
        }
      }

      const remaining = safeLimit - deduped.size;
      if (remaining <= 0) {
        return Array.from(deduped.values());
      }

      const globalRows = await this.prisma.$queryRaw<QuerySuggestionRow[]>(
        Prisma.sql`
          SELECT query_text AS "query",
                 COUNT(*)::int AS "usage",
                 MAX(logged_at) AS "lastUsed"
          FROM search_log
          WHERE query_text IS NOT NULL
            AND LOWER(query_text) LIKE ${likePattern}
          GROUP BY query_text
          ORDER BY COUNT(*) DESC, MAX(logged_at) DESC
          LIMIT ${remaining * 2}
        `,
      );

      for (const row of globalRows) {
        const value = row.query?.trim();
        if (!value) continue;
        deduped.add(value);
        if (deduped.size >= safeLimit) {
          break;
        }
      }

      return Array.from(deduped.values()).slice(0, safeLimit);
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
}
