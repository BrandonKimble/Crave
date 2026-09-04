import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ExternalIntegrationsModule } from '../external-integrations/external-integrations.module';
import { EntityResolverModule } from '../content-processing/entity-resolver/entity-resolver.module';
import { PublicCraveScoreModule } from '../content-processing/public-crave-score';
import { PlaceLocationEnrichmentService } from './restaurant-location-enrichment.service';
import { PlaceJanitorService } from './restaurant-janitor.service';
import { PlaceEnrichmentQueueService } from './restaurant-enrichment-queue.service';
import { PlaceEnrichmentWorker } from './restaurant-enrichment.worker';
import { PlaceEntityMergeService } from './restaurant-entity-merge.service';
import { NightlyConvergenceService } from './nightly-convergence.service';
import { PlaceTypeCensusService } from './place-type-census.service';
import { MarketMembershipService } from './market-membership.service';
import { PlaceCuisineExtractionService } from './restaurant-cuisine-extraction.service';
import { VenueCuisineEvidenceService } from './venue-cuisine-evidence.service';
import { PlaceCuisineExtractionQueueService } from './restaurant-cuisine-extraction-queue.service';
import { PlaceCuisineExtractionWorker } from './restaurant-cuisine-extraction.worker';
import { PlaceSecondaryLocationExpansionQueueService } from './restaurant-secondary-location-expansion-queue.service';
import { PlaceSecondaryLocationExpansionWorker } from './restaurant-secondary-location-expansion.worker';
import { isWorkerRuntime } from '../../shared/utils/process-role';
import { RedditCollectorModule } from '../content-processing/reddit-collector/reddit-collector.module';
import { AttributeOntologyModule } from '../attribute-ontology/attribute-ontology.module';
import { EntityTextSearchModule } from '../entity-text-search/entity-text-search.module';

const placeEnrichmentWorkerProviders = isWorkerRuntime()
  ? [
      PlaceEnrichmentWorker,
      PlaceCuisineExtractionWorker,
      PlaceSecondaryLocationExpansionWorker,
    ]
  : [];

@Module({
  imports: [
    SharedModule,
    PrismaModule,
    ExternalIntegrationsModule,
    EntityResolverModule,
    EntityTextSearchModule, // write-time entity embeddings
    PublicCraveScoreModule,
    forwardRef(() => RedditCollectorModule),
    AttributeOntologyModule,
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
    PlaceLocationEnrichmentService,
    PlaceJanitorService,
    PlaceEnrichmentQueueService,
    PlaceEntityMergeService,
    NightlyConvergenceService,
    PlaceTypeCensusService,
    MarketMembershipService,
    PlaceCuisineExtractionService,
    VenueCuisineEvidenceService,
    PlaceCuisineExtractionQueueService,
    PlaceSecondaryLocationExpansionQueueService,
    ...placeEnrichmentWorkerProviders,
  ],
  exports: [
    PlaceEnrichmentQueueService,
    PlaceLocationEnrichmentService,
    PlaceCuisineExtractionQueueService,
    PlaceSecondaryLocationExpansionQueueService,
  ],
})
export class PlaceEnrichmentModule {}
