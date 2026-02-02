import { Injectable } from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { EntityTextSearchService } from '../entity-text-search/entity-text-search.service';

export interface EntitySearchResult {
  entityId: string;
  name: string;
  type: EntityType;
  similarity: number;
}

@Injectable()
export class EntitySearchService {
  constructor(private readonly textSearch: EntityTextSearchService) {}

  async searchEntities(
    term: string,
    entityTypes: EntityType[],
    limit: number,
    options: { locationKey?: string | null } = {},
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
    }));
  }
}
