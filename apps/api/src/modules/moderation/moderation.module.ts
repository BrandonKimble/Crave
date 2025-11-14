import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../../shared/shared.module';
import { ModerationService } from './moderation.service';

@Module({
  imports: [ConfigModule, SharedModule],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
