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
import { EntityAccessModule } from '../entities/entity-access.module';

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
    EntityAccessModule,
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
  // PhotoReadService is NOT exported: the seam is the only way out of this
  // module. Exporting it kept a live, DI-resolvable, unfiltered handle
  // available to every other module — which is how the tile gallery breached
  // the seam in the first place (red team 2026-08-02).
  exports: [PhotosService, CloudinaryService, PhotoReads],
})
export class PhotosModule {}
