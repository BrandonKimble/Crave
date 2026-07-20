import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../../../shared/shared.module';
import { RedditService } from './reddit.service';

// Admission lives in the global GovernanceModule's reddit.requests pool
// (§12.5) — the RateLimitCoordinator (SharedServicesModule) is no longer a
// reddit dependency.
@Module({
  imports: [
    SharedModule, // Import SharedModule first for LoggerService
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  providers: [RedditService],
  exports: [RedditService],
})
export class RedditModule {}
