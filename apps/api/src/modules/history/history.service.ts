import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { RecordPlaceViewDto } from './dto/record-restaurant-view.dto';
import { RecordItemViewDto } from './dto/record-food-view.dto';
import { ListPlaceViewsDto } from './dto/list-restaurant-views.dto';
import { ListItemViewsDto } from './dto/list-food-views.dto';
import { PlaceStatusService } from '../search/restaurant-status.service';
import type { PlaceStatusPreviewDto } from '../search/dto/restaurant-status-preview.dto';
import { SignalsService } from '../signals/signals.service';
import { SignalDemandReadService } from '../signals/signal-demand-read.service';
import { SaveableEntityResolver } from '../entities/saveable-entity.resolver';

// 2 min dedupe window for repeat views of the same restaurant/dish (2026-07-11
// fold-in: formerly env RESTAURANT_VIEW_COOLDOWN_MS; F681 — a zero-arg method
// that only ever returned this literal was a constant wearing a function's
// clothes).
const VIEW_COOLDOWN_MS = 120_000;

@Injectable()
export class HistoryService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly placeStatusService: PlaceStatusService,
    private readonly signals: SignalsService,
    private readonly signalDemandRead: SignalDemandReadService,
    private readonly saveableEntities: SaveableEntityResolver,
  ) {
    this.logger = loggerService.setContext('HistoryService');
  }

  async recordPlaceView(
    userId: string,
    dto: RecordPlaceViewDto,
  ): Promise<void> {
    // ONE saveable-entity law (D36/F682): redirect-resolve → type →
    // status='active'. Type alone let an entity_view act be written against
    // an ARCHIVED entity; a merge loser's id now records against the
    // survivor rather than against a husk.
    const place = await this.saveableEntities.resolveSaveablePlace(dto.placeId);

    if (!place) {
      throw new NotFoundException('Restaurant not found');
    }

    // Phase C: signals is the ONE write path (the old user_entity_view_events /
    // user_restaurant_views writers are dead). The 2-min repeat-view valve is
    // now a ledger read: the latest entity_view act on this subject.
    const now = new Date();
    const lastViewedAt = await this.signalDemandRead.lastEntityViewAt(userId, {
      entityId: place.entityId,
    });

    const shouldIncrement =
      !lastViewedAt ||
      now.getTime() - lastViewedAt.getTime() >= VIEW_COOLDOWN_MS;

    if (shouldIncrement) {
      // §3 signals: the entity_view act. Geo is the viewed location's point
      // bbox (dto.locationId when supplied, else the restaurant's primary
      // location; skip-with-debug when none).
      this.signals.record({
        kind: 'entity_view',
        userId,
        subject: { entityId: place.entityId },
        geo: this.signals.bboxFromPlaceLocation({
          placeId: place.entityId,
          locationId: dto.locationId ?? null,
        }),
        meta: {
          contextRestaurantId: place.entityId,
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
      placeId: place.entityId,
      shouldIncrement,
      source: dto.source,
    });
  }

  async recordItemView(userId: string, dto: RecordItemViewDto): Promise<void> {
    const connection = await this.prisma.connection.findUnique({
      where: { connectionId: dto.connectionId },
      select: { connectionId: true, itemId: true, placeId: true },
    });

    if (!connection) {
      throw new NotFoundException('Connection not found');
    }

    if (dto.itemId && dto.itemId !== connection.itemId) {
      throw new BadRequestException('Connection does not match food');
    }

    // Same one law on the dish side (D36/F682).
    const item = await this.saveableEntities.resolveSaveableItem(
      connection.itemId,
    );

    if (!item) {
      throw new NotFoundException('Food not found');
    }

    // Phase C: signals is the ONE write path (see recordRestaurantView). The
    // repeat-view valve keys on the viewed CONNECTION (the dish at a
    // restaurant — the same grain the dead user_food_views table kept).
    const now = new Date();
    const lastViewedAt = await this.signalDemandRead.lastEntityViewAt(userId, {
      entityId: item.entityId,
      connectionId: connection.connectionId,
    });

    const shouldIncrement =
      !lastViewedAt ||
      now.getTime() - lastViewedAt.getTime() >= VIEW_COOLDOWN_MS;

    if (shouldIncrement) {
      // §3 signals: the entity_view act — subject = the viewed food, context =
      // the serving restaurant.
      this.signals.record({
        kind: 'entity_view',
        userId,
        subject: { entityId: item.entityId },
        geo: this.signals.bboxFromPlaceLocation({
          placeId: connection.placeId,
          locationId: dto.locationId ?? null,
        }),
        meta: {
          contextRestaurantId: connection.placeId,
          connectionId: connection.connectionId,
          locationId: dto.locationId ?? undefined,
          source: dto.source ?? undefined,
          originSearchRequestId: dto.searchRequestId ?? undefined,
        },
      });
    }

    this.logger.debug('Recorded food view', {
      userId,
      itemId: item.entityId,
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
  async listRecentlyViewedPlaces(
    userId: string,
    query: ListPlaceViewsDto,
  ): Promise<
    Array<{
      placeId: string;
      placeName: string;
      city?: string | null;
      region?: string | null;
      lastViewedAt: Date;
      viewCount: number;
      locationId?: string | null;
      /** Earned address suggestion: the viewed location's address label. */
      locationAddress?: string | null;
      statusPreview?: PlaceStatusPreviewDto | null;
    }>
  > {
    const take = Math.max(1, Math.min(query.limit ?? 10, 50));
    const prefix = query.prefix?.trim();

    const rows = await this.signalDemandRead.recentlyViewedPlaces(userId, {
      prefix,
      limit: take,
    });

    const placeIds = rows.map((row) => row.placeId);
    const [previews, addressByLocationId] = await Promise.all([
      placeIds.length > 0
        ? this.placeStatusService.getStatusPreviews({ placeIds })
        : Promise.resolve([]),
      this.loadLocationAddresses(rows.map((row) => row.locationId ?? null)),
    ]);
    const previewMap = new Map(
      previews.map((preview) => [preview.placeId, preview]),
    );

    return rows.map((row) => ({
      placeId: row.placeId,
      placeName: row.placeName,
      city: row.city,
      region: row.region,
      lastViewedAt: row.lastViewedAt,
      viewCount: row.viewCount,
      locationId: row.locationId,
      locationAddress: row.locationId
        ? (addressByLocationId.get(row.locationId) ?? null)
        : null,
      statusPreview: previewMap.get(row.placeId) ?? null,
    }));
  }

  async listRecentlyViewedItems(
    userId: string,
    query: ListItemViewsDto,
  ): Promise<
    Array<{
      connectionId: string;
      itemId: string;
      itemName: string;
      placeId: string;
      placeName: string;
      lastViewedAt: Date;
      viewCount: number;
      locationId?: string | null;
      /** Earned address suggestion: the viewed location's address label. */
      locationAddress?: string | null;
      statusPreview?: PlaceStatusPreviewDto | null;
    }>
  > {
    const take = Math.max(1, Math.min(query.limit ?? 10, 50));
    const prefix = query.prefix?.trim();

    const rows = await this.signalDemandRead.recentlyViewedItems(userId, {
      prefix,
      limit: take,
    });

    const placeIds = rows.map((row) => row.placeId);
    const [previews, addressByLocationId] = await Promise.all([
      placeIds.length > 0
        ? this.placeStatusService.getStatusPreviews({ placeIds })
        : Promise.resolve([]),
      this.loadLocationAddresses(rows.map((row) => row.locationId ?? null)),
    ]);
    const previewMap = new Map(
      previews.map((preview) => [preview.placeId, preview]),
    );

    return rows.map((row) => ({
      connectionId: row.connectionId,
      itemId: row.itemId,
      itemName: row.itemName,
      placeId: row.placeId,
      placeName: row.placeName,
      lastViewedAt: row.lastViewedAt,
      viewCount: row.viewCount,
      locationId: row.locationId,
      locationAddress: row.locationId
        ? (addressByLocationId.get(row.locationId) ?? null)
        : null,
      statusPreview: previewMap.get(row.placeId) ?? null,
    }));
  }

  /** Batch address labels for the viewed locations (earned address display). */
  private async loadLocationAddresses(
    locationIds: Array<string | null>,
  ): Promise<Map<string, string | null>> {
    const distinctIds = Array.from(
      new Set(locationIds.filter((id): id is string => Boolean(id))),
    );
    if (distinctIds.length === 0) {
      return new Map();
    }
    const locations = await this.prisma.placeLocation.findMany({
      where: { locationId: { in: distinctIds } },
      select: { locationId: true, address: true },
    });
    return new Map(
      locations.map((location) => [location.locationId, location.address]),
    );
  }
}
