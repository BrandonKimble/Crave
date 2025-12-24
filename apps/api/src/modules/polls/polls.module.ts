import { Module, forwardRef } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ModerationModule } from '../moderation/moderation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SearchModule } from '../search/search.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { IdentityModule } from '../identity/identity.module';
import { RestaurantEnrichmentModule } from '../restaurant-enrichment/restaurant-enrichment.module';
import { EntityResolverModule } from '../content-processing/entity-resolver/entity-resolver.module';
import { QualityScoreModule } from '../content-processing/quality-score/quality-score.module';
import { RankScoreModule } from '../content-processing/rank-score/rank-score.module';
import { CoverageKeyModule } from '../coverage-key/coverage-key.module';
import { PollsService } from './polls.service';
import { PollsController } from './polls.controller';
import { PollsGateway } from './polls.gateway';
import { PollSchedulerService } from './poll-scheduler.service';
import { PollAggregationService } from './poll-aggregation.service';
import { PollCategoryReplayService } from './poll-category-replay.service';
import { PollLifecycleService } from './poll-lifecycle.service';
import { PollEntitySeedService } from './poll-entity-seed.service';
import { PollScoreRefreshService } from './poll-score-refresh.service';

@Module({
  imports: [
    SharedModule,
    PrismaModule,
    ModerationModule,
    NotificationsModule,
    forwardRef(() => SearchModule),
    AnalyticsModule,
    IdentityModule,
    RestaurantEnrichmentModule,
    EntityResolverModule,
    QualityScoreModule,
    RankScoreModule,
    CoverageKeyModule,
  ],
  controllers: [PollsController],
  providers: [
    PollsService,
    PollEntitySeedService,
    PollScoreRefreshService,
    PollsGateway,
    PollSchedulerService,
    PollAggregationService,
    PollCategoryReplayService,
    PollLifecycleService,
  ],
  exports: [PollsService],
})
export class PollsModule {}
