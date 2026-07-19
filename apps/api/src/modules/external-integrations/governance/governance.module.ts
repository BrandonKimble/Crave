import { Global, Module } from '@nestjs/common';
import { GovernanceService } from './governance.service';

/** Global: pools are one registry per process (§14.3 pull-model note). */
@Global()
@Module({
  providers: [GovernanceService],
  exports: [GovernanceService],
})
export class GovernanceModule {}
