import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../../../shared/shared.module';
import { RedditService } from './reddit.service';
import { RedditHealthController } from './reddit-health.controller';
import { RateLimitCoordinatorService } from '../shared/rate-limit-coordinator.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    ConfigModule,
    SharedModule,
  ],
  providers: [RedditService, RateLimitCoordinatorService],
  controllers: [RedditHealthController],
  exports: [RedditService],
})
export class RedditModule {}
