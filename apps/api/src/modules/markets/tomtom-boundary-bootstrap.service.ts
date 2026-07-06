import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { UsageLedgerService } from '../external-integrations/shared/usage-ledger.service';
import { LoggerService } from '../../shared';
import { MarketBootstrapMetricsService } from './market-bootstrap-metrics.service';

type Coordinate = { lat: number; lng: number };

type TomTomReverseGeocodeAddress = {
  municipality?: string;
  postalName?: string;
  freeformAddress?: string;
  countryCode?: string;
  countrySubdivision?: string;
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

export type BoundaryFeatureRecord = {
  sourceProvider: string;
  sourceBoundaryId: string;
  sourceBoundaryType: string;
  providerType: string;
  name: string;
  shortName: string | null;
  countryCode: string;
  stateCode: string | null;
};

type BoundaryBootstrapOptions = {
  triggerKind?: 'point_resolution' | 'viewport_coverage';
  requestId?: string | null;
  attemptIndex?: number | null;
  uncoveredAreaMeters?: number | null;
  uncoveredAreaShare?: number | null;
  stopReason?: string | null;
};

const TOMTOM_SOURCE_PROVIDER = 'tomtom';
const TOMTOM_MUNICIPALITY_BOUNDARY_TYPE = 'Municipality';
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

@Injectable()
export class TomTomBoundaryBootstrapService {
  private readonly logger: LoggerService;
  private readonly reverseGeocodeBaseUrl: string;
  private readonly additionalDataUrl: string;
  private readonly timeoutMs: number;
  private readonly geometryZoom: number | null;
  private readonly apiVersion: string | null;
  private readonly language: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly bootstrapMetrics: MarketBootstrapMetricsService,
    loggerService: LoggerService,
    private readonly usageLedger: UsageLedgerService,
  ) {
    this.logger = loggerService.setContext('TomTomBoundaryBootstrapService');
    this.reverseGeocodeBaseUrl =
      this.configService.get<string>('tomtom.reverseGeocodeBaseUrl') ??
      'https://api.tomtom.com/search/2/reverseGeocode';
    this.additionalDataUrl =
      this.configService.get<string>('tomtom.additionalDataUrl') ??
      'https://api.tomtom.com/search/2/additionalData.json';
    this.timeoutMs =
      Number(this.configService.get<number>('tomtom.timeout')) || 10000;

    const configuredGeometryZoom = Number(
      this.configService.get<number>('tomtom.geometryZoom'),
    );
    this.geometryZoom = Number.isFinite(configuredGeometryZoom)
      ? configuredGeometryZoom
      : null;
    this.apiVersion =
      this.configService.get<string>('tomtom.apiVersion')?.trim() || null;
    this.language =
      this.configService.get<string>('tomtom.language')?.trim() || 'en-US';
  }

  async findStoredMunicipalityForPoint(
    point: Coordinate,
  ): Promise<BoundaryFeatureRecord | null> {
    return this.findBoundaryContainingPoint(point);
  }

  /** In-flight dedupe: concurrent bootstraps for the same ~100m grid cell
   *  share one TomTom round-trip instead of racing duplicates. */
  private readonly inFlightBootstraps = new Map<
    string,
    Promise<BoundaryFeatureRecord | null>
  >();

  async bootstrapMunicipalityForPoint(
    point: Coordinate,
    options?: BoundaryBootstrapOptions,
  ): Promise<BoundaryFeatureRecord | null> {
    const normalized = this.normalizePoint(point);
    if (!normalized) {
      return null;
    }

    const stored = await this.findBoundaryContainingPoint(normalized);
    if (stored) {
      return stored;
    }

    // Negative cache: a recent no_boundary result near this point means
    // TomTom has no municipality here (rural/water) — don't re-ask on every
    // search submit from the same area. ~3km radius, 30-day TTL.
    const recentMiss = await this.prisma.$queryRaw<{ id: number }[]>(
      Prisma.sql`
        SELECT 1 AS id FROM market_bootstrap_events
        WHERE event_type = 'no_boundary'
          AND created_at > now() - interval '30 days'
          AND lookup_latitude IS NOT NULL
          AND abs(lookup_latitude - ${normalized.lat}) < 0.027
          AND abs(lookup_longitude - ${normalized.lng}) < 0.027
        LIMIT 1
      `,
    );
    if (recentMiss.length > 0) {
      return null;
    }

    const cellKey = `${normalized.lat.toFixed(3)},${normalized.lng.toFixed(3)}`;
    const inFlight = this.inFlightBootstraps.get(cellKey);
    if (inFlight) {
      return inFlight;
    }
    const run = this.runBootstrapForPoint(normalized, options).finally(() => {
      this.inFlightBootstraps.delete(cellKey);
    });
    this.inFlightBootstraps.set(cellKey, run);
    return run;
  }

  private async runBootstrapForPoint(
    normalized: Coordinate,
    options?: BoundaryBootstrapOptions,
  ): Promise<BoundaryFeatureRecord | null> {
    const requestId = this.resolveRequestId(options?.requestId);
    const requestOptions: BoundaryBootstrapOptions = {
      ...options,
      requestId,
    };
    const startedAtMs = Date.now();

    try {
      await this.recordBootstrapEvent({
        eventType: 'bootstrap_attempted',
        lookupPoint: normalized,
        options: requestOptions,
      });

      const reverseMatch = await this.reverseGeocodeMunicipality(
        normalized,
        requestId,
      );
      if (!reverseMatch) {
        await this.recordBootstrapEvent({
          eventType: 'no_boundary',
          lookupPoint: normalized,
          options: requestOptions,
        });
        this.bootstrapMetrics.recordDuration({
          outcome: 'no_boundary',
          triggerKind: requestOptions.triggerKind,
          durationMs: Date.now() - startedAtMs,
        });
        return null;
      }

      const geometry = await this.fetchBoundaryGeometry(
        reverseMatch.sourceBoundaryId,
        requestId,
      );
      if (!geometry) {
        await this.recordBootstrapEvent({
          eventType: 'invalid_boundary',
          lookupPoint: normalized,
          boundary: reverseMatch,
          message: 'TomTom municipality geometry missing or invalid',
          options: requestOptions,
        });
        this.logger.warn('TomTom municipality geometry missing', {
          sourceBoundaryId: reverseMatch.sourceBoundaryId,
          name: reverseMatch.name,
        });
        this.bootstrapMetrics.recordDuration({
          outcome: 'invalid_boundary',
          triggerKind: requestOptions.triggerKind,
          durationMs: Date.now() - startedAtMs,
        });
        return null;
      }

      const record = await this.upsertBoundary({
        ...reverseMatch,
        geometry,
        lookupPoint: normalized,
      });
      await this.recordBootstrapEvent({
        eventType: record ? 'bootstrap_succeeded' : 'invalid_boundary',
        lookupPoint: normalized,
        boundary: reverseMatch,
        message: record ? null : 'TomTom geometry did not cover lookup point',
        options: requestOptions,
      });
      this.bootstrapMetrics.recordDuration({
        outcome: record ? 'bootstrap_succeeded' : 'invalid_boundary',
        triggerKind: requestOptions.triggerKind,
        durationMs: Date.now() - startedAtMs,
      });
      return record;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await this.recordBootstrapEvent({
        eventType: 'error',
        lookupPoint: normalized,
        message: errorMessage,
        options: {
          ...requestOptions,
          stopReason:
            errorMessage === 'tomtom_config_missing'
              ? 'config_missing'
              : requestOptions.stopReason,
        },
      });
      this.logger.warn('TomTom municipality bootstrap failed', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      this.bootstrapMetrics.recordDuration({
        outcome: 'error',
        triggerKind: requestOptions.triggerKind,
        durationMs: Date.now() - startedAtMs,
      });
      return null;
    }
  }

  async findBoundaryBySourceIdentity(params: {
    sourceBoundaryId: string;
    sourceBoundaryType?: string | null;
    sourceProvider?: string | null;
  }): Promise<BoundaryFeatureRecord | null> {
    const sourceProvider = (params.sourceProvider ?? TOMTOM_SOURCE_PROVIDER)
      .trim()
      .toLowerCase();
    const sourceBoundaryId = params.sourceBoundaryId.trim();
    const sourceBoundaryType = (
      params.sourceBoundaryType ?? TOMTOM_MUNICIPALITY_BOUNDARY_TYPE
    ).trim();
    if (!sourceProvider || !sourceBoundaryId || !sourceBoundaryType) {
      return null;
    }

    const rows = await this.prisma.$queryRaw<
      BoundaryFeatureRecord[]
    >(Prisma.sql`
      SELECT
        source_provider AS "sourceProvider",
        source_boundary_id AS "sourceBoundaryId",
        source_boundary_type AS "sourceBoundaryType",
        provider_type AS "providerType",
        name,
        short_name AS "shortName",
        country_code AS "countryCode",
        state_code AS "stateCode"
      FROM geo_boundary_features
      WHERE source_provider = ${sourceProvider}
        AND source_boundary_id = ${sourceBoundaryId}
        AND source_boundary_type = ${sourceBoundaryType}
      LIMIT 1
    `);

    return rows[0] ?? null;
  }

  async recordLocalityMarketEnsured(params: {
    boundary: BoundaryFeatureRecord;
    marketKey: string;
    wasCreated: boolean;
    requestId?: string | null;
  }): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO market_bootstrap_events (
        request_id,
        source_provider,
        source_boundary_id,
        source_boundary_type,
        event_type,
        trigger_kind,
        market_key,
        candidate_name,
        metadata
      )
      VALUES (
        ${params.requestId ?? null}::uuid,
        ${params.boundary.sourceProvider},
        ${params.boundary.sourceBoundaryId},
        ${params.boundary.sourceBoundaryType},
        'locality_market_ensured',
        'market_registry',
        ${params.marketKey},
        ${params.boundary.shortName ?? params.boundary.name},
        ${JSON.stringify({
          source: 'boundary_feature',
          wasCreated: params.wasCreated,
        })}::jsonb
      )
    `);
    this.bootstrapMetrics.recordEvent({
      eventType: 'locality_market_ensured',
      sourceProvider: params.boundary.sourceProvider,
      triggerKind: 'market_registry',
      stopReason: null,
    });
  }

  async recordBootstrapLifecycleEvent(params: {
    eventType: string;
    requestId?: string | null;
    triggerKind?: BoundaryBootstrapOptions['triggerKind'];
    attemptIndex?: number | null;
    uncoveredAreaMeters?: number | null;
    uncoveredAreaShare?: number | null;
    stopReason?: string | null;
    message?: string | null;
    lookupPoint?: Coordinate | null;
  }): Promise<void> {
    await this.recordBootstrapEvent({
      eventType: params.eventType,
      lookupPoint: params.lookupPoint ?? null,
      message: params.message ?? null,
      options: {
        requestId: params.requestId ?? null,
        triggerKind: params.triggerKind,
        attemptIndex: params.attemptIndex ?? null,
        uncoveredAreaMeters: params.uncoveredAreaMeters ?? null,
        uncoveredAreaShare: params.uncoveredAreaShare ?? null,
        stopReason: params.stopReason ?? null,
      },
    });
  }

  private async findBoundaryContainingPoint(
    point: Coordinate,
  ): Promise<BoundaryFeatureRecord | null> {
    const normalized = this.normalizePoint(point);
    if (!normalized) {
      return null;
    }

    const pointSql = Prisma.sql`ST_SetSRID(ST_MakePoint(${normalized.lng}, ${normalized.lat}), 4326)`;
    const rows = await this.prisma.$queryRaw<
      BoundaryFeatureRecord[]
    >(Prisma.sql`
      SELECT
        source_provider AS "sourceProvider",
        source_boundary_id AS "sourceBoundaryId",
        source_boundary_type AS "sourceBoundaryType",
        provider_type AS "providerType",
        name,
        short_name AS "shortName",
        country_code AS "countryCode",
        state_code AS "stateCode"
      FROM geo_boundary_features
      WHERE source_provider = ${TOMTOM_SOURCE_PROVIDER}
        AND source_boundary_type = ${TOMTOM_MUNICIPALITY_BOUNDARY_TYPE}
        AND geometry IS NOT NULL
        AND geometry && ${pointSql}
        AND ST_Covers(geometry, ${pointSql})
      ORDER BY ST_Area(geometry::geography) ASC
      LIMIT 1
    `);

    return rows[0] ?? null;
  }

  private async reverseGeocodeMunicipality(
    point: Coordinate,
    requestId: string,
  ): Promise<
    | (BoundaryFeatureRecord & {
        position: Coordinate | null;
        boundingBox: {
          northEast: Coordinate | null;
          southWest: Coordinate | null;
        } | null;
        rawAddress: TomTomReverseGeocodeAddress | null;
      })
    | null
  > {
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      this.logger.warn('TomTom API key is not configured');
      throw new Error('tomtom_config_missing');
    }

    this.usageLedger.record({
      service: 'tomtom',
      operation: 'reverseGeocode',
      caller: 'market-bootstrap.reverseGeocodeMunicipality',
    });
    const url = `${this.reverseGeocodeBaseUrl.replace(/\/$/, '')}/${
      point.lat
    },${point.lng}.json`;
    const params: Record<string, string> = {
      key: apiKey,
      entityType: TOMTOM_MUNICIPALITY_BOUNDARY_TYPE,
      language: this.language,
    };
    if (this.apiVersion) {
      params.apiVersion = this.apiVersion;
    }

    const response = await firstValueFrom(
      this.httpService.get<TomTomReverseGeocodeResponse>(url, {
        params,
        headers: this.buildTrackingHeaders(requestId),
        timeout: this.timeoutMs,
      }),
    );

    const matches = Array.isArray(response.data?.addresses)
      ? response.data.addresses
      : [];
    const match = matches.find(
      (entry) =>
        entry.entityType === TOMTOM_MUNICIPALITY_BOUNDARY_TYPE &&
        typeof entry.dataSources?.geometry?.id === 'string',
    );
    if (!match) {
      return null;
    }

    const address = match.address ?? null;
    const countryCode = this.normalizeCountryCode(address?.countryCode);
    if (countryCode !== 'US') {
      return null;
    }

    const sourceBoundaryId = match.dataSources?.geometry?.id?.trim() ?? '';
    const name = this.resolveBoundaryName(address);
    if (!sourceBoundaryId || !name) {
      return null;
    }

    return {
      sourceProvider: TOMTOM_SOURCE_PROVIDER,
      sourceBoundaryId,
      sourceBoundaryType: TOMTOM_MUNICIPALITY_BOUNDARY_TYPE,
      providerType: 'geometry',
      name,
      shortName:
        address?.municipality?.trim() || address?.postalName?.trim() || null,
      countryCode,
      stateCode: this.normalizeStateCode(address?.countrySubdivision),
      position: this.parseLatLng(match.position),
      boundingBox: this.parseBoundingBox(address?.boundingBox),
      rawAddress: address,
    };
  }

  private async fetchBoundaryGeometry(
    sourceBoundaryId: string,
    requestId: string,
  ): Promise<GeoJsonFeatureCollection | null> {
    const apiKey = this.resolveApiKey();
    if (!apiKey) {
      return null;
    }

    this.usageLedger.record({
      service: 'tomtom',
      operation: 'boundaryGeometry',
      caller: 'market-bootstrap.fetchBoundaryGeometry',
    });
    const params: Record<string, string | number> = {
      key: apiKey,
      geometries: sourceBoundaryId,
      language: this.language,
    };
    if (this.geometryZoom !== null) {
      params.geometriesZoom = this.geometryZoom;
    }
    if (this.apiVersion) {
      params.apiVersion = this.apiVersion;
    }

    const response = await firstValueFrom(
      this.httpService.get<TomTomAdditionalDataResponse>(
        this.additionalDataUrl,
        {
          params,
          headers: this.buildTrackingHeaders(requestId),
          timeout: this.timeoutMs,
        },
      ),
    );

    const items = Array.isArray(response.data?.additionalData)
      ? response.data.additionalData
      : [];
    const item = items.find((entry) => {
      const id = entry.providerID ?? entry.providerId;
      return id === sourceBoundaryId;
    });
    if (item?.error) {
      this.logger.warn('TomTom additional data geometry error', {
        sourceBoundaryId,
        tomTomError: item.error,
      });
      return null;
    }

    const geometryData = item?.geometryData ?? null;
    if (
      !geometryData ||
      geometryData.type !== 'FeatureCollection' ||
      !Array.isArray(geometryData.features) ||
      geometryData.features.length === 0
    ) {
      return null;
    }

    const polygonFeatures = geometryData.features.filter((feature) => {
      const geometryType = feature.geometry?.type;
      return geometryType === 'Polygon' || geometryType === 'MultiPolygon';
    });

    if (!polygonFeatures.length) {
      return null;
    }

    return {
      type: 'FeatureCollection',
      features: polygonFeatures,
    };
  }

  private async upsertBoundary(
    boundary: BoundaryFeatureRecord & {
      position: Coordinate | null;
      boundingBox: {
        northEast: Coordinate | null;
        southWest: Coordinate | null;
      } | null;
      rawAddress: TomTomReverseGeocodeAddress | null;
      lookupPoint: Coordinate;
      geometry: GeoJsonFeatureCollection;
    },
  ): Promise<BoundaryFeatureRecord | null> {
    const metadata = {
      source: TOMTOM_SOURCE_PROVIDER,
      rawAddress: boundary.rawAddress,
      lookupPoint: boundary.lookupPoint,
      reverseGeocodePosition: boundary.position,
      reverseGeocodeBoundingBox: boundary.boundingBox,
    };

    const rows = await this.prisma.$queryRaw<
      BoundaryFeatureRecord[]
    >(Prisma.sql`
      WITH raw_input AS (
        SELECT
          ${JSON.stringify(boundary.geometry)}::jsonb AS geojson,
          ${JSON.stringify(metadata)}::jsonb AS metadata,
          ST_SetSRID(
            ST_MakePoint(${boundary.lookupPoint.lng}, ${
              boundary.lookupPoint.lat
            }),
            4326
          ) AS lookup_point
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
          name,
          short_name AS "shortName",
          country_code AS "countryCode",
          state_code AS "stateCode"
      )
      SELECT * FROM upserted
    `);

    const record = rows[0] ?? null;
    if (record) {
      this.logger.info('Bootstrapped boundary feature', {
        sourceProvider: record.sourceProvider,
        sourceBoundaryId: record.sourceBoundaryId,
        sourceBoundaryType: record.sourceBoundaryType,
        name: record.name,
      });
    }
    return record;
  }

  private async recordBootstrapEvent(params: {
    eventType: string;
    lookupPoint?: Coordinate | null;
    boundary?: BoundaryFeatureRecord | null;
    marketKey?: string | null;
    message?: string | null;
    options?: BoundaryBootstrapOptions;
  }): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO market_bootstrap_events (
        request_id,
        source_provider,
        source_boundary_id,
        source_boundary_type,
        event_type,
        trigger_kind,
        market_key,
        attempt_index,
        uncovered_area_meters,
        uncovered_area_share,
        candidate_name,
        stop_reason,
        lookup_latitude,
        lookup_longitude,
        message,
        metadata
      )
      VALUES (
        ${params.options?.requestId ?? null}::uuid,
        ${params.boundary?.sourceProvider ?? TOMTOM_SOURCE_PROVIDER},
        ${params.boundary?.sourceBoundaryId ?? null},
        ${params.boundary?.sourceBoundaryType ?? null},
        ${params.eventType},
        ${params.options?.triggerKind ?? null},
        ${params.marketKey ?? null},
        ${params.options?.attemptIndex ?? null},
        ${params.options?.uncoveredAreaMeters ?? null},
        ${params.options?.uncoveredAreaShare ?? null},
        ${params.boundary?.shortName ?? params.boundary?.name ?? null},
        ${params.options?.stopReason ?? null},
        ${params.lookupPoint?.lat ?? null},
        ${params.lookupPoint?.lng ?? null},
        ${params.message ?? null},
        ${JSON.stringify({
          source: TOMTOM_SOURCE_PROVIDER,
          attemptIndex: params.options?.attemptIndex ?? null,
          uncoveredAreaMeters: params.options?.uncoveredAreaMeters ?? null,
          uncoveredAreaShare: params.options?.uncoveredAreaShare ?? null,
          candidateName:
            params.boundary?.shortName ?? params.boundary?.name ?? null,
          stopReason: params.options?.stopReason ?? null,
        })}::jsonb
      )
    `);
    this.bootstrapMetrics.recordEvent({
      eventType: params.eventType,
      sourceProvider: params.boundary?.sourceProvider ?? TOMTOM_SOURCE_PROVIDER,
      triggerKind: params.options?.triggerKind ?? null,
      stopReason: params.options?.stopReason ?? null,
    });
  }

  private resolveApiKey(): string | null {
    return (
      this.configService.get<string>('tomtom.apiKey')?.trim() ||
      process.env.TOMTOM_API_KEY?.trim() ||
      null
    );
  }

  private resolveRequestId(value?: string | null): string {
    const normalized = typeof value === 'string' ? value.trim() : '';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      normalized,
    )
      ? normalized
      : randomUUID();
  }

  private buildTrackingHeaders(requestId: string): Record<string, string> {
    return {
      'Tracking-ID': requestId,
    };
  }

  private resolveBoundaryName(
    address?: TomTomReverseGeocodeAddress | null,
  ): string | null {
    return (
      address?.municipality?.trim() ||
      address?.postalName?.trim() ||
      address?.freeformAddress?.split(',')[0]?.trim() ||
      null
    );
  }

  private normalizeCountryCode(value?: string | null): string | null {
    const normalized =
      typeof value === 'string' ? value.trim().toUpperCase() : '';
    return normalized === 'US' ? normalized : null;
  }

  private normalizeStateCode(value?: string | null): string | null {
    const normalized =
      typeof value === 'string' ? value.trim().toUpperCase() : '';
    if (/^[A-Z]{2}$/.test(normalized)) {
      return normalized;
    }
    return US_STATE_CODE_BY_NAME.get(normalized) ?? null;
  }

  private parseLatLng(value?: string | null): Coordinate | null {
    if (!value) {
      return null;
    }
    const [latRaw, lngRaw] = value.split(',');
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    return { lat, lng };
  }

  private parseBoundingBox(
    value?: TomTomReverseGeocodeAddress['boundingBox'],
  ): { northEast: Coordinate | null; southWest: Coordinate | null } | null {
    if (!value) {
      return null;
    }
    return {
      northEast: this.parseLatLng(value.northEast),
      southWest: this.parseLatLng(value.southWest),
    };
  }

  private normalizePoint(point?: Coordinate | null): Coordinate | null {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
      return null;
    }
    return point;
  }
}
