import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RepositoryModule } from '../../repositories/repository.module';
import { ExternalIntegrationsModule } from '../external-integrations/external-integrations.module';
import { EntityResolverModule } from '../content-processing/entity-resolver/entity-resolver.module';
import { RankScoreModule } from '../content-processing/rank-score/rank-score.module';
import { CoverageKeyModule } from '../coverage-key/coverage-key.module';
import { RestaurantLocationEnrichmentService } from './restaurant-location-enrichment.service';
import { RestaurantEntityMergeService } from './restaurant-entity-merge.service';
import { RestaurantCuisineExtractionService } from './restaurant-cuisine-extraction.service';
import { RestaurantCuisineExtractionQueueService } from './restaurant-cuisine-extraction-queue.service';
import { RestaurantCuisineExtractionWorker } from './restaurant-cuisine-extraction.worker';

@Module({
  imports: [
    SharedModule,
    PrismaModule,
    RepositoryModule,
    ExternalIntegrationsModule,
    EntityResolverModule,
    CoverageKeyModule,
    RankScoreModule,
    BullModule.registerQueue({
      name: 'restaurant-cuisine-extraction',
    }),
  ],
  providers: [
    RestaurantLocationEnrichmentService,
    RestaurantEntityMergeService,
    RestaurantCuisineExtractionService,
    RestaurantCuisineExtractionQueueService,
    RestaurantCuisineExtractionWorker,
  ],
  exports: [
    RestaurantLocationEnrichmentService,
    RestaurantCuisineExtractionQueueService,
  ],
})
export class RestaurantEnrichmentModule {}
