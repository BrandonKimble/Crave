# Payments / Entitlements — Ideal Long-Term Shape

**Date:** 2026-07-08. Owner mandate: uncompromising, right-first-time, must
accommodate everything we may ever do (earned trial extensions, comps, promos,
referrals, future B2B). Companion to business/monetization docs (eater-pays,
freemium + reverse trial, $7.99/mo · $39.99/yr, push annual).

## Audit verdict (2026-07-08, full inventory in session log)

The plumbing skeleton is real and better than expected; the product layer is
absent. Working today: Stripe checkout/portal/webhooks (signed, idempotent,
event-logged), RevenueCat webhook → entitlement upsert, solid Prisma models
(Subscription, UserEntitlement, BillingEventLog w/ unique(source,eventId),
CheckoutSession), Clerk↔user↔RC/Stripe identity linkage. Absent: ANY feature
gating (0 checks in the app), mobile purchase SDK/paywall, trial logic
(coded but disabled), refund/invoice-failure webhook handlers, cancellation
endpoint, tests. Notable bugs/risks: RC webhook accepts anything if secret
unset; RC entitlementMap read but unused; user-lookup failures silently drop
events; User.subscriptionStatus can diverge from entitlements.

## The three-layer architecture

**Layer 1 — Money (providers).** Stripe (web), RevenueCat (App Store; Play
later), `manual` (us). Provider records stay provider-shaped (existing
Subscription table). Webhooks translate provider events into Layer-2 grants.
Nothing outside this layer ever talks to a provider.

**Layer 2 — Access (the heart): the ACCESS-GRANT LEDGER.** One append-style
table, `access_grants`:

```
access_grants:
  grantId, userId, entitlementCode ('premium'),
  source: subscription | trial_base | reward_photo | reward_referral |
          comp | promo | winback | gift | ...
  startsAt, expiresAt (NULL = lifetime),
  revokedAt (NULL = live), sourceRef (subscriptionId / photoId / referral
  userId / admin note), metadata, createdAt
```

Access truth = `EXISTS(grant WHERE code, revokedAt IS NULL, startsAt <= now
< COALESCE(expiresAt, ∞))`. Everything the owner listed — and everything he
hasn't thought of yet — is just a `source` value:

- **Reverse trial** = a `trial_base` grant (N days) written at signup.
- **Earned extensions** (photos, invites) = small `reward_*` grants, cap
  enforced per source (`SUM(days) WHERE source=X <= cap`).
- **Friends & family / press** = `comp` grant, `expiresAt NULL`, revocable
  with one update. Admin script + (later) admin endpoint.
- **Paid subscription** = a `subscription` grant kept in sync by the Layer-1
  webhooks (extend on renewal, revoke/expire on cancellation/refund).
- **Future promos, win-backs, gifts, founding-member lifetime deals,
  ambassador comps, B2B seats** — new source values, zero schema change.

The existing `UserEntitlement` table becomes the **materialized cache** of
the ledger (current status + max expiry per code), recomputed on every grant
write — kept because gating reads it hot; the ledger is the truth.

**Why the trial must be app-owned (not the App Store free trial):** Apple's
subscription-extension API cannot extend a subscription _during its free
period_ and allows max 2 extensions/customer/year — earned-extension
mechanics are impossible on a store trial. So: users get access from OUR
ledger from day one; the store subscription starts only at conversion. This
also means the trial works identically for users who never open a store
sheet, and web/Stripe converts the same way.

**Layer 3 — Gating.** One `EntitlementService.hasAccess(userId, code)`
(Redis-cached, invalidated on grant writes) + a `@RequireEntitlement('premium')`
guard for hard-gated endpoints + an `access` block on the session/user
payload (codes + expiry + source) so mobile renders paywalls/trial-countdown
from SERVER truth, never local inference. Gate placement per
business/monetization-and-gating.md (dish-level = premium, restaurant-level
= free) — flag-gated rollout so dev/dogfood stays open.

## Purchase flows (how the pieces talk)

- **iOS:** mobile `react-native-purchases` SDK (app_user_id = Clerk id) →
  StoreKit purchase → RevenueCat validates receipt → RC webhook → Layer-1
  record + Layer-2 `subscription` grant. RC is receipt-validation + store
  truth ONLY — never the access truth (our ledger is, because RC can't see
  comps/rewards).
- **Web (and the future Epic-ruling external-link paywall):** Stripe
  checkout → webhook → same grant path. The external-payment play later is
  ONLY a new way to open this existing flow — no architectural change.
- **Restore/cross-device:** access rides the ledger keyed to the Crave user,
  so login = access; store restore just reconciles Layer 1.

## Build plan (strangler order, each step shippable)

1. **Ledger + EntitlementService + guard** (schema, cache, `hasAccess`,
   `@RequireEntitlement`, session `access` block; migrate UserEntitlement to
   cache role). Trial-base grant at signup (`BILLING_TRIAL_DAYS` finally on).
2. **Webhook hardening:** RC secret REQUIRED (fail closed), entitlementMap
   actually applied, user-lookup failure → event status `failed` + retry (not
   silent drop), refund/chargeback + invoice-failure handlers, cancellation
   endpoint, `markCheckoutSessionCompleted` race fix.
3. **Grant writers:** comp admin script; reward-grant service with per-source
   caps (photos/invites hook in later with one call).
4. **Gating rollout:** guard on dish-tier endpoints behind
   `ENTITLEMENT_GATING=off|log|enforce` (log mode first = observe who WOULD
   be blocked, then enforce).
5. **Mobile:** react-native-purchases + paywall screen (screens thread
   collaboration) + sandbox purchase E2E against staging.
6. **Tests:** webhook replay/idempotency suite, grant-cap property tests,
   gate matrix (trial/paid/comp/expired × endpoints).

## Owner Q&A (settled this session)

- **Trial-extension precedent:** real but underused in consumer mobile —
  Dropbox's referral storage is the canonical ancestor; UpdateAI stacks
  2-week extensions per qualifying action; monday.com exposes trial
  extensions as an app-platform primitive; RevenueCat documents promotional
  extensions/entitlements for exactly referral-reward flows. Verdict: sound
  mechanic, differentiating in this category, and cheap under the ledger.
- **Comps:** `comp` lifetime grants, revocable, with `sourceRef` naming who
  and why.
- **Future mechanics the ledger already accommodates:** App Store offer
  codes (arrive as RC webhooks → grants), win-back offers, founding-member
  lifetime purchase at launch, gift subs, student/creator tiers, regional
  pricing (Layer-1 config), paused subscriptions (grant gap), ambassador/
  influencer comps, B2B restaurant accounts (new entitlementCode, phase 2),
  double-sided referral rewards (grant to both users).

## Step 5 — mobile integration (built 2026-07-08)

Shipped:

- `apps/mobile/src/services/purchases.ts` — RC wrapper; app_user_id = Clerk
  user id; guarded `require` so the JS bundle survives until the native
  module is in the dev-client binary; `isPurchasesAvailable()` tells the UI.
- `apps/mobile/src/providers/PurchasesProvider.tsx` — mounted in App.tsx,
  keeps RC identity in lockstep with Clerk (configure/logIn/logOut).
- `apps/mobile/src/hooks/useAccess.ts` — THE access hook: server-truth
  `access` block from GET /users/me (react-query). Never gates on
  CustomerInfo.
- `apps/mobile/src/screens/PaywallScreen.tsx` — functional skeleton
  (offerings → purchase → poll server truth → restore). Screens thread
  re-skins + mounts it.
- `UserProfile.access` (AccessSummary) in services/users.ts;
  `EXPO_PUBLIC_REVENUECAT_IOS_KEY` in .env/.env.example (empty = no-op).

Owner setup required before sandbox E2E (not executable by Claude):

1. App Store Connect: create the auto-renewing subscription group +
   products (monthly $7.99, annual $39.99), fill paid-apps agreement.
2. RevenueCat: create project + iOS app, paste the App Store Connect
   API key, define entitlement (map to our `premium` via
   REVENUECAT_ENTITLEMENT_MAP), attach products to a "default" offering,
   copy the public iOS SDK key into EXPO_PUBLIC_REVENUECAT_IOS_KEY.
3. RC webhook: point at POST /billing/webhooks/revenuecat with the bearer
   secret in REVENUECAT_WEBHOOK_SECRET (endpoint fails closed without it).
4. Rebuild the dev client (react-native-purchases is native):
   `npx expo prebuild` not needed — just a new xcodebuild of the workspace
   after pod install; until then all purchase calls no-op by design.
5. Sandbox test: App Store sandbox tester account → purchase in PaywallScreen
   → RC webhook → `access_grants` row (source `subscription`,
   sourceRef `revenuecat:<txn>`) → /users/me access flips.

## Business-model DECISION (2026-07-08)

**Launch = soft paywall at onboarding end.** Options: monthly (paid
immediately) or annual with an **App Store introductory free trial** (card
upfront, store-managed; Apple reminds before it converts, cancel anytime).
Dismissible — declining lands on the free tier (restaurants/map/polls);
dish layer stays gated. Rationale: fastest capital return + simplest.

What this changes vs the doc above:

- The launch trial is the STORE'S intro offer on the annual product, not
  the app-owned `trial_base` grant. `BILLING_TRIAL_DAYS` stays **0**.
- App-owned trial + earned-extension mechanics = the future **freemium
  pivot** (everything is built and env-gated; flipping = set
  BILLING_TRIAL_DAYS>0 + copy changes). Nothing gets deleted.
- Reward grants (photo/invite days) still work at launch for FREE users —
  they grant real dish-layer days through the ledger without a
  subscription. Marketing framing: "earn Crave+ days."
- Apple's no-extension limit doesn't bite: we never extend the store
  trial; earned days ride the ledger on top.
- Gate flip to `enforce` is now unblocked (was waiting on this decision) —
  do it as part of launch checklist, after paywall screens exist.
- App Store Connect setup gains one item: attach the introductory offer
  (free trial, e.g. 7 days) to the ANNUAL product only.

## RevenueCat setup — EXECUTED via API (2026-07-08)

Project `proj2c08e0c4` ("crave"). Done programmatically:

- App Store app `app2a9f58f2f5` "Crave iOS" (bundle
  com.brandonkimble.cravesearch); public SDK key
  `appl_yCAqmZfLvXlzLbvGpWVLvcnlGKs` (use for TestFlight/App Store builds).
- Entitlement `premium` (entldc08408f8e, display "Crave+") — lookup key now
  MATCHES the backend code, so REVENUECAT_ENTITLEMENT_MAP=premium:premium
  (identity). Old `crave Pro` (entl60198dffff) detached + ARCHIVED.
- Both Test Store products (monthly/yearly) attached to `premium`; default
  offering already had $rc_monthly/$rc_annual packages (Nov 2025 scaffold).
- Deleted the dead ngrok sandbox webhook. Recreate at sandbox-E2E time
  (ngrok URL + Authorization header = REVENUECAT_WEBHOOK_SECRET), and a
  production one at the Railway URL before launch.
- Dev .env: EXPO_PUBLIC_REVENUECAT_IOS_KEY = the Test Store public key →
  the purchase flow is testable in the dev client BEFORE Apple enrollment
  (RC Test Store simulates the store).

Still waiting on Apple (owner): Developer Program enrollment → paid-apps
agreement → create ASC subscription products ($7.99 monthly / $39.99 annual

- intro free trial on annual) → connect ASC API key in RC app settings
  (app_store_connect_api_key_configured=false) → real products in RC
  referencing ASC product IDs + attach to `premium` and packages.
