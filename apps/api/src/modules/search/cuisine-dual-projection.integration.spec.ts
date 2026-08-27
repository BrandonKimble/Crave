/**
 * CUISINE DUAL-PROJECTION — behavior against a REAL Postgres (v17 S4; F5).
 *
 * The owner's test case, executed: "a Mexican dish at a non-Mexican
 * restaurant surfaces under 'mexican'". The fixture builds
 *   - a KOREAN spot whose venue attributes do NOT carry the cuisine but
 *     whose taco connection carries it in food_attributes (dish arm),
 *   - a MEXICAN spot whose venue attributes carry it while its enchilada
 *     connection does NOT (venue arm),
 *   - a CONTROL spot with neither.
 * One query, concepts=[cuisine wall 'mexican']: both arms surface; the control
 * does not — proving the concept is an OR across the two homes, not a
 * single-column filter and not an AND.
 *
 * Run: yarn test:db (DATABASE_URL required; fails loudly, never skips).
 */
import { PrismaClient } from '@prisma/client';
import { SearchQueryBuilder } from './search-query.builder';
import { compileQueryPlanFromConstraints } from './search-constraints.compiler';
import { cuisineConceptConstraint } from './concept-membership.compiler';
import type { SearchConstraints } from './search-constraints';

const TAG = 'itest-cuisine-dual';
const prisma = new PrismaClient();
const builder = new SearchQueryBuilder();

const MEX_ID = '99999999-9999-4999-8999-999999990001';
const KOREAN_SPOT = '99999999-9999-4999-8999-999999990010';
const MEXICAN_SPOT = '99999999-9999-4999-8999-999999990011';
const CONTROL_SPOT = '99999999-9999-4999-8999-999999990012';
const TACO = '99999999-9999-4999-8999-999999990020';
const ENCHILADA = '99999999-9999-4999-8999-999999990021';
const BIBIMBAP = '99999999-9999-4999-8999-999999990022';
const SPOTS = [KOREAN_SPOT, MEXICAN_SPOT, CONTROL_SPOT];
const FOODS = [TACO, ENCHILADA, BIBIMBAP];

let scoreRunId: string;
const connectionIds: string[] = [];

function constraints(): SearchConstraints {
  return {
    format: 'dual_list',
    inputPresence: {
      places: 0,
      items: 0,
      itemAttributes: 0,
      placeAttributes: 1,
    },
    hadItemGroup: false,
    hadPlaceGroup: false,
    hadItemAttributeGroup: false,
    hadPlaceAttributeGroup: true,
    primaryItemAttributeQuery: false,
    grounding: {
      item: { anchors: [], family: [], similar: {}, twinIngredientIds: [] },
    },
    ids: {
      placeIds: [],
      itemIds: [],
      itemAttributeIds: [],
      placeAttributeIds: [],
      ingredientIds: [],
    },
    filters: { priceLevels: [], minimumVotes: null, rising: false },
    unresolved: { groups: [] },
  };
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required — this spec must not skip');
  }
  const run = await prisma.craveScoreRun.create({
    data: {
      scoreVersion: TAG,
      displayCurveVersion: TAG,
      displayMin: 0,
      displayMax: 10,
      recencyReferenceDate: new Date('2026-08-26'),
    },
  });
  scoreRunId = run.scoreRunId;

  await prisma.entity.create({
    data: {
      entityId: MEX_ID,
      name: `${TAG}-mexican`,
      type: 'place_attribute',
      facet: 'cuisine',
    },
  });

  const spots: Array<[string, string[]]> = [
    [KOREAN_SPOT, []], // venue does NOT carry the cuisine
    [MEXICAN_SPOT, [MEX_ID]], // venue DOES
    [CONTROL_SPOT, []],
  ];
  for (const [id, attrs] of spots) {
    await prisma.entity.create({
      data: {
        entityId: id,
        name: `${TAG}-spot-${id.slice(-1)}`,
        type: 'place',
        placeAttributes: attrs,
      },
    });
    await prisma.publicEntityScore.create({
      data: {
        subjectType: 'restaurant',
        subjectId: id,
        scoreRunId,
        endorsementRaw: 1,
        percentileRank: 0.5,
        displayScore: 5,
        scoreVersion: TAG,
        displayCurveVersion: TAG,
      },
    });
    await prisma.placeLocation.create({
      data: {
        placeId: id,
        googlePlaceId: `${TAG}-${id.slice(-4)}`,
        address: '1 Test St, Austin, TX',
        latitude: 30.27,
        longitude: -97.74,
        isPrimary: true,
      },
    });
  }

  const dishes: Array<[string, string, string[]]> = [
    [TACO, KOREAN_SPOT, [MEX_ID]], // the Mexican taco at the Korean spot
    [ENCHILADA, MEXICAN_SPOT, []], // rides the venue arm only
    [BIBIMBAP, CONTROL_SPOT, []], // matches neither arm
  ];
  for (const [foodId, placeId, foodAttrs] of dishes) {
    await prisma.entity.create({
      data: {
        entityId: foodId,
        name: `${TAG}-food-${foodId.slice(-1)}`,
        type: 'item',
      },
    });
    const connection = await prisma.connection.create({
      data: {
        placeId,
        itemId: foodId,
        itemAttributes: foodAttrs,
        mentionCount: 1,
      },
    });
    connectionIds.push(connection.connectionId);
    await prisma.publicEntityScore.create({
      data: {
        subjectType: 'connection',
        subjectId: connection.connectionId,
        scoreRunId,
        endorsementRaw: 1,
        percentileRank: 0.5,
        displayScore: 5,
        scoreVersion: TAG,
        displayCurveVersion: TAG,
      },
    });
  }
});

afterAll(async () => {
  await prisma.connection.deleteMany({
    where: { placeId: { in: SPOTS } },
  });
  await prisma.placeLocation.deleteMany({ where: { placeId: { in: SPOTS } } });
  await prisma.publicEntityScore.deleteMany({ where: { scoreVersion: TAG } });
  await prisma.entity.deleteMany({
    where: { entityId: { in: [MEX_ID, ...SPOTS, ...FOODS] } },
  });
  await prisma.craveScoreRun.deleteMany({ where: { scoreRunId } });
  await prisma.$disconnect();
});

describe('one cuisine concept, two homes — executed against the corpus', () => {
  it('dish axis: the Mexican taco at the Korean spot AND the Mexican restaurant’s dish both surface; the control does not', async () => {
    const { dataSql } = builder.buildDishQuery({
      plan: compileQueryPlanFromConstraints(constraints()),
      pagination: { skip: 0, take: 100000 },
      searchCenter: null,
      directives: { concepts: [cuisineConceptConstraint(MEX_ID, 'wall')] },
    });
    const rows =
      await prisma.$queryRaw<Array<{ connection_id: string }>>(dataSql);
    const served = new Set(rows.map((r) => r.connection_id));
    const [tacoConn, enchiladaConn, bibimbapConn] = connectionIds;
    expect(served.has(tacoConn)).toBe(true); // dish arm (F5's exact case)
    expect(served.has(enchiladaConn)).toBe(true); // venue arm
    expect(served.has(bibimbapConn)).toBe(false); // neither
  });

  it('restaurant axis: the Korean spot (dish evidence only) and the Mexican spot both surface; the control does not', async () => {
    const { dataSql } = builder.buildPlaceQuery({
      plan: compileQueryPlanFromConstraints(constraints()),
      pagination: { skip: 0, take: 100000 },
      searchCenter: null,
      directives: { concepts: [cuisineConceptConstraint(MEX_ID, 'wall')] },
    });
    const rows =
      await prisma.$queryRaw<Array<{ restaurant_id: string }>>(dataSql);
    const served = new Set(rows.map((r) => r.restaurant_id));
    expect(served.has(KOREAN_SPOT)).toBe(true);
    expect(served.has(MEXICAN_SPOT)).toBe(true);
    expect(served.has(CONTROL_SPOT)).toBe(false);
  });
});
