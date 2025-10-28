import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { RepositoryModule } from '../../repositories/repository.module';
import { RedditCollectorModule } from '../content-processing/reddit-collector/reddit-collector.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { SearchQueryExecutor } from './search-query.executor';
import { SearchQueryBuilder } from './search-query.builder';
import { SearchOnDemandCollectionService } from './search-on-demand-collection.service';
import { SearchMetricsService } from './search-metrics.service';

@Module({
  imports: [
    SharedModule,
    PrismaModule,
    RepositoryModule,
    RedditCollectorModule,
  ],
  controllers: [SearchController],
  providers: [
    SearchService,
    SearchQueryExecutor,
    SearchQueryBuilder,
    SearchOnDemandCollectionService,
    SearchMetricsService,
  ],
  exports: [SearchService],
})
export class SearchModule {}
