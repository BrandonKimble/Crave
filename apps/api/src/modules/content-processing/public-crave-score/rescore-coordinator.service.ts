/**
 * §12.6 THE SINGLETON RESCORER: scoring is decoupled from collection.
 * Collection paths call markDirty() (a durable flag write — never a rebuild);
 * one debounced, advisory-locked coordinator owns global rebuilds
 * (hourly-if-dirty). This kills the racing-rebuilds class, the final-batch
 * proxy bug (batchNumber === totalBatches guessing "collection finished"),
 * and swallowed rescore errors (a failed rebuild leaves the flag DIRTY — the
 * next tick retries; nothing is silently dropped). It is also the
 * scoreVersion seam: the §15 score cut freezes THIS one chokepoint.
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdvisoryLockService, LoggerService } from '../../../shared';
import { PublicCraveScoreService } from './public-crave-score.service';

/** Advisory lock key for the global rescore (single writer across replicas). */
const RESCORE_ADVISORY_LOCK_KEY = 0x63726176; // 'crav'

@Injectable()
export class RescoreCoordinatorService implements OnModuleInit {
  private logger!: LoggerService;
  private tickInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly loggerService: LoggerService,
    private readonly craveScore: PublicCraveScoreService,
    private readonly advisoryLock: AdvisoryLockService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('RescoreCoordinator');
  }

  /** Durable dirty mark — the ONLY thing collection paths may call. */
  async markDirty(reason: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE rescore_state
      SET dirty = true,
          dirty_since = COALESCE(dirty_since, now())
      WHERE id = 1
    `;
    this.logger.info('Rescore marked dirty', { reason });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async runIfDirty(): Promise<void> {
    if (this.tickInFlight) return;
    this.tickInFlight = true;
    try {
      await this.tick();
    } finally {
      this.tickInFlight = false;
    }
  }

  /** Exposed for probes/specs; the cron calls this. */
  async tick(): Promise<'clean' | 'rebuilt' | 'locked' | 'failed'> {
    const state = await this.prisma.rescoreState.findUnique({
      where: { id: 1 },
      select: { dirty: true },
    });
    if (!state?.dirty) {
      return 'clean';
    }
    // Single writer across replicas, on a DEDICATED session: a lock taken
    // and released over the shared POOL releases nothing (different backend)
    // and strands, after which every replica reports 'locked' forever and the
    // dirty flag never clears. See shared/advisory-lock.
    const outcome = await this.advisoryLock.withAdvisoryLock(
      RESCORE_ADVISORY_LOCK_KEY,
      () => this.rebuild(),
    );
    return outcome.acquired ? outcome.result : 'locked';
  }

  /** The rebuild itself — runs only while the advisory lock is held. */
  private async rebuild(): Promise<'rebuilt' | 'failed'> {
    try {
      // Clear the flag BEFORE the rebuild: marks arriving DURING the rebuild
      // re-dirty the row and the next tick catches them — no lost updates.
      await this.prisma.$executeRaw`
        UPDATE rescore_state
        SET dirty = false, dirty_since = NULL, last_rescore_at = now()
        WHERE id = 1
      `;
      const result = await this.craveScore.rebuildAllScores();
      this.logger.info('Global rescore complete', {
        scoreRunId: result.scoreRunId,
        scoredCount: result.scoredCount,
      });
      return 'rebuilt';
    } catch (error) {
      // A failed rebuild is a REAL failure: re-dirty so the next tick
      // retries, and log loudly (no swallowed rescore errors — §12.4).
      await this.prisma.$executeRaw`
        UPDATE rescore_state SET dirty = true,
          dirty_since = COALESCE(dirty_since, now())
        WHERE id = 1
      `.catch(() => undefined);
      this.logger.error('Global rescore FAILED (flag re-dirtied; will retry)', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return 'failed';
    }
  }
}
