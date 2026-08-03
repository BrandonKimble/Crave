import { IsIn } from 'class-validator';

/**
 * THE PLAN VOCABULARY IS CLOSED — and it is the ONLY thing the caller says.
 *
 * The original DTO (deleted 2026-07-09) also accepted `successUrl` and
 * `cancelUrl` from the client. Those are gone: they are an open redirect
 * wearing a feature's clothes (any caller with a token could hand Stripe an
 * arbitrary post-payment destination and land a paying customer on a page we
 * don't own). Redirects come from config now — the owner picks them once.
 *
 * `priceId` is gone TOO (2026-08-03, owner ruling: the web paywall shows both
 * offers — $7.99/mo and $39.99/yr with the annual-only ~1-week free trial —
 * the SAME structure as the in-app paywall). The single-product law did not
 * loosen: Premium is still the only PRODUCT, and these are two PRICES of it.
 * But the old shape enforced that law by comparing a client-supplied opaque
 * Stripe id against the configured one. A vocabulary of two words is strictly
 * stronger — a price id outside the configured pair is now UNREPRESENTABLE,
 * because the caller cannot name a price id at all. The api owns which Stripe
 * price each word means, and which one carries the trial.
 *
 * `plan` is REQUIRED, never defaulted. A paywall showing two prices, against
 * a body that silently means "monthly", is a charge the user did not pick;
 * an absent or unknown plan is a 400 naming the two legal values.
 */
export const CHECKOUT_PLANS = ['monthly', 'annual'] as const;
export type CheckoutPlan = (typeof CHECKOUT_PLANS)[number];

export class CreateCheckoutSessionDto {
  @IsIn(CHECKOUT_PLANS, {
    message: `plan must be one of: ${CHECKOUT_PLANS.join(', ')}`,
  })
  plan!: CheckoutPlan;
}
