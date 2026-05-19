import 'dotenv/config';
import { MarketType, Prisma, PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { MarketRegistryService } from '../src/modules/markets/market-registry.service';
import { MarketResolverService } from '../src/modules/markets/market-resolver.service';

type Coordinate = { lat: number; lng: number };
type Bounds = { northEast: Coordinate; southWest: Coordinate };
type FixtureStatus = 'pass' | 'fail';

interface FixtureCheck {
  name: string;
  status: FixtureStatus;
  expected: unknown;
  observed: unknown;
}

type BoundaryFeatureRecord = {
  sourceProvider: string;
  sourceBoundaryId: string;
  sourceBoundaryType: string;
  providerType: string;
  name: string;
  shortName: string | null;
  countryCode: string;
  stateCode: string | null;
};

const prisma = new PrismaClient();
const fixtureRunId = `tomtom-market-fixture-${new Date()
  .toISOString()
  .replace(/[:.]/g, '-')}`;
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const outputPath = outputArg
  ? outputArg.slice('--output='.length)
  : join(
      process.cwd(),
      '..',
      '..',
      'plans',
      'tomtom-market-fixture-validation-report.md',
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

function pass(
  name: string,
  expected: unknown,
  observed: unknown,
): FixtureCheck {
  return { name, status: 'pass', expected, observed };
}

function fail(
  name: string,
  expected: unknown,
  observed: unknown,
): FixtureCheck {
  return { name, status: 'fail', expected, observed };
}

function makeTomTomMock(overrides?: {
  findBoundaryBySourceIdentity?: () => Promise<BoundaryFeatureRecord | null>;
}) {
  const state = {
    bootstrapCalls: [] as Array<{ point: Coordinate; options: unknown }>,
    storedPointCalls: [] as Coordinate[],
    lifecycleEvents: [] as unknown[],
  };
  return {
    state,
    service: {
      bootstrapMunicipalityForPoint: async (
        point: Coordinate,
        options?: unknown,
      ) => {
        state.bootstrapCalls.push({ point, options });
        return null;
      },
      findStoredMunicipalityForPoint: async (point: Coordinate) => {
        state.storedPointCalls.push(point);
        return null;
      },
      findBoundaryBySourceIdentity:
        overrides?.findBoundaryBySourceIdentity ?? (async () => null),
      recordBootstrapLifecycleEvent: async (event: unknown) => {
        state.lifecycleEvents.push(event);
      },
      recordLocalityMarketEnsured: async () => undefined,
    },
  };
}

function buildRegistry(overrides?: {
  findBoundaryBySourceIdentity?: () => Promise<BoundaryFeatureRecord | null>;
}) {
  const tomTom = makeTomTomMock(overrides);
  const resolver = new MarketResolverService(
    prisma as never,
    tomTom.service as never,
    noopLogger as never,
  );
  const registry = new MarketRegistryService(
    prisma as never,
    resolver,
    tomTom.service as never,
    noopLogger as never,
  );
  return { registry, resolver, tomTom };
}

async function loadAustinBoundaryPoint(): Promise<Coordinate | null> {
  const rows = await prisma.$queryRaw<Array<{ lat: number; lng: number }>>(
    Prisma.sql`
      SELECT
        ST_Y((dumped).geom)::float AS lat,
        ST_X((dumped).geom)::float AS lng
      FROM (
        SELECT ST_DumpPoints(ST_Boundary(geometry)) AS dumped
        FROM core_markets
        WHERE market_key = 'region-us-tx-austin'
          AND is_active = true
          AND geometry IS NOT NULL
        LIMIT 1
      ) boundary_points
      LIMIT 1
    `,
  );
  return rows[0] ?? null;
}

async function runCoveredAustinViewportFixture(): Promise<FixtureCheck> {
  const { registry, tomTom } = buildRegistry();
  const bounds: Bounds = {
    southWest: { lat: 30.25, lng: -97.76 },
    northEast: { lat: 30.29, lng: -97.71 },
  };
  const coverage = await registry.resolveViewportCoverage({
    bounds,
    mode: 'search',
    ensureLocalityMarkets: true,
  });
  const observed = {
    status: coverage.status,
    marketKey: coverage.market?.marketKey ?? null,
    collectableMarketKeys: coverage.collectableMarketKeys,
    bootstrapCalls: tomTom.state.bootstrapCalls.length,
    lifecycleEvents: tomTom.state.lifecycleEvents.length,
  };
  const ok =
    coverage.market?.marketKey === 'region-us-tx-austin' &&
    coverage.collectableMarketKeys.includes('region-us-tx-austin') &&
    tomTom.state.bootstrapCalls.length === 0;

  return (ok ? pass : fail)(
    'tomtom market: covered Austin active viewport resolves regional coverage without TomTom bootstrap',
    {
      marketKey: 'region-us-tx-austin',
      bootstrapCalls: 0,
      collectableMarketKeys: ['region-us-tx-austin'],
    },
    observed,
  );
}

async function runPassiveUncoveredViewportFixture(): Promise<FixtureCheck> {
  const { registry, tomTom } = buildRegistry();
  const bounds: Bounds = {
    southWest: { lat: 41.275, lng: -112.05 },
    northEast: { lat: 41.305, lng: -112.01 },
  };
  const coverage = await registry.resolveViewportCoverage({
    bounds,
    mode: 'polls_read',
    ensureLocalityMarkets: false,
  });
  const observed = {
    status: coverage.status,
    marketKey: coverage.market?.marketKey ?? null,
    bootstrapCalls: tomTom.state.bootstrapCalls.length,
    storedPointCalls: tomTom.state.storedPointCalls.length,
  };
  const ok =
    coverage.market === null &&
    tomTom.state.bootstrapCalls.length === 0 &&
    coverage.status === 'no_market';

  return (ok ? pass : fail)(
    'tomtom market: passive uncovered viewport may inspect stored boundaries but never bootstraps',
    {
      status: 'no_market',
      bootstrapCalls: 0,
    },
    observed,
  );
}

async function runBoundaryPointFixture(): Promise<FixtureCheck> {
  const { resolver, tomTom } = buildRegistry();
  const boundaryPoint = await loadAustinBoundaryPoint();
  if (!boundaryPoint) {
    return fail(
      'tomtom market: regional boundary point resolves via ST_Covers',
      { boundaryPoint: 'available', marketKey: 'region-us-tx-austin' },
      { boundaryPoint: null },
    );
  }

  const resolved = await resolver.resolve({
    userLocation: boundaryPoint,
    mode: 'search',
    allowBoundaryBootstrap: true,
  });
  const observed = {
    boundaryPoint,
    status: resolved.status,
    marketKey: resolved.market?.marketKey ?? null,
    bootstrapCalls: tomTom.state.bootstrapCalls.length,
  };
  const ok =
    resolved.market?.marketKey === 'region-us-tx-austin' &&
    tomTom.state.bootstrapCalls.length === 0;

  return (ok ? pass : fail)(
    'tomtom market: regional boundary point resolves via ST_Covers without bootstrap',
    {
      marketKey: 'region-us-tx-austin',
      bootstrapCalls: 0,
    },
    observed,
  );
}

async function runBoundaryRestaurantLocationFilterFixture(): Promise<FixtureCheck> {
  const boundaryPoint = await loadAustinBoundaryPoint();
  if (!boundaryPoint) {
    return fail(
      'tomtom market: active market restaurant filters include boundary locations',
      { boundaryPoint: 'available', coversIncludedCount: 1 },
      { boundaryPoint: null },
    );
  }

  const restaurantRows = await prisma.$queryRaw<Array<{ restaurantId: string }>>(
    Prisma.sql`
      SELECT entity_id AS "restaurantId"
      FROM core_entities
      WHERE type = 'restaurant'
      LIMIT 1
    `,
  );
  const restaurantId = restaurantRows[0]?.restaurantId ?? null;
  if (!restaurantId) {
    return fail(
      'tomtom market: active market restaurant filters include boundary locations',
      { restaurant: 'available', coversIncludedCount: 1 },
      { restaurant: null },
    );
  }

  const googlePlaceId = `fixture-boundary-${fixtureRunId}`;
  try {
    await prisma.$executeRaw`
      INSERT INTO core_restaurant_locations (
        restaurant_id,
        google_place_id,
        latitude,
        longitude,
        address,
        city,
        region,
        country,
        is_primary,
        updated_at
      )
      VALUES (
        ${restaurantId}::uuid,
        ${googlePlaceId},
        ${boundaryPoint.lat},
        ${boundaryPoint.lng},
        'Fixture boundary address',
        'Austin',
        'TX',
        'US',
        false,
        now()
      )
    `;

    const rows = await prisma.$queryRaw<
      Array<{ coversIncludedCount: bigint; containsIncludedCount: bigint }>
    >(Prisma.sql`
      SELECT
        COUNT(*) FILTER (
          WHERE ST_Covers(
            m.geometry,
            ST_SetSRID(
              ST_MakePoint(rl.longitude::double precision, rl.latitude::double precision),
              4326
            )
          )
        )::bigint AS "coversIncludedCount",
        COUNT(*) FILTER (
          WHERE ST_Contains(
            m.geometry,
            ST_SetSRID(
              ST_MakePoint(rl.longitude::double precision, rl.latitude::double precision),
              4326
            )
          )
        )::bigint AS "containsIncludedCount"
      FROM core_restaurant_locations rl
      JOIN core_markets m
        ON m.market_key = 'region-us-tx-austin'
       AND m.is_active = true
       AND m.geometry IS NOT NULL
      WHERE rl.google_place_id = ${googlePlaceId}
    `);
    const observed = {
      boundaryPoint,
      coversIncludedCount: Number(rows[0]?.coversIncludedCount ?? 0),
      containsIncludedCount: Number(rows[0]?.containsIncludedCount ?? 0),
    };
    const ok =
      observed.coversIncludedCount === 1 &&
      observed.containsIncludedCount === 0;
    return (ok ? pass : fail)(
      'tomtom market: active market restaurant filters include boundary locations',
      { coversIncludedCount: 1, containsIncludedCount: 0 },
      observed,
    );
  } finally {
    await prisma.$executeRaw`
      DELETE FROM core_restaurant_locations
      WHERE google_place_id = ${googlePlaceId}
    `;
  }
}

async function runBootstrapRecomputeFixture(): Promise<FixtureCheck> {
  const registry = Object.create(MarketRegistryService.prototype) as {
    resolveViewportCoverage: MarketRegistryService['resolveViewportCoverage'];
    [key: string]: unknown;
  };
  let findCalls = 0;
  let bootstrapCalls = 0;
  const boundary: BoundaryFeatureRecord = {
    sourceProvider: 'tomtom',
    sourceBoundaryId: 'fixture-recompute-boundary',
    sourceBoundaryType: 'Municipality',
    providerType: 'Municipality',
    name: 'Fixture Locality',
    shortName: 'Fixture Locality',
    countryCode: 'US',
    stateCode: 'TX',
  };

  Object.assign(registry, {
    logger: noopLogger,
    findIntersectingMarkets: async () => {
      findCalls += 1;
      if (findCalls === 1) {
        return [];
      }
      return [
        {
          marketKey: 'region-fixture-recomputed',
          marketName: 'Fixture Region',
          marketShortName: 'Fixture Region',
          marketType: MarketType.regional,
          isCollectable: true,
          overlapAreaMeters: 1_000,
        },
        {
          marketKey: 'locality-fixture-recomputed',
          marketName: 'Fixture Locality',
          marketShortName: 'Fixture Locality',
          marketType: MarketType.locality,
          isCollectable: false,
          overlapAreaMeters: 1_000,
        },
      ];
    },
    bootstrapUncoveredBoundaryCandidates: async () => {
      bootstrapCalls += 1;
      return boundary;
    },
    resolveCollectableMarketKeys: async () => ['region-fixture-recomputed'],
  });

  const coverage = await registry.resolveViewportCoverage({
    bounds: {
      southWest: { lat: 30, lng: -98 },
      northEast: { lat: 31, lng: -97 },
    },
    mode: 'search',
    ensureLocalityMarkets: true,
  });
  const observed = {
    findCalls,
    bootstrapCalls,
    status: coverage.status,
    marketKey: coverage.market?.marketKey ?? null,
    marketType: coverage.market?.marketType ?? null,
    collectableMarketKeys: coverage.collectableMarketKeys,
    marketKeys: coverage.markets.map((market) => market.marketKey),
  };
  const ok =
    findCalls === 2 &&
    bootstrapCalls === 1 &&
    coverage.market?.marketKey === 'region-fixture-recomputed' &&
    coverage.status === 'multi_market' &&
    coverage.collectableMarketKeys.includes('region-fixture-recomputed');

  return (ok ? pass : fail)(
    'tomtom market: active bootstrap recomputes coverage and keeps regional tie priority',
    {
      findCalls: 2,
      bootstrapCalls: 1,
      selectedMarketKey: 'region-fixture-recomputed',
      status: 'multi_market',
    },
    observed,
  );
}

async function runInactiveLocalityReactivationFixture(): Promise<FixtureCheck> {
  const sourceBoundaryId = `fixture-reactivation-${fixtureRunId}`;
  const marketKey = `locality-fixture-reactivation-${fixtureRunId.slice(-8)}`;
  const boundary: BoundaryFeatureRecord = {
    sourceProvider: 'tomtom',
    sourceBoundaryId,
    sourceBoundaryType: 'Municipality',
    providerType: 'Municipality',
    name: 'Fixture Reactivation',
    shortName: 'Fixture Reactivation',
    countryCode: 'US',
    stateCode: 'TX',
  };
  const { registry, tomTom } = buildRegistry({
    findBoundaryBySourceIdentity: async () => boundary,
  });

  try {
    await prisma.$executeRaw`
      INSERT INTO geo_boundary_features (
        source_provider,
        source_boundary_id,
        source_boundary_type,
        provider_type,
        name,
        short_name,
        country_code,
        state_code,
        center_latitude,
        center_longitude,
        bbox_ne_latitude,
        bbox_ne_longitude,
        bbox_sw_latitude,
        bbox_sw_longitude,
        geometry,
        metadata,
        updated_at
      )
      VALUES (
        ${boundary.sourceProvider},
        ${boundary.sourceBoundaryId},
        ${boundary.sourceBoundaryType},
        ${boundary.providerType},
        ${boundary.name},
        ${boundary.shortName},
        ${boundary.countryCode},
        ${boundary.stateCode},
        30.15,
        -97.05,
        30.20,
        -97.00,
        30.10,
        -97.10,
        ST_Multi(ST_MakeEnvelope(-97.10, 30.10, -97.00, 30.20, 4326)),
        '{}'::jsonb,
        now()
      )
    `;
    await prisma.$executeRaw`
      INSERT INTO core_markets (
        market_key,
        market_name,
        market_short_name,
        market_type,
        country_code,
        state_code,
        source_boundary_provider,
        source_boundary_id,
        source_boundary_type,
        is_collectable,
        scheduler_enabled,
        is_active,
        center_latitude,
        center_longitude,
        bbox_ne_latitude,
        bbox_ne_longitude,
        bbox_sw_latitude,
        bbox_sw_longitude,
        geometry,
        metadata,
        updated_at
      )
      VALUES (
        ${marketKey},
        'Fixture Reactivation Old Name',
        'Fixture Reactivation Old Name',
        ${MarketType.locality}::market_type,
        'US',
        'TX',
        ${boundary.sourceProvider},
        ${boundary.sourceBoundaryId},
        ${boundary.sourceBoundaryType},
        false,
        false,
        false,
        30.15,
        -97.05,
        30.20,
        -97.00,
        30.10,
        -97.10,
        ST_Multi(ST_MakeEnvelope(-97.10, 30.10, -97.00, 30.20, 4326)),
        '{}'::jsonb,
        now()
      )
    `;

    const result = await (
      registry as unknown as {
        ensureLocalityMarket: (
          feature: BoundaryFeatureRecord,
          resolved: { resolution: { candidateLocalityName: string | null } },
          requestId?: string | null,
        ) => Promise<{
          marketKey: string;
          marketName: string;
          wasCreated: boolean;
        } | null>;
      }
    ).ensureLocalityMarket(
      boundary,
      { resolution: { candidateLocalityName: boundary.shortName } },
      null,
    );
    const rows = await prisma.$queryRaw<
      Array<{ marketKey: string; marketName: string; isActive: boolean }>
    >(Prisma.sql`
      SELECT
        market_key AS "marketKey",
        market_name AS "marketName",
        is_active AS "isActive"
      FROM core_markets
      WHERE source_boundary_provider = ${boundary.sourceProvider}
        AND source_boundary_id = ${boundary.sourceBoundaryId}
        AND source_boundary_type = ${boundary.sourceBoundaryType}
    `);
    const observed = {
      result,
      marketRows: rows,
      lifecycleEvents: tomTom.state.lifecycleEvents.length,
    };
    const ok =
      result?.marketKey === marketKey &&
      result.wasCreated === false &&
      rows.length === 1 &&
      rows[0]?.isActive === true &&
      rows[0]?.marketName === boundary.name;

    return (ok ? pass : fail)(
      'tomtom market: inactive locality is reactivated by source boundary identity',
      {
        marketKey,
        wasCreated: false,
        isActive: true,
      },
      observed,
    );
  } finally {
    await prisma.$executeRaw`
      DELETE FROM core_markets
      WHERE source_boundary_provider = ${boundary.sourceProvider}
        AND source_boundary_id = ${boundary.sourceBoundaryId}
        AND source_boundary_type = ${boundary.sourceBoundaryType}
    `;
    await prisma.$executeRaw`
      DELETE FROM geo_boundary_features
      WHERE source_provider = ${boundary.sourceProvider}
        AND source_boundary_id = ${boundary.sourceBoundaryId}
        AND source_boundary_type = ${boundary.sourceBoundaryType}
    `;
  }
}

function renderReport(checks: FixtureCheck[]): string {
  const passed = checks.filter((check) => check.status === 'pass').length;
  const failed = checks.length - passed;
  return [
    '# TomTom Market Fixture Validation Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Fixture run id: \`${fixtureRunId}\``,
    '',
    '## Summary',
    '',
    `- Checks passed: ${passed}`,
    `- Checks failed: ${failed}`,
    '',
    '## Behavioral Readout',
    '',
    '- Covered regional viewports resolve from existing local geometry and do not call TomTom.',
    '- Passive uncovered viewports may inspect stored boundaries, but do not bootstrap/write new locality markets.',
    '- Regional boundary points resolve through `ST_Covers`, so exact boundary hits do not fall into bootstrap.',
    '- Boundary restaurant locations are included by active market result filters through `ST_Covers`.',
    '- Active bootstrap recomputes coverage after ensuring one locality and still uses normal overlap/tie display selection.',
    '- Inactive TomTom localities are reactivated by source-boundary identity instead of colliding on the source-boundary unique index.',
    '',
    '## Scenario Results',
    '',
    ...checks.flatMap((check) => [
      `### ${check.status.toUpperCase()}: ${check.name}`,
      '',
      'Expected:',
      '',
      '```json',
      JSON.stringify(check.expected, null, 2),
      '```',
      '',
      'Observed:',
      '',
      '```json',
      JSON.stringify(check.observed, null, 2),
      '```',
      '',
    ]),
  ].join('\n');
}

async function main() {
  const checks: FixtureCheck[] = [];
  try {
    checks.push(await runCoveredAustinViewportFixture());
    checks.push(await runPassiveUncoveredViewportFixture());
    checks.push(await runBoundaryPointFixture());
    checks.push(await runBoundaryRestaurantLocationFilterFixture());
    checks.push(await runBootstrapRecomputeFixture());
    checks.push(await runInactiveLocalityReactivationFixture());
  } finally {
    await prisma.$disconnect();
  }

  writeFileSync(outputPath, renderReport(checks));
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

void main().catch(async (error) => {
  await prisma.$disconnect();
  console.error(error);
  process.exit(1);
});
