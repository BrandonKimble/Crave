import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { DiscoveryModule } from '@nestjs/core';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { RepositoryModule } from './repositories/repository.module';
import { ExternalIntegrationsModule } from './modules/external-integrations/external-integrations.module';
// import { SecurityModule } from './modules/infrastructure/security/security.module'; // TODO: Re-enable when validating security features
import { RedditCollectorModule } from './modules/content-processing/reddit-collector/reddit-collector.module';
import { AppController } from './app.controller';
import { SharedModule } from './shared/shared.module';
import { SearchModule } from './modules/search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    DiscoveryModule, // Add DiscoveryModule for BullModule dependencies
    SharedModule,
    // SecurityModule, // TODO: Re-enable when validating security features - currently causing ThrottlerGuard dependency issues
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('redis.host'),
          port: configService.get('redis.port'),
        },
      }),
    }),
    PrismaModule,
    RepositoryModule,
    ExternalIntegrationsModule,
    RedditCollectorModule,
    SearchModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
