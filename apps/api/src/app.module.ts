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
import { SearchModule } from './modules/search/search.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { IdentityModule } from './modules/identity/identity.module';
import { BillingModule } from './modules/billing/billing.module';
import { AutocompleteModule } from './modules/autocomplete/autocomplete.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { PollsModule } from './modules/polls/polls.module';
import { FavoritesModule } from './modules/favorites/favorites.module';
import { HistoryModule } from './modules/history/history.module';
// Production readiness modules
import { HealthModule } from './modules/health/health.module';
import { SentryModule } from './sentry/sentry.module';
import { CustomThrottlerModule } from './modules/infrastructure/throttler/throttler.module';
import { LegalModule } from './modules/legal/legal.module';
import { DebugModule } from './modules/debug/debug.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(__dirname, '..', '.env'), join(process.cwd(), '.env')],
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    DiscoveryModule,
    SharedModule,
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
        },
        prefix: configService.get('bull.prefix'),
      }),
    }),
    PrismaModule,
    RepositoryModule,
    ExternalIntegrationsModule,
    RedditCollectorModule,
    SearchModule,
    MetricsModule,
    IdentityModule,
    BillingModule,
    AutocompleteModule,
    NotificationsModule,
    ModerationModule,
    PollsModule,
    FavoritesModule,
    HistoryModule,
    // Production readiness: Health checks for Railway/container orchestration
    HealthModule,
    // Production readiness: Rate limiting to prevent abuse
    CustomThrottlerModule,
    // Legal/compliance: Privacy policy and terms of service (required for app stores)
    LegalModule,
    // Debug module enabled only outside production
    ...(process.env.NODE_ENV === 'production' ? [] : [DebugModule]),
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
