import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../shared';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { BillingService } from './billing.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { CreatePortalSessionDto } from './dto/create-portal-session.dto';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';

// Exempt from the app-wide paywall (see AllowUnentitled docs for the why).
@AllowUnentitled()
@Controller('billing')
@UseGuards(ClerkAuthGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout-session')
  async createCheckoutSession(
    @CurrentUser() user: User,
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    return this.billingService.createCheckoutSession(user, dto);
  }

  @Post('portal-session')
  async createPortalSession(
    @CurrentUser() user: User,
    @Body() dto: CreatePortalSessionDto,
  ) {
    return this.billingService.createPortalSession(user, dto);
  }

  @Post('subscription/cancel')
  async cancelSubscription(@CurrentUser() user: User) {
    return this.billingService.cancelSubscription(user);
  }
}
