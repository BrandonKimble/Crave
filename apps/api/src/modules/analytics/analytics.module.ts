import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared/shared.module';
import { DemandScoringTraceService } from './demand-scoring-trace.service';
import { SearchDemandAggregationService } from './search-demand-aggregation.service';
import { SearchDemandService } from './search-demand.service';

@Module({
  imports: [PrismaModule, SharedModule],
  providers: [
    SearchDemandService,
    SearchDemandAggregationService,
    DemandScoringTraceService,
  ],
  exports: [
    SearchDemandService,
    SearchDemandAggregationService,
    DemandScoringTraceService,
  ],
})
export class AnalyticsModule {}
