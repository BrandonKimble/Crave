import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../../../shared/shared.module';
import { RedditService } from './reddit.service';
import { RedditHealthController } from './reddit-health.controller';
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
  controllers: [RedditHealthController],
  exports: [RedditService],
})
export class RedditModule {}
