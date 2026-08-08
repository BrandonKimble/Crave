import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PhotoStatus, PhotoVisibility, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  CloudinaryService,
  type PhotoUrls,
  type SignedUploadTicket,
} from './cloudinary.service';
import { PhotoVisionService } from './photo-vision.service';
import {
  GoogleVisionService,
  ImageModerationUnavailableError,
} from '../external-integrations/google-vision/google-vision.service';
import { SaveableEntityResolver } from '../entities/saveable-entity.resolver';
import { OpsAlertsService } from '../external-integrations/shared/ops-alerts.service';

/** `uploadedAt` is the client-facing field name (unchanged contract); it is
 *  sourced from the Photo row's `ticketedAt` (stamped at upload-ticket
 *  mint, not at upload completion — see schema.prisma Photo.ticketedAt /
 *  F623). */
export interface PhotoDto {
  photoId: string;
  userId: string;
  restaurantId: string;
  connectionId: string | null;
  status: PhotoStatus;
  visibility: PhotoVisibility;
  caption: string | null;
  takenAt: Date | null;
  uploadedAt: Date;
  urls: PhotoUrls;
}

const MAX_PENDING_TICKETS_PER_USER = 10;

/**
 * A pending photo older than this has been costing a paid Vision call every
 * sweep (~144/day) with nothing to show for it. That is the shape F9703 is
 * about: fail-closed retry is survivable precisely BECAUSE it is unbounded, so
 * the bound cannot be "stop retrying" for a failure that is ours — it has to be
 * "tell somebody". Three days is past any credible vendor outage.
 */
const STUCK_PENDING_ALERT_DAYS = 3;

/** The ops-alert kind that doubles as the avatar destroy-retry queue (F9701). */
const AVATAR_DESTROY_PENDING = 'avatar_destroy_pending';

/**
 * THE SAFETY VERDICT, AS A TYPE ONLY THIS FILE CAN MINT (F9700).
 *
 * The two classifiers fail in opposite directions (see the class doc), and
 * until now the ONLY thing keeping a future caller from handing the state
 * machine a hand-written `'approved'` was a comment. `applyModerationResult`
 * took a bare `string | undefined`: `applyModerationResult(id, pid,
 * 'approved')` type-checked, compiled, and published an unmoderated photo.
 *
 * The brand closes that. `VERDICT_SOURCE` is a module-private symbol, so a
 * value of this type is unconstructible outside this file — the only producers
 * are `safetyVerdict()` (which returns `approved` only when Google said so) and
 * the legacy-rejection constant. `applyModerationResult` is private on top of
 * that; the type is what makes widening it back to public safe rather than the
 * silent hole it was.
 */
const VERDICT_SOURCE = Symbol('crave.photos.safety-verdict');

export interface SafetyDecision {
  readonly [VERDICT_SOURCE]: true;
  readonly decision: 'approved' | 'rejected' | 'unknown';
  /**
   * `unknown` only — CAN A RETRY EVER ANSWER DIFFERENTLY?
   *
   * `sweep`  — yes: our key, our quota, the network. Retry forever; the sweep
   *            alerts if "forever" starts to mean it.
   * `never`  — no: Google read the request and cannot read THIS image. Every
   *            further sweep buys the same answer at $1.50/1,000 (F9703), so
   *            the photo settles instead — removed, never approved.
   */
  readonly retry: 'sweep' | 'never';
}

const APPROVED: SafetyDecision = {
  [VERDICT_SOURCE]: true,
  decision: 'approved',
  retry: 'sweep',
};
const REJECTED: SafetyDecision = {
  [VERDICT_SOURCE]: true,
  decision: 'rejected',
  retry: 'sweep',
};
const UNKNOWN_RETRY: SafetyDecision = {
  [VERDICT_SOURCE]: true,
  decision: 'unknown',
  retry: 'sweep',
};
const UNKNOWN_TERMINAL: SafetyDecision = {
  [VERDICT_SOURCE]: true,
  decision: 'unknown',
  retry: 'never',
};

const PHOTO_DTO_SELECT = {
  photoId: true,
  userId: true,
  restaurantId: true,
  connectionId: true,
  publicId: true,
  status: true,
  visibility: true,
  caption: true,
  takenAt: true,
  ticketedAt: true,
} as const;

type PhotoRow = Prisma.PhotoGetPayload<{ select: typeof PHOTO_DTO_SELECT }>;

/**
 * The UGC photo lifecycle (plans/images-ideal-shape.md steps 1-2):
 *
 *   ticket (row created PENDING, public_id minted server-side)
 *     -> device uploads DIRECTLY to Cloudinary (signed; preset pins the
 *        incoming transform + metadata extraction)
 *     -> Cloudinary upload webhook fills dimensions/focus score (takenAt is
 *        client-supplied at ticket time — stored originals are stripped)
 *     -> SAFETY: we call Google Vision SafeSearch ourselves on the delivery
 *        URL (D149-V — moderation used to be a Cloudinary preset add-on;
 *        see GoogleVisionService for why it moved). Fail-CLOSED: any error
 *        leaves the row pending for the reconciliation sweep to retry.
 *     -> safety approved -> async is-food gate (Gemini, fail-OPEN)
 *     -> LIVE (or REMOVED, Cloudinary asset destroyed)
 *
 * THE TWO CLASSIFIERS FAIL IN OPPOSITE DIRECTIONS, ON PURPOSE:
 *   SAFETY (Vision SafeSearch) errs to PENDING-RETRY — a photo nobody has
 *     vetted must never go live, so a broken moderator delays photos.
 *   IS-FOOD (Gemini) errs to LIVE — topicality is a quality preference, not
 *     a harm, so a broken classifier must not block legitimate photos.
 * A single "fail open" or "fail closed" rule for both would be wrong for one
 * of them.
 *
 * AVATARS RIDE THE SAME MODERATOR AND THE SAME DESTROY DISCIPLINE. They have
 * no Photo row, so a rejected avatar whose Cloudinary destroy fails parks in an
 * ops-alert queue that the same sweep drains (see destroyAvatarAsset / F9701) —
 * "unreferenced" was never the same thing as "gone", because the avatar
 * public_id and its delivery URL are both derivable from the user id.
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
    private readonly safety: GoogleVisionService,
    private readonly saveableEntities: SaveableEntityResolver,
    private readonly opsAlerts: OpsAlertsService,
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
    visibility?: PhotoVisibility;
  }): Promise<{ photo: PhotoDto; ticket: SignedUploadTicket }> {
    // ONE saveable-entity law (D36/F621): redirect-resolve → type →
    // status='active'. Type alone let a photo be anchored on an ARCHIVED
    // restaurant — uploaded, moderated, BILLED, and invisible forever.
    const restaurant = await this.saveableEntities.resolveSaveableRestaurant(
      params.restaurantId,
    );
    if (!restaurant) {
      throw new BadRequestException('restaurantId must be a restaurant');
    }
    // A merge loser's id resolves to the survivor: the photo anchors on the
    // live restaurant rather than the husk.
    const restaurantId = restaurant.entityId;
    // connectionId (a real dish link) and pendingDishName (the "Other…"
    // free-text demand signal) are mutually exclusive by construction —
    // a ticket carrying both is a client bug; reject loudly.
    if (params.connectionId && params.pendingDishName) {
      throw new BadRequestException(
        'connectionId and pendingDishName are mutually exclusive',
      );
    }
    if (params.connectionId) {
      const connection = await this.prisma.connection.findUnique({
        where: { connectionId: params.connectionId },
        select: { restaurantId: true },
      });
      if (!connection || connection.restaurantId !== restaurantId) {
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
        restaurantId,
        connectionId: params.connectionId ?? null,
        caption: params.caption?.slice(0, 512) ?? null,
        pendingDishName: params.pendingDishName?.slice(0, 256) ?? null,
        takenAt: params.takenAt ?? null,
        visibility: params.visibility ?? PhotoVisibility.public,
        publicId: this.cloudinary.publicIdFor(photoId),
      },
      select: PHOTO_DTO_SELECT,
    });
    const ticket = this.cloudinary.signUploadTicket(photoId);
    return { photo: this.toDto(photo), ticket };
  }

  /** Avatar upload: same machinery, no Photo row — user.avatarUrl is the
   *  state. The new avatar goes live only when moderation approves (the
   *  webhook/branch below); until then the old avatar stays. */
  createAvatarTicket(userId: string): SignedUploadTicket {
    return this.cloudinary.signAvatarTicket(userId);
  }

  /** Pull-based avatar settle (webhooks are at-most-4-attempts and avatars
   *  have no row for the cron to sweep): the client calls this after its
   *  direct upload; the server reads Cloudinary's OWN truth — nothing
   *  client-supplied is trusted. */
  async confirmAvatar(
    userId: string,
  ): Promise<{ status: 'approved' | 'rejected' | 'pending' | 'missing' }> {
    const publicId = this.cloudinary.avatarPublicIdFor(userId);
    const asset = await this.cloudinary.getAsset(publicId);
    if (!asset.exists) return { status: 'missing' as const };
    const version = asset.version ?? Math.floor(Date.now() / 1000);
    // Avatars ride the SAME server-side moderator as photos (D149-V) — they
    // were on the same retired Cloudinary add-on. A legacy `rejected` still
    // counts; approval is ours to decide.
    const verdict =
      asset.moderationStatus === 'rejected'
        ? REJECTED
        : await this.safetyVerdict(
            this.cloudinary.buildAvatarUrl(userId, version),
            { userId, surface: 'avatar' },
          );
    if (verdict.decision === 'approved') {
      await this.prisma.user.updateMany({
        where: { userId, deletedAt: null },
        data: { avatarUrl: this.cloudinary.buildAvatarUrl(userId, version) },
      });
      this.logger.info('Avatar updated (confirm)', { userId });
      return { status: 'approved' as const };
    }
    if (verdict.decision === 'rejected') {
      await this.destroyAvatarAsset(userId, version);
      return { status: 'rejected' as const };
    }
    // Unknown verdict: the old avatar stays and the client can confirm
    // again. Never 'approved' on a moderator failure.
    return { status: 'pending' as const };
  }

  private async applyAvatarNotification(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const publicId = payload.public_id as string;
    const userId = publicId.split('/').pop();
    if (!userId) return;
    const version =
      typeof payload.version === 'number'
        ? payload.version
        : Math.floor(Date.now() / 1000);
    // Legacy aws_rek rejections still count; otherwise we moderate (D149-V).
    const legacy = this.cloudinary.extractModerationStatus(payload);
    const status =
      legacy === 'rejected'
        ? REJECTED
        : await this.safetyVerdict(
            this.cloudinary.buildAvatarUrl(userId, version),
            { userId, surface: 'avatar' },
          );
    if (status.decision === 'approved') {
      // updateMany + deletedAt guard: a deletion between upload and this
      // webhook must never re-populate scrubbed PII (and a missing row is a
      // no-op, not a 500 that makes Cloudinary retry pointlessly).
      const updated = await this.prisma.user.updateMany({
        where: { userId, deletedAt: null },
        data: { avatarUrl: this.cloudinary.buildAvatarUrl(userId, version) },
      });
      if (updated.count === 1) this.logger.info('Avatar updated', { userId });
    } else if (status.decision === 'rejected') {
      await this.destroyAvatarAsset(userId, version);
      this.logger.warn('Avatar rejected by moderation', { userId });
    }
  }

  /**
   * DESTROY A REJECTED AVATAR — AND PARK IT IF THE DESTROY FAILS (F9701).
   *
   * WHAT THIS USED TO BE: a bare `catch {}` whose only comment said the asset
   * was "unreferenced either way". That was the wrong comfort, twice over. The
   * avatar public_id is DETERMINISTIC (`.../avatars/{userId}`)
   * and the delivery URL is derivable, so a rejected image whose destroy threw
   * stays FETCHABLE by anyone who can construct that URL — the same leak
   * F9470 fixed for photos (billed storage plus a live copy of the one image
   * moderation just said nobody should see), except avatars had no row to park
   * in, so the failure was dropped on the floor.
   *
   * THE PARK, WITHOUT A MIGRATION: an unacknowledged `ops_alerts` row IS the
   * queue. It is durable, it is deduped per user (a stuck avatar is one issue,
   * not one per attempt), the sweep drains it below, and — unlike a private
   * table — a destroy that never succeeds is visible to the owner instead of
   * being a silent leak. A dedicated `pending_asset_destroys` table would be
   * the tidier home; it needs a migration, and this lane does not need one to
   * make the promise real.
   *
   * `version` is recorded because the destroy is not versioned: it kills
   * whatever now sits at that public_id. If the user has since uploaded an
   * avatar that PASSED moderation, that newer asset is what a late retry
   * would destroy — so the sweep compares versions and stands down.
   */
  private async destroyAvatarAsset(
    userId: string,
    version: number,
  ): Promise<void> {
    const publicId = this.cloudinary.avatarPublicIdFor(userId);
    try {
      await this.cloudinary.destroyAsset(publicId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        'Failed to destroy rejected avatar (parked, retrying)',
        {
          userId,
          error: { message },
        },
      );
      this.opsAlerts.emit({
        severity: 'warn',
        kind: AVATAR_DESTROY_PENDING,
        title: 'A rejected avatar is still live at Cloudinary',
        body: [
          `Moderation rejected the avatar for user ${userId}, but destroying the asset failed.`,
          `Error: ${message}`,
          `version=${version}`,
          'The photo sweep retries this every 10 minutes and acknowledges this alert once the asset is gone. If it is still open tomorrow, the destroy is failing for a reason no retry fixes.',
        ].join('\n'),
        dedupeKey: `${AVATAR_DESTROY_PENDING}:${userId}`,
      });
    }
  }

  /** Cloudinary notification entry point (already signature-verified by the
   *  controller). Handles both upload and moderation notifications;
   *  idempotent — replays re-derive the same state. */
  async handleNotification(payload: Record<string, unknown>): Promise<void> {
    const publicId = payload.public_id as string | undefined;
    if (!publicId) return;
    if (this.cloudinary.isAvatarPublicId(publicId)) {
      await this.applyAvatarNotification(payload);
      return;
    }
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
      // LEGACY, AND DELIBERATELY ONE-WAY (D149-V). Cloudinary no longer runs
      // moderation for us, but notifications for uploads made BEFORE the
      // preset changed can still arrive. We honor a `rejected` verdict —
      // a rejection is never fabricated and a second opinion that says
      // "unsafe" is worth acting on — and IGNORE `approved`, because
      // approval must come from the moderator we actually run. An ignored
      // approval costs one reconciliation cycle, not a wrong decision.
      const status = this.cloudinary.extractModerationStatus(payload);
      if (status === 'rejected') {
        await this.applyModerationResult(photo.photoId, publicId, REJECTED);
      }
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
    // THE UPLOAD NOTIFICATION IS WHERE SAFETY NOW HAPPENS (D149-V). The
    // bytes exist and the delivery URL resolves, so this is the earliest
    // moment Vision can read the image. Previously this branch only forwarded
    // a verdict Cloudinary's aws_rek add-on had already made inline.
    const publicId = payload.public_id as string;
    const urls = this.cloudinary.buildUrls(publicId);
    const verdict = await this.safetyVerdict(urls.gallery, { photoId });
    await this.applyModerationResult(photoId, publicId, verdict);
  }

  /** Safety verdict -> is-food gate -> live/removed. Every transition is a
   *  CONDITIONAL update (where status=pending) — the DB arbitrates races
   *  between webhook, reconciliation, and owner-delete; a settled photo can
   *  never be re-moved or resurrected. */
  private async applyModerationResult(
    photoId: string,
    publicId: string,
    verdict: SafetyDecision,
  ): Promise<void> {
    const photo = await this.prisma.photo.findUnique({
      where: { photoId },
      select: { status: true },
    });
    if (!photo || photo.status !== PhotoStatus.pending) return; // settled
    if (verdict.decision === 'approved') {
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
    if (verdict.decision === 'rejected') {
      // pending -> destroy_pending (invisible now) -> removed only once the
      // asset is confirmed destroyed. Never `removed` before the bytes are
      // gone (F9470).
      const flipped = await this.transition(
        photoId,
        PhotoStatus.pending,
        PhotoStatus.destroy_pending,
      );
      if (flipped) {
        await this.destroyAndFinalize(photoId, publicId);
        this.logger.info('Photo removed', {
          photoId,
          reason: 'moderation_rejected',
        });
      }
      return;
    }
    if (verdict.retry === 'never') {
      // THE BOUND ON A PAID RETRY (F9703). Google read the request and cannot
      // read this image — an answer that will not change, bought again every
      // ten minutes forever if the row just stays pending. So the photo
      // settles the only way an unvetted photo may: removed, asset destroyed,
      // never approved. The user's other uploads are untouched, and a photo
      // Vision cannot fetch is one nothing else can display either.
      const flipped = await this.transition(
        photoId,
        PhotoStatus.pending,
        PhotoStatus.destroy_pending,
      );
      if (flipped) {
        await this.destroyAndFinalize(photoId, publicId);
        this.logger.warn('Photo removed', {
          photoId,
          reason: 'moderation_unreadable',
        });
      }
      return;
    }
    // unknown + retryable: leave for the reconciliation cron.
  }

  /**
   * THE SAFETY VERDICT (D149-V). Runs Vision SafeSearch against a delivery
   * URL and translates it into the vocabulary applyModerationResult already
   * speaks, so the entire downstream state machine — conditional
   * transitions, is-food gate, destroy_pending on reject — is untouched.
   *
   * `unknown` is what every failure returns, and applyModerationResult leaves
   * an `unknown`+retryable verdict pending for the reconciliation cron, which
   * is precisely the retry. There is no branch in this method that can produce
   * `approved` without Google saying so — and no OTHER method anywhere that
   * can produce an `approved` SafetyDecision at all (F9700).
   */
  private async safetyVerdict(
    imageUrl: string,
    logContext: Record<string, unknown>,
  ): Promise<SafetyDecision> {
    try {
      const verdict = await this.safety.moderateImage(imageUrl);
      if (verdict.decision === 'rejected') {
        this.logger.warn('Safety moderation rejected image', {
          ...logContext,
          reason: verdict.reason,
        });
        return REJECTED;
      }
      return APPROVED;
    } catch (error) {
      const unavailable =
        error instanceof ImageModerationUnavailableError ? error : null;
      const transient = unavailable ? unavailable.transient : true;
      // TERMINAL ONLY FOR THE IMAGE'S OWN FAULT (F9703). A permanent failure
      // that is OURS — no key, a 403, a disabled API — is an outage affecting
      // every photo, and settling photos on it would turn a config mistake
      // into mass deletion. Only "Google read the request and cannot read this
      // image" ends the retry.
      const terminal =
        unavailable !== null &&
        !unavailable.transient &&
        unavailable.scope === 'image';
      const message = error instanceof Error ? error.message : String(error);
      // A PERMANENT failure (missing key, disabled API, unreadable image) is
      // an outage of safety moderation dressed as a quiet retry loop — it
      // logs at ERROR so it surfaces, while a transient one is ordinary
      // weather. Neither approves anything.
      const detail = { ...logContext, transient, terminal, error: { message } };
      if (terminal) {
        this.logger.warn(
          'Safety moderation cannot read this image — settling it instead of paying to re-ask',
          detail,
        );
      } else if (transient) {
        this.logger.warn(
          'Safety moderation unavailable — photo stays pending (cron retries)',
          detail,
        );
      } else {
        this.logger.error(
          'Safety moderation is BROKEN — photos will stay pending until fixed',
          detail,
        );
      }
      return terminal ? UNKNOWN_TERMINAL : UNKNOWN_RETRY;
    }
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

  /** Destroy the Cloudinary asset for a row already parked in
   *  `destroy_pending`, then flip it to `removed`. If the destroy throws, the
   *  row STAYS `destroy_pending` (already invisible to every reader) and the
   *  reconciliation sweep retries — so the asset can never outlive its row
   *  (F9470: the old path flipped straight to `removed`, and since the cron
   *  only re-examined `pending` rows, a failed destroy leaked the asset
   *  forever — billed storage + a privacy hole via the deterministic URL). */
  private async destroyAndFinalize(
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
      return; // leave in destroy_pending; the sweep will retry
    }
    await this.prisma.photo.updateMany({
      where: { photoId, status: PhotoStatus.destroy_pending },
      data: { status: PhotoStatus.removed, moderatedAt: new Date() },
    });
  }

  /** Owner delete — the ONLY user-initiated destroy. Conditional: whatever
   *  state the photo is in moves to removed exactly once. */
  async deleteOwnPhoto(userId: string, photoId: string): Promise<void> {
    const photo = await this.prisma.photo.findUnique({
      where: { photoId },
      select: { userId: true, publicId: true, status: true },
    });
    // 404 for missing/removed AND not-yours alike — a 403/404 split would
    // confirm the existence of another user's (possibly private) photo.
    // Both `removed` AND `destroy_pending` are logically gone to the owner —
    // 404 either (a destroy_pending row is already draining via the sweep; a
    // re-delete would just double-process it).
    if (
      !photo ||
      photo.status === PhotoStatus.removed ||
      photo.status === PhotoStatus.destroy_pending ||
      photo.userId !== userId
    ) {
      throw new NotFoundException('Photo not found');
    }
    // Park in destroy_pending, then destroy; only `removed` once the asset is
    // gone (F9470) — a failed destroy leaves a sweep-retried row, not a leak.
    const won = await this.prisma.photo.updateMany({
      where: {
        photoId,
        status: { notIn: [PhotoStatus.removed, PhotoStatus.destroy_pending] },
      },
      data: { status: PhotoStatus.destroy_pending, moderatedAt: new Date() },
    });
    if (won.count === 1) {
      await this.destroyAndFinalize(photoId, photo.publicId);
      this.logger.info('Photo removed', { photoId, reason: 'owner_deleted' });
    }
  }

  /** Report -> threshold auto-hide on DISTINCT reporters (the unique index
   *  on photo_reports is the dedup — one account can never hide a photo
   *  alone). No approval queue, ever. */
  async report(
    userId: string,
    photoId: string,
    reason?: string,
  ): Promise<{ hidden: boolean }> {
    const photo = await this.prisma.photo.findUnique({
      where: { photoId },
      select: { status: true, visibility: true, userId: true },
    });
    // Reportable = VISIBLE to the reporter (live+public, or their own photo).
    // Anything else 404s: otherwise report is a private-photo existence
    // oracle AND lets strangers drive a photo they can't even see to hidden.
    const visibleToReporter =
      photo != null &&
      ((photo.status === PhotoStatus.live &&
        photo.visibility === PhotoVisibility.public) ||
        photo.userId === userId);
    if (!visibleToReporter) {
      throw new NotFoundException('Photo not found');
    }
    try {
      await this.prisma.photoReport.create({
        data: { photoId, userId, reason: reason ?? null },
      });
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
    // F624: this used to also `photo.updateMany({ data: { reportCount:
    // reporterCount } })` — a second copy of `count(photo_reports)` with NO
    // reader anywhere in the codebase (grepped clean). A write-only column;
    // the count above (from photoReport, the real row-per-report table) is
    // the only value anything ever consulted. The `report_count` DB column
    // itself is left in place (a schema/migration decision, out of scope
    // here) but nothing writes it going forward.
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

  /** Visibility: LIVE + visibility=public photos are public; anything else
   *  is owner-only — baked here so every future read path inherits the
   *  rule. */
  async getPhoto(photoId: string, viewerUserId?: string): Promise<PhotoDto> {
    const photo = await this.prisma.photo.findUnique({
      where: { photoId },
      select: PHOTO_DTO_SELECT,
    });
    if (!photo) throw new NotFoundException('Photo not found');
    const isOwner = photo.userId === viewerUserId;
    const isPublic =
      photo.status === PhotoStatus.live &&
      photo.visibility === PhotoVisibility.public;
    if (!isPublic && !isOwner) {
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
        ticketedAt: { lt: new Date(Date.now() - graceMinutes * 60_000) },
      },
      select: { photoId: true, publicId: true, ticketedAt: true },
      orderBy: { ticketedAt: 'asc' },
      take: batch,
    });
    let settled = 0;
    let failed = 0;
    for (const photo of stale) {
      // F622: was un-caught inside the loop — one Cloudinary error aborted
      // the whole sweep, and because the batch is ordered `ticketedAt asc`,
      // a persistently-failing row at the HEAD wedged the queue forever
      // (the exact stuck-pending state this cron exists to prevent). A
      // per-photo failure is now logged and counted; the sweep keeps going.
      try {
        const asset = await this.cloudinary.getAsset(photo.publicId);
        if (!asset.exists) {
          // Ticket issued but upload never happened (or was destroyed):
          // expire abandoned rows after an hour.
          if (photo.ticketedAt.getTime() < Date.now() - 60 * 60_000) {
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
        // SAFETY IS OURS TO DECIDE NOW (D149-V). The Admin API's
        // `moderationStatus` is only still consulted for a legacy `rejected`
        // left by the retired aws_rek add-on; everything else gets a live
        // Vision verdict. This is also the RETRY arm: a row that stayed
        // pending because Vision was down gets asked again here, every 10
        // minutes, forever — which is what makes fail-closed survivable.
        const verdict =
          asset.moderationStatus === 'rejected'
            ? REJECTED
            : await this.safetyVerdict(
                this.cloudinary.buildUrls(photo.publicId).gallery,
                { photoId: photo.photoId },
              );
        await this.applyModerationResult(
          photo.photoId,
          photo.publicId,
          verdict,
        );
        // Only a real verdict SETTLES anything. Counting a still-retrying
        // verdict as settled would report a clean sweep while the row is
        // still pending — the counter would say the cron is working precisely
        // when it isn't. A TERMINAL unknown does settle the row (it left
        // pending), so it counts.
        if (verdict.decision !== 'unknown' || verdict.retry === 'never') {
          settled += 1;
        }
      } catch (error) {
        failed += 1;
        this.logger.warn(
          'Photo reconciliation: one photo failed, sweep continues',
          {
            photoId: photo.photoId,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          },
        );
      }
    }
    if (stale.length > 0) {
      this.logger.info('Photo reconciliation sweep', {
        examined: stale.length,
        settled,
        failed,
      });
    }
    settled += await this.reconcileDestroyPending(batch);
    await this.reconcileAvatarDestroys(batch);
    await this.alertOnStuckPending();
    return settled;
  }

  /**
   * THE BOUND ON A FAIL-CLOSED RETRY IS A HUMAN, NOT A LIMIT (F9703).
   *
   * A photo whose moderator failure is OURS retries forever, by design — the
   * alternative (settle it) turns a missing API key into mass deletion. But
   * forever costs a paid Vision call per row per sweep and, more importantly,
   * means a user's upload has been invisible for days with nobody told. So the
   * unbounded retry keeps running and this rings the bell instead.
   *
   * Deduped per DAY: a stuck backlog is one issue per day, not one per sweep
   * (144 of them) and not one that goes quiet after the first ring.
   */
  private async alertOnStuckPending(): Promise<void> {
    const cutoff = new Date(
      Date.now() - STUCK_PENDING_ALERT_DAYS * 24 * 60 * 60_000,
    );
    const stuck = await this.prisma.photo.count({
      where: { status: PhotoStatus.pending, ticketedAt: { lt: cutoff } },
    });
    if (stuck === 0) return;
    const day = new Date().toISOString().slice(0, 10);
    this.opsAlerts.emit({
      severity: 'warn',
      kind: 'photos_stuck_pending',
      title: `${stuck} photo(s) stuck pending moderation for over ${STUCK_PENDING_ALERT_DAYS} days`,
      body: [
        `${stuck} photo row(s) have been pending since before ${cutoff.toISOString()}.`,
        'Pending means safety moderation has never returned a verdict, so the sweep re-asks Google every 10 minutes — a paid call each time, per row, indefinitely.',
        'This is the fail-CLOSED posture working (an unvetted photo is never published), but at this age it is an outage: check GOOGLE_VISION_API_KEY, the Vision API quota, and the api log for "Safety moderation is BROKEN".',
      ].join('\n'),
      dedupeKey: `photos_stuck_pending:${day}`,
    });
  }

  /**
   * DRAIN THE PARKED AVATAR DESTROYS (F9701) — the retry half of the promise
   * `destroyAvatarAsset` makes. Unacknowledged alerts of that kind ARE the
   * queue; acknowledging one is how "the asset is gone" gets recorded.
   */
  private async reconcileAvatarDestroys(batch: number): Promise<void> {
    const parked = await this.prisma.opsAlert.findMany({
      where: { kind: AVATAR_DESTROY_PENDING, acknowledgedAt: null },
      orderBy: { createdAt: 'asc' },
      take: batch,
    });
    for (const alert of parked) {
      const userId = alert.dedupeKey?.split(':')[1];
      if (!userId) continue;
      // A NEWER, APPROVED AVATAR MUST NOT BE COLLATERAL. The destroy is not
      // versioned — it removes whatever occupies the public_id now — so if the
      // user has since had an avatar approved at a LATER version, the rejected
      // bytes were already overwritten and there is nothing left to destroy.
      // Retrying would delete the good one.
      const parkedVersion = Number(/version=(\d+)/.exec(alert.body)?.[1] ?? 0);
      const user = await this.prisma.user.findUnique({
        where: { userId },
        select: { avatarUrl: true },
      });
      const liveVersion = Number(
        /\/v(\d+)\//.exec(user?.avatarUrl ?? '')?.[1] ?? 0,
      );
      if (liveVersion > parkedVersion) {
        await this.opsAlerts.acknowledge(alert.alertId);
        continue;
      }
      try {
        await this.cloudinary.destroyAsset(
          this.cloudinary.avatarPublicIdFor(userId),
        );
        await this.opsAlerts.acknowledge(alert.alertId);
        this.logger.info('Parked avatar destroy succeeded', { userId });
      } catch (error) {
        this.logger.warn('Avatar destroy retry failed, will retry next sweep', {
          userId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /** Drain rows parked in `destroy_pending` (a delete or moderation-reject
   *  whose Cloudinary destroy threw). Retry destroyAsset; only on success does
   *  the row become `removed`. This is what makes the "retry via cron" promise
   *  real — without it a failed destroy would leak the asset forever (F9470).
   *  A retry that fails again is logged and left for the next sweep. */
  private async reconcileDestroyPending(batch: number): Promise<number> {
    const pending = await this.prisma.photo.findMany({
      where: { status: PhotoStatus.destroy_pending },
      select: { photoId: true, publicId: true },
      orderBy: { moderatedAt: 'asc' },
      take: batch,
    });
    let destroyed = 0;
    for (const photo of pending) {
      try {
        await this.cloudinary.destroyAsset(photo.publicId);
        await this.prisma.photo.updateMany({
          where: {
            photoId: photo.photoId,
            status: PhotoStatus.destroy_pending,
          },
          data: { status: PhotoStatus.removed, moderatedAt: new Date() },
        });
        destroyed += 1;
      } catch (error) {
        this.logger.warn('Asset destroy retry failed, will retry next sweep', {
          photoId: photo.photoId,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (pending.length > 0) {
      this.logger.info('Photo destroy-pending sweep', {
        examined: pending.length,
        destroyed,
      });
    }
    return destroyed;
  }

  private toDto(photo: PhotoRow): PhotoDto {
    return {
      photoId: photo.photoId,
      userId: photo.userId,
      restaurantId: photo.restaurantId,
      connectionId: photo.connectionId,
      status: photo.status,
      visibility: photo.visibility,
      caption: photo.caption,
      takenAt: photo.takenAt,
      // ticketedAt -> the client-facing `uploadedAt` field (contract
      // unchanged; see PhotoDto doc comment / F623).
      uploadedAt: photo.ticketedAt,
      urls: this.cloudinary.buildUrls(photo.publicId),
    };
  }
}
