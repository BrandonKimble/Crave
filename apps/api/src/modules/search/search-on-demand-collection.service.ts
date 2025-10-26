import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { KeywordSearchOrchestratorService } from '../content-processing/reddit-collector/keyword-search-orchestrator.service';
import { EntityPriorityScore } from '../content-processing/reddit-collector/entity-priority-selection.service';
import { LoggerService } from '../../shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MapBoundsDto,
  QueryPlan,
  SearchQueryRequestDto,
  QueryEntityDto,
  RestaurantResultDto,
} from './dto/search-query.dto';

interface DiagnosticsContext {
  request: SearchQueryRequestDto;
  plan: QueryPlan;
  restaurantCount: number;
  restaurantResults: RestaurantResultDto[];
}

@Injectable()
export class SearchOnDemandCollectionService {
  private readonly cooldownMs: number;
  private readonly maxEntities: number;
  private readonly logger: LoggerService;
  private readonly lastTriggered = new Map<string, number>();

  constructor(
    private readonly keywordOrchestrator: KeywordSearchOrchestratorService,
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('SearchOnDemandCollection');
    this.cooldownMs = this.resolveCooldown();
    this.maxEntities = this.resolveMaxEntities();
  }

  async processDiagnostics(context: DiagnosticsContext): Promise<void> {
    const targets = this.collectPriorityTargets(context.request);
    if (!targets.length) {
      return;
    }

    const targetSubreddits = await this.resolveTargetSubreddits(
      context.request,
      context.restaurantResults,
    );
    if (!targetSubreddits.length) {
      return;
    }

    const reasonKey = this.buildReasonKey(targets, targetSubreddits);
    if (!this.canTrigger(reasonKey)) {
      return;
    }

    const keywords = this.collectKeywords(context.request);
    try {
      this.logger.info('Triggering keyword on-demand collection', {
        reasonKey,
        restaurantCount: context.restaurantCount,
        subreddits: targetSubreddits,
        keywords,
        targetCount: targets.length,
      });

      await Promise.allSettled(
        targetSubreddits.map((subreddit) =>
          this.keywordOrchestrator.enqueueKeywordSearchJob({
            subreddit,
            entities: targets,
            source: 'on_demand',
            trackCompletion: false,
          }),
        ),
      );
      this.lastTriggered.set(reasonKey, Date.now());
    } catch (error) {
      this.logger.warn('Failed to trigger on-demand collection', {
        reasonKey,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private resolveCooldown(): number {
    const raw = process.env.SEARCH_ON_DEMAND_COOLDOWN_MS;
    const parsed = raw ? Number(raw) : Number.NaN;
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
    return 5 * 60 * 1000; // 5 minutes default
  }

  private resolveMaxEntities(): number {
    const raw = process.env.SEARCH_ON_DEMAND_MAX_ENTITIES;
    const parsed = raw ? Number(raw) : Number.NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.min(parsed, 10);
    }
    return 5;
  }

  private canTrigger(reasonKey: string): boolean {
    const lastTime = this.lastTriggered.get(reasonKey);
    if (!lastTime) {
      return true;
    }
    return Date.now() - lastTime >= this.cooldownMs;
  }

  private buildReasonKey(
    targets: EntityPriorityScore[],
    subreddits: string[],
  ): string {
    const targetSegment = targets
      .map((target) => target.entityId)
      .sort()
      .join('-');
    const subredditSegment = subreddits.sort().join('-') || 'all';
    return `${targetSegment || 'none'}:${subredditSegment}`;
  }

  private collectKeywords(request: SearchQueryRequestDto): string[] {
    const buckets = [
      ...(request.entities.food ?? []),
      ...(request.entities.foodAttributes ?? []),
      ...(request.entities.restaurants ?? []),
      ...(request.entities.restaurantAttributes ?? []),
    ];
    return buckets
      .map((entity) => entity.normalizedName)
      .filter((name): name is string => Boolean(name))
      .slice(0, 10);
  }

  private collectPriorityTargets(
    request: SearchQueryRequestDto,
  ): EntityPriorityScore[] {
    const targets: EntityPriorityScore[] = [];

    const pushTargets = (
      entities: QueryEntityDto[] | undefined,
      entityType: EntityType,
    ) => {
      for (const entity of entities ?? []) {
        if (!entity.normalizedName && !entity.entityIds?.length) {
          continue;
        }
        const entityId =
          entity.entityIds?.[0] ||
          `temp-${entityType}-${entity.normalizedName}`.toLowerCase();

        if (targets.some((target) => target.entityId === entityId)) {
          continue;
        }

        targets.push({
          entityId,
          entityName: entity.normalizedName || entityId,
          entityType,
          score: 1,
          factors: {
            dataRecency: 0.5,
            dataQuality: 0.5,
            userDemand: 1,
          },
          isNewEntity: true,
        });

        if (targets.length >= this.maxEntities) {
          return;
        }
      }
    };

    pushTargets(request.entities.food, 'food');
    if (targets.length < this.maxEntities) {
      pushTargets(request.entities.foodAttributes, 'food_attribute');
    }
    if (targets.length < this.maxEntities) {
      pushTargets(request.entities.restaurants, 'restaurant');
    }
    if (targets.length < this.maxEntities) {
      pushTargets(
        request.entities.restaurantAttributes,
        'restaurant_attribute',
      );
    }

    return targets;
  }

  private async resolveTargetSubreddits(
    request: SearchQueryRequestDto,
    restaurantResults: RestaurantResultDto[],
  ): Promise<string[]> {
    const subreddits = await this.prisma.subreddit.findMany({
      where: { isActive: true },
      select: {
        name: true,
        centerLatitude: true,
        centerLongitude: true,
      },
    });
    if (!subreddits.length) {
      return [];
    }

    const center = this.resolveQueryCenter(request.bounds, restaurantResults);
    if (!center) {
      return subreddits.map((row) => row.name);
    }

    const candidates = subreddits
      .map((row) => ({
        name: row.name,
        latitude: this.toNumeric(row.centerLatitude),
        longitude: this.toNumeric(row.centerLongitude),
      }))
      .filter(
        (row) =>
          Number.isFinite(row.latitude ?? NaN) &&
          Number.isFinite(row.longitude ?? NaN),
      ) as Array<{ name: string; latitude: number; longitude: number }>;

    if (!candidates.length) {
      return subreddits.map((row) => row.name);
    }

    const nearest = candidates.reduce(
      (best, current) => {
        const distance = this.haversineDistance(
          center.lat,
          center.lng,
          current.latitude,
          current.longitude,
        );
        if (!best || distance < best.distance) {
          return { ...current, distance };
        }
        return best;
      },
      null as null | { name: string; distance: number },
    );

    return nearest ? [nearest.name] : subreddits.map((row) => row.name);
  }

  private resolveQueryCenter(
    bounds: MapBoundsDto | undefined,
    restaurantResults: RestaurantResultDto[],
  ): { lat: number; lng: number } | null {
    if (bounds) {
      return {
        lat: (bounds.northEast.lat + bounds.southWest.lat) / 2,
        lng: (bounds.northEast.lng + bounds.southWest.lng) / 2,
      };
    }

    for (const result of restaurantResults) {
      if (
        typeof result.latitude === 'number' &&
        typeof result.longitude === 'number'
      ) {
        return { lat: result.latitude, lng: result.longitude };
      }
    }

    return null;
  }

  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const toRad = (value: number) => (value * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const earthRadiusKm = 6371;
    return earthRadiusKm * c;
  }

  private toNumeric(
    value: Prisma.Decimal | number | null | undefined,
  ): number | null {
    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }
    if (typeof value === 'number') {
      return value;
    }
    return null;
  }
}
