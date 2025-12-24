import { Injectable } from '@nestjs/common';
import { CoverageSourceType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { GoogleGeocodingService } from '../external-integrations/google-geocoding/google-geocoding.service';

type MapBounds = {
  northEast: { lat: number; lng: number };
  southWest: { lat: number; lng: number };
};

type CoverageResolution = {
  coverageKey: string | null;
  coverageAreaId?: string | null;
  wasCreated: boolean;
};

@Injectable()
export class CoverageRegistryService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly geocoding: GoogleGeocodingService,
  ) {
    this.logger = loggerService.setContext('CoverageRegistryService');
  }

  async resolveOrCreateCoverage(params: {
    bounds?: MapBounds | null;
    fallbackLocation?: { latitude: number; longitude: number } | null;
    allowCreate?: boolean;
  }): Promise<CoverageResolution> {
    const allowCreate = params.allowCreate !== false;
    const center = this.resolveCenter(params.bounds, params.fallbackLocation);
    if (!center) {
      return { coverageKey: null, wasCreated: false };
    }

    const geocode = await this.geocoding.reverseGeocode(center);
    const locality = geocode?.locality ?? null;
    const region = geocode?.region ?? null;
    const country = geocode?.country ?? null;

    const existing = await this.findContainingCoverage(center);
    if (existing?.coverageKey) {
      return {
        coverageKey: existing.coverageKey,
        coverageAreaId: existing.id,
        wasCreated: false,
      };
    }

    if (!locality) {
      this.logger.warn('Skipping coverage creation: missing locality', {
        center,
        geocode,
      });
      return { coverageKey: null, wasCreated: false };
    }

    const coverageKey = this.buildCoverageKey(locality, region, country);
    if (!coverageKey) {
      return { coverageKey: null, wasCreated: false };
    }

    const existingByKey = await this.prisma.coverageArea.findFirst({
      where: {
        coverageKey: { equals: coverageKey, mode: 'insensitive' },
      },
      select: { id: true, coverageKey: true },
    });

    if (existingByKey?.coverageKey) {
      return {
        coverageKey: existingByKey.coverageKey,
        coverageAreaId: existingByKey.id,
        wasCreated: false,
      };
    }

    if (!allowCreate) {
      this.logger.warn('Skipping coverage creation (creation disabled)', {
        center,
        coverageKey,
      });
      return { coverageKey: null, wasCreated: false };
    }

    const viewport =
      geocode?.viewport ??
      (params.bounds
        ? {
            northEast: params.bounds.northEast,
            southWest: params.bounds.southWest,
          }
        : null);

    const record = await this.prisma.coverageArea.create({
      data: {
        name: coverageKey,
        coverageKey,
        sourceType: CoverageSourceType.poll_only,
        isActive: true,
        locationName: geocode?.formattedAddress ?? null,
        displayName: locality,
        centerLatitude: new Prisma.Decimal(center.lat),
        centerLongitude: new Prisma.Decimal(center.lng),
        viewportNeLat: viewport?.northEast?.lat ?? null,
        viewportNeLng: viewport?.northEast?.lng ?? null,
        viewportSwLat: viewport?.southWest?.lat ?? null,
        viewportSwLng: viewport?.southWest?.lng ?? null,
      },
    });

    this.logger.info('Created poll-only coverage area', {
      coverageKey,
      center,
    });

    return {
      coverageKey: record.coverageKey ?? coverageKey,
      coverageAreaId: record.id,
      wasCreated: true,
    };
  }

  async resolveCoverage(params: {
    bounds?: MapBounds | null;
    fallbackLocation?: { latitude: number; longitude: number } | null;
  }): Promise<CoverageResolution> {
    const center = this.resolveCenter(params.bounds, params.fallbackLocation);
    if (!center) {
      return { coverageKey: null, wasCreated: false };
    }

    const existing = await this.findContainingCoverage(center);
    if (!existing?.coverageKey) {
      return { coverageKey: null, wasCreated: false };
    }

    return {
      coverageKey: existing.coverageKey,
      coverageAreaId: existing.id,
      wasCreated: false,
    };
  }

  private resolveCenter(
    bounds?: MapBounds | null,
    fallback?: { latitude: number; longitude: number } | null,
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

    return null;
  }

  private isValidCoordinate(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private buildCoverageKey(
    locality: string,
    region: string | null,
    country: string | null,
  ): string | null {
    const slug = (value: string) =>
      value
        .trim()
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '_')
        .replace(/_+/g, '_');

    const parts = [locality, region ?? '', country ?? '']
      .map((value) => value.trim())
      .filter((value) => value.length > 0)
      .map((value) => slug(value));

    if (!parts.length) {
      return null;
    }

    return parts.join('_');
  }

  private async findContainingCoverage(center: {
    lat: number;
    lng: number;
  }): Promise<{ id: string; coverageKey: string | null } | null> {
    const rows = await this.prisma.coverageArea.findMany({
      where: { isActive: true },
      select: {
        id: true,
        coverageKey: true,
        name: true,
        viewportNeLat: true,
        viewportNeLng: true,
        viewportSwLat: true,
        viewportSwLng: true,
      },
    });

    const candidates = rows
      .map((row) => {
        const neLat = this.toNumber(row.viewportNeLat);
        const neLng = this.toNumber(row.viewportNeLng);
        const swLat = this.toNumber(row.viewportSwLat);
        const swLng = this.toNumber(row.viewportSwLng);
        if (
          neLat === null ||
          neLng === null ||
          swLat === null ||
          swLng === null
        ) {
          return null;
        }
        return {
          id: row.id,
          coverageKey: row.coverageKey ?? row.name,
          viewport: {
            northEast: { lat: neLat, lng: neLng },
            southWest: { lat: swLat, lng: swLng },
          },
          area: Math.abs((neLat - swLat) * (neLng - swLng)),
        };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value));

    const containing = candidates.filter((candidate) =>
      this.isWithinViewport(center, candidate.viewport),
    );

    if (!containing.length) {
      return null;
    }

    const smallest = containing.reduce((best, current) =>
      current.area < best.area ? current : best,
    );

    return {
      id: smallest.id,
      coverageKey: smallest.coverageKey,
    };
  }

  private isWithinViewport(
    point: { lat: number; lng: number },
    viewport: MapBounds,
  ): boolean {
    return (
      point.lat <= viewport.northEast.lat &&
      point.lat >= viewport.southWest.lat &&
      point.lng <= viewport.northEast.lng &&
      point.lng >= viewport.southWest.lng
    );
  }

  private toNumber(value: Prisma.Decimal | number | null): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (value && typeof value === 'object' && 'toNumber' in value) {
      const asDecimal = value;
      const numeric = asDecimal.toNumber();
      return Number.isFinite(numeric) ? numeric : null;
    }
    return null;
  }
}
