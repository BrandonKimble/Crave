import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RepositoryModule } from '../../repositories/repository.module';
import { ExternalIntegrationsModule } from '../external-integrations/external-integrations.module';
import { EntityResolverModule } from '../content-processing/entity-resolver/entity-resolver.module';
import { RestaurantLocationEnrichmentService } from './restaurant-location-enrichment.service';
import { RestaurantEntityMergeService } from './restaurant-entity-merge.service';

@Module({
  imports: [
    SharedModule,
    PrismaModule,
    RepositoryModule,
    ExternalIntegrationsModule,
    EntityResolverModule,
  ],
  providers: [
    RestaurantLocationEnrichmentService,
    RestaurantEntityMergeService,
  ],
  exports: [RestaurantLocationEnrichmentService],
})
export class RestaurantEnrichmentModule {}
