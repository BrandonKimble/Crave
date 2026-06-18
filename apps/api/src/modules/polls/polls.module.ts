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
import { PublicCraveScoreModule } from '../content-processing/public-crave-score';
import { MarketsModule } from '../markets/markets.module';
import { LLMModule } from '../external-integrations/llm/llm.module';
import { PollsService } from './polls.service';
import { PollsController } from './polls.controller';
import { PollsGateway } from './polls.gateway';
import { PollSchedulerService } from './poll-scheduler.service';
import { PollAggregationService } from './poll-aggregation.service';
import { PollLifecycleService } from './poll-lifecycle.service';
import { PollEntitySeedService } from './poll-entity-seed.service';

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
    PublicCraveScoreModule,
    MarketsModule,
    LLMModule,
  ],
  controllers: [PollsController],
  providers: [
    PollsService,
    PollEntitySeedService,
    PollsGateway,
    PollSchedulerService,
    PollAggregationService,
    PollLifecycleService,
  ],
  exports: [PollsService],
})
export class PollsModule {}
