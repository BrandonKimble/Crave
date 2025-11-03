import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../shared';
import {
  NaturalSearchRequestDto,
  SearchResponseDto,
} from './dto/search-query.dto';
import { SEARCH_FIXTURES } from './fixtures/natural-search-fixtures';

@Injectable()
export class SearchFixtureService {
  private readonly logger: LoggerService;
  private readonly enabled: boolean;

  constructor(
    private readonly configService: ConfigService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchFixtureService');

    const explicit = this.configService.get<boolean>('searchFixtures.enabled');
    const hasLlmKey = Boolean(this.configService.get<string>('llm.apiKey'));

    this.enabled =
      explicit === true ||
      (explicit !== false &&
        !hasLlmKey &&
        process.env.NODE_ENV !== 'production');

    if (this.enabled) {
      this.logger.warn('Search fixture mode enabled', {
        explicit,
        hasLlmKey,
        environment: process.env.NODE_ENV,
      });
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getNaturalSearchResponse(
    request: NaturalSearchRequestDto,
  ): SearchResponseDto | null {
    if (!this.enabled) {
      return null;
    }

    const normalizedQuery = request.query.trim().toLowerCase();
    const fixture =
      SEARCH_FIXTURES.byQuery?.[normalizedQuery] ?? SEARCH_FIXTURES.default;

    if (!fixture) {
      this.logger.warn('No search fixture matched query', {
        query: request.query,
      });
      return null;
    }

    return this.hydrateFixtureResponse(fixture, request);
  }

  private hydrateFixtureResponse(
    template: SearchResponseDto,
    request: NaturalSearchRequestDto,
  ): SearchResponseDto {
    const food = template.food.map((item) => ({ ...item }));
    const restaurants = template.restaurants
      ? template.restaurants.map((restaurant) => ({
          ...restaurant,
          topFood: restaurant.topFood.map((snippet) => ({ ...snippet })),
        }))
      : undefined;

    const totalFood = food.length;
    const totalRestaurants = restaurants?.length ?? 0;
    const page = request.pagination?.page ?? template.metadata.page ?? 1;
    const pageSize =
      request.pagination?.pageSize ?? template.metadata.pageSize ?? 20;

    const metadata: SearchResponseDto['metadata'] = {
      ...template.metadata,
      totalFoodResults: totalFood,
      totalRestaurantResults: totalRestaurants,
      page,
      pageSize,
      boundsApplied: Boolean(request.bounds),
      openNowApplied: Boolean(request.openNow),
      openNowSupportedRestaurants:
        template.metadata.openNowSupportedRestaurants ?? totalRestaurants,
      openNowUnsupportedRestaurants:
        template.metadata.openNowUnsupportedRestaurants ?? 0,
      openNowFilteredOut: template.metadata.openNowFilteredOut ?? 0,
      perRestaurantLimit: template.metadata.perRestaurantLimit ?? 3,
      coverageStatus:
        template.metadata.coverageStatus ??
        (totalFood + totalRestaurants > 0 ? 'full' : 'unresolved'),
      queryExecutionTimeMs: template.metadata.queryExecutionTimeMs ?? 5,
      sourceQuery: request.query,
      analysisMetadata: {
        ...(template.metadata.analysisMetadata ?? {}),
        fixture: true,
        requestedAt: new Date().toISOString(),
      },
    };

    const sqlPreview =
      request.includeSqlPreview === false ? null : template.sqlPreview ?? null;

    return {
      ...template,
      food,
      restaurants,
      metadata,
      sqlPreview,
    };
  }
}
