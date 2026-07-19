import {
  decideSupply,
  medianTestProbability,
  normalCdf,
  SupplyReadings,
  SupplyState,
} from './poll-supply-controller';
import {
  CONVERSION_PRIOR,
  TAIL_CONCENTRATION_PRIOR,
  VIABILITY_PRIOR,
} from './poll-supply.constants';

const NOW = new Date('2026-07-19T14:00:00Z');

function readings(overrides: Partial<SupplyReadings> = {}): SupplyReadings {
  return {
    weeklyDemandMass: 0,
    answerYield: CONVERSION_PRIOR,
    conversion: CONVERSION_PRIOR,
    tailConcentration: TAIL_CONCENTRATION_PRIOR,
    viability: { estimate: VIABILITY_PRIOR, uncertainty: 0 },
    ...overrides,
  };
}

function state(overrides: Partial<SupplyState> = {}): SupplyState {
  return {
    frontier: 3,
    phase: 'learned',
    credit: 3,
    creditUpdatedAt: new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000),
    ...overrides,
  };
}

describe('normalCdf', () => {
  it('is ~0.5 at zero, monotone, and correct in the tails', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
    expect(normalCdf(Number.POSITIVE_INFINITY)).toBe(1);
    expect(normalCdf(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe('decideSupply — warm start (§4)', () => {
  it('predicts the frontier from mass × conversion × concentration ÷ viability', () => {
    // mass 120 at priors (conversion 1, concentration 1, viability 15) → 8.
    const decision = decideSupply({
      now: NOW,
      state: null,
      readings: readings({ weeklyDemandMass: 120 }),
      lastClosedCohortAnswerCounts: null,
    });
    expect(decision.frontier).toBe(8);
    expect(decision.phase).toBe('warm_start');
    // The prediction mints the first cohort's credit — warm start publishes.
    expect(decision.cohortTarget).toBe(8);
  });

  it('small places predict <1 and start at the exploration slot (1, K6)', () => {
    const decision = decideSupply({
      now: NOW,
      state: null,
      readings: readings({ weeklyDemandMass: 2 }),
      lastClosedCohortAnswerCounts: null,
    });
    expect(decision.frontier).toBe(1);
    expect(decision.cohortTarget).toBe(1);
  });
});

describe('decideSupply — first-cohort correction (§4)', () => {
  it('JUMPs to the re-estimate once the first cohort has closed (no slew)', () => {
    const decision = decideSupply({
      now: NOW,
      state: state({ phase: 'warm_start', frontier: 8, credit: 0 }),
      // Cohort-1 measurements say the place converts at half the prior and
      // concentrates: 120 × 0.5 × 0.5 ÷ 15 = 2 — a 6-step JUMP, allowed
      // because the correction is not slew-limited.
      readings: readings({
        weeklyDemandMass: 120,
        conversion: 0.5,
        tailConcentration: 0.5,
      }),
      lastClosedCohortAnswerCounts: [20, 12, 4],
    });
    expect(decision.frontier).toBe(2);
    expect(decision.phase).toBe('learned');
  });

  it('holds warm start until a cohort actually closes', () => {
    const decision = decideSupply({
      now: NOW,
      state: state({ phase: 'warm_start', frontier: 8 }),
      readings: readings({ weeklyDemandMass: 120 }),
      lastClosedCohortAnswerCounts: null,
    });
    expect(decision.frontier).toBe(8);
    expect(decision.phase).toBe('warm_start');
  });
});

describe('decideSupply — steady-state median test (§4/K6)', () => {
  it('expands +1 when the weakest poll clears viability (P > ½)', () => {
    const decision = decideSupply({
      now: NOW,
      state: state({ frontier: 3 }),
      readings: readings({ weeklyDemandMass: 100 }),
      lastClosedCohortAnswerCounts: [40, 25, 18], // weakest 18 ≥ 15
    });
    expect(decision.medianTestP).toBe(1);
    expect(decision.frontier).toBe(4);
  });

  it('contracts −1 when the weakest poll misses viability (P < ½)', () => {
    const decision = decideSupply({
      now: NOW,
      state: state({ frontier: 3 }),
      readings: readings({ weeklyDemandMass: 100 }),
      lastClosedCohortAnswerCounts: [40, 25, 9], // weakest 9 < 15
    });
    expect(decision.medianTestP).toBe(0);
    expect(decision.frontier).toBe(2);
  });

  it('the tie (weakest == viability, zero uncertainty) expands — no dead zone, the ±1 dither IS the exploration', () => {
    const decision = decideSupply({
      now: NOW,
      state: state({ frontier: 3 }),
      readings: readings({ weeklyDemandMass: 100 }),
      lastClosedCohortAnswerCounts: [40, VIABILITY_PRIOR],
    });
    expect(decision.medianTestP).toBe(1);
    expect(decision.frontier).toBe(4);
  });

  it('slew limit: exactly ±1 per week regardless of how far off the frontier is', () => {
    const expand = decideSupply({
      now: NOW,
      state: state({ frontier: 2 }),
      readings: readings({ weeklyDemandMass: 10_000 }),
      lastClosedCohortAnswerCounts: [500, 400],
    });
    expect(expand.frontier).toBe(3); // not a jump to the predicted frontier

    const contract = decideSupply({
      now: NOW,
      state: state({ frontier: 9 }),
      readings: readings({ weeklyDemandMass: 10_000 }),
      lastClosedCohortAnswerCounts: [0, 0, 0],
    });
    expect(contract.frontier).toBe(8);
  });

  it('never contracts below the exploration slot (1, K6)', () => {
    const decision = decideSupply({
      now: NOW,
      state: state({ frontier: 1 }),
      readings: readings({ weeklyDemandMass: 5 }),
      lastClosedCohortAnswerCounts: [2],
    });
    expect(decision.frontier).toBe(1);
  });

  it('uses the viability uncertainty as a real probability when present', () => {
    const p = medianTestProbability(15, { estimate: 15, uncertainty: 3 });
    expect(p).toBeCloseTo(0.5, 6);
    expect(
      medianTestProbability(18, { estimate: 15, uncertainty: 3 }),
    ).toBeGreaterThan(0.5);
    expect(
      medianTestProbability(12, { estimate: 15, uncertainty: 3 }),
    ).toBeLessThan(0.5);
  });

  it('holds the frontier when no cohort closed since the last tick', () => {
    const decision = decideSupply({
      now: NOW,
      state: state({ frontier: 4 }),
      readings: readings({ weeklyDemandMass: 100 }),
      lastClosedCohortAnswerCounts: null,
    });
    expect(decision.frontier).toBe(4);
  });
});

describe('decideSupply — credit (the warranting accumulator, §4)', () => {
  it('accrues at creditRate = mass × answerYield ÷ viability and decays on the 14d half-life', () => {
    // One week elapsed: decay factor 0.5^(7/14) = 1/√2; accrual = rate × 1wk.
    const decision = decideSupply({
      now: NOW,
      state: state({ frontier: 5, credit: 2 }),
      readings: readings({
        weeklyDemandMass: 30,
        answerYield: 0.5,
        viability: { estimate: 15, uncertainty: 0 },
      }),
      lastClosedCohortAnswerCounts: null,
    });
    const expectedRate = (30 * 0.5) / 15; // 1 poll/week
    expect(decision.creditRate).toBeCloseTo(expectedRate, 9);
    expect(decision.credit).toBeCloseTo(2 * Math.pow(0.5, 0.5) + 1, 9);
  });

  it('cohortTarget is credit-bounded: the frontier cannot outspend the warrant', () => {
    const decision = decideSupply({
      now: NOW,
      state: state({ frontier: 6, credit: 1.4 }),
      readings: readings({ weeklyDemandMass: 0 }), // rate 0 — decay only
      lastClosedCohortAnswerCounts: null,
    });
    expect(decision.cohortTarget).toBeLessThanOrEqual(1);
  });

  it('ghost-town termination: yield → 0 drives the rate to 0 and the decaying credit under 1 — publishing stops with NO threshold constant', () => {
    let current: SupplyState = state({ frontier: 3, credit: 2.5 });
    let target = Number.POSITIVE_INFINITY;
    for (let week = 0; week < 6; week += 1) {
      const decision = decideSupply({
        now: new Date(NOW.getTime() + week * 7 * 24 * 60 * 60 * 1000),
        state: current,
        readings: readings({ weeklyDemandMass: 40, answerYield: 0 }),
        lastClosedCohortAnswerCounts: null,
      });
      target = decision.cohortTarget;
      current = {
        frontier: decision.frontier,
        phase: decision.phase,
        credit: decision.credit - target,
        creditUpdatedAt: new Date(
          NOW.getTime() + week * 7 * 24 * 60 * 60 * 1000,
        ),
      };
    }
    expect(target).toBe(0);
  });
});
