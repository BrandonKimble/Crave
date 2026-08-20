import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { RateLimitTier } from '../infrastructure/throttler/throttler.decorator';
import type { User } from '@prisma/client';
import { PhotoEventType, PhotoVisibility } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  Max,
  Min,
  ValidateNested,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { CurrentUser } from '../../shared';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { UserBlockService } from '../identity/user-block.service';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';
import { PhotosService } from './photos.service';
import { PhotoEventService } from './photo-event.service';
import { CloudinaryService } from './cloudinary.service';
import { PhotoReads } from './photo-reads';
import { NoSignal } from '../signals/records-signal.decorator';

export class CreateUploadTicketDto {
  @IsUUID('4')
  placeId!: string;

  @IsOptional()
  @IsUUID('4')
  connectionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  caption?: string;

  /** The "Other…" free-text dish name (demand signal; never creates
   *  entities). */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  pendingDishName?: string;

  /** Capture time from the device picker's EXIF (read client-side BEFORE
   *  upload — the stored original is metadata-stripped for privacy). */
  @IsOptional()
  @IsISO8601()
  takenAt?: string;

  /** Uploader-chosen audience: private photos surface only to the uploader
   *  (own food log / own reads); public read surfaces exclude them. */
  @IsOptional()
  @IsEnum(PhotoVisibility)
  visibility?: PhotoVisibility;
}

export class PhotoEventDto {
  @IsUUID('4')
  photoId!: string;

  @IsEnum(PhotoEventType)
  eventType!: PhotoEventType;

  @IsOptional()
  @IsInt()
  @Min(1)
  count?: number;
}

export class RecordPhotoEventsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PhotoEventDto)
  events!: PhotoEventDto[];
}

/** One card's strip identity: connectionId present = dish card (dish-linked
 *  photos only); absent = restaurant card. */
export class PhotoStripRefDto {
  @IsUUID('4')
  placeId!: string;

  @IsOptional()
  @IsUUID('4')
  connectionId?: string;
}

/**
 * Gallery paging. The service has supported limit/offset since it was written;
 * the ROUTE never exposed them, so the endpoint returned at most the default
 * page and a client had no way to ask for more (red team 2026-08-02).
 *
 * It was invisible until `totalCount` became honest: while the count was
 * (wrongly) the length of the returned page, "60 of 60" looked consistent. Now
 * a 500-photo restaurant reports 500 and hands back 60 — so the gap shows, and
 * gets closed.
 */
export class PlaceGalleryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class GetPhotoStripsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => PhotoStripRefDto)
  refs!: PhotoStripRefDto[];
}

export const PHOTO_REPORT_REASONS = [
  'not_food',
  'inappropriate',
  'wrong_entity',
  'other',
] as const;

export class ReportPhotoDto {
  @IsOptional()
  @IsIn(PHOTO_REPORT_REASONS)
  reason?: (typeof PHOTO_REPORT_REASONS)[number];
}

/** Contribution endpoints sit BEHIND the app-wide paywall (subscribers
 *  contribute); no @AllowUnentitled here. */
@Controller('photos')
@UseGuards(ClerkAuthGuard)
export class PhotosController {
  constructor(
    private readonly photos: PhotosService,
    private readonly events: PhotoEventService,
    private readonly blocks: UserBlockService,
    private readonly photoReads: PhotoReads,
  ) {}

  // EVERY photo read names its viewer (2026-08-02). Blocking used to be
  // enforced per call site — some remembered, PhotoReadService itself had no
  // block logic at all, and cardStrips could not have enforced it because it
  // took no viewer. The seam makes the viewer mandatory and filters inside
  // the read, so forgetting is unrepresentable rather than reviewable.
  @Get('restaurants/:restaurantId/gallery')
  async placeGallery(
    @CurrentUser() viewer: User,
    // Param name MUST match the route segment (':restaurantId' is the URL
    // contract the mobile client calls) — the R14 rename changed the
    // binding without the segment and 400'd every gallery request (red
    // team 2026-08-19 photos-D1, same class as polls-D1).
    @Param('restaurantId', new ParseUUIDPipe()) placeId: string,
    @Query() query: PlaceGalleryQueryDto,
  ) {
    return this.photoReads.forViewer(viewer.userId).placeGallery(placeId, {
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('users/:userId/food-log')
  async itemLog(
    @CurrentUser() viewer: User,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    // §8.6: a blocked pair sees an empty log — the profile body already
    // renders "unavailable". The explicit pair check stays because it short-
    // circuits the WHOLE log (not just that author's rows); the viewer-scoped
    // read is the backstop that no longer depends on anyone remembering.
    if (await this.blocks.isBlockedPair(viewer.userId, userId)) {
      return [];
    }
    return this.photoReads
      .forViewer(viewer.userId)
      .userItemLog(userId, viewer.userId);
  }

  /** Batch card-strip read: one POST per visible screen of cards (search
   *  results / favorites rows / restaurant dish list all consume it lazily
   *  without touching the search executor DTOs). */
  @Post('strips')
  // POST for the refs BODY; a gallery read. The VIEW act is recorded where
  // the entity is opened (entity_view), not once per image fetched.
  @NoSignal(
    'photo strip read; the view act is recorded as entity_view at the entity surface',
  )
  async strips(@CurrentUser() viewer: User, @Body() dto: GetPhotoStripsDto) {
    return this.photoReads.forViewer(viewer.userId).cardStrips(dto.refs);
  }

  @Post('events')
  // Photo impression/engagement telemetry has its own store and its own
  // grain (per IMAGE). The ledger's grain is a user act on a SUBJECT; folding
  // image events in would let one screen mint many acts.
  @NoSignal(
    'per-image engagement telemetry; its own store, its own grain — not one act per image',
  )
  recordEvents(@CurrentUser() user: User, @Body() dto: RecordPhotoEventsDto) {
    this.events.record(user.userId, dto.events);
    return { received: true };
  }

  /** Avatar change — same signed-direct-upload machinery; user.avatarUrl
   *  flips when moderation approves (old avatar stays until then). */
  @Post('avatar-ticket')
  @NoSignal(
    'issues an upload ticket; profile-picture management is not demand for a place',
  )
  createAvatarTicket(@CurrentUser() user: User) {
    return { ticket: this.photos.createAvatarTicket(user.userId) };
  }

  /** Client calls after its direct upload; server reads Cloudinary truth. */
  @Post('avatar-confirm')
  @NoSignal('profile-picture management; not demand for a place')
  async confirmAvatar(@CurrentUser() user: User) {
    return this.photos.confirmAvatar(user.userId);
  }

  @Post('upload-ticket')
  // A CONTRIBUTION, not a demand act: uploading a photo of a place is supply.
  // No declared kind covers it, and adding one is an owner decision.
  @NoSignal(
    'photo contribution is supply, not demand; no declared kind covers it',
  )
  async createUploadTicket(
    @CurrentUser() user: User,
    @Body() dto: CreateUploadTicketDto,
  ) {
    return this.photos.createUploadTicket({
      userId: user.userId,
      placeId: dto.placeId,
      connectionId: dto.connectionId,
      caption: dto.caption,
      pendingDishName: dto.pendingDishName,
      takenAt: dto.takenAt ? new Date(dto.takenAt) : undefined,
      visibility: dto.visibility,
    });
  }

  @Get(':photoId')
  async getPhoto(
    @CurrentUser() user: User,
    @Param('photoId', new ParseUUIDPipe()) photoId: string,
  ) {
    return this.photos.getPhoto(photoId, user.userId);
  }

  @Delete(':photoId')
  @NoSignal('append-only ledger: deleting a photo never unwrites an act')
  async deletePhoto(
    @CurrentUser() user: User,
    @Param('photoId', new ParseUUIDPipe()) photoId: string,
  ) {
    await this.photos.deleteOwnPhoto(user.userId, photoId);
    return { deleted: true };
  }

  @Post(':photoId/report')
  @NoSignal(
    'moderation report: a claim about content, not a demand act; recorded in its own table',
  )
  async report(
    @CurrentUser() user: User,
    @Param('photoId', new ParseUUIDPipe()) photoId: string,
    @Body() dto: ReportPhotoDto,
  ) {
    return this.photos.report(user.userId, photoId, dto.reason);
  }
}

/** Cloudinary notification webhook — its own auth (signature verification,
 *  fail closed), no Clerk, exempt from the paywall. */
@AllowUnentitled()
@Controller('photos/webhooks')
export class PhotosWebhookController {
  constructor(
    private readonly photos: PhotosService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  @Post('cloudinary')
  @RateLimitTier('webhook')
  @HttpCode(200)
  async handleCloudinary(
    @Req() request: { rawBody?: Buffer | string; body?: unknown },
    @Headers('x-cld-timestamp') timestamp: string | undefined,
    @Headers('x-cld-signature') signature: string | undefined,
  ) {
    const rawBody = request.rawBody
      ? Buffer.isBuffer(request.rawBody)
        ? request.rawBody.toString('utf8')
        : request.rawBody
      : JSON.stringify(request.body ?? {});
    if (
      !this.cloudinary.verifyNotificationSignature(
        rawBody,
        timestamp,
        signature,
      )
    ) {
      throw new UnauthorizedException('Invalid Cloudinary signature');
    }
    await this.photos.handleNotification(
      (request.body ?? {}) as Record<string, unknown>,
    );
    return { received: true };
  }
}
