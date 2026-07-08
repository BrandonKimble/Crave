import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../../shared';
import { PrismaModule } from '../../prisma/prisma.module';
import { EntitlementService } from './entitlement.service';
import { RequireEntitlementGuard } from './require-entitlement.guard';

/**
 * Access-grant ledger + runtime gating (plans/payments-ideal-shape.md).
 * Deliberately BELOW billing and identity in the module graph: billing's
 * webhooks write subscription grants, identity writes the signup trial grant,
 * product modules import the guard — none of them depend on each other for it.
 */
@Module({
  imports: [ConfigModule, SharedModule, PrismaModule],
  providers: [EntitlementService, RequireEntitlementGuard],
  exports: [EntitlementService, RequireEntitlementGuard],
})
export class EntitlementsModule {}
