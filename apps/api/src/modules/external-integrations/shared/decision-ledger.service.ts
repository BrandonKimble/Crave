import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';

export interface DecisionRecord {
  kind: 'moderation' | 'entity_match' | 'attribute_placement';
  input: unknown;
  decision: unknown;
  model: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget persistence for LLM DECISIONS with lasting effects whose
 * inputs are unreconstructible later:
 * - entity_match / attribute_placement: match-vs-new verdicts cause merges
 *   and entity creation from shortlists that change as the DB evolves —
 *   without the record, a bad prod merge can never be attributed or replayed.
 * - moderation: rejected user content otherwise leaves no trace; disputes
 *   need the verdict + label.
 * inputs+decision (not reasons) are the replayable primitive; the table
 * doubles as a calibration corpus accumulated from real traffic. A write
 * failure only warns — recording must never break the call.
 */
@Injectable()
export class DecisionLedgerService implements OnModuleDestroy {
  /** In-flight fire-and-forget writes, awaited on shutdown so short-lived
   *  scripts and deploys can't drop records. */
  private readonly pending = new Set<Promise<unknown>>();

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled(Array.from(this.pending));
  }

  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('DecisionLedgerService');
  }

  record(entry: DecisionRecord): void {
    const write = this.prisma.llmDecisionRecord
      .create({
        data: {
          kind: entry.kind,
          input: entry.input as Prisma.InputJsonValue,
          decision: entry.decision as Prisma.InputJsonValue,
          model: entry.model,
          metadata: (entry.metadata ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
        },
        select: { id: true },
      })
      .catch((error: unknown) => {
        this.logger.warn('Decision record write failed', {
          kind: entry.kind,
          error:
            error instanceof Error
              ? { message: error.message }
              : { message: String(error) },
        });
      });
    this.pending.add(write);
    void write.finally(() => this.pending.delete(write));
  }
}
