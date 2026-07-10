import { Controller, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../shared';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { BillingService } from './billing.service';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';

/**
 * iOS-first launch: purchasing rides RevenueCat/StoreKit in the app; the
 * web checkout/portal rail was DELETED 2026-07-09 (ideal-shape review — it
 * modeled a rail that doesn't exist; git history is its shelf). Cancel is
 * kept: it routes Stripe subs to cancel_at_period_end and tells App Store
 * subscribers to manage in iOS Settings.
 */
// Exempt from the app-wide paywall: a lapsed user must be able to manage billing.
@AllowUnentitled()
@Controller('billing')
@UseGuards(ClerkAuthGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('subscription/cancel')
  async cancelSubscription(@CurrentUser() user: User) {
    return this.billingService.cancelSubscription(user);
  }
}
