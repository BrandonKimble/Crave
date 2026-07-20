import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { MarketType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  MarketResolveResult,
  MarketResolverService,
} from './market-resolver.service';
import { pointWithinBounds } from './market-geo.util';
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
    candidateLocalityName: string | null;
    candidateBoundaryProvider: string | null;
    candidateBoundaryId: string | null;
    candidateBoundaryType: string | null;
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

type UncoveredAnchorRow = {
  lat: Prisma.Decimal | number | string | null;
  lng: Prisma.Decimal | number | string | null;
  overlapAreaMeters: Prisma.Decimal | number | string | null;
  uncoveredAreaShare: Prisma.Decimal | number | string | null;
};

const UNDISCOVERED_PLACE_MIN_OVERLAP_SHARE = 0.005;
const UNDISCOVERED_PLACE_MIN_OVERLAP_AREA_METERS = 250_000;
const EFFECTIVE_TIE_OVERLAP_SHARE_DELTA = 0.05;
const UNCOVERED_BOOTSTRAP_ATTEMPT_LIMIT = 1;

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

  async resolveViewportCoverage(params: {
    bounds?: Bounds | null;
    userLocation?: Coordinate | null;
    mode?: MarketResolveMode;
    ensureLocalityMarkets?: boolean;
  }): Promise<ViewportCoverageResult> {
    const bounds = params.bounds ?? null;
    const userLocation = this.normalizeCoordinate(params.userLocation ?? null);
    const viewportContainsUser =
      bounds && userLocation ? pointWithinBounds(userLocation, bounds) : null;

    if (!bounds) {
      const resolved = await this.marketResolver.resolve({
        userLocation,
        mode: params.mode ?? 'search',
      });

      if (!resolved.market && params.ensureLocalityMarkets) {
        const ensured = await this.resolveOrEnsureLocalityForActiveIntent({
          bounds: null,
          userLocation,
        });
        if (ensured) {
          const markets = userLocation
            ? await this.findContainingMarkets(userLocation)
            : [this.toViewportCoverageMarket(ensured, 0)];
          const ensuredMarket = this.toViewportCoverageMarket(ensured, 0);
          if (
            !markets.some((market) => market.marketKey === ensured.marketKey)
          ) {
            markets.push(ensuredMarket);
          }
          const selected = this.selectViewportDisplayMarket({ markets });
          const selectedDisplayName =
            selected?.marketShortName ?? selected?.marketName;

          return {
            status:
              selected?.selectedVia === 'ambiguous'
                ? 'multi_market'
                : 'resolved',
            market: selected
              ? {
                  marketKey: selected.marketKey,
                  marketName: selected.marketName,
                  marketShortName: selected.marketShortName,
                  marketType: selected.marketType,
                  isCollectable: selected.isCollectable,
                }
              : this.toMarketResponse(ensured),
            markets,
            collectableMarketKeys: await this.resolveCollectableMarketKeys(
              markets.map((market) => market.marketKey),
            ),
            resolution: {
              anchorType: userLocation ? 'user_location' : 'viewport_center',
              viewportContainsUser,
              candidateLocalityName: null,
              candidateBoundaryProvider: null,
              candidateBoundaryId: null,
              candidateBoundaryType: null,
            },
            cta: selectedDisplayName
              ? {
                  kind: 'create_poll',
                  label: `Create a poll for ${selectedDisplayName}`,
                  prompt: `Create a poll for ${selectedDisplayName}`,
                }
              : { kind: 'none', label: null, prompt: null },
          };
        }
      }

      if (!resolved.market) {
        return {
          status: 'no_market',
          market: null,
          markets: [],
          collectableMarketKeys: [],
          resolution: {
            anchorType: userLocation ? 'user_location' : 'viewport_center',
            viewportContainsUser,
            candidateLocalityName:
              resolved.resolution.candidateLocalityName ?? null,
            candidateBoundaryProvider:
              resolved.resolution.candidateBoundaryProvider ?? null,
            candidateBoundaryId:
              resolved.resolution.candidateBoundaryId ?? null,
            candidateBoundaryType:
              resolved.resolution.candidateBoundaryType ?? null,
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
          candidateLocalityName:
            resolved.resolution.candidateLocalityName ?? null,
          candidateBoundaryProvider:
            resolved.resolution.candidateBoundaryProvider ?? null,
          candidateBoundaryId: resolved.resolution.candidateBoundaryId ?? null,
          candidateBoundaryType:
            resolved.resolution.candidateBoundaryType ?? null,
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
      let candidateBoundary: BoundaryFeatureRecord | null = null;

      if (params.ensureLocalityMarkets) {
        candidateBoundary = await this.bootstrapUncoveredBoundaryCandidates(
          bounds,
          { recordNoAnchorEvent: markets.length === 0 },
        );
        if (candidateBoundary) {
          markets = await this.findIntersectingMarkets(bounds);
        }
      } else if (markets.length === 0) {
        candidateBoundary =
          await this.findFirstStoredUncoveredBoundaryCandidate(bounds);
      }

      if (markets.length === 0) {
        const placeName =
          candidateBoundary?.shortName?.trim() ||
          candidateBoundary?.name?.trim() ||
          null;
        return {
          status: 'no_market',
          market: null,
          markets: [],
          collectableMarketKeys: [],
          resolution: {
            anchorType: 'viewport_coverage',
            viewportContainsUser,
            candidateLocalityName: placeName,
            candidateBoundaryProvider:
              candidateBoundary?.sourceProvider ?? null,
            candidateBoundaryId: candidateBoundary?.sourceBoundaryId ?? null,
            candidateBoundaryType:
              candidateBoundary?.sourceBoundaryType ?? null,
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

      const selected = this.selectViewportDisplayMarket({ markets });
      const collectableMarketKeys = await this.resolveCollectableMarketKeys(
        markets.map((market) => market.marketKey),
      );
      const selectedDisplayName =
        selected?.marketShortName ?? selected?.marketName;

      return {
        status:
          selected?.selectedVia === 'ambiguous' ? 'multi_market' : 'resolved',
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
          candidateLocalityName: null,
          candidateBoundaryProvider: null,
          candidateBoundaryId: null,
          candidateBoundaryType: null,
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
          candidateLocalityName: null,
          candidateBoundaryProvider: null,
          candidateBoundaryId: null,
          candidateBoundaryType: null,
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

  private async resolveOrEnsureLocalityForActiveIntent(params: {
    bounds?: Bounds | null;
    userLocation?: Coordinate | null;
  }): Promise<EnsuredMarketResult | null> {
    const anchor =
      this.normalizeCoordinate(params.userLocation ?? null) ??
      this.resolveViewportCenter(params.bounds ?? null);
    if (!anchor) {
      return null;
    }

    const requestId = randomUUID();
    const boundary =
      await this.tomTomBoundaryBootstrap.bootstrapMunicipalityForPoint(anchor, {
        requestId,
        triggerKind: 'point_resolution',
      });
    if (!boundary) {
      return null;
    }

    return this.ensureLocalityMarketForBoundary(boundary, requestId);
  }

  private async findContainingMarkets(
    point: Coordinate,
  ): Promise<ViewportCoverageMarket[]> {
    const normalized = this.normalizeCoordinate(point);
    if (!normalized) {
      return [];
    }

    const pointSql = Prisma.sql`ST_SetSRID(ST_MakePoint(${normalized.lng}, ${normalized.lat}), 4326)`;
    const rows = await this.prisma.$queryRaw<MarketCoverageRow[]>(Prisma.sql`
      SELECT
        market_key AS "marketKey",
        market_name AS "marketName",
        market_short_name AS "marketShortName",
        market_type AS "marketType",
        is_collectable AS "isCollectable",
        0 AS "overlapAreaMeters"
      FROM core_markets
      WHERE is_active = true
        AND geometry IS NOT NULL
        AND market_type IN (
          ${MarketType.regional}::market_type,
          ${MarketType.locality}::market_type
        )
        AND geometry && ${pointSql}
        AND ST_Covers(geometry, ${pointSql})
      ORDER BY
        CASE
          WHEN market_type = ${MarketType.locality}::market_type THEN 0
          WHEN market_type = ${MarketType.regional}::market_type THEN 1
          ELSE 2
        END ASC,
        ST_Area(geometry::geography) ASC,
        market_key ASC
    `);

    return rows.map((row) => ({
      marketKey: row.marketKey,
      marketName: row.marketName,
      marketShortName: row.marketShortName,
      marketType: row.marketType,
      isCollectable: row.isCollectable,
      overlapAreaMeters: this.toPositiveNumber(row.overlapAreaMeters),
    }));
  }

  private toMarketResponse(market: EnsuredMarketResult): {
    marketKey: string;
    marketName: string;
    marketShortName: string | null;
    marketType: MarketType;
    isCollectable: boolean;
  } {
    return {
      marketKey: market.marketKey,
      marketName: market.marketName,
      marketShortName: market.marketShortName,
      marketType: market.marketType,
      isCollectable: market.isCollectable,
    };
  }

  private toViewportCoverageMarket(
    market: EnsuredMarketResult,
    overlapAreaMeters: number,
  ): ViewportCoverageMarket {
    return {
      marketKey: market.marketKey,
      marketName: market.marketName,
      marketShortName: market.marketShortName,
      marketType: market.marketType,
      isCollectable: market.isCollectable,
      overlapAreaMeters,
    };
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
          ${MarketType.regional}::market_type,
          ${MarketType.locality}::market_type
        )
        AND m.geometry && ${envelopeSql}
        AND ST_Intersects(m.geometry, ${envelopeSql})
      ORDER BY
        ST_Area(ST_Intersection(m.geometry, ${envelopeSql})::geography) DESC,
        CASE
          WHEN m.market_type = ${MarketType.regional}::market_type THEN 0
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

  private async findUncoveredAnchorPoints(
    bounds: Bounds,
  ): Promise<UncoveredAnchorRow[]> {
    const normalized = this.normalizeBounds(bounds);
    if (!normalized) {
      return [];
    }

    const envelopeSql = Prisma.sql`ST_SetSRID(ST_MakeEnvelope(${normalized.swLng}, ${normalized.swLat}, ${normalized.neLng}, ${normalized.neLat}), 4326)`;
    const rows = await this.prisma.$queryRaw<UncoveredAnchorRow[]>(Prisma.sql`
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
            ${MarketType.regional}::market_type,
            ${MarketType.locality}::market_type
          )
          AND m.geometry && viewport.geometry
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
      ),
      uncovered_parts AS (
        SELECT
          (ST_Dump(uncovered.geometry)).geom AS geometry,
          uncovered."viewportAreaMeters"
        FROM uncovered
        WHERE uncovered.geometry IS NOT NULL
      )
      SELECT
        ST_Y(ST_PointOnSurface(geometry)) AS lat,
        ST_X(ST_PointOnSurface(geometry)) AS lng,
        ST_Area(geometry::geography) AS "overlapAreaMeters",
        (
          ST_Area(geometry::geography) / NULLIF("viewportAreaMeters", 0)
        ) AS "uncoveredAreaShare"
      FROM uncovered_parts
      WHERE ST_Area(geometry::geography) >= ${UNDISCOVERED_PLACE_MIN_OVERLAP_AREA_METERS}
        AND (
          ST_Area(geometry::geography) / NULLIF("viewportAreaMeters", 0)
        ) >= ${UNDISCOVERED_PLACE_MIN_OVERLAP_SHARE}
      ORDER BY ST_Area(geometry::geography) DESC
      LIMIT 1
    `);

    return rows.filter(
      (row) => this.toPositiveNumber(row.overlapAreaMeters) > 0,
    );
  }

  private async bootstrapUncoveredBoundaryCandidates(
    bounds: Bounds,
    options?: { recordNoAnchorEvent?: boolean },
  ): Promise<BoundaryFeatureRecord | null> {
    let firstBoundary: BoundaryFeatureRecord | null = null;
    const seenBoundaryKeys = new Set<string>();
    const requestId = randomUUID();

    for (
      let attemptIndex = 0;
      attemptIndex < UNCOVERED_BOOTSTRAP_ATTEMPT_LIMIT;
      attemptIndex += 1
    ) {
      const candidate = await this.bootstrapNextUncoveredBoundaryCandidate(
        bounds,
        attemptIndex,
        seenBoundaryKeys,
        requestId,
        options,
      );
      if (!candidate) {
        break;
      }
      firstBoundary ??= candidate.boundary;
      await this.ensureLocalityMarketForBoundary(candidate.boundary, requestId);
    }

    if (firstBoundary) {
      await this.tomTomBoundaryBootstrap.recordBootstrapLifecycleEvent({
        eventType: 'bootstrap_stopped',
        requestId,
        triggerKind: 'viewport_coverage',
        stopReason: 'attempt_cap_reached',
        message:
          'Viewport bootstrap attempted one locality before recomputing local coverage.',
      });
    }

    return firstBoundary;
  }

  private async bootstrapNextUncoveredBoundaryCandidate(
    bounds: Bounds,
    attemptIndex: number,
    seenBoundaryKeys: Set<string>,
    requestId: string,
    options?: { recordNoAnchorEvent?: boolean },
  ): Promise<{
    boundary: BoundaryFeatureRecord;
    overlapAreaMeters: number;
    uncoveredAreaShare: number | null;
  } | null> {
    const anchors = await this.findUncoveredAnchorPoints(bounds);
    const anchor = anchors[0] ?? null;
    if (!anchor) {
      if (options?.recordNoAnchorEvent) {
        await this.tomTomBoundaryBootstrap.recordBootstrapLifecycleEvent({
          eventType: 'bootstrap_skipped',
          requestId,
          triggerKind: 'viewport_coverage',
          stopReason: 'no_qualifying_uncovered_area',
          message:
            'No local market coverage exists, but uncovered geometry did not produce a qualifying bootstrap anchor.',
        });
      }
      return null;
    }

    const lat = this.toFiniteNumber(anchor.lat);
    const lng = this.toFiniteNumber(anchor.lng);
    if (lat === null || lng === null) {
      await this.tomTomBoundaryBootstrap.recordBootstrapLifecycleEvent({
        eventType: 'bootstrap_skipped',
        requestId,
        triggerKind: 'viewport_coverage',
        attemptIndex,
        uncoveredAreaMeters: this.toPositiveNumber(anchor.overlapAreaMeters),
        uncoveredAreaShare: this.toFiniteNumber(anchor.uncoveredAreaShare),
        stopReason: 'invalid_uncovered_anchor',
      });
      return null;
    }

    const boundary =
      await this.tomTomBoundaryBootstrap.bootstrapMunicipalityForPoint(
        {
          lat,
          lng,
        },
        {
          requestId,
          triggerKind: 'viewport_coverage',
          attemptIndex,
          uncoveredAreaMeters: this.toPositiveNumber(anchor.overlapAreaMeters),
          uncoveredAreaShare: this.toFiniteNumber(anchor.uncoveredAreaShare),
        },
      );
    if (!boundary) {
      return null;
    }
    const boundaryKey = this.buildBoundaryIdentityKey(boundary);
    if (seenBoundaryKeys.has(boundaryKey)) {
      await this.tomTomBoundaryBootstrap.recordBootstrapLifecycleEvent({
        eventType: 'bootstrap_stopped',
        requestId,
        triggerKind: 'viewport_coverage',
        attemptIndex,
        uncoveredAreaMeters: this.toPositiveNumber(anchor.overlapAreaMeters),
        uncoveredAreaShare: this.toFiniteNumber(anchor.uncoveredAreaShare),
        stopReason: 'duplicate_boundary',
        message:
          'TomTom returned a boundary already attempted in this viewport bootstrap request.',
      });
      return null;
    }
    seenBoundaryKeys.add(boundaryKey);
    return {
      boundary,
      overlapAreaMeters: this.toPositiveNumber(anchor.overlapAreaMeters),
      uncoveredAreaShare: this.toFiniteNumber(anchor.uncoveredAreaShare),
    };
  }

  private async findFirstStoredUncoveredBoundaryCandidate(
    bounds: Bounds,
  ): Promise<BoundaryFeatureRecord | null> {
    const anchors = await this.findUncoveredAnchorPoints(bounds);
    const anchor = anchors[0] ?? null;
    const lat = this.toFiniteNumber(anchor?.lat);
    const lng = this.toFiniteNumber(anchor?.lng);
    if (lat === null || lng === null) {
      return null;
    }

    return this.tomTomBoundaryBootstrap.findStoredMunicipalityForPoint({
      lat,
      lng,
    });
  }

  private async ensureLocalityMarketForBoundary(
    boundary: BoundaryFeatureRecord,
    requestId?: string | null,
  ): Promise<EnsuredMarketResult | null> {
    return this.ensureLocalityMarket(
      boundary,
      {
        status: 'no_market',
        market: null,
        resolution: {
          anchorType: 'viewport_center',
          viewportContainsUser: null,
          candidateLocalityName: boundary.shortName ?? boundary.name,
          candidateBoundaryProvider: boundary.sourceProvider,
          candidateBoundaryId: boundary.sourceBoundaryId,
          candidateBoundaryType: boundary.sourceBoundaryType,
        },
        cta: { kind: 'none', label: null, prompt: null },
      },
      requestId,
    );
  }

  private selectViewportDisplayMarket(params: {
    markets: ViewportCoverageMarket[];
  }):
    | (ViewportCoverageMarket & {
        selectedVia: 'dominant' | 'ambiguous';
      })
    | null {
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
      runnerUp && totalOverlap > 0
        ? runnerUp.overlapAreaMeters / totalOverlap
        : 0;
    const selectedVia =
      runnerUp &&
      Math.abs(selectedShare - runnerUpShare) <=
        EFFECTIVE_TIE_OVERLAP_SHARE_DELTA
        ? 'ambiguous'
        : 'dominant';

    return { ...selected, selectedVia };
  }

  private marketTypePriority(marketType: MarketType): number {
    switch (marketType) {
      case MarketType.regional:
        return 0;
      case MarketType.locality:
        return 1;
      default:
        return 2;
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

  private resolveViewportCenter(bounds?: Bounds | null): Coordinate | null {
    const normalized = this.normalizeBounds(bounds);
    if (!normalized) {
      return null;
    }
    return {
      lat: (normalized.swLat + normalized.neLat) / 2,
      lng: (normalized.swLng + normalized.neLng) / 2,
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
