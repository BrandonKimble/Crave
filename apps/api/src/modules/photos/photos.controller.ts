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
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { CurrentUser } from '../../shared';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';
import { PhotosService } from './photos.service';
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
}

/** Contribution endpoints sit BEHIND the app-wide paywall (subscribers
 *  contribute); no @AllowUnentitled here. */
@Controller('photos')
@UseGuards(ClerkAuthGuard)
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

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
    });
  }

  @Get(':photoId')
  async getPhoto(@Param('photoId', new ParseUUIDPipe()) photoId: string) {
    return this.photos.getPhoto(photoId);
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
  async report(@Param('photoId', new ParseUUIDPipe()) photoId: string) {
    return this.photos.report(photoId);
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
