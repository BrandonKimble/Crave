import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../../shared';
import { PrismaModule } from '../../prisma/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { CloudinaryService } from './cloudinary.service';
import { PhotoVisionService } from './photo-vision.service';
import { PhotosService } from './photos.service';
import { PhotosController, PhotosWebhookController } from './photos.controller';
import { PhotoReconciliationService } from './photo-reconciliation.service';

/**
 * UGC photos (product/images.md + plans/images-ideal-shape.md): signed
 * direct uploads to Cloudinary, webhook-driven moderation lifecycle,
 * reconciliation cron, report auto-hide. Read-path propagation (galleries,
 * hero photos on result DTOs) is step 3 and consumes PhotosService.
 */
@Module({
  imports: [ConfigModule, SharedModule, PrismaModule, IdentityModule],
  controllers: [PhotosController, PhotosWebhookController],
  providers: [
    CloudinaryService,
    PhotoVisionService,
    PhotosService,
    PhotoReconciliationService,
  ],
  exports: [PhotosService, CloudinaryService],
})
export class PhotosModule {}
