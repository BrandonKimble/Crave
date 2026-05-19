import 'dotenv/config';
import {
  DemandScoringCandidate,
  DemandScoringConsumerKind,
  DemandScoringDecisionState,
  DemandSignalKind,
  DemandSourceKind,
  DemandSubjectKind,
  Entity,
  EntityType,
  FavoriteEventKind,
  KeywordAttemptOutcome,
  OnDemandReason,
  Prisma,
  PrismaClient,
  SearchLogEventKind,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { SearchDemandAggregationService } from '../src/modules/analytics/search-demand-aggregation.service';
import { SearchDemandService } from '../src/modules/analytics/search-demand.service';
import { DemandScoringTraceService } from '../src/modules/analytics/demand-scoring-trace.service';
import { PollSchedulerService } from '../src/modules/polls/poll-scheduler.service';
import { KeywordSliceSelectionService } from '../src/modules/content-processing/reddit-collector/keyword-slice-selection.service';
import { KeywordSearchSchedulerService } from '../src/modules/content-processing/reddit-collector/keyword-search-scheduler.service';
import { SearchQuerySuggestionService } from '../src/modules/search/search-query-suggestion.service';
import { SearchService } from '../src/modules/search/search.service';
import { SearchPopularityService } from '../src/modules/search/search-popularity.service';
import { AutocompleteService } from '../src/modules/autocomplete/autocomplete.service';
import { EntityTextSearchService } from '../src/modules/entity-text-search/entity-text-search.service';
import { SearchOrchestrationService } from '../src/modules/search/search-orchestration.service';
import { SearchQueryInterpretationService } from '../src/modules/search/search-query-interpretation.service';
import { OnDemandRequestService } from '../src/modules/search/on-demand-request.service';

type FixtureStatus = 'pass' | 'fail';

interface FixtureCheck {
  name: string;
  status: FixtureStatus;
  expected: unknown;
  observed: unknown;
  notes?: string[];
}

type FixtureUser = { userId: string; email: string };

type PickedEntity = Pick<Entity, 'entityId' | 'name' | 'type' | 'lastPolledAt'>;

const prisma = new PrismaClient();
const fixtureRunId = `demand-fixture-${new Date()
  .toISOString()
  .replace(/[:.]/g, '-')}`;
const fixtureMarker = { fixtureRunId };
const keepRows = process.argv.includes('--keep');
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const outputPath = outputArg
  ? outputArg.slice('--output='.length)
  : join(
      process.cwd(),
      '..',
      '..',
      'plans',
      'demand-scoring-fixture-validation-report.md',
    );

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const marketKey = 'region-us-tx-austin';
const collectableMarketKey = 'region-us-tx-austin';
const fixtureUiMarketA = 'locality-fixture-alpha';
const fixtureUiMarketB = 'locality-fixture-beta';
const counterfactualMarketKey = 'locality-fixture-counterfactual';
const pollAdversarialMarketKey = 'locality-fixture-poll-adversarial';
const suggestionAdversarialMarketKey =
  'locality-fixture-suggestion-adversarial';
const onDemandAdversarialCollectableMarketKey =
  'region-fixture-on-demand-adversarial';
const keywordRecoveryCollectableMarketKey = 'region-fixture-keyword-recovery';
const keywordLiveCollectableMarketKey = 'region-fixture-keyword-live';
const serviceWarnings: Array<{
  level: string;
  message: string;
  metadata: unknown;
}> = [];

const noopLogger = {
  setContext() {
    return this;
  },
  debug() {},
  info() {},
  warn(message: string, metadata?: unknown) {
    serviceWarnings.push({ level: 'warn', message, metadata });
  },
  error(message: string, metadata?: unknown) {
    serviceWarnings.push({ level: 'error', message, metadata });
  },
};

const configService = {
  get(key: string) {
    return process.env[key];
  },
} as ConfigService;

function dateOnly(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * MS_PER_DAY);
}

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * MS_PER_DAY);
}

function normalizeTerm(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function round(value: number, digits = 4): number {
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

async function pickEntity(
  type: EntityType,
  preferredNames: string[],
  usedEntityIds: Set<string>,
): Promise<PickedEntity> {
  const preferred = await prisma.entity.findMany({
    where: {
      type,
      name: { in: preferredNames, mode: 'insensitive' },
      entityId: { notIn: [...usedEntityIds] },
    },
    select: {
      entityId: true,
      name: true,
      type: true,
      lastPolledAt: true,
    },
    orderBy: { name: 'asc' },
  });
  const exact = preferred.find((entity) =>
    preferredNames.some(
      (name) => name.toLowerCase() === entity.name.toLowerCase(),
    ),
  );
  const fallback =
    exact ??
    preferred[0] ??
    (await prisma.entity.findFirstOrThrow({
      where: { type, entityId: { notIn: [...usedEntityIds] } },
      select: {
        entityId: true,
        name: true,
        type: true,
        lastPolledAt: true,
      },
      orderBy: { name: 'asc' },
    }));
  usedEntityIds.add(fallback.entityId);
  return fallback;
}

async function createFixtureUsers(count: number): Promise<FixtureUser[]> {
  const users = Array.from({ length: count }, (_, index) => ({
    email: `${fixtureRunId}+${index}@example.test`,
    displayName: `Demand Fixture ${index + 1}`,
    authProviderUserId: `${fixtureRunId}-${index}`,
    metadata: undefined,
  }));
  await prisma.user.createMany({ data: users });
  return prisma.user.findMany({
    where: { email: { startsWith: `${fixtureRunId}+` } },
    select: { userId: true, email: true },
    orderBy: { email: 'asc' },
  });
}

async function insertDailyEntityDemand(params: {
  demandDate: Date;
  userId: string;
  entity: PickedEntity;
  signalCount: number;
  signalKind?: DemandSignalKind;
  queryText?: string;
  marketKey?: string | null;
  collectableMarketKey?: string | null;
}): Promise<void> {
  const normalizedText =
    params.queryText?.trim().toLowerCase() ?? params.entity.name.toLowerCase();
  await prisma.userSearchDemandDaily.create({
    data: {
      demandDate: dateOnly(params.demandDate),
      userId: params.userId,
      marketKey: params.marketKey === undefined ? marketKey : params.marketKey,
      collectableMarketKey:
        params.collectableMarketKey === undefined
          ? null
          : params.collectableMarketKey,
      subjectKind: DemandSubjectKind.entity,
      subjectKey: params.entity.entityId,
      entityId: params.entity.entityId,
      entityType: params.entity.type,
      normalizedText,
      sourceKind: DemandSourceKind.search_log,
      signalKind: params.signalKind ?? DemandSignalKind.backend,
      signalCount: params.signalCount,
      firstSeenAt: params.demandDate,
      lastSeenAt: params.demandDate,
      metadata: fixtureMarker,
    },
  });
}

async function insertDailyEntityDemandForUsers(params: {
  demandDate: Date;
  users: FixtureUser[];
  entity: PickedEntity;
  signalCount: number;
  signalKind?: DemandSignalKind;
  marketKey?: string | null;
  collectableMarketKey?: string | null;
  queryText?: string;
}): Promise<void> {
  for (const user of params.users) {
    await insertDailyEntityDemand({
      demandDate: params.demandDate,
      userId: user.userId,
      entity: params.entity,
      signalCount: params.signalCount,
      signalKind: params.signalKind,
      marketKey: params.marketKey,
      collectableMarketKey: params.collectableMarketKey,
      queryText: params.queryText,
    });
  }
}

async function insertDailyQueryDemand(params: {
  demandDate: Date;
  userId: string;
  query: string;
  signalCount: number;
  marketKey?: string | null;
  collectableMarketKey?: string | null;
  signalKind?: DemandSignalKind;
}): Promise<void> {
  const normalized = normalizeTerm(params.query);
  await prisma.userSearchDemandDaily.create({
    data: {
      demandDate: dateOnly(params.demandDate),
      userId: params.userId,
      marketKey: params.marketKey ?? null,
      collectableMarketKey: params.collectableMarketKey ?? null,
      subjectKind: DemandSubjectKind.query,
      subjectKey: normalized,
      normalizedText: normalized,
      sourceKind: DemandSourceKind.search_log,
      signalKind: params.signalKind ?? DemandSignalKind.backend,
      signalCount: params.signalCount,
      firstSeenAt: params.demandDate,
      lastSeenAt: params.demandDate,
      metadata: fixtureMarker,
    },
  });
}

async function insertOnDemandAsk(params: {
  userId: string | null;
  term: string;
  reason: OnDemandReason;
  askedAt: Date;
  entityType?: EntityType;
  collectableMarketKey?: string | null;
  resultRestaurantCount?: number | null;
  resultFoodCount?: number | null;
}): Promise<void> {
  await prisma.onDemandAskEvent.create({
    data: {
      userId: params.userId,
      term: params.term,
      entityType: params.entityType ?? EntityType.food,
      reason: params.reason,
      marketKey,
      collectableMarketKey:
        params.collectableMarketKey === undefined
          ? collectableMarketKey
          : params.collectableMarketKey,
      resultRestaurantCount: params.resultRestaurantCount ?? null,
      resultFoodCount: params.resultFoodCount ?? null,
      askedAt: params.askedAt,
      metadata: fixtureMarker,
    },
  });
}

async function insertSearchLog(params: {
  userId: string;
  entity: PickedEntity;
  queryText: string;
  loggedAt: Date;
  marketKey?: string | null;
  collectableMarketKey?: string | null;
  searchRequestId?: string | null;
  eventKind?: SearchLogEventKind;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.searchLog.create({
    data: {
      userId: params.userId,
      entityId: params.entity.entityId,
      entityType: params.entity.type,
      marketKey: params.marketKey ?? marketKey,
      collectableMarketKey:
        params.collectableMarketKey === undefined
          ? collectableMarketKey
          : params.collectableMarketKey,
      queryText: params.queryText,
      searchRequestId: params.searchRequestId ?? undefined,
      eventKind: params.eventKind ?? SearchLogEventKind.backend,
      loggedAt: params.loggedAt,
      metadata: params.metadata ?? fixtureMarker,
    },
  });
}

function expectedOrderMatches(
  observed: string[],
  expectedPrefix: string[],
): boolean {
  return expectedPrefix.every((value, index) => observed[index] === value);
}

async function runAggregationFixture(
  aggregation: SearchDemandAggregationService,
  users: FixtureUser[],
  entity: PickedEntity,
): Promise<FixtureCheck> {
  const fixtureDate = new Date(Date.UTC(2030, 0, 15, 12));
  const fixtureDay = dateOnly(fixtureDate);
  const requestId = '11111111-1111-4111-8111-111111111111';

  await insertSearchLog({
    userId: users[0].userId,
    entity,
    queryText: 'fixture sushi',
    loggedAt: fixtureDate,
    marketKey: fixtureUiMarketA,
    collectableMarketKey,
    searchRequestId: requestId,
  });
  await insertSearchLog({
    userId: users[0].userId,
    entity,
    queryText: 'fixture sushi',
    loggedAt: fixtureDate,
    marketKey: fixtureUiMarketB,
    collectableMarketKey,
    searchRequestId: requestId,
  });

  await aggregation.rebuildDateRange({
    startDate: fixtureDay,
    endDateExclusive: new Date(fixtureDay.getTime() + MS_PER_DAY),
  });

  const rows = await prisma.userSearchDemandDaily.findMany({
    where: {
      demandDate: fixtureDay,
      subjectKind: DemandSubjectKind.entity,
      entityId: entity.entityId,
      sourceKind: DemandSourceKind.search_log,
    },
    select: {
      marketKey: true,
      collectableMarketKey: true,
      signalCount: true,
      metadata: true,
    },
    orderBy: [{ marketKey: 'asc' }, { collectableMarketKey: 'asc' }],
  });

  const uiRows = rows.filter(
    (row) => row.marketKey && !row.collectableMarketKey,
  );
  const collectableRows = rows.filter(
    (row) =>
      !row.marketKey && row.collectableMarketKey === collectableMarketKey,
  );
  const globalRows = rows.filter(
    (row) => !row.marketKey && !row.collectableMarketKey,
  );
  const observed = {
    uiMarketRows: uiRows.map((row) => ({
      marketKey: row.marketKey,
      signalCount: row.signalCount,
    })),
    collectableSignalCounts: collectableRows.map((row) => row.signalCount),
    globalSignalCounts: globalRows.map((row) => row.signalCount),
  };
  const expected = {
    uiMarketRows: [
      { marketKey: fixtureUiMarketA, signalCount: 1 },
      { marketKey: fixtureUiMarketB, signalCount: 1 },
    ],
    collectableSignalCounts: [1],
    globalSignalCounts: [1],
  };
  const ok =
    uiRows.length === 2 &&
    uiRows.every((row) => row.signalCount === 1) &&
    collectableRows.length === 1 &&
    collectableRows[0].signalCount === 1 &&
    globalRows.length === 1 &&
    globalRows[0].signalCount === 1;
  return (ok ? pass : fail)(
    'aggregation: fanned UI rows collapse for collectable/global demand',
    expected,
    observed,
  );
}

async function runCacheAttributionIdempotencyFixture(params: {
  users: FixtureUser[];
  entity: PickedEntity;
}): Promise<FixtureCheck> {
  const originalBackendSearchRequestId = '33333333-3333-4333-8333-333333333333';
  const cacheRevealRequestId = '44444444-4444-4444-8444-444444444444';
  await insertSearchLog({
    userId: params.users[0].userId,
    entity: params.entity,
    queryText: 'fixture cache repeat',
    loggedAt: daysAgo(0.1),
    marketKey: fixtureUiMarketA,
    collectableMarketKey,
    searchRequestId: originalBackendSearchRequestId,
    eventKind: SearchLogEventKind.backend,
  });
  await insertSearchLog({
    userId: params.users[0].userId,
    entity: params.entity,
    queryText: 'fixture cache repeat',
    loggedAt: daysAgo(0.1),
    marketKey: fixtureUiMarketB,
    collectableMarketKey,
    searchRequestId: originalBackendSearchRequestId,
    eventKind: SearchLogEventKind.backend,
  });
  await insertSearchLog({
    userId: params.users[0].userId,
    entity: params.entity,
    queryText: 'fixture cache repeat',
    loggedAt: daysAgo(0.1),
    marketKey,
    collectableMarketKey: null,
    searchRequestId: originalBackendSearchRequestId,
    eventKind: SearchLogEventKind.backend,
  });

  const searchServiceHarness = Object.create(SearchService.prototype) as {
    searchLogEnabled: boolean;
    prisma: PrismaClient;
    recordCacheAttribution: SearchService['recordCacheAttribution'];
  };
  searchServiceHarness.searchLogEnabled = true;
  searchServiceHarness.prisma = prisma;

  const first = await searchServiceHarness.recordCacheAttribution(
    {
      originalBackendSearchRequestId,
      cacheRevealRequestId,
      cacheAgeMs: 1_000,
      resultsDataKey: 'fixture-cache-key',
    },
    params.users[0].userId,
  );
  const retry = await searchServiceHarness.recordCacheAttribution(
    {
      originalBackendSearchRequestId,
      cacheRevealRequestId,
      cacheAgeMs: 1_500,
      resultsDataKey: 'fixture-cache-key',
    },
    params.users[0].userId,
  );
  let missingIdRejected = false;
  try {
    await searchServiceHarness.recordCacheAttribution(
      {
        originalBackendSearchRequestId,
      } as Parameters<SearchService['recordCacheAttribution']>[0],
      params.users[0].userId,
    );
  } catch (error) {
    missingIdRejected =
      error instanceof Error &&
      error.message.includes('cacheRevealRequestId is required');
  }

  const cacheRows = await prisma.searchLog.findMany({
    where: {
      searchRequestId: cacheRevealRequestId,
      userId: params.users[0].userId,
      eventKind: SearchLogEventKind.cache,
    },
    select: {
      logId: true,
      searchRequestId: true,
      marketKey: true,
      collectableMarketKey: true,
      metadata: true,
    },
    orderBy: [{ marketKey: 'asc' }, { collectableMarketKey: 'asc' }],
  });
  const observed = {
    firstInserted: first.inserted,
    retryInserted: retry.inserted,
    cacheRows: cacheRows.length,
    clonedScopes: cacheRows.map((row) => ({
      marketKey: row.marketKey,
      collectableMarketKey: row.collectableMarketKey,
    })),
    cacheMetadata: cacheRows.map((row) => {
      const metadata = row.metadata as Prisma.JsonObject | null;
      const cache = metadata?.cache as Prisma.JsonObject | undefined;
      return {
        originalBackendSearchRequestId:
          typeof cache?.originalBackendSearchRequestId === 'string'
            ? cache.originalBackendSearchRequestId
            : null,
        cacheRevealRequestId:
          typeof cache?.cacheRevealRequestId === 'string'
            ? cache.cacheRevealRequestId
            : null,
        cacheAgeMs:
          typeof cache?.cacheAgeMs === 'number' ? cache.cacheAgeMs : null,
        resultsDataKey:
          typeof cache?.resultsDataKey === 'string'
            ? cache.resultsDataKey
            : null,
      };
    }),
    missingIdRejected,
  };
  const expectedScopes = new Set([
    `${fixtureUiMarketA}:${collectableMarketKey}`,
    `${fixtureUiMarketB}:${collectableMarketKey}`,
    `${marketKey}:`,
  ]);
  const observedScopes = new Set(
    cacheRows.map(
      (row) => `${row.marketKey ?? ''}:${row.collectableMarketKey ?? ''}`,
    ),
  );
  const ok =
    first.inserted === 3 &&
    retry.inserted === 0 &&
    cacheRows.length === 3 &&
    expectedScopes.size === observedScopes.size &&
    [...expectedScopes].every((scope) => observedScopes.has(scope)) &&
    observed.cacheMetadata.every(
      (metadata) =>
        metadata.originalBackendSearchRequestId ===
          originalBackendSearchRequestId &&
        metadata.cacheRevealRequestId === cacheRevealRequestId &&
        metadata.cacheAgeMs === 1_000 &&
        metadata.resultsDataKey === 'fixture-cache-key',
    ) &&
    missingIdRejected;

  return (ok ? pass : fail)(
    'cache attribution: retry-stable reveal id clones all attributed scopes idempotently',
    {
      firstInserted: 3,
      retryInserted: 0,
      cacheRows: 3,
      clonedScopes: [...expectedScopes],
      cacheMetadata: {
        originalBackendSearchRequestId,
        cacheRevealRequestId,
        cacheAgeMs: 1_000,
        resultsDataKey: 'fixture-cache-key',
      },
      missingIdRejected: true,
    },
    observed,
  );
}

async function runCacheAttributionAggregationFixture(params: {
  aggregation: SearchDemandAggregationService;
  users: FixtureUser[];
  entity: PickedEntity;
}): Promise<FixtureCheck> {
  const fixtureDate = new Date(Date.UTC(2030, 1, 10, 12));
  const fixtureDay = dateOnly(fixtureDate);
  const originalBackendSearchRequestId = '77777777-7777-4777-8777-777777777777';
  const cacheRevealRequestId = '88888888-8888-4888-8888-888888888888';
  for (const uiMarketKey of [fixtureUiMarketA, fixtureUiMarketB]) {
    await insertSearchLog({
      userId: params.users[1].userId,
      entity: params.entity,
      queryText: 'fixture cache aggregate',
      loggedAt: fixtureDate,
      marketKey: uiMarketKey,
      collectableMarketKey,
      searchRequestId: originalBackendSearchRequestId,
      eventKind: SearchLogEventKind.backend,
    });
  }

  const searchServiceHarness = Object.create(SearchService.prototype) as {
    searchLogEnabled: boolean;
    prisma: PrismaClient;
    recordCacheAttribution: SearchService['recordCacheAttribution'];
  };
  searchServiceHarness.searchLogEnabled = true;
  searchServiceHarness.prisma = prisma;

  const first = await searchServiceHarness.recordCacheAttribution(
    {
      originalBackendSearchRequestId,
      cacheRevealRequestId,
      cacheAgeMs: 2_000,
      resultsDataKey: 'fixture-cache-aggregate-key',
    },
    params.users[1].userId,
  );
  await prisma.searchLog.updateMany({
    where: {
      searchRequestId: cacheRevealRequestId,
      userId: params.users[1].userId,
      eventKind: SearchLogEventKind.cache,
    },
    data: { loggedAt: fixtureDate },
  });

  await params.aggregation.rebuildDateRange({
    startDate: fixtureDay,
    endDateExclusive: new Date(fixtureDay.getTime() + MS_PER_DAY),
  });

  const rows = await prisma.userSearchDemandDaily.findMany({
    where: {
      demandDate: fixtureDay,
      subjectKind: DemandSubjectKind.entity,
      entityId: params.entity.entityId,
      sourceKind: DemandSourceKind.search_log,
      signalKind: { in: [DemandSignalKind.backend, DemandSignalKind.cache] },
    },
    select: {
      marketKey: true,
      collectableMarketKey: true,
      signalKind: true,
      signalCount: true,
    },
    orderBy: [
      { signalKind: 'asc' },
      { marketKey: 'asc' },
      { collectableMarketKey: 'asc' },
    ],
  });
  const scopedCount = (input: {
    signalKind: DemandSignalKind;
    marketKey: string | null;
    collectableMarketKey: string | null;
  }) =>
    rows.find(
      (row) =>
        row.signalKind === input.signalKind &&
        row.marketKey === input.marketKey &&
        row.collectableMarketKey === input.collectableMarketKey,
    )?.signalCount ?? 0;
  const observed = {
    insertedCacheRows: first.inserted,
    collectableBackendCount: scopedCount({
      signalKind: DemandSignalKind.backend,
      marketKey: null,
      collectableMarketKey,
    }),
    collectableCacheCount: scopedCount({
      signalKind: DemandSignalKind.cache,
      marketKey: null,
      collectableMarketKey,
    }),
    globalBackendCount: scopedCount({
      signalKind: DemandSignalKind.backend,
      marketKey: null,
      collectableMarketKey: null,
    }),
    globalCacheCount: scopedCount({
      signalKind: DemandSignalKind.cache,
      marketKey: null,
      collectableMarketKey: null,
    }),
    uiRows: rows
      .filter((row) => row.marketKey && !row.collectableMarketKey)
      .map((row) => ({
        signalKind: row.signalKind,
        marketKey: row.marketKey,
        signalCount: row.signalCount,
      })),
  };
  const ok =
    first.inserted === 2 &&
    observed.collectableBackendCount === 1 &&
    observed.collectableCacheCount === 1 &&
    observed.globalBackendCount === 1 &&
    observed.globalCacheCount === 1 &&
    observed.uiRows.length === 4 &&
    observed.uiRows.every((row) => row.signalCount === 1);

  return (ok ? pass : fail)(
    'cache attribution aggregation: backend/cache reveal rows rebuild into distinct demand lanes without fanout inflation',
    {
      insertedCacheRows: 2,
      collectableBackendCount: 1,
      collectableCacheCount: 1,
      globalBackendCount: 1,
      globalCacheCount: 1,
      uiRows: 4,
    },
    observed,
  );
}

async function runAutocompleteSelectionAggregationFixture(params: {
  aggregation: SearchDemandAggregationService;
  users: FixtureUser[];
  entity: PickedEntity;
}): Promise<FixtureCheck> {
  const fixtureDate = new Date(Date.UTC(2030, 1, 12, 12));
  const fixtureDay = dateOnly(fixtureDate);
  const autocompleteMetadata = {
    ...fixtureMarker,
    submissionSource: 'autocomplete',
    submissionContext: {
      matchType: 'entity',
      selectedEntityId: params.entity.entityId,
      selectedEntityType: params.entity.type,
    },
  };

  await insertSearchLog({
    userId: params.users[2].userId,
    entity: params.entity,
    queryText: 'fixture autocomplete selection provenance',
    loggedAt: fixtureDate,
    marketKey: fixtureUiMarketA,
    collectableMarketKey,
    searchRequestId: '99999999-9999-4999-8999-999999999991',
    eventKind: SearchLogEventKind.backend,
    metadata: autocompleteMetadata,
  });
  await insertSearchLog({
    userId: params.users[2].userId,
    entity: params.entity,
    queryText: 'fixture autocomplete selection provenance',
    loggedAt: fixtureDate,
    marketKey: fixtureUiMarketA,
    collectableMarketKey,
    searchRequestId: '99999999-9999-4999-8999-999999999992',
    eventKind: SearchLogEventKind.cache,
    metadata: autocompleteMetadata,
  });

  await params.aggregation.rebuildDateRange({
    startDate: fixtureDay,
    endDateExclusive: new Date(fixtureDay.getTime() + MS_PER_DAY),
  });

  const rows = await prisma.userSearchDemandDaily.findMany({
    where: {
      demandDate: fixtureDay,
      subjectKind: DemandSubjectKind.entity,
      entityId: params.entity.entityId,
      sourceKind: DemandSourceKind.search_log,
      signalKind: DemandSignalKind.autocomplete_selection,
    },
    select: {
      marketKey: true,
      collectableMarketKey: true,
      signalCount: true,
      metadata: true,
    },
    orderBy: [{ marketKey: 'asc' }, { collectableMarketKey: 'asc' }],
  });
  const metadataSummary = rows.map((row) => {
    const metadata = row.metadata as Prisma.JsonObject | null;
    const counts = metadata?.sourceEventKindCounts as
      | Prisma.JsonObject
      | undefined;
    return {
      marketKey: row.marketKey,
      collectableMarketKey: row.collectableMarketKey,
      signalCount: row.signalCount,
      cacheSelectionPolicy:
        typeof metadata?.cacheSelectionPolicy === 'string'
          ? metadata.cacheSelectionPolicy
          : null,
      backendCount: typeof counts?.backend === 'number' ? counts.backend : null,
      cacheCount: typeof counts?.cache === 'number' ? counts.cache : null,
    };
  });
  const ok =
    rows.length === 3 &&
    rows.every((row) => row.signalCount === 2) &&
    metadataSummary.every(
      (row) =>
        row.cacheSelectionPolicy === 'full_intent' &&
        row.backendCount === 1 &&
        row.cacheCount === 1,
    );

  return (ok ? pass : fail)(
    'autocomplete selection aggregation: cache-backed selections keep full intent weight with backend/cache provenance',
    {
      scopeRows: 3,
      signalCountPerScope: 2,
      cacheSelectionPolicy: 'full_intent',
      sourceEventKindCounts: { backend: 1, cache: 1 },
    },
    { rows: metadataSummary },
  );
}

async function runUserLocationDemandFactFixture(params: {
  users: FixtureUser[];
  entity: PickedEntity;
}): Promise<FixtureCheck> {
  const fixtureStartedAt = new Date();
  const onDemandRequestService = new OnDemandRequestService(
    prisma as never,
    noopLogger as never,
  );
  const interpretation = new SearchQueryInterpretationService(
    {
      analyzeSearchQuery: async () => ({
        restaurants: [],
        foods: ['fixture lunar noodle'],
        foodAttributes: [],
        restaurantAttributes: [],
      }),
    } as never,
    {
      resolveBatch: async (
        inputs: Array<{
          tempId: string;
          normalizedName: string;
          originalText: string;
          entityType: EntityType;
        }>,
      ) => ({
        tempIdToEntityIdMap: new Map<string, string>(),
        resolutionResults: inputs.map((input) => ({
          tempId: input.tempId,
          entityId: null,
          confidence: 0,
          resolutionTier: 'unmatched' as const,
          originalInput: input,
        })),
        newEntitiesCreated: 0,
        performanceMetrics: {
          totalProcessed: inputs.length,
          exactMatches: 0,
          aliasMatches: 0,
          fuzzyMatches: 0,
          newEntitiesCreated: 0,
          processingTimeMs: 0,
          averageConfidence: 0,
        },
        entityDetails: new Map(),
      }),
    } as never,
    onDemandRequestService,
    {
      resolveViewportCoverage: async () => ({
        status: 'resolved',
        market: {
          marketKey,
          marketName: 'Austin',
          marketShortName: 'Austin',
        },
        markets: [{ marketKey }],
        collectableMarketKeys: [collectableMarketKey],
        resolution: {
          candidateLocalityName: null,
          candidateBoundaryProvider: null,
          candidateBoundaryId: null,
          candidateBoundaryType: null,
        },
      }),
    } as never,
    noopLogger as never,
  );

  await interpretation.interpret({
    query: 'fixture lunar noodle',
    userId: params.users[0].userId,
    userLocation: { lat: 30.2672, lng: -97.7431 },
  });

  const searchServiceHarness = Object.create(SearchService.prototype) as {
    onDemandMinResults: number;
    onDemandRequestService: OnDemandRequestService;
    buildLocationBias: SearchService['buildLocationBias'];
    recordLowResultOnDemand: SearchService['recordLowResultOnDemand'];
  };
  searchServiceHarness.onDemandMinResults = 25;
  searchServiceHarness.onDemandRequestService = onDemandRequestService;
  await searchServiceHarness.recordLowResultOnDemand({
    request: {
      entities: {
        food: [
          {
            entityIds: [params.entity.entityId],
            normalizedName: params.entity.name,
          },
        ],
      },
      userId: params.users[0].userId,
      userLocation: { lat: 30.2672, lng: -97.7431 },
    } as never,
    planFormat: 'dual_list',
    restaurantCount: 0,
    dishCount: 0,
    viewportEligible: false,
    onDemandMarketContext: {
      marketKey,
      collectableMarketKeys: [],
    },
  });

  const unresolvedEvents = await prisma.onDemandAskEvent.findMany({
    where: {
      userId: params.users[0].userId,
      term: 'fixture lunar noodle',
      reason: OnDemandReason.unresolved,
      askedAt: { gte: fixtureStartedAt },
    },
    select: {
      marketKey: true,
      collectableMarketKey: true,
      requestId: true,
    },
  });
  const lowResultEvents = await prisma.onDemandAskEvent.findMany({
    where: {
      userId: params.users[0].userId,
      reason: OnDemandReason.low_result,
      entityId: params.entity.entityId,
      askedAt: { gte: fixtureStartedAt },
    },
    select: {
      marketKey: true,
      collectableMarketKey: true,
      requestId: true,
    },
  });
  const queuedStateCount = await prisma.onDemandRequest.count({
    where: {
      OR: [
        { term: 'fixture lunar noodle' },
        { entityId: params.entity.entityId, reason: OnDemandReason.low_result },
      ],
      marketKey: collectableMarketKey,
    },
  });
  const firstUnresolved = unresolvedEvents[0];
  const firstLowResult = lowResultEvents[0];
  const observed = {
    unresolvedCount: unresolvedEvents.length,
    unresolvedMarketKey: firstUnresolved?.marketKey ?? null,
    unresolvedCollectableMarketKeys: unresolvedEvents.map(
      (event) => event.collectableMarketKey,
    ),
    unresolvedRequestIds: unresolvedEvents.map((event) => event.requestId),
    lowResultCount: lowResultEvents.length,
    lowResultMarketKey: firstLowResult?.marketKey ?? null,
    lowResultCollectableMarketKeys: lowResultEvents.map(
      (event) => event.collectableMarketKey,
    ),
    lowResultRequestIds: lowResultEvents.map((event) => event.requestId),
    queuedStateCount,
  };
  const ok =
    unresolvedEvents.length === 1 &&
    firstUnresolved?.marketKey === marketKey &&
    firstUnresolved.collectableMarketKey === null &&
    firstUnresolved.requestId === null &&
    lowResultEvents.length === 1 &&
    firstLowResult?.marketKey === marketKey &&
    firstLowResult.collectableMarketKey === null &&
    firstLowResult.requestId === null &&
    queuedStateCount === 0;

  return (ok ? pass : fail)(
    'user-location demand facts: active searches preserve UI market without enqueueing collectable work',
    {
      unresolvedMarketKey: marketKey,
      unresolvedCollectableMarketKeys: [],
      lowResultMarketKey: marketKey,
      lowResultCollectableMarketKeys: [],
      queuedStateCount: 0,
    },
    observed,
  );
}

async function runDemandCurveCounterfactualFixture(params: {
  demandService: SearchDemandService;
  users: FixtureUser[];
  entities: {
    broadBackend: PickedEntity;
    mediumRepeat: PickedEntity;
    soloPower: PickedEntity;
    cacheBroad: PickedEntity;
    autocompleteIntent: PickedEntity;
    olderBroad: PickedEntity;
  };
}): Promise<FixtureCheck> {
  const { users, entities } = params;
  await insertDailyEntityDemandForUsers({
    demandDate: daysAgo(0.2),
    users: users.slice(0, 24),
    entity: entities.broadBackend,
    signalCount: 1,
    marketKey: counterfactualMarketKey,
  });
  await insertDailyEntityDemandForUsers({
    demandDate: daysAgo(0.2),
    users: users.slice(24, 32),
    entity: entities.mediumRepeat,
    signalCount: 3,
    marketKey: counterfactualMarketKey,
  });
  await insertDailyEntityDemand({
    demandDate: daysAgo(0.2),
    userId: users[32].userId,
    entity: entities.soloPower,
    signalCount: 80,
    marketKey: counterfactualMarketKey,
  });
  await insertDailyEntityDemandForUsers({
    demandDate: daysAgo(0.2),
    users: users.slice(33, 57),
    entity: entities.cacheBroad,
    signalCount: 1,
    signalKind: DemandSignalKind.cache,
    marketKey: counterfactualMarketKey,
  });
  await insertDailyEntityDemandForUsers({
    demandDate: daysAgo(0.2),
    users: users.slice(57, 67),
    entity: entities.autocompleteIntent,
    signalCount: 1,
    signalKind: DemandSignalKind.autocomplete_selection,
    marketKey: counterfactualMarketKey,
  });
  await insertDailyEntityDemandForUsers({
    demandDate: daysAgo(16),
    users: users.slice(0, 20),
    entity: entities.olderBroad,
    signalCount: 1,
    marketKey: counterfactualMarketKey,
  });

  const demandRows = await params.demandService.getTopEntitiesForLocation({
    marketKey: counterfactualMarketKey,
    since: daysAgo(35),
    entityTypes: [EntityType.food, EntityType.restaurant],
    entityIds: Object.values(entities).map((entity) => entity.entityId),
    minDemandScore: 0,
    limit: 20,
    currentCycleDays: 7,
    halfLifeDays: 14,
  });
  const demandById = new Map(demandRows.map((row) => [row.entityId, row]));
  const labelById = new Map(
    Object.entries(entities).map(([label, entity]) => [entity.entityId, label]),
  );
  const observed = demandRows.map((row) => ({
    label: labelById.get(row.entityId),
    entityId: row.entityId,
    distinctUsers: row.distinctUsers,
    signalCount: row.signalCount,
    weightedSignalCount: round(row.weightedSignalCount),
    demandScore: round(row.demandScore),
  }));
  const score = (entity: PickedEntity) =>
    demandById.get(entity.entityId)?.demandScore ?? 0;
  const broad = score(entities.broadBackend);
  const medium = score(entities.mediumRepeat);
  const solo = score(entities.soloPower);
  const cache = score(entities.cacheBroad);
  const autocomplete = score(entities.autocompleteIntent);
  const older = score(entities.olderBroad);
  const ok =
    broad > medium &&
    medium > older &&
    older > autocomplete &&
    autocomplete > cache &&
    cache > solo;

  return (ok ? pass : fail)(
    'counterfactual demand math: distinct users, repeats, recency, cache, and autocomplete weights separate cleanly',
    {
      order: [
        'broadBackend',
        'mediumRepeat',
        'olderBroad',
        'autocompleteIntent',
        'cacheBroad',
        'soloPower',
      ],
      interpretation: [
        '24 one-off backend users should beat 8 repeat-heavy users.',
        '8 repeat-heavy users should beat 20 older users after recency decay.',
        'Autocomplete selection intent should outrank equally broad cache replay.',
        'Broad cache replay should still beat one extremely repetitive user.',
      ],
    },
    observed,
  );
}

async function runFreshPopularityOverlayFixture(params: {
  popularity: SearchPopularityService;
  users: FixtureUser[];
  entities: {
    broad: PickedEntity;
    power: PickedEntity;
    autocompleteSelected: PickedEntity;
    plainBackend: PickedEntity;
  };
}): Promise<FixtureCheck> {
  const today = new Date();
  for (const [index, user] of params.users.slice(0, 5).entries()) {
    const searchRequestId = `55555555-5555-4555-8555-${String(index).padStart(12, '0')}`;
    await insertSearchLog({
      userId: user.userId,
      entity: params.entities.broad,
      queryText: 'fixture fresh broad popularity',
      loggedAt: today,
      searchRequestId,
      marketKey: fixtureUiMarketA,
      collectableMarketKey,
      eventKind: SearchLogEventKind.backend,
    });
    await insertSearchLog({
      userId: user.userId,
      entity: params.entities.broad,
      queryText: 'fixture fresh broad popularity',
      loggedAt: today,
      searchRequestId,
      marketKey: fixtureUiMarketB,
      collectableMarketKey,
      eventKind: SearchLogEventKind.backend,
    });
  }
  for (let index = 0; index < 12; index += 1) {
    await insertSearchLog({
      userId: params.users[5].userId,
      entity: params.entities.power,
      queryText: 'fixture fresh power popularity',
      loggedAt: today,
      searchRequestId: `66666666-6666-4666-8666-${String(index).padStart(12, '0')}`,
      marketKey,
      collectableMarketKey,
      eventKind: SearchLogEventKind.backend,
    });
  }
  await insertSearchLog({
    userId: params.users[6].userId,
    entity: params.entities.plainBackend,
    queryText: 'fixture fresh plain backend',
    loggedAt: today,
    searchRequestId: '12121212-1212-4212-8212-121212121212',
    marketKey,
    collectableMarketKey,
    eventKind: SearchLogEventKind.backend,
  });
  await insertSearchLog({
    userId: params.users[7].userId,
    entity: params.entities.autocompleteSelected,
    queryText: 'fixture fresh autocomplete selected',
    loggedAt: today,
    searchRequestId: '13131313-1313-4313-8313-131313131313',
    marketKey,
    collectableMarketKey,
    eventKind: SearchLogEventKind.backend,
    metadata: {
      ...fixtureMarker,
      submissionSource: 'autocomplete',
      submissionContext: {
        matchType: 'entity',
        selectedEntityId: params.entities.autocompleteSelected.entityId,
        selectedEntityType: params.entities.autocompleteSelected.type,
      },
    },
  });

  const scores = await (
    params.popularity as unknown as {
      loadFreshSearchLogPopularity(
        entityIds: string[],
        options: { marketKey?: string | null; cacheWeight: number },
      ): Promise<Map<string, number>>;
    }
  ).loadFreshSearchLogPopularity(
    [
      params.entities.broad.entityId,
      params.entities.power.entityId,
      params.entities.autocompleteSelected.entityId,
      params.entities.plainBackend.entityId,
    ],
    { marketKey: null, cacheWeight: 0.35 },
  );
  const broadScore = scores.get(params.entities.broad.entityId) ?? 0;
  const powerScore = scores.get(params.entities.power.entityId) ?? 0;
  const autocompleteSelectedScore =
    scores.get(params.entities.autocompleteSelected.entityId) ?? 0;
  const plainBackendScore =
    scores.get(params.entities.plainBackend.entityId) ?? 0;
  const observed = {
    broadScore: round(broadScore),
    powerScore: round(powerScore),
    autocompleteSelectedScore: round(autocompleteSelectedScore),
    plainBackendScore: round(plainBackendScore),
    selectionScoreExceedsPlainBackend:
      autocompleteSelectedScore > plainBackendScore,
    broadUsers: 5,
    broadRows: 10,
    broadDistinctRequestIds: 5,
    powerUserRepeats: 12,
  };
  const ok =
    broadScore > powerScore &&
    Math.abs(broadScore - 5) < 0.001 &&
    powerScore > 0 &&
    Math.abs(plainBackendScore - 1) < 0.001 &&
    autocompleteSelectedScore > plainBackendScore;

  return (ok ? pass : fail)(
    'fresh popularity overlay: same-day raw logs use event-deduped scoring and autocomplete selection intent',
    {
      broadUsersOutrankOneRepeatUser: true,
      selectionScoreExceedsPlainBackend: true,
      broadUsers: 5,
      broadRows: 10,
      broadScore: 5,
      powerUserRepeats: 12,
    },
    observed,
  );
}

async function runPollFixture(params: {
  demandService: SearchDemandService;
  scoringTrace: DemandScoringTraceService;
  users: FixtureUser[];
  entities: {
    broad: PickedEntity;
    power: PickedEntity;
    recentPoll: PickedEntity;
    resurgent: PickedEntity;
  };
}): Promise<FixtureCheck> {
  const { users, entities } = params;
  const today = new Date();
  const previousCycle = daysAgo(9);
  const rollingBaseline = daysAgo(20);

  for (const user of users.slice(0, 8)) {
    await insertDailyEntityDemand({
      demandDate: today,
      userId: user.userId,
      entity: entities.broad,
      signalCount: 1,
      marketKey,
    });
  }
  await insertDailyEntityDemand({
    demandDate: today,
    userId: users[8].userId,
    entity: entities.power,
    signalCount: 12,
    marketKey,
  });
  for (const user of users.slice(0, 10)) {
    await insertDailyEntityDemand({
      demandDate: today,
      userId: user.userId,
      entity: entities.recentPoll,
      signalCount: 1,
      marketKey,
    });
  }
  for (const user of users.slice(0, 8)) {
    await insertDailyEntityDemand({
      demandDate: today,
      userId: user.userId,
      entity: entities.resurgent,
      signalCount: 1,
      marketKey,
    });
  }
  await insertDailyEntityDemand({
    demandDate: previousCycle,
    userId: users[0].userId,
    entity: entities.resurgent,
    signalCount: 1,
    marketKey,
  });
  await insertDailyEntityDemand({
    demandDate: rollingBaseline,
    userId: users[1].userId,
    entity: entities.resurgent,
    signalCount: 1,
    marketKey,
  });

  const pollScheduler = new PollSchedulerService(
    prisma as never,
    noopLogger as never,
    {} as never,
    params.demandService,
    params.scoringTrace,
  );

  const candidates = (await (
    pollScheduler as unknown as {
      planMarketTopicCandidates(input: {
        marketKey: string;
        since: Date;
        limit: number;
      }): Promise<
        Array<{
          entityId: string;
          title: string;
          finalScore: number;
          rank: number;
          factorBreakdown: Prisma.JsonObject;
        }>
      >;
    }
  ).planMarketTopicCandidates({
    marketKey,
    since: daysAgo(35),
    limit: 80,
  })) as Array<{
    entityId: string;
    title: string;
    finalScore: number;
    rank: number;
    factorBreakdown: Prisma.JsonObject;
  }>;

  const fixtureIds = new Set(
    Object.values(entities).map((entity) => entity.entityId),
  );
  const demandRows = await params.demandService.getTopEntitiesForLocation({
    marketKey,
    since: daysAgo(35),
    entityTypes: [EntityType.food, EntityType.restaurant],
    entityIds: [...fixtureIds],
    minDemandScore: 0,
    limit: 20,
    currentCycleDays: 7,
    halfLifeDays: 14,
  });
  const fixtureCandidates = candidates.filter((candidate) =>
    fixtureIds.has(candidate.entityId),
  );
  const traceStartedAt = new Date();
  await (
    pollScheduler as unknown as {
      tracePollTopicSelection(input: {
        marketKey: string;
        since: Date;
        selectedCandidates: unknown[];
        candidatePool: unknown[];
      }): Promise<void>;
    }
  ).tracePollTopicSelection({
    marketKey,
    since: daysAgo(35),
    selectedCandidates: fixtureCandidates
      .slice(0, 3)
      .map((candidate, index) => ({
        ...candidate,
        selectedRank: index + 1,
      })),
    candidatePool: fixtureCandidates,
  });
  const latestTraceRun = await prisma.demandScoringRun.findFirst({
    where: {
      consumerKind: DemandScoringConsumerKind.poll_topic,
      startedAt: { gte: traceStartedAt },
    },
    orderBy: { startedAt: 'desc' },
  });
  const traceRows = latestTraceRun
    ? await prisma.demandScoringCandidate.findMany({
        where: { runId: latestTraceRun.runId },
        orderBy: [{ selected: 'desc' }, { rank: 'asc' }],
      })
    : [];
  const traceMetadata =
    latestTraceRun?.metadata &&
    typeof latestTraceRun.metadata === 'object' &&
    !Array.isArray(latestTraceRun.metadata)
      ? latestTraceRun.metadata
      : {};
  const traceValidation = {
    runCreated: Boolean(latestTraceRun),
    candidateMinDemandScore:
      (traceMetadata as Record<string, unknown>).candidateMinDemandScore ??
      null,
    selectedCount: traceRows.filter((row) => row.selected).length,
    nearMissCount: traceRows.filter((row) => !row.selected).length,
    hasFactorBreakdown: traceRows.every(
      (row) =>
        row.factorBreakdown &&
        typeof row.factorBreakdown === 'object' &&
        !Array.isArray(row.factorBreakdown) &&
        typeof (row.factorBreakdown as Record<string, unknown>).baseDemand ===
          'number',
    ),
  };
  const observedOrder = fixtureCandidates.map(
    (candidate) => candidate.entityId,
  );
  const expectedOrder = [
    entities.broad.entityId,
    entities.resurgent.entityId,
    entities.power.entityId,
    entities.recentPoll.entityId,
  ];
  const observed = fixtureCandidates.map((candidate) => ({
    entityId: candidate.entityId,
    title: candidate.title,
    finalScore: Number(candidate.finalScore.toFixed(4)),
    cooldownAvailability:
      typeof candidate.factorBreakdown.pollCooldownAvailability === 'number'
        ? Number(candidate.factorBreakdown.pollCooldownAvailability.toFixed(4))
        : null,
    resurgenceBoost:
      typeof candidate.factorBreakdown.pollResurgenceBoost === 'number'
        ? Number(candidate.factorBreakdown.pollResurgenceBoost.toFixed(4))
        : null,
  }));
  const traceOk =
    traceValidation.runCreated &&
    traceValidation.candidateMinDemandScore === 1 &&
    traceValidation.selectedCount === 3 &&
    traceValidation.nearMissCount >= 1 &&
    traceValidation.hasFactorBreakdown;
  const pollOk = expectedOrderMatches(observedOrder, expectedOrder) && traceOk;
  return (pollOk ? pass : fail)(
    'poll ranking: broad demand wins, resurgence competes, recent cooldown suppresses, trace explains factors',
    {
      order: expectedOrder.map((id) => ({
        entityId: id,
        label: Object.entries(entities).find(
          ([, entity]) => entity.entityId === id,
        )?.[0],
      })),
      trace: {
        candidateMinDemandScore: 1,
        selectedCount: 3,
        nearMissCountAtLeast: 1,
        hasFactorBreakdown: true,
      },
    },
    {
      candidates: observed,
      traceValidation,
    },
    [
      ...(demandRows.length === 0
        ? [
            'No demand rows were returned by SearchDemandService for the inserted fixture rows.',
            `Service warnings: ${JSON.stringify(serviceWarnings.slice(-5))}`,
          ]
        : []),
      ...(!traceOk
        ? [
            'Poll trace rows did not satisfy the selected/near-miss/factor contract.',
          ]
        : []),
    ],
  );
}

async function runPollAdversarialFixture(params: {
  demandService: SearchDemandService;
  scoringTrace: DemandScoringTraceService;
  users: FixtureUser[];
  entities: {
    broadBackend: PickedEntity;
    mediumRepeat: PickedEntity;
    soloPower: PickedEntity;
    cacheBroad: PickedEntity;
    autocompleteIntent: PickedEntity;
    olderBroad: PickedEntity;
    recentHuge: PickedEntity;
    recoveredCooldown: PickedEntity;
  };
}): Promise<FixtureCheck> {
  const { users, entities } = params;
  await insertDailyEntityDemandForUsers({
    demandDate: daysAgo(0.2),
    users: users.slice(0, 24),
    entity: entities.broadBackend,
    signalCount: 1,
    marketKey: pollAdversarialMarketKey,
  });
  await insertDailyEntityDemandForUsers({
    demandDate: daysAgo(0.2),
    users: users.slice(24, 32),
    entity: entities.mediumRepeat,
    signalCount: 3,
    marketKey: pollAdversarialMarketKey,
  });
  await insertDailyEntityDemand({
    demandDate: daysAgo(0.2),
    userId: users[32].userId,
    entity: entities.soloPower,
    signalCount: 80,
    marketKey: pollAdversarialMarketKey,
  });
  await insertDailyEntityDemandForUsers({
    demandDate: daysAgo(0.2),
    users: users.slice(33, 57),
    entity: entities.cacheBroad,
    signalCount: 1,
    signalKind: DemandSignalKind.cache,
    marketKey: pollAdversarialMarketKey,
  });
  await insertDailyEntityDemandForUsers({
    demandDate: daysAgo(0.2),
    users: users.slice(57, 67),
    entity: entities.autocompleteIntent,
    signalCount: 1,
    signalKind: DemandSignalKind.autocomplete_selection,
    marketKey: pollAdversarialMarketKey,
  });
  await insertDailyEntityDemandForUsers({
    demandDate: daysAgo(16),
    users: users.slice(0, 20),
    entity: entities.olderBroad,
    signalCount: 1,
    marketKey: pollAdversarialMarketKey,
  });
  await insertDailyEntityDemandForUsers({
    demandDate: daysAgo(0.1),
    users: users.slice(0, 30),
    entity: entities.recentHuge,
    signalCount: 1,
    marketKey: pollAdversarialMarketKey,
  });
  await insertDailyEntityDemandForUsers({
    demandDate: daysAgo(0.1),
    users: users.slice(30, 44),
    entity: entities.recoveredCooldown,
    signalCount: 1,
    marketKey: pollAdversarialMarketKey,
  });

  const pollScheduler = new PollSchedulerService(
    prisma as never,
    noopLogger as never,
    {} as never,
    params.demandService,
    params.scoringTrace,
  );
  const candidates = await (
    pollScheduler as unknown as {
      planMarketTopicCandidates(input: {
        marketKey: string;
        since: Date;
        limit: number;
      }): Promise<
        Array<{
          entityId: string;
          title: string;
          finalScore: number;
          rank: number;
          factorBreakdown: Prisma.JsonObject;
        }>
      >;
    }
  ).planMarketTopicCandidates({
    marketKey: pollAdversarialMarketKey,
    since: daysAgo(45),
    limit: 80,
  });
  const fixtureIds = new Set(
    Object.values(entities).map((entity) => entity.entityId),
  );
  const labelById = new Map(
    Object.entries(entities).map(([label, entity]) => [entity.entityId, label]),
  );
  const fixtureCandidates = candidates.filter((candidate) =>
    fixtureIds.has(candidate.entityId),
  );
  const candidateByLabel = new Map(
    fixtureCandidates.map((candidate) => [
      labelById.get(candidate.entityId),
      candidate,
    ]),
  );
  const observed = fixtureCandidates.map((candidate) => {
    const factors = candidate.factorBreakdown as Record<string, unknown>;
    return {
      rank: candidate.rank,
      label: labelById.get(candidate.entityId),
      entityId: candidate.entityId,
      finalScore: round(candidate.finalScore),
      baseDemand:
        typeof factors.baseDemand === 'number'
          ? round(factors.baseDemand)
          : null,
      cooldownAvailability:
        typeof factors.pollCooldownAvailability === 'number'
          ? round(factors.pollCooldownAvailability)
          : null,
      resurgenceCreditDays:
        typeof factors.resurgenceCreditDays === 'number'
          ? round(factors.resurgenceCreditDays)
          : null,
      resurgenceBoost:
        typeof factors.pollResurgenceBoost === 'number'
          ? round(factors.pollResurgenceBoost)
          : null,
    };
  });
  const finalScore = (label: keyof typeof entities) =>
    candidateByLabel.get(label)?.finalScore ?? 0;
  const rank = (label: keyof typeof entities) =>
    candidateByLabel.get(label)?.rank ?? Number.MAX_SAFE_INTEGER;
  const recentHugeFactors = candidateByLabel.get('recentHuge')
    ?.factorBreakdown as Record<string, unknown> | undefined;
  const recentAvailability =
    typeof recentHugeFactors?.pollCooldownAvailability === 'number'
      ? recentHugeFactors.pollCooldownAvailability
      : 1;
  const ok =
    rank('broadBackend') < rank('mediumRepeat') &&
    rank('mediumRepeat') < rank('soloPower') &&
    finalScore('cacheBroad') < finalScore('broadBackend') &&
    finalScore('autocompleteIntent') > finalScore('cacheBroad') &&
    finalScore('recentHuge') < finalScore('broadBackend') &&
    recentAvailability < 0.7;

  return (ok ? pass : fail)(
    'poll adversarial pool: broad demand, repeat intensity, cache weight, intent boost, recency, and cooldown compete sanely',
    {
      invariants: [
        'Broad current backend demand outranks a smaller repeat-heavy group.',
        'A smaller repeat-heavy group outranks one extreme power user.',
        'Cache replay is weaker than fresh backend demand.',
        'Autocomplete selection demand is stronger than cache replay.',
        'A recently polled but high-demand topic is suppressed below broad fresh demand.',
      ],
    },
    observed,
  );
}

async function runPollPublishFixture(params: {
  scoringTrace: DemandScoringTraceService;
  entities: {
    selected: PickedEntity;
    rejected: PickedEntity;
  };
}): Promise<FixtureCheck> {
  const marketKeyForPublish = 'locality-fixture-poll-publish';
  const selectedTopicId = randomUUID();
  const rejectedTopicId = randomUUID();
  const now = new Date();
  const publishedPollIds: string[] = [];
  const archivedTopicIds: string[] = [];
  const notifiedMarketKeys: string[] = [];
  let refreshCalled = 0;
  let rankCalled = 0;

  const buildTopic = (params: {
    topicId: string;
    entity: PickedEntity;
    score: number;
    rank: number;
  }) => ({
    topicId: params.topicId,
    title: `Fixture poll for ${params.entity.name}`,
    description: null,
    marketKey: marketKeyForPublish,
    region: 'Fixture Market',
    country: 'US',
    categoryEntityIds: [],
    seedEntityIds: [params.entity.entityId],
    status: 'ready',
    metadata: {
      fixtureRunId,
      pollPriority: {
        score: params.score,
        rank: params.rank,
        factors: { fixture: true },
      },
    },
    createdByUserId: null,
    createdAt: now,
    updatedAt: now,
    targetDishId: params.entity.entityId,
    targetRestaurantId: null,
    targetFoodAttributeId: null,
    targetRestaurantAttributeId: null,
    topicType: 'best_dish',
    currentPriorityScore: params.score,
    currentPriorityRank: params.rank,
    currentPriorityMetadata: {
      fixtureRunId,
      pollPriority: {
        score: params.score,
        rank: params.rank,
        factors: { fixture: true },
      },
    },
  });

  const topics = [
    buildTopic({
      topicId: selectedTopicId,
      entity: params.entities.selected,
      score: 9,
      rank: 1,
    }),
    buildTopic({
      topicId: rejectedTopicId,
      entity: params.entities.rejected,
      score: 4,
      rank: 2,
    }),
  ];
  const scheduler = Object.create(PollSchedulerService.prototype) as {
    publishWeeklyPolls: () => Promise<void>;
    [key: string]: unknown;
  };
  Object.assign(scheduler, {
    logger: noopLogger,
    config: {
      topicLimit: 40,
      maxPollsPerCity: 1,
      demandWindowDays: 14,
      minDemandScore: 1,
      releaseDayOfWeek: now.getDay(),
      releaseHour: now.getHours(),
    },
    scoringTrace: params.scoringTrace,
    notifications: {
      queuePollReleaseNotification: async (payload: {
        city: string;
        pollIds: string[];
      }) => {
        notifiedMarketKeys.push(payload.city);
      },
    },
    prisma: {
      poll: {
        count: async () => 0,
        create: async ({ data }: { data: { topicId: string } }) => {
          const pollId = randomUUID();
          publishedPollIds.push(pollId);
          return { pollId, topicId: data.topicId };
        },
      },
      pollTopic: {
        findMany: async () => topics,
        update: async ({ where }: { where: { topicId: string } }) => {
          archivedTopicIds.push(where.topicId);
          return null;
        },
      },
      entity: {
        updateMany: async () => ({ count: 1 }),
      },
    },
    refreshTopics: async () => {
      refreshCalled += 1;
    },
    rankReadyTopicsForPublish: async () => {
      rankCalled += 1;
      return topics;
    },
  });

  await scheduler.publishWeeklyPolls();

  const traceRows = await prisma.demandScoringCandidate.findMany({
    where: {
      consumerKind: DemandScoringConsumerKind.poll_topic,
      marketKey: marketKeyForPublish,
      OR: [
        { subjectKey: selectedTopicId },
        { subjectKey: rejectedTopicId },
        { entityId: params.entities.selected.entityId },
        { entityId: params.entities.rejected.entityId },
      ],
    },
    select: {
      subjectKey: true,
      selected: true,
      decisionReason: true,
      factorBreakdown: true,
    },
    orderBy: [{ selected: 'desc' }, { rank: 'asc' }],
  });
  const selectedTrace = traceRows.find(
    (row) => row.selected && row.decisionReason === 'poll_published',
  );
  const nearMissTrace = traceRows.find(
    (row) => row.decisionReason === 'not_published_this_cycle',
  );
  const observed = {
    refreshCalled,
    rankCalled,
    publishedPollIds: publishedPollIds.length,
    archivedTopicIds,
    notifiedMarketKeys,
    traceRows: traceRows.map((row) => ({
      subjectKey: row.subjectKey,
      selected: row.selected,
      decisionReason: row.decisionReason,
      phase:
        row.factorBreakdown &&
        typeof row.factorBreakdown === 'object' &&
        !Array.isArray(row.factorBreakdown)
          ? row.factorBreakdown.phase
          : null,
    })),
  };
  const ok =
    refreshCalled === 1 &&
    rankCalled === 1 &&
    publishedPollIds.length === 1 &&
    archivedTopicIds.length === 1 &&
    archivedTopicIds[0] === selectedTopicId &&
    notifiedMarketKeys.includes(marketKeyForPublish) &&
    Boolean(selectedTrace) &&
    Boolean(nearMissTrace);

  return (ok ? pass : fail)(
    'poll publish: weekly publish refreshes, reranks, applies market budget, archives selected topic, and writes publish trace',
    {
      refreshCalled: 1,
      rankCalled: 1,
      publishedPollCount: 1,
      archivedTopicIds: [selectedTopicId],
      selectedDecisionReason: 'poll_published',
      rejectedDecisionReason: 'not_published_this_cycle',
    },
    observed,
  );
}

async function runKeywordSoftReservationFixture(
  keywordSelection: KeywordSliceSelectionService,
): Promise<FixtureCheck> {
  const candidatesBySlice = {
    unmet: [
      {
        term: 'rare ethiopian breakfast',
        normalizedTerm: 'rare ethiopian breakfast',
        slice: 'unmet' as const,
        score: 10,
      },
      {
        term: 'late night congee',
        normalizedTerm: 'late night congee',
        slice: 'unmet' as const,
        score: 9,
      },
      {
        term: 'weak unmet filler',
        normalizedTerm: 'weak unmet filler',
        slice: 'unmet' as const,
        score: 1,
      },
    ],
    refresh: [
      {
        term: 'bbq',
        normalizedTerm: 'bbq',
        slice: 'refresh' as const,
        score: 8,
      },
      {
        term: 'tacos',
        normalizedTerm: 'tacos',
        slice: 'refresh' as const,
        score: 7.8,
      },
      {
        term: 'stale weak refresh',
        normalizedTerm: 'stale weak refresh',
        slice: 'refresh' as const,
        score: 0.7,
      },
    ],
    demand: [
      {
        term: 'sushi',
        normalizedTerm: 'sushi',
        slice: 'demand' as const,
        score: 9.5,
      },
      {
        term: 'ramen',
        normalizedTerm: 'ramen',
        slice: 'demand' as const,
        score: 6,
      },
    ],
    explore: [
      {
        term: 'new supper club',
        normalizedTerm: 'new supper club',
        slice: 'explore' as const,
        score: 5,
      },
      {
        term: 'very weak explore',
        normalizedTerm: 'very weak explore',
        slice: 'explore' as const,
        score: 0.2,
      },
    ],
  };
  const result = (
    keywordSelection as unknown as {
      selectWithSoftReservationsAndBackfill(input: {
        candidatesBySlice: typeof candidatesBySlice;
        reservations: Record<
          'unmet' | 'refresh' | 'demand' | 'explore',
          number
        >;
        maxTerms: number;
      }): {
        selected: Array<{
          normalizedTerm: string;
          slice: string;
          score: number;
        }>;
        underfilledBySlice: Record<string, number>;
      };
    }
  ).selectWithSoftReservationsAndBackfill({
    candidatesBySlice,
    reservations: { unmet: 5, refresh: 10, demand: 8, explore: 2 },
    maxTerms: 7,
  });
  const singletonWeakCandidatesBySlice = {
    unmet: [],
    refresh: [
      {
        term: 'barely stale singleton',
        normalizedTerm: 'barely stale singleton',
        slice: 'refresh' as const,
        score: 0.05,
      },
    ],
    demand: [],
    explore: [
      {
        term: 'thin explore singleton',
        normalizedTerm: 'thin explore singleton',
        slice: 'explore' as const,
        score: 0.05,
      },
    ],
  };
  const singletonUsefulCandidatesBySlice = {
    unmet: [
      {
        term: 'one user useful unmet',
        normalizedTerm: 'one user useful unmet',
        slice: 'unmet' as const,
        score: 1,
      },
    ],
    refresh: [],
    demand: [],
    explore: [],
  };
  const singletonWeakResult = (
    keywordSelection as unknown as {
      selectWithSoftReservationsAndBackfill(input: {
        candidatesBySlice: typeof singletonWeakCandidatesBySlice;
        reservations: Record<
          'unmet' | 'refresh' | 'demand' | 'explore',
          number
        >;
        maxTerms: number;
      }): {
        selected: Array<{
          normalizedTerm: string;
          slice: string;
          score: number;
        }>;
      };
    }
  ).selectWithSoftReservationsAndBackfill({
    candidatesBySlice: singletonWeakCandidatesBySlice,
    reservations: { unmet: 5, refresh: 10, demand: 8, explore: 2 },
    maxTerms: 4,
  });
  const singletonUsefulResult = (
    keywordSelection as unknown as {
      selectWithSoftReservationsAndBackfill(input: {
        candidatesBySlice: typeof singletonUsefulCandidatesBySlice;
        reservations: Record<
          'unmet' | 'refresh' | 'demand' | 'explore',
          number
        >;
        maxTerms: number;
      }): {
        selected: Array<{
          normalizedTerm: string;
          slice: string;
          score: number;
        }>;
      };
    }
  ).selectWithSoftReservationsAndBackfill({
    candidatesBySlice: singletonUsefulCandidatesBySlice,
    reservations: { unmet: 5, refresh: 10, demand: 8, explore: 2 },
    maxTerms: 4,
  });
  const traceStartedAt = new Date();
  await (
    keywordSelection as unknown as {
      traceKeywordSelection(input: {
        collectableMarketKey: string;
        cycleStartAt: Date;
        cycleEndAt: Date;
        candidatesBySlice: typeof candidatesBySlice;
        selected: Array<{
          normalizedTerm: string;
          slice: string;
          score: number;
        }>;
        maxTerms: number;
      }): Promise<void>;
    }
  ).traceKeywordSelection({
    collectableMarketKey,
    cycleStartAt: daysAgo(30),
    cycleEndAt: new Date(),
    candidatesBySlice,
    selected: result.selected,
    maxTerms: 7,
  });
  const latestTraceRun = await prisma.demandScoringRun.findFirst({
    where: {
      consumerKind: DemandScoringConsumerKind.keyword_collection,
      startedAt: { gte: traceStartedAt },
    },
    orderBy: { startedAt: 'desc' },
  });
  const traceRows = latestTraceRun
    ? await prisma.demandScoringCandidate.findMany({
        where: { runId: latestTraceRun.runId },
        orderBy: [{ selected: 'desc' }, { rank: 'asc' }],
      })
    : [];
  const traceValidation = {
    runCreated: Boolean(latestTraceRun),
    selectedCount: traceRows.filter((row) => row.selected).length,
    nearMissCount: traceRows.filter((row) => !row.selected).length,
    hasBucketAndFactors: traceRows.every(
      (row) =>
        typeof row.bucket === 'string' &&
        row.factorBreakdown &&
        typeof row.factorBreakdown === 'object' &&
        !Array.isArray(row.factorBreakdown) &&
        typeof (row.factorBreakdown as Record<string, unknown>).score ===
          'number',
    ),
  };
  const observed = {
    selected: result.selected.map((candidate) => ({
      term: candidate.normalizedTerm,
      slice: candidate.slice,
      score: candidate.score,
    })),
    singletonWeakSelected: singletonWeakResult.selected,
    singletonUsefulSelected: singletonUsefulResult.selected,
    underfilledBySlice: result.underfilledBySlice,
    traceValidation,
  };
  const selectedTerms = result.selected.map(
    (candidate) => candidate.normalizedTerm,
  );
  const rejectsWeakFillers =
    !selectedTerms.includes('weak unmet filler') &&
    !selectedTerms.includes('stale weak refresh') &&
    !selectedTerms.includes('very weak explore');
  const includesStrongBuckets = [
    'rare ethiopian breakfast',
    'late night congee',
    'bbq',
    'tacos',
    'sushi',
    'ramen',
    'new supper club',
  ].every((term) => selectedTerms.includes(term));
  const traceOk =
    traceValidation.runCreated &&
    traceValidation.selectedCount === 7 &&
    traceValidation.nearMissCount >= 1 &&
    traceValidation.hasBucketAndFactors;
  const singletonQualityOk =
    singletonWeakResult.selected.length === 0 &&
    singletonUsefulResult.selected.some(
      (candidate) => candidate.normalizedTerm === 'one user useful unmet',
    );
  return rejectsWeakFillers &&
    includesStrongBuckets &&
    traceOk &&
    singletonQualityOk
    ? pass(
        'keyword collection: soft reservations use natural breaks, backfill strong leftovers, and trace factors',
        {
          includes: [
            'rare ethiopian breakfast',
            'late night congee',
            'bbq',
            'tacos',
            'sushi',
            'ramen',
            'new supper club',
          ],
          excludes: [
            'weak unmet filler',
            'stale weak refresh',
            'very weak explore',
          ],
          singletonWeakSelected: false,
          oneUserUnmetSelected: true,
        },
        observed,
      )
    : fail(
        'keyword collection: soft reservations use natural breaks, backfill strong leftovers, and trace factors',
        {
          includes: [
            'rare ethiopian breakfast',
            'late night congee',
            'bbq',
            'tacos',
            'sushi',
            'ramen',
            'new supper club',
          ],
          excludes: [
            'weak unmet filler',
            'stale weak refresh',
            'very weak explore',
          ],
          singletonWeakSelected: false,
          oneUserUnmetSelected: true,
        },
        observed,
      );
}

async function runKeywordNoResultsRecoveryFixture(params: {
  users: FixtureUser[];
  scoringTrace: DemandScoringTraceService;
}): Promise<FixtureCheck> {
  for (const user of params.users.slice(0, 12)) {
    await insertOnDemandAsk({
      userId: user.userId,
      term: 'fixture smooth recovery ramen',
      reason: OnDemandReason.unresolved,
      askedAt: daysAgo(0.1),
      collectableMarketKey: keywordRecoveryCollectableMarketKey,
    });
  }
  await prisma.keywordAttemptHistory.upsert({
    where: {
      collectableMarketKey_normalizedTerm: {
        collectableMarketKey: keywordRecoveryCollectableMarketKey,
        normalizedTerm: 'fixture smooth recovery ramen',
      },
    },
    create: {
      collectableMarketKey: keywordRecoveryCollectableMarketKey,
      normalizedTerm: 'fixture smooth recovery ramen',
      lastAttemptAt: daysAgo(30),
      lastOutcome: KeywordAttemptOutcome.no_results,
      cooldownUntil: daysFromNow(30),
    },
    update: {
      lastAttemptAt: daysAgo(30),
      lastOutcome: KeywordAttemptOutcome.no_results,
      cooldownUntil: daysFromNow(30),
    },
  });

  const keywordSelection = new KeywordSliceSelectionService(
    prisma as never,
    {
      resolveMarketKeyForCommunity: async () =>
        keywordRecoveryCollectableMarketKey,
    } as never,
    params.scoringTrace,
    noopLogger as never,
  );
  const result = await keywordSelection.selectTermsForSubreddit('fixturefood');
  const selected = result.terms.find(
    (term) => term.normalizedTerm === 'fixture smooth recovery ramen',
  );
  const observed = {
    selected: Boolean(selected),
    score: selected ? round(selected.score) : null,
    selectedTerms: result.terms.slice(0, 5).map((term) => ({
      term: term.normalizedTerm,
      slice: term.slice,
      score: round(term.score),
      origin: term.origin,
    })),
  };
  const attemptAvailability =
    selected?.origin &&
    typeof selected.origin === 'object' &&
    typeof selected.origin.attemptAvailability === 'number'
      ? (selected.origin as Record<string, number>).attemptAvailability
      : 0;
  const ok =
    Boolean(selected) && attemptAvailability > 0.3 && attemptAvailability < 0.5;

  return (ok ? pass : fail)(
    'keyword unmet recovery: no-results cooldown uses smooth availability instead of hard drop',
    {
      selected: true,
      attemptAvailabilityBetween: [0.3, 0.5],
    },
    {
      ...observed,
      attemptAvailability: round(attemptAvailability),
    },
  );
}

async function runKeywordLiveLoaderFixture(params: {
  users: FixtureUser[];
  scoringTrace: DemandScoringTraceService;
  entities: {
    demand: PickedEntity;
    autocomplete: PickedEntity;
  };
}): Promise<FixtureCheck> {
  for (const user of params.users.slice(0, 6)) {
    await insertOnDemandAsk({
      userId: user.userId,
      term: 'fixture live unmet',
      reason: OnDemandReason.unresolved,
      askedAt: daysAgo(0.1),
      collectableMarketKey: keywordLiveCollectableMarketKey,
    });
  }
  await insertOnDemandAsk({
    userId: params.users[6].userId,
    term: 'restaurants',
    reason: OnDemandReason.unresolved,
    askedAt: daysAgo(0.1),
    collectableMarketKey: keywordLiveCollectableMarketKey,
  });
  for (const user of params.users.slice(7, 13)) {
    await insertOnDemandAsk({
      userId: user.userId,
      term: 'fixture live cooldown',
      reason: OnDemandReason.unresolved,
      askedAt: daysAgo(0.1),
      collectableMarketKey: keywordLiveCollectableMarketKey,
    });
  }
  await insertDailyEntityDemandForUsers({
    demandDate: daysAgo(0.1),
    users: params.users.slice(13, 25),
    entity: params.entities.demand,
    signalCount: 1,
    marketKey: null,
    collectableMarketKey: keywordLiveCollectableMarketKey,
  });
  await insertDailyEntityDemandForUsers({
    demandDate: daysAgo(0.1),
    users: params.users.slice(25, 30),
    entity: params.entities.autocomplete,
    signalCount: 1,
    signalKind: DemandSignalKind.autocomplete_selection,
    marketKey: null,
    collectableMarketKey: keywordLiveCollectableMarketKey,
  });
  await prisma.keywordAttemptHistory.createMany({
    data: [
      {
        collectableMarketKey: keywordLiveCollectableMarketKey,
        normalizedTerm: 'fixture live stale refresh',
        lastSuccessAt: daysAgo(120),
        lastAttemptAt: daysAgo(120),
        lastOutcome: KeywordAttemptOutcome.success,
      },
      {
        collectableMarketKey: keywordLiveCollectableMarketKey,
        normalizedTerm: 'fixture live cooldown',
        lastAttemptAt: daysAgo(1),
        lastOutcome: KeywordAttemptOutcome.success,
        cooldownUntil: daysFromNow(10),
      },
    ],
    skipDuplicates: true,
  });

  const keywordSelection = new KeywordSliceSelectionService(
    prisma as never,
    {
      resolveMarketKeyForCommunity: async () => keywordLiveCollectableMarketKey,
    } as never,
    params.scoringTrace,
    noopLogger as never,
  );
  const traceStartedAt = new Date();
  const result = await keywordSelection.selectTermsForSubreddit('fixturefood');
  const selectedTerms = result.terms.map((term) => term.normalizedTerm);
  const latestRun = await prisma.demandScoringRun.findFirst({
    where: {
      consumerKind: DemandScoringConsumerKind.keyword_collection,
      collectableMarketKey: keywordLiveCollectableMarketKey,
      startedAt: { gte: traceStartedAt },
    },
    orderBy: { startedAt: 'desc' },
  });
  const traceRows = latestRun
    ? await prisma.demandScoringCandidate.findMany({
        where: { runId: latestRun.runId },
        orderBy: [{ selected: 'desc' }, { rank: 'asc' }],
      })
    : [];
  const decisionReasons = traceRows
    .map((row) => row.decisionReason)
    .filter(Boolean);
  const observed = {
    selected: result.terms.slice(0, 8).map((term) => ({
      term: term.normalizedTerm,
      slice: term.slice,
      score: round(term.score),
    })),
    decisionReasons,
    stats: result.stats,
  };
  const ok =
    selectedTerms.includes('fixture live unmet') &&
    selectedTerms.includes('fixture live stale refresh') &&
    selectedTerms.includes(normalizeTerm(params.entities.demand.name)) &&
    selectedTerms.includes(normalizeTerm(params.entities.autocomplete.name)) &&
    !selectedTerms.includes('restaurants') &&
    !selectedTerms.includes('fixture live cooldown') &&
    decisionReasons.includes('generic_only_keyword') &&
    decisionReasons.includes('attempt_cooldown_active');

  return (ok ? pass : fail)(
    'keyword live loaders: unmet, refresh, demand, autocomplete, invalid, and cooldown paths feed one ranked planner',
    {
      selectedIncludes: [
        'fixture live unmet',
        'fixture live stale refresh',
        normalizeTerm(params.entities.demand.name),
        normalizeTerm(params.entities.autocomplete.name),
      ],
      selectedExcludes: ['restaurants', 'fixture live cooldown'],
      tracedGateRejects: ['generic_only_keyword', 'attempt_cooldown_active'],
    },
    observed,
  );
}

async function runHotSpikeFixture(params: {
  scheduler: KeywordSearchSchedulerService;
  users: FixtureUser[];
}): Promise<FixtureCheck> {
  const { users, scheduler } = params;
  const now = new Date();
  (
    scheduler as unknown as {
      config: { enabled: boolean; intervalDays: number };
    }
  ).config = {
    enabled: true,
    intervalDays: 1,
  };

  for (const user of users.slice(0, 5)) {
    await insertOnDemandAsk({
      userId: user.userId,
      term: 'fixture sudden sushi',
      reason: OnDemandReason.unresolved,
      askedAt: daysAgo(0.2),
    });
  }
  for (const user of users.slice(0, 5)) {
    await insertOnDemandAsk({
      userId: user.userId,
      term: 'fixture evergreen tacos',
      reason: OnDemandReason.unresolved,
      askedAt: daysAgo(0.2),
    });
    await insertOnDemandAsk({
      userId: user.userId,
      term: 'fixture evergreen tacos',
      reason: OnDemandReason.unresolved,
      askedAt: daysAgo(1.2),
    });
  }
  for (let index = 0; index < 8; index += 1) {
    await insertOnDemandAsk({
      userId: users[8].userId,
      term: 'fixture one power user',
      reason: OnDemandReason.unresolved,
      askedAt: new Date(now.getTime() - (index + 1) * 60 * 60 * 1000),
    });
  }
  for (const user of users.slice(0, 12)) {
    await insertOnDemandAsk({
      userId: user.userId,
      term: 'fixture recovered no results',
      reason: OnDemandReason.unresolved,
      askedAt: daysAgo(0.1),
    });
  }
  for (const user of users.slice(12, 22)) {
    await insertOnDemandAsk({
      userId: user.userId,
      term: 'fixture second same market spike',
      reason: OnDemandReason.unresolved,
      askedAt: daysAgo(0.1),
    });
  }
  await prisma.keywordAttemptHistory.upsert({
    where: {
      collectableMarketKey_normalizedTerm: {
        collectableMarketKey,
        normalizedTerm: 'fixture recovered no results',
      },
    },
    create: {
      collectableMarketKey,
      normalizedTerm: 'fixture recovered no results',
      lastAttemptAt: daysAgo(30),
      lastOutcome: KeywordAttemptOutcome.no_results,
    },
    update: {
      lastAttemptAt: daysAgo(30),
      lastOutcome: KeywordAttemptOutcome.no_results,
      cooldownUntil: null,
    },
  });

  (scheduler as unknown as { schedules: Map<string, unknown> }).schedules.set(
    collectableMarketKey,
    {
      subreddit: 'austinfood',
      collectableMarketKey,
      safeIntervalDays: 60,
      scheduledDate: now,
      terms: [],
      sortPlan: [],
      status: 'pending',
      nextRun: now,
    },
  );

  const selected = await scheduler.findHotSpikeCandidates();
  const latestRun = await prisma.demandScoringRun.findFirst({
    where: {
      consumerKind: DemandScoringConsumerKind.on_demand,
      startedAt: { gte: daysAgo(0.01) },
    },
    orderBy: { startedAt: 'desc' },
    select: { runId: true },
  });
  const traces = latestRun
    ? await prisma.demandScoringCandidate.findMany({
        where: { runId: latestRun.runId },
        orderBy: [{ finalScore: 'desc' }, { createdAt: 'asc' }],
      })
    : [];
  const observedOrder = traces.map((candidate) => candidate.subjectKey);
  const expectedTop = 'fixture second same market spike';
  const expectedContains = [
    'fixture recovered no results',
    'fixture second same market spike',
    'fixture sudden sushi',
    'fixture evergreen tacos',
    'fixture one power user',
  ];
  const observed = {
    selected: selected.map((candidate) => ({
      term: candidate.normalizedTerm,
      priorityScore: Number(candidate.priorityScore.toFixed(4)),
      trendBoost: Number(candidate.trendBoost.toFixed(4)),
      attemptAvailability: Number(candidate.attemptAvailability.toFixed(4)),
    })),
    tracedRanking: traces.map((candidate) => ({
      term: candidate.subjectKey,
      finalScore: candidate.finalScore,
      selected: candidate.selected,
      lane: candidate.lane,
      factors: candidate.factorBreakdown,
    })),
  };
  const ok =
    observedOrder[0] === expectedTop &&
    expectedContains.every((term) => observedOrder.includes(term)) &&
    observedOrder.indexOf('fixture recovered no results') <
      observedOrder.indexOf('fixture sudden sushi') &&
    selected.filter(
      (candidate) => candidate.collectableMarketKey === collectableMarketKey,
    ).length >= 2;
  return (ok ? pass : fail)(
    'on-demand hot spike: trend boost and no-results recovery rank urgent renewed demand',
    {
      top: expectedTop,
      contains: expectedContains,
      recoveredNoResultsBeforePlainFiveUserDemand: true,
      sameMarketSelectedAtLeast: 2,
    },
    observed,
  );
}

async function runTraceAllRetentionFixture(
  scoringTrace: DemandScoringTraceService,
): Promise<FixtureCheck> {
  const previous = process.env.DEMAND_SCORING_TRACE_ALL_CANDIDATES;
  process.env.DEMAND_SCORING_TRACE_ALL_CANDIDATES = 'true';
  try {
    const keywordSelection = new KeywordSliceSelectionService(
      prisma as never,
      {
        resolveMarketKeyForCommunity: async () => collectableMarketKey,
      } as never,
      scoringTrace,
      noopLogger as never,
    );
    const candidatesBySlice = {
      unmet: Array.from({ length: 8 }, (_, index) => ({
        term: `fixture trace unmet ${index}`,
        normalizedTerm: `fixture trace unmet ${index}`,
        slice: 'unmet' as const,
        score: 10 - index,
      })),
      refresh: [],
      demand: [],
      explore: [],
    };
    const gateRejects = [
      {
        candidate: {
          term: 'restaurants',
          normalizedTerm: 'restaurants',
          slice: 'unmet' as const,
          score: 1,
        },
        decisionState: DemandScoringDecisionState.gate_reject,
        decisionReason: 'generic_only_keyword',
      },
    ];
    const selected = candidatesBySlice.unmet.slice(0, 1);
    const traceStartedAt = new Date();
    await (
      keywordSelection as unknown as {
        traceKeywordSelection(input: {
          collectableMarketKey: string;
          cycleStartAt: Date;
          cycleEndAt: Date;
          candidatesBySlice: typeof candidatesBySlice;
          gateRejects?: typeof gateRejects;
          selected: typeof selected;
          maxTerms: number;
        }): Promise<void>;
      }
    ).traceKeywordSelection({
      collectableMarketKey,
      cycleStartAt: daysAgo(30),
      cycleEndAt: new Date(),
      candidatesBySlice,
      gateRejects,
      selected,
      maxTerms: 1,
    });
    const run = await prisma.demandScoringRun.findFirstOrThrow({
      where: {
        consumerKind: DemandScoringConsumerKind.keyword_collection,
        startedAt: { gte: traceStartedAt },
      },
      orderBy: { startedAt: 'desc' },
    });
    const beforePruneRows = await prisma.demandScoringCandidate.findMany({
      where: { runId: run.runId },
      select: { selected: true, factorBreakdown: true },
    });
    const gateRejectRows = await prisma.demandScoringCandidate.findMany({
      where: {
        runId: run.runId,
        decisionState: DemandScoringDecisionState.gate_reject,
      },
      select: { decisionReason: true },
    });

    await prisma.demandScoringRun.update({
      where: { runId: run.runId },
      data: { startedAt: daysAgo(20) },
    });
    const previousRetention = process.env.DEMAND_SCORING_TRACE_RETENTION_DAYS;
    const previousAllRetention =
      process.env.DEMAND_SCORING_TRACE_ALL_RETENTION_DAYS;
    process.env.DEMAND_SCORING_TRACE_RETENTION_DAYS = '180';
    process.env.DEMAND_SCORING_TRACE_ALL_RETENTION_DAYS = '14';
    await scoringTrace.pruneOldTraces();
    if (previousRetention === undefined) {
      delete process.env.DEMAND_SCORING_TRACE_RETENTION_DAYS;
    } else {
      process.env.DEMAND_SCORING_TRACE_RETENTION_DAYS = previousRetention;
    }
    if (previousAllRetention === undefined) {
      delete process.env.DEMAND_SCORING_TRACE_ALL_RETENTION_DAYS;
    } else {
      process.env.DEMAND_SCORING_TRACE_ALL_RETENTION_DAYS =
        previousAllRetention;
    }
    const afterPruneRows = await prisma.demandScoringCandidate.findMany({
      where: { runId: run.runId },
      select: { selected: true, factorBreakdown: true },
    });
    const runAfterPrune = await prisma.demandScoringRun.findUnique({
      where: { runId: run.runId },
      select: { runId: true },
    });
    const previousFullRetention =
      process.env.DEMAND_SCORING_TRACE_RETENTION_DAYS;
    const previousFullAllRetention =
      process.env.DEMAND_SCORING_TRACE_ALL_RETENTION_DAYS;
    process.env.DEMAND_SCORING_TRACE_RETENTION_DAYS = '180';
    process.env.DEMAND_SCORING_TRACE_ALL_RETENTION_DAYS = '14';
    await prisma.demandScoringRun.update({
      where: { runId: run.runId },
      data: { startedAt: daysAgo(181) },
    });
    await scoringTrace.pruneOldTraces();
    if (previousFullRetention === undefined) {
      delete process.env.DEMAND_SCORING_TRACE_RETENTION_DAYS;
    } else {
      process.env.DEMAND_SCORING_TRACE_RETENTION_DAYS = previousFullRetention;
    }
    if (previousFullAllRetention === undefined) {
      delete process.env.DEMAND_SCORING_TRACE_ALL_RETENTION_DAYS;
    } else {
      process.env.DEMAND_SCORING_TRACE_ALL_RETENTION_DAYS =
        previousFullAllRetention;
    }
    const runAfterFullPrune = await prisma.demandScoringRun.findUnique({
      where: { runId: run.runId },
      select: { runId: true },
    });
    const candidatesAfterFullPrune = await prisma.demandScoringCandidate.count({
      where: { runId: run.runId },
    });
    const debugRowCount = (rows: typeof beforePruneRows) =>
      rows.filter(
        (row) =>
          !row.selected &&
          row.factorBreakdown &&
          typeof row.factorBreakdown === 'object' &&
          !Array.isArray(row.factorBreakdown) &&
          (row.factorBreakdown as Record<string, unknown>).traceScope ===
            'all_candidate',
      ).length;
    const observed = {
      beforePruneRows: beforePruneRows.length,
      beforePruneDebugRows: debugRowCount(beforePruneRows),
      afterPruneRows: afterPruneRows.length,
      afterPruneDebugRows: debugRowCount(afterPruneRows),
      selectedRowsAfterPrune: afterPruneRows.filter((row) => row.selected)
        .length,
      gateRejectReasons: gateRejectRows.map((row) => row.decisionReason),
      runRetained: Boolean(runAfterPrune),
      runDeletedAfterFullRetention: !runAfterFullPrune,
      candidatesAfterFullPrune,
    };
    const ok =
      beforePruneRows.length === 9 &&
      debugRowCount(beforePruneRows) === 2 &&
      gateRejectRows.some(
        (row) => row.decisionReason === 'generic_only_keyword',
      ) &&
      Boolean(runAfterPrune) &&
      afterPruneRows.filter((row) => row.selected).length === 1 &&
      debugRowCount(afterPruneRows) === 0 &&
      !runAfterFullPrune &&
      candidatesAfterFullPrune === 0;
    return (ok ? pass : fail)(
      'score traces: trace-all captures expanded candidates but prunes debug-only rows first',
      {
        beforePruneRows: 9,
        beforePruneDebugRows: 2,
        gateRejectReason: 'generic_only_keyword',
        selectedRowsAfterPrune: 1,
        afterPruneDebugRows: 0,
        runRetained: true,
        runDeletedAfterFullRetention: true,
        candidatesAfterFullPrune: 0,
      },
      observed,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.DEMAND_SCORING_TRACE_ALL_CANDIDATES;
    } else {
      process.env.DEMAND_SCORING_TRACE_ALL_CANDIDATES = previous;
    }
  }
}

async function runOnDemandAdversarialFixture(params: {
  scheduler: KeywordSearchSchedulerService;
  users: FixtureUser[];
}): Promise<FixtureCheck> {
  const { users, scheduler } = params;
  const now = new Date();
  (
    scheduler as unknown as {
      config: { enabled: boolean; intervalDays: number };
    }
  ).config = {
    enabled: true,
    intervalDays: 1,
  };
  const insertAsk = async (input: {
    user: FixtureUser;
    term: string;
    askedAt: Date;
    reason?: OnDemandReason;
    resultRestaurantCount?: number | null;
    resultFoodCount?: number | null;
  }) =>
    insertOnDemandAsk({
      userId: input.user.userId,
      term: input.term,
      reason: input.reason ?? OnDemandReason.unresolved,
      askedAt: input.askedAt,
      collectableMarketKey: onDemandAdversarialCollectableMarketKey,
      resultRestaurantCount: input.resultRestaurantCount,
      resultFoodCount: input.resultFoodCount,
    });

  for (const user of users.slice(0, 18)) {
    await insertAsk({
      user,
      term: 'fixture broad unmet ramen',
      askedAt: daysAgo(0.1),
    });
  }
  for (const user of users.slice(18, 27)) {
    await insertAsk({
      user,
      term: 'fixture empty low result pho',
      askedAt: daysAgo(0.1),
      reason: OnDemandReason.low_result,
      resultRestaurantCount: 0,
      resultFoodCount: 0,
    });
  }
  for (const user of users.slice(27, 45)) {
    await insertAsk({
      user,
      term: 'fixture almost enough patios',
      askedAt: daysAgo(0.1),
      reason: OnDemandReason.low_result,
      resultRestaurantCount: 23,
      resultFoodCount: 0,
    });
  }
  for (const user of users.slice(72, 80)) {
    await insertAsk({
      user,
      term: 'fixture poor restaurant rich food',
      askedAt: daysAgo(0.1),
      reason: OnDemandReason.low_result,
      resultRestaurantCount: 0,
      resultFoodCount: 23,
    });
  }
  for (let repeat = 0; repeat < 12; repeat += 1) {
    await insertAsk({
      user: users[45 + (repeat % 2)],
      term: 'fixture two power users bao',
      askedAt: new Date(now.getTime() - (repeat + 1) * 45 * 60 * 1000),
    });
  }
  for (const user of users.slice(47, 72)) {
    await insertAsk({
      user,
      term: 'fixture immediate retry no results',
      askedAt: daysAgo(0.05),
    });
  }
  for (const user of users.slice(0, 14)) {
    await insertAsk({
      user,
      term: 'fixture recovered retry no results',
      askedAt: daysAgo(0.05),
    });
  }
  for (const user of users.slice(0, 8)) {
    await insertAsk({
      user,
      term: 'fixture steady baseline dumplings',
      askedAt: daysAgo(0.05),
    });
    await insertAsk({
      user,
      term: 'fixture steady baseline dumplings',
      askedAt: daysAgo(1.2),
    });
  }
  for (const user of users.slice(8, 12)) {
    await insertAsk({
      user,
      term: 'fixture just attempted no results',
      askedAt: daysAgo(0.02),
    });
  }

  await prisma.keywordAttemptHistory.createMany({
    data: [
      {
        collectableMarketKey: onDemandAdversarialCollectableMarketKey,
        normalizedTerm: 'fixture just attempted no results',
        lastAttemptAt: now,
        lastOutcome: KeywordAttemptOutcome.no_results,
      },
      {
        collectableMarketKey: onDemandAdversarialCollectableMarketKey,
        normalizedTerm: 'fixture immediate retry no results',
        lastAttemptAt: daysAgo(7),
        lastOutcome: KeywordAttemptOutcome.no_results,
      },
      {
        collectableMarketKey: onDemandAdversarialCollectableMarketKey,
        normalizedTerm: 'fixture recovered retry no results',
        lastAttemptAt: daysAgo(45),
        lastOutcome: KeywordAttemptOutcome.no_results,
      },
    ],
    skipDuplicates: true,
  });

  (scheduler as unknown as { schedules: Map<string, unknown> }).schedules.set(
    onDemandAdversarialCollectableMarketKey,
    {
      subreddit: 'fixturefood',
      collectableMarketKey: onDemandAdversarialCollectableMarketKey,
      safeIntervalDays: 60,
      scheduledDate: now,
      terms: [],
      sortPlan: [],
      status: 'pending',
      nextRun: now,
    },
  );

  const traceStartedAt = new Date();
  const selected = await scheduler.findHotSpikeCandidates();
  const traces = await prisma.demandScoringCandidate.findMany({
    where: {
      consumerKind: DemandScoringConsumerKind.on_demand,
      collectableMarketKey: onDemandAdversarialCollectableMarketKey,
      createdAt: { gte: traceStartedAt },
    },
    orderBy: [{ finalScore: 'desc' }, { createdAt: 'asc' }],
  });
  const traceByTerm = new Map(traces.map((trace) => [trace.subjectKey, trace]));
  const selectedTerms = new Set(
    selected.map((candidate) => candidate.normalizedTerm),
  );
  const score = (term: string) => traceByTerm.get(term)?.finalScore ?? 0;
  const decisionState = (term: string) =>
    traceByTerm.get(term)?.decisionState ?? null;
  const factors = (term: string) =>
    (traceByTerm.get(term)?.factorBreakdown ?? {}) as Record<string, unknown>;
  const attemptAvailability = (term: string) => {
    const value = factors(term).attemptAvailability;
    return typeof value === 'number' ? value : 1;
  };
  const observed = {
    selected: selected
      .filter(
        (candidate) =>
          candidate.collectableMarketKey ===
          onDemandAdversarialCollectableMarketKey,
      )
      .map((candidate) => ({
        term: candidate.normalizedTerm,
        priorityScore: round(candidate.priorityScore),
        trendBoost: round(candidate.trendBoost),
        attemptAvailability: round(candidate.attemptAvailability),
      })),
    ranking: traces.map((trace) => ({
      term: trace.subjectKey,
      finalScore: trace.finalScore === null ? null : round(trace.finalScore),
      selected: trace.selected,
      decisionState: trace.decisionState,
      decisionReason: trace.decisionReason,
      lane: trace.lane,
      baseScore24h:
        typeof (trace.factorBreakdown as Record<string, unknown>)
          .baseScore24h === 'number'
          ? round(
              (trace.factorBreakdown as Record<string, number>).baseScore24h,
            )
          : null,
      trendBoost:
        typeof (trace.factorBreakdown as Record<string, unknown>).trendBoost ===
        'number'
          ? round((trace.factorBreakdown as Record<string, number>).trendBoost)
          : null,
      attemptAvailability:
        typeof (trace.factorBreakdown as Record<string, unknown>)
          .attemptAvailability === 'number'
          ? round(
              (trace.factorBreakdown as Record<string, number>)
                .attemptAvailability,
            )
          : null,
    })),
  };
  const ok =
    score('fixture recovered retry no results') >
      score('fixture immediate retry no results') &&
    attemptAvailability('fixture recovered retry no results') >
      attemptAvailability('fixture immediate retry no results') &&
    score('fixture broad unmet ramen') > score('fixture two power users bao') &&
    !selectedTerms.has('fixture just attempted no results') &&
    score('fixture just attempted no results') === 0 &&
    decisionState('fixture just attempted no results') ===
      DemandScoringDecisionState.gate_reject &&
    score('fixture empty low result pho') >
      score('fixture poor restaurant rich food') &&
    score('fixture poor restaurant rich food') >
      score('fixture almost enough patios');

  return (ok ? pass : fail)(
    'on-demand adversarial pool: severity, repeat intensity, baseline, trend, and no-results recovery separate urgent work from churn',
    {
      invariants: [
        'Recovered no-results demand is more available than an immediate retry.',
        'A just-attempted no-results term is traced but gate-rejected and cannot consume a job.',
        'Broad unresolved demand outranks two-user repeat intensity.',
        'A true empty low-result case outranks an almost-enough low-result case.',
        'A low-result query with zero restaurants still outranks almost-enough restaurant coverage even if food coverage is high.',
      ],
    },
    observed,
  );
}

async function runQuerySuggestionFixture(params: {
  querySuggestion: SearchQuerySuggestionService;
  users: FixtureUser[];
  entity: PickedEntity;
}): Promise<FixtureCheck> {
  const { users, entity, querySuggestion } = params;
  await insertSearchLog({
    userId: users[0].userId,
    entity,
    queryText: 'fixture lane soba',
    loggedAt: daysAgo(0.1),
    marketKey: suggestionAdversarialMarketKey,
  });
  await insertSearchLog({
    userId: users[0].userId,
    entity,
    queryText: 'fixture lane sashimi',
    loggedAt: daysAgo(0.2),
    marketKey: suggestionAdversarialMarketKey,
  });
  await insertSearchLog({
    userId: users[0].userId,
    entity,
    queryText: 'fixture lane sandwich',
    loggedAt: daysAgo(0.3),
    marketKey: suggestionAdversarialMarketKey,
  });
  for (const user of users.slice(1, 5)) {
    await insertDailyQueryDemand({
      demandDate: daysAgo(0.1),
      userId: user.userId,
      query: 'fixture lane sushi',
      signalCount: 1,
      marketKey: suggestionAdversarialMarketKey,
    });
  }
  const suggestions = await querySuggestion.getSuggestions(
    'fixture lane s',
    4,
    users[0].userId,
    suggestionAdversarialMarketKey,
  );
  const observed = suggestions.map((suggestion) => ({
    text: suggestion.text,
    source: suggestion.source,
    globalCount: suggestion.globalCount,
    userCount: suggestion.userCount,
  }));
  const hasPersonal =
    observed.filter((item) => item.source === 'personal').length >= 3;
  const sushi = observed.find((item) => item.text === 'fixture lane sushi');
  const ok =
    hasPersonal && sushi?.source === 'global' && sushi.globalCount >= 4;
  return (ok ? pass : fail)(
    'query suggestions: personal recents and global demand both survive lane merge',
    {
      atLeastThreePersonal: true,
      globalSushi: { source: 'global', globalCountAtLeast: 4 },
    },
    observed,
  );
}

async function runQuerySuggestionAggregationFixture(params: {
  aggregation: SearchDemandAggregationService;
  querySuggestion: SearchQuerySuggestionService;
  users: FixtureUser[];
  entity: PickedEntity;
}): Promise<FixtureCheck> {
  const today = new Date();
  const todayDay = dateOnly(today);
  for (const [index, user] of params.users.slice(0, 6).entries()) {
    await insertSearchLog({
      userId: user.userId,
      entity: params.entity,
      queryText: 'fixture gyros',
      loggedAt: today,
      marketKey: suggestionAdversarialMarketKey,
      collectableMarketKey,
      searchRequestId: `99999999-9999-4999-8999-${String(index).padStart(12, '0')}`,
      eventKind: SearchLogEventKind.backend,
    });
  }
  for (const [index, user] of params.users.slice(6, 17).entries()) {
    await insertSearchLog({
      userId: user.userId,
      entity: params.entity,
      queryText: 'fixture gelato cache',
      loggedAt: today,
      marketKey: suggestionAdversarialMarketKey,
      collectableMarketKey,
      searchRequestId: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, '0')}`,
      eventKind: SearchLogEventKind.cache,
    });
  }
  for (let index = 0; index < 10; index += 1) {
    await insertSearchLog({
      userId: params.users[17].userId,
      entity: params.entity,
      queryText: 'fixture garlic repeat',
      loggedAt: today,
      marketKey: suggestionAdversarialMarketKey,
      collectableMarketKey,
      searchRequestId: `bbbbbbbb-bbbb-4bbb-8bbb-${String(index).padStart(12, '0')}`,
      eventKind: SearchLogEventKind.backend,
    });
  }

  await params.aggregation.rebuildDateRange({
    startDate: todayDay,
    endDateExclusive: new Date(todayDay.getTime() + MS_PER_DAY),
  });

  const demandRows = await params.aggregation.listQueryDemand({
    since: todayDay,
    normalizedTextPrefix: 'fixture g',
    marketKey: suggestionAdversarialMarketKey,
    scopeMode: 'scoped',
    sourceKinds: [DemandSourceKind.search_log],
    limit: 20,
  });
  const suggestions = await params.querySuggestion.getSuggestions(
    'fixture g',
    5,
    undefined,
    suggestionAdversarialMarketKey,
  );
  const observed = {
    demandRows: demandRows.map((row) => ({
      subjectKey: row.subjectKey,
      distinctUsers: row.distinctUsers,
      signalCount: row.signalCount,
      demandScore: round(row.demandScore),
    })),
    suggestions: suggestions.map((suggestion) => ({
      text: suggestion.text,
      source: suggestion.source,
      globalCount: suggestion.globalCount,
    })),
  };
  const gyros = suggestions.find(
    (suggestion) => suggestion.text === 'fixture gyros',
  );
  const ok =
    gyros?.source === 'global' &&
    gyros.globalCount >= 6 &&
    !suggestions.some(
      (suggestion) => suggestion.text === 'fixture gelato cache',
    ) &&
    !suggestions.some(
      (suggestion) => suggestion.text === 'fixture garlic repeat',
    );

  return (ok ? pass : fail)(
    'query suggestions aggregation: raw backend query logs rebuild into global suggestions while cache-only and one-user repeats stay out',
    {
      includes: ['fixture gyros'],
      excludes: ['fixture gelato cache', 'fixture garlic repeat'],
      gyrosGlobalCountAtLeast: 6,
    },
    observed,
  );
}

async function runQuerySuggestionAdversarialFixture(params: {
  querySuggestion: SearchQuerySuggestionService;
  users: FixtureUser[];
  entity: PickedEntity;
}): Promise<FixtureCheck> {
  const { users, entity, querySuggestion } = params;
  const personalQueries = [
    'soba',
    'sashimi',
    'sandwich',
    'salad',
    'spanish tapas',
    'spicy noodles',
  ];
  for (const [index, queryText] of personalQueries.entries()) {
    await insertSearchLog({
      userId: users[0].userId,
      entity,
      queryText,
      loggedAt: new Date(Date.now() - (index + 1) * 60 * 1000),
      marketKey: suggestionAdversarialMarketKey,
      searchRequestId: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
      eventKind:
        index % 2 === 0 ? SearchLogEventKind.backend : SearchLogEventKind.cache,
    });
  }
  for (const user of users.slice(1, 21)) {
    await insertDailyQueryDemand({
      demandDate: daysAgo(0.1),
      userId: user.userId,
      query: 'sushi',
      signalCount: 1,
      marketKey: suggestionAdversarialMarketKey,
    });
  }
  for (const user of users.slice(21, 32)) {
    await insertDailyQueryDemand({
      demandDate: daysAgo(0.1),
      userId: user.userId,
      query: 'shawarma',
      signalCount: 1,
      marketKey: suggestionAdversarialMarketKey,
    });
  }
  await insertDailyQueryDemand({
    demandDate: daysAgo(0.1),
    userId: users[32].userId,
    query: 'saffron single user',
    signalCount: 80,
    marketKey: suggestionAdversarialMarketKey,
  });
  for (const user of users.slice(33, 53)) {
    await insertDailyQueryDemand({
      demandDate: daysAgo(0.1),
      userId: user.userId,
      query: 'scones cache replay',
      signalCount: 1,
      signalKind: DemandSignalKind.cache,
      marketKey: suggestionAdversarialMarketKey,
    });
  }

  const suggestions = await querySuggestion.getSuggestions(
    's',
    5,
    users[0].userId,
    suggestionAdversarialMarketKey,
  );
  const observed = suggestions.map((suggestion) => ({
    text: suggestion.text,
    source: suggestion.source,
    globalCount: suggestion.globalCount,
    userCount: suggestion.userCount,
  }));
  const personalCount = observed.filter(
    (item) => item.source === 'personal',
  ).length;
  const globalCount = observed.filter(
    (item) => item.source === 'global',
  ).length;
  const ok =
    observed.length <= 5 &&
    personalCount >= 2 &&
    globalCount >= 1 &&
    observed.some(
      (item) => item.text === 'sushi' && item.source === 'global',
    ) &&
    !observed.some((item) => item.text === 'saffron single user') &&
    !observed.some((item) => item.text === 'scones cache replay');

  return (ok ? pass : fail)(
    'query suggestions adversarial merge: personal recency cannot crowd out strong global demand and final list respects limit',
    {
      invariants: [
        'Final suggestions respect the requested limit.',
        'Recent personal matches are represented.',
        'Strong broad community demand still gets at least one slot.',
        'One repeat-heavy global user is not enough for the global lane.',
        'Cache-only global demand does not enter backend-demand query suggestions.',
      ],
    },
    observed,
  );
}

async function runQuerySuggestionFallbackFixture(params: {
  querySuggestion: SearchQuerySuggestionService;
  users: FixtureUser[];
}): Promise<FixtureCheck> {
  const { users, querySuggestion } = params;
  const weakScopedQueries = [
    'fixture fajitas',
    'fixture feta',
    'fixture fish',
    'fixture fries',
    'fixture fondue',
  ];
  for (const [index, query] of weakScopedQueries.entries()) {
    await insertDailyQueryDemand({
      demandDate: daysAgo(0.1),
      userId: users[index].userId,
      query,
      signalCount: 1,
      marketKey: suggestionAdversarialMarketKey,
    });
  }
  for (const user of users.slice(10, 18)) {
    await insertDailyQueryDemand({
      demandDate: daysAgo(0.1),
      userId: user.userId,
      query: 'fixture falafel',
      signalCount: 1,
      marketKey: null,
    });
  }
  await insertDailyQueryDemand({
    demandDate: daysAgo(0.1),
    userId: users[18].userId,
    query: 'fixture fondue weak global',
    signalCount: 1,
    marketKey: null,
  });

  const suggestions = await querySuggestion.getSuggestions(
    'fixture f',
    5,
    undefined,
    suggestionAdversarialMarketKey,
  );
  const observed = suggestions.map((suggestion) => ({
    text: suggestion.text,
    source: suggestion.source,
    globalCount: suggestion.globalCount,
    userCount: suggestion.userCount,
  }));
  const falafel = observed.find((item) => item.text === 'fixture falafel');
  const ok =
    observed.length <= 5 &&
    falafel?.source === 'global' &&
    falafel.globalCount >= 8 &&
    observed.every(
      (item) => item.text === 'fixture falafel' || item.globalCount >= 3,
    ) &&
    !observed.some((item) => item.text === 'fixture fondue weak global');

  return (ok ? pass : fail)(
    'query suggestions fallback: weak scoped rows cannot block strong global fallback',
    {
      invariants: [
        'Sparse market fallback is based on eligible scoped suggestions, not raw scoped row count.',
        'A strong global query can enter when the scoped market only has weak one-user rows.',
        'Weak one-user global fallback rows are not admitted.',
      ],
    },
    observed,
  );
}

async function runServerRecentSearchesFixture(params: {
  users: FixtureUser[];
  entities: {
    sushi: PickedEntity;
    tacos: PickedEntity;
  };
}): Promise<FixtureCheck> {
  const user = params.users[params.users.length - 1];
  const sushiBackendRequestId = randomUUID();
  const tacosBackendRequestId = randomUUID();
  const sushiCacheRequestId = randomUUID();

  await insertSearchLog({
    userId: user.userId,
    entity: params.entities.sushi,
    queryText: 'fixture recent sushi',
    loggedAt: daysAgo(0.6),
    marketKey: fixtureUiMarketA,
    searchRequestId: sushiBackendRequestId,
    eventKind: SearchLogEventKind.backend,
  });
  await insertSearchLog({
    userId: user.userId,
    entity: params.entities.sushi,
    queryText: 'fixture recent sushi',
    loggedAt: daysAgo(0.6),
    marketKey: fixtureUiMarketB,
    searchRequestId: sushiBackendRequestId,
    eventKind: SearchLogEventKind.backend,
  });
  await insertSearchLog({
    userId: user.userId,
    entity: params.entities.tacos,
    queryText: 'fixture recent tacos',
    loggedAt: daysAgo(0.4),
    marketKey: fixtureUiMarketA,
    searchRequestId: tacosBackendRequestId,
    eventKind: SearchLogEventKind.backend,
  });
  await insertSearchLog({
    userId: user.userId,
    entity: params.entities.sushi,
    queryText: 'fixture recent sushi',
    loggedAt: daysAgo(0.2),
    marketKey: fixtureUiMarketA,
    searchRequestId: sushiCacheRequestId,
    eventKind: SearchLogEventKind.cache,
  });
  await insertSearchLog({
    userId: user.userId,
    entity: params.entities.sushi,
    queryText: 'fixture recent sushi',
    loggedAt: daysAgo(0.2),
    marketKey: fixtureUiMarketB,
    searchRequestId: sushiCacheRequestId,
    eventKind: SearchLogEventKind.cache,
  });

  const searchServiceHarness = Object.create(SearchService.prototype) as {
    listRecentSearches: (
      userId: string,
      limit?: number,
    ) => Promise<Array<{ queryText: string; lastSearchedAt: string }>>;
  };
  Object.assign(searchServiceHarness as object, {
    prisma,
    restaurantStatusService: { getStatusPreviews: async () => [] },
  });
  const recents = await searchServiceHarness.listRecentSearches(
    user.userId,
    10,
  );
  const fixtureRecents = recents
    .filter((entry) => entry.queryText.startsWith('fixture recent '))
    .map((entry) => entry.queryText);
  const observed = {
    fixtureRecents,
    sushiCount: fixtureRecents.filter(
      (query) => query === 'fixture recent sushi',
    ).length,
    tacosCount: fixtureRecents.filter(
      (query) => query === 'fixture recent tacos',
    ).length,
  };
  const ok =
    observed.sushiCount === 1 &&
    observed.tacosCount === 1 &&
    fixtureRecents[0] === 'fixture recent sushi' &&
    fixtureRecents[1] === 'fixture recent tacos';

  return (ok ? pass : fail)(
    'server recents: cache rerun moves query to top while fanned attribution rows dedupe by event/query identity',
    {
      order: ['fixture recent sushi', 'fixture recent tacos'],
      duplicateQueries: false,
    },
    observed,
  );
}

async function runViewFavoriteGlobalBoundaryFixture(params: {
  aggregation: SearchDemandAggregationService;
  users: FixtureUser[];
  entities: {
    restaurantView: PickedEntity;
    favorite: PickedEntity;
  };
}): Promise<FixtureCheck> {
  const viewedAt = daysAgo(0.2);
  const occurredAt = daysAgo(0.2);
  await prisma.userEntityViewEvent.create({
    data: {
      userId: params.users[1].userId,
      entityId: params.entities.restaurantView.entityId,
      entityType: EntityType.restaurant,
      eventCount: 3,
      source: 'fixture',
      viewedAt,
      metadata: fixtureMarker,
    },
  });
  await prisma.userFavoriteEvent.create({
    data: {
      userId: params.users[2].userId,
      entityId: params.entities.favorite.entityId,
      entityType: params.entities.favorite.type,
      eventKind: FavoriteEventKind.added,
      occurredAt,
      metadata: fixtureMarker,
    },
  });
  await params.aggregation.rebuildDateRange({
    startDate: dateOnly(daysAgo(1)),
    endDateExclusive: dateOnly(daysFromNow(1)),
  });

  const globalRows = await params.aggregation.listEntityDemand({
    since: daysAgo(1),
    until: daysFromNow(1),
    scopeMode: 'global',
    entityIds: [
      params.entities.restaurantView.entityId,
      params.entities.favorite.entityId,
    ],
    sourceKinds: [DemandSourceKind.restaurant_view, DemandSourceKind.favorite],
    signalKinds: [DemandSignalKind.restaurant_view, DemandSignalKind.favorite],
    limit: 10,
  });
  const collectableRows = await params.aggregation.listEntityDemand({
    since: daysAgo(1),
    until: daysFromNow(1),
    collectableMarketKey,
    entityIds: [
      params.entities.restaurantView.entityId,
      params.entities.favorite.entityId,
    ],
    sourceKinds: [DemandSourceKind.restaurant_view, DemandSourceKind.favorite],
    signalKinds: [DemandSignalKind.restaurant_view, DemandSignalKind.favorite],
    limit: 10,
  });
  const observed = {
    globalRows: globalRows.map((row) => ({
      entityId: row.entityId,
      signalCount: row.signalCount,
      marketKey: row.marketKey,
      collectableMarketKey: row.collectableMarketKey,
    })),
    collectableRows: collectableRows.length,
  };
  const ok =
    globalRows.some(
      (row) =>
        row.entityId === params.entities.restaurantView.entityId &&
        row.marketKey === null &&
        row.collectableMarketKey === null,
    ) &&
    globalRows.some(
      (row) =>
        row.entityId === params.entities.favorite.entityId &&
        row.marketKey === null &&
        row.collectableMarketKey === null,
    ) &&
    collectableRows.length === 0;

  return (ok ? pass : fail)(
    'view/favorite demand: append-only app-intent events aggregate globally and do not leak into collectable keyword scope',
    {
      globalSignals: ['restaurant_view', 'favorite'],
      collectableRows: 0,
    },
    observed,
  );
}

async function runAttributeAutocompleteFixture(params: {
  aggregation: SearchDemandAggregationService;
  users: FixtureUser[];
  supportedAttribute: PickedEntity;
}): Promise<FixtureCheck> {
  const autocompleteHarness = Object.create(AutocompleteService.prototype) as {
    loadAttributeSupport: (
      matches: Array<{
        entityId: string;
        entityType: EntityType;
        name: string;
        confidence: number;
        aliases: string[];
        matchType: 'entity';
      }>,
      marketKey: string | null,
    ) => Promise<
      Map<
        string,
        {
          typedSearchSupport: number;
          autocompleteSelectionSupport: number;
          corpusUsefulness: number;
          rankSupport: number;
          corpusConnectionCount: number;
          corpusSelectivity: number;
        }
      >
    >;
    isStrongAttributeCandidate: (params: {
      match: {
        entityId: string;
        entityType: EntityType;
        name: string;
        confidence: number;
        aliases: string[];
        matchType: 'entity';
      };
      normalizedQuery: string;
      support: {
        typedSearchSupport: number;
        autocompleteSelectionSupport: number;
        corpusUsefulness: number;
        rankSupport: number;
        corpusConnectionCount: number;
        corpusSelectivity: number;
      };
    }) => boolean;
    calculateAttributeScore: (params: {
      confidence: number;
      support: {
        typedSearchSupport: number;
        autocompleteSelectionSupport: number;
        corpusUsefulness: number;
        rankSupport: number;
        corpusConnectionCount: number;
        corpusSelectivity: number;
      };
    }) => number;
    normalizeAttributeCorpusUsefulness: (params: {
      connectionCount: number;
      totalRestaurantCount: number;
    }) => number;
  };
  Object.assign(autocompleteHarness as object, {
    prisma,
    demandAggregation: params.aggregation,
  });

  await insertDailyEntityDemandForUsers({
    demandDate: daysAgo(0.2),
    users: params.users.slice(0, 6),
    entity: params.supportedAttribute,
    signalCount: 1,
    signalKind: DemandSignalKind.backend,
    marketKey: suggestionAdversarialMarketKey,
  });
  await insertDailyEntityDemandForUsers({
    demandDate: daysAgo(0.2),
    users: params.users.slice(6, 8),
    entity: params.supportedAttribute,
    signalCount: 1,
    signalKind: DemandSignalKind.autocomplete_selection,
    marketKey: suggestionAdversarialMarketKey,
  });

  const supportedMatch = {
    entityId: params.supportedAttribute.entityId,
    entityType: params.supportedAttribute.type,
    name: params.supportedAttribute.name,
    confidence: 0.95,
    aliases: [],
    matchType: 'entity' as const,
  };
  const support = await autocompleteHarness.loadAttributeSupport(
    [supportedMatch],
    suggestionAdversarialMarketKey,
  );
  const supportedScore =
    support.get(params.supportedAttribute.entityId) ?? null;
  const supportedAccepted =
    supportedScore !== null &&
    autocompleteHarness.isStrongAttributeCandidate({
      match: supportedMatch,
      normalizedQuery: params.supportedAttribute.name.slice(0, 5),
      support: supportedScore,
    });
  const supportedRankScore = supportedScore
    ? autocompleteHarness.calculateAttributeScore({
        confidence: supportedMatch.confidence,
        support: supportedScore,
      })
    : 0;
  const outOfMarketSupport = await autocompleteHarness.loadAttributeSupport(
    [supportedMatch],
    'locality-fixture-attribute-empty',
  );
  const outOfMarketScore =
    outOfMarketSupport.get(params.supportedAttribute.entityId) ?? null;
  const outOfMarketAccepted =
    outOfMarketScore !== null &&
    autocompleteHarness.isStrongAttributeCandidate({
      match: supportedMatch,
      normalizedQuery: params.supportedAttribute.name.slice(0, 5),
      support: outOfMarketScore,
    });

  const universalCorpusUsefulness =
    autocompleteHarness.normalizeAttributeCorpusUsefulness({
      connectionCount: 1_000,
      totalRestaurantCount: 1_000,
    });
  const coldStartSelectiveUsefulness =
    autocompleteHarness.normalizeAttributeCorpusUsefulness({
      connectionCount: 60,
      totalRestaurantCount: 1_000,
    });
  const broadNoisySupport = {
    typedSearchSupport: 0,
    autocompleteSelectionSupport: 0,
    corpusUsefulness: universalCorpusUsefulness,
    rankSupport: universalCorpusUsefulness * 0.1,
    corpusConnectionCount: 1_000,
    corpusSelectivity: 1,
  };
  const coldStartSupport = {
    typedSearchSupport: 0,
    autocompleteSelectionSupport: 0,
    corpusUsefulness: coldStartSelectiveUsefulness,
    rankSupport: coldStartSelectiveUsefulness * 0.1,
    corpusConnectionCount: 60,
    corpusSelectivity: 0.06,
  };
  const noisyAccepted = autocompleteHarness.isStrongAttributeCandidate({
    match: {
      entityId: '00000000-0000-4000-8000-000000000001',
      entityType: EntityType.restaurant_attribute,
      name: 'fixture noisy universal',
      confidence: 0.99,
      aliases: [],
      matchType: 'entity',
    },
    normalizedQuery: 'great',
    support: broadNoisySupport,
  });
  const coldStartAccepted = autocompleteHarness.isStrongAttributeCandidate({
    match: {
      entityId: '00000000-0000-4000-8000-000000000002',
      entityType: EntityType.restaurant_attribute,
      name: 'fixture selective cold start',
      confidence: 0.99,
      aliases: [],
      matchType: 'entity',
    },
    normalizedQuery: 'patio',
    support: coldStartSupport,
  });

  const observed = {
    supportedAttribute: params.supportedAttribute.name,
    typedSearchSupport: round(supportedScore?.typedSearchSupport ?? 0),
    autocompleteSelectionSupport: round(
      supportedScore?.autocompleteSelectionSupport ?? 0,
    ),
    corpusUsefulness: round(supportedScore?.corpusUsefulness ?? 0),
    rankSupport: round(supportedScore?.rankSupport ?? 0),
    supportedRankScore: round(supportedRankScore),
    supportedAccepted,
    outOfMarket: {
      rankSupport: round(outOfMarketScore?.rankSupport ?? 0),
      corpusConnectionCount: outOfMarketScore?.corpusConnectionCount ?? 0,
      accepted: outOfMarketAccepted,
    },
    noisyUniversal: {
      corpusUsefulness: round(universalCorpusUsefulness),
      rankSupport: round(broadNoisySupport.rankSupport),
      accepted: noisyAccepted,
    },
    coldStartSelective: {
      corpusUsefulness: round(coldStartSelectiveUsefulness),
      rankSupport: round(coldStartSupport.rankSupport),
      accepted: coldStartAccepted,
    },
  };
  const ok =
    supportedAccepted &&
    supportedRankScore > 0.75 &&
    !outOfMarketAccepted &&
    (outOfMarketScore?.rankSupport ?? 0) === 0 &&
    !noisyAccepted &&
    coldStartAccepted;

  return (ok ? pass : fail)(
    'autocomplete attributes: user-intent support wins, universal noisy corpus is suppressed, selective corpus can cold-start',
    {
      invariants: [
        'Typed searches anchor attribute support.',
        'Autocomplete selections validate and boost attribute support.',
        'A market without scoped demand or corpus support cannot borrow global corpus-only attribute strength.',
        'Corpus breadth alone is not enough when selectivity says the attribute is universal/noisy.',
        'A selective corpus signal can cold-start an exact attribute without an exception list.',
      ],
    },
    observed,
  );
}

async function runAutocompleteExecutionContractFixture(
  selectedAttribute: PickedEntity,
): Promise<FixtureCheck> {
  const textSearch = new EntityTextSearchService(
    prisma as never,
    noopLogger as never,
  );
  let capturedPhoneticOption: unknown = null;
  const originalSearchEntitiesForTerms =
    textSearch.searchEntitiesForTerms.bind(textSearch);
  textSearch.searchEntitiesForTerms = (async (
    terms: string[],
    entityTypes: EntityType[],
    perTermLimit: number,
    options?: { marketKey?: string | null; allowPhonetic?: boolean },
  ) => {
    capturedPhoneticOption = options?.allowPhonetic;
    return new Map(terms.map((term) => [term, []]));
  }) as EntityTextSearchService['searchEntitiesForTerms'];
  await textSearch.searchEntities(
    'fixture phonetic off',
    [EntityType.food],
    5,
    { allowPhonetic: false },
  );
  textSearch.searchEntitiesForTerms = originalSearchEntitiesForTerms;
  const prefixTerm = selectedAttribute.name.slice(0, 3).toLowerCase();
  const prefixMatches = await textSearch.searchAttributeAutocompleteEntities(
    prefixTerm,
    [selectedAttribute.type],
    10,
  );

  let interpretationCalled = false;
  let capturedSearchRequest: {
    entities?: unknown;
    submissionSource?: string;
  } | null = null;
  const orchestration = new SearchOrchestrationService(
    {
      interpret: async () => {
        interpretationCalled = true;
        throw new Error('selected entity fixture should bypass interpretation');
      },
    } as never,
    {
      runQuery: async (request: {
        entities?: unknown;
        submissionSource?: string;
      }) => {
        capturedSearchRequest = request;
        return {
          dishes: [],
          restaurants: [],
          metadata: {
            searchRequestId: '22222222-2222-4222-8222-222222222222',
            totalRestaurantResults: 0,
            totalFoodResults: 0,
            queryExecutionTimeMs: 0,
            resultCoverageStatus: 'full',
          },
        };
      },
    } as never,
    noopLogger as never,
  );
  await orchestration.runNaturalQuery({
    query: 'best',
    compactResponse: true,
    submissionSource: 'autocomplete',
    submissionContext: {
      typedPrefix: 'b',
      matchType: 'entity',
      selectedEntityId: selectedAttribute.entityId,
      selectedEntityType: selectedAttribute.type,
    },
  });

  const searchRequest = capturedSearchRequest as {
    entities?: {
      restaurantAttributes?: Array<{ entityIds?: string[] }>;
      foodAttributes?: Array<{ entityIds?: string[] }>;
    };
    submissionSource?: string;
  } | null;
  const selectedIds = [
    ...(searchRequest?.entities?.restaurantAttributes?.flatMap(
      (entry) => entry.entityIds ?? [],
    ) ?? []),
    ...(searchRequest?.entities?.foodAttributes?.flatMap(
      (entry) => entry.entityIds ?? [],
    ) ?? []),
  ];
  const searchServiceHarness = Object.create(SearchService.prototype) as {
    onDemandMinResults: number;
    shouldTriggerOnDemand: (
      request: {
        entities: {
          food?: Array<{ entityIds: string[] }>;
          foodAttributes?: Array<{ entityIds: string[] }>;
          restaurantAttributes?: Array<{ entityIds: string[] }>;
          restaurants?: Array<{ entityIds: string[] }>;
        };
      },
      format: 'dual_list',
      restaurantCount: number,
    ) => boolean;
  };
  searchServiceHarness.onDemandMinResults = 25;
  const selectedRestaurantAttributeTriggersLowResult =
    searchServiceHarness.shouldTriggerOnDemand(
      {
        entities: {
          restaurantAttributes: [{ entityIds: [selectedAttribute.entityId] }],
        },
      },
      'dual_list',
      0,
    );
  const selectedRestaurantDoesNotTriggerLowResult =
    searchServiceHarness.shouldTriggerOnDemand(
      {
        entities: {
          restaurants: [{ entityIds: [selectedAttribute.entityId] }],
        },
      },
      'dual_list',
      0,
    );

  const observed = {
    phoneticOptionPropagated: capturedPhoneticOption,
    prefixTerm,
    prefixMatchIds: prefixMatches.map((match) => match.entityId),
    interpretationCalled,
    selectedSubmissionSource: searchRequest?.submissionSource ?? null,
    selectedIds,
    selectedRestaurantAttributeTriggersLowResult,
    selectedRestaurantDoesNotTriggerLowResult,
  };
  const ok =
    capturedPhoneticOption === false &&
    prefixMatches.some(
      (match) => match.entityId === selectedAttribute.entityId,
    ) &&
    interpretationCalled === false &&
    searchRequest?.submissionSource === 'autocomplete' &&
    selectedIds.length === 1 &&
    selectedIds[0] === selectedAttribute.entityId &&
    selectedRestaurantAttributeTriggersLowResult &&
    !selectedRestaurantDoesNotTriggerLowResult;

  return (ok ? pass : fail)(
    'autocomplete execution contract: phonetic-off propagates and selected entity bypasses generic/LLM routing',
    {
      invariants: [
        'Autocomplete entity text search propagates allowPhonetic=false into the shared text-search profile.',
        'Autocomplete attribute text search treats longer prefixes as eligible lexical evidence.',
        'A selected entity submit executes the selected entity id even when the display query is generic-only.',
        'Selected entity submit does not call LLM interpretation.',
        'Restaurant-attribute searches can create low-result coverage demand, while selected restaurants do not.',
      ],
    },
    observed,
  );
}

async function runAutocompletePublicAssemblyFixture(params: {
  users: FixtureUser[];
  entity: PickedEntity;
  supportedAttribute: PickedEntity;
}): Promise<FixtureCheck> {
  for (const user of params.users.slice(0, 6)) {
    await insertDailyEntityDemand({
      demandDate: daysAgo(0.1),
      userId: user.userId,
      entity: params.supportedAttribute,
      signalCount: 1,
      marketKey: null,
      collectableMarketKey: null,
    });
  }

  const redis = {
    get: async () => null,
    set: async () => 'OK',
    del: async () => 1,
  };
  const metrics = {
    getHistogram: () => ({ observe() {} }),
    getCounter: () => ({ inc() {} }),
  };
  const autocomplete = new AutocompleteService(
    noopLogger as never,
    { getOrThrow: () => redis } as never,
    { resolveBatch: async () => ({ resolutionResults: [] }) } as never,
    {
      sanitizeOrThrow: (value: string) => value.trim().toLowerCase(),
    } as never,
    {
      searchEntities: async () => [
        {
          entityId: params.entity.entityId,
          type: params.entity.type,
          name: params.entity.name,
          similarity: 0.98,
        },
      ],
      searchAttributeAutocompleteEntities: async () => [
        {
          entityId: params.supportedAttribute.entityId,
          type: params.supportedAttribute.type,
          name: params.supportedAttribute.name,
          similarity: 0.96,
        },
      ],
    } as never,
    prisma as never,
    {
      getSuggestions: async () => [
        {
          text: 'fixture personal query',
          source: 'personal',
          globalCount: 0,
          userCount: 2,
        },
        {
          text: 'fixture global query',
          source: 'global',
          globalCount: 8,
          userCount: 0,
        },
      ],
    } as never,
    {
      getEntityPopularityScores: async () =>
        new Map([[params.entity.entityId, 5]]),
      getUserEntityAffinity: async () => new Map<string, number>(),
    } as never,
    { getStatusPreviews: async () => [] } as never,
    {
      resolveViewportCoverage: async () => ({
        market: { marketKey },
      }),
    } as never,
    new SearchDemandAggregationService(prisma as never, noopLogger as never),
    metrics as never,
  );

  const response = await autocomplete.autocompleteEntities(
    {
      query: params.supportedAttribute.name.slice(0, 3),
      limit: 5,
    },
    undefined,
  );
  const smallLimitResponse = await autocomplete.autocompleteEntities(
    {
      query: params.supportedAttribute.name.slice(0, 3),
      limit: 3,
    },
    undefined,
  );
  const observed = {
    matchNames: response.matches.map((match) => match.name),
    matchTypes: response.matches.map((match) => match.entityType),
    querySuggestions: response.querySuggestions ?? [],
    smallLimitMatchNames: smallLimitResponse.matches.map((match) => match.name),
    smallLimitQueryCount: smallLimitResponse.matches.filter(
      (match) => match.entityType === 'query',
    ).length,
    normalizedQuery: response.normalizedQuery,
    matchCount: response.matches.length,
  };
  const querySuggestions = response.querySuggestions ?? [];
  const ok =
    response.matches.length <= 5 &&
    response.matches.some(
      (match) => match.entityId === params.entity.entityId,
    ) &&
    response.matches.some(
      (match) => match.entityId === params.supportedAttribute.entityId,
    ) &&
    response.matches.some(
      (match) =>
        match.entityType === 'query' && match.name === 'fixture personal query',
    ) &&
    response.matches.some(
      (match) =>
        match.entityType === 'query' && match.name === 'fixture global query',
    ) &&
    querySuggestions.includes('fixture personal query') &&
    querySuggestions.includes('fixture global query') &&
    smallLimitResponse.matches.length <= 3 &&
    smallLimitResponse.matches.some(
      (match) => match.entityId === params.entity.entityId,
    ) &&
    smallLimitResponse.matches.some(
      (match) =>
        match.entityType === 'query' && match.name === 'fixture personal query',
    ) &&
    smallLimitResponse.matches.some(
      (match) =>
        match.entityType === 'query' && match.name === 'fixture global query',
    );

  return (ok ? pass : fail)(
    'autocomplete public assembly: endpoint response merges entity, attribute, personal query, and global query lanes under limit',
    {
      includesEntity: params.entity.entityId,
      includesAttribute: params.supportedAttribute.entityId,
      includesPersonalQuery: 'fixture personal query',
      includesGlobalQuery: 'fixture global query',
      respectsLimit: 5,
      smallLimitKeepsQueryLanes: true,
    },
    observed,
  );
}

function runServiceWarningFixture(): FixtureCheck {
  const unexpected = serviceWarnings.filter((warning) =>
    ['warn', 'error'].includes(warning.level),
  );
  return (unexpected.length === 0 ? pass : fail)(
    'fixture harness: service warnings/errors stay clean during adversarial scenarios',
    { warnings: 0 },
    {
      warnings: unexpected.length,
      sample: unexpected.slice(-10),
    },
  );
}

async function cleanup(params: {
  users: FixtureUser[];
  touchedEntities: PickedEntity[];
  originalLastPolledAtById: Map<string, Date | null>;
  startedAt: Date;
}): Promise<void> {
  if (keepRows) {
    return;
  }
  const fixtureUserIds = params.users.map((user) => user.userId);
  await prisma.demandScoringRun.deleteMany({
    where: {
      OR: [
        {
          startedAt: { gte: params.startedAt },
          consumerKind: {
            in: [
              DemandScoringConsumerKind.poll_topic,
              DemandScoringConsumerKind.on_demand,
              DemandScoringConsumerKind.keyword_collection,
            ],
          },
        },
        {
          candidates: {
            some: { subjectKey: { startsWith: 'fixture ' } },
          },
        },
      ],
    },
  });
  await prisma.keywordAttemptHistory.deleteMany({
    where: {
      OR: [
        { normalizedTerm: { startsWith: 'fixture ' } },
        { collectableMarketKey: { startsWith: 'region-fixture-' } },
      ],
    },
  });
  const fixtureOnDemandRequestUsers = await prisma.onDemandRequestUser.findMany(
    {
      where: { userId: { in: fixtureUserIds } },
      select: { requestId: true },
    },
  );
  const fixtureOnDemandRequestIds = Array.from(
    new Set(fixtureOnDemandRequestUsers.map((row) => row.requestId)),
  );
  await prisma.onDemandAskEvent.deleteMany({
    where: {
      OR: [
        { metadata: { path: ['fixtureRunId'], equals: fixtureRunId } },
        { userId: { in: fixtureUserIds } },
        { term: { startsWith: 'fixture ' } },
        { collectableMarketKey: { startsWith: 'region-fixture-' } },
      ],
    },
  });
  await prisma.onDemandRequest.deleteMany({
    where: {
      OR: [
        { requestId: { in: fixtureOnDemandRequestIds } },
        { term: { startsWith: 'fixture ' } },
        { marketKey: { startsWith: 'region-fixture-' } },
      ],
    },
  });
  await prisma.userSearchDemandDaily.deleteMany({
    where: {
      OR: [
        { metadata: { path: ['fixtureRunId'], equals: fixtureRunId } },
        { userId: { in: fixtureUserIds } },
        {
          marketKey: {
            in: [
              fixtureUiMarketA,
              fixtureUiMarketB,
              counterfactualMarketKey,
              pollAdversarialMarketKey,
              suggestionAdversarialMarketKey,
            ],
          },
        },
        { collectableMarketKey: { startsWith: 'region-fixture-' } },
      ],
    },
  });
  await prisma.searchLog.deleteMany({
    where: { metadata: { path: ['fixtureRunId'], equals: fixtureRunId } },
  });
  for (const entity of params.touchedEntities) {
    await prisma.entity.update({
      where: { entityId: entity.entityId },
      data: {
        lastPolledAt:
          params.originalLastPolledAtById.get(entity.entityId) ?? null,
      },
    });
  }
  await prisma.user.deleteMany({ where: { userId: { in: fixtureUserIds } } });
}

function renderReport(params: {
  checks: FixtureCheck[];
  pickedEntities: Record<string, PickedEntity>;
  keptRows: boolean;
}): string {
  const passed = params.checks.filter(
    (check) => check.status === 'pass',
  ).length;
  const failed = params.checks.length - passed;
  const lines = [
    '# Demand Scoring Fixture Validation Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Fixture run id: \`${fixtureRunId}\``,
    `Rows kept in DB: \`${params.keptRows ? 'yes' : 'no'}\``,
    '',
    '## Summary',
    '',
    `- Checks passed: ${passed}`,
    `- Checks failed: ${failed}`,
    '',
    '## Behavioral Readout',
    '',
    '- Demand scoring is distinct-user dominant: one extreme repeat user stays below broad cache replay, while repeat-heavy groups still matter.',
    '- Cache attribution is retry-safe: the client must provide a stable reveal id and repeat posts do not inflate cache rows.',
    '- Active user-location searches preserve UI-market demand facts even when they cannot enqueue collectable work without a viewport.',
    '- Cache replay demand is intentionally weaker than backend demand; autocomplete-selection demand is stronger than cache and can compete with older broad backend demand.',
    '- Same-day raw popularity overlays preserve the same per-user log shape as rebuilt daily demand.',
    '- Poll scoring now includes current-day demand in the current-cycle surge window; broad fresh demand wins, while recently polled topics need major renewed demand to compete.',
    '- Poll publishing refreshes/reranks ready topics at launch time, applies market budget, and writes publish-phase traces.',
    '- Scheduled keyword unmet terms use smooth no-results recovery instead of a hard cooldown drop.',
    '- On-demand hot-spike scoring applies a smooth no-results availability multiplier: very hot immediate retries can still compete, and older no-results attempts recover as demand returns.',
    '- Trace-all mode captures expanded debug candidates, prunes debug-only rows first, and still deletes full trace runs after normal retention.',
    '- Query suggestions now use a bounded lane merge: personal recents get representation, global community demand gets representation, and the result respects the requested limit.',
    '- Query suggestions use eligible scoped/global support for sparse-market fallback, so weak local or weak global rows do not block or enter broad suggestions.',
    '- Server recents dedupe fanned attribution rows and allow cache reruns to refresh local/server recent ordering.',
    '- View and favorite events aggregate as global app-intent demand without leaking into collectable keyword scope.',
    '- Attribute autocomplete support is user-intent-first, selection-validated, and suppresses universal noisy corpus signals without exception lists.',
    '- Autocomplete execution propagates phonetic-off text profiles and selected entity submits bypass generic/LLM routing.',
    '- Public autocomplete assembly merges entity, attribute, personal query, and global query lanes while respecting the requested result limit.',
    '',
    '## Existing Entities Used',
    '',
    ...Object.entries(params.pickedEntities).map(
      ([label, entity]) =>
        `- ${label}: ${entity.name} (${entity.type}, ${entity.entityId})`,
    ),
    '',
    '## Scenario Results',
    '',
  ];
  for (const check of params.checks) {
    lines.push(
      `### ${check.status === 'pass' ? 'PASS' : 'FAIL'}: ${check.name}`,
    );
    lines.push('');
    if (check.notes?.length) {
      for (const note of check.notes) {
        lines.push(`- ${note}`);
      }
      lines.push('');
    }
    lines.push('Expected:');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(check.expected, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('Observed:');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(check.observed, null, 2));
    lines.push('```');
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const checks: FixtureCheck[] = [];
  const usedEntityIds = new Set<string>();
  const users = await createFixtureUsers(80);
  const pickedEntities = {
    aggregation: await pickEntity(
      EntityType.food,
      ['sushi', 'bbq', 'breakfast taco'],
      usedEntityIds,
    ),
    pollBroad: await pickEntity(
      EntityType.food,
      ['breakfast taco', 'burger', 'bbq'],
      usedEntityIds,
    ),
    pollPower: await pickEntity(
      EntityType.food,
      ['brisket', 'barbacoa', 'bao'],
      usedEntityIds,
    ),
    pollRecent: await pickEntity(
      EntityType.food,
      ['burger', 'breakfast', 'burrito'],
      usedEntityIds,
    ),
    pollResurgent: await pickEntity(
      EntityType.food,
      ['bbq', 'tacos', 'chinese'],
      usedEntityIds,
    ),
    querySuggestion: await pickEntity(
      EntityType.restaurant,
      ['Sushi Yume', 'Sour Duck Market', 'Stiles Switch BBQ'],
      usedEntityIds,
    ),
    demandBroadBackend: await pickEntity(
      EntityType.food,
      ['tacos', 'burger', 'ramen'],
      usedEntityIds,
    ),
    demandMediumRepeat: await pickEntity(
      EntityType.food,
      ['ramen', 'pho', 'brisket'],
      usedEntityIds,
    ),
    demandSoloPower: await pickEntity(
      EntityType.food,
      ['sushi', 'pizza', 'dumplings'],
      usedEntityIds,
    ),
    demandCacheBroad: await pickEntity(
      EntityType.food,
      ['salad', 'sandwich', 'pasta'],
      usedEntityIds,
    ),
    demandAutocompleteIntent: await pickEntity(
      EntityType.food,
      ['shawarma', 'curry', 'paella'],
      usedEntityIds,
    ),
    demandOlderBroad: await pickEntity(
      EntityType.food,
      ['queso', 'enchiladas', 'noodles'],
      usedEntityIds,
    ),
    pollAdvBroadBackend: await pickEntity(
      EntityType.food,
      ['breakfast tacos', 'chicken', 'steak'],
      usedEntityIds,
    ),
    pollAdvMediumRepeat: await pickEntity(
      EntityType.food,
      ['pozole', 'carnitas', 'ceviche'],
      usedEntityIds,
    ),
    pollAdvSoloPower: await pickEntity(
      EntityType.food,
      ['wings', 'nachos', 'hot pot'],
      usedEntityIds,
    ),
    pollAdvCacheBroad: await pickEntity(
      EntityType.food,
      ['patio', 'happy hour', 'coffee'],
      usedEntityIds,
    ),
    pollAdvAutocompleteIntent: await pickEntity(
      EntityType.food,
      ['cocktails', 'margarita', 'wine'],
      usedEntityIds,
    ),
    pollAdvOlderBroad: await pickEntity(
      EntityType.food,
      ['bbq brisket', 'fried chicken', 'steakhouse'],
      usedEntityIds,
    ),
    pollAdvRecentHuge: await pickEntity(
      EntityType.food,
      ['ice cream', 'dessert', 'donuts'],
      usedEntityIds,
    ),
    pollAdvRecoveredCooldown: await pickEntity(
      EntityType.food,
      ['dim sum', 'dumpling', 'soup'],
      usedEntityIds,
    ),
    attributeAutocompleteIntent: await pickEntity(
      EntityType.restaurant_attribute,
      ['patio', 'outdoor seating', 'happy hour'],
      usedEntityIds,
    ),
  };
  const touchedEntities = [
    pickedEntities.pollBroad,
    pickedEntities.pollPower,
    pickedEntities.pollRecent,
    pickedEntities.pollResurgent,
    pickedEntities.pollAdvBroadBackend,
    pickedEntities.pollAdvMediumRepeat,
    pickedEntities.pollAdvSoloPower,
    pickedEntities.pollAdvCacheBroad,
    pickedEntities.pollAdvAutocompleteIntent,
    pickedEntities.pollAdvOlderBroad,
    pickedEntities.pollAdvRecentHuge,
    pickedEntities.pollAdvRecoveredCooldown,
  ];
  const originalLastPolledAtById = new Map(
    touchedEntities.map((entity) => [entity.entityId, entity.lastPolledAt]),
  );

  try {
    await prisma.entity.update({
      where: { entityId: pickedEntities.pollBroad.entityId },
      data: { lastPolledAt: null },
    });
    await prisma.entity.update({
      where: { entityId: pickedEntities.pollPower.entityId },
      data: { lastPolledAt: null },
    });
    await prisma.entity.update({
      where: { entityId: pickedEntities.pollRecent.entityId },
      data: { lastPolledAt: daysAgo(3) },
    });
    await prisma.entity.update({
      where: { entityId: pickedEntities.pollResurgent.entityId },
      data: { lastPolledAt: daysAgo(30) },
    });
    for (const entity of [
      pickedEntities.pollAdvBroadBackend,
      pickedEntities.pollAdvMediumRepeat,
      pickedEntities.pollAdvSoloPower,
      pickedEntities.pollAdvCacheBroad,
      pickedEntities.pollAdvAutocompleteIntent,
      pickedEntities.pollAdvOlderBroad,
    ]) {
      await prisma.entity.update({
        where: { entityId: entity.entityId },
        data: { lastPolledAt: null },
      });
    }
    await prisma.entity.update({
      where: { entityId: pickedEntities.pollAdvRecentHuge.entityId },
      data: { lastPolledAt: daysAgo(2) },
    });
    await prisma.entity.update({
      where: { entityId: pickedEntities.pollAdvRecoveredCooldown.entityId },
      data: { lastPolledAt: daysAgo(35) },
    });

    const aggregation = new SearchDemandAggregationService(
      prisma as never,
      noopLogger as never,
    );
    const demandService = new SearchDemandService(
      aggregation,
      noopLogger as never,
    );
    const scoringTrace = new DemandScoringTraceService(
      prisma as never,
      noopLogger as never,
    );
    const marketRegistryMock = {
      resolveMarketKeyForCommunity: async () => collectableMarketKey,
      listCommunityMarketTargets: async () => [
        { community: 'austinfood', marketKey: collectableMarketKey },
      ],
    };
    const keywordSelection = new KeywordSliceSelectionService(
      prisma as never,
      marketRegistryMock as never,
      scoringTrace,
      noopLogger as never,
    );
    const keywordScheduler = new KeywordSearchSchedulerService(
      configService,
      prisma as never,
      keywordSelection,
      marketRegistryMock as never,
      scoringTrace,
      noopLogger as never,
    );
    keywordScheduler.onModuleInit();
    const querySuggestion = new SearchQuerySuggestionService(
      aggregation,
      prisma as never,
      noopLogger as never,
    );
    const popularity = new SearchPopularityService(
      aggregation,
      prisma as never,
      noopLogger as never,
    );

    checks.push(
      await runAggregationFixture(
        aggregation,
        users,
        pickedEntities.aggregation,
      ),
    );
    checks.push(
      await runCacheAttributionIdempotencyFixture({
        users,
        entity: pickedEntities.aggregation,
      }),
    );
    checks.push(
      await runCacheAttributionAggregationFixture({
        aggregation,
        users,
        entity: pickedEntities.aggregation,
      }),
    );
    checks.push(
      await runAutocompleteSelectionAggregationFixture({
        aggregation,
        users,
        entity: pickedEntities.aggregation,
      }),
    );
    checks.push(
      await runUserLocationDemandFactFixture({
        users,
        entity: pickedEntities.demandBroadBackend,
      }),
    );
    checks.push(
      await runDemandCurveCounterfactualFixture({
        demandService,
        users,
        entities: {
          broadBackend: pickedEntities.demandBroadBackend,
          mediumRepeat: pickedEntities.demandMediumRepeat,
          soloPower: pickedEntities.demandSoloPower,
          cacheBroad: pickedEntities.demandCacheBroad,
          autocompleteIntent: pickedEntities.demandAutocompleteIntent,
          olderBroad: pickedEntities.demandOlderBroad,
        },
      }),
    );
    checks.push(
      await runFreshPopularityOverlayFixture({
        popularity,
        users,
        entities: {
          broad: pickedEntities.demandBroadBackend,
          power: pickedEntities.demandSoloPower,
          autocompleteSelected: pickedEntities.demandAutocompleteIntent,
          plainBackend: pickedEntities.demandCacheBroad,
        },
      }),
    );
    checks.push(
      await runPollFixture({
        demandService,
        scoringTrace,
        users,
        entities: {
          broad: pickedEntities.pollBroad,
          power: pickedEntities.pollPower,
          recentPoll: pickedEntities.pollRecent,
          resurgent: pickedEntities.pollResurgent,
        },
      }),
    );
    checks.push(
      await runPollAdversarialFixture({
        demandService,
        scoringTrace,
        users,
        entities: {
          broadBackend: pickedEntities.pollAdvBroadBackend,
          mediumRepeat: pickedEntities.pollAdvMediumRepeat,
          soloPower: pickedEntities.pollAdvSoloPower,
          cacheBroad: pickedEntities.pollAdvCacheBroad,
          autocompleteIntent: pickedEntities.pollAdvAutocompleteIntent,
          olderBroad: pickedEntities.pollAdvOlderBroad,
          recentHuge: pickedEntities.pollAdvRecentHuge,
          recoveredCooldown: pickedEntities.pollAdvRecoveredCooldown,
        },
      }),
    );
    checks.push(
      await runPollPublishFixture({
        scoringTrace,
        entities: {
          selected: pickedEntities.pollAdvBroadBackend,
          rejected: pickedEntities.pollAdvMediumRepeat,
        },
      }),
    );
    checks.push(await runKeywordSoftReservationFixture(keywordSelection));
    checks.push(
      await runKeywordLiveLoaderFixture({
        users,
        scoringTrace,
        entities: {
          demand: pickedEntities.demandBroadBackend,
          autocomplete: pickedEntities.demandAutocompleteIntent,
        },
      }),
    );
    checks.push(
      await runKeywordNoResultsRecoveryFixture({
        users,
        scoringTrace,
      }),
    );
    checks.push(
      await runHotSpikeFixture({ scheduler: keywordScheduler, users }),
    );
    checks.push(await runTraceAllRetentionFixture(scoringTrace));
    checks.push(
      await runOnDemandAdversarialFixture({
        scheduler: keywordScheduler,
        users,
      }),
    );
    checks.push(
      await runQuerySuggestionAggregationFixture({
        aggregation,
        querySuggestion,
        users,
        entity: pickedEntities.querySuggestion,
      }),
    );
    checks.push(
      await runQuerySuggestionFixture({
        querySuggestion,
        users,
        entity: pickedEntities.querySuggestion,
      }),
    );
    checks.push(
      await runQuerySuggestionAdversarialFixture({
        querySuggestion,
        users,
        entity: pickedEntities.querySuggestion,
      }),
    );
    checks.push(
      await runQuerySuggestionFallbackFixture({
        querySuggestion,
        users,
      }),
    );
    checks.push(
      await runServerRecentSearchesFixture({
        users,
        entities: {
          sushi: pickedEntities.querySuggestion,
          tacos: pickedEntities.demandBroadBackend,
        },
      }),
    );
    checks.push(
      await runViewFavoriteGlobalBoundaryFixture({
        aggregation,
        users,
        entities: {
          restaurantView: pickedEntities.querySuggestion,
          favorite: pickedEntities.demandBroadBackend,
        },
      }),
    );
    checks.push(
      await runAttributeAutocompleteFixture({
        aggregation,
        users,
        supportedAttribute: pickedEntities.attributeAutocompleteIntent,
      }),
    );
    checks.push(
      await runAutocompleteExecutionContractFixture(
        pickedEntities.attributeAutocompleteIntent,
      ),
    );
    checks.push(
      await runAutocompletePublicAssemblyFixture({
        users,
        entity: pickedEntities.querySuggestion,
        supportedAttribute: pickedEntities.attributeAutocompleteIntent,
      }),
    );
    checks.push(runServiceWarningFixture());
  } finally {
    await cleanup({
      users,
      touchedEntities,
      originalLastPolledAtById,
      startedAt,
    });
  }

  const report = renderReport({
    checks,
    pickedEntities,
    keptRows: keepRows,
  });
  writeFileSync(outputPath, report);

  const failed = checks.filter((check) => check.status === 'fail');
  console.log(
    JSON.stringify(
      {
        ok: failed.length === 0,
        fixtureRunId,
        outputPath,
        passed: checks.length - failed.length,
        failed: failed.length,
        failedChecks: failed.map((check) => check.name),
      },
      null,
      2,
    ),
  );
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
