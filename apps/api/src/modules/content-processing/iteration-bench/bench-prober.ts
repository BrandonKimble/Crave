/**
 * THE FLIP-RATE PROBER SEAM (plans/iteration-bench.md S2). A prober
 * re-asks a stratified sample of a lane's OUTDATED verdicts under the
 * CURRENT rule and reports agreement — writing nothing. The comparison is
 * the carry-forward proof: flips ≈ 0 means the old decisions survive the
 * new rule and the population reuses for free; a high flip rate means the
 * change was semantic and the re-buy is genuinely owed.
 *
 * Adapters live WITH their lanes (the wiring knowledge stays home — the
 * same law as claim-lane-adapter and the batch ingestor registry); lanes
 * register here at module init. A lane without a prober is REPORTED as
 * such on the approval sheet — honesty over pretend-automation.
 */
export interface BenchProbeResult {
  lane: string;
  sampled: number;
  flips: number;
  flipRate: number;
  /** Old-vs-new reasoning for every flip, capped — the owner-band's
   *  reading material. */
  flipExamples: Array<{
    claimKey: string;
    storedOutcome: string;
    probedOutcome: string;
    probedReason?: string;
  }>;
}

export interface BenchLaneProber {
  readonly lane: string;
  /** Sample OUTDATED verdicts (below the lane's current rule version),
   *  re-ask under the current rule, compare. MUST NOT write verdicts. */
  probe(sampleSize: number): Promise<BenchProbeResult>;
}

export class BenchProberRegistry {
  private readonly probers = new Map<string, BenchLaneProber>();

  register(prober: BenchLaneProber): void {
    this.probers.set(prober.lane, prober);
  }

  get(lane: string): BenchLaneProber | undefined {
    return this.probers.get(lane);
  }

  lanes(): string[] {
    return [...this.probers.keys()];
  }
}

/** The one registry — module-scope on purpose: lanes register at their own
 *  module init with no DI-graph coupling to the bench (the same shape as
 *  the mobile header-descriptor registry). */
export const benchProberRegistry = new BenchProberRegistry();
