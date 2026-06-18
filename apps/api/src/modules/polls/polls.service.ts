import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  PollState,
  PollMode,
  PollCommentModerationStatus,
  PollCommentExtractionStatus,
  PollLeaderboardSubjectType,
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
import { CreateCommentDto, EditCommentDto } from './dto/create-comment.dto';
import {
  PollEntitySeedService,
  type MarketContext,
} from './poll-entity-seed.service';
import { MarketRegistryService } from '../markets/market-registry.service';
import { QueryPollsDto } from './dto/query-polls.dto';
import { CreatePollDto } from './dto/create-poll.dto';
import { UserEventService } from '../identity/user-event.service';
import { UserStatsService } from '../identity/user-stats.service';
import { LLMService } from '../external-integrations/llm/llm.service';
import { LLMPollAxis } from '../external-integrations/llm/llm.types';
import {
  EntityTextSearchService,
  type EntitySpan,
} from '../entity-text-search/entity-text-search.service';

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
    private readonly marketRegistry: MarketRegistryService,
    private readonly userEventService: UserEventService,
    private readonly userStats: UserStatsService,
    private readonly llmService: LLMService,
    private readonly entityTextSearch: EntityTextSearchService,
  ) {
    this.logger = loggerService.setContext('PollsService');
  }

  async listPolls(query: ListPollsQueryDto, user?: User | null) {
    const targetState =
      (query.state as PollState | undefined) ?? PollState.active;
    const targetMarketKey = query.marketKey ?? null;

    const polls = await this.prisma.poll.findMany({
      where: {
        marketKey: targetMarketKey
          ? { equals: targetMarketKey, mode: 'insensitive' }
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
            marketKey: true,
            title: true,
            description: true,
            metadata: true,
          },
        },
      },
      take: 25,
    });

    const enriched = await this.attachMarketLabels(polls, targetMarketKey);
    return this.attachCurrentUserVotes(enriched, user?.userId);
  }

  async queryPolls(query: QueryPollsDto, user?: User | null) {
    let resolvedMarket: Awaited<
      ReturnType<MarketRegistryService['resolveViewportCoverage']>
    > | null = null;
    let marketKey = query.marketKey ?? null;
    if (!marketKey && query.bounds) {
      resolvedMarket = await this.marketRegistry.resolveViewportCoverage({
        bounds: query.bounds,
        userLocation: query.userLocation
          ? {
              lat: query.userLocation.lat,
              lng: query.userLocation.lng,
            }
          : null,
        mode: 'polls_read',
        ensureLocalityMarkets: false,
      });
      marketKey = resolvedMarket.market?.marketKey ?? null;
    } else if (!marketKey && query.userLocation) {
      resolvedMarket = await this.marketRegistry.resolveViewportCoverage({
        userLocation: {
          lat: query.userLocation.lat,
          lng: query.userLocation.lng,
        },
        mode: 'polls_read',
        ensureLocalityMarkets: false,
      });
      marketKey = resolvedMarket.market?.marketKey ?? null;
    }
    if (!marketKey) {
      return {
        marketKey: null,
        marketName: null,
        marketStatus: resolvedMarket?.status ?? ('no_market' as const),
        candidateLocalityName:
          resolvedMarket?.resolution.candidateLocalityName ?? null,
        candidateBoundaryProvider:
          resolvedMarket?.resolution.candidateBoundaryProvider ?? null,
        candidateBoundaryId:
          resolvedMarket?.resolution.candidateBoundaryId ?? null,
        candidateBoundaryType:
          resolvedMarket?.resolution.candidateBoundaryType ?? null,
        cta: resolvedMarket?.cta ?? {
          kind: 'none' as const,
          label: null,
          prompt: null,
        },
        polls: [],
      };
    }
    const polls = await this.listPolls(
      {
        marketKey: marketKey ?? undefined,
        state: query.state,
      },
      user ?? null,
    );
    const marketName =
      polls[0]?.marketName ??
      resolvedMarket?.market?.marketShortName ??
      resolvedMarket?.market?.marketName ??
      (marketKey ? await this.resolveMarketNameForKey(marketKey) : null);

    return {
      marketKey,
      marketName,
      marketStatus: resolvedMarket?.status ?? 'resolved',
      candidateLocalityName: null,
      candidateBoundaryProvider: null,
      candidateBoundaryId: null,
      candidateBoundaryType: null,
      cta: resolvedMarket?.cta ?? {
        kind: 'create_poll' as const,
        label: marketName ? `Create a poll for ${marketName}` : 'Create a poll',
        prompt: marketName
          ? `Create a poll for ${marketName}`
          : 'Create a poll',
      },
      polls,
    };
  }

  async createPoll(dto: CreatePollDto, userId: string) {
    if (dto.question?.trim()) {
      return this.createPollFromQuestion(dto.question.trim(), dto, userId);
    }
    if (!dto.topicType) {
      throw new BadRequestException(
        'A poll question or a topicType is required',
      );
    }
    return this.createStructuredPoll(dto, userId);
  }

  private async createStructuredPoll(
    dto: CreatePollDto,
    userId: string,
    opts: {
      axis?: Prisma.InputJsonValue;
      sourceQuestion?: string;
      questionPreModerated?: boolean;
    } = {},
  ) {
    const rawDescription = this.sanitizer.sanitizeOrThrow(
      dto.description ?? opts.sourceQuestion ?? '',
      {
        maxLength: 500,
        allowEmpty: false,
      },
    );
    const description = rawDescription.trim();
    if (!description.length) {
      throw new BadRequestException('Poll description is required');
    }

    if (!opts.questionPreModerated) {
      const moderationDecision =
        await this.moderation.moderateText(description);
      if (!moderationDecision.allowed) {
        throw new BadRequestException(
          `Description rejected by moderation: ${moderationDecision.reason}`,
        );
      }
    }

    let marketKey = dto.marketKey?.trim() || null;
    if (!marketKey) {
      const resolved = await this.marketRegistry.resolveOrEnsureForPollCreation(
        {
          bounds: dto.bounds ?? null,
        },
      );
      marketKey = resolved?.marketKey ?? null;
    }
    if (!marketKey) {
      throw new BadRequestException('Unable to resolve poll market');
    }

    const marketContext =
      (await this.resolveMarketContext(marketKey)) ??
      ({
        marketKey,
        center: undefined,
        city: null,
        region: null,
        countryCode: null,
      } satisfies MarketContext);

    const topicType = dto.topicType;
    if (!topicType) {
      throw new BadRequestException('A poll topicType is required');
    }

    let targetDishId: string | null = null;
    let targetRestaurantId: string | null = null;
    let targetFoodAttributeId: string | null = null;
    let targetRestaurantAttributeId: string | null = null;
    let question = '';

    switch (topicType) {
      case PollTopicType.best_dish: {
        const dish = await this.pollEntitySeedService.resolveFood({
          entityId: dto.targetDishId ?? null,
          name: dto.targetDishName ?? null,
        });
        targetDishId = dish.entityId;
        question = this.buildPollQuestion(topicType, dish.name);
        break;
      }
      case PollTopicType.what_to_order: {
        const restaurant = await this.pollEntitySeedService.resolveRestaurant({
          entityId: dto.targetRestaurantId ?? null,
          name: dto.targetRestaurantName ?? null,
          market: marketContext,
          sessionToken: dto.sessionToken,
        });
        targetRestaurantId = restaurant.entityId;
        question = this.buildPollQuestion(topicType, restaurant.name);
        break;
      }
      case PollTopicType.best_dish_attribute: {
        const attribute = await this.pollEntitySeedService.resolveAttribute({
          entityId: dto.targetFoodAttributeId ?? null,
          name: dto.targetFoodAttributeName ?? null,
          entityType: EntityType.food_attribute,
        });
        targetFoodAttributeId = attribute.entityId;
        question = this.buildPollQuestion(topicType, attribute.name);
        break;
      }
      case PollTopicType.best_restaurant_attribute: {
        const attribute = await this.pollEntitySeedService.resolveAttribute({
          entityId: dto.targetRestaurantAttributeId ?? null,
          name: dto.targetRestaurantAttributeName ?? null,
          entityType: EntityType.restaurant_attribute,
        });
        targetRestaurantAttributeId = attribute.entityId;
        question = this.buildPollQuestion(topicType, attribute.name);
        break;
      }
      default: {
        throw new BadRequestException('Unsupported poll type');
      }
    }

    // Free-text path: the user's actual question is the poll title (not the
    // templated "Best X"); it was already moderated upstream.
    if (opts.sourceQuestion) {
      question = opts.sourceQuestion;
    }
    if (!opts.questionPreModerated) {
      const questionModeration = await this.moderation.moderateText(question);
      if (!questionModeration.allowed) {
        throw new BadRequestException(
          `Poll title rejected by moderation: ${questionModeration.reason}`,
        );
      }
    }

    const now = new Date();
    const poll = await this.prisma.$transaction(async (tx) => {
      const topic = await tx.pollTopic.create({
        data: {
          title: question,
          description,
          marketKey,
          topicType,
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
          marketKey,
          state: PollState.active,
          mode: PollMode.ranked,
          axis: opts.axis ?? Prisma.JsonNull,
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
              marketKey: true,
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
        marketKey: poll.marketKey,
        topicType: dto.topicType,
      },
    });
    await this.userStats.applyDelta(userId, { pollsCreatedCount: 1 });
    const [enriched] = await this.attachMarketLabels([poll], marketKey);
    return enriched;
  }

  /**
   * Phase 3B: free-text poll creation. Moderate the question, infer its subject
   * (ranked + axis, or discussion), then either reuse the structured creation flow
   * with the derived target, or create a topic-less discussion poll.
   */
  private async createPollFromQuestion(
    rawQuestion: string,
    dto: CreatePollDto,
    userId: string,
  ) {
    const question = this.sanitizer
      .sanitizeOrThrow(rawQuestion, { maxLength: 280, allowEmpty: false })
      .trim();
    if (!question.length) {
      throw new BadRequestException('Poll question is required');
    }

    const moderation = await this.moderation.moderateText(question);
    if (!moderation.allowed) {
      throw new BadRequestException(
        `Poll question rejected by moderation: ${moderation.reason}`,
      );
    }

    const subject = await this.llmService.inferPollSubject(question);
    const mapped =
      subject.mode === 'ranked' && subject.axis
        ? this.mapAxisToStructured(subject.axis)
        : null;

    // Discussion, or a ranked axis we cannot map onto a structured topic type.
    if (!mapped || !subject.axis) {
      return this.createDiscussionPoll(question, dto, userId);
    }

    return this.createStructuredPoll(
      {
        ...dto,
        topicType: mapped.topicType,
        description: question,
        targetDishName: mapped.targetDishName,
        targetRestaurantName: mapped.targetRestaurantName,
        targetFoodAttributeName: mapped.targetFoodAttributeName,
        targetRestaurantAttributeName: mapped.targetRestaurantAttributeName,
      },
      userId,
      {
        axis: subject.axis as unknown as Prisma.InputJsonValue,
        sourceQuestion: question,
        questionPreModerated: true,
      },
    );
  }

  /** Map an inferred axis onto the 4 structured topic types (null if unmappable). */
  private mapAxisToStructured(axis: LLMPollAxis): {
    topicType: PollTopicType;
    targetDishName?: string;
    targetRestaurantName?: string;
    targetFoodAttributeName?: string;
    targetRestaurantAttributeName?: string;
  } | null {
    if (axis.targetType === 'dish') {
      if (axis.anchor) {
        return {
          topicType: PollTopicType.what_to_order,
          targetRestaurantName: axis.anchor,
        };
      }
      if (axis.constraint?.kind === 'category') {
        return {
          topicType: PollTopicType.best_dish,
          targetDishName: axis.constraint.value,
        };
      }
      if (axis.constraint?.kind === 'dish_attribute') {
        return {
          topicType: PollTopicType.best_dish_attribute,
          targetFoodAttributeName: axis.constraint.value,
        };
      }
      return null;
    }
    // restaurant — cuisine + restaurant_attribute both rank places by an attribute.
    if (
      axis.constraint?.kind === 'restaurant_attribute' ||
      axis.constraint?.kind === 'cuisine'
    ) {
      return {
        topicType: PollTopicType.best_restaurant_attribute,
        targetRestaurantAttributeName: axis.constraint.value,
      };
    }
    return null;
  }

  /** Create a topic-less discussion poll (no axis, no options, no leaderboard). */
  private async createDiscussionPoll(
    question: string,
    dto: CreatePollDto,
    userId: string,
  ) {
    let marketKey = dto.marketKey?.trim() || null;
    if (!marketKey) {
      const resolved = await this.marketRegistry.resolveOrEnsureForPollCreation(
        {
          bounds: dto.bounds ?? null,
        },
      );
      marketKey = resolved?.marketKey ?? null;
    }
    if (!marketKey) {
      throw new BadRequestException('Unable to resolve poll market');
    }

    const now = new Date();
    const poll = await this.prisma.poll.create({
      data: {
        question,
        marketKey,
        state: PollState.active,
        mode: PollMode.discussion,
        allowUserAdditions: false,
        scheduledFor: now,
        launchedAt: now,
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
            marketKey: true,
            title: true,
            description: true,
            metadata: true,
          },
        },
      },
    });

    this.gateway.emitPollUpdate(poll.pollId);
    void this.userEventService.recordEvent({
      userId,
      eventType: 'poll_created',
      eventData: {
        pollId: poll.pollId,
        marketKey: poll.marketKey,
        mode: PollMode.discussion,
      },
    });
    await this.userStats.applyDelta(userId, { pollsCreatedCount: 1 });
    const [enriched] = await this.attachMarketLabels([poll], marketKey);
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
            marketKey: true,
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
    const [enriched] = await this.attachMarketLabels([hydrated]);
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

    if (!poll.marketKey) {
      throw new BadRequestException('Poll market metadata missing');
    }
    const marketContext =
      (await this.resolveMarketContext(poll.marketKey)) ??
      ({
        marketKey: poll.marketKey,
        center: undefined,
        city: null,
        region: null,
        countryCode: null,
      } satisfies MarketContext);

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
            market: marketContext,
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
            market: marketContext,
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
            market: marketContext,
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
        poll.topic?.topicType === PollTopicType.best_restaurant_attribute &&
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

  // ─── Comments (Phase 4) ──────────────────────────────────────────────────

  private generateCommentPublicId(): string {
    return randomBytes(12).toString('base64url'); // 16 url-safe chars
  }

  /**
   * Phase 5 gazetteer: scan a comment for KNOWN restaurant/food mentions (no LLM,
   * market-scoped) and return display spans for highlight + deeplink. Brand-new
   * entities aren't here yet — they graduate at close (§6.1).
   */
  private async highlightCommentSpans(
    body: string,
    marketKey: string | null,
  ): Promise<Prisma.InputJsonValue> {
    const spans = await this.entityTextSearch.scanForKnownEntities(
      body,
      [EntityType.restaurant, EntityType.food],
      { marketKey },
    );
    return spans as unknown as Prisma.InputJsonValue;
  }

  async postComment(pollId: string, dto: CreateCommentDto, userId: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { pollId },
      select: { pollId: true, state: true, marketKey: true },
    });
    if (!poll) {
      throw new NotFoundException('Poll not found');
    }
    if (poll.state !== PollState.active) {
      throw new BadRequestException('Poll is not active');
    }

    const body = this.sanitizer
      .sanitizeOrThrow(dto.body, { maxLength: 2000, allowEmpty: false })
      .trim();
    if (!body.length) {
      throw new BadRequestException('Comment body is required');
    }

    const moderation = await this.moderation.moderateText(body);
    if (!moderation.allowed) {
      throw new BadRequestException(
        `Comment rejected by moderation: ${moderation.reason}`,
      );
    }

    if (dto.parentCommentId) {
      const parent = await this.prisma.pollComment.findUnique({
        where: { commentId: dto.parentCommentId },
        select: { pollId: true, deletedAt: true },
      });
      if (!parent || parent.pollId !== pollId || parent.deletedAt) {
        throw new NotFoundException('Parent comment not found for poll');
      }
    }

    const entitySpans = await this.highlightCommentSpans(body, poll.marketKey);
    const comment = await this.prisma.pollComment.create({
      data: {
        pollId,
        userId,
        parentCommentId: dto.parentCommentId ?? null,
        body,
        publicId: this.generateCommentPublicId(),
        // Sync-moderated above; `pending` is reserved for future async/soft-hold.
        moderationStatus: PollCommentModerationStatus.approved,
        entitySpans,
        extractionStatus: PollCommentExtractionStatus.highlighted,
      },
    });

    await this.rebuildPollLeaderboard(pollId);
    this.gateway.emitPollUpdate(pollId);
    void this.userEventService.recordEvent({
      userId,
      eventType: 'poll_comment_posted',
      eventData: { pollId, commentId: comment.commentId },
    });
    return comment;
  }

  async editComment(commentId: string, dto: EditCommentDto, userId: string) {
    const comment = await this.requireOwnComment(commentId, userId);

    const body = this.sanitizer
      .sanitizeOrThrow(dto.body, { maxLength: 2000, allowEmpty: false })
      .trim();
    if (!body.length) {
      throw new BadRequestException('Comment body is required');
    }
    const moderation = await this.moderation.moderateText(body);
    if (!moderation.allowed) {
      throw new BadRequestException(
        `Comment rejected by moderation: ${moderation.reason}`,
      );
    }

    const poll = await this.prisma.poll.findUnique({
      where: { pollId: comment.pollId },
      select: { marketKey: true },
    });
    const entitySpans = await this.highlightCommentSpans(
      body,
      poll?.marketKey ?? null,
    );
    const updated = await this.prisma.pollComment.update({
      where: { commentId },
      data: {
        body,
        editedAt: new Date(),
        entitySpans,
        extractionStatus: PollCommentExtractionStatus.highlighted,
      },
    });
    await this.rebuildPollLeaderboard(comment.pollId);
    this.gateway.emitPollUpdate(comment.pollId);
    return updated;
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await this.requireOwnComment(commentId, userId);
    await this.prisma.pollComment.update({
      where: { commentId },
      data: { deletedAt: new Date() },
    });
    await this.rebuildPollLeaderboard(comment.pollId);
    this.gateway.emitPollUpdate(comment.pollId);
    return { commentId, deleted: true };
  }

  private async requireOwnComment(commentId: string, userId: string) {
    const comment = await this.prisma.pollComment.findUnique({
      where: { commentId },
      select: { userId: true, pollId: true, deletedAt: true },
    });
    if (!comment || comment.deletedAt) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.userId !== userId) {
      throw new BadRequestException('You can only modify your own comment');
    }
    return comment;
  }

  async toggleCommentLike(commentId: string, userId: string) {
    const comment = await this.prisma.pollComment.findUnique({
      where: { commentId },
      select: { pollId: true, deletedAt: true },
    });
    if (!comment || comment.deletedAt) {
      throw new NotFoundException('Comment not found');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.pollCommentLike.findUnique({
        where: { commentId_userId: { commentId, userId } },
      });
      if (existing) {
        await tx.pollCommentLike.delete({
          where: { commentId_userId: { commentId, userId } },
        });
        const updated = await tx.pollComment.update({
          where: { commentId },
          data: { score: { decrement: 1 } },
        });
        return { liked: false, score: updated.score };
      }
      await tx.pollCommentLike.create({ data: { commentId, userId } });
      const updated = await tx.pollComment.update({
        where: { commentId },
        data: { score: { increment: 1 } },
      });
      return { liked: true, score: updated.score };
    });

    await this.rebuildPollLeaderboard(comment.pollId);
    this.gateway.emitPollUpdate(comment.pollId);
    void this.userEventService.recordEvent({
      userId,
      eventType: result.liked ? 'poll_comment_liked' : 'poll_comment_unliked',
      eventData: { pollId: comment.pollId, commentId },
    });
    return result;
  }

  async listComments(
    pollId: string,
    userId: string | null,
    sort: 'top' | 'new' = 'top',
  ) {
    const poll = await this.prisma.poll.findUnique({
      where: { pollId },
      select: { pollId: true },
    });
    if (!poll) {
      throw new NotFoundException('Poll not found');
    }

    const comments = await this.prisma.pollComment.findMany({
      where: { pollId, deletedAt: null },
      orderBy:
        sort === 'new'
          ? [{ loggedAt: 'desc' }]
          : [{ score: 'desc' }, { loggedAt: 'desc' }],
      select: {
        commentId: true,
        pollId: true,
        parentCommentId: true,
        body: true,
        score: true,
        publicId: true,
        entitySpans: true,
        loggedAt: true,
        editedAt: true,
        user: {
          select: {
            userId: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    let likedSet = new Set<string>();
    if (userId && comments.length) {
      const likes = await this.prisma.pollCommentLike.findMany({
        where: {
          userId,
          commentId: { in: comments.map((c) => c.commentId) },
        },
        select: { commentId: true },
      });
      likedSet = new Set(likes.map((l) => l.commentId));
    }

    // Flat list + parentCommentId — the client nests (presentational, shallow).
    return comments.map((c) => ({
      ...c,
      currentUserLiked: likedSet.has(c.commentId),
    }));
  }

  // ─── Endorsement leaderboard projection (Phase 4D) ───────────────────────

  /**
   * Project the comment thread into the leaderboard (§5, "gazetteer-live" default,
   * no sentiment in v1 — presence = endorsement, ~95%, corrected at close). A
   * comment's gazetteer spans are the subjects it endorses; its author and everyone
   * who liked it endorse those subjects; dedupe (user, subject) → COUNT(DISTINCT
   * user). Rebuilt on each interaction. Subject span type follows the axis:
   * `what_to_order` ranks dishes (food spans); every other ranked axis ranks
   * restaurants (restaurant spans). v1 uses `entity` subjects; the restaurant+dish
   * `Connection` refinement (§13) is formed at close-time (§6.3).
   */
  private async rebuildPollLeaderboard(pollId: string): Promise<void> {
    const poll = await this.prisma.poll.findUnique({
      where: { pollId },
      select: { mode: true, topic: { select: { topicType: true } } },
    });
    if (!poll || poll.mode === PollMode.discussion) {
      await this.prisma.pollLeaderboardEntry.deleteMany({ where: { pollId } });
      return;
    }

    const subjectSpanType: EntityType =
      poll.topic?.topicType === PollTopicType.what_to_order
        ? EntityType.food
        : EntityType.restaurant;

    const comments = await this.prisma.pollComment.findMany({
      where: {
        pollId,
        deletedAt: null,
        moderationStatus: PollCommentModerationStatus.approved,
      },
      select: { commentId: true, userId: true, entitySpans: true },
    });
    const likes = await this.prisma.pollCommentLike.findMany({
      where: { comment: { pollId } },
      select: { commentId: true, userId: true },
    });
    const likersByComment = new Map<string, string[]>();
    for (const like of likes) {
      const arr = likersByComment.get(like.commentId);
      if (arr) arr.push(like.userId);
      else likersByComment.set(like.commentId, [like.userId]);
    }

    // subjectId → distinct endorsing users
    const endorsers = new Map<string, Set<string>>();
    for (const comment of comments) {
      const spans = (Array.isArray(comment.entitySpans)
        ? comment.entitySpans
        : []) as unknown as EntitySpan[];
      const subjectIds = new Set(
        spans
          .filter((s) => s?.type === subjectSpanType && s?.entityId)
          .map((s) => s.entityId),
      );
      if (!subjectIds.size) continue;
      const endorsingUsers = [
        comment.userId,
        ...(likersByComment.get(comment.commentId) ?? []),
      ];
      for (const subjectId of subjectIds) {
        let set = endorsers.get(subjectId);
        if (!set) {
          set = new Set();
          endorsers.set(subjectId, set);
        }
        for (const u of endorsingUsers) set.add(u);
      }
    }

    const ranked = [...endorsers.entries()]
      .map(([subjectId, users]) => ({
        subjectId,
        distinctEndorsers: users.size,
      }))
      .sort((a, b) => b.distinctEndorsers - a.distinctEndorsers);

    await this.prisma.$transaction(async (tx) => {
      await tx.pollLeaderboardEntry.deleteMany({ where: { pollId } });
      if (ranked.length) {
        await tx.pollLeaderboardEntry.createMany({
          data: ranked.map((r, i) => ({
            pollId,
            subjectType: PollLeaderboardSubjectType.entity,
            subjectId: r.subjectId,
            distinctEndorsers: r.distinctEndorsers,
            score: r.distinctEndorsers,
            rank: i + 1,
          })),
        });
      }
    });
  }

  async getPollLeaderboard(pollId: string) {
    const entries = await this.prisma.pollLeaderboardEntry.findMany({
      where: { pollId },
      orderBy: { rank: 'asc' },
    });
    if (!entries.length) return [];
    const ids = entries.map((e) => e.subjectId);
    const entities = await this.prisma.entity.findMany({
      where: { entityId: { in: ids } },
      select: { entityId: true, name: true, type: true },
    });
    const byId = new Map(entities.map((e) => [e.entityId, e]));
    return entries.map((e) => ({
      rank: e.rank,
      subjectType: e.subjectType,
      subjectId: e.subjectId,
      name: byId.get(e.subjectId)?.name ?? null,
      type: byId.get(e.subjectId)?.type ?? null,
      distinctEndorsers: e.distinctEndorsers,
    }));
  }

  async listPollsForUser(userId: string, query: ListUserPollsDto) {
    const activity = query.activity ?? UserPollActivity.participated;
    const limit = query.limit ?? 25;
    const offset = query.offset ?? 0;
    const marketKey = query.marketKey?.trim();
    const state = query.state;

    if (activity === UserPollActivity.created) {
      const polls = await this.prisma.poll.findMany({
        where: {
          createdByUserId: userId,
          marketKey: marketKey
            ? { equals: marketKey, mode: 'insensitive' }
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
              marketKey: true,
              title: true,
              description: true,
              metadata: true,
            },
          },
        },
      });

      const enriched = await this.attachMarketLabels(polls, marketKey);
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
              marketKey: marketKey
                ? { equals: marketKey, mode: 'insensitive' }
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
                  marketKey: true,
                  title: true,
                  description: true,
                  metadata: true,
                },
              },
            },
          })
        : [];

    const enriched = await this.attachMarketLabels(polls, marketKey);
    return {
      activity,
      polls: await this.attachCurrentUserVotes(enriched, userId),
    };
  }

  private async attachMarketLabels<
    T extends {
      marketKey?: string | null;
      topic?: { marketKey?: string | null } | null;
    },
  >(
    polls: T[],
    fallbackMarketKey?: string | null,
  ): Promise<Array<T & { marketName?: string | null }>> {
    const marketKeys = new Set<string>();
    for (const poll of polls) {
      const rawKey =
        poll.marketKey ?? poll.topic?.marketKey ?? fallbackMarketKey ?? null;
      if (typeof rawKey === 'string' && rawKey.trim()) {
        marketKeys.add(rawKey.trim().toLowerCase());
      }
    }

    if (marketKeys.size === 0) {
      return polls;
    }

    const keys = Array.from(marketKeys.values());
    const marketRows = await this.prisma.market.findMany({
      where: {
        marketKey: { in: keys },
      },
      select: {
        marketKey: true,
        marketName: true,
        marketShortName: true,
      },
    });

    const labelByKey = new Map<string, string>();
    for (const row of marketRows) {
      const label = this.resolveMarketLabel(row);
      if (!label) {
        continue;
      }
      labelByKey.set(row.marketKey.toLowerCase(), label);
    }

    return polls.map((poll) => {
      const rawKey =
        poll.marketKey ?? poll.topic?.marketKey ?? fallbackMarketKey ?? null;
      const key = typeof rawKey === 'string' ? rawKey.trim().toLowerCase() : '';
      const marketName = key ? (labelByKey.get(key) ?? null) : null;
      return {
        ...poll,
        marketName,
      };
    });
  }

  private async resolveMarketNameForKey(
    marketKey: string,
  ): Promise<string | null> {
    const normalized = marketKey.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const market = await this.prisma.market.findFirst({
      where: {
        marketKey: { equals: normalized, mode: 'insensitive' },
      },
      select: {
        marketKey: true,
        marketName: true,
        marketShortName: true,
      },
    });

    if (market) {
      return this.resolveMarketLabel(market);
    }

    return null;
  }

  private resolveMarketLabel(row: {
    marketKey: string;
    marketName: string;
    marketShortName: string | null;
  }): string | null {
    if (row.marketShortName && row.marketShortName.trim()) {
      return row.marketShortName.trim();
    }
    if (row.marketName && row.marketName.trim()) {
      return row.marketName.trim();
    }
    return row.marketKey.trim() || null;
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

  private async resolveMarketContext(
    marketKey: string | null,
  ): Promise<MarketContext | null> {
    if (!marketKey || !marketKey.trim()) {
      return null;
    }

    const normalized = marketKey.trim().toLowerCase();
    const market = await this.prisma.market.findFirst({
      where: {
        marketKey: { equals: normalized, mode: 'insensitive' },
      },
      select: {
        marketKey: true,
        marketName: true,
        marketShortName: true,
        countryCode: true,
        centerLatitude: true,
        centerLongitude: true,
      },
    });

    if (market) {
      const centerLat = this.toNumber(market.centerLatitude);
      const centerLng = this.toNumber(market.centerLongitude);
      const center =
        centerLat !== null && centerLng !== null
          ? { lat: centerLat, lng: centerLng }
          : undefined;

      return {
        marketKey: market.marketKey.toLowerCase(),
        center,
        city:
          market.marketShortName?.trim() ||
          market.marketName?.split(',')[0]?.trim() ||
          null,
        region: market.marketName?.match(/,\s*([A-Z]{2})(?:\s|$)/)?.[1] ?? null,
        countryCode: market.countryCode ?? null,
      };
    }

    return {
      marketKey: normalized,
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
