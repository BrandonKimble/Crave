import { Body, Controller, Headers, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { BillingService } from './billing.service';
import { RevenueCatWebhookDto } from './dto/revenuecat-webhook.dto';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';

type RawBodyRequest = FastifyRequest & { rawBody?: Buffer | string };

// Exempt from the app-wide paywall (see AllowUnentitled docs for the why).
@AllowUnentitled()
@Controller('billing/webhooks')
export class BillingWebhookController {
  constructor(private readonly billingService: BillingService) {}

  @Post('stripe')
  async handleStripeWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() request: RawBodyRequest,
  ) {
    const rawBody = request.rawBody
      ? request.rawBody
      : typeof request.body === 'string'
        ? request.body
        : JSON.stringify(request.body ?? {});
    await this.billingService.handleStripeWebhook(signature, rawBody);
    return { received: true };
  }

  @Post('revenuecat')
  async handleRevenueCatWebhook(
    @Body() payload: RevenueCatWebhookDto,
    @Headers('authorization') authorization?: string,
  ) {
    await this.billingService.handleRevenueCatWebhook(payload, authorization);
    return { received: true };
  }
}
