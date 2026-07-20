/**
 * Market provisioning core — the single implementation behind BOTH
 * prisma/seed.ts (list-driven replay) and scripts/onboard-market.ts
 * (one-command city onboarding). A regional market is the PostGIS UNION of
 * county polygons: each source boundary is an anchor point inside a county;
 * TomTom reverse-geocodes it at CountrySecondarySubdivision level, the
 * county polygon is fetched and unioned, with a covers-its-anchor sanity
 * gate. The collection community row maps a subreddit to the market.
 */
import { PrismaClient, Prisma, MarketType } from '@prisma/client';
import { randomUUID } from 'crypto';

export type CollectionCommunitySeed = {
  communityName: string;
  locationName: string;
  marketKey: string;
};

export type Coordinate = {
  lat: number;
  lng: number;
};

export type RegionSourceBoundarySeed = {
  label: string;
  entityType: 'CountrySecondarySubdivision';
  anchor: Coordinate;
};

export type RegionMarketSeed = {
  marketKey: string;
  marketName: string;
  marketShortName: string;
  countryCode: string;
  stateCode: string;
  center: Coordinate;
  sourceBoundaries: RegionSourceBoundarySeed[];
};

type TomTomReverseGeocodeAddress = {
  municipality?: string;
  municipalitySubdivision?: string;
  countrySecondarySubdivision?: string;
  countrySubdivision?: string;
  postalName?: string;
  freeformAddress?: string;
  countryCode?: string;
  boundingBox?: {
    northEast?: string;
    southWest?: string;
  };
};

type TomTomReverseGeocodeResult = {
  address?: TomTomReverseGeocodeAddress;
  position?: string;
  entityType?: string;
  dataSources?: {
    geometry?: {
      id?: string;
    };
  };
};

type TomTomReverseGeocodeResponse = {
  addresses?: TomTomReverseGeocodeResult[];
};

type GeoJsonGeometry = {
  type?: string;
  coordinates?: unknown;
};

type GeoJsonFeature = {
  type?: string;
  geometry?: GeoJsonGeometry | null;
};

type GeoJsonFeatureCollection = {
  type?: string;
  features?: GeoJsonFeature[];
};

type TomTomAdditionalDataItem = {
  providerID?: string;
  providerId?: string;
  geometryData?: GeoJsonFeatureCollection;
  error?: string;
};

type TomTomAdditionalDataResponse = {
  additionalData?: TomTomAdditionalDataItem[];
};

type TomTomBoundaryCandidate = {
  sourceProvider: 'tomtom';
  sourceBoundaryId: string;
  sourceBoundaryType: RegionSourceBoundarySeed['entityType'];
  providerType: 'geometry';
  label: string;
  name: string;
  shortName: string | null;
  countryCode: string;
  stateCode: string | null;
  position: Coordinate | null;
  boundingBox: {
    northEast: Coordinate | null;
    southWest: Coordinate | null;
  } | null;
  rawAddress: TomTomReverseGeocodeAddress | null;
};

export type StoredBoundary = Pick<
  TomTomBoundaryCandidate,
  | 'sourceProvider'
  | 'sourceBoundaryId'
  | 'sourceBoundaryType'
  | 'providerType'
  | 'label'
  | 'name'
  | 'shortName'
  | 'countryCode'
  | 'stateCode'
>;

export type RegionUpsertRow = {
  marketKey: string;
  boundaryCount: number | bigint;
  areaKm2: number | string;
};

const TOMTOM_SOURCE_PROVIDER = 'tomtom';
const DEFAULT_TOMTOM_REVERSE_GEOCODE_BASE_URL =
  'https://api.tomtom.com/search/2/reverseGeocode';
const DEFAULT_TOMTOM_ADDITIONAL_DATA_URL =
  'https://api.tomtom.com/search/2/additionalData.json';
const TOMTOM_LANGUAGE = 'en-US';
const TOMTOM_TIMEOUT_MS = 10000;

const US_STATE_CODE_BY_NAME = new Map<string, string>([
  ['ALABAMA', 'AL'],
  ['ALASKA', 'AK'],
  ['ARIZONA', 'AZ'],
  ['ARKANSAS', 'AR'],
  ['CALIFORNIA', 'CA'],
  ['COLORADO', 'CO'],
  ['CONNECTICUT', 'CT'],
  ['DELAWARE', 'DE'],
  ['DISTRICT OF COLUMBIA', 'DC'],
  ['FLORIDA', 'FL'],
  ['GEORGIA', 'GA'],
  ['HAWAII', 'HI'],
  ['IDAHO', 'ID'],
  ['ILLINOIS', 'IL'],
  ['INDIANA', 'IN'],
  ['IOWA', 'IA'],
  ['KANSAS', 'KS'],
  ['KENTUCKY', 'KY'],
  ['LOUISIANA', 'LA'],
  ['MAINE', 'ME'],
  ['MARYLAND', 'MD'],
  ['MASSACHUSETTS', 'MA'],
  ['MICHIGAN', 'MI'],
  ['MINNESOTA', 'MN'],
  ['MISSISSIPPI', 'MS'],
  ['MISSOURI', 'MO'],
  ['MONTANA', 'MT'],
  ['NEBRASKA', 'NE'],
  ['NEVADA', 'NV'],
  ['NEW HAMPSHIRE', 'NH'],
  ['NEW JERSEY', 'NJ'],
  ['NEW MEXICO', 'NM'],
  ['NEW YORK', 'NY'],
  ['NORTH CAROLINA', 'NC'],
  ['NORTH DAKOTA', 'ND'],
  ['OHIO', 'OH'],
  ['OKLAHOMA', 'OK'],
  ['OREGON', 'OR'],
  ['PENNSYLVANIA', 'PA'],
  ['RHODE ISLAND', 'RI'],
  ['SOUTH CAROLINA', 'SC'],
  ['SOUTH DAKOTA', 'SD'],
  ['TENNESSEE', 'TN'],
  ['TEXAS', 'TX'],
  ['UTAH', 'UT'],
  ['VERMONT', 'VT'],
  ['VIRGINIA', 'VA'],
  ['WASHINGTON', 'WA'],
  ['WEST VIRGINIA', 'WV'],
  ['WISCONSIN', 'WI'],
  ['WYOMING', 'WY'],
]);

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function resolveTomTomApiKey(): string {
  const appEnv = (process.env.APP_ENV || process.env.CRAVE_ENV || 'dev')
    .trim()
    .toLowerCase();
  const scopedEnvName =
    appEnv === 'prod' || appEnv === 'production'
      ? 'TOMTOM_API_KEY_PROD'
      : 'TOMTOM_API_KEY_DEV';
  const apiKey =
    process.env.TOMTOM_API_KEY?.trim() ||
    process.env[scopedEnvName]?.trim() ||
    '';
  if (!apiKey) {
    throw new Error(
      'TOMTOM_API_KEY is required to seed regional market polygons',
    );
  }
  return apiKey;
}

function resolveTomTomTimeoutMs(): number {
  const parsed = Number(process.env.TOMTOM_TIMEOUT);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : TOMTOM_TIMEOUT_MS;
}

function buildTomTomUrl(baseUrl: string, path?: string): string {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  return path ? `${normalizedBase}/${path.replace(/^\//, '')}` : normalizedBase;
}

async function fetchTomTomJson<T>(
  url: string,
  params: Record<string, string | number>,
  requestId: string,
): Promise<T> {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    searchParams.set(key, String(value));
  });

  // Free-tier TomTom rate-limits bursts (429); provisioning fires several
  // requests per market, so back off and retry rather than failing the run.
  const maxAttempts = 4;
  for (let attempt = 1; ; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      resolveTomTomTimeoutMs(),
    );
    try {
      const response = await fetch(`${url}?${searchParams.toString()}`, {
        headers: {
          'Tracking-ID': requestId,
        },
        signal: controller.signal,
      });
      if (response.status === 429 && attempt < maxAttempts) {
        const delayMs = attempt * 2000;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `TomTom request failed (${response.status}) for ${url}: ${body.slice(
            0,
            300,
          )}`,
        );
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseLatLng(value?: string): Coordinate | null {
  if (!value) {
    return null;
  }
  const [lat, lng] = value
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }
  return { lat, lng };
}

function parseBoundingBox(
  value?: TomTomReverseGeocodeAddress['boundingBox'],
): { northEast: Coordinate | null; southWest: Coordinate | null } | null {
  if (!value) {
    return null;
  }
  return {
    northEast: parseLatLng(value.northEast),
    southWest: parseLatLng(value.southWest),
  };
}

function normalizeCountryCode(value?: string): string {
  return value?.trim().toUpperCase() || 'US';
}

function normalizeStateCode(value?: string): string | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  if (/^[A-Za-z]{2}$/.test(normalized)) {
    return normalized.toUpperCase();
  }
  return US_STATE_CODE_BY_NAME.get(normalized.toUpperCase()) ?? normalized;
}

function resolveTomTomBoundaryName(
  address: TomTomReverseGeocodeAddress | null,
  source: RegionSourceBoundarySeed,
): string {
  const name =
    address?.countrySecondarySubdivision?.trim() ||
    address?.municipality?.trim() ||
    address?.municipalitySubdivision?.trim() ||
    address?.postalName?.trim() ||
    source.label;
  return name;
}

async function fetchTomTomBoundaryCandidate(
  source: RegionSourceBoundarySeed,
  requestId: string,
): Promise<TomTomBoundaryCandidate> {
  const apiKey = resolveTomTomApiKey();
  const reverseBaseUrl =
    process.env.TOMTOM_REVERSE_GEOCODE_BASE_URL ||
    DEFAULT_TOMTOM_REVERSE_GEOCODE_BASE_URL;
  const reverseUrl = buildTomTomUrl(
    reverseBaseUrl,
    `${source.anchor.lat},${source.anchor.lng}.json`,
  );
  const params: Record<string, string> = {
    key: apiKey,
    entityType: source.entityType,
    language: TOMTOM_LANGUAGE,
  };
  if (process.env.TOMTOM_API_VERSION?.trim()) {
    params.apiVersion = process.env.TOMTOM_API_VERSION.trim();
  }

  const response = await fetchTomTomJson<TomTomReverseGeocodeResponse>(
    reverseUrl,
    params,
    requestId,
  );
  const matches = Array.isArray(response.addresses) ? response.addresses : [];
  const match = matches.find(
    (entry) =>
      entry.entityType === source.entityType &&
      typeof entry.dataSources?.geometry?.id === 'string',
  );
  if (!match) {
    throw new Error(
      `TomTom did not return ${source.entityType} geometry for ${source.label}`,
    );
  }

  const address = match.address ?? null;
  const countryCode = normalizeCountryCode(address?.countryCode);
  if (countryCode !== 'US') {
    throw new Error(
      `TomTom boundary ${source.label} resolved outside US (${countryCode})`,
    );
  }

  const sourceBoundaryId = match.dataSources?.geometry?.id?.trim();
  if (!sourceBoundaryId) {
    throw new Error(`TomTom boundary ${source.label} has no geometry id`);
  }

  const name = resolveTomTomBoundaryName(address, source);
  return {
    sourceProvider: TOMTOM_SOURCE_PROVIDER,
    sourceBoundaryId,
    sourceBoundaryType: source.entityType,
    providerType: 'geometry',
    label: source.label,
    name,
    shortName: address?.countrySecondarySubdivision?.trim() || name,
    countryCode,
    stateCode: normalizeStateCode(address?.countrySubdivision),
    position: parseLatLng(match.position),
    boundingBox: parseBoundingBox(address?.boundingBox),
    rawAddress: address,
  };
}

async function fetchTomTomBoundaryGeometry(
  sourceBoundaryId: string,
  requestId: string,
): Promise<GeoJsonFeatureCollection> {
  const apiKey = resolveTomTomApiKey();
  const additionalDataUrl =
    process.env.TOMTOM_ADDITIONAL_DATA_URL ||
    DEFAULT_TOMTOM_ADDITIONAL_DATA_URL;
  const params: Record<string, string | number> = {
    key: apiKey,
    geometries: sourceBoundaryId,
    language: TOMTOM_LANGUAGE,
  };
  if (process.env.TOMTOM_GEOMETRY_ZOOM?.trim()) {
    params.geometriesZoom = Number(process.env.TOMTOM_GEOMETRY_ZOOM);
  }
  if (process.env.TOMTOM_API_VERSION?.trim()) {
    params.apiVersion = process.env.TOMTOM_API_VERSION.trim();
  }

  const response = await fetchTomTomJson<TomTomAdditionalDataResponse>(
    additionalDataUrl,
    params,
    requestId,
  );
  const items = Array.isArray(response.additionalData)
    ? response.additionalData
    : [];
  const item = items.find((entry) => {
    const id = entry.providerID ?? entry.providerId;
    return id === sourceBoundaryId;
  });
  if (item?.error) {
    throw new Error(
      `TomTom geometry ${sourceBoundaryId} returned error: ${item.error}`,
    );
  }

  const geometryData = item?.geometryData ?? null;
  const polygonFeatures =
    geometryData?.type === 'FeatureCollection' &&
    Array.isArray(geometryData.features)
      ? geometryData.features.filter((feature) => {
          const geometryType = feature.geometry?.type;
          return geometryType === 'Polygon' || geometryType === 'MultiPolygon';
        })
      : [];

  if (!polygonFeatures.length) {
    throw new Error(`TomTom geometry ${sourceBoundaryId} has no polygon data`);
  }

  return {
    type: 'FeatureCollection',
    features: polygonFeatures,
  };
}

async function upsertTomTomBoundaryFeature(
  prisma: PrismaClient,
  boundary: TomTomBoundaryCandidate,
  lookupPoint: Coordinate,
  geometry: GeoJsonFeatureCollection,
): Promise<StoredBoundary> {
  const metadata = {
    source: TOMTOM_SOURCE_PROVIDER,
    rawAddress: boundary.rawAddress,
    lookupPoint,
    reverseGeocodePosition: boundary.position,
    reverseGeocodeBoundingBox: boundary.boundingBox,
    seedLabel: boundary.label,
  };

  const rows = await prisma.$queryRaw<StoredBoundary[]>(Prisma.sql`
    WITH raw_input AS (
      SELECT
        ${JSON.stringify(geometry)}::jsonb AS geojson,
        ${JSON.stringify(metadata)}::jsonb AS metadata,
        ST_SetSRID(ST_MakePoint(${lookupPoint.lng}, ${
          lookupPoint.lat
        }), 4326) AS lookup_point
    ),
    source_geometries AS (
      SELECT
        ST_MakeValid(
          ST_SetSRID(
            ST_GeomFromGeoJSON((feature->'geometry')::text),
            4326
          )
        ) AS geometry
      FROM raw_input,
        jsonb_array_elements(raw_input.geojson->'features') AS feature
      WHERE feature ? 'geometry'
    ),
    collected AS (
      SELECT ST_Collect(geometry) AS geometry
      FROM source_geometries
    ),
    merged AS (
      SELECT
        ST_Multi(
          ST_CollectionExtract(
            ST_MakeValid(ST_UnaryUnion(collected.geometry)),
            3
          )
        ) AS geometry,
        raw_input.metadata,
        raw_input.lookup_point
      FROM raw_input
      CROSS JOIN collected
    ),
    upserted AS (
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
        fetched_at,
        updated_at
      )
      SELECT
        ${boundary.sourceProvider},
        ${boundary.sourceBoundaryId},
        ${boundary.sourceBoundaryType},
        ${boundary.providerType},
        ${boundary.name},
        ${boundary.shortName},
        ${boundary.countryCode},
        ${boundary.stateCode},
        ST_Y(ST_Centroid(geometry))::numeric(11, 8),
        ST_X(ST_Centroid(geometry))::numeric(11, 8),
        ST_YMax(Box2D(geometry))::numeric(11, 8),
        ST_XMax(Box2D(geometry))::numeric(11, 8),
        ST_YMin(Box2D(geometry))::numeric(11, 8),
        ST_XMin(Box2D(geometry))::numeric(11, 8),
        geometry,
        metadata,
        now(),
        now()
      FROM merged
      WHERE geometry IS NOT NULL
        AND NOT ST_IsEmpty(geometry)
        AND ST_IsValid(geometry)
        AND ST_Covers(geometry, lookup_point)
      ON CONFLICT (source_provider, source_boundary_id, source_boundary_type) DO UPDATE SET
        provider_type = EXCLUDED.provider_type,
        name = EXCLUDED.name,
        short_name = EXCLUDED.short_name,
        country_code = EXCLUDED.country_code,
        state_code = EXCLUDED.state_code,
        center_latitude = EXCLUDED.center_latitude,
        center_longitude = EXCLUDED.center_longitude,
        bbox_ne_latitude = EXCLUDED.bbox_ne_latitude,
        bbox_ne_longitude = EXCLUDED.bbox_ne_longitude,
        bbox_sw_latitude = EXCLUDED.bbox_sw_latitude,
        bbox_sw_longitude = EXCLUDED.bbox_sw_longitude,
        geometry = EXCLUDED.geometry,
        metadata = EXCLUDED.metadata,
        fetched_at = EXCLUDED.fetched_at,
        updated_at = now()
      RETURNING
        source_provider AS "sourceProvider",
        source_boundary_id AS "sourceBoundaryId",
        source_boundary_type AS "sourceBoundaryType",
        provider_type AS "providerType",
        ${boundary.label} AS "label",
        name,
        short_name AS "shortName",
        country_code AS "countryCode",
        state_code AS "stateCode"
    )
    SELECT * FROM upserted
  `);

  const record = rows[0] ?? null;
  if (!record) {
    throw new Error(
      `TomTom geometry for ${boundary.label} did not cover its seed point`,
    );
  }
  return record;
}

async function upsertRegionMarketFromBoundaries(
  prisma: PrismaClient,
  seed: RegionMarketSeed,
  storedBoundaries: StoredBoundary[],
): Promise<RegionUpsertRow> {
  const sourceBoundaries = storedBoundaries.map((boundary) => ({
    sourceProvider: boundary.sourceProvider,
    sourceBoundaryId: boundary.sourceBoundaryId,
    sourceBoundaryType: boundary.sourceBoundaryType,
    providerType: boundary.providerType,
    label: boundary.label,
    name: boundary.name,
    shortName: boundary.shortName,
    countryCode: boundary.countryCode,
    stateCode: boundary.stateCode,
  }));
  const metadata = {
    source: 'tomtom_boundary_union',
    boundaryKind: 'regional_collection_boundary',
    marketKey: normalize(seed.marketKey),
    sourceProvider: TOMTOM_SOURCE_PROVIDER,
    sourceBoundaries,
  };

  const rows = await prisma.$queryRaw<RegionUpsertRow[]>(Prisma.sql`
    WITH desired AS (
      SELECT *
      FROM jsonb_to_recordset(${JSON.stringify(sourceBoundaries)}::jsonb)
        AS boundary(
          "sourceProvider" text,
          "sourceBoundaryId" text,
          "sourceBoundaryType" text,
          "providerType" text,
          label text,
          name text,
          "shortName" text,
          "countryCode" text,
          "stateCode" text
        )
    ),
    source_geometries AS (
      SELECT
        features.geometry
      FROM desired
      JOIN geo_boundary_features features
        ON features.source_provider = desired."sourceProvider"
        AND features.source_boundary_id = desired."sourceBoundaryId"
        AND features.source_boundary_type = desired."sourceBoundaryType"
      WHERE features.geometry IS NOT NULL
    ),
    merged AS (
      SELECT
        COUNT(*)::int AS boundary_count,
        ST_Multi(
          ST_CollectionExtract(
            ST_MakeValid(ST_UnaryUnion(ST_Collect(geometry))),
            3
          )
        ) AS geometry
      FROM source_geometries
    ),
    upserted AS (
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
        source_community,
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
      SELECT
        ${normalize(seed.marketKey)},
        ${seed.marketName},
        ${seed.marketShortName},
        ${MarketType.regional}::market_type,
        ${seed.countryCode},
        ${seed.stateCode},
        NULL,
        NULL,
        NULL,
        NULL,
        true,
        true,
        true,
        ${seed.center.lat},
        ${seed.center.lng},
        ST_YMax(Box2D(geometry))::numeric(11, 8),
        ST_XMax(Box2D(geometry))::numeric(11, 8),
        ST_YMin(Box2D(geometry))::numeric(11, 8),
        ST_XMin(Box2D(geometry))::numeric(11, 8),
        geometry,
        ${JSON.stringify(metadata)}::jsonb,
        now()
      FROM merged
      WHERE boundary_count = ${storedBoundaries.length}
        AND geometry IS NOT NULL
        AND NOT ST_IsEmpty(geometry)
        AND ST_IsValid(geometry)
      ON CONFLICT (market_key) DO UPDATE SET
        market_name = EXCLUDED.market_name,
        market_short_name = EXCLUDED.market_short_name,
        market_type = EXCLUDED.market_type,
        country_code = EXCLUDED.country_code,
        state_code = EXCLUDED.state_code,
        source_boundary_provider = NULL,
        source_boundary_id = NULL,
        source_boundary_type = NULL,
        is_collectable = true,
        scheduler_enabled = true,
        is_active = true,
        center_latitude = EXCLUDED.center_latitude,
        center_longitude = EXCLUDED.center_longitude,
        bbox_ne_latitude = EXCLUDED.bbox_ne_latitude,
        bbox_ne_longitude = EXCLUDED.bbox_ne_longitude,
        bbox_sw_latitude = EXCLUDED.bbox_sw_latitude,
        bbox_sw_longitude = EXCLUDED.bbox_sw_longitude,
        geometry = EXCLUDED.geometry,
        metadata = EXCLUDED.metadata,
        updated_at = now()
      RETURNING
        market_key AS "marketKey",
        ${storedBoundaries.length}::int AS "boundaryCount",
        ROUND((ST_Area(geometry::geography) / 1000000.0)::numeric, 2) AS "areaKm2"
    )
    SELECT * FROM upserted
  `);

  const row = rows[0] ?? null;
  if (!row) {
    throw new Error(
      `Unable to seed ${seed.marketKey}; expected ${storedBoundaries.length} TomTom source boundaries`,
    );
  }
  return row;
}

/** Provision ONE regional market from its county anchors (fetch + union + upsert). */
export async function provisionRegionMarket(
  prisma: PrismaClient,
  seed: RegionMarketSeed,
): Promise<RegionUpsertRow> {
  const requestId = randomUUID();
  const storedBoundaries: StoredBoundary[] = [];
  const seenBoundaryIds = new Set<string>();
  for (const source of seed.sourceBoundaries) {
    const candidate = await fetchTomTomBoundaryCandidate(source, requestId);
    // Multiple anchors can land in the same county (e.g. the city center plus
    // a discovered anchor) — fetch/store each boundary once.
    if (seenBoundaryIds.has(candidate.sourceBoundaryId)) {
      continue;
    }
    seenBoundaryIds.add(candidate.sourceBoundaryId);
    const geometry = await fetchTomTomBoundaryGeometry(
      candidate.sourceBoundaryId,
      requestId,
    );
    const stored = await upsertTomTomBoundaryFeature(
      prisma,
      candidate,
      source.anchor,
      geometry,
    );
    storedBoundaries.push(stored);
  }
  return upsertRegionMarketFromBoundaries(prisma, seed, storedBoundaries);
}

/** Map a subreddit community to an ACTIVE market and flip it collectable. */
export async function provisionCollectionCommunity(
  prisma: PrismaClient,
  seed: CollectionCommunitySeed,
  options: { requireActive?: boolean } = {},
): Promise<void> {
  const communityName = normalize(seed.communityName);
  const locationName = seed.locationName.trim();
  const marketKey = normalize(seed.marketKey);
  const requireActive = options.requireActive ?? true;
  const linkedMarket = await prisma.market.findFirst({
    where: { marketKey, ...(requireActive ? { isActive: true } : {}) },
    select: { marketKey: true },
  });
  if (!linkedMarket?.marketKey) {
    throw new Error(
      `Collection community "${communityName}" references missing${requireActive ? ' active' : ''} market "${marketKey}"`,
    );
  }
  await prisma.collectionCommunity.upsert({
    where: { communityName },
    update: { locationName, marketKey, isActive: true },
    create: { communityName, locationName, marketKey, isActive: true },
  });
  await prisma.market.update({
    where: { marketKey },
    data: {
      sourceCommunity: communityName,
      isCollectable: true,
      schedulerEnabled: true,
      // Dark onboarding (requireActive=false) must not flip visibility on.
      ...(requireActive ? { isActive: true } : {}),
    },
    select: { marketKey: true },
  });

  // §10 onboarding verb: engine (member places) + source + adapter-seeded
  // lanes. Engine name = the legacy market key during Phase B/C. Member place
  // = the municipality matched from the community's location name (organic
  // catalog entry covers the miss case — operator attaches later).
  const cityName = locationName.split(',')[0]?.trim() ?? '';
  const stateCode = locationName.split(',')[1]?.trim().toUpperCase() ?? '';
  const memberPlace = await prisma.place.findFirst({
    where: {
      name: { equals: cityName, mode: 'insensitive' },
      subdivisionCode: stateCode || undefined,
      providerLevelCode: 'Municipality',
    },
    select: { placeId: true },
  });
  const engine = await prisma.engine.upsert({
    where: { name: marketKey },
    update: memberPlace ? { memberPlaceIds: [memberPlace.placeId] } : {},
    create: {
      name: marketKey,
      memberPlaceIds: memberPlace ? [memberPlace.placeId] : [],
    },
  });
  const source = await prisma.source.upsert({
    where: { platform_handle: { platform: 'reddit', handle: communityName } },
    update: { engineId: engine.engineId },
    create: {
      platform: 'reddit',
      handle: communityName,
      anchorPlaceId: memberPlace?.placeId ?? null,
      engineId: engine.engineId,
    },
  });
  // Adapter-declared lanes (reddit → chronological + keyword; tolerance ≈
  // cadence per §14.3). A new source starts collecting with zero further
  // configuration.
  await prisma.$executeRaw`
    INSERT INTO source_collection_lanes
      (source_id, lane, cadence_days, lateness_tolerance_days)
    VALUES
      (${source.sourceId}::uuid, 'chronological', 1, 1),
      (${source.sourceId}::uuid, 'keyword', 7, 7)
    ON CONFLICT (source_id, lane) DO NOTHING
  `;
}

export interface GeocodedCity {
  center: Coordinate;
  cityName: string;
  stateCode: string;
  countryCode: string;
  /** TomTom geometry id for the municipality polygon (Additional Data service). */
  geometryId: string | null;
}

/**
 * Geocode a city string ("Austin, TX") to its center + names via TomTom
 * (same provider/key as the boundary fetches). Lets onboarding derive
 * short name, state, and center from the city string alone.
 */
export async function geocodeCityCenter(city: string): Promise<GeocodedCity> {
  const apiKey = resolveTomTomApiKey();
  const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(city)}.json`;
  const response = await fetchTomTomJson<{
    results?: Array<{
      type?: string;
      entityType?: string;
      position?: { lat?: number; lon?: number };
      address?: TomTomReverseGeocodeAddress & { countryCode?: string };
      dataSources?: { geometry?: { id?: string } };
    }>;
  }>(url, { key: apiKey, language: TOMTOM_LANGUAGE, limit: '5' }, randomUUID());

  const results = Array.isArray(response.results) ? response.results : [];
  const match =
    results.find((entry) => entry.entityType === 'Municipality') ?? results[0];
  const lat = match?.position?.lat;
  const lng = match?.position?.lon;
  if (
    !match ||
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    throw new Error(`TomTom could not geocode city "${city}"`);
  }
  const address = match.address ?? {};
  const cityName =
    address.municipality?.trim() || city.split(',')[0]?.trim() || city;
  const stateCode =
    normalizeStateCode(address.countrySubdivision) ??
    city.split(',')[1]?.trim().toUpperCase() ??
    '';
  const countryCode = normalizeCountryCode(
    (address as { countryCode?: string }).countryCode,
  );
  if (!stateCode) {
    throw new Error(
      `Could not resolve a state for "${city}" — pass --state explicitly`,
    );
  }
  return {
    center: { lat, lng },
    cityName,
    stateCode,
    countryCode,
    geometryId: match.dataSources?.geometry?.id?.trim() || null,
  };
}

/**
 * Geocode a county by NAME ("Williamson County, TX") to an anchor point via
 * TomTom's structured geocode (entityTypeSet=CountrySecondarySubdivision) —
 * so onboarding takes county names, not hunted-down coordinates.
 */
export async function geocodeCountyAnchor(county: string): Promise<Coordinate> {
  const apiKey = resolveTomTomApiKey();
  const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(county)}.json`;
  const response = await fetchTomTomJson<{
    results?: Array<{
      entityType?: string;
      position?: { lat?: number; lon?: number };
    }>;
  }>(
    url,
    {
      key: apiKey,
      language: TOMTOM_LANGUAGE,
      entityTypeSet: 'CountrySecondarySubdivision',
      limit: '1',
    },
    randomUUID(),
  );
  const match = (response.results ?? [])[0];
  const lat = match?.position?.lat;
  const lng = match?.position?.lon;
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    throw new Error(`TomTom could not geocode county "${county}"`);
  }
  return { lat, lng };
}

/**
 * AUTO-DISCOVER the counties of a metro: reverse-geocode a ring of sample
 * points around the center (8 bearings at the radius + 8 at half radius +
 * the center) at CountrySecondarySubdivision level and dedupe by county.
 * TomTom has no "counties of X" enumeration endpoint — this derives it from
 * the point→county lookups it does expose. The radius is the one remaining
 * judgment knob (how far out is still "the metro").
 */
export async function discoverMetroCountyAnchors(
  center: Coordinate,
  radiusKm: number,
): Promise<{ county: string; anchor: Coordinate }[]> {
  const apiKey = resolveTomTomApiKey();
  const points: Coordinate[] = [center];
  for (const radius of [radiusKm, radiusKm / 2]) {
    for (let bearing = 0; bearing < 360; bearing += 45) {
      const rad = (bearing * Math.PI) / 180;
      const dLat = (radius / 111.32) * Math.cos(rad);
      const dLng =
        (radius / (111.32 * Math.cos((center.lat * Math.PI) / 180))) *
        Math.sin(rad);
      points.push({ lat: center.lat + dLat, lng: center.lng + dLng });
    }
  }

  const byCounty = new Map<string, Coordinate>();
  for (const point of points) {
    const url = `${DEFAULT_TOMTOM_REVERSE_GEOCODE_BASE_URL}/${point.lat},${point.lng}.json`;
    const response = await fetchTomTomJson<TomTomReverseGeocodeResponse>(
      url,
      {
        key: apiKey,
        entityType: 'CountrySecondarySubdivision',
        language: TOMTOM_LANGUAGE,
      },
      randomUUID(),
    ).catch(() => null);
    const match = (response?.addresses ?? [])[0];
    const county = match?.address?.countrySecondarySubdivision?.trim();
    const state = match?.address?.countrySubdivision?.trim();
    if (county && !byCounty.has(`${county}|${state}`)) {
      byCounty.set(`${county}|${state}`, point);
    }
  }

  return Array.from(byCounty.entries()).map(([key, anchor]) => ({
    county: key.split('|')[0],
    anchor,
  }));
}

function pointInRing(point: Coordinate, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInFeatureCollection(
  point: Coordinate,
  collection: GeoJsonFeatureCollection,
): boolean {
  for (const feature of collection.features ?? []) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    const polygons: number[][][][] =
      geometry.type === 'Polygon'
        ? [geometry.coordinates as number[][][]]
        : geometry.type === 'MultiPolygon'
          ? (geometry.coordinates as number[][][][])
          : [];
    for (const polygon of polygons) {
      if (!polygon.length) continue;
      if (!pointInRing(point, polygon[0])) continue;
      // Inside outer ring; excluded if inside any hole.
      const inHole = polygon.slice(1).some((hole) => pointInRing(point, hole));
      if (!inHole) return true;
    }
  }
  return false;
}

/**
 * COUNTIES INTERSECTING THE CITY'S OWN POLYGON — the deterministic default.
 * TomTom exposes the municipality polygon (via the geocode result's geometry
 * id + Additional Data) but has NO child-enumeration or polygon-intersection
 * query, so this derives it: grid-sample points INSIDE the city polygon and
 * reverse-geocode each at county level. Interior sampling (unlike ring
 * sampling) cannot skip an enclosed county, and the city polygon naturally
 * respects state lines (NYC -> exactly its 5 boroughs, no NJ bleed).
 */
export async function discoverCityCountyAnchors(
  geometryId: string,
  maxSamples = 24,
): Promise<{ county: string; anchor: Coordinate }[]> {
  const apiKey = resolveTomTomApiKey();
  const requestId = randomUUID();
  const geometry = await fetchTomTomBoundaryGeometry(geometryId, requestId);

  // Bounding box of all polygon coordinates.
  let minLat = 90,
    maxLat = -90,
    minLng = 180,
    maxLng = -180;
  for (const feature of geometry.features ?? []) {
    const geom = feature.geometry;
    if (!geom) continue;
    const polys: number[][][][] =
      geom.type === 'Polygon'
        ? [geom.coordinates as number[][][]]
        : geom.type === 'MultiPolygon'
          ? (geom.coordinates as number[][][][])
          : [];
    for (const poly of polys) {
      for (const ring of poly) {
        for (const [lng, lat] of ring) {
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
        }
      }
    }
  }

  // Dense grid filtered to inside-polygon, then evenly subsampled.
  const GRID = 14;
  const inside: Coordinate[] = [];
  for (let i = 0; i < GRID; i += 1) {
    for (let j = 0; j < GRID; j += 1) {
      const point = {
        lat: minLat + ((i + 0.5) / GRID) * (maxLat - minLat),
        lng: minLng + ((j + 0.5) / GRID) * (maxLng - minLng),
      };
      if (pointInFeatureCollection(point, geometry)) {
        inside.push(point);
      }
    }
  }
  const step = Math.max(1, Math.ceil(inside.length / maxSamples));
  const samples = inside.filter((_, index) => index % step === 0);

  const byCounty = new Map<string, Coordinate>();
  for (const point of samples) {
    const url = `${DEFAULT_TOMTOM_REVERSE_GEOCODE_BASE_URL}/${point.lat},${point.lng}.json`;
    const response = await fetchTomTomJson<TomTomReverseGeocodeResponse>(
      url,
      {
        key: apiKey,
        entityType: 'CountrySecondarySubdivision',
        language: TOMTOM_LANGUAGE,
      },
      requestId,
    ).catch(() => null);
    const match = (response?.addresses ?? [])[0];
    const county = match?.address?.countrySecondarySubdivision?.trim();
    const state = match?.address?.countrySubdivision?.trim();
    if (county && !byCounty.has(`${county}|${state}`)) {
      byCounty.set(`${county}|${state}`, point);
    }
  }

  return Array.from(byCounty.entries()).map(([key, anchor]) => ({
    county: key.split('|')[0],
    anchor,
  }));
}
