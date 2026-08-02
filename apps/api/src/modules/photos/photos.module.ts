import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../../shared';
import { PrismaModule } from '../../prisma/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { ExternalIntegrationsModule } from '../external-integrations/external-integrations.module';
import { CloudinaryService } from './cloudinary.service';
import { PhotoVisionService } from './photo-vision.service';
import { PhotosService } from './photos.service';
import { PhotosController, PhotosWebhookController } from './photos.controller';
import { PhotoReconciliationService } from './photo-reconciliation.service';
import { PhotoReadService } from './photo-read.service';
import { PhotoReads } from './photo-reads';
import { PhotoEventService } from './photo-event.service';

/**
 * UGC photos (product/images.md + plans/images-ideal-shape.md): signed
 * direct uploads to Cloudinary, webhook-driven moderation lifecycle,
 * reconciliation cron, report auto-hide. Read-path propagation (galleries,
 * hero photos on result DTOs) is step 3 and consumes PhotosService.
 */
@Module({
  imports: [
    ConfigModule,
    SharedModule,
    PrismaModule,
    IdentityModule,
    // LLMService: the photo is-food gate rides the Gemini gateway now.
    ExternalIntegrationsModule,
  ],
  controllers: [PhotosController, PhotosWebhookController],
  providers: [
    CloudinaryService,
    PhotoVisionService,
    PhotosService,
    PhotoReconciliationService,
    PhotoReadService,
    PhotoReads,
    PhotoEventService,
  ],
  exports: [PhotosService, CloudinaryService, PhotoReadService, PhotoReads],
})
export class PhotosModule {}
