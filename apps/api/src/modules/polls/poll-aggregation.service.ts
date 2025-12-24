import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PollState, PollTopicType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { PollScoreRefreshService } from './poll-score-refresh.service';

interface PseudoSignals {
  mentions: number;
  upvotes: number;
}

@Injectable()
export class PollAggregationService {
  private readonly logger: LoggerService;
  private readonly pseudoMentionCap: number;
  private readonly pseudoUpvoteCap: number;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly pollScoreRefresh: PollScoreRefreshService,
  ) {
    this.logger = loggerService.setContext('PollAggregationService');
    this.pseudoMentionCap = this.resolveNumberEnv(
      'POLL_PSEUDO_MENTION_CAP',
      10,
    );
    this.pseudoUpvoteCap = this.resolveNumberEnv('POLL_PSEUDO_UPVOTE_CAP', 20);
  }

  private resolveNumberEnv(key: string, fallback: number): number {
    const raw = process.env[key];
    if (!raw) {
      return fallback;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async aggregateActivePolls(): Promise<void> {
    const polls = await this.prisma.poll.findMany({
      where: { state: PollState.active },
      select: { pollId: true },
    });

    for (const poll of polls) {
      await this.aggregatePoll(poll.pollId);
    }
  }

  async aggregatePoll(pollId: string): Promise<void> {
    const poll = await this.prisma.poll.findUnique({
      where: { pollId },
      select: {
        pollId: true,
        topic: {
          select: {
            topicType: true,
            targetRestaurantAttributeId: true,
          },
        },
      },
    });
    if (!poll || !poll.topic) {
      return;
    }

    const options = await this.prisma.pollOption.findMany({
      where: { pollId },
    });
    if (!options.length) {
      return;
    }

    const optionMap = new Map(
      options.map((option) => [option.optionId, option]),
    );
    const voteGroups = await this.prisma.pollVote.groupBy({
      by: ['optionId'],
      where: { pollId },
      _sum: { weight: true },
    });

    const totalVotes = voteGroups.reduce(
      (sum, group) => sum + (group._sum.weight ?? 0),
      0,
    );

    const connectionIdsToRefresh = new Set<string>();
    const restaurantIdsToRefresh = new Set<string>();

    for (const group of voteGroups) {
      const option = optionMap.get(group.optionId);
      if (!option) {
        continue;
      }

      const votesForOption = group._sum.weight ?? 0;
      const lastAggregated = option.aggregatedVoteCount ?? 0;
      const deltaVotes = votesForOption - lastAggregated;
      const consensus =
        totalVotes > 0
          ? Math.round((votesForOption / totalVotes) * 1000) / 1000
          : 0;

      await this.prisma.pollOption.update({
        where: { optionId: option.optionId },
        data: {
          voteCount: votesForOption,
          aggregatedVoteCount: votesForOption,
          consensus: new Prisma.Decimal(consensus),
          lastVoteAt: new Date(),
        },
      });

      if (deltaVotes <= 0) {
        continue;
      }

      const pseudo = this.calculatePseudoSignals(deltaVotes, consensus);

      if (option.connectionId) {
        await this.applyConnectionSignals(
          {
            connectionId: option.connectionId,
            restaurantId: option.restaurantId ?? null,
            foodId: option.foodId ?? null,
          },
          pseudo,
        );
        connectionIdsToRefresh.add(option.connectionId);
      } else if (option.restaurantId && option.categoryId) {
        await this.upsertCategoryAggregate(
          {
            restaurantId: option.restaurantId,
            categoryId: option.categoryId,
          },
          pseudo,
          deltaVotes,
        );
      } else if (
        poll.topic.topicType === PollTopicType.best_restaurant_attribute &&
        option.restaurantId
      ) {
        const praiseBoost = Math.max(0, Math.round(pseudo.upvotes));
        if (praiseBoost > 0) {
          await this.prisma.entity.update({
            where: { entityId: option.restaurantId },
            data: {
              generalPraiseUpvotes: { increment: praiseBoost },
              lastPolledAt: new Date(),
            },
          });
          restaurantIdsToRefresh.add(option.restaurantId);
        }
      }
    }

    const participants = await this.prisma.pollVote.count({
      where: { pollId },
    });

    await this.prisma.pollMetric.upsert({
      where: { pollId },
      create: {
        pollId,
        totalVotes,
        totalParticipants: participants,
        lastAggregatedAt: new Date(),
      },
      update: {
        totalVotes,
        totalParticipants: participants,
        lastAggregatedAt: new Date(),
      },
    });

    this.logger.debug('Aggregated poll', { pollId, totalVotes });

    if (connectionIdsToRefresh.size > 0) {
      await this.pollScoreRefresh.refreshForConnections(
        Array.from(connectionIdsToRefresh.values()),
      );
    }
    if (restaurantIdsToRefresh.size > 0) {
      await this.pollScoreRefresh.refreshForRestaurants(
        Array.from(restaurantIdsToRefresh.values()),
      );
    }
  }

  private calculatePseudoSignals(
    votes: number,
    consensus: number,
  ): PseudoSignals {
    const mentions = Math.min(
      this.pseudoMentionCap,
      Math.log1p(votes) * Math.max(consensus, 0),
    );
    const upvotes = Math.min(
      this.pseudoUpvoteCap,
      votes * Math.max(consensus, 0),
    );
    return { mentions, upvotes };
  }

  private async applyConnectionSignals(
    option: {
      connectionId: string;
      restaurantId: string | null;
      foodId: string | null;
    },
    pseudo: PseudoSignals,
  ): Promise<void> {
    await this.prisma.connection.update({
      where: { connectionId: option.connectionId },
      data: {
        decayedMentionScore: {
          increment: new Prisma.Decimal(pseudo.mentions),
        },
        decayedUpvoteScore: {
          increment: new Prisma.Decimal(pseudo.upvotes),
        },
        decayedScoresUpdatedAt: new Date(),
      },
    });

    const updates: Promise<unknown>[] = [];
    if (option.restaurantId) {
      updates.push(
        this.prisma.entity.updateMany({
          where: { entityId: option.restaurantId },
          data: { lastPolledAt: new Date() },
        }),
      );
    }
    if (option.foodId) {
      updates.push(
        this.prisma.entity.updateMany({
          where: { entityId: option.foodId },
          data: { lastPolledAt: new Date() },
        }),
      );
    }

    await Promise.all(updates);
  }

  private async upsertCategoryAggregate(
    option: {
      restaurantId: string;
      categoryId: string;
    },
    pseudo: PseudoSignals,
    deltaVotes: number,
  ): Promise<void> {
    await this.prisma.pollCategoryAggregate.upsert({
      where: {
        restaurantId_categoryId: {
          restaurantId: option.restaurantId,
          categoryId: option.categoryId,
        },
      },
      create: {
        restaurantId: option.restaurantId,
        categoryId: option.categoryId,
        pseudoMentions: new Prisma.Decimal(pseudo.mentions),
        pseudoUpvotes: new Prisma.Decimal(pseudo.upvotes),
        voteCount: deltaVotes,
        lastVoteAt: new Date(),
      },
      update: {
        pseudoMentions: {
          increment: new Prisma.Decimal(pseudo.mentions),
        },
        pseudoUpvotes: {
          increment: new Prisma.Decimal(pseudo.upvotes),
        },
        voteCount: { increment: deltaVotes },
        lastVoteAt: new Date(),
      },
    });
  }
}
