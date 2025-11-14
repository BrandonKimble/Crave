import { Body, Controller, Post } from '@nestjs/common';
import { LoggerService } from '../../shared';
import {
  NaturalSearchRequestDto,
  SearchPlanResponseDto,
  SearchQueryRequestDto,
  SearchResponseDto,
  SearchResultClickDto,
} from './dto/search-query.dto';
import { SearchService } from './search.service';
import { SearchOrchestrationService } from './search-orchestration.service';

@Controller('search')
export class SearchController {
  private readonly logger: LoggerService;

  constructor(
    private readonly searchService: SearchService,
    private readonly searchOrchestrationService: SearchOrchestrationService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchController');
  }

  @Post('plan')
  plan(@Body() request: SearchQueryRequestDto): SearchPlanResponseDto {
    this.logger.debug('Received search plan request');
    return this.searchService.buildPlanResponse(request);
  }

  @Post('run')
  async run(
    @Body() request: SearchQueryRequestDto,
  ): Promise<SearchResponseDto> {
    this.logger.debug('Received search execution request');
    return this.searchService.runQuery(request);
  }

  @Post('natural')
  async runNatural(
    @Body() request: NaturalSearchRequestDto,
  ): Promise<SearchResponseDto> {
    this.logger.debug('Received natural language search request');
    return this.searchOrchestrationService.runNaturalQuery(request);
  }

  @Post('events/click')
  recordClick(@Body() dto: SearchResultClickDto): { status: string } {
    this.searchService.recordResultClick(dto);
    return { status: 'ok' };
  }
}
