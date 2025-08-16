import { Module, Global } from '@nestjs/common';
import { SharedModule } from '../../../shared/shared.module';
import { RateLimitCoordinatorService } from './rate-limit-coordinator.service';

/**
 * Shared services module for external integrations
 * Provides singleton services that need to be shared across all external integration modules
 */
@Global()
@Module({
  imports: [
    SharedModule, // Imports ConfigModule and provides LoggerService
  ],
  providers: [RateLimitCoordinatorService],
  exports: [RateLimitCoordinatorService],
})
export class SharedServicesModule {}