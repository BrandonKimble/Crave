import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import Stripe from 'stripe';
import {
  BillingEventStatus,
  CheckoutSessionStatus,
  Prisma,
  SubscriptionPlatform,
  SubscriptionProvider,
  SubscriptionStatus,
  type User,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  CreateCheckoutSessionDto,
  type CheckoutPlan,
} from './dto/create-checkout-session.dto';
import { RevenueCatWebhookDto } from './dto/revenuecat-webhook.dto';
import { UserService } from '../identity/user.service';
import { EntitlementService } from '../entitlements/entitlement.service';
import { readDefaultEntitlementCode } from '../entitlements/entitlement-config';
import { RevenueCatEntitlementMap } from './revenuecat-entitlement-map';
import { revenueCatEventIdentity } from './webhook-event-identity';

/**
 * The annual-only free trial, in days (owner ruling 2026-08-03: "~1 week").
 * Stated ONCE, here, because the web paywall copy and the Stripe session must
 * describe the same offer — a page that promises a week while the session
 * grants three days is a lie the customer discovers at the charge.
 */
export const ANNUAL_TRIAL_PERIOD_DAYS = 7;

interface LogBillingEventParams {
  source: SubscriptionProvider;
  platform?: SubscriptionPlatform | null;
  externalEventId: string;
  eventType: string;
  payload: unknown;
  /** When set, the event is recorded as FAILED with this message (findable +
   *  replayable) instead of processed. */
  failed?: string;
}

@Injectable()
export class BillingService {
  private readonly stripe: Stripe | null;
  private readonly defaultEntitlement: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly userService: UserService,
    private readonly entitlements: EntitlementService,
  ) {
    const stripeSecret = this.configService.get<string>('stripe.secretKey');
    this.stripe = stripeSecret
      ? new Stripe(stripeSecret, {
          apiVersion: '2024-06-20',
        })
      : null;
    this.defaultEntitlement = readDefaultEntitlementCode(this.configService);
    // Parsed HERE, in the constructor, so a malformed money map refuses BOOT
    // rather than surfacing as grants written under the wrong code. There is
    // no default map — see revenuecat-entitlement-map.ts.
    this.entitlementMap = RevenueCatEntitlementMap.parse(
      this.configService.get<string>('revenueCat.entitlementMap'),
      this.defaultEntitlement,
    );
  }

  private readonly entitlementMap: RevenueCatEntitlementMap;

  /**
   * THE WEB CHECKOUT RAIL (restored 2026-08-03 by owner ruling; see
   * business/business-model.md "Margin lever" and the header on
   * create-checkout-session.dto.ts for what was re-derived rather than
   * restored).
   *
   * Hands back the HOSTED Stripe Checkout URL. That URL is the whole
   * product of this endpoint: the app's primary paywall button and the
   * external landing page both just open it.
   *
   * SINGLE-PRODUCT LAW, UNTOUCHED. Premium is the only PRODUCT, forever
   * (D1-residual, owner 2026-08-03 — same ruling that makes
   * RevenueCatEntitlementMap refuse boot on a second code).
   * `accessVerdict()` asks only about the default entitlement code, so
   * selling anything else produces a charge that grants nothing. What the
   * owner ruled on 2026-08-03 is that the ONE product has TWO prices —
   * $7.99/mo and $39.99/yr — the same pair the in-app paywall shows. The
   * caller names a plan WORD, never a price id, so a price outside the
   * configured pair is unrepresentable; an unknown word is a 400 from the
   * DTO before this method is ever entered.
   *
   * THE TRIAL IS ANNUAL-ONLY, and it lives here rather than on the Stripe
   * price so the structure is visible in the code that sells it: annual gets
   * `subscription_data.trial_period_days`, monthly gets none. Both paywalls
   * (web and in-app) state the same thing, so the offer a user reads is the
   * offer this method builds.
   *
   * NO GRANT HAPPENS HERE. Creating a session is an intent to pay. Access
   * arrives only through the webhook -> access-grant ledger path, so a
   * customer who abandons Checkout never had anything to revoke.
   */
  async createCheckoutSession(
    user: User,
    dto: CreateCheckoutSessionDto,
  ): Promise<{
    url: string;
    sessionId: string;
    expiresAt: Date | null;
  }> {
    const stripe = this.ensureStripe();
    const config = this.requireCheckoutConfig();
    const priceId = config.prices[dto.plan];

    const customerId = await this.ensureStripeCustomer(user, stripe);
    // The identifier every downstream webhook resolves the user by. Same
    // precedence as lookupUserByAuthIdentifier expects.
    const authIdentifier = user.authProviderUserId ?? user.userId;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: authIdentifier,
      success_url: config.successUrl,
      cancel_url: config.cancelUrl,
      metadata: {
        user_id: authIdentifier,
        entitlement_code: this.defaultEntitlement,
      },
      // STAMPED ON THE SUBSCRIPTION, NOT JUST THE SESSION. Stripe does NOT
      // copy Checkout Session metadata onto the subscription it creates, and
      // applyStripeSubscription resolves the user from subscription
      // metadata — without this, every web subscription event would log
      // "Stripe subscription event without matching user" and no grant would
      // ever be written.
      subscription_data: {
        metadata: {
          user_id: authIdentifier,
          entitlement_code: this.defaultEntitlement,
        },
        // ANNUAL-ONLY, and spread rather than set-to-undefined: Stripe reads
        // an explicit `trial_period_days: undefined` the same as absent, but
        // a future refactor that stringifies these args would not. Monthly
        // carries no trial in either paywall, so it must carry none here.
        ...(dto.plan === 'annual'
          ? { trial_period_days: ANNUAL_TRIAL_PERIOD_DAYS }
          : {}),
      },
      line_items: [{ price: priceId, quantity: 1 }],
    });

    if (!session.url) {
      // The URL IS the deliverable. Returning a null one would hand the app
      // a button that opens nothing.
      throw new ServiceUnavailableException(
        'Stripe did not return a Checkout URL',
      );
    }

    const expiresAt = session.expires_at
      ? new Date(session.expires_at * 1000)
      : null;
    const checkoutMetadata = this.toJsonInput(session);

    await this.prisma.checkoutSession.create({
      data: {
        userId: user.userId,
        provider: SubscriptionProvider.stripe,
        externalSessionId: session.id,
        status: CheckoutSessionStatus.pending,
        url: session.url,
        successUrl: config.successUrl,
        cancelUrl: config.cancelUrl,
        expiresAt,
        ...(checkoutMetadata !== undefined
          ? { metadata: checkoutMetadata }
          : {}),
      },
    });

    return { url: session.url, sessionId: session.id, expiresAt };
  }

  /**
   * The Stripe-hosted billing portal (change card, cancel, invoices) for a
   * WEB subscriber. App Store subscribers manage in iOS Settings — Stripe
   * has no record of them, which is exactly what the 400 below says.
   *
   * The return URL comes from config, never from the caller: see the DTO
   * header for the open-redirect this closes. The portal endpoint therefore
   * takes no body at all.
   */
  async createPortalSession(user: User): Promise<{ url: string }> {
    const stripe = this.ensureStripe();
    const returnUrl = this.configService.get<string>('stripe.portalReturnUrl');
    if (!returnUrl) {
      throw new ServiceUnavailableException(
        'STRIPE_PORTAL_RETURN_URL is not configured',
      );
    }
    if (!user.stripeCustomerId) {
      throw new BadRequestException(
        'No Stripe customer for this account. Web billing starts at ' +
          'checkout; App Store subscriptions are managed in iOS Settings.',
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: returnUrl,
    });

    if (!portalSession.url) {
      throw new ServiceUnavailableException(
        'Stripe did not return a portal URL',
      );
    }

    return { url: portalSession.url };
  }

  /**
   * Every checkout config fact, or a refusal naming what is missing.
   *
   * NO DEFAULTS, deliberately (no-fake-estimates law): a guessed price id
   * sells the wrong thing and a guessed redirect strands a paying customer
   * on a page we do not own. Unconfigured is unconfigured.
   */
  private requireCheckoutConfig(): {
    prices: Record<CheckoutPlan, string>;
    successUrl: string;
    cancelUrl: string;
  } {
    // BOTH prices are required, not just the one this request happens to
    // want. The paywall renders two buttons; a rail that can serve only one
    // of them is a half-outage that looks green until a user picks the other
    // plan, and a partially-configured rail must fail on the FIRST request,
    // not the unlucky one.
    const monthly = this.configService.get<string>('stripe.prices.monthly');
    const annual = this.configService.get<string>('stripe.prices.annual');
    const successUrl = this.configService.get<string>(
      'stripe.checkoutSuccessUrl',
    );
    const cancelUrl = this.configService.get<string>(
      'stripe.checkoutCancelUrl',
    );
    const missing = [
      monthly ? null : 'STRIPE_MONTHLY_PRICE_ID',
      annual ? null : 'STRIPE_ANNUAL_PRICE_ID',
      successUrl ? null : 'STRIPE_CHECKOUT_SUCCESS_URL',
      cancelUrl ? null : 'STRIPE_CHECKOUT_CANCEL_URL',
    ].filter((name): name is string => name !== null);
    if (missing.length > 0) {
      throw new ServiceUnavailableException(
        `Stripe web checkout is not configured: ${missing.join(', ')}`,
      );
    }
    return {
      prices: { monthly: monthly as string, annual: annual as string },
      successUrl: successUrl as string,
      cancelUrl: cancelUrl as string,
    };
  }

  /**
   * The user's Stripe customer id, created on first checkout.
   *
   * Lived in UserService before 2026-07-09; it comes back HERE because it is
   * billing's business and nothing else ever needed it — moving it back into
   * identity would only re-spread the vendor across two modules.
   */
  private async ensureStripeCustomer(
    user: User,
    stripe: Stripe,
  ): Promise<string> {
    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { user_id: user.authProviderUserId ?? user.userId },
    });

    await this.prisma.user.update({
      where: { userId: user.userId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
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

    // Exactly-once (parity with the RC path): replays of processed events
    // are acks; failures mark the row failed and rethrow so Stripe retries.
    const prior = await this.prisma.billingEventLog.findUnique({
      where: {
        source_externalEventId: {
          source: SubscriptionProvider.stripe,
          externalEventId: event.id,
        },
      },
      select: { status: true },
    });
    if (prior?.status === BillingEventStatus.processed) {
      this.logger.debug('Stripe event replayed, already processed', {
        eventId: event.id,
      });
      return;
    }

    try {
      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted':
          await this.applyStripeSubscription(event.data.object);
          break;
        case 'checkout.session.completed':
          await this.completeCheckoutSession(event.data.object);
          break;
        case 'charge.refunded':
          await this.handleStripeRefund(event.data.object);
          break;
        case 'invoice.payment_failed':
          this.logger.warn('Stripe invoice payment failed', {
            customer: (event.data.object as { customer?: string }).customer,
            // Access expiry rides currentPeriodEnd on the grant: a failed
            // renewal simply never extends it. Logged for dunning follow-up.
          });
          break;
        default:
          this.logger.debug('Stripe event ignored', { eventType: event.type });
      }
    } catch (error) {
      await this.logBillingEvent({
        source: SubscriptionProvider.stripe,
        platform: SubscriptionPlatform.web,
        externalEventId: event.id,
        eventType: event.type,
        payload: event,
        failed: error instanceof Error ? error.message : 'processing error',
      });
      throw error;
    }

    await this.logBillingEvent({
      source: SubscriptionProvider.stripe,
      platform: SubscriptionPlatform.web,
      externalEventId: event.id,
      eventType: event.type,
      payload: event,
    });
  }

  async handleRevenueCatWebhook(
    payload: RevenueCatWebhookDto,
    authorizationHeader?: string,
  ): Promise<void> {
    const expectedSecret = this.configService.get<string>(
      'revenueCat.webhookSecret',
    );
    if (!expectedSecret) {
      // Fail CLOSED: without a configured secret, any caller could forge
      // entitlement-granting events.
      throw new ServiceUnavailableException(
        'RevenueCat webhook secret is not configured',
      );
    }
    const provided = this.extractBearerToken(authorizationHeader);
    if (!provided || !this.secretsEqual(provided, expectedSecret)) {
      throw new UnauthorizedException('Invalid RevenueCat webhook secret');
    }

    if (!payload.event) {
      this.logger.warn('RevenueCat webhook missing event payload');
      return;
    }

    // Vendor event id, or a stable content hash where the payload carries
    // none — never a timestamp. See webhook-event-identity.ts.
    const externalId = revenueCatEventIdentity(
      payload.event as unknown as Record<string, unknown>,
    );

    // Exactly-once: a replayed delivery of an already-processed event is an
    // ack, not a reapply (protects against duplicate grants and stale
    // retries overwriting newer state).
    const prior = await this.prisma.billingEventLog.findUnique({
      where: {
        source_externalEventId: {
          source: SubscriptionProvider.revenuecat,
          externalEventId: externalId,
        },
      },
      select: { status: true },
    });
    if (prior?.status === BillingEventStatus.processed) {
      this.logger.debug('RevenueCat event replayed, already processed', {
        eventId: externalId,
      });
      return;
    }

    // Dashboard/synthetic TEST events carry no transaction — record receipt
    // and stop before any subscription or grant write.
    if (payload.event.type === 'TEST') {
      await this.logBillingEvent({
        source: SubscriptionProvider.revenuecat,
        platform: SubscriptionPlatform.ios,
        externalEventId: externalId,
        eventType: payload.event.type,
        payload,
      });
      return;
    }

    // TRANSFER moves entitlements between app_user_ids (restore on another
    // account): revoke the losing side, resync the gaining side from RC's
    // subscriber truth. Never runs through the normal grant path — transfer
    // payloads carry no expiration and must not mint grants directly.
    if (payload.event.type === 'TRANSFER') {
      try {
        await this.handleRevenueCatTransfer(payload.event);
      } catch (error) {
        await this.logBillingEvent({
          source: SubscriptionProvider.revenuecat,
          platform: SubscriptionPlatform.ios,
          externalEventId: externalId,
          eventType: payload.event.type,
          payload,
          failed: error instanceof Error ? error.message : 'transfer error',
        });
        throw error;
      }
      await this.logBillingEvent({
        source: SubscriptionProvider.revenuecat,
        platform: SubscriptionPlatform.ios,
        externalEventId: externalId,
        eventType: payload.event.type,
        payload,
      });
      return;
    }

    const authId =
      payload.event.app_user_id || payload.event.original_app_user_id;
    const user = await this.lookupUserByAuthIdentifier(authId);
    if (!user) {
      // Not silent: the event log row is marked failed so it is findable and
      // replayable once the user exists (webhook can arrive before signup
      // sync lands).
      this.logger.warn('RevenueCat event without matching user', {
        authId,
        eventId: payload.event.id,
      });
      await this.logBillingEvent({
        source: SubscriptionProvider.revenuecat,
        platform: SubscriptionPlatform.ios,
        externalEventId: externalId,
        eventType: payload.event.type || 'unknown',
        payload,
        failed: `no matching user for app_user_id=${authId ?? 'null'}`,
      });
      return;
    }

    // TRANSLATE THE VENDOR'S VOCABULARY INTO OURS, OR REFUSE.
    //
    // An RC entitlement id we cannot translate is an UNKNOWN, and minting a
    // grant from an unknown is how a paying customer ends up 403'd: the grant
    // is written under vendor vocabulary that accessVerdict() never asks
    // about. So the event is recorded FAILED (findable, replayable) and
    // rethrown — RevenueCat redelivers once REVENUECAT_ENTITLEMENT_MAP is
    // fixed, and nothing was silently granted in the meantime.
    //
    // An event carrying NO entitlement id at all is a different fact: it is
    // not an untranslatable vendor code, so it takes the paywall's default
    // code exactly as before.
    const rawEntitlement =
      payload.event.entitlement_ids?.[0] ||
      payload.event.entitlement_id ||
      null;
    let entitlementCode = this.defaultEntitlement;
    if (rawEntitlement !== null) {
      const translation = this.entitlementMap.translate(rawEntitlement);
      if (translation.kind === 'unknown') {
        const reason = `unmapped_entitlement:${translation.vendorEntitlementId}`;
        this.logger.error(
          'RevenueCat entitlement id is not in REVENUECAT_ENTITLEMENT_MAP — refusing to mint a grant',
          {
            operation: 'revenuecat_unmapped_entitlement',
            vendorEntitlementId: translation.vendorEntitlementId,
            eventId: externalId,
          },
        );
        await this.logBillingEvent({
          source: SubscriptionProvider.revenuecat,
          platform: SubscriptionPlatform.ios,
          externalEventId: externalId,
          eventType: payload.event.type || 'unknown',
          payload,
          failed: reason,
        });
        throw new ServiceUnavailableException(reason);
      }
      entitlementCode = translation.entitlementCode;
    }
    const expiresAt = payload.event.expiration_at_ms
      ? new Date(payload.event.expiration_at_ms)
      : null;
    // billing_subscriptions requires period start+end together or neither.
    const periodStart = expiresAt
      ? payload.event.purchased_at_ms
        ? new Date(payload.event.purchased_at_ms)
        : new Date()
      : null;
    const status = this.deriveRevenueCatStatus(payload.event);
    if (status === null) {
      // Informational/unknown event type: record receipt, never touch grants.
      this.logger.info('RevenueCat event type not grant-relevant, ignored', {
        eventType: payload.event.type,
        eventId: externalId,
      });
      await this.logBillingEvent({
        source: SubscriptionProvider.revenuecat,
        platform: SubscriptionPlatform.ios,
        externalEventId: externalId,
        eventType: payload.event.type || 'unknown',
        payload,
      });
      return;
    }

    const revenueCatMetadata = this.toJsonInput(payload);

    try {
      await this.applyRevenueCatSubscription({
        payload,
        user,
        authId: authId ?? null,
        entitlementCode,
        periodStart,
        expiresAt,
        status,
        revenueCatMetadata,
      });
    } catch (error) {
      // Mark the event row failed and rethrow: RevenueCat retries on 5xx,
      // and the failed row stays findable/replayable.
      await this.logBillingEvent({
        source: SubscriptionProvider.revenuecat,
        platform: SubscriptionPlatform.ios,
        externalEventId: externalId,
        eventType: payload.event.type || 'unknown',
        payload,
        failed: error instanceof Error ? error.message : 'processing error',
      });
      throw error;
    }

    await this.logBillingEvent({
      source: SubscriptionProvider.revenuecat,
      platform: SubscriptionPlatform.ios,
      externalEventId: externalId,
      eventType: payload.event.type || 'unknown',
      payload,
    });
  }

  private async applyRevenueCatSubscription(params: {
    payload: RevenueCatWebhookDto;
    user: User;
    authId: string | null;
    entitlementCode: string;
    periodStart: Date | null;
    expiresAt: Date | null;
    status: SubscriptionStatus;
    revenueCatMetadata: Prisma.InputJsonValue | undefined;
  }): Promise<void> {
    const {
      payload,
      user,
      authId,
      entitlementCode,
      periodStart,
      expiresAt,
      status,
      revenueCatMetadata,
    } = params;
    if (!payload.event) {
      return;
    }

    const externalSubscriptionId =
      payload.event.original_transaction_id ||
      payload.event.transaction_id ||
      entitlementCode;

    // Monotonic guard: RC retries failed deliveries for days, so a stale
    // event can land after a newer one already applied. The last-applied
    // event's payload lives in subscription.metadata — compare timestamps
    // and never let an older event overwrite newer state.
    const eventTs = payload.event.event_timestamp_ms ?? null;
    if (eventTs) {
      const existing = await this.prisma.subscription.findUnique({
        where: {
          provider_externalSubscriptionId: {
            provider: SubscriptionProvider.revenuecat,
            externalSubscriptionId,
          },
        },
        select: { metadata: true },
      });
      const lastTs = (
        existing?.metadata as {
          event?: { event_timestamp_ms?: number };
        } | null
      )?.event?.event_timestamp_ms;
      if (typeof lastTs === 'number' && eventTs < lastTs) {
        this.logger.warn(
          'Skipping stale RevenueCat event (older than applied)',
          {
            externalSubscriptionId,
            eventTs,
            lastAppliedTs: lastTs,
            eventType: payload.event.type,
          },
        );
        return;
      }
    }

    await this.prisma.subscription.upsert({
      where: {
        provider_externalSubscriptionId: {
          provider: SubscriptionProvider.revenuecat,
          externalSubscriptionId,
        },
      },
      update: {
        status,
        entitlementCode,
        productId: payload.event.product_id ?? null,
        planName:
          payload.event.entitlement_ids?.[0] ??
          payload.event.entitlement_id ??
          null,
        currentPeriodStart: periodStart,
        currentPeriodEnd: expiresAt,
        ...(revenueCatMetadata !== undefined
          ? { metadata: revenueCatMetadata }
          : {}),
      },
      create: {
        userId: user.userId,
        provider: SubscriptionProvider.revenuecat,
        externalSubscriptionId,
        externalCustomerId: authId ?? null,
        platform: SubscriptionPlatform.ios,
        status,
        entitlementCode,
        productId: payload.event.product_id ?? null,
        planName:
          payload.event.entitlement_ids?.[0] ??
          payload.event.entitlement_id ??
          null,
        currentPeriodStart: periodStart,
        currentPeriodEnd: expiresAt,
        ...(revenueCatMetadata !== undefined
          ? { metadata: revenueCatMetadata }
          : {}),
      },
    });

    // Ledger is the access truth (see the Stripe path). The grant lives for
    // ANY non-expired status: active, trialing, and cancelled-with-time-left
    // (CANCELLATION = auto-renew off; paid/trial access rides to expiry —
    // EXPIRATION is what ends it).
    await this.entitlements.syncSubscriptionGrant({
      userId: user.userId,
      sourceRef: `revenuecat:${externalSubscriptionId}`,
      expiresAt,
      active: status !== SubscriptionStatus.expired,
      entitlementCode,
    });
  }

  /** TRANSFER: entitlements moved between RC app_user_ids. Revoke the
   *  losing accounts' RC grants; resync the gaining accounts from RC's
   *  subscriber API (the transfer payload itself carries no expiration). */
  private async handleRevenueCatTransfer(
    event: NonNullable<RevenueCatWebhookDto['event']>,
  ): Promise<void> {
    const fromIds = this.asStringArray(event.transferred_from);
    const toIds = this.asStringArray(event.transferred_to);

    // RESOLVE THE GAINING SIDE BEFORE REVOKING THE LOSING ONE (red team
    // 2026-08-02). This used to revoke first and then, if the gaining
    // account's state could not be fetched, silently `continue` — logging the
    // event as processed while the user held access on NEITHER account. The
    // realistic trigger is a lifetime or promotional entitlement, whose
    // `expires_date` is null and which fetchRevenueCatEntitlementState skips.
    //
    // A transfer is a MOVE. Doing the destructive half of a move before
    // knowing the constructive half can succeed is how a move becomes a
    // delete.
    const targets: Array<{
      userId: string;
      state: NonNullable<
        Awaited<ReturnType<BillingService['fetchRevenueCatEntitlementState']>>
      >;
    }> = [];
    for (const toId of toIds) {
      const toUser = await this.lookupUserByAuthIdentifier(toId);
      if (!toUser) {
        this.logger.warn('RevenueCat transfer target has no user', { toId });
        continue;
      }
      const state = await this.fetchRevenueCatEntitlementState(toId);
      if (!state) {
        // LOUD, and RETRYABLE. Throwing leaves both sides untouched and lets
        // RevenueCat redeliver; swallowing it stranded the customer.
        throw new ServiceUnavailableException(
          `RevenueCat transfer: cannot resolve entitlement state for the gaining account (${toId}); refusing to revoke the losing account`,
        );
      }
      targets.push({ userId: toUser.userId, state });
    }

    for (const fromId of fromIds) {
      const fromUser = await this.lookupUserByAuthIdentifier(fromId);
      if (!fromUser) continue;
      const revoked = await this.entitlements.revokeBySource({
        userId: fromUser.userId,
        source: 'subscription',
        sourceRefPrefix: 'revenuecat:',
        reason: 'entitlement transferred to another account',
      });
      this.logger.info('RevenueCat transfer: revoked losing account', {
        userId: fromUser.userId,
        grantsRevoked: revoked,
      });
    }

    for (const { userId, state } of targets) {
      await this.entitlements.syncSubscriptionGrant({
        userId,
        sourceRef: `revenuecat:${state.transactionRef}`,
        expiresAt: state.expiresAt,
        active: state.expiresAt.getTime() > Date.now(),
        entitlementCode: state.entitlementCode,
      });
      this.logger.info('RevenueCat transfer: resynced gaining account', {
        userId,
        expiresAt: state.expiresAt.toISOString(),
      });
    }
  }

  /**
   * PROCESSOR PROPAGATION on account deletion (GDPR Art.17(2) / CCPA
   * 1798.105(c): the duty extends to processors, "unless this proves
   * impossible or involves disproportionate effort" — a single API call is
   * neither).
   *
   * Before this, deletion nulled `revenueCatAppUserId` locally, which severed
   * OUR pointer while leaving the subscriber record live at RevenueCat: the
   * link was deleted from the side that wasn't holding the data.
   *
   * Best-effort by design. A processor outage must never block a
   * legally-required deletion, and the local record is already gone — so this
   * reports rather than throws, and a failure is loud enough to replay.
   */
  async deleteRevenueCatSubscriber(appUserId: string): Promise<boolean> {
    const apiKey = this.configService.get<string>('revenueCat.apiKey');
    if (!apiKey) {
      this.logger.warn(
        'REVENUECAT_API_KEY not configured — subscriber not propagated on deletion',
        { appUserId },
      );
      return false;
    }
    try {
      const response = await fetch(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` } },
      );
      // 404 = already gone; that is success for our purposes (idempotent).
      if (!response.ok && response.status !== 404) {
        this.logger.error(
          'CRITICAL: RevenueCat subscriber delete failed — replay manually',
          { appUserId, status: response.status },
        );
        return false;
      }
      return true;
    } catch (error) {
      this.logger.error(
        'CRITICAL: RevenueCat subscriber delete threw — replay manually',
        {
          appUserId,
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return false;
    }
  }

  /** Read the subscriber's current entitlement truth from RC's v1 API
   *  (public SDK keys work here — REVENUECAT_API_KEY). */
  private async fetchRevenueCatEntitlementState(appUserId: string): Promise<{
    entitlementCode: string;
    expiresAt: Date;
    transactionRef: string;
  } | null> {
    const apiKey = this.configService.get<string>('revenueCat.apiKey');
    if (!apiKey) {
      throw new Error(
        'REVENUECAT_API_KEY not configured — cannot resync transferred subscriber',
      );
    }
    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!response.ok) {
      throw new Error(`RevenueCat subscriber fetch failed: ${response.status}`);
    }
    const body = (await response.json()) as {
      subscriber?: {
        entitlements?: Record<
          string,
          { expires_date?: string | null; product_identifier?: string }
        >;
      };
    };
    const entitlements = body.subscriber?.entitlements ?? {};
    let best: {
      entitlementCode: string;
      expiresAt: Date;
      transactionRef: string;
    } | null = null;
    // Same law as the webhook path: an untranslatable RC id is an UNKNOWN, not
    // a code. A transfer that carries live entitlements we cannot name must
    // fail loudly (the TRANSFER handler records the event FAILED and rethrows)
    // rather than move a grant onto the gaining account under vendor
    // vocabulary the paywall never consults.
    const unmapped: string[] = [];
    for (const [rcId, state] of Object.entries(entitlements)) {
      if (!state.expires_date) continue;
      const expiresAt = new Date(state.expires_date);
      if (expiresAt.getTime() <= Date.now()) continue;
      const translation = this.entitlementMap.translate(rcId);
      if (translation.kind === 'unknown') {
        unmapped.push(rcId);
        continue;
      }
      if (!best || expiresAt > best.expiresAt) {
        best = {
          entitlementCode: translation.entitlementCode,
          expiresAt,
          transactionRef: `transfer:${appUserId}:${state.product_identifier ?? rcId}`,
        };
      }
    }
    if (!best && unmapped.length > 0) {
      throw new Error(`unmapped_entitlement:${unmapped.join(',')}`);
    }
    return best;
  }

  private asStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
    return typeof value === 'string' ? [value] : [];
  }

  /** Cancel the user's active Stripe subscription at period end (access
   *  naturally lapses when the grant's expiresAt passes). iOS subscriptions
   *  can only be cancelled through Apple — the client is told to open the
   *  App Store management sheet. */
  async cancelSubscription(user: User): Promise<{ cancelAtPeriodEnd: true }> {
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId: user.userId,
        provider: SubscriptionProvider.stripe,
        status: {
          in: [SubscriptionStatus.active, SubscriptionStatus.trialing],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { externalSubscriptionId: true },
    });
    if (!subscription?.externalSubscriptionId) {
      const rcSubscription = await this.prisma.subscription.findFirst({
        where: {
          userId: user.userId,
          provider: SubscriptionProvider.revenuecat,
          status: {
            in: [SubscriptionStatus.active, SubscriptionStatus.trialing],
          },
        },
        select: { subscriptionId: true },
      });
      if (rcSubscription) {
        throw new BadRequestException({
          code: 'MANAGE_IN_APP_STORE',
          message:
            'This subscription is billed through the App Store — manage it there.',
        });
      }
      throw new BadRequestException('No active subscription to cancel');
    }
    const stripe = this.ensureStripe();
    await stripe.subscriptions.update(subscription.externalSubscriptionId, {
      cancel_at_period_end: true,
    });
    // The subscription.updated webhook carries the state change into the
    // Subscription record and the grant; nothing else to write here.
    return { cancelAtPeriodEnd: true };
  }

  /** FULL refund of a subscription invoice: revoke THAT subscription's
   *  grant. Partial refunds and one-off charges never touch access, and a
   *  Stripe refund can never revoke a RevenueCat grant (scoped by
   *  sourceRef). */
  private async handleStripeRefund(charge: Stripe.Charge): Promise<void> {
    if (!charge.refunded) {
      // charge.refunded === true only when FULLY refunded.
      this.logger.info('Stripe partial refund — access unchanged', {
        chargeId: charge.id,
      });
      return;
    }
    const customerId =
      typeof charge.customer === 'string' ? charge.customer : null;
    if (!customerId) return;
    const user = await this.prisma.user.findFirst({
      where: { stripeCustomerId: customerId },
      select: { userId: true },
    });
    if (!user) {
      this.logger.warn('Stripe refund without matching user', { customerId });
      return;
    }
    // Resolve which subscription the refunded charge paid for (use the
    // expanded invoice when the event carries it; fetch otherwise).
    if (!charge.invoice) {
      this.logger.info(
        'Stripe refund of non-invoice charge — access unchanged',
        {
          chargeId: charge.id,
          userId: user.userId,
        },
      );
      return;
    }
    const invoice =
      typeof charge.invoice === 'string'
        ? await this.ensureStripe().invoices.retrieve(charge.invoice)
        : charge.invoice;
    const subscriptionId =
      typeof invoice.subscription === 'string'
        ? invoice.subscription
        : (invoice.subscription?.id ?? null);
    if (!subscriptionId) {
      this.logger.info(
        'Stripe refund without subscription — access unchanged',
        {
          chargeId: charge.id,
          userId: user.userId,
        },
      );
      return;
    }
    const revoked = await this.entitlements.revokeBySource({
      userId: user.userId,
      source: 'subscription',
      sourceRef: `stripe:${subscriptionId}`,
      reason: `stripe charge refunded: ${charge.id}`,
    });
    this.logger.info('Stripe refund processed', {
      userId: user.userId,
      chargeId: charge.id,
      subscriptionId,
      grantsRevoked: revoked,
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
        status: params.failed
          ? BillingEventStatus.failed
          : BillingEventStatus.processed,
        processedAt: new Date(),
        errorMessage: params.failed ?? null,
        ...(payloadJson !== undefined ? { payload: payloadJson } : {}),
        eventType: params.eventType,
      },
      create: {
        source: params.source,
        platform: params.platform ?? null,
        externalEventId: params.externalEventId,
        eventType: params.eventType,
        status: params.failed
          ? BillingEventStatus.failed
          : BillingEventStatus.processed,
        errorMessage: params.failed ?? null,
        ...(payloadJson !== undefined ? { payload: payloadJson } : {}),
      },
    });
  }

  /**
   * `checkout.session.completed` — the customer paid on the web.
   *
   * TWO jobs, in this order:
   *
   *  1. Settle the ATTEMPT row (this table's only purpose).
   *  2. GRANT, through the same access-grant ledger call the subscription
   *     events use. Stripe also sends `customer.subscription.created`, and
   *     ordering between the two is not guaranteed — so whichever lands
   *     first must be sufficient on its own. It is: both funnel into
   *     `syncSubscriptionGrant`, which is idempotent per
   *     `stripe:<subscriptionId>`, so the second arrival settles the same
   *     row instead of minting a second grant.
   *
   * IDEMPOTENT ON REPLAY at two independent levels: the billing event log
   * short-circuits a replayed event id before we are ever called, and the
   * ledger's (userId, source, sourceRef) uniqueness is the backstop if it
   * somehow is.
   */
  private async completeCheckoutSession(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const sessionMetadata = this.toJsonInput(session);

    await this.prisma.checkoutSession.updateMany({
      // Replays must not re-stamp completedAt or clobber metadata.
      where: {
        externalSessionId: session.id,
        status: { not: CheckoutSessionStatus.completed },
      },
      data: {
        status: CheckoutSessionStatus.completed,
        completedAt: new Date(),
        ...(sessionMetadata !== undefined ? { metadata: sessionMetadata } : {}),
      },
    });

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : (session.subscription?.id ?? null);
    if (!subscriptionId) {
      // A completed session with no subscription is not our product (premium
      // is a subscription, and mode is hard-coded to 'subscription'). Record
      // it and grant nothing rather than guessing what was bought.
      this.logger.warn('Checkout session completed without a subscription', {
        sessionId: session.id,
      });
      return;
    }

    const stripe = this.ensureStripe();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    // The session's own metadata is the fallback identity: we stamp
    // subscription_data.metadata at creation, but a session created outside
    // this rail (a payment link, a dashboard test) may carry it only here.
    await this.applyStripeSubscription(
      subscription,
      this.getMetadataValue(session.metadata, 'user_id') ??
        (typeof session.client_reference_id === 'string'
          ? session.client_reference_id
          : undefined),
    );
  }

  private async applyStripeSubscription(
    subscription: Stripe.Subscription,
    fallbackAuthId?: string,
  ): Promise<void> {
    const metadataUserId = this.getMetadataValue(
      subscription.metadata,
      'user_id',
    );
    const metadataAuthId = this.getMetadataValue(
      subscription.metadata,
      'auth_user_id',
    );
    const authId = metadataUserId || metadataAuthId || fallbackAuthId;
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
    // SINGLE-PRODUCT LAW, the Stripe-side door (D1-residual, owner
    // 2026-08-03). RevenueCatEntitlementMap refuses a second code at BOOT;
    // this is the same refusal for a code arriving in VENDOR DATA — a stray
    // `entitlement_code` on a Stripe price would otherwise mint a paid grant
    // under a code accessVerdict() never asks about. Throwing marks the event
    // failed and replayable, which is the findable end of the failure.
    if (!this.entitlementMap.isKnownCode(entitlementCode)) {
      throw new Error(
        `Stripe subscription ${subscription.id} names entitlement code ` +
          `${JSON.stringify(entitlementCode)}, which no access check ` +
          `consults. Premium is the only product; fix the price/subscription ` +
          `metadata in Stripe and redeliver.`,
      );
    }
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

    // Ledger is the access truth: mirror this subscription into a
    // subscription-source grant (renewals extend it, cancellation/refund
    // revokes it); Redis is recomputed as the cache.
    await this.entitlements.syncSubscriptionGrant({
      userId: user.userId,
      sourceRef: `stripe:${subscription.id}`,
      expiresAt: currentPeriodEnd,
      // Trials grant access too; 'cancelled' from Stripe means the period
      // actually ended ('canceled' status arrives at period end — pending
      // cancels stay 'active' with cancel_at_period_end=true).
      active:
        status === SubscriptionStatus.active ||
        status === SubscriptionStatus.trialing,
      entitlementCode,
    });
  }

  private mapStripeStatus(status?: string | null): SubscriptionStatus {
    switch (status) {
      case 'trialing':
        return SubscriptionStatus.trialing;
      case 'active':
      case 'past_due': // grace period: access rides until the period end
        return SubscriptionStatus.active;
      case 'canceled':
        return SubscriptionStatus.cancelled;
      default:
        // incomplete/incomplete_expired/unpaid: first payment never landed —
        // no access.
        return SubscriptionStatus.expired;
    }
  }

  /** Explicit RC event-type map (never substring-match: UNCANCELLATION
   *  contains "cancel"). Returns null for informational/unknown types —
   *  those must never touch grants. Semantics: CANCELLATION = auto-renew
   *  OFF, access rides until expiration (EXPIRATION is what ends access). */
  private deriveRevenueCatStatus(
    event: RevenueCatWebhookDto['event'],
  ): SubscriptionStatus | null {
    if (!event) return null;
    const type = (event.type ?? '').toUpperCase();
    const hasFutureExpiry =
      !!event.expiration_at_ms && event.expiration_at_ms > Date.now();
    switch (type) {
      case 'EXPIRATION':
        return SubscriptionStatus.expired;
      case 'CANCELLATION':
      case 'SUBSCRIPTION_PAUSED':
        return hasFutureExpiry
          ? SubscriptionStatus.cancelled
          : SubscriptionStatus.expired;
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
      case 'PRODUCT_CHANGE':
      case 'BILLING_ISSUE': // grace period: expiration_at_ms is the horizon
      case 'SUBSCRIPTION_EXTENDED':
      case 'NON_RENEWING_PURCHASE':
      case 'TEMPORARY_ENTITLEMENT_GRANT':
        if (!hasFutureExpiry) return SubscriptionStatus.expired;
        return event.period_type === 'TRIAL'
          ? SubscriptionStatus.trialing
          : SubscriptionStatus.active;
      default:
        return null;
    }
  }

  private extractBearerToken(header?: string): string | undefined {
    if (!header) return undefined;
    const [type, token] = header.split(' ');
    if (type?.toLowerCase() !== 'bearer' || !token) {
      return undefined;
    }
    return token.trim();
  }

  /** Constant-time secret compare (hash first so lengths always match). */
  private secretsEqual(provided: string, expected: string): boolean {
    const a = createHash('sha256').update(provided).digest();
    const b = createHash('sha256').update(expected).digest();
    return timingSafeEqual(a, b);
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
    // userId is a UUID column — matching a non-UUID identifier (e.g. a Clerk
    // `user_...` app_user_id from a RevenueCat webhook) against it makes
    // Prisma throw P2023 before the OR is evaluated.
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        identifier,
      );
    return this.prisma.user.findFirst({
      where: {
        // A deleted account must NEVER receive a grant: the deletion flow
        // revokes everything, and a late webhook (e.g. the subscription
        // update fired by deletion's own cancel call) would resurrect it.
        deletedAt: null,
        OR: [
          { authProviderUserId: identifier },
          { revenueCatAppUserId: identifier },
          ...(isUuid ? [{ userId: identifier }] : []),
        ],
      },
    });
  }
}
