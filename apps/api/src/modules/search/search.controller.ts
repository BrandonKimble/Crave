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
import { NoSignal, RecordsSignal } from '../signals/records-signal.decorator';
import { RequestLocale, type SupportedLocale } from '../../shared/locale';
import type { RestaurantMatchedTag } from '@crave-search/shared';
import { EntityDisplayService } from '../entity-display/entity-display.service';
import { DietaryConstraintRegistry } from './dietary-constraints';

@Controller('search')
@UseGuards(ClerkAuthGuard)
export class SearchController {
  private readonly logger: LoggerService;

  constructor(
    private readonly searchService: SearchService,
    private readonly searchOrchestrationService: SearchOrchestrationService,
    private readonly searchCoverageService: SearchCoverageService,
    // N10: the tag chips are the one CONCEPT surface in a search response —
    // restaurant and dish names are proper/source-faithful and stay as they
    // are. Localizing here, at the response boundary, keeps the executor (and
    // its SQL, and its caches) speaking canonical names end to end.
    private readonly entityDisplay: EntityDisplayService,
    private readonly dietaryConstraints: DietaryConstraintRegistry,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchController');
  }

  /**
   * Localize the concept chips on a search response. ONE label query for the
   * whole payload; every chip also gains its `submitToken` so a tapped chip
   * re-runs the search with the canonical term, not the translated one.
   */
  private async localizeResponse(
    response: SearchResponseDto,
    locale: SupportedLocale,
  ): Promise<SearchResponseDto> {
    const buckets = [
      response.restaurants,
      response.similarRestaurants ?? [],
    ].filter((bucket) => bucket?.length);
    if (!buckets.length) {
      return response;
    }
    const chips = buckets.flatMap((bucket) =>
      bucket.flatMap((row) => row.matchedTags ?? []),
    );
    if (!chips.length) {
      return response;
    }
    const localized = await this.entityDisplay.localizeRows(chips, locale);
    const byId = new Map(
      localized.map((chip) => [
        chip.entityId,
        { name: chip.name, submitToken: chip.submitToken },
      ]),
    );
    const apply = (
      rows: Array<{ matchedTags?: RestaurantMatchedTag[] }> | undefined,
    ): void => {
      for (const row of rows ?? []) {
        if (!row.matchedTags?.length) {
          continue;
        }
        row.matchedTags = row.matchedTags.map((tag) => {
          const hit = byId.get(tag.entityId);
          return hit ? { ...tag, ...hit } : tag;
        });
      }
    };
    apply(response.restaurants);
    apply(response.similarRestaurants);
    return response;
  }

  @Post('plan')
  // Pure planning: it parses a query into a plan and touches nothing. The
  // SUBMIT is the act, and it is recorded at POST /search/run.
  @NoSignal(
    'pure query planning; the submit is the act, recorded by POST /search/run',
  )
  @RateLimitTier('search')
  plan(@Body() request: SearchQueryRequestDto): SearchPlanResponseDto {
    this.logger.debug('Received search plan request');
    return this.searchService.buildPlanResponse(request);
  }

  @Post('run')
  // The search submit. A selected failing search deliberately writes SEVERAL
  // rows for ONE act (search + autocomplete_selection + on_demand_ask); the
  // echo-kind law in signals.service.ts is what keeps that weighing 1.
  @RecordsSignal('search', 'autocomplete_selection', 'on_demand_ask')
  @RateLimitTier('search')
  async run(
    @Body() request: SearchQueryRequestDto,
    @CurrentUser() user: User,
    @RequestLocale() locale: SupportedLocale,
  ): Promise<SearchResponseDto> {
    this.logger.debug('Received search execution request');
    request.userId = user.userId;
    return this.localizeResponse(
      await this.searchService.runQuery(request),
      locale,
    );
  }

  @Post('natural')
  // Runs the interpretation, then the same runQuery chokepoint.
  @RecordsSignal('search', 'autocomplete_selection', 'on_demand_ask')
  @RateLimitTier('naturalSearch')
  async runNatural(
    @Body() request: NaturalSearchRequestDto,
    @CurrentUser() user: User,
    @RequestLocale() locale: SupportedLocale,
  ): Promise<SearchResponseDto> {
    this.logger.debug('Received natural language search request');
    request.userId = user.userId;
    // Parent-integration stitch: the negotiated request locale feeds the
    // Understand (dense gate + negation cues + R5-7 embed prefix) unless
    // the client pinned one explicitly.
    request.locale = request.locale ?? locale;
    return this.localizeResponse(
      await this.searchOrchestrationService.runNaturalQuery(request),
      locale,
    );
  }

  @Post('cache-attribution')
  // A cache reveal is the SAME search act with meta.cached=true.
  @RecordsSignal('search')
  @RateLimitTier('search')
  async recordCacheAttribution(
    @Body() request: SearchCacheAttributionDto,
    @CurrentUser() user: User,
  ): Promise<{ inserted: number }> {
    return this.searchService.recordCacheAttribution(request, user.userId);
  }

  /** DIETARY TOGGLE OPTIONS: the curated vocabulary is the authority, so
   *  the strip renders what the registry offers (no client-side list). */
  @Get('dietary-options')
  @NoSignal('static vocabulary read; not a demand act')
  async dietaryOptions(): Promise<Array<{ name: string; label: string }>> {
    return this.dietaryConstraints.listDietaryOptions();
  }

  @Get('history')
  async listHistory(
    @Query() query: ListSearchHistoryDto,
    @CurrentUser() user: User,
  ): Promise<SearchHistoryEntry[]> {
    return this.searchService.listRecentSearches(user.userId, query.limit);
  }

  @Post('shortcut/coverage')
  // POST for the shape BODY; returns coverage GeoJSON and writes nothing.
  // It answers "what do we cover", which is not a user's demand for a place.
  @NoSignal('read-only coverage GeoJSON; not a demand act')
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
