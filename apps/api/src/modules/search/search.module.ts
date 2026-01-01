import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RepositoryModule } from '../../repositories/repository.module';
import { CoverageKeyModule } from '../coverage-key/coverage-key.module';
import { RedditCollectorModule } from '../content-processing/reddit-collector/reddit-collector.module';
import { EntityResolverModule } from '../content-processing/entity-resolver/entity-resolver.module';
import { ExternalIntegrationsModule } from '../external-integrations/external-integrations.module';
import { RestaurantEnrichmentModule } from '../restaurant-enrichment';
import { IdentityModule } from '../identity/identity.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchQueryExecutor } from './search-query.executor';
import { SearchQueryBuilder } from './search-query.builder';
import { SearchMetricsService } from './search-metrics.service';
import { SearchQueryInterpretationService } from './search-query-interpretation.service';
import { SearchOrchestrationService } from './search-orchestration.service';
import { OnDemandRequestService } from './on-demand-request.service';
import { OnDemandProcessingService } from './on-demand-processing.service';
import { SearchSubredditResolverService } from './search-subreddit-resolver.service';
import { OnDemandPlaceholderCleanupService } from './on-demand-placeholder-cleanup.service';
import { SearchQuerySuggestionService } from './search-query-suggestion.service';
import { SearchPopularityService } from './search-popularity.service';
import { RestaurantStatusService } from './restaurant-status.service';

@Module({
  imports: [
    SharedModule,
    PrismaModule,
    RepositoryModule,
    CoverageKeyModule,
    RedditCollectorModule,
    EntityResolverModule,
    ExternalIntegrationsModule,
    RestaurantEnrichmentModule,
    IdentityModule,
  ],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchQueryExecutor,
    SearchQueryBuilder,
    SearchMetricsService,
    SearchQueryInterpretationService,
    OnDemandRequestService,
    OnDemandProcessingService,
    SearchOrchestrationService,
    SearchSubredditResolverService,
    OnDemandPlaceholderCleanupService,
    SearchQuerySuggestionService,
    SearchPopularityService,
    RestaurantStatusService,
  ],
  exports: [
    SearchService,
    SearchOrchestrationService,
    OnDemandRequestService,
    OnDemandProcessingService,
    SearchSubredditResolverService,
    SearchQuerySuggestionService,
    SearchPopularityService,
    RestaurantStatusService,
  ],
})
export class SearchModule {}
