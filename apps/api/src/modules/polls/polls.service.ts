import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  PollState,
  EntityType,
  OnDemandReason,
  PollOptionSource,
  PollOptionResolutionStatus,
  PollTopicStatus,
  PollTopicType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService, TextSanitizerService } from '../../shared';
import { ModerationService } from '../moderation/moderation.service';
import { OnDemandRequestService } from '../search/on-demand-request.service';
import { PollsGateway } from './polls.gateway';
import { ListPollsQueryDto } from './dto/list-polls.dto';
import { CreatePollOptionDto } from './dto/create-poll-option.dto';
import { CastPollVoteDto } from './dto/cast-poll-vote.dto';
import { CreateManualPollDto } from './dto/create-manual-poll.dto';
import { NotificationsService } from '../notifications/notifications.service';

const MAX_OPTIONS_PER_POLL = 8;

@Injectable()
export class PollsService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly sanitizer: TextSanitizerService,
    private readonly moderation: ModerationService,
    private readonly onDemandRequestService: OnDemandRequestService,
    private readonly gateway: PollsGateway,
    private readonly notifications: NotificationsService,
  ) {
    this.logger = loggerService.setContext('PollsService');
  }

  async listPolls(query: ListPollsQueryDto) {
    const targetState =
      (query.state as PollState | undefined) ?? PollState.active;

    return this.prisma.poll.findMany({
      where: {
        city: query.city
          ? { equals: query.city, mode: 'insensitive' }
          : undefined,
        state: targetState,
      },
      orderBy: [{ launchedAt: 'desc' }, { scheduledFor: 'desc' }],
      include: {
        options: {
          orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }],
        },
        metrics: true,
        topic: {
          select: {
            topicType: true,
            targetDishId: true,
            targetRestaurantId: true,
            city: true,
            title: true,
            metadata: true,
          },
        },
      },
      take: 25,
    });
  }

  async createManualPoll(dto: CreateManualPollDto, userId: string) {
    const question = this.sanitizer.sanitizeOrThrow(dto.question, {
      maxLength: 500,
    });
    const rawDescription = dto.description
      ? this.sanitizer.sanitizeOrThrow(dto.description, {
          maxLength: 500,
          allowEmpty: true,
        })
      : '';
    const description = rawDescription.trim().length
      ? rawDescription.trim()
      : null;
    const rawCity = dto.city
      ? this.sanitizer.sanitizeOrThrow(dto.city, {
          maxLength: 255,
          allowEmpty: true,
        })
      : '';

    let resolvedCity = rawCity.trim().length ? rawCity.trim() : null;
    let resolvedRegion: string | null = null;
    let resolvedCountry: string | null = null;
    let targetDishId: string | null = null;
    let targetRestaurantId: string | null = null;

    if (dto.topicType === PollTopicType.best_dish) {
      if (!dto.targetDishId) {
        throw new BadRequestException('Select a dish for this poll');
      }
      const dish = await this.prisma.entity.findUnique({
        where: { entityId: dto.targetDishId },
        select: {
          entityId: true,
          type: true,
          city: true,
          region: true,
          country: true,
        },
      });
      if (!dish || dish.type !== EntityType.food) {
        throw new BadRequestException('Invalid dish reference');
      }
      targetDishId = dish.entityId;
      resolvedCity = resolvedCity ?? dish.city ?? null;
      resolvedRegion = dish.region ?? null;
      resolvedCountry = dish.country ?? null;
    } else {
      if (!dto.targetRestaurantId) {
        throw new BadRequestException('Select a restaurant for this poll');
      }
      const restaurant = await this.prisma.entity.findUnique({
        where: { entityId: dto.targetRestaurantId },
        select: {
          entityId: true,
          type: true,
          city: true,
          region: true,
          country: true,
        },
      });
      if (!restaurant || restaurant.type !== EntityType.restaurant) {
        throw new BadRequestException('Invalid restaurant reference');
      }
      targetRestaurantId = restaurant.entityId;
      resolvedCity = resolvedCity ?? restaurant.city ?? null;
      resolvedRegion = restaurant.region ?? null;
      resolvedCountry = restaurant.country ?? null;
    }

    const now = new Date();
    const allowUserAdditions =
      dto.allowUserAdditions === undefined ? true : dto.allowUserAdditions;

    const poll = await this.prisma.$transaction(async (tx) => {
      const topic = await tx.pollTopic.create({
        data: {
          title: question,
          description,
          city: resolvedCity,
          region: resolvedRegion,
          country: resolvedCountry,
          topicType: dto.topicType,
          targetDishId,
          targetRestaurantId,
          status: PollTopicStatus.archived,
          categoryEntityIds: targetDishId ? [targetDishId] : [],
          seedEntityIds: [targetDishId, targetRestaurantId].filter(
            (value): value is string => Boolean(value),
          ),
          metadata: {
            source: 'manual_admin',
            createdBy: userId,
          },
        },
      });

      const createdPoll = await tx.poll.create({
        data: {
          topicId: topic.topicId,
          question,
          city: resolvedCity,
          region: resolvedRegion,
          state: PollState.active,
          scheduledFor: now,
          launchedAt: now,
          allowUserAdditions,
          metadata: topic.metadata ?? Prisma.JsonNull,
        },
        include: {
          options: {
            orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }],
          },
          metrics: true,
          topic: {
            select: {
              topicType: true,
              targetDishId: true,
              targetRestaurantId: true,
              city: true,
              title: true,
              metadata: true,
            },
          },
        },
      });

      const entitiesToUpdate = [targetDishId, targetRestaurantId].filter(
        (value): value is string => Boolean(value),
      );
      if (entitiesToUpdate.length) {
        await tx.entity.updateMany({
          where: { entityId: { in: entitiesToUpdate } },
          data: { lastPolledAt: now },
        });
      }

      return createdPoll;
    });

    if (dto.notifySubscribers) {
      await this.notifications.queuePollReleaseNotification({
        city: resolvedCity ?? undefined,
        pollIds: [poll.pollId],
        scheduledFor: now,
      });
    }

    this.gateway.emitPollUpdate(poll.pollId);
    this.logger.info('Created manual poll', {
      pollId: poll.pollId,
      userId,
      city: resolvedCity,
    });

    return poll;
  }

  async getPoll(pollId: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { pollId },
      include: {
        options: {
          orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }],
        },
        metrics: true,
        topic: {
          select: {
            topicType: true,
            targetDishId: true,
            targetRestaurantId: true,
            city: true,
            title: true,
            metadata: true,
          },
        },
      },
    });

    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    return poll;
  }

  async addOption(pollId: string, dto: CreatePollOptionDto, userId: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { pollId },
      include: {
        options: true,
        topic: true,
      },
    });
    if (!poll) {
      throw new NotFoundException('Poll not found');
    }
    if (poll.state !== PollState.active) {
      throw new BadRequestException('Poll is not accepting new options');
    }
    if (poll.options.length >= MAX_OPTIONS_PER_POLL) {
      throw new BadRequestException(
        'Poll already has the maximum number of options',
      );
    }

    const sanitizedLabel = this.sanitizer.sanitizeOrThrow(dto.label, {
      maxLength: 140,
    });
    const moderationDecision =
      await this.moderation.moderateText(sanitizedLabel);
    if (!moderationDecision.allowed) {
      throw new BadRequestException(
        `Option rejected by moderation: ${moderationDecision.reason}`,
      );
    }

    if (!poll.topic) {
      throw new BadRequestException('Poll topic metadata missing');
    }

    let foodId: string | null = null;
    let restaurantId = dto.restaurantId ?? null;
    let fallbackEntityId = dto.entityId ?? null;
    let categoryId: string | null = null;

    if (dto.dishEntityId) {
      const dish = await this.prisma.entity.findUnique({
        where: { entityId: dto.dishEntityId },
        select: { entityId: true, type: true },
      });
      if (!dish || dish.type !== EntityType.food) {
        throw new BadRequestException('Invalid dish reference');
      }
      foodId = dish.entityId;
    }

    if (!foodId && fallbackEntityId) {
      const fallbackEntity = await this.prisma.entity.findUnique({
        where: { entityId: fallbackEntityId },
        select: { entityId: true, type: true },
      });
      if (!fallbackEntity) {
        throw new BadRequestException('Referenced entity does not exist');
      }
      if (fallbackEntity.type === EntityType.food) {
        foodId = fallbackEntity.entityId;
      } else if (
        fallbackEntity.type === EntityType.restaurant &&
        !restaurantId
      ) {
        restaurantId = fallbackEntity.entityId;
      } else {
        fallbackEntityId = fallbackEntity.entityId;
      }
    }

    if (restaurantId) {
      const restaurant = await this.prisma.entity.findUnique({
        where: { entityId: restaurantId },
        select: { entityId: true, type: true },
      });
      if (!restaurant || restaurant.type !== EntityType.restaurant) {
        throw new BadRequestException('Invalid restaurant reference');
      }
      restaurantId = restaurant.entityId;
    }

    if (poll.topic.topicType === PollTopicType.what_to_order) {
      if (!poll.topic.targetRestaurantId) {
        throw new BadRequestException('Poll topic is misconfigured');
      }
      restaurantId = poll.topic.targetRestaurantId;

      if (!foodId) {
        throw new BadRequestException('Please select a dish for this poll');
      }
    } else {
      categoryId = poll.topic.targetDishId ?? null;
      if (!restaurantId) {
        throw new BadRequestException(
          'Please select a restaurant for this dish poll',
        );
      }
    }

    const storedEntityId = foodId ?? restaurantId ?? fallbackEntityId ?? null;

    if (poll.topic.topicType === PollTopicType.best_dish && !foodId) {
      await this.onDemandRequestService.recordRequests(
        [
          {
            term: sanitizedLabel,
            entityType: EntityType.food,
            reason: OnDemandReason.unresolved,
            entityId: null,
            metadata: {
              source: 'poll_option',
              pollId,
              restaurantId,
              userId,
            },
          },
        ],
        { source: 'poll_option', pollId, userId },
      );
    }

    let connectionId: string | null = null;
    if (restaurantId && foodId) {
      connectionId = await this.ensureConnection(restaurantId, foodId);
    }

    const duplicate = poll.options.find((option) => {
      if (connectionId && option.connectionId === connectionId) {
        return true;
      }
      if (
        !connectionId &&
        categoryId &&
        option.categoryId === categoryId &&
        option.restaurantId === restaurantId
      ) {
        return true;
      }
      return option.label.toLowerCase() === sanitizedLabel.toLowerCase();
    });
    if (duplicate) {
      return duplicate;
    }

    const option = await this.prisma.pollOption.create({
      data: {
        pollId,
        label: sanitizedLabel,
        entityId: storedEntityId,
        restaurantId,
        foodId,
        connectionId,
        categoryId,
        source: dto.entityId ? PollOptionSource.curator : PollOptionSource.user,
        addedByUserId: userId,
        resolutionStatus: storedEntityId
          ? PollOptionResolutionStatus.matched
          : PollOptionResolutionStatus.pending,
        metadata: {
          createdBy: userId,
        },
      },
    });

    this.gateway.emitPollUpdate(pollId);
    return option;
  }

  async castVote(pollId: string, dto: CastPollVoteDto, userId: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { pollId },
      select: { pollId: true, state: true },
    });
    if (!poll) {
      throw new NotFoundException('Poll not found');
    }
    if (poll.state !== PollState.active) {
      throw new BadRequestException('Poll is not active');
    }

    return this.prisma.$transaction(async (tx) => {
      const option = await tx.pollOption.findUnique({
        where: { optionId: dto.optionId },
      });
      if (!option || option.pollId !== pollId) {
        throw new NotFoundException('Option not found for poll');
      }

      const existingVote = await tx.pollVote.findUnique({
        where: {
          pollId_userId: {
            pollId,
            userId,
          },
        },
      });

      const now = new Date();
      if (existingVote?.optionId === dto.optionId) {
        return option;
      }

      if (existingVote) {
        await tx.pollVote.update({
          where: {
            pollId_userId: {
              pollId,
              userId,
            },
          },
          data: {
            optionId: dto.optionId,
            updatedAt: now,
          },
        });
        await tx.pollOption.update({
          where: { optionId: existingVote.optionId },
          data: {
            voteCount: { decrement: 1 },
          },
        });
      } else {
        await tx.pollVote.create({
          data: {
            pollId,
            optionId: dto.optionId,
            userId,
          },
        });
        await tx.pollMetric.upsert({
          where: { pollId },
          create: {
            pollId,
            totalVotes: 1,
            totalParticipants: 1,
            lastAggregatedAt: now,
          },
          update: {
            totalVotes: { increment: 1 },
            totalParticipants: { increment: 1 },
            lastAggregatedAt: now,
          },
        });
      }

      const updatedOption = await tx.pollOption.update({
        where: { optionId: dto.optionId },
        data: {
          voteCount: { increment: 1 },
          lastVoteAt: now,
        },
      });

      this.gateway.emitPollUpdate(pollId);
      return updatedOption;
    });
  }

  async closePoll(pollId: string): Promise<void> {
    await this.prisma.poll.update({
      where: { pollId },
      data: {
        state: PollState.closed,
        closedAt: new Date(),
      },
    });
  }

  private async ensureConnection(
    restaurantId: string,
    foodId: string,
  ): Promise<string> {
    const existing = await this.prisma.connection.findFirst({
      where: { restaurantId, foodId },
      select: { connectionId: true },
    });

    if (existing) {
      return existing.connectionId;
    }

    const created = await this.prisma.connection.create({
      data: {
        restaurantId,
        foodId,
        categories: [],
        foodAttributes: [],
      },
      select: { connectionId: true },
    });

    return created.connectionId;
  }
}
