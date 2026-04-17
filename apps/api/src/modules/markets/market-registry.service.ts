import { Injectable } from '@nestjs/common';
import { MarketType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  MarketResolveResult,
  MarketResolverService,
} from './market-resolver.service';

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
