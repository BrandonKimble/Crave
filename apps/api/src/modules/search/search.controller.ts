import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { LoggerService, CurrentUser } from '../../shared';
import {
  NaturalSearchRequestDto,
  SearchCacheAttributionDto,
  SearchPlanResponseDto,
  SearchQueryRequestDto,
  SearchResponseDto,
} from './dto/search-query.dto';
import { ShortcutCoverageRequestDto } from './dto/shortcut-coverage.dto';
import { SearchService, type SearchHistoryEntry } from './search.service';
import { SearchOrchestrationService } from './search-orchestration.service';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { ListSearchHistoryDto } from './dto/list-search-history.dto';
import { SearchCoverageService } from './search-coverage.service';
import type {
  FoodResultDto,
  RestaurantProfileDto,
} from './dto/search-query.dto';
import { RateLimitTier } from '../infrastructure/throttler/throttler.decorator';

@Controller('search')
@UseGuards(ClerkAuthGuard)
export class SearchController {
  private readonly logger: LoggerService;

  constructor(
    private readonly searchService: SearchService,
    private readonly searchOrchestrationService: SearchOrchestrationService,
    private readonly searchCoverageService: SearchCoverageService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchController');
  }

  @Post('plan')
  @RateLimitTier('search')
  plan(@Body() request: SearchQueryRequestDto): SearchPlanResponseDto {
    this.logger.debug('Received search plan request');
    return this.searchService.buildPlanResponse(request);
  }

  @Post('run')
  @RateLimitTier('search')
  async run(
    @Body() request: SearchQueryRequestDto,
    @CurrentUser() user: User,
  ): Promise<SearchResponseDto> {
    this.logger.debug('Received search execution request');
    request.userId = user.userId;
    return this.searchService.runQuery(request);
  }

  @Post('natural')
  @RateLimitTier('naturalSearch')
  async runNatural(
    @Body() request: NaturalSearchRequestDto,
    @CurrentUser() user: User,
  ): Promise<SearchResponseDto> {
    this.logger.debug('Received natural language search request');
    request.userId = user.userId;
    return this.searchOrchestrationService.runNaturalQuery(request);
  }

  @Post('cache-attribution')
  @RateLimitTier('search')
  async recordCacheAttribution(
    @Body() request: SearchCacheAttributionDto,
    @CurrentUser() user: User,
  ): Promise<{ inserted: number }> {
    return this.searchService.recordCacheAttribution(request, user.userId);
  }

  @Get('history')
  async listHistory(
    @Query() query: ListSearchHistoryDto,
    @CurrentUser() user: User,
  ): Promise<SearchHistoryEntry[]> {
    return this.searchService.listRecentSearches(user.userId, query.limit);
  }

  @Post('shortcut/coverage')
  @RateLimitTier('search')
  async shortcutCoverage(
    @Body() request: ShortcutCoverageRequestDto,
  ): Promise<unknown> {
    return this.searchCoverageService.buildShortcutCoverageGeoJson(request);
  }

  @Get('restaurants/:restaurantId/dishes')
  async restaurantDishes(
    @Param('restaurantId', new ParseUUIDPipe({ version: '4' }))
    restaurantId: string,
  ): Promise<FoodResultDto[]> {
    return this.searchService.listRestaurantDishes(restaurantId);
  }

  @Get('restaurants/:restaurantId/profile')
  async restaurantProfile(
    @Param('restaurantId', new ParseUUIDPipe({ version: '4' }))
    restaurantId: string,
  ): Promise<RestaurantProfileDto> {
    // NOTE: clients may still send ?marketKey= during the Leg 2 mobile
    // transition — unknown query params are ignored here by design.
    const profile = await this.searchService.getRestaurantProfile(restaurantId);
    if (!profile) {
      throw new NotFoundException('Restaurant profile not found');
    }
    return profile;
  }
}
