import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RepositoryModule } from '../../repositories/repository.module';
import { RedditCollectorModule } from '../content-processing/reddit-collector/reddit-collector.module';
import { EntityResolverModule } from '../content-processing/entity-resolver/entity-resolver.module';
import { ExternalIntegrationsModule } from '../external-integrations/external-integrations.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchQueryExecutor } from './search-query.executor';
import { SearchQueryBuilder } from './search-query.builder';
import { SearchOnDemandCollectionService } from './search-on-demand-collection.service';
import { SearchMetricsService } from './search-metrics.service';
import { SearchQueryInterpretationService } from './search-query-interpretation.service';
import { SearchInterestService } from './search-interest.service';
import { SearchOrchestrationService } from './search-orchestration.service';
import { SearchInterestProcessingService } from './search-interest-processing.service';
import { SearchSubredditResolverService } from './search-subreddit-resolver.service';

@Module({
  imports: [
    SharedModule,
    PrismaModule,
    RepositoryModule,
    RedditCollectorModule,
    EntityResolverModule,
    ExternalIntegrationsModule,
  ],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchQueryExecutor,
    SearchQueryBuilder,
    SearchOnDemandCollectionService,
    SearchMetricsService,
    SearchQueryInterpretationService,
    SearchInterestService,
    SearchInterestProcessingService,
    SearchOrchestrationService,
    SearchSubredditResolverService,
  ],
  exports: [SearchService, SearchOrchestrationService],
})
export class SearchModule {}
