import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RepositoryModule } from '../../repositories/repository.module';
import { ExternalIntegrationsModule } from '../external-integrations/external-integrations.module';
import { EntityResolverModule } from '../content-processing/entity-resolver/entity-resolver.module';
import { PublicCraveScoreModule } from '../content-processing/public-crave-score';
import { MarketsModule } from '../markets/markets.module';
import { RestaurantLocationEnrichmentService } from './restaurant-location-enrichment.service';
import { RestaurantJanitorService } from './restaurant-janitor.service';
import { RestaurantEnrichmentQueueService } from './restaurant-enrichment-queue.service';
import { RestaurantEnrichmentWorker } from './restaurant-enrichment.worker';
import { RestaurantEntityMergeService } from './restaurant-entity-merge.service';
import { RestaurantCuisineExtractionService } from './restaurant-cuisine-extraction.service';
import { RestaurantCuisineExtractionQueueService } from './restaurant-cuisine-extraction-queue.service';
import { RestaurantCuisineExtractionWorker } from './restaurant-cuisine-extraction.worker';
import { RestaurantSecondaryLocationExpansionQueueService } from './restaurant-secondary-location-expansion-queue.service';
import { RestaurantSecondaryLocationExpansionWorker } from './restaurant-secondary-location-expansion.worker';
import { isWorkerRuntime } from '../../shared/utils/process-role';
import { RedditCollectorModule } from '../content-processing/reddit-collector/reddit-collector.module';

const restaurantEnrichmentWorkerProviders = isWorkerRuntime()
  ? [
      RestaurantEnrichmentWorker,
      RestaurantCuisineExtractionWorker,
      RestaurantSecondaryLocationExpansionWorker,
    ]
  : [];

@Module({
  imports: [
    SharedModule,
    PrismaModule,
    RepositoryModule,
    ExternalIntegrationsModule,
    EntityResolverModule,
    MarketsModule,
    PublicCraveScoreModule,
    forwardRef(() => RedditCollectorModule),
    BullModule.registerQueue({
      name: 'restaurant-cuisine-extraction',
    }),
    BullModule.registerQueue({
      name: 'restaurant-primary-enrichment',
    }),
    BullModule.registerQueue({
      name: 'restaurant-secondary-location-expansion',
    }),
  ],
  providers: [
    RestaurantLocationEnrichmentService,
    RestaurantJanitorService,
    RestaurantEnrichmentQueueService,
    RestaurantEntityMergeService,
    RestaurantCuisineExtractionService,
    RestaurantCuisineExtractionQueueService,
    RestaurantSecondaryLocationExpansionQueueService,
    ...restaurantEnrichmentWorkerProviders,
  ],
  exports: [
    RestaurantEnrichmentQueueService,
    RestaurantLocationEnrichmentService,
    RestaurantCuisineExtractionQueueService,
    RestaurantSecondaryLocationExpansionQueueService,
  ],
})
export class RestaurantEnrichmentModule {}
