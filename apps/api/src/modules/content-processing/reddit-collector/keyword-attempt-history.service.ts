import { Inject, Injectable } from '@nestjs/common';
import { KeywordAttemptOutcome } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Cadence choices, not calibrated: they trade Reddit-API spend against
// keyword freshness; any sane value works (2x/0.5x shifts collection cadence,
// never correctness — dedupe makes re-attempts idempotent). no-results gets
// the longest floor because barren keywords stay barren.
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
    engineName: string;
    /** §11 attempt-ledger key: (engine, term). The legacy market-key PK
     *  column survives until Phase C; both are stamped. */
    engineId?: string;
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
    const engineName = params.engineName.trim().toLowerCase();
    const normalizedTerm = params.normalizedTerm.trim().toLowerCase();

    if (!engineName.length || !normalizedTerm.length) {
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
          engineName_normalizedTerm: {
            engineName,
            normalizedTerm,
          },
        },
        create: {
          engineName,
          engineId: params.engineId ?? null,
          normalizedTerm,
          lastAttemptAt: attemptedAt,
          lastOutcome: params.outcome,
          cooldownUntil,
          ...(params.outcome === 'success'
            ? { lastSuccessAt: attemptedAt }
            : {}),
        },
        update: {
          ...(params.engineId ? { engineId: params.engineId } : {}),
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
        engineName,
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
