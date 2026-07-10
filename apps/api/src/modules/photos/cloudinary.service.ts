import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { LoggerService } from '../../shared';

/** The four delivery variants — NAMED transformations in Cloudinary
 *  (allowlisted under strict transformations; created by
 *  scripts/cloudinary-setup.ts). f_auto/q_auto are appended INLINE because
 *  f_auto is inert inside named transformations (researched 2026-07-09). */
export const PHOTO_VARIANTS = {
  thumb: 't_crave_thumb',
  card: 't_crave_card',
  gallery: 't_crave_gallery',
  full: 't_crave_full',
} as const;
export type PhotoVariant = keyof typeof PHOTO_VARIANTS;

export interface PhotoUrls {
  thumb: string;
  card: string;
  gallery: string;
  full: string;
}

export interface SignedUploadTicket {
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  uploadPreset: string;
  notificationUrl?: string;
}

/**
 * The ONE Cloudinary boundary (plans/images-ideal-shape.md step-1/2
 * decisions): server signs upload tickets (bytes go device -> Cloudinary
 * directly), verifies webhook signatures, builds every delivery URL
 * (clients NEVER hand-roll URLs), and reads asset state for the
 * reconciliation cron. Configuration comes from CLOUDINARY_* env; when
 * unconfigured every entry point fails loud (photos are a real feature —
 * no silent no-ops).
 */
@Injectable()
export class CloudinaryService {
  private readonly logger: LoggerService;
  private readonly configured: boolean;
  private readonly cloudName: string | undefined;
  private readonly apiKey: string | undefined;
  private readonly apiSecret: string | undefined;
  private readonly envPrefix: string;
  private readonly uploadPreset: string;
  private readonly notificationUrl: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('CloudinaryService');
    this.cloudName = this.configService.get<string>('cloudinary.cloudName');
    this.apiKey = this.configService.get<string>('cloudinary.apiKey');
    this.apiSecret = this.configService.get<string>('cloudinary.apiSecret');
    this.envPrefix =
      this.configService.get<string>('cloudinary.envPrefix') || 'dev';
    this.uploadPreset =
      this.configService.get<string>('cloudinary.uploadPreset') ||
      'crave_ugc_photo';
    this.notificationUrl = this.configService.get<string>(
      'cloudinary.notificationUrl',
    );
    this.configured = Boolean(this.cloudName && this.apiKey && this.apiSecret);
    if (this.configured) {
      cloudinary.config({
        cloud_name: this.cloudName,
        api_key: this.apiKey,
        api_secret: this.apiSecret,
        secure: true,
      });
    } else {
      this.logger.warn(
        'Cloudinary not configured (CLOUDINARY_* env missing) — photo endpoints will 503',
      );
    }
  }

  private ensureConfigured(): void {
    if (!this.configured) {
      throw new ServiceUnavailableException('Photo storage is not configured');
    }
  }

  publicIdFor(photoId: string): string {
    return `crave/${this.envPrefix}/photos/${photoId}`;
  }

  /** Sign a direct-upload ticket. The signature covers EVERY param the
   *  client must send, so none of them (public_id, preset,
   *  notification_url) can be altered client-side. Everything else
   *  (folder, incoming transformation, allowed formats, moderation,
   *  media_metadata, quality_analysis) is pinned INSIDE the signed
   *  upload preset — set up once by scripts/cloudinary-setup.ts. */
  signUploadTicket(photoId: string): SignedUploadTicket {
    this.ensureConfigured();
    const publicId = this.publicIdFor(photoId);
    const timestamp = Math.floor(Date.now() / 1000);
    const params: Record<string, string | number> = {
      public_id: publicId,
      timestamp,
      upload_preset: this.uploadPreset,
      ...(this.notificationUrl
        ? { notification_url: this.notificationUrl }
        : {}),
    };
    const signature = cloudinary.utils.api_sign_request(
      params,
      this.apiSecret!,
    );
    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`,
      apiKey: this.apiKey!,
      timestamp,
      signature,
      publicId,
      uploadPreset: this.uploadPreset,
      notificationUrl: this.notificationUrl,
    };
  }

  /** Verify Cloudinary's notification signature via the SDK's own verifier
   *  (X-Cld-Signature + X-Cld-Timestamp; staleness enforced by validFor).
   *  Fail CLOSED — an unverified webhook can flip photo statuses. */
  verifyNotificationSignature(
    rawBody: string,
    timestampHeader: string | undefined,
    signatureHeader: string | undefined,
    maxAgeSeconds = 7200,
  ): boolean {
    this.ensureConfigured();
    if (!timestampHeader || !signatureHeader) return false;
    const timestamp = Number(timestampHeader);
    if (!Number.isFinite(timestamp)) return false;
    try {
      return cloudinary.utils.verifyNotificationSignature(
        rawBody,
        timestamp,
        signatureHeader,
        maxAgeSeconds,
      );
    } catch {
      return false;
    }
  }

  /** THE delivery-URL builder — every DTO carries these; no client ever
   *  constructs a Cloudinary URL. Named transformation (geometry/quality)
   *  + inline f_auto,q_auto chained after it. */
  buildUrls(publicId: string): PhotoUrls {
    const base = `https://res.cloudinary.com/${this.cloudName}/image/upload`;
    const url = (variant: PhotoVariant) =>
      `${base}/${PHOTO_VARIANTS[variant]}/f_auto,q_auto/${publicId}`;
    return {
      thumb: url('thumb'),
      card: url('card'),
      gallery: url('gallery'),
      full: url('full'),
    };
  }

  /** Admin read for the reconciliation cron (≤500 req/hr on free — the
   *  cron sweeps in ONE list call, never per-photo). */
  async listPendingModeration(
    maxResults = 100,
  ): Promise<Array<{ publicId: string; status: string }>> {
    this.ensureConfigured();
    const response = (await cloudinary.api.resources_by_moderation(
      'aws_rek',
      'pending',
      { max_results: maxResults },
    )) as {
      resources?: Array<{ public_id: string; moderation_status?: string }>;
    };
    return (response.resources ?? []).map((resource) => ({
      publicId: resource.public_id,
      status: resource.moderation_status ?? 'pending',
    }));
  }

  /** Fetch a single asset's state (reconciliation fallback + confirm). */
  async getAsset(publicId: string): Promise<{
    exists: boolean;
    moderationStatus?: string;
    width?: number;
    height?: number;
    bytes?: number;
    focusScore?: number;
    takenAt?: Date;
  }> {
    this.ensureConfigured();
    try {
      const resource = (await cloudinary.api.resource(publicId, {
        media_metadata: true,
        quality_analysis: true,
        moderations: true,
      })) as Record<string, unknown>;
      return {
        exists: true,
        moderationStatus: this.extractModerationStatus(resource),
        width: resource.width as number | undefined,
        height: resource.height as number | undefined,
        bytes: resource.bytes as number | undefined,
        focusScore: (
          resource.quality_analysis as { focus?: number } | undefined
        )?.focus,
        takenAt: this.extractTakenAt(resource),
      };
    } catch (error) {
      const status = (error as { error?: { http_code?: number } }).error
        ?.http_code;
      if (status === 404) return { exists: false };
      throw error;
    }
  }

  async destroyAsset(publicId: string): Promise<void> {
    this.ensureConfigured();
    await cloudinary.uploader.destroy(publicId, { invalidate: true });
  }

  extractModerationStatus(
    payload: Record<string, unknown>,
  ): string | undefined {
    const moderation = payload.moderation;
    if (Array.isArray(moderation) && moderation.length > 0) {
      const entry = moderation[0] as { status?: string };
      return entry.status;
    }
    // Webhook moderation notifications carry a flat moderation_status.
    return payload.moderation_status as string | undefined;
  }

  extractTakenAt(payload: Record<string, unknown>): Date | undefined {
    const metadata = (payload.media_metadata ?? payload.image_metadata) as
      | Record<string, string>
      | undefined;
    const raw = metadata?.DateTimeOriginal ?? metadata?.CreateDate;
    if (!raw) return undefined;
    // EXIF format: "YYYY:MM:DD HH:MM:SS" — normalize the date part.
    const normalized = raw.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }
}
