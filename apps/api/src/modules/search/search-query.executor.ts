import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  FoodResultDto,
  QueryEntityDto,
  QueryPlan,
  RestaurantFoodSnippetDto,
  RestaurantResultDto,
  SearchQueryRequestDto,
} from './dto/search-query.dto';

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

type ConnectionWithEntities = Prisma.ConnectionGetPayload<{
  include: {
    food: {
      select: {
        entityId: true;
        name: true;
        aliases: true;
      };
    };
    restaurant: {
      select: {
        entityId: true;
        name: true;
        aliases: true;
        restaurantQualityScore: true;
        latitude: true;
        longitude: true;
        address: true;
        restaurantAttributes: true;
        restaurantMetadata: true;
      };
    };
  };
}>;

interface ExecuteParams {
  plan: QueryPlan;
  request: SearchQueryRequestDto;
  pagination: { skip: number; take: number };
  perRestaurantLimit: number;
  includeSqlPreview?: boolean;
}

interface ExecuteResult {
  foodResults: FoodResultDto[];
  restaurantResults: RestaurantResultDto[];
  totalFoodCount: number;
  metadata: {
    boundsApplied: boolean;
    openNowApplied: boolean;
    openNowSupportedRestaurants: number;
    openNowUnsupportedRestaurants: number;
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
  ) {
    this.logger = loggerService.setContext('SearchQueryExecutor');
    this.diagnosticLogging =
      (process.env.SEARCH_VERBOSE_DIAGNOSTICS || '').toLowerCase() === 'true';
  }

  async execute(params: ExecuteParams): Promise<ExecuteResult> {
    const { plan, request, pagination, perRestaurantLimit, includeSqlPreview } =
      params;

    const filterMetadata = { boundsApplied: false };
    const where = this.buildConnectionWhere(request, filterMetadata);

    const [connections, totalFoodCount] = await Promise.all([
      this.prisma.connection.findMany({
        where,
        include: this.buildConnectionInclude(),
        orderBy: this.resolveFoodOrder(plan),
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.connection.count({ where }),
    ]);

    const openFilter = request.openNow
      ? this.filterByOpenNow(connections)
      : {
          connections,
          applied: false,
          supportedCount: 0,
          unsupportedCount: 0,
        };

    const limitedConnections = this.applyPerRestaurantLimit(
      openFilter.connections,
      perRestaurantLimit,
    );

    const foodResults = this.mapFoodResults(limitedConnections);
    const restaurantResults =
      plan.format === 'dual_list'
        ? this.mapRestaurantResults(
            limitedConnections,
            plan.ranking.restaurantOrder,
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
      });
    }

    return {
      foodResults,
      restaurantResults,
      totalFoodCount,
      metadata: {
        boundsApplied: filterMetadata.boundsApplied,
        openNowApplied: openFilter.applied,
        openNowSupportedRestaurants: openFilter.supportedCount,
        openNowUnsupportedRestaurants: openFilter.unsupportedCount,
      },
      sqlPreview: includeSqlPreview
        ? this.buildSqlPreview(where, plan)
        : null,
    };
  }

  private buildConnectionInclude() {
    return {
      food: {
        select: {
          entityId: true,
          name: true,
          aliases: true,
        },
      },
      restaurant: {
        select: {
          entityId: true,
          name: true,
          aliases: true,
          restaurantQualityScore: true,
          latitude: true,
          longitude: true,
          address: true,
          restaurantAttributes: true,
          restaurantMetadata: true,
        },
      },
    } satisfies Prisma.ConnectionInclude;
  }

  private buildConnectionWhere(
    request: SearchQueryRequestDto,
    metadata: { boundsApplied: boolean },
  ): Prisma.ConnectionWhereInput {
    const where: Prisma.ConnectionWhereInput = {};
    let restaurantWhere: Prisma.EntityWhereInput | undefined;

    const restaurantIds = this.collectEntityIds(request.entities.restaurants);
    if (restaurantIds.length) {
      where.restaurantId = { in: restaurantIds };
    }

    const foodIds = this.collectEntityIds(request.entities.food);
    if (foodIds.length) {
      where.foodId = { in: foodIds };
    }

    const foodAttributeIds = this.collectEntityIds(
      request.entities.foodAttributes,
    );
    if (foodAttributeIds.length) {
      where.foodAttributes = { hasSome: foodAttributeIds };
    }

    const restaurantAttributeIds = this.collectEntityIds(
      request.entities.restaurantAttributes,
    );
    if (restaurantAttributeIds.length) {
      restaurantWhere = this.mergeEntityWhere(restaurantWhere, {
        restaurantAttributes: { hasSome: restaurantAttributeIds },
      });
    }

    if (request.bounds) {
      restaurantWhere = this.mergeEntityWhere(restaurantWhere, {
        latitude: {
          gte: request.bounds.southWest.lat,
          lte: request.bounds.northEast.lat,
        },
        longitude: {
          gte: request.bounds.southWest.lng,
          lte: request.bounds.northEast.lng,
        },
      });
      metadata.boundsApplied = true;
    }

    if (restaurantWhere) {
      where.restaurant = restaurantWhere;
    }

    return where;
  }

  private mergeEntityWhere(
    existing: Prisma.EntityWhereInput | undefined,
    addition: Prisma.EntityWhereInput,
  ): Prisma.EntityWhereInput {
    if (!existing) {
      return { ...addition };
    }
    return { ...existing, ...addition };
  }

  private collectEntityIds(entities?: QueryEntityDto[]): string[] {
    if (!entities?.length) {
      return [];
    }

    const ids = entities.flatMap((entity) => entity.entityIds).filter(Boolean);
    return Array.from(new Set(ids));
  }

  private resolveFoodOrder(plan: QueryPlan) {
    const order = plan.ranking.foodOrder?.toLowerCase() ?? '';
    if (order.includes('food_quality_score') && order.includes('desc')) {
      return { foodQualityScore: 'desc' as const };
    }
    if (order.includes('food_quality_score') && order.includes('asc')) {
      return { foodQualityScore: 'asc' as const };
    }
    return { foodQualityScore: 'desc' as const };
  }

  private filterByOpenNow(
    connections: ConnectionWithEntities[],
  ): {
    connections: ConnectionWithEntities[];
    applied: boolean;
    supportedCount: number;
    unsupportedCount: number;
  } {
    const filtered: ConnectionWithEntities[] = [];
    let applied = false;
    let supported = 0;
    let unsupported = 0;

    for (const connection of connections) {
      const restaurant = connection.restaurant;
      if (!restaurant) {
        continue;
      }

      const status = this.isRestaurantOpenNow(
        restaurant.restaurantMetadata,
        new Date(),
      );

      if (status === null) {
        unsupported += 1;
        continue;
      }

      applied = true;
      supported += 1;

      if (status) {
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

  private applyPerRestaurantLimit(
    connections: ConnectionWithEntities[],
    perRestaurantLimit: number,
  ): ConnectionWithEntities[] {
    if (perRestaurantLimit <= 0) {
      return connections;
    }

    const counts = new Map<string, number>();
    const limited: ConnectionWithEntities[] = [];

    for (const connection of connections) {
      const restaurantId = connection.restaurant?.entityId;
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
    connections: ConnectionWithEntities[],
  ): FoodResultDto[] {
    const results: FoodResultDto[] = [];

    for (const connection of connections) {
      const { food, restaurant } = connection;
      if (!food || !restaurant) {
        continue;
      }

      results.push({
        connectionId: connection.connectionId,
        foodId: food.entityId,
        foodName: food.name,
        foodAliases: food.aliases || [],
        restaurantId: restaurant.entityId,
        restaurantName: restaurant.name,
        restaurantAliases: restaurant.aliases || [],
        qualityScore: this.toNumber(connection.foodQualityScore),
        activityLevel: connection.activityLevel,
        mentionCount: connection.mentionCount,
        totalUpvotes: connection.totalUpvotes,
        recentMentionCount: connection.recentMentionCount,
        lastMentionedAt: connection.lastMentionedAt
          ? connection.lastMentionedAt.toISOString()
          : null,
        categories: connection.categories || [],
        foodAttributes: connection.foodAttributes || [],
      });
    }

    return results;
  }

  private mapRestaurantResults(
    connections: ConnectionWithEntities[],
    restaurantOrder: string,
  ): RestaurantResultDto[] {
    const grouped = new Map<
      string,
      {
        entity: ConnectionWithEntities['restaurant'];
        snippets: RestaurantFoodSnippetDto[];
        scoreSum: number;
        count: number;
      }
    >();

    for (const connection of connections) {
      const restaurant = connection.restaurant;
      const food = connection.food;
      if (!restaurant || !food) {
        continue;
      }

      const snippet: RestaurantFoodSnippetDto = {
        connectionId: connection.connectionId,
        foodId: food.entityId,
        foodName: food.name,
        qualityScore: this.toNumber(connection.foodQualityScore),
        activityLevel: connection.activityLevel,
      };

      const existing = grouped.get(restaurant.entityId);
      if (existing) {
        existing.snippets.push(snippet);
        existing.scoreSum += snippet.qualityScore;
        existing.count += 1;
      } else {
        grouped.set(restaurant.entityId, {
          entity: restaurant,
          snippets: [snippet],
          scoreSum: snippet.qualityScore,
          count: 1,
        });
      }
    }

    const results = Array.from(grouped.values()).map(
      ({ entity, snippets, scoreSum, count }) => ({
        restaurantId: entity!.entityId,
        restaurantName: entity!.name,
        restaurantAliases: entity!.aliases || [],
        contextualScore: count ? scoreSum / count : 0,
        restaurantQualityScore:
          entity!.restaurantQualityScore === null
            ? null
            : this.toNumber(entity!.restaurantQualityScore),
        latitude:
          entity!.latitude === null ? null : this.toNumber(entity!.latitude),
        longitude:
          entity!.longitude === null ? null : this.toNumber(entity!.longitude),
        address: entity!.address,
        topFood: snippets
          .sort((a, b) => b.qualityScore - a.qualityScore)
          .slice(0, TOP_RESTAURANT_FOOD_SNIPPETS),
      }),
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

    if (
      daySegments.some((segment) =>
        this.matchesSegment(segment, timeContext.minutes, false),
      )
    ) {
      return true;
    }

    if (
      previousDaySegments.some((segment) =>
        this.matchesSegment(segment, timeContext.minutes, true),
      )
    ) {
      return true;
    }

    return false;
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
    const rangeMatch = value.match(/(\d{1,2}:?\d{0,2}\s?(am|pm)?)[^\d]+(\d{1,2}:?\d{0,2}\s?(am|pm)?)/i);
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
        candidates.push(offsetCandidate as number | string);
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

  private buildSqlPreview(
    where: Prisma.ConnectionWhereInput,
    plan: QueryPlan,
  ): string {
    const preview = {
      where,
      ranking: plan.ranking,
    };
    return JSON.stringify(preview, null, 2);
  }
}
