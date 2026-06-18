import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PollState, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

@Injectable()
export class PollAggregationService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PollAggregationService');
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

  /**
   * Tally votes into `PollOption.voteCount`/`consensus` + `PollMetric`. This is the
   * legit half of poll aggregation — it feeds the (vote-based) leaderboard and
   * writes NOTHING into entity/connection quality scores. The pseudo-mention bridge
   * that laundered votes into `Connection.decayedMentionScore` was removed (Seam-1
   * cutover, §2.4); poll evidence re-enters later as an honest `poll_thread` source.
   * Phase 4 replaces this vote tally with the comment-endorsement projection.
   */
  async aggregatePoll(pollId: string): Promise<void> {
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

    for (const group of voteGroups) {
      const option = optionMap.get(group.optionId);
      if (!option) {
        continue;
      }

      const votesForOption = group._sum.weight ?? 0;
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
    }

    const participantRows = await this.prisma.$queryRaw<
      Array<{ count: bigint }>
    >(
      Prisma.sql`
        SELECT COUNT(DISTINCT user_id)::bigint AS count
        FROM poll_votes
        WHERE poll_id = ${pollId}::uuid
      `,
    );
    const participants = Number(participantRows[0]?.count ?? 0);

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
  }
}
