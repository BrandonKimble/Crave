import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { LoggerService } from '../../../shared';
import { createHash } from 'crypto';
import { pricedGeminiRow } from '../../external-integrations/shared/gemini-pricing';
import { OpsAlertsService } from '../../external-integrations/shared/ops-alerts.service';
import { benchProberRegistry, BenchProbeResult } from './bench-prober';

/**
 * THE ITERATION BENCH — prompt iteration as a state machine, not a runbook
 * (plans/iteration-bench.md; owner mandate 2026-08-25).
 *
 * Built from the v16 incident family, where every failure was a fact or
 * obligation living in two places: the spend meter split from its ledger,
 * a projection dropped the rehearsal flag, three terminal paths each
 * forgot a different ending duty, and a queue sat silent for 25 hours
 * because polling belonged to a process that had restarted. The bench's
 * three laws (context travels whole; work ends through one door; progress
 * is owned and coverage derived) are enforced by SHAPE here: phases are
 * rows, gates are refusals, and "what do I do next" is a computation.
 *
 * S1: the machine, inventory, preflight gates, the drive contract,
 * closure. S2 (landed): the flip-rate prober seam (lanes register their
 * own probers; word lanes live), the hash-bound approval sheet, and the
 * estimate-from-history basis. S3 (landed): required triage deliverables,
 * the stalled-queue ops alert, and bench.sh's diff verb. A lane without a
 * prober is REPORTED as such — the sheet never overstates automation.
 */

export const BENCH_PHASES = [
  'inventory',
  'proofs',
  'approval',
  'replay',
  'diff',
  'review',
  'activation',
  'closed',
] as const;
export type BenchPhase = (typeof BENCH_PHASES)[number];

/** The bench's default corpus — the owner's palate is the oracle in Austin
 *  (encoded, not habitual; plans/iteration-bench.md "Bench config"). */
export const BENCH_DEFAULT_CORPUS = ['austinfood'];

export interface BenchNextAction {
  phase: BenchPhase;
  /** Human sentence: the single next required action. */
  action: string;
  /** True when the bench itself performs it via advance(). */
  automatic: boolean;
}

interface InventoryArtifact {
  collectionPrompt: {
    activeVersion: number;
    candidateVersion: number;
    changed: boolean;
  };
  judgeLanes: Array<{
    lane: string;
    corpusVersions: number[];
    dueVerdicts: number;
  }>;
  computedAt: string;
}

@Injectable()
export class IterationBenchService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly opsAlerts: OpsAlertsService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('IterationBenchService');
  }

  /** One active run per prompt kind (DB-enforced); refuse loudly here too
   *  so the caller gets the reason, not a P2002. */
  async start(params: {
    corpus?: string[];
    candidateVersion: number;
    promptKind?: string;
  }): Promise<{ runId: string; next: BenchNextAction }> {
    const promptKind = params.promptKind ?? 'collection_system';
    const existing = await this.prisma.iterationRun.findFirst({
      where: { promptKind, status: 'active' },
      select: { runId: true, phase: true },
    });
    if (existing) {
      throw new Error(
        `An active ${promptKind} iteration already exists ` +
          `(${existing.runId}, phase ${existing.phase}) — two concurrent ` +
          `iterations of one prompt would confound each other's diffs. ` +
          `Finish or abandon it first.`,
      );
    }
    const candidate = await this.prisma.llmPrompt.findFirst({
      where: { kind: promptKind, version: params.candidateVersion },
      select: { status: true },
    });
    if (!candidate) {
      throw new Error(
        `No registered ${promptKind} version ${params.candidateVersion} — ` +
          `push the candidate to the registry first.`,
      );
    }
    if (candidate.status !== 'candidate') {
      throw new Error(
        `Version ${params.candidateVersion} is '${candidate.status}', not a ` +
          `candidate — the bench iterates candidates only.`,
      );
    }
    const run = await this.prisma.iterationRun.create({
      data: {
        corpus: params.corpus ?? BENCH_DEFAULT_CORPUS,
        promptKind,
        candidateVersion: params.candidateVersion,
      },
      select: { runId: true },
    });
    return { runId: run.runId, next: await this.nextAction(run.runId) };
  }

  /** The one question the bench must always answer. */
  async nextAction(runId: string): Promise<BenchNextAction> {
    const run = await this.load(runId);
    const phase = run.phase as BenchPhase;
    switch (phase) {
      case 'inventory':
        return {
          phase,
          automatic: true,
          action: 'advance(): compute the changed-prompt inventory',
        };
      case 'proofs':
        return {
          phase,
          automatic: true,
          action:
            'advance(): run the flip-rate probes on every due lane and assemble the approval sheet',
        };
      case 'approval':
        return {
          phase,
          automatic: false,
          action:
            'OWNER: review the sheet in phase_state.approvalSheet and call approve(<sheetHash>)',
        };
      case 'replay':
        return {
          phase,
          automatic: false,
          action:
            'run preflight() until green, arm the replay (recordCampaign(<id>) after arming), then drive() to done',
        };
      case 'diff':
        return {
          phase,
          automatic: false,
          action:
            'bench.sh diff — generates the review file + the two triage briefs and records the artifact',
        };
      case 'review':
        return {
          phase,
          automatic: false,
          action:
            'record both triage summaries (recordTriage) then closeReview(<summary>) — it refuses without them',
        };
      case 'activation':
        return {
          phase,
          automatic: false,
          action:
            "OWNER: recordOutcome('activated'|'rejected') after the activation choreography or rejection sweep",
        };
      case 'closed':
        return { phase, automatic: true, action: 'nothing — run is closed' };
    }
  }

  /** Execute the current phase where automatic; refuse (with the gate's
   *  sentence) where a human owns it. */
  async advance(runId: string): Promise<BenchNextAction> {
    const run = await this.load(runId);
    switch (run.phase as BenchPhase) {
      case 'inventory': {
        const inventory = await this.computeInventory(
          run.promptKind,
          run.candidateVersion,
        );
        await this.transition(runId, 'proofs', { inventory });
        return this.nextAction(runId);
      }
      case 'proofs': {
        const state = run.phaseState as { inventory?: InventoryArtifact };
        const lanes = state.inventory?.judgeLanes ?? [];
        const proofs: Array<
          | (BenchProbeResult & { recommendation: string })
          | {
              lane: string;
              dueVerdicts: number;
              recommendation: string;
            }
        > = [];
        for (const lane of lanes) {
          if (lane.dueVerdicts === 0) {
            proofs.push({
              lane: lane.lane,
              dueVerdicts: 0,
              recommendation: 'nothing-due',
            });
            continue;
          }
          const prober = benchProberRegistry.get(lane.lane);
          if (!prober) {
            proofs.push({
              lane: lane.lane,
              dueVerdicts: lane.dueVerdicts,
              recommendation:
                'no-prober-registered: manual carry-forward decision or re-buy',
            });
            continue;
          }
          const result = await prober.probe(Math.min(100, lane.dueVerdicts));
          // The bands: ~zero flips carry forward automatically; a clearly
          // semantic change re-buys; the ambiguous middle is the ONLY
          // place a human reads proofs (owner mandate: in the loop only
          // where judgment is irreplaceable).
          const recommendation =
            result.sampled === 0
              ? 'sample-unanswerable: manual decision'
              : result.flipRate < 0.02
                ? 'carry-forward (auto: flips ~0, proof recorded)'
                : result.flipRate > 0.2
                  ? 're-buy (semantic change; population owed)'
                  : 'OWNER-BAND: read the flip examples';
          proofs.push({ ...result, recommendation });
        }
        // ESTIMATE FROM HISTORY (the v16 post-mortem law): quote the last
        // comparable run's actuals first; the window-mix estimator is a
        // labeled fallback with its measured 5x history stated.
        const lastComparable = await this.prisma.iterationRun.findFirst({
          where: {
            promptKind: run.promptKind,
            status: 'done',
            corpus: { equals: run.corpus },
          },
          orderBy: { updatedAt: 'desc' },
          select: { phaseState: true, candidateVersion: true },
        });
        const lastActuals = (
          lastComparable?.phaseState as {
            actuals?: { spentUsd?: number };
          } | null
        )?.actuals;
        const spend = lastActuals?.spentUsd
          ? {
              basis: 'bench-history',
              quoteUsd: lastActuals.spentUsd,
              note: `last comparable run (v${lastComparable?.candidateVersion}) actually spent $${lastActuals.spentUsd.toFixed(2)} — the honest prior`,
            }
          : {
              basis: 'window-fallback',
              quoteUsd: null,
              note: 'no comparable bench history — use reextract estimate, and treat it as an UPPER BOUND (the window mix ran 5x over on v16)',
            };
        const approvalSheet = {
          proofs,
          spend,
          generatedAt: new Date().toISOString(),
        };
        const sheetHash = createHash('sha256')
          .update(JSON.stringify(approvalSheet))
          .digest('hex')
          .slice(0, 16);
        await this.transition(runId, 'approval', {
          proofs,
          approvalSheet,
          sheetHash,
        });
        return this.nextAction(runId);
      }
      default: {
        const next = await this.nextAction(runId);
        if (next.automatic) return next;
        throw new Error(
          `Phase '${run.phase}' is a human gate — ${next.action}`,
        );
      }
    }
  }

  /**
   * PREFLIGHT GATES (law: refusals, not incidents). Green or a list of
   * named refusals; arming while red is what the v16 first arm did.
   */
  async preflight(runId: string): Promise<{
    green: boolean;
    refusals: string[];
  }> {
    const run = await this.load(runId);
    const refusals: string[] = [];

    // GATE 1 — the spend meter agrees with its ledger (the poisoning
    // signature: meter says money moved, the priced ledger disagrees
    // wildly in either direction).
    const windowKey = new Date().toISOString().slice(0, 7);
    const [pool] = await this.prisma.$queryRaw<{ consumed: number }[]>`
      SELECT COALESCE(consumed, 0)::float8 AS consumed
      FROM pool_window_consumption
      WHERE pool_name = 'gemini.monthlySpend' AND window_key = ${windowKey}`;
    const ledgerRows = await this.prisma.$queryRaw<
      {
        model: string | null;
        mode: string | null;
        input_tokens: bigint;
        output_tokens: bigint;
        cached_tokens: bigint;
        duration_hours: number | null;
      }[]
    >`
      SELECT model, mode, SUM(input_tokens) AS input_tokens,
             SUM(output_tokens) AS output_tokens,
             SUM(cached_tokens) AS cached_tokens,
             SUM(duration_hours)::float8 AS duration_hours
      FROM api_usage_ledger
      WHERE service = 'gemini'
        AND created_at >= date_trunc('month', now())
      GROUP BY model, mode`;
    const ledgerMicros = ledgerRows.reduce(
      (sum, row) => sum + pricedGeminiRow(row),
      0,
    );
    const meterMicros = pool?.consumed ?? 0;
    const disagreement =
      Math.abs(meterMicros - ledgerMicros) >
      Math.max(2_000_000, 0.5 * Math.max(meterMicros, ledgerMicros));
    if (meterMicros > 1_000_000 && disagreement) {
      refusals.push(
        `spend meter disagrees with its ledger: pool ` +
          `$${(meterMicros / 1e6).toFixed(2)} vs ledger-priced ` +
          `$${(ledgerMicros / 1e6).toFixed(2)} this month — reconcile ` +
          `before arming (the v16 first arm died on exactly this split).`,
      );
    }

    // GATE 2 — queue quiescence: no non-terminal batch jobs.
    const [{ live }] = await this.prisma.$queryRaw<{ live: number }[]>`
      SELECT COUNT(*)::int AS live FROM llm_batch_jobs
      WHERE status IN ('pending','submitting','submitted','succeeded','ingesting','persisting')`;
    if (live > 0) {
      refusals.push(
        `${live} non-terminal batch job(s) — let them drain or reap them; ` +
          `re-arming over a live queue re-pays stored-input replays.`,
      );
    }

    // GATE 3 — the candidate is still a candidate (an activation that
    // happened underneath this run means the run is stale).
    const candidate = await this.prisma.llmPrompt.findFirst({
      where: { kind: run.promptKind, version: run.candidateVersion },
      select: { status: true },
    });
    if (candidate?.status !== 'candidate') {
      refusals.push(
        `registry version ${run.candidateVersion} is ` +
          `'${candidate?.status ?? 'missing'}' — the run's candidate ` +
          `changed underneath it.`,
      );
    }

    const green = refusals.length === 0;
    await this.mergeState(runId, {
      preflight: { green, refusals, at: new Date().toISOString() },
    });
    return { green, refusals };
  }

  /** OWNER gate: the approval hash binds the sheet that was approved. */
  async approve(runId: string, sheetHash: string): Promise<BenchNextAction> {
    const run = await this.load(runId);
    if (run.phase !== 'approval') {
      throw new Error(`Run is in '${run.phase}', not approval.`);
    }
    const expected = (run.phaseState as { sheetHash?: string }).sheetHash;
    if (expected && sheetHash !== expected) {
      throw new Error(
        `Sheet hash mismatch: approval binds the sheet that was READ ` +
          `(expected ${expected}) — regenerate or re-read before approving.`,
      );
    }
    await this.transition(runId, 'replay', {
      approval: { sheetHash, at: new Date().toISOString() },
    });
    return this.nextAction(runId);
  }

  async recordCampaign(runId: string, campaignId: string): Promise<void> {
    await this.mergeState(runId, { campaignId });
  }

  /**
   * LAW 3 — progress is owned. One drive step: poll/ingest once, report
   * the queue truth, and detect the stalled state LOUDLY. The runner
   * (bench.sh) loops this until 'drained'; a stall is a returned state,
   * never silence.
   */
  async driveStatus(runId: string): Promise<{
    state: 'working' | 'drained' | 'stalled';
    liveJobs: number;
    detail: string;
  }> {
    const run = await this.load(runId);
    const rows = await this.prisma.$queryRaw<
      { status: string; n: number; newest: Date | null }[]
    >`
      SELECT status, COUNT(*)::int AS n, MAX(updated_at) AS newest
      FROM llm_batch_jobs
      WHERE created_at > ${run.createdAt}
      GROUP BY status`;
    const live = rows
      .filter((row) =>
        [
          'pending',
          'submitting',
          'submitted',
          'succeeded',
          'ingesting',
          'persisting',
        ].includes(row.status),
      )
      .reduce((sum, row) => sum + row.n, 0);
    if (live === 0 && rows.length > 0) {
      await this.transition(runId, 'diff', {
        replayDrainedAt: new Date().toISOString(),
      });
      return {
        state: 'drained',
        liveJobs: 0,
        detail: rows.map((row) => `${row.status}=${row.n}`).join(', '),
      };
    }
    const newest = rows.reduce<Date | null>(
      (max, row) =>
        row.newest && (!max || row.newest > max) ? row.newest : max,
      null,
    );
    const stalledMs = newest ? Date.now() - newest.getTime() : 0;
    // 30 minutes without any job-row movement while jobs are live = the
    // v16 silent-25-hours class. A pushed state, never a quiet log.
    if (live > 0 && stalledMs > 30 * 60 * 1000) {
      // The v16 silent-25-hours class, made loud: a pushed alert, deduped
      // per run, the moment the queue stops moving with work outstanding.
      this.opsAlerts.emit({
        severity: 'critical',
        kind: 'bench-replay-stalled',
        title: 'Iteration bench: replay queue stalled',
        body: `Run ${runId}: ${live} live batch job(s) with no state movement for ${Math.round(stalledMs / 60000)} minutes — nothing is polling. drive-loop exits 2; investigate the poller.`,
        dedupeKey: `bench-replay-stalled:${runId}`,
      });
      return {
        state: 'stalled',
        liveJobs: live,
        detail: `no job-state movement for ${Math.round(stalledMs / 60000)}m — is anything polling?`,
      };
    }
    return {
      state: rows.length === 0 ? 'working' : 'working',
      liveJobs: live,
      detail:
        rows.map((row) => `${row.status}=${row.n}`).join(', ') ||
        'no jobs yet (runner booting)',
    };
  }

  async recordDiffArtifact(runId: string, path: string): Promise<void> {
    const run = await this.load(runId);
    if (run.phase !== 'diff') {
      throw new Error(`Run is in '${run.phase}', not diff.`);
    }
    await this.transition(runId, 'review', { diffArtifact: path });
  }

  /** S3: the two standard triage deliverables are REQUIRED review inputs —
   *  generated briefs live beside the diff artifact; the coordinator runs
   *  them and records the summaries here. closeReview refuses without both,
   *  so "we forgot the junk audit" is unrepresentable. */
  async recordTriage(
    runId: string,
    kind: 'lost-support' | 'new-entities',
    summary: string,
  ): Promise<void> {
    const run = await this.load(runId);
    if (run.phase !== 'review') {
      throw new Error(`Run is in '${run.phase}', not review.`);
    }
    const triage =
      (run.phaseState as { triage?: Record<string, string> }).triage ?? {};
    triage[kind] = summary;
    await this.mergeState(runId, { triage });
  }

  async closeReview(runId: string, summary: string): Promise<void> {
    const run = await this.load(runId);
    if (run.phase !== 'review') {
      throw new Error(`Run is in '${run.phase}', not review.`);
    }
    const triage = (run.phaseState as { triage?: Record<string, string> })
      .triage;
    const missing = ['lost-support', 'new-entities'].filter(
      (kind) => !triage?.[kind],
    );
    if (missing.length) {
      throw new Error(
        `Review cannot close: triage deliverable(s) missing [${missing.join(', ')}] — run the generated briefs and recordTriage() each.`,
      );
    }
    await this.transition(runId, 'activation', {
      reviewClosure: { summary, at: new Date().toISOString() },
    });
  }

  /** Closing is automatic bookkeeping: outcome recorded, run banked as the
   *  next estimate's history. Campaign completion stays with the existing
   *  complete-campaign script (one owner for that transition). */
  async recordOutcome(
    runId: string,
    outcome: 'activated' | 'rejected',
  ): Promise<void> {
    const run = await this.load(runId);
    if (run.phase !== 'activation') {
      throw new Error(`Run is in '${run.phase}', not activation.`);
    }
    // BANK THE ACTUALS: this run's real spend becomes the next comparable
    // run's estimate basis (the v16 post-mortem law).
    const campaignId = (run.phaseState as { campaignId?: string }).campaignId;
    let actuals: { spentUsd: number } | undefined;
    let contractRefusals:
      | { total: number; byReason: Record<string, number> }
      | undefined;
    if (campaignId) {
      const [campaign] = await this.prisma.$queryRaw<
        { spent: number }[]
      >`SELECT spent_micros::float8 / 1e6 AS spent FROM spend_campaigns WHERE campaign_id = ${campaignId}::uuid`;
      if (campaign) actuals = { spentUsd: campaign.spent };
      // REFUSAL LIFECYCLE (redteam-l1 F4): close SUMMARIZES the campaign's
      // banked observed-span refusals into the run row — the durable record
      // — because the raw rows are campaign-scoped residue: they cascade
      // away when compactSupersededRuns deletes the campaign's superseded
      // extraction generation (prompt retired → runs compacted → refusals
      // gone with them). The diff already read them during review; this is
      // the count that outlives the rows.
      const refusalRows = await this.prisma.$queryRaw<
        { reason: string; n: number }[]
      >`
        SELECT f.reason, COUNT(*)::int AS n
          FROM collection_extraction_contract_refusals f
          JOIN collection_extraction_runs r
            ON r.extraction_run_id = f.extraction_run_id
         WHERE r.metadata->>'campaignId' = ${campaignId}
         GROUP BY f.reason`;
      contractRefusals = {
        total: refusalRows.reduce((sum, row) => sum + row.n, 0),
        byReason: Object.fromEntries(
          refusalRows.map((row) => [row.reason, row.n]),
        ),
      };
    }
    await this.prisma.iterationRun.update({
      where: { runId },
      data: {
        phase: 'closed',
        status: 'done',
        phaseState: {
          ...(run.phaseState as Prisma.JsonObject),
          outcome: { outcome, at: new Date().toISOString() },
          ...(actuals ? { actuals } : {}),
          ...(contractRefusals ? { contractRefusals } : {}),
        },
      },
    });
  }

  // ── internals ─────────────────────────────────────────────────────────

  private async computeInventory(
    promptKind: string,
    candidateVersion: number,
  ): Promise<InventoryArtifact> {
    const active = await this.prisma.llmPrompt.findFirst({
      where: { kind: promptKind, status: 'active' },
      select: { version: true },
    });
    // Judge lanes: which rule versions the corpus's standing verdicts
    // carry. "Due" per lane = rows not at the lane's newest corpus
    // version; the S2 prober turns each due population into a flip-rate
    // proof. Computed, never recalled — a changed lane cannot be missed.
    const laneRows = await this.prisma.$queryRaw<
      { lane: string; rule_version: number; n: number }[]
    >`
      SELECT lane, rule_version, COUNT(*)::int AS n
      FROM claim_verdicts
      GROUP BY lane, rule_version
      ORDER BY lane, rule_version`;
    const byLane = new Map<string, { versions: number[]; counts: number[] }>();
    for (const row of laneRows) {
      const entry = byLane.get(row.lane) ?? { versions: [], counts: [] };
      entry.versions.push(row.rule_version);
      entry.counts.push(row.n);
      byLane.set(row.lane, entry);
    }
    const judgeLanes = [...byLane.entries()].map(([lane, entry]) => {
      const newest = Math.max(...entry.versions);
      const due = entry.versions.reduce(
        (sum, version, index) =>
          version === newest ? sum : sum + entry.counts[index],
        0,
      );
      return { lane, corpusVersions: entry.versions, dueVerdicts: due };
    });
    return {
      collectionPrompt: {
        activeVersion: active?.version ?? 0,
        candidateVersion,
        changed: (active?.version ?? 0) !== candidateVersion,
      },
      judgeLanes,
      computedAt: new Date().toISOString(),
    };
  }

  private async load(runId: string) {
    const run = await this.prisma.iterationRun.findUnique({
      where: { runId },
    });
    if (!run) throw new Error(`No iteration run ${runId}`);
    if (run.status !== 'active' && run.phase !== 'closed') {
      throw new Error(`Run ${runId} is ${run.status}`);
    }
    return run;
  }

  private async transition(
    runId: string,
    phase: BenchPhase,
    stateAdditions: Record<string, unknown>,
  ): Promise<void> {
    const run = await this.load(runId);
    const from = run.phase as BenchPhase;
    if (BENCH_PHASES.indexOf(phase) !== BENCH_PHASES.indexOf(from) + 1) {
      throw new Error(
        `Illegal transition ${from} → ${phase} — phases are strictly ordered.`,
      );
    }
    await this.prisma.iterationRun.update({
      where: { runId },
      data: {
        phase,
        phaseState: {
          ...(run.phaseState as Prisma.JsonObject),
          ...(stateAdditions as Prisma.JsonObject),
        },
      },
    });
    this.logger.info('Bench phase transition', { runId, from, to: phase });
  }

  private async mergeState(
    runId: string,
    additions: Record<string, unknown>,
  ): Promise<void> {
    const run = await this.load(runId);
    await this.prisma.iterationRun.update({
      where: { runId },
      data: {
        phaseState: {
          ...(run.phaseState as Prisma.JsonObject),
          ...(additions as Prisma.JsonObject),
        },
      },
    });
  }
}
