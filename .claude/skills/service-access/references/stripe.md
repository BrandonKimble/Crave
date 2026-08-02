# Stripe

`stripe` v1.45.0. **No `stripe login` needed** — pass the key from the env:

```bash
source scripts/rig/svc-env.sh
stripe products list --limit 5 --api-key "$STRIPE_KEY"
stripe prices list --api-key "$STRIPE_KEY"
stripe customers retrieve cus_XXX --api-key "$STRIPE_KEY"
```

⚠️ **`STRIPE_SECRET_KEY` is `sk_test_…` — test mode.** Every number you read is
test data. Do not present it as revenue. Live-mode reads need the live key,
which is not in this `.env`.

## What the CLI gives you that the MCP can't

Local webhook forwarding — the reason to have it installed at all:

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe --api-key "$STRIPE_KEY"
stripe trigger checkout.session.completed --api-key "$STRIPE_KEY"
```

`stripe listen` prints a `whsec_…` signing secret for the session; that is what
`STRIPE_WEBHOOK_SECRET` must be set to while testing locally, and it differs
from the deployed one.

## Repo context

`STRIPE_DEFAULT_PRICE_ID`, `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`,
`STRIPE_PORTAL_RETURN_URL` are already configured. The decision to ship a web
Stripe checkout rail (alongside RevenueCat for IAP) is recorded in
`plans/payments-ideal-shape.md`.

## Confirm first

Never create, update, refund, or delete a live-mode object without explicit
owner approval on that specific action.
