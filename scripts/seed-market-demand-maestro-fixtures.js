#!/usr/bin/env node
const path = require('path');
const { randomUUID } = require('crypto');
const dotenv = require('dotenv');
const Redis = require('ioredis');
const {
  DemandSignalKind,
  DemandSourceKind,
  DemandSubjectKind,
  EntityType,
  PrismaClient,
  SearchLogEventKind,
} = require('@prisma/client');

const repoRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(repoRoot, 'apps/api/.env') });

const prisma = new PrismaClient();
const FIXTURE_TAG = 'market-demand-maestro-fixture-v1';
const MARKET_KEY = 'region-us-tx-austin';
const FIXTURE_USER_COUNT = 6;

const usage = () => {
  console.log('Usage: scripts/seed-market-demand-maestro-fixtures.js <seed|cleanup>');
};

const mode = process.argv[2] ?? 'seed';
if (!['seed', 'cleanup'].includes(mode)) {
  usage();
  process.exit(2);
}

const startOfUtcDay = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const requireEntity = async (type, name) => {
  const entity = await prisma.entity.findFirst({
    where: {
      type,
      name: {
        equals: name,
        mode: 'insensitive',
      },
    },
    select: {
      entityId: true,
      name: true,
      type: true,
    },
  });
  if (!entity) {
    throw new Error(`Missing fixture entity ${type}:${name}`);
  }
  return entity;
};

const flushAutocompleteCache = async () => {
  const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  const prefix = process.env.AUTOCOMPLETE_CACHE_REDIS_PREFIX || 'autocomplete:v2';
  let deleted = 0;
  try {
    await redis.connect();
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        `${prefix}*`,
        'COUNT',
        100
      );
      cursor = nextCursor;
      if (keys.length > 0) {
        deleted += await redis.del(...keys);
      }
    } while (cursor !== '0');
  } finally {
    redis.disconnect();
  }
  return deleted;
};

const cleanup = async () => {
  await prisma.$executeRaw`
    DELETE FROM user_search_demand_daily
    WHERE metadata->>'fixtureTag' = ${FIXTURE_TAG}
  `;
  await prisma.$executeRaw`
    DELETE FROM user_search_logs
    WHERE metadata->>'fixtureTag' = ${FIXTURE_TAG}
  `;
  await prisma.$executeRaw`
    DELETE FROM users
    WHERE email LIKE 'maestro-fixture-%@crave-search.local'
  `;
  const redisKeysDeleted = await flushAutocompleteCache();
  return { redisKeysDeleted };
};

const upsertFixtureUsers = async () => {
  const users = [];
  for (let index = 0; index < FIXTURE_USER_COUNT; index += 1) {
    const ordinal = index + 1;
    users.push(
      await prisma.user.upsert({
        where: {
          email: `maestro-fixture-${ordinal}@crave-search.local`,
        },
        update: {
          displayName: `Maestro Fixture ${ordinal}`,
        },
        create: {
          email: `maestro-fixture-${ordinal}@crave-search.local`,
          displayName: `Maestro Fixture ${ordinal}`,
          authProviderUserId: `maestro-fixture-${ordinal}`,
        },
        select: { userId: true, email: true },
      })
    );
  }
  return users;
};

const listAppUsersForPersonalRecents = async () =>
  prisma.user.findMany({
    where: {
      email: {
        not: {
          startsWith: 'maestro-fixture-',
        },
      },
    },
    select: {
      userId: true,
      email: true,
    },
  });

const insertPersonalQueryRows = async (users, entity) => {
  const queries = ['saffron noodles', 'soba noodles', 'salmon brunch'];
  const now = Date.now();
  await prisma.searchLog.createMany({
    data: users.flatMap((user, userIndex) =>
      queries.map((query, queryIndex) => ({
        entityId: entity.entityId,
        entityType: entity.type,
        userId: user.userId,
        marketKey: MARKET_KEY,
        collectableMarketKey: MARKET_KEY,
        queryText: query,
        searchRequestId: randomUUID(),
        totalResults: 20,
        totalFoodResults: 20,
        totalRestaurantResults: 20,
        queryExecutionTimeMs: 12,
        marketStatus: 'ok',
        eventKind: SearchLogEventKind.backend,
        metadata: {
          fixtureTag: FIXTURE_TAG,
          fixturePurpose: 'autocomplete_personal_query_lane',
        },
        loggedAt: new Date(now - (userIndex * queries.length + queryIndex) * 1000),
      }))
    ),
  });
};

const insertDailyQueryDemand = async (users) => {
  const now = new Date();
  const demandDate = startOfUtcDay(now);
  await prisma.userSearchDemandDaily.createMany({
    data: users.map((user) => ({
      demandDate,
      userId: user.userId,
      marketKey: MARKET_KEY,
      collectableMarketKey: null,
      subjectKind: DemandSubjectKind.query,
      subjectKey: 'supper club',
      entityId: null,
      entityType: null,
      normalizedText: 'supper club',
      sourceKind: DemandSourceKind.search_log,
      signalKind: DemandSignalKind.backend,
      reason: null,
      signalCount: 1,
      firstSeenAt: now,
      lastSeenAt: now,
      metadata: {
        fixtureTag: FIXTURE_TAG,
        fixturePurpose: 'autocomplete_global_query_lane',
      },
    })),
    skipDuplicates: true,
  });
};

const insertAttributeDemand = async (users, attribute) => {
  const now = new Date();
  const demandDate = startOfUtcDay(now);
  await prisma.userSearchDemandDaily.createMany({
    data: users.flatMap((user, index) => {
      const rows = [
        {
          demandDate,
          userId: user.userId,
          marketKey: MARKET_KEY,
          collectableMarketKey: null,
          subjectKind: DemandSubjectKind.entity,
          subjectKey: attribute.entityId,
          entityId: attribute.entityId,
          entityType: attribute.type,
          normalizedText: null,
          sourceKind: DemandSourceKind.search_log,
          signalKind: DemandSignalKind.backend,
          reason: null,
          signalCount: 1,
          firstSeenAt: now,
          lastSeenAt: now,
          metadata: {
            fixtureTag: FIXTURE_TAG,
            fixturePurpose: 'autocomplete_attribute_typed_support',
          },
        },
      ];
      if (index < 3) {
        rows.push({
          demandDate,
          userId: user.userId,
          marketKey: MARKET_KEY,
          collectableMarketKey: null,
          subjectKind: DemandSubjectKind.entity,
          subjectKey: attribute.entityId,
          entityId: attribute.entityId,
          entityType: attribute.type,
          normalizedText: null,
          sourceKind: DemandSourceKind.search_log,
          signalKind: DemandSignalKind.autocomplete_selection,
          reason: null,
          signalCount: 1,
          firstSeenAt: now,
          lastSeenAt: now,
          metadata: {
            fixtureTag: FIXTURE_TAG,
            fixturePurpose: 'autocomplete_attribute_selection_support',
          },
        });
      }
      return rows;
    }),
    skipDuplicates: true,
  });
};

const seed = async () => {
  await cleanup();
  const fixtureUsers = await upsertFixtureUsers();
  const appUsers = await listAppUsersForPersonalRecents();
  if (appUsers.length === 0) {
    throw new Error(
      'No non-fixture app users found; run the app once before seeding personal autocomplete recents.'
    );
  }
  const sushi = await requireEntity(EntityType.food, 'sushi');
  const happyHour = await requireEntity(
    EntityType.restaurant_attribute,
    'happy hour'
  );

  await insertPersonalQueryRows(appUsers, sushi);
  await insertDailyQueryDemand(fixtureUsers);
  await insertAttributeDemand(fixtureUsers, happyHour);
  const redisKeysDeleted = await flushAutocompleteCache();
  return {
    fixtureTag: FIXTURE_TAG,
    fixtureUsers: fixtureUsers.length,
    personalRecentUsers: appUsers.length,
    entities: {
      personalQueryEntity: sushi,
      supportedAttribute: happyHour,
    },
    redisKeysDeleted,
  };
};

(async () => {
  try {
    const result = mode === 'cleanup' ? await cleanup() : await seed();
    console.log(JSON.stringify({ ok: true, mode, ...result }, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          mode,
          message: error instanceof Error ? error.message : String(error),
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
