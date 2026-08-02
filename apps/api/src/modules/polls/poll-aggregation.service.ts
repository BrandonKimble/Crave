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
/**
 * §16 K3: the sweep looks back slightly further than its own cadence, so a
 * poll that changed during the previous run is never skipped by a boundary.
 */
const AGGREGATION_SWEEP_LOOKBACK_MS = 90 * 60 * 1000;

/**
 * §16 K3 churn bound: a backlog drains across ticks instead of holding the
 * process. Not a pacing knob — inline rebuilds do the real work.
 */
const AGGREGATION_SWEEP_MAX_POLLS = 500;

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

  /**
   * The safety-net sweep: re-derive leaderboards that could have drifted.
   *
   * REBUILD WHAT CHANGED, NOT EVERYTHING (2026-08-01). This used to select
   * EVERY active poll with no bound and rebuild each one serially — at
   * current volume ~17.8k polls, i.e. ~110k queries and ~17.8k write
   * transactions EVERY HOUR, producing byte-identical output for polls with
   * no activity (the whole system has had 26 comments). The leaderboard is
   * already rebuilt inline on every comment, vote and like; this sweep
   * exists only to catch a rebuild that failed, so it only needs the polls
   * that actually moved since the last sweep.
   *
   * Bounded regardless: a backlog that somehow exceeds the batch drains
   * across successive ticks rather than holding the process for an hour.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async aggregateActivePolls(): Promise<void> {
    const since = new Date(Date.now() - AGGREGATION_SWEEP_LOOKBACK_MS);
    const polls = await this.prisma.poll.findMany({
      where: { state: PollState.active, updatedAt: { gte: since } },
      select: { pollId: true },
      orderBy: { updatedAt: 'asc' },
      take: AGGREGATION_SWEEP_MAX_POLLS,
    });
    if (!polls.length) {
      return;
    }
    this.logger.info('Leaderboard sweep', { polls: polls.length, since });
    for (const poll of polls) {
      await this.aggregatePoll(poll.pollId);
    }
  }

  async aggregatePoll(pollId: string): Promise<void> {
    await this.pollsService.refreshPollLeaderboard(pollId);
    this.logger.debug('Refreshed poll leaderboard', { pollId });
  }
}
