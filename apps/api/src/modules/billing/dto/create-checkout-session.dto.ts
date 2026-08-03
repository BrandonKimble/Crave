import { IsOptional, IsString } from 'class-validator';

/**
 * RE-DERIVED FROM THE 2026-07-09 DELETION, NOT RESTORED VERBATIM.
 *
 * The original DTO also accepted `successUrl` and `cancelUrl` from the
 * client. Those are gone: they are an open redirect wearing a feature's
 * clothes (any caller with a token could hand Stripe an arbitrary
 * post-payment destination and land a paying customer on a page we don't
 * own). Redirects come from config now — the owner picks them once.
 *
 * `priceId` survives ONLY so a wrong one can be REFUSED loudly rather than
 * silently ignored. Premium is the only product, forever (D1-residual), so
 * the sole legal value is the configured premium price; anything else is a
 * 400 naming both ids. A client that sends nothing gets premium.
 */
export class CreateCheckoutSessionDto {
  @IsString()
  @IsOptional()
  priceId?: string;
}
