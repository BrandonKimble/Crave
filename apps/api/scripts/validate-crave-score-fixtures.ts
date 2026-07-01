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
