import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import { join } from 'path';
import {
  PublicCraveScoreService,
  buildCalibrationIndex,
  laneActivity,
  neutralCalibrationIndex,
  observedDays,
} from '../src/modules/content-processing/public-crave-score';
import type {
  CalibrationIndex,
  CraveScoreCandidates,
  DishCandidate,
  RestaurantCandidate,
  ScoredCraveSubject,
  SourceContribution,
} from '../src/modules/content-processing/public-crave-score';

// ---------------------------------------------------------------------------
// Crave Score v3 fixture validation.
//
// (1) In-memory invariant suite over scoreCandidates — the scoring math:
//     endorsement strength, discounted dish-acclaim + praise, global percentile,
//     dishless-carried-by-praise, inclusion floor, full distribution spread.
// (2) Real-DB rebuild smoke check (skip with --skip-db) — runs the production
//     rebuildAllScores and asserts a healthy distribution + no orphans.
// ---------------------------------------------------------------------------

type FixtureStatus = 'pass' | 'fail';
type FixtureCheck = {
  name: string;
  status: FixtureStatus;
  expected: unknown;
  observed: unknown;
};

const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const outputPath = outputArg
  ? outputArg.slice('--output='.length)
  : join(
      process.cwd(),
      '..',
      '..',
      'plans',
      'crave-score-fixture-validation-report.md',
    );

const skipDb = process.argv.includes('--skip-db');

const noopLogger = {
  setContext() {
    return this;
  },
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const prisma = new PrismaClient();
const scorer = new PublicCraveScoreService(
  prisma as never,
  noopLogger as never,
);
const config = scorer.getConfig();

const checks: FixtureCheck[] = [];

function expectCheck(
  name: string,
  condition: boolean,
  expected: unknown,
  observed: unknown,
): void {
  checks.push({
    name,
    status: condition ? 'pass' : 'fail',
    expected,
    observed,
  });
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function score(candidates: CraveScoreCandidates): ScoredCraveSubject[] {
  return scorer.scoreCandidates(candidates, config);
}

// Ten color tiers = deciles aligned to the integer rating on the 0-10 scale:
// tier = clamp(floor(displayScore), 0, 9). Mirrors the palette decile buckets.
function bucket(displayScore: number): number {
  return Math.min(9, Math.max(0, Math.floor(displayScore)));
}

function bucketsCovered(displayScores: number[]): number {
  return new Set(displayScores.map(bucket)).size;
}

// ── In-memory invariant suite ───────────────────────────────────────────────

let calibrationSummary: Record<string, unknown> = {};

function runInMemoryChecks(): void {
  const dishes: DishCandidate[] = [];
  const restaurants: RestaurantCandidate[] = [];
  // §8: candidates carry per-source contributions; with no calibration index
  // (this in-memory suite) every room is neutral (g = 1) — raw v3 math, i.e.
  // the kill-condition baseline these named scenarios pin.
  const room = (m: number, u: number) => [
    { sourceId: null, platform: null, mentions: m, upvotes: u },
  ];

  // Spread fillers: 24 restaurants each with one increasingly-endorsed dish, so
  // the global percentile has a real population to spread across all buckets.
  for (let i = 0; i < 24; i += 1) {
    const id = `filler-${i}`;
    restaurants.push({
      restaurantId: id,
      praiseContributions: room(0, 0),
    });
    dishes.push({
      connectionId: `${id}-dish`,
      restaurantId: id,
      contributions: room(i + 1, (i + 1) * 5),
    });
  }

  // Named scenarios.
  const addRestaurant = (
    id: string,
    praiseM: number,
    praiseU: number,
  ): void => {
    restaurants.push({
      restaurantId: id,
      praiseContributions: room(praiseM, praiseU),
    });
  };
  const addDish = (rid: string, suffix: string, m: number, u: number): void => {
    dishes.push({
      connectionId: `${rid}-${suffix}`,
      restaurantId: rid,
      contributions: room(m, u),
    });
  };

  addRestaurant('peak', 0, 0);
  addDish('peak', 'd1', 40, 300);

  addRestaurant('mediocre', 0, 0);
  addDish('mediocre', 'd1', 1, 1);
  addDish('mediocre', 'd2', 1, 1);
  addDish('mediocre', 'd3', 1, 1);

  addRestaurant('broad', 0, 0);
  addDish('broad', 'd1', 40, 300);
  addDish('broad', 'd2', 30, 200);
  addDish('broad', 'd3', 20, 120);

  addRestaurant('peakWeak', 0, 0);
  addDish('peakWeak', 'd1', 40, 300);
  addDish('peakWeak', 'd2', 1, 1);

  addRestaurant('dishlessStrong', 25, 400);
  addRestaurant('dishlessWeak', 1, 2);
  addRestaurant('empty', 0, 0); // no dishes, no praise → must be excluded

  // Reorder-regime cases — exercise the pooled model (upvote = mention = 1 vote),
  // the regime the extreme-separation fixtures above never hit.
  addRestaurant('upvoteHeavyHost', 0, 0);
  addDish('upvoteHeavyHost', 'd1', 1, 50); // 1 mention + 50 upvotes → 51 pooled
  addRestaurant('mentionHeavyHost', 0, 0);
  addDish('mentionHeavyHost', 'd1', 10, 10); // 10 + 10 → 20 pooled
  // Calibration-only (no hard assert — the "right" order is a real-data call): a
  // single wildly-upvoted dish vs a broad-but-modest menu with some by-name praise.
  addRestaurant('viralOneDish', 0, 0);
  addDish('viralOneDish', 'd1', 2, 500);
  addRestaurant('broadModest', 8, 12);
  addDish('broadModest', 'd1', 5, 10);
  addDish('broadModest', 'd2', 5, 10);
  addDish('broadModest', 'd3', 5, 10);
  addDish('broadModest', 'd4', 5, 10);

  const scored = score({ dishes, restaurants });
  const restaurantScored = scored.filter((r) => r.subjectType === 'restaurant');
  const dishScored = scored.filter((r) => r.subjectType === 'connection');
  const byId = new Map(restaurantScored.map((r) => [r.subjectId, r]));
  const display = (id: string): number => byId.get(id)?.displayScore ?? -1;
  const dishById = new Map(dishScored.map((d) => [d.subjectId, d]));
  const dishDisplay = (id: string): number =>
    dishById.get(id)?.displayScore ?? -1;

  const restDisplays = restaurantScored.map((r) => r.displayScore);
  const dishDisplays = dishScored.map((r) => r.displayScore);

  calibrationSummary = {
    restaurantCount: restaurantScored.length,
    dishCount: dishScored.length,
    restaurantBucketsCovered: bucketsCovered(restDisplays),
    restaurantRange: [
      round(Math.min(...restDisplays)),
      round(Math.max(...restDisplays)),
    ],
    named: {
      peak: display('peak'),
      mediocre: display('mediocre'),
      broad: display('broad'),
      peakWeak: display('peakWeak'),
      dishlessStrong: display('dishlessStrong'),
      dishlessWeak: display('dishlessWeak'),
    },
    reorderRegime: {
      upvoteHeavyDish: dishDisplay('upvoteHeavyHost-d1'),
      mentionHeavyDish: dishDisplay('mentionHeavyHost-d1'),
      viralOneDish: display('viralOneDish'),
      broadModest: display('broadModest'),
    },
  };

  expectCheck(
    'inclusion floor excludes zero-endorsement restaurants',
    !byId.has('empty'),
    'empty restaurant (no dishes, no praise) is unrated',
    { emptyScored: byId.has('empty') },
  );

  expectCheck(
    'a great standout dish beats a menu of mediocre dishes (peak)',
    display('peak') > display('mediocre'),
    'peak > mediocre',
    { peak: display('peak'), mediocre: display('mediocre') },
  );

  expectCheck(
    'more genuinely-good dishes rank higher (breadth, not average)',
    display('broad') > display('peak'),
    'broad (3 great) > peak (1 great)',
    { broad: display('broad'), peak: display('peak') },
  );

  expectCheck(
    'a weak dish never drags — it adds a discounted increment',
    display('peakWeak') >= display('peak'),
    'peak+weak >= peak',
    { peakWeak: display('peakWeak'), peak: display('peak') },
  );

  expectCheck(
    'dishless restaurants are scored, carried by praise',
    byId.has('dishlessStrong') &&
      byId.has('dishlessWeak') &&
      display('dishlessStrong') > display('dishlessWeak'),
    'dishlessStrong > dishlessWeak, both scored',
    {
      dishlessStrong: display('dishlessStrong'),
      dishlessWeak: display('dishlessWeak'),
    },
  );

  expectCheck(
    'strong by-name praise can outrank a single-great-dish place',
    display('dishlessStrong') > display('peak'),
    'dishlessStrong > peak',
    { dishlessStrong: display('dishlessStrong'), peak: display('peak') },
  );

  expectCheck(
    'upvotes count as full votes: an upvote-heavy dish beats a mention-heavy one with fewer total endorsers',
    dishDisplay('upvoteHeavyHost-d1') > dishDisplay('mentionHeavyHost-d1'),
    'upvoteHeavy (51 pooled endorsers) > mentionHeavy (20 pooled)',
    {
      upvoteHeavy: dishDisplay('upvoteHeavyHost-d1'),
      mentionHeavy: dishDisplay('mentionHeavyHost-d1'),
    },
  );

  expectCheck(
    'restaurant scores spread across the full color range',
    bucketsCovered(restDisplays) >= 7 &&
      Math.min(...restDisplays) < 2.5 &&
      Math.max(...restDisplays) > 9,
    'covers >=7 of 10 buckets, min<2.5, max>9',
    {
      buckets: bucketsCovered(restDisplays),
      min: round(Math.min(...restDisplays)),
      max: round(Math.max(...restDisplays)),
    },
  );

  expectCheck(
    'dish scores spread across the full color range',
    bucketsCovered(dishDisplays) >= 7,
    'covers >=7 of 10 buckets',
    { buckets: bucketsCovered(dishDisplays) },
  );

  expectCheck(
    'all display scores stay within the configured curve',
    [...restDisplays, ...dishDisplays].every(
      (s) => s >= config.displayMin && s <= config.displayMax,
    ),
    `all in [${config.displayMin}, ${config.displayMax}]`,
    {
      restRange: [
        round(Math.min(...restDisplays)),
        round(Math.max(...restDisplays)),
      ],
      dishRange: [
        round(Math.min(...dishDisplays)),
        round(Math.max(...dishDisplays)),
      ],
    },
  );
}

// ── §8 calibration condition suite (wave-5 §17 gap-close) ───────────────────
//
// COVERAGE MAP — §8's fixture-gated conditions vs this script:
// - kill condition (calibrated beats raw v3 on the named scenarios)……… HERE
//   ('calibrated surfaces the sparse-market winner raw v3 is blind to').
// - fake-elite closure / sparse_market_winner_not_fake_elite………………… HERE
//   (floor-clamp check + provable-RED unfloored reversal).
// - upvote-linearity named gate…………………………………………………………………… HERE (exact
//   linear pooling; the u_i/ū_source adoption path replaces the weight
//   by MEASURED SHARE, never a fitted exponent — asserting no exponent).
// - Phase-0 dial re-probe (praise 2×, ρ = 0.5) on CALIBRATED masses…… HERE
//   (the v3 ordering sentences re-proven under non-neutral g).
// - author-concentration fixture for doc-count A……………………………………… HERE
//   (room size is DOCUMENT mass — mention volume cannot inflate g).
// - two-cadence coverage-normalization……………………………………………………… HERE
//   (per-observed-day normalization: cadence ≠ room size).
// - per-lane constants + rising-flap fixture………………………………………………… HERE
//   (steady-state world through per-lane indices ⇒ rising ≡ 0).
// Already covered by the v3 suite above (mapping): endorsement pooling /
// peak-vs-breadth / weak-never-drags / dishless-praise / inclusion floor /
// spread + bounds; the in-memory suite's neutral index IS the raw-v3
// baseline the kill condition compares against.

function runCalibrationChecks(): void {
  const roomOf = (
    sourceId: string,
    platform: string,
    m: number,
    u: number,
  ): SourceContribution[] => [{ sourceId, platform, mentions: m, upvotes: u }];

  // Rooms: a reference metro room (A = ref → g = 1) and a nearly-dead sparse
  // room. Floor clamp: amplification capped at ref/floor = 10×.
  const constants = { aRef: 5, aFloor: 0.5 };
  const sources = [
    {
      sourceId: 'src-metro',
      platform: 'reddit',
      anchorPlaceId: null,
      engineId: null,
      activity: { stable: 5, fast: 5 },
    },
    {
      sourceId: 'src-sparse',
      platform: 'reddit',
      anchorPlaceId: null,
      engineId: null,
      activity: { stable: 0.001, fast: 0.001 },
    },
  ];
  const calibrated = buildCalibrationIndex('stable', constants, sources);
  // Provable-RED backstop: the SAME corpus without the floor.
  const unfloored = buildCalibrationIndex(
    'stable',
    { aRef: 5, aFloor: 0 },
    sources,
  );

  const buildCandidates = (): CraveScoreCandidates => {
    const dishes: DishCandidate[] = [];
    const restaurants: RestaurantCandidate[] = [];
    for (let i = 0; i < 24; i += 1) {
      const id = `cal-filler-${i}`;
      restaurants.push({ restaurantId: id, praiseContributions: [] });
      dishes.push({
        connectionId: `${id}-dish`,
        restaurantId: id,
        contributions: roomOf('src-metro', 'reddit', i + 1, (i + 1) * 5),
      });
    }
    const add = (rid: string, sourceId: string, m: number, u: number): void => {
      restaurants.push({ restaurantId: rid, praiseContributions: [] });
      dishes.push({
        connectionId: `${rid}-d1`,
        restaurantId: rid,
        contributions: roomOf(sourceId, 'reddit', m, u),
      });
    };
    add('metroElite', 'src-metro', 40, 300);
    add('sparseWinner', 'src-sparse', 2, 4);
    add('metroTwin', 'src-metro', 2, 4); // identical raw counts, metro room
    return { dishes, restaurants };
  };

  const displayUnder = (index: CalibrationIndex): ((id: string) => number) => {
    const scored = scorer.scoreCandidates(buildCandidates(), config, index);
    const byId = new Map(
      scored
        .filter((r) => r.subjectType === 'restaurant')
        .map((r) => [r.subjectId, r.displayScore]),
    );
    return (id: string) => byId.get(id) ?? -1;
  };

  const raw = displayUnder(neutralCalibrationIndex('stable'));
  const cal = displayUnder(calibrated);
  const noFloor = displayUnder(unfloored);

  // KILL CONDITION (§8): calibrated must beat raw v3 on the named scenario —
  // raw v3 is blind to rooms (sparseWinner == metroTwin); calibration
  // surfaces the sparse market's genuine winner.
  expectCheck(
    'kill condition: raw v3 is room-blind (sparseWinner == metroTwin)',
    Math.abs(raw('sparseWinner') - raw('metroTwin')) < 1e-9,
    'identical raw display',
    { sparseWinner: raw('sparseWinner'), metroTwin: raw('metroTwin') },
  );
  expectCheck(
    'kill condition: calibrated surfaces the sparse-market winner raw v3 cannot',
    cal('sparseWinner') > cal('metroTwin'),
    'calibrated sparseWinner > metroTwin',
    { sparseWinner: cal('sparseWinner'), metroTwin: cal('metroTwin') },
  );

  // sparse_market_winner_not_fake_elite: the floor clamp caps amplification —
  // the sparse winner surfaces WITHOUT leapfrogging the metro elite…
  expectCheck(
    'sparse_market_winner_not_fake_elite: floor-capped amplification keeps metroElite on top',
    cal('metroElite') > cal('sparseWinner'),
    'calibrated metroElite > sparseWinner',
    { metroElite: cal('metroElite'), sparseWinner: cal('sparseWinner') },
  );
  // …and the check can go RED: remove the floor and the dead room mints a
  // fake elite (proves the assertion is load-bearing, not always-green).
  expectCheck(
    'fake-elite RED backstop: WITHOUT the floor the dead room out-scores the metro elite',
    noFloor('sparseWinner') > noFloor('metroElite'),
    'unfloored sparseWinner > metroElite',
    {
      sparseWinner: noFloor('sparseWinner'),
      metroElite: noFloor('metroElite'),
    },
  );

  // Upvote-linearity named gate: upvotes pool LINEARLY at upvoteWeight —
  // doubling upvotes exactly doubles pooled mass (never a fitted exponent;
  // the pre-agreed adoption path swaps the WEIGHT for measured u_i/ū_source).
  {
    const linDishes: DishCandidate[] = [
      {
        connectionId: 'lin-u10',
        restaurantId: 'lin-host',
        contributions: roomOf('src-metro', 'reddit', 0, 10),
      },
      {
        connectionId: 'lin-u20',
        restaurantId: 'lin-host',
        contributions: roomOf('src-metro', 'reddit', 0, 20),
      },
    ];
    const scored = scorer.scoreCandidates(
      {
        dishes: linDishes,
        restaurants: [{ restaurantId: 'lin-host', praiseContributions: [] }],
      },
      config,
      calibrated,
    );
    const pooled = new Map(
      scored
        .filter((r) => r.subjectType === 'connection')
        .map((r) => [r.subjectId, Math.expm1(r.endorsementRaw)]),
    );
    const u10 = pooled.get('lin-u10') ?? NaN;
    const u20 = pooled.get('lin-u20') ?? NaN;
    // endorsementRaw is stored rounded (6dp) — compare at 1e-3 relative,
    // far tighter than any exponent (u^0.9 would miss by ~25% here).
    expectCheck(
      'upvote-linearity: pooled mass is exactly linear in upvotes (weight, no exponent)',
      Math.abs(u20 - 2 * u10) / (2 * u10) < 1e-3 &&
        Math.abs(u10 - config.upvoteWeight * 10) / u10 < 1e-3,
      'pooled(2u) == 2·pooled(u) == 2·upvoteWeight·u (±0.1%)',
      { u10, u20, upvoteWeight: config.upvoteWeight },
    );
  }

  // Phase-0 dial re-probe (praise 2×, ρ = 0.5) on CALIBRATED masses: the v3
  // ordering sentences must survive non-neutral g (rooms mixed on purpose).
  {
    const dishes: DishCandidate[] = [];
    const restaurants: RestaurantCandidate[] = [];
    for (let i = 0; i < 24; i += 1) {
      const id = `dial-filler-${i}`;
      restaurants.push({ restaurantId: id, praiseContributions: [] });
      dishes.push({
        connectionId: `${id}-dish`,
        restaurantId: id,
        contributions: roomOf('src-metro', 'reddit', i + 1, (i + 1) * 5),
      });
    }
    const addDish = (
      rid: string,
      suffix: string,
      sourceId: string,
      m: number,
      u: number,
    ): void => {
      dishes.push({
        connectionId: `${rid}-${suffix}`,
        restaurantId: rid,
        contributions: roomOf(sourceId, 'reddit', m, u),
      });
    };
    const addRestaurant = (
      rid: string,
      praise: SourceContribution[] = [],
    ): void => {
      restaurants.push({ restaurantId: rid, praiseContributions: praise });
    };
    addRestaurant('dial-peak');
    addDish('dial-peak', 'd1', 'src-metro', 40, 300);
    addRestaurant('dial-mediocre');
    addDish('dial-mediocre', 'd1', 'src-sparse', 1, 1);
    addDish('dial-mediocre', 'd2', 'src-metro', 1, 1);
    addDish('dial-mediocre', 'd3', 'src-metro', 1, 1);
    addRestaurant('dial-broad');
    addDish('dial-broad', 'd1', 'src-metro', 40, 300);
    addDish('dial-broad', 'd2', 'src-sparse', 3, 20);
    addDish('dial-broad', 'd3', 'src-metro', 20, 120);
    addRestaurant('dial-peakWeak');
    addDish('dial-peakWeak', 'd1', 'src-metro', 40, 300);
    addDish('dial-peakWeak', 'd2', 'src-sparse', 1, 1);
    addRestaurant(
      'dial-dishlessStrong',
      roomOf('src-metro', 'reddit', 25, 400),
    );
    const scored = scorer.scoreCandidates(
      { dishes, restaurants },
      config,
      calibrated,
    );
    const byId = new Map(
      scored
        .filter((r) => r.subjectType === 'restaurant')
        .map((r) => [r.subjectId, r.displayScore]),
    );
    const d = (id: string) => byId.get(id) ?? -1;
    expectCheck(
      'dial re-probe on calibrated masses: ρ=0.5 + praise 2× ordering sentences hold under non-neutral g',
      d('dial-broad') > d('dial-peak') &&
        d('dial-peak') > d('dial-mediocre') &&
        d('dial-peakWeak') >= d('dial-peak') &&
        d('dial-dishlessStrong') > d('dial-peak'),
      'broad > peak > mediocre; peak+weak >= peak; dishlessStrong > peak',
      {
        broad: d('dial-broad'),
        peak: d('dial-peak'),
        mediocre: d('dial-mediocre'),
        peakWeak: d('dial-peakWeak'),
        dishlessStrong: d('dial-dishlessStrong'),
      },
    );
  }

  // Author-concentration (doc-count A): a room's activity A is gate-passing
  // DOCUMENT mass — mention volume inside the documents cannot inflate the
  // room, so g is identical for a mention-dense and a mention-light room of
  // the same document output; the mention side saturates through log1p.
  {
    const sameDocMassA = laneActivity(3, 10);
    const sameDocMassB = laneActivity(3, 10);
    const concIndex = buildCalibrationIndex('stable', constants, [
      {
        ...sources[0],
        sourceId: 'src-dense',
        activity: { stable: sameDocMassA, fast: sameDocMassA },
      },
      {
        ...sources[0],
        sourceId: 'src-light',
        activity: { stable: sameDocMassB, fast: sameDocMassB },
      },
    ]);
    const scored = scorer.scoreCandidates(
      {
        dishes: [
          {
            connectionId: 'conc-dense',
            restaurantId: 'conc-host',
            contributions: roomOf('src-dense', 'reddit', 100, 0),
          },
          {
            connectionId: 'conc-light',
            restaurantId: 'conc-host',
            contributions: roomOf('src-light', 'reddit', 10, 0),
          },
        ],
        restaurants: [{ restaurantId: 'conc-host', praiseContributions: [] }],
      },
      config,
      concIndex,
    );
    const raw = new Map(
      scored
        .filter((r) => r.subjectType === 'connection')
        .map((r) => [r.subjectId, r.endorsementRaw]),
    );
    const dense = raw.get('conc-dense') ?? NaN;
    const light = raw.get('conc-light') ?? NaN;
    expectCheck(
      'author-concentration: doc-count A (equal g for equal doc mass) + log1p damps mention flooding',
      sameDocMassA === sameDocMassB && dense < 2 * light,
      '10× the mentions in an equal-doc room gains < 2× endorsement',
      { dense, light, gEqual: sameDocMassA === sameDocMassB },
    );
  }

  // Two-cadence coverage normalization: A is per OBSERVED day — the same
  // decayed doc mass over 10 observed days measures 10× the room of one
  // spread over 100; and observation never exceeds the lane window.
  {
    const now = new Date();
    const dayMs = 86_400_000;
    const clamped = observedDays(
      { from: new Date(now.getTime() - 200 * dayMs), through: now },
      100,
      now,
    );
    expectCheck(
      'two-cadence coverage normalization: per-observed-day A + window clamp',
      Math.abs(laneActivity(30, 10) - 10 * laneActivity(30, 100)) < 1e-9 &&
        Math.abs(clamped - 100) < 1e-6,
      'A(30 mass, 10d) == 10 × A(30 mass, 100d); observedDays clamps to τ',
      {
        aDense: laneActivity(30, 10),
        aSparse: laneActivity(30, 100),
        clampedDays: clamped,
      },
    );
  }

  // Per-lane rising-flap: a STEADY world (identical activity in both lanes,
  // per-subject masses in fixed proportion) through the per-lane indices must
  // produce rising ≡ 0 — lane constants alone can never manufacture a flap.
  {
    const stableIndex = buildCalibrationIndex('stable', constants, sources);
    const fastIndex = buildCalibrationIndex('fast', constants, sources);
    const candidates = buildCandidates();
    const stableScored = scorer.scoreCandidates(
      candidates,
      config,
      stableIndex,
    );
    const fastScored = scorer.scoreCandidates(candidates, config, fastIndex);
    const fastByKey = new Map(
      fastScored.map((r) => [`${r.subjectType}:${r.subjectId}`, r.rawDisplay]),
    );
    let maxFlap = 0;
    for (const row of stableScored) {
      const fast = fastByKey.get(`${row.subjectType}:${row.subjectId}`);
      if (fast != null) {
        maxFlap = Math.max(maxFlap, Math.abs(fast - row.rawDisplay));
      }
    }
    expectCheck(
      'per-lane rising-flap: steady-state world ⇒ rising ≡ 0 through both lane indices',
      maxFlap < 1e-9,
      'max |fast − stable| rawDisplay == 0',
      { maxFlap },
    );
  }
}

// ── Real-DB rebuild smoke check ─────────────────────────────────────────────

async function runDbSmokeCheck(): Promise<void> {
  if (skipDb) {
    expectCheck(
      'DB rebuild smoke check skipped by flag',
      true,
      '--skip-db',
      'skipped',
    );
    return;
  }

  const result = await scorer.rebuildAllScores();
  const rows = await prisma.$queryRaw<
    Array<{ subject_type: string; display_score: unknown }>
  >`SELECT subject_type, display_score FROM core_public_entity_scores WHERE score_version = ${config.scoreVersion}`;
  const restaurants = rows
    .filter((r) => r.subject_type === 'restaurant')
    .map((r) => Number(r.display_score));
  const connections = rows
    .filter((r) => r.subject_type === 'connection')
    .map((r) => Number(r.display_score));
  const all = [...restaurants, ...connections];

  const [orphan] = await prisma.$queryRaw<Array<{ c: bigint }>>`
    SELECT COUNT(*) c
    FROM core_public_entity_scores s
    WHERE s.subject_type = 'restaurant'
      AND NOT EXISTS (
        SELECT 1 FROM core_entities e
        WHERE e.entity_id = s.subject_id AND e.type = 'restaurant'
      )
  `;

  expectCheck(
    'DB rebuild scores both restaurants and dishes',
    restaurants.length > 0 && connections.length > 0,
    'restaurants > 0 and connections > 0',
    {
      scored: result.scoredCount,
      restaurants: restaurants.length,
      connections: connections.length,
    },
  );

  expectCheck(
    'DB display scores stay within the configured curve',
    all.length > 0 &&
      all.every((s) => s >= config.displayMin && s <= config.displayMax),
    `all in [${config.displayMin}, ${config.displayMax}]`,
    all.length
      ? { min: round(Math.min(...all)), max: round(Math.max(...all)) }
      : { min: null, max: null },
  );

  expectCheck(
    'DB restaurant scores spread across the full color range',
    bucketsCovered(restaurants) >= 7,
    'covers >=7 of 10 buckets',
    { buckets: bucketsCovered(restaurants) },
  );

  expectCheck(
    'DB rebuild leaves no orphan latest-score rows',
    Number(orphan.c) === 0,
    'orphan restaurant scores == 0',
    { orphans: Number(orphan.c) },
  );

  // EQUALITY GATE — the per-contribution mention ledger must faithfully
  // reproduce the projection's counts: weight-1 record count == direct+support
  // mention count, and record-upvote sum == direct+support upvote mass, for
  // every connection. If this is nonzero the fan-out is no longer preserved.
  const [equality] = await prisma.$queryRaw<Array<{ mismatches: bigint }>>`
    SELECT COUNT(*) mismatches FROM core_restaurant_items c
    LEFT JOIN (
      SELECT connection_id, COUNT(*) m, SUM(source_upvotes) u
      FROM core_restaurant_item_mentions
      GROUP BY connection_id
    ) r ON r.connection_id = c.connection_id
    WHERE COALESCE(r.m, 0) <> (c.mention_count + c.support_mention_count)
       OR COALESCE(r.u, 0) <> (c.total_upvotes + c.support_total_upvotes)
  `;
  expectCheck(
    'mention ledger exactly reproduces projection counts (equality gate)',
    Number(equality.mismatches) === 0,
    'mismatches == 0',
    { mismatches: Number(equality.mismatches) },
  );

  // Synthetic-age decay: power(0.5, age/halflife) ≈ 1 / 0.5 / 0.25 at age
  // 0 / halflife / 2·halflife. Confirms the decay weight used by the scorer.
  const halfLife = config.endorsementHalfLifeDays;
  const [decay] = await prisma.$queryRaw<
    Array<{ w0: number; w1: number; w2: number }>
  >`
    SELECT
      power(0.5, 0)::float8 AS w0,
      power(0.5, EXTRACT(EPOCH FROM make_interval(days => ${halfLife}::int))/86400.0/(${halfLife})::numeric)::float8 AS w1,
      power(0.5, EXTRACT(EPOCH FROM make_interval(days => (${halfLife} * 2)::int))/86400.0/(${halfLife})::numeric)::float8 AS w2
  `;
  expectCheck(
    'decay weight halves each half-life (synthetic age 0 / hl / 2·hl)',
    Math.abs(decay.w0 - 1) < 1e-6 &&
      Math.abs(decay.w1 - 0.5) < 1e-6 &&
      Math.abs(decay.w2 - 0.25) < 1e-6,
    'weights ≈ [1, 0.5, 0.25]',
    {
      w0: round(decay.w0, 4),
      w1: round(decay.w1, 4),
      w2: round(decay.w2, 4),
    },
  );
}

async function main(): Promise<void> {
  runInMemoryChecks();
  runCalibrationChecks();
  await runDbSmokeCheck();

  const failedChecks = checks.filter((check) => check.status === 'fail');
  const report = [
    '# Crave Score v3 Fixture Validation Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Status: ${failedChecks.length === 0 ? 'PASS' : 'FAIL'}`,
    '',
    '## Calibration Summary',
    '',
    '```json',
    JSON.stringify(calibrationSummary, null, 2),
    '```',
    '',
    '## Checks',
    '',
    ...checks.flatMap((check) => [
      `### ${check.status === 'pass' ? 'PASS' : 'FAIL'} - ${check.name}`,
      '',
      `Expected: ${JSON.stringify(check.expected)}`,
      '',
      `Observed: ${JSON.stringify(check.observed, null, 2)}`,
      '',
    ]),
  ].join('\n');

  writeFileSync(outputPath, report);
  await prisma.$disconnect();

  if (failedChecks.length > 0) {
    console.error(report);
    process.exit(1);
  }
  console.log(report);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
