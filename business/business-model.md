# Crave — Business Model (decision record)

> Rewritten 2026-07-12 to match canon. Strategy, sequencing, and all distribution
> decisions live in [signal/blueprint.md](signal/blueprint.md); this file holds
> the model decision itself plus the durable operational facts that don't belong
> in a strategy doc. History: an earlier version of this file recommended
> freemium; the owner overrode it 2026-07-08 for capital-return speed, and the
> full adversarial re-examination (signal/, panels P1) upheld the override.
> The freemium reasoning is preserved in git history and in
> signal/ledger/02-business-model-and-price.md.

## The model (owner decision, FINAL; re-validated by panel P1)

- **Hard paywall, gate everything.** Card required at onboarding end. No free
  tier, no thin shell.
- **$7.99/mo pay-now** (no trial) or **$39.99/yr with a ~1-week store-managed
  intro free trial** (annual only; Apple charges at trial end and sends the
  pre-charge reminder).
- Week-3 price-ceiling test cohort ($9.99/$59.99 on 10–20% of traffic) per
  blueprint §2 — the price _level_ stays under honest test; the structure does
  not.
- **Freemium is the documented future pivot,** fully built and env-gated
  (`@AllowUnentitled` on free surfaces + `BILLING_TRIAL_DAYS>0`), deliberately
  one-commit-sized. The door swings loosen-only; we never plan the reverse.
- The five-part argument for this model (capital velocity, annual churn math,
  payers-as-honest-validation, one-way door, solo simplicity) is blueprint §0.

## Shared-link exception (blueprint §5)

Shared slugs render their artifact fully and freely on the web — terminal
pages, no outbound navigation. This is a sharing surface, not a free tier;
the boundary is navigational, not informational.

## Apple-proofing (non-negotiable from v1 — a pull is existential)

Cal AI was pulled April 2026 (Guidelines 3.1.2(c)/5.6) for four things. Avoid
all of them, and the wider decline-cascade family this scene normalizes:

1. Show the **real billed number** most prominently (never a per-week
   divide-down bigger than the charge).
2. Auto-renewal terms **inline** + a visual trial timeline (what you get, when
   charged, how to cancel).
3. **Never re-prompt a decliner** with a second, different offer. No fake
   scarcity, no spin-the-wheel discounts, no abandonment counter-offers.
4. **StoreKit IAP in-app only.** Web checkout is Apple-legal only out-of-app.
   (Apple-native cancel-flow/win-back offers are compliant in principle but
   stay dormant per the win-back-only design.)

## Margin lever

Dual-rail billing is live in `apps/api/src/modules/billing`: RevenueCat iOS
(~85% net under Small Business) + Stripe webhooks (web ~97% net; the web
checkout _client_ rail was deleted 2026-07-09 and would need rebuilding).
Steering renewals/returning users to Apple-legal out-of-app web checkout is a
~12-point margin swing — a post-launch project, noted in blueprint §11's parked
items alongside the web-to-app funnel pattern.

## Funding stance

100% bootstrapped; default-alive at a few hundred payers because solo opex is
near-zero. If fuel is ever wanted: founder-friendly non-dilutive-style only
(TinySeed, Calm Company SEAL) — real but thin capital; never bank the plan on
it. No VC, no unicorn pressure. B2B (claimed profiles, analytics, sponsored
polls) is Phase 2, post-density, and **never injected into the ranking**.

## Plan for reality

~4.6% of new apps clear $10k/mo within 2 years. Model conservatively: year-1
annual renewal ~30% until RevenueCat's benchmark is verified first-party;
install→paid 4–10% band; the kill board and instrumentation set is blueprint §8.
This works if the product is genuinely better — pricing cleverness never
rescues a product problem.
