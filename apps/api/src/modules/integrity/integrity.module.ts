import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared';
import { PrismaModule } from '../../prisma/prisma.module';
import { SybilClusterReportService } from './sybil-cluster-report.service';

/**
 * Vote-integrity detection (plans/vote-integrity-ladder.md): the sybil
 * clustering report cron. Detection only — emits ops_alerts for owner
 * review; no enforcement lives here. OpsAlertsService arrives via the
 * @Global SharedServicesModule.
 */
@Module({
  imports: [SharedModule, PrismaModule],
  providers: [SybilClusterReportService],
  exports: [SybilClusterReportService],
})
export class IntegrityModule {}
