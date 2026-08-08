import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../../../shared/shared.module';
import { SharedServicesModule } from '../shared/shared-services.module';
import { GoogleVisionService } from './google-vision.service';

/**
 * Google Cloud Vision — SafeSearch image moderation only (D149-V). Shaped
 * exactly like GooglePlacesModule: its own HttpModule registration so the
 * per-call timeout is this vendor's, SharedServicesModule for the usage
 * ledger.
 */
@Module({
  imports: [
    SharedModule,
    SharedServicesModule,
    ConfigModule,
    HttpModule.register({ timeout: 15000, maxRedirects: 5 }),
  ],
  providers: [GoogleVisionService],
  exports: [GoogleVisionService],
})
export class GoogleVisionModule {}
