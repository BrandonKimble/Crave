import { Injectable } from '@nestjs/common';
import { MarketType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  MarketResolveResult,
  MarketResolverService,
} from './market-resolver.service';
import { pointWithinBounds } from './market-geo.util';

type Coordinate = { lat: number; lng: number };
type Bounds = { northEast: Coordinate; southWest: Coordinate };

export type EnsuredMarketResult = {
  marketKey: string;
  marketName: string;
  marketShortName: string | null;
  marketType: MarketType;
  isCollectable: boolean;
  wasCreated: boolean;
};

export type CommunityMarketTarget = {
  community: string;
  marketKey: string;
  marketName: string;
  marketShortName: string | null;
  isCollectable: boolean;
  schedulerEnabled: boolean;
};

export type ViewportCoverageMarket = {
  marketKey: string;
  marketName: string;
  marketShortName: string | null;
  marketType: MarketType;
  isCollectable: boolean;
  overlapAreaMeters: number;
};

export type ViewportCoverageResult = {
  status: 'resolved' | 'multi_market' | 'no_market' | 'error';
  market: {
    marketKey: string;
    marketName: string;
    marketShortName: string | null;
    marketType: MarketType;
    isCollectable: boolean;
  } | null;
  markets: ViewportCoverageMarket[];
  collectableMarketKeys: string[];
  resolution: {
    anchorType: 'user_location' | 'viewport_center' | 'viewport_coverage';
    viewportContainsUser: boolean | null;
    candidatePlaceName: string | null;
    candidatePlaceGeoId: string | null;
  };
  cta: {
    kind: 'create_poll' | 'none';
    label: string | null;
    prompt: string | null;
  };
};

type MarketCoverageRow = {
  marketKey: string;
  marketName: string;
  marketShortName: string | null;
  marketType: MarketType;
  isCollectable: boolean;
  overlapAreaMeters: Prisma.Decimal | number | string | null;
};

type PlaceCoverageRow = {
  placeGeoId: string;
  name: string;
  shortName: string | null;
  overlapAreaMeters: Prisma.Decimal | number | string | null;
};

const UNDISCOVERED_PLACE_MIN_OVERLAP_SHARE = 0.005;
const UNDISCOVERED_PLACE_MIN_OVERLAP_AREA_METERS = 250_000;
const EFFECTIVE_TIE_OVERLAP_SHARE_DELTA = 0.05;

@Injectable()
export class MarketRegistryService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly marketResolver: MarketResolverService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('MarketRegistryService');
  }

  async resolveOrEnsureForPollCreation(params: {
    bounds?: Bounds | null;
    userLocation?: Coordinate | null;
  }): Promise<EnsuredMarketResult | null> {
    return this.resolveOrEnsureForLocation({
      bounds: params.bounds ?? null,
      userLocation: params.userLocation ?? null,
      mode: 'polls',
    });
  }

  async resolveOrEnsureForLocation(params: {
    bounds?: Bounds | null;
    userLocation?: Coordinate | null;
    mode?: 'polls' | 'search';
  }): Promise<EnsuredMarketResult | null> {
    const resolved = await this.marketResolver.resolve({
      bounds: params.bounds ?? null,
      userLocation: params.userLocation ?? null,
      mode: params.mode ?? 'search',
    });

    if (resolved.market) {
      return {
        marketKey: resolved.market.marketKey,
        marketName: resolved.market.marketName,
        marketShortName: resolved.market.marketShortName,
        marketType: resolved.market.marketType,
        isCollectable: resolved.market.isCollectable,
        wasCreated: false,
      };
    }

    const placeGeoId = resolved.resolution.candidatePlaceGeoId;
    if (!placeGeoId) {
      return null;
    }

    return this.ensureLocalFallbackMarket(placeGeoId, resolved);
  }

  async resolveViewportCoverage(params: {
    bounds?: Bounds | null;
    userLocation?: Coordinate | null;
    mode?: 'polls' | 'search';
    ensureLocalFallbackMarkets?: boolean;
  }): Promise<ViewportCoverageResult> {
    const bounds = params.bounds ?? null;
    const userLocation = this.normalizeCoordinate(params.userLocation ?? null);
    const viewportContainsUser =
      bounds && userLocation ? pointWithinBounds(userLocation, bounds) : null;

    if (!bounds) {
      if (params.ensureLocalFallbackMarkets) {
        const ensured = await this.resolveOrEnsureForLocation({
          userLocation,
          mode: params.mode ?? 'search',
        });

        if (!ensured) {
          return {
            status: 'no_market',
            market: null,
            markets: [],
            collectableMarketKeys: [],
            resolution: {
              anchorType: userLocation ? 'user_location' : 'viewport_center',
              viewportContainsUser,
              candidatePlaceName: null,
              candidatePlaceGeoId: null,
            },
            cta: { kind: 'none', label: null, prompt: null },
          };
        }

        return {
          status: 'resolved',
          market: {
            marketKey: ensured.marketKey,
            marketName: ensured.marketName,
            marketShortName: ensured.marketShortName,
            marketType: ensured.marketType,
            isCollectable: ensured.isCollectable,
          },
          markets: [
            {
              marketKey: ensured.marketKey,
              marketName: ensured.marketName,
              marketShortName: ensured.marketShortName,
              marketType: ensured.marketType,
              isCollectable: ensured.isCollectable,
              overlapAreaMeters: 0,
            },
          ],
          collectableMarketKeys: ensured.isCollectable
            ? await this.resolveCollectableMarketKeys([ensured.marketKey])
            : [],
          resolution: {
            anchorType: userLocation ? 'user_location' : 'viewport_center',
            viewportContainsUser,
            candidatePlaceName: null,
            candidatePlaceGeoId: null,
          },
          cta: {
            kind: 'create_poll',
            label: `Create a poll for ${
              ensured.marketShortName ?? ensured.marketName
            }`,
            prompt: `Create a poll for ${
              ensured.marketShortName ?? ensured.marketName
            }`,
          },
        };
      }

      const resolved = await this.marketResolver.resolve({
        userLocation,
        mode: params.mode ?? 'search',
      });

      if (!resolved.market) {
        return {
          status: 'no_market',
          market: null,
          markets: [],
          collectableMarketKeys: [],
          resolution: {
            anchorType: userLocation ? 'user_location' : 'viewport_center',
            viewportContainsUser,
            candidatePlaceName: resolved.resolution.candidatePlaceName ?? null,
            candidatePlaceGeoId: resolved.resolution.candidatePlaceGeoId ?? null,
          },
          cta: resolved.cta,
        };
      }

      return {
        status: 'resolved',
        market: {
          marketKey: resolved.market.marketKey,
          marketName: resolved.market.marketName,
          marketShortName: resolved.market.marketShortName,
          marketType: resolved.market.marketType,
          isCollectable: resolved.market.isCollectable,
        },
        markets: [
          {
            marketKey: resolved.market.marketKey,
            marketName: resolved.market.marketName,
            marketShortName: resolved.market.marketShortName,
            marketType: resolved.market.marketType,
            isCollectable: resolved.market.isCollectable,
            overlapAreaMeters: 0,
          },
        ],
        collectableMarketKeys: resolved.market.isCollectable
          ? await this.resolveCollectableMarketKeys([resolved.market.marketKey])
          : [],
        resolution: {
          anchorType: userLocation ? 'user_location' : 'viewport_center',
          viewportContainsUser,
          candidatePlaceName: resolved.resolution.candidatePlaceName ?? null,
          candidatePlaceGeoId: resolved.resolution.candidatePlaceGeoId ?? null,
        },
        cta: resolved.market.marketKey
          ? {
              kind: 'create_poll',
              label: `Create a poll for ${
                resolved.market.marketShortName ?? resolved.market.marketName
              }`,
              prompt: `Create a poll for ${
                resolved.market.marketShortName ?? resolved.market.marketName
              }`,
            }
          : resolved.cta,
      };
    }

    try {
      let markets = await this.findIntersectingMarkets(bounds);
      let candidatePlace: PlaceCoverageRow | null = null;

      if (params.ensureLocalFallbackMarkets) {
        const uncoveredPlaces = await this.findUncoveredIntersectingPlaces(bounds);
        candidatePlace = uncoveredPlaces[0] ?? null;

        for (const place of uncoveredPlaces) {
          await this.ensureLocalFallbackMarketForPlace(
            place.placeGeoId,
            place.shortName ?? place.name,
          );
        }

        if (uncoveredPlaces.length > 0) {
          markets = await this.findIntersectingMarkets(bounds);
        }
      } else if (markets.length === 0) {
        const uncoveredPlaces = await this.findUncoveredIntersectingPlaces(bounds);
        candidatePlace = uncoveredPlaces[0] ?? null;
      }

      if (markets.length === 0) {
        const placeName =
          candidatePlace?.shortName?.trim() || candidatePlace?.name?.trim() || null;
        return {
          status: 'no_market',
          market: null,
          markets: [],
          collectableMarketKeys: [],
          resolution: {
            anchorType: 'viewport_coverage',
            viewportContainsUser,
            candidatePlaceName: placeName,
            candidatePlaceGeoId: candidatePlace?.placeGeoId ?? null,
          },
          cta: placeName
            ? {
                kind: 'create_poll',
                label: `Create the first poll for ${placeName}`,
                prompt: `Create a poll for ${placeName}`,
              }
            : { kind: 'none', label: null, prompt: null },
        };
      }

      const selected = await this.selectViewportDisplayMarket({
        markets,
      });
      const collectableMarketKeys = await this.resolveCollectableMarketKeys(
        markets.map((market) => market.marketKey),
      );
      const selectedDisplayName = selected?.marketShortName ?? selected?.marketName;

      return {
        status: selected?.selectedVia === 'ambiguous' ? 'multi_market' : 'resolved',
        market: selected
          ? {
              marketKey: selected.marketKey,
              marketName: selected.marketName,
              marketShortName: selected.marketShortName,
              marketType: selected.marketType,
              isCollectable: selected.isCollectable,
            }
          : null,
        markets,
        collectableMarketKeys,
        resolution: {
          anchorType: 'viewport_coverage',
          viewportContainsUser,
          candidatePlaceName: null,
          candidatePlaceGeoId: null,
        },
        cta: selectedDisplayName
          ? {
              kind: 'create_poll',
              label: `Create a poll for ${selectedDisplayName}`,
              prompt: `Create a poll for ${selectedDisplayName}`,
            }
          : { kind: 'none', label: null, prompt: null },
      };
    } catch (error) {
      this.logger.warn('Failed to resolve viewport coverage', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return {
        status: 'error',
        market: null,
        markets: [],
        collectableMarketKeys: [],
        resolution: {
          anchorType: 'viewport_coverage',
          viewportContainsUser,
          candidatePlaceName: null,
          candidatePlaceGeoId: null,
        },
        cta: { kind: 'none', label: null, prompt: null },
      };
    }
  }

  async resolveMarketKeyForCommunity(
    community?: string | null,
  ): Promise<string | null> {
    const normalized =
      typeof community === 'string' ? community.trim().toLowerCase() : '';
    if (!normalized) {
      return null;
    }

    const linkedCommunity = await this.prisma.collectionCommunity.findFirst({
      where: {
        communityName: {
          equals: normalized,
          mode: 'insensitive',
        },
        isActive: true,
      },
      select: {
        marketKey: true,
      },
    });

    const linkedMarketKey = this.normalizeMarketKey(linkedCommunity?.marketKey);
    if (!linkedMarketKey) {
      return null;
    }

    const existingLinkedMarket = await this.prisma.market.findFirst({
      where: {
        marketKey: linkedMarketKey,
        isActive: true,
      },
      select: {
        marketKey: true,
      },
    });
    return existingLinkedMarket?.marketKey?.trim().toLowerCase() ?? null;
  }

  async listCommunityMarketTargets(params?: {
    onlyCollectable?: boolean;
    onlySchedulerEnabled?: boolean;
  }): Promise<CommunityMarketTarget[]> {
    const rows = await this.prisma.collectionCommunity.findMany({
      where: {
        isActive: true,
        marketKey: { not: null },
      },
      orderBy: [{ communityName: 'asc' }],
      select: {
        communityName: true,
        marketKey: true,
      },
    });

    const marketKeys = Array.from(
      new Set(
        rows
          .map((row) => this.normalizeMarketKey(row.marketKey))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (marketKeys.length === 0) {
      return [];
    }

    const markets = await this.prisma.market.findMany({
      where: {
        marketKey: { in: marketKeys },
        isActive: true,
        ...(params?.onlyCollectable ? { isCollectable: true } : {}),
        ...(params?.onlySchedulerEnabled ? { schedulerEnabled: true } : {}),
      },
      select: {
        marketKey: true,
        marketName: true,
        marketShortName: true,
        isCollectable: true,
        schedulerEnabled: true,
      },
    });

    const marketsByKey = new Map(
      markets.map((market) => [market.marketKey.trim().toLowerCase(), market]),
    );

    const targets: CommunityMarketTarget[] = [];
    for (const row of rows) {
      const community =
        typeof row.communityName === 'string'
          ? row.communityName.trim().toLowerCase()
          : '';
      const marketKey = this.normalizeMarketKey(row.marketKey);
      if (!community || !marketKey) {
        continue;
      }
      const market = marketsByKey.get(marketKey);
      if (!market) {
        continue;
      }
      targets.push({
        community,
        marketKey,
        marketName: market.marketName,
        marketShortName: market.marketShortName,
        isCollectable: market.isCollectable,
        schedulerEnabled: market.schedulerEnabled,
      });
    }

    return targets;
  }

  async resolveCollectableMarketKey(
    marketKey?: string | null,
  ): Promise<string | null> {
    const normalizedMarketKey = this.normalizeMarketKey(marketKey);
    if (!normalizedMarketKey) {
      return null;
    }

    const market = await this.prisma.market.findFirst({
      where: {
        marketKey: normalizedMarketKey,
        isActive: true,
        isCollectable: true,
      },
      select: {
        marketKey: true,
      },
    });

    if (!market?.marketKey) {
      return null;
    }

    const linkedCommunity = await this.prisma.collectionCommunity.findFirst({
      where: {
        marketKey: {
          equals: normalizedMarketKey,
          mode: 'insensitive',
        },
        isActive: true,
      },
      select: {
        communityName: true,
      },
    });

    return linkedCommunity ? normalizedMarketKey : null;
  }

  async resolveCollectableMarketKeys(
    marketKeys: Array<string | null | undefined>,
  ): Promise<string[]> {
    const normalizedMarketKeys = Array.from(
      new Set(
        marketKeys
          .map((marketKey) => this.normalizeMarketKey(marketKey))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (normalizedMarketKeys.length === 0) {
      return [];
    }

    const linkedRows = await this.prisma.collectionCommunity.findMany({
      where: {
        isActive: true,
        marketKey: { in: normalizedMarketKeys },
      },
      select: {
        marketKey: true,
      },
    });

    const linkedMarketKeys = new Set(
      linkedRows
        .map((row) => this.normalizeMarketKey(row.marketKey))
        .filter((value): value is string => Boolean(value)),
    );

    const collectableMarkets = await this.prisma.market.findMany({
      where: {
        marketKey: { in: Array.from(linkedMarketKeys) },
        isActive: true,
        isCollectable: true,
      },
      select: {
        marketKey: true,
      },
    });

    return collectableMarkets
      .map((market) => this.normalizeMarketKey(market.marketKey))
      .filter((value): value is string => Boolean(value));
  }

  private async findIntersectingMarkets(
    bounds: Bounds,
  ): Promise<ViewportCoverageMarket[]> {
    const normalized = this.normalizeBounds(bounds);
    if (!normalized) {
      return [];
    }

    const envelopeSql = Prisma.sql`ST_SetSRID(ST_MakeEnvelope(${normalized.swLng}, ${normalized.swLat}, ${normalized.neLng}, ${normalized.neLat}), 4326)`;
    const rows = await this.prisma.$queryRaw<MarketCoverageRow[]>(Prisma.sql`
      SELECT
        m.market_key AS "marketKey",
        m.market_name AS "marketName",
        m.market_short_name AS "marketShortName",
        m.market_type AS "marketType",
        m.is_collectable AS "isCollectable",
        ST_Area(ST_Intersection(m.geometry, ${envelopeSql})::geography) AS "overlapAreaMeters"
      FROM core_markets m
      WHERE m.is_active = true
        AND m.geometry IS NOT NULL
        AND m.market_type IN (
          ${MarketType.cbsa_metro}::market_type,
          ${MarketType.cbsa_micro}::market_type,
          ${MarketType.local_fallback}::market_type
        )
        AND m.bbox_ne_latitude >= ${normalized.swLat}
        AND m.bbox_sw_latitude <= ${normalized.neLat}
        AND m.bbox_ne_longitude >= ${normalized.swLng}
        AND m.bbox_sw_longitude <= ${normalized.neLng}
        AND ST_Intersects(m.geometry, ${envelopeSql})
      ORDER BY
        ST_Area(ST_Intersection(m.geometry, ${envelopeSql})::geography) DESC,
        CASE
          WHEN m.market_type = ${MarketType.cbsa_metro}::market_type THEN 0
          WHEN m.market_type = ${MarketType.cbsa_micro}::market_type THEN 1
          ELSE 2
        END ASC
    `);

    return rows
      .map((row) => ({
        marketKey: row.marketKey,
        marketName: row.marketName,
        marketShortName: row.marketShortName,
        marketType: row.marketType,
        isCollectable: row.isCollectable,
        overlapAreaMeters: this.toPositiveNumber(row.overlapAreaMeters),
      }))
      .filter((row) => row.overlapAreaMeters > 0);
  }

  private async findUncoveredIntersectingPlaces(
    bounds: Bounds,
  ): Promise<PlaceCoverageRow[]> {
    const normalized = this.normalizeBounds(bounds);
    if (!normalized) {
      return [];
    }

    const envelopeSql = Prisma.sql`ST_SetSRID(ST_MakeEnvelope(${normalized.swLng}, ${normalized.swLat}, ${normalized.neLng}, ${normalized.neLat}), 4326)`;
    const rows = await this.prisma.$queryRaw<PlaceCoverageRow[]>(Prisma.sql`
      WITH viewport AS (
        SELECT
          ${envelopeSql} AS geometry,
          ST_Area(${envelopeSql}::geography) AS "viewportAreaMeters"
      ),
      covered AS (
        SELECT
          ST_UnaryUnion(ST_Collect(ST_Intersection(m.geometry, viewport.geometry))) AS geometry
        FROM core_markets m
        CROSS JOIN viewport
        WHERE m.is_active = true
          AND m.geometry IS NOT NULL
          AND m.market_type IN (
            ${MarketType.cbsa_metro}::market_type,
            ${MarketType.cbsa_micro}::market_type,
            ${MarketType.local_fallback}::market_type
          )
          AND m.bbox_ne_latitude >= ${normalized.swLat}
          AND m.bbox_sw_latitude <= ${normalized.neLat}
          AND m.bbox_ne_longitude >= ${normalized.swLng}
          AND m.bbox_sw_longitude <= ${normalized.neLng}
          AND ST_Intersects(m.geometry, viewport.geometry)
      ),
      uncovered AS (
        SELECT
          CASE
            WHEN covered.geometry IS NULL THEN viewport.geometry
            WHEN ST_Covers(covered.geometry, viewport.geometry) THEN NULL
            ELSE ST_Difference(viewport.geometry, covered.geometry)
          END AS geometry,
          viewport."viewportAreaMeters"
        FROM viewport
        LEFT JOIN covered ON TRUE
      )
      SELECT
        p.place_geoid AS "placeGeoId",
        p.name,
        p.short_name AS "shortName",
        ST_Area(ST_Intersection(p.geometry, uncovered.geometry)::geography) AS "overlapAreaMeters"
      FROM geo_census_place_boundaries p
      CROSS JOIN uncovered
      WHERE uncovered.geometry IS NOT NULL
        AND p.geometry IS NOT NULL
        AND p.bbox_ne_latitude >= ${normalized.swLat}
        AND p.bbox_sw_latitude <= ${normalized.neLat}
        AND p.bbox_ne_longitude >= ${normalized.swLng}
        AND p.bbox_sw_longitude <= ${normalized.neLng}
        AND ST_Intersects(p.geometry, uncovered.geometry)
        AND ST_Area(ST_Intersection(p.geometry, uncovered.geometry)::geography) >= ${UNDISCOVERED_PLACE_MIN_OVERLAP_AREA_METERS}
        AND (
          ST_Area(ST_Intersection(p.geometry, uncovered.geometry)::geography) / NULLIF(uncovered."viewportAreaMeters", 0)
        ) >= ${UNDISCOVERED_PLACE_MIN_OVERLAP_SHARE}
      ORDER BY ST_Area(ST_Intersection(p.geometry, uncovered.geometry)::geography) DESC
    `);

    return rows.filter(
      (row) => this.toPositiveNumber(row.overlapAreaMeters) > 0,
    );
  }

  private async ensureLocalFallbackMarketForPlace(
    placeGeoId: string,
    candidatePlaceName?: string | null,
  ): Promise<EnsuredMarketResult | null> {
    return this.ensureLocalFallbackMarket(placeGeoId, {
      status: 'no_market',
      market: null,
      resolution: {
        anchorType: 'viewport_center',
        viewportContainsUser: null,
        candidatePlaceName: candidatePlaceName ?? null,
        candidatePlaceGeoId: placeGeoId,
      },
      cta: { kind: 'none', label: null, prompt: null },
    });
  }

  private async selectViewportDisplayMarket(params: {
    markets: ViewportCoverageMarket[];
  }): Promise<(ViewportCoverageMarket & { selectedVia: 'dominant' | 'ambiguous' }) | null> {
    const { markets } = params;
    if (markets.length === 0) {
      return null;
    }

    const totalOverlap = markets.reduce(
      (sum, market) => sum + Math.max(0, market.overlapAreaMeters),
      0,
    );
    const sorted = [...markets].sort((left, right) => {
      const leftShare =
        totalOverlap > 0 ? left.overlapAreaMeters / totalOverlap : 0;
      const rightShare =
        totalOverlap > 0 ? right.overlapAreaMeters / totalOverlap : 0;
      const shareDelta = Math.abs(leftShare - rightShare);

      if (shareDelta > EFFECTIVE_TIE_OVERLAP_SHARE_DELTA) {
        return right.overlapAreaMeters - left.overlapAreaMeters;
      }

      const leftRank = this.marketTypePriority(left.marketType);
      const rightRank = this.marketTypePriority(right.marketType);
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      if (left.overlapAreaMeters !== right.overlapAreaMeters) {
        return right.overlapAreaMeters - left.overlapAreaMeters;
      }

      return left.marketKey.localeCompare(right.marketKey);
    });

    const [selected, runnerUp] = sorted;
    if (!selected) {
      return null;
    }

    const selectedShare =
      totalOverlap > 0 ? selected.overlapAreaMeters / totalOverlap : 1;
    const runnerUpShare =
      runnerUp && totalOverlap > 0 ? runnerUp.overlapAreaMeters / totalOverlap : 0;
    const selectedVia =
      runnerUp &&
      Math.abs(selectedShare - runnerUpShare) <= EFFECTIVE_TIE_OVERLAP_SHARE_DELTA
        ? 'ambiguous'
        : 'dominant';

    return { ...selected, selectedVia };
  }

  private marketTypePriority(marketType: MarketType): number {
    switch (marketType) {
      case MarketType.cbsa_metro:
        return 0;
      case MarketType.cbsa_micro:
        return 1;
      case MarketType.local_fallback:
        return 2;
      default:
        return 3;
    }
  }

  private normalizeBounds(bounds?: Bounds | null): {
    swLat: number;
    neLat: number;
    swLng: number;
    neLng: number;
  } | null {
    if (
      !bounds ||
      !this.normalizeCoordinate(bounds.northEast) ||
      !this.normalizeCoordinate(bounds.southWest)
    ) {
      return null;
    }

    return {
      swLat: Math.min(bounds.southWest.lat, bounds.northEast.lat),
      neLat: Math.max(bounds.southWest.lat, bounds.northEast.lat),
      swLng: Math.min(bounds.southWest.lng, bounds.northEast.lng),
      neLng: Math.max(bounds.southWest.lng, bounds.northEast.lng),
    };
  }

  private normalizeCoordinate(
    coordinate?: Coordinate | null,
  ): Coordinate | null {
    if (
      !coordinate ||
      !Number.isFinite(coordinate.lat) ||
      !Number.isFinite(coordinate.lng)
    ) {
      return null;
    }

    return coordinate;
  }

  private toPositiveNumber(
    value: Prisma.Decimal | number | string | null | undefined,
  ): number {
    if (value instanceof Prisma.Decimal) {
      return Math.max(0, value.toNumber());
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, value);
    }
    return 0;
  }

  private async ensureLocalFallbackMarket(
    placeGeoId: string,
    resolved: MarketResolveResult,
  ): Promise<EnsuredMarketResult | null> {
    const existing = await this.prisma.market.findFirst({
      where: {
        marketType: MarketType.local_fallback,
        censusPlaceGeoId: placeGeoId,
      },
      select: {
        marketKey: true,
        marketName: true,
        marketShortName: true,
        marketType: true,
        isCollectable: true,
      },
    });

    if (existing) {
      return {
        marketKey: existing.marketKey,
        marketName: existing.marketName,
        marketShortName: existing.marketShortName,
        marketType: existing.marketType,
        isCollectable: existing.isCollectable,
        wasCreated: false,
      };
    }

    const place = await this.prisma.censusPlaceBoundary.findUnique({
      where: { placeGeoId },
      select: {
        placeGeoId: true,
        name: true,
        shortName: true,
        stateCode: true,
        countryCode: true,
      },
    });

    if (!place) {
      this.logger.warn(
        'Unable to ensure local fallback market: place missing',
        {
          placeGeoId,
        },
      );
      return null;
    }

    const marketKey = `us-place-${place.placeGeoId}`;
    const marketName = (place.shortName ?? place.name).trim();
    const marketShortName = (place.shortName ?? place.name).trim() || null;

    const rows = await this.prisma.$queryRaw<
      Array<{
        marketKey: string;
        marketName: string;
        marketShortName: string | null;
        marketType: MarketType;
        isCollectable: boolean;
      }>
    >(Prisma.sql`
      INSERT INTO core_markets (
        market_key,
        market_name,
        market_short_name,
        market_type,
        country_code,
        state_code,
        census_place_geoid,
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
        ${marketKey},
        ${marketName},
        ${marketShortName},
        ${MarketType.local_fallback}::market_type,
        ${place.countryCode},
        ${place.stateCode},
        place_geoid,
        true,
        false,
        true,
        center_latitude,
        center_longitude,
        bbox_ne_latitude,
        bbox_ne_longitude,
        bbox_sw_latitude,
        bbox_sw_longitude,
        geometry,
        jsonb_build_object(
          'source',
          'census_place',
          'placeGeoId',
          place_geoid,
          'candidatePlaceName',
          ${resolved.resolution.candidatePlaceName}
        ),
        now()
      FROM geo_census_place_boundaries
      WHERE place_geoid = ${placeGeoId}
      ON CONFLICT (market_key) DO UPDATE SET
        market_name = EXCLUDED.market_name,
        market_short_name = EXCLUDED.market_short_name,
        state_code = EXCLUDED.state_code,
        census_place_geoid = EXCLUDED.census_place_geoid,
        is_collectable = EXCLUDED.is_collectable,
        scheduler_enabled = EXCLUDED.scheduler_enabled,
        is_active = EXCLUDED.is_active,
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
        market_name AS "marketName",
        market_short_name AS "marketShortName",
        market_type AS "marketType",
        is_collectable AS "isCollectable"
    `);

    const created = rows[0] ?? null;
    if (!created) {
      return null;
    }

    this.logger.info('Ensured local fallback market', {
      marketKey: created.marketKey,
      placeGeoId,
    });

    return {
      marketKey: created.marketKey,
      marketName: created.marketName,
      marketShortName: created.marketShortName,
      marketType: created.marketType,
      isCollectable: created.isCollectable,
      wasCreated: true,
    };
  }

  private normalizeMarketKey(marketKey?: string | null): string | null {
    const normalized =
      typeof marketKey === 'string' ? marketKey.trim().toLowerCase() : '';
    return normalized.length > 0 ? normalized : null;
  }
}
