import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerService } from './logging/logger.interface';
import { WinstonLoggerService } from './logging/winston-logger.service';
import { LoggingInterceptor } from './logging/logging.interceptor';
import { GlobalExceptionFilter } from './filters/global-exception.filter';

/**
 * Global shared module providing common utilities across the application
 */
@Global()
@Module({
  imports: [
    // Config module for environment variables
    ConfigModule,
  ],
  providers: [
    // Winston logger service - direct implementation
    WinstonLoggerService,
    // Provide WinstonLoggerService as LoggerService for backward compatibility
    {
      provide: LoggerService,
      useExisting: WinstonLoggerService,
    },
    // Global logging interceptor
    {
      provide: APP_INTERCEPTOR,
      useFactory: (loggerService: LoggerService) => {
        return new LoggingInterceptor(loggerService);
      },
      inject: [LoggerService],
    },
    // Global exception filter
    {
      provide: APP_FILTER,
      useFactory: (
        configService: ConfigService,
        loggerService: WinstonLoggerService,
      ) => new GlobalExceptionFilter(configService, loggerService),
      inject: [ConfigService, WinstonLoggerService],
    },
  ],
  exports: [
    WinstonLoggerService,
    LoggerService, // Export both for compatibility
    ConfigModule, // Also export ConfigModule since many services need it
  ],
})
export class SharedModule {}
