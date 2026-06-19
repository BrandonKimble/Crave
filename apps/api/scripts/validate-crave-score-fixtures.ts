import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { PublicCraveScoreService } from '../src/modules/content-processing/public-crave-score';
import type {
  CraveScoreCandidates,
  DishCandidate,
  RestaurantCandidate,
  ScoredCraveSubject,
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

const NO_PRIORS = new Map<
  string,
  { score7d: number | null; score28d: number | null }
>();

function score(candidates: CraveScoreCandidates): ScoredCraveSubject[] {
  return scorer.scoreCandidates(candidates, NO_PRIORS, config);
}

function bucket(displayScore: number): number {
  return displayScore < 65
    ? 0
    : displayScore < 70
      ? 1
      : displayScore < 75
        ? 2
        : displayScore < 80
          ? 3
          : displayScore < 85
            ? 4
            : displayScore < 90
              ? 5
              : displayScore < 95
                ? 6
                : 7;
}

function bucketsCovered(displayScores: number[]): number {
  return new Set(displayScores.map(bucket)).size;
}

// ── In-memory invariant suite ───────────────────────────────────────────────

let calibrationSummary: Record<string, unknown> = {};

function runInMemoryChecks(): void {
  const dishes: DishCandidate[] = [];
  const restaurants: RestaurantCandidate[] = [];
  const market = 'fixture-market';

  // Spread fillers: 24 restaurants each with one increasingly-endorsed dish, so
  // the global percentile has a real population to spread across all buckets.
  for (let i = 0; i < 24; i += 1) {
    const id = `filler-${i}`;
    restaurants.push({
      restaurantId: id,
      scoringMarketKey: market,
      praiseMentions: 0,
      praiseUpvotes: 0,
    });
    dishes.push({
      connectionId: `${id}-dish`,
      restaurantId: id,
      scoringMarketKey: market,
      mentions: i + 1,
      upvotes: (i + 1) * 5,
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
      scoringMarketKey: market,
      praiseMentions: praiseM,
      praiseUpvotes: praiseU,
    });
  };
  const addDish = (rid: string, suffix: string, m: number, u: number): void => {
    dishes.push({
      connectionId: `${rid}-${suffix}`,
      restaurantId: rid,
      scoringMarketKey: market,
      mentions: m,
      upvotes: u,
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

  const scored = score({ dishes, restaurants });
  const restaurantScored = scored.filter((r) => r.subjectType === 'restaurant');
  const dishScored = scored.filter((r) => r.subjectType === 'connection');
  const byId = new Map(restaurantScored.map((r) => [r.subjectId, r]));
  const display = (id: string): number => byId.get(id)?.displayScore ?? -1;

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
    'restaurant scores spread across the full color range',
    bucketsCovered(restDisplays) >= 6 &&
      Math.min(...restDisplays) < 70 &&
      Math.max(...restDisplays) > 95,
    'covers >=6 of 8 buckets, min<70, max>95',
    {
      buckets: bucketsCovered(restDisplays),
      min: round(Math.min(...restDisplays)),
      max: round(Math.max(...restDisplays)),
    },
  );

  expectCheck(
    'dish scores spread across the full color range',
    bucketsCovered(dishDisplays) >= 6,
    'covers >=6 of 8 buckets',
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
    bucketsCovered(restaurants) >= 6,
    'covers >=6 of 8 buckets',
    { buckets: bucketsCovered(restaurants) },
  );

  expectCheck(
    'DB rebuild leaves no orphan latest-score rows',
    Number(orphan.c) === 0,
    'orphan restaurant scores == 0',
    { orphans: Number(orphan.c) },
  );
}

// Synthetic-age decay test: exercises the exact age-weight expression from
// loadCandidates (power(0.5, age_days / halfLife) over event mentioned_at). The
// half-life's real *effect* needs a multi-year corpus, but the math is verified now.
async function runDecayCheck(): Promise<void> {
  if (skipDb) {
    return;
  }
  const halfLife = config.endorsementHalfLifeDays;
  const [w] = await prisma.$queryRaw<
    Array<{ fresh: unknown; one_hl: unknown; two_hl: unknown }>
  >`
    SELECT
      power(0.5, EXTRACT(EPOCH FROM (now() - now())) / 86400.0 / ${halfLife}::numeric) AS fresh,
      power(0.5, EXTRACT(EPOCH FROM (now() - (now() - make_interval(days => (${halfLife})::int)))) / 86400.0 / ${halfLife}::numeric) AS one_hl,
      power(0.5, EXTRACT(EPOCH FROM (now() - (now() - make_interval(days => (${halfLife} * 2)::int)))) / 86400.0 / ${halfLife}::numeric) AS two_hl
  `;
  const fresh = Number(w.fresh);
  const oneHl = Number(w.one_hl);
  const twoHl = Number(w.two_hl);
  expectCheck(
    'decay: post-date age-weight halves every half-life',
    Math.abs(fresh - 1) < 1e-9 &&
      Math.abs(oneHl - 0.5) < 1e-3 &&
      Math.abs(twoHl - 0.25) < 1e-3,
    'fresh=1.0, +1 half-life=0.5, +2 half-lives=0.25',
    {
      halfLifeDays: halfLife,
      fresh: round(fresh, 4),
      oneHalfLife: round(oneHl, 4),
      twoHalfLives: round(twoHl, 4),
    },
  );
}

async function main(): Promise<void> {
  runInMemoryChecks();
  await runDbSmokeCheck();
  await runDecayCheck();

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
