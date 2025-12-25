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
// import { SecurityModule } from './modules/infrastructure/security/security.module'; // TODO: Re-enable when validating security features
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(__dirname, '..', '.env'), join(process.cwd(), '.env')],
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    DiscoveryModule, // Add DiscoveryModule for BullModule dependencies
    SharedModule,
    // SecurityModule, // TODO: Re-enable when validating security features - currently causing ThrottlerGuard dependency issues
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
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
