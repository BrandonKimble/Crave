import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PollState } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { PollGraduationService } from './poll-graduation.service';
import {
  MS_PER_DAY,
  isActivePollDueToClose,
  resolveMinPossibleCloseWindowDays,
  resolvePollAutoCloseDays,
} from './poll-timing';

@Injectable()
export class PollLifecycleService {
  private readonly logger: LoggerService;
  private readonly autoCloseDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly graduation: PollGraduationService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PollLifecycleService');
    this.autoCloseDays = resolvePollAutoCloseDays();
  }

  /**
   * Close expired polls and graduate their threads through the authoritative
   * collection pipeline (Phase 5C, §6.3). Also retries any poll that was closed
   * but never graduated (e.g. a prior run crashed mid-pass) — graduation is
   * idempotent (`poll.graduatedAt` + source-ledger dedupe), so re-processing is
   * safe. One poll's failure is logged and never blocks the rest.
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async closeExpiredPolls(): Promise<void> {
    if (this.autoCloseDays <= 0) {
      return;
    }

    // Coarse pre-filter: nothing can close before the smallest possible window, so
    // skip active polls younger than that. Each remaining active poll's EXACT due-ness
    // is then decided per-poll below (honoring its stored §5 window, else the global).
    const coarseThreshold = new Date(
      Date.now() - resolveMinPossibleCloseWindowDays() * MS_PER_DAY,
    );
    const candidates = await this.prisma.poll.findMany({
      where: {
        graduatedAt: null,
        OR: [
          { state: PollState.active, launchedAt: { lte: coarseThreshold } },
          { state: PollState.closed },
        ],
      },
      select: {
        pollId: true,
        state: true,
        launchedAt: true,
        metadata: true,
      },
    });
    const nowMs = Date.now();
    const due = candidates.filter(
      (poll) =>
        // already-closed-but-not-graduated → retry graduation (idempotent)
        poll.state === PollState.closed ||
        // active → close once its per-poll window has elapsed
        isActivePollDueToClose(poll.launchedAt, poll.metadata, nowMs),
    );
    if (!due.length) {
      return;
    }

    let graduated = 0;
    for (const { pollId } of due) {
      try {
        await this.graduation.closeAndGraduate(pollId);
        graduated += 1;
      } catch (error) {
        this.logger.error('Poll graduation failed', {
          pollId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.info('Closed + graduated expired polls', {
      attempted: due.length,
      graduated,
      globalAutoCloseDays: this.autoCloseDays,
    });
  }
}
