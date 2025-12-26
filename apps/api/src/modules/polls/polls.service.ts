import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  PollState,
  EntityType,
  PollOptionSource,
  PollOptionResolutionStatus,
  PollTopicStatus,
  PollTopicType,
  Prisma,
  type User,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService, TextSanitizerService } from '../../shared';
import { ModerationService } from '../moderation/moderation.service';
import { PollsGateway } from './polls.gateway';
import { ListPollsQueryDto } from './dto/list-polls.dto';
import { ListUserPollsDto, UserPollActivity } from './dto/list-user-polls.dto';
import { CreatePollOptionDto } from './dto/create-poll-option.dto';
import { CastPollVoteDto } from './dto/cast-poll-vote.dto';
import {
  PollEntitySeedService,
  type CoverageContext,
} from './poll-entity-seed.service';
import { CoverageRegistryService } from '../coverage-key/coverage-registry.service';
import { QueryPollsDto } from './dto/query-polls.dto';
import { CreatePollDto } from './dto/create-poll.dto';
import { UserEventService } from '../identity/user-event.service';
import { UserStatsService } from '../identity/user-stats.service';

const MAX_OPTIONS_PER_POLL = 8;

@Injectable()
export class PollsService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly sanitizer: TextSanitizerService,
    private readonly moderation: ModerationService,
    private readonly pollEntitySeedService: PollEntitySeedService,
    private readonly gateway: PollsGateway,
    private readonly coverageRegistry: CoverageRegistryService,
    private readonly userEventService: UserEventService,
    private readonly userStats: UserStatsService,
  ) {
    this.logger = loggerService.setContext('PollsService');
  }

  async listPolls(query: ListPollsQueryDto, user?: User | null) {
    const targetState =
      (query.state as PollState | undefined) ?? PollState.active;
    const targetCoverageKey = query.coverageKey ?? query.city;

    const polls = await this.prisma.poll.findMany({
      where: {
        coverageKey: targetCoverageKey
          ? { equals: targetCoverageKey, mode: 'insensitive' }
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
            targetFoodAttributeId: true,
            targetRestaurantAttributeId: true,
            coverageKey: true,
            title: true,
            description: true,
            metadata: true,
          },
        },
      },
      take: 25,
    });

    const enriched = await this.attachCoverageLabels(polls, targetCoverageKey);
    return this.attachCurrentUserVotes(enriched, user?.userId);
  }

  async queryPolls(query: QueryPollsDto, user?: User | null) {
    let coverageKey = query.coverageKey ?? null;
    if (!coverageKey && query.bounds) {
      const resolved = await this.coverageRegistry.resolveOrCreateCoverage({
        bounds: query.bounds,
      });
      coverageKey = resolved.coverageKey ?? null;
    }
    if (!coverageKey) {
      return {
        coverageKey: null,
        coverageName: null,
        polls: [],
      };
    }
    const polls = await this.listPolls(
      {
        coverageKey: coverageKey ?? undefined,
        state: query.state,
      },
      user ?? null,
    );
    const coverageName =
      polls[0]?.coverageName ??
      (coverageKey ? await this.resolveCoverageName(coverageKey) : null);

    return {
      coverageKey,
      coverageName,
      polls,
    };
  }

  async createPoll(dto: CreatePollDto, userId: string) {
    const rawDescription = this.sanitizer.sanitizeOrThrow(dto.description, {
      maxLength: 500,
      allowEmpty: false,
    });
    const description = rawDescription.trim();
    if (!description.length) {
      throw new BadRequestException('Poll description is required');
    }

    const moderationDecision = await this.moderation.moderateText(description);
    if (!moderationDecision.allowed) {
      throw new BadRequestException(
        `Description rejected by moderation: ${moderationDecision.reason}`,
      );
    }

    let coverageKey = dto.coverageKey?.trim() || null;
    if (!coverageKey && dto.bounds) {
      const resolved = await this.coverageRegistry.resolveOrCreateCoverage({
        bounds: dto.bounds,
        allowCreate: false,
      });
      coverageKey = resolved.coverageKey ?? null;
    }
    if (!coverageKey) {
      throw new BadRequestException('Unable to resolve poll location');
    }

    const coverageContext =
      (await this.resolveCoverageContext(coverageKey)) ??
      ({
        coverageKey,
        center: undefined,
        cityLabel: null,
        countryCode: null,
      } satisfies CoverageContext);

    let targetDishId: string | null = null;
    let targetRestaurantId: string | null = null;
    let targetFoodAttributeId: string | null = null;
    let targetRestaurantAttributeId: string | null = null;
    let question = '';

    switch (dto.topicType) {
      case PollTopicType.best_dish: {
        const dish = await this.pollEntitySeedService.resolveFood({
          entityId: dto.targetDishId ?? null,
          name: dto.targetDishName ?? null,
        });
        targetDishId = dish.entityId;
        question = this.buildPollQuestion(dto.topicType, dish.name);
        break;
      }
      case PollTopicType.what_to_order: {
        const restaurant = await this.pollEntitySeedService.resolveRestaurant({
          entityId: dto.targetRestaurantId ?? null,
          name: dto.targetRestaurantName ?? null,
          coverage: coverageContext,
          sessionToken: dto.sessionToken,
        });
        targetRestaurantId = restaurant.entityId;
        question = this.buildPollQuestion(dto.topicType, restaurant.name);
        break;
      }
      case PollTopicType.best_dish_attribute: {
        const attribute = await this.pollEntitySeedService.resolveAttribute({
          entityId: dto.targetFoodAttributeId ?? null,
          name: dto.targetFoodAttributeName ?? null,
          entityType: EntityType.food_attribute,
        });
        targetFoodAttributeId = attribute.entityId;
        question = this.buildPollQuestion(dto.topicType, attribute.name);
        break;
      }
      case PollTopicType.best_restaurant_attribute: {
        const attribute = await this.pollEntitySeedService.resolveAttribute({
          entityId: dto.targetRestaurantAttributeId ?? null,
          name: dto.targetRestaurantAttributeName ?? null,
          entityType: EntityType.restaurant_attribute,
        });
        targetRestaurantAttributeId = attribute.entityId;
        question = this.buildPollQuestion(dto.topicType, attribute.name);
        break;
      }
      default: {
        throw new BadRequestException('Unsupported poll type');
      }
    }

    const questionModeration = await this.moderation.moderateText(question);
    if (!questionModeration.allowed) {
      throw new BadRequestException(
        `Poll title rejected by moderation: ${questionModeration.reason}`,
      );
    }

    const now = new Date();
    const poll = await this.prisma.$transaction(async (tx) => {
      const topic = await tx.pollTopic.create({
        data: {
          title: question,
          description,
          coverageKey,
          topicType: dto.topicType,
          createdByUserId: userId,
          targetDishId,
          targetRestaurantId,
          targetFoodAttributeId,
          targetRestaurantAttributeId,
          status: PollTopicStatus.archived,
          categoryEntityIds: [
            targetDishId,
            targetFoodAttributeId,
            targetRestaurantAttributeId,
          ].filter((value): value is string => Boolean(value)),
          seedEntityIds: [targetDishId, targetRestaurantId].filter(
            (value): value is string => Boolean(value),
          ),
          metadata: {
            source: 'user',
            createdBy: userId,
          },
        },
      });

      const createdPoll = await tx.poll.create({
        data: {
          topicId: topic.topicId,
          question,
          coverageKey,
          state: PollState.active,
          scheduledFor: now,
          launchedAt: now,
          allowUserAdditions: true,
          metadata: topic.metadata ?? Prisma.JsonNull,
          createdByUserId: userId,
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
              targetFoodAttributeId: true,
              targetRestaurantAttributeId: true,
              coverageKey: true,
              title: true,
              description: true,
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

    this.gateway.emitPollUpdate(poll.pollId);
    void this.userEventService.recordEvent({
      userId,
      eventType: 'poll_created',
      eventData: {
        pollId: poll.pollId,
        topicId: poll.topicId,
        coverageKey: poll.coverageKey,
        topicType: dto.topicType,
      },
    });
    await this.userStats.applyDelta(userId, { pollsCreatedCount: 1 });
    const [enriched] = await this.attachCoverageLabels([poll], coverageKey);
    return enriched;
  }

  async getPoll(pollId: string, user?: User | null) {
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
            targetFoodAttributeId: true,
            targetRestaurantAttributeId: true,
            coverageKey: true,
            title: true,
            description: true,
            metadata: true,
          },
        },
      },
    });

    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    const [hydrated] = await this.attachCurrentUserVotes([poll], user?.userId);
    const [enriched] = await this.attachCoverageLabels([hydrated]);
    return enriched;
  }

  private async attachCurrentUserVotes<
    T extends { pollId: string; options: Array<{ optionId: string }> },
  >(polls: T[], userId?: string | null) {
    if (!userId || !polls.length) {
      return polls;
    }

    const pollIds = polls.map((poll) => poll.pollId);
    const votes = await this.prisma.pollVote.findMany({
      where: {
        pollId: { in: pollIds },
        userId,
      },
      select: {
        pollId: true,
        optionId: true,
      },
    });

    const voteMap = votes.reduce<Map<string, Set<string>>>((acc, vote) => {
      if (!acc.has(vote.pollId)) {
        acc.set(vote.pollId, new Set());
      }
      acc.get(vote.pollId)?.add(vote.optionId);
      return acc;
    }, new Map());

    return polls.map((poll) => {
      const optionVotes = voteMap.get(poll.pollId) ?? new Set<string>();
      return {
        ...poll,
        options: poll.options.map((option) => ({
          ...option,
          currentUserVoted: optionVotes.has(option.optionId),
        })),
      };
    });
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
    const sanitizedRestaurantName = dto.restaurantName
      ? this.sanitizer
          .sanitizeOrThrow(dto.restaurantName, {
            maxLength: 140,
            allowEmpty: true,
          })
          .trim()
      : '';
    const sanitizedDishName = dto.dishName
      ? this.sanitizer
          .sanitizeOrThrow(dto.dishName, {
            maxLength: 140,
            allowEmpty: true,
          })
          .trim()
      : '';
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

    const coverageContext =
      (await this.resolveCoverageContext(
        poll.coverageKey ?? poll.topic.coverageKey ?? null,
      )) ??
      ({
        coverageKey: 'global',
        center: undefined,
        cityLabel: null,
        countryCode: null,
      } satisfies CoverageContext);

    let foodId: string | null = null;
    let restaurantId: string | null = null;
    let categoryId: string | null = null;
    let connectionId: string | null = null;
    let storedEntityId: string | null = null;

    switch (poll.topic.topicType) {
      case PollTopicType.best_dish: {
        if (!poll.topic.targetDishId) {
          throw new BadRequestException('Poll topic is misconfigured');
        }
        const restaurantResult =
          await this.pollEntitySeedService.resolveRestaurant({
            entityId: dto.restaurantId ?? null,
            name: sanitizedRestaurantName || sanitizedLabel,
            coverage: coverageContext,
            sessionToken: dto.sessionToken,
          });
        restaurantId = restaurantResult.entityId;
        categoryId = poll.topic.targetDishId;
        storedEntityId = restaurantId;
        break;
      }
      case PollTopicType.what_to_order: {
        if (!poll.topic.targetRestaurantId) {
          throw new BadRequestException('Poll topic is misconfigured');
        }
        restaurantId = poll.topic.targetRestaurantId;
        const dishResult = await this.pollEntitySeedService.resolveFood({
          entityId: dto.dishEntityId ?? null,
          name: sanitizedDishName || sanitizedLabel,
        });
        foodId = dishResult.entityId;
        storedEntityId = foodId;
        connectionId = await this.pollEntitySeedService.ensureConnection({
          restaurantId,
          foodId,
        });
        break;
      }
      case PollTopicType.best_dish_attribute: {
        if (!poll.topic.targetFoodAttributeId) {
          throw new BadRequestException('Poll topic is misconfigured');
        }
        const dishResult = await this.pollEntitySeedService.resolveFood({
          entityId: dto.dishEntityId ?? null,
          name: sanitizedDishName || null,
        });
        const restaurantResult =
          await this.pollEntitySeedService.resolveRestaurant({
            entityId: dto.restaurantId ?? null,
            name: sanitizedRestaurantName || null,
            coverage: coverageContext,
            sessionToken: dto.sessionToken,
          });
        foodId = dishResult.entityId;
        restaurantId = restaurantResult.entityId;
        storedEntityId = foodId;
        connectionId = await this.pollEntitySeedService.ensureConnection({
          restaurantId,
          foodId,
          attributeId: poll.topic.targetFoodAttributeId,
        });
        break;
      }
      case PollTopicType.best_restaurant_attribute: {
        if (!poll.topic.targetRestaurantAttributeId) {
          throw new BadRequestException('Poll topic is misconfigured');
        }
        const restaurantResult =
          await this.pollEntitySeedService.resolveRestaurant({
            entityId: dto.restaurantId ?? null,
            name: sanitizedRestaurantName || sanitizedLabel,
            coverage: coverageContext,
            sessionToken: dto.sessionToken,
          });
        restaurantId = restaurantResult.entityId;
        storedEntityId = restaurantId;
        await this.pollEntitySeedService.ensureRestaurantAttribute({
          restaurantId,
          attributeId: poll.topic.targetRestaurantAttributeId,
        });
        break;
      }
      default: {
        throw new BadRequestException('Unsupported poll type');
      }
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
      if (
        poll.topic.topicType === PollTopicType.best_restaurant_attribute &&
        restaurantId &&
        option.restaurantId === restaurantId
      ) {
        return true;
      }
      return option.label.toLowerCase() === sanitizedLabel.toLowerCase();
    });
    if (duplicate) {
      return duplicate;
    }

    const existingContribution = await this.prisma.pollOption.findFirst({
      where: { pollId, addedByUserId: userId },
      select: { optionId: true },
    });
    const existingVote = await this.prisma.pollVote.findFirst({
      where: { pollId, userId },
      select: { pollId: true },
    });

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
        resolutionStatus: PollOptionResolutionStatus.matched,
        metadata: {
          createdBy: userId,
        },
      },
    });

    this.gateway.emitPollUpdate(pollId);
    if (!existingContribution && !existingVote) {
      await this.userStats.applyDelta(userId, { pollsContributedCount: 1 });
    }
    void this.userEventService.recordEvent({
      userId,
      eventType: 'poll_option_added',
      eventData: {
        pollId,
        optionId: option.optionId,
      },
    });
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

    const result = await this.prisma.$transaction(async (tx) => {
      const option = await tx.pollOption.findUnique({
        where: { optionId: dto.optionId },
      });
      if (!option || option.pollId !== pollId) {
        throw new NotFoundException('Option not found for poll');
      }

      const now = new Date();
      const optionVote = await tx.pollVote.findFirst({
        where: {
          optionId: dto.optionId,
          userId,
        },
      });

      if (optionVote) {
        await tx.pollVote.deleteMany({
          where: {
            optionId: dto.optionId,
            userId,
          },
        });
        const remainingVotes = await tx.pollVote.count({
          where: {
            pollId,
            userId,
          },
        });
        const updatedOption = await tx.pollOption.update({
          where: { optionId: dto.optionId },
          data: {
            voteCount: { decrement: 1 },
            lastVoteAt: now,
          },
        });
        await this.updatePollMetrics(tx, pollId, {
          totalVotes: { decrement: 1 },
          ...(remainingVotes === 0
            ? { totalParticipants: { decrement: 1 } }
            : {}),
          lastAggregatedAt: now,
        });
        this.gateway.emitPollUpdate(pollId);
        return {
          option: updatedOption,
          eventType: 'poll_vote_removed',
        };
      }

      const hadAnyVote = await tx.pollVote.findFirst({
        where: {
          pollId,
          userId,
        },
        select: { pollId: true },
      });

      await tx.pollVote.create({
        data: {
          pollId,
          optionId: dto.optionId,
          userId,
        },
      });

      const updatedOption = await tx.pollOption.update({
        where: { optionId: dto.optionId },
        data: {
          voteCount: { increment: 1 },
          lastVoteAt: now,
        },
      });

      await this.updatePollMetrics(
        tx,
        pollId,
        {
          totalVotes: { increment: 1 },
          ...(hadAnyVote ? {} : { totalParticipants: { increment: 1 } }),
          lastAggregatedAt: now,
        },
        hadAnyVote
          ? undefined
          : {
              pollId,
              totalVotes: 1,
              totalParticipants: 1,
              lastAggregatedAt: now,
            },
      );

      this.gateway.emitPollUpdate(pollId);
      return {
        option: updatedOption,
        eventType: 'poll_vote_cast',
        isFirstVote: !hadAnyVote,
      };
    });

    void this.userEventService.recordEvent({
      userId,
      eventType: result.eventType,
      eventData: {
        pollId,
        optionId: dto.optionId,
      },
    });

    if (result.eventType === 'poll_vote_cast' && result.isFirstVote) {
      const existingOption = await this.prisma.pollOption.findFirst({
        where: { pollId, addedByUserId: userId },
        select: { optionId: true },
      });
      if (!existingOption) {
        await this.userStats.applyDelta(userId, { pollsContributedCount: 1 });
      }
    }

    return result.option;
  }

  async listPollsForUser(userId: string, query: ListUserPollsDto) {
    const activity = query.activity ?? UserPollActivity.participated;
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;
    const coverageKey = query.coverageKey?.trim();
    const state = query.state;

    if (activity === UserPollActivity.created) {
      const polls = await this.prisma.poll.findMany({
        where: {
          createdByUserId: userId,
          coverageKey: coverageKey
            ? { equals: coverageKey, mode: 'insensitive' }
            : undefined,
          state,
        },
        orderBy: [{ launchedAt: 'desc' }, { scheduledFor: 'desc' }],
        skip: offset,
        take: limit,
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
              targetFoodAttributeId: true,
              targetRestaurantAttributeId: true,
              coverageKey: true,
              title: true,
              description: true,
              metadata: true,
            },
          },
        },
      });

      const enriched = await this.attachCoverageLabels(polls, coverageKey);
      return {
        activity,
        polls: await this.attachCurrentUserVotes(enriched, userId),
      };
    }

    const pollIds = new Set<string>();
    if (
      activity === UserPollActivity.voted ||
      activity === UserPollActivity.participated
    ) {
      const votes = await this.prisma.pollVote.findMany({
        where: { userId },
        select: { pollId: true },
        distinct: ['pollId'],
      });
      for (const vote of votes) {
        pollIds.add(vote.pollId);
      }
    }
    if (
      activity === UserPollActivity.optionAdded ||
      activity === UserPollActivity.participated
    ) {
      const options = await this.prisma.pollOption.findMany({
        where: { addedByUserId: userId },
        select: { pollId: true },
        distinct: ['pollId'],
      });
      for (const option of options) {
        pollIds.add(option.pollId);
      }
    }
    if (activity === UserPollActivity.participated) {
      const created = await this.prisma.poll.findMany({
        where: { createdByUserId: userId },
        select: { pollId: true },
      });
      for (const poll of created) {
        pollIds.add(poll.pollId);
      }
    }

    const polls =
      pollIds.size > 0
        ? await this.prisma.poll.findMany({
            where: {
              pollId: { in: Array.from(pollIds.values()) },
              coverageKey: coverageKey
                ? { equals: coverageKey, mode: 'insensitive' }
                : undefined,
              state,
            },
            orderBy: [{ launchedAt: 'desc' }, { scheduledFor: 'desc' }],
            skip: offset,
            take: limit,
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
                  targetFoodAttributeId: true,
                  targetRestaurantAttributeId: true,
                  coverageKey: true,
                  title: true,
                  description: true,
                  metadata: true,
                },
              },
            },
          })
        : [];

    const enriched = await this.attachCoverageLabels(polls, coverageKey);
    return {
      activity,
      polls: await this.attachCurrentUserVotes(enriched, userId),
    };
  }

  private async attachCoverageLabels<
    T extends {
      coverageKey?: string | null;
      topic?: { coverageKey?: string | null } | null;
    },
  >(
    polls: T[],
    fallbackCoverageKey?: string | null,
  ): Promise<Array<T & { coverageName?: string | null }>> {
    const coverageKeys = new Set<string>();
    for (const poll of polls) {
      const rawKey =
        poll.coverageKey ??
        poll.topic?.coverageKey ??
        fallbackCoverageKey ??
        null;
      if (typeof rawKey === 'string' && rawKey.trim()) {
        coverageKeys.add(rawKey.trim().toLowerCase());
      }
    }

    if (coverageKeys.size === 0) {
      return polls;
    }

    const keys = Array.from(coverageKeys.values());
    const rows = await this.prisma.coverageArea.findMany({
      where: {
        OR: [{ coverageKey: { in: keys } }, { name: { in: keys } }],
      },
      select: {
        coverageKey: true,
        name: true,
        displayName: true,
        locationName: true,
      },
    });

    const labelByKey = new Map<string, string>();
    for (const row of rows) {
      const label = this.resolveCoverageLabel(row);
      if (!label) {
        continue;
      }
      if (row.coverageKey) {
        labelByKey.set(row.coverageKey.toLowerCase(), label);
      }
      labelByKey.set(row.name.toLowerCase(), label);
    }

    return polls.map((poll) => {
      const rawKey =
        poll.coverageKey ??
        poll.topic?.coverageKey ??
        fallbackCoverageKey ??
        null;
      const key = typeof rawKey === 'string' ? rawKey.trim().toLowerCase() : '';
      const coverageName = key ? (labelByKey.get(key) ?? null) : null;
      return {
        ...poll,
        coverageName,
      };
    });
  }

  private async resolveCoverageName(
    coverageKey: string,
  ): Promise<string | null> {
    const normalized = coverageKey.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const row = await this.prisma.coverageArea.findFirst({
      where: {
        OR: [
          { coverageKey: { equals: normalized, mode: 'insensitive' } },
          { name: { equals: normalized, mode: 'insensitive' } },
        ],
      },
      select: {
        coverageKey: true,
        name: true,
        displayName: true,
        locationName: true,
      },
    });

    return row ? this.resolveCoverageLabel(row) : null;
  }

  private resolveCoverageLabel(row: {
    displayName: string | null;
    locationName: string | null;
    coverageKey: string | null;
    name: string;
  }): string | null {
    if (row.displayName && row.displayName.trim()) {
      return row.displayName.trim();
    }
    if (row.locationName && row.locationName.trim()) {
      const [first] = row.locationName.split(',');
      return first?.trim() || row.locationName.trim();
    }
    if (row.coverageKey && row.coverageKey.trim()) {
      return row.coverageKey.trim();
    }
    return row.name?.trim() || null;
  }

  private buildPollQuestion(
    topicType: PollTopicType,
    targetName: string,
  ): string {
    switch (topicType) {
      case PollTopicType.best_dish:
        return `Best ${targetName}`;
      case PollTopicType.what_to_order:
        return `What to order at ${targetName}?`;
      case PollTopicType.best_dish_attribute:
        return `Best ${targetName} dish`;
      case PollTopicType.best_restaurant_attribute:
        return `Best ${targetName} restaurants`;
      default:
        return targetName;
    }
  }

  private async resolveCoverageContext(
    coverageKey: string | null,
  ): Promise<CoverageContext | null> {
    if (!coverageKey || !coverageKey.trim()) {
      return null;
    }

    const normalized = coverageKey.trim().toLowerCase();
    const record = await this.prisma.coverageArea.findFirst({
      where: {
        OR: [
          { coverageKey: { equals: normalized, mode: 'insensitive' } },
          { name: { equals: normalized, mode: 'insensitive' } },
        ],
      },
      select: {
        coverageKey: true,
        name: true,
        displayName: true,
        locationName: true,
        centerLatitude: true,
        centerLongitude: true,
      },
    });

    if (!record) {
      return {
        coverageKey: normalized,
      };
    }

    const centerLat = this.toNumber(record.centerLatitude);
    const centerLng = this.toNumber(record.centerLongitude);
    const center =
      centerLat !== null && centerLng !== null
        ? { lat: centerLat, lng: centerLng }
        : undefined;

    const cityLabel = this.resolveCoverageLabel({
      displayName: record.displayName,
      locationName: record.locationName,
      coverageKey: record.coverageKey,
      name: record.name,
    });

    const countryCode = this.extractCountryCode(record.locationName ?? null);

    return {
      coverageKey: (
        record.coverageKey ??
        record.name ??
        normalized
      ).toLowerCase(),
      center,
      cityLabel,
      countryCode,
    };
  }

  private extractCountryCode(value: string | null): string | null {
    if (!value) {
      return null;
    }
    const parts = value.split(',').map((part) => part.trim());
    const last = parts[parts.length - 1];
    if (!last) {
      return null;
    }
    if (last.length === 2) {
      return last.toUpperCase();
    }
    if (last.toLowerCase() === 'usa' || last.toLowerCase() === 'us') {
      return 'US';
    }
    return null;
  }

  private toNumber(value: Prisma.Decimal | number | null): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (value && typeof value === 'object' && 'toNumber' in value) {
      const asDecimal = value;
      const numeric = asDecimal.toNumber();
      return Number.isFinite(numeric) ? numeric : null;
    }
    return null;
  }

  private async updatePollMetrics(
    tx: Prisma.TransactionClient,
    pollId: string,
    data: Prisma.PollMetricUpdateInput,
    createData?: Prisma.PollMetricUncheckedCreateInput,
  ) {
    await tx.pollMetric.upsert({
      where: { pollId },
      update: data,
      create:
        createData ??
        ({
          pollId,
          totalVotes: 0,
          totalParticipants: 0,
          lastAggregatedAt:
            (data.lastAggregatedAt as Date | null | undefined) ?? null,
        } satisfies Prisma.PollMetricUncheckedCreateInput),
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
}
