import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const COVERAGE_CACHE_TTL_MS = 5 * 60 * 1000;

export interface CoverageResolveOptions {
  bounds?: {
    northEast: { lat: number; lng: number };
    southWest: { lat: number; lng: number };
  } | null;
  fallbackLocation?: {
    latitude: number;
    longitude: number;
  } | null;
  referenceLocations?: Array<{
    latitude: number | null | undefined;
    longitude: number | null | undefined;
  }>;
}

type ViewportBounds = {
  northEast: { lat: number; lng: number };
  southWest: { lat: number; lng: number };
};

type CoverageCandidate = {
  name: string;
  coverageKey: string | null;
  center: { lat: number; lng: number } | null;
  viewport: ViewportBounds | null;
  area: number | null;
};

type CoverageAreaLookupRow = {
  name: string;
  coverageKey: string | null;
  centerLatitude: Prisma.Decimal | number | null;
  centerLongitude: Prisma.Decimal | number | null;
  viewportNeLat: Prisma.Decimal | number | null;
  viewportNeLng: Prisma.Decimal | number | null;
  viewportSwLat: Prisma.Decimal | number | null;
  viewportSwLng: Prisma.Decimal | number | null;
};

@Injectable()
export class CoverageKeyResolverService {
  private coverageCache: {
    rows: CoverageAreaLookupRow[];
    expiresAt: number;
  } | null = null;
  private coverageCacheRequest: Promise<CoverageAreaLookupRow[]> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async resolve(options: CoverageResolveOptions = {}): Promise<string[]> {
    return this.resolveInternal(options, { fallbackToAll: true });
  }

  async resolvePrimary(
    options: CoverageResolveOptions = {},
  ): Promise<string | null> {
    const matches = await this.resolveInternal(options, {
      fallbackToAll: false,
    });
    return matches[0] ?? null;
  }

  private async resolveInternal(
    options: CoverageResolveOptions,
    settings: { fallbackToAll: boolean },
  ): Promise<string[]> {
    const coverageAreas = await this.loadCoverageAreas();

    if (!coverageAreas.length) {
      return [];
    }

    const center = this.resolveCenter(
      options.bounds,
      options.fallbackLocation,
      options.referenceLocations,
    );
    if (!center) {
      return settings.fallbackToAll
        ? this.buildLocationKeyList(coverageAreas)
        : [];
    }

    const candidates = coverageAreas.map((row) => {
      const centerLat = this.toNumeric(row.centerLatitude);
      const centerLng = this.toNumeric(row.centerLongitude);
      const viewport = this.resolveViewport(row);
      const centerPoint = this.resolveCandidateCenter(
        centerLat,
        centerLng,
        viewport,
      );
      return {
        name: row.name,
        coverageKey: row.coverageKey ?? null,
        center: centerPoint,
        viewport,
        area: viewport ? this.calculateViewportArea(viewport) : null,
      };
    });

    if (!candidates.length) {
      return settings.fallbackToAll
        ? this.buildLocationKeyList(coverageAreas)
        : [];
    }

    const containing = candidates.filter(
      (candidate) =>
        candidate.viewport && this.isWithinViewport(center, candidate.viewport),
    );

    if (containing.length) {
      const best = this.pickSmallestAreaCandidate(containing, center);
      if (best) {
        return [this.buildLocationKey(best)];
      }
    }

    const nearest = this.pickNearestCandidate(candidates, center);

    if (nearest) {
      return [this.buildLocationKey(nearest)];
    }
    return settings.fallbackToAll
      ? this.buildLocationKeyList(coverageAreas)
      : [];
  }

  private resolveCenter(
    bounds:
      | {
          northEast: { lat: number; lng: number };
          southWest: { lat: number; lng: number };
        }
      | null
      | undefined,
    fallback: { latitude: number; longitude: number } | null | undefined,
    referenceLocations?: Array<{
      latitude: number | null | undefined;
      longitude: number | null | undefined;
    }>,
  ): { lat: number; lng: number } | null {
    if (bounds) {
      const { northEast, southWest } = bounds;
      if (
        this.isValidCoordinate(northEast?.lat) &&
        this.isValidCoordinate(northEast?.lng) &&
        this.isValidCoordinate(southWest?.lat) &&
        this.isValidCoordinate(southWest?.lng)
      ) {
        return {
          lat: (northEast.lat + southWest.lat) / 2,
          lng: (northEast.lng + southWest.lng) / 2,
        };
      }
    }

    if (
      fallback &&
      this.isValidCoordinate(fallback.latitude) &&
      this.isValidCoordinate(fallback.longitude)
    ) {
      return { lat: fallback.latitude, lng: fallback.longitude };
    }

    if (referenceLocations) {
      for (const location of referenceLocations) {
        if (
          this.isValidCoordinate(location?.latitude) &&
          this.isValidCoordinate(location?.longitude)
        ) {
          return {
            lat: Number(location.latitude),
            lng: Number(location.longitude),
          };
        }
      }
    }

    return null;
  }

  private async loadCoverageAreas(): Promise<CoverageAreaLookupRow[]> {
    const now = Date.now();
    if (this.coverageCache && this.coverageCache.expiresAt > now) {
      return this.coverageCache.rows;
    }
    if (this.coverageCacheRequest) {
      return this.coverageCacheRequest;
    }

    const request = this.prisma.coverageArea
      .findMany({
        where: { isActive: true },
        select: {
          name: true,
          coverageKey: true,
          centerLatitude: true,
          centerLongitude: true,
          viewportNeLat: true,
          viewportNeLng: true,
          viewportSwLat: true,
          viewportSwLng: true,
        },
      })
      .then((rows) => {
        const normalized = rows as CoverageAreaLookupRow[];
        this.coverageCache = {
          rows: normalized,
          expiresAt: Date.now() + COVERAGE_CACHE_TTL_MS,
        };
        return normalized;
      })
      .catch((error) => {
        if (this.coverageCache) {
          return this.coverageCache.rows;
        }
        throw error;
      })
      .finally(() => {
        this.coverageCacheRequest = null;
      });

    this.coverageCacheRequest = request;
    return request;
  }

  private isValidCoordinate(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private buildLocationKey(row: { name: string; coverageKey?: string | null }) {
    const rawKey =
      typeof row.coverageKey === 'string' && row.coverageKey.trim()
        ? row.coverageKey
        : row.name;
    return rawKey.trim().toLowerCase();
  }

  private buildLocationKeyList(
    rows: Array<{ name: string; coverageKey?: string | null }>,
  ): string[] {
    const keys = new Set<string>();
    for (const row of rows) {
      const key = this.buildLocationKey(row);
      if (key) {
        keys.add(key);
      }
    }
    return Array.from(keys.values());
  }

  private resolveViewport(row: {
    viewportNeLat: Prisma.Decimal | number | null;
    viewportNeLng: Prisma.Decimal | number | null;
    viewportSwLat: Prisma.Decimal | number | null;
    viewportSwLng: Prisma.Decimal | number | null;
  }): ViewportBounds | null {
    const northEastLat = this.toNumeric(row.viewportNeLat);
    const northEastLng = this.toNumeric(row.viewportNeLng);
    const southWestLat = this.toNumeric(row.viewportSwLat);
    const southWestLng = this.toNumeric(row.viewportSwLng);

    if (
      northEastLat === null ||
      northEastLng === null ||
      southWestLat === null ||
      southWestLng === null
    ) {
      return null;
    }

    return {
      northEast: { lat: northEastLat, lng: northEastLng },
      southWest: { lat: southWestLat, lng: southWestLng },
    };
  }

  private resolveCandidateCenter(
    latitude: number | null,
    longitude: number | null,
    viewport: ViewportBounds | null,
  ): { lat: number; lng: number } | null {
    if (
      typeof latitude === 'number' &&
      Number.isFinite(latitude) &&
      typeof longitude === 'number' &&
      Number.isFinite(longitude)
    ) {
      return { lat: latitude, lng: longitude };
    }

    if (viewport) {
      return {
        lat: (viewport.northEast.lat + viewport.southWest.lat) / 2,
        lng: (viewport.northEast.lng + viewport.southWest.lng) / 2,
      };
    }

    return null;
  }

  private calculateViewportArea(viewport: ViewportBounds): number {
    const height = Math.abs(viewport.northEast.lat - viewport.southWest.lat);
    const width = Math.abs(viewport.northEast.lng - viewport.southWest.lng);
    return height * width;
  }

  private isWithinViewport(
    center: { lat: number; lng: number },
    viewport: ViewportBounds,
  ): boolean {
    const minLat = Math.min(viewport.southWest.lat, viewport.northEast.lat);
    const maxLat = Math.max(viewport.southWest.lat, viewport.northEast.lat);
    const minLng = Math.min(viewport.southWest.lng, viewport.northEast.lng);
    const maxLng = Math.max(viewport.southWest.lng, viewport.northEast.lng);

    return (
      center.lat >= minLat &&
      center.lat <= maxLat &&
      center.lng >= minLng &&
      center.lng <= maxLng
    );
  }

  private pickSmallestAreaCandidate(
    candidates: CoverageCandidate[],
    center: { lat: number; lng: number },
  ): CoverageCandidate | null {
    const epsilon = 1e-6;
    return candidates.reduce<CoverageCandidate | null>((best, candidate) => {
      if (candidate.area === null) {
        return best;
      }

      if (!best || best.area === null) {
        return candidate;
      }

      if (candidate.area < best.area - epsilon) {
        return candidate;
      }

      if (Math.abs(candidate.area - best.area) <= epsilon) {
        const candidateDistance = candidate.center
          ? this.haversineDistance(
              center.lat,
              center.lng,
              candidate.center.lat,
              candidate.center.lng,
            )
          : Number.POSITIVE_INFINITY;
        const bestDistance = best.center
          ? this.haversineDistance(
              center.lat,
              center.lng,
              best.center.lat,
              best.center.lng,
            )
          : Number.POSITIVE_INFINITY;
        if (candidateDistance < bestDistance) {
          return candidate;
        }
      }

      return best;
    }, null);
  }

  private pickNearestCandidate(
    candidates: CoverageCandidate[],
    center: { lat: number; lng: number },
  ): CoverageCandidate | null {
    return candidates.reduce<CoverageCandidate | null>((best, current) => {
      if (!current.center) {
        return best;
      }
      const distance = this.haversineDistance(
        center.lat,
        center.lng,
        current.center.lat,
        current.center.lng,
      );
      if (!best) {
        return { ...current, area: current.area ?? null };
      }
      const bestDistance = best.center
        ? this.haversineDistance(
            center.lat,
            center.lng,
            best.center.lat,
            best.center.lng,
          )
        : Number.POSITIVE_INFINITY;
      if (distance < bestDistance) {
        return current;
      }
      return best;
    }, null);
  }

  private haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const radius = 6371;
    const dLat = this.degToRad(lat2 - lat1);
    const dLng = this.degToRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.degToRad(lat1)) *
        Math.cos(this.degToRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return radius * c;
  }

  private degToRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  private toNumeric(value: Prisma.Decimal | number | null): number | null {
    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    return null;
  }
}
