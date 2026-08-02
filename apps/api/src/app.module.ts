import { Module } from '@nestjs/common';
import { join } from 'path';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { DiscoveryModule } from '@nestjs/core';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { RepositoryModule } from './repositories/repository.module';
import { ExternalIntegrationsModule } from './modules/external-integrations/external-integrations.module';
import { RedditCollectorModule } from './modules/content-processing/reddit-collector/reddit-collector.module';
import { AppController } from './app.controller';
import { SharedModule } from './shared/shared.module';
import { GovernanceModule } from './modules/external-integrations/governance/governance.module';
import { SearchModule } from './modules/search/search.module';
import { IdentityModule } from './modules/identity/identity.module';
import { BillingModule } from './modules/billing/billing.module';
import { AccountDeletionModule } from './modules/identity/account-deletion.module';
import { PhotosModule } from './modules/photos/photos.module';
import { AutocompleteModule } from './modules/autocomplete/autocomplete.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { AttributeOntologyModule } from './modules/attribute-ontology/attribute-ontology.module';
import { PollsModule } from './modules/polls/polls.module';
import { UserListsModule } from './modules/user-lists/user-lists.module';
import { TeaserModule } from './modules/teaser/teaser.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { HistoryModule } from './modules/history/history.module';
import { PlacesModule } from './modules/places/places.module';
import { HomeModule } from './modules/home/home.module';
import { OpsDashboardModule } from './modules/ops-dashboard/ops-dashboard.module';
import { IntegrityModule } from './modules/integrity/integrity.module';
// Production readiness modules
import { HealthModule } from './modules/health/health.module';
import { SentryModule } from './sentry/sentry.module';
import { CustomThrottlerModule } from './modules/infrastructure/throttler/throttler.module';
import { LegalModule } from './modules/legal/legal.module';
import { DebugModule } from './modules/debug/debug.module';
import { isSchedulerRuntime } from './shared/utils/process-role';

const runtimeWithSchedulers = isSchedulerRuntime();

function isDebugRoutesEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.APP_ENV === 'prod' || process.env.APP_ENV === 'staging') {
    return false;
  }
  return process.env.ENABLE_DEBUG_ROUTES === 'true';
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(__dirname, '..', '.env'), join(process.cwd(), '.env')],
      load: [configuration],
    }),
    ...(runtimeWithSchedulers ? [ScheduleModule.forRoot()] : []),
    DiscoveryModule,
    SharedModule,
    GovernanceModule,
    // Production readiness: Sentry for error tracking (must be early in imports)
    SentryModule,
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        config: {
          host: configService.get<string>('redis.host') || 'localhost',
          port: configService.get<number>('redis.port') || 6379,
          password: configService.get<string>('redis.password'),
          db: configService.get<number>('redis.db') ?? 0,
        },
      }),
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('redis.host'),
          port: configService.get('redis.port'),
          password: configService.get('redis.password'),
          db: configService.get('redis.db'),
        },
        prefix: configService.get('bull.prefix'),
      }),
    }),
    PrismaModule,
    RepositoryModule,
    ExternalIntegrationsModule,
    RedditCollectorModule,
    SearchModule,
    IdentityModule,
    BillingModule,
    AccountDeletionModule,
    PhotosModule,
    AutocompleteModule,
    NotificationsModule,
    ModerationModule,
    AttributeOntologyModule,
    PollsModule,
    UserListsModule,
    TeaserModule,
    MessagingModule,
    HistoryModule,
    // Place Catalog DAG + naming reconciler (geo-demand rebuild §1/§2)
    PlacesModule,
    // HOME surface: app-curated lists (builder + feed reads)
    HomeModule,
    OpsDashboardModule,
    IntegrityModule,
    // Production readiness: Health checks for Railway/container orchestration
    HealthModule,
    // Production readiness: Rate limiting to prevent abuse
    CustomThrottlerModule,
    // Legal/compliance: Privacy policy and terms of service (required for app stores)
    LegalModule,
    // DEBUG ROUTES: OPT IN, NEVER OPT OUT (audit 2026-08-01).
    //
    // These endpoints exist to throw errors and to write caller-supplied text
    // into Sentry. Exposed, they are a free way to burn our Sentry event
    // quota (metered, real money) and to flood error monitoring with
    // attacker-authored noise so a real incident scrolls past unseen.
    //
    // The old test was `NODE_ENV !== 'production'`, which FAILS OPEN: a
    // container that never set NODE_ENV — a new service, a preview deploy, a
    // misconfigured env — serves them publicly. Absence of configuration must
    // never grant exposure, so the module is now off unless something says
    // otherwise, out loud.
    ...(isDebugRoutesEnabled() ? [DebugModule] : []),
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
