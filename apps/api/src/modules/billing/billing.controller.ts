import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../shared';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { BillingService } from './billing.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';
import { NoSignal } from '../signals/records-signal.decorator';

/**
 * DUAL-RAIL BILLING (owner ruling 2026-08-03, business/business-model.md).
 *
 * The paywall has two buttons: the primary opens the hosted Stripe Checkout
 * URL that `checkout-session` returns (web, ~97% net, out-of-app), the
 * secondary does native StoreKit IAP through RevenueCat (~85% net). The web
 * rail was deleted 2026-07-09 as "a rail that doesn't exist" and restored
 * here now that it does. Cancel stays what it was: Stripe subs go to
 * cancel_at_period_end, App Store subscribers are sent to iOS Settings.
 */
// Exempt from the app-wide paywall: a lapsed user must be able to manage billing.
@AllowUnentitled()
@Controller('billing')
@UseGuards(ClerkAuthGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * `{ plan: 'monthly' | 'annual' }` -> `{ url, sessionId, expiresAt }`.
   * `url` is the hosted Stripe Checkout page; the client's only job is to
   * open it. Scoped to the caller — the session is built for
   * `@CurrentUser()`, never a body-supplied user.
   *
   * `plan` is the ONLY input, and it is a closed two-word vocabulary, not a
   * price id: the api owns which Stripe price each word means and which one
   * carries the annual-only free trial. Unknown or absent plan -> 400 from
   * the DTO. Both offers are the same PRODUCT (Premium); see the DTO header.
   */
  @Post('checkout-session')
  // Same reasoning as cancel: this is account/billing state, not demand for
  // anything in the corpus. Billing keeps its own record (the attempt row).
  @NoSignal('billing intent, not demand for a subject')
  async createCheckoutSession(
    @CurrentUser() user: User,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.billingService.createCheckoutSession(user, dto);
  }

  /** -> `{ url }` for the Stripe-hosted billing portal. Takes no body: the
   *  return URL is config's, not the caller's (open redirect). */
  @Post('portal-session')
  @NoSignal('billing management, not demand for a subject')
  async createPortalSession(@CurrentUser() user: User) {
    return this.billingService.createPortalSession(user);
  }

  @Post('subscription/cancel')
  // D36/F645: authenticated mutation, so the ledger question is asked. The
  // §3 ledger records DEMAND for subjects (places, dishes); a subscription
  // is a relationship with us, not demand for anything in the corpus, and
  // billing keeps its own record.
  @NoSignal('account/billing state, not demand for a subject')
  async cancelSubscription(@CurrentUser() user: User) {
    return this.billingService.cancelSubscription(user);
  }
}
