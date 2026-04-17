import { Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { LoggerService } from '../../shared';
import { EntityTextSearchService } from '../entity-text-search/entity-text-search.service';

export type EntityExpansionEvidence = 'name' | 'alias' | 'fuzzy' | 'phonetic';

export interface ExpandedEntityMatch {
  entityId: string;
  name: string;
  type: EntityType;
  evidence: EntityExpansionEvidence;
  similarity?: number;
}

@Injectable()
export class SearchEntityExpansionService {
  private readonly logger: LoggerService;

  constructor(
    private readonly textSearch: EntityTextSearchService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchEntityExpansionService');
  }

  async expandEntitiesByText(options: {
    terms: string[];
    entityTypes: EntityType[];
    limit: number;
    marketKey?: string | null;
  }): Promise<ExpandedEntityMatch[]> {
    const normalizedTerms = options.terms
      .map((term) => term.trim().toLowerCase())
      .filter((term) => term.length > 0);
    const uniqueTerms: string[] = [];
    const seenTerms = new Set<string>();
    normalizedTerms.forEach((term) => {
      if (seenTerms.has(term)) return;
      seenTerms.add(term);
      uniqueTerms.push(term);
    });
    const entityTypes = options.entityTypes;
    if (!uniqueTerms.length || entityTypes.length === 0) {
      return [];
    }

    const normalizedMarketKey =
      typeof options.marketKey === 'string'
        ? options.marketKey.trim().toLowerCase()
        : null;
    const limit = Math.max(1, Math.min(options.limit, 50));
    const perTermLimit = Math.max(3, Math.ceil(limit / uniqueTerms.length) + 2);

    try {
      const results: ExpandedEntityMatch[] = [];
      const seen = new Set<string>();
      const resultsByTerm = await this.textSearch.searchEntitiesForTerms(
        uniqueTerms,
        entityTypes,
        perTermLimit,
        { marketKey: normalizedMarketKey, allowPhonetic: true },
      );

      for (const term of uniqueTerms) {
        if (results.length >= limit) break;
        const matches = resultsByTerm.get(term) ?? [];
        for (const match of matches) {
          if (results.length >= limit) break;
          if (seen.has(match.entityId)) continue;
          seen.add(match.entityId);
          results.push({
            entityId: match.entityId,
            name: match.name,
            type: match.type,
            evidence: match.evidence,
            similarity: match.similarity,
          });
        }
      }

      return results;
    } catch (error) {
      this.logger.warn('Failed to expand entities by text', {
        terms: uniqueTerms,
        entityTypes,
        limit,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return [];
    }
  }
}
