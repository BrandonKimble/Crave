import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PollState } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { PollGraduationService } from './poll-graduation.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
    this.autoCloseDays = this.resolveNumberEnv('POLL_AUTO_CLOSE_DAYS', 4);
  }

  private resolveNumberEnv(key: string, fallback: number): number {
    const raw = process.env[key];
    if (!raw) {
      return fallback;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

    const threshold = new Date(Date.now() - this.autoCloseDays * MS_PER_DAY);
    const pending = await this.prisma.poll.findMany({
      where: {
        graduatedAt: null,
        OR: [
          { state: PollState.active, launchedAt: { lte: threshold } },
          { state: PollState.closed },
        ],
      },
      select: { pollId: true },
    });
    if (!pending.length) {
      return;
    }

    let graduated = 0;
    for (const { pollId } of pending) {
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
      attempted: pending.length,
      graduated,
      autoCloseDays: this.autoCloseDays,
    });
  }
}
