import { Injectable } from '@nestjs/common';
import { ActivityLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  FoodResultDto,
  QueryPlan,
  RestaurantFoodSnippetDto,
  RestaurantResultDto,
  SearchQueryRequestDto,
} from './dto/search-query.dto';
import { SearchQueryBuilder } from './search-query.builder';

const DAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

const TOP_RESTAURANT_FOOD_SNIPPETS = 3;
const PRICE_SYMBOLS = ['Free', '$', '$$', '$$$', '$$$$'] as const;
const PRICE_DESCRIPTORS = [
  'Free',
  'Budget friendly',
  'Moderate',
  'Expensive',
  'Very expensive',
] as const;

type DayKey = (typeof DAY_KEYS)[number];

interface DaySegment {
  start: number;
  end: number;
  crossesMidnight: boolean;
}

type DailySchedule = Partial<Record<DayKey, DaySegment[]>>;

interface LocalTimeContext {
  dayKey: DayKey;
  minutes: number;
  timezoneApplied: boolean;
}

type RestaurantMetadata = Record<string, unknown> & {
  hours?: Record<string, unknown> | Array<unknown> | string;
  timezone?: string;
  timeZone?: string;
  time_zone?: string;
  tz?: string;
  utc_offset_minutes?: number;
};

interface QueryResultRow {
  connection_id: string;
  restaurant_id: string;
  food_id: string;
  categories: string[];
  food_attributes: string[];
  mention_count: number;
  total_upvotes: number;
  recent_mention_count: number;
  last_mentioned_at: Date | null;
  activity_level: ActivityLevel;
  food_quality_score: Prisma.Decimal | number | string;
  restaurant_total_upvotes: Prisma.Decimal | number | string;
  restaurant_name: string;
  restaurant_aliases: string[];
  restaurant_quality_score?: Prisma.Decimal | number | string | null;
  latitude?: Prisma.Decimal | number | string | null;
  longitude?: Prisma.Decimal | number | string | null;
  address?: string | null;
  price_level?: Prisma.Decimal | number | string | null;
  price_level_updated_at?: Date | null;
  restaurant_attributes: string[];
  restaurant_metadata?: Prisma.JsonValue | null;
  food_name: string;
  food_aliases: string[];
}

interface UserLocationInput {
  lat: number;
  lng: number;
}

interface RestaurantContext {
  operatingStatus: {
    isOpen: boolean;
    closesAtDisplay?: string | null;
    closesInMinutes?: number | null;
  } | null;
  priceLevel: number | null;
  priceSymbol: string | null;
  distanceMiles: number | null;
}

interface ExecuteParams {
  plan: QueryPlan;
  request: SearchQueryRequestDto;
  pagination: { skip: number; take: number };
  perRestaurantLimit: number;
  includeSqlPreview?: boolean;
  dbPagination?: { skip: number; take: number };
}

interface ExecuteResult {
  foodResults: FoodResultDto[];
  restaurantResults: RestaurantResultDto[];
  totalFoodCount: number;
  totalRestaurantCount: number;
  metadata: {
    boundsApplied: boolean;
    openNowApplied: boolean;
    openNowSupportedRestaurants: number;
    openNowUnsupportedRestaurants: number;
    openNowFilteredOut: number;
    priceFilterApplied: boolean;
    minimumVotesApplied: boolean;
  };
  sqlPreview?: string | null;
}

@Injectable()
export class SearchQueryExecutor {
  private readonly logger: LoggerService;
  private readonly diagnosticLogging: boolean;

  constructor(
    loggerService: LoggerService,
    private readonly prisma: PrismaService,
    private readonly queryBuilder: SearchQueryBuilder,
  ) {
    this.logger = loggerService.setContext('SearchQueryExecutor');
    this.diagnosticLogging =
      (process.env.SEARCH_VERBOSE_DIAGNOSTICS || '').toLowerCase() === 'true';
  }

  async execute(params: ExecuteParams): Promise<ExecuteResult> {
    const {
      plan,
      request,
      pagination,
      perRestaurantLimit,
      includeSqlPreview,
      dbPagination,
    } = params;

    const effectivePagination = dbPagination ?? pagination;
    const query = this.queryBuilder.build({
      plan,
      pagination: effectivePagination,
    });

    const referenceDate = new Date();
    const userLocation = this.normalizeUserLocation(request.userLocation);
    const [connections, totalResult] = await Promise.all([
      this.prisma.$queryRaw<QueryResultRow[]>(query.dataSql),
      this.prisma.$queryRaw<
        Array<{ total_connections: bigint; total_restaurants: bigint }>
      >(query.countSql),
    ]);

    const totalBeforeFiltering = Number(totalResult[0]?.total_connections ?? 0);
    const restaurantContexts = this.buildRestaurantContexts(
      connections,
      referenceDate,
      userLocation,
    );
    const totalRestaurantCountDb = Number(
      totalResult[0]?.total_restaurants ?? 0,
    );
    const needsOpenFilter = Boolean(request.openNow);

    const openFilter = needsOpenFilter
      ? this.filterByOpenNow(connections, restaurantContexts)
      : {
          connections,
          applied: false,
          supportedCount: 0,
          unsupportedCount: 0,
        };

    const filteredConnections = openFilter.connections;
    const totalFoodCount = needsOpenFilter
      ? filteredConnections.length
      : totalBeforeFiltering;

    const openNowFilteredOut = needsOpenFilter
      ? connections.length - filteredConnections.length
      : 0;

    const paginatedConnections = needsOpenFilter
      ? this.applyManualPagination(filteredConnections, pagination)
      : connections;

    const limitedConnections =
      perRestaurantLimit > 0
        ? this.applyPerRestaurantLimit(paginatedConnections, perRestaurantLimit)
        : paginatedConnections;

    const minimumVotes =
      typeof request.minimumVotes === 'number' ? request.minimumVotes : null;

    const foodResults = this.mapFoodResults(
      limitedConnections,
      restaurantContexts,
      referenceDate,
    );
    const totalRestaurantCount = needsOpenFilter
      ? this.countDistinctRestaurants(filteredConnections)
      : totalRestaurantCountDb;
    const restaurantResults =
      plan.format === 'dual_list'
        ? this.mapRestaurantResults(
            limitedConnections,
            plan.ranking.restaurantOrder,
            minimumVotes,
            restaurantContexts,
            referenceDate,
          )
        : [];

    if (this.diagnosticLogging) {
      this.logger.debug('Search executor diagnostics', {
        planFormat: plan.format,
        totalFetchedConnections: connections.length,
        limitedConnectionCount: limitedConnections.length,
        openNowApplied: openFilter.applied,
        openNowSupported: openFilter.supportedCount,
        openNowUnsupported: openFilter.unsupportedCount,
        openNowFilteredOut,
      });
    }

    return {
      foodResults,
      restaurantResults,
      totalFoodCount,
      totalRestaurantCount,
      metadata: {
        boundsApplied: query.metadata.boundsApplied,
        openNowApplied: openFilter.applied,
        openNowSupportedRestaurants: openFilter.supportedCount,
        openNowUnsupportedRestaurants: openFilter.unsupportedCount,
        openNowFilteredOut,
        priceFilterApplied: query.metadata.priceFilterApplied,
        minimumVotesApplied: query.metadata.minimumVotesApplied,
      },
      sqlPreview: includeSqlPreview ? query.preview : null,
    };
  }

  private countDistinctRestaurants(connections: QueryResultRow[]): number {
    const ids = new Set<string>();
    for (const connection of connections) {
      if (connection.restaurant_id) {
        ids.add(connection.restaurant_id);
      }
    }
    return ids.size;
  }

  private normalizeUserLocation(
    input?: { lat?: number; lng?: number } | null,
  ): UserLocationInput | null {
    if (!input) {
      return null;
    }
    const lat = Number(input.lat);
    const lng = Number(input.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    return { lat, lng };
  }

  private buildRestaurantContexts(
    connections: QueryResultRow[],
    referenceDate: Date,
    userLocation: UserLocationInput | null,
  ): Map<string, RestaurantContext> {
    const contexts = new Map<string, RestaurantContext>();

    for (const connection of connections) {
      const restaurantId = connection.restaurant_id;
      if (!restaurantId) {
        continue;
      }

      const existing = contexts.get(restaurantId);
      const latitude = this.toOptionalNumber(connection.latitude);
      const longitude = this.toOptionalNumber(connection.longitude);
      const parsedPrice = this.toOptionalNumber(connection.price_level);
      const priceDetails = this.describePriceLevel(parsedPrice);
      const operatingStatus =
        existing?.operatingStatus ??
        this.evaluateOperatingStatus(
          connection.restaurant_metadata,
          referenceDate,
        ) ??
        null;
      const distanceMiles =
        latitude !== null &&
        latitude !== undefined &&
        longitude !== null &&
        longitude !== undefined &&
        userLocation
          ? this.computeDistanceMiles(userLocation, latitude, longitude)
          : null;

      if (existing) {
        if (existing.priceLevel === null && parsedPrice !== null) {
          existing.priceLevel = parsedPrice;
        }
        if (!existing.priceSymbol && priceDetails.symbol) {
          existing.priceSymbol = priceDetails.symbol;
        }
        if (!existing.operatingStatus && operatingStatus) {
          existing.operatingStatus = operatingStatus;
        }
        if (existing.distanceMiles === null && distanceMiles !== null) {
          existing.distanceMiles = distanceMiles;
        }
        continue;
      }

      contexts.set(restaurantId, {
        operatingStatus,
        priceLevel: parsedPrice ?? null,
        priceSymbol: priceDetails.symbol ?? null,
        distanceMiles: distanceMiles ?? null,
      });
    }

    return contexts;
  }

  private filterByOpenNow(
    connections: QueryResultRow[],
    restaurantContexts: Map<string, RestaurantContext>,
  ): {
    connections: QueryResultRow[];
    applied: boolean;
    supportedCount: number;
    unsupportedCount: number;
  } {
    const filtered: QueryResultRow[] = [];
    let applied = false;
    let supported = 0;
    let unsupported = 0;

    for (const connection of connections) {
      const status = restaurantContexts.get(
        connection.restaurant_id,
      )?.operatingStatus;

      if (!status) {
        unsupported += 1;
        continue;
      }

      applied = true;
      supported += 1;

      if (status.isOpen) {
        filtered.push(connection);
      }
    }

    if (!applied) {
      return {
        connections,
        applied: false,
        supportedCount: 0,
        unsupportedCount: unsupported,
      };
    }

    return {
      connections: filtered,
      applied: true,
      supportedCount: supported,
      unsupportedCount: unsupported,
    };
  }

  private applyManualPagination(
    connections: QueryResultRow[],
    pagination: { skip: number; take: number },
  ): QueryResultRow[] {
    if (pagination.take <= 0) {
      return [];
    }

    if (pagination.skip <= 0 && connections.length <= pagination.take) {
      return connections.slice(0, pagination.take);
    }

    return connections.slice(
      pagination.skip,
      pagination.skip + pagination.take,
    );
  }

  private applyPerRestaurantLimit(
    connections: QueryResultRow[],
    perRestaurantLimit: number,
  ): QueryResultRow[] {
    if (perRestaurantLimit <= 0) {
      return connections;
    }

    const counts = new Map<string, number>();
    const limited: QueryResultRow[] = [];

    for (const connection of connections) {
      const restaurantId = connection.restaurant_id;
      if (!restaurantId) {
        continue;
      }

      const current = counts.get(restaurantId) ?? 0;
      if (current >= perRestaurantLimit) {
        continue;
      }

      counts.set(restaurantId, current + 1);
      limited.push(connection);
    }

    return limited;
  }

  private mapFoodResults(
    connections: QueryResultRow[],
    restaurantContexts: Map<string, RestaurantContext>,
    referenceDate: Date,
  ): FoodResultDto[] {
    const results: FoodResultDto[] = [];

    for (const connection of connections) {
      const restaurantContext = restaurantContexts.get(
        connection.restaurant_id,
      );
      const parsedPrice =
        restaurantContext?.priceLevel ??
        this.toOptionalNumber(connection.price_level);
      const priceDetails = this.describePriceLevel(parsedPrice);
      const operatingStatus =
        restaurantContext?.operatingStatus ??
        this.evaluateOperatingStatus(
          connection.restaurant_metadata,
          referenceDate,
        );

      results.push({
        connectionId: connection.connection_id,
        foodId: connection.food_id,
        foodName: connection.food_name,
        foodAliases: connection.food_aliases || [],
        restaurantId: connection.restaurant_id,
        restaurantName: connection.restaurant_name,
        restaurantAliases: connection.restaurant_aliases || [],
        qualityScore: this.toNumber(connection.food_quality_score),
        activityLevel: connection.activity_level,
        mentionCount: connection.mention_count,
        totalUpvotes: connection.total_upvotes,
        recentMentionCount: connection.recent_mention_count,
        lastMentionedAt: connection.last_mentioned_at
          ? connection.last_mentioned_at.toISOString()
          : null,
        categories: connection.categories || [],
        foodAttributes: connection.food_attributes || [],
        restaurantPriceLevel: parsedPrice ?? null,
        restaurantPriceSymbol:
          restaurantContext?.priceSymbol ?? priceDetails.symbol ?? null,
        restaurantDistanceMiles: restaurantContext?.distanceMiles ?? null,
        restaurantOperatingStatus: operatingStatus ?? null,
      });
    }

    return results;
  }

  private mapRestaurantResults(
    connections: QueryResultRow[],
    restaurantOrder: string,
    minimumVotes: number | null,
    restaurantContexts: Map<string, RestaurantContext>,
    referenceDate: Date,
  ): RestaurantResultDto[] {
    const grouped = new Map<
      string,
      {
        restaurantId: string;
        name: string;
        aliases: string[];
        restaurantQualityScore?: Prisma.Decimal | number | string | null;
        latitude?: Prisma.Decimal | number | string | null;
        longitude?: Prisma.Decimal | number | string | null;
        address?: string | null;
        priceLevel?: number | null;
        priceLevelUpdatedAt?: Date | null;
        priceSymbol?: string | null;
        priceText?: string | null;
        metadata?: Prisma.JsonValue | null;
        snippets: RestaurantFoodSnippetDto[];
        scoreSum: number;
        count: number;
        totalUpvotes: number;
      }
    >();

    for (const connection of connections) {
      const snippet: RestaurantFoodSnippetDto = {
        connectionId: connection.connection_id,
        foodId: connection.food_id,
        foodName: connection.food_name,
        qualityScore: this.toNumber(connection.food_quality_score),
        activityLevel: connection.activity_level,
      };

      const restaurantTotalUpvotes = this.toNumber(
        connection.restaurant_total_upvotes,
      );
      const existing = grouped.get(connection.restaurant_id);
      if (existing) {
        existing.snippets.push(snippet);
        existing.scoreSum += snippet.qualityScore;
        existing.count += 1;
        if (restaurantTotalUpvotes > existing.totalUpvotes) {
          existing.totalUpvotes = restaurantTotalUpvotes;
        }
        if (
          (existing.priceLevel === null || existing.priceLevel === undefined) &&
          connection.price_level != null
        ) {
          const parsedPrice = this.toOptionalNumber(connection.price_level);
          const priceDetails = this.describePriceLevel(parsedPrice);
          existing.priceLevel = parsedPrice;
          existing.priceSymbol = priceDetails.symbol;
          existing.priceText = priceDetails.text;
        }
        if (
          !existing.priceLevelUpdatedAt &&
          connection.price_level_updated_at
        ) {
          existing.priceLevelUpdatedAt = connection.price_level_updated_at;
        }
        if (!existing.metadata && connection.restaurant_metadata) {
          existing.metadata = connection.restaurant_metadata;
        }
      } else {
        const parsedPrice = this.toOptionalNumber(connection.price_level);
        const priceDetails = this.describePriceLevel(parsedPrice);
        grouped.set(connection.restaurant_id, {
          restaurantId: connection.restaurant_id,
          name: connection.restaurant_name,
          aliases: connection.restaurant_aliases || [],
          restaurantQualityScore: connection.restaurant_quality_score,
          latitude: connection.latitude,
          longitude: connection.longitude,
          address: connection.address,
          priceLevel: parsedPrice,
          priceSymbol: priceDetails.symbol,
          priceText: priceDetails.text,
          priceLevelUpdatedAt: connection.price_level_updated_at || null,
          metadata: connection.restaurant_metadata ?? null,
          snippets: [snippet],
          scoreSum: snippet.qualityScore,
          count: 1,
          totalUpvotes: restaurantTotalUpvotes,
        });
      }
    }

    const results = Array.from(grouped.values())
      .filter(
        (restaurant) =>
          minimumVotes === null || restaurant.totalUpvotes >= minimumVotes,
      )
      .map(
        ({
          restaurantId,
          name,
          aliases,
          restaurantQualityScore,
          latitude,
          longitude,
          address,
          priceLevel: groupedPriceLevel,
          priceSymbol,
          priceText,
          priceLevelUpdatedAt,
          metadata,
          snippets,
          scoreSum,
          count,
        }) => {
          const restaurantContext = restaurantContexts.get(restaurantId);
          const resolvedPriceLevel =
            restaurantContext?.priceLevel ?? groupedPriceLevel ?? null;
          const resolvedPriceSymbol =
            restaurantContext?.priceSymbol ?? priceSymbol ?? null;
          const operatingStatus =
            restaurantContext?.operatingStatus ??
            (metadata
              ? this.evaluateOperatingStatus(metadata, referenceDate)
              : null);

          return {
            restaurantId,
            restaurantName: name,
            restaurantAliases: aliases || [],
            contextualScore: count ? scoreSum / count : 0,
            restaurantQualityScore:
              restaurantQualityScore === null ||
              restaurantQualityScore === undefined
                ? null
                : this.toNumber(restaurantQualityScore),
            latitude:
              latitude === null || latitude === undefined
                ? null
                : this.toNumber(latitude),
            longitude:
              longitude === null || longitude === undefined
                ? null
                : this.toNumber(longitude),
            address: address ?? null,
            priceLevel: resolvedPriceLevel,
            priceSymbol: resolvedPriceSymbol,
            priceText,
            priceLevelUpdatedAt: priceLevelUpdatedAt
              ? priceLevelUpdatedAt.toISOString()
              : null,
            operatingStatus,
            distanceMiles: restaurantContext?.distanceMiles ?? null,
            topFood: snippets
              .sort((a, b) => b.qualityScore - a.qualityScore)
              .slice(0, TOP_RESTAURANT_FOOD_SNIPPETS),
          };
        },
      );

    return this.sortRestaurants(results, restaurantOrder);
  }

  private sortRestaurants(
    restaurants: RestaurantResultDto[],
    restaurantOrder: string,
  ): RestaurantResultDto[] {
    const order = restaurantOrder?.toLowerCase() ?? '';
    if (order.includes('contextual_food_quality') && order.includes('asc')) {
      return restaurants.sort((a, b) => a.contextualScore - b.contextualScore);
    }
    return restaurants.sort((a, b) => b.contextualScore - a.contextualScore);
  }

  private isRestaurantOpenNow(
    metadataValue: Prisma.JsonValue | null | undefined,
    referenceDate: Date,
  ): boolean | null {
    const status = this.evaluateOperatingStatus(metadataValue, referenceDate);
    if (!status) {
      return null;
    }
    return status.isOpen;
  }

  private evaluateOperatingStatus(
    metadataValue: Prisma.JsonValue | null | undefined,
    referenceDate: Date,
  ): {
    isOpen: boolean;
    closesAtDisplay?: string | null;
    closesInMinutes?: number | null;
    nextOpenDisplay?: string | null;
  } | null {
    const metadata = this.coerceRecord(
      metadataValue,
    ) as RestaurantMetadata | null;
    if (!metadata) {
      return null;
    }

    const schedule = this.buildDailySchedule(metadata);
    if (!schedule) {
      return null;
    }

    const timeContext = this.getLocalTimeContext(metadata, referenceDate);
    if (!timeContext) {
      return null;
    }

    const daySegments = schedule[timeContext.dayKey] || [];
    const dayIndex = DAY_KEYS.indexOf(timeContext.dayKey);
    const previousDayKey =
      DAY_KEYS[(dayIndex + DAY_KEYS.length - 1) % DAY_KEYS.length];
    const previousDaySegments = schedule[previousDayKey] || [];

    for (const segment of daySegments) {
      if (this.matchesSegment(segment, timeContext.minutes, false)) {
        const minutesUntilClose = this.computeMinutesUntilClose(
          segment,
          timeContext.minutes,
          false,
        );
        return {
          isOpen: true,
          closesAtDisplay: this.formatMinutesToDisplay(segment.end),
          closesInMinutes: minutesUntilClose,
          nextOpenDisplay: null,
        };
      }
    }

    for (const segment of previousDaySegments) {
      if (
        segment.crossesMidnight &&
        this.matchesSegment(segment, timeContext.minutes, true)
      ) {
        const minutesUntilClose = this.computeMinutesUntilClose(
          segment,
          timeContext.minutes,
          true,
        );
        return {
          isOpen: true,
          closesAtDisplay: this.formatMinutesToDisplay(segment.end),
          closesInMinutes: minutesUntilClose,
          nextOpenDisplay: null,
        };
      }
    }

    const nextOpenDisplay = this.findNextOpenDisplay(schedule, timeContext);

    return {
      isOpen: false,
      closesAtDisplay: null,
      closesInMinutes: null,
      nextOpenDisplay,
    };
  }

  private findNextOpenDisplay(
    schedule: DailySchedule,
    timeContext: { dayKey: DayKey; minutes: number },
  ): string | null {
    const startDayIndex = DAY_KEYS.indexOf(timeContext.dayKey);
    if (startDayIndex < 0) {
      return null;
    }

    for (let offset = 0; offset < DAY_KEYS.length; offset += 1) {
      const dayIndex = (startDayIndex + offset) % DAY_KEYS.length;
      const dayKey = DAY_KEYS[dayIndex];
      const segments = schedule[dayKey] || [];

      for (const segment of segments) {
        if (offset === 0 && segment.start <= timeContext.minutes) {
          continue;
        }

        const timeLabel = this.formatMinutesToDisplay(segment.start);
        const dayLabel = this.describeDayOffset(dayKey, offset);
        return dayLabel ? `${timeLabel} ${dayLabel}` : timeLabel;
      }
    }

    return null;
  }

  private describeDayOffset(dayKey: DayKey, offset: number): string {
    if (offset === 0) {
      return '';
    }
    if (offset === 1) {
      return 'tomorrow';
    }
    const label = dayKey.slice(0, 3);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  private buildDailySchedule(
    metadata: RestaurantMetadata,
  ): DailySchedule | null {
    const hoursValue = metadata.hours;
    if (!hoursValue) {
      return null;
    }

    const schedule: Partial<Record<DayKey, DaySegment[]>> = {};
    const hoursRecord = this.coerceRecord(hoursValue);

    if (hoursRecord) {
      for (const [rawKey, value] of Object.entries(hoursRecord)) {
        if (this.isHoursMetadataProperty(rawKey)) {
          continue;
        }

        const dayKey = this.normalizeDayKey(rawKey);
        if (!dayKey) {
          continue;
        }

        const segments = this.parseHourValue(value);
        if (segments.length) {
          schedule[dayKey] = segments;
        }
      }
    } else if (Array.isArray(hoursValue)) {
      for (const entry of hoursValue) {
        if (!entry || typeof entry !== 'object') {
          continue;
        }

        const entryRecord = entry as Record<string, unknown>;
        const rawDay = entryRecord.day ?? entryRecord.weekday;
        const dayKey = this.normalizeDayKey(
          typeof rawDay === 'string' ? rawDay : '',
        );
        if (!dayKey) {
          continue;
        }

        const value =
          entryRecord.value ?? entryRecord.hours ?? entryRecord.range ?? entry;
        const segments = this.parseHourValue(value);
        if (segments.length) {
          schedule[dayKey] = segments;
        }
      }
    } else if (typeof hoursValue === 'string') {
      const segments = this.parseHourValue(hoursValue);
      if (segments.length) {
        for (const day of DAY_KEYS) {
          schedule[day] = segments;
        }
      }
    }

    if (Object.keys(schedule).length === 0) {
      return null;
    }

    return schedule as DailySchedule;
  }

  private isHoursMetadataProperty(key: string): boolean {
    const normalized = key.toLowerCase();
    return (
      normalized === 'timezone' ||
      normalized === 'time_zone' ||
      normalized === 'tz' ||
      normalized === 'utc_offset_minutes' ||
      normalized === 'status'
    );
  }

  private parseHourValue(value: unknown): DaySegment[] {
    if (!value) {
      return [];
    }

    if (typeof value === 'string') {
      return this.parseHourString(value);
    }

    if (Array.isArray(value)) {
      return value.flatMap((entry) => this.parseHourValue(entry));
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const openValue = record.open ?? record.start ?? record.opens;
      const closeValue = record.close ?? record.end ?? record.closes;
      if (typeof openValue === 'string' && typeof closeValue === 'string') {
        return [this.buildSegmentFromHHMM(openValue, closeValue)];
      }
    }

    return [];
  }

  private parseHourString(value: string): DaySegment[] {
    const rangeMatch = value.match(
      /(\d{1,2}:?\d{0,2}\s?(am|pm)?)[^\d]+(\d{1,2}:?\d{0,2}\s?(am|pm)?)/i,
    );
    if (!rangeMatch) {
      return [];
    }

    const openRaw = rangeMatch[1];
    const closeRaw = rangeMatch[3];
    return [this.buildSegmentFromHHMM(openRaw, closeRaw)];
  }

  private buildSegmentFromHHMM(openRaw: string, closeRaw: string): DaySegment {
    const openMinutes = this.parseTimeString(openRaw);
    const closeMinutes = this.parseTimeString(closeRaw);

    if (openMinutes === null || closeMinutes === null) {
      return { start: 0, end: 0, crossesMidnight: false };
    }

    if (closeMinutes <= openMinutes) {
      return {
        start: openMinutes,
        end: closeMinutes,
        crossesMidnight: true,
      };
    }

    return {
      start: openMinutes,
      end: closeMinutes,
      crossesMidnight: false,
    };
  }

  private parseTimeString(value: string): number | null {
    const trimmed = value.trim().toLowerCase();
    const match = trimmed.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (!match) {
      return null;
    }

    let hour = Number(match[1]);
    const minutes = match[2] ? Number(match[2]) : 0;
    const period = match[3];

    if (period === 'pm' && hour < 12) {
      hour += 12;
    } else if (period === 'am' && hour === 12) {
      hour = 0;
    }

    return hour * 60 + minutes;
  }

  private matchesSegment(
    segment: DaySegment,
    minutes: number,
    previousDay: boolean,
  ): boolean {
    if (segment.crossesMidnight) {
      if (previousDay) {
        return minutes < segment.end;
      }
      return minutes >= segment.start;
    }

    return minutes >= segment.start && minutes < segment.end;
  }

  private computeMinutesUntilClose(
    segment: DaySegment,
    minutes: number,
    previousDay: boolean,
  ): number {
    if (segment.crossesMidnight) {
      if (previousDay) {
        return Math.max(segment.end - minutes, 0);
      }
      return Math.max(24 * 60 - minutes + segment.end, 0);
    }

    return Math.max(segment.end - minutes, 0);
  }

  private computeDistanceMiles(
    userLocation: UserLocationInput,
    latitude: number,
    longitude: number,
  ): number | null {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const earthRadiusMiles = 3958.8;

    const lat1 = toRad(userLocation.lat);
    const lon1 = toRad(userLocation.lng);
    const lat2 = toRad(latitude);
    const lon2 = toRad(longitude);

    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = earthRadiusMiles * c;
    return Number.isFinite(distance) ? distance : null;
  }

  private formatMinutesToDisplay(minutes: number): string {
    const totalMinutes = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
    let hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const period = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    if (hour === 0) {
      hour = 12;
    }
    const minuteText = minute.toString().padStart(2, '0');
    return `${hour}:${minuteText} ${period}`;
  }

  private getLocalTimeContext(
    metadata: RestaurantMetadata,
    referenceDate: Date,
  ): LocalTimeContext | null {
    const timezone = this.extractTimeZone(metadata);
    if (timezone) {
      try {
        const formatter = new Intl.DateTimeFormat('en-US', {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          weekday: 'long',
        });
        const parts = formatter.formatToParts(referenceDate);
        const hourPart = parts.find((part) => part.type === 'hour');
        const minutePart = parts.find((part) => part.type === 'minute');
        const weekdayPart = parts.find((part) => part.type === 'weekday');
        if (!hourPart || !minutePart || !weekdayPart) {
          return null;
        }

        const dayKey = this.normalizeDayKey(weekdayPart.value);
        if (!dayKey) {
          return null;
        }

        const hour = Number(hourPart.value);
        const minute = Number(minutePart.value);
        if (Number.isNaN(hour) || Number.isNaN(minute)) {
          return null;
        }

        return {
          dayKey,
          minutes: hour * 60 + minute,
          timezoneApplied: true,
        };
      } catch (error) {
        this.logger.warn('Failed to evaluate timezone for open-now filter', {
          timezone,
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
        });
      }
    }

    const offset = this.extractUtcOffset(metadata);
    if (offset !== null) {
      const adjusted = new Date(referenceDate.getTime() + offset * 60 * 1000);
      const dayKey = DAY_KEYS[adjusted.getUTCDay()];
      const minutes = adjusted.getUTCHours() * 60 + adjusted.getUTCMinutes();
      return {
        dayKey,
        minutes,
        timezoneApplied: false,
      };
    }

    return null;
  }

  private extractTimeZone(metadata: RestaurantMetadata): string | null {
    const candidates: Array<string | undefined> = [
      metadata.timezone,
      metadata.timeZone,
      metadata.time_zone,
      metadata.tz,
    ];

    const hoursRecord = this.coerceRecord(metadata.hours);
    if (hoursRecord) {
      const nestedCandidate =
        hoursRecord.timezone ??
        hoursRecord.timeZone ??
        hoursRecord.time_zone ??
        hoursRecord.tz;
      if (typeof nestedCandidate === 'string') {
        candidates.push(nestedCandidate);
      }
    }

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }

    return null;
  }

  private extractUtcOffset(metadata: RestaurantMetadata): number | null {
    const candidates: Array<number | string | undefined> = [
      metadata.utc_offset_minutes,
    ];
    const hoursRecord = this.coerceRecord(metadata.hours);
    if (hoursRecord) {
      const offsetCandidate = (
        hoursRecord as {
          utc_offset_minutes?: unknown;
        }
      ).utc_offset_minutes;
      if (
        typeof offsetCandidate === 'number' ||
        (typeof offsetCandidate === 'string' && offsetCandidate.trim())
      ) {
        candidates.push(offsetCandidate);
      }
    }

    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate;
      }
      if (typeof candidate === 'string' && candidate.trim()) {
        const parsed = Number(candidate);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return null;
  }

  private normalizeDayKey(value: string): DayKey | null {
    const normalized = value.trim().toLowerCase();
    const match = DAY_KEYS.find((day) => normalized.startsWith(day));
    return match ?? null;
  }

  private coerceRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  }

  private toNumber(value?: Prisma.Decimal | number | string | null): number {
    if (value === null || value === undefined) {
      return 0;
    }

    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return Number(value) || 0;
  }

  private toOptionalNumber(
    value?: Prisma.Decimal | number | string | null,
  ): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    return null;
  }

  private describePriceLevel(level: number | null): {
    symbol: string | null;
    text: string | null;
  } {
    if (level === null) {
      return { symbol: null, text: null };
    }

    const normalized = Math.round(level);
    const clamped = Math.max(0, Math.min(PRICE_SYMBOLS.length - 1, normalized));
    return {
      symbol: PRICE_SYMBOLS[clamped],
      text: PRICE_DESCRIPTORS[clamped],
    };
  }
}
