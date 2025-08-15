import { Module, Global } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SharedModule } from '../../../shared/shared.module';
import { SecurityGuard } from './guards/security.guard';
import { SecurityService } from './security.service';
import { SanitizationMiddleware } from './middleware/sanitization.middleware';
import { SecurityHeadersMiddleware } from './middleware/security-headers.middleware';

/**
 * Security module providing essential security services
 * Implements PRD section 9.2.1 & 3.1.2 security requirements
 */
@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        // Default rate limiting
        {
          name: 'default',
          ttl: config.get<number>('THROTTLE_TTL', 60) * 1000,
          limit: config.get<number>('THROTTLE_LIMIT', 100),
        },
        // Strict rate limiting for sensitive endpoints
        {
          name: 'strict',
          ttl: config.get<number>('THROTTLE_STRICT_TTL', 60) * 1000,
          limit: config.get<number>('THROTTLE_STRICT_LIMIT', 10),
        },
      ],
    }),
    ConfigModule,
    SharedModule, // For LoggerService
  ],
  providers: [
    SecurityService,
    SanitizationMiddleware,
    SecurityHeadersMiddleware,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard, // Rate limiting guard
    },
    {
      provide: APP_GUARD,
      useClass: SecurityGuard, // Security validation guard
    },
  ],
  exports: [SecurityService, SanitizationMiddleware, SecurityHeadersMiddleware],
})
export class SecurityModule {}
