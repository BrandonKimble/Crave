import { runInWorkContext } from '../../external-integrations/shared/work-context';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { sampleLaneVerdicts } from './verdict-replay-sampler';
import {
  HARD_SAMPLE_CAP,
  LaneReplayReport,
  ReplayRowResult,
  VerdictReplayRegistry,
} from './verdict-replay.types';

/**
 * THE REPLAY ORCHESTRATOR — sample, re-judge, tally. Not a Nest provider:
 * it is constructed by the runner script from the app context's services,
 * so no production module ever wires (or accidentally schedules) it. The
 * only writes it performs are stdout.
 */
export class VerdictReplayRunner {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: VerdictReplayRegistry,
  ) {}

  async replayLane(
    lane: string,
    sampleSize: number,
  ): Promise<LaneReplayReport> {
    const capped = Math.min(Math.max(1, sampleSize), HARD_SAMPLE_CAP);
    const noAdapter = this.registry.noAdapter(lane);
    if (noAdapter) {
      return {
        lane,
        currentRuleVersion: null,
        implemented: false,
        noAdapterReason: noAdapter.reason,
        sampled: 0,
        unchanged: 0,
        flipped: [],
        unreplayable: 0,
        unreplayableNotes: {},
        flipRate: 0,
        flipTransitions: {},
        usage: { requests: 0, inputTokens: 0, outputTokens: 0 },
      };
    }
    const adapter = this.registry.get(lane);
    if (!adapter) {
      throw new Error(
        `Unknown lane '${lane}'. Known lanes: ${this.registry
          .lanes()
          .join(', ')}`,
      );
    }
    const startedAt = new Date();
    const rows = await sampleLaneVerdicts(this.prisma, lane, capped);
    // A REPLAY IS NOT A HEARING (red team 2026-09-04 T1-6): it bills the
    // lane's production caller tags but writes no claim_verdicts row, so
    // the hearing-rate quote (spend ÷ hearings) inflated after every
    // replay and the standing drain estimate hash moved. The ambient
    // attribution marks these rows so the rate meter can exclude them.
    const results: ReplayRowResult[] = rows.length
      ? await runInWorkContext(
          { attribution: 'replay', label: `verdict-replay:${lane}` },
          () => adapter.rejudge(rows),
        )
      : [];

    const flipped = results.filter((r) => r.status === 'flipped');
    const unreplayableRows = results.filter((r) => r.status === 'unreplayable');
    const unchanged = results.filter((r) => r.status === 'unchanged').length;
    const comparedCount = unchanged + flipped.length;
    const flipTransitions: Record<string, number> = {};
    for (const r of flipped) {
      const key = `${r.storedOutcome}->${r.newOutcome}`;
      flipTransitions[key] = (flipTransitions[key] ?? 0) + 1;
    }
    const unreplayableNotes: Record<string, number> = {};
    for (const r of unreplayableRows) {
      const note = r.note ?? 'unknown';
      unreplayableNotes[note] = (unreplayableNotes[note] ?? 0) + 1;
    }
    return {
      lane,
      currentRuleVersion: adapter.currentRuleVersion(),
      implemented: true,
      sampled: results.length,
      unchanged,
      flipped,
      unreplayable: unreplayableRows.length,
      unreplayableNotes,
      flipRate: comparedCount ? flipped.length / comparedCount : 0,
      flipTransitions,
      usage: await this.usageSince(startedAt),
    };
  }

  /** MEASURED traffic (no-fake-estimates law): the Gemini rows the usage
   *  ledger recorded during this lane's replay window. On a quiet dev/ops
   *  box this is the replay's own spend; dollars are derived downstream
   *  from the BigQuery billing export, never invented here. */
  private async usageSince(
    startedAt: Date,
  ): Promise<{ requests: number; inputTokens: number; outputTokens: number }> {
    const rows = await this.prisma.$queryRaw<
      Array<{ requests: bigint; input_tokens: bigint; output_tokens: bigint }>
    >(Prisma.sql`
      SELECT COALESCE(sum(request_count), 0) AS requests,
             COALESCE(sum(input_tokens), 0)  AS input_tokens,
             COALESCE(sum(output_tokens), 0) AS output_tokens
        FROM api_usage_ledger
       WHERE service = 'gemini' AND created_at >= ${startedAt}`);
    const row = rows[0];
    return {
      requests: Number(row?.requests ?? 0),
      inputTokens: Number(row?.input_tokens ?? 0),
      outputTokens: Number(row?.output_tokens ?? 0),
    };
  }
}
