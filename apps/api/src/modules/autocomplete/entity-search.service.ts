import { Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { EntityTextSearchService } from '../entity-text-search/entity-text-search.service';
import type { TextMatchEvidence } from '../entity-text-search/entity-text-search.service';

export interface EntitySearchResult {
  entityId: string;
  name: string;
  type: EntityType;
  similarity: number;
  evidence: TextMatchEvidence;
}

@Injectable()
export class EntitySearchService {
  constructor(private readonly textSearch: EntityTextSearchService) {}

  async searchEntities(
    term: string,
    entityTypes: EntityType[],
    limit: number,
    options: { marketKey?: string | null; allowPhonetic?: boolean } = {},
  ): Promise<EntitySearchResult[]> {
    const matches = await this.textSearch.searchEntities(
      term,
      entityTypes,
      limit,
      options,
    );
    return matches.map((row) => ({
      entityId: row.entityId,
      name: row.name,
      type: row.type,
      similarity: row.similarity,
      evidence: row.evidence,
    }));
  }

  /**
   * Hybrid recall for autocomplete: the shared recall core (lexical + dense
   * pgvector) with the dense lane gated to FALLBACK — it runs only when the
   * lexical lane under-recalls, so the per-query embedding cost is paid only for
   * semantic-gap queries ("bacon egg and cheese" → breakfast sandwiches), keeping
   * the common type-ahead path fast. Returns the same shape as `searchEntities`
   * (similarity = best lane evidence) so the caller's scoring pipeline is unchanged.
   */
  async searchEntitiesHybrid(
    term: string,
    entityTypes: EntityType[],
    limit: number,
    options: { marketKey?: string | null; allowPhonetic?: boolean } = {},
  ): Promise<EntitySearchResult[]> {
    const candidates = await this.textSearch.retrieveCandidates(
      term,
      entityTypes,
      limit,
      {
        marketKey: options.marketKey,
        allowPhonetic: options.allowPhonetic,
        denseMode: 'fallback',
      },
    );
    return candidates.map((c) => ({
      entityId: c.entityId,
      name: c.name,
      type: c.type,
      similarity: Math.max(c.denseCosine ?? 0, c.sparseSimilarity ?? 0),
      evidence: c.sparseEvidence ?? 'embedding',
    }));
  }

  async searchAttributeAutocompleteEntities(
    term: string,
    entityTypes: EntityType[],
    limit: number,
    options: { marketKey?: string | null } = {},
  ): Promise<EntitySearchResult[]> {
    const matches = await this.textSearch.searchAttributeAutocompleteEntities(
      term,
      entityTypes,
      limit,
      options,
    );
    return matches.map((row) => ({
      entityId: row.entityId,
      name: row.name,
      type: row.type,
      similarity: row.similarity,
      evidence: row.evidence,
    }));
  }
}
