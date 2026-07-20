import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared/shared.module';
import { DemandScoringTraceService } from './demand-scoring-trace.service';

// Phase C: the old search-demand rollup (SearchDemandAggregationService +
// SearchDemandService over user_search_demand_daily) is DEAD — demand reads
// live on the signals substrate (SignalDemandReadService). What survives here
// is the decision-ledger trace (demand_scoring_runs/candidates, §12) and the
// demand-scoring curves library (the §4 kernel shapes).
@Module({
  imports: [PrismaModule, SharedModule],
  providers: [DemandScoringTraceService],
  exports: [DemandScoringTraceService],
})
export class AnalyticsModule {}
