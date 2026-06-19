import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PollState } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { PollsService } from './polls.service';

/**
 * Periodic backstop for the comment-endorsement leaderboard. The leaderboard is the
 * endorsement projection, rebuilt on each comment interaction; this cron just
 * re-projects every active poll as a safety net (catches any missed interaction-time
 * rebuild) and is the hook a future close-time finalize will reuse.
 */
@Injectable()
export class PollAggregationService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly pollsService: PollsService,
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

  async aggregatePoll(pollId: string): Promise<void> {
    await this.pollsService.refreshPollLeaderboard(pollId);
    this.logger.debug('Refreshed poll leaderboard', { pollId });
  }
}
