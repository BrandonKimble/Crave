import { Module } from '@nestjs/common';
import { DebugController } from './debug.controller';

/**
 * Debug Module
 * 
 * Provides testing endpoints for verifying integrations like Sentry.
 * 
 * ⚠️ WARNING: This module should be conditionally loaded only in
 * development/staging environments, NOT in production!
 * 
 * To disable in production, you can:
 * 1. Use a ConfigService check in app.module.ts
 * 2. Or check NODE_ENV before importing
 */
@Module({
  controllers: [DebugController],
})
export class DebugModule {}
