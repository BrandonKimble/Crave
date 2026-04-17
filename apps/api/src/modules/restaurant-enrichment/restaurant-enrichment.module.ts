import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RepositoryModule } from '../../repositories/repository.module';
import { ExternalIntegrationsModule } from '../external-integrations/external-integrations.module';
import { EntityResolverModule } from '../content-processing/entity-resolver/entity-resolver.module';
import { RankScoreModule } from '../content-processing/rank-score/rank-score.module';
import { MarketsModule } from '../markets/markets.module';
import { RestaurantLocationEnrichmentService } from './restaurant-location-enrichment.service';
import { RestaurantEntityMergeService } from './restaurant-entity-merge.service';
import { RestaurantCuisineExtractionService } from './restaurant-cuisine-extraction.service';
import { RestaurantCuisineExtractionQueueService } from './restaurant-cuisine-extraction-queue.service';
import { RestaurantCuisineExtractionWorker } from './restaurant-cuisine-extraction.worker';
import { isWorkerRuntime } from '../../shared/utils/process-role';
import { RedditCollectorModule } from '../content-processing/reddit-collector/reddit-collector.module';

const restaurantEnrichmentWorkerProviders = isWorkerRuntime()
  ? [RestaurantCuisineExtractionWorker]
  : [];

@Module({
  imports: [
    SharedModule,
    PrismaModule,
    RepositoryModule,
    ExternalIntegrationsModule,
    EntityResolverModule,
    MarketsModule,
    RankScoreModule,
    forwardRef(() => RedditCollectorModule),
    BullModule.registerQueue({
      name: 'restaurant-cuisine-extraction',
    }),
  ],
  providers: [
    RestaurantLocationEnrichmentService,
    RestaurantEntityMergeService,
    RestaurantCuisineExtractionService,
    RestaurantCuisineExtractionQueueService,
    ...restaurantEnrichmentWorkerProviders,
  ],
  exports: [
    RestaurantLocationEnrichmentService,
    RestaurantCuisineExtractionQueueService,
  ],
})
export class RestaurantEnrichmentModule {}
