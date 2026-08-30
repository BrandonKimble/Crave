/**
 * THE STANDING VERDICT-REPLAY REGRESSION HARNESS (owner-ordered 2026-08-30).
 *
 * Twice this campaign, replaying HISTORICAL ledgered verdicts against the
 * CURRENT prompt/rule version caught real defects before they shipped (the
 * judge-context ablation and the attribute rulings replay,
 * plans/sameness-court-report.md). This module is that move generalized:
 * for ANY judged lane, sample its `claim_verdicts`, re-ask each question
 * under the rule text in force today, and report the change table — drift
 * detection for every judge, on demand.
 *
 * READ-ONLY BY CONSTRUCTION. Nothing in this module holds a reference to
 * `ClaimVerdictLedgerService.record` or any effect executor; a replay
 * MEASURES what today's judge would say, it never re-rules. That is also
 * why replays do NOT ride `ClaimRehearingBudgetService.authorizeDrain`:
 * the rehearing budget bounds VERDICT-BUYING drains (spend that mutates
 * the ledger and then the corpus); a replay buys zero verdicts, is
 * operator-invoked, and is bounded instead by the hard sample cap below.
 * That exemption is deliberate and stated, not an oversight.
 *
 * THE SEAM IS THE BENCH PROBER'S, GENERALIZED (iteration-bench/
 * bench-prober.ts): same registry pattern, same no-writes law, same
 * flip-table shape. It is deliberately NOT the same registry — the bench
 * prober answers a narrower question (do OUTDATED verdicts survive the new
 * rule, for carry-forward proofs) while this harness replays the whole
 * ledgered population, current rows included, to detect drift. The word
 * lanes share one underlying re-judge method between both seams
 * (WordVocabularyJudgeService.replayClaims), so no judging logic is
 * duplicated; folding the two registries into one is a clean follow-up
 * once the bench's outdated-only sampling is expressed as a stratum here.
 */

/** One ledgered verdict as the sampler hands it to an adapter. */
export interface StoredVerdictRow {
  claimKey: string;
  ruleVersion: number;
  foldVersion: number;
  outcome: string;
  reason: string;
  subject: unknown;
  decidedAt: Date;
  /** Which stratum sampled it: 'recent' | 'random' | 'outcome'. */
  stratum: string;
}

/** What the current judge said about one stored verdict. */
export interface ReplayRowResult {
  claimKey: string;
  storedOutcome: string;
  storedReason: string;
  storedRuleVersion: number;
  status: 'unchanged' | 'flipped' | 'unreplayable';
  newOutcome?: string;
  newReason?: string;
  /** For 'unreplayable': WHY the hearing could not be rebuilt (entity
   *  merged away, inputs not stored, ...). Counted honestly, never
   *  silently dropped. */
  note?: string;
}

/**
 * A lane's replay adapter: the lane-specific knowledge of how to rebuild a
 * hearing's inputs from the stored claim key + subject and re-ask under the
 * current rule. MUST NOT write verdicts or execute effects.
 */
export interface VerdictReplayAdapter {
  readonly lane: string;
  /** The rule version in force today — stamped on the report so a summary
   *  is comparable across time. */
  currentRuleVersion(): number;
  rejudge(rows: readonly StoredVerdictRow[]): Promise<ReplayRowResult[]>;
}

/** A lane that is REGISTERED but has no replay implementation yet. The
 *  runner reports it loudly ("no adapter") instead of silently skipping —
 *  the bench prober's honesty law. */
export interface UnimplementedReplayLane {
  readonly lane: string;
  /** Why no adapter exists (inputs not reconstructable, covered elsewhere,
   *  pending). Printed verbatim on every run. */
  readonly reason: string;
}

export interface LaneReplayReport {
  lane: string;
  currentRuleVersion: number | null;
  implemented: boolean;
  /** For unimplemented lanes: the stated reason. */
  noAdapterReason?: string;
  sampled: number;
  unchanged: number;
  flipped: ReplayRowResult[];
  unreplayable: number;
  unreplayableNotes: Record<string, number>;
  flipRate: number;
  /** Flip transitions tallied: "old->new" -> count. */
  flipTransitions: Record<string, number>;
  /** Measured LLM traffic during this lane's replay (api_usage_ledger
   *  delta over the run window — facts, not estimates; dollars live in
   *  the BigQuery billing export). */
  usage: { requests: number; inputTokens: number; outputTokens: number };
}

/** The machine-readable summary a future cron can alarm on. */
export interface ReplaySummary {
  generatedAt: string;
  sampleCapPerLane: number;
  lanes: LaneReplayReport[];
}

/** Default sample per lane; the invocation-level spend bound. */
export const DEFAULT_SAMPLE = 100;
/** The hard cap: no invocation replays more than this many verdicts per
 *  lane, whatever the flags say. */
export const HARD_SAMPLE_CAP = 500;

export class VerdictReplayRegistry {
  private readonly adapters = new Map<string, VerdictReplayAdapter>();
  private readonly unimplemented = new Map<string, UnimplementedReplayLane>();

  register(adapter: VerdictReplayAdapter): void {
    this.adapters.set(adapter.lane, adapter);
    this.unimplemented.delete(adapter.lane);
  }

  registerUnimplemented(entry: UnimplementedReplayLane): void {
    if (!this.adapters.has(entry.lane)) {
      this.unimplemented.set(entry.lane, entry);
    }
  }

  get(lane: string): VerdictReplayAdapter | undefined {
    return this.adapters.get(lane);
  }

  noAdapter(lane: string): UnimplementedReplayLane | undefined {
    return this.unimplemented.get(lane);
  }

  /** Every lane the harness knows about, implemented or not. */
  lanes(): string[] {
    return [...this.adapters.keys(), ...this.unimplemented.keys()];
  }

  implementedLanes(): string[] {
    return [...this.adapters.keys()];
  }
}
