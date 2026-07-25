import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared/shared.module';
import { RedditCollectorModule } from '../content-processing/reddit-collector/reddit-collector.module';
import { OpsDashboardController } from './ops-dashboard.controller';
import { OpsSummaryService } from './ops-summary.service';
import { OpsTokenGuard } from './ops-token.guard';
import { isApiRuntime } from '../../shared/utils/process-role';

/**
 * §18.4/§24.3 OWNER OPS DASHBOARD + ALERT INFRASTRUCTURE. OpsController
 * must live under the API role (no worker gating) — mirrors
 * reddit-collector.module.ts's isWorkerRuntime split, but for the api role:
 * the controller (and its guard/summary-service dependency) is only
 * registered when this process serves API traffic, so a worker-only
 * process instantiates none of it.
 */
@Module({
  imports: [PrismaModule, SharedModule, RedditCollectorModule],
  controllers: isApiRuntime() ? [OpsDashboardController] : [],
  providers: isApiRuntime() ? [OpsSummaryService, OpsTokenGuard] : [],
})
export class OpsDashboardModule {}
