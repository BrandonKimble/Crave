import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  BillingEventStatus,
  CheckoutSessionStatus,
  EntitlementStatus,
  Prisma,
  SubscriptionPlatform,
  SubscriptionProvider,
  SubscriptionStatus,
  type User,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { CreatePortalSessionDto } from './dto/create-portal-session.dto';
import { RevenueCatWebhookDto } from './dto/revenuecat-webhook.dto';
import { UserService } from '../identity/user.service';

interface LogBillingEventParams {
  source: SubscriptionProvider;
  platform?: SubscriptionPlatform | null;
  externalEventId: string;
  eventType: string;
  payload: unknown;
}

@Injectable()
export class BillingService {
  private readonly stripe: Stripe | null;
  private readonly defaultPriceId?: string;
  private readonly successUrl: string;
  private readonly cancelUrl: string;
  private readonly portalReturnUrl: string;
  private readonly defaultEntitlement: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly userService: UserService,
  ) {
    const stripeSecret = this.configService.get<string>('stripe.secretKey');
    this.stripe = stripeSecret
      ? new Stripe(stripeSecret, {
          apiVersion: '2024-06-20',
        })
      : null;
    this.defaultPriceId = this.configService.get<string>(
      'stripe.defaultPriceId',
    );
    this.successUrl =
      this.configService.get<string>('stripe.successUrl') ||
      'http://localhost:3000/payments/success';
    this.cancelUrl =
      this.configService.get<string>('stripe.cancelUrl') ||
      'http://localhost:3000/payments/cancel';
    this.portalReturnUrl =
      this.configService.get<string>('stripe.billingPortalReturnUrl') ||
      'http://localhost:3000/account/subscription';
    this.defaultEntitlement =
      this.configService.get<string>('billing.defaultEntitlement') || 'premium';
  }

  async createCheckoutSession(
    user: User,
    dto: CreateCheckoutSessionDto,
  ): Promise<{
    url?: string | null;
    sessionId: string;
    expiresAt?: Date | null;
  }> {
    const stripe = this.ensureStripe();
    const priceId = dto.priceId || this.defaultPriceId;
    if (!priceId) {
      throw new BadRequestException('priceId is required');
    }

    const customerId = await this.userService.ensureStripeCustomer(
      user,
      stripe,
    );
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.authProviderUserId ?? user.userId,
      success_url: dto.successUrl || this.successUrl,
      cancel_url: dto.cancelUrl || this.cancelUrl,
      metadata: {
        user_id: user.authProviderUserId ?? user.userId,
      },
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
    });

    const checkoutMetadata = this.toJsonInput(session);

    await this.prisma.checkoutSession.create({
      data: {
        userId: user.userId,
        provider: SubscriptionProvider.stripe,
        externalSessionId: session.id,
        status: CheckoutSessionStatus.pending,
        url: session.url ?? null,
        successUrl: dto.successUrl || this.successUrl,
        cancelUrl: dto.cancelUrl || this.cancelUrl,
        expiresAt: session.expires_at
          ? new Date(session.expires_at * 1000)
          : null,
        ...(checkoutMetadata !== undefined
          ? { metadata: checkoutMetadata }
          : {}),
      },
    });

    return {
      url: session.url,
      sessionId: session.id,
      expiresAt: session.expires_at
        ? new Date(session.expires_at * 1000)
        : null,
    };
  }

  async createPortalSession(
    user: User,
    dto: CreatePortalSessionDto,
  ): Promise<{ url: string }> {
    const stripe = this.ensureStripe();
    if (!user.stripeCustomerId) {
      throw new BadRequestException(
        'User does not have a Stripe customer. Start with a Checkout Session.',
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: dto.returnUrl || this.portalReturnUrl,
    });

    if (!portalSession.url) {
      throw new ServiceUnavailableException(
        'Stripe did not return a portal URL',
      );
    }

    return { url: portalSession.url };
  }

  async handleStripeWebhook(
    signature: string | undefined,
    rawBody: Buffer | string | undefined,
  ): Promise<void> {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }
    const stripe = this.ensureStripe();
    const webhookSecret = this.configService.get<string>(
      'stripe.webhookSecret',
    );
    if (!webhookSecret) {
      throw new ServiceUnavailableException(
        'Stripe webhook secret is not configured',
      );
    }

    const payloadBuffer = this.normalizeRawBody(rawBody);
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        payloadBuffer,
        signature,
        webhookSecret,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'unknown';
      throw new BadRequestException(
        `Invalid Stripe webhook signature: ${reason}`,
      );
    }

    await this.logBillingEvent({
      source: SubscriptionProvider.stripe,
      platform: SubscriptionPlatform.web,
      externalEventId: event.id,
      eventType: event.type,
      payload: event,
    });

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.applyStripeSubscription(event.data.object);
        break;
      case 'checkout.session.completed':
        await this.markCheckoutSessionCompleted(event.data.object);
        break;
      default:
        this.logger.debug('Stripe event ignored', { eventType: event.type });
    }
  }

  async handleRevenueCatWebhook(
    payload: RevenueCatWebhookDto,
    authorizationHeader?: string,
  ): Promise<void> {
    const expectedSecret = this.configService.get<string>(
      'revenueCat.webhookSecret',
    );
    if (expectedSecret) {
      const provided = this.extractBearerToken(authorizationHeader);
      if (provided !== expectedSecret) {
        throw new UnauthorizedException('Invalid RevenueCat webhook secret');
      }
    }

    if (!payload.event) {
      this.logger.warn('RevenueCat webhook missing event payload');
      return;
    }

    const authId =
      payload.event.app_user_id || payload.event.original_app_user_id;
    const user = await this.lookupUserByAuthIdentifier(authId);
    if (!user) {
      this.logger.warn('RevenueCat event without matching user', {
        authId,
        eventId: payload.event.id,
      });
      return;
    }

    const externalId =
      payload.event.id ||
      payload.event.original_transaction_id ||
      payload.event.transaction_id ||
      `${Date.now()}`;

    await this.logBillingEvent({
      source: SubscriptionProvider.revenuecat,
      platform: SubscriptionPlatform.ios,
      externalEventId: externalId,
      eventType: payload.event.type || 'unknown',
      payload,
    });

    const entitlementCode =
      payload.event.entitlement_id ||
      payload.event.product_id ||
      this.defaultEntitlement;
    const expiresAt = payload.event.expiration_at_ms
      ? new Date(payload.event.expiration_at_ms)
      : null;
    const status = this.deriveRevenueCatStatus(payload.event);

    const revenueCatMetadata = this.toJsonInput(payload);

    await this.prisma.subscription.upsert({
      where: {
        provider_externalSubscriptionId: {
          provider: SubscriptionProvider.revenuecat,
          externalSubscriptionId:
            payload.event.original_transaction_id ||
            payload.event.transaction_id ||
            entitlementCode,
        },
      },
      update: {
        status,
        entitlementCode,
        productId: payload.event.product_id ?? null,
        planName: payload.event.entitlement_id ?? null,
        currentPeriodEnd: expiresAt,
        ...(revenueCatMetadata !== undefined
          ? { metadata: revenueCatMetadata }
          : {}),
      },
      create: {
        userId: user.userId,
        provider: SubscriptionProvider.revenuecat,
        externalSubscriptionId:
          payload.event.original_transaction_id ||
          payload.event.transaction_id ||
          entitlementCode,
        externalCustomerId: authId ?? null,
        platform: SubscriptionPlatform.ios,
        status,
        entitlementCode,
        productId: payload.event.product_id ?? null,
        planName: payload.event.entitlement_id ?? null,
        currentPeriodEnd: expiresAt,
        ...(revenueCatMetadata !== undefined
          ? { metadata: revenueCatMetadata }
          : {}),
      },
    });

    await this.userService.upsertEntitlement({
      userId: user.userId,
      entitlementCode,
      source: SubscriptionProvider.revenuecat,
      platform: SubscriptionPlatform.ios,
      status:
        status === SubscriptionStatus.expired
          ? EntitlementStatus.expired
          : EntitlementStatus.active,
      expiresAt,
      metadata: revenueCatMetadata,
    });
  }

  private async logBillingEvent(params: LogBillingEventParams): Promise<void> {
    const payloadJson = this.toJsonInput(params.payload);

    await this.prisma.billingEventLog.upsert({
      where: {
        source_externalEventId: {
          source: params.source,
          externalEventId: params.externalEventId,
        },
      },
      update: {
        status: BillingEventStatus.processed,
        processedAt: new Date(),
        ...(payloadJson !== undefined ? { payload: payloadJson } : {}),
        eventType: params.eventType,
      },
      create: {
        source: params.source,
        platform: params.platform ?? null,
        externalEventId: params.externalEventId,
        eventType: params.eventType,
        status: BillingEventStatus.processed,
        ...(payloadJson !== undefined ? { payload: payloadJson } : {}),
      },
    });
  }

  private async applyStripeSubscription(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const metadataUserId = this.getMetadataValue(
      subscription.metadata,
      'user_id',
    );
    const metadataAuthId = this.getMetadataValue(
      subscription.metadata,
      'auth_user_id',
    );
    const authId = metadataUserId || metadataAuthId;
    const user = await this.lookupUserByAuthIdentifier(authId);
    if (!user) {
      this.logger.warn('Stripe subscription event without matching user', {
        subscriptionId: subscription.id,
      });
      return;
    }

    const entitlementCode =
      this.getMetadataValue(subscription.metadata, 'entitlement_code') ||
      this.getMetadataValue(
        subscription.items.data[0]?.price?.metadata,
        'entitlement_code',
      ) ||
      this.defaultEntitlement;
    const status = this.mapStripeStatus(subscription.status);
    const currentPeriodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000)
      : null;

    const stripeMetadata = this.toJsonInput(subscription);

    await this.prisma.subscription.upsert({
      where: {
        provider_externalSubscriptionId: {
          provider: SubscriptionProvider.stripe,
          externalSubscriptionId: subscription.id,
        },
      },
      update: {
        status,
        entitlementCode,
        productId: subscription.items.data[0]?.price?.product as string,
        priceId: subscription.items.data[0]?.price?.id,
        planName: subscription.items.data[0]?.price?.nickname ?? null,
        currentPeriodStart: subscription.current_period_start
          ? new Date(subscription.current_period_start * 1000)
          : null,
        currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        cancelledAt: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000)
          : null,
        ...(stripeMetadata !== undefined ? { metadata: stripeMetadata } : {}),
      },
      create: {
        userId: user.userId,
        provider: SubscriptionProvider.stripe,
        externalSubscriptionId: subscription.id,
        externalCustomerId: subscription.customer as string,
        platform: SubscriptionPlatform.web,
        entitlementCode,
        status,
        productId: subscription.items.data[0]?.price?.product as string,
        priceId: subscription.items.data[0]?.price?.id,
        planName: subscription.items.data[0]?.price?.nickname ?? null,
        currentPeriodStart: subscription.current_period_start
          ? new Date(subscription.current_period_start * 1000)
          : null,
        currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        cancelledAt: subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000)
          : null,
        ...(stripeMetadata !== undefined ? { metadata: stripeMetadata } : {}),
      },
    });

    await this.userService.upsertEntitlement({
      userId: user.userId,
      entitlementCode,
      source: SubscriptionProvider.stripe,
      platform: SubscriptionPlatform.web,
      status:
        status === SubscriptionStatus.active
          ? EntitlementStatus.active
          : EntitlementStatus.inactive,
      expiresAt: currentPeriodEnd,
      isGracePeriod: subscription.cancel_at_period_end,
      metadata: stripeMetadata,
    });

    await this.prisma.user.update({
      where: { userId: user.userId },
      data: {
        subscriptionStatus: status,
      },
    });
  }

  private async markCheckoutSessionCompleted(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const sessionMetadata = this.toJsonInput(session);

    await this.prisma.checkoutSession.updateMany({
      where: { externalSessionId: session.id },
      data: {
        status: CheckoutSessionStatus.completed,
        completedAt: new Date(),
        ...(sessionMetadata !== undefined ? { metadata: sessionMetadata } : {}),
      },
    });
  }

  private mapStripeStatus(status?: string | null): SubscriptionStatus {
    switch (status) {
      case 'trialing':
        return SubscriptionStatus.trialing;
      case 'active':
      case 'past_due':
      case 'incomplete':
        return SubscriptionStatus.active;
      case 'canceled':
        return SubscriptionStatus.cancelled;
      default:
        return SubscriptionStatus.expired;
    }
  }

  private deriveRevenueCatStatus(
    event: RevenueCatWebhookDto['event'],
  ): SubscriptionStatus {
    if (!event) {
      return SubscriptionStatus.expired;
    }
    if (event.expiration_at_ms && event.expiration_at_ms < Date.now()) {
      return SubscriptionStatus.expired;
    }
    if (event.type?.toLowerCase().includes('cancel')) {
      return SubscriptionStatus.cancelled;
    }
    return SubscriptionStatus.active;
  }

  private extractBearerToken(header?: string): string | undefined {
    if (!header) return undefined;
    const [type, token] = header.split(' ');
    if (type?.toLowerCase() !== 'bearer' || !token) {
      return undefined;
    }
    return token.trim();
  }

  private normalizeRawBody(rawBody: Buffer | string | undefined): Buffer {
    if (!rawBody) {
      return Buffer.from('');
    }
    return Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  }

  private ensureStripe(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }
    return this.stripe;
  }

  private toJsonInput(input: unknown): Prisma.InputJsonValue | undefined {
    if (input === undefined || input === null) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(input)) as Prisma.InputJsonValue;
  }

  private getMetadataValue(
    metadata: Stripe.Metadata | Stripe.MetadataParam | null | undefined,
    key: string,
  ): string | undefined {
    if (!metadata) {
      return undefined;
    }
    const value = metadata[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private async lookupUserByAuthIdentifier(
    identifier?: string | null,
  ): Promise<User | null> {
    if (!identifier) {
      return null;
    }
    return this.prisma.user.findFirst({
      where: {
        OR: [
          { authProviderUserId: identifier },
          { revenueCatAppUserId: identifier },
          { userId: identifier },
        ],
      },
    });
  }
}
