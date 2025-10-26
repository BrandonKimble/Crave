import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RepositoryModule } from '../../repositories/repository.module';
import { ExternalIntegrationsModule } from '../external-integrations/external-integrations.module';
import { RestaurantLocationEnrichmentService } from './restaurant-location-enrichment.service';

@Module({
  imports: [
    SharedModule,
    PrismaModule,
    RepositoryModule,
    ExternalIntegrationsModule,
  ],
  providers: [RestaurantLocationEnrichmentService],
  exports: [RestaurantLocationEnrichmentService],
})
export class RestaurantEnrichmentModule {}
