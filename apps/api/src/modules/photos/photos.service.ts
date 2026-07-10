import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PhotoStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  CloudinaryService,
  type PhotoUrls,
  type SignedUploadTicket,
} from './cloudinary.service';
import { PhotoVisionService } from './photo-vision.service';

export interface PhotoDto {
  photoId: string;
  userId: string;
  restaurantId: string;
  connectionId: string | null;
  status: PhotoStatus;
  caption: string | null;
  takenAt: Date | null;
  uploadedAt: Date;
  urls: PhotoUrls;
}

const PHOTO_DTO_SELECT = {
  photoId: true,
  userId: true,
  restaurantId: true,
  connectionId: true,
  publicId: true,
  status: true,
  caption: true,
  takenAt: true,
  uploadedAt: true,
} as const;

type PhotoRow = Prisma.PhotoGetPayload<{ select: typeof PHOTO_DTO_SELECT }>;

/**
 * The UGC photo lifecycle (plans/images-ideal-shape.md steps 1-2):
 *
 *   ticket (row created PENDING, public_id minted server-side)
 *     -> device uploads DIRECTLY to Cloudinary (signed; preset pins
 *        moderation/incoming-transform/metadata extraction)
 *     -> Cloudinary webhooks: upload notification fills dimensions/focus
 *        score; moderation notification decides safety (takenAt is
 *        client-supplied at ticket time — stored originals are stripped)
 *     -> safety approved -> async is-food gate (Gemini, fail-open)
 *     -> LIVE (or REMOVED, Cloudinary asset destroyed)
 *
 * Webhooks retry only 3x then give up, so PhotoReconciliationService sweeps
 * stale pending rows via the Admin API. Reports: threshold auto-hide, never
 * an approval queue. GPS EXIF is never persisted (only takenAt).
 */
@Injectable()
export class PhotosService {
  private readonly logger: LoggerService;
  private readonly reportHideThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly cloudinary: CloudinaryService,
    private readonly vision: PhotoVisionService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PhotosService');
    this.reportHideThreshold =
      this.configService.get<number>('cloudinary.reportHideThreshold') ?? 3;
  }

  /** Create the pending row + signed direct-upload ticket. takenAt comes
   *  from the CLIENT's picker EXIF (read on-device BEFORE upload): the
   *  incoming transform strips ALL metadata from the stored original —
   *  verified E2E 2026-07-10 — which is the privacy win (GPS never reaches
   *  storage) and why the server can't extract capture time itself. */
  async createUploadTicket(params: {
    userId: string;
    restaurantId: string;
    connectionId?: string;
    caption?: string;
    pendingDishName?: string;
    takenAt?: Date;
  }): Promise<{ photo: PhotoDto; ticket: SignedUploadTicket }> {
    const restaurant = await this.prisma.entity.findUnique({
      where: { entityId: params.restaurantId },
      select: { entityId: true, type: true },
    });
    if (!restaurant || restaurant.type !== 'restaurant') {
      throw new BadRequestException('restaurantId must be a restaurant');
    }
    if (params.connectionId) {
      const connection = await this.prisma.connection.findUnique({
        where: { connectionId: params.connectionId },
        select: { restaurantId: true },
      });
      if (!connection || connection.restaurantId !== params.restaurantId) {
        throw new BadRequestException(
          'connectionId must be a dish of the given restaurant',
        );
      }
    }
    const row = await this.prisma.photo.create({
      data: {
        userId: params.userId,
        restaurantId: params.restaurantId,
        connectionId: params.connectionId ?? null,
        caption: params.caption?.slice(0, 512) ?? null,
        pendingDishName: params.pendingDishName?.slice(0, 256) ?? null,
        takenAt: params.takenAt ?? null,
        publicId: 'pending', // replaced below once the id exists
      },
      select: { photoId: true },
    });
    const publicId = this.cloudinary.publicIdFor(row.photoId);
    const photo = await this.prisma.photo.update({
      where: { photoId: row.photoId },
      data: { publicId },
      select: PHOTO_DTO_SELECT,
    });
    const ticket = this.cloudinary.signUploadTicket(row.photoId);
    return { photo: this.toDto(photo), ticket };
  }

  /** Cloudinary notification entry point (already signature-verified by the
   *  controller). Handles both upload and moderation notifications;
   *  idempotent — replays re-derive the same state. */
  async handleNotification(payload: Record<string, unknown>): Promise<void> {
    const publicId = payload.public_id as string | undefined;
    if (!publicId) return;
    const photo = await this.prisma.photo.findUnique({
      where: { publicId },
      select: { photoId: true, status: true },
    });
    if (!photo) {
      this.logger.warn('Notification for unknown publicId', { publicId });
      return;
    }
    const type = payload.notification_type as string | undefined;
    if (type === 'upload') {
      await this.applyUploadResult(photo.photoId, payload);
      return;
    }
    if (type === 'moderation') {
      const status = this.cloudinary.extractModerationStatus(payload);
      await this.applyModerationResult(photo.photoId, publicId, status);
      return;
    }
    this.logger.debug('Ignored Cloudinary notification type', { type });
  }

  private async applyUploadResult(
    photoId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    // takenAt is client-supplied at ticket time; the stored original is
    // metadata-stripped by the incoming transform (GPS never reaches
    // storage — E2E-verified), so there is nothing to extract here.
    await this.prisma.photo.update({
      where: { photoId },
      data: {
        width: (payload.width as number | undefined) ?? undefined,
        height: (payload.height as number | undefined) ?? undefined,
        bytes: (payload.bytes as number | undefined) ?? undefined,
        focusScore:
          (payload.quality_analysis as { focus?: number } | undefined)?.focus ??
          undefined,
      },
    });
    // Some uploads carry the moderation verdict inline (sync add-ons).
    const inlineStatus = this.cloudinary.extractModerationStatus(payload);
    if (inlineStatus && inlineStatus !== 'pending') {
      const publicId = payload.public_id as string;
      await this.applyModerationResult(photoId, publicId, inlineStatus);
    }
  }

  /** Safety verdict -> is-food gate -> live/removed. Idempotent. */
  async applyModerationResult(
    photoId: string,
    publicId: string,
    moderationStatus: string | undefined,
  ): Promise<void> {
    const photo = await this.prisma.photo.findUnique({
      where: { photoId },
      select: { status: true },
    });
    if (!photo || photo.status !== PhotoStatus.pending) return; // settled
    if (moderationStatus === 'approved') {
      const urls = this.cloudinary.buildUrls(publicId);
      const isFood = await this.vision.isFoodContent(urls.thumb);
      if (!isFood) {
        await this.remove(photoId, publicId, 'not_food');
        return;
      }
      await this.prisma.photo.update({
        where: { photoId },
        data: { status: PhotoStatus.live, moderatedAt: new Date() },
      });
      this.logger.info('Photo live', { photoId });
      return;
    }
    if (moderationStatus === 'rejected') {
      await this.remove(photoId, publicId, 'moderation_rejected');
    }
    // pending/undefined: leave for the reconciliation cron.
  }

  private async remove(
    photoId: string,
    publicId: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.photo.update({
      where: { photoId },
      data: { status: PhotoStatus.removed, moderatedAt: new Date() },
    });
    try {
      await this.cloudinary.destroyAsset(publicId);
    } catch (error) {
      this.logger.error('Failed to destroy removed asset (retry via cron)', {
        photoId,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
    this.logger.info('Photo removed', { photoId, reason });
  }

  /** Owner delete — the ONLY user-initiated destroy. */
  async deleteOwnPhoto(userId: string, photoId: string): Promise<void> {
    const photo = await this.prisma.photo.findUnique({
      where: { photoId },
      select: { userId: true, publicId: true, status: true },
    });
    if (!photo || photo.status === PhotoStatus.removed) {
      throw new NotFoundException('Photo not found');
    }
    if (photo.userId !== userId) {
      throw new ForbiddenException('Not your photo');
    }
    await this.remove(photoId, photo.publicId, 'owner_deleted');
  }

  /** Report -> threshold auto-hide (no approval queue, ever). */
  async report(photoId: string): Promise<{ hidden: boolean }> {
    const photo = await this.prisma.photo.update({
      where: { photoId },
      data: { reportCount: { increment: 1 } },
      select: { reportCount: true, status: true },
    });
    if (
      photo.status === PhotoStatus.live &&
      photo.reportCount >= this.reportHideThreshold
    ) {
      await this.prisma.photo.update({
        where: { photoId },
        data: { status: PhotoStatus.hidden },
      });
      this.logger.warn('Photo auto-hidden by report threshold', { photoId });
      return { hidden: true };
    }
    return { hidden: false };
  }

  async getPhoto(photoId: string): Promise<PhotoDto> {
    const photo = await this.prisma.photo.findUnique({
      where: { photoId },
      select: PHOTO_DTO_SELECT,
    });
    if (!photo) throw new NotFoundException('Photo not found');
    return this.toDto(photo);
  }

  /** Reconciliation sweep: webhooks retry only 3x — any pending row older
   *  than the grace window gets its truth read from the Admin API. */
  async reconcilePending(graceMinutes = 10, batch = 50): Promise<number> {
    const stale = await this.prisma.photo.findMany({
      where: {
        status: PhotoStatus.pending,
        uploadedAt: { lt: new Date(Date.now() - graceMinutes * 60_000) },
      },
      select: { photoId: true, publicId: true, uploadedAt: true },
      orderBy: { uploadedAt: 'asc' },
      take: batch,
    });
    let settled = 0;
    for (const photo of stale) {
      const asset = await this.cloudinary.getAsset(photo.publicId);
      if (!asset.exists) {
        // Ticket issued but upload never happened (or was destroyed):
        // expire abandoned rows after an hour.
        if (photo.uploadedAt.getTime() < Date.now() - 60 * 60_000) {
          await this.prisma.photo.update({
            where: { photoId: photo.photoId },
            data: { status: PhotoStatus.removed, moderatedAt: new Date() },
          });
          settled += 1;
        }
        continue;
      }
      await this.prisma.photo.update({
        where: { photoId: photo.photoId },
        data: {
          width: asset.width ?? undefined,
          height: asset.height ?? undefined,
          bytes: asset.bytes ?? undefined,
          focusScore: asset.focusScore ?? undefined,
        },
      });
      await this.applyModerationResult(
        photo.photoId,
        photo.publicId,
        asset.moderationStatus,
      );
      settled += 1;
    }
    if (stale.length > 0) {
      this.logger.info('Photo reconciliation sweep', {
        examined: stale.length,
        settled,
      });
    }
    return settled;
  }

  private toDto(photo: PhotoRow): PhotoDto {
    return {
      photoId: photo.photoId,
      userId: photo.userId,
      restaurantId: photo.restaurantId,
      connectionId: photo.connectionId,
      status: photo.status,
      caption: photo.caption,
      takenAt: photo.takenAt,
      uploadedAt: photo.uploadedAt,
      urls: this.cloudinary.buildUrls(photo.publicId),
    };
  }
}
