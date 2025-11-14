import { Module, forwardRef } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ModerationModule } from '../moderation/moderation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SearchModule } from '../search/search.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PollsService } from './polls.service';
import { PollsController } from './polls.controller';
import { PollsGateway } from './polls.gateway';
import { PollSchedulerService } from './poll-scheduler.service';
import { PollAggregationService } from './poll-aggregation.service';
import { PollCategoryReplayService } from './poll-category-replay.service';

@Module({
  imports: [
    SharedModule,
    PrismaModule,
    ModerationModule,
    NotificationsModule,
    forwardRef(() => SearchModule),
    AnalyticsModule,
  ],
  controllers: [PollsController],
  providers: [
    PollsService,
    PollsGateway,
    PollSchedulerService,
    PollAggregationService,
    PollCategoryReplayService,
  ],
  exports: [PollsService],
})
export class PollsModule {}
