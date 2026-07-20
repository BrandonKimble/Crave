import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { RecordRestaurantViewDto } from './dto/record-restaurant-view.dto';
import { RecordFoodViewDto } from './dto/record-food-view.dto';
import { ListRestaurantViewsDto } from './dto/list-restaurant-views.dto';
import { ListFoodViewsDto } from './dto/list-food-views.dto';
import { RestaurantStatusService } from '../search/restaurant-status.service';
import type { RestaurantStatusPreviewDto } from '../search/dto/restaurant-status-preview.dto';
import { SignalsService } from '../signals/signals.service';
import { SignalDemandReadService } from '../signals/signal-demand-read.service';

@Injectable()
export class HistoryService {
  private readonly logger: LoggerService;
  private readonly viewCooldownMs: number;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly restaurantStatusService: RestaurantStatusService,
    private readonly signals: SignalsService,
    private readonly signalDemandRead: SignalDemandReadService,
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

    // Phase C: signals is the ONE write path (the old user_entity_view_events /
    // user_restaurant_views writers are dead). The 2-min repeat-view valve is
    // now a ledger read: the latest entity_view act on this subject.
    const now = new Date();
    const lastViewedAt = await this.signalDemandRead.lastEntityViewAt(userId, {
      entityId: restaurant.entityId,
    });

    const shouldIncrement =
      !lastViewedAt ||
      now.getTime() - lastViewedAt.getTime() >= this.viewCooldownMs;

    if (shouldIncrement) {
      // §3 signals: the entity_view act. Geo is the viewed location's point
      // bbox (dto.locationId when supplied, else the restaurant's primary
      // location; skip-with-debug when none).
      this.signals.record({
        kind: 'entity_view',
        userId,
        subject: { entityId: restaurant.entityId },
        geo: this.signals.bboxFromRestaurantLocation({
          restaurantId: restaurant.entityId,
          locationId: dto.locationId ?? null,
        }),
        meta: {
          contextRestaurantId: restaurant.entityId,
          locationId: dto.locationId ?? undefined,
          source: dto.source ?? undefined,
          // NOT meta.searchRequestId: that key is the read-side act-dedupe key
          // (DEDUPE_KEY_SQL) — a view act must never collapse into its
          // originating search act.
          originSearchRequestId: dto.searchRequestId ?? undefined,
        },
      });
    }

    this.logger.debug('Recorded restaurant view', {
      userId,
      restaurantId: restaurant.entityId,
      shouldIncrement,
      source: dto.source,
    });
  }

  async recordFoodView(userId: string, dto: RecordFoodViewDto): Promise<void> {
    const connection = await this.prisma.connection.findUnique({
      where: { connectionId: dto.connectionId },
      select: { connectionId: true, foodId: true, restaurantId: true },
    });

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    if (dto.foodId && dto.foodId !== connection.foodId) {
      throw new BadRequestException('Connection does not match food');
    }

    const food = await this.prisma.entity.findUnique({
      where: { entityId: connection.foodId },
      select: { entityId: true, type: true },
    });

    if (!food) {
      throw new NotFoundException('Food not found');
    }

    if (food.type !== EntityType.food) {
      throw new BadRequestException('Entity is not a food');
    }

    // Phase C: signals is the ONE write path (see recordRestaurantView). The
    // repeat-view valve keys on the viewed CONNECTION (the dish at a
    // restaurant — the same grain the dead user_food_views table kept).
    const now = new Date();
    const lastViewedAt = await this.signalDemandRead.lastEntityViewAt(userId, {
      entityId: food.entityId,
      connectionId: connection.connectionId,
    });

    const shouldIncrement =
      !lastViewedAt ||
      now.getTime() - lastViewedAt.getTime() >= this.viewCooldownMs;

    if (shouldIncrement) {
      // §3 signals: the entity_view act — subject = the viewed food, context =
      // the serving restaurant.
      this.signals.record({
        kind: 'entity_view',
        userId,
        subject: { entityId: food.entityId },
        geo: this.signals.bboxFromRestaurantLocation({
          restaurantId: connection.restaurantId,
          locationId: dto.locationId ?? null,
        }),
        meta: {
          contextRestaurantId: connection.restaurantId,
          connectionId: connection.connectionId,
          locationId: dto.locationId ?? undefined,
          source: dto.source ?? undefined,
          originSearchRequestId: dto.searchRequestId ?? undefined,
        },
      });
    }

    this.logger.debug('Recorded food view', {
      userId,
      foodId: food.entityId,
      connectionId: connection.connectionId,
      shouldIncrement,
      source: dto.source,
    });
  }

  /**
   * READER CUT (§22 item 6): recently-viewed lists read the signals ledger
   * (kind = entity_view), NOT the dying user_restaurant_views /
   * user_food_views tables. The response contract is frozen, plus the
   * locationId the dual-write records (the recently-viewed location display).
   */
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
      locationId?: string | null;
      statusPreview?: RestaurantStatusPreviewDto | null;
    }>
  > {
    const take = Math.max(1, Math.min(query.limit ?? 10, 50));
    const prefix = query.prefix?.trim();

    const rows = await this.signalDemandRead.recentlyViewedRestaurants(userId, {
      prefix,
      limit: take,
    });

    const restaurantIds = rows.map((row) => row.restaurantId);
    const previews =
      restaurantIds.length > 0
        ? await this.restaurantStatusService.getStatusPreviews({
            restaurantIds,
          })
        : [];
    const previewMap = new Map(
      previews.map((preview) => [preview.restaurantId, preview]),
    );

    return rows.map((row) => ({
      restaurantId: row.restaurantId,
      restaurantName: row.restaurantName,
      city: row.city,
      region: row.region,
      lastViewedAt: row.lastViewedAt,
      viewCount: row.viewCount,
      locationId: row.locationId,
      statusPreview: previewMap.get(row.restaurantId) ?? null,
    }));
  }

  async listRecentlyViewedFoods(
    userId: string,
    query: ListFoodViewsDto,
  ): Promise<
    Array<{
      connectionId: string;
      foodId: string;
      foodName: string;
      restaurantId: string;
      restaurantName: string;
      lastViewedAt: Date;
      viewCount: number;
      locationId?: string | null;
      statusPreview?: RestaurantStatusPreviewDto | null;
    }>
  > {
    const take = Math.max(1, Math.min(query.limit ?? 10, 50));
    const prefix = query.prefix?.trim();

    const rows = await this.signalDemandRead.recentlyViewedFoods(userId, {
      prefix,
      limit: take,
    });

    const restaurantIds = rows.map((row) => row.restaurantId);
    const previews =
      restaurantIds.length > 0
        ? await this.restaurantStatusService.getStatusPreviews({
            restaurantIds,
          })
        : [];
    const previewMap = new Map(
      previews.map((preview) => [preview.restaurantId, preview]),
    );

    return rows.map((row) => ({
      connectionId: row.connectionId,
      foodId: row.foodId,
      foodName: row.foodName,
      restaurantId: row.restaurantId,
      restaurantName: row.restaurantName,
      lastViewedAt: row.lastViewedAt,
      viewCount: row.viewCount,
      locationId: row.locationId,
      statusPreview: previewMap.get(row.restaurantId) ?? null,
    }));
  }

  private resolveViewCooldownMs(): number {
    // 2 min dedupe window for repeat views of the same restaurant
    // (2026-07-11 fold-in: formerly env RESTAURANT_VIEW_COOLDOWN_MS).
    return 120_000;
  }
}
