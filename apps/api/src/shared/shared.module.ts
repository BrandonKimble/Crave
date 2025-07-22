import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { createWinstonConfig } from './logging/winston.config';
import { LoggerService } from './logging/logger.service';
import { LoggingInterceptor } from './logging/logging.interceptor';
import { GlobalExceptionFilter } from './filters/global-exception.filter';

/**
 * Global shared module providing common utilities across the application
 */
@Global()
@Module({
  imports: [
    // Winston logging module
    WinstonModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) =>
        createWinstonConfig(configService.get<string>('NODE_ENV')),
      inject: [ConfigService],
    }),
  ],
  providers: [
    // Logger service
    LoggerService,
    // Global logging interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    // Global exception filter
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
  exports: [WinstonModule, LoggerService],
})
export class SharedModule {}
