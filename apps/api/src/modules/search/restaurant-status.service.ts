import { Injectable } from '@nestjs/common';
import { EntityStatus, EntityType, Prisma } from '@prisma/client';
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

    // ONE-HOP REDIRECT + ARCHIVED GUARD (F510) — the same shape the core
    // profile/dishes paths carry (search.service listRestaurantDishes). A
    // restaurant tapped just before it was merged still arrives here by its
    // stale (now-redirected) id; resolve it to the survivor so the status
    // preview reflects the live entity, and never preview an archived one.
    // The writer keeps redirect chains flat (one hop — proven by the merge
    // writer's own spec), so a single lookup is sufficient.
    const redirects = await this.prisma.entityRedirect.findMany({
      where: { fromEntityId: { in: uniqueIds } },
      select: { fromEntityId: true, toEntityId: true },
    });
    const redirectMap = new Map(
      redirects.map((r) => [r.fromEntityId, r.toEntityId]),
    );
    // requested id -> the id we actually read (survivor when redirected)
    const resolvedByRequested = new Map(
      uniqueIds.map((id) => [id, redirectMap.get(id) ?? id]),
    );
    const resolvedIds = Array.from(new Set(resolvedByRequested.values()));

    const restaurants = await this.prisma.entity.findMany({
      where: {
        entityId: { in: resolvedIds },
        type: EntityType.restaurant,
        status: { not: EntityStatus.archived },
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
      },
    });

    const previewMap = new Map<string, RestaurantStatusPreviewDto>();

    restaurants.forEach((restaurant) => {
      const location = restaurant.primaryLocation;
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
      .map((id) => {
        const preview = previewMap.get(resolvedByRequested.get(id) ?? id);
        if (!preview) {
          return undefined;
        }
        // Answer under the id the caller asked about (its stale, redirected
        // id) so the client can match the response to its request, while the
        // status/distance derive from the resolved survivor.
        return { ...preview, restaurantId: id };
      })
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
