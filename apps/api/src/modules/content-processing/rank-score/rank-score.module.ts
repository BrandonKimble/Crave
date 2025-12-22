import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { SharedModule } from '../../../shared';
import { RankScoreService } from './rank-score.service';

@Module({
  imports: [SharedModule, PrismaModule],
  providers: [RankScoreService],
  exports: [RankScoreService],
})
export class RankScoreModule {}
