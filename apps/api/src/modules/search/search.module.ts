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
import { SearchMetricsService } from './search-metrics.service';
import { SearchQueryInterpretationService } from './search-query-interpretation.service';
import { SearchOrchestrationService } from './search-orchestration.service';
import { OnDemandRequestService } from './on-demand-request.service';
import { OnDemandProcessingService } from './on-demand-processing.service';
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
    SearchMetricsService,
    SearchQueryInterpretationService,
    OnDemandRequestService,
    OnDemandProcessingService,
    SearchOrchestrationService,
    SearchSubredditResolverService,
  ],
  exports: [SearchService, SearchOrchestrationService],
})
export class SearchModule {}
