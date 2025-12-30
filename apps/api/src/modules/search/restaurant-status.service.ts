import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { LoggerService } from '../../shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildOperatingMetadata,
  computeDistanceMiles,
  evaluateOperatingStatus,
  normalizeUserLocation,
} from './utils/restaurant-status';
import type { RestaurantStatusPreviewDto } from './dto/restaurant-status-preview.dto';
import type { RestaurantStatusPreviewRequestDto } from './dto/restaurant-status-preview.dto';

@Injectable()
export class RestaurantStatusService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('RestaurantStatusService');
  }

  async getStatusPreviews(
    dto: RestaurantStatusPreviewRequestDto,
  ): Promise<RestaurantStatusPreviewDto[]> {
    const uniqueIds = Array.from(
      new Set((dto.restaurantIds || []).map((id) => id.trim()).filter(Boolean)),
    ).slice(0, 50);

    if (uniqueIds.length === 0) {
      return [];
    }

    const userLocation = normalizeUserLocation(dto.userLocation);
    const referenceDate = new Date();

    const restaurants = await this.prisma.entity.findMany({
      where: {
        entityId: { in: uniqueIds },
        type: EntityType.restaurant,
      },
      select: {
        entityId: true,
        restaurantMetadata: true,
        _count: {
          select: {
            locations: true,
          },
        },
        primaryLocation: {
          select: {
            hours: true,
            utcOffsetMinutes: true,
            timeZone: true,
            latitude: true,
            longitude: true,
          },
        },
        locations: {
          select: {
            hours: true,
            utcOffsetMinutes: true,
            timeZone: true,
            latitude: true,
            longitude: true,
            isPrimary: true,
            lastPolledAt: true,
            createdAt: true,
          },
          orderBy: [
            { isPrimary: 'desc' },
            { lastPolledAt: 'desc' },
            { createdAt: 'desc' },
          ],
          take: 1,
        },
      },
    });

    const previewMap = new Map<string, RestaurantStatusPreviewDto>();

    restaurants.forEach((restaurant) => {
      const fallbackLocation = restaurant.locations[0] ?? null;
      const location = restaurant.primaryLocation ?? fallbackLocation;
      const operatingMetadata = buildOperatingMetadata({
        hoursValue: location?.hours ?? null,
        utcOffsetMinutesValue: location?.utcOffsetMinutes ?? null,
        timeZoneValue: location?.timeZone ?? null,
        restaurantMetadataValue: restaurant.restaurantMetadata ?? null,
      });
      const operatingStatus = operatingMetadata
        ? evaluateOperatingStatus(operatingMetadata, referenceDate)
        : null;
      const latitude = toOptionalNumber(location?.latitude ?? null);
      const longitude = toOptionalNumber(location?.longitude ?? null);
      const distanceMiles =
        userLocation && latitude !== null && longitude !== null
          ? computeDistanceMiles(userLocation, latitude, longitude)
          : null;
      const locationCount =
        typeof restaurant._count?.locations === 'number'
          ? restaurant._count.locations
          : null;

      previewMap.set(restaurant.entityId, {
        restaurantId: restaurant.entityId,
        operatingStatus,
        distanceMiles,
        locationCount,
      });
    });

    return uniqueIds
      .map((id) => previewMap.get(id))
      .filter((value): value is RestaurantStatusPreviewDto => Boolean(value));
  }
}

const toOptionalNumber = (
  value?: Prisma.Decimal | number | string | null,
): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (value instanceof Prisma.Decimal) {
    return value.toNumber();
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return null;
};
