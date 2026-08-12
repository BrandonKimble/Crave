import { Module, Global } from '@nestjs/common';
import { SharedModule } from '../../../shared/shared.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { RateLimitCoordinatorService } from './rate-limit-coordinator.service';
import { UsageLedgerService } from './usage-ledger.service';
import { GovernanceModule } from '../governance/governance.module';
import { DecisionLedgerService } from './decision-ledger.service';
import { SpendCampaignService } from './spend-campaign.service';
import { OpsAlertsService } from './ops-alerts.service';
import { ReconciliationMultiplierService } from './reconciliation-multiplier.service';
import { SpendExpectationMonitorService } from './spend-expectation-monitor.service';
import { VendorQuotaWatcherService } from './vendor-quota-watcher.service';
import { BootSpendGuardAlertService } from '../../../shared/queues/boot-spend-guard-alert.service';

/**
 * Shared services module for external integrations
 * Provides singleton services that need to be shared across all external integration modules
 */
@Global()
@Module({
  imports: [
    SharedModule, // Imports ConfigModule and provides LoggerService
    PrismaModule,
    GovernanceModule, // gemini.monthlySpend metering at the ledger chokepoint
  ],
  providers: [
    ReconciliationMultiplierService,
    RateLimitCoordinatorService,
    UsageLedgerService,
    DecisionLedgerService,
    SpendCampaignService,
    OpsAlertsService,
    // D149: the two WATCHERS that replaced the refusals. Both are @Cron-only
    // and inert outside a scheduler runtime.
    SpendExpectationMonitorService,
    VendorQuotaWatcherService,
    // The SCREAM half of the worker-boot spend guard. Lives here because it
    // needs OpsAlertsService; the guard itself runs pre-Nest in main.ts.
    BootSpendGuardAlertService,
  ],
  exports: [
    ReconciliationMultiplierService,
    RateLimitCoordinatorService,
    UsageLedgerService,
    DecisionLedgerService,
    SpendCampaignService,
    OpsAlertsService,
    SpendExpectationMonitorService,
    VendorQuotaWatcherService,
    BootSpendGuardAlertService,
  ],
})
export class SharedServicesModule {}
