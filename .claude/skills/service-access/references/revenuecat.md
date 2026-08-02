# RevenueCat

**There is no official RevenueCat CLI.** `revcat` (revcat.vercel.app) markets
itself as one and advertises Claude Code support, but it is a third-party
project on a personal deployment. Authing it means handing an unaffiliated
party your RevenueCat credentials. **Do not install it.** Use curl or the MCP.

## v1 REST — works today

`REVENUECAT_API_KEY` is in `apps/api/.env`. ⚠️ It is a **test-mode legacy v1
key** (literal prefix `test`).

```bash
source scripts/rig/svc-env.sh
curl -s -H "Authorization: Bearer $REVENUECAT_API_KEY" \
  "https://api.revenuecat.com/v1/subscribers/<app_user_id>" | jq .
```

⚠️ **`GET /v1/subscribers/<id>` CREATES the subscriber if absent** and returns 201. There is no read-only probe on this endpoint — never call it with a made-up
id to "test auth", or you pollute the project with phantom subscribers.

## v2 REST — ✅ working (2026-08-02)

`REVENUECAT_API_KEY_V2` is in `apps/api/.env`. **Tooling only — the app does not
read it.** Never replace `REVENUECAT_API_KEY` (v1) with it; the app needs v1.

Project: **`crave`** / `proj2c08e0c4`, bundle `com.brandonkimble.cravesearch`.

```bash
source scripts/rig/svc-env.sh
curl -s -H "Authorization: Bearer $REVENUECAT_API_KEY_V2" \
  https://api.revenuecat.com/v2/projects | jq '.items[] | {id, name}'

curl -s -H "Authorization: Bearer $REVENUECAT_API_KEY_V2" \
  https://api.revenuecat.com/v2/projects/proj2c08e0c4/offerings | jq .

curl -s -H "Authorization: Bearer $REVENUECAT_API_KEY_V2" \
  https://api.revenuecat.com/v2/projects/proj2c08e0c4/entitlements | jq .
```

## MCP

A RevenueCat MCP is configured in `.mcp.json` with ~100 typed tools (offerings,
paywalls, entitlements, charts, customers). It is **unauthorized** — OAuth must
be completed from an interactive `claude` session or claude.ai connector
settings. Once authed it is strictly better than curl for v2 work.

## Repo context

`REVENUECAT_ENTITLEMENT_MAP`, `REVENUECAT_WEBHOOK_SECRET`,
`BILLING_DEFAULT_ENTITLEMENT`, `BILLING_TRIAL_DAYS`, `ENTITLEMENT_GATING`.
Mobile key: `EXPO_PUBLIC_REVENUECAT_IOS_KEY`. The free-vs-paid split is
specified in `business/monetization-and-gating.md`. RevenueCat handles IAP;
Stripe handles the web rail — they coexist by decision.

## Confirm first

Granting an entitlement, refunding, or transferring a purchase affects a real
customer. Owner approval per action.
