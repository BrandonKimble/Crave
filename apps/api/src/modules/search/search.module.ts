import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RepositoryModule } from '../../repositories/repository.module';
import { MarketsModule } from '../markets/markets.module';
import { RedditCollectorModule } from '../content-processing/reddit-collector/reddit-collector.module';
import { EntityResolverModule } from '../content-processing/entity-resolver/entity-resolver.module';
import { ExternalIntegrationsModule } from '../external-integrations/external-integrations.module';
import { RestaurantEnrichmentModule } from '../restaurant-enrichment';
import { IdentityModule } from '../identity/identity.module';
import { EntityTextSearchModule } from '../entity-text-search/entity-text-search.module';
import { PublicCraveScoreModule } from '../content-processing/public-crave-score';
import { SignalsModule } from '../signals/signals.module';
import { PlacesModule } from '../places/places.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchCoverageService } from './search-coverage.service';
import { SearchQueryExecutor } from './search-query.executor';
import { SearchQueryBuilder } from './search-query.builder';
import { SearchMetricsService } from './search-metrics.service';
import { SearchQueryInterpretationService } from './search-query-interpretation.service';
import { SearchOrchestrationService } from './search-orchestration.service';
import { OnDemandRequestService } from './on-demand-request.service';
import { OnDemandPlaceholderCleanupService } from './on-demand-placeholder-cleanup.service';
import { OnDemandRequestUsersCleanupService } from './on-demand-request-users-cleanup.service';
import { SearchQuerySuggestionService } from './search-query-suggestion.service';
import { SearchPopularityService } from './search-popularity.service';
import { RestaurantStatusService } from './restaurant-status.service';
import { SearchEntityExpansionService } from './search-entity-expansion.service';
import { SearchSiblingExpansionService } from './search-sibling-expansion.service';

@Module({
  imports: [
    SharedModule,
    PrismaModule,
    RepositoryModule,
    MarketsModule,
    RedditCollectorModule,
    EntityResolverModule,
    ExternalIntegrationsModule,
    RestaurantEnrichmentModule,
    IdentityModule,
    EntityTextSearchModule,
    PublicCraveScoreModule,
    SignalsModule,
    // §22 cut 3: the search header names from the Place Catalog, and the §2
    // naming reconciler goes live at the search viewport chokepoint.
    PlacesModule,
  ],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchCoverageService,
    SearchQueryExecutor,
    SearchQueryBuilder,
    SearchMetricsService,
    SearchQueryInterpretationService,
    OnDemandRequestService,
    SearchOrchestrationService,
    OnDemandPlaceholderCleanupService,
    OnDemandRequestUsersCleanupService,
    SearchQuerySuggestionService,
    SearchPopularityService,
    RestaurantStatusService,
    SearchEntityExpansionService,
    SearchSiblingExpansionService,
  ],
  exports: [
    SearchService,
    SearchOrchestrationService,
    OnDemandRequestService,
    SearchQuerySuggestionService,
    SearchPopularityService,
    RestaurantStatusService,
    SearchQueryExecutor,
  ],
})
export class SearchModule {}
