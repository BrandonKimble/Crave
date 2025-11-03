import { Injectable } from '@nestjs/common';
import { SearchService } from './search.service';
import {
  NaturalSearchRequestDto,
  SearchResponseDto,
} from './dto/search-query.dto';
import { SearchQueryInterpretationService } from './search-query-interpretation.service';

@Injectable()
export class SearchOrchestrationService {
  constructor(
    private readonly interpretationService: SearchQueryInterpretationService,
    private readonly searchService: SearchService,
  ) {}

  async runNaturalQuery(
    request: NaturalSearchRequestDto,
  ): Promise<SearchResponseDto> {
    const interpretation = await this.interpretationService.interpret(request);
    const response = await this.searchService.runQuery(
      interpretation.structuredRequest,
    );

    response.metadata.unresolvedEntities = interpretation.unresolved.map(
      (group) => ({
        type: group.type,
        terms: group.terms,
      }),
    );
    response.metadata.sourceQuery = request.query;
    response.metadata.analysisMetadata = interpretation.analysisMetadata;

    const totalResults =
      (response.food?.length ?? 0) + (response.restaurants?.length ?? 0);
    const hasQueryTargets = Boolean(
      interpretation.structuredRequest.entities.food?.length ||
        interpretation.structuredRequest.entities.foodAttributes?.length ||
        interpretation.structuredRequest.entities.restaurants?.length ||
        interpretation.structuredRequest.entities.restaurantAttributes?.length,
    );

    if (interpretation.unresolved.length) {
      response.metadata.coverageStatus =
        totalResults > 0 ? 'partial' : 'unresolved';
    } else if (!response.metadata.coverageStatus) {
      if (hasQueryTargets && totalResults === 0) {
        response.metadata.coverageStatus = 'unresolved';
      } else {
        response.metadata.coverageStatus = totalResults > 0 ? 'full' : 'full';
      }
    }

    return response;
  }
}
