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
import type { User } from '@prisma/client';
import { PhotoEventType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
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
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';
import { PhotosService } from './photos.service';
import { PhotoReadService } from './photo-read.service';
import { PhotoEventService } from './photo-event.service';
import { CloudinaryService } from './cloudinary.service';

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

/** Contribution endpoints sit BEHIND the app-wide paywall (subscribers
 *  contribute); no @AllowUnentitled here. */
@Controller('photos')
@UseGuards(ClerkAuthGuard)
export class PhotosController {
  constructor(
    private readonly photos: PhotosService,
    private readonly reads: PhotoReadService,
    private readonly events: PhotoEventService,
  ) {}

  @Get('restaurants/:restaurantId/gallery')
  async restaurantGallery(
    @Param('restaurantId', new ParseUUIDPipe()) restaurantId: string,
  ) {
    return this.reads.restaurantGallery(restaurantId);
  }

  @Get('users/:userId/food-log')
  async foodLog(
    @CurrentUser() viewer: User,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.reads.userFoodLog(userId, viewer.userId);
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
  ) {
    return this.photos.report(user.userId, photoId);
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
