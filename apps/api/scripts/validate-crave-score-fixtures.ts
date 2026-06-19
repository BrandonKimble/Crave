import 'dotenv/config';
import {
  FavoriteListType,
  FavoriteListVisibility,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { PublicCraveScoreService } from '../src/modules/content-processing/public-crave-score';
import { FavoriteListsService } from '../src/modules/favorites/favorite-lists.service';
import {
  EntityScope,
  QueryPlan,
  SearchQueryRequestDto,
} from '../src/modules/search/dto/search-query.dto';
import { SearchCoverageService } from '../src/modules/search/search-coverage.service';
import { SearchQueryBuilder } from '../src/modules/search/search-query.builder';
import { SearchQueryExecutor } from '../src/modules/search/search-query.executor';
import type {
  CraveScoreCandidate,
  CraveScoreSubjectType,
  ScoredCraveSubject,
} from '../src/modules/content-processing/public-crave-score';

type FixtureStatus = 'pass' | 'fail';

type FixtureCheck = {
  name: string;
  status: FixtureStatus;
  expected: unknown;
  observed: unknown;
  notes?: string[];
};

type ScoreHistogramBucket = {
  range: string;
  count: number;
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

const noopLogger = {
  setContext() {
    return this;
  },
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const scorer = new PublicCraveScoreService({} as never, noopLogger as never);
const config = scorer.getConfig();

const checks: FixtureCheck[] = [];
const skipDbIntegration = process.argv.includes('--skip-db');
const keepDbFixtures = process.argv.includes('--keep');
const DB_FIXTURE_FAMILY = 'crave-score-db-fixture';
const DB_FIXTURE_MARKET = 'crave-score-db-market';

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function pass(
  name: string,
  expected: unknown,
  observed: unknown,
  notes?: string[],
): FixtureCheck {
  return { name, status: 'pass', expected, observed, notes };
}

function fail(
  name: string,
  expected: unknown,
  observed: unknown,
  notes?: string[],
): FixtureCheck {
  return { name, status: 'fail', expected, observed, notes };
}

function expectCheck(
  name: string,
  condition: boolean,
  expected: unknown,
  observed: unknown,
  notes?: string[],
): void {
  checks.push(
    condition
      ? pass(name, expected, observed, notes)
      : fail(name, expected, observed, notes),
  );
}

function candidate(params: {
  subjectType?: CraveScoreSubjectType;
  subjectId: string;
  market: string;
  raw: number;
  mentions: number;
  upvotes: number;
  docs: number;
  supportMentions?: number;
}): CraveScoreCandidate {
  return {
    subjectType: params.subjectType ?? 'restaurant',
    subjectId: params.subjectId,
    scoringMarketKey: params.market,
    rawQualityScore: params.raw,
    directMentionCount: params.mentions,
    supportMentionCount:
      params.supportMentions ?? Math.round(params.mentions * 0.2),
    upvoteMass: params.upvotes,
    sourceDocumentCount: params.docs,
  };
}

function createMarket(params: {
  subjectType?: CraveScoreSubjectType;
  market: string;
  prefix: string;
  count: number;
  rawStart: number;
  rawStep: number;
  evidenceScale: number;
}): CraveScoreCandidate[] {
  return Array.from({ length: params.count }, (_, index) => {
    const normalizedIndex = index / Math.max(params.count - 1, 1);
    const raw = params.rawStart + params.rawStep * normalizedIndex;
    const evidence = params.evidenceScale * (0.65 + normalizedIndex * 0.7);
    return candidate({
      subjectType: params.subjectType,
      subjectId: `${params.prefix}-${index + 1}`,
      market: params.market,
      raw: round(raw, 2),
      mentions: Math.max(1, Math.round(evidence)),
      upvotes: Math.max(1, Math.round(evidence * 3.2)),
      docs: Math.max(1, Math.round(evidence / 5)),
    });
  });
}

function byId(scored: ScoredCraveSubject[]): Map<string, ScoredCraveSubject> {
  return new Map(scored.map((row) => [row.subjectId, row]));
}

function scoredSummary(
  row: ScoredCraveSubject | undefined,
): Record<string, unknown> | null {
  if (!row) {
    return null;
  }
  return {
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    marketKey: row.scoringMarketKey,
    rawQualityScore: round(row.rawQualityScore),
    globalZ: round(row.globalZ),
    marketZ: row.marketZ == null ? null : round(row.marketZ),
    marketReliability: round(row.marketReliability, 5),
    entityConfidence: round(row.entityConfidence, 5),
    normalizedSignal: round(row.normalizedSignal),
    posteriorSignal: round(row.posteriorSignal),
    displayScore: row.displayScore,
    scoreDelta7d: row.scoreDelta7d,
    movementState: row.movementState,
  };
}

function histogram(values: number[]): ScoreHistogramBucket[] {
  const buckets = [
    { min: 60, max: 70, range: '60.0-69.9' },
    { min: 70, max: 80, range: '70.0-79.9' },
    { min: 80, max: 85, range: '80.0-84.9' },
    { min: 85, max: 90, range: '85.0-89.9' },
    { min: 90, max: 95, range: '90.0-94.9' },
    { min: 95, max: 100, range: '95.0-99.9' },
  ];
  return buckets.map((bucket) => ({
    range: bucket.range,
    count: values.filter((value) => value >= bucket.min && value < bucket.max)
      .length,
  }));
}

function score(
  candidates: CraveScoreCandidate[],
  priorScores = new Map<
    string,
    { score7d: number | null; score28d: number | null }
  >(),
): ScoredCraveSubject[] {
  return scorer.scoreCandidates(candidates, priorScores, config).scored;
}

const restaurantCandidates: CraveScoreCandidate[] = [
  ...createMarket({
    market: 'region-us-ny-new-york',
    prefix: 'nyc',
    count: 70,
    rawStart: 58,
    rawStep: 37,
    evidenceScale: 90,
  }),
  ...createMarket({
    market: 'region-us-tx-austin',
    prefix: 'austin',
    count: 42,
    rawStart: 56,
    rawStep: 38,
    evidenceScale: 48,
  }),
  ...createMarket({
    market: 'region-us-mn-duluth',
    prefix: 'duluth',
    count: 12,
    rawStart: 52,
    rawStep: 34,
    evidenceScale: 12,
  }),
  candidate({
    subjectId: 'austin-broad-consensus',
    market: 'region-us-tx-austin',
    raw: 93,
    mentions: 84,
    upvotes: 330,
    docs: 18,
  }),
  candidate({
    subjectId: 'austin-thin-hype',
    market: 'region-us-tx-austin',
    raw: 93,
    mentions: 6,
    upvotes: 26,
    docs: 2,
  }),
  candidate({
    subjectId: 'rural-undefeated-small-sample',
    market: 'region-us-ok-rural',
    raw: 99,
    mentions: 2,
    upvotes: 9,
    docs: 1,
  }),
  candidate({
    subjectId: 'nyc-equal-participation-share',
    market: 'region-us-ny-new-york',
    raw: 90,
    mentions: 90,
    upvotes: 320,
    docs: 20,
  }),
  candidate({
    subjectId: 'austin-equal-participation-share',
    market: 'region-us-tx-austin',
    raw: 90,
    mentions: 45,
    upvotes: 160,
    docs: 10,
  }),
];

const connectionCandidates: CraveScoreCandidate[] = [
  ...createMarket({
    subjectType: 'connection',
    market: 'region-us-ny-new-york',
    prefix: 'nyc-dish',
    count: 90,
    rawStart: 50,
    rawStep: 44,
    evidenceScale: 70,
  }),
  ...createMarket({
    subjectType: 'connection',
    market: 'region-us-tx-austin',
    prefix: 'austin-dish',
    count: 56,
    rawStart: 49,
    rawStep: 43,
    evidenceScale: 44,
  }),
  candidate({
    subjectType: 'connection',
    subjectId: 'austin-dish-broad-consensus',
    market: 'region-us-tx-austin',
    raw: 92,
    mentions: 92,
    upvotes: 410,
    docs: 22,
  }),
  candidate({
    subjectType: 'connection',
    subjectId: 'rural-dish-viral-one-week',
    market: 'region-us-ok-rural',
    raw: 98,
    mentions: 3,
    upvotes: 12,
    docs: 1,
  }),
];

const allCandidates = [...restaurantCandidates, ...connectionCandidates];
const scored = score(allCandidates);
const scoredById = byId(scored);
const scores = scored.map((row) => row.displayScore);
const maxScore = Math.max(...scores);
const minScore = Math.min(...scores);
const pureRawScores = allCandidates.map((row) => row.rawQualityScore);
const selectedCalibrationFixtures = [
  'austin-broad-consensus',
  'austin-thin-hype',
  'rural-undefeated-small-sample',
  'nyc-equal-participation-share',
  'austin-equal-participation-share',
  'austin-dish-broad-consensus',
  'rural-dish-viral-one-week',
];
const targetBandLosses = [
  {
    name: 'austin-broad-consensus',
    expectedRange: [90, 95] as const,
  },
  {
    name: 'austin-thin-hype',
    expectedRange: [78, 86] as const,
  },
  {
    name: 'rural-undefeated-small-sample',
    expectedRange: [76, 85] as const,
  },
  {
    name: 'austin-dish-broad-consensus',
    expectedRange: [90, 95] as const,
  },
].map((band) => {
  const actual = scoredById.get(band.name)?.displayScore ?? 0;
  const [minExpected, maxExpected] = band.expectedRange;
  const loss =
    actual < minExpected
      ? minExpected - actual
      : actual > maxExpected
        ? actual - maxExpected
        : 0;
  return {
    name: band.name,
    expectedRange: `${minExpected}-${maxExpected}`,
    actual,
    loss: round(loss),
  };
});
const calibrationSummary = {
  selectedConstants: {
    scoreVersion: config.scoreVersion,
    displayCurveVersion: config.displayCurveVersion,
    displayMin: config.displayMin,
    displayMax: config.displayMax,
    displayCenter: config.displayCenter,
    displayScale: config.displayScale,
    marketReliabilityK: config.marketReliabilityK,
    entityConfidenceK: config.entityConfidenceK,
    entityConfidencePower: config.entityConfidencePower,
    robustSpreadFloor: config.robustSpreadFloor,
    directMentionWeight: config.directMentionWeight,
    supportMentionWeight: config.supportMentionWeight,
    upvoteMassWeight: config.upvoteMassWeight,
    sourceBreadthWeight: config.sourceBreadthWeight,
  },
  rejectedConstantsCount: 0,
  softTargetBandLoss: round(
    targetBandLosses.reduce((total, row) => total + row.loss, 0),
  ),
  targetBandLosses,
  scoreHistogram: histogram(scores),
  thresholdCounts: {
    atOrAbove95: scores.filter((score) => score >= 95).length,
    atOrAbove90: scores.filter((score) => score >= 90).length,
    atOrAbove85: scores.filter((score) => score >= 85).length,
    below80: scores.filter((score) => score < 80).length,
    forced100: scores.filter((score) => score >= 100).length,
  },
  rawQualityRange: {
    min: round(Math.min(...pureRawScores)),
    max: round(Math.max(...pureRawScores)),
  },
  selectedFixtures: Object.fromEntries(
    selectedCalibrationFixtures.map((id) => [
      id,
      scoredSummary(scoredById.get(id)),
    ]),
  ),
};
const nycEqual = scoredById.get('nyc-equal-participation-share');
const austinEqual = scoredById.get('austin-equal-participation-share');
const austinBroad = scoredById.get('austin-broad-consensus');
const austinThin = scoredById.get('austin-thin-hype');
const ruralTop = scoredById.get('rural-undefeated-small-sample');
const nycTop = scored
  .filter(
    (row) =>
      row.subjectType === 'restaurant' &&
      row.scoringMarketKey === 'region-us-ny-new-york',
  )
  .sort((left, right) => right.displayScore - left.displayScore)[0];
const austinDishBroad = scoredById.get('austin-dish-broad-consensus');
const ruralDish = scoredById.get('rural-dish-viral-one-week');

expectCheck(
  'display range stays in public 60.0-99.9 band with no forced 100',
  minScore >= 60 && maxScore < 100,
  'min >= 60 and max < 100',
  { minScore: round(minScore), maxScore: round(maxScore) },
);

expectCheck(
  'sparse rural winner is shrunk below mature elite despite raw 99',
  Boolean(
    ruralTop && nycTop && ruralTop.displayScore + 5.5 < nycTop.displayScore,
  ),
  'rural top at least 5.5 points below mature-market elite',
  {
    ruralTop: ruralTop && {
      score: ruralTop.displayScore,
      confidence: ruralTop.entityConfidence,
      reliability: ruralTop.marketReliability,
    },
    matureTop: nycTop && {
      id: nycTop.subjectId,
      score: nycTop.displayScore,
      confidence: nycTop.entityConfidence,
      reliability: nycTop.marketReliability,
    },
  },
);

expectCheck(
  'broad Austin consensus beats thin hype with same raw score',
  Boolean(
    austinBroad &&
      austinThin &&
      austinBroad.displayScore > austinThin.displayScore + 3,
  ),
  'broad evidence score > thin evidence score by more than 3',
  {
    broad: austinBroad && {
      score: austinBroad.displayScore,
      confidence: austinBroad.entityConfidence,
    },
    thin: austinThin && {
      score: austinThin.displayScore,
      confidence: austinThin.entityConfidence,
    },
  },
);

expectCheck(
  'market size does not automatically make NYC better than comparable Austin candidate',
  Boolean(
    nycEqual &&
      austinEqual &&
      Math.abs(nycEqual.displayScore - austinEqual.displayScore) <= 4.5,
  ),
  'comparable raw and participation share stay within 4.5 points',
  {
    nyc: nycEqual && {
      score: nycEqual.displayScore,
      reliability: nycEqual.marketReliability,
    },
    austin: austinEqual && {
      score: austinEqual.displayScore,
      reliability: austinEqual.marketReliability,
    },
  },
  [
    'NYC has more evidence, but evidence changes reliability/confidence, not a direct market-size bonus.',
  ],
);

expectCheck(
  'Austin can still produce elite restaurant scores when evidence is strong',
  Boolean(austinBroad && austinBroad.displayScore >= 90),
  'Austin broad consensus >= 90',
  austinBroad && {
    score: austinBroad.displayScore,
    confidence: austinBroad.entityConfidence,
    reliability: austinBroad.marketReliability,
  },
);

expectCheck(
  'dish scoring uses the same normalization contract independently from restaurants',
  Boolean(
    austinDishBroad &&
      ruralDish &&
      austinDishBroad.displayScore > ruralDish.displayScore + 3,
  ),
  'broad Austin dish beats sparse rural dish by more than 3',
  {
    austinDish: austinDishBroad && {
      score: austinDishBroad.displayScore,
      confidence: austinDishBroad.entityConfidence,
    },
    ruralDish: ruralDish && {
      score: ruralDish.displayScore,
      confidence: ruralDish.entityConfidence,
    },
  },
);

const zeroMovementBase = scoredById.get('austin-broad-consensus');
const movementPriors = new Map<
  string,
  { score7d: number | null; score28d: number | null }
>();
if (zeroMovementBase) {
  movementPriors.set('restaurant:austin-broad-consensus', {
    score7d: zeroMovementBase.displayScore,
    score28d: zeroMovementBase.displayScore - 2,
  });
  movementPriors.set('restaurant:austin-thin-hype', {
    score7d: zeroMovementBase.displayScore + 8,
    score28d: null,
  });
}
const movementScored = byId(score(allCandidates, movementPriors));
const zeroMovement = movementScored.get('austin-broad-consensus');
const coolingMovement = movementScored.get('austin-thin-hype');

expectCheck(
  'weekly movement hides exact zero deltas',
  Boolean(
    zeroMovement &&
      zeroMovement.scoreDelta7d === null &&
      zeroMovement.movementState === 'stable',
  ),
  'scoreDelta7d null when rounded delta is 0',
  zeroMovement && {
    scoreDelta7d: zeroMovement.scoreDelta7d,
    scoreDelta28d: zeroMovement.scoreDelta28d,
    movementState: zeroMovement.movementState,
  },
);

expectCheck(
  'weekly movement reports cooling when current score is lower than seven-day score',
  Boolean(
    coolingMovement &&
      coolingMovement.scoreDelta7d != null &&
      coolingMovement.scoreDelta7d < 0,
  ),
  'negative scoreDelta7d for lower current score',
  coolingMovement && {
    scoreDelta7d: coolingMovement.scoreDelta7d,
    movementState: coolingMovement.movementState,
  },
);

const marketStats = scorer.scoreCandidates(
  allCandidates,
  new Map(),
  config,
).marketStats;
const reliabilityByMarket = new Map(
  marketStats
    .filter((row) => row.subjectType === 'restaurant')
    .map((row) => [row.marketKey, row.marketReliability]),
);

expectCheck(
  'market reliability rises with market evidence and saturates',
  (reliabilityByMarket.get('region-us-ny-new-york') ?? 0) >
    (reliabilityByMarket.get('region-us-tx-austin') ?? 0) &&
    (reliabilityByMarket.get('region-us-tx-austin') ?? 0) >
      (reliabilityByMarket.get('region-us-ok-rural') ?? 0),
  'NYC reliability > Austin reliability > rural reliability',
  Object.fromEntries(
    [...reliabilityByMarket.entries()].map(([key, value]) => [
      key,
      round(value, 4),
    ]),
  ),
);

type SeededDbFixtureRow = {
  key: string;
  restaurantId: string;
  foodId: string;
  connectionId: string;
  lat: number;
  lng: number;
  mentions: number;
  supportMentions: number;
  upvotes: number;
};

type SeededDbFixtureSeed = {
  rows: SeededDbFixtureRow[];
  userId: string;
};

type SeededDbCleanupCounts = Record<string, number>;

async function countSeededDbFixtureResidue(
  prisma: PrismaClient,
): Promise<SeededDbCleanupCounts> {
  const [row] = await prisma.$queryRaw<Array<Record<string, bigint>>>`
    SELECT
      (SELECT COUNT(*) FROM core_entities WHERE restaurant_metadata->>'fixtureFamily' = ${DB_FIXTURE_FAMILY}) AS entities,
      (
        SELECT COUNT(*)
        FROM core_restaurant_items c
        JOIN core_entities r ON r.entity_id = c.restaurant_id
        WHERE r.restaurant_metadata->>'fixtureFamily' = ${DB_FIXTURE_FAMILY}
      ) AS connections,
      (
        SELECT COUNT(*)
        FROM core_restaurant_locations
        WHERE google_place_id LIKE ${`fixture-place-${DB_FIXTURE_FAMILY}-%`}
      ) AS locations,
      (
        SELECT COUNT(*)
        FROM core_entity_market_presence
        WHERE market_key = ${DB_FIXTURE_MARKET}
      ) AS market_presences,
      (
        SELECT COUNT(*)
        FROM core_crave_score_runs
        WHERE input_counts->>'fixtureRunId' LIKE ${`${DB_FIXTURE_FAMILY}-%`}
      ) AS score_runs,
      (
        SELECT COUNT(*)
        FROM core_crave_score_market_stats cms
        JOIN core_crave_score_runs csr ON csr.score_run_id = cms.score_run_id
        WHERE csr.input_counts->>'fixtureRunId' LIKE ${`${DB_FIXTURE_FAMILY}-%`}
      ) AS score_market_stats,
      (
        SELECT COUNT(*)
        FROM core_public_entity_scores pes
        JOIN core_crave_score_runs csr ON csr.score_run_id = pes.score_run_id
        WHERE csr.input_counts->>'fixtureRunId' LIKE ${`${DB_FIXTURE_FAMILY}-%`}
      ) AS public_scores,
      (
        SELECT COUNT(*)
        FROM core_public_entity_score_history pesh
        JOIN core_crave_score_runs csr ON csr.score_run_id = pesh.score_run_id
        WHERE csr.input_counts->>'fixtureRunId' LIKE ${`${DB_FIXTURE_FAMILY}-%`}
      ) AS score_history,
      (
        SELECT COUNT(*)
        FROM users
        WHERE email LIKE ${`${DB_FIXTURE_FAMILY}-%@example.com`}
      ) AS users,
      (
        SELECT COUNT(*)
        FROM favorite_lists
        WHERE name LIKE ${`Crave Score Fixture%`}
      ) AS favorite_lists,
      (
        SELECT COUNT(*)
        FROM favorite_list_items fli
        JOIN favorite_lists fl ON fl.list_id = fli.list_id
        WHERE fl.name LIKE ${`Crave Score Fixture%`}
      ) AS favorite_list_items
  `;
  return Object.fromEntries(
    Object.entries(row ?? {}).map(([key, value]) => [key, Number(value ?? 0)]),
  );
}

async function cleanupSeededDbFixtures(
  prisma: PrismaClient,
): Promise<SeededDbCleanupCounts> {
  await prisma.$executeRaw`
    DELETE FROM users
    WHERE email LIKE ${`${DB_FIXTURE_FAMILY}-%@example.com`}
  `;

  const entityRows = await prisma.$queryRaw<Array<{ entity_id: string }>>`
    SELECT entity_id
    FROM core_entities
    WHERE restaurant_metadata->>'fixtureFamily' = ${DB_FIXTURE_FAMILY}
  `;
  const entityIds = entityRows.map((row) => row.entity_id);
  const connectionRows = await prisma.$queryRaw<
    Array<{ connection_id: string }>
  >`
    SELECT c.connection_id
    FROM core_restaurant_items c
    JOIN core_entities r ON r.entity_id = c.restaurant_id
    WHERE r.restaurant_metadata->>'fixtureFamily' = ${DB_FIXTURE_FAMILY}
  `;
  const connectionIds = connectionRows.map((row) => row.connection_id);
  const subjectIds = [...entityIds, ...connectionIds];

  if (subjectIds.length > 0) {
    await prisma.$executeRaw`
      DELETE FROM core_public_entity_score_history
      WHERE subject_id = ANY(ARRAY[${Prisma.join(subjectIds)}]::uuid[])
    `;
    await prisma.$executeRaw`
      DELETE FROM core_public_entity_scores
      WHERE subject_id = ANY(ARRAY[${Prisma.join(subjectIds)}]::uuid[])
    `;
  }

  await prisma.$executeRaw`
    DELETE FROM core_crave_score_runs
    WHERE input_counts->>'fixtureRunId' LIKE ${`${DB_FIXTURE_FAMILY}-%`}
  `;
  if (connectionIds.length > 0) {
    await prisma.$executeRaw`
      DELETE FROM core_restaurant_items
      WHERE connection_id = ANY(ARRAY[${Prisma.join(connectionIds)}]::uuid[])
    `;
  }
  if (entityIds.length > 0) {
    await prisma.$executeRaw`
      DELETE FROM core_entities
      WHERE entity_id = ANY(ARRAY[${Prisma.join(entityIds)}]::uuid[])
    `;
  }

  return countSeededDbFixtureResidue(prisma);
}

async function seedDbFixtures(
  prisma: PrismaClient,
  fixtureRunId: string,
): Promise<SeededDbFixtureSeed> {
  const rows: SeededDbFixtureRow[] = Array.from({ length: 31 }, (_, index) => {
    if (index === 0) {
      // Isolated anchor (well away from the diagonal background cluster) so the
      // one-result coverage bound below matches exactly this single entity.
      return {
        key: 'coverage-anchor',
        restaurantId: randomUUID(),
        foodId: randomUUID(),
        connectionId: randomUUID(),
        lat: 12.345,
        lng: -45.678,
        mentions: 2,
        supportMentions: 1,
        upvotes: 5,
      };
    }
    const backgroundIndex = index;
    return {
      key: `background-${backgroundIndex}`,
      restaurantId: randomUUID(),
      foodId: randomUUID(),
      connectionId: randomUUID(),
      lat: 12.365 + backgroundIndex * 0.002,
      lng: -45.698 - backgroundIndex * 0.002,
      mentions: 4 + backgroundIndex * 3,
      supportMentions: 1 + Math.floor(backgroundIndex / 4),
      upvotes: 9 + backgroundIndex * 11,
    };
  });
  const userId = randomUUID();
  const restaurantListId = randomUUID();
  const dishListId = randomUUID();
  const metadata = { fixtureFamily: DB_FIXTURE_FAMILY, fixtureRunId };

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      await tx.$executeRaw`
        INSERT INTO core_entities (
          entity_id,
          name,
          type,
          restaurant_metadata,
          city,
          region,
          country
        )
        VALUES (
          ${row.restaurantId}::uuid,
          ${`Crave Score Fixture ${row.key}`},
          'restaurant',
          ${JSON.stringify(metadata)}::jsonb,
          'Fixture City',
          'Fixture Region',
          'ZZ'
        )
      `;
      await tx.$executeRaw`
        INSERT INTO core_entities (
          entity_id,
          name,
          type,
          restaurant_metadata
        )
        VALUES (
          ${row.foodId}::uuid,
          ${`Fixture Dish ${row.key}`},
          'food',
          ${JSON.stringify(metadata)}::jsonb
        )
      `;
      await tx.$executeRaw`
        INSERT INTO core_entity_market_presence (entity_id, market_key)
        VALUES (${row.restaurantId}::uuid, ${DB_FIXTURE_MARKET})
      `;
      await tx.$executeRaw`
        INSERT INTO core_restaurant_locations (
          restaurant_id,
          google_place_id,
          latitude,
          longitude,
          address,
          city,
          region,
          country,
          is_primary
        )
        VALUES (
          ${row.restaurantId}::uuid,
          ${`fixture-place-${fixtureRunId}-${row.key}`},
          ${row.lat},
          ${row.lng},
          ${`${row.key} Fixture Ave`},
          'Fixture City',
          'Fixture Region',
          'ZZ',
          true
        )
      `;
      await tx.$executeRaw`
        INSERT INTO core_restaurant_items (
          connection_id,
          restaurant_id,
          food_id,
          mention_count,
          support_mention_count,
          total_upvotes
        )
        VALUES (
          ${row.connectionId}::uuid,
          ${row.restaurantId}::uuid,
          ${row.foodId}::uuid,
          ${row.mentions},
          ${row.supportMentions},
          ${row.upvotes}
        )
      `;
    }

    await tx.$executeRaw`
      INSERT INTO users (
        user_id,
        email,
        username,
        display_name,
        updated_at
      )
      VALUES (
        ${userId}::uuid,
        ${`${fixtureRunId}@example.com`},
        ${`fixture_${fixtureRunId.replace(/-/g, '_')}`},
        'Crave Score Fixture User',
        now()
      )
    `;
    await tx.$executeRaw`
      INSERT INTO favorite_lists (
        list_id,
        owner_user_id,
        name,
        list_type,
        visibility,
        item_count,
        position,
        updated_at
      )
      VALUES
        (${restaurantListId}::uuid, ${userId}::uuid, 'Crave Score Fixture Restaurants', 'restaurant', 'private', 1, 0, now()),
        (${dishListId}::uuid, ${userId}::uuid, 'Crave Score Fixture Dishes', 'dish', 'private', 1, 1, now())
    `;
    await tx.$executeRaw`
      INSERT INTO favorite_list_items (
        item_id,
        list_id,
        added_by_user_id,
        restaurant_id,
        connection_id,
        position,
        updated_at
      )
      VALUES
        (${randomUUID()}::uuid, ${restaurantListId}::uuid, ${userId}::uuid, ${rows[0].restaurantId}::uuid, NULL, 0, now()),
        (${randomUUID()}::uuid, ${dishListId}::uuid, ${userId}::uuid, NULL, ${rows[0].connectionId}::uuid, 0, now())
    `;
  });

  return { rows, userId };
}

function geoJsonFeatures(collection: unknown): Array<Record<string, unknown>> {
  if (!collection || typeof collection !== 'object') {
    return [];
  }
  const features = (collection as { features?: unknown }).features;
  return Array.isArray(features)
    ? (features as Array<Record<string, unknown>>)
    : [];
}

function featureProperties(
  feature: Record<string, unknown>,
): Record<string, unknown> {
  const properties = feature.properties;
  return properties && typeof properties === 'object'
    ? (properties as Record<string, unknown>)
    : {};
}

async function runSeededDbFixtureChecks(): Promise<void> {
  if (skipDbIntegration) {
    checks.push(
      pass(
        'seeded DB fixture checks skipped by flag',
        'no --skip-db flag',
        '--skip-db',
      ),
    );
    return;
  }

  const prisma = new PrismaClient();
  let cleanupRemaining: SeededDbCleanupCounts = {};
  try {
    await cleanupSeededDbFixtures(prisma);
    const fixtureRunId = `${DB_FIXTURE_FAMILY}-${Date.now()}`;
    const { rows, userId } = await seedDbFixtures(prisma, fixtureRunId);
    const high = rows[0];
    const dbScorer = new PublicCraveScoreService(
      prisma as never,
      noopLogger as never,
    );
    await dbScorer.rebuildAllScores({
      fixtureRunId,
      recencyReferenceDate: new Date(),
    });

    const scoreRows = await prisma.$queryRaw<
      Array<{
        subject_type: string;
        subject_id: string;
        raw_quality_score: unknown;
        display_score: unknown;
        factor_trace: unknown;
      }>
    >`
      SELECT subject_type, subject_id, raw_quality_score, display_score, factor_trace
      FROM core_public_entity_scores
      WHERE subject_id = ANY(ARRAY[${Prisma.join([
        ...rows.map((row) => row.restaurantId),
        ...rows.map((row) => row.connectionId),
      ])}]::uuid[])
    `;
    const maxSeededRawRow = scoreRows.reduce<(typeof scoreRows)[number] | null>(
      (maxRow, row) => {
        if (!maxRow) {
          return row;
        }
        return Number(row.raw_quality_score ?? 0) >
          Number(maxRow.raw_quality_score ?? 0)
          ? row
          : maxRow;
      },
      null,
    );
    const maxSeededRaw = Number(maxSeededRawRow?.raw_quality_score ?? 0);
    const maxSeededRawDisplay = Number(maxSeededRawRow?.display_score ?? 0);

    expectCheck(
      'seeded DB raw quality remains unconstrained before public display projection',
      maxSeededRaw > 100 && maxSeededRawDisplay < 100,
      'high-evidence fixture can store raw_quality_score above 100 while display_score remains below 100',
      {
        maxSeededRaw: round(maxSeededRaw),
        pairedDisplayScore: round(maxSeededRawDisplay, 1),
        subjectType: maxSeededRawRow?.subject_type,
        subjectId: maxSeededRawRow?.subject_id,
      },
    );

    const coverageService = new SearchCoverageService(
      prisma as never,
      noopLogger as never,
    );
    const largeCoverage = geoJsonFeatures(
      await coverageService.buildShortcutCoverageGeoJson({
        bounds: {
          northEast: { lat: 12.5, lng: -45.5 },
          southWest: { lat: 12.2, lng: -45.9 },
        },
      }),
    );
    const singleCoverage = geoJsonFeatures(
      await coverageService.buildShortcutCoverageGeoJson({
        bounds: {
          northEast: { lat: 12.346, lng: -45.677 },
          southWest: { lat: 12.344, lng: -45.679 },
        },
      }),
    );
    const largeHighFeature = largeCoverage.find(
      (feature) =>
        featureProperties(feature).restaurantId === high.restaurantId,
    );
    const singleHighFeature = singleCoverage.find(
      (feature) =>
        featureProperties(feature).restaurantId === high.restaurantId,
    );
    const largeHighScore = Number(
      featureProperties(largeHighFeature ?? {}).craveScore,
    );
    const singleHighScore = Number(
      featureProperties(singleHighFeature ?? {}).craveScore,
    );

    expectCheck(
      'seeded DB coverage keeps the same score across large and one-result bounds',
      largeCoverage.length >= rows.length &&
        largeCoverage.length > 20 &&
        singleCoverage.length === 1 &&
        Number.isFinite(largeHighScore) &&
        largeHighScore === singleHighScore &&
        singleHighScore < 100,
      'large coverage exceeds page-one size and one-result coverage keeps the same non-100 score',
      {
        largeCoverageCount: largeCoverage.length,
        seededRestaurantCount: rows.length,
        singleCoverageCount: singleCoverage.length,
        largeHighScore,
        singleHighScore,
      },
    );

    const dishCoverage = geoJsonFeatures(
      await coverageService.buildShortcutCoverageGeoJson({
        bounds: {
          northEast: { lat: 12.5, lng: -45.5 },
          southWest: { lat: 12.2, lng: -45.9 },
        },
        includeTopDish: true,
      }),
    );
    const invalidDishFeatures = dishCoverage.filter((feature) => {
      const props = featureProperties(feature);
      return (
        props.scoreSubjectType !== 'connection' ||
        typeof props.connectionId !== 'string' ||
        props.connectionId !== props.scoreSubjectId ||
        typeof props.craveScore !== 'number' ||
        props.craveScore !== props.topDishCraveScore
      );
    });
    expectCheck(
      'seeded DB shortcut dish coverage uses scored connection subjects only',
      dishCoverage.length >= rows.length && invalidDishFeatures.length === 0,
      'dish coverage features carry connection subject ids and scored dish values',
      {
        dishCoverageCount: dishCoverage.length,
        invalidDishFeatures: invalidDishFeatures.length,
      },
    );

    const searchBounds = {
      northEast: { lat: 12.5, lng: -45.5 },
      southWest: { lat: 12.2, lng: -45.9 },
    };
    const searchPlan: QueryPlan = {
      format: 'dual_list',
      restaurantFilters: [
        {
          scope: 'restaurant',
          description: 'Restrict to seeded fixture bounds',
          entityType: EntityScope.RESTAURANT,
          entityIds: [],
          payload: { bounds: searchBounds },
        },
      ],
      connectionFilters: [],
      ranking: {
        foodOrder: 'crave_score DESC',
        restaurantOrder: 'crave_score DESC',
      },
      diagnostics: {
        missingEntities: [],
        notes: [],
      },
    };
    const searchExecutor = new SearchQueryExecutor(
      noopLogger as never,
      prisma as never,
      new SearchQueryBuilder(),
    );
    const searchResult = await searchExecutor.executeDual({
      plan: searchPlan,
      request: {
        entities: {
          restaurants: [],
          foods: [],
          foodAttributes: [],
          restaurantAttributes: [],
        },
        bounds: searchBounds,
      } as unknown as SearchQueryRequestDto,
      pagination: { skip: 0, take: 20 },
      restaurantPagination: { skip: 0, take: 20 },
      dishPagination: { skip: 0, take: 20 },
      topDishesLimit: 3,
    });
    const searchRestaurantScores = searchResult.restaurants.map(
      (row) => row.craveScore,
    );
    const searchDishScores = searchResult.dishes.map((row) => row.craveScore);
    const searchRestaurantScoresSorted = searchRestaurantScores.every(
      (score, index, values) => index === 0 || values[index - 1] >= score,
    );
    const searchDishScoresSorted = searchDishScores.every(
      (score, index, values) => index === 0 || values[index - 1] >= score,
    );

    expectCheck(
      'seeded DB search readers return page-one restaurants and dishes with stable numeric Crave Scores',
      searchResult.restaurants.length === 20 &&
        searchResult.dishes.length === 20 &&
        searchResult.totalRestaurantCount >= rows.length &&
        searchResult.totalDishCount >= rows.length &&
        searchRestaurantScores.every(
          (score) => Number.isFinite(score) && score < 100,
        ) &&
        searchDishScores.every(
          (score) => Number.isFinite(score) && score < 100,
        ) &&
        searchRestaurantScoresSorted &&
        searchDishScoresSorted,
      'active SearchQueryExecutor dual-list readers return scored, score-sorted page-one restaurant and dish rows while total counts see the full fixture set',
      {
        restaurantRows: searchResult.restaurants.length,
        dishRows: searchResult.dishes.length,
        totalRestaurantCount: searchResult.totalRestaurantCount,
        totalDishCount: searchResult.totalDishCount,
        firstRestaurantScore: searchRestaurantScores[0],
        firstDishScore: searchDishScores[0],
      },
    );

    const favoriteListsService = new FavoriteListsService(
      prisma as never,
      noopLogger as never,
      {} as never,
    );
    const [restaurantFavoriteLists, dishFavoriteLists] = await Promise.all([
      favoriteListsService.listForUser(userId, {
        listType: FavoriteListType.restaurant,
        visibility: FavoriteListVisibility.private,
      }),
      favoriteListsService.listForUser(userId, {
        listType: FavoriteListType.dish,
        visibility: FavoriteListVisibility.private,
      }),
    ]);
    const restaurantPreviewScore =
      restaurantFavoriteLists[0]?.previewItems[0]?.craveScore;
    const dishPreviewScore = dishFavoriteLists[0]?.previewItems[0]?.craveScore;

    expectCheck(
      'seeded DB favorite readers expose numeric Crave Score preview items',
      Number.isFinite(restaurantPreviewScore) &&
        Number.isFinite(dishPreviewScore),
      'favorite list preview rows use numeric craveScore for restaurant and dish lists',
      {
        restaurantPreviewScore,
        dishPreviewScore,
      },
    );
  } finally {
    cleanupRemaining = keepDbFixtures
      ? await countSeededDbFixtureResidue(prisma)
      : await cleanupSeededDbFixtures(prisma);
    await prisma.$disconnect();
  }

  const cleanupTotal = Object.values(cleanupRemaining).reduce(
    (total, count) => total + count,
    0,
  );
  expectCheck(
    keepDbFixtures
      ? 'seeded DB fixture cleanup skipped by --keep'
      : 'seeded DB fixtures clean up all fixture rows',
    keepDbFixtures || cleanupTotal === 0,
    keepDbFixtures
      ? '--keep leaves fixture rows for debugging'
      : 'cleanup leaves zero fixture rows across seeded entities, scores, users, favorites, and market presence',
    { cleanupRemaining },
  );
}

async function runDbIntegrationChecks(): Promise<void> {
  if (skipDbIntegration) {
    checks.push(
      pass(
        'DB integration checks skipped by flag',
        'no --skip-db flag',
        '--skip-db',
      ),
    );
    return;
  }

  const prisma = new PrismaClient();
  try {
    const dbScorer = new PublicCraveScoreService(
      prisma as never,
      noopLogger as never,
    );
    const rebuild = await dbScorer.rebuildAllScores({
      recencyReferenceDate: new Date(),
    });
    const [summary] = await prisma.$queryRaw<
      Array<{
        restaurant_count: bigint;
        connection_count: bigint;
        restaurant_score_count: bigint;
        connection_score_count: bigint;
        score_100_count: bigint;
        min_score: unknown;
        max_score: unknown;
        market_stat_count: bigint;
        current_history_count: bigint;
      }>
    >`
      SELECT
        (SELECT COUNT(*) FROM core_entities WHERE type = 'restaurant') AS restaurant_count,
        (SELECT COUNT(*) FROM core_restaurant_items) AS connection_count,
        (SELECT COUNT(*) FROM core_public_entity_scores WHERE subject_type = 'restaurant') AS restaurant_score_count,
        (SELECT COUNT(*) FROM core_public_entity_scores WHERE subject_type = 'connection') AS connection_score_count,
        (SELECT COUNT(*) FROM core_public_entity_scores WHERE display_score >= 100) AS score_100_count,
        (SELECT MIN(display_score) FROM core_public_entity_scores) AS min_score,
        (SELECT MAX(display_score) FROM core_public_entity_scores) AS max_score,
        (SELECT COUNT(*) FROM core_crave_score_market_stats WHERE score_run_id = ${rebuild.scoreRunId}::uuid) AS market_stat_count,
        (
          SELECT COUNT(*)
          FROM core_public_entity_score_history
          WHERE score_run_id = ${rebuild.scoreRunId}::uuid
            AND snapshot_date = CURRENT_DATE
        ) AS current_history_count
    `;
    const restaurantCount = Number(summary?.restaurant_count ?? 0);
    const connectionCount = Number(summary?.connection_count ?? 0);
    const restaurantScoreCount = Number(summary?.restaurant_score_count ?? 0);
    const connectionScoreCount = Number(summary?.connection_score_count ?? 0);
    const score100Count = Number(summary?.score_100_count ?? 0);
    const marketStatCount = Number(summary?.market_stat_count ?? 0);
    const currentHistoryCount = Number(summary?.current_history_count ?? 0);
    const minDbScore = Number(summary?.min_score ?? 0);
    const maxDbScore = Number(summary?.max_score ?? 0);

    expectCheck(
      'DB rebuild writes one latest restaurant score per restaurant',
      restaurantScoreCount === restaurantCount,
      'restaurant public score count equals restaurant count',
      { restaurantCount, restaurantScoreCount },
    );
    expectCheck(
      'DB rebuild writes one latest dish score per connection',
      connectionScoreCount === connectionCount,
      'connection public score count equals connection count',
      { connectionCount, connectionScoreCount },
    );
    expectCheck(
      'DB rebuild does not create forced 100 scores',
      score100Count === 0 && maxDbScore < 100 && minDbScore >= 60,
      '0 scores at 100, min >= 60, max < 100',
      {
        score100Count,
        minDbScore: round(minDbScore),
        maxDbScore: round(maxDbScore),
      },
    );
    expectCheck(
      'DB rebuild writes market stats and same-day history',
      marketStatCount > 0 && currentHistoryCount === rebuild.scoredCount,
      'market stats > 0 and current history count equals scored count',
      {
        marketStatCount,
        currentHistoryCount,
        scoredCount: rebuild.scoredCount,
      },
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  await runDbIntegrationChecks();
  await runSeededDbFixtureChecks();

  const failedChecks = checks.filter((check) => check.status === 'fail');
  const report = [
    '# Crave Score Fixture Validation Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Status: ${failedChecks.length === 0 ? 'PASS' : 'FAIL'}`,
    '',
    `Candidate count: ${allCandidates.length}`,
    `Display range observed: ${round(minScore)}-${round(maxScore)}`,
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
      ...(check.notes?.length ? ['', `Notes: ${check.notes.join(' ')}`] : []),
      '',
    ]),
  ].join('\n');

  writeFileSync(outputPath, report);

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
