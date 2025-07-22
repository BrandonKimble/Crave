import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WinstonModule } from 'nest-winston';
import { createWinstonConfig } from './logging/winston.config';
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
    // Global exception filter
    {
      provide: 'APP_FILTER',
      useClass: GlobalExceptionFilter,
    },
  ],
  exports: [WinstonModule],
})
export class SharedModule {}
