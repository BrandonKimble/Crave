import { Injectable } from '@nestjs/common';
import { Prisma, $Enums } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  descendantPlaceIds,
  isSubdivisionOrBigger,
} from '../places/place-dag-read';
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
   *
   * DURABILITY (red-team 1c): the notification ROW is the durable dispatch
   * queue — NotificationDispatcherService's minute cron sends pending rows
   * with retry. Callers with an atomic publish (the weekly ritual) pass their
   * transaction client as `db` so the rows commit WITH the polls: a crash
   * can then never publish polls while losing their push (nor push polls
   * that were rolled back). Targeting READS stay on the base client — only
   * the insert needs the transaction.
   */
  async queuePollReleaseForPlace(
    payload: PollReleaseForPlacePayload,
    db: Pick<Prisma.TransactionClient, 'notification'> = this.prisma,
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

    await db.notification.createMany({ data });

    this.logger.info('Queued poll release notifications', {
      placeId: payload.placeId,
      placeName: payload.placeName,
      pollCount: payload.pollIds.length,
      deviceCount: devices.length,
    });
  }

  /**
   * THE §4 TARGETING SEAM — devices whose home place (placeAt of the home
   * location resolved at registration; see NotificationDeviceService) is
   * inside the poll place's subtree: homePlaceId ∈ descendantPlaceIds(poll
   * place, roots included). Devices with NULL homePlaceId are excluded by
   * the IN read — we honestly don't know where they live, so they get no
   * poll push. NO market/centroid fallback: this path never reads markets.
   */
  private async resolveHomePlaceDevices(placeId: string) {
    const subtree = await descendantPlaceIds(this.prisma, [placeId]);
    return this.devices.findDevices({ homePlaceIdIn: subtree });
  }
}
