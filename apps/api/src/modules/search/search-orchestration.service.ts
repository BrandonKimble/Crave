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

    return response;
  }
}
