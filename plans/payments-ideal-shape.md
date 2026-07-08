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
