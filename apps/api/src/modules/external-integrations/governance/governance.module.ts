import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { GovernanceService } from './governance.service';
import { PrismaPoolConsumptionStore } from './pool-consumption.store';

/** Global: pools are one registry per process (§14.3 pull-model note). */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [GovernanceService, PrismaPoolConsumptionStore],
  exports: [GovernanceService],
})
export class GovernanceModule {}
