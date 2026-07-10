import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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

const MAX_PENDING_TICKETS_PER_USER = 10;

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
    // Ticket-minting cap: pending rows cost reconciliation Admin reads —
    // a client bug or abuser must not be able to flood them.
    const pendingCount = await this.prisma.photo.count({
      where: { userId: params.userId, status: PhotoStatus.pending },
    });
    if (pendingCount >= MAX_PENDING_TICKETS_PER_USER) {
      throw new BadRequestException(
        'Too many uploads in flight — finish or wait for them to settle',
      );
    }
    // App-generated id -> the REAL publicId is written in ONE create (a
    // placeholder row would poison the unique index if the process died
    // mid-dance, and two concurrent placeholders collide).
    const photoId = randomUUID();
    const photo = await this.prisma.photo.create({
      data: {
        photoId,
        userId: params.userId,
        restaurantId: params.restaurantId,
        connectionId: params.connectionId ?? null,
        caption: params.caption?.slice(0, 512) ?? null,
        pendingDishName: params.pendingDishName?.slice(0, 256) ?? null,
        takenAt: params.takenAt ?? null,
        publicId: this.cloudinary.publicIdFor(photoId),
      },
      select: PHOTO_DTO_SELECT,
    });
    const ticket = this.cloudinary.signUploadTicket(photoId);
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
    // Upload callbacks don't always carry notification_type — an
    // upload-result-shaped payload (width/bytes present) IS the upload
    // notification (E2E-observed 2026-07-10).
    const rawType = payload.notification_type as string | undefined;
    const type =
      rawType ??
      (payload.width !== undefined || payload.bytes !== undefined
        ? 'upload'
        : undefined);
    if (type === 'upload') {
      await this.applyUploadResult(photo.photoId, payload);
      return;
    }
    if (type === 'moderation') {
      const status = this.cloudinary.extractModerationStatus(payload);
      await this.applyModerationResult(photo.photoId, publicId, status);
      return;
    }
    this.logger.info('Ignored Cloudinary notification', {
      type,
      keys: Object.keys(payload).slice(0, 12),
    });
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

  /** Safety verdict -> is-food gate -> live/removed. Every transition is a
   *  CONDITIONAL update (where status=pending) — the DB arbitrates races
   *  between webhook, reconciliation, and owner-delete; a settled photo can
   *  never be re-moved or resurrected. */
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
        // Not-food keeps the ASSET (classifier false-positives must stay
        // auditable/recoverable); only the row leaves circulation.
        await this.transition(
          photoId,
          PhotoStatus.pending,
          PhotoStatus.removed,
        );
        this.logger.info('Photo removed', { photoId, reason: 'not_food' });
        return;
      }
      const flipped = await this.transition(
        photoId,
        PhotoStatus.pending,
        PhotoStatus.live,
      );
      if (flipped) this.logger.info('Photo live', { photoId });
      return;
    }
    if (moderationStatus === 'rejected') {
      const flipped = await this.transition(
        photoId,
        PhotoStatus.pending,
        PhotoStatus.removed,
      );
      if (flipped) {
        await this.destroyAssetSafely(photoId, publicId);
        this.logger.info('Photo removed', {
          photoId,
          reason: 'moderation_rejected',
        });
      }
    }
    // pending/undefined: leave for the reconciliation cron.
  }

  /** Conditional state transition — returns whether THIS caller won. */
  private async transition(
    photoId: string,
    from: PhotoStatus,
    to: PhotoStatus,
  ): Promise<boolean> {
    const result = await this.prisma.photo.updateMany({
      where: { photoId, status: from },
      data: { status: to, moderatedAt: new Date() },
    });
    return result.count === 1;
  }

  private async destroyAssetSafely(
    photoId: string,
    publicId: string,
  ): Promise<void> {
    try {
      await this.cloudinary.destroyAsset(publicId);
    } catch (error) {
      this.logger.error('Failed to destroy asset (retry via cron)', {
        photoId,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  /** Owner delete — the ONLY user-initiated destroy. Conditional: whatever
   *  state the photo is in moves to removed exactly once. */
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
    const won = await this.prisma.photo.updateMany({
      where: { photoId, status: { not: PhotoStatus.removed } },
      data: { status: PhotoStatus.removed, moderatedAt: new Date() },
    });
    if (won.count === 1) {
      await this.destroyAssetSafely(photoId, photo.publicId);
      this.logger.info('Photo removed', { photoId, reason: 'owner_deleted' });
    }
  }

  /** Report -> threshold auto-hide on DISTINCT reporters (the unique index
   *  on photo_reports is the dedup — one account can never hide a photo
   *  alone). No approval queue, ever. */
  async report(userId: string, photoId: string): Promise<{ hidden: boolean }> {
    const photo = await this.prisma.photo.findUnique({
      where: { photoId },
      select: { status: true },
    });
    if (!photo || photo.status !== PhotoStatus.live) {
      throw new NotFoundException('Photo not found');
    }
    try {
      await this.prisma.photoReport.create({ data: { photoId, userId } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return { hidden: false }; // already reported by this user
      }
      throw error;
    }
    const reporterCount = await this.prisma.photoReport.count({
      where: { photoId },
    });
    await this.prisma.photo.updateMany({
      where: { photoId },
      data: { reportCount: reporterCount },
    });
    if (reporterCount >= this.reportHideThreshold) {
      const hid = await this.prisma.photo.updateMany({
        where: { photoId, status: PhotoStatus.live },
        data: { status: PhotoStatus.hidden },
      });
      if (hid.count === 1) {
        this.logger.warn('Photo auto-hidden by report threshold', { photoId });
        return { hidden: true };
      }
    }
    return { hidden: false };
  }

  /** Visibility: LIVE photos are public; anything else is owner-only —
   *  baked here so every future read path inherits the rule. */
  async getPhoto(photoId: string, viewerUserId?: string): Promise<PhotoDto> {
    const photo = await this.prisma.photo.findUnique({
      where: { photoId },
      select: PHOTO_DTO_SELECT,
    });
    if (!photo) throw new NotFoundException('Photo not found');
    if (photo.status !== PhotoStatus.live && photo.userId !== viewerUserId) {
      throw new NotFoundException('Photo not found');
    }
    return this.toDto(photo);
  }

  /** Reconciliation sweep: webhooks retry only 3x — any pending row older
   *  than the grace window gets its truth read from the Admin API. */
  async reconcilePending(graceMinutes = 10, batch = 25): Promise<number> {
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
