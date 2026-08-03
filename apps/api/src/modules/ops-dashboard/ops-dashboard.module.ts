import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared/shared.module';
import { RedditCollectorModule } from '../content-processing/reddit-collector/reddit-collector.module';
import { OpsDashboardController } from './ops-dashboard.controller';
import { OpsSummaryService } from './ops-summary.service';
import { OpsTokenGuard } from './ops-token.guard';
import { OpsAccessGuard } from './ops-access.guard';
import { OpsBootstrapController } from './ops-bootstrap.controller';
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
  controllers: isApiRuntime()
    ? // OpsBootstrapController is a SEPARATE controller precisely so the
      // guarded controller's decorators stay untouched: a method-level
      // @UseGuards() cannot remove a class-level one in Nest, and /ops/enter
      // must not sit behind the guard it exists to satisfy.
      [OpsBootstrapController, OpsDashboardController]
    : [],
  providers: isApiRuntime()
    ? [OpsSummaryService, OpsTokenGuard, OpsAccessGuard]
    : [],
})
export class OpsDashboardModule {}
