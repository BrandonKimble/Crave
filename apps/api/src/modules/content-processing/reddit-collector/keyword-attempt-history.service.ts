import { Inject, Injectable } from '@nestjs/common';
import { KeywordAttemptOutcome } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SUCCESS_COOLDOWN_MS = 7 * MS_PER_DAY;
const ERROR_COOLDOWN_MS = 1 * MS_PER_DAY;
const DEFERRED_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const MIN_NO_RESULTS_COOLDOWN_MS = 60 * MS_PER_DAY;

@Injectable()
export class KeywordAttemptHistoryService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LoggerService) loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('KeywordAttemptHistoryService');
  }

  async recordAttempt(params: {
    collectionCoverageKey: string;
    normalizedTerm: string;
    outcome: KeywordAttemptOutcome;
    safeIntervalDays: number;
    attemptedAt?: Date;
  }): Promise<void> {
    const attemptedAt =
      params.attemptedAt instanceof Date &&
      !Number.isNaN(params.attemptedAt.getTime())
        ? params.attemptedAt
        : new Date();
    const collectionCoverageKey = params.collectionCoverageKey
      .trim()
      .toLowerCase();
    const normalizedTerm = params.normalizedTerm.trim().toLowerCase();

    if (!collectionCoverageKey.length || !normalizedTerm.length) {
      return;
    }

    const cooldownUntil = this.calculateCooldownUntil({
      attemptedAt,
      outcome: params.outcome,
      safeIntervalDays: params.safeIntervalDays,
    });

    try {
      await this.prisma.keywordAttemptHistory.upsert({
        where: {
          collectionCoverageKey_normalizedTerm: {
            collectionCoverageKey,
            normalizedTerm,
          },
        },
        create: {
          collectionCoverageKey,
          normalizedTerm,
          lastAttemptAt: attemptedAt,
          lastOutcome: params.outcome,
          cooldownUntil,
          ...(params.outcome === 'success'
            ? { lastSuccessAt: attemptedAt }
            : {}),
        },
        update: {
          lastAttemptAt: attemptedAt,
          lastOutcome: params.outcome,
          cooldownUntil,
          ...(params.outcome === 'success'
            ? { lastSuccessAt: attemptedAt }
            : {}),
        },
      });
    } catch (error) {
      this.logger.warn('Failed to record keyword attempt history', {
        collectionCoverageKey,
        normalizedTerm,
        outcome: params.outcome,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    }
  }

  private calculateCooldownUntil(params: {
    attemptedAt: Date;
    outcome: KeywordAttemptOutcome;
    safeIntervalDays: number;
  }): Date {
    const safeIntervalDays =
      Number.isFinite(params.safeIntervalDays) && params.safeIntervalDays > 0
        ? params.safeIntervalDays
        : 0;

    const cooldownMs = (() => {
      switch (params.outcome) {
        case 'success':
          return SUCCESS_COOLDOWN_MS;
        case 'no_results':
          return Math.max(
            MIN_NO_RESULTS_COOLDOWN_MS,
            safeIntervalDays * 3 * MS_PER_DAY,
          );
        case 'error':
          return ERROR_COOLDOWN_MS;
        case 'deferred':
          return DEFERRED_COOLDOWN_MS;
        default:
          return ERROR_COOLDOWN_MS;
      }
    })();

    return new Date(params.attemptedAt.getTime() + cooldownMs);
  }
}
