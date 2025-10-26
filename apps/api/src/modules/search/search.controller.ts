import { Body, Controller, Post } from '@nestjs/common';
import { LoggerService } from '../../shared';
import {
  SearchPlanResponseDto,
  SearchQueryRequestDto,
  SearchResponseDto,
  SearchResultClickDto,
} from './dto/search-query.dto';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  private readonly logger: LoggerService;

  constructor(
    private readonly searchService: SearchService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchController');
  }

  @Post('plan')
  plan(@Body() request: SearchQueryRequestDto): SearchPlanResponseDto {
    this.logger.debug('Received search plan request');
    const plan = this.searchService.buildQueryPlan(request);
    return { plan, sqlPreview: null };
  }

  @Post('run')
  async run(
    @Body() request: SearchQueryRequestDto,
  ): Promise<SearchResponseDto> {
    this.logger.debug('Received search execution request');
    return this.searchService.runQuery(request);
  }

  @Post('events/click')
  async recordClick(@Body() dto: SearchResultClickDto): Promise<{ status: string }> {
    await this.searchService.recordResultClick(dto);
    return { status: 'ok' };
  }
}
