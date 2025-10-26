import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../../../shared/shared.module';
import { SharedServicesModule } from '../shared/shared-services.module';
import { GooglePlacesService } from './google-places.service';
import { GooglePlacesController } from './google-places.controller';

@Module({
  imports: [
    SharedModule,
    SharedServicesModule,
    ConfigModule,
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
  ],
  providers: [GooglePlacesService],
  controllers: [GooglePlacesController],
  exports: [GooglePlacesService],
})
export class GooglePlacesModule {}
