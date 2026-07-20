import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { SharedModule } from '../../../shared/shared.module';
import { PublicCraveScoreService } from './public-crave-score.service';
import { RescoreCoordinatorService } from './rescore-coordinator.service';

@Module({
  imports: [PrismaModule, SharedModule],
  providers: [PublicCraveScoreService, RescoreCoordinatorService],
  exports: [PublicCraveScoreService, RescoreCoordinatorService],
})
export class PublicCraveScoreModule {}
