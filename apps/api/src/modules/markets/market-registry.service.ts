import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { MarketType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  MarketResolveResult,
  MarketResolverService,
} from './market-resolver.service';
import {
  BoundaryFeatureRecord,
  TomTomBoundaryBootstrapService,
} from './tomtom-boundary-bootstrap.service';

type Coordinate = { lat: number; lng: number };
type Bounds = { northEast: Coordinate; southWest: Coordinate };
type MarketResolveMode = 'polls_read' | 'polls_create' | 'search';

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
    private readonly tomTomBoundaryBootstrap: TomTomBoundaryBootstrapService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('MarketRegistryService');
  }

  /**
   * Leg 11: the active-market vocabulary (ListDetail Market chip options —
   * §8.16 "sliced by city"). Name-ordered; keys are the executor's
   * activeMarketKey directive vocabulary.
   */
  async listActiveMarkets(): Promise<
    Array<{
      marketKey: string;
      marketName: string | null;
      marketShortName: string | null;
    }>
  > {
    return this.prisma.market.findMany({
      where: { isActive: true },
      select: { marketKey: true, marketName: true, marketShortName: true },
      orderBy: { marketName: 'asc' },
    });
  }

  // Phase C: resolveOrEnsureForPollCreation is DEAD — poll creation attaches
  // to the place catalog (PollsService.resolveCreationPlace); no market is
  // ever minted for a poll.

  async resolveOrEnsureForLocation(params: {
    bounds?: Bounds | null;
    userLocation?: Coordinate | null;
    mode?: MarketResolveMode;
    allowBootstrap?: boolean;
  }): Promise<EnsuredMarketResult | null> {
    const requestId = params.allowBootstrap === true ? randomUUID() : null;
    const resolved = await this.marketResolver.resolve({
      bounds: params.bounds ?? null,
      userLocation: params.userLocation ?? null,
      mode: params.mode ?? 'search',
      allowBoundaryBootstrap: params.allowBootstrap === true,
      requestId,
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

    const boundaryProvider = resolved.resolution.candidateBoundaryProvider;
    const boundaryId = resolved.resolution.candidateBoundaryId;
    const boundaryType = resolved.resolution.candidateBoundaryType;
    if (!boundaryProvider || !boundaryId || !boundaryType) {
      return null;
    }
    if (params.allowBootstrap !== true) {
      return null;
    }

    const boundary =
      await this.tomTomBoundaryBootstrap.findBoundaryBySourceIdentity({
        sourceProvider: boundaryProvider,
        sourceBoundaryId: boundaryId,
        sourceBoundaryType: boundaryType,
      });
    if (!boundary) {
      return null;
    }

    return this.ensureLocalityMarket(boundary, resolved, requestId);
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

  private async ensureLocalityMarket(
    boundary: BoundaryFeatureRecord,
    resolved: MarketResolveResult,
    requestId?: string | null,
  ): Promise<EnsuredMarketResult | null> {
    const existingRows = await this.prisma.$queryRaw<
      Array<{
        marketKey: string;
        marketName: string;
        marketShortName: string | null;
        marketType: MarketType;
        isCollectable: boolean;
        isActive: boolean;
      }>
    >(Prisma.sql`
      SELECT
        market_key AS "marketKey",
        market_name AS "marketName",
        market_short_name AS "marketShortName",
        market_type AS "marketType",
        is_collectable AS "isCollectable",
        is_active AS "isActive"
      FROM core_markets
      WHERE market_type = ${MarketType.locality}::market_type
        AND source_boundary_provider = ${boundary.sourceProvider}
        AND source_boundary_id = ${boundary.sourceBoundaryId}
        AND source_boundary_type = ${boundary.sourceBoundaryType}
      ORDER BY is_active DESC, updated_at DESC, created_at DESC
      LIMIT 1
    `);
    const existing = existingRows[0] ?? null;

    if (existing?.isActive) {
      await this.tomTomBoundaryBootstrap.recordLocalityMarketEnsured({
        boundary,
        marketKey: existing.marketKey,
        wasCreated: false,
        requestId,
      });
      return {
        marketKey: existing.marketKey,
        marketName: existing.marketName,
        marketShortName: existing.marketShortName,
        marketType: existing.marketType,
        isCollectable: existing.isCollectable,
        wasCreated: false,
      };
    }

    const storedBoundary =
      await this.tomTomBoundaryBootstrap.findBoundaryBySourceIdentity({
        sourceProvider: boundary.sourceProvider,
        sourceBoundaryId: boundary.sourceBoundaryId,
        sourceBoundaryType: boundary.sourceBoundaryType,
      });

    if (!storedBoundary) {
      this.logger.warn(
        'Unable to ensure locality market: boundary feature missing',
        {
          sourceProvider: boundary.sourceProvider,
          sourceBoundaryId: boundary.sourceBoundaryId,
          sourceBoundaryType: boundary.sourceBoundaryType,
        },
      );
      return null;
    }

    const marketName = (storedBoundary.shortName ?? storedBoundary.name).trim();
    const marketShortName =
      (storedBoundary.shortName ?? storedBoundary.name).trim() || null;

    if (existing) {
      const reactivatedRows = await this.prisma.$queryRaw<
        Array<{
          marketKey: string;
          marketName: string;
          marketShortName: string | null;
          marketType: MarketType;
          isCollectable: boolean;
        }>
      >(Prisma.sql`
        UPDATE core_markets AS market
        SET
          market_name = ${marketName},
          market_short_name = ${marketShortName},
          country_code = boundary.country_code,
          state_code = boundary.state_code,
          source_boundary_provider = boundary.source_provider,
          source_boundary_id = boundary.source_boundary_id,
          source_boundary_type = boundary.source_boundary_type,
          is_active = true,
          center_latitude = boundary.center_latitude,
          center_longitude = boundary.center_longitude,
          bbox_ne_latitude = boundary.bbox_ne_latitude,
          bbox_ne_longitude = boundary.bbox_ne_longitude,
          bbox_sw_latitude = boundary.bbox_sw_latitude,
          bbox_sw_longitude = boundary.bbox_sw_longitude,
          geometry = boundary.geometry,
          metadata = jsonb_build_object(
            'source',
            'boundary_feature',
            'sourceProvider',
            boundary.source_provider,
            'sourceBoundaryId',
            boundary.source_boundary_id,
            'sourceBoundaryType',
            boundary.source_boundary_type,
            'providerType',
            boundary.provider_type,
            'candidateLocalityName',
            ${resolved.resolution.candidateLocalityName},
            'reactivatedFromInactive',
            true
          ),
          updated_at = now()
        FROM geo_boundary_features AS boundary
        WHERE market.market_key = ${existing.marketKey}
          AND market.market_type = ${MarketType.locality}::market_type
          AND boundary.source_provider = ${storedBoundary.sourceProvider}
          AND boundary.source_boundary_id = ${storedBoundary.sourceBoundaryId}
          AND boundary.source_boundary_type = ${storedBoundary.sourceBoundaryType}
        RETURNING
          market.market_key AS "marketKey",
          market.market_name AS "marketName",
          market.market_short_name AS "marketShortName",
          market.market_type AS "marketType",
          market.is_collectable AS "isCollectable"
      `);
      const reactivated = reactivatedRows[0] ?? null;
      if (reactivated) {
        this.logger.info('Reactivated locality market', {
          marketKey: reactivated.marketKey,
          sourceBoundaryProvider: storedBoundary.sourceProvider,
          sourceBoundaryId: storedBoundary.sourceBoundaryId,
          sourceBoundaryType: storedBoundary.sourceBoundaryType,
        });
        await this.tomTomBoundaryBootstrap.recordLocalityMarketEnsured({
          boundary: storedBoundary,
          marketKey: reactivated.marketKey,
          wasCreated: false,
          requestId,
        });
        return {
          marketKey: reactivated.marketKey,
          marketName: reactivated.marketName,
          marketShortName: reactivated.marketShortName,
          marketType: reactivated.marketType,
          isCollectable: reactivated.isCollectable,
          wasCreated: false,
        };
      }
    }

    const marketKeys = this.resolveLocalityMarketKeyCandidates(storedBoundary);

    let created: {
      marketKey: string;
      marketName: string;
      marketShortName: string | null;
      marketType: MarketType;
      isCollectable: boolean;
    } | null = null;

    for (const marketKey of marketKeys) {
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
      SELECT
        ${marketKey},
        ${marketName},
        ${marketShortName},
        ${MarketType.locality}::market_type,
        country_code,
        state_code,
        source_provider,
        source_boundary_id,
        source_boundary_type,
        false,
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
          'boundary_feature',
          'sourceProvider',
          source_provider,
          'sourceBoundaryId',
          source_boundary_id,
          'sourceBoundaryType',
          source_boundary_type,
          'providerType',
          provider_type,
          'candidateLocalityName',
          ${resolved.resolution.candidateLocalityName}
        ),
        now()
      FROM geo_boundary_features
      WHERE source_provider = ${storedBoundary.sourceProvider}
        AND source_boundary_id = ${storedBoundary.sourceBoundaryId}
        AND source_boundary_type = ${storedBoundary.sourceBoundaryType}
      ON CONFLICT (market_key) DO UPDATE SET
        market_name = EXCLUDED.market_name,
        market_short_name = EXCLUDED.market_short_name,
        state_code = EXCLUDED.state_code,
        source_boundary_provider = EXCLUDED.source_boundary_provider,
        source_boundary_id = EXCLUDED.source_boundary_id,
        source_boundary_type = EXCLUDED.source_boundary_type,
        is_collectable = core_markets.is_collectable,
        scheduler_enabled = core_markets.scheduler_enabled,
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
      WHERE
        core_markets.source_boundary_provider = EXCLUDED.source_boundary_provider
        AND core_markets.source_boundary_id = EXCLUDED.source_boundary_id
        AND core_markets.source_boundary_type = EXCLUDED.source_boundary_type
      RETURNING
        market_key AS "marketKey",
        market_name AS "marketName",
        market_short_name AS "marketShortName",
        market_type AS "marketType",
        is_collectable AS "isCollectable"
      `);

      created = rows[0] ?? null;
      if (created) {
        break;
      }
    }

    if (!created) {
      this.logger.warn('Unable to ensure locality market: key collision', {
        candidateMarketKeys: marketKeys,
        sourceProvider: storedBoundary.sourceProvider,
        sourceBoundaryId: storedBoundary.sourceBoundaryId,
        sourceBoundaryType: storedBoundary.sourceBoundaryType,
      });
      return null;
    }

    this.logger.info('Ensured locality market', {
      marketKey: created.marketKey,
      sourceBoundaryProvider: storedBoundary.sourceProvider,
      sourceBoundaryId: storedBoundary.sourceBoundaryId,
      sourceBoundaryType: storedBoundary.sourceBoundaryType,
    });
    await this.tomTomBoundaryBootstrap.recordLocalityMarketEnsured({
      boundary: storedBoundary,
      marketKey: created.marketKey,
      wasCreated: true,
      requestId,
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

  private resolveLocalityMarketKeyCandidates(
    boundary: BoundaryFeatureRecord,
  ): string[] {
    const baseKey = this.buildBaseLocalityMarketKey(boundary);
    return [
      baseKey,
      `${baseKey}-${this.shortHash(this.buildBoundaryIdentityKey(boundary))}`,
    ];
  }

  private buildBaseLocalityMarketKey(boundary: BoundaryFeatureRecord): string {
    const country = this.slugify(boundary.countryCode) || 'unknown';
    const state = this.slugify(boundary.stateCode) || 'unknown';
    const locality =
      this.slugify(boundary.shortName ?? boundary.name) ||
      this.shortHash(this.buildBoundaryIdentityKey(boundary));
    return `locality-${country}-${state}-${locality}`;
  }

  private buildBoundaryIdentityKey(boundary: BoundaryFeatureRecord): string {
    return [
      boundary.sourceProvider.trim().toLowerCase(),
      boundary.sourceBoundaryType.trim().toLowerCase(),
      boundary.sourceBoundaryId.trim(),
    ].join(':');
  }

  private slugify(value?: string | null): string {
    const normalized =
      typeof value === 'string' ? value.trim().toLowerCase() : '';
    return normalized
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
  }

  private shortHash(value: string): string {
    return createHash('sha1').update(value).digest('hex').slice(0, 8);
  }

  private toFiniteNumber(
    value: Prisma.Decimal | number | string | null | undefined,
  ): number | null {
    if (value instanceof Prisma.Decimal) {
      const result = value.toNumber();
      return Number.isFinite(result) ? result : null;
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    return null;
  }
}
