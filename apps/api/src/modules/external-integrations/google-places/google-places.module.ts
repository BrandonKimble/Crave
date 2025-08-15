import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../../../shared/shared.module';
import { GooglePlacesService } from './google-places.service';
import { RestaurantEnrichmentService } from './restaurant-enrichment.service';
import { GooglePlacesHealthController } from './google-places-health.controller';
import { RepositoryModule } from '../../../repositories/repository.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    ConfigModule,
    SharedModule,
    RepositoryModule,
  ],
  providers: [GooglePlacesService, RestaurantEnrichmentService],
  controllers: [GooglePlacesHealthController],
  exports: [GooglePlacesService, RestaurantEnrichmentService],
})
export class GooglePlacesModule {}
