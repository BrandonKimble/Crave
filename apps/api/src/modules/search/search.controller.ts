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
  RequireEntitlement,
  RequireEntitlementGuard,
} from '../entitlements/require-entitlement.guard';
import { EntitlementService } from '../entitlements/entitlement.service';
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
    private readonly entitlements: EntitlementService,
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
    await this.applyRisingGate(request);
    const response = await this.searchService.runQuery(request);
    return this.applyDishGate(user.userId, response);
  }

  @Post('natural')
  @RateLimitTier('naturalSearch')
  async runNatural(
    @Body() request: NaturalSearchRequestDto,
    @CurrentUser() user: User,
  ): Promise<SearchResponseDto> {
    this.logger.debug('Received natural language search request');
    request.userId = user.userId;
    const response =
      await this.searchOrchestrationService.runNaturalQuery(request);
    return this.applyDishGate(user.userId, response);
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
  @UseGuards(RequireEntitlementGuard)
  @RequireEntitlement()
  async restaurantDishes(
    @Param('restaurantId', new ParseUUIDPipe({ version: '4' }))
    restaurantId: string,
    @Query('marketKey') marketKey?: string,
  ): Promise<FoodResultDto[]> {
    return this.searchService.listRestaurantDishes(restaurantId, marketKey);
  }

  @Get('restaurants/:restaurantId/profile')
  async restaurantProfile(
    @Param('restaurantId', new ParseUUIDPipe({ version: '4' }))
    restaurantId: string,
    @Query('marketKey') marketKey?: string,
  ): Promise<RestaurantProfileDto> {
    const profile = await this.searchService.getRestaurantProfile(
      restaurantId,
      marketKey ?? null,
    );
    if (!profile) {
      throw new NotFoundException('Restaurant profile not found');
    }
    return profile;
  }

  /** Dish results are the paid hero (business/monetization-and-gating.md):
   *  response-shaped, not 403'd — free users keep restaurants, dishes are
   *  locked out with a metadata flag the client renders as the teaser.
   *  Honors ENTITLEMENT_GATING (off/log/enforce). */
  private async applyDishGate(
    userId: string,
    response: SearchResponseDto,
  ): Promise<SearchResponseDto> {
    if (!response.dishes?.length) return response;
    const { allowed } = await this.entitlements.gateFeature(
      userId,
      'dish_results',
    );
    if (allowed) return response;
    return {
      ...response,
      dishes: [],
      metadata: { ...response.metadata, dishAccessRequired: true },
    };
  }

  /** Rising/momentum sort is Crave+: locked = the request runs as if the
   *  sort were off (param-shaped; the flag rides response metadata via
   *  risingActive echo on the client side). */
  private async applyRisingGate(request: SearchQueryRequestDto): Promise<void> {
    if (!request.risingActive) return;
    const { allowed } = await this.entitlements.gateFeature(
      request.userId,
      'rising_sort',
    );
    if (!allowed) {
      request.risingActive = false;
    }
  }
}
