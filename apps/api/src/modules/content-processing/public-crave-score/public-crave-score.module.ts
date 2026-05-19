import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { SharedModule } from '../../../shared/shared.module';
import { PublicCraveScoreService } from './public-crave-score.service';

@Module({
  imports: [PrismaModule, SharedModule],
  providers: [PublicCraveScoreService],
  exports: [PublicCraveScoreService],
})
export class PublicCraveScoreModule {}
