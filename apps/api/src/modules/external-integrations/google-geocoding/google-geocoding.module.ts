import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../../../shared/shared.module';
import { SharedServicesModule } from '../shared/shared-services.module';
import { GoogleGeocodingService } from './google-geocoding.service';

@Module({
  imports: [HttpModule, ConfigModule, SharedModule, SharedServicesModule],
  providers: [GoogleGeocodingService],
  exports: [GoogleGeocodingService],
})
export class GoogleGeocodingModule {}
