import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../../../prisma/prisma.module';
import { SharedModule } from '../../../shared';
import { RankScoreService } from './rank-score.service';
import { RankScoreRefreshQueueService } from './rank-score-refresh.service';
import { RankScoreRefreshWorker } from './rank-score-refresh.worker';
import { isWorkerRuntime } from '../../../shared/utils/process-role';

const rankScoreWorkerProviders = isWorkerRuntime()
  ? [RankScoreRefreshWorker]
  : [];

@Module({
  imports: [
    SharedModule,
    PrismaModule,
    BullModule.registerQueue({
      name: 'rank-score-refresh',
    }),
  ],
  providers: [
    RankScoreService,
    RankScoreRefreshQueueService,
    ...rankScoreWorkerProviders,
  ],
  exports: [RankScoreService, RankScoreRefreshQueueService],
})
export class RankScoreModule {}
