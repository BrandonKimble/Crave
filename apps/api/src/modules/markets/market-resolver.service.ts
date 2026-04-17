import { Injectable } from '@nestjs/common';
import { MarketType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { pointWithinBounds } from './market-geo.util';

type Coordinate = { lat: number; lng: number };
type Bounds = { northEast: Coordinate; southWest: Coordinate };

type MarketCandidateRow = {
  marketKey: string;
  marketName: string;
  marketShortName: string | null;
  marketType: MarketType;
  isCollectable: boolean;
  bboxNeLat: Prisma.Decimal | number | null;
  bboxNeLng: Prisma.Decimal | number | null;
  bboxSwLat: Prisma.Decimal | number | null;
  bboxSwLng: Prisma.Decimal | number | null;
};

type PlaceCandidateRow = {
  placeGeoId: string;
  name: string;
  shortName: string | null;
  bboxNeLat: Prisma.Decimal | number | null;
  bboxNeLng: Prisma.Decimal | number | null;
  bboxSwLat: Prisma.Decimal | number | null;
  bboxSwLng: Prisma.Decimal | number | null;
};

export type MarketResolveResult = {
  status: 'resolved' | 'no_market' | 'error';
  market: {
    marketKey: string;
    marketName: string;
    marketShortName: string | null;
    marketType: MarketType;
    isCollectable: boolean;
  } | null;
  resolution: {
    anchorType: 'user_location' | 'viewport_center';
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

@Injectable()
export class MarketResolverService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('MarketResolverService');
  }

  async resolve(params: {
    bounds?: Bounds | null;
    userLocation?: Coordinate | null;
    mode?: 'polls' | 'search';
  }): Promise<MarketResolveResult> {
    const bounds = params.bounds ?? null;
    const userLocation = this.normalizePoint(params.userLocation ?? null);
    const viewportContainsUser =
      bounds && userLocation ? pointWithinBounds(userLocation, bounds) : null;
    const anchor = userLocation ?? this.resolveViewportCenter(bounds);
    const anchorType: 'user_location' | 'viewport_center' = userLocation
      ? 'user_location'
      : 'viewport_center';

    if (!anchor) {
      return {
        status: 'no_market',
        market: null,
        resolution: {
          anchorType,
          viewportContainsUser,
          candidatePlaceName: null,
          candidatePlaceGeoId: null,
        },
        cta: { kind: 'none', label: null, prompt: null },
      };
    }

    try {
      const market = await this.findMarket(anchor, MarketType.cbsa_metro);
      if (market) {
        return this.buildResolvedResult(
          market,
          anchorType,
          viewportContainsUser,
        );
      }

      const microMarket = await this.findMarket(anchor, MarketType.cbsa_micro);
      if (microMarket) {
        return this.buildResolvedResult(
          microMarket,
          anchorType,
          viewportContainsUser,
        );
      }

      const place = await this.findPlace(anchor);
      if (place) {
        const localFallbackMarket = await this.findLocalFallbackMarket(
          place.placeGeoId,
        );
        if (localFallbackMarket) {
          return this.buildResolvedResult(
            localFallbackMarket,
            anchorType,
            viewportContainsUser,
          );
        }

        const placeName = place.shortName ?? place.name;
        return {
          status: 'no_market',
          market: null,
          resolution: {
            anchorType,
            viewportContainsUser,
            candidatePlaceName: placeName,
            candidatePlaceGeoId: place.placeGeoId,
          },
          cta: {
            kind: 'create_poll',
            label: `Create the first poll for ${placeName}`,
            prompt: `Create a poll for ${placeName}`,
          },
        };
      }

      return {
        status: 'no_market',
        market: null,
        resolution: {
          anchorType,
          viewportContainsUser,
          candidatePlaceName: null,
          candidatePlaceGeoId: null,
        },
        cta: { kind: 'none', label: null, prompt: null },
      };
    } catch (error) {
      this.logger.warn('Failed to resolve market', {
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : { message: String(error) },
      });
      return {
        status: 'error',
        market: null,
        resolution: {
          anchorType,
          viewportContainsUser,
          candidatePlaceName: null,
          candidatePlaceGeoId: null,
        },
        cta: { kind: 'none', label: null, prompt: null },
      };
    }
  }

  private async findMarket(
    point: Coordinate,
    marketType: MarketType,
  ): Promise<MarketCandidateRow | null> {
    const pointSql = Prisma.sql`ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)`;
    const rows = await this.prisma.$queryRaw<MarketCandidateRow[]>(Prisma.sql`
      SELECT
        market_key AS "marketKey",
        market_name AS "marketName",
        market_short_name AS "marketShortName",
        market_type AS "marketType",
        is_collectable AS "isCollectable",
        bbox_ne_latitude AS "bboxNeLat",
        bbox_ne_longitude AS "bboxNeLng",
        bbox_sw_latitude AS "bboxSwLat",
        bbox_sw_longitude AS "bboxSwLng"
      FROM core_markets
      WHERE is_active = true
        AND market_type = ${marketType}::market_type
        AND geometry IS NOT NULL
        AND bbox_ne_latitude >= ${point.lat}
        AND bbox_sw_latitude <= ${point.lat}
        AND bbox_ne_longitude >= ${point.lng}
        AND bbox_sw_longitude <= ${point.lng}
        AND ST_Contains(geometry, ${pointSql})
      ORDER BY ST_Area(geometry::geography) ASC
      LIMIT 1
    `);

    return rows[0] ?? null;
  }

  private async findPlace(
    point: Coordinate,
  ): Promise<PlaceCandidateRow | null> {
    const pointSql = Prisma.sql`ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)`;
    const rows = await this.prisma.$queryRaw<PlaceCandidateRow[]>(Prisma.sql`
      SELECT
        place_geoid AS "placeGeoId",
        name,
        short_name AS "shortName",
        bbox_ne_latitude AS "bboxNeLat",
        bbox_ne_longitude AS "bboxNeLng",
        bbox_sw_latitude AS "bboxSwLat",
        bbox_sw_longitude AS "bboxSwLng"
      FROM geo_census_place_boundaries
      WHERE geometry IS NOT NULL
        AND bbox_ne_latitude >= ${point.lat}
        AND bbox_sw_latitude <= ${point.lat}
        AND bbox_ne_longitude >= ${point.lng}
        AND bbox_sw_longitude <= ${point.lng}
        AND ST_Contains(geometry, ${pointSql})
      ORDER BY ST_Area(geometry::geography) ASC
      LIMIT 1
    `);

    return rows[0] ?? null;
  }

  private async findLocalFallbackMarket(
    placeGeoId: string,
  ): Promise<MarketCandidateRow | null> {
    const rows = await this.prisma.$queryRaw<MarketCandidateRow[]>(Prisma.sql`
      SELECT
        market_key AS "marketKey",
        market_name AS "marketName",
        market_short_name AS "marketShortName",
        market_type AS "marketType",
        is_collectable AS "isCollectable",
        bbox_ne_latitude AS "bboxNeLat",
        bbox_ne_longitude AS "bboxNeLng",
        bbox_sw_latitude AS "bboxSwLat",
        bbox_sw_longitude AS "bboxSwLng"
      FROM core_markets
      WHERE is_active = true
        AND market_type = ${MarketType.local_fallback}::market_type
        AND census_place_geoid = ${placeGeoId}
      ORDER BY updated_at DESC, created_at DESC
      LIMIT 1
    `);

    return rows[0] ?? null;
  }

  private buildResolvedResult(
    market: MarketCandidateRow,
    anchorType: 'user_location' | 'viewport_center',
    viewportContainsUser: boolean | null,
  ): MarketResolveResult {
    const displayName = market.marketShortName ?? market.marketName;
    return {
      status: 'resolved',
      market: {
        marketKey: market.marketKey,
        marketName: market.marketName,
        marketShortName: market.marketShortName,
        marketType: market.marketType,
        isCollectable: market.isCollectable,
      },
      resolution: {
        anchorType,
        viewportContainsUser,
        candidatePlaceName: null,
        candidatePlaceGeoId: null,
      },
      cta: {
        kind: 'create_poll',
        label: `Create a poll for ${displayName}`,
        prompt: `Create a poll for ${displayName}`,
      },
    };
  }

  private resolveViewportCenter(bounds: Bounds | null): Coordinate | null {
    if (!bounds) {
      return null;
    }
    return {
      lat: (bounds.northEast.lat + bounds.southWest.lat) / 2,
      lng: (bounds.northEast.lng + bounds.southWest.lng) / 2,
    };
  }

  private normalizePoint(point: Coordinate | null): Coordinate | null {
    if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
      return null;
    }
    return point;
  }
}
