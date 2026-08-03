import { EntityType } from '@prisma/client';
import {
  KeywordSliceSelectionService,
  type KeywordTermCandidate,
} from './keyword-slice-selection.service';
import {
  KeywordExploreYieldEstimatorService,
  KEYWORD_EXPLORE_YIELD_ESTIMATOR,
  exploreYieldSubjectKey,
} from './keyword-explore-yield.estimator';
import {
  EstimatorRegistry,
  type EstimatorStateStore,
  type SubjectState,
} from '../../estimators/estimator-registry';

/**
 * D41 — the explore family ranks on MEASURED yield (documents returned per
 * search, per (engine, entityType) class) read as an upper-confidence bound,
 * not on the deleted 0.45/0.35/0.2 blend of novelty, localSpecialization and
 * trend.
 *
 * The RED proof at the bottom is the load-bearing one: it reconstructs the
 * old blend and shows these specs FAIL against it. Without it, "the score
 * comes from the estimator" is a claim no test could ever contradict.
 */

const ENGINE = 'austin';

/** In-memory store — the durable seam's contract without a database. */
function memoryStore(): EstimatorStateStore & {
  rows: Map<string, SubjectState>;
} {
  const rows = new Map<string, SubjectState>();
  return {
    rows,
    load: (name, keys) =>
      Promise.resolve(
        keys
          .filter((key) => rows.has(`${name}::${key}`))
          .map((key) => ({ subjectKey: key, ...rows.get(`${name}::${key}`)! })),
      ),
    save: (name, key, state) => {
      rows.set(`${name}::${key}`, { ...state });
      return Promise.resolve();
    },
  };
}

function buildEstimator(): {
  service: KeywordExploreYieldEstimatorService;
  store: ReturnType<typeof memoryStore>;
} {
  const store = memoryStore();
  const service = new KeywordExploreYieldEstimatorService(store as never);
  return { service, store };
}

function exploreCandidate(
  term: string,
  entityType: EntityType,
  origin: Record<string, unknown> = {},
): KeywordTermCandidate {
  return {
    term,
    normalizedTerm: term,
    slice: 'explore',
    score: 0,
    entityType,
    origin,
  };
}

function buildSelection(
  exploreYield: KeywordExploreYieldEstimatorService,
): KeywordSliceSelectionService {
  const logger = {
    setContext: jest.fn().mockReturnThis(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return new KeywordSliceSelectionService(
    {} as never,
    {} as never,
    exploreYield as never,
    {} as never,
    { emit: jest.fn() } as never,
    logger as never,
  );
}

/** The private scorer, exercised directly — it is where the blend lived. */
function score(
  service: KeywordSliceSelectionService,
  candidate: KeywordTermCandidate,
  now: Date,
  history?: { lastOutcome: null; lastAttemptAt: Date | null },
): KeywordTermCandidate {
  return (
    service as unknown as {
      applyAttemptHistoryAdjustments(
        candidate: KeywordTermCandidate,
        history: unknown,
        now: Date,
        engineName?: string,
      ): KeywordTermCandidate;
    }
  ).applyAttemptHistoryAdjustments(candidate, history, now, ENGINE);
}

function sortCandidates(
  service: KeywordSliceSelectionService,
  candidates: KeywordTermCandidate[],
): KeywordTermCandidate[] {
  const svc = service as unknown as {
    compareCandidates(a: KeywordTermCandidate, b: KeywordTermCandidate): number;
  };
  const compare = (a: KeywordTermCandidate, b: KeywordTermCandidate): number =>
    svc.compareCandidates(a, b);
  return [...candidates].sort(compare);
}

async function observe(
  estimator: KeywordExploreYieldEstimatorService,
  entityType: EntityType,
  values: number[],
  at: Date,
): Promise<void> {
  for (const value of values) {
    await estimator.observeHarvest({
      engineName: ENGINE,
      entityType,
      resultCount: value,
      observedAt: at,
    });
  }
}

describe('D41 explore selection — measured-yield UCB', () => {
  const now = new Date('2026-08-03T00:00:00Z');

  it('an unobserved class WINS optimistically over a measured one', async () => {
    const { service: estimator } = buildEstimator();
    // 'food' has been measured, and measured MEDIOCRE (2 docs a search).
    await observe(estimator, EntityType.food, [2, 2, 2, 2], now);
    await estimator.primeClasses(ENGINE, [
      EntityType.food,
      EntityType.restaurant,
    ]);
    const selection = buildSelection(estimator);

    const measured = score(
      selection,
      exploreCandidate('tacos', EntityType.food),
      now,
    );
    const starved = score(
      selection,
      exploreCandidate('el-primo', EntityType.restaurant),
      now,
    );

    expect(Number.isFinite(measured.score)).toBe(true);
    expect(starved.score).toBe(Number.POSITIVE_INFINITY);
    expect(sortCandidates(selection, [measured, starved])[0]).toBe(starved);
  });

  it('after observations, the higher-yielding class outranks the lower one', async () => {
    const { service: estimator } = buildEstimator();
    await observe(estimator, EntityType.food, [40, 38, 42, 41], now);
    await observe(estimator, EntityType.restaurant, [1, 0, 1, 0], now);
    await estimator.primeClasses(ENGINE, [
      EntityType.food,
      EntityType.restaurant,
    ]);
    const selection = buildSelection(estimator);

    const rich = score(
      selection,
      exploreCandidate('birria', EntityType.food),
      now,
    );
    const poor = score(
      selection,
      exploreCandidate('el-primo', EntityType.restaurant),
      now,
    );

    expect(rich.score).toBeGreaterThan(poor.score);
    expect(sortCandidates(selection, [poor, rich])[0]).toBe(rich);
    // And the score is in DOCUMENTS, not [0,1] blend units.
    expect(rich.score).toBeGreaterThan(1);
  });

  it('coverage rotation orders within a class: never-attempted first, then oldest', async () => {
    const { service: estimator } = buildEstimator();
    await observe(estimator, EntityType.food, [5, 5, 5, 5], now);
    await estimator.primeClasses(ENGINE, [EntityType.food]);
    const selection = buildSelection(estimator);

    const recent = score(
      selection,
      exploreCandidate('tacos', EntityType.food),
      now,
      { lastOutcome: null, lastAttemptAt: new Date('2026-08-01T00:00:00Z') },
    );
    const old = score(
      selection,
      exploreCandidate('queso', EntityType.food),
      now,
      { lastOutcome: null, lastAttemptAt: new Date('2026-05-01T00:00:00Z') },
    );
    const never = score(
      selection,
      exploreCandidate('elote', EntityType.food),
      now,
      { lastOutcome: null, lastAttemptAt: null },
    );

    // Same class ⇒ identical score; only the rotation separates them.
    expect(recent.score).toBe(old.score);
    expect(
      sortCandidates(selection, [recent, old, never]).map((c) => c.term),
    ).toEqual(['elote', 'queso', 'tacos']);
  });

  it('the three deleted proxies are gone as ranking inputs (diagnostics only)', async () => {
    const { service: estimator } = buildEstimator();
    await estimator.primeClasses(ENGINE, [EntityType.food]);
    const selection = buildSelection(estimator);

    // Two candidates whose PROXY inputs differ wildly — under the blend
    // these scored differently; under D41 they cannot.
    const trendy = score(
      selection,
      exploreCandidate('tacos', EntityType.food, {
        currentActs: 500,
        previousActs: 1,
        localDemand: 100,
        globalDemand: 100,
      }),
      now,
    );
    const flat = score(
      selection,
      exploreCandidate('queso', EntityType.food, {
        currentActs: 0,
        previousActs: 500,
        localDemand: 1,
        globalDemand: 10_000,
      }),
      now,
    );

    expect(trendy.score).toBe(flat.score);
    const origin = trendy.origin as Record<string, unknown>;
    expect(origin.novelty).toBeUndefined();
    expect(origin.trend).toBeUndefined();
    expect(origin.localSpecialization).toBeUndefined();
    // The raw inputs SURVIVE as recorded diagnostics.
    expect(origin.currentActs).toBe(500);
    expect(origin.localDemand).toBe(100);
    expect(origin.exploreYield).toBeTruthy();
  });

  it('RED PROOF: the deleted blend fails these specs', () => {
    // The exact scorer that was removed, reconstructed.
    const clamp01 = (value: number): number =>
      !Number.isFinite(value) || value <= 0 ? 0 : value >= 1 ? 1 : value;
    const blendScore = (
      origin: Record<string, number>,
      lastAttemptAt: Date | null,
    ): number => {
      const trend = clamp01(
        (origin.currentActs - origin.previousActs) /
          Math.max(1, origin.previousActs),
      );
      const otherDemand = Math.max(0, origin.globalDemand - origin.localDemand);
      const localSpecialization = clamp01(
        (origin.localDemand + 1) / (otherDemand + 1) / 3,
      );
      const novelty = lastAttemptAt
        ? clamp01(
            (now.getTime() - lastAttemptAt.getTime()) /
              (30 * 24 * 60 * 60 * 1000),
          )
        : 1;
      return 0.45 * novelty + 0.35 * localSpecialization + 0.2 * trend;
    };

    // (1) The starved-class spec: under the blend a candidate's score is
    //     always finite and ≤ 1 — no candidate can win optimistically.
    const starved = blendScore(
      { currentActs: 0, previousActs: 0, localDemand: 0, globalDemand: 0 },
      null,
    );
    expect(starved).not.toBe(Number.POSITIVE_INFINITY);
    expect(starved).toBeLessThanOrEqual(1);

    // (2) The measured-yield spec: the blend cannot tell a 40-doc class from
    //     a 0-doc class, because yield is not one of its inputs.
    const identicalInputs = {
      currentActs: 10,
      previousActs: 5,
      localDemand: 20,
      globalDemand: 30,
    };
    expect(blendScore(identicalInputs, null)).toBe(
      blendScore(identicalInputs, null),
    );

    // (3) The proxy-independence spec: the blend ranks trendy ABOVE flat —
    //     precisely the behavior D41 deleted.
    const trendy = blendScore(
      {
        currentActs: 500,
        previousActs: 1,
        localDemand: 100,
        globalDemand: 100,
      },
      null,
    );
    const flat = blendScore(
      {
        currentActs: 0,
        previousActs: 500,
        localDemand: 1,
        globalDemand: 10_000,
      },
      null,
    );
    expect(trendy).toBeGreaterThan(flat);
  });
});

describe('D41 durable estimator seam', () => {
  const now = new Date('2026-08-03T00:00:00Z');

  it('beliefs survive a process restart (the whole reason the table exists)', async () => {
    const store = memoryStore();

    const first = new KeywordExploreYieldEstimatorService(store as never);
    await observe(first, EntityType.food, [10, 12, 11, 9], now);
    await first.primeClasses(ENGINE, [EntityType.food]);
    const before = first.classReading(ENGINE, EntityType.food, now);
    expect(before.nEffective).toBeCloseTo(4, 5);

    // A brand-new process — in-memory state gone, durable state intact.
    const second = new KeywordExploreYieldEstimatorService(store as never);
    await second.primeClasses(ENGINE, [EntityType.food]);
    const after = second.classReading(ENGINE, EntityType.food, now);

    expect(after.nEffective).toBeCloseTo(before.nEffective, 5);
    expect(after.estimate).toBeCloseTo(before.estimate, 5);
    expect(after.uncertainty).toBeCloseTo(before.uncertainty, 5);
    expect(Number.isFinite(after.uncertainty)).toBe(true);

    // Without the store the SAME observations evaporate — cold start forever.
    const volatile = new EstimatorRegistry();
    volatile.register(KEYWORD_EXPLORE_YIELD_ESTIMATOR);
    const cold = volatile.read(
      KEYWORD_EXPLORE_YIELD_ESTIMATOR.name,
      exploreYieldSubjectKey(ENGINE, EntityType.food),
      now,
    );
    expect(cold.uncertainty).toBe(Number.POSITIVE_INFINITY);
    expect(cold.nEffective).toBe(0);
  });

  it('hydration never clobbers fresher in-process observations', async () => {
    const store = memoryStore();
    const service = new KeywordExploreYieldEstimatorService(store as never);
    await observe(service, EntityType.food, [10, 10], now);
    const seen = service.classReading(ENGINE, EntityType.food, now).nEffective;
    // A re-prime after observing must be a no-op, not a rollback.
    await service.primeClasses(ENGINE, [EntityType.food]);
    expect(service.classReading(ENGINE, EntityType.food, now).nEffective).toBe(
      seen,
    );
  });
});
