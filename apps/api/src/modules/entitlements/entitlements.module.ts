import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../../shared';
import { PrismaModule } from '../../prisma/prisma.module';
import { EntitlementService } from './entitlement.service';
import { RewardGrantService } from './reward-grant.service';
import { EntitlementEnforcementInterceptor } from './entitlement-enforcement.interceptor';

/**
 * Access-grant ledger + runtime gating (plans/payments-ideal-shape.md).
 * Deliberately BELOW billing and identity in the module graph: billing's
 * webhooks write subscription grants, identity writes the signup trial grant,
 * product modules import the guard — none of them depend on each other for it.
 *
 * The APP_INTERCEPTOR here is the app-wide paywall (hard-paywall model):
 * every authenticated route requires access unless @AllowUnentitled.
 */
@Module({
  imports: [ConfigModule, SharedModule, PrismaModule],
  providers: [
    EntitlementService,
    RewardGrantService,
    { provide: APP_INTERCEPTOR, useClass: EntitlementEnforcementInterceptor },
  ],
  exports: [EntitlementService, RewardGrantService],
})
export class EntitlementsModule {}
