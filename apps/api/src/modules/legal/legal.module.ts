import { Module } from '@nestjs/common';
import { LegalController } from './legal.controller';

/**
 * Legal/Compliance Module
 * 
 * Provides legal compliance endpoints required for app store submissions:
 * - /privacy - Privacy Policy (required by Apple)
 * - /terms - Terms of Service (required by both stores)
 * 
 * These endpoints are publicly accessible and excluded from API versioning.
 */
@Module({
  controllers: [LegalController],
})
export class LegalModule {}
