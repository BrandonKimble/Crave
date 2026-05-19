import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  DemandScoringConsumerKind,
  DemandScoringDecisionState,
  DemandSubjectKind,
  EntityType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_TRACE_RETENTION_DAYS = 180;
const DEFAULT_TRACE_ALL_RETENTION_DAYS = 14;

export interface CreateDemandScoringRunInput {
  consumerKind: DemandScoringConsumerKind;
  marketKey?: string | null;
  collectableMarketKey?: string | null;
  cycleStartAt: Date;
  cycleEndAt: Date;
  scorerVersion: string;
  traceAllCandidates?: boolean;
  metadata?: Prisma.InputJsonValue;
}

export interface DemandScoringCandidateTraceInput {
  consumerKind: DemandScoringConsumerKind;
  candidateKind: string;
  subjectKind: DemandSubjectKind;
  subjectKey: string;
  entityId?: string | null;
  entityType?: EntityType | null;
  normalizedText?: string | null;
  marketKey?: string | null;
  collectableMarketKey?: string | null;
  bucket?: string | null;
  lane?: string | null;
  reason?: string | null;
  finalScore?: number | null;
  rank?: number | null;
  selected?: boolean;
  decisionState: DemandScoringDecisionState;
  decisionReason?: string | null;
  factorBreakdown?: Prisma.InputJsonValue;
}

@Injectable()
export class DemandScoringTraceService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('DemandScoringTraceService');
  }

  async createRun(input: CreateDemandScoringRunInput): Promise<string> {
    const run = await this.prisma.demandScoringRun.create({
      data: {
        consumerKind: input.consumerKind,
        marketKey: this.normalizeScopeKey(input.marketKey),
        collectableMarketKey: this.normalizeScopeKey(
          input.collectableMarketKey,
        ),
        cycleStartAt: input.cycleStartAt,
        cycleEndAt: input.cycleEndAt,
        scorerVersion: input.scorerVersion,
        traceAllCandidates: input.traceAllCandidates ?? false,
        metadata: input.metadata ?? {},
      },
      select: { runId: true },
    });
    return run.runId;
  }

  async finishRun(runId: string): Promise<void> {
    await this.prisma.demandScoringRun.update({
      where: { runId },
      data: { finishedAt: new Date() },
    });
  }

  async recordCandidates(
    runId: string,
    candidates: DemandScoringCandidateTraceInput[],
  ): Promise<void> {
    if (!candidates.length) {
      return;
    }

    const safeCandidates = candidates
      .map((candidate) => this.normalizeCandidate(runId, candidate))
      .filter(
        (candidate): candidate is NonNullable<typeof candidate> =>
          candidate !== null,
      );
    if (!safeCandidates.length) {
      return;
    }

    try {
      await this.prisma.demandScoringCandidate.createMany({
        data: safeCandidates,
        skipDuplicates: true,
      });
    } catch (error) {
      this.logger.warn('Failed to write demand scoring candidates', {
        runId,
        candidateCount: safeCandidates.length,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
    }
  }

  @Cron('35 2 * * *')
  async pruneOldTraces(): Promise<void> {
    const rawDays = Number(process.env.DEMAND_SCORING_TRACE_RETENTION_DAYS);
    const retentionDays =
      Number.isFinite(rawDays) && rawDays > 0
        ? Math.min(Math.floor(rawDays), 365)
        : DEFAULT_TRACE_RETENTION_DAYS;
    const rawTraceAllDays = Number(
      process.env.DEMAND_SCORING_TRACE_ALL_RETENTION_DAYS,
    );
    const traceAllRetentionDays =
      Number.isFinite(rawTraceAllDays) && rawTraceAllDays > 0
        ? Math.min(Math.floor(rawTraceAllDays), retentionDays)
        : Math.min(DEFAULT_TRACE_ALL_RETENTION_DAYS, retentionDays);
    const cutoff = new Date(Date.now() - retentionDays * MS_PER_DAY);
    const traceAllCutoff = new Date(
      Date.now() - traceAllRetentionDays * MS_PER_DAY,
    );

    const [deletedTraceAllCandidates, deletedRuns] =
      await this.prisma.$transaction([
        this.prisma.$executeRaw`
          DELETE FROM demand_scoring_candidates c
          USING demand_scoring_runs r
          WHERE c.run_id = r.run_id
            AND r.trace_all_candidates = true
            AND r.started_at < ${traceAllCutoff}
            AND c.selected = false
            AND c.factor_breakdown->>'traceScope' = 'all_candidate'
        `,
        this.prisma.demandScoringRun.deleteMany({
          where: {
            startedAt: { lt: cutoff },
          },
        }),
      ]);
    if (deletedRuns.count > 0 || Number(deletedTraceAllCandidates) > 0) {
      this.logger.info('Pruned old demand scoring traces', {
        deletedRuns: deletedRuns.count,
        deletedTraceAllCandidates: Number(deletedTraceAllCandidates),
        cutoff: cutoff.toISOString(),
        traceAllCutoff: traceAllCutoff.toISOString(),
      });
    }
  }

  private normalizeCandidate(
    runId: string,
    candidate: DemandScoringCandidateTraceInput,
  ): Prisma.DemandScoringCandidateCreateManyInput | null {
    const subjectKey = candidate.subjectKey.trim();
    const candidateKind = candidate.candidateKind.trim();
    if (!subjectKey || !candidateKind) {
      return null;
    }

    return {
      runId,
      consumerKind: candidate.consumerKind,
      candidateKind,
      subjectKind: candidate.subjectKind,
      subjectKey,
      entityId: candidate.entityId ?? null,
      entityType: candidate.entityType ?? null,
      normalizedText: this.normalizeText(candidate.normalizedText),
      marketKey: this.normalizeScopeKey(candidate.marketKey),
      collectableMarketKey: this.normalizeScopeKey(
        candidate.collectableMarketKey,
      ),
      bucket: this.normalizeText(candidate.bucket),
      lane: this.normalizeText(candidate.lane),
      reason: this.normalizeText(candidate.reason),
      finalScore:
        typeof candidate.finalScore === 'number' &&
        Number.isFinite(candidate.finalScore)
          ? candidate.finalScore
          : null,
      rank:
        typeof candidate.rank === 'number' &&
        Number.isInteger(candidate.rank) &&
        candidate.rank > 0
          ? candidate.rank
          : null,
      selected: candidate.selected ?? false,
      decisionState: candidate.decisionState,
      decisionReason: this.normalizeText(candidate.decisionReason),
      factorBreakdown: candidate.factorBreakdown ?? {},
    };
  }

  private normalizeScopeKey(value?: string | null): string | null {
    const normalized =
      typeof value === 'string' ? value.trim().toLowerCase() : '';
    return normalized.length ? normalized : null;
  }

  private normalizeText(value?: string | null): string | null {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return normalized.length ? normalized : null;
  }
}
