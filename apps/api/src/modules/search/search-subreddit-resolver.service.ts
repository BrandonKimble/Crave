import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MapBoundsDto } from './dto/search-query.dto';

interface ResolveOptions {
  bounds?: MapBoundsDto | null;
  fallbackLocation?: {
    latitude: number;
    longitude: number;
  } | null;
  referenceLocations?: Array<{
    latitude: number | null | undefined;
    longitude: number | null | undefined;
  }>;
}

@Injectable()
export class SearchSubredditResolverService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(options: ResolveOptions = {}): Promise<string[]> {
    const subreddits = await this.prisma.subreddit.findMany({
      where: { isActive: true },
      select: {
        name: true,
        centerLatitude: true,
        centerLongitude: true,
      },
    });

    if (!subreddits.length) {
      return [];
    }

    const center = this.resolveCenter(
      options.bounds,
      options.fallbackLocation,
      options.referenceLocations,
    );
    if (!center) {
      return subreddits.map((row) => row.name);
    }

    const candidates = subreddits
      .map((row) => ({
        name: row.name,
        latitude: this.toNumeric(row.centerLatitude),
        longitude: this.toNumeric(row.centerLongitude),
      }))
      .filter(
        (row): row is { name: string; latitude: number; longitude: number } =>
          typeof row.latitude === 'number' &&
          Number.isFinite(row.latitude) &&
          typeof row.longitude === 'number' &&
          Number.isFinite(row.longitude),
      );

    if (!candidates.length) {
      return subreddits.map((row) => row.name);
    }

    const nearest = candidates.reduce<null | {
      name: string;
      distance: number;
    }>((best, current) => {
      const distance = this.haversineDistance(
        center.lat,
        center.lng,
        current.latitude,
        current.longitude,
      );
      if (!best || distance < best.distance) {
        return { name: current.name, distance };
      }
      return best;
    }, null);

    return nearest ? [nearest.name] : subreddits.map((row) => row.name);
  }

  private resolveCenter(
    bounds: MapBoundsDto | null | undefined,
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

  private isValidCoordinate(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }

  private toNumeric(value: Prisma.Decimal | number | null): number | null {
    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }
    if (typeof value === 'number') {
      return value;
    }
    return null;
  }

  private haversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const toRad = (val: number) => (val * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const earthRadiusKm = 6371;
    return earthRadiusKm * c;
  }
}
