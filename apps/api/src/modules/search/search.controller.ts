import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { LoggerService, CurrentUser } from '../../shared';
import {
  NaturalSearchRequestDto,
  SearchPlanResponseDto,
  SearchQueryRequestDto,
  SearchResponseDto,
  SearchResultClickDto,
} from './dto/search-query.dto';
import { SearchService } from './search.service';
import { SearchOrchestrationService } from './search-orchestration.service';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { ListSearchHistoryDto } from './dto/list-search-history.dto';

@Controller('search')
@UseGuards(ClerkAuthGuard)
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
    @CurrentUser() user: User,
  ): Promise<SearchResponseDto> {
    this.logger.debug('Received search execution request');
    request.userId = user.userId;
    return this.searchService.runQuery(request);
  }

  @Post('natural')
  async runNatural(
    @Body() request: NaturalSearchRequestDto,
    @CurrentUser() user: User,
  ): Promise<SearchResponseDto> {
    this.logger.debug('Received natural language search request');
    request.userId = user.userId;
    return this.searchOrchestrationService.runNaturalQuery(request);
  }

  @Post('events/click')
  recordClick(@Body() dto: SearchResultClickDto): { status: string } {
    this.searchService.recordResultClick(dto);
    return { status: 'ok' };
  }

  @Get('history')
  async listHistory(
    @Query() query: ListSearchHistoryDto,
    @CurrentUser() user: User,
  ): Promise<string[]> {
    return this.searchService.listRecentSearches(user.userId, query.limit);
  }
}
