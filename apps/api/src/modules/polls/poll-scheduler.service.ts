import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  PollTopicStatus,
  PollState,
  EntityType,
  PollTopicType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { NotificationsService } from '../notifications/notifications.service';
import { SearchDemandService } from '../analytics/search-demand.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface SchedulerConfig {
  topicLimit: number;
  maxPollsPerCity: number;
  cooldownDays: number;
  trendCooldownDays: number;
  demandWindowDays: number;
  minImpressions: number;
  trendMinImpressions: number;
}

@Injectable()
export class PollSchedulerService {
  private readonly logger: LoggerService;
  private readonly config: SchedulerConfig;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly notifications: NotificationsService,
    private readonly demandService: SearchDemandService,
  ) {
    this.logger = loggerService.setContext('PollSchedulerService');
    this.config = {
      topicLimit: this.resolveNumberEnv('POLL_TOPIC_LIMIT', 40),
      maxPollsPerCity: this.resolveNumberEnv('POLL_MAX_PER_CITY', 3),
      cooldownDays: this.resolveNumberEnv('POLL_DEFAULT_COOLDOWN_DAYS', 60),
      trendCooldownDays: this.resolveNumberEnv('POLL_TREND_COOLDOWN_DAYS', 30),
      demandWindowDays: this.resolveNumberEnv(
        'POLL_CITY_DEMAND_WINDOW_DAYS',
        14,
      ),
      minImpressions: this.resolveNumberEnv('POLL_CITY_MIN_IMPRESSIONS', 10),
      trendMinImpressions: this.resolveNumberEnv(
        'POLL_TREND_MIN_IMPRESSIONS',
        50,
      ),
    };
  }

  private resolveNumberEnv(key: string, fallback: number): number {
    const raw = process.env[key];
    if (!raw) {
      return fallback;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async refreshTopics(): Promise<void> {
    const since = new Date(
      Date.now() - this.config.demandWindowDays * MS_PER_DAY,
    );
    const locations = await this.demandService.listActiveLocations({
      since,
      minImpressions: this.config.minImpressions,
      limit: this.config.topicLimit,
    });

    let created = 0;
    for (const location of locations) {
      if (created >= this.config.topicLimit) {
        break;
      }
      created += await this.seedLocationTopics(
        location.locationKey,
        since,
        this.config.topicLimit - created,
      );
    }

    if (created > 0) {
      this.logger.info('Refreshed poll topics from search demand', {
        created,
      });
    }
  }

  private async seedLocationTopics(
    locationKey: string,
    since: Date,
    remainingSlots: number,
  ): Promise<number> {
    let created = 0;
    const dishCandidates = await this.demandService.getTopEntitiesForLocation({
      locationKey,
      since,
      entityTypes: [EntityType.food],
      minImpressions: this.config.minImpressions,
      limit: Math.max(1, Math.min(remainingSlots, 3)),
    });

    for (const candidate of dishCandidates) {
      if (created >= remainingSlots) {
        break;
      }
      const ok = await this.createDishTopic(locationKey, candidate);
      if (ok) {
        created += 1;
      }
    }

    if (created >= remainingSlots) {
      return created;
    }

    const restaurantCandidates =
      await this.demandService.getTopEntitiesForLocation({
        locationKey,
        since,
        entityTypes: [EntityType.restaurant],
        minImpressions: this.config.minImpressions,
        limit: Math.max(1, remainingSlots - created),
      });

    for (const candidate of restaurantCandidates) {
      if (created >= remainingSlots) {
        break;
      }
      const ok = await this.createRestaurantTopic(locationKey, candidate);
      if (ok) {
        created += 1;
      }
    }

    return created;
  }

  private async createDishTopic(
    locationKey: string,
    candidate: { entityId: string; impressions: number },
  ): Promise<boolean> {
    const entity = await this.prisma.entity.findUnique({
      where: { entityId: candidate.entityId },
      select: {
        entityId: true,
        name: true,
        lastPolledAt: true,
        city: true,
        region: true,
        country: true,
        type: true,
      },
    });

    if (!entity || entity.type !== EntityType.food) {
      return false;
    }

    if (!this.isEntityEligible(entity, candidate.impressions)) {
      return false;
    }

    const exists = await this.topicExists(
      PollTopicType.best_dish,
      entity.entityId,
      locationKey,
    );
    if (exists) {
      return false;
    }

    await this.prisma.pollTopic.create({
      data: {
        title: this.buildDishQuestion(entity.name, locationKey),
        description: `Which spot has the best ${
          entity.name
        } in ${this.formatLocation(locationKey)}?`,
        city: locationKey,
        region: entity.region,
        country: entity.country,
        topicType: PollTopicType.best_dish,
        targetDishId: entity.entityId,
        categoryEntityIds: [entity.entityId],
        seedEntityIds: [entity.entityId],
        status: PollTopicStatus.ready,
        metadata: {
          source: 'search_log',
          locationKey,
          impressions: candidate.impressions,
        } satisfies Prisma.JsonObject,
      },
    });

    return true;
  }

  private async createRestaurantTopic(
    locationKey: string,
    candidate: { entityId: string; impressions: number },
  ): Promise<boolean> {
    const entity = await this.prisma.entity.findUnique({
      where: { entityId: candidate.entityId },
      select: {
        entityId: true,
        name: true,
        lastPolledAt: true,
        city: true,
        region: true,
        country: true,
        type: true,
      },
    });

    if (!entity || entity.type !== EntityType.restaurant) {
      return false;
    }

    if (!this.isEntityEligible(entity, candidate.impressions)) {
      return false;
    }

    const exists = await this.topicExists(
      PollTopicType.what_to_order,
      entity.entityId,
      locationKey,
    );
    if (exists) {
      return false;
    }

    await this.prisma.pollTopic.create({
      data: {
        title: this.buildRestaurantQuestion(entity.name),
        description: `Help everyone decide what to order at ${entity.name}.`,
        city: locationKey,
        region: entity.region,
        country: entity.country,
        topicType: PollTopicType.what_to_order,
        targetRestaurantId: entity.entityId,
        seedEntityIds: [entity.entityId],
        status: PollTopicStatus.ready,
        metadata: {
          source: 'search_log',
          locationKey,
          impressions: candidate.impressions,
        } satisfies Prisma.JsonObject,
      },
    });

    return true;
  }

  private isEntityEligible(
    entity: { lastPolledAt: Date | null; entityId: string },
    impressions: number,
  ): boolean {
    if (!entity.lastPolledAt) {
      return true;
    }

    const cooldownCutoff = new Date(
      Date.now() - this.config.cooldownDays * MS_PER_DAY,
    );
    if (entity.lastPolledAt < cooldownCutoff) {
      return true;
    }

    const trendCutoff = new Date(
      Date.now() - this.config.trendCooldownDays * MS_PER_DAY,
    );

    if (
      impressions >= this.config.trendMinImpressions &&
      entity.lastPolledAt < trendCutoff
    ) {
      return true;
    }

    return false;
  }

  private async topicExists(
    topicType: PollTopicType,
    targetId: string,
    locationKey: string,
  ): Promise<boolean> {
    const where: Prisma.PollTopicWhereInput = {
      topicType,
      status: { in: [PollTopicStatus.draft, PollTopicStatus.ready] },
      city: locationKey,
    };

    if (topicType === PollTopicType.best_dish) {
      where.targetDishId = targetId;
    } else {
      where.targetRestaurantId = targetId;
    }

    const count = await this.prisma.pollTopic.count({ where });
    return count > 0;
  }

  @Cron('0 9 * * 4')
  async publishWeeklyPolls(): Promise<void> {
    const topics = await this.prisma.pollTopic.findMany({
      where: { status: PollTopicStatus.ready },
      orderBy: { createdAt: 'asc' },
      take: Math.max(this.config.topicLimit, 50),
    });

    const now = new Date();
    const pollsByCity = new Map<string, string[]>();
    const cityCounts = new Map<string, number>();
    let published = 0;

    for (const topic of topics) {
      const cityKey = topic.city?.toLowerCase() ?? 'global';
      const currentCount = cityCounts.get(cityKey) ?? 0;
      if (currentCount >= this.config.maxPollsPerCity) {
        continue;
      }

      const poll = await this.prisma.poll.create({
        data: {
          topicId: topic.topicId,
          question: topic.title,
          city: topic.city,
          region: topic.region,
          state: PollState.active,
          scheduledFor: now,
          launchedAt: now,
          allowUserAdditions: true,
          metadata: topic.metadata ?? Prisma.JsonNull,
        },
      });

      await this.prisma.pollTopic.update({
        where: { topicId: topic.topicId },
        data: { status: PollTopicStatus.archived },
      });

      if (topic.seedEntityIds.length) {
        await this.prisma.entity.updateMany({
          where: {
            entityId: { in: topic.seedEntityIds },
          },
          data: {
            lastPolledAt: now,
          },
        });
      }

      cityCounts.set(cityKey, currentCount + 1);
      pollsByCity.set(cityKey, [
        ...(pollsByCity.get(cityKey) ?? []),
        poll.pollId,
      ]);
      published += 1;
    }

    for (const [cityKey, pollIds] of pollsByCity.entries()) {
      await this.notifications.queuePollReleaseNotification({
        city: cityKey === 'global' ? undefined : cityKey,
        pollIds,
        scheduledFor: now,
      });
    }

    if (published > 0) {
      this.logger.info('Published weekly polls', { published });
    }
  }

  private buildDishQuestion(dishName: string, locationKey: string): string {
    return `What\\'s the best ${dishName} in ${this.formatLocation(
      locationKey,
    )} right now?`;
  }

  private buildRestaurantQuestion(restaurantName: string): string {
    return `What should we order at ${restaurantName}?`;
  }

  private formatLocation(locationKey: string): string {
    if (!locationKey || locationKey === 'global') {
      return 'your city';
    }
    const cleaned = locationKey.replace(/[_-]+/g, ' ');
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
}
