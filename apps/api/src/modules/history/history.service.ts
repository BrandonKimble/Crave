import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { RecordRestaurantViewDto } from './dto/record-restaurant-view.dto';
import { ListRestaurantViewsDto } from './dto/list-restaurant-views.dto';

@Injectable()
export class HistoryService {
  private readonly logger: LoggerService;
  private readonly viewCooldownMs: number;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('HistoryService');
    this.viewCooldownMs = this.resolveViewCooldownMs();
  }

  async recordRestaurantView(
    userId: string,
    dto: RecordRestaurantViewDto,
  ): Promise<void> {
    const restaurant = await this.prisma.entity.findUnique({
      where: { entityId: dto.restaurantId },
      select: { entityId: true, type: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    if (restaurant.type !== EntityType.restaurant) {
      throw new BadRequestException('Entity is not a restaurant');
    }

    const now = new Date();
    const existing = await this.prisma.restaurantView.findUnique({
      where: {
        userId_restaurantId: {
          userId,
          restaurantId: restaurant.entityId,
        },
      },
      select: {
        lastViewedAt: true,
        viewCount: true,
        metadata: true,
      },
    });

    const shouldIncrement =
      !existing ||
      now.getTime() - existing.lastViewedAt.getTime() >= this.viewCooldownMs;

    const metadata = {
      ...(typeof existing?.metadata === 'object' && existing?.metadata
        ? (existing.metadata as Record<string, unknown>)
        : {}),
      lastSource: dto.source ?? null,
      lastSearchRequestId: dto.searchRequestId ?? null,
    };

    await this.prisma.restaurantView.upsert({
      where: {
        userId_restaurantId: {
          userId,
          restaurantId: restaurant.entityId,
        },
      },
      create: {
        userId,
        restaurantId: restaurant.entityId,
        lastViewedAt: now,
        viewCount: 1,
        metadata,
      },
      update: {
        lastViewedAt: now,
        viewCount: shouldIncrement ? { increment: 1 } : undefined,
        metadata,
      },
    });

    await this.prisma.entityPriorityMetric.upsert({
      where: { entityId: restaurant.entityId },
      create: {
        entity: { connect: { entityId: restaurant.entityId } },
        entityType: EntityType.restaurant,
        viewImpressions: shouldIncrement ? 1 : 0,
        lastViewAt: now,
      },
      update: {
        entityType: EntityType.restaurant,
        viewImpressions: shouldIncrement ? { increment: 1 } : undefined,
        lastViewAt: now,
      },
    });

    this.logger.debug('Recorded restaurant view', {
      userId,
      restaurantId: restaurant.entityId,
      shouldIncrement,
      source: dto.source,
    });
  }

  async listRecentlyViewedRestaurants(
    userId: string,
    query: ListRestaurantViewsDto,
  ): Promise<
    Array<{
      restaurantId: string;
      restaurantName: string;
      city?: string | null;
      region?: string | null;
      lastViewedAt: Date;
      viewCount: number;
    }>
  > {
    const take = Math.max(1, Math.min(query.limit ?? 10, 50));
    const prefix = query.prefix?.trim();

    const rows = await this.prisma.restaurantView.findMany({
      where: {
        userId,
        ...(prefix
          ? {
              restaurant: {
                is: {
                  name: { startsWith: prefix, mode: 'insensitive' },
                },
              },
            }
          : {}),
      },
      orderBy: { lastViewedAt: 'desc' },
      take,
      include: {
        restaurant: {
          select: {
            entityId: true,
            name: true,
            city: true,
            region: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      restaurantId: row.restaurant.entityId,
      restaurantName: row.restaurant.name,
      city: row.restaurant.city,
      region: row.restaurant.region,
      lastViewedAt: row.lastViewedAt,
      viewCount: row.viewCount,
    }));
  }

  private resolveViewCooldownMs(): number {
    const raw = process.env.RESTAURANT_VIEW_COOLDOWN_MS;
    const value = raw ? Number.parseInt(raw, 10) : NaN;
    if (Number.isFinite(value) && value >= 0) {
      return value;
    }
    return 120_000;
  }
}
