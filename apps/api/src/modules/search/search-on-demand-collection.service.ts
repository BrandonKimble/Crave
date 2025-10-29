import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { KeywordSearchOrchestratorService } from '../content-processing/reddit-collector/keyword-search-orchestrator.service';
import { EntityPriorityScore } from '../content-processing/reddit-collector/entity-priority-selection.service';
import { LoggerService } from '../../shared';
import { PrismaService } from '../../prisma/prisma.service';
import { KeywordSearchMetricsService } from '../content-processing/reddit-collector/keyword-search-metrics.service';
import { SearchSubredditResolverService } from './search-subreddit-resolver.service';
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
  private readonly localCooldownCache = new Map<string, number>();

  constructor(
    private readonly keywordOrchestrator: KeywordSearchOrchestratorService,
    private readonly prisma: PrismaService,
    private readonly keywordSearchMetrics: KeywordSearchMetricsService,
    private readonly subredditResolver: SearchSubredditResolverService,
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

    const referenceLocations = context.restaurantResults
      .map((result) => ({
        latitude:
          typeof result.latitude === 'number' ? result.latitude : null,
        longitude:
          typeof result.longitude === 'number' ? result.longitude : null,
      }))
      .filter(
        (location) =>
          location.latitude !== null && location.longitude !== null,
      );

    const targetSubreddits = await this.subredditResolver.resolve({
      bounds: context.request.bounds ?? null,
      referenceLocations: referenceLocations.length
        ? referenceLocations
        : undefined,
    });
    if (!targetSubreddits.length) {
      return;
    }

    const reasonKey = this.buildReasonKey(targets, targetSubreddits);
    if (!(await this.canTrigger(reasonKey))) {
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

      const results = await Promise.allSettled(
        targetSubreddits.map((subreddit) =>
          this.keywordOrchestrator.enqueueKeywordSearchJob({
            subreddit,
            entities: targets,
            source: 'on_demand',
            trackCompletion: false,
          }),
        ),
      );
      const successfulSubreddits = targetSubreddits.filter(
        (_subreddit, index) => results[index]?.status === 'fulfilled',
      );
      const successfulJobs = successfulSubreddits.length;

      if (successfulJobs > 0) {
        this.keywordSearchMetrics.recordOnDemandEnqueue({
          reasonKey,
          subredditCount: successfulJobs,
          subreddits: successfulSubreddits,
          entityCount: targets.length,
          keywords,
        });
      } else {
        this.logger.warn('No on-demand keyword searches were enqueued', {
          reasonKey,
        });
      }
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

  private async canTrigger(reasonKey: string): Promise<boolean> {
    const now = Date.now();
    const cached = this.localCooldownCache.get(reasonKey);
    if (cached && now - cached < this.cooldownMs) {
      return false;
    }

    const acquired = await this.acquireCooldown(reasonKey, new Date(now));
    if (acquired) {
      this.localCooldownCache.set(reasonKey, now);
      return true;
    }

    const record = await this.prisma.keywordSearchTrigger.findUnique({
      where: { reasonKey },
      select: { lastTriggeredAt: true },
    });

    if (record) {
      this.localCooldownCache.set(reasonKey, record.lastTriggeredAt.getTime());
    }

    return false;
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

  private async acquireCooldown(
    reasonKey: string,
    now: Date,
  ): Promise<boolean> {
    const cutoff = new Date(now.getTime() - this.cooldownMs);

    const updated = await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE "search_cooldowns"
        SET "last_triggered_at" = ${now}, "updated_at" = ${now}
        WHERE "reason_key" = ${reasonKey} AND "last_triggered_at" <= ${cutoff}
      `,
    );

    if (Number(updated) > 0) {
      return true;
    }

    const inserted = await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO "search_cooldowns" ("reason_key", "last_triggered_at", "created_at", "updated_at")
        VALUES (${reasonKey}, ${now}, ${now}, ${now})
        ON CONFLICT ("reason_key") DO NOTHING
      `,
    );

    return Number(inserted) > 0;
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

  
}
