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
import { PhotoReadService } from './photo-read.service';
import { PhotoEventService } from './photo-event.service';
import { CloudinaryService } from './cloudinary.service';
import { PhotoReads } from './photo-reads';

export class CreateUploadTicketDto {
  @IsUUID('4')
  restaurantId!: string;

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
  restaurantId!: string;

  @IsOptional()
  @IsUUID('4')
  connectionId?: string;
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
  async restaurantGallery(
    @CurrentUser() viewer: User,
    @Param('restaurantId', new ParseUUIDPipe()) restaurantId: string,
  ) {
    return this.photoReads
      .forViewer(viewer.userId)
      .restaurantGallery(restaurantId);
  }

  @Get('users/:userId/food-log')
  async foodLog(
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
      .userFoodLog(userId, viewer.userId);
  }

  /** Batch card-strip read: one POST per visible screen of cards (search
   *  results / favorites rows / restaurant dish list all consume it lazily
   *  without touching the search executor DTOs). */
  @Post('strips')
  async strips(@CurrentUser() viewer: User, @Body() dto: GetPhotoStripsDto) {
    return this.photoReads.forViewer(viewer.userId).cardStrips(dto.refs);
  }

  @Post('events')
  recordEvents(@CurrentUser() user: User, @Body() dto: RecordPhotoEventsDto) {
    this.events.record(user.userId, dto.events);
    return { received: true };
  }

  /** Avatar change — same signed-direct-upload machinery; user.avatarUrl
   *  flips when moderation approves (old avatar stays until then). */
  @Post('avatar-ticket')
  createAvatarTicket(@CurrentUser() user: User) {
    return { ticket: this.photos.createAvatarTicket(user.userId) };
  }

  /** Client calls after its direct upload; server reads Cloudinary truth. */
  @Post('avatar-confirm')
  async confirmAvatar(@CurrentUser() user: User) {
    return this.photos.confirmAvatar(user.userId);
  }

  @Post('upload-ticket')
  async createUploadTicket(
    @CurrentUser() user: User,
    @Body() dto: CreateUploadTicketDto,
  ) {
    return this.photos.createUploadTicket({
      userId: user.userId,
      restaurantId: dto.restaurantId,
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
  async deletePhoto(
    @CurrentUser() user: User,
    @Param('photoId', new ParseUUIDPipe()) photoId: string,
  ) {
    await this.photos.deleteOwnPhoto(user.userId, photoId);
    return { deleted: true };
  }

  @Post(':photoId/report')
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
