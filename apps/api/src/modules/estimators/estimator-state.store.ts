import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { EstimatorStateStore, SubjectState } from './estimator-registry';

/**
 * The postgres implementation of the registry's durable side (D41) — one row
 * per (estimator, subject) in `estimator_state`, holding the four decayed
 * moments and the two clocks. Every future estimator uses THIS, not columns
 * bolted onto its own consumer's table.
 */
@Injectable()
export class PrismaEstimatorStateStore implements EstimatorStateStore {
  constructor(private readonly prisma: PrismaService) {}

  async load(
    estimatorName: string,
    subjectKeys: string[],
  ): Promise<Array<{ subjectKey: string } & SubjectState>> {
    if (!subjectKeys.length) {
      return [];
    }
    const rows = await this.prisma.estimatorState.findMany({
      where: { estimatorName, subjectKey: { in: subjectKeys } },
    });
    return rows.map((row) => ({
      subjectKey: row.subjectKey,
      weightedSum: row.weightedSum,
      weightTotal: row.weightTotal,
      weightSquares: row.weightSquares,
      sumOfSquares: row.sumOfSquares,
      lastObservedAt: row.lastObservedAt,
      lastDecayedAt: row.lastDecayedAt,
    }));
  }

  async save(
    estimatorName: string,
    subjectKey: string,
    state: SubjectState,
  ): Promise<void> {
    const fields = {
      weightedSum: state.weightedSum,
      weightTotal: state.weightTotal,
      weightSquares: state.weightSquares,
      sumOfSquares: state.sumOfSquares,
      lastObservedAt: state.lastObservedAt,
      lastDecayedAt: state.lastDecayedAt,
    };
    await this.prisma.estimatorState.upsert({
      where: { estimatorName_subjectKey: { estimatorName, subjectKey } },
      create: { estimatorName, subjectKey, ...fields },
      update: fields,
    });
  }
}
