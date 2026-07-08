import { Module, Global } from '@nestjs/common';
import { SharedModule } from '../../../shared/shared.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { RateLimitCoordinatorService } from './rate-limit-coordinator.service';
import { UsageLedgerService } from './usage-ledger.service';
import { DecisionLedgerService } from './decision-ledger.service';

/**
 * Shared services module for external integrations
 * Provides singleton services that need to be shared across all external integration modules
 */
@Global()
@Module({
  imports: [
    SharedModule, // Imports ConfigModule and provides LoggerService
    PrismaModule,
  ],
  providers: [
    RateLimitCoordinatorService,
    UsageLedgerService,
    DecisionLedgerService,
  ],
  exports: [
    RateLimitCoordinatorService,
    UsageLedgerService,
    DecisionLedgerService,
  ],
})
export class SharedServicesModule {}
