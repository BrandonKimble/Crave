import { Injectable } from '@nestjs/common';
import { Prisma, $Enums } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { isSubdivisionOrBigger } from '../places/place-dag-read';
import { NotificationDeviceService } from './notification-device.service';

export interface PollReleaseForPlacePayload {
  placeId: string;
  placeName: string;
  pollIds: string[];
  scheduledFor?: Date | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger: LoggerService;

  constructor(
    loggerService: LoggerService,
    private readonly prisma: PrismaService,
    private readonly devices: NotificationDeviceService,
  ) {
    this.logger = loggerService.setContext('NotificationsService');
  }

  /**
   * §4 poll-publish notifications, PLACE-keyed: target devices whose HOME
   * place — placeAt(home location), i.e. the smallest catalog place
   * containing it (§2/§3) — is the poll's place or a descendant of it.
   *
   * §4 boundary (enforced HERE, in targeting): big-place (subdivision+)
   * polls are feed-at-that-zoom only — NEVER push. Bigness is the
   * structural DAG judgment (place-dag-read), not a vocabulary switch.
   */
  async queuePollReleaseForPlace(
    payload: PollReleaseForPlacePayload,
  ): Promise<void> {
    if (await isSubdivisionOrBigger(this.prisma, payload.placeId)) {
      this.logger.info(
        'Skipping poll release push for subdivision+ place (§4: feed-at-that-zoom only)',
        { placeId: payload.placeId, placeName: payload.placeName },
      );
      return;
    }

    const devices = await this.resolveHomePlaceDevices(payload.placeId);
    if (!devices.length) {
      this.logger.warn('No devices targeted for poll release notification', {
        placeId: payload.placeId,
        placeName: payload.placeName,
      });
      return;
    }

    const scheduledFor =
      payload.scheduledFor && payload.scheduledFor > new Date()
        ? payload.scheduledFor
        : new Date();
    const status =
      scheduledFor.getTime() > Date.now()
        ? $Enums.NotificationStatus.scheduled
        : $Enums.NotificationStatus.pending;

    const payloadData: Prisma.JsonObject = {
      placeId: payload.placeId,
      placeName: payload.placeName,
      pollIds: payload.pollIds,
    };

    const data = devices.map((device) => ({
      type: $Enums.NotificationType.poll_release,
      status,
      payload: payloadData,
      scheduledFor,
      deviceId: device.deviceId,
    }));

    await this.prisma.notification.createMany({ data });

    this.logger.info('Queued poll release notifications', {
      placeId: payload.placeId,
      placeName: payload.placeName,
      pollCount: payload.pollIds.length,
      deviceCount: devices.length,
    });
  }

  /**
   * THE §4 TARGETING SEAM — devices whose home place is inside the poll
   * place's subtree.
   *
   * WHAT FEEDS IT (not built yet — do NOT invent an estimator here): device
   * registration must carry a home location; placeAt(home) =
   * PlacesCatalogService.smallestContaining(point) resolves it to a
   * homePlaceId stored on notification_devices; this seam then matches
   * homePlaceId ∈ descendantPlaceIds(poll place). That lands with the
   * mobile leg of the cut (registration DTO + column + backfill-on-register).
   *
   * TODO(geo-rebuild §4 — LOUD, NOTIFICATION-ONLY SHIM): until home-place
   * registration exists, targeting falls back to the LEGACY device `city`
   * registration keyed by the smallest active market whose bbox contains the
   * poll place's centroid — the old marketKey shim, quarantined HERE (polls
   * and the feed no longer touch marketKey anywhere). Delete this fallback
   * (and the legacy `city` device field read) when homePlaceId lands.
   */
  private async resolveHomePlaceDevices(placeId: string) {
    const place = await this.prisma.place.findUnique({
      where: { placeId },
      select: { centroidLat: true, centroidLng: true },
    });
    if (place?.centroidLat == null || place.centroidLng == null) {
      return [];
    }
    const lat = Number(place.centroidLat);
    const lng = Number(place.centroidLng);
    const markets = await this.prisma.market.findMany({
      where: {
        isActive: true,
        bboxSwLat: { lte: lat },
        bboxNeLat: { gte: lat },
        bboxSwLng: { lte: lng },
        bboxNeLng: { gte: lng },
      },
      select: {
        marketKey: true,
        bboxSwLat: true,
        bboxNeLat: true,
        bboxSwLng: true,
        bboxNeLng: true,
      },
    });
    if (!markets.length) {
      return [];
    }
    let best: { marketKey: string; area: number } | null = null;
    for (const market of markets) {
      const area =
        (Number(market.bboxNeLat) - Number(market.bboxSwLat)) *
        (Number(market.bboxNeLng) - Number(market.bboxSwLng));
      if (!best || area < best.area) {
        best = { marketKey: market.marketKey, area };
      }
    }
    if (!best) {
      return [];
    }
    return this.devices.findDevices({ city: best.marketKey });
  }
}
