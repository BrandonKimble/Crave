import { Module, forwardRef } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ModerationModule } from '../moderation/moderation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SearchModule } from '../search/search.module';
import { IdentityModule } from '../identity/identity.module';
import { RestaurantEnrichmentModule } from '../restaurant-enrichment/restaurant-enrichment.module';
import { EntityResolverModule } from '../content-processing/entity-resolver/entity-resolver.module';
import { PublicCraveScoreModule } from '../content-processing/public-crave-score';
import { LLMModule } from '../external-integrations/llm/llm.module';
import { EntityTextSearchModule } from '../entity-text-search/entity-text-search.module';
import { RedditCollectorModule } from '../content-processing/reddit-collector/reddit-collector.module';
import { SignalsModule } from '../signals/signals.module';
import { PlacesModule } from '../places/places.module';
import { PollsService } from './polls.service';
import { PollsController } from './polls.controller';
import { PollsGateway } from './polls.gateway';
import { PollAggregationService } from './poll-aggregation.service';
import { PollLifecycleService } from './poll-lifecycle.service';
import { PollGraduationService } from './poll-graduation.service';
import { PollEntitySeedService } from './poll-entity-seed.service';
import { RestaurantMentionsService } from './restaurant-mentions.service';
import { DemandMassReader } from './supply/demand-mass.reader';
import { PollSupplyEstimators } from './supply/poll-supply-estimators';
import { PollWeeklyRitualService } from './supply/poll-weekly-ritual.service';
import { PollSurfaceSourceService } from './supply/poll-surface-source.service';
import { PollBallotMentionService } from './supply/poll-ballot-mention.service';

@Module({
  imports: [
    SharedModule,
    PrismaModule,
    ModerationModule,
    NotificationsModule,
    forwardRef(() => SearchModule),
    IdentityModule,
    RestaurantEnrichmentModule,
    EntityResolverModule,
    PublicCraveScoreModule,
    LLMModule,
    EntityTextSearchModule,
    RedditCollectorModule,
    SignalsModule,
    // §22 item 5: the feed reads the place catalog (placesInView + §2 law).
    PlacesModule,
  ],
  controllers: [PollsController],
  providers: [
    PollsService,
    RestaurantMentionsService,
    PollEntitySeedService,
    PollsGateway,
    PollAggregationService,
    PollLifecycleService,
    PollGraduationService,
    // §22 item 4 — the poll SUPPLY cut (§4 controller + weekly ritual + K6).
    DemandMassReader,
    PollSupplyEstimators,
    PollWeeklyRitualService,
    PollSurfaceSourceService,
    PollBallotMentionService,
  ],
  exports: [PollsService],
})
export class PollsModule {}
