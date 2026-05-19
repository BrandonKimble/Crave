import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type RegionalHealthRow = {
  marketKey: string;
  isActive: boolean;
  isCollectable: boolean;
  schedulerEnabled: boolean;
  metadataSource: string | null;
  sourceBoundaryCount: number | bigint | string | null;
  sourceBoundaryFeatureCount: number | bigint | string | null;
  hasGeometry: boolean;
  geometryValid: boolean;
  geometryEmpty: boolean;
  hasBbox: boolean;
  activeCommunityCount: number | bigint | string | null;
};

const requiredRegionalMarkets = [
  { marketKey: 'region-us-tx-austin', minimumSourceBoundaryCount: 6 },
  { marketKey: 'region-us-ny-new-york', minimumSourceBoundaryCount: 5 },
] as const;

function toNumber(value: number | bigint | string | null | undefined): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

async function main() {
  const rows = await prisma.$queryRaw<RegionalHealthRow[]>`
    SELECT
      market.market_key AS "marketKey",
      market.is_active AS "isActive",
      market.is_collectable AS "isCollectable",
      market.scheduler_enabled AS "schedulerEnabled",
      market.metadata->>'source' AS "metadataSource",
      CASE
        WHEN jsonb_typeof(market.metadata->'sourceBoundaries') = 'array'
          THEN jsonb_array_length(market.metadata->'sourceBoundaries')
        ELSE 0
      END AS "sourceBoundaryCount",
      (
        SELECT COUNT(DISTINCT feature.boundary_feature_id)
        FROM jsonb_to_recordset(
          CASE
            WHEN jsonb_typeof(market.metadata->'sourceBoundaries') = 'array'
              THEN market.metadata->'sourceBoundaries'
            ELSE '[]'::jsonb
          END
        ) AS boundary(
          "sourceProvider" text,
          "sourceBoundaryId" text,
          "sourceBoundaryType" text
        )
        JOIN geo_boundary_features feature
          ON feature.source_provider = boundary."sourceProvider"
         AND feature.source_boundary_id = boundary."sourceBoundaryId"
         AND feature.source_boundary_type = boundary."sourceBoundaryType"
        WHERE boundary."sourceProvider" = 'tomtom'
          AND feature.geometry IS NOT NULL
          AND ST_IsValid(feature.geometry)
          AND NOT ST_IsEmpty(feature.geometry)
      ) AS "sourceBoundaryFeatureCount",
      market.geometry IS NOT NULL AS "hasGeometry",
      CASE
        WHEN market.geometry IS NULL THEN false
        ELSE ST_IsValid(market.geometry)
      END AS "geometryValid",
      CASE
        WHEN market.geometry IS NULL THEN true
        ELSE ST_IsEmpty(market.geometry)
      END AS "geometryEmpty",
      (
        market.bbox_ne_latitude IS NOT NULL
        AND market.bbox_ne_longitude IS NOT NULL
        AND market.bbox_sw_latitude IS NOT NULL
        AND market.bbox_sw_longitude IS NOT NULL
      ) AS "hasBbox",
      (
        SELECT COUNT(*)
        FROM collection_communities community
        WHERE community.market_key = market.market_key
          AND community.is_active = true
      ) AS "activeCommunityCount"
    FROM core_markets market
    WHERE market.market_key IN (
      'region-us-tx-austin',
      'region-us-ny-new-york'
    )
  `;

  const byKey = new Map(rows.map((row) => [row.marketKey, row]));
  const failures: string[] = [];

  for (const expected of requiredRegionalMarkets) {
    const row = byKey.get(expected.marketKey);
    if (!row) {
      failures.push(`${expected.marketKey}: missing`);
      continue;
    }
    if (!row.isActive) {
      failures.push(`${expected.marketKey}: inactive`);
    }
    if (!row.isCollectable) {
      failures.push(`${expected.marketKey}: not collectable`);
    }
    if (!row.schedulerEnabled) {
      failures.push(`${expected.marketKey}: scheduler disabled`);
    }
    if (row.metadataSource !== 'tomtom_boundary_union') {
      failures.push(
        `${expected.marketKey}: metadata.source=${row.metadataSource ?? 'null'}`,
      );
    }
    if (
      toNumber(row.sourceBoundaryCount) <
      expected.minimumSourceBoundaryCount
    ) {
      failures.push(`${expected.marketKey}: missing sourceBoundaries metadata`);
    }
    if (
      toNumber(row.sourceBoundaryFeatureCount) <
      expected.minimumSourceBoundaryCount
    ) {
      failures.push(`${expected.marketKey}: missing TomTom source boundary rows`);
    }
    if (
      toNumber(row.sourceBoundaryFeatureCount) !==
      toNumber(row.sourceBoundaryCount)
    ) {
      failures.push(
        `${expected.marketKey}: sourceBoundaries metadata does not match valid TomTom boundary rows`,
      );
    }
    if (!row.hasGeometry || !row.geometryValid || row.geometryEmpty) {
      failures.push(`${expected.marketKey}: invalid or missing geometry`);
    }
    if (!row.hasBbox) {
      failures.push(`${expected.marketKey}: missing derived bbox`);
    }
    if (toNumber(row.activeCommunityCount) < 1) {
      failures.push(`${expected.marketKey}: no active collection community`);
    }
  }

  if (failures.length > 0) {
    console.error('tomtom regional health check failed:');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('tomtom regional health check: ok');
}

main()
  .catch((error) => {
    console.error('tomtom regional health check failed unexpectedly:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
