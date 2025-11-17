import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PollState } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class PollLifecycleService {
  private readonly logger: LoggerService;
  private readonly autoCloseDays: number;

  constructor(
    private readonly prisma: PrismaService,
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

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async closeExpiredPolls(): Promise<void> {
    if (this.autoCloseDays <= 0) {
      return;
    }

    const threshold = new Date(Date.now() - this.autoCloseDays * MS_PER_DAY);
    const result = await this.prisma.poll.updateMany({
      where: {
        state: PollState.active,
        launchedAt: {
          lte: threshold,
        },
      },
      data: {
        state: PollState.closed,
        closedAt: new Date(),
      },
    });

    if (result.count > 0) {
      this.logger.info('Closed expired polls', {
        count: result.count,
        autoCloseDays: this.autoCloseDays,
      });
    }
  }
}
